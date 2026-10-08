import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import { COR_DA_JANELA } from '@shared/abertura';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { registerAppIpc } from './ipc/app';
import { registerBoardIpc } from './ipc/board';
import { registerFundoIpc } from './ipc/fundo';
import { registerPastasIpc } from './ipc/pastas';
import { registerImportIpc } from './ipc/importer';
import { registerExportIpc } from './ipc/exporter';
import { registerOcrIpc } from './ipc/ocr';
import { abrirLinkExterno, blindarPaginas, blindarSessao } from './blindagem';
import { definirIdioma, idiomaDoSistema, idiomaValido } from '@shared/i18n';
import { lerCompatibilidade, MODO_COMPAT, MODO_PADRAO, resolverModo } from './graficos';

const isDev = !app.isPackaged;

// QB_PERFIL=<nome> roda esta execucao num PERFIL separado do Electron (pasta de
// dados propria), e com isso fora da trava de instancia unica do app aberto.
//
// Existe pela armadilha 4 do ENGENHARIA.md: com o app instalado aberto, selftest,
// captura e bancada simplesmente nao subiam -- a trava fechava o segundo
// processo calado. O perfil separa `localStorage` e trava; o disco se separa
// com o `QB_BOARDS` apontando para copias. Usar os DOIS juntos: so o perfil,
// sem `QB_BOARDS`, poria dois processos gravando na mesma pasta de quadros.
//
// Vem ANTES do modo de composicao: a opcao "compatibilidade grafica" mora no
// `userData`, e o perfil separado tem de ler a dele, e nao a do app instalado.
//
// Ignorado no app instalado, como todo QB_*. Nome saneado: vira nome de pasta.
const perfil = process.env['QB_PERFIL'];
if (perfil && isDev && /^[a-z0-9-]{1,32}$/i.test(perfil)) {
  app.setPath('userData', join(app.getPath('userData'), '..', `creation-board-${perfil}`));
  console.log(`[perfil] execucao no perfil separado "${perfil}"`);
}

