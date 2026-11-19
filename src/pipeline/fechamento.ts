/**
 * Rotina de fechamento.
 *
 *   npm run fechamento                      → vespertina (dia mais recente dos pedidos) + mês (faturado)
 *   npm run fechamento -- --dia 2026-11-04  → força o dia da vespertina
 *   npm run fechamento -- --so-dia          → só a vespertina
 *   npm run fechamento -- --so-mes          → só o mês
 *   npm run fechamento -- --sem-bloqueados  → ignora pedidos bloqueados na vespertina
 *
 * Lê entrada/, cruza pedidos/notas x tarefas x cesta e grava public/data/dias/AAAA-MM-DD.json
 * e public/data/meses/AAAA-MM.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  avaliar,
  avaliarMes,
  cadastroDosItens,
  colunasFaltando,
  COLUNAS_FATURADOS,
  COLUNAS_PEDIDOS,
  COLUNAS_TAREFAS,
  chaveTarefa,
  indicador,
  interpretarTarefa,
  itemConta,
  itemContaMes,
  lerCesta,
  lerFaturados,
  lerPedidos,
  lerTarefas,
  lerCsvDesafios,
  montarDesafios,
  NOME_DESAFIO,
  TIPOS_DESAFIO,
  montarDivergencias,
  montarFechamento,
  NAO_RECONHECIDA,
  type Cadastro,
  type Cesta,
  type ItemPedido,
  type Resultado,
  type Tarefa,
} from '../engine';
import {
  C_FEITAS,
  C_PARCIAIS,
  C_VALIDADAS,
  INDICADORES,
  NOME_CURTO,
  VERSAO_MODELO,
  arquivoSetor,
  type DetalheSetor,
  type Fechamento,
  type Indice,
  type IndiceDia,
  type PdvFechamento,
} from '../shared/modelo';
import { acharArquivo, acharArquivos, classificarCsvs, lerCsv, lerCsvGrande, lerPlanilha, lerPlanilhaMatriz } from './arquivos';
import { CONFIG, REVENDAS } from './config';

class ErroFechamento extends Error {}

const cor = {
  ok: (s: string) => `\x1b[32m${s}\x1b[0m`,
  aviso: (s: string) => `\x1b[33m${s}\x1b[0m`,
  erro: (s: string) => `\x1b[31m${s}\x1b[0m`,
  forte: (s: string) => `\x1b[1m${s}\x1b[0m`,
};
const fmt = (n: number) => n.toLocaleString('pt-BR');
const dataBr = (d: string) => d.split('-').reverse().join('/');
const NOME_REVENDA = Object.fromEntries(REVENDAS.map((r) => [r.unb, r.nome]));
const FILIAL_UNB = Object.fromEntries(REVENDAS.map((r) => [r.filial, r.unb]));

function argumentos() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--dia');
  const dia = i >= 0 ? a[i + 1] : undefined;
  if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErroFechamento(`--dia deve ser AAAA-MM-DD (recebi "${dia}").`);
  return {
    dia,
    incluirBloqueados: a.includes('--sem-bloqueados') ? false : CONFIG.incluirBloqueados,
    fazerDia: !a.includes('--so-mes'),
    fazerMes: !a.includes('--so-dia'),
    diagnostico: a.includes('--diagnostico'),
  };
}

function exigir<T>(valor: T | null | undefined, descricao: string): T {
  if (valor == null || (Array.isArray(valor) && valor.length === 0))
    throw new ErroFechamento(`Não achei ${descricao} na pasta entrada/. Veja entrada/LEIA-ME.md.`);
  return valor;
}

// ---------------------------------------------------------------------------
// Leitura comum: cesta e tarefas
// ---------------------------------------------------------------------------
function lerCestaAtual(): { cesta: Cesta; arquivo: string } {
  let arq = acharArquivo(CONFIG.pastaEntrada, 'cesta');
  const base = path.join(CONFIG.pastaBase, 'cesta-produtos.xlsx');
  if (arq) {
    fs.mkdirSync(CONFIG.pastaBase, { recursive: true });
    fs.copyFileSync(arq, base);
  } else if (fs.existsSync(base)) {
    arq = base;
  }
  arq = exigir(arq, 'a cesta de produtos (.xlsx com "cesta" no nome)');
  const cesta = lerCesta(lerPlanilhaMatriz(arq));
  if (Object.keys(cesta).length === 0) throw new ErroFechamento('A cesta de produtos veio vazia.');
  console.log(`  Cesta     ${path.basename(arq)}${arq === base ? ' (última usada)' : ''}`);
  return { cesta, arquivo: path.basename(arq) };
}

/**
 * Export de Long Neck: as tarefas desta lista formam a cesta LN HE (um indicador só).
 * Sem o arquivo, a LN HE é reconhecida pelo texto da tarefa.
 */
