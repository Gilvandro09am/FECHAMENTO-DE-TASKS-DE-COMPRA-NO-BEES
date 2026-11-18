import { describe, expect, it } from 'vitest';
import { avaliar, indicador, interpretarTarefa, type ItemPedido, type Tarefa } from '../src/engine';

/** Produto de teste: descrição + cestas. */
const prod = (d: string, cestas: string[] = [], f = '') => ({ d, c: new Set(cestas), f });

describe('interpretarTarefa — tipo de regra', () => {
  it.each([
    ['[MISSÃO BEES] Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LITRINHO.', 'qty', 'BRAHMA CHOPP LITRINHO'],
    ['Auxilie na cobertura de 4 caixa(s) de STELLA ARTOIS PURE GOLD LATA 350.', 'qty', 'STELLA ARTOIS PURE GOLD LATA 350'],
    ['[IMC SKOL] Ajude na venda de 5 caixa(s) de SKOL GFA300 CX23.', 'qty', 'SKOL GFA300 CX23'],
    ['Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.', 'sku', 'CERVEJA'],
    ['Auxilie o PDV a comprar 2 SKUs distintos de H2OH no mês.', 'sku', 'H2OH'],
    ['Auxilie na venda de 150 reais de MATCH no mês.', 'val', 'MATCH'],
    ['Auxilie na venda de qualquer SKU de ÁGUA (AGUA INDAIA, etc.) na seção ÁGUA.', 'any', 'ÁGUA'],
    ['YPÊ: Auxilie na venda de LAVA LOUÇA ou qualquer SKU da indústria na seção MERCADO.', 'any', 'YPÊ'],
    ['É LEVE: Auxilie na venda de ÁGUA ELEV ou qualquer SKU da indústria na seção MERCADO.', 'any', 'É LEVE'],
    ['[IMC CORONA] Auxilie na venda de LN Pack 6 (Corona Cero ou Bud Zero).', 'qty', 'LN Pack: CORONA CERO OU BUD ZERO'],
    ['[PROATIVA] Ganhe 40 coins por cada SKU de CERVEJA sem compra há 2 meses e fora da aba Portfólio que vender hoje!', 'nv', undefined],
  ])('%s', (texto, tipo, alvo) => {
    const r = interpretarTarefa(texto);
    expect(r.tipo).toBe(tipo);
    if (alvo) expect(r.alvo).toBe(alvo);
  });
});

