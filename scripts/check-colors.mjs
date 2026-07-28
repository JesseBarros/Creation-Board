import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Verificacao da adaptacao de cor por tema.
 *
 * Compila o modulo real (render/colorAdapt.ts) e roda a paleta de producao por
 * ele, aplicando a MESMA distincao que os painters fazem: marcas passam pelo
 * adaptador, superficies nao.
 *
 * Falha (exit 1) se alguma marca ficar com contraste insuficiente contra o fundo
 * em qualquer um dos dois temas.
 *
 *   npm run check:colors
 */

const root = resolve(import.meta.dirname, '..');
const outFile = join(mkdtempSync(join(tmpdir(), 'qb-colors-')), 'colorAdapt.mjs');

await build({
  entryPoints: [join(root, 'src/renderer/render/colorAdapt.ts')],
  bundle: true,
  format: 'esm',
  outfile: outFile,
  logLevel: 'error',
});

const { createColorAdapter, readableTextOn } = await import(pathToFileURL(outFile).href);

const THEMES = {
  claro: '#ffffff',
  escuro: '#14161b',
};

/** kind: 'marca' passa pelo adaptador; 'superficie' e exibida como esta. */
const PALETTE = [
  { color: '#1f2933', kind: 'marca', desc: 'traco padrao (quase preto)' },
  { color: '#000000', kind: 'marca', desc: 'preto puro' },
  { color: '#ffffff', kind: 'marca', desc: 'traco branco' },
  { color: '#e03131', kind: 'marca', desc: 'vermelho' },
  { color: '#1971c2', kind: 'marca', desc: 'azul' },
  { color: '#2f9e44', kind: 'marca', desc: 'verde' },
  { color: '#f08c00', kind: 'marca', desc: 'laranja' },
  { color: '#9c36b5', kind: 'marca', desc: 'roxo' },
  { color: '#0c8599', kind: 'marca', desc: 'ciano' },
  { color: '#c2255c', kind: 'marca', desc: 'magenta' },
  { color: '#ffd43b', kind: 'superficie', desc: 'marca-texto amarelo' },
  { color: '#fff3bf', kind: 'superficie', desc: 'post-it amarelo' },
  { color: '#d0ebff', kind: 'superficie', desc: 'post-it azul' },
  { color: '#e9ecef', kind: 'superficie', desc: 'post-it cinza' },
  { color: '#e0313122', kind: 'superficie', desc: 'preenchimento translucido' },
];

const MIN_OK = 2.0;

function luminance(hex) {
  const h = hex.slice(1);
  const ch = (i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

let failures = 0;

for (const [themeName, bg] of Object.entries(THEMES)) {
  const adapt = createColorAdapter(bg);
  console.log(`\n=== tema ${themeName}  (fundo ${bg}) ===`);
  console.log('tipo        original     exibida      contraste  descricao');
  console.log('-'.repeat(74));

  for (const { color, kind, desc } of PALETTE) {
    const shown = kind === 'marca' ? adapt(color) : color;
    const ratio = contrast(shown.slice(0, 7), bg);
    const changed = shown !== color ? ' *' : '  ';

    // Superficies podem (e devem) ter contraste baixo: um post-it pastel no
    // branco e assim de proposito. So marcas sao reprovadas.
    const bad = kind === 'marca' && ratio < MIN_OK;
    if (bad) failures++;

    console.log(
      `${kind.padEnd(11)} ${color.padEnd(12)} ${shown.padEnd(12)}${changed}${ratio.toFixed(2).padStart(6)}   ${desc}${bad ? '   <== FALHA' : ''}`,
    );
  }

  console.log('\ntexto sobre post-it:');
  for (const bgNote of ['#fff3bf', '#d0ebff', '#e9ecef']) {
    console.log(`  ${bgNote} -> texto ${readableTextOn(bgNote)}`);
  }
}

console.log(`\n(* = cor alterada pelo adaptador)`);
if (failures > 0) {
  console.error(`\nFALHA: ${failures} marca(s) com contraste abaixo de ${MIN_OK}.`);
  process.exit(1);
}
console.log('\nOK: toda marca fica legivel nos dois temas.');
