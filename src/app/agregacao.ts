/** Cálculos do painel a partir do fechamento publicado (funções puras, testáveis). */
import {
  C_ABERTAS,
  C_FEITAS,
  C_NV,
  C_PARCIAIS,
  C_VALIDADAS,
  INDICADORES,
  type Contagem,
  type Fechamento,
  type Indicador,
  type SetorFechamento,
} from '../shared/modelo';
import { norm } from '../engine/texto';

export interface Filtros {
  rev: string; // 'todas' ou nome da revenda
  gv: string; // 'todos' ou número
  ind: Indicador | 'todos';
  busca: string;
}

export interface LinhaSetor {
  s: SetorFechamento;
  /** Dia: feitas no dia. Mês: concluídas (validadas BEES + concluídas pelo faturado). */
  feitas: number;
  /** Só o que o cálculo fechou (sem as já validadas). */
  feitasCalculo: number;
  parciais: number;
  /** Base do aproveitamento: dia = abertas nos PDVs que compraram; mês = todas as tarefas verificáveis. */
  base: number;
  validadas: number;
  /** feitas ÷ base; null quando a base é zero. */
  aproveitamento: number | null;
  porInd: number[];
}

export interface Totais {
  feitas: number;
  feitasCalculo: number;
  parciais: number;
  base: number;
  validadas: number;
  nv: number;
  pdvComPedido: number;
  pdvComTarefa: number;
  feitasPorInd: number[];
  basePorInd: number[];
}

/**
 * Regras de soma por tipo de fechamento:
 * - dia: feitas = F; base = abertas nos PDVs que compraram (já concluídas ficam à parte);
 * - mês: feitas = F + validadas BEES; base = todas as tarefas verificáveis do setor.
 */
const feitasDe = (c: Contagem, mes: boolean) => c[C_FEITAS] + (mes ? c[C_VALIDADAS] : 0);
const baseDe = (c: Contagem, mes: boolean) => c[C_ABERTAS] + (mes ? c[C_VALIDADAS] : 0);

export function setoresFiltrados(f: Fechamento, filtros: Filtros): SetorFechamento[] {
  const q = norm(filtros.busca);
  return f.setores.filter(
    (s) =>
      (filtros.rev === 'todas' || s.revenda === filtros.rev) &&
      (filtros.gv === 'todos' || s.gv === filtros.gv) &&
      (!q || s.setor.startsWith(q) || norm(s.nb).includes(q)),
  );
}

export function calcular(f: Fechamento, filtros: Filtros): { linhas: LinhaSetor[]; tot: Totais } {
  const mes = f.tipo === 'mes';
  const idx = filtros.ind === 'todos' ? INDICADORES.map((_, i) => i) : [INDICADORES.indexOf(filtros.ind)];
  const soma = (s: SetorFechamento, fn: (c: Contagem) => number) => idx.reduce((a, i) => a + fn(s.ind[i]), 0);
  const tot: Totais = {
    feitas: 0,
    feitasCalculo: 0,
    parciais: 0,
    base: 0,
    validadas: 0,
    nv: 0,
    pdvComPedido: 0,
    pdvComTarefa: 0,
    feitasPorInd: INDICADORES.map(() => 0),
    basePorInd: INDICADORES.map(() => 0),
  };
  const linhas = setoresFiltrados(f, filtros).map((s) => {
    const l: LinhaSetor = {
      s,
      feitas: soma(s, (c) => feitasDe(c, mes)),
      feitasCalculo: soma(s, (c) => c[C_FEITAS]),
      parciais: soma(s, (c) => c[C_PARCIAIS]),
      base: soma(s, (c) => baseDe(c, mes)),
      validadas: soma(s, (c) => c[C_VALIDADAS]),
      aproveitamento: null,
      porInd: s.ind.map((c) => feitasDe(c, mes)),
    };
    l.aproveitamento = l.base ? l.feitas / l.base : null;
    tot.feitas += l.feitas;
    tot.feitasCalculo += l.feitasCalculo;
    tot.parciais += l.parciais;
    tot.base += l.base;
    tot.validadas += l.validadas;
    tot.nv += soma(s, (c) => c[C_NV]);
    tot.pdvComPedido += s.pdvComPedido;
    tot.pdvComTarefa += s.pdvComTarefa;
    s.ind.forEach((c, i) => {
      tot.feitasPorInd[i] += feitasDe(c, mes);
      tot.basePorInd[i] += baseDe(c, mes);
    });
    return l;
  });
  return { linhas, tot };
}