describe('equivalências de produto', () => {
  const casa = (texto: string, d: string, cestas: string[] = []) => interpretarTarefa(texto).fn!(prod(d, cestas));

  it('Litrinho = garrafa 300 ml retornável', () => {
    const t = 'Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LITRINHO.';
    expect(casa(t, 'BRAHMA CHOPP GFA VD 300ML CX C/23')).toBe(true);
    expect(casa(t, 'BRAHMA CHOPP LATA 350ML SH C/12 NPAL')).toBe(false);
  });
  // Equivalências confirmadas pelas tarefas que o BEES validou (novembro/2026).
  it('Lata 350 aceita a lata comum e a multipack; a tarefa MULTPACK exige multipack', () => {
    expect(casa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.', 'SKOL LATA 350ML SH C/12 NPAL MULTIPACK')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.', 'SKOL LATA 350ML SH C/12 NPAL')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350 MULTPACK.', 'SKOL LATA 350ML SH C/12 NPAL MULTIPACK')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350 MULTPACK.', 'SKOL LATA 350ML SH C/12 NPAL')).toBe(false);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.', 'SKOL LATA 473ML SH C/12 NPAL')).toBe(false);
  });
  it('Guaraná Zero aceita o cadastro "DIET"; o Guaraná normal aceita normal, Zero e Diet; Zero não aceita o normal', () => {
    expect(casa('Auxilie na cobertura de 1 caixa(s) de GUARANA ANTARCTICA ZERO PET 2L.', 'GUARANA CHP ANTARCTICA DIET PET 2L CAIXA C/6')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de GUARANA ANTARCTICA ZERO PET 2L.', 'GUARANA CHP ANTARCTICA PET 2L CAIXA C/6')).toBe(false);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de GUARANA ANTARCTICA PET 2L.', 'GUARANA CHP ANTARCTICA DIET PET 2L CAIXA C/6')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de GUARANA ANTARCTICA PET 1L.', 'GUARANA ANTARCTICA ZERO PET 1L CAIXA C/12')).toBe(true);
    expect(casa('Auxilie na cobertura de 1 caixa(s) de GUARANA ANTARCTICA PET 2L.', 'GUARANA CHP ANTARCTICA PET 1L CAIXA C/12')).toBe(false);
  });
  it('Inteira = garrafa 600 ml, retornável ou one way', () => {
    const t = 'Auxilie na cobertura de 1 caixa(s) de STELLA ARTOIS PURE GOLD INTEIRA.';
    expect(casa(t, 'STELLA ARTOIS PURE GOLD 600ML')).toBe(true);
    expect(casa(t, 'STELLA ARTOIS PURE GOLD ONE WAY 600ML CX C12 NP')).toBe(true);
    expect(casa(t, 'STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4')).toBe(false);
  });
  it('Long neck inclui a garrafa one way pequena (Budweiser OW 330)', () => {
    const t = 'Auxilie na cobertura de 1 caixa(s) de BUDWEISER LONG NECK 330.';
    expect(casa(t, 'BUDWEISER OW 330ML CX C/24')).toBe(true);
    expect(casa(t, 'BUDWEISER LONG NECK 330ML SIX-PACK')).toBe(true);
    expect(casa(t, 'BUDWEISER LT SLEEK 350ML SH C 12 MULTIPACK')).toBe(false);
    expect(casa(t, 'BUDWEISER ONE WAY 600ML CX C/12')).toBe(false);
  });
  it('H2OH PET 1.5L só aceita a garrafa de 1,5 L (não a família inteira)', () => {
    const t = 'Auxilie na cobertura de 1 caixa(s) de H2OH PET 1.5L.';
    expect(casa(t, 'H2OH LIMONETO PET 1,5 SHRINK C/06 NPAL')).toBe(true);
    expect(casa(t, 'H2OH LIMONETO PET 500ML SHRINK C/12 NPAL')).toBe(false);
    expect(casa('Auxilie o PDV a comprar 2 SKUs distintos de H2OH no mês.', 'H2OH LIMONETO PET 500ML SHRINK C/12 NPAL')).toBe(true);
  });
  it('LN Pack aceita qualquer SKU das marcas citadas', () => {
    const t = '[IMC CORONA] Auxilie na venda de LN Pack 6 (Stella Pure Gold ou Michelob Ultra ou Corona ou Corona Cero ou Bud Zero).';
    expect(casa(t, 'CORONA EXTRA N LONG NECK 330ML CX C/24 NPAL')).toBe(true);
    expect(casa(t, 'CORONA EXTRA N LT SLEEK 350ML C 8 CX CARTAO')).toBe(true);
    expect(casa(t, 'SPATEN N LN 355ML SIXPACK SH C/4')).toBe(false);
  });
  it('CERVEJA usa a cesta sem Match', () => {
    const t = 'Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.';
    expect(casa(t, 'SKOL LATA 350ML', ['Cerveja TT', 'Cerveja S/Match'])).toBe(true);
    expect(casa(t, 'BEATS RED MIX LT 269ML', ['Cerveja TT', 'MATCH TT'])).toBe(false);
  });
});

