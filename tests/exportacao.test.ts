/** CSV por PDV: uma linha por tarefa com o texto e as compras que a comprovam. */
import { describe, expect, it } from 'vitest';
import { CAB_PDV, csvTexto, linhasPdv } from '../src/app/exportacao';
import type { DetalheSetor, SetorFechamento } from '../src/shared/modelo';

const setor = { id: '487570|135', revenda: 'Sousa', unb: '487570', gv: '3', setor: '135', nb: 'FRANCISCO' } as SetorFechamento;
const det: DetalheSetor = {
  textos: ['Auxilie na cobertura de 1 caixa(s) de PEPSI PET 2L.', 'Auxilie o PDV a comprar 3 SKUs distintos de CERVEJA no mês.'],
  pdvs: [
    {
      setorId: '487570|135', pdv: '99870', nome: 'JR; DISTRIBUIDORA', visita: '2026-11-05', rn: 'FRANCISCO',
      itens: [
        ['504', 'PEPSI COLA PET 2L CAIXA C/6', 1, 43.72, '17596', '', '2026-11-12', 'FRANCISCO', 'P'],
        ['18836', 'CORONA EXTRA N LONG NECK 330ML', 2, 320.5, '12771', '912052', '2026-11-06', '', 'F'],
      ],
      tarefas: [
        ['F', 3, 'M', 0, '1 / 1 cx', [0], ''],
        ['P', 5, 'M', 1, '2 / 3 SKUs (1 antes)', [1, 0], ''],
        ['V', 0, 'M', 0, '', [], '2026-11-04'],
      ],
    },
  ],
};

describe('CSV por PDV', () => {
  it('traz texto da tarefa, status e as compras que comprovam', () => {
    const [feita, parcial, validada] = linhasPdv({ tipo: 'dia', chave: '2026-11-12', dia: '2026-11-12' }, setor, det);
    const col = (l: string[], nome: string) => l[CAB_PDV.indexOf(nome)];
    expect(col(feita, 'Texto da tarefa')).toBe('Auxilie na cobertura de 1 caixa(s) de PEPSI PET 2L.');
    expect(col(feita, 'Status')).toBe('Feita no dia');
    expect(col(feita, 'Produtos que comprovam')).toBe('PEPSI COLA PET 2L CAIXA C/6');
    expect(col(feita, 'Pedidos')).toBe('17596');
    expect(col(feita, 'RN do pedido')).toBe('FRANCISCO');
    expect(col(parcial, 'Caixas')).toBe('3');
    expect(col(parcial, 'Notas fiscais')).toBe('912052');
    expect(col(parcial, 'Origem')).toBe('Nota faturada | Pedido do dia');
    expect(col(validada, 'Validada no BEES em')).toBe('04/11/2026');
    expect(col(validada, 'Produtos que comprovam')).toBe('');
  });

  it('filtra pelo indicador', () => {
    expect(linhasPdv({ tipo: 'dia', chave: '2026-11-12', dia: '2026-11-12' }, setor, det, 5)).toHaveLength(1);
  });

  it('protege campos com ponto e vírgula', () => {
    const linhas = linhasPdv({ tipo: 'mes', chave: '2026-11', dia: '2026-11-16' }, setor, det);
    expect(linhas[0][0]).toBe('novembro/2026');
    expect(csvTexto([CAB_PDV, ...linhas]).split('\n')[1]).toContain('"JR; DISTRIBUIDORA"');
  });
});
