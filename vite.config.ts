import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Raiz do projeto com barras "/" (o vigia de arquivos usa esse formato também no Windows).
const raiz = fileURLToPath(new URL('.', import.meta.url)).split('\\').join('/');

export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  server: {
    // Não vigiar dados brutos nem arquivos soltos na raiz (logos, planilhas):
    // arquivo ainda sendo copiado derruba o servidor (EBUSY).
    // public/ continua vigiada, para os logos em public/marca serem servidos.
    watch: {
      ignored: [
        '**/entrada/**',
        '**/base/**',
        '**/dist/**',
        '**/marca-originais/**',
        `${raiz}*.{png,jpg,jpeg,xlsx,csv}`,
      ],
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
