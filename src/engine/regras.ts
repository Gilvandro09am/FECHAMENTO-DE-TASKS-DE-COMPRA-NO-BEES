/**
 * Regras que traduzem o TEXTO da tarefa BEES em um teste sobre os itens do pedido.
 *
 * Para ajustar uma equivalência (ex.: um novo SKU ou uma nova cesta), mexa nas tabelas
 * MARCAS, EMBALAGENS, GRUPOS ou FORNECEDORES abaixo e rode `npm test`.
 */
import type { Indicador, Predicado, Regra, Tarefa } from './tipos';
import { norm } from './texto';

/** Nomes de cesta (arquivo Cesta de Produtos) que as regras consultam. */
export const CESTAS_USADAS = [
  'Cerveja TT',
  'Cerveja S/Match',
  'NAB TT',
  'MATCH TT',
  'Marketplace TT',
  'H2OH - Familia',
  'Cerveja RGB',
  'High End',
  'Core Plus',
  'Cerveja Zero Alcool',
  'Refri Zero',
  'Multipack Cerveja',
  'Gatorade - Familia',
  'Red Bull - Familia',
  'Minalba - Industria',
  'Mondelez - Industria',
  'Diageo - Industria',
  'Cerveja 600',
  'Cerveja 300',
  'LN HE FOCO',
  'Cerveja Litro',
] as const;

// ---------------------------------------------------------------------------
// Marcas: nome usado na tarefa → [descrição do produto começa com, exceto se contém]
// A ordem importa: variações mais específicas (ZERO, PURE GOLD…) vêm antes da marca-mãe.
// ---------------------------------------------------------------------------
const SKOL_EXCETO = /BEATS|PURO MALTE|ZERO|HOPS|ULTRA|360/;
export const MARCAS: [string, RegExp, RegExp | null][] = [
  ['SKOL PILSEN', /^SKOL\b/, SKOL_EXCETO],
  ['SKOL ZERO', /^SKOL ZERO/, null],
  ['SKOL', /^SKOL\b/, SKOL_EXCETO],
  ['BRAHMA MALZBIER', /MALZBIER/, null],
  ['BRAHMA CHOPP ZERO', /^BRAHMA CHOPP ZERO/, null],
  ['BRAHMA CHOPP', /^BRAHMA CHOPP\b/, /ZERO|DUPLO|MALZBIER/],
  ['BUDWEISER ZERO', /^BUDWEISER ZERO/, null],
  ['BUDWEISER', /^BUDWEISER\b/, /ZERO/],
  ['STELLA ARTOIS PURE GOLD', /^STELLA ARTOIS PURE GOLD|^STELLA PURE GOLD/, null],
  ['STELLA ARTOIS', /^STELLA ARTOIS\b/, /PURE GOLD/],
  ['ORIGINAL', /^ORIGINAL\b/, null],
  ['CORONA CERO', /^CORONA CERO/, null],
  ['CORONA EXTRA', /^CORONA EXTRA/, null],
  ['CORONA', /^CORONA EXTRA|^CORONA\b/, /CERO/],
  ['SPATEN', /^SPATEN\b/, null],
  ['MICHELOB ULTRA', /^MICHELOB ULTRA/, null],
  ['ANTARCTICA PILSEN', /^ANTARCTICA PILSEN/, null],
  ['CARACU', /^CARACU\b/, null],
  // No cadastro, o Guaraná Zero aparece como "GUARANA CHP ANTARCTICA DIET".
  ['GUARANA ANTARCTICA ZERO', /^GUARANA (CHP )?ANTARCTICA (ZERO|DIET)/, null],
  // O BEES valida a tarefa do Guaraná normal também com o Zero/Diet do mesmo tamanho (o contrário não).
  ['GUARANA ANTARCTICA', /^GUARANA (CHP )?ANTARCTICA/, null],
  ['SODA ZERO', /^SODA LIMONADA ANTARCTICA (ZERO|DIET)/, null],
  ['SODA ANTARCTICA ZERO', /^SODA LIMONADA ANTARCTICA (ZERO|DIET)/, null],
  ['SODA ANTARCTICA', /^SODA LIMONADA ANTARCTICA/, /ZERO|DIET/],
  ['SODA', /^SODA LIMONADA ANTARCTICA/, /ZERO|DIET/],
  // Pepsi Black = Pepsi Zero no cadastro.
  ['PEPSI BLACK', /^PEPSI (BLACK|ZERO)/, null],
  ['PEPSI TWIST', /^PEPSI TWIST/, null],
  ['PEPSI', /^PEPSI\b/, /BLACK|ZERO|TWIST|LIGHT/],
  ['GATORADE', /^GATORADE/, null],
  ['RED BULL', /^RED BULL/, null],
  ['H2OH', /^H2OH/, null],
  ['BEATS PINK LEMONADE', /BEATS PINK LEMONADE/, null],
];