function lerListaLn(): { chaves: Set<string> | null; arquivo: string | null } {
  const arq = acharArquivo(CONFIG.pastaEntrada, 'tarefasLn');
  if (!arq) {
    console.log(cor.aviso('  ! Sem o export de Long Neck (.xlsx com "LongNeck" no nome): a LN HE sai pelo texto da tarefa.'));
    return { chaves: null, arquivo: null };
  }
  const linhas = lerPlanilha(arq, 'Export');
  const falta = colunasFaltando(linhas[0], COLUNAS_TAREFAS);
  if (falta.length) throw new ErroFechamento(`Em ${path.basename(arq)} faltam as colunas: ${falta.join(', ')}.`);
  const chaves = new Set(lerTarefas(linhas).map(chaveTarefa));
  console.log(`  Tarefas LN ${path.basename(arq)}  (${fmt(chaves.size)} tarefas da cesta LN HE)`);
  return { chaves, arquivo: path.basename(arq) };
}

function lerTodasTarefas(): { tarefas: Tarefa[]; arquivos: string[] } {
  const arquivos = exigir(acharArquivos(CONFIG.pastaEntrada, 'tarefas'), 'o export de tarefas (.xlsx com "bees" no nome)');
  const listaLn = lerListaLn();
  const tarefas: Tarefa[] = [];
  const vistas = new Set<string>();
  let lnAchadas = 0;
  for (const arq of arquivos) {
    const linhas = lerPlanilha(arq, 'Export');
    const falta = colunasFaltando(linhas[0], COLUNAS_TAREFAS);
    if (falta.length) throw new ErroFechamento(`Em ${path.basename(arq)} faltam as colunas: ${falta.join(', ')}.`);
    const lidas = lerTarefas(linhas);
    if (listaLn.chaves)
      for (const t of lidas) {
        t.ln = listaLn.chaves.has(chaveTarefa(t));
        if (t.ln) lnAchadas++;
      }
    const doArquivo = lidas.filter((t) => indicador(t));
    const unbs = [...new Set(doArquivo.map((t) => t.unb))];
    // Se dois arquivos trouxerem a mesma revenda, vale o mais recente.
    const repetidas = unbs.filter((u) => vistas.has(u));
    if (repetidas.length) console.log(cor.aviso(`  ! ${path.basename(arq)} repete revenda(s) de um arquivo mais novo e foi ignorado para: ${repetidas.map((u) => NOME_REVENDA[u] ?? u).join(', ')}`));
    for (const t of doArquivo) if (!repetidas.includes(t.unb)) tarefas.push(t);
    unbs.forEach((u) => vistas.add(u));
    console.log(`  Tarefas   ${path.basename(arq)}  (${unbs.map((u) => NOME_REVENDA[u] ?? `UNB ${u} sem nome em config.ts`).join(', ')})`);
  }
  if (listaLn.chaves && lnAchadas < listaLn.chaves.size)
    console.log(
      cor.aviso(`  ! ${fmt(listaLn.chaves.size - lnAchadas)} tarefas do export de Long Neck não estão nos exports gerais (export de outro dia?).`),
    );
  const nomes = arquivos.map((a) => path.basename(a));
  return { tarefas, arquivos: listaLn.arquivo ? [...nomes, listaLn.arquivo] : nomes };
}

// ---------------------------------------------------------------------------
// Gravação e índice
// ---------------------------------------------------------------------------
function lerIndice(): Indice {
  const arq = path.join(CONFIG.pastaDados, 'index.json');
  const vazio: Indice = { versao: VERSAO_MODELO, atualizadoEm: '', dias: [], meses: [] };
  if (!fs.existsSync(arq)) return vazio;
  const i = JSON.parse(fs.readFileSync(arq, 'utf8')) as Partial<Indice>;
  // Fechamentos de versões antigas do modelo não abrem no painel novo: saem do índice e da pasta.
  if (i.versao !== VERSAO_MODELO) {
    for (const pasta of ['dias', 'meses', 'divergencias', 'desafios']) fs.rmSync(path.join(CONFIG.pastaDados, pasta), { recursive: true, force: true });
    return vazio;
  }
  return { ...vazio, ...i };
}

