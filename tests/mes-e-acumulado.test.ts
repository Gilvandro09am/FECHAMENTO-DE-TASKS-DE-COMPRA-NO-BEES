/** Regras do painel do mês (faturado), acumulado da vespertina, SKU PDV e textos novos das revendas. */
import { describe, expect, it } from 'vitest';
import { avaliar, avaliarMes, indicador, interpretarTarefa, lerFaturados, type ItemPedido, type Tarefa } from '../src/engine';

const prod = (d: string, cestas: string[] = [], f = '') => ({ d, c: new Set(cestas), f });

describe('textos novos (Guarabira, Sousa, Itaporanga)', () => {
  it.each([
    ['Auxilie na cobertura de GUARANA ANTARCTICA LATA 350 para evitar perda de distribuição.', 'any', 'GUARANA ANTARCTICA LATA 350'],
    ['[IMC CORONA] [VM][IMC CORLN] Auxilie o PDV a concluir a Missão de Corona Long Neck', 'any', 'CORONA LONG NECK'],
    ['[VM][IMC COR600] Auxilie o PDV a concluir a Missão de Corona 600ml', 'any', 'CORONA 600ML'],
    ['[VM] [Score 100] [Vizinhança] Auxilie o PDV a comprar 1 cx de RGB 300 ML.', 'qty', 'RGB 300ML'],
    ['[VM] [Score 100] [Vizinhança] Auxilie o PDV a comprar 4 cxs de skus distintos de HE LN.', 'sku', 'HE LN'],
    ['[VM] Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA RETORNÁVEL (RGB) no mês.', 'sku', undefined],
    ['[IMC SKOL] Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 269.', 'qty', 'SKOL PILSEN LATA 269'],
    ['Auxilie na cobertura de BRAHMA MALZBIER LATA 350 para evitar perda de distribuição.', 'any', 'BRAHMA MALZBIER LATA 350'],
    ['Auxilie o PDV na cobertura de 2 SKUs distintos de RED BULL.', 'sku', 'RED BULL'],
    ['Auxilie o PDV na cobertura de STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4.', 'any', 'STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4'],
    ['Auxilie o PDV na cobertura de 1 caixa de BRAHMA CHOPP ZERO LONG NECK 355', 'qty', 'BRAHMA CHOPP ZERO LONG NECK 355'],
    ['[VM] [Score 5] [Vizinhança] Auxilie o PDV a comprar 2 cxs de LITRINHO DE CERVEJA.', 'qty', 'LITRINHO'],
    ['Auxilie na cobertura de 1 cx de RED BULL SABORES (SUGAR FREE, TROPICAL, MELANCIA, ZERO, REGULAR 473ML E OUTROS)', 'qty', 'RED BULL'],
    ['[VM] Ajude na venda de 6 caixa(s) de SPATEN GFA600 CX12.', 'qty', 'SPATEN GFA600 CX12'],
  ])('%s', (texto, tipo, alvo) => {
    const r = interpretarTarefa(texto);
    expect(r.tipo).toBe(tipo);
    if (alvo) expect(r.alvo).toBe(alvo);
  });

  it('Missão Corona Long Neck aceita Corona Extra LN e recusa 600 ml', () => {
    const fn = interpretarTarefa('Auxilie o PDV a concluir a Missão de Corona Long Neck').fn!;
    expect(fn(prod('CORONA EXTRA N LONG NECK 330ML CX C/24 NPAL'))).toBe(true);
    expect(fn(prod('CORONA EXTRA 600ML'))).toBe(false);
  });

  it('Missão Corona 600 ml aceita a garrafa e recusa a long neck', () => {
    const fn = interpretarTarefa('Auxilie o PDV a concluir a Missão de Corona 600ml').fn!;
    expect(fn(prod('CORONA EXTRA 600ML'))).toBe(true);
    expect(fn(prod('CORONA EXTRA N LONG NECK 330ML CX C/24 NPAL'))).toBe(false);
  });
});