/**
 * Long neck: "LONG NECK", "LN" ou garrafa one way pequena ("BUDWEISER OW 330ML", "CORONITA OW 210ML"),
 * como o BEES valida. Garrafa one way de 600 ml / 1 L não é long neck.
 */
export const ehLN = (d: string) =>
  /LONG NECK|\bLN\b|\bL N\b/.test(d) || (/\b(OW|ONE WAY)\b/.test(d) && /\b(2\d\d|3[0-5]\d) ?ML/.test(d) && !/\b(LT|LATA)\b/.test(d));
const ehMulti = (d: string) => /MULTI?PACK/.test(d);
const ehLata = (d: string) => /\b(LATA|LT)\b/.test(d);
const garrafa300 = (d: string) => /\b300 ?ML\b/.test(d) && !ehLN(d) && !ehLata(d);
/** Inteira = garrafa de 600 ml, retornável ou one way (o BEES valida as duas). */
const garrafa600 = (d: string) => /\b600 ?ML\b/.test(d) && !/\b(LATA|LT|PET)\b/.test(d);

/** Embalagem citada na tarefa → teste na descrição do produto. */
export const EMBALAGENS: [string, (d: string) => boolean][] = [
  ['LATA 350 MULTPACK', (d) => ehLata(d) && /\b35[05] ?ML/.test(d) && ehMulti(d)],
  ['LATA 473 MULTPACK', (d) => ehLata(d) && /\b473 ?ML/.test(d) && ehMulti(d)],
  // A lata "comum" aceita também a versão multipack: o BEES valida "SKOL PILSEN LATA 350" com
  // "SKOL LATA 350ML SH C/12 NPAL MULTIPACK". Já a tarefa "... MULTPACK" exige o multipack.
  ['LATA 350', (d) => ehLata(d) && /\b35[05] ?ML/.test(d)],
  ['LATA 473', (d) => ehLata(d) && /\b473 ?ML/.test(d)],
  ['LATA 269', (d) => ehLata(d) && /\b269 ?ML/.test(d)],
  ['LATA', ehLata],
  ['LITRINHO', garrafa300],
  ['GFA300 CX23', garrafa300],
  ['GFA600 DZ24', garrafa600],
  ['GFA600 CX12', garrafa600],
  ['INTEIRA', garrafa600],
  ['LITRO', (d) => /\b(1 ?L|1000 ?ML)\b/.test(d) && !/PET/.test(d)],
  ['LONG NECK 330', ehLN],
  ['LONG NECK 355', ehLN],
  ['LONG NECK 275', ehLN],
  ['LONG NECK 269', ehLN],
  ['LONG NECK', ehLN],
  ['PET 2.5L', (d) => /PET/.test(d) && /\b2[,.]5 ?L/.test(d)],
  ['PET 1.5L', (d) => /PET/.test(d) && /\b1[,.]5 ?L?\b/.test(d)],
  ['PET 2L', (d) => /PET/.test(d) && /\b2 ?L\b/.test(d) && !/2[,.]5/.test(d)],
  ['2L', (d) => /PET/.test(d) && /\b2 ?L\b/.test(d) && !/2[,.]5/.test(d)],
  ['PET 1L', (d) => /PET/.test(d) && /\b1 ?L\b/.test(d) && !/1[,.]5/.test(d)],
  ['PET 200ML', (d) => /PET/.test(d) && /\b200 ?ML/.test(d)],
  ['PET 500ML', (d) => /PET/.test(d) && /\b500 ?ML/.test(d)],
];

interface Alvo {
  label: string;
  fn: Predicado;
}

