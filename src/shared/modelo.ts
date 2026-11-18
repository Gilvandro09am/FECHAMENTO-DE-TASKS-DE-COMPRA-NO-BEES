/**
 * Formato dos arquivos publicados em public/data — o contrato entre a rotina de
 * fechamento (que grava) e o painel (que lê). Mudou o formato? Suba VERSAO_MODELO.
 */
export const VERSAO_MODELO = 5;

/** dia = vespertina (pedidos digitados no dia); mes = tarefas concluídas pelo faturado do mês. */
export type TipoFechamento = 'dia' | 'mes';

/**
 * Indicadores do painel. LN HE é uma cesta só (a lista de tarefas do export de Long Neck);
 * Marketplace junta o cluster Marketplace e o Portfólio de categoria Marketplace; Volume não é acompanhado.
 */
export const INDICADORES = ['DP · Cerveja', 'DP · LN HE', 'DP · NAB', 'DP · Match', 'DP · SKU PDV', 'DP · Outras', 'Marketplace'] as const;
export type Indicador = (typeof INDICADORES)[number];

export const NOME_CURTO: Record<Indicador, string> = {
  'DP · Cerveja': 'Cerveja',
  'DP · LN HE': 'LN HE',
  'DP · NAB': 'NAB',
  'DP · Match': 'Match',
  'DP · SKU PDV': 'SKU PDV',
  'DP · Outras': 'Outras',
  Marketplace: 'Marketplace',
};

/**
 * Contagens por indicador: [feitas, parciais, abertas, já validadas, não verificáveis].
 * No dia, "abertas" = tarefas abertas nos PDVs que fizeram pedido.
 * No mês, "abertas" = todas as tarefas não validadas do setor (com ou sem faturamento).
 */
export type Contagem = [number, number, number, number, number];
export const C_FEITAS = 0,
  C_PARCIAIS = 1,
  C_ABERTAS = 2,
  C_VALIDADAS = 3,
  C_NV = 4;

export interface SetorFechamento {
  /** "unb|setor" */
  id: string;
  revenda: string;
  unb: string;
  gv: string;
  setor: string;
  /** Nome do NB/RN que mais vendeu no setor no dia. */
  nb: string;
  pdvComTarefa: number;
  pdvComPedido: number;
  /** Uma Contagem por indicador, na ordem de INDICADORES. */
  ind: Contagem[];
}

/** Status das tarefas no detalhe: F feita, P parcial, N não feita, V já validada, X não verificável. */
export type CodStatus = 'F' | 'P' | 'N' | 'V' | 'X';
export const STATUS_NOME: Record<TipoFechamento, Record<CodStatus, string>> = {
  dia: { F: 'Feita no dia', P: 'Parcial', N: 'Não feita', V: 'Já validada', X: 'Não verificável' },
  // Mês: só a validação do BEES conclui. F = aberta no BEES, mas o faturado já comprova (vai para Divergências).
  mes: { F: 'Aberta · faturado comprova', P: 'Parcial', N: 'Não feita', V: 'Validada BEES', X: 'Não verificável' },
};

/**
 * [status, índice do indicador, 'M'|'D', índice do texto em `textos`, progresso,
 *  índices em `PdvFechamento.itens` das compras que comprovam a tarefa, data de validação no BEES (AAAA-MM-DD)]
 */
export type TarefaDetalhe = [CodStatus, number, 'M' | 'D', number, string, number[], string];

/**
 * Uma compra que comprova tarefa (linhas iguais do mesmo pedido/nota somadas):
 * [código do produto, descrição, caixas, valor R$, nº do pedido, nº da nota fiscal, data, vendedor, origem]
 * Data = entrada do pedido (origem P) ou entrega da nota (origem F).
 * Origem: P = pedido do dia (vespertina) · F = nota faturada no mês.
 */
export type ItemProva = [string, string, number, number, string, string, string, string, 'P' | 'F'];
export const PROVA_ORIGEM: Record<ItemProva[8], string> = { P: 'Pedido do dia', F: 'Nota faturada' };

export interface PdvFechamento {
  setorId: string;
  pdv: string;
  nome: string;
  visita: string;
  /** Vendedor (RN) que digitou os pedidos do PDV no dia; vazio no mês (a nota não traz o vendedor). */
  rn: string;
  tarefas: TarefaDetalhe[];
  itens: ItemProva[];
}

