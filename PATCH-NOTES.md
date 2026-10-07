# Creation Board 1.1.0

**Português** · [English](#english)

## O que há de novo

### Primeiros passos
- Um **tutorial guiado** na primeira abertura ilumina cada botão do menu e termina criando o seu primeiro quadro. Dentro do quadro, outro passo a passo apresenta cada ferramenta.
- Os dois podem ser pulados, e revistos em **Configurações → Tutorial**.

### Menu principal repaginado
- **Foto de fundo**, uma por tema (praia no claro, céu estrelado no escuro), trocável em **Configurações** por uma imagem sua.
- Os quadros ficam num **painel de vidro** com desfoque discreto, que deixa o fundo aparecer.
- Título novo, na mesma assinatura da logo, e o caminho da pasta de quadros num selo discreto.
- **Configurações** redesenhada: seções em cartões, uma frase por opção, a miniatura de cada fundo e um botão **Aplicar alterações**.
- Na primeira abertura, o app segue o tema do Windows: claro ou escuro. A **tela de abertura** também segue o tema, sem piscar escuro antes do claro.
- A grade de quadros rola **dentro do painel**: título, busca e botões ficam sempre à vista.
- A busca em todos os quadros ficou centralizada, e levanta como os botões ao passar o mouse.
- Tela principal reequilibrada: a busca e os quadros no mesmo painel de vidro, com margens iguais e a busca sempre à vista; título e botões numa linha só.
- Um **+** no fim da grade cria um quadro ou uma pasta, sem subir até o cabeçalho.
- Com a biblioteca vazia, a tela inicial oferece **Criar quadro novo** ao lado de importar, e ensina o `Ctrl+N`.

### Criar, salvar e fechar
- **`Ctrl+N`** cria um quadro novo, no menu ou de dentro de um quadro.
- Dê **nome** ao quadro já ao criar: ele nasce salvo.
- Fechar o app com um quadro não salvo **avisa** que o progresso será perdido e oferece salvar antes.
- Corrigido: depois de sair de um quadro sem salvar, o X do Windows não fechava mais o app.

### Pastas
- Crie pastas com **Nova pasta** ou **arrastando um quadro sobre outro**.
- Arraste quadros para dentro e para fora das pastas. A pasta abre numa janela, com a tela principal à vista.
- Renomear e excluir pastas **nunca apaga quadros**: excluir uma pasta só devolve os quadros para a tela principal.

### Animações
- O menu ganhou movimento: cards entram em sequência, o quadro arrastado acompanha o mouse, e a pasta reage ao receber um quadro.
- Três níveis em **Configurações**: Desligadas, Ligadas e **Máximas**, que é como o app abre na primeira vez.
- Arrastar ficou fluido: 144 quadros por segundo em monitor de 144 Hz.
- Corrigido: com o mouse parado na borda de um quadro ou botão, ele ficava subindo e descendo sem parar. Agora fica levantado e parado. Com uma pasta aberta, os quadros também não tremem mais todos juntos.

### Português e inglês
- O app inteiro em **português do Brasil** e **inglês americano**, incluindo o instalador. Na primeira abertura, segue o idioma do Windows: português do Brasil abre em português, e qualquer outro idioma abre em inglês. Dá para trocar em **Configurações**.
- Todos os textos em português foram revisados: acentos, plurais e termos consistentes.

### Quadro
- Redimensionar texto **não distorce mais as letras**: o canto muda o tamanho da fonte e a lateral muda a largura da caixa.
- **Negrito, itálico e sublinhado** enquanto se digita, numa palavra só.
- **Cor do texto já escrito**: selecione um trecho e escolha a cor no menu de Texto; com `Ctrl+A` dentro da caixa, muda o texto todo. Com a caixa selecionada no quadro, muda a caixa inteira.
- A barra de **tamanho** do menu de Texto muda o texto que você está escrevendo, ou o selecionado, sem fechar a caixa (antes, só valia para o próximo texto).
- Uma barra só, com ícones novos, e as opções da ferramenta num painel que sobe da barra.
- Tema claro mais confortável para a vista.
- A borracha apaga em traço contínuo e não trava mais com zoom alto.
- Arrastar o quadro ficou mais leve, e o zoom rápido com `Ctrl`+roda não trava mais, mesmo em quadros grandes.
- Os botões de zoom da barra vão até 100%, a escala real; `Ctrl`+roda continua aproximando até 6400%.
- **Régua** e **pontilhado** vêm desligados no primeiro uso, e o app lembra como você os deixou: a mesma escolha vale para todos os quadros.
- Uma print colada ou arrastada para o quadro já entra na busca (`Ctrl+F`) na hora, sem precisar reabrir o quadro — e sem travar a janela.

### Desempenho
- Arrastar um quadro de mais de mil objetos acompanha um monitor de 144 Hz.
- **Compatibilidade gráfica**, em **Configurações**: se no seu computador a tela piscar, ou o desenho aparecer duplicado ao dar zoom, ligue a opção e abra o app de novo. A tela passa a ser montada pelo processador em vez da placa de vídeo — um pouco menos fluido, mas sem esses defeitos.

### Segurança e privacidade
- Fotos coladas num quadro **não levam mais os dados escondidos da imagem** (localização de GPS, modelo do celular, data) para o arquivo nem para o SVG exportado.
- O app bloqueia qualquer acesso à internet e todas as permissões do navegador. Nada sai do seu computador.
- Arquivos compactados maliciosos e caminhos de arquivo fora da pasta de quadros são recusados.
- Detalhes em [SECURITY.md](SECURITY.md).

### Para quem vem da 1.0.0
Seus quadros continuam na mesma pasta (`C:\Creation Board`) e abrem normalmente. Um quadro antigo sai sem os dados escondidos das imagens na próxima vez que for salvo.

---

<a id="english"></a>

# Creation Board 1.1.0

[Português](#creation-board-110) · **English**

## What's new

### First steps
- A **guided tutorial** on first launch highlights each button on the home screen and ends by creating your first board. Inside the board, another walkthrough introduces each tool.
- Both can be skipped, and replayed in **Settings → Tutorial**.

### Redesigned home screen
- **Background photo**, one per theme (a beach in light, a starry sky in dark), which you can replace with your own image in **Settings**.
- Your boards sit on a **glass panel** with a subtle blur that lets the background show through.
- A new title that matches the logo, and the boards folder path in a discreet badge.
- Redesigned **Settings**: sections in cards, one sentence per option, a thumbnail of each background, and an **Apply changes** button.
- On first launch, the app follows the Windows theme: light or dark. The **splash screen** follows the theme too, with no dark flash before the light one.
- The board grid scrolls **inside the panel**: the title, search and buttons always stay in view.
- The search across all boards is now centered, and lifts like the buttons on hover.
- A rebalanced home screen: the search and the boards share one glass panel, with even margins and the search always in view; the title and buttons sit on a single line.
- A **+** at the end of the grid creates a board or a folder, without going up to the header.
- With an empty library, the home screen offers **Create a new board** next to importing, and teaches `Ctrl+N`.

### Create, save and close
- **`Ctrl+N`** creates a new board, from the home screen or from inside a board.
- **Name** a board as you create it: it starts out saved.
- Closing the app with an unsaved board **warns** that the progress will be lost and offers to save first.
- Fixed: after leaving a board without saving, the Windows X button no longer closed the app.

### Folders
- Create folders with **New folder** or by **dragging one board onto another**.
- Drag boards into and out of folders. A folder opens in a window, with the home screen still in view.
- Renaming or deleting a folder **never deletes boards**: deleting a folder just sends its boards back to the home screen.

### Animations
- The home screen now moves: cards come in one after another, the dragged board follows the mouse, and folders react when they receive a board.
- Three levels in **Settings**: Off, On and **Maximum**, which is how the app opens the first time.
- Dragging is smooth: 144 frames per second on a 144 Hz monitor.
- Fixed: with the mouse resting on the edge of a board or button, it kept moving up and down nonstop. Now it stays lifted and still. With a folder open, the boards no longer shake all together either.

### Portuguese and English
- The whole app in **Brazilian Portuguese** and **US English**, including the installer. On first launch it follows the Windows language: Brazilian Portuguese opens in Portuguese, and any other language opens in English. You can switch in **Settings**.

### Board
- Resizing text **no longer distorts the letters**: the corner changes the font size and the side changes the box width.
- **Bold, italic and underline** while typing, on a single word.
- **Color of text already written**: select a passage and pick a color in the Text menu; with `Ctrl+A` inside the box, the whole text changes. With the box selected on the board, the whole box changes.
- The **size** slider in the Text menu changes the text you're typing, or the selected one, without closing the box (before, it only applied to the next text).
- A single toolbar with new icons, and tool options in a panel that rises from the bar.
- A lighter theme that's easier on the eyes.
- The eraser erases in a continuous stroke and no longer freezes at high zoom.
- Dragging a board is lighter, and fast `Ctrl`+wheel zooming no longer stutters, even on large boards.
- The zoom buttons on the bar go up to 100%, the real scale; `Ctrl`+wheel still zooms in up to 6400%.
- **Rulers** and the **dot grid** start off on first use, and the app remembers how you left them: the same choice applies to every board.
- A screenshot pasted or dragged into a board is searchable (`Ctrl+F`) right away, without reopening the board — and without freezing the window.

### Performance
- Panning a board with over a thousand objects keeps up with a 144 Hz monitor.
- **Graphics compatibility**, in **Settings**: if the screen flickers on your computer, or the drawing appears doubled when zooming, turn it on and reopen the app. The screen is then composed by the processor instead of the graphics card — a little less smooth, but without those glitches.

### Security and privacy
- Photos pasted into a board **no longer carry hidden image data** (GPS location, phone model, date) into the file or the exported SVG.
- The app blocks all internet access and every browser permission. Nothing leaves your computer.
- Malicious compressed files and file paths outside the boards folder are rejected.
- Details in [SECURITY.md](SECURITY.md) (in Portuguese).

### Coming from 1.0.0
Your boards stay in the same folder (`C:\Creation Board`) and open as usual. An older board drops the hidden image data the next time it's saved.
