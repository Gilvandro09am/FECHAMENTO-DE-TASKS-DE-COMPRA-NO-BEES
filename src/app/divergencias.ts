/**
 * Aba "Divergências": tarefas ainda ABERTAS no BEES que o faturado do mês já comprova.
 * Funções puras (filtro, agrupamento por setor e CSV), testadas em tests/divergencias.test.ts.
 */
import {
  INDICADORES,
  PROVA_ORIGEM,
  type ArquivoDivergencias,
  type Divergencia,
  type Indicador,
  type SetorFechamento,
} from '../shared/modelo';

/** atrasadas = nota entregue há `tolerancia`+ dias antes do export do BEES; todas = inclui as recentes. */
export type Situacao = 'atrasadas' | 'todas';

/** Erro de validação: pedido a partir da visita, entregue há `tolerancia`+ dias antes do export, e a tarefa segue aberta. */
export const atrasada = (a: Pick<ArquivoDivergencias, 'tolerancia'>, d: Divergencia) => !d.antesVisita && d.dias >= a.tolerancia;

export type SituacaoDiv = 'atrasada' | 'recente' | 'antes';
export const situacao = (a: Pick<ArquivoDivergencias, 'tolerancia'>, d: Divergencia): SituacaoDiv =>
  d.antesVisita ? 'antes' : d.dias >= a.tolerancia ? 'atrasada' : 'recente';
export const NOME_SITUACAO: Record<SituacaoDiv, string> = {
  atrasada: 'Atrasada',
  recente: 'Recente (aguardando)',
  antes: 'Compra antes da visita',
};

export interface LinhaDivSetor {
  s: SetorFechamento;
  total: number;
  atrasadas: number;
  pdvs: number;
  /** Maior atraso em dias no setor. */
  maxDias: number;
  porInd: number[];
  itens: Divergencia[];
}

export interface TotaisDiv {
  total: number;
  atrasadas: number;
  recentes: number;
  antesVisita: number;
  pdvs: number;
  setores: number;
  porInd: number[];
}

/** Divergências dos setores filtrados, agrupadas por setor (setores sem divergência ficam de fora). */
export function agruparDivergencias(
  a: ArquivoDivergencias,
  setores: SetorFechamento[],
  ind: Indicador | 'todos',
  sit: Situacao,
): { linhas: LinhaDivSetor[]; tot: TotaisDiv } {
  const iInd = ind === 'todos' ? -1 : INDICADORES.indexOf(ind);
  const porId = new Map(setores.map((s) => [s.id, s]));
  const grupos = new Map<string, LinhaDivSetor>();
  const tot: TotaisDiv = { total: 0, atrasadas: 0, recentes: 0, antesVisita: 0, pdvs: 0, setores: 0, porInd: INDICADORES.map(() => 0) };
  const pdvsTot = new Set<string>();
  for (const d of a.linhas) {
    const s = porId.get(d.setorId);
    if (!s || (iInd >= 0 && d.ind !== iInd)) continue;
    const at = atrasada(a, d);
    // Contadores do topo mostram as três situações; a lista respeita a situação escolhida.
    const sit_ = situacao(a, d);
    if (sit_ === 'atrasada') tot.atrasadas++;
    else if (sit_ === 'recente') tot.recentes++;
    else tot.antesVisita++;
    if (sit === 'atrasadas' && !at) continue;
    let g = grupos.get(d.setorId);
    if (!g) {
      g = { s, total: 0, atrasadas: 0, pdvs: 0, maxDias: -Infinity, porInd: INDICADORES.map(() => 0), itens: [] };
      grupos.set(d.setorId, g);
    }
    g.total++;
    if (at) g.atrasadas++;
    g.maxDias = Math.max(g.maxDias, d.dias);
    g.porInd[d.ind]++;
    g.itens.push(d);
    tot.total++;
    tot.porInd[d.ind]++;
    pdvsTot.add(`${d.setorId}|${d.pdv}`);
  }
  const linhas = [...grupos.values()];
  for (const g of linhas) g.pdvs = new Set(g.itens.map((d) => d.pdv)).size;
  tot.pdvs = pdvsTot.size;
  tot.setores = linhas.length;
  return { linhas, tot };
}

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export const CAB_DIV = [
  'Mês', 'Revenda', 'UNB', 'GV', 'Setor', 'NB do setor', 'Cód. PDV', 'PDV', 'Indicador', 'Mensal/Diária', 'Texto da tarefa',
  'Status no BEES', 'Situação', 'Data visita', 'Progresso pelo faturado', 'Meta atingida em', 'Referência do export BEES', 'Dias desde a entrega',
  'Produtos que comprovam', 'Cód. produtos', 'Caixas', 'Valor R$', 'Notas fiscais', 'Pedidos', 'Entregas', 'Origem',
];

/** Uma linha por tarefa divergente, com as notas que a comprovam. */
export function linhasCsvDiv(a: ArquivoDivergencias, linhas: LinhaDivSetor[], mes: string): string[][] {
  const out: string[][] = [];
  const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(' | ');
  for (const { s, itens } of linhas)
    for (const d of itens) {
      const its = d.itens;
      out.push([
        mes, s.revenda, s.unb, s.gv, s.setor, s.nb, d.pdv, d.nome, INDICADORES[d.ind], d.md === 'M' ? 'Mensal' : 'Diária', d.texto,
        'Aberta', NOME_SITUACAO[situacao(a, d)], dataBr(d.visita), d.prog, dataBr(d.quando),
        dataBr(a.referencia[s.unb] ?? ''), String(d.dias),
        its.map((it) => it[1]).join(' | '),
        its.map((it) => it[0]).join(' | '),
        its.length ? num(its.reduce((x, it) => x + it[2], 0)) : '',
        its.length ? num(its.reduce((x, it) => x + it[3], 0)) : '',
        unicos(its.map((it) => it[5])),
        unicos(its.map((it) => it[4])),
        unicos(its.map((it) => dataBr(it[6]))),
        unicos(its.map((it) => PROVA_ORIGEM[it[8]])),
      ]);
    }
  return out;
}
