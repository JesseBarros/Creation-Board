import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Roda o auto-teste DENTRO do executavel empacotado.
 *
 * Por que isto existe como comando proprio: `npm run selftest` mede o app
 * servido pelo Vite, e nada nele passa pelo empacotamento. O que o instalador
 * entrega e outro artefato -- asar, caminhos absolutos diferentes, `isPackaged`
 * verdadeiro, sem servidor de dev. Oito fases entraram entre a validacao do
 * instalador na Fase 0 e hoje, e nenhuma delas foi conferida do lado de la.
 *
 * Duas armadilhas que este script existe para resolver, e as duas custaram
 * tempo em 12/08/2026:
 *
 * 1. `ELECTRON_RUN_AS_NODE=1` -- o host de extensoes do VS Code exporta essa
 *    variavel, e com ela o binario do Electron roda como Node puro: sai em um
 *    segundo, sem janela e sem uma linha de saida. Parece um executavel
 *    quebrado, e nao e. O `scripts/run.mjs` ja limpava isso para o `dev`; o
 *    empacotado nao tinha quem limpasse.
 * 2. A saida de um app de subsistema grafico no Windows so chega a quem chamou
 *    se o stdout estiver redirecionado -- por isso `stdio: 'pipe'`, e nao
 *    `'inherit'`.
 *
 *   npm run check:dist
 */

const root = resolve(import.meta.dirname, '..');
const exe = join(root, 'release', 'win-unpacked', 'Creation Board.exe');

if (!existsSync(exe)) {
  console.error(`[check:dist] executavel nao encontrado: ${exe}`);
  console.error('[check:dist] gere-o antes com: npm run dist:dir');
  process.exit(1);
}

const env = { ...process.env, QB_SELFTEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;

console.log(`[check:dist] rodando o auto-teste dentro de ${exe}`);

const inicio = Date.now();
const child = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });

let saida = '';
const acompanhar = (chunk) => {
  const texto = chunk.toString();
  saida += texto;
  process.stdout.write(texto);
};
child.stdout.on('data', acompanhar);
child.stderr.on('data', acompanhar);

// O app fecha sozinho ao imprimir SELFTEST_FIM. Se ele NAO fechar, o problema e
// tao interessante quanto uma falha -- e sem este teto ficaria pendurado.
const TETO_MS = 5 * 60 * 1000;
const guarda = setTimeout(() => {
  console.error(`\n[check:dist] FALHA: passou de ${TETO_MS / 1000}s sem terminar; encerrando.`);
  child.kill();
}, TETO_MS);

child.on('exit', () => {
  clearTimeout(guarda);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  const fim = saida.match(/SELFTEST_FIM.*/)?.[0];

  if (!fim) {
    console.error(`\n[check:dist] FALHA: o app terminou em ${segundos}s sem imprimir SELFTEST_FIM.`);
    console.error('[check:dist] saida vazia costuma ser ELECTRON_RUN_AS_NODE ligado no ambiente.');
    process.exit(1);
  }

  const falhou = !fim.includes('tudo passou');
  console.log(`\n[check:dist] ${fim} (em ${segundos}s, no executavel empacotado)`);
  process.exit(falhou ? 1 : 0);
});