export interface Fechamento {
  versao: number;
  tipo: TipoFechamento;
  /** Chave do fechamento: AAAA-MM-DD (dia) ou AAAA-MM (mês). */
  chave: string;
  /** Dia dos pedidos (dia) ou último dia de faturamento considerado (mês), AAAA-MM-DD. */
  dia: string;
  geradoEm: string;
  arquivos: { pedidos: string; tarefas: string[]; cesta: string };
  config: { incluirBloqueados: boolean };
  resumo: { tarefasNoEscopo: number; itensPedido: number; pedidos: number };
  setores: SetorFechamento[];
  /**
   * Detalhe por PDV. Quando `detalhePorSetor` é true, vem vazio aqui e cada setor tem seu arquivo
   * em data/<pasta>/<chave>/<unb>-<setor>.json (DetalheSetor), carregado só quando alguém abre o setor.
   */
  pdvs: PdvFechamento[];
  textos: string[];
  detalhePorSetor?: boolean;
}

export interface DetalheSetor {
  pdvs: PdvFechamento[];
  textos: string[];
}

/**
 * Operações: consolidação de revendas para o filtro do painel.
 * Revenda nova? Inclua o nome curto (o mesmo de src/pipeline/config.ts) na operação certa.
 */
export const OPERACOES: { nome: string; revendas: string[] }[] = [
  { nome: 'Bahia', revendas: ['Brumado', 'Barra da Estiva', 'Caculé'] },
  { nome: 'Patos', revendas: ['Patos', 'Sumé'] },
  { nome: 'Sousa', revendas: ['Sousa', 'Itaporanga'] },
  { nome: 'Guarabira', revendas: ['Guarabira'] },
];
export const operacaoDa = (revenda: string) => OPERACOES.find((o) => o.revendas.includes(revenda))?.nome ?? revenda;

/**
 * Chave do GV consolidada por operação: "Sousa|2" junta o GV 2 de Sousa e de Itaporanga;
 * "Bahia|2" junta Brumado e Barra da Estiva. O GV 2 de Sousa continua separado do GV 2 da Bahia.
 */
export const chaveGv = (s: { revenda: string; gv: string }) => `${operacaoDa(s.revenda)}|${s.gv}`;

/** Nome do arquivo de detalhe de um setor ("747530|403" → "747530-403"). */
export const arquivoSetor = (setorId: string) => setorId.replace('|', '-');

/**
 * Divergência: tarefa ainda ABERTA no BEES que o faturado do mês já comprova como feita.
 * É a lista para cobrar a validação (ou achar regra/cadastro errado).
 */
export interface Divergencia {
  setorId: string;
  pdv: string;
  nome: string;
  /** Índice em INDICADORES. */
  ind: number;
  md: 'M' | 'D';
  texto: string;
  /** Progresso pelo faturado (ex.: "3 / 2 cx"). */
  prog: string;
  /** Entrega da nota que completou a meta, AAAA-MM-DD. */
  quando: string;
  /** Dias entre essa entrega e a data de referência do export do BEES (negativo = entregue depois do export). */
  dias: number;
  /** Só fecha com pedidos digitados ANTES da visita da tarefa: o BEES costuma não considerar essas compras. */
  antesVisita: boolean;
  /** Data da visita da tarefa no BEES. */
  visita: string;
  itens: ItemProva[];
}

export interface ArquivoDivergencias {
  versao: number;
  /** AAAA-MM */
  mes: string;
  geradoEm: string;
  /** A partir de quantos dias depois da entrega a falta de validação é considerada atraso. */
  tolerancia: number;
  /** UNB → data de referência do export de tarefas (última validação registrada pelo BEES). */
  referencia: Record<string, string>;
  linhas: Divergencia[];
}

export interface IndiceDia {
  /** AAAA-MM-DD (dia) ou AAAA-MM (mês). */
  chave: string;
  /** Data dos pedidos / último faturamento. */
  dia: string;
  geradoEm: string;
  feitas: number;
  pdvComPedido: number;
}
export interface Indice {
  versao: number;
  atualizadoEm: string;
  dias: IndiceDia[];
  meses: IndiceDia[];
  /** Meses que têm arquivo de divergências (data/divergencias/AAAA-MM.json). */
  divergencias?: { chave: string; total: number; atrasadas: number }[];
}
