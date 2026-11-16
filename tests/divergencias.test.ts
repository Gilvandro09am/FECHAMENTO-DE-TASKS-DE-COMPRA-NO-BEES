/** Aba Divergências: tarefas abertas no BEES que o faturado já comprova. */
import { describe, expect, it } from 'vitest';
import { agruparDivergencias, linhasCsvDiv, CAB_DIV, situacao } from '../src/app/divergencias';
import { avaliarMes, cadastroDosItens, montarDivergencias, type ItemPedido, type Tarefa } from '../src/engine';
import type { SetorFechamento } from '../src/shared/modelo';

const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  op: 'Pau Brasil Sousa', unb: '487570', setor: '134', gv: '3', pdv: '200', visita: '2026-11-05', tipoMD: 'Mensal', mes: '2026-11',
  cluster: 'Desenvolvimento de Portfólio', sec: 'SKU/PDV', cat: 'BEER', status: 'OPEN', solicitada: 1, ja: 0, texto, ...extra,
});
const nota = (d: string, entrega: string, extra: Partial<ItemPedido> = {}): ItemPedido => ({
  unb: '487570', unidade: '', pdv: '200', nome: 'BAR DO ZE', pedido: '9001', dataEntrada: entrega, dataFat: entrega, nota: '5555',
  situacao: 'A', mov: 'VENDA', canal: 'B2BG', tipoItem: 'REGULAR', cod: d.slice(0, 4), d, qty: 1, valor: 50, setor: '134', vendedor: '',
  c: new Set(['Cerveja S/Match']), f: '', ...extra,
});
const SKOL = 'Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.';
const LATA = 'SKOL LATA 350ML SH C/12 NPAL';
// A referência do export vem da última validação registrada no mês (aqui, 16/11).
const validadaRef = tarefa('Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LATA 350.', { pdv: '999', status: 'VALID', conclusao: '2026-11-16' });

function montar(tarefas: Tarefa[], itens: ItemPedido[]) {
  const rs = avaliarMes([...tarefas, validadaRef], itens, { mes: '2026-11' });
  return montarDivergencias(rs, { mes: '2026-11', tolerancia: 2, cadastro: cadastroDosItens(itens) });
}

describe('divergências BEES x faturado', () => {
  it('aberta com nota entregue há 2+ dias após a visita = atrasada, com a nota que comprova', () => {
    const a = montar([tarefa(SKOL)], [nota(LATA, '2026-11-10')]);
    expect(a.referencia['487570']).toBe('2026-11-16');
    expect(a.linhas).toHaveLength(1);
    const [d] = a.linhas;
    expect(d.dias).toBe(6);
    expect(d.antesVisita).toBe(false);
    expect(situacao(a, d)).toBe('atrasada');
    expect(d.itens[0][5]).toBe('5555');
  });

  it('entregue na véspera do export = recente', () => {
    const [d] = montar([tarefa(SKOL)], [nota(LATA, '2026-11-15')]).linhas;
    expect(d.dias).toBe(1);
    expect(situacao({ tolerancia: 2 }, d)).toBe('recente');
  });

  it('pedido anterior à visita fica à parte (o BEES costuma não validar)', () => {
    const [d] = montar([tarefa(SKOL, { visita: '2026-11-12' })], [nota(LATA, '2026-11-06')]).linhas;
    expect(d.antesVisita).toBe(true);
    expect(situacao({ tolerancia: 2 }, d)).toBe('antes');
  });

  it('a data da meta é a da nota que completou a quantidade', () => {
    const t = tarefa('Auxilie na cobertura de 3 caixa(s) de SKOL PILSEN LATA 350.', { solicitada: 3 });
    const [d] = montar([t], [nota(LATA, '2026-11-06', { qty: 1 }), nota(LATA, '2026-11-09', { qty: 2, nota: '6666' })]).linhas;
    expect(d.quando).toBe('2026-11-09');
  });

  it('validada, não feita, missão e desafio não entram', () => {
    const itens = [nota(LATA, '2026-11-10'), nota('CORONA EXTRA N LONG NECK 330ML', '2026-11-10'), nota('H2OH LIMONETO PET 500ML', '2026-11-10')];
    const a = montar(
      [
        tarefa(SKOL, { status: 'VALID', conclusao: '2026-11-11' }),
        tarefa('Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LATA 350.'),
        tarefa('[IMC CORONA] Auxilie o PDV a concluir a Missão de Corona Long Neck'),
        tarefa('[VM] Auxilie na cobertura de H2OH. Desafio disponível no BEES.'),
      ],
      itens,
    );
    expect(a.linhas).toHaveLength(0);
  });

  it('agrupa por setor, filtra situação e gera o CSV', () => {
    const a = montar([tarefa(SKOL), tarefa(SKOL, { pdv: '201' })], [nota(LATA, '2026-11-10'), nota(LATA, '2026-11-15', { pdv: '201' })]);
    const setor = { id: '487570|134', revenda: 'Sousa', unb: '487570', gv: '3', setor: '134', nb: 'RN' } as SetorFechamento;
    const so = agruparDivergencias(a, [setor], 'todos', 'atrasadas');
    expect(so.tot).toMatchObject({ total: 1, atrasadas: 1, recentes: 1, antesVisita: 0 });
    const todas = agruparDivergencias(a, [setor], 'todos', 'todas');
    expect(todas.linhas[0].total).toBe(2);
    const csv = linhasCsvDiv(a, todas.linhas, 'novembro/2026');
    expect(csv[0][CAB_DIV.indexOf('Situação')]).toBe('Atrasada');
    expect(csv[0][CAB_DIV.indexOf('Notas fiscais')]).toBe('5555');
  });
});
