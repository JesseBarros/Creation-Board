import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, extname } from 'node:path';
import { unzip, type Unzipped } from 'fflate';
import { IPC } from '@shared/ipc-contract';
import type { ImportSource } from '@shared/importer';

/**
 * Leitura de quadros exportados por outros aplicativos.
 *
 * O formato aceito e um .zip contendo um .html (o quadro inteiro, com objetos
 * posicionados e imagens embutidas em base64), ou o .html solto. O processo
 * principal so extrai e entrega como texto -- toda a interpretacao acontece no
 * renderer, que tem DOMParser.
 */

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

const decoder = new TextDecoder('utf-8');

async function readSource(path: string): Promise<ImportSource[]> {
  const ext = extname(path).toLowerCase();

  if (ext === '.html' || ext === '.htm') {
    const html = await fs.readFile(path, 'utf-8');
    return [{ name: basename(path, ext), html }];
  }

  if (ext === '.zip') {
    const raw = await fs.readFile(path);
    const entries = await unzipAsync(raw);
    const out: ImportSource[] = [];
    for (const [name, bytes] of Object.entries(entries)) {
      if (!name.toLowerCase().endsWith('.html')) continue;
      out.push({ name: basename(name, extname(name)), html: decoder.decode(bytes) });
    }
    if (out.length === 0) {
      throw new Error(`Nenhum .html encontrado dentro de "${basename(path)}".`);
    }
    return out;
  }

  throw new Error(`Formato nao suportado: ${ext || path}`);
}

export function registerImportIpc(): void {
  // Leitura por caminho explicito: usada por arrastar-e-soltar (onde o Electron
  // ja entrega o caminho do arquivo) e pelo modo de verificacao automatizada.
  ipcMain.handle(IPC.importRead, async (_e, paths: string[]): Promise<ImportSource[]> => {
    const sources: ImportSource[] = [];
    for (const path of paths) {
      try {
        sources.push(...(await readSource(path)));
      } catch (err) {
        sources.push({ name: basename(path), html: '', error: String(err) });
      }
    }
    return sources;
  });

  ipcMain.handle(IPC.importPick, async (e): Promise<ImportSource[]> => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = win
      ? await dialog.showOpenDialog(win, options())
      : await dialog.showOpenDialog(options());

    if (result.canceled || result.filePaths.length === 0) return [];

    const sources: ImportSource[] = [];
    for (const path of result.filePaths) {
      // Um arquivo problematico nao pode cancelar a importacao dos outros.
      try {
        sources.push(...(await readSource(path)));
      } catch (err) {
        sources.push({ name: basename(path), html: '', error: String(err) });
      }
    }
    return sources;
  });
}

function options(): Electron.OpenDialogOptions {
  return {
    title: 'Importar quadro de outro aplicativo',
    buttonLabel: 'Importar',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Quadro exportado', extensions: ['zip', 'html', 'htm'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  };
}
