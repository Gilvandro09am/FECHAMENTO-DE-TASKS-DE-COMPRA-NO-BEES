/**
 * Teste de referência com os arquivos reais de 04/11/2026.
 * Só roda se os três arquivos estiverem em tests/referencia/ (não vão para o Git).
 * Serve para garantir que mudanças nas regras não alteram o resultado sem querer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { avaliar, indicador, lerCesta, lerPedidos, lerTarefas } from '../src/engine';
import { lerCsv, lerPlanilha, lerPlanilhaMatriz } from '../src/pipeline/arquivos';

const pasta = path.join(__dirname, 'referencia');
const arq = (re: RegExp) => (fs.existsSync(pasta) ? fs.readdirSync(pasta).find((f) => re.test(f)) : undefined);
const pedidos = arq(/pedido.*\.csv$/i);
const tarefas = arq(/bees.*\.xlsx$/i);
const cesta = arq(/cesta.*\.xlsx$/i);

describe.skipIf(!pedidos || !tarefas || !cesta)('fechamento de referência 04/11/2026', () => {
  it('reproduz 235 feitas, 751 parciais e 222 PDVs', () => {
    const c = lerCesta(lerPlanilhaMatriz(path.join(pasta, cesta!)));
    const t = lerTarefas(lerPlanilha(path.join(pasta, tarefas!), 'Export')).filter((x) => indicador(x));
    const p = lerPedidos(lerCsv(path.join(pasta, pedidos!)), c);
    const r = avaliar(t, p, { dia: '2026-11-04', incluirBloqueados: true });
    const conta = (s: string) => r.filter((x) => x.status === s).length;
    expect(conta('Feita no dia')).toBe(235);
    expect(conta('Parcial')).toBe(751);
    expect(new Set(r.filter((x) => x.comprou).map((x) => x.task.unb + x.task.pdv)).size).toBe(222);
  }, 60_000);
});