/**
 * A GPU E O PADRAO DESDE 06/10/2026. O contorno abaixo virou a opcao
 * "compatibilidade grafica" de Configuracoes (modo `compat`).
 *
 * De 21/09 a 06/10 o contorno foi o padrao de todo mundo. Em 30/09 ficou
 * provado que o B8 e o B18 sao DE UMA MAQUINA so: o instalador com
 * GPU (modo `normal`) rodou limpo em dois outros PCs com Windows. E o preco do
 * contorno, medido em 06/10 com a bancada do quadro (`QB_BENCH_QUADRO=1`, o
 * quadro de teste de 1.063 objetos, tres rodadas alternadas, medianas):
 *
 *   gesto           compat (CPU)    normal (GPU)
 *   arrastar           56 q/s         144 q/s
 *   zoom rapido        40 q/s          77 q/s   (0 tarefas longas, contra ate 7)
 *
 * Ver `graficos.ts` para onde a opcao mora e quem manda em quem.
 *
 * O historico abaixo continua valendo: e o que a opcao faz, e por que.
 *
 * COMPOSICAO PELA CPU + REPINTURA COMPLETA -- correcao do B18 e do B8.
 *
 * O modo `compat` aplica TRES chaves, e elas consertam DOIS bugs diferentes. Que
 * sejam dois importa: eles tem sintomas, historias e provas distintas, e
 * junta-los num so foi exatamente o erro que atrasou o B1/B7/B8 por oito dias.
 *
 * `disable-gpu-compositing` -- correcao do B18, o FANTASMA ao dar zoom.
 *
 * Adotada em 21/09/2026, depois de uma caçada que eliminou
 * todo o resto. O sintoma: ao mudar o zoom, o desenho inteiro aparecia DUAS
 * VEZES na tela, em duas escalas, com o estado anterior mais apagado. Acontecia
 * nas duas camadas de canvas ao mesmo tempo e saia na captura de tela.
 *
 * Foram testados e NAO curaram: `swap` (as duas chaves abaixo), `dc`, `angle`,
 * `canvas` e `raster`, alem de `QB_ALPHA=1` e `QB_DESYNC=1`, que mexem no que o
 * app pede ao navegador. Do lado do codigo foram auditadas e descartadas a
 * limpeza das duas camadas, o cache de rasterizacao, o reuso de frame anterior
 * e o vazamento de estado do contexto (este ultimo por guarda no selftest, que
 * ficou). Tambem cairam o VRR e a idade do Chromium.
 *
 * O PRECO ESTA MEDIDO E ASSUMIDO. `QB_BENCH=1070`, TRES execucoes de cada lado
 * -- e as tres importam, ver a nota logo abaixo:
 *
 *   fase                      antes (swap)    agora (padrao)
 *   zoom 100% (26 visiveis)   144,0 fps       111,7 / 108,0 / 112,7    -22%
 *   zoom 40%  (124 visiveis)  144,0 fps        87,6 /  83,1 /  91,3    -39%
 *   ajustado a tela (1070)     ~57 fps         68,9 /  67,8 /  63,5    +20%
 *
 * Compor pela CPU custa por frame independente do conteudo, entao a perda
 * aparece onde o app seria rapido e DESAPARECE onde ele ja estava lento -- na
 * fase pesada o padrao novo e MAIS rapido, porque ali o gargalo nunca foi a
 * composicao. No teste manual, sem o fantasma ficou melhor.
 *
 * NOTA SOBRE COMO ESTE NUMERO FOI OBTIDO, porque ele quase entrou errado: a
 * primeira medicao usou UMA amostra de cada lado e deu "144 -> 77 fps", numero
 * que foi usado para argumentar CONTRA a adocao. Repetindo tres vezes, o 77 era
 * ruido -- a maquina estava ocupada com outras medicoes. E o mesmo erro que o
 * BUGS.md ja registrava duas vezes ([...]), cometido pela terceira. Nao meça isto com uma rodada.
 *
 * As duas abaixo sao a correcao do B8, e continuam.
 *
 * Tres sintomas que estavam catalogados como bugs diferentes eram um so: a tela
 * piscando (preto ou branco) a cada movimento do mouse sobre um botao, a janela
 * "rasgada" ao redimensionar, e o rastro do quadro anterior ao voltar para o
 * menu. Em todos, uma regiao da janela ficava com os pixels de antes.
 *
 * A causa e a conta de REGIAO SUJA -- [...] -- saindo
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
 * `QB_GPU=<modo>` substitui o modo da execucao, inclusive o da opcao --
 * `QB_GPU=normal` numa maquina com a opcao ligada reproduz os bugs de novo.
 *
 * POR QUE O `compat` E UM MODO PROPRIO, e nao `comp`: a escada e EXCLUSIVA, um
 * modo por execucao. Fazer a opcao usar `comp` derrubaria as duas chaves do B8
 * junto, e o B8 ja sumiu sozinho uma vez -- e pode voltar do mesmo jeito. Os
 * degraus puros continuam puros, para bisseccao; o padrao e a soma deles.
 *
 * Precisa vir ANTES do app ficar pronto; depois disso nao tem efeito.
 */
