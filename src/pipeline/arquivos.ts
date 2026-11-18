/** Localiza e lê os exports da pasta de entrada (Node). */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import XLSX from 'xlsx';

export type TipoArquivo = 'pedidos' | 'faturados' | 'tarefas' | 'tarefasLn' | 'cesta';

const PADROES: Record<TipoArquivo, { ext: RegExp; nome: RegExp; exceto?: RegExp }> = {
  pedidos: { ext: /\.(csv|txt)$/i, nome: /pedido/i, exceto: /faturad/i },
  faturados: { ext: /\.(csv|txt)$/i, nome: /faturad/i },
  tarefas: { ext: /\.xlsx?$/i, nome: /bees|tarefa|task/i, exceto: /long ?neck/i },
  // Export do BEES só com as tarefas de Long Neck acompanhadas (cesta LN HE), ex.: fLongNeck202611.xlsx.
  tarefasLn: { ext: /\.xlsx?$/i, nome: /long ?neck/i },
  cesta: { ext: /\.xlsx?$/i, nome: /cesta/i },
};

/** Todos os arquivos do tipo na pasta, do mais recente para o mais antigo. */
export function acharArquivos(pasta: string, tipo: TipoArquivo): string[] {
  if (!fs.existsSync(pasta)) return [];
  const { ext, nome, exceto } = PADROES[tipo];
  return fs
    .readdirSync(pasta)
    .filter((f) => ext.test(f) && nome.test(f) && !(exceto && exceto.test(f)) && !f.startsWith('~$'))
    .map((f) => path.join(pasta, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/** Arquivo mais recente do tipo na pasta, ou null. */
export function acharArquivo(pasta: string, tipo: TipoArquivo): string | null {
  return acharArquivos(pasta, tipo)[0] ?? null;
}

/** Primeira linha do arquivo (cabeçalho), sem ler o arquivo inteiro. */
function cabecalho(arquivo: string): string {
  const buf = Buffer.alloc(16384);
  const fd = fs.openSync(arquivo, 'r');
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return buf.subarray(0, n).toString('latin1').split(/\r?\n/)[0];
}

/**
 * Separa os .csv da pasta pelo cabeçalho (o nome do arquivo pode ser qualquer um):
 * - pedidos do dia (Cora): têm "Cód. unidade venda" e "Data entrada";
 * - faturados (notas do Promax): começam com "Empresa;Filial" e têm "Nota".
 * Se houver mais de um do mesmo tipo, vale o mais recente.
 */
export function classificarCsvs(pasta: string): { pedidos: string | null; faturados: string | null } {
  const out = { pedidos: null as string | null, faturados: null as string | null };
  if (!fs.existsSync(pasta)) return out;
  const csvs = fs
    .readdirSync(pasta)
    .filter((f) => /\.(csv|txt)$/i.test(f) && !f.startsWith('~$'))
    .map((f) => path.join(pasta, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const arq of csvs) {
    const cab = cabecalho(arq);
    if (!out.faturados && /^\W*Empresa;Filial;/.test(cab) && /;Nota;/.test(cab)) out.faturados = arq;
    else if (!out.pedidos && /unidade venda/.test(cab) && /Data entrada/.test(cab)) out.pedidos = arq;
  }
  return out;
}

/** Decodifica UTF-8; se vier com caracteres inválidos, tenta Windows-1252 (export antigo do Promax). */
function decodificar(buf: Buffer): string {
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t.replace(/^﻿/, '');
}

/** CSV separado por ";" → linhas como objetos chaveados pelo cabeçalho (valores em texto). */
export function lerCsv(arquivo: string): Record<string, unknown>[] {
  const wb = XLSX.read(decodificar(fs.readFileSync(arquivo)), { type: 'string', FS: ';', raw: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
}

/** Colunas que o Promax omite nas notas que ainda não estão num mapa de carga (linha fica 2 colunas menor). */
const COLUNAS_SEM_MAPA = ['Capacidade Carga Veículo', 'Peso Bruto Mapa'];

/**
 * CSV grande separado por ";" (export de notas do Promax, centenas de MB), lido linha a linha.
 * Devolve só as colunas pedidas, para caber na memória.
 */
export async function lerCsvGrande(arquivo: string, colunas: string[]): Promise<Record<string, string>[]> {
  const amostra = Buffer.alloc(65536);
  const fd = fs.openSync(arquivo, 'r');
  const lidos = fs.readSync(fd, amostra, 0, amostra.length, 0);
  fs.closeSync(fd);
  const utf8 = !new TextDecoder('utf-8').decode(amostra.subarray(0, Math.max(0, lidos - 4))).includes('�');

  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, { encoding: utf8 ? 'utf8' : 'latin1' }), crlfDelay: Infinity });
  let idx: number[] | null = null;
  let idxCurto: number[] = [];
  let largura = 0;
  const out: Record<string, string>[] = [];
  for await (const linha of rl) {
    if (!linha.trim()) continue;
    const cols = linha.split(';');
    if (!idx) {
      const cab = cols.map((c) => c.replace(/^﻿/, '').trim());
      largura = cab.length;
      idx = colunas.map((c) => cab.indexOf(c));
      const curto = cab.filter((c) => !COLUNAS_SEM_MAPA.includes(c));
      idxCurto = colunas.map((c) => curto.indexOf(c));
      continue;
    }
    const mapa = cols.length === largura - COLUNAS_SEM_MAPA.length ? idxCurto : idx;
    const r: Record<string, string> = {};
    colunas.forEach((c, i) => {
      if (mapa[i] >= 0) r[c] = (cols[mapa[i]] ?? '').trim();
    });
    out.push(r);
  }
  return out;
}

/** Planilha → objetos (aba preferida, se existir). Datas saem como número serial do Excel. */
export function lerPlanilha(arquivo: string, aba?: string): Record<string, unknown>[] {
  const wb = XLSX.read(fs.readFileSync(arquivo), { type: 'buffer' });
  const sh = (aba && wb.Sheets[aba]) || wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh, { defval: '' });
}

/** Planilha → matriz (sem cabeçalho). */
export function lerPlanilhaMatriz(arquivo: string): unknown[][] {
  const wb = XLSX.read(fs.readFileSync(arquivo), { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  return linhas.slice(1);
}
