/** Comprovação: cada tarefa publicada aponta para as compras (pedido ou nota) que a fecharam. */
import { describe, expect, it } from 'vitest';
import { avaliar, avaliarMes, cadastroDosItens, montarFechamento, type ItemPedido, type Tarefa } from '../src/engine';

const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  op: 'Pau Brasil Sousa', unb: '487570', setor: '134', gv: '3', pdv: '200', visita: '2026-11-11', tipoMD: 'Mensal', mes: '2026-11',
  cluster: 'Desenvolvimento de Portfólio', sec: 'SKU/PDV', cat: 'BEER', status: 'OPEN', solicitada: 3, ja: 0, texto, ...extra,
});
const item = (d: string, extra: Partial<ItemPedido> = {}): ItemPedido => ({
  unb: '487570', unidade: '', pdv: '200', nome: 'BAR DO ZE', pedido: '9001', dataEntrada: '2026-11-11', situacao: 'A', mov: 'VENDA',
  canal: '', tipoItem: 'REGULAR', cod: d.slice(0, 4), d, qty: 1, valor: 50, setor: '134', vendedor: 'RN FULANO',
  c: new Set(['Cerveja S/Match']), f: '', ...extra,
});
const publicar = (tipo: 'dia' | 'mes', rs: ReturnType<typeof avaliar>, itens: ItemPedido[]) =>
  montarFechamento(rs, {
    tipo, chave: tipo === 'dia' ? '2026-11-11' : '2026-11', dia: '2026-11-11', incluirBloqueados: false,
    arquivos: { pedidos: '', tarefas: [], cesta: '' }, revendas: { '487570': 'Sousa' }, cadastro: cadastroDosItens(itens), itensUsados: itens,
  });

const SKUS = 'Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.';
const SKOL = 'Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.';

describe('comprovação das tarefas', () => {
  it('vespertina: mostra produto, pedido, data e RN de cada compra que fechou a tarefa', () => {
    const itens = [item('SKOL LATA 350ML SH C/12 NPAL', { qty: 2, valor: 120 }), item('BRAHMA CHOPP LATA 350ML'), item('STELLA ARTOIS LATA 350ML')];
    const f = publicar('dia', avaliar([tarefa(SKUS), tarefa(SKOL, { solicitada: 1 })], itens, { dia: '2026-11-11' }), itens);
    const [p] = f.pdvs;
    expect(p.rn).toBe('RN FULANO');
    const skus = p.tarefas.find((t) => f.textos[t[3]] === SKUS)!;
    expect(skus[0]).toBe('F');
    expect(skus[5].map((i) => p.itens[i][1]).sort()).toEqual(['BRAHMA CHOPP LATA 350ML', 'SKOL LATA 350ML SH C/12 NPAL', 'STELLA ARTOIS LATA 350ML']);
    const skol = p.tarefas.find((t) => f.textos[t[3]] === SKOL)!;
    expect(skol[5].map((i) => p.itens[i])).toEqual([['SKOL', 'SKOL LATA 350ML SH C/12 NPAL', 2, 120, '9001', '', '2026-11-11', 'RN FULANO', 'P']]);
  });

  it('a mesma linha que fecha duas tarefas aparece uma vez, sem somar caixas em dobro', () => {
    const itens = [item('SKOL LATA 350ML SH C/12 NPAL', { qty: 2 })];
    const f = publicar('dia', avaliar([tarefa(SKUS), tarefa(SKOL, { solicitada: 1 })], itens, { dia: '2026-11-11' }), itens);
    expect(f.pdvs[0].itens).toHaveLength(1);
    expect(f.pdvs[0].itens[0][2]).toBe(2);
  });

  it('mês: aponta a nota fiscal e a data de entrega', () => {
    const nota = item('SKOL LATA 350ML SH C/12 NPAL', { dataFat: '2026-11-07', dataEntrada: '2026-11-06', nota: '123456', pedido: '777', vendedor: '' });
    const f = publicar('mes', avaliarMes([tarefa(SKOL, { solicitada: 1 })], [nota], { mes: '2026-11' }), [nota]);
    const [p] = f.pdvs;
    expect(p.tarefas[0][0]).toBe('F');
    expect(p.itens[p.tarefas[0][5][0]]).toEqual(['SKOL', 'SKOL LATA 350ML SH C/12 NPAL', 1, 50, '777', '123456', '2026-11-07', '', 'F']);
  });

  it('tarefa validada pelo BEES guarda a data da validação e as compras que batem', () => {
    const nota = item('SKOL LATA 350ML SH C/12 NPAL', { dataFat: '2026-11-03', nota: '55', vendedor: '' });
    const t = tarefa(SKOL, { status: 'VALID', conclusao: '2026-11-04', solicitada: 1 });
    const f = publicar('mes', avaliarMes([t], [nota], { mes: '2026-11' }), [nota]);
    const [st, , , , , provas, valid] = f.pdvs[0].tarefas[0];
    expect(st).toBe('V');
    expect(valid).toBe('2026-11-04');
    expect(f.pdvs[0].itens[provas[0]][5]).toBe('55');
  });

  it('tarefa não feita não tem compra de comprovação', () => {
    const itens = [item('GUARANA ANTARCTICA PET 2L', { c: new Set(['NAB']) })];
    const f = publicar('dia', avaliar([tarefa(SKOL, { solicitada: 1 })], itens, { dia: '2026-11-11' }), itens);
    expect(f.pdvs[0].tarefas[0][0]).toBe('N');
    expect(f.pdvs[0].tarefas[0][5]).toEqual([]);
  });
});