describe('indicador', () => {
  it('separa LN HE dentro de Desenvolvimento de Portfólio', () => {
    expect(indicador({ cluster: 'Desenvolvimento de Portfólio', cat: 'BEER', texto: 'cobertura de STELLA ARTOIS LONG NECK 330' })).toBe('DP · LN HE');
    expect(indicador({ cluster: 'Desenvolvimento de Portfólio', cat: 'BEER', texto: 'cobertura de BUDWEISER LONG NECK 330' })).toBe('DP · Cerveja');
    expect(indicador({ cluster: 'Desenvolvimento de Portfólio', cat: 'BEER', texto: 'cobertura de SKOL LATA' })).toBe('DP · Cerveja');
    expect(indicador({ cluster: 'Execução', cat: '', texto: 'foto' })).toBeNull();
  });
});

describe('avaliar', () => {
  const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
    op: 'Pau Brasil Patos', unb: '747530', setor: '403', gv: '4', pdv: '100', visita: '2026-11-04', tipoMD: 'Mensal',
    cluster: 'Desenvolvimento de Portfólio', sec: 'B2O', cat: 'BEER', status: 'OPEN', solicitada: 1, ja: 0, texto, ...extra,
  });
  const item = (d: string, qty: number, extra: Partial<ItemPedido> = {}): ItemPedido => ({
    unb: '747530', unidade: 'Pau Brasil Filial Patos', pdv: '100', nome: 'BAR TESTE', pedido: '1', dataEntrada: '2026-11-04',
    situacao: 'AGUARDANDO_ROTEIRIZACAO', mov: 'VENDA', canal: 'B2B_APP', tipoItem: 'REGULAR', cod: d.slice(0, 5), d, qty,
    valor: 50, setor: '403', vendedor: 'NB', c: new Set(['Cerveja S/Match']), f: '', ...extra,
  });
  const caixas = 'Auxilie na cobertura de 2 caixa(s) de BRAHMA CHOPP LATA 350.';

  it('fecha quando a quantidade bate', () => {
    const [r] = avaliar([tarefa(caixas, { solicitada: 2 })], [item('BRAHMA CHOPP LATA 350ML SH C/12 NPAL', 2)], { dia: '2026-11-04' });
    expect(r.status).toBe('Feita no dia');
  });
  it('desconta o que já foi comprado no mês', () => {
    const [r] = avaliar([tarefa(caixas, { solicitada: 2, ja: 1 })], [item('BRAHMA CHOPP LATA 350ML SH C/12 NPAL', 1)], {});
    expect(r.status).toBe('Feita no dia');
  });
  it('fica parcial quando falta quantidade', () => {
    const [r] = avaliar([tarefa(caixas, { solicitada: 2 })], [item('BRAHMA CHOPP LATA 350ML SH C/12 NPAL', 1)], {});
    expect(r.status).toBe('Parcial');
  });
  it('ignora troca, cancelado, outro dia e bloqueado quando pedido', () => {
    const d = 'BRAHMA CHOPP LATA 350ML SH C/12 NPAL';
    const t = [tarefa(caixas, { solicitada: 1 })];
    expect(avaliar(t, [item(d, 5, { mov: 'TROCA' })], {})[0].status).toBe('Sem pedido');
    expect(avaliar(t, [item(d, 5, { situacao: 'CANCELADO' })], {})[0].status).toBe('Sem pedido');
    expect(avaliar(t, [item(d, 5, { dataEntrada: '2026-11-03' })], { dia: '2026-11-04' })[0].status).toBe('Sem pedido');
    expect(avaliar(t, [item(d, 5, { situacao: 'BLOQUEADO' })], { incluirBloqueados: false })[0].status).toBe('Sem pedido');
    expect(avaliar(t, [item(d, 5, { situacao: 'BLOQUEADO' })], { incluirBloqueados: true })[0].status).toBe('Feita no dia');
  });
  it('tarefa já validada no BEES não é contada de novo', () => {
    const [r] = avaliar([tarefa(caixas, { status: 'VALID' })], [item('BRAHMA CHOPP LATA 350ML SH C/12 NPAL', 9)], {});
    expect(r.status).toBe('Já validada');
  });
});
