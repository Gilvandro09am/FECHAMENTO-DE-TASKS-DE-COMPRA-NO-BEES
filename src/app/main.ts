/** Painel de tasks de compra — vespertina (pedidos do dia) e mês (faturado), lidos de /data. */
import './estilo.css';
import {
  arquivoSetor,
  INDICADORES,
  NOME_CURTO,
  STATUS_NOME,
  VERSAO_MODELO,
  type DetalheSetor,
  type Fechamento,
  type Indicador,
  type Indice,
  type ArquivoDivergencias,
  type IndiceDia,
  type ItemProva,
  type PdvFechamento,
  type TipoFechamento,
} from '../shared/modelo';
import { calcular, setoresFiltrados, type Filtros, type LinhaSetor, type Totais } from './agregacao';
import {
  agruparDivergencias,
  CAB_DIV,
  linhasCsvDiv,
  NOME_SITUACAO,
  situacao,
  type LinhaDivSetor,
  type Situacao,
} from './divergencias';
import { CAB_PDV, csvTexto, linhasPdv } from './exportacao';

// ---------- utilidades ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => n.toLocaleString('pt-BR');
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const pct = (x: number | null, casas = 0) => (x == null ? '—' : (x * 100).toFixed(casas).replace('.', ',') + '%');
const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const horaBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaSemana = (iso: string) => DIA_SEMANA[new Date(iso + 'T12:00:00').getDay()];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesBr = (chave: string) => `${MESES[+chave.slice(5, 7) - 1]}/${chave.slice(0, 4)}`;

function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

async function copiar(texto: string, ok: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(ok);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    const deu = document.execCommand('copy');
    ta.remove();
    toast(deu ? ok : 'Não foi possível copiar');
  }
}

