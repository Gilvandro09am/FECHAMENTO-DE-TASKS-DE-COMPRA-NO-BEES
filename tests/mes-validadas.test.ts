/** Painel do mês: só a validação do BEES conclui; o faturado comprova e aponta as abertas a validar. */
import { describe, expect, it } from 'vitest';
import { calcular } from '../src/app/agregacao';
import { avaliarMes, cadastroDosItens, montarFechamento, type ItemPedido, type Tarefa } from '../src/engine';

const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  op: 'Pau Brasil Sousa', unb: '487570', setor: '134', gv: '3', pdv: '200', visita: '2026-11-05', tipoMD: 'Mensal', mes: '2026-11',
  cluster: 'Desenvolvimento de Portfólio', sec: '', cat: 'BEER', status: 'OPEN', solicitada: 1, ja: 0, texto, ...extra,
});
const nota = (d: string, extra: Partial<ItemPedido> = {}): ItemPedido => ({
  unb: '487570', unidade: '', pdv: '200', nome: 'BAR', pedido: '1', dataEntrada: '2026-11-06', dataFat: '2026-11-07', nota: '77',
  situacao: 'A', mov: 'VENDA', canal: '', tipoItem: 'REGULAR', cod: d.slice(0, 5), d, qty: 1, valor: 50, setor: '134', vendedor: '',
  c: new Set(['Cerveja S/Match']), f: '', ...extra,
});

describe('mês = validadas no BEES', () => {
  it('conta só as validadas; a aberta que o faturado comprova fica "a validar"', () => {
    const tarefas = [
      tarefa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.', { status: 'VALID', conclusao: '2026-11-08' }),
      tarefa('Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LATA 350.'),
      tarefa('Auxilie na cobertura de 1 caixa(s) de ORIGINAL LATA 350.'),
      // Validada no BEES sem compra no faturado (ex.: Aurora): também conta, a validação é a oficial.
      tarefa('[VM] [3P] [AURORA] Aurora esta no BEES. Auxilie o PDV a entrar na loja', { pdv: '300', status: 'VALID' }),
    ];
    const itens = [nota('SKOL LATA 350ML SH C/12 NPAL'), nota('BRAHMA CHOPP LATA 350ML SH C/12 NPAL')];
    const f = montarFechamento(avaliarMes(tarefas, itens, { mes: '2026-11' }), {
      tipo: 'mes', chave: '2026-11', dia: '2026-11-17', incluirBloqueados: false, arquivos: { pedidos: '', tarefas: [], cesta: '' },
      revendas: {}, cadastro: cadastroDosItens(itens), itensUsados: itens,
    });
    const { tot } = calcular(f, { rev: 'todas', gv: 'todos', ind: 'todos', busca: '' });
    expect(tot.feitas).toBe(2); // Skol + Aurora validadas
    expect(tot.feitasCalculo).toBe(1); // Brahma: aberta, o faturado comprova
    // A validada aparece no detalhe com a nota que a comprova, mesmo no PDV sem nota (Aurora).
    const skol = f.pdvs.find((p) => p.pdv === '200')!.tarefas.find((t) => t[0] === 'V')!;
    expect(f.pdvs.find((p) => p.pdv === '200')!.itens[skol[5][0]][5]).toBe('77');
    expect(f.pdvs.some((p) => p.pdv === '300')).toBe(true);
  });
});
