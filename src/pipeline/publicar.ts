/**
 * Envia o fechamento (e qualquer alteração do código) para o GitHub.
 * O Vercel acompanha o repositório e atualiza o site sozinho em 1–2 minutos.
 *
 *   npm run publicar                       → mensagem automática com a data
 *   npm run publicar -- "ajuste na regra"  → mensagem própria
 */
import { execFileSync } from 'node:child_process';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

const SITE = 'https://fechamento-de-tasks-de-compra-no-be.vercel.app';

git('add', '-A');

// Trava de segurança: arquivos brutos (pedidos, faturado, tarefas, cesta) nunca sobem.
const preparados = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
const brutos = preparados.filter((f) => /\.(csv|xlsx|xls)$/i.test(f) || f.startsWith('entrada/') && !f.endsWith('LEIA-ME.md'));
if (brutos.length) {
  git('reset', '-q');
  console.error('\nParado: estes arquivos brutos iam para o GitHub e não podem:\n  ' + brutos.join('\n  '));
  console.error('Coloque-os em entrada/ (que fica fora do Git) e rode de novo.\n');
  process.exit(1);
}

if (preparados.length) {
  const hoje = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const mensagem = process.argv.slice(2).join(' ').trim() || `Fechamento ${hoje}`;
  git('commit', '-q', '-m', mensagem);
  console.log(`Salvo: ${mensagem} (${preparados.length} arquivo(s)).`);
} else {
  console.log('Nada novo para salvar desde o último envio.');
}

console.log('Enviando para o GitHub…');
execFileSync('git', ['push'], { stdio: 'inherit' });
console.log(`\nPronto. O site atualiza em 1–2 minutos: ${SITE}\n`);