describe('indicadores SKU PDV, LN e LN High End', () => {
  const dp = (texto: string, cat = 'BEER', cluster = 'Desenvolvimento de Portfólio') => indicador({ cluster, cat, texto });

  it('SKU PDV só com "N SKUs distintos de CERVEJA / NAB / MARKETPLACE / MATCH"', () => {
    expect(dp('Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.')).toBe('DP · SKU PDV');
    expect(dp('Auxilie o PDV a comprar 4 SKUs distintos de NAB no mês.', 'MKTPLACE')).toBe('DP · SKU PDV');
    expect(dp('Auxilie o PDV a comprar 2 SKUs distintos de MATCH no mês.', 'MATCH')).toBe('DP · SKU PDV');
    expect(dp('[GANHE 50 PONTOS] Auxilie na compra de 3 skus distintos de cerveja.', '')).toBe('DP · SKU PDV');
    expect(dp('Auxilie o PDV a comprar 6 SKUs distintos de MARKETPLACE.', 'MKTPLACE', 'Marketplace')).toBe('DP · SKU PDV');
    // Outras nomenclaturas de SKUs distintos ficam no indicador da categoria.
    expect(dp('Auxilie o PDV a comprar 2 SKUs distintos de H2OH no mês.', 'NAB')).toBe('DP · NAB');
    expect(dp('Auxilie o PDV a comprar 3 SKUs distintos de RGB (Sem craft) no mês.')).toBe('DP · Cerveja');
    expect(dp('Auxilie na venda de  2 SKUs distintos da MINALBA (PETRÓPOLIS, INDAIA, etc.).', 'MKTPLACE', 'Marketplace')).toBe('Marketplace');
  });

  it('LN: "Long Neck" ou "LN" no texto', () => {
    expect(dp('Auxilie na cobertura de BUDWEISER ZERO LONG NECK 330.')).toBe('DP · LN');
    expect(dp('Auxilie na cobertura de SPATEN LONG NECK 355.')).toBe('DP · LN');
  });

  it('LN High End: Corona, Corona Cero, Michelob, Stella, Stella Pure Gold e grupo HE', () => {
    expect(dp('Auxilie na cobertura de CORONA LONG NECK 330.')).toBe('DP · LN High End');
    expect(dp('Auxilie na cobertura de CORONA CERO LONG NECK 330.')).toBe('DP · LN High End');
    expect(dp('Auxilie na cobertura de MICHELOB ULTRA LONG NECK.')).toBe('DP · LN High End');
    expect(dp('Auxilie na cobertura de STELLA ARTOIS PURE GOLD LONG NECK 330.')).toBe('DP · LN High End');
    expect(dp('Auxilie o PDV a comprar 4 SKUs distintos de +LN Long Necks HE (Stellas, Spaten, Coronas e Michelob). no mês.')).toBe('DP · LN High End');
  });

  it('produto LN High End: aceita as marcas da lista e só aceita Spaten quando a tarefa cita', () => {
    const he = interpretarTarefa('[VM] [Score 100] [Vizinhança] Auxilie o PDV a comprar 4 cxs de skus distintos de HE LN.').fn!;
    expect(he(prod('CORONA CERO LONG NECK 330ML SIXPACK'))).toBe(true);
    expect(he(prod('STELLA ARTOIS PURE GOLD LN 330ML SIXPACK'))).toBe(true);
    expect(he(prod('SPATEN N LN 355ML SIXPACK SH C/4'))).toBe(false);
    const comSpaten = interpretarTarefa('Auxilie o PDV a comprar 4 SKUs distintos de +LN Long Necks HE (Stellas, Spaten, Coronas e Michelob). no mês.').fn!;
    expect(comSpaten(prod('SPATEN N LN 355ML SIXPACK SH C/4'))).toBe(true);
  });
});

