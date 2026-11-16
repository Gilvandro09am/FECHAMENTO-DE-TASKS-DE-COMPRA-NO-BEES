/** Exportação "CSV por PDV": uma linha por tarefa, com o texto da tarefa e as compras que a comprovam. */
import { INDICADORES, PROVA_ORIGEM, STATUS_NOME, type DetalheSetor, type Fechamento, type SetorFechamento } from '../shared/modelo';

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesBr = (chave: string) => `${MESES[+chave.slice(5, 7) - 1]}/${chave.slice(0, 4)}`;

export const CAB_PDV = [
  'Fechamento', 'Revenda', 'UNB', 'GV', 'Setor', 'NB do setor', 'RN do pedido', 'Cód. PDV', 'PDV', 'Data visita',
  'Indicador', 'Mensal/Diária', 'Texto da tarefa', 'Status', 'Progresso', 'Validada no BEES em',
  'Produtos que comprovam', 'Cód. produtos', 'Caixas', 'Valor R$', 'Pedidos', 'Notas fiscais', 'Datas', 'Origem',
];

/** Linhas do CSV de um setor. `filtroInd` = índice do indicador, ou -1 para todos. */
export function linhasPdv(f: Pick<Fechamento, 'tipo' | 'chave' | 'dia'>, s: SetorFechamento, det: DetalheSetor, filtroInd = -1): string[][] {
  const nomes = STATUS_NOME[f.tipo];
  const quando = f.tipo === 'mes' ? mesBr(f.chave) : dataBr(f.dia);
  const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(' | ');
  const out: string[][] = [];
  for (const p of det.pdvs)
    for (const [st, ind, md, txt, prog, provas, valid] of p.tarefas) {
      if (filtroInd >= 0 && ind !== filtroInd) continue;
      const its = provas.map((i) => p.itens[i]).filter(Boolean);
      out.push([
        quando, s.revenda, s.unb, s.gv, s.setor, s.nb, p.rn, p.pdv, p.nome, dataBr(p.visita),
        INDICADORES[ind], md === 'M' ? 'Mensal' : 'Diária', det.textos[txt], nomes[st], st === 'X' ? '' : prog, dataBr(valid),
        its.map((it) => it[1]).join(' | '),
        its.map((it) => it[0]).join(' | '),
        its.length ? num(its.reduce((a, it) => a + it[2], 0)) : '',
        its.length ? num(its.reduce((a, it) => a + it[3], 0)) : '',
        unicos(its.map((it) => it[4])),
        unicos(its.map((it) => it[5])),
        unicos(its.map((it) => dataBr(it[6]))),
        unicos(its.map((it) => PROVA_ORIGEM[it[8]])),
      ]);
    }
  return out;
}

/** CSV com ";" (Excel em português). Campos com ";", aspas ou quebra de linha vão entre aspas. */
export const csvTexto = (linhas: string[][]) =>
  linhas.map((l) => l.map((v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';')).join('\n');
