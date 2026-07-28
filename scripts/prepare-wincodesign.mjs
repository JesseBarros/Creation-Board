import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';

/**
 * Prepara o cache do pacote `winCodeSign` do electron-builder.
 *
 * Problema: esse pacote traz symlinks do macOS (libcrypto.dylib, libssl.dylib).
 * No Windows, criar symlink exige Modo de Desenvolvedor ou privilegio de admin,
 * entao a extracao automatica falha com "O cliente nao tem o privilegio
 * necessario" e o empacotamento aborta -- mesmo sem assinar nada.
 *
 * Solucao: extrair o arquivo nos mesmos moldes, excluindo a pasta `darwin`, que
 * e irrelevante para um build Windows. So o rcedit (que grava icone e metadados
 * no .exe) e o signtool importam aqui.
 *
 * Idempotente: nao faz nada se o cache ja estiver valido.
 */

const VERSION = 'winCodeSign-2.6.0';
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`;

if (process.platform !== 'win32') {
  process.exit(0);
}

const cacheDir = join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache', 'winCodeSign');
const destDir = join(cacheDir, VERSION);
const archive = join(cacheDir, `${VERSION}.7z`);

if (existsSync(join(destDir, 'rcedit-x64.exe'))) {
  console.log(`[wincodesign] cache ja preparado: ${destDir}`);
  process.exit(0);
}

mkdirSync(cacheDir, { recursive: true });

if (!existsSync(archive)) {
  console.log(`[wincodesign] baixando ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) {
    console.error(`[wincodesign] download falhou: HTTP ${res.status}`);
    process.exit(1);
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
}

const require = createRequire(import.meta.url);
// 7zip-bin expoe o caminho do binario; resolvemos via package.json para nao
// depender do layout interno do pacote.
const sevenZip = join(dirname(require.resolve('7zip-bin/package.json')), 'win', 'x64', '7za.exe');

if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });

console.log('[wincodesign] extraindo sem a pasta darwin...');
const r = spawnSync(sevenZip, ['x', '-bso0', '-bsp0', `-o${destDir}`, '-x!darwin', archive], {
  stdio: 'inherit',
});

if (r.status !== 0 || !existsSync(join(destDir, 'rcedit-x64.exe'))) {
  console.error('[wincodesign] extracao falhou');
  process.exit(1);
}

console.log(`[wincodesign] pronto: ${destDir}`);
