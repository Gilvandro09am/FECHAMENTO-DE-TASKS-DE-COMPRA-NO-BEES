/** Transforma os resultados da avaliação no arquivo de fechamento publicado para o painel. */
import {
  C_ABERTAS,
  C_FEITAS,
  C_NV,
  C_PARCIAIS,
  C_VALIDADAS,
  INDICADORES,
  VERSAO_MODELO,
  type CodStatus,
  type Contagem,
  type ArquivoDivergencias,
  type Divergencia,
  type Fechamento,
  type ItemProva,
  type PdvFechamento,
  type SetorFechamento,
  type TipoFechamento,
} from '../shared/modelo';
import { norm } from './texto';
import type { ItemPedido, Resultado, Status } from './tipos';

const COD: Partial<Record<Status, CodStatus>> = {
  'Feita no dia': 'F',
  Parcial: 'P',
  'Não feita': 'N',
  'Já validada': 'V',
  'Não verificável': 'X',
};

const br = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function textoProgresso(r: Resultado): string {
  const antes = r.antes ? ` (${br(r.antes)} antes)` : '';
  switch (r.regra.tipo) {
    case 'qty':
      return `${br(r.prog)} / ${br(r.meta)} cx${antes}`;
    case 'sku':
      return `${r.prog} / ${r.meta} SKUs${antes}`;
    case 'val':
      return `R$ ${br(r.prog)} / ${br(r.meta)}${r.antes ? ` (R$ ${br(r.antes)} antes)` : ''}`;
    case 'any':
      return r.prog ? 'comprou' : 'não comprou';
    default:
      return '';
  }
}

/** Nome do PDV e NB (vendedor que mais vendeu no setor), tirados das linhas de pedido/nota. */
export interface Cadastro {
  nomePdv: Record<string, string>;
  nb: Record<string, string>;
}

