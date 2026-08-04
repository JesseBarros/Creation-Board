import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { registerAppIpc } from './ipc/app';
import { registerBoardIpc } from './ipc/board';
import { registerImportIpc } from './ipc/importer';
import { registerExportIpc } from './ipc/exporter';

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
    title: 'Creation Board',
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

  /**
   * Forca a janela a repintar INTEIRA depois de mudar de tamanho.
   *
   * Bug relatado com captura: ao redimensionar (ou maximizar), a janela ficava
   * "rasgada" -- a regiao que ja existia mantinha os pixels do tamanho antigo, e
   * so a faixa recem-exposta aparecia com o layout novo. Dava para ver a barra
   * lateral e as reguas duas vezes, uma em cada posicao. Qualquer acao seguinte
   * consertava, porque provocava repintura.
   *
   * A causa esta na composicao do Chromium, e nao no nosso desenho: o canvas e
   * repintado pelo `ResizeObserver`, mas a interface em DOM depende do
   * compositor invalidar a area certa. `webContents.invalidate()` existe
   * exatamente para isso -- pedir a repintura completa.
   *
   * `resize` dispara muitas vezes durante um arraste de borda; o atraso curto
   * junta a rajada numa repintura so, no fim do gesto.
   */
  let repaintTimer: NodeJS.Timeout | undefined;
  const repaintSoon = (): void => {
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => mainWindow?.webContents.invalidate(), 80);
  };
  mainWindow.on('resize', repaintSoon);
  mainWindow.on('maximize', repaintSoon);
  mainWindow.on('unmaximize', repaintSoon);
  mainWindow.on('restore', repaintSoon);
  mainWindow.on('enter-full-screen', repaintSoon);
  mainWindow.on('leave-full-screen', repaintSoon);

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
  // QB_IMPORT=<caminho> importa o arquivo e imprime o relatorio no terminal, sem
  // gravar nada. QB_IMPORT_SAVE=1 grava o .wbd de verdade.
  const importPath = process.env['QB_IMPORT'];
  const importSave = process.env['QB_IMPORT_SAVE'] === '1' ? '&save=1' : '';
  // QB_EXPORT=<prefixo> exporta uma cena de conferencia nos tres formatos, sem
  // passar pelo dialogo de salvar -- que e justamente o que nao da para
  // automatizar. Ferramenta de desenvolvimento apenas.
  const exportPrefix = process.env['QB_EXPORT'];
  // QB_PASTE=1 manda um Ctrl+V NATIVO na janela, para exercitar o caminho real
  // do colar (com uma imagem ja na area de transferencia do Windows).
  const pasteCheck = process.env['QB_PASTE'];
  const query = bench
    ? `?bench=${encodeURIComponent(bench)}`
    : selftest
      ? '?selftest=1'
      : importPath
        ? `?import=${encodeURIComponent(importPath)}${importSave}`
        : exportPrefix
          ? `?export=${encodeURIComponent(exportPrefix)}`
          : pasteCheck
            ? '?paste=1'
            : '';

  if (!app.isPackaged) {
    // Os modos de verificacao terminam imprimindo um marcador. Fechar a janela
    // nesse ponto e o que torna `QB_IMPORT`/`--selftest`/`QB_BENCH` utilizaveis
    // dentro de um script: sem isso o processo fica aberto esperando alguem
    // clicar no X, e quem chamou nunca recebe a saida.
    const done = bench
      ? 'BENCH_RESULT'
      : selftest
        ? 'SELFTEST_FIM'
        : importPath
          ? 'IMPORTCHECK_FIM'
          : exportPrefix
            ? 'EXPORTCHECK_FIM'
            : pasteCheck
              ? 'PASTECHECK_FIM'
              : null;

    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log(`[renderer] ${message}`);
      // QB_SHOT pede uma foto da janela: fechar antes dela sair nao serve.
      if (done && !process.env['QB_SHOT'] && message.includes(done)) app.quit();
    });
  }

  // QB_SHOT=<arquivo.png> grava uma captura da janela alguns segundos depois de
  // carregar. Usa capturePage, que fotografa apenas o conteudo desta janela --
  // diferente de uma captura de tela, nao registra nada do resto da area de
  // trabalho. Ferramenta de verificacao durante o desenvolvimento.
  if (pasteCheck && !app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      // Espera a janela ter foco e o renderer montar o quadro: um Ctrl+V que
      // chega antes disso nao encontra ninguem para receber o evento.
      setTimeout(() => {
        mainWindow?.focus();
        mainWindow?.webContents.focus();
        // Tecla NATIVA, e nao um KeyboardEvent sintetico: e a diferenca entre
        // testar o handler e testar o caminho ate ele.
        for (const type of ['keyDown', 'char', 'keyUp'] as const) {
          mainWindow?.webContents.sendInputEvent({ type, keyCode: 'V', modifiers: ['control'] });
        }
        console.log('[main] Ctrl+V nativo enviado');
      }, 1200);
    });
  }

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
    registerExportIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
