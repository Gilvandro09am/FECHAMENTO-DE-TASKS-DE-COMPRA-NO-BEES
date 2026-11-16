/** Cruza tarefas x itens de pedido (dia) ou de nota faturada (mês) e diz se cada tarefa foi feita. */
import { indicador, interpretarTarefa } from './regras';
import type { ItemPedido, OpcoesAvaliacao, OpcoesMes, Regra, Resultado, Tarefa } from './tipos';

/** Itens do pedido do dia que contam para validar tarefas: venda, bonificação ou resgate, não cancelados. */
export function itemConta(o: ItemPedido, opts: OpcoesAvaliacao): boolean {
  if (opts.dia && o.dataEntrada !== opts.dia) return false;
  if (o.situacao === 'CANCELADO' || o.situacao === 'REJEITADO') return false;
  if (!opts.incluirBloqueados && o.situacao === 'BLOQUEADO') return false;
  return o.mov === 'VENDA' || o.mov === 'BONIFICACAO' || o.tipoItem === 'REDEEMABLE';
}

/** Itens faturados que contam no mês (o filtro de status/operação já foi feito na leitura). */
export function itemContaMes(o: ItemPedido, opts: OpcoesMes): boolean {
  return !!o.dataFat && o.dataFat.startsWith(opts.mes);
}

function agruparPorPdv(itens: ItemPedido[], conta: (o: ItemPedido) => boolean) {
  const porPdv = new Map<string, ItemPedido[]>();
  for (const o of itens) {
    if (!conta(o)) continue;
    const k = `${o.unb}|${o.pdv}`;
    const lista = porPdv.get(k);
    if (lista) lista.push(o);
    else porPdv.set(k, [o]);
  }
  return porPdv;
}

function regraEmCache() {
  const cache = new Map<string, Regra>();
  return (texto: string) => {
    let r = cache.get(texto);
    if (!r) {
      r = interpretarTarefa(texto);
      cache.set(texto, r);
    }
    return r;
  };
}

function progresso(regra: Regra, hit: ItemPedido[]): number {
  switch (regra.tipo) {
    case 'qty':
      return hit.reduce((a, o) => a + o.qty, 0);
    case 'sku':
      return new Set(hit.map((o) => o.cod)).size;
    case 'val':
      return hit.reduce((a, o) => a + o.valor, 0);
    default:
      return hit.length ? 1 : 0;
  }
}

/**
 * Mede o progresso da tarefa e define Feita / Parcial / Não feita.
 * `antes` = o que o PDV já tinha comprado no mês (faturado), somado ao que comprou agora.
 * Se o "antes" sozinho já bate a meta, a tarefa estava concluída e aguardando validação do BEES.
 */
function medir(r: Resultado, linhas: ItemPedido[], antes: ItemPedido[], meta: number) {
  const { regra } = r;
  const fn = regra.fn!;
  const bate = (o: ItemPedido) => (o.tipoItem !== 'REDEEMABLE' || regra.resgate || regra.tipo === 'any') && fn(o);
  const hit = linhas.filter(bate);
  const hitAntes = antes.filter(bate);
  r.meta = regra.tipo === 'any' ? 1 : meta;
  r.antes = hitAntes.length ? progresso(regra, hitAntes) : 0;
  r.prog = progresso(regra, hitAntes.length ? [...hitAntes, ...hit] : hit);
  r.itens = hit;
  if (hitAntes.length && r.antes >= r.meta) r.status = 'Já validada';
  else r.status = hit.length && r.prog >= r.meta ? 'Feita no dia' : hit.length ? 'Parcial' : 'Não feita';
}

/**
 * Avalia as tarefas contra as linhas de cada PDV.
 * `linhasDaTarefa` escolhe quais linhas do PDV valem para a tarefa; `meta` diz quanto ainda falta.
 */