export function cadastroDosItens(...listas: ItemPedido[][]): Cadastro {
  const nomePdv: Record<string, string> = {};
  const vendas: Record<string, Record<string, number>> = {};
  for (const itens of listas)
    for (const o of itens) {
      if (o.nome && !nomePdv[`${o.unb}|${o.pdv}`]) nomePdv[`${o.unb}|${o.pdv}`] = o.nome;
      if (o.vendedor && o.mov === 'VENDA') {
        const k = `${o.unb}|${o.setor}`;
        vendas[k] ??= {};
        vendas[k][o.vendedor] = (vendas[k][o.vendedor] ?? 0) + 1;
      }
    }
  const nb: Record<string, string> = {};
  for (const [k, v] of Object.entries(vendas)) nb[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  return { nomePdv, nb };
}

export interface OpcoesFechamento {
  tipo: TipoFechamento;
  /** AAAA-MM-DD (dia) ou AAAA-MM (mês). */
  chave: string;
  /** Dia dos pedidos ou último dia faturado. */
  dia: string;
  incluirBloqueados: boolean;
  arquivos: Fechamento['arquivos'];
  /** UNB → nome curto da revenda. */
  revendas: Record<string, string>;
  cadastro: Cadastro;
  /** Linhas de pedido/nota que entraram na conta (para o resumo). */
  itensUsados: ItemPedido[];
}

export function montarFechamento(resultados: Resultado[], o: OpcoesFechamento): Fechamento {
  const mes = o.tipo === 'mes';
  const setores = new Map<string, SetorFechamento & { _pt: Set<string>; _pc: Set<string> }>();
  const pdvs = new Map<string, PdvFechamento & { _idx: Map<string, number>; _linhas: Map<string, Set<ItemPedido>>; _rn: Record<string, number> }>();
  const textos: string[] = [];
  const idxTexto = new Map<string, number>();
  const texto = (s: string) => {
    let i = idxTexto.get(s);
    if (i === undefined) {
      i = textos.length;
      textos.push(s);
      idxTexto.set(s, i);
    }
    return i;
  };

  for (const r of resultados) {
    const t = r.task;
    const id = `${t.unb}|${t.setor}`;
    let s = setores.get(id);
    if (!s) {
      s = {
        id,
        revenda: o.revendas[t.unb] ?? t.op ?? t.unb,
        unb: t.unb,
        gv: t.gv,
        setor: t.setor,
        nb: o.cadastro.nb[id] ?? '',
        pdvComTarefa: 0,
        pdvComPedido: 0,
        ind: INDICADORES.map(() => [0, 0, 0, 0, 0] as Contagem),
        _pt: new Set(),
        _pc: new Set(),
      };
      setores.set(id, s);
    }
    s._pt.add(t.pdv);
    if (r.comprou) s._pc.add(t.pdv);

    const c = s.ind[INDICADORES.indexOf(r.ind)];
    if (r.status === 'Já validada') c[C_VALIDADAS]++;
    else if (!r.comprou && !mes) continue;
    else if (r.regra.tipo === 'nv' || !r.regra.fn) c[C_NV]++;
    else {
      // Dia: só conta o que estava aberto nos PDVs que compraram. Mês: todas as tarefas do setor.
      c[C_ABERTAS]++;
      if (r.status === 'Feita no dia') c[C_FEITAS]++;
      if (r.status === 'Parcial') c[C_PARCIAIS]++;
    }

    // Detalhe por PDV: quem fez pedido (dia) ou teve nota (mês); no mês, também quem teve tarefa validada.
    const cs = COD[r.status];
    if (!cs || (!r.comprou && !(mes && cs === 'V'))) continue;
    const pk = `${id}|${t.pdv}`;
    let p = pdvs.get(pk);
    if (!p) {
      p = {
        setorId: id,
        pdv: t.pdv,
        nome: o.cadastro.nomePdv[`${t.unb}|${t.pdv}`] ?? '',
        visita: t.visita,
        rn: '',
        tarefas: [],
        itens: [],
        _idx: new Map(),
        _linhas: new Map(),
        _rn: {},
      };
      pdvs.set(pk, p);
    }
    // Comprovação: cada compra que bateu com a tarefa (do dia e, no acumulado, as notas anteriores).
    const provas = new Set<number>();
    for (const x of [...(r.itensAntes ?? []), ...r.itens]) {
      const nota = x.dataFat !== undefined;
      const data = nota ? (x.dataFat ?? '') : x.dataEntrada;
      const k = [x.cod || x.d, x.pedido, x.nota ?? '', data, x.tipoItem].join('|');
      let i = p._idx.get(k);
      if (i === undefined) {
        i = p.itens.length;
        p.itens.push([x.cod, x.d, 0, 0, x.pedido, x.nota ?? '', data, x.vendedor, nota ? 'F' : 'P'] as ItemProva);
        p._idx.set(k, i);
        p._linhas.set(k, new Set());
      }
      // A mesma linha pode bater em várias tarefas: soma só uma vez.
      const vistas = p._linhas.get(k)!;
      if (!vistas.has(x)) {
        vistas.add(x);
        p.itens[i][2] += x.qty;
        p.itens[i][3] += x.valor;
        if (x.vendedor) p._rn[x.vendedor] = (p._rn[x.vendedor] ?? 0) + 1;
      }
      provas.add(i);
    }
    p.tarefas.push([
      cs,
      INDICADORES.indexOf(r.ind),
      t.tipoMD === 'Mensal' ? 'M' : 'D',
      texto(t.texto),
      cs === 'X' ? r.regra.alvo : cs === 'V' && !r.antes ? '' : textoProgresso(r),
      [...provas],
      cs === 'V' ? (t.conclusao ?? '') : '',
    ]);
  }

  const ordem: Record<CodStatus, number> = { F: 0, P: 1, N: 2, V: 3, X: 4 };
  const listaPdvs: PdvFechamento[] = [...pdvs.values()].map(({ _idx, _linhas, _rn, ...p }) => {
    p.tarefas.sort((a, b) => ordem[a[0]] - ordem[b[0]]);
    for (const it of p.itens) {
      it[2] = Math.round(it[2] * 100) / 100;
      it[3] = Math.round(it[3] * 100) / 100;
    }
    p.rn = Object.entries(_rn).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return p;
  });

  return {
    versao: VERSAO_MODELO,
    tipo: o.tipo,
    chave: o.chave,
    dia: o.dia,
    geradoEm: new Date().toISOString(),
    arquivos: o.arquivos,
    config: { incluirBloqueados: o.incluirBloqueados },
    resumo: {
      tarefasNoEscopo: resultados.length,
      itensPedido: o.itensUsados.length,
      pedidos: new Set(o.itensUsados.map((x) => `${x.unb}|${x.pedido}`)).size,
    },
    setores: [...setores.values()]
      .map(({ _pt, _pc, ...s }) => ({ ...s, pdvComTarefa: _pt.size, pdvComPedido: _pc.size }))
      .sort((a, b) => a.revenda.localeCompare(b.revenda) || +a.setor - +b.setor),
    pdvs: listaPdvs,
    textos,
  };
}

/** Compras que comprovam a tarefa, somando linhas do mesmo produto no mesmo pedido/nota. */
export function provasDe(itens: ItemPedido[]): ItemProva[] {
  const m = new Map<string, ItemProva>();
  for (const x of new Set(itens)) {
    const nota = x.dataFat !== undefined;
    const data = nota ? (x.dataFat ?? '') : x.dataEntrada;
    const k = [x.cod || x.d, x.pedido, x.nota ?? '', data, x.tipoItem].join('|');
    const it = m.get(k) ?? ([x.cod, x.d, 0, 0, x.pedido, x.nota ?? '', data, x.vendedor, nota ? 'F' : 'P'] as ItemProva);
    it[2] = Math.round((it[2] + x.qty) * 100) / 100;
    it[3] = Math.round((it[3] + x.valor) * 100) / 100;
    m.set(k, it);
  }
  return [...m.values()].sort((a, b) => a[6].localeCompare(b[6]));
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

/**
 * Tarefas ABERTAS no BEES que o faturado do mês já comprova (status calculado "concluída").
 * Referência de cada revenda = última data de validação que o export de tarefas traz: notas entregues
 * `tolerancia` dias ou mais antes dela já deveriam estar validadas.
 */
/** Textos que o BEES valida por etapas ou por adesão no app ("concluir a missão", "desafio"): ficam fora. */
const SO_BEES = /CONCLUIR A MISSAO|DESAFIO DISPONIVEL/;

export function montarDivergencias(
  resultados: Resultado[],
  o: { mes: string; tolerancia: number; cadastro: Cadastro },
): ArquivoDivergencias {
  const referencia: Record<string, string> = {};
  for (const r of resultados) {
    const c = r.task.conclusao;
    if (c && c.startsWith(o.mes) && c > (referencia[r.task.unb] ?? '')) referencia[r.task.unb] = c;
  }
  const linhas: Divergencia[] = [];
  for (const r of resultados) {
    const t = r.task;
    if (t.status === 'VALID' || r.status !== 'Feita no dia' || SO_BEES.test(norm(t.texto))) continue;
    const antesVisita = !r.quandoAposVisita;
    // Data que vale: a meta fechada com pedidos a partir da visita (ou, se só antes, a data original).
    const quando = (antesVisita ? r.quando : r.quandoAposVisita) ?? '';
    const ref = referencia[t.unb] ?? '';
    linhas.push({
      setorId: `${t.unb}|${t.setor}`,
      pdv: t.pdv,
      nome: o.cadastro.nomePdv[`${t.unb}|${t.pdv}`] ?? '',
      ind: INDICADORES.indexOf(r.ind),
      md: t.tipoMD === 'Mensal' ? 'M' : 'D',
      texto: t.texto,
      prog: textoProgresso(r),
      quando,
      dias: quando && ref ? diasEntre(quando, ref) : 0,
      antesVisita,
      visita: t.visita,
      itens: provasDe(r.itens),
    });
  }
  linhas.sort((a, b) => b.dias - a.dias || a.setorId.localeCompare(b.setorId) || a.pdv.localeCompare(b.pdv));
  return { versao: VERSAO_MODELO, mes: o.mes, geradoEm: new Date().toISOString(), tolerancia: o.tolerancia, referencia, linhas };
}