/** Separa o detalhe por setor (cada setor no seu arquivo) para o painel abrir rápido no celular. */
function separarDetalhe(f: Fechamento, dirDetalhe: string): Fechamento {
  fs.rmSync(dirDetalhe, { recursive: true, force: true });
  fs.mkdirSync(dirDetalhe, { recursive: true });
  const porSetor = new Map<string, PdvFechamento[]>();
  for (const p of f.pdvs) (porSetor.get(p.setorId) ?? porSetor.set(p.setorId, []).get(p.setorId)!).push(p);
  for (const [setorId, pdvs] of porSetor) {
    // Cada arquivo leva só os textos que usa, renumerados.
    const textos: string[] = [];
    const novo = new Map<number, number>();
    const idx = (i: number) => {
      let n = novo.get(i);
      if (n === undefined) {
        n = textos.length;
        textos.push(f.textos[i]);
        novo.set(i, n);
      }
      return n;
    };
    const det: DetalheSetor = {
      pdvs: pdvs.map((p) => ({ ...p, tarefas: p.tarefas.map((t) => [t[0], t[1], t[2], idx(t[3]), t[4], t[5], t[6]] as typeof t) })),
      textos,
    };
    fs.writeFileSync(path.join(dirDetalhe, `${arquivoSetor(setorId)}.json`), JSON.stringify(det));
  }
  return { ...f, pdvs: [], textos: [], detalhePorSetor: true };
}

function gravar(f: Fechamento, indice: Indice) {
  const pasta = f.tipo === 'dia' ? 'dias' : 'meses';
  const dir = path.join(CONFIG.pastaDados, pasta);
  fs.mkdirSync(dir, { recursive: true });
  const resumo = separarDetalhe(f, path.join(dir, f.chave));
  fs.writeFileSync(path.join(dir, `${f.chave}.json`), JSON.stringify(resumo));

  const lista = f.tipo === 'dia' ? indice.dias : indice.meses;
  const limite = f.tipo === 'dia' ? CONFIG.diasNoHistorico : CONFIG.mesesNoHistorico;
  const soma = (col: number) => f.setores.reduce((a, s) => a + s.ind.reduce((b, c) => b + c[col], 0), 0);
  const entrada: IndiceDia = {
    chave: f.chave,
    dia: f.dia,
    geradoEm: f.geradoEm,
    feitas: f.tipo === 'mes' ? soma(C_VALIDADAS) : soma(C_FEITAS),
    pdvComPedido: f.setores.reduce((a, s) => a + s.pdvComPedido, 0),
  };
  const nova = lista.filter((d) => d.chave !== f.chave);
  nova.push(entrada);
  nova.sort((a, b) => b.chave.localeCompare(a.chave));
  for (const velho of nova.splice(limite)) {
    fs.rmSync(path.join(dir, `${velho.chave}.json`), { force: true });
    fs.rmSync(path.join(dir, velho.chave), { recursive: true, force: true });
  }
  if (f.tipo === 'dia') indice.dias = nova;
  else indice.meses = nova;
  return path.join('public', 'data', pasta, `${f.chave}.json`);
}