function avaliarCom(
  tarefas: Tarefa[],
  porPdv: Map<string, ItemPedido[]>,
  linhasDaTarefa: (t: Tarefa, linhas: ItemPedido[]) => ItemPedido[],
  meta: (t: Tarefa, r: Regra) => number,
  antesPorPdv?: Map<string, ItemPedido[]>,
  /** Vespertina: tarefas validadas pelo BEES a partir deste dia são medidas (o pedido do dia pode tê-las fechado). */
  reabrirValidadasDesde?: string,
): Resultado[] {
  const regraDe = regraEmCache();
  const out: Resultado[] = [];
  for (const task of tarefas) {
    const ind = indicador(task);
    if (!ind) continue;
    const regra = regraDe(task.texto);
    const doPdv = porPdv.get(`${task.unb}|${task.pdv}`) ?? [];
    const r: Resultado = { task, ind, regra, comprou: doPdv.length > 0, status: 'Sem pedido', prog: 0, meta: 0, itens: [] };
    out.push(r);

    const validada = task.status === 'VALID';
    const reaberta = validada && !!reabrirValidadasDesde && !!task.conclusao && task.conclusao >= reabrirValidadasDesde;
    if (validada && !reaberta) {
      r.status = 'Já validada';
      continue;
    }
    if (regra.tipo === 'nv' || !regra.fn) {
      r.status = reaberta ? 'Já validada' : doPdv.length ? 'Não verificável' : 'Sem pedido';
      continue;
    }
    if (!doPdv.length) {
      if (reaberta) r.status = 'Já validada';
      continue;
    }
    // Tarefa diária vale só para o dia da visita: o acumulado do mês não entra.
    const antes = task.tipoMD === 'Mensal' ? (antesPorPdv?.get(`${task.unb}|${task.pdv}`) ?? []) : [];
    medir(r, linhasDaTarefa(task, doPdv), antes, meta(task, regra));
    // Validada pelo BEES depois do dia, mas o pedido do dia não a explica: continua como já validada.
    if (reaberta && r.status !== 'Feita no dia') r.status = 'Já validada';
  }
  return out;
}

/**
 * Vespertina: pedidos digitados no dia.
 * - Tarefa diária só entra se a visita for no dia do fechamento.
 * - Tarefa mensal soma o faturado do mês antes do dia (quando informado) com o pedido do dia;
 *   sem faturado, a meta desconta a "QTD Já Comprada" do BEES.
 */
export function avaliar(tarefas: Tarefa[], itens: ItemPedido[], opts: OpcoesAvaliacao = {}): Resultado[] {
  const dia = opts.dia;
  const doDia = dia ? tarefas.filter((t) => t.tipoMD === 'Mensal' || !t.visita || t.visita === dia) : tarefas;
  const anteriores = opts.faturadoAnterior;
  const antesPorPdv =
    anteriores && dia
      ? agruparPorPdv(anteriores, (o) => notaAnteriorAoDia(o, dia))
      : undefined;
  const cheia = (t: Tarefa, regra: Regra) => t.solicitada || regra.n || 1;
  return avaliarCom(
    doDia,
    agruparPorPdv(itens, (o) => itemConta(o, opts)),
    (_t, linhas) => linhas,
    (t, regra) => (antesPorPdv ? cheia(t, regra) : Math.max(cheia(t, regra) - (t.ja || 0), 0)),
    antesPorPdv,
    // A planilha do BEES costuma ser exportada no dia seguinte: o que o pedido do dia fechou já aparece VALID.
    dia ?? undefined,
  );
}

/** Nota entregue no mesmo mês, de pedido capturado antes do dia (o pedido do dia já está no arquivo de pedidos). */
export function notaAnteriorAoDia(o: ItemPedido, dia: string): boolean {
  if (!o.dataFat || o.dataFat.slice(0, 7) !== dia.slice(0, 7)) return false;
  const captura = o.dataEntrada && o.dataEntrada > '0000-00-00' ? o.dataEntrada : o.dataFat;
  return captura < dia;
}

/**
 * Mês: notas entregues no mês. Como o faturado cobre o mês inteiro, a meta é a quantidade cheia da tarefa.
 * Vale qualquer nota com entrega no mês, para tarefa mensal ou diária (é assim que o BEES valida).
 */
export function avaliarMes(tarefas: Tarefa[], itens: ItemPedido[], opts: OpcoesMes): Resultado[] {
  return avaliarCom(
    tarefas,
    agruparPorPdv(itens, (o) => itemContaMes(o, opts)),
    (_t, linhas) => linhas,
    (t, regra) => t.solicitada || regra.n || 1,
  );
}
