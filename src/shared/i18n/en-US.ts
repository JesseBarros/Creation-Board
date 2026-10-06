/**
 * ENGLISH (UNITED STATES) -- tipado contra o portugues (`pt-BR.ts`): toda chave
 * de la existe aqui, com os mesmos parametros. Ver `index.ts`.
 *
 * Escrito como texto de aplicativo em ingles americano, e nao traduzido palavra
 * por palavra: frase curta, sentence case nos botoes ("New board", e nao "New
 * Board"), contracoes onde o tom da interface pede ("can't", "isn't"), e a mesma
 * palavra para a mesma acao -- DELETE apaga, REMOVE FROM FOLDER so desagrupa.
 *
 * Termos do app: quadro = board, pasta = folder, menu principal = home screen,
 * miniatura = thumbnail.
 */

import { formatarNumero } from './estado';
import type { Traducao } from './index';

const plural = (n: number, um: string, varios: string): string =>
  n === 1 ? `1 ${um}` : `${formatarNumero(n)} ${varios}`;

export const enUS: Traducao = {
  // ------------------------------------------------------------ comum
  'comum.cancelar': 'Cancel',
  'comum.fechar': 'Close',
  'comum.criar': 'Create',
  'comum.renomear': 'Rename',
  'comum.excluir': 'Delete',
  'comum.ok': 'OK',

  // ------------------------------------------------------------ menu principal
  'lobby.pastaDosQuadros': 'My boards',
  'lobby.abrirPastaNoExplorador': 'Open the boards folder in File Explorer',
  'lobby.abrirPastaNoExploradorCom': (caminho) => `Open the boards folder in File Explorer\n${caminho}`,
  'lobby.alternarTema': 'Toggle theme',
  'lobby.paraTemaClaro': 'Switch to light theme',
  'lobby.paraTemaEscuro': 'Switch to dark theme',
  'lobby.configuracoes': 'Settings',
  'lobby.novaPasta': 'New folder',
  'lobby.importarArquivo': 'Import file',
  'lobby.importarDica': 'Open a board exported from another app (.zip or .html)',
  'lobby.novoQuadro': 'New board',
  'lobby.vazioTitulo': 'No saved boards yet.',
  'lobby.vazioDica': 'Create a new board and save it with Ctrl+S — it will show up here with a thumbnail.',
  'lobby.vazioImportar': 'Import a board from another app',
  'lobby.vazioDemonstracao': 'Open the demo board',
  'lobby.semMiniatura': 'No thumbnail',
  'lobby.metaDoCard': (data, objetos, tamanho) => `${data} · ${plural(objetos, 'object', 'objects')} · ${tamanho}`,
  'lobby.erroLerPasta': (erro) => `Couldn't read the boards folder: ${erro}`,
  'lobby.erroSalvarPastas': (erro) => `Couldn't save the folders: ${erro}`,

  // pastas
  'pasta.semNome': 'Untitled folder',
  'pasta.vazia': 'Empty',
  'pasta.contagem': (n) => (n === 0 ? 'Empty' : plural(n, 'board', 'boards')),
  'pasta.rotuloDaJanela': (nome) => `Folder ${nome}`,
  'pasta.rotuloDoCard': (nome, contagem) => `Folder ${nome}, ${contagem.toLowerCase()}`,
  'pasta.renomearEsta': 'Rename this folder',
  'pasta.renomearEstaAtalho': 'Rename this folder (F2)',
  'pasta.excluirEsta': 'Delete this folder',
  'pasta.excluirEstaDica': 'Delete this folder (the boards stay)',
  'pasta.fecharJanela': 'Close the folder (Esc)',
  'pasta.janelaVazia': 'This folder is empty. Drag boards here from the home screen.',
  'pasta.nomePadrao': 'New folder',
  'pasta.dialogoNovaTitulo': 'New folder',
  'pasta.dialogoNome': 'Folder name',
  'pasta.dialogoNomeComDois': 'Name for the folder with both boards',
  'pasta.dialogoRenomearTitulo': 'Rename folder',
  'pasta.dialogoExcluirTitulo': 'Delete folder',
  'pasta.dialogoExcluirMensagem': (nome, n) =>
    `The folder "${nome}" will be removed, and ` +
    (n === 1 ? 'the board inside it goes' : `the ${formatarNumero(n)} boards inside it go`) +
    ' back to the home screen. No boards are deleted.',
  'pasta.excluida': (nome) => `Folder "${nome}" deleted.`,
  'pasta.tirarDesta': 'Remove from this folder',
  'pasta.tirarDestaDica': 'Remove from this folder (the board stays saved)',
  'pasta.quadroSaiuDe': (quadro, pasta) => `"${quadro}" was removed from the folder "${pasta}".`,
  'pasta.quadroSaiu': (quadro) => `"${quadro}" was removed from the folder.`,
  'pasta.quadroFoiPara': (quadro, pasta) => `"${quadro}" was moved to the folder "${pasta}".`,

  // quadro, no menu
  'quadro.excluirEste': 'Delete this board',
  'quadro.dialogoExcluirTitulo': 'Delete board',
  'quadro.dialogoExcluirMensagem': (nome) => `"${nome}" will be deleted from disk. This can't be undone.`,
  'quadro.excluido': (nome) => `"${nome}" deleted.`,
  'quadro.erroExcluir': (erro) => `Couldn't delete: ${erro}`,

  // ------------------------------------------------------------ dialogos
  'dialogo.salvar': 'Save',
  'dialogo.confirmar': 'Confirm',

  // novo quadro: o papel
  'papel.neutro': 'Neutral',
  'papel.azul': 'Blue',
  'papel.verde': 'Green',
  'papel.areia': 'Sand',
  'papel.rosa': 'Pink',
  'papel.lilas': 'Lilac',
  'papel.menta': 'Mint',
  'papel.rotulo': (nome) => `${nome} paper`,
  'novoQuadro.titulo': 'New board',
  'novoQuadro.mensagem':
    'Choose the paper. A lightly tinted background makes sticky notes and highlights stand out more than white does.',
  'novoQuadro.criar': 'Create board',

  // sair com alteracoes pendentes
  'naoSalvo.titulo': 'Unsaved changes',
  'naoSalvo.mensagem': (nome) => `“${nome}” has changes that haven't been saved yet.`,
  'naoSalvo.sairSemSalvar': "Don't save",
  'naoSalvo.salvarESair': 'Save and leave',

  // exportar
  'exportar.titulo': 'Export board',
  'exportar.tamanho': (largura, altura) => `${formatarNumero(largura)} × ${formatarNumero(altura)} px`,
  'exportar.vetorial': 'Vector: sharp at any zoom, with no fixed resolution.',
  'exportar.pdfLimitado': (tamanho, cabe, pedida) =>
    `${tamanho} — a single page only fits ${formatarNumero(cabe, { maximumFractionDigits: 2 })}x, not ${pedida}x. ` +
    `For a true ${pedida}x, export as PNG.`,
  'exportar.variosArquivos': (tamanho, arquivos, escala) =>
    `${tamanho} in ${formatarNumero(arquivos)} files, at a true ${escala}x.`,
  'exportar.muitos': " That's a lot — consider 1x, or SVG.",
  'exportar.umArquivo': (tamanho) => `${tamanho}, one file.`,
  'exportar.resolucao': 'Resolution',
  'exportar.formato': 'Format',
  'exportar.oQue': 'What',
  'exportar.selecao': 'Selection',
  'exportar.quadroTodo': 'Whole board',
  'exportar.fundo': 'Background',
  'exportar.comFundo': 'With background',
  'exportar.transparente': 'Transparent',
  'exportar.exportar': 'Export',

  // configuracoes
  'config.titulo': 'Settings',
  'config.secaoGeral': 'General',
  'config.secaoAparencia': 'Appearance',
  'config.secaoDesempenho': 'Performance',
  'config.idioma': 'Language',
  'config.idiomaDica': 'Takes effect when you apply changes.',
  'config.animacoes': 'Animations',
  'config.animDesligadas': 'Off',
  'config.animLigadas': 'On',
  'config.animMaximas': 'Maximum',
  'config.animDicaOff': 'No transitions — for anyone who prefers less motion.',
  'config.animDicaOn': 'Smooth transitions on the home screen and buttons.',
  'config.animDicaMax': 'Boards bounce, tilt as you drag, and folders react.',
  'config.fundoClaro': 'Light theme background',
  'config.fundoEscuro': 'Dark theme background',
  'config.trocarImagem': 'Change…',
  'config.restaurarPadrao': 'Restore default',
  'config.imagemPadrao': 'Default image',
  'config.fundoDica': 'The chosen image is copied into the boards folder.',
  'config.compat': 'Graphics compatibility',
  'config.compatDesligada': 'Off',
  'config.compatLigada': 'On',
  'config.compatDica': 'Fixes a flickering screen or doubled drawing when zooming, at a small cost in smoothness.',
  'config.aplicar': 'Apply changes',
  'config.aplicarRecarrega': 'The window reloads to apply.',
  'config.aplicarReabre': 'The app closes and reopens to apply.',

  // ------------------------------------------------------------ quadro (App)
  'quadro.semNome': 'Untitled board',
  'quadro.nomeDemonstracao': 'Demo',
  'quadro.nomeDeArquivo': 'board',
  'quadro.dicaVazioHtml':
    '<strong>Empty board.</strong> Pick the pen (<kbd>P</kbd>) and start drawing.<br>' +
    'Import a board from the home screen, or press <kbd>F3</kbd> to generate a test load and ' +
    '<kbd>F1</kbd> to see the shortcuts.',
  'quadro.erroAbrirNome': (nome, erro) => `Couldn't open “${nome}”: ${erro}`,
  'quadro.erroAbrir': (erro) => `Couldn't open the board: ${erro}`,
  'quadro.salvarTitulo': 'Save board',
  'quadro.salvarNome': 'Board name',
  'quadro.erroSalvar': (erro) => `Couldn't save: ${erro}`,

  'progresso.gerando': (n) => `Generating ${formatarNumero(n)} objects…`,
  'progresso.importando': (n) => (n === 1 ? 'Importing 1 file…' : `Importing ${formatarNumero(n)} files…`),
  'progresso.exportando': (formato) => `Exporting ${formato}…`,
  'progresso.exportandoParte': (parte, total) =>
    `Exporting PNG… part ${formatarNumero(parte)} of ${formatarNumero(total)}`,

  'importar.resultado': (quadros, objetos, comAvisos) =>
    (quadros === 1 ? '1 board imported' : `${formatarNumero(quadros)} boards imported`) +
    ` — ${plural(objetos, 'object', 'objects')}` +
    (comAvisos > 0 ? `, ${formatarNumero(comAvisos)} with warnings.` : '.'),

  'exportar.quadroVazio': "The board is empty — there's nothing to export.",
  'exportar.erroMedir': "Couldn't measure the area to export.",
  'exportar.avisoPdf': (cabe, pedida) =>
    ` (a single page only fits ${formatarNumero(cabe, { maximumFractionDigits: 2 })}x; for ${pedida}x, export as PNG)`,
  'exportar.feito': (caminho, aviso) => `Exported to ${caminho}${aviso}`,
  'exportar.erro': (erro) => `Couldn't export: ${erro}`,

  'imagem.erroInserir': (nomes) => `Couldn't insert: ${nomes}`,
  'imagem.recusadas': (n, nomes) =>
    n === 1 ? `1 file was rejected: ${nomes}` : `${formatarNumero(n)} files were rejected: ${nomes}`,

  'cor.ondeAmbos': 'in both themes',
  'cor.ondeClaro': 'in the light theme',
  'cor.ondeEscuro': 'in the dark theme',
  'cor.contrasteBaixo': (cor, onde, exibida) =>
    `${cor} has low contrast ${onde} and will be shown as ${exibida} so it doesn't disappear.`,

  // menu de contexto do quadro
  'menu.editarTexto': 'Edit text',
  'menu.tirarMarcadores': 'Remove bullets',
  'menu.listaComMarcadores': 'Bulleted list',
  'menu.desafixar': 'Unpin from screen',
  'menu.fixar': 'Pin to screen',
  'menu.cortarImagem': 'Crop image',
  'menu.duploClique': 'Double-click',
  'menu.removerCorte': 'Remove crop',
  'menu.desfazer': 'Undo',
  'menu.refazer': 'Redo',
  'menu.copiar': 'Copy',
  'menu.recortar': 'Cut',
  'menu.colarAqui': 'Paste here',
  'menu.duplicar': 'Duplicate',
  'menu.trazerParaFrente': 'Bring to front',
  'menu.enviarParaTras': 'Send to back',
  'menu.selecionarTudo': 'Select all',
  'menu.excluir': (n) => (n > 1 ? `Delete ${formatarNumero(n)} objects` : 'Delete'),

  // ------------------------------------------------------------ barra de ferramentas
  'ferramenta.selecionar': 'Select',
  'ferramenta.caneta': 'Pen',
  'ferramenta.marcaTexto': 'Highlighter',
  'ferramenta.texto': 'Text',
  'ferramenta.postit': 'Sticky note',
  'ferramenta.formas': 'Shapes',
  'ferramenta.borracha': 'Eraser',
  'ferramenta.comTecla': (nome, tecla) => `${nome} (${tecla})`,
  'alerta.importante': 'Important',
  'alerta.duvida': 'Question',
  'alerta.revisar': 'Review',
  'alerta.rotulo': (nivel) => `Flag: ${nivel}`,
  'alerta.nenhum': 'No flag',
  'forma.retangulo': 'Rectangle (Shift: square)',
  'forma.quadrado': 'Square',
  'forma.elipse': 'Ellipse (Shift: circle)',
  'forma.circulo': 'Circle',
  'forma.triangulo': 'Triangle',
  'forma.losango': 'Diamond',
  'forma.linha': 'Line (Shift: 15° steps)',
  'forma.seta': 'Arrow (Shift: 15° steps)',
  'formato.negrito': 'Bold (Ctrl+B)',
  'formato.italico': 'Italic (Ctrl+I)',
  'formato.sublinhado': 'Underline (Ctrl+U)',
  'formato.alinharEsquerda': 'Align left',
  'formato.centralizar': 'Center',
  'formato.alinharDireita': 'Align right',
  'borracha.porPeca': 'Erase by piece: only what the eraser covers disappears',
  'borracha.tracoInteiro': 'Erase the whole stroke the eraser touches',
  'postit.cor': (cor) => `Sticky note color ${cor}`,
  'forma.preencher': 'Fill the shape',
  'forma.preencherDica': 'Fill the shape (translucent, in the outline color)',
  'cor.rotulo': (cor) => `Color ${cor}`,
  'cor.escolhida': (cor) => `${cor} (chosen)`,
  'cor.escolherOutra': 'Choose another color',
  'espessura.fonte': 'Font size',
  'espessura.diametro': 'Diameter',
  'espessura.espessura': 'Thickness',
  'espessura.dica': (nome, px) => `${nome}: ${formatarNumero(px)} px ([ and ] step by 10%)`,

  // ------------------------------------------------------------ atalhos (F1)
  'atalhos.titulo': 'Shortcuts and commands',
  'atalhos.fechar': 'Close (Esc)',
  'atalhos.ou': 'or',
  'atalhoGrupo.arquivo': 'File',
  'atalhoGrupo.navegacao': 'Navigation',
  'atalhoGrupo.zoom': 'Zoom',
  'atalhoGrupo.editar': 'Edit',
  'atalhoGrupo.ferramentas': 'Tools',
  'atalhoGrupo.buscar': 'Search',
  'atalhoGrupo.texto': 'Text',
  'atalhoGrupo.encaixe': 'Snapping',
  'atalhoGrupo.selecao': 'Selection',
  'atalhoGrupo.manipular': 'Move and resize',
  'atalhoGrupo.visualizacao': 'View',
  'atalho.salvar': 'Save board',
  'atalho.voltarAoMenu': 'Back to the home screen',
  'atalho.exportar': 'Export as PNG, SVG or PDF',
  'atalho.autosave': 'Saves automatically 3 s after the last change (only after the first Ctrl+S)',
  'atalho.mover': 'Pan the board',
  'atalho.moverTrackpad': 'Pan on the trackpad',
  'atalho.rolarVertical': 'Scroll vertically',
  'atalho.rolarHorizontal': 'Scroll horizontally',
  'atalho.zoomCursor': 'Zoom at the cursor',
  'atalho.zoomTrackpad': 'Zoom on the trackpad',
  'atalho.zoom100': 'Zoom to 100%',
  'atalho.ajustar': 'Fit all content to the screen',
  'atalho.zoomMais': 'Zoom in',
  'atalho.zoomMenos': 'Zoom out',
  'atalho.desfazer': 'Undo',
  'atalho.refazer': 'Redo',
  'atalho.duplicar': 'Duplicate the selection',
  'atalho.copiar': 'Copy',
  'atalho.recortar': 'Cut',
  'atalho.colar': 'Paste at the cursor',
  'atalho.excluir': 'Delete the selection',
  'atalho.ferramentaSelecionar': 'Select',
  'atalho.ferramentaCaneta': 'Pen',
  'atalho.ferramentaMarcaTexto': 'Highlighter (goes under the content)',
  'atalho.buscar': 'Find text on the board',
  'atalho.buscarTodos': 'On the home screen: search ALL boards',
  'atalho.buscarProximo': 'Go to the result; again for the next one',
  'atalho.buscarAnterior': 'Previous result',
  'atalho.buscarFechar': 'Close the search',
  'atalho.ferramentaTexto': 'Text (click to create; drag to set the width)',
  'atalho.ferramentaPostit': 'Sticky note (pick the color and flag in the bar)',
  'atalho.ferramentaFormas': 'Shapes (pick the type in the bar)',
  'atalho.ferramentaBorracha': 'Eraser (erases ink only)',
  'atalho.borrachaModo': 'Eraser: by piece (default) or whole stroke — choose in the bar',
  'atalho.maisFino': 'Thinner stroke (for text, smaller font)',
  'atalho.maisGrosso': 'Thicker stroke (for text, larger font)',
  'atalho.formasModificadores': 'Shapes: Shift locks square/circle/angle, Alt grows from the center',
  'atalho.moverSemCortar': 'Pan the board without breaking the stroke',
  'atalho.editarTexto': 'Edit the selected text box or sticky note',
  'atalho.editarSobCursor': 'Edit the box under the cursor without switching tools',
  'atalho.formatacao': 'Bold, italic and underline (inside the box)',
  'atalho.sairDaCaixa': 'Leave the box keeping the text (Ctrl+Z undoes the whole edit)',
  'atalho.guias': 'Guides appear when you line up with neighbors\' edges and centers',
  'atalho.semEncaixe': 'Ignore snapping for this gesture',
  'atalho.selecionarObjeto': 'Select the object under the cursor',
  'atalho.somarSelecao': 'Add to or remove from the selection',
  'atalho.laco': 'Lasso: select by area',
  'atalho.selecionarTudo': 'Select all',
  'atalho.cancelar': 'Cancel the gesture or clear the selection',
  'atalho.moverSelecao': 'Move (Shift locks to one axis)',
  'atalho.redimensionar': 'Resize (Shift keeps the proportions, Alt anchors at the center)',
  'atalho.girar': 'Rotate (Shift snaps to 15° steps)',
  'atalho.empurrar': 'Move the selection 1 px (Shift: 10 px)',
  'atalho.trazerParaFrente': 'Bring to front',
  'atalho.enviarParaTras': 'Send to back',
  'atalho.grade': 'Toggle the background grid',
  'atalho.reguas': 'Rulers on the edges',
  'atalho.unidadeReguas': 'Ruler units: px or cm',
  'atalho.camadas': 'Layers panel: eye and lock',
  'atalho.ajuda': 'Show this list of shortcuts',
  'atalho.debug': 'Debug panel and test load',
  'atalho.debugMenu': 'On the home screen: performance panel',
  'atalho.benchmark': 'Measure sustained fps',
  'gesto.automatico': 'Automatic',
  'gesto.botaoDireitoArrastar': 'Right-click + drag',
  'gesto.botaoDoMeio': 'Middle button',
  'gesto.doisDedos': 'Two fingers',
  'gesto.roda': 'Mouse wheel',
  'gesto.shiftRoda': 'Shift + wheel',
  'gesto.ctrlRoda': 'Ctrl + wheel',
  'gesto.pinca': 'Pinch',
  'gesto.arrastar': 'Drag',
  'gesto.duploClique': 'Double-click',
  'gesto.ctrlArrastar': 'Ctrl + drag',
  'gesto.clique': 'Click',
  'gesto.shiftClique': 'Shift + click',
  'gesto.arrastarNoVazio': 'Drag on empty space',
  'gesto.arrastarSelecao': 'Drag the selection',
  'gesto.arrastarAlca': 'Drag a handle',
  'gesto.arrastarAlcaDeCima': 'Drag the top handle',

  // ------------------------------------------------------------ barra do quadro
  'barra.voltar': 'Back to boards (Ctrl+O)',
  'barra.salvar': 'Save (Ctrl+S)',
  'barra.salvarNome': (nome) => `Save “${nome}” (Ctrl+S)`,
  'barra.salvarNomeSujo': (nome) => `Save “${nome}” — unsaved changes (Ctrl+S)`,
  'barra.salvoAutomatico': (hora) => `autosaved at ${hora}`,
  'barra.exportar': 'Export as PNG, SVG or PDF (Ctrl+E)',
  'barra.desfazer': 'Undo (Ctrl+Z)',
  'barra.refazer': 'Redo (Ctrl+Shift+Z)',
  'barra.grade': 'Background grid (G)',
  'barra.reguas': 'Rulers on the edges (R)',
  'barra.ajustar': 'Fit to screen (Ctrl+1)',
  'barra.camadas': 'Layers panel (C)',
  'barra.alternarTema': 'Toggle light/dark theme',
  'barra.atalhos': 'Shortcuts and commands (F1)',
  'barra.zoomMenos': 'Zoom out (Ctrl+-)',
  'barra.zoomMais': 'Zoom in (Ctrl++)',
  'barra.niveisDeZoom': 'Zoom levels',

  // busca no quadro
  'busca.placeholder': 'Find on board…',
  'busca.rotulo': 'Find on board',
  'busca.anterior': 'Previous result (Shift+Enter)',
  'busca.proximo': 'Next result (Enter)',
  'busca.fechar': 'Close (Esc)',

  // busca em todos os quadros
  'biblioteca.placeholder': 'Search all boards…',
  'biblioteca.rotulo': 'Search all boards',
  'biblioteca.procurando': 'Searching…',
  'biblioteca.erroLer': "Couldn't read the library.",
  'biblioteca.nadaEncontrado': (termo) => `No results for “${termo}”.`,
  'biblioteca.resumo': (resultados, quadros, falhas) =>
    `${plural(resultados, 'result', 'results')} in ${plural(quadros, 'board', 'boards')}` +
    (falhas === 0
      ? ''
      : falhas === 1
        ? " · 1 board couldn't be read"
        : ` · ${formatarNumero(falhas)} boards couldn't be read`),
  'biblioteca.mais': (n) => `${formatarNumero(n)} more on this board — open it and use Ctrl+F`,
  'biblioteca.deImagem': 'Text read from inside an image',
  'biblioteca.doQuadro': 'Text written on the board',

  // camadas
  'camadas.titulo': 'Layers',
  'camadas.fechar': 'Close the layers panel',
  'camadas.vazio': 'Nothing here yet. This panel lists what is on screen.',
  'camadas.subir': 'Bring forward',
  'camadas.descer': 'Send backward',
  'camadas.mostrar': 'Show',
  'camadas.esconder': 'Hide',
  'camadas.destravar': 'Unlock',
  'camadas.travar': 'Lock',
  'camadas.prefixoPostit': (texto) => `Sticky note: ${texto}`,
  'camadas.postitVazio': 'Empty sticky note',
  'camadas.textoVazio': 'Empty text',
  'camadas.marcaTexto': 'Highlighter',
  'camadas.traco': 'Stroke',
  'camadas.tinta': 'Ink',
  'camadas.forma': 'Shape',
  'camadas.imagem': 'Image',
  'camadas.grupo': 'Group',
  'camadas.retangulo': 'Rectangle',
  'camadas.quadrado': 'Square',
  'camadas.elipse': 'Ellipse',
  'camadas.circulo': 'Circle',
  'camadas.triangulo': 'Triangle',
  'camadas.losango': 'Diamond',
  'camadas.linha': 'Line',
  'camadas.seta': 'Arrow',

  // post-it fixado
  'postit.semTexto': '(empty sticky note)',

  // painel F3 do quadro
  'depuracao.titulo': 'Debug · F3',
  'depuracao.objetos': 'Objects',
  'depuracao.noViewport': 'On screen',
  'depuracao.desenhados': 'Drawn',
  'depuracao.atualizacoes': 'Updates/s',
  'depuracao.cargaDeTeste': 'Test load',
  'depuracao.limpar': 'clear',
  'depuracao.medicao': 'Measurement',
  'depuracao.benchmarkLigar': '▶ benchmark (B)',
  'depuracao.benchmarkParar': '■ stop benchmark (B)',
  'depuracao.benchmarkDica':
    'The benchmark sweeps the camera across the board, redrawing every frame, to measure sustained fps instead of idle fps.',
  'depuracao.renderDica': (ok, aviso) =>
    `Cost of drawing the scene. Green up to ${ok} ms (144 fps), amber up to ${aviso} ms (60 fps).`,
  'depuracao.ocioso': 'idle',
  'depuracao.atualizacoesDica':
    "How many times the screen was redrawn in the last second. It isn't speed: the board only redraws when " +
    'something changes, so moving slowly lowers this number.',
  'depuracao.naoDisponivel': 'n/a',

  // painel F3 do menu
  'painelMenu.titulo': 'Home · F3',
  'painelMenu.cadencia': 'Frame rate',
  'painelMenu.intervaloMedio': 'Average interval',
  'painelMenu.pior': 'Worst (1 s)',
  'painelMenu.composicao': 'Compositing',
  'painelMenu.desfoque': 'Blur',
  'painelMenu.cards': 'Cards',
  'painelMenu.dica':
    'At rest, the frame rate matches the monitor. If it drops while something moves, compositing the screen costs more than a frame.',
  'painelMenu.ligado': 'on',
  'painelMenu.desligado': 'off',
  'painelMenu.quadrosPorSegundo': (n) => `${n} fps`,

  // ------------------------------------------------------------ processo principal
  'arquivo.todos': 'All files',
  'arquivo.imagens': 'Images',
  'arquivo.png': 'PNG image',
  'arquivo.svg': 'SVG vector',
  'arquivo.pdf': 'PDF document',
  'arquivo.quadroExportado': 'Exported board',
  'dialogoNativo.exportarTitulo': 'Export board',
  'dialogoNativo.importarTitulo': 'Import a board from another app',
  'dialogoNativo.importarBotao': 'Import',
  'dialogoNativo.fundoTitulo': 'Choose a background image',
  'dialogoNativo.fundoBotao': 'Use this image',

  'erro.arquivoGrande': (nome, mb, limite) =>
    `“${nome}” is ${formatarNumero(mb, { maximumFractionDigits: 1 })} MB. The limit is ${formatarNumero(limite)} MB.`,
  'erro.naoEImagem': (nome) => `“${nome}” doesn't look like an image. Supported formats: JPEG, PNG, WebP and AVIF.`,
  'erro.dimensoesIlegiveis': (nome) => `Couldn't read the dimensions of “${nome}” — the file looks corrupted.`,
  'erro.ladoGrande': (nome, largura, altura, maximo) =>
    `“${nome}” is ${formatarNumero(largura)} × ${formatarNumero(altura)} pixels, and the longest side allowed is ` +
    `${formatarNumero(maximo)}. Shrink the image before using it as a background.`,
  'erro.megapixels': (nome, mp, limite, mb) =>
    `“${nome}” has ${formatarNumero(mp)} megapixels, over the ${formatarNumero(limite)} limit. ` +
    `An image that size would take ${formatarNumero(mb)} MB of memory just to show scaled down on screen.`,
  'erro.semHtml': (nome) => `No .html file found inside “${nome}”.`,
  'erro.formatoNaoSuportado': (formato) => `Unsupported format: ${formato}`,
  'erro.zipRecusado': (motivo) =>
    `Compressed file rejected: ${motivo}. It may be corrupted or crafted to crash the app.`,
  'erro.zipEntradas': (n) => `more than ${formatarNumero(n)} entries`,
  'erro.zipBytes': (mb) => `more than ${formatarNumero(mb)} MB uncompressed`,
  'erro.arquivoPassaDe': (mb) => `the file is larger than ${formatarNumero(mb)} MB`,
  'erro.versaoNova': (formato, suportado) =>
    `This board was saved by a newer version of Creation Board ` +
    `(format ${formato}; this version reads up to ${suportado}).`,
  'erro.wbdInvalido': 'Invalid .wbd file: required parts are missing.',
  'erro.pastaSemPermissao': (pasta, motivo) =>
    `The boards folder “${pasta}” exists and has saved boards, but it can't be written to (${motivo}). ` +
    `The boards were NOT moved: fix the folder's permissions instead of letting the app save somewhere else.`,
  'erro.pastaImpossivel': (pasta, motivo, alternativa, motivoAlt) =>
    `Couldn't create the boards folder at “${pasta}” (${motivo}) or at “${alternativa}” (${motivoAlt}).`,
  'erro.caminhoInvalido': 'Invalid board path.',
  'erro.caminhoFora': 'Path is outside the boards folder.',
};