// ---------------------------------------------------------------------------
// Resumo no terminal
// ---------------------------------------------------------------------------
function resumir(f: Fechamento, resultados: Resultado[]) {
  const mes = f.tipo === 'mes';
  const porRevenda = new Map<string, { feitas: number; validadas: number; parciais: number; pdvs: number }>();
  for (const s of f.setores) {
    const r = porRevenda.get(s.revenda) ?? { feitas: 0, validadas: 0, parciais: 0, pdvs: 0 };
    r.feitas += s.ind.reduce((a, c) => a + c[C_FEITAS], 0);
    r.validadas += s.ind.reduce((a, c) => a + c[C_VALIDADAS], 0);
    r.parciais += s.ind.reduce((a, c) => a + c[C_PARCIAIS], 0);
    r.pdvs += s.pdvComPedido;
    porRevenda.set(s.revenda, r);
  }
  for (const [rev, r] of porRevenda) {
    const principal = mes
      ? `${cor.ok(fmt(r.validadas).padStart(6))} validadas BEES · ${cor.aviso(fmt(r.feitas))} abertas que o faturado comprova`
      : `${cor.ok(fmt(r.feitas).padStart(5))} feitas`;
    console.log(`  ${rev.padEnd(11)} ${principal} · ${fmt(r.parciais)} parciais · ${fmt(r.pdvs)} PDVs ${mes ? 'faturados' : 'com pedido'}`);
  }
  const porInd = INDICADORES.map(
    (ind, i) => `${NOME_CURTO[ind]} ${fmt(f.setores.reduce((a, s) => a + (mes ? s.ind[i][C_VALIDADAS] : s.ind[i][C_FEITAS]), 0))}`,
  );
  console.log(`  Por indicador: ${porInd.join(' · ')}`);

  const naoReconhecidas = new Map<string, number>();
  for (const r of resultados)
    if (r.regra.alvo === NAO_RECONHECIDA && r.task.status !== 'VALID')
      naoReconhecidas.set(r.task.texto, (naoReconhecidas.get(r.task.texto) ?? 0) + 1);
  if (naoReconhecidas.size) {
    console.log(cor.aviso(`  ! ${naoReconhecidas.size} texto(s) de tarefa sem regra (ficaram como "não verificável"). Os mais frequentes:`));
    for (const [txt, n] of [...naoReconhecidas].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${fmt(n).padStart(6)}× ${txt}`);
  }
}

function avisarSemCesta(itens: ItemPedido[], origem: string) {
  const semCesta = new Set(itens.filter((o) => o.c.size === 0).map((o) => o.cod));
  if (semCesta.size)
    console.log(cor.aviso(`  ! ${semCesta.size} produto(s) ${origem} sem cesta — a cesta pode estar desatualizada.`));
}

// ---------------------------------------------------------------------------
// Vespertina (pedidos do dia)
// ---------------------------------------------------------------------------
function fechamentoDia(
  args: ReturnType<typeof argumentos>,
  tarefas: Tarefa[],
  itens: ItemPedido[],
  faturado: ItemPedido[],
  arqPedidos: string,
  base: { cesta: string; tarefas: string[] },
  cadastro: Cadastro,
  indice: Indice,
): { dia: string; resultados: Resultado[] } {
  console.log(cor.forte('\n  ▸ Vespertina — pedidos do dia'));
  avisarSemCesta(itens, 'dos pedidos');
  const unbsTarefa = new Set(tarefas.map((t) => t.unb));
  const foraDoPainel = [...new Set(itens.map((o) => o.unb))].filter((u) => !unbsTarefa.has(u));
  if (foraDoPainel.length) console.log(`  Unidades sem arquivo de tarefas (ignoradas): ${foraDoPainel.join(', ')}`);

  const porDia = new Map<string, number>();
  for (const o of itens)
    if (unbsTarefa.has(o.unb) && itemConta(o, { incluirBloqueados: args.incluirBloqueados }))
      porDia.set(o.dataEntrada, (porDia.get(o.dataEntrada) ?? 0) + 1);
  const diasOrdenados = [...porDia.keys()].filter(Boolean).sort().reverse();
  const dia = args.dia ?? diasOrdenados[0];
  if (!dia) throw new ErroFechamento('O arquivo de pedidos não tem itens de venda válidos.');
  if (!porDia.has(dia)) throw new ErroFechamento(`Não há pedidos de venda com entrada em ${dataBr(dia)} neste arquivo.`);
  console.log(`  Dia: ${cor.forte(dataBr(dia))}  (${fmt(porDia.get(dia)!)} itens de venda)`);
  const outros = diasOrdenados.filter((d) => d !== dia).slice(0, 4);
  if (outros.length) console.log(`  Outros dias no arquivo (ignorados): ${outros.map((d) => `${dataBr(d)} ${fmt(porDia.get(d)!)}`).join(' · ')}`);

  const opts = { dia, incluirBloqueados: args.incluirBloqueados, faturadoAnterior: faturado.length ? faturado : undefined };
  if (faturado.length) console.log('  Tarefas mensais: soma o faturado do mês antes do dia + o pedido do dia.');
  else console.log(cor.aviso('  ! Sem faturado: tarefas mensais usam só a "QTD Já Comprada" do BEES como acumulado.'));
  const resultados = avaliar(tarefas, itens, opts);
  const f = montarFechamento(resultados, {
    tipo: 'dia',
    chave: dia,
    dia,
    incluirBloqueados: args.incluirBloqueados,
    arquivos: { pedidos: path.basename(arqPedidos), ...base },
    revendas: NOME_REVENDA,
    cadastro,
    itensUsados: itens.filter((o) => unbsTarefa.has(o.unb) && itemConta(o, opts)),
  });
  resumir(f, resultados);
  console.log(cor.ok(`  ✔ Gravado ${gravar(f, indice)}`));
  return { dia, resultados };
}

/**
 * Desafios diários dos GVs: lê os CSVs de DesafiosDiariosGVs/ e compara a meta de tarefas de cada setor com
 * a prévia (pedidos do dia) e com as validadas no BEES no dia. Recalcula todos os dias a cada fechamento:
 * as validadas de ontem aparecem quando chega o export de tarefas de hoje.
 */
function processarDesafios(tarefas: Tarefa[], vesp: { dia: string; resultados: Resultado[] } | null, cadastro: Cadastro, indice: Indice) {
  const pasta = CONFIG.pastaDesafios;
  const csvs = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((f) => /\.csv$/i.test(f)) : [];
  if (!csvs.length) return;
  console.log(cor.forte('\n  ▸ Desafios dos GVs — meta de tarefas x real do dia'));
  const entrada = [];
  const ignoradas = new Set<string>();
  for (const arq of csvs) {
    const r = lerCsvDesafios(fs.readFileSync(path.join(pasta, arq), 'utf8'));
    entrada.push(...r.linhas);
    r.ignoradas.forEach((x) => ignoradas.add(x));
  }
  if (ignoradas.size) console.log(`  Colunas que não são de tarefa (ignoradas): ${[...ignoradas].join(' · ')}`);
  const dir = path.join(CONFIG.pastaDados, 'desafios');
  fs.mkdirSync(dir, { recursive: true });
  const lista: { chave: string; setores: number }[] = [];
  for (const dia of [...new Set(entrada.map((l) => l.dia))].sort()) {
    const d = montarDesafios(entrada, tarefas, vesp && vesp.dia === dia ? vesp.resultados : null, {
      dia,
      versao: VERSAO_MODELO,
      revendas: NOME_REVENDA,
      nb: cadastro.nb,
    });
    // Dia passado: a prévia (pedidos do dia) é a que foi calculada naquele dia.
    const arq = path.join(dir, `${dia}.json`);
    if (!d.temPrevia && fs.existsSync(arq)) {
      const antigo = JSON.parse(fs.readFileSync(arq, 'utf8')) as typeof d;
      if (antigo.temPrevia) {
        d.temPrevia = true;
        for (const s of d.setores) {
          const a = antigo.setores.find((x) => x.id === s.id);
          for (const [tipo, v] of Object.entries(s.tipos)) v.previa = a?.tipos[tipo as keyof typeof a.tipos]?.previa ?? null;
        }
      }
    }
    fs.writeFileSync(arq, JSON.stringify(d));
    lista.push({ chave: dia, setores: d.setores.length });
    const tot = TIPOS_DESAFIO.map((t) => {
      const vs = d.setores.map((s) => s.tipos[t]).filter(Boolean);
      if (!vs.length) return '';
      const meta = vs.reduce((a, v) => a + v!.meta, 0);
      const prev = vs.reduce((a, v) => a + (v!.previa ?? 0), 0);
      const val = vs.every((v) => v!.validadas != null) ? vs.reduce((a, v) => a + v!.validadas!, 0) : null;
      return `${NOME_DESAFIO[t]} ${fmt(meta)} → ${d.temPrevia ? fmt(prev) : '—'}${val != null ? ` (BEES ${fmt(val)})` : ''}`;
    }).filter(Boolean);
    console.log(`  ${dataBr(dia)} · ${d.setores.length} setores · meta → prévia (validadas BEES): ${tot.join(' · ')}`);
  }
  lista.sort((a, b) => b.chave.localeCompare(a.chave));
  for (const velho of lista.splice(CONFIG.diasNoHistorico)) fs.rmSync(path.join(dir, `${velho.chave}.json`), { force: true });
  indice.desafios = lista;
  console.log(cor.ok(`  ✔ Gravado ${path.join('public', 'data', 'desafios')}`));
}

/** Tarefas abertas no BEES que o faturado já comprova: arquivo da aba "Divergências". */
function gravarDivergencias(resultados: Resultado[], mes: string, cadastro: Cadastro, indice: Indice) {
  const tol = CONFIG.toleranciaDivergenciaDias;
  const d = montarDivergencias(resultados, { mes, tolerancia: tol, cadastro });
  const dir = path.join(CONFIG.pastaDados, 'divergencias');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${mes}.json`), JSON.stringify(d));
  const atrasadas = d.linhas.filter((l) => !l.antesVisita && l.dias >= tol).length;
  const antes = d.linhas.filter((l) => l.antesVisita).length;
  const lista = (indice.divergencias ?? []).filter((x) => x.chave !== mes);
  lista.push({ chave: mes, total: d.linhas.length, atrasadas });
  lista.sort((a, b) => b.chave.localeCompare(a.chave));
  for (const velho of lista.splice(CONFIG.mesesNoHistorico)) fs.rmSync(path.join(dir, `${velho.chave}.json`), { force: true });
  indice.divergencias = lista;

  console.log(cor.forte('\n  ▸ Divergências — abertas no BEES, mas o faturado já comprova'));
  const refs = Object.entries(d.referencia)
    .map(([unb, data]) => `${NOME_REVENDA[unb] ?? unb} ${dataBr(data)}`)
    .join(' · ');
  console.log(`  Referência (última validação no export do BEES): ${refs}`);
  console.log(
    `  ${cor.forte(fmt(d.linhas.length))} tarefas · ${cor.aviso(fmt(atrasadas))} atrasadas (pedido após a visita, entregue há ${tol}+ dias)` +
      ` · ${fmt(antes)} só com compra antes da visita`,
  );
  const porTexto = new Map<string, number>();
  for (const l of d.linhas) if (!l.antesVisita && l.dias >= tol) porTexto.set(l.texto, (porTexto.get(l.texto) ?? 0) + 1);
  const top = [...porTexto].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log('  Textos mais frequentes entre as atrasadas (confira se a regra está certa):');
    for (const [t, n] of top) console.log(`    ${String(n).padStart(5)}× ${t.slice(0, 110)}`);
  }
  console.log(cor.ok(`  ✔ Gravado ${path.join('public', 'data', 'divergencias', `${mes}.json`)}`));
}

