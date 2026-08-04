import { BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC, type ExportRequest, type ExportResult } from '@shared/ipc-contract';
import { sanitizeBoardName } from '@shared/wbd';

/**
 * Exportacao para arquivo: PNG, SVG e PDF.
 *
 * PNG e SVG chegam prontos do renderer -- ele ja sabe desenhar o quadro, e
 * refazer isso aqui seria manter dois renderizadores. O PDF e o unico que se
 * monta deste lado, porque `printToPDF` so existe no processo principal.
 *
 * Diferente de salvar um quadro, exportar SEMPRE pergunta onde: o `.wbd` mora na
 * pasta de quadros e e o mesmo arquivo a cada gravacao, enquanto uma exportacao
 * e um arquivo novo que vai para onde o usuario quer usa-lo.
 */

const FILTERS: Record<ExportRequest['format'], FileFilter> = {
  png: { name: 'Imagem PNG', extensions: ['png'] },
  svg: { name: 'Vetor SVG', extensions: ['svg'] },
  pdf: { name: 'Documento PDF', extensions: ['pdf'] },
};

export function registerExportIpc(): void {
  ipcMain.handle(IPC.exportSave, async (e, req: ExportRequest): Promise<ExportResult> => {
    let filePath = req.path ?? '';

    // Sem caminho pronto (o caso normal), pergunta. Com caminho, veio da
    // verificacao por terminal -- o dialogo nativo e justamente a parte que nao
    // da para automatizar, e sem essa porta o caminho do PDF nunca seria
    // exercitado fora de um clique manual.
    if (!filePath) {
      const win = BrowserWindow.fromWebContents(e.sender);
      const chosen = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Exportar quadro',
        defaultPath: `${sanitizeBoardName(req.name) || 'quadro'}.${req.format}`,
        filters: [FILTERS[req.format]],
      });
      if (chosen.canceled || !chosen.filePath) return { path: null };
      filePath = chosen.filePath;
    }

    const bytes = new Uint8Array(req.data);
    if (req.format === 'pdf') {
      await writePdf(filePath, bytes, req.widthPx ?? 1, req.heightPx ?? 1);
    } else {
      await fs.writeFile(filePath, bytes);
    }
    return { path: filePath };
  });
}

/** Pontos por polegada que o Chromium assume ao imprimir uma pagina web. */
const CSS_DPI = 96;

/**
 * Monta um PDF de uma pagina com a imagem ocupando a folha inteira.
 *
 * Sem biblioteca de PDF: uma janela invisivel carrega um HTML com a imagem e
 * `printToPDF` faz o resto. Escrever o formato a mao significaria manter tabela
 * de referencias cruzadas e dicionarios de objeto para ganhar o que o Chromium
 * ja faz -- e ele e a mesma engine que desenhou o quadro.
 *
 * O HTML e o PNG passam por arquivos temporarios, e nao por `data:` URL: um
 * quadro grande vira um PNG de dezenas de MB, e uma URL desse tamanho esbarra
 * no limite do `loadURL`.
 */
async function writePdf(
  filePath: string,
  png: Uint8Array,
  widthPx: number,
  heightPx: number,
): Promise<void> {
  const stamp = Date.now().toString(36);
  const pngPath = join(tmpdir(), `qb-export-${stamp}.png`);
  const htmlPath = join(tmpdir(), `qb-export-${stamp}.html`);

  await fs.writeFile(pngPath, png);
  await fs.writeFile(
    htmlPath,
    `<!doctype html><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0}img{display:block;width:100%}</style>` +
      `<img src="${pathToFileURL(pngPath).href}">`,
    'utf8',
  );

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });

  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    const pdf = await win.webContents.printToPDF({
      // Pagina do tamanho exato da imagem: com margem ou papel fixo, um quadro
      // largo sairia reduzido no meio de uma folha A4 em branco.
      pageSize: { width: widthPx / CSS_DPI, height: heightPx / CSS_DPI },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
    });
    await fs.writeFile(filePath, pdf);
  } finally {
    win.destroy();
    // Limpeza best-effort: falhar em apagar temporario nao pode derrubar uma
    // exportacao que ja deu certo.
    await fs.unlink(pngPath).catch(() => {});
    await fs.unlink(htmlPath).catch(() => {});
  }
}
