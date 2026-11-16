/**
 * Converte as linhas brutas dos exports (objetos chaveados pelo cabeçalho) nos tipos do motor.
 * Não depende de biblioteca de planilha: quem lê o arquivo entrega as linhas prontas.
 */
import type { Cesta, ItemPedido, Tarefa } from './tipos';
import { cod, iso, norm, num } from './texto';

type Linha = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

export const COLUNAS_PEDIDOS = [
  'Cód. cliente',
  'Cód. produto',
  'Desc. produto',
  'Quant. venda',
  'Valor líquido item',
  'Data entrada',
  'Cód. unidade venda',
  'Situação pedido',
  'Desc. tipo movimento',
];
export const COLUNAS_TAREFAS = [
  'Pdv',
  'Setor',
  'GV',
  'Unb',
  'Cluster Primário',
  'Categoria',
  'Texto da Tarefa',
  'Effectiveness Result',
  'QTD Solicitada',
  'QTD Já Comprada',
];

export const COLUNAS_FATURADOS = [
  'Empresa',
  'Filial',
  'Operacao .',
  'Dt. Operacao',
  'Emissao',
  'Status',
  'Cliente',
  'Produto',
  'Descrição',
  'Qtde',
  'Total',
  'Setor',
  'Data Captura Pedido',
];

/** Lista as colunas obrigatórias que faltam no arquivo. */
export function colunasFaltando(linha: Linha | undefined, obrigatorias: string[]): string[] {
  if (!linha) return obrigatorias;
  return obrigatorias.filter((c) => !(c in linha));
}

/** Cesta: linhas [código, nome cesta, nome produto, fornecedor marketplace]. */
export function lerCesta(linhas: unknown[][]): Cesta {
  const m: Cesta = {};
  for (const r of linhas) {
    const c = cod(r[0]);
    if (!c) continue;
    m[c] ??= { c: new Set(), f: '', n: txt(r[2]) };
    if (r[1]) m[c].c.add(txt(r[1]).trim());
    if (r[3] && !m[c].f) m[c].f = norm(r[3]);
  }
  return m;
}

export function lerPedidos(linhas: Linha[], cesta: Cesta): ItemPedido[] {
  return linhas.map((r) => {
    const codigo = cod(r['Cód. produto']);
    const cs = cesta[codigo];
    return {
      unb: cod(r['Cód. unidade venda']),
      unidade: txt(r['Desc. unidade venda']),
      pdv: cod(r['Cód. cliente']),
      nome: txt(r['Nome fantasia']) || txt(r['Nome cliente']),
      pedido: txt(r['Número pedido']),
      dataEntrada: iso(r['Data entrada']),
      situacao: txt(r['Situação pedido']),
      mov: txt(r['Desc. tipo movimento']),
      canal: txt(r['Tipo canal origem']),
      tipoItem: txt(r['Tipo item']),
      cod: codigo,
      d: norm(r['Desc. produto']),
      qty: num(r['Quant. venda']),
      valor: num(r['Valor líquido item']),
      setor: cod(r['Cód. setor']),
      vendedor: txt(r['Nome vendedor']),
      c: cs?.c ?? new Set<string>(),
      f: cs?.f ?? '',
    };
  });
}

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
/** "Nov/26" → "2026-11" ('' se não reconhecer). */
export function mesAno(v: unknown): string {
  const m = norm(v).match(/^([A-Z]{3})\/(\d{2})$/);
  const i = m ? MESES_ABREV.indexOf(m[1]) : -1;
  return i >= 0 ? `20${m![2]}-${String(i + 1).padStart(2, '0')}` : '';
}

export function lerTarefas(linhas: Linha[]): Tarefa[] {
  const out: Tarefa[] = [];
  for (const r of linhas) {
    if (!r['Pdv'] || !r['Setor']) continue;
    out.push({
      op: txt(r['Operação']),
      unb: cod(r['Unb']),
      setor: cod(r['Setor']),
      gv: cod(r['GV']),
      pdv: cod(r['Pdv']),
      visita: iso(r['Data Visita']),
      tipoMD: /MONTHLY/.test(txt(r['Mensal/ Diária'])) ? 'Mensal' : 'Diária',
      mes: mesAno(r['Mês/ Ano']),
      conclusao: iso(r['Data Conclusão Tarefa']),
      cluster: txt(r['Cluster Primário']),
      sec: txt(r['Cluster Secundário']),
      cat: txt(r['Categoria']),
      status: txt(r['Effectiveness Result']),
      solicitada: num(r['QTD Solicitada']),
      ja: num(r['QTD Já Comprada']),
      texto: txt(r['Texto da Tarefa']),
    });
  }
  return out;
}

export interface OpcoesFaturados {
  /** "Empresa/Filial" do Promax → código UNB do BEES. Filiais fora do mapa são ignoradas. */
  filialUnb: Record<string, string>;
  /** Status de nota que contam (A = acertada/entregue, E = emitida/em rota). C e D nunca contam. */
  status: string[];
  /** Códigos de operação que são venda (sem zeros à esquerda). */
  operacoes: string[];
}

/**
 * Notas faturadas (export de notas do Promax) → itens no mesmo formato do pedido.
 * A descrição do Promax vem cortada em 20 letras: o nome completo sai da cesta pelo código do produto.
 */
export function lerFaturados(linhas: Linha[], cesta: Cesta, opts: OpcoesFaturados): ItemPedido[] {
  const out: ItemPedido[] = [];
  for (const r of linhas) {
    const unb = opts.filialUnb[`${txt(r['Empresa']).trim()}/${txt(r['Filial']).trim()}`];
    if (!unb) continue;
    const status = txt(r['Status']).trim();
    if (!opts.status.includes(status)) continue;
    if (!opts.operacoes.includes(cod(r['Operacao .']))) continue;
    const codigo = cod(r['Produto']);
    const cs = cesta[codigo];
    out.push({
      unb,
      unidade: '',
      pdv: cod(r['Cliente']),
      nome: txt(r['Nome']).trim(),
      pedido: txt(r['Nr. Pedido']).trim().replace(/^0+(?=\d)/, ''),
      dataEntrada: iso(r['Data Captura Pedido']),
      // Data de entrega da nota (coluna "Emissao" do Promax): é ela que define o mês.
      dataFat: iso(r['Emissao']),
      nota: txt(r['Nota']).trim().replace(/^0+(?=\d)/, ''),
      situacao: status,
      op: cod(r['Operacao .']),
      mov: 'VENDA',
      canal: txt(r['Origem do Pedido']).trim(),
      tipoItem: 'REGULAR',
      cod: codigo,
      d: norm(cs?.n || r['Descrição']),
      qty: num(r['Qtde']),
      valor: num(r['Total']),
      setor: cod(r['Setor']),
      vendedor: '',
      c: cs?.c ?? new Set<string>(),
      f: cs?.f ?? '',
    });
  }
  return out;
}