/** "SKOL PILSEN LATA 350" → teste de marca + embalagem. */
export function alvoSku(nome: string): Alvo | null {
  const n = norm(nome).replace(/\.$/, '');
  for (const [marca, inclui, exclui] of MARCAS) {
    if (n !== marca && !n.startsWith(marca + ' ')) continue;
    const resto = n.slice(marca.length).trim();
    const emb = resto ? EMBALAGENS.find((e) => e[0] === resto) : undefined;
    if (resto && !emb) return null;
    return {
      label: n,
      fn: (p) => inclui.test(p.d) && !(exclui && exclui.test(p.d)) && (!emb || emb[1](p.d)),
    };
  }
  return null;
}

const naCesta =
  (nome: string): Predicado =>
  (p) =>
    p.c.has(nome);
/** LN High End: long neck de Corona (Extra e Cero), Michelob Ultra, Stella Artois e Stella Pure Gold. */
const LN_HIGH_END: Predicado = (p) => ehLN(p.d) && /^(STELLA|CORONA|MICHELOB)/.test(p.d);
/** Quando o texto da tarefa cita Spaten na lista, ela também vale. */
const LN_HIGH_END_SPATEN: Predicado = (p) => ehLN(p.d) && /^(STELLA|CORONA|MICHELOB|SPATEN)/.test(p.d);