describe('vespertina com faturado acumulado e painel do mês', () => {
  const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
    op: 'Pau Brasil Sousa', unb: '487570', setor: '134', gv: '3', pdv: '200', visita: '2026-11-11', tipoMD: 'Mensal',
    cluster: 'Desenvolvimento de Portfólio', sec: 'SKU/PDV', cat: 'BEER', status: 'OPEN', solicitada: 3, ja: 0, texto, ...extra,
  });
  const item = (d: string, extra: Partial<ItemPedido> = {}): ItemPedido => ({
    unb: '487570', unidade: '', pdv: '200', nome: 'BAR', pedido: '1', dataEntrada: '2026-11-11', situacao: 'A', mov: 'VENDA',
    canal: '', tipoItem: 'REGULAR', cod: d, d, qty: 1, valor: 50, setor: '134', vendedor: '', c: new Set(['Cerveja S/Match']), f: '',
    ...extra,
  });
  const skus = 'Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.';
  const nota = (d: string, captura: string) => item(d, { dataEntrada: captura, dataFat: captura });

  it('o pedido do dia fecha a tarefa somando os SKUs já faturados no mês', () => {
    const anteriores = [nota('SKOL LATA', '2026-11-04'), nota('BRAHMA LATA', '2026-11-05')];
    const [r] = avaliar([tarefa(skus)], [item('STELLA LATA')], { dia: '2026-11-11', faturadoAnterior: anteriores });
    expect(r.status).toBe('Feita no dia');
    expect(r.antes).toBe(2);
  });
  it('sem o faturado o mesmo pedido fica parcial', () => {
    const [r] = avaliar([tarefa(skus)], [item('STELLA LATA')], { dia: '2026-11-11' });
    expect(r.status).toBe('Parcial');
  });
  it('se o faturado já batia a meta, a tarefa estava concluída antes', () => {
    const anteriores = ['A', 'B', 'C'].map((x) => nota(x, '2026-11-04'));
    const [r] = avaliar([tarefa(skus)], [item('D')], { dia: '2026-11-11', faturadoAnterior: anteriores });
    expect(r.status).toBe('Já validada');
  });
  it('nota de pedido do próprio dia não conta duas vezes', () => {
    const anteriores = [nota('SKOL LATA', '2026-11-11'), nota('BRAHMA LATA', '2026-11-11')];
    const [r] = avaliar([tarefa(skus)], [item('SKOL LATA')], { dia: '2026-11-11', faturadoAnterior: anteriores });
    expect(r.status).toBe('Parcial');
  });
  it('validada pelo BEES no dia ou depois conta como feita no dia se o pedido do dia a fecha', () => {
    const lata = 'Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.';
    const t = tarefa(lata, { status: 'VALID', conclusao: '2026-11-12', solicitada: 1 });
    const pedido = item('SKOL LATA 350ML SH C/12 NPAL', { dataEntrada: '2026-11-11' });
    expect(avaliar([t], [pedido], { dia: '2026-11-11' })[0].status).toBe('Feita no dia');
    // Sem o produto no pedido do dia: continua como validada.
    expect(avaliar([t], [item('BRAHMA CHOPP LATA 350ML', { dataEntrada: '2026-11-11' })], { dia: '2026-11-11' })[0].status).toBe('Já validada');
    // Validada antes do dia: já estava concluída.
    expect(avaliar([{ ...t, conclusao: '2026-11-05' }], [pedido], { dia: '2026-11-11' })[0].status).toBe('Já validada');
  });
  it('tarefa diária de outro dia de visita não entra na vespertina', () => {
    const r = avaliar([tarefa(skus, { tipoMD: 'Diária', visita: '2026-11-10' })], [item('A')], { dia: '2026-11-11' });
    expect(r).toHaveLength(0);
  });
  it('mês: conclui pelo faturado do mês e ignora nota de outro mês', () => {
    const notas = [nota('A', '2026-11-03'), nota('B', '2026-11-06'), nota('C', '2026-10-31')];
    expect(avaliarMes([tarefa(skus)], notas, { mes: '2026-11' })[0].status).toBe('Parcial');
    expect(avaliarMes([tarefa(skus)], [...notas, nota('D', '2026-11-10')], { mes: '2026-11' })[0].status).toBe('Feita no dia');
  });
  it('mês: tarefa diária vale com qualquer entrega no mês (como o BEES valida)', () => {
    const t = tarefa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.', { tipoMD: 'Diária', visita: '2026-11-05', solicitada: 1 });
    const lata = 'SKOL LATA 350ML SH C/12 NPAL';
    expect(avaliarMes([t], [nota(lata, '2026-11-03')], { mes: '2026-11' })[0].status).toBe('Feita no dia');
    expect(avaliarMes([t], [nota(lata, '2026-11-06')], { mes: '2026-11' })[0].status).toBe('Feita no dia');
    expect(avaliarMes([t], [nota(lata, '2026-10-30')], { mes: '2026-11' })[0].status).toBe('Sem pedido');
  });
  it('mês: tarefa validada no BEES conta como validada mesmo sem nota', () => {
    const [r] = avaliarMes([tarefa(skus, { status: 'VALID' })], [], { mes: '2026-11' });
    expect(r.status).toBe('Já validada');
  });
});

describe('lerFaturados', () => {
  const linha = (extra: Record<string, string> = {}) => ({
    Empresa: '064', Filial: '0001', 'Operacao .': '0000000001', 'Dt. Operacao': '05/11/2026', Emissao: '06/11/2026', Status: 'A', Cliente: '18466',
    Nome: 'BAR', Produto: '  13201', 'Descrição': 'BRAHMA CHOPP GFA VD 3', Qtde: '     31', Total: '      1.670,90',
    Setor: '000124', 'Data Captura Pedido': '04/11/2026', ...extra,
  });
  const cesta = { '13201': { c: new Set(['Cerveja S/Match']), f: '', n: 'BRAHMA CHOPP GFA VD 300ML CX C/23' } };
  const opts = { filialUnb: { '064/0001': '487570' }, status: ['A', 'E'], operacoes: ['1'] };

  it('converte a nota usando o nome completo da cesta', () => {
    const [o] = lerFaturados([linha()], cesta, opts);
    // dataFat = data de entrega (coluna Emissao)
    expect(o).toMatchObject({ unb: '487570', pdv: '18466', cod: '13201', qty: 31, valor: 1670.9, dataFat: '2026-11-06', dataEntrada: '2026-11-04', setor: '124' });
    expect(o.d).toBe('BRAHMA CHOPP GFA VD 300ML CX C/23');
  });
  it('conta venda (1) e bonificação (2); ignora devolvida, cancelada, operações 5/9/108 e filial fora do painel', () => {
    const o2 = { ...opts, operacoes: ['1', '2'] };
    expect(lerFaturados([linha({ 'Operacao .': '0000000002' })], cesta, o2)).toHaveLength(1);
    expect(lerFaturados([linha({ Status: 'D' }), linha({ Status: 'C' })], cesta, o2)).toHaveLength(0);
    expect(lerFaturados(['5', '9', '108'].map((x) => linha({ 'Operacao .': x.padStart(10, '0') })), cesta, o2)).toHaveLength(0);
    expect(lerFaturados([linha({ Empresa: '361', Filial: '0006' })], cesta, opts)).toHaveLength(0);
  });
});
