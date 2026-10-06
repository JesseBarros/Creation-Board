/**
 * PORTUGUES DO BRASIL -- o dicionario de referencia (30/09/2026).
 *
 * O ingles (`en-US.ts`) e tipado contra este: toda chave daqui tem de existir la,
 * com os mesmos parametros. Ver `index.ts`.
 *
 * Revisado na migracao: acentos que faltavam ("Nao foi possivel", "demonstracao",
 * "excluido"), plural que nao concordava ("1 objetos"), numero decimal com ponto
 * ("4.8 MB"), e o mesmo verbo para a mesma acao em toda parte -- EXCLUIR apaga,
 * TIRAR DA PASTA so desagrupa, e "apagar" fica para a borracha.
 *
 * As chaves sao agrupadas pela tela onde o texto aparece.
 */

import { formatarNumero } from './estado';

const plural = (n: number, um: string, varios: string): string =>
  n === 1 ? `1 ${um}` : `${formatarNumero(n)} ${varios}`;

export const ptBR = {
  // ------------------------------------------------------------ comum
  'comum.cancelar': 'Cancelar',
  'comum.fechar': 'Fechar',
  'comum.criar': 'Criar',
  'comum.renomear': 'Renomear',
  'comum.excluir': 'Excluir',
  'comum.ok': 'OK',

  // ------------------------------------------------------------ menu principal
  'lobby.pastaDosQuadros': 'Meus quadros',
  'lobby.abrirPastaNoExplorador': 'Abrir a pasta dos quadros no Explorador',
  'lobby.abrirPastaNoExploradorCom': (caminho: string) => `Abrir a pasta dos quadros no Explorador\n${caminho}`,
  'lobby.alternarTema': 'Alternar tema',
  'lobby.paraTemaClaro': 'Mudar para o tema claro',
  'lobby.paraTemaEscuro': 'Mudar para o tema escuro',
  'lobby.configuracoes': 'Configurações',
  'lobby.novaPasta': 'Nova pasta',
  'lobby.importarArquivo': 'Importar arquivo',
  'lobby.importarDica': 'Abrir um quadro exportado de outro aplicativo (.zip ou .html)',
  'lobby.novoQuadro': 'Novo quadro',
  'lobby.vazioTitulo': 'Nenhum quadro salvo ainda.',
  'lobby.vazioDica': 'Crie um quadro novo e salve com Ctrl+S — ele aparece aqui com uma miniatura.',
  'lobby.vazioImportar': 'Importar um quadro de outro aplicativo',
  'lobby.vazioDemonstracao': 'Abrir o quadro de demonstração',
  'lobby.semMiniatura': 'Sem miniatura',
  'lobby.metaDoCard': (data: string, objetos: number, tamanho: string) =>
    `${data} · ${plural(objetos, 'objeto', 'objetos')} · ${tamanho}`,
  'lobby.erroLerPasta': (erro: string) => `Não foi possível ler a pasta de quadros: ${erro}`,
  'lobby.erroSalvarPastas': (erro: string) => `Não foi possível salvar as pastas: ${erro}`,

  // pastas
  'pasta.semNome': 'Pasta sem nome',
  'pasta.vazia': 'Vazia',
  'pasta.contagem': (n: number) => (n === 0 ? 'Vazia' : plural(n, 'quadro', 'quadros')),
  'pasta.rotuloDaJanela': (nome: string) => `Pasta ${nome}`,
  'pasta.rotuloDoCard': (nome: string, contagem: string) => `Pasta ${nome}, ${contagem.toLowerCase()}`,
  'pasta.renomearEsta': 'Renomear esta pasta',
  'pasta.renomearEstaAtalho': 'Renomear esta pasta (F2)',
  'pasta.excluirEsta': 'Excluir esta pasta',
  'pasta.excluirEstaDica': 'Excluir esta pasta (os quadros continuam)',
  'pasta.fecharJanela': 'Fechar a pasta (Esc)',
  'pasta.janelaVazia': 'Esta pasta está vazia. Arraste quadros da tela principal para cá.',
  'pasta.nomePadrao': 'Nova pasta',
  'pasta.dialogoNovaTitulo': 'Nova pasta',
  'pasta.dialogoNome': 'Nome da pasta',
  'pasta.dialogoNomeComDois': 'Nome da pasta com os dois quadros',
  'pasta.dialogoRenomearTitulo': 'Renomear pasta',
  'pasta.dialogoExcluirTitulo': 'Excluir pasta',
  'pasta.dialogoExcluirMensagem': (nome: string, n: number) =>
    `A pasta "${nome}" será desfeita, e ` +
    (n === 1 ? 'o quadro dentro dela volta' : `os ${formatarNumero(n)} quadros dentro dela voltam`) +
    ' para a tela principal. Nenhum quadro é excluído.',
  'pasta.excluida': (nome: string) => `Pasta "${nome}" excluída.`,
  'pasta.tirarDesta': 'Tirar desta pasta',
  'pasta.tirarDestaDica': 'Tirar desta pasta (o quadro continua salvo)',
  'pasta.quadroSaiuDe': (quadro: string, pasta: string) => `"${quadro}" saiu da pasta "${pasta}".`,
  'pasta.quadroSaiu': (quadro: string) => `"${quadro}" saiu da pasta.`,
  'pasta.quadroFoiPara': (quadro: string, pasta: string) => `"${quadro}" foi para a pasta "${pasta}".`,

  // quadro, no menu
  'quadro.excluirEste': 'Excluir este quadro',
  'quadro.dialogoExcluirTitulo': 'Excluir quadro',
  'quadro.dialogoExcluirMensagem': (nome: string) =>
    `"${nome}" será excluído do disco. Esta ação não pode ser desfeita.`,
  'quadro.excluido': (nome: string) => `"${nome}" excluído.`,
  'quadro.erroExcluir': (erro: string) => `Não foi possível excluir: ${erro}`,

  // ------------------------------------------------------------ dialogos
  'dialogo.salvar': 'Salvar',
  'dialogo.confirmar': 'Confirmar',

  // novo quadro: o papel
  'papel.neutro': 'Neutro',
  'papel.azul': 'Azul',
  'papel.verde': 'Verde',
  'papel.areia': 'Areia',
  'papel.rosa': 'Rosa',
  'papel.lilas': 'Lilás',
  'papel.menta': 'Menta',
  'papel.rotulo': (nome: string) => `Papel ${nome}`,
  'novoQuadro.titulo': 'Novo quadro',
  'novoQuadro.mensagem':
    'Escolha o papel. Um fundo levemente colorido faz os post-its e as marcações se destacarem mais do que sobre o branco.',
  'novoQuadro.criar': 'Criar quadro',

  // sair com alteracoes pendentes
  'naoSalvo.titulo': 'Alterações não salvas',
  'naoSalvo.mensagem': (nome: string) => `“${nome}” tem alterações que ainda não foram salvas.`,
  'naoSalvo.sairSemSalvar': 'Sair sem salvar',
  'naoSalvo.salvarESair': 'Salvar e sair',

  // exportar
  'exportar.titulo': 'Exportar quadro',
  'exportar.tamanho': (largura: number, altura: number) =>
    `${formatarNumero(largura)} × ${formatarNumero(altura)} px`,
  'exportar.vetorial': 'Vetorial: legível em qualquer ampliação, sem resolução fixa.',
  'exportar.pdfLimitado': (tamanho: string, cabe: number, pedida: number) =>
    `${tamanho} — numa página só cabe ${formatarNumero(cabe, { maximumFractionDigits: 2 })}x, e não ${pedida}x. ` +
    `Para ${pedida}x de verdade, exporte em PNG.`,
  'exportar.variosArquivos': (tamanho: string, arquivos: number, escala: number) =>
    `${tamanho} em ${formatarNumero(arquivos)} arquivos, a ${escala}x de verdade.`,
  'exportar.muitos': ' São muitos — considere 1x ou o SVG.',
  'exportar.umArquivo': (tamanho: string) => `${tamanho}, um arquivo.`,
  'exportar.resolucao': 'Resolução',
  'exportar.formato': 'Formato',
  'exportar.oQue': 'O que',
  'exportar.selecao': 'Seleção',
  'exportar.quadroTodo': 'Quadro todo',
  'exportar.fundo': 'Fundo',
  'exportar.comFundo': 'Com fundo',
  'exportar.transparente': 'Transparente',
  'exportar.exportar': 'Exportar',

  // configuracoes
  'config.titulo': 'Configurações',
  'config.secaoGeral': 'Geral',
  'config.secaoAparencia': 'Aparência',
  'config.secaoDesempenho': 'Desempenho',
  'config.idioma': 'Idioma',
  'config.idiomaDica': 'A janela recarrega ao trocar.',
  'config.animacoes': 'Animações',
  'config.animDesligadas': 'Desligadas',
  'config.animLigadas': 'Ligadas',
  'config.animMaximas': 'Máximas',
  'config.animDicaOff': 'Sem transições — para quem prefere menos movimento.',
  'config.animDicaOn': 'Transições suaves no menu e nos botões.',
  'config.animDicaMax': 'Quadros saltam, inclinam ao arrastar, e as pastas reagem.',
  'config.fundoClaro': 'Fundo do tema claro',
  'config.fundoEscuro': 'Fundo do tema escuro',
  'config.trocarImagem': 'Trocar…',
  'config.restaurarPadrao': 'Restaurar padrão',
  'config.imagemPadrao': 'Imagem padrão',
  'config.fundoDica': 'A imagem escolhida é copiada para a pasta dos quadros.',
  'config.compat': 'Compatibilidade gráfica',
  'config.compatDesligada': 'Desligada',
  'config.compatLigada': 'Ligada',
  'config.compatDica': 'Corrige tela piscando ou desenho duplicado no zoom, com um pouco menos de fluidez.',
  'config.compatReabrir': 'Vale depois de reabrir o aplicativo.',
  'config.compatReabrirAgora': 'Reabrir agora',

  // ------------------------------------------------------------ quadro (App)
  'quadro.semNome': 'Quadro sem nome',
  'quadro.nomeDemonstracao': 'Demonstração',
  'quadro.nomeDeArquivo': 'quadro',
  'quadro.dicaVazioHtml':
    '<strong>Quadro vazio.</strong> Escolha a caneta (<kbd>P</kbd>) e desenhe.<br>' +
    'Importe um quadro pelo menu principal, ou use <kbd>F3</kbd> para gerar carga de teste e ' +
    '<kbd>F1</kbd> para ver os atalhos.',
  'quadro.erroAbrirNome': (nome: string, erro: string) => `Não foi possível abrir “${nome}”: ${erro}`,
  'quadro.erroAbrir': (erro: string) => `Não foi possível abrir o quadro: ${erro}`,
  'quadro.salvarTitulo': 'Salvar quadro',
  'quadro.salvarNome': 'Nome do quadro',
  'quadro.erroSalvar': (erro: string) => `Não foi possível salvar: ${erro}`,

  'progresso.gerando': (n: number) => `Gerando ${formatarNumero(n)} objetos…`,
  'progresso.importando': (n: number) =>
    n === 1 ? 'Importando 1 arquivo…' : `Importando ${formatarNumero(n)} arquivos…`,
  'progresso.exportando': (formato: string) => `Exportando ${formato}…`,
  'progresso.exportandoParte': (parte: number, total: number) =>
    `Exportando PNG… parte ${formatarNumero(parte)} de ${formatarNumero(total)}`,

  'importar.resultado': (quadros: number, objetos: number, comAvisos: number) =>
    (quadros === 1 ? '1 quadro importado' : `${formatarNumero(quadros)} quadros importados`) +
    ` — ${plural(objetos, 'objeto', 'objetos')}` +
    (comAvisos > 0 ? `, ${formatarNumero(comAvisos)} com avisos.` : '.'),

  'exportar.quadroVazio': 'O quadro está vazio: não há o que exportar.',
  'exportar.erroMedir': 'Não foi possível medir a área a exportar.',
  'exportar.avisoPdf': (cabe: number, pedida: number) =>
    ` (numa página só cabe ${formatarNumero(cabe, { maximumFractionDigits: 2 })}x; para ${pedida}x, exporte em PNG)`,
  'exportar.feito': (caminho: string, aviso: string) => `Exportado para ${caminho}${aviso}`,
  'exportar.erro': (erro: string) => `Não foi possível exportar: ${erro}`,

  'imagem.erroInserir': (nomes: string) => `Não foi possível inserir: ${nomes}`,
  'imagem.recusadas': (n: number, nomes: string) =>
    n === 1 ? `1 arquivo recusado: ${nomes}` : `${formatarNumero(n)} arquivos recusados: ${nomes}`,

  'cor.ondeAmbos': 'nos dois temas',
  'cor.ondeClaro': 'no tema claro',
  'cor.ondeEscuro': 'no tema escuro',
  'cor.contrasteBaixo': (cor: string, onde: string, exibida: string) =>
    `${cor} tem contraste baixo ${onde} e será exibida como ${exibida}, para não sumir.`,

  // menu de contexto do quadro
  'menu.editarTexto': 'Editar texto',
  'menu.tirarMarcadores': 'Tirar os marcadores',
  'menu.listaComMarcadores': 'Lista com marcadores',
  'menu.desafixar': 'Desafixar da tela',
  'menu.fixar': 'Fixar na tela',
  'menu.cortarImagem': 'Cortar imagem',
  'menu.duploClique': 'Duplo clique',
  'menu.removerCorte': 'Remover corte',
  'menu.desfazer': 'Desfazer',
  'menu.refazer': 'Refazer',
  'menu.copiar': 'Copiar',
  'menu.recortar': 'Recortar',
  'menu.colarAqui': 'Colar aqui',
  'menu.duplicar': 'Duplicar',
  'menu.trazerParaFrente': 'Trazer para a frente',
  'menu.enviarParaTras': 'Enviar para trás',
  'menu.selecionarTudo': 'Selecionar tudo',
  'menu.excluir': (n: number) => (n > 1 ? `Excluir ${formatarNumero(n)} objetos` : 'Excluir'),

  // ------------------------------------------------------------ barra de ferramentas
  'ferramenta.selecionar': 'Selecionar',
  'ferramenta.caneta': 'Caneta',
  'ferramenta.marcaTexto': 'Marca-texto',
  'ferramenta.texto': 'Texto',
  'ferramenta.postit': 'Post-it',
  'ferramenta.formas': 'Formas',
  'ferramenta.borracha': 'Borracha',
  'ferramenta.comTecla': (nome: string, tecla: string) => `${nome} (${tecla})`,
  'alerta.importante': 'Importante',
  'alerta.duvida': 'Dúvida',
  'alerta.revisar': 'Revisar',
  'alerta.rotulo': (nivel: string) => `Alerta: ${nivel}`,
  'alerta.nenhum': 'Sem alerta',
  'forma.retangulo': 'Retângulo (Shift: quadrado)',
  'forma.quadrado': 'Quadrado',
  'forma.elipse': 'Elipse (Shift: círculo)',
  'forma.circulo': 'Círculo',
  'forma.triangulo': 'Triângulo',
  'forma.losango': 'Losango',
  'forma.linha': 'Linha (Shift: de 15 em 15 graus)',
  'forma.seta': 'Seta (Shift: de 15 em 15 graus)',
  'formato.negrito': 'Negrito (Ctrl+B)',
  'formato.italico': 'Itálico (Ctrl+I)',
  'formato.sublinhado': 'Sublinhado (Ctrl+U)',
  'formato.alinharEsquerda': 'Alinhar à esquerda',
  'formato.centralizar': 'Centralizar',
  'formato.alinharDireita': 'Alinhar à direita',
  'borracha.porPeca': 'Apagar por peça: some só o que a borracha cobrir',
  'borracha.tracoInteiro': 'Apagar o traço inteiro que a borracha tocar',
  'postit.cor': (cor: string) => `Cor do post-it ${cor}`,
  'forma.preencher': 'Preencher a forma',
  'forma.preencherDica': 'Preencher a forma (translúcido, na cor do contorno)',
  'cor.rotulo': (cor: string) => `Cor ${cor}`,
  'cor.escolhida': (cor: string) => `${cor} (escolhida)`,
  'cor.escolherOutra': 'Escolher outra cor',
  'espessura.fonte': 'Tamanho da fonte',
  'espessura.diametro': 'Diâmetro',
  'espessura.espessura': 'Espessura',
  'espessura.dica': (nome: string, px: number) => `${nome}: ${formatarNumero(px)} px ([ e ] mudam de 10 em 10%)`,

  // ------------------------------------------------------------ atalhos (F1)
  'atalhos.titulo': 'Atalhos e comandos',
  'atalhos.fechar': 'Fechar (Esc)',
  'atalhos.ou': 'ou',
  'atalhoGrupo.arquivo': 'Arquivo',
  'atalhoGrupo.navegacao': 'Navegação',
  'atalhoGrupo.zoom': 'Zoom',
  'atalhoGrupo.editar': 'Editar',
  'atalhoGrupo.ferramentas': 'Ferramentas',
  'atalhoGrupo.buscar': 'Buscar',
  'atalhoGrupo.texto': 'Texto',
  'atalhoGrupo.encaixe': 'Encaixe',
  'atalhoGrupo.selecao': 'Seleção',
  'atalhoGrupo.manipular': 'Mover e ajustar',
  'atalhoGrupo.visualizacao': 'Visualização',
  'atalho.salvar': 'Salvar quadro',
  'atalho.voltarAoMenu': 'Voltar ao menu principal',
  'atalho.exportar': 'Exportar em PNG, SVG ou PDF',
  'atalho.autosave': 'Salva sozinho 3 s depois da última alteração (só depois do primeiro Ctrl+S)',
  'atalho.mover': 'Mover o quadro',
  'atalho.moverTrackpad': 'Mover o quadro no trackpad',
  'atalho.rolarVertical': 'Rolar na vertical',
  'atalho.rolarHorizontal': 'Rolar na horizontal',
  'atalho.zoomCursor': 'Zoom centrado no cursor',
  'atalho.zoomTrackpad': 'Zoom no trackpad',
  'atalho.zoom100': 'Zoom em 100%',
  'atalho.ajustar': 'Ajustar todo o conteúdo à tela',
  'atalho.zoomMais': 'Aumentar o zoom',
  'atalho.zoomMenos': 'Diminuir o zoom',
  'atalho.desfazer': 'Desfazer',
  'atalho.refazer': 'Refazer',
  'atalho.duplicar': 'Duplicar a seleção',
  'atalho.copiar': 'Copiar',
  'atalho.recortar': 'Recortar',
  'atalho.colar': 'Colar na posição do cursor',
  'atalho.excluir': 'Excluir a seleção',
  'atalho.ferramentaSelecionar': 'Selecionar',
  'atalho.ferramentaCaneta': 'Caneta',
  'atalho.ferramentaMarcaTexto': 'Marca-texto (fica por baixo do conteúdo)',
  'atalho.buscar': 'Buscar texto no quadro',
  'atalho.buscarTodos': 'No menu principal: buscar em TODOS os quadros',
  'atalho.buscarProximo': 'Ir para o resultado; de novo, para o próximo',
  'atalho.buscarAnterior': 'Resultado anterior',
  'atalho.buscarFechar': 'Fechar a busca',
  'atalho.ferramentaTexto': 'Texto (clique cria; arrastar define a largura)',
  'atalho.ferramentaPostit': 'Post-it (a cor e o alerta se escolhem na barra)',
  'atalho.ferramentaFormas': 'Formas (o tipo se escolhe na barra)',
  'atalho.ferramentaBorracha': 'Borracha (apaga só tinta)',
  'atalho.borrachaModo': 'Borracha: por peça (padrão) ou traço inteiro — escolha na barra',
  'atalho.maisFino': 'Traço mais fino (no texto, fonte menor)',
  'atalho.maisGrosso': 'Traço mais grosso (no texto, fonte maior)',
  'atalho.formasModificadores': 'Formas: Shift trava quadrado/círculo/ângulo, Alt cresce a partir do centro',
  'atalho.moverSemCortar': 'Mover o quadro sem interromper o traço',
  'atalho.editarTexto': 'Editar a caixa de texto ou o post-it selecionado',
  'atalho.editarSobCursor': 'Editar a caixa sob o cursor, sem trocar de ferramenta',
  'atalho.formatacao': 'Negrito, itálico e sublinhado (dentro da caixa)',
  'atalho.sairDaCaixa': 'Sair da caixa mantendo o texto (Ctrl+Z desfaz a edição inteira)',
  'atalho.guias': 'Guias aparecem ao alinhar com as bordas e o centro dos vizinhos',
  'atalho.semEncaixe': 'Ignorar o encaixe neste gesto',
  'atalho.selecionarObjeto': 'Selecionar o objeto sob o cursor',
  'atalho.somarSelecao': 'Adicionar à seleção ou tirar dela',
  'atalho.laco': 'Laço: selecionar por área',
  'atalho.selecionarTudo': 'Selecionar tudo',
  'atalho.cancelar': 'Cancelar o gesto ou limpar a seleção',
  'atalho.moverSelecao': 'Mover (Shift trava num eixo)',
  'atalho.redimensionar': 'Redimensionar (Shift mantém a proporção, Alt ancora no centro)',
  'atalho.girar': 'Girar (Shift trava de 15 em 15 graus)',
  'atalho.empurrar': 'Mover a seleção 1 px (Shift: 10 px)',
  'atalho.trazerParaFrente': 'Trazer para a frente',
  'atalho.enviarParaTras': 'Enviar para trás',
  'atalho.grade': 'Ligar/desligar a grade de fundo',
  'atalho.reguas': 'Réguas nas bordas',
  'atalho.unidadeReguas': 'Unidade das réguas: px ou cm',
  'atalho.camadas': 'Painel de camadas: olho e cadeado',
  'atalho.ajuda': 'Mostrar esta lista de atalhos',
  'atalho.debug': 'Painel de depuração e carga de teste',
  'atalho.debugMenu': 'No menu principal: painel de desempenho',
  'atalho.benchmark': 'Medir o fps sustentado',
  'gesto.automatico': 'Automático',
  'gesto.botaoDireitoArrastar': 'Botão direito + arrastar',
  'gesto.botaoDoMeio': 'Botão do meio',
  'gesto.doisDedos': 'Dois dedos',
  'gesto.roda': 'Roda do mouse',
  'gesto.shiftRoda': 'Shift + roda',
  'gesto.ctrlRoda': 'Ctrl + roda',
  'gesto.pinca': 'Pinça',
  'gesto.arrastar': 'Arrastar',
  'gesto.duploClique': 'Duplo clique',
  'gesto.ctrlArrastar': 'Ctrl + arrastar',
  'gesto.clique': 'Clique',
  'gesto.shiftClique': 'Shift + clique',
  'gesto.arrastarNoVazio': 'Arrastar no vazio',
  'gesto.arrastarSelecao': 'Arrastar a seleção',
  'gesto.arrastarAlca': 'Arrastar uma alça',
  'gesto.arrastarAlcaDeCima': 'Arrastar a alça de cima',

  // ------------------------------------------------------------ barra do quadro
  'barra.voltar': 'Voltar aos quadros (Ctrl+O)',
  'barra.salvar': 'Salvar (Ctrl+S)',
  'barra.salvarNome': (nome: string) => `Salvar “${nome}” (Ctrl+S)`,
  'barra.salvarNomeSujo': (nome: string) => `Salvar “${nome}” — alterações não salvas (Ctrl+S)`,
  'barra.salvoAutomatico': (hora: string) => `salvo automaticamente às ${hora}`,
  'barra.exportar': 'Exportar em PNG, SVG ou PDF (Ctrl+E)',
  'barra.desfazer': 'Desfazer (Ctrl+Z)',
  'barra.refazer': 'Refazer (Ctrl+Shift+Z)',
  'barra.grade': 'Grade de fundo (G)',
  'barra.reguas': 'Réguas nas bordas (R)',
  'barra.ajustar': 'Ajustar à tela (Ctrl+1)',
  'barra.camadas': 'Painel de camadas (C)',
  'barra.alternarTema': 'Alternar tema claro/escuro',
  'barra.atalhos': 'Atalhos e comandos (F1)',
  'barra.zoomMenos': 'Diminuir o zoom (Ctrl+-)',
  'barra.zoomMais': 'Aumentar o zoom (Ctrl++)',
  'barra.niveisDeZoom': 'Níveis de zoom',

  // busca no quadro
  'busca.placeholder': 'Buscar no quadro…',
  'busca.rotulo': 'Buscar no quadro',
  'busca.anterior': 'Resultado anterior (Shift+Enter)',
  'busca.proximo': 'Próximo resultado (Enter)',
  'busca.fechar': 'Fechar (Esc)',

  // busca em todos os quadros
  'biblioteca.placeholder': 'Buscar em todos os quadros…',
  'biblioteca.rotulo': 'Buscar em todos os quadros',
  'biblioteca.procurando': 'Procurando…',
  'biblioteca.erroLer': 'Não foi possível ler a biblioteca.',
  'biblioteca.nadaEncontrado': (termo: string) => `Nada encontrado para “${termo}”.`,
  'biblioteca.resumo': (resultados: number, quadros: number, falhas: number) =>
    `${plural(resultados, 'resultado', 'resultados')} em ${plural(quadros, 'quadro', 'quadros')}` +
    (falhas === 0
      ? ''
      : falhas === 1
        ? ' · 1 quadro não pôde ser lido'
        : ` · ${formatarNumero(falhas)} quadros não puderam ser lidos`),
  'biblioteca.mais': (n: number) => `mais ${formatarNumero(n)} neste quadro — abra e use Ctrl+F`,
  'biblioteca.deImagem': 'Texto lido de dentro de uma imagem',
  'biblioteca.doQuadro': 'Texto escrito no quadro',

  // camadas
  'camadas.titulo': 'Camadas',
  'camadas.fechar': 'Fechar o painel de camadas',
  'camadas.vazio': 'Nada por aqui. O painel lista o que está na tela.',
  'camadas.subir': 'Trazer para a frente',
  'camadas.descer': 'Enviar para trás',
  'camadas.mostrar': 'Mostrar',
  'camadas.esconder': 'Esconder',
  'camadas.destravar': 'Destravar',
  'camadas.travar': 'Travar',
  'camadas.prefixoPostit': (texto: string) => `Post-it: ${texto}`,
  'camadas.postitVazio': 'Post-it vazio',
  'camadas.textoVazio': 'Texto vazio',
  'camadas.marcaTexto': 'Marca-texto',
  'camadas.traco': 'Traço',
  'camadas.tinta': 'Tinta',
  'camadas.forma': 'Forma',
  'camadas.imagem': 'Imagem',
  'camadas.grupo': 'Grupo',
  'camadas.retangulo': 'Retângulo',
  'camadas.quadrado': 'Quadrado',
  'camadas.elipse': 'Elipse',
  'camadas.circulo': 'Círculo',
  'camadas.triangulo': 'Triângulo',
  'camadas.losango': 'Losango',
  'camadas.linha': 'Linha',
  'camadas.seta': 'Seta',

  // post-it fixado
  'postit.semTexto': '(post-it sem texto)',

  // painel F3 do quadro
  'depuracao.titulo': 'Depuração · F3',
  'depuracao.objetos': 'Objetos',
  'depuracao.noViewport': 'Na tela',
  'depuracao.desenhados': 'Desenhados',
  'depuracao.atualizacoes': 'Atualizações/s',
  'depuracao.cargaDeTeste': 'Carga de teste',
  'depuracao.limpar': 'limpar',
  'depuracao.medicao': 'Medição',
  'depuracao.benchmarkLigar': '▶ benchmark (B)',
  'depuracao.benchmarkParar': '■ parar o benchmark (B)',
  'depuracao.benchmarkDica':
    'O benchmark faz a câmera varrer o quadro redesenhando todo frame, para medir o fps sustentado em vez do fps ocioso.',
  'depuracao.renderDica': (ok: string, aviso: string) =>
    `Custo de desenhar a cena. Verde até ${ok} ms (144 fps), âmbar até ${aviso} ms (60 fps).`,
  'depuracao.ocioso': 'ocioso',
  'depuracao.atualizacoesDica':
    'Quantas vezes a tela foi redesenhada no último segundo. Não é velocidade: o quadro só redesenha quando algo ' +
    'muda, então mover devagar reduz este número.',
  'depuracao.naoDisponivel': 'n/d',

  // painel F3 do menu
  'painelMenu.titulo': 'Menu · F3',
  'painelMenu.cadencia': 'Cadência',
  'painelMenu.intervaloMedio': 'Intervalo médio',
  'painelMenu.pior': 'Pior (1 s)',
  'painelMenu.composicao': 'Composição',
  'painelMenu.desfoque': 'Desfoque',
  'painelMenu.cards': 'Cards',
  'painelMenu.dica':
    'Parado, a cadência fica na taxa do monitor. Se ela cair enquanto algo se mexe, compor a tela está custando mais que um quadro.',
  'painelMenu.ligado': 'ligado',
  'painelMenu.desligado': 'desligado',
  'painelMenu.quadrosPorSegundo': (n: string) => `${n} q/s`,

  // ------------------------------------------------------------ processo principal
  'arquivo.todos': 'Todos os arquivos',
  'arquivo.imagens': 'Imagens',
  'arquivo.png': 'Imagem PNG',
  'arquivo.svg': 'Vetor SVG',
  'arquivo.pdf': 'Documento PDF',
  'arquivo.quadroExportado': 'Quadro exportado',
  'dialogoNativo.exportarTitulo': 'Exportar quadro',
  'dialogoNativo.importarTitulo': 'Importar quadro de outro aplicativo',
  'dialogoNativo.importarBotao': 'Importar',
  'dialogoNativo.fundoTitulo': 'Escolher imagem de fundo',
  'dialogoNativo.fundoBotao': 'Usar esta imagem',

  'erro.arquivoGrande': (nome: string, mb: number, limite: number) =>
    `“${nome}” tem ${formatarNumero(mb, { maximumFractionDigits: 1 })} MB. O limite é ${formatarNumero(limite)} MB.`,
  'erro.naoEImagem': (nome: string) =>
    `“${nome}” não parece uma imagem. Formatos aceitos: JPEG, PNG, WebP e AVIF.`,
  'erro.dimensoesIlegiveis': (nome: string) =>
    `Não foi possível ler as dimensões de “${nome}” — o arquivo parece corrompido.`,
  'erro.ladoGrande': (nome: string, largura: number, altura: number, maximo: number) =>
    `“${nome}” tem ${formatarNumero(largura)} × ${formatarNumero(altura)} pixels, e o maior lado aceito é ` +
    `${formatarNumero(maximo)}. Reduza a imagem antes de usá-la como fundo.`,
  'erro.megapixels': (nome: string, mp: number, limite: number, mb: number) =>
    `“${nome}” tem ${formatarNumero(mp)} megapixels, acima do limite de ${formatarNumero(limite)}. ` +
    `Uma imagem desse tamanho ocuparia ${formatarNumero(mb)} MB de memória para aparecer reduzida na tela.`,
  'erro.semHtml': (nome: string) => `Nenhum .html encontrado dentro de “${nome}”.`,
  'erro.formatoNaoSuportado': (formato: string) => `Formato não suportado: ${formato}`,
  'erro.zipRecusado': (motivo: string) =>
    `Arquivo compactado recusado: ${motivo}. Ele pode estar corrompido ou ter sido montado para travar o aplicativo.`,
  'erro.zipEntradas': (n: number) => `mais de ${formatarNumero(n)} entradas`,
  'erro.zipBytes': (mb: number) => `mais de ${formatarNumero(mb)} MB descompactados`,
  'erro.arquivoPassaDe': (mb: number) => `o arquivo passa de ${formatarNumero(mb)} MB`,
  'erro.versaoNova': (formato: number, suportado: number) =>
    `Este quadro foi salvo por uma versão mais nova do Creation Board ` +
    `(formato ${formato}; esta versão lê até o ${suportado}).`,
  'erro.wbdInvalido': 'Arquivo .wbd inválido: faltam partes obrigatórias.',
  'erro.pastaSemPermissao': (pasta: string, motivo: string) =>
    `A pasta de quadros “${pasta}” existe e tem quadros salvos, mas não aceitou gravação (${motivo}). ` +
    `Os quadros NÃO foram movidos: corrija a permissão da pasta em vez de deixar o app gravar em outro lugar.`,
  'erro.pastaImpossivel': (pasta: string, motivo: string, alternativa: string, motivoAlt: string) =>
    `Não foi possível criar a pasta de quadros em “${pasta}” (${motivo}) nem em “${alternativa}” (${motivoAlt}).`,
  'erro.caminhoInvalido': 'Caminho de quadro inválido.',
  'erro.caminhoFora': 'Caminho fora da pasta de quadros.',
};
