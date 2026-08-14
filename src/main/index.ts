import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { registerAppIpc } from './ipc/app';
import { registerBoardIpc } from './ipc/board';
import { registerImportIpc } from './ipc/importer';
import { registerExportIpc } from './ipc/exporter';

const isDev = !app.isPackaged;

/**
 * REPINTURA COMPLETA -- correcao do B8, e com ele do B7 e do B1.
 *
 * Tres sintomas que estavam catalogados como bugs diferentes eram um so: a tela
 * piscando (preto ou branco) a cada movimento do mouse sobre um botao, a janela
 * "rasgada" ao redimensionar, e o rastro do quadro anterior ao voltar para o
 * menu. Em todos, uma regiao da janela ficava com os pixels de antes.
 *
 * A causa e a conta de REGIAO SUJA -- "que pedaco da tela mudou" -- saindo
 * errada. O Chromium repinta e troca so o pedaco que mudou; quando essa conta
 * erra, o que ficou de fora mantem os pixels velhos, e a troca do pedaco
 * aparece como um flash. As duas chaves abaixo desligam a otimizacao: repinta e
 * troca a tela INTEIRA a cada frame.
 *
 * Como se chegou aqui, para ninguem refazer o caminho: foram eliminados por
 * medicao, nesta ordem, o CSS (cinco propriedades desligadas juntas), o
 * conteudo salvo (biblioteca vazia), os caches, o RivaTuner e o modo de
 * desenvolvimento. Nenhum mudou nada. Os detalhes estao no B8 do BUGS.md.
 *
 * O PRECO FOI MEDIDO, e nao estimado: `QB_BENCH=4000`, duas rodadas com e duas
 * sem, deram 9,26 ms de frame nos dois casos na fase mais pesada. A diferenca
 * fica dentro do ruido. Nao ha o que economizar desligando isto.
 *
 * Isto e remedio de sintoma, e vale dizer: a raiz provavel e o Electron 33
 * (Chromium de 2024) compondo num Windows e num driver de 2026. Subir de
 * Electron e o conserto de verdade, e esta registrado como item da Fase 9.
 *
 * `QB_GPU=<modo>` substitui este padrao -- inclusive `QB_GPU=normal`, que nao
 * aplica nada e serve para reproduzir o bug de novo.
 *
 * Precisa vir ANTES do app ficar pronto; depois disso nao tem efeito.
 */
const GPU_MODOS: Record<string, { nota: string; aplicar: () => void }> = {
  // Nada aplicado: e assim que o bug volta. Existe para conferir que a correcao
  // ainda e necessaria depois de subir de Electron -- sem isso, o dia em que ela
  // virar desnecessaria passa despercebido e o custo fica para sempre.
  normal: {
    nota: 'sem correcao alguma (reproduz o bug de proposito)',
    aplicar: () => {},
  },
  // O caminho do Windows para mostrar o que a GPU desenhou. Testado no B8 e
  // NAO resolveu -- so mudou a cor do flash, de preto para branco. Fica na
  // escada porque foi essa mudanca de cor que provou que o que pisca e a
  // superficie da janela sem nada pintado.
  dc: {
    nota: 'sem DirectComposition (mantem a aceleracao inteira)',
    aplicar: () => {
      app.commandLine.appendSwitch('disable-direct-composition');
      app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
    },
  },
  // O MODO PADRAO. Ver o cabecalho deste arquivo para a investigacao inteira.
  swap: {
    nota: 'sem repintura parcial: troca a tela inteira a cada frame',
    aplicar: () => {
      app.commandLine.appendSwitch('ui-disable-partial-swap');
      app.commandLine.appendSwitch('disable-partial-raster');
    },
  },
  // Troca o tradutor de OpenGL: mesma placa, outro caminho ate ela. Separa
  // "driver" de "caminho de apresentacao".
  angle: {
    nota: 'ANGLE por OpenGL em vez de Direct3D',
    aplicar: () => app.commandLine.appendSwitch('use-angle', 'gl'),
  },
  // A GPU ainda desenha, mas quem junta as camadas e a CPU.
  comp: {
    nota: 'composicao pela CPU (a GPU ainda desenha)',
    aplicar: () => app.commandLine.appendSwitch('disable-gpu-compositing'),
  },
  // Fim da escada: nada de aceleracao. Lento de proposito -- e teste, nao
  // destino.
  off: {
    nota: 'sem aceleracao nenhuma',
    aplicar: () => app.disableHardwareAcceleration(),
  },
};