/** Grupos citados na tarefa (CERVEJA, NAB, MATCH, +LN…) → teste. */
export function alvoGrupo(texto: string): Alvo | null {
  const g = norm(texto).replace(/\.+$/, '').replace(/ NO MES$/, '').replace(/\.+$/, '').trim();
  // "600mL (Original, Stella, Spaten, Budweiser)": garrafa do tamanho citado dessas marcas.
  const ml = g.match(/^(\d+) ?ML \(/)?.[1];
  const reMl = new RegExp(`\\b${ml ?? 'x'} ?ML`);
  const porMl: Predicado = (p) => reMl.test(p.d) && /^(ORIGINAL|STELLA|SPATEN|BUDWEISER)/.test(p.d) && !ehLN(p.d);

  const lnHe = /SPATEN/.test(g) ? LN_HIGH_END_SPATEN : LN_HIGH_END;
  const grupos: [RegExp, Predicado][] = [
    [/^\+?LN LONG NECKS HE|^HE LN/, lnHe],
    [/^LONG NECK PREMIUM/, lnHe],
    [/^CERVEJA LONG NECK HIGH END|^LONG NECK HIGH END/, lnHe],
    [/^LONG NECK ZERO/, (p) => ehLN(p.d) && p.c.has('Cerveja Zero Alcool')],
    [/^CERVEJA ZERO/, naCesta('Cerveja Zero Alcool')],
    [
      /^CERVEJA MULTPACK|^MULTIPACK DE CERVEJA/,
      (p) => p.c.has('Cerveja S/Match') && (ehMulti(p.d) || p.c.has('Multipack Cerveja')),
    ],
    // CERVEJA no BEES não inclui Match (Beats etc.), que tem categoria própria.
    [/^CERVEJA$/, naCesta('Cerveja S/Match')],
    [/^NAB$/, naCesta('NAB TT')],
    [/^MATCH/, naCesta('MATCH TT')],
    [/^MARKETPLACE/, naCesta('Marketplace TT')],
    // Família inteira só quando a tarefa cita só a marca; "H2OH PET 1.5L" cai na regra de SKU (marca + embalagem).
    [/^(H2OH|HNOH|H\dOH)$/, (p) => /^H2OH/.test(p.d)],
    [
      /^RGB|^CERVEJA RETORNAVEL/,
      (p) => p.c.has('Cerveja RGB') && !/BOHEMIA|COLORADO|PATAGONIA|GOOSE|WALS|BLUE MOON/.test(p.d),
    ],
    [/^INTEIRA/, (p) => p.c.has('Cerveja S/Match') && garrafa600(p.d)],
    [/^HE \+ CORE PLUS/, (p) => p.c.has('High End') || p.c.has('Core Plus')],
    [/^HE$/, naCesta('High End')],
    [/^REFRI ZERO/, naCesta('Refri Zero')],
    [/^GATORADE$/, (p) => /^GATORADE/.test(p.d)],
    [/^RED BULL( LATA)?$/, (p) => /^RED BULL/.test(p.d)],
    [/^\d+ ?ML \(/, porMl],
    [/^LITRINHO/, (p) => /\b300 ?ML/.test(p.d) && p.c.has('Cerveja S/Match') && !ehLN(p.d)],
    [/^MICHELOB ULTRA E STELLA PURE GOLD/, (p) => /^(MICHELOB ULTRA|STELLA ARTOIS PURE GOLD)/.test(p.d)],
  ];
  for (const [re, fn] of grupos) {
    if (re.test(g)) return { label: g, fn };
  }
  return alvoSku(g);
}

/** Indústrias de Marketplace citadas nas tarefas "qualquer SKU de …". */
export const FORNECEDORES: [RegExp, Predicado, string][] = [
  [/AGUA \(|SECAO AGUA/, (p) => p.c.has('Marketplace TT') && /\bAGUA\b/.test(p.d), 'ÁGUA'],
  [/MONDELEZ/, (p) => p.f === 'MONDELEZ' || p.c.has('Mondelez - Industria'), 'MONDELEZ'],
  [/MINALBA/, (p) => p.f === 'MINALBA' || p.c.has('Minalba - Industria'), 'MINALBA'],
  [/DIAGEO/, (p) => p.f === 'DIAGEO' || p.c.has('Diageo - Industria'), 'DIAGEO'],
  [/PERNOD/, (p) => p.f === 'PERNOD RICARD', 'PERNOD RICARD'],
  [/YPE/, (p) => p.f === 'YPE', 'YPÊ'],
  [/PITU/, (p) => p.f === 'PITU', 'PITU'],
  [/CIA MULLER/, (p) => p.f === 'CIA MULLER BEBIDAS', 'CIA MULLER'],
  [/E LEVE|ELEVE/, (p) => p.f === 'E LEVE' || /^ELEVE\b/.test(p.d), 'É LEVE'],
  [/DIAS DAVILA/, (p) => p.f === 'DIAS DAVILA', 'DIAS DAVILA'],
];

export const NAO_RECONHECIDA = 'Regra não reconhecida';

/** Lê o texto da tarefa e devolve a regra de validação. */
export function interpretarTarefa(texto: string): Regra {
  const bruto = norm(texto);
  const semTags = bruto.replace(/^(\[[^\]]*\]\s*)+/, '');
  const t = semTags
    .replace(/^[A-Z ]+: (?=AUXILIE)/, '')
    .replace(/ PARA EVITAR PERDA DE DISTRIBUICAO\.?$/, '')
    // "[ZÉ] ... cobertura de ORIGINAL LT 473ML ... do portfólio ideal." → só o produto.
    .replace(/ DO PORTFOLIO IDEAL\.?$/, '');
  let m: RegExpMatchArray | null;

  if (/\bPROATIVA\b|VALE MAIS PONTOS/.test(bruto))
    return { tipo: 'nv', alvo: 'Depende de histórico (sem compra há 2 meses / outras tarefas)' };

  if (/QUALQUER PRODUTO/.test(t)) return { tipo: 'any', alvo: 'Qualquer produto', fn: () => true };
  // "Auxilie na cobertura de qualquer SKU. PDV não comprador." → qualquer compra (sem grupo citado).
  // Tarefas de fornecedor 3P ("[3P] [AURORA] … comprar qualquer SKU") não entram: são só daquele fornecedor.
  if (/COBERTURA DE QUALQUER (SKU|ITEM)S?(\.|$)/.test(t) && !/\[3P\]/.test(bruto))
    return { tipo: 'any', alvo: 'Qualquer produto', fn: () => true };

  // "1 cx de RED BULL SABORES (SUGAR FREE, TROPICAL, ...)" → caixas de qualquer Red Bull.
  if ((m = t.match(/(\d+) CX DE RED BULL/))) return { tipo: 'qty', n: +m[1], alvo: 'RED BULL', fn: (p) => /^RED BULL/.test(p.d) };

  // "Missão de Corona Long Neck / 600ml": cobertura de Corona Extra na embalagem citada.
  if ((m = t.match(/MISSAO DE CORONA (LONG NECK|(\d+) ?ML)/))) {
    const ml = m[2];
    const reMl = new RegExp(`\\b${ml} ?ML`);
    return {
      tipo: 'any',
      alvo: ml ? `CORONA ${ml}ML` : 'CORONA LONG NECK',
      fn: (p) => /^CORONA EXTRA/.test(p.d) && (ml ? reMl.test(p.d) && !ehLN(p.d) : ehLN(p.d)),
    };
  }
  // "[Vizinhança] comprar 3 cxs de skus distintos de HE LN" → SKUs distintos do grupo.
  if ((m = t.match(/COMPRAR (\d+) CXS? DE SKUS DISTINTOS DE (.+?)\.?$/))) {
    const a = alvoGrupo(m[2]);
    if (a) return { tipo: 'sku', n: +m[1], alvo: a.label, fn: a.fn };
  }
  // "[Vizinhança] comprar 1 cx de RGB 300 ML" → caixas de retornável do tamanho citado.
  if ((m = t.match(/COMPRAR (\d+) CXS? DE RGB (\d+) ?ML/))) {
    const re = new RegExp(`\\b${m[2]} ?ML`);
    return {
      tipo: 'qty',
      n: +m[1],
      alvo: `RGB ${m[2]}ML`,
      fn: (p) => p.c.has('Cerveja RGB') && re.test(p.d) && !ehLN(p.d),
    };
  }

  if (/LN PACK/.test(t)) {
    const dentro = t.match(/\(([^)]*)\)/)?.[1] ?? t;
    const marcas: RegExp[] = [];
    if (/STELLA PURE GOLD/.test(dentro)) marcas.push(/^STELLA ARTOIS PURE GOLD/);
    if (/MICHELOB/.test(dentro)) marcas.push(/^MICHELOB ULTRA/);
    if (/CORONA CERO/.test(dentro)) marcas.push(/^CORONA CERO/);
    if (/CORONA/.test(dentro.replace(/CORONA CERO/g, ''))) marcas.push(/^CORONA EXTRA/);
    if (/BUD ZERO/.test(dentro)) marcas.push(/^BUDWEISER ZERO/);
    return {
      tipo: 'qty',
      n: 1,
      alvo: 'LN Pack: ' + dentro,
      // O BEES valida o "LN Pack" com qualquer SKU das marcas citadas (pack, caixa de LN ou lata).
      fn: (p) => marcas.some((r) => r.test(p.d)),
    };
  }

  if ((m = t.match(/COBERTURA DE (\d+|UMA) CAIXA(?:\(S\))? DE (.+?)(?: \(LATA OU LONG NECK\))?\.?$/))) {
    const a = alvoGrupo(m[2]);
    if (a) return { tipo: 'qty', n: m[1] === 'UMA' ? 1 : +m[1], alvo: a.label, fn: a.fn };
  }
  if ((m = t.match(/VENDA DE (\d+) CAIXA\(S\) DE (.+?)\.?$/))) {
    const a = alvoGrupo(m[2]);
    if (a) return { tipo: 'qty', n: +m[1], alvo: a.label, fn: a.fn };
  }
  if (
    (m = t.match(
      /(?:COMPRAR|COBERTURA(?: DE)?|VENDA DE|COMPRA DE)\s+(\d+) SKUS?(?: DISTINTOS?)? D[EA] (.+?)(?: NO MES)?(?:\. OFERTA.*)?\.?$/,
    ))
  ) {
    const nome = m[2];
    let a = alvoGrupo(nome);
    if (!a) {
      const f = FORNECEDORES.find((x) => x[0].test(nome));
      if (f) a = { label: f[2], fn: f[1] };
    }
    if (a) return { tipo: 'sku', n: +m[1], alvo: a.label, fn: a.fn };
  }
  if ((m = t.match(/(?:VENDA|COBERTURA) DE (\d+) REAIS DE (.+?)(?: NO MES)?\.?$/))) {
    const a = alvoGrupo(m[2]);
    if (a) return { tipo: 'val', n: +m[1], alvo: a.label, fn: a.fn };
  }
  if (/QUALQUER (SKU|ITEM) D[EA]|SECAO|QUALQUER SKU DA INDUSTRIA/.test(t)) {
    if (/ITEM DE MARKETPLACE/.test(t))
      return { tipo: 'any', alvo: 'MARKETPLACE', fn: naCesta('Marketplace TT'), resgate: true };
    const f = FORNECEDORES.find((x) => x[0].test(semTags));
    if (f) return { tipo: 'any', alvo: f[2], fn: f[1] };
    const mm = t.match(/QUALQUER SKU DE (.+?)\.?$/);
    const a = mm ? alvoGrupo(mm[1]) : null;
    if (a) return { tipo: 'any', alvo: a.label, fn: a.fn };
  }
  if ((m = t.match(/COBERTURA DE (MARKETPLACE|MATCH)\b/))) {
    const a = alvoGrupo(m[1]);
    if (a) return { tipo: 'any', alvo: a.label, fn: a.fn };
  }
  if ((m = t.match(/COBERTURA DE (?:QUALQUER SKU DE )?(.+?)(?:\. .*)?\.?$/))) {
    const completo = m[1].replace(/^\d+ SKU DISTINTO DE /, '').replace(/ \(.*\)$/, '');
    const s = completo.replace(/ \d+$/, '');
    // Tenta o nome com a embalagem completa ("... LATA 350") antes de versões mais genéricas.
    const a = alvoGrupo(completo) ?? alvoGrupo(s) ?? alvoGrupo(s.split(' ').slice(0, -1).join(' '));
    if (a) return { tipo: 'any', alvo: a.label, fn: a.fn };
    // A tarefa traz o nome exato do produto ("STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4"):
    // compara direto com a descrição do produto na cesta/pedido.
    const nome = m[1].replace(/^\d+ CAIXAS? DE /, '').replace(/\.$/, '');
    if (/\d+ ?(ML|L)\b/.test(nome) && nome.split(' ').length >= 4) {
      const produto = (p: { d: string }) => p.d === nome || p.d.startsWith(nome + ' ') || p.d.replace(/\s*\.$/, '') === nome;
      const n = Number(m[1].match(/^(\d+) CAIXAS? DE /)?.[1] ?? 0);
      return n ? { tipo: 'qty', n, alvo: nome, fn: produto } : { tipo: 'any', alvo: nome, fn: produto };
    }
  }
  // "comprar 2 cxs de LITRINHO DE CERVEJA" → caixas do grupo citado.
  if ((m = t.match(/COMPRAR (\d+) CXS? DE (.+?)\.?$/))) {
    const a = alvoGrupo(m[2].replace(/ DE CERVEJA$/, ''));
    if (a) return { tipo: 'qty', n: +m[1], alvo: a.label, fn: a.fn };
  }
  if ((m = t.match(/VENDA DE (.+?) LN PACK/))) {
    const a = alvoSku(m[1].replace('BUD ', 'BUDWEISER '));
    if (a) return { tipo: 'qty', n: 1, alvo: m[1] + ' LN Pack', fn: (p) => ehLN(p.d) && a.fn(p) };
  }
  return { tipo: 'nv', alvo: NAO_RECONHECIDA };
}

/** "N SKUs distintos de CERVEJA / NAB / MARKETPLACE / MATCH" — só essas nomenclaturas são SKU PDV. */
const TEXTO_SKU_PDV = /SKUS? DISTINTOS D[EA] (CERVEJA|NAB|MARKETPLACE|MATCH)(?: NO MES)?\.?$/;
/** Tarefas com "Long Neck" ou "LN" no texto. */
const TEXTO_LN = /\bLN\b|LONG NECK/;
/** LN High End: Corona (Extra/Cero/Zero), Michelob, Stella, Stella Pure Gold, ou o grupo HE/Premium. */
const TEXTO_LN_HE = /CORONA|MICHELOB|STELLA|HIGH END|\bHE\b|PREMIUM/;

/** Classifica a tarefa nos indicadores do painel. `null` = fora do escopo (Execução, Digitalização…). */
export function indicador(task: Pick<Tarefa, 'cluster' | 'cat' | 'texto'>): Indicador | null {
  const { cluster, cat } = task;
  if (cluster !== 'Desenvolvimento de Portfólio' && cluster !== 'Marketplace' && cluster !== 'Volume') return null;
  const t = norm(task.texto);
  if (cluster !== 'Volume' && TEXTO_SKU_PDV.test(t)) return 'DP · SKU PDV';
  if (cluster === 'Marketplace') return 'Marketplace';
  if (cluster === 'Volume') return 'Volume';
  if (TEXTO_LN.test(t)) return TEXTO_LN_HE.test(t) ? 'DP · LN High End' : 'DP · LN';
  if (cat === 'BEER') return 'DP · Cerveja';
  if (cat === 'NAB') return 'DP · NAB';
  if (cat === 'MATCH') return 'DP · Match';
  if (cat === 'MKTPLACE') return 'DP · Marketplace';
  return 'DP · Outras';
}