// ---------------------------------------------------------------------------
// Mês (faturado)
// ---------------------------------------------------------------------------
function fechamentoMes(
  tarefas: Tarefa[],
  itens: ItemPedido[],
  arqFaturados: string,
  base: { cesta: string; tarefas: string[] },
  cadastro: Cadastro,
  indice: Indice,
) {
  console.log(cor.forte('\n  ▸ Mês — tarefas validadas no BEES (faturado como comprovação)'));
  avisarSemCesta(itens, 'do faturado');
  // O mês vem das tarefas ("Mês/ Ano"); sem ele, o mês com mais entregas.
  const contaMes = (lista: string[]) => {
    const n = new Map<string, number>();
    for (const m of lista) if (m) n.set(m, (n.get(m) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const mes = contaMes(tarefas.map((t) => t.mes ?? '')) ?? contaMes(itens.map((o) => (o.dataFat ?? '').slice(0, 7)));
  if (!mes) throw new ErroFechamento('O arquivo de faturados não tem notas de venda das revendas do painel.');
  const doMes = itens.filter((o) => itemContaMes(o, { mes }));
  if (!doMes.length) throw new ErroFechamento(`O faturado não tem entregas em ${mes.split('-').reverse().join('/')}.`);
  const datas = doMes.map((o) => o.dataFat!).sort();
  const ultimo = datas[datas.length - 1];
  const fora = itens.length - doMes.length;
  console.log(
    `  Mês: ${cor.forte(mes.split('-').reverse().join('/'))} · entregas de ${dataBr(datas[0])} a ${dataBr(ultimo)}` +
      ` (${fmt(doMes.length)} itens${fora ? `; ${fmt(fora)} com entrega em outro mês ignorados` : ''})`,
  );

  const resultados = avaliarMes(tarefas, itens, { mes });
  aferirComBees(tarefas, itens, mes, process.argv.includes("--diagnostico"));
  const f = montarFechamento(resultados, {
    tipo: 'mes',
    chave: mes,
    dia: ultimo,
    incluirBloqueados: false,
    arquivos: { pedidos: path.basename(arqFaturados), ...base },
    revendas: NOME_REVENDA,
    cadastro,
    itensUsados: doMes,
  });
  resumir(f, resultados);
  console.log(cor.ok(`  ✔ Gravado ${gravar(f, indice)}`));
  gravarDivergencias(resultados, mes, cadastro, indice);
}

/**
 * Aferição: as tarefas que o BEES já validou são o gabarito. Avalia essas tarefas como se estivessem abertas
 * e mostra quantas o motor também reconhece pelo faturado. Indicador abaixo de ~95% = regra a revisar.
 */
function aferirComBees(tarefas: Tarefa[], itens: ItemPedido[], mes: string, diagnostico = false) {
  const gabarito = tarefas.filter((t) => t.status === 'VALID').map((t) => ({ ...t, status: 'OPEN' }));
  if (!gabarito.length) return;
  const r = avaliarMes(gabarito, itens, { mes }).filter((x) => x.regra.tipo !== 'nv' && x.regra.fn);
  const porInd = new Map<string, { ok: number; n: number }>();
  for (const x of r) {
    const c = porInd.get(x.ind) ?? { ok: 0, n: 0 };
    c.n++;
    if (x.status === 'Feita no dia') c.ok++;
    porInd.set(x.ind, c);
  }
  const ok = r.filter((x) => x.status === 'Feita no dia').length;
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1).replace('.', ',') + '%' : '—');
  const geral = r.length ? ok / r.length : 1;
  console.log(
    `  Aferição com o BEES: o motor reconhece ${cor.forte(pct(ok, r.length))} das ${fmt(r.length)} tarefas que o BEES validou` +
      ' (as que faltam podem ter compra fora deste faturado).',
  );
  const linha = INDICADORES.filter((i) => porInd.has(i)).map((i) => {
    const c = porInd.get(i)!;
    const p = pct(c.ok, c.n);
    return `${NOME_CURTO[i]} ${c.ok / c.n < 0.95 ? cor.aviso(p) : p}`;
  });
  console.log(`    ${linha.join(' · ')}`);
  if (geral < 0.95) console.log(cor.aviso('  ! Abaixo de 95%: veja os textos de tarefa novos e ajuste src/engine/regras.ts.'));
  if (diagnostico) gravarDiagnostico(r, itens, mes);
  else if (linha.some((l) => l.includes('\x1b'))) console.log('    Para ver as tarefas que faltam: npm run fechamento -- --so-mes --diagnostico');
}

/**
 * Lista as tarefas que o BEES validou e o motor não reconhece, com o que o PDV comprou no mês.
 * Serve para achar nomenclatura nova e ajustar src/engine/regras.ts. Fica em base/ (fora do Git: tem dados de clientes).
 */
function gravarDiagnostico(r: ReturnType<typeof avaliarMes>, itens: ItemPedido[], mes: string) {
  const compras = new Map<string, Set<string>>();
  for (const o of itens) {
    if (!itemContaMes(o, { mes })) continue;
    const k = `${o.unb}|${o.pdv}`;
    if (!compras.has(k)) compras.set(k, new Set());
    compras.get(k)!.add(o.d);
  }
  const falhas = new Map<string, { ind: string; texto: string; pdvs: string[] }>();
  for (const x of r) {
    if (x.status === 'Feita no dia') continue;
    const k = `${x.ind}|${x.task.texto}`;
    const g = falhas.get(k) ?? { ind: x.ind, texto: x.task.texto, pdvs: [] };
    g.pdvs.push(`${x.task.unb}|${x.task.pdv}`);
    falhas.set(k, g);
  }
  const linhas: string[] = [`Diagnóstico da aferição — ${mes} — gerado em ${new Date().toLocaleString('pt-BR')}`, ''];
  const grupos = [...falhas.values()].sort((a, b) => a.ind.localeCompare(b.ind) || b.pdvs.length - a.pdvs.length);
  for (const g of grupos) {
    const regra = interpretarTarefa(g.texto);
    linhas.push(`[${g.ind}] ${g.pdvs.length}× ${g.texto}`, `    regra: ${regra.tipo} · alvo "${regra.alvo}"`);
    for (const pdv of g.pdvs.slice(0, 3)) {
      const c = [...(compras.get(pdv) ?? [])].sort();
      linhas.push(`    PDV ${pdv}: ${c.length ? c.slice(0, 25).join(' · ') : '(sem nota no mês)'}`);
    }
    linhas.push('');
  }
  const arq = path.join(CONFIG.pastaBase, 'diagnostico-afericao.txt');
  fs.writeFileSync(arq, linhas.join('\n'));
  console.log(`    Diagnóstico gravado em ${arq} (${fmt(grupos.length)} textos).`);
}

async function main() {
  const t0 = Date.now();
  const args = argumentos();
  console.log(cor.forte('\nFechamento — tasks de compra\n'));

  // Os .csv são reconhecidos pelo cabeçalho, não pelo nome do arquivo.
  const csvs = classificarCsvs(CONFIG.pastaEntrada);
  const arqPedidos = args.fazerDia ? csvs.pedidos : null;
  // O faturado é lido mesmo com --so-dia: a vespertina usa o acumulado do mês nas tarefas mensais.
  const arqFaturados = csvs.faturados;
  if (!csvs.pedidos && !csvs.faturados)
    throw new ErroFechamento(
      'Não achei nenhum .csv de pedidos do dia (colunas "Número pedido", "Cód. unidade venda"…) nem de faturados ' +
        '(colunas "Empresa", "Filial", "Nota"…) na pasta entrada/.',
    );

  const { cesta, arquivo: arqCesta } = lerCestaAtual();
  const { tarefas, arquivos: arqTarefas } = lerTodasTarefas();
  const base = { cesta: arqCesta, tarefas: arqTarefas };

  let itensDia: ItemPedido[] = [];
  if (arqPedidos) {
    console.log(`  Pedidos   ${path.basename(arqPedidos)}`);
    const linhas = lerCsv(arqPedidos);
    const falta = colunasFaltando(linhas[0], COLUNAS_PEDIDOS);
    if (falta.length) throw new ErroFechamento(`No arquivo de pedidos faltam as colunas: ${falta.join(', ')}.`);
    itensDia = lerPedidos(linhas, cesta);
  } else if (args.fazerDia) console.log(cor.aviso('  ! Sem arquivo de pedidos do dia: a vespertina não será gerada.'));

  let itensMes: ItemPedido[] = [];
  if (arqFaturados) {
    console.log(`  Faturados ${path.basename(arqFaturados)}  (lendo…)`);
    const linhas = await lerCsvGrande(arqFaturados, [...COLUNAS_FATURADOS, 'Nome', 'Nr. Pedido', 'Origem do Pedido', 'Nota']);
    const falta = colunasFaltando(linhas[0], COLUNAS_FATURADOS);
    if (falta.length) throw new ErroFechamento(`No arquivo de faturados faltam as colunas: ${falta.join(', ')}.`);
    itensMes = lerFaturados(linhas, cesta, { filialUnb: FILIAL_UNB, status: CONFIG.statusFaturado, operacoes: CONFIG.operacoesVenda });
  } else if (args.fazerMes) console.log(cor.aviso('  ! Sem arquivo de faturados: o painel do mês não será gerado.'));

  // NB do setor vem dos pedidos do dia (o faturado não traz vendedor); nome do PDV de qualquer um dos dois.
  const cadastro = cadastroDosItens(itensDia, itensMes);
  // Guarda o último NB conhecido de cada setor: um arquivo de pedidos parcial (só algumas revendas) não apaga os outros.
  const arqNb = path.join(CONFIG.pastaBase, 'nb-setores.json');
  const nbSalvo: Record<string, string> = fs.existsSync(arqNb) ? JSON.parse(fs.readFileSync(arqNb, 'utf8')) : {};
  cadastro.nb = { ...nbSalvo, ...cadastro.nb };
  fs.mkdirSync(CONFIG.pastaBase, { recursive: true });
  fs.writeFileSync(arqNb, JSON.stringify(cadastro.nb, null, 1));
  const indice = lerIndice();
  const vesp = arqPedidos ? fechamentoDia(args, tarefas, itensDia, itensMes, arqPedidos, base, cadastro, indice) : null;
  if (arqFaturados && args.fazerMes) fechamentoMes(tarefas, itensMes, arqFaturados, base, cadastro, indice);
  processarDesafios(tarefas, vesp, cadastro, indice);

  indice.versao = VERSAO_MODELO;
  indice.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(CONFIG.pastaDados, 'index.json'), JSON.stringify(indice, null, 2));

  console.log(cor.ok(`\n  Pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s.`));
  console.log('  Próximo passo: "npm run dev" para conferir e "npm run publicar" para enviar.\n');
}

main().catch((e) => {
  if (e instanceof ErroFechamento) {
    console.error(cor.erro(`\n  ✖ ${e.message}\n`));
    process.exit(1);
  }
  throw e;
});
