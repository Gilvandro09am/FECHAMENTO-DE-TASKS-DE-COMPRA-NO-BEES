/** Tipos compartilhados pelo motor de regras, pela rotina de fechamento e pelo painel. */

/** Uma linha de item de pedido, já normalizada. */
export interface ItemPedido {
  unb: string;
  unidade: string;
  pdv: string;
  nome: string;
  pedido: string;
  /** Data de entrada do pedido, AAAA-MM-DD. */
  dataEntrada: string;
  situacao: string;
  /** VENDA, TROCA, BONIFICACAO, SIMPLES REMESSA… */
  mov: string;
  canal: string;
  /** REGULAR, REDEEMABLE (resgate), FREEGOOD… */
  tipoItem: string;
  cod: string;
  /** Descrição do produto normalizada (maiúsculas, sem acento). */
  d: string;
  qty: number;
  valor: number;
  setor: string;
  vendedor: string;
  /** Cestas a que o produto pertence. */
  c: Set<string>;
  /** Fornecedor de Marketplace normalizado ('' quando não é Marketplace). */
  f: string;
  /** Só no faturado: data de entrega da nota, AAAA-MM-DD. */
  dataFat?: string;
  /** Só no faturado: código da operação (1 = venda, 2 = bonificação…). */
  op?: string;
}

/** Uma tarefa do export BEES Force. */
export interface Tarefa {
  op: string;
  unb: string;
  setor: string;
  gv: string;
  pdv: string;
  visita: string;
  tipoMD: 'Mensal' | 'Diária';
  /** Mês das tarefas ("Mês/ Ano" do export), AAAA-MM. */
  mes?: string;
  /** Data em que o BEES concluiu/validou a tarefa (AAAA-MM-DD), quando houver. */
  conclusao?: string;
  cluster: string;
  sec: string;
  cat: string;
  /** OPEN ou VALID. */
  status: string;
  solicitada: number;
  ja: number;
  texto: string;
}

export interface ProdutoCesta {
  c: Set<string>;
  f: string;
  n: string;
}
export type Cesta = Record<string, ProdutoCesta>;

/** Produto mínimo que as regras olham. */
export type Produto = Pick<ItemPedido, 'd' | 'c' | 'f'>;
export type Predicado = (p: Produto) => boolean;

export type TipoRegra = 'qty' | 'sku' | 'val' | 'any' | 'nv';

export interface Regra {
  /** qty = caixas, sku = SKUs distintos, val = reais, any = qualquer compra do alvo, nv = não verificável. */
  tipo: TipoRegra;
  alvo: string;
  n?: number;
  fn?: Predicado;
  /** Aceita itens de resgate (REDEEMABLE). */
  resgate?: boolean;
}

import type { Indicador } from '../shared/modelo';
export { INDICADORES, type Indicador } from '../shared/modelo';

export type Status = 'Feita no dia' | 'Parcial' | 'Não feita' | 'Sem pedido' | 'Já validada' | 'Não verificável';

export interface Resultado {
  task: Tarefa;
  ind: Indicador;
  regra: Regra;
  comprou: boolean;
  status: Status;
  prog: number;
  meta: number;
  /** Parte do progresso que veio do faturado anterior ao dia. */
  antes?: number;
  itens: ItemPedido[];
}

export interface OpcoesMes {
  /** Mês das tarefas, AAAA-MM: só notas com entrega neste mês contam. */
  mes: string;
}

export interface OpcoesAvaliacao {
  /** Considera só pedidos com esta data de entrada (AAAA-MM-DD). Vazio = todos. */
  dia?: string | null;
  /** Conta pedidos com situação BLOQUEADO. */
  incluirBloqueados?: boolean;
  /** Notas faturadas do mês: somam ao pedido do dia nas tarefas mensais (acumulado). */
  faturadoAnterior?: ItemPedido[];
}
