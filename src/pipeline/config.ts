/** Configuração da rotina de fechamento. Ajuste aqui, não no meio do código. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Revendas do painel.
 * - unb: código da unidade no BEES (coluna "Unb" das tarefas e "Cód. unidade venda" dos pedidos do dia);
 * - filial: "Empresa/Filial" da revenda no export de notas faturadas do Promax.
 * Unidades que não estão aqui (sem arquivo de tarefas) são ignoradas.
 */
export const REVENDAS = [
  { unb: '747530', nome: 'Patos', filial: '221/0003' },
  { unb: '747548', nome: 'Sumé', filial: '221/0004' },
  { unb: '1036580', nome: 'Guarabira', filial: '348/0005' },
  { unb: '487570', nome: 'Sousa', filial: '064/0001' },
  { unb: '820288', nome: 'Itaporanga', filial: '064/0002' },
  { unb: '1044303', nome: 'Brumado', filial: '361/0006' },
  { unb: '1044591', nome: 'Barra da Estiva', filial: '361/0007' },
  { unb: '1045180', nome: 'Caculé', filial: '361/0008' },
];

export const CONFIG = {
  /** Onde o analista coloca os exports do dia. */
  pastaEntrada: path.join(raiz, 'entrada'),
  /** Cópia da última cesta usada, para não precisar enviar todo dia. */
  pastaBase: path.join(raiz, 'base'),
  /** Saída lida pelo painel. */
  pastaDados: path.join(raiz, 'public', 'data'),
  /** Conta pedidos BLOQUEADO (crédito) como venda do dia. */
  incluirBloqueados: true,
  /**
   * Status de nota do faturado que contam como compra no mês.
   * A = acertada (entregue e prestada conta) · E = emitida (saiu para entrega) · D = devolvida · C = cancelada.
   */
  statusFaturado: ['A', 'E'],
  /** Operações do faturado que validam tarefas: 1 = venda, 2 = bonificação. 5, 9, 108 etc. ficam de fora. */
  operacoesVenda: ['1', '2'],
  /** Quantos fechamentos do dia manter publicados (os mais antigos saem do índice e da pasta). */
  diasNoHistorico: 62,
  /** Quantos fechamentos de mês manter publicados. */
  mesesNoHistorico: 12,
  /**
   * Divergências: tarefa aberta no BEES cuja nota foi entregue há pelo menos estes dias (contados até a última
   * validação que o export do BEES traz) é "atrasada" — já deveria estar validada.
   */
  toleranciaDivergenciaDias: 2,
};
