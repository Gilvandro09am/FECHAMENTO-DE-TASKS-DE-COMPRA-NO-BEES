/** Desafios diários dos GVs: só colunas de tarefa; meta x prévia (pedidos do dia) x validadas no BEES. */
import { describe, expect, it } from 'vitest';
import { lerCsvDesafios, montarDesafios, tipoDoDesafio, tiposDaTarefa, type Resultado, type Tarefa } from '../src/engine';

const tarefa = (texto: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  op: 'Pau Brasil Patos', unb: '747530', setor: '400', gv: '4', pdv: '1', visita: '2026-11-19', tipoMD: 'Mensal', mes: '2026-11',
  cluster: 'Desenvolvimento de Portfólio', sec: 'B2O', cat: 'BEER', status: 'OPEN', solicitada: 1, ja: 0, texto, ...extra,
});

describe('desafios dos GVs', () => {
  it('reconhece as colunas de tarefa do BEES e ignora Volume/Faturamento', () => {
    expect(tipoDoDesafio('Tasks de Cerveja SPO de Total')).toBe('cerveja');
    expect(tipoDoDesafio('Tasks de Marketplace de Total')).toBe('marketplace');
    expect(tipoDoDesafio('Tasks de Desenvolvimento de Portfólio de CATEGORIA_AGRUPADO - NAB')).toBe('nab');
    expect(tipoDoDesafio('Tasks de Desenvolvimento de Portfólio de TIPO_EMBALAGEM_ABREV - LN')).toBe('ln');
    expect(tipoDoDesafio('Tasks de Portfólio Score 5 de Total')).toBe('score5');
    expect(tipoDoDesafio('Tasks de SKU/PDV SPO de Total')).toBe('skupdv');
    expect(tipoDoDesafio('Volume/Faturamento de CATEGORIA_AGRUPADO - CERVEJA')).toBeNull();
    expect(tipoDoDesafio('Volume/Faturamento de RETORNAVEL - RGB')).toBeNull();
  });

  it('lê o CSV (data em AAAA-MM-DD ou DD/MM/AAAA) e separa as colunas ignoradas', () => {
    const { linhas, ignoradas } = lerCsvDesafios(
      'Data;UNB;GV;Setor;Desafio;Meta\n19/11/2026;747530;4;400;Tasks de Cerveja SPO de Total;43\n2026-11-19;747530;4;400;Volume/Faturamento de RETORNAVEL - RGB;9,06\n',
    );
    expect(linhas).toEqual([{ dia: '2026-11-19', unb: '747530', gv: '4', setor: '400', titulo: 'Tasks de Cerveja SPO de Total', meta: 43 }]);
    expect(ignoradas).toEqual(['Volume/Faturamento de RETORNAVEL - RGB']);
  });

  it('classifica a tarefa nas colunas (que se sobrepõem, como no BEES)', () => {
    expect(tiposDaTarefa(tarefa('Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.', { sec: 'SKU/PDV' }))).toEqual(['cerveja', 'skupdv']);
    expect(tiposDaTarefa(tarefa('Auxilie na cobertura de 1 caixa(s) de CORONA LONG NECK 330.'))).toEqual(['cerveja', 'ln']);
    expect(tiposDaTarefa(tarefa('[VM] [Score 5] [Vizinhança] Auxilie o PDV a comprar 2 cxs de LITRINHO DE CERVEJA.', { sec: 'INPUT_MANUAL', cat: '' }))).toEqual(['score5']);
    expect(tiposDaTarefa(tarefa('Auxilie na cobertura de MARKETPLACE.', { cluster: 'Marketplace', cat: 'MKTPLACE' }))).toEqual(['marketplace']);
  });

  it('compara meta, prévia do dia e validadas no BEES no dia', () => {
    const entrada = lerCsvDesafios(
      'Data;UNB;GV;Setor;Desafio;Meta\n2026-11-19;747530;4;400;Tasks de Cerveja SPO de Total;3\n2026-11-19;747530;4;400;Tasks de Marketplace de Total;2\n',
    ).linhas;
    const feita = tarefa('Auxilie na cobertura de 1 caixa(s) de SKOL PILSEN LATA 350.');
    const validada = tarefa('Auxilie na cobertura de 1 caixa(s) de BRAHMA CHOPP LATA 350.', { status: 'VALID', conclusao: '2026-11-19' });
    const ontem = tarefa('Auxilie na cobertura de 1 caixa(s) de ORIGINAL LATA 350.', { status: 'VALID', conclusao: '2026-11-18' });
    const resultados = [{ task: feita, status: 'Feita no dia' }] as Resultado[];
    const o = { dia: '2026-11-19', versao: 5, revendas: { '747530': 'Patos' }, nb: { '747530|400': 'RN' } };
    const d = montarDesafios(entrada, [feita, validada, ontem], resultados, o);
    expect(d.setores[0]).toMatchObject({ revenda: 'Patos', nb: 'RN', setor: '400' });
    expect(d.setores[0].tipos.cerveja).toEqual({ meta: 3, previa: 1, validadas: 1 });
    expect(d.setores[0].tipos.marketplace).toEqual({ meta: 2, previa: 0, validadas: 0 });

    // Export do BEES ainda sem validações do dia: validadas fica em aberto (null), não zero.
    const semExport = montarDesafios(entrada, [feita, ontem], null, o);
    expect(semExport.setores[0].tipos.cerveja).toEqual({ meta: 3, previa: null, validadas: null });
  });
});
