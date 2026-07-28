import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Wrapper para `electron-vite`.
 *
 * Existe por um motivo especifico: alguns ambientes (notavelmente o host de
 * extensoes do VS Code) exportam ELECTRON_RUN_AS_NODE=1. Com essa variavel
 * setada, o binario do Electron roda como Node puro e a janela nunca abre --
 * falha silenciosa e confusa de diagnosticar. Limpamos aqui antes de delegar.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

// Flags proprias, retiradas antes de repassar os argumentos ao electron-vite.
const argv = process.argv.slice(2).filter((arg) => {
  if (arg === '--selftest') {
    process.env.QB_SELFTEST = '1';
    return false;
  }
  return true;
});

// O campo `exports` do electron-vite nao expoe o subpath do bin, entao passamos
// pelo package.json (que ele expoe) e lemos o caminho declarado em `bin`.
const require = createRequire(import.meta.url);
const pkgPath = require.resolve('electron-vite/package.json');
const pkg = require('electron-vite/package.json');
const bin = join(dirname(pkgPath), pkg.bin['electron-vite']);

const child = spawn(process.execPath, [bin, ...argv], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