function baixar(nome: string, conteudo: string) {
  // BOM para o Excel abrir acentos corretamente.
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- textos de cada painel ----------
const TXT: Record<
  TipoFechamento,
  { h1: string; destaque: string; feitas: string; colFeitas: string; colAp: string; colVal: string; lgF: string; lgB: string; pasta: string }
> = {
  dia: {
    h1: 'Tasks de compra',
    destaque: 'feitas no dia',
    feitas: 'Feitas',
    colFeitas: 'Feitas',
    colAp: 'Aproveit.',
    colVal: 'Já concl.',
    lgF: 'Feitas no dia',
    lgB: 'Abertas nos PDVs que compraram',
    pasta: 'dias',
  },
  mes: {
    h1: 'Tasks de compra',
    destaque: 'validadas no mês',
    feitas: 'Validadas',
    colFeitas: 'Validadas',
    colAp: '% valid.',
    colVal: 'A validar',
    lgF: 'Validadas no BEES',
    lgB: 'Total de tarefas',
    pasta: 'meses',
  },
};

// ---------- estado (espelhado na URL para links diretos por setor) ----------
/** dia = vespertina · mes = faturado · div = divergências (abertas no BEES que o faturado já comprova). */
type Modo = TipoFechamento | 'div';
interface Estado extends Filtros {
  modo: Modo;
  sit: Situacao;
  chave: string;
  aberto: string | null; // id do setor com a gaveta aberta
  ordem: { k: string; d: 1 | -1 };
}
const url = new URLSearchParams(location.search);
const EST: Estado = {
  modo: url.get('m') === 'mes' ? 'mes' : url.get('m') === 'div' ? 'div' : 'dia',
  sit: url.get('sit') === 'todas' ? 'todas' : 'atrasadas',
  chave: url.get('dia') ?? url.get('mes') ?? '',
  rev: url.get('rev') ?? 'todas',
  gv: url.get('gv') ?? 'todos',
  ind: (INDICADORES as readonly string[]).includes(url.get('ind') ?? '') ? (url.get('ind') as Indicador) : 'todos',
  busca: url.get('q') ?? '',
  aberto: url.get('setor'),
  ordem: { k: 'feitas', d: -1 },
};
const listaDe = (m: Modo): IndiceDia[] =>
  m === 'dia' ? INDICE!.dias : m === 'mes' ? INDICE!.meses : INDICE!.meses.filter((x) => INDICE!.divergencias?.some((d) => d.chave === x.chave));
const listaDoModo = () => listaDe(EST.modo);
const tipoDo = (m: Modo): TipoFechamento => (m === 'dia' ? 'dia' : 'mes');

function gravarUrl() {
  const p = new URLSearchParams();
  if (EST.modo !== 'dia') p.set('m', EST.modo);
  if (EST.modo === 'div' && EST.sit === 'todas') p.set('sit', 'todas');
  if (EST.chave && EST.chave !== listaDoModo()[0]?.chave) p.set(EST.modo === 'dia' ? 'dia' : 'mes', EST.chave);
  if (EST.rev !== 'todas') p.set('rev', EST.rev);
  if (EST.gv !== 'todos') p.set('gv', EST.gv);
  if (EST.ind !== 'todos') p.set('ind', EST.ind);
  if (EST.busca) p.set('q', EST.busca);
  if (EST.aberto) p.set('setor', EST.aberto);
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

// ---------- dados ----------
let INDICE: Indice | null = null;
let F: Fechamento | null = null;
const cache = new Map<string, Fechamento>();
const cacheDetalhe = new Map<string, DetalheSetor | 'carregando' | 'erro'>();

async function buscarJson<T>(caminho: string): Promise<T> {
  const r = await fetch(caminho, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`);
  return r.json() as Promise<T>;
}

let DIV: ArquivoDivergencias | null = null;
const cacheDiv = new Map<string, ArquivoDivergencias>();

async function carregar(modo: Modo, chave: string) {
  const tipo = tipoDo(modo);
  const k = `${tipo}/${chave}`;
  let f = cache.get(k);
  if (!f) {
    f = await buscarJson<Fechamento>(`data/${TXT[tipo].pasta}/${chave}.json`);
    cache.set(k, f);
  }
  if (modo === 'div') {
    let d = cacheDiv.get(chave);
    if (!d) {
      d = await buscarJson<ArquivoDivergencias>(`data/divergencias/${chave}.json`);
      cacheDiv.set(chave, d);
    }
    DIV = d;
  }
  F = f;
  const aviso = $('aviso');
  aviso.hidden = f.versao === VERSAO_MODELO;
  aviso.className = 'aviso';
  aviso.textContent = 'Este fechamento foi gerado com outra versão do painel. Recarregue a página.';
}

const promessas = new Map<string, Promise<DetalheSetor>>();

/** Detalhe dos PDVs do setor: no próprio fechamento ou num arquivo por setor (carregado sob demanda). */
function obterDetalhe(f: Fechamento, setorId: string): Promise<DetalheSetor> {
  if (!f.detalhePorSetor) return Promise.resolve({ pdvs: f.pdvs.filter((p) => p.setorId === setorId), textos: f.textos });
  const k = `${f.tipo}/${f.chave}/${setorId}`;
  let pr = promessas.get(k);
  if (!pr) {
    cacheDetalhe.set(k, 'carregando');
    pr = buscarJson<DetalheSetor>(`data/${TXT[f.tipo].pasta}/${f.chave}/${arquivoSetor(setorId)}.json`);
    pr.then((d) => cacheDetalhe.set(k, d)).catch(() => {
      cacheDetalhe.set(k, 'erro');
      promessas.delete(k); // deixa tentar de novo
    });
    promessas.set(k, pr);
  }
  return pr;
}

function detalheDoSetor(setorId: string): DetalheSetor | 'carregando' | 'erro' {
  const f = F!;
  if (!f.detalhePorSetor) return { pdvs: f.pdvs.filter((p) => p.setorId === setorId), textos: f.textos };
  const k = `${f.tipo}/${f.chave}/${setorId}`;
  const c = cacheDetalhe.get(k);
  if (c && c !== 'carregando') return c;
  if (!c)
    obterDetalhe(f, setorId)
      .catch(() => undefined)
      .finally(() => {
        if (F === f && EST.aberto === setorId) render();
      });
  return 'carregando';
}

// ---------- render ----------
function revendas() {
  return [...new Set(F!.setores.map((s) => s.revenda))].sort();
}

function renderControles() {
  const ABAS: [Modo, string][] = [
    ['dia', 'Vespertina · pedidos do dia'],
    ['mes', 'Mês · faturado'],
    ['div', 'Divergências · abertas no BEES'],
  ];
  $('segModo').innerHTML = ABAS.map(
    ([m, nome]) =>
      `<button type="button" data-modo="${m}" aria-pressed="${EST.modo === m}"${listaDe(m).length ? '' : ' disabled'}>${nome}</button>`,
  ).join('');
  $('selDia').innerHTML = listaDoModo()
    .map((d) => {
      if (EST.modo === 'dia') return `<option value="${d.chave}">${dataBr(d.dia)} · ${diaSemana(d.dia)} · ${fmt(d.feitas)} feitas</option>`;
      if (EST.modo === 'mes')
        return `<option value="${d.chave}">${mesBr(d.chave)} · entregas até ${dataBr(d.dia)} · ${fmt(d.feitas)} validadas</option>`;
      const dv = INDICE!.divergencias?.find((x) => x.chave === d.chave);
      return `<option value="${d.chave}">${mesBr(d.chave)} · ${fmt(dv?.atrasadas ?? 0)} atrasadas</option>`;
    })
    .join('');
  $<HTMLSelectElement>('selDia').value = EST.chave;
  $('lblDia').textContent = EST.modo === 'dia' ? 'Fechamento' : 'Mês';

  const revs = revendas();
  if (EST.rev !== 'todas' && !revs.includes(EST.rev)) EST.rev = 'todas';
  $('segRev').innerHTML = ['todas', ...revs]
    .map((r) => `<button type="button" data-rev="${esc(r)}" aria-pressed="${EST.rev === r}">${r === 'todas' ? 'Todas' : esc(r)}</button>`)
    .join('');

  const gvs = [...new Set(F!.setores.filter((s) => EST.rev === 'todas' || s.revenda === EST.rev).map((s) => s.gv))].sort(
    (a, b) => +a - +b,
  );
  if (EST.gv !== 'todos' && !gvs.includes(EST.gv)) EST.gv = 'todos';
  $('selGv').innerHTML = `<option value="todos">Todos</option>` + gvs.map((g) => `<option value="${g}">GV ${g}</option>`).join('');
  $<HTMLSelectElement>('selGv').value = EST.gv;

  $('selInd').innerHTML =
    `<option value="todos">Todos</option>` +
    INDICADORES.map((i) => `<option value="${i}">${i.replace('DP · ', 'Portfólio · ')}</option>`).join('');
  $<HTMLSelectElement>('selInd').value = EST.ind;
  $<HTMLInputElement>('busca').value = EST.busca;
}

function renderCabecalho() {
  const f = F!;
  const t = TXT[f.tipo];
  document.title = f.tipo === 'dia' ? 'Tasks de Compra do Dia' : 'Tasks de Compra do Mês';
  $('ebrow').textContent = 'Pau Brasil · ' + revendas().join(' · ');
  $('h1').innerHTML = `${t.h1} <span>${t.destaque}</span>`;
  $('src').innerHTML =
    f.tipo === 'dia'
      ? `Vespertina de <b>${dataBr(f.dia)} (${diaSemana(f.dia)})</b>: ${fmt(f.resumo.pedidos)} pedidos do dia cruzados com ` +
        `${fmt(f.resumo.tarefasNoEscopo)} tarefas de compra do BEES Force. Atualizado em ${horaBr(f.geradoEm)}.`
      : `Mês de <b>${mesBr(f.chave)}</b>, entregas até <b>${dataBr(f.dia)}</b>: ${fmt(f.resumo.pedidos)} pedidos faturados cruzados com ` +
        `${fmt(f.resumo.tarefasNoEscopo)} tarefas de compra do BEES Force. Atualizado em ${horaBr(f.geradoEm)}.`;
  $('foot').innerHTML =
    `Fontes: ${esc(f.arquivos.pedidos)} · ${f.arquivos.tarefas.map(esc).join(' · ')} · ${esc(f.arquivos.cesta)}. ` +
    (f.tipo === 'dia'
      ? `Pedidos bloqueados ${f.config.incluirBloqueados ? 'contam' : 'não contam'} como venda. Prévia calculada pelos pedidos; a validação oficial do BEES acontece após o faturamento.`
      : 'Só a validação do BEES conclui a tarefa. O faturado (notas de venda e bonificação entregues no mês; devolvidas e canceladas fora) comprova cada validada e aponta as abertas que já deveriam estar validadas (aba Divergências).');
  $('legF').textContent = t.lgF;
  $('legB').textContent = t.lgB;
}

function renderKpis(tot: Totais) {
  const ap = tot.base ? tot.feitas / tot.base : null;
  $('kpis').innerHTML =
    F!.tipo === 'dia'
      ? `
    <div class="kpi lead"><div class="k">Tasks feitas no dia</div><div class="v">${fmt(tot.feitas)}</div><div class="s">+ ${fmt(tot.parciais)} parciais (compraram, faltou quantidade)</div></div>
    <div class="kpi"><div class="k">PDVs que compraram</div><div class="v">${fmt(tot.pdvComPedido)}</div><div class="s">de ${fmt(tot.pdvComTarefa)} PDVs com tarefa de compra</div></div>
    <div class="kpi"><div class="k">Aproveitamento</div><div class="v">${pct(ap, 1)}</div><div class="s">${fmt(tot.feitas)} de ${fmt(tot.base)} tarefas abertas nesses PDVs</div></div>
    <div class="kpi"><div class="k">Já concluídas antes</div><div class="v">${fmt(tot.validadas)}</div><div class="s">validadas no BEES ou já cobertas pelo faturado do mês</div></div>`
      : `
    <div class="kpi lead"><div class="k">Tasks validadas no BEES</div><div class="v">${fmt(tot.feitas)}</div><div class="s">validação oficial do mês, comprovada pelo faturado</div></div>
    <div class="kpi"><div class="k">PDVs faturados</div><div class="v">${fmt(tot.pdvComPedido)}</div><div class="s">de ${fmt(tot.pdvComTarefa)} PDVs com tarefa de compra</div></div>
    <div class="kpi"><div class="k">% validadas</div><div class="v">${pct(ap, 1)}</div><div class="s">${fmt(tot.feitas)} de ${fmt(tot.base)} tarefas do mês</div></div>
    <div class="kpi"><div class="k">Abertas que deveriam estar validadas</div><div class="v">${fmt(tot.feitasCalculo)}</div><div class="s">o faturado comprova, o BEES ainda não validou · veja a aba Divergências · ${fmt(tot.parciais)} parciais</div></div>`;
}

function renderIndicadores(tot: Totais) {
  const mx = Math.max(1, ...tot.basePorInd);
  let h = '<div class="grp">Desenvolvimento de Portfólio</div>';
  INDICADORES.forEach((ind, i) => {
    if (ind === 'Marketplace') h += '<div class="grp">Marketplace</div>';
    const fe = tot.feitasPorInd[i],
      ab = tot.basePorInd[i];
    h += `<div class="bar${EST.ind === ind ? ' sel' : ''}" data-ind="${ind}" role="button" tabindex="0" aria-pressed="${EST.ind === ind}">
      <span class="nm">${NOME_CURTO[ind]}</span>
      <span class="tr"><i style="width:${(ab / mx) * 100}%"></i><b style="width:${(fe / mx) * 100}%"></b></span>
      <span class="n">${fmt(fe)} <small>/ ${fmt(ab)}</small></span></div>`;
  });
  $('ind').innerHTML = h;
}

function colunas(): { k: string; l: string; c?: string; ind?: Indicador }[] {
  const t = TXT[F!.tipo];
  return [
    { k: 'setor', l: 'Setor', c: 'l fix' },
    { k: 'rev', l: 'Revenda', c: 'l' },
    { k: 'gv', l: 'GV' },
    { k: 'nb', l: 'NB', c: 'l' },
    { k: 'pdv', l: F!.tipo === 'dia' ? 'PDVs c/ pedido' : 'PDVs faturados' },
    ...INDICADORES.map((i) => ({ k: 'i' + INDICADORES.indexOf(i), l: NOME_CURTO[i], ind: i })),
    { k: 'feitas', l: t.colFeitas },
    { k: 'parciais', l: 'Parciais' },
    { k: 'ap', l: t.colAp },
    { k: 'validadas', l: t.colVal },
  ];
}

function valor(l: LinhaSetor, k: string): number | string {
  switch (k) {
    case 'setor':
      return +l.s.setor;
    case 'gv':
      return +l.s.gv;
    case 'rev':
      return l.s.revenda;
    case 'nb':
      return l.s.nb;
    case 'pdv':
      return l.s.pdvComPedido;
    case 'ap':
      return l.aproveitamento ?? -1;
    case 'feitas':
    case 'parciais':
    case 'validadas':
      if (F!.tipo === 'mes') return l.feitasCalculo;
      return l[k];
    default:
      return l.porInd[+k.slice(1)];
  }
}

function renderTabela(res: ReturnType<typeof calcular>) {
  const { k, d } = EST.ordem;
  const linhas = [...res.linhas].sort((a, b) => {
    const va = valor(a, k),
      vb = valor(b, k);
    const c = typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number);
    return c * d || +a.s.setor - +b.s.setor;
  });
  const cols = colunas();
  const mx = Math.max(1, ...linhas.flatMap((l) => l.porInd));
  const dim = (ind?: Indicador) => (ind && EST.ind !== 'todos' && EST.ind !== ind ? ' dim' : '');
  const heat = (n: number) =>
    n ? `<span class="heat" style="background:color-mix(in srgb, var(--accent) ${Math.round(12 + (60 * n) / mx)}%, transparent)">${fmt(n)}</span>` : '·';
  const nDP = INDICADORES.filter((i) => i.startsWith('DP')).length;

  let h = `<thead><tr><th colspan="5" class="grp"></th><th colspan="${nDP}" class="grp">Desenvolvimento de Portfólio</th><th colspan="${cols.length - 5 - nDP}" class="grp"></th></tr><tr>`;
  for (const c of cols) {
    const on = k === c.k;
    h += `<th class="${c.c ?? ''}${on ? ' sorted' : ''}${dim(c.ind)}" data-k="${c.k}" aria-sort="${on ? (d > 0 ? 'ascending' : 'descending') : 'none'}">${c.l}${on ? (d > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  }
  h += '</tr></thead><tbody>';
  if (!linhas.length) h += `<tr><td colspan="${cols.length}" class="l empty">Nenhum setor com esses filtros.</td></tr>`;
  for (const l of linhas) {
    const s = l.s;
    h += `<tr class="row${EST.aberto === s.id ? ' open' : ''}" data-id="${s.id}" tabindex="0">
      <td class="l fix"><b>${s.setor}</b></td><td class="l"><span class="rev">${esc(s.revenda)}</span></td><td>${s.gv}</td>
      <td class="l"><span class="nb" title="${esc(s.nb)}">${esc(s.nb) || '—'}</span></td>
      <td>${fmt(s.pdvComPedido)} <small class="muted">/ ${fmt(s.pdvComTarefa)}</small></td>
      ${INDICADORES.map((ind, i) => `<td class="${l.porInd[i] ? 'hot' : 'z'}${dim(ind)}">${heat(l.porInd[i])}</td>`).join('')}
      <td class="tot">${fmt(l.feitas)}</td><td>${l.parciais ? fmt(l.parciais) : '·'}</td>
      <td>${l.aproveitamento == null ? '—' : `<span class="pct"><i><b style="width:${Math.min(100, l.aproveitamento * 100)}%"></b></i>${pct(l.aproveitamento)}</span>`}</td>
      <td>${(() => {
        const n = F!.tipo === 'mes' ? l.feitasCalculo : l.validadas;
        return n ? fmt(n) : '·';
      })()}</td></tr>`;
  }
  const t = res.tot;
  h += `<tr class="sum"><td class="l fix">Total</td><td colspan="3"></td><td>${fmt(t.pdvComPedido)} <small>/ ${fmt(t.pdvComTarefa)}</small></td>
    ${t.feitasPorInd.map((n, i) => `<td class="${dim(INDICADORES[i]).trim()}">${n ? fmt(n) : '·'}</td>`).join('')}
    <td class="tot">${fmt(t.feitas)}</td><td>${fmt(t.parciais)}</td><td>${pct(t.base ? t.feitas / t.base : null)}</td><td>${fmt(F!.tipo === 'mes' ? t.feitasCalculo : t.validadas)}</td></tr></tbody>`;
  $('tbl').innerHTML = h;

  const aberto = linhas.find((l) => l.s.id === EST.aberto);
  $('drawer').innerHTML = aberto ? gaveta(aberto) : '';
}

function gaveta(l: LinhaSetor): string {
  const f = F!,
    s = l.s;
  const nomes = STATUS_NOME[f.tipo];
  const mes = f.tipo === 'mes';
  let h = `<div class="drawer"><div class="top"><h3>Setor ${s.setor} · ${esc(s.revenda)}${s.nb ? ' · ' + esc(s.nb) : ''}</h3>
    <div class="toolbar"><button class="btn small" data-acao="csv-setor" type="button">Baixar CSV do setor (por PDV)</button><button class="btn small" data-acao="link" type="button">Copiar link do setor</button><button class="btn small" data-acao="fechar" type="button">Fechar</button></div></div>`;

  const det = detalheDoSetor(s.id);
  if (det === 'carregando') return h + '<div class="empty">Carregando os PDVs do setor…</div></div>';
  if (det === 'erro') {
    // Próxima abertura tenta de novo.
    cacheDetalhe.delete(`${f.tipo}/${f.chave}/${s.id}`);
    return h + '<div class="empty">Não foi possível carregar os PDVs deste setor. Feche e abra de novo.</div></div>';
  }

  const filtroInd = EST.ind === 'todos' ? -1 : INDICADORES.indexOf(EST.ind);
  const pdvs = det.pdvs
    .map((p) => {
      // Concluídas primeiro: no mês, as validadas pelo BEES também contam como concluídas.
      const ordem: Record<string, number> = mes ? { V: 0, F: 1, P: 2, N: 3, X: 4 } : { F: 0, P: 1, N: 2, V: 3, X: 4 };
      const tarefas = p.tarefas.filter((t) => filtroInd < 0 || t[1] === filtroInd).sort((a, b) => ordem[a[0]] - ordem[b[0]]);
      const cont = (st: string) => tarefas.filter((t) => t[0] === st).length;
      return { p, tarefas, feitas: mes ? cont('V') : cont('F'), aValidar: mes ? cont('F') : 0, parciais: cont('P') };
    })
    .filter((x) => x.tarefas.length)
    .sort((a, b) => b.feitas - a.feitas || b.parciais - a.parciais);

  h += `<div class="sub">${fmt(pdvs.length)} PDVs ${mes ? 'com nota ou tarefa validada' : 'com pedido e com tarefa'} · ${fmt(s.pdvComTarefa - s.pdvComPedido)} PDVs com tarefa ficaram sem ${
    mes ? `faturamento em ${mesBr(f.chave)}` : `pedido em ${dataBr(f.dia)}`
  }</div>`;
  if (!pdvs.length) h += `<div class="empty">Nenhum PDV deste setor ${mes ? 'teve nota no mês' : 'fez pedido neste dia'}.</div>`;
  pdvs.forEach(({ p, tarefas, feitas, aValidar, parciais }, i) => {
    h += `<details class="pdv"${i < 3 && feitas ? ' open' : ''}><summary><span class="nm">${esc(p.nome) || 'PDV'}</span>
      <span class="cd">PDV ${p.pdv}${p.visita ? ' · visita ' + dataBr(p.visita) : ''}${p.rn ? ' · RN ' + esc(p.rn) : ''}</span><span class="chips">
      ${feitas ? `<span class="pill p-F">${feitas} ${mes ? 'validadas' : 'feitas'}</span>` : ''}${aValidar ? `<span class="pill p-N">${aValidar} a validar</span>` : ''}${parciais ? `<span class="pill p-P">${parciais} parciais</span>` : ''}
      <span class="pill p-tot">${tarefas.length} tarefas</span></span></summary><div class="tl">`;
    for (const [st, ind, md, txt, prog, provas, valid] of tarefas) {
      h += `<div class="trow"><div><span class="pill p-${st}">${nomes[st]}</span><div class="ix">${NOME_CURTO[INDICADORES[ind]]} · ${md === 'M' ? 'Mensal' : 'Diária'}</div></div>
        <div class="tx"><span class="tt">${esc(det.textos[txt])}</span>${provaHtml(p, provas, st, valid)}</div><div class="pg">${st === 'X' ? '' : esc(prog)}</div></div>`;
    }
    h += '</div></details>';
  });
  return h + '</div>';
}

/** Compras que comprovam a tarefa: produto, caixas, valor, pedido ou nota, data e RN. */
function provaHtml(p: PdvFechamento, provas: number[], st: string, valid: string): string {
  let h = '';
  if (st === 'V') h += `<div class="valid">✓ Validada no BEES${valid ? ` em ${dataBr(valid)}` : ''}</div>`;
  if (st === 'X') h += '<div class="semprova">Não dá para comprovar pelos pedidos: depende de informação que não vem nos arquivos.</div>';
  if (!provas.length) {
    if (st === 'N') h += '<div class="semprova">Nenhum item comprado bate com esta tarefa.</div>';
    return h;
  }
  h += '<ul class="prova">';
  for (const i of provas) {
    const it = p.itens[i];
    if (it) h += `<li>${provaLinha(it)}</li>`;
  }
  return h + '</ul>';
}

function documento([, , , , ped, nf, data, rn, o]: ItemProva): string {
  return o === 'F'
    ? `${nf ? `NF ${nf}` : 'Nota'}${ped ? ` · pedido ${ped}` : ''} · entregue ${dataCurta(data)}`
    : `Pedido ${ped} · ${dataCurta(data)}${rn ? ` · RN ${rn}` : ''}`;
}

function provaLinha(it: ItemProva): string {
  const [cod, d, q, v] = it;
  return `<b>${esc(d)}</b> <span class="cod">${esc(cod)}</span> <span class="q">${num(q)} cx · ${reais(v)}</span> <span class="doc">${esc(documento(it))}</span>`;
}

function render() {
  if (!F) return;
  $('segSit').hidden = EST.modo !== 'div';
  if (EST.modo === 'div') {
    renderDiv();
    gravarUrl();
    return;
  }
  const res = calcular(F, EST);
  renderCabecalho();
  renderKpis(res.tot);
  renderIndicadores(res.tot);
  renderTabela(res);
  gravarUrl();
}

// ---------- aba Divergências ----------
const PILL_SIT = { atrasada: 'p-N', recente: 'p-P', antes: 'p-X' } as const;

function divAtual(sit: Situacao = EST.sit) {
  return agruparDivergencias(DIV!, setoresFiltrados(F!, EST), EST.ind, sit);
}

function renderDiv() {
  const a = DIV!,
    f = F!;
  const res = divAtual();
  const todas = EST.sit === 'todas' ? res : divAtual('todas');
  const tol = a.tolerancia;
  document.title = 'Divergências BEES';
  $('ebrow').textContent = 'Pau Brasil · ' + revendas().join(' · ');
  $('h1').innerHTML = 'Tasks de compra <span>abertas no BEES</span>';
  const refs = Object.entries(a.referencia)
    .map(([unb, d]) => `${esc(f.setores.find((s) => s.unb === unb)?.revenda ?? unb)} ${dataCurta(d)}`)
    .join(' · ');
  $('src').innerHTML =
    `Tarefas de <b>${mesBr(a.mes)}</b> que seguem <b>abertas no BEES</b>, mas o faturado (entregas até ${dataBr(f.dia)}) já comprova. ` +
    `Export do BEES (última validação): ${refs}.`;
  $('foot').innerHTML =
    `<b>Atrasada</b>: pedido digitado a partir da visita da tarefa e nota entregue há ${tol}+ dias antes do export do BEES — já deveria estar validada. ` +
    '<b>Recente</b>: entregue há menos tempo, o BEES ainda pode validar. <b>Compra antes da visita</b>: a meta só fecha com pedidos anteriores à visita; o BEES costuma não considerar. ' +
    'Ficam fora as tarefas de "missão" e "desafio", que o BEES valida por etapas ou por adesão no app.';
  $('legF').textContent = 'Atrasadas';
  $('legB').textContent = 'Todas as divergências';

  const t = todas.tot;
  $('kpis').innerHTML = `
    <div class="kpi lead"><div class="k">Atrasadas</div><div class="v">${fmt(t.atrasadas)}</div><div class="s">abertas no BEES com nota entregue há ${tol}+ dias</div></div>
    <div class="kpi"><div class="k">Recentes</div><div class="v">${fmt(t.recentes)}</div><div class="s">entregues há menos de ${tol} dias do export (aguardando)</div></div>
    <div class="kpi"><div class="k">Compra antes da visita</div><div class="v">${fmt(t.antesVisita)}</div><div class="s">o BEES costuma não validar com pedido anterior à tarefa</div></div>
    <div class="kpi"><div class="k">PDVs afetados</div><div class="v">${fmt(res.tot.pdvs)}</div><div class="s">em ${fmt(res.tot.setores)} setores · ${EST.sit === 'atrasadas' ? 'só atrasadas' : 'todas as situações'}</div></div>`;

  // Por indicador: barra = todas as divergências, destaque = atrasadas.
  const atras = EST.sit === 'atrasadas' ? res : divAtual('atrasadas');
  const mx = Math.max(1, ...t.porInd);
  let h = '<div class="grp">Desenvolvimento de Portfólio</div>';
  INDICADORES.forEach((ind, i) => {
    if (ind === 'Marketplace') h += '<div class="grp">Marketplace</div>';
    const fe = atras.tot.porInd[i],
      ab = t.porInd[i];
    h += `<div class="bar${EST.ind === ind ? ' sel' : ''}" data-ind="${ind}" role="button" tabindex="0" aria-pressed="${EST.ind === ind}">
      <span class="nm">${NOME_CURTO[ind]}</span>
      <span class="tr"><i style="width:${(ab / mx) * 100}%"></i><b style="width:${(fe / mx) * 100}%"></b></span>
      <span class="n">${fmt(fe)} <small>/ ${fmt(ab)}</small></span></div>`;
  });
  $('ind').innerHTML = h;

  $('segSit').innerHTML = (['atrasadas', 'todas'] as const)
    .map((s) => `<button type="button" data-sit="${s}" aria-pressed="${EST.sit === s}">${s === 'atrasadas' ? 'Só atrasadas' : 'Todas'}</button>`)
    .join('');
  renderDivTabela(res.linhas, res.tot.total);
}

const COLS_DIV = (): { k: string; l: string; c?: string; ind?: Indicador }[] => [
  { k: 'setor', l: 'Setor', c: 'l fix' },
  { k: 'rev', l: 'Revenda', c: 'l' },
  { k: 'gv', l: 'GV' },
  { k: 'nb', l: 'NB', c: 'l' },
  { k: 'pdv', l: 'PDVs' },
  ...INDICADORES.map((i) => ({ k: 'i' + INDICADORES.indexOf(i), l: NOME_CURTO[i], ind: i })),
  { k: 'feitas', l: 'Tarefas' },
  { k: 'atras', l: 'Atrasadas' },
  { k: 'dias', l: 'Maior atraso' },
];

function valorDiv(l: LinhaDivSetor, k: string): number | string {
  switch (k) {
    case 'setor':
      return +l.s.setor;
    case 'gv':
      return +l.s.gv;
    case 'rev':
      return l.s.revenda;
    case 'nb':
      return l.s.nb;
    case 'pdv':
      return l.pdvs;
    case 'feitas':
      return l.total;
    case 'atras':
      return l.atrasadas;
    case 'dias':
      return l.maxDias;
    default:
      return l.porInd[+k.slice(1)];
  }
}

function renderDivTabela(linhasBase: LinhaDivSetor[], total: number) {
  const { k, d } = EST.ordem;
  const linhas = [...linhasBase].sort((a, b) => {
    const va = valorDiv(a, k),
      vb = valorDiv(b, k);
    const c = typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number);
    return c * d || +a.s.setor - +b.s.setor;
  });
  const cols = COLS_DIV();
  const dim = (ind?: Indicador) => (ind && EST.ind !== 'todos' && EST.ind !== ind ? ' dim' : '');
  const nDP = INDICADORES.filter((i) => i.startsWith('DP')).length;
  let h = `<thead><tr><th colspan="5" class="grp"></th><th colspan="${nDP}" class="grp">Desenvolvimento de Portfólio</th><th colspan="${cols.length - 5 - nDP}" class="grp"></th></tr><tr>`;
  for (const c of cols) {
    const on = k === c.k;
    h += `<th class="${c.c ?? ''}${on ? ' sorted' : ''}${dim(c.ind)}" data-k="${c.k}" aria-sort="${on ? (d > 0 ? 'ascending' : 'descending') : 'none'}">${c.l}${on ? (d > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  }
  h += '</tr></thead><tbody>';
  if (!linhas.length)
    h += `<tr><td colspan="${cols.length}" class="l empty">Nenhuma divergência com esses filtros${EST.sit === 'atrasadas' ? ' (veja também "Todas")' : ''}.</td></tr>`;
  for (const l of linhas) {
    const s = l.s;
    h += `<tr class="row${EST.aberto === s.id ? ' open' : ''}" data-id="${s.id}" tabindex="0">
      <td class="l fix"><b>${s.setor}</b></td><td class="l"><span class="rev">${esc(s.revenda)}</span></td><td>${s.gv}</td>
      <td class="l"><span class="nb" title="${esc(s.nb)}">${esc(s.nb) || '—'}</span></td><td>${fmt(l.pdvs)}</td>
      ${l.porInd.map((n, i) => `<td class="${n ? 'hot' : 'z'}${dim(INDICADORES[i])}">${n ? `<span class="heat">${fmt(n)}</span>` : '·'}</td>`).join('')}
      <td class="tot">${fmt(l.total)}</td><td>${l.atrasadas ? fmt(l.atrasadas) : '·'}</td><td>${l.maxDias > 0 ? `${l.maxDias} dias` : '—'}</td></tr>`;
  }
  h += `<tr class="sum"><td class="l fix">Total</td><td colspan="${cols.length - 3}"></td><td class="tot">${fmt(total)}</td><td></td></tr></tbody>`;
  $('tbl').innerHTML = h;
  const aberto = linhas.find((l) => l.s.id === EST.aberto);
  $('drawer').innerHTML = aberto ? gavetaDiv(aberto) : '';
}

function gavetaDiv(l: LinhaDivSetor): string {
  const a = DIV!,
    s = l.s;
  const ref = a.referencia[s.unb] ?? '';
  let h = `<div class="drawer"><div class="top"><h3>Setor ${s.setor} · ${esc(s.revenda)}${s.nb ? ' · ' + esc(s.nb) : ''}</h3>
    <div class="toolbar"><button class="btn small" data-acao="csv-setor" type="button">Baixar CSV do setor</button><button class="btn small" data-acao="link" type="button">Copiar link do setor</button><button class="btn small" data-acao="fechar" type="button">Fechar</button></div></div>
    <div class="sub">${fmt(l.total)} tarefas abertas no BEES que o faturado comprova, em ${fmt(l.pdvs)} PDVs · export do BEES de ${dataBr(ref)}</div>`;
  const porPdv = new Map<string, typeof l.itens>();
  for (const d of l.itens) porPdv.set(d.pdv, [...(porPdv.get(d.pdv) ?? []), d]);
  const pdvs = [...porPdv.values()].sort((x, y) => Math.max(...y.map((d) => d.dias)) - Math.max(...x.map((d) => d.dias)));
  pdvs.forEach((lista, i) => {
    const p = lista[0];
    const at = lista.filter((d) => situacao(a, d) === 'atrasada').length;
    h += `<details class="pdv"${i < 3 ? ' open' : ''}><summary><span class="nm">${esc(p.nome) || 'PDV'}</span>
      <span class="cd">PDV ${p.pdv}</span><span class="chips">${at ? `<span class="pill p-N">${at} atrasadas</span>` : ''}
      <span class="pill p-tot">${lista.length} tarefas</span></span></summary><div class="tl">`;
    for (const d of lista) {
      const st = situacao(a, d);
      const quando = d.quando ? `meta em ${dataCurta(d.quando)}${st === 'antes' ? '' : ` · ${d.dias} ${Math.abs(d.dias) === 1 ? 'dia' : 'dias'} até o export`}` : '';
      h += `<div class="trow"><div><span class="pill ${PILL_SIT[st]}">${NOME_SITUACAO[st]}</span><div class="ix">${NOME_CURTO[INDICADORES[d.ind]]} · ${d.md === 'M' ? 'Mensal' : 'Diária'}</div></div>
        <div class="tx"><span class="tt">${esc(d.texto)}</span>${d.itens.length ? `<ul class="prova">${d.itens.map((it) => `<li>${provaLinha(it)}</li>`).join('')}</ul>` : ''}</div>
        <div class="pg">${esc(d.prog)}<small class="muted">${d.visita ? `visita ${dataCurta(d.visita)}` : ''}${quando ? `<br>${quando}` : ''}</small></div></div>`;
    }
    h += '</div></details>';
  });
  return h + '</div>';
}

function csvDiv(linhas: LinhaDivSetor[]): string {
  return csvTexto([CAB_DIV, ...linhasCsvDiv(DIV!, linhas, mesBr(DIV!.mes))]);
}

function tabelaDivTexto(sep: string): string {
  const res = divAtual();
  const q = (v: unknown) => (sep === ';' && /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const cab = ['Mês', 'Revenda', 'GV', 'Setor', 'NB', 'PDVs', ...INDICADORES, 'Tarefas', 'Atrasadas', 'Maior atraso (dias)'];
  const linhas = res.linhas
    .sort((a, b) => b.atrasadas - a.atrasadas || b.total - a.total)
    .map((l) => [mesBr(DIV!.mes), l.s.revenda, l.s.gv, l.s.setor, l.s.nb, l.pdvs, ...l.porInd, l.total, l.atrasadas, l.maxDias].map(q).join(sep));
  return [cab.map(q).join(sep), ...linhas].join('\n');
}

// ---------- exportação ----------
function tabelaTexto(sep: string): string {
  const f = F!;
  const res = calcular(f, EST);
  const mes = f.tipo === 'mes';
  const cab = [
    mes ? 'Mês' : 'Dia',
    'Revenda',
    'GV',
    'Setor',
    'NB',
    mes ? 'PDVs faturados' : 'PDVs c/ pedido',
    'PDVs c/ tarefa',
    ...INDICADORES,
    mes ? 'Validadas BEES' : 'Feitas',
    ...(mes ? ['Abertas que o faturado comprova'] : []),
    'Parciais',
    mes ? '% Validadas' : 'Aproveitamento',
    ...(mes ? [] : ['Já concluídas']),
  ];
  const q = (v: unknown) => (sep === ';' && /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const linhas = res.linhas
    .sort((a, b) => b.feitas - a.feitas)
    .map((l) =>
      [
        mes ? mesBr(f.chave) : dataBr(f.dia),
        l.s.revenda,
        l.s.gv,
        l.s.setor,
        l.s.nb,
        l.s.pdvComPedido,
        l.s.pdvComTarefa,
        ...l.porInd,
        l.feitas,
        ...(mes ? [l.feitasCalculo] : []),
        l.parciais,
        pct(l.aproveitamento, 1),
        ...(mes ? [] : [l.validadas]),
      ]
        .map(q)
        .join(sep),
    );
  return [cab.map(q).join(sep), ...linhas].join('\n');
}

async function baixarCsvPdv(setores: LinhaSetor['s'][], nome: string, botao: HTMLButtonElement) {
  const f = F!;
  const filtroInd = EST.ind === 'todos' ? -1 : INDICADORES.indexOf(EST.ind);
  const rotulo = botao.textContent;
  botao.disabled = true;
  try {
    const linhas: string[][] = [CAB_PDV];
    // Carrega de 6 em 6 setores para não travar o navegador.
    for (let i = 0; i < setores.length; i += 6) {
      const lote = setores.slice(i, i + 6);
      const dets = await Promise.all(lote.map((s) => obterDetalhe(f, s.id)));
      lote.forEach((s, j) => linhas.push(...linhasPdv(f, s, dets[j], filtroInd)));
      botao.textContent = `Carregando ${Math.min(i + 6, setores.length)}/${setores.length}…`;
    }
    baixar(nome, csvTexto(linhas));
    toast(`${fmt(linhas.length - 1)} tarefas exportadas.`);
  } catch {
    toast('Não foi possível carregar todos os setores. Tente de novo.');
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();

// ---------- eventos ----------
async function trocar(modo: Modo, chave: string) {
  EST.modo = modo;
  EST.chave = chave;
  EST.aberto = null;
  await carregar(modo, chave);
  renderControles();
  render();
}

function ligarEventos() {
  $('segModo').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled || b.dataset.modo === EST.modo) return;
    const modo = b.dataset.modo as Modo;
    // Mês e divergências compartilham a chave (AAAA-MM): mantém o mês escolhido quando dá.
    const lista = listaDe(modo);
    void trocar(modo, lista.some((x) => x.chave === EST.chave) ? EST.chave : lista[0].chave);
  });
  $('selDia').addEventListener('change', (e) => void trocar(EST.modo, (e.target as HTMLSelectElement).value));
  $('segRev').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    EST.rev = b.dataset.rev!;
    EST.aberto = null;
    renderControles();
    render();
  });
  $('selGv').addEventListener('change', (e) => {
    EST.gv = (e.target as HTMLSelectElement).value;
    EST.aberto = null;
    render();
  });
  $('selInd').addEventListener('change', (e) => {
    EST.ind = (e.target as HTMLSelectElement).value as Estado['ind'];
    render();
  });
  $('busca').addEventListener('input', (e) => {
    EST.busca = (e.target as HTMLInputElement).value;
    render();
  });
  const alternarInd = (el: HTMLElement | null) => {
    if (!el) return;
    const ind = el.dataset.ind as Indicador;
    EST.ind = EST.ind === ind ? 'todos' : ind;
    $<HTMLSelectElement>('selInd').value = EST.ind;
    render();
  };
  $('ind').addEventListener('click', (e) => alternarInd((e.target as HTMLElement).closest('.bar')));
  $('ind').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      alternarInd((e.target as HTMLElement).closest('.bar'));
    }
  });
  const abrirSetor = (tr: HTMLElement | null) => {
    if (!tr) return;
    EST.aberto = EST.aberto === tr.dataset.id ? null : tr.dataset.id!;
    render();
    if (EST.aberto) $('drawer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('tbl').addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest<HTMLElement>('th[data-k]');
    if (th) {
      const k = th.dataset.k!;
      const texto = ['setor', 'gv', 'rev', 'nb'].includes(k);
      EST.ordem = EST.ordem.k === k ? { k, d: (EST.ordem.d * -1) as 1 | -1 } : { k, d: texto ? 1 : -1 };
      render();
      return;
    }
    abrirSetor((e.target as HTMLElement).closest('tr.row'));
  });
  $('tbl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrirSetor((e.target as HTMLElement).closest('tr.row'));
  });
  $('drawer').addEventListener('click', (e) => {
    const acao = (e.target as HTMLElement).closest<HTMLElement>('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') {
      EST.aberto = null;
      render();
    } else if (acao === 'csv-setor' && EST.modo === 'div') {
      const l = divAtual().linhas.find((x) => x.s.id === EST.aberto);
      if (l) baixar(nomeArquivo(`divergencias-bees-${DIV!.mes}-${l.s.revenda}-setor-${l.s.setor}`) + '.csv', csvDiv([l]));
    } else if (acao === 'csv-setor') {
      const s = F!.setores.find((x) => x.id === EST.aberto);
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')!;
      if (s) void baixarCsvPdv([s], nomeArquivo(`tasks-pdv-${F!.tipo}-${F!.chave}-${s.revenda}-setor-${s.setor}`) + '.csv', b);
    } else if (acao === 'link') {
      void copiar(location.href, 'Link do setor copiado. Envie para o RN.');
    }
  });
  $('segSit').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.dataset.sit === EST.sit) return;
    EST.sit = b.dataset.sit as Situacao;
    render();
  });
  $('bCsv').addEventListener('click', () =>
    EST.modo === 'div'
      ? baixar(`divergencias-bees-${DIV!.mes}-por-setor.csv`, tabelaDivTexto(';'))
      : baixar(`tasks-compra-${F!.tipo}-${F!.chave}.csv`, tabelaTexto(';')),
  );
  $('bCsvPdv').addEventListener('click', (e) => {
    if (EST.modo === 'div') {
      const res = divAtual();
      if (!res.linhas.length) return toast('Nenhuma divergência com esses filtros.');
      const rev = EST.rev === 'todas' ? 'todas-revendas' : EST.rev;
      baixar(nomeArquivo(`divergencias-bees-${DIV!.mes}-${rev}-${EST.sit}`) + '.csv', csvDiv(res.linhas));
      return toast(`${fmt(res.tot.total)} tarefas exportadas.`);
    }
    const setores = calcular(F!, EST).linhas.map((l) => l.s);
    if (!setores.length) return toast('Nenhum setor com esses filtros.');
    const rev = EST.rev === 'todas' ? 'todas-revendas' : EST.rev;
    void baixarCsvPdv(setores, nomeArquivo(`tasks-pdv-${F!.tipo}-${F!.chave}-${rev}`) + '.csv', e.currentTarget as HTMLButtonElement);
  });
  $('bCopy').addEventListener('click', () =>
    void copiar(EST.modo === 'div' ? tabelaDivTexto('\t') : tabelaTexto('\t'), 'Tabela copiada. Cole no Excel.'),
  );
  $('bRules').addEventListener('click', () => {
    const c = $('rulesCard');
    c.hidden = !c.hidden;
    if (!c.hidden) c.scrollIntoView({ behavior: 'smooth' });
  });
}

// ---------- início ----------
async function iniciar() {
  try {
    INDICE = await buscarJson<Indice>('data/index.json');
    INDICE.dias ??= [];
    INDICE.meses ??= [];
    if (!INDICE.dias.length && !INDICE.meses.length) throw new Error('Nenhum fechamento publicado ainda.');
    if (!listaDoModo().length) EST.modo = INDICE.dias.length ? 'dia' : 'mes';
    if (!listaDoModo().some((d) => d.chave === EST.chave)) EST.chave = listaDoModo()[0].chave;
    await carregar(EST.modo, EST.chave);
    renderControles();
    ligarEventos();
    render();
    if (EST.aberto) $('drawer').scrollIntoView({ block: 'start' });
  } catch (e) {
    const aviso = $('aviso');
    aviso.hidden = false;
    aviso.className = 'aviso erro';
    aviso.textContent = `Não foi possível carregar o fechamento (${(e as Error).message}). Tente de novo em alguns minutos ou avise o analista responsável.`;
    $('src').textContent = 'Sem dados';
  }
}
void iniciar();
