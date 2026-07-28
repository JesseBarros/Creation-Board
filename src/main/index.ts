import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { registerAppIpc } from './ipc/app';
import { registerBoardIpc } from './ipc/board';
import { registerImportIpc } from './ipc/importer';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    // Cor de fundo igual a do tema escuro: evita o flash branco entre abrir a
    // janela e o primeiro paint do renderer.
    backgroundColor: '#16181d',
    autoHideMenuBar: true,
    title: 'QuadroBranco',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sem isso o Chromium derruba o rAF para ~1fps quando a janela perde o
      // foco, o que quebraria autosave e animacoes em segundo plano.
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Links externos vao para o navegador do sistema, nunca abrem uma janela
  // Electron sem preload (que seria uma superficie de ataque).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Bloqueia navegacao para fora da propria aplicacao (ex.: um link colado
  // dentro de uma caixa de texto nao pode sequestrar a janela).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const allowed = isDev && process.env['ELECTRON_RENDERER_URL'];
    if (!allowed || target.origin !== new URL(process.env['ELECTRON_RENDERER_URL']!).origin) {
      event.preventDefault();
    }
  });

  // QB_BENCH=<n> roda a medicao automatizada de performance com n objetos e
  // imprime o resultado no terminal. Ferramenta de desenvolvimento apenas.
  const bench = process.env['QB_BENCH'];
  const selftest = process.env['QB_SELFTEST'];
  // QB_IMPORT=<caminho> importa o arquivo e imprime o relatorio no terminal.
  const importPath = process.env['QB_IMPORT'];
  const query = bench
    ? `?bench=${encodeURIComponent(bench)}`
    : selftest
      ? '?selftest=1'
      : importPath
        ? `?import=${encodeURIComponent(importPath)}`
        : '';

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log(`[renderer] ${message}`);
    });
  }

  // QB_SHOT=<arquivo.png> grava uma captura da janela alguns segundos depois de
  // carregar. Usa capturePage, que fotografa apenas o conteudo desta janela --
  // diferente de uma captura de tela, nao registra nada do resto da area de
  // trabalho. Ferramenta de verificacao durante o desenvolvimento.
  const shotPath = process.env['QB_SHOT'];
  if (shotPath && !app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void mainWindow?.webContents.capturePage().then(async (image) => {
          await writeFile(shotPath, image.toPNG());
          console.log(`[shot] ${shotPath}`);
        });
      }, Number(process.env['QB_SHOT_DELAY'] ?? 9000));
    });
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    // DevTools nao abre sozinho: atrapalha ver o app. Ctrl+Shift+I quando precisar.
    void mainWindow.loadURL(devUrl + query);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      search: query.slice(1),
    });
  }
}

// Instancia unica: abrir o atalho de novo foca a janela existente em vez de
// subir um segundo processo brigando pelo mesmo arquivo de autosave.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    registerAppIpc();
    registerBoardIpc();
    registerImportIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