const gpuModo = process.env['QB_GPU'] ?? (process.env['QB_NOGPU'] === '1' ? 'off' : 'swap');
const escolhido = GPU_MODOS[gpuModo];
if (escolhido) {
  escolhido.aplicar();
  // So anuncia o que foge do padrao: uma linha por abertura dizendo que esta
  // tudo normal e ruido no terminal.
  if (gpuModo !== 'swap') console.log(`[gpu] modo "${gpuModo}": ${escolhido.nota}`);
} else {
  // Nome errado cai no padrao, e nao no nada: um QB_GPU com erro de digitacao
  // faria o bug voltar calado, que e o pior desfecho possivel.
  GPU_MODOS['swap']!.aplicar();
  console.log(
    `[gpu] modo "${gpuModo}" nao existe; usando "swap". Opcoes: ${Object.keys(GPU_MODOS).join(', ')}`,
  );
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    // Cor de fundo igual a da TELA DE ABERTURA, que por sua vez e a cor exata do
    // fundo da logo (medido: rgb(6,9,18)). As tres iguais fazem a janela abrir
    // sem nenhuma troca de cor ate o app assumir. Antes era a cor do tema
    // escuro, que ja evitava o flash branco -- mas com a marca embutida, uma cor
    // diferente deixaria o retangulo opaco dela aparecendo como mancha.
    backgroundColor: '#060912',
    autoHideMenuBar: true,
    title: 'Creation Board',
    // O icone da JANELA -- barra de titulo, barra de tarefas e Alt+Tab.
    //
    // So em desenvolvimento, e por isso: no app empacotado o icone ja esta
    // dentro do proprio `.exe` como recurso, posto pelo electron-builder, e o
    // caminho abaixo nem existiria (o codigo roda de dentro do asar). Sem esta
    // linha, `npm run dev` mostrava o atomo do Electron -- o icone padrao --,
    // que foi exatamente o que ele viu na barra de titulo.
    ...(isDev ? { icon: join(__dirname, '../../build/icon.ico') } : {}),
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
   * F12 abre e fecha as ferramentas de desenvolvedor.
   *
   * Fica AQUI e nao em `shortcuts.ts` de proposito. Aquele arquivo e registro
   * unico: tudo que entra nele aparece na tela de ajuda do `F1`, porque e
   * atalho do produto. Isto nao e -- e instrumento, como o `F3` do painel de
   * medicao era antes de virar recurso. Alem disso, o despacho de teclas do
   * renderer nao alcanca a tecla quando o foco esta dentro das proprias
   * ferramentas, e ai nao haveria como fecha-las pelo mesmo caminho.
   *
   * `before-input-event` intercepta antes de a tecla chegar a pagina, o que faz
   * o atalho funcionar tambem com uma caixa de texto aberta.
   *
   * Vale TAMBEM no app empacotado, pelo mesmo motivo que o console do renderer
   * e encaminhado para o terminal ali: sem isso, um erro no app instalado nao
   * aparece em lugar nenhum. O menu padrao do Electron esta escondido
   * (`autoHideMenuBar`), entao o `Ctrl+Shift+I` dele nao e caminho descoberto
   * por ninguem.
   */
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
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
  // QB_BOOT=hold segura a tela de abertura na tela, para o QB_SHOT poder
  // fotografa-la. Ela dura 642 ms e some sozinha -- sem isto, seria a unica
  // parte da interface que nao se confere por terminal.
  const boot = process.env['QB_BOOT'] === 'hold' ? '?boot=hold' : '';
  const modo = bench
    ? `?bench=${encodeURIComponent(bench)}`
    : selftest
      ? '?selftest=1'
      : importPath
        ? `?import=${encodeURIComponent(importPath)}${importSave}`
        : exportPrefix
          ? `?export=${encodeURIComponent(exportPrefix)}`
          : pasteCheck
            ? '?paste=1'
            : boot;

  // QB_THEME=light|dark manda no tema desta execucao, sem gravar a preferencia.
  //
  // Vem SOMADO ao modo, e nao no lugar dele: os outros sao alternativas entre si
  // (ou se importa, ou se exporta), e este atravessa todos -- conferir o tema
  // claro so serve se der para conferi-lo com o auto-teste rodando por baixo.
  const tema = process.env['QB_THEME'];
  const query =
    tema === 'light' || tema === 'dark' ? `${modo}${modo ? '&' : '?'}theme=${tema}` : modo;

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

  // O encaminhamento e o fechamento valem TAMBEM no app empacotado, e isso e
  // deliberado: a `query` acima e montada sem olhar `isPackaged`, entao o modo
  // de verificacao ja rodava dentro do `.exe` -- so que calado e sem nunca
  // fechar. Medido em 12/08/2026: `QB_SELFTEST=1` no executavel empacotado
  // rodou por 4 minutos sem imprimir uma linha e sem terminar. O pior dos dois
  // mundos, e o que impedia conferir o instalador pelo unico metodo que este
  // projeto usa -- o terminal.
  //
  // Nao ha risco de alguem cair nisto sem querer: os modos so ligam por
  // variavel de ambiente `QB_*`, e a `query` fica vazia quando nenhuma existe.
  // Fora dos modos de verificacao o encaminhamento tambem serve: um erro do
  // renderer no app instalado hoje nao aparece em lugar nenhum.
  const shotPath = process.env['QB_SHOT'];

  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[renderer] ${message}`);
    if (done && message.includes(done)) {
      // QB_SHOT pede uma foto da janela: fechar antes dela sair nao serve.
      // Fotografa AQUI, e nao num cronometro, e a diferenca importa: o
      // auto-teste monta a cena de conferencia no fim, e quanto ele demora
      // depende da maquina. Com o cronometro de 9 s a foto caia no meio da
      // execucao -- em 13/08/2026 saiu a cena de carga de 4.000 objetos a 4% de
      // zoom, que nao mostra nada do que se queria conferir. Acertar era sorte.
      //
      // O `isPackaged` fica junto porque a foto e ferramenta de dentro do
      // repositorio: dentro do `.exe` o modo tem de FECHAR, senao o
      // `check:dist` espera para sempre por um processo que nao termina.
      if (shotPath && !app.isPackaged) setTimeout(() => void tirarFoto(shotPath), 400);
      else app.quit();
    }
  });

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

  // Sem marcador para esperar (`npm run dev` puro, `QB_BOOT=hold`), sobra o
  // cronometro -- ali nao existe "fim" que se possa ouvir.
  if (shotPath && !done && !app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => void tirarFoto(shotPath), Number(process.env['QB_SHOT_DELAY'] ?? 9000));
    });
  }

  async function tirarFoto(destino: string): Promise<void> {
    const image = await mainWindow?.webContents.capturePage();
    if (!image) return;
    await writeFile(destino, image.toPNG());
    console.log(`[shot] ${destino}`);
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
    // QB_DIAG=1 imprime no terminal quais recursos graficos estao acelerados.
    // "O que esta em software" e metade da resposta em qualquer problema de
    // composicao -- foi assim que se descartou "a maquina nao tem GPU" no B8.
    //
    // O ATRASO e essencial e nao e folga: o Chromium levanta a GPU num processo
    // separado e so preenche esse relatorio quando ele responde. Perguntar no
    // `whenReady` devolve tudo como "software" mesmo numa maquina acelerada, e
    // essa leitura cedo demais chegou a apontar a investigacao para o lado
    // errado antes de ser corrigida.
    if (process.env['QB_DIAG'] === '1') {
      setTimeout(() => {
        console.log(`[diag] GPU ${JSON.stringify(app.getGPUFeatureStatus())}`);
      }, 8000);
    }
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
