/**
 * Desafios diários dos GVs (BEES "Desafios do dia"): meta de tarefas por setor x real do dia.
 * Só as colunas de **tarefas** entram; Volume/Faturamento fica de fora.
 */
import {
  NOME_DESAFIO,
  TIPOS_DESAFIO,
  type ArquivoDesafios,
  type SetorDesafio,
  type TipoDesafio,
} from '../shared/modelo';
import { indicador } from './regras';
import { norm } from './texto';
import type { Resultado, Tarefa } from './tipos';

export { NOME_DESAFIO, TIPOS_DESAFIO, type TipoDesafio };

/** Título da coluna do relatório do BEES → tipo. null = não é de tarefa (Volume/Faturamento) ou desconhecido. */
export function tipoDoDesafio(titulo: string): TipoDesafio | null {
  const t = norm(titulo);
  if (/VOLUME|FATURAMENTO/.test(t)) return null;
  if (!/\bTASKS?\b|TAREFA/.test(t)) return null;
  if (/SCORE ?5\b/.test(t)) return 'score5';
  if (/SKU ?\/ ?PDV/.test(t)) return 'skupdv';
  if (/EMBALAGEM.*\bLN\b|LONG NECK|- LN\b/.test(t)) return 'ln';
  if (/MARKETPLACE/.test(t)) return 'marketplace';
  if (/\bNAB\b/.test(t)) return 'nab';
  if (/CERVEJA/.test(t)) return 'cerveja';
  return null;
}

/** Em quais colunas de desafio a tarefa conta (as colunas se sobrepõem, como no BEES). */
export function tiposDaTarefa(t: Tarefa): TipoDesafio[] {
  const dp = t.cluster === 'Desenvolvimento de Portfólio';
  const tipos: TipoDesafio[] = [];
  if (dp && t.cat === 'BEER') tipos.push('cerveja');
  if (dp && t.cat === 'NAB') tipos.push('nab');
  if (t.cluster === 'Marketplace' || t.cat === 'MKTPLACE') tipos.push('marketplace');
  if (indicador(t) === 'DP · LN HE') tipos.push('ln');
  if (t.sec === 'SKU/PDV') tipos.push('skupdv');
  if (/\[SCORE 5\]/.test(norm(t.texto))) tipos.push('score5');
  return tipos;
}

export interface LinhaDesafioEntrada {
  dia: string;
  unb: string;
  gv: string;
  setor: string;
  titulo: string;
  meta: number;
}

/** CSV "Data;UNB;GV;Setor;Desafio;Meta" (data AAAA-MM-DD ou DD/MM/AAAA; meta com vírgula ou ponto). */
export function lerCsvDesafios(texto: string): { linhas: LinhaDesafioEntrada[]; ignoradas: string[] } {
  const linhas: LinhaDesafioEntrada[] = [];
  const ignoradas = new Set<string>();
  for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    if (!bruta.trim()) continue;
    const [data, unb, gv, setor, titulo, meta] = bruta.split(';').map((x) => x.trim());
    const dia = /^\d{2}\/\d{2}\/\d{4}$/.test(data) ? `${data.slice(6)}-${data.slice(3, 5)}-${data.slice(0, 2)}` : data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !setor) continue;
    if (!tipoDoDesafio(titulo ?? '')) {
      ignoradas.add(titulo);
      continue;
    }
    linhas.push({ dia, unb, gv, setor, titulo, meta: Number(String(meta).replace(',', '.')) || 0 });
  }
  return { linhas, ignoradas: [...ignoradas] };
}

/**
 * Monta a comparação de um dia: meta do desafio x prévia (pedidos do dia) x validadas no BEES no dia.
 * `resultadosDia` = avaliação da vespertina do mesmo dia (ou null se o dia não tem pedidos carregados).
 */
export function montarDesafios(
  entrada: LinhaDesafioEntrada[],
  tarefas: Tarefa[],
  resultadosDia: Resultado[] | null,
  o: { dia: string; versao: number; revendas: Record<string, string>; nb: Record<string, string> },
): ArquivoDesafios {
  const referencia: Record<string, string> = {};
  for (const t of tarefas) if (t.conclusao && t.conclusao > (referencia[t.unb] ?? '')) referencia[t.unb] = t.conclusao;

  const conta = (lista: Tarefa[]) => {
    const m = new Map<string, number>();
    for (const t of lista) for (const tipo of tiposDaTarefa(t)) m.set(`${t.unb}|${t.setor}|${tipo}`, (m.get(`${t.unb}|${t.setor}|${tipo}`) ?? 0) + 1);
    return m;
  };
  const validadas = conta(tarefas.filter((t) => t.status === 'VALID' && t.conclusao === o.dia));
  const previa = resultadosDia ? conta(resultadosDia.filter((r) => r.status === 'Feita no dia').map((r) => r.task)) : null;

  const setores = new Map<string, SetorDesafio>();
  for (const l of entrada) {
    if (l.dia !== o.dia) continue;
    const tipo = tipoDoDesafio(l.titulo)!;
    const id = `${l.unb}|${l.setor}`;
    const s = setores.get(id) ?? {
      id,
      unb: l.unb,
      gv: l.gv,
      setor: l.setor,
      revenda: o.revendas[l.unb] ?? l.unb,
      nb: o.nb[id] ?? '',
      tipos: {},
    };
    setores.set(id, s);
    const k = `${id}|${tipo}`;
    s.tipos[tipo] = {
      meta: l.meta,
      previa: previa ? (previa.get(k) ?? 0) : null,
      validadas: (referencia[l.unb] ?? '') >= o.dia ? (validadas.get(k) ?? 0) : null,
    };
  }
  return {
    versao: o.versao,
    dia: o.dia,
    geradoEm: new Date().toISOString(),
    referencia,
    temPrevia: !!previa,
    setores: [...setores.values()].sort((a, b) => a.revenda.localeCompare(b.revenda) || +a.setor - +b.setor),
  };
}
