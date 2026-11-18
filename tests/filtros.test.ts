/** Filtros do painel: operação (consolida revendas) e GV por revenda (o número se repete). */
import { describe, expect, it } from 'vitest';
import { setoresFiltrados } from '../src/app/agregacao';
import { operacaoDa, type Fechamento, type SetorFechamento } from '../src/shared/modelo';

const s = (revenda: string, unb: string, gv: string, setor: string) => ({ id: `${unb}|${setor}`, revenda, unb, gv, setor, nb: '' }) as SetorFechamento;
const f = {
  setores: [
    s('Sousa', '487570', '2', '201'),
    s('Itaporanga', '820288', '2', '202'),
    s('Brumado', '1044303', '2', '203'),
    s('Barra da Estiva', '1044591', '1', '101'),
    s('Caculé', '1045180', '1', '102'),
    s('Patos', '747530', '4', '403'),
    s('Sumé', '747548', '5', '501'),
    s('Guarabira', '1036580', '7', '701'),
  ],
} as Fechamento;
const ids = (filtros: Parameters<typeof setoresFiltrados>[1]) => setoresFiltrados(f, filtros).map((x) => x.setor);
const base = { op: 'todas', rev: 'todas', gv: 'todos', ind: 'todos' as const, busca: '' };

describe('filtros', () => {
  it('operação consolida as revendas', () => {
    expect(operacaoDa('Caculé')).toBe('Bahia');
    expect(ids({ ...base, op: 'Bahia' })).toEqual(['203', '101', '102']);
    expect(ids({ ...base, op: 'Patos' })).toEqual(['403', '501']);
    expect(ids({ ...base, op: 'Sousa' })).toEqual(['201', '202']);
    expect(ids({ ...base, op: 'Guarabira' })).toEqual(['701']);
  });

  it('GV 2 de Sousa não mistura com o GV 2 de Itaporanga e Brumado', () => {
    expect(ids({ ...base, gv: '487570|2' })).toEqual(['201']);
    expect(ids({ ...base, gv: '1044303|2' })).toEqual(['203']);
  });
});