const GPU_MODOS: Record<string, { nota: string; aplicar: () => void }> = {
  // O PADRAO desde 06/10/2026: composicao pela GPU, nada aplicado. Na maquina
  // que tem o defeito, e assim que o B8/B18 volta -- e e com ele que se confere,
  // depois de subir de Electron, se a opcao ainda e necessaria la.
  normal: {
    nota: 'composicao pela GPU, sem correcao (o padrao)',
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
  /*
    A "COMPATIBILIDADE GRAFICA": a soma do `comp` com o `swap`. Foi o padrao de
    21/09 a 06/10/2026 (chamava `padrao`); hoje e a opcao de Configuracoes.

    Existe como entrada propria porque a escada e exclusiva -- um modo por
    execucao. Se a opcao fosse `comp`, as duas chaves do B8 sairiam junto, e o
    B8 ja sumiu sozinho uma vez, o que significa que pode voltar do mesmo jeito.
    Os degraus puros abaixo continuam puros, para bisseccao.

    Ver o cabecalho deste arquivo para as duas investigacoes inteiras.
  */
  [MODO_COMPAT]: {
    nota: 'compatibilidade grafica: composicao pela CPU + repintura completa (B18 e B8)',
    aplicar: () => {
      app.commandLine.appendSwitch('disable-gpu-compositing');
      app.commandLine.appendSwitch('ui-disable-partial-swap');
      app.commandLine.appendSwitch('disable-partial-raster');
    },
  },
  // Degrau puro: so as duas chaves do B8. Foi o padrao ate 21/09/2026, e NAO
  // cura o fantasma do B18 -- conferido, se comporta igual ao `normal` no zoom.
  swap: {
    nota: 'sem repintura parcial: troca a tela inteira a cada frame',
    aplicar: () => {
      app.commandLine.appendSwitch('ui-disable-partial-swap');
      app.commandLine.appendSwitch('disable-partial-raster');
    },
  },
  // Troca o tradutor de OpenGL: mesma placa, outro caminho ate ela. Separa
  // "driver" de [...].
  angle: {
    nota: 'ANGLE por OpenGL em vez de Direct3D',
    aplicar: () => app.commandLine.appendSwitch('use-angle', 'gl'),
  },
  // A GPU ainda desenha, mas quem junta as camadas e a CPU.
  comp: {
    nota: 'composicao pela CPU (a GPU ainda desenha)',
    aplicar: () => app.commandLine.appendSwitch('disable-gpu-compositing'),
  },

  /*
    DOIS DEGRAUS QUE PARTEM O `comp` AO MEIO. Acrescentados em 21/09/2026.

    O `comp` cura o rastro do zoom (B18), e ele foi o unico que curou -- mas ele
    e grosso: desliga a composicao por GPU INTEIRA, e o preco aparece como
    lentidao ao mover a tela: no teste manual, o rastro sumiu, mas mover o
    quadro ficou com sensacao de atraso.

    O problema de diagnostico e que o `comp` faz DUAS coisas de uma vez, e
    nenhuma das duas tinha sido isolada:

      1. tira a COMPOSICAO DA PAGINA da GPU;
      2. junto com ela, derruba o canvas 2D acelerado para a CPU, porque sem
         composicao por GPU nao ha para onde mandar a textura dele.

    Se o rastro esta na textura do CANVAS, o degrau `canvas` abaixo cura
    sozinho, e sem pagar a composicao da pagina inteira -- que e de onde vem a
    lentidao que ele sentiu. Se o rastro esta na conta de dano do COMPOSITOR,
    `canvas` nao cura e so o `comp` cura, e ai a escolha volta a ser entre
    rastro e lentidao.

    Isto explicaria tambem por que o `swap` conserta o B8 e NAO conserta o B18:
    `ui-disable-partial-swap` e `disable-partial-raster` agem na pagina, e nao
    na textura do canvas.

    ATENCAO ao adotar qualquer um dos dois como padrao: o B24 e o registro de
    que canvas na CPU custa caro -- o Render do F3 foi de 1,2 ms para 31,3 ms
    quando uma bandeira empurrou UM canvas intermediario para a CPU. Antes de
    trocar o padrao, medir com `QB_BENCH` e com a borracha.
  */
  canvas: {
    nota: 'canvas 2D na CPU, composicao da pagina ainda na GPU',
    aplicar: () => app.commandLine.appendSwitch('disable-accelerated-2d-canvas'),
  },
  raster: {
    nota: 'rasterizacao fora do processo da GPU (composicao segue na GPU)',
    aplicar: () => app.commandLine.appendSwitch('disable-oop-rasterization'),
  },
  // Fim da escada: nada de aceleracao. Lento de proposito -- e teste, nao
  // destino.
  off: {
    nota: 'sem aceleracao nenhuma',
    aplicar: () => app.disableHardwareAcceleration(),
  },
};

// O `QB_BUILD_GPU` e o `npm run dist:gpu` sairam em 06/10/2026: existiam para
// levar um instalador com GPU a outro computador, e a GPU virou o padrao.
const { modo: gpuModo, pedidoInvalido } = resolverModo({
  qbGpu: process.env['QB_GPU'],
  qbNoGpu: process.env['QB_NOGPU'],
  compatibilidade: lerCompatibilidade(app.getPath('userData')),
  existe: (m) => m in GPU_MODOS,
});
GPU_MODOS[gpuModo]!.aplicar();
// Nome errado cai no que a opcao diz, e nao na GPU: na maquina que precisa do
// contorno, um QB_GPU com erro de digitacao faria o bug voltar calado.
if (pedidoInvalido !== null) {
  console.log(
    `[gpu] modo "${pedidoInvalido}" nao existe; usando "${gpuModo}". Opcoes: ${Object.keys(GPU_MODOS).join(', ')}`,
  );
} else if (gpuModo !== MODO_PADRAO) {
  // So anuncia o que foge do padrao: uma linha por abertura dizendo que esta
  // tudo normal e ruido no terminal.
  console.log(`[gpu] modo "${gpuModo}": ${GPU_MODOS[gpuModo]!.nota}`);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    // Cor de fundo igual a da TELA DE ABERTURA, no tema do Windows (07/10/2026:
    // antes era sempre a escura, e com o tema claro a janela abria escura e
    // virava clara -- uma piscada ao abrir). Quem escolheu um
    // tema diferente do Windows nao ve diferenca: a janela so aparece depois do
    // primeiro frame (`ready-to-show`), e a pagina avisa o tema dela logo ao
    // montar (`app:tema`). Ver `shared/abertura.ts`.
    backgroundColor: COR_DA_JANELA[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'],
    autoHideMenuBar: true,
    title: 'Creation Board',
    // O icone da JANELA -- barra de titulo, barra de tarefas e Alt+Tab.
    //
    // So em desenvolvimento, e por isso: no app empacotado o icone ja esta
    // dentro do proprio `.exe` como recurso, posto pelo electron-builder, e o
    // caminho abaixo nem existiria (o codigo roda de dentro do asar). Sem esta
    // linha, `npm run dev` mostrava o atomo do Electron -- o icone padrao --,
    // na barra de titulo.
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

  mainWindow.once('ready-to-show', () => {
    // A bancada do quadro mede na janela MAXIMIZADA: e o uso tipico, e o custo
    // de compor cresce com a area.
    if (process.env['QB_BENCH_QUADRO'] === '1' && isDev) {
      // A area de trabalho da tela principal ANTES de maximizar: sozinho, o
      // maximizar as vezes abria a janela com metade da largura, e a medida de
      // uma execucao deixava de valer para a outra.
      mainWindow?.setBounds(screen.getPrimaryDisplay().workArea);
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

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
  // Electron sem preload (que seria uma superficie de ataque). So http(s) e
  // mailto -- ver `abrirLinkExterno`.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    abrirLinkExterno(url);
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
  // QB_BENCH_LOBBY=1 mede a cadencia de quadros do MENU PRINCIPAL -- parado,
  // cards levantando e o arrasto da Parte 4. Ver `dev/lobbyBench.ts`.
  const benchLobby = process.env['QB_BENCH_LOBBY'] === '1';
  // QB_BENCH_QUADRO=1 mede o QUADRO aberto com os gestos de verdade -- arrastar
  // com o botao direito e Ctrl+roda rapido. Ver `dev/quadroBench.ts`.
  const benchQuadro = process.env['QB_BENCH_QUADRO'] === '1';
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
    : benchLobby
      ? '?benchlobby=1'
      : benchQuadro
      ? '?benchquadro=1'
      : selftest
      ? '?selftest=1'
      : importPath
        ? `?import=${encodeURIComponent(importPath)}${importSave}`
        : exportPrefix
          ? `?export=${encodeURIComponent(exportPrefix)}`
          : pasteCheck
            ? `?paste=${pasteCheck === 'grande' ? 'grande' : '1'}`
            : boot;

  // QB_THEME=light|dark manda no tema desta execucao, sem gravar a preferencia.
  //
  // Vem SOMADO ao modo, e nao no lugar dele: os outros sao alternativas entre si
  // (ou se importa, ou se exporta), e este atravessa todos -- conferir o tema
  // claro so serve se der para conferi-lo com o auto-teste rodando por baixo.
  const tema = process.env['QB_THEME'];
  let query =
    tema === 'light' || tema === 'dark' ? `${modo}${modo ? '&' : '?'}theme=${tema}` : modo;

  // QB_ANIM=off|on|max manda no nivel de movimento desta execucao, sem gravar a
  // preferencia -- mesmo desenho do QB_THEME. Existe para o QB_BENCH_LOBBY
  // medir as animacoes maximas sem depender do que esta gravado na maquina.
  // QB_IDIOMA=pt-BR|en-US manda no idioma desta execucao sem gravar nada --
  // para o selftest e as capturas conferirem a interface em ingles.
  const idiomaForcado = process.env['QB_IDIOMA'];
  if (idiomaValido(idiomaForcado)) query = `${query}${query ? '&' : '?'}idioma=${idiomaForcado}`;

  // QB_EXEMPLOS=1 grava quadros de exemplo na pasta em vigor (ver
  // `renderer/dev/exemplos.ts`). So em desenvolvimento, e sempre com QB_BOARDS.
  if (isDev && process.env['QB_EXEMPLOS'] === '1') query = `${query}${query ? '&' : '?'}exemplos=1`;

  // QB_CONFIG=1 abre Configuracoes ao subir -- so para a foto do QB_SHOT.
  if (isDev && process.env['QB_CONFIG'] === '1') query = `${query}${query ? '&' : '?'}config=1`;

  // Sem tutorial nas fotos (QB_SHOT) e quando pedido (QB_TOUR=off): ele bloqueia
  // a tela e entraria na captura. Ver `#automatizado` no App.
  if (process.env['QB_SHOT'] || process.env['QB_TOUR'] === 'off') query = `${query}${query ? '&' : '?'}tour=off`;

  const anim = process.env['QB_ANIM'];
  if (anim === 'off' || anim === 'on' || anim === 'max') query = `${query}${query ? '&' : '?'}anim=${anim}`;

  // QB_GLASS saiu em 21/09/2026: o vitrificado virou o acabamento unico do
  // aplicativo, e uma variavel para escolher entre dois modos perdeu o objeto
  // quando um dos dois deixou de existir.

  // QB_BLUR=0 desliga TODO `backdrop-filter` da interface.
  //
  // E instrumento de diagnostico, no mesmo espirito do QB_GPU: `backdrop-filter`
  // obriga o Chromium a ler o fundo num passe proprio e a criar superficies de
  // composicao extras, e essa e a familia de causa do B8 -- conta de regiao suja
  // errada, que deixa pixels velhos na tela. Com um comando da para responder
  // [...] sem editar CSS nem adivinhar.
  const desfoque = process.env['QB_BLUR'];
  if (desfoque === '0') query = `${query}${query ? '&' : '?'}blur=0`;

  // QB_FUNDO=off tira a foto do menu principal, deixando o fundo ambiente.
  //
  // Existe pela mesma razao do QB_THEME: repetibilidade. O fundo pode ter sido
  // trocado pelo usuario, entao uma foto de conferencia do lobby passaria a
  // depender de qual imagem esta instalada NAQUELA maquina -- e comparar duas
  // capturas deixaria de significar alguma coisa. Nao grava nada.
  if (process.env['QB_FUNDO'] === 'off') query = `${query}${query ? '&' : '?'}fundo=off`;

  // QB_ALPHA=1 devolve o canal alfa a camada estatica do quadro.
  //
  // Instrumento para o B18 (rastro ao dar zoom). A camada estatica e criada com
  // `alpha: false`, e essa e a UNICA coisa no nosso codigo que muda como o
  // compositor trata aquela superficie -- canvas opaco segue um caminho
  // diferente do translucido. Ver o comentario inteiro em render/Renderer.ts.
  //
  // Fica ao lado do QB_GPU de propósito: aquele mexe no Chromium por fora, este
  // mexe no que NOS pedimos a ele. Se o rastro responde a este, a caçada sai da
  // linha de comando e volta para o repositorio.
  if (process.env['QB_ALPHA'] === '1') query = `${query}${query ? '&' : '?'}alpha=1`;

  // QB_DESYNC=1 liga `desynchronized` nos dois canvas do quadro.
  //
  // O outro instrumento para o B18, e o ultimo do nosso lado: ele muda a ENTREGA
  // do quadro a tela, e o fantasma sao dois frames entregues juntos. Ver o
  // comentario em render/Renderer.ts, inclusive por que PIORAR tambem informa.
  if (process.env['QB_DESYNC'] === '1') query = `${query}${query ? '&' : '?'}desync=1`;

  // O modo de composicao EFETIVO vai para a pagina, para o F3 do menu poder
  // dizer "CPU" ou "GPU" ao lado da cadencia -- sem isso, um numero ruim nao
  // diria se e a opcao de compatibilidade ou uma execucao com `QB_GPU` trocado.
  query = `${query}${query ? '&' : '?'}gpu=${gpuModo}`;

  // Os modos de verificacao terminam imprimindo um marcador. Fechar a janela
  // nesse ponto e o que torna `QB_IMPORT`/`--selftest`/`QB_BENCH` utilizaveis
  // dentro de um script: sem isso o processo fica aberto esperando alguem
  // clicar no X, e quem chamou nunca recebe a saida.
  const done = bench
    ? 'BENCH_RESULT'
    : benchLobby
      ? 'LOBBYBENCH_FIM'
      : benchQuadro
      ? 'QUADROBENCH_FIM'
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
        // O processo principal travado congela a JANELA (mouse, teclado) sem
        // parar o desenho da pagina -- o cronometro do renderer nao ve isso.
        // Este mede o atraso do laco de eventos daqui por 12 s.
        let ultimo = Date.now();
        let piorAtraso = 0;
        let piorEm = 0;
        const inicio = ultimo;
        const relogio = setInterval(() => {
          const agora = Date.now();
          const atraso = agora - ultimo - 16;
          if (atraso > piorAtraso) {
            piorAtraso = atraso;
            piorEm = ultimo - inicio;
          }
          // Na hora, e nao so no fim: o teste pode fechar o app antes dos 12 s.
          if (atraso > 50) console.log(`[main] processo principal travou ${atraso} ms (em +${ultimo - inicio} ms do Ctrl+V)`);
          ultimo = agora;
        }, 16);
        setTimeout(() => {
          clearInterval(relogio);
          console.log(`[main] pior atraso do processo principal: ${piorAtraso} ms (em +${piorEm} ms do Ctrl+V)`);
        }, 12000);
        // `QB_PASTE=grande` abre antes o maior quadro da pasta: da tempo de ele
        // carregar e assentar antes do Ctrl+V.
      }, pasteCheck === 'grande' ? 7000 : 1200);
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

// (O QB_PERFIL fica no topo do arquivo, antes do modo de composicao.)

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

  // Antes de qualquer janela: vale para toda pagina que o app criar.
  blindarPaginas();

  void app.whenReady().then(() => {
    // Durante o selftest (tambem no empacotado, pelo check:dist), registra toda
    // travada do processo principal acima de 100 ms: ela congela a janela sem
    // parar o desenho da pagina, e nenhuma guarda do renderer a ve.
    if (process.env['QB_SELFTEST']) {
      let ultimo = Date.now();
      setInterval(() => {
        const agora = Date.now();
        const atraso = agora - ultimo - 50;
        if (atraso > 100) console.log(`[main] processo principal travou ${atraso} ms`);
        ultimo = agora;
      }, 50).unref();
    }

    // Permissoes negadas e rede bloqueada -- ver `blindagem.ts`. Em
    // desenvolvimento, so o servidor do Vite passa.
    blindarSessao(isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined);
    // O idioma do Windows ate a pagina dizer qual vale (ela avisa ao iniciar,
    // com a escolha de Configuracoes se houver). Ver `renderer/idioma.ts`.
    definirIdioma(idiomaDoSistema(app.getPreferredSystemLanguages()));
    // QB_DIAG=1 imprime no terminal quais recursos graficos estao acelerados.
    // "O que esta em software" e metade da resposta em qualquer problema de
    // composicao -- foi assim que se descartou [...] no B8.
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
    registerAppIpc(gpuModo === MODO_COMPAT);
    registerBoardIpc();
    registerImportIpc();
    registerFundoIpc();
    registerPastasIpc();
    registerExportIpc();
    registerOcrIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
