# Guia de uso

Como usar o **Creation Board** no dia a dia: controles, ferramentas, importação e
exportação. Se você ainda não instalou, comece pelo [README](../README.md).

---
## Controles

Todos os atalhos estão dentro do app: tecla **`F1`** (ou o botão `?` na barra
inferior). Essa tela é gerada a partir de
[shortcuts.ts](../src/renderer/shortcuts.ts), o mesmo registro que despacha as
teclas — se o atalho aparece na ajuda, ele funciona.

| Ação | Como |
|---|---|
| Salvar | `Ctrl+S` · autosave 3s depois da última alteração (após o 1º save) |
| Exportar | `Ctrl+E` — PNG, SVG ou PDF; quadro todo ou seleção |
| Voltar ao lobby | `Ctrl+O` |
| Ferramentas | `V` selecionar · `P` caneta · `M` marca-texto · `T` texto · `N` post-it · `F` formas · `E` borracha |
| Espessura do traço | Barra de 0 a 100% na lateral · `[` e `]` andam de 10 em 10% (no texto é o corpo da fonte; na borracha, o diâmetro) |
| Cor | Paleta na lateral · **+** abre o seletor do sistema para cor livre |
| Borracha | `E` · apaga **por peça** (padrão) ou o traço inteiro — escolha na barra |
| Editar texto | `F2` (ou `Enter`) na seleção · duplo clique na caixa |
| Formatar (dentro da caixa) | `Ctrl+B` · `Ctrl+I` · `Ctrl+U` · `Esc` sai mantendo o texto |
| Encaixe | Automático ao arrastar · `Ctrl` ignora · `A` liga a grade magnética |
| Réguas | `R` liga/desliga · `U` troca px ↔ cm |
| Selecionar | Clique · Shift+clique soma · arrastar no vazio faz laço |
| Selecionar tudo / limpar | `Ctrl+A` / `Esc` |
| Buscar | `Ctrl+F` · `Enter` próximo · `Shift+Enter` anterior · `Esc` fecha |
| Imagens | `Ctrl+V` cola · arrastar o arquivo solta onde você soltou |
| Recortar imagem | Duplo clique (ou menu de contexto) · `Enter` confirma · `Esc` descarta |
| Mover · redimensionar · girar | Arrastar a seleção · uma alça · a alça de cima |
| Desfazer / refazer | `Ctrl+Z` / `Ctrl+Shift+Z` (ou `Ctrl+Y`) |
| Duplicar / excluir | `Ctrl+D` / `Delete` |
| Copiar · recortar · colar | `Ctrl+C` · `Ctrl+X` · `Ctrl+V` (cola no cursor) |
| Camadas | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Menu de contexto | Clique direito |
| Pan | **Botão direito + arrastar** · botão do meio · dois dedos no trackpad · roda |
| Pan horizontal | Shift + roda |
| Zoom no cursor | Ctrl + roda · pinça no trackpad |
| Zoom 100% / ajustar à tela | `Ctrl+0` / `Ctrl+1` |
| Aumentar / diminuir zoom | `Ctrl+ +` / `Ctrl+ -` |
| Grade de fundo | `G` |
| Atalhos | `F1` |
| Painel de debug | `F3` |
| Benchmark | `B` |

Faixa de zoom: **1% a 6400%**.

O botão direito acumula dois papéis: **arrastar** move o quadro, **clicar sem
arrastar** abre o menu de contexto. A distinção é por deslocamento — abaixo de 3px
ainda conta como clique, para a tremida natural da mão não cancelar o menu.

## Desenhar

Sete ferramentas na barra vertical à esquerda: seleção, caneta, marca-texto, texto,
post-it, formas e borracha. Com uma delas que produza marca ativa, o painel ao lado
traz cor e espessura (e o tipo de forma, o papel do post-it ou a linha **B / I / U**,
quando for o caso) — e lembra a escolha **por ferramenta**, porque quem grifa de amarelo
e volta para a caneta espera a caneta de antes, não uma caneta amarela grossa.

A **espessura é uma barra de 0 a 100%**, e 0% não é zero: um traço de espessura zero seria
invisível, e uma barra cujo começo não desenha nada tem um pedaço inútil. Cada ferramenta
tem sua faixa (a caneta vai de 1 a 14px; o corpo da fonte, de 10 a 72). A **cor** vem da
paleta ou do seletor do sistema pelo **+** — e cor livre sai da garantia do
`npm run check:colors`, então o app avisa na hora quando a escolhida vai ser **exibida
trocada** para não sumir num dos temas (é o adaptador agindo, não um erro).

As ferramentas de tinta produzem o mesmo `StrokeObject`, que já existia desde a Fase 1 — é
o mesmo tipo que a importação e a carga de teste usam. A caneta *produz* esses objetos;
não inventa nada novo.

Cinco decisões que o código não conta sozinho:

- **O marca-texto entra por baixo de tudo.** Grifar é destacar o que já está no quadro;
  entrando no topo, a faixa translúcida cobriria justamente o texto que se quis
  destacar. A caneta entra por cima, que é onde se espera encontrar o que se
  acabou de escrever. Tudo isso é uma chave de camada (`z`), não ordem de desenho.
- **O lápis foi removido da barra** (04/08/2026, a pedido). Ele era a única ferramenta que
  modulava a espessura pela pressão — e `PointerEvent.pressure` vem sempre 0,5 com mouse,
  então **sem mesa digitalizadora ele era indistinguível da caneta**: dois botões para o
  mesmo traço. A variante `pencil` continua no modelo e no painter, porque quadros salvos
  antes disso têm traços de lápis e precisam continuar sendo desenhados como foram
  criados; o auto-teste rasteriza um deles e exige pixels, para ninguém limpar esse
  caminho achando que é código morto. A pressão continua sendo gravada por ponto: é o que
  uma mesa entrega, e é o que permitiria a caneta modular sozinha se um dia for desejado.
- **A borracha apaga por peça, e só tinta.** Ela tem dois modos, escolhidos na barra:
  **peça** (padrão) remove por onde passa e deixa o resto do traço no lugar, e **traço
  inteiro** remove o objeto que ela toca — dois gestos diferentes, corrigir uma letra e
  limpar uma anotação. Nos dois casos ela ignora texto, post-it e imagem: um gesto largo
  passando por cima de uma caixa de texto apagaria o resumo inteiro sem que ninguém
  tivesse pedido. Para essas, o caminho é selecionar e `Delete`, que mostra o que vai
  sumir antes de sumir. Um gesto de borracha é um passo de undo.
- **O apagamento por peça é máscara, não recorte.** O objeto guarda por onde a borracha
  passou (`erased`) e o buraco aparece no desenho, via `destination-out` num canvas
  intermediário. Recortar a geometria seria mais direto para o traço da caneta e
  **impossível de estender** à caligrafia importada, que é contorno preenchido
  (`PathObject`) e exigiria subtração booleana de contornos. Com máscara, um mecanismo só
  atende os dois, desfazer é remover marcas em vez de recolar cacos, e pintar por cima com
  a cor do fundo — a saída barata — estaria errado nos três lugares onde importa: no tema
  escuro a mancha apareceria clara, o marca-texto por baixo continuaria visível através
  dela, e a miniatura sairia com retângulos brancos. **Só o objeto que tem marca paga o
  canvas intermediário.** Tinta apagada também deixa de responder ao clique, senão
  sobraria um buraco visível que continua agarrando o cursor.
- **O traço em andamento vive na camada de overlay.** O `Scheduler` tem dois níveis de
  sujeira: conteúdo e overlay. Cada ponto de um traço invalida só o de cima, então
  desenhar num quadro de 10 mil objetos não repinta os 10 mil por ponto — que é
  exatamente o custo que a separação em duas camadas do `Renderer` existe para evitar.
  Só ao soltar o botão o traço vira objeto de verdade, via `AddObjects`.

Escrevendo perto da borda dá para **puxar o quadro com o botão direito sem largar o
traço**: pan e ferramenta não disputam o mesmo botão (ver abaixo). O traço continua de
onde parou, no lugar certo do mundo, e sai como um único objeto.

## Formas, encaixe e réguas

**Formas** (`F`) são uma ferramenta só para as seis — retângulo, elipse, triângulo,
losango, linha e seta —, com o tipo escolhido na barra. Seis botões de ferramenta para o
que é a mesma interação, arrastar de um canto ao outro, encheriam a barra sem ensinar
nada. Os modificadores são os mesmos da seleção, para não inventar vocabulário: **Shift**
trava quadrado/círculo (ou o ângulo de 15 em 15 na linha) e **Alt** faz a forma crescer a
partir do centro.

Linha e seta guardam a **direção** em `w`/`h` — o painter vai de `0,0` até `w,h`. Elas
não são normalizadas para o canto superior esquerdo como as formas fechadas; isso viraria
uma seta apontando sempre para baixo e para a direita.

**O encaixe** age ao mover, ao redimensionar e ao criar. Duas fontes, nesta ordem:

1. **Vizinhos** — as bordas e o centro dos objetos por perto viram linhas candidatas, com
   uma **guia laranja** ligando o que foi alinhado com o quê. É o que serve para
   reorganizar um resumo importado.
2. **Grade**, só quando a grade magnética está ligada (`A`, gravado no `.wbd`).

Vizinho vence a grade quando os dois estão ao alcance: alinhar com o objeto que se está
olhando é uma intenção; cair na célula da grade é só uma consequência de onde a grade
calhou de ficar. **`Ctrl` durante o arraste ignora o encaixe** — é como se encostam duas
formas de propósito sem a guia empurrar uma delas.

Três detalhes que o código registra e valem repetir:

- O limiar é de 7px **de tela**. Em unidades de mundo, o encaixe ficaria imperceptível com
  o zoom afastado e agarraria tudo com o zoom aproximado.
- A busca por vizinhos se limita a 500px de tela ao redor. Alinhar com um objeto fora da
  tela não ajuda ninguém — a guia apontaria para o nada — e varrer o quadro inteiro
  custaria caro num resumo de mil objetos.
- Ao redimensionar, o encaixe só age com o quadro **alinhado aos eixos** e sem proporção
  travada. Girado, a borda não é paralela às guias e "alinhar" não quer dizer nada; com a
  proporção travada, encaixar um eixo moveria o outro e tiraria a borda do lugar que
  acabou de encaixar.

**As réguas** (`R`) são faixas graduadas no topo e na esquerda, em px ou cm (`U`), com um
marcador seguindo o cursor — que é o que responde "onde eu estou" num quadro infinito,
onde não há borda de página para servir de referência. Elas são desenhadas no overlay, e
não como elementos de DOM: mudam a cada movimento de câmera, e um DOM reposicionado a
60Hz custaria layout a cada frame.

## Texto, post-its e alertas

**Texto** (`T`): clicar cria uma caixa de largura padrão que cresce em altura conforme se
escreve; arrastar define a largura, e a quebra de linha acompanha. Clicar sobre uma caixa
que já existe **abre ela** em vez de criar outra por cima — é o erro que esse gesto
cometeria com mais frequência, já que a mira do texto é justamente onde há texto. Quem
está manipulando o quadro chega no mesmo lugar por **duplo clique** ou `F2`.

**Post-it** (`N`) funciona igual, mas tem tamanho próprio e não cresce com o conteúdo: é
um papel, e um papel cheio demais é sinal de que o assunto merecia outro lugar. Papel e
**alerta** (importante, dúvida, revisar) saem da barra lateral — e os mesmos botões
reestilizam o post-it que estiver selecionado, para não existirem dois lugares diferentes
de escolher a mesma coisa. Um post-it **fixado** (menu de contexto) vira uma ficha no
canto direito da tela **enquanto estiver fora da vista**: num quadro de 80 mil unidades de
largura, um lembrete que só aparece quando você já chegou onde ele estava não lembra nada.

Cinco decisões que o código não conta sozinho:

- **A edição é um `contentEditable` sobre o canvas, não um editor desenhado dentro dele.**
  Cursor, seleção por arraste, acentuação, IME, navegação por teclado e área de
  transferência saem prontos do Chromium. Reimplementar isso no canvas seria reescrever um
  motor de texto. Enquanto a caixa está aberta o objeto **não é desenhado** na camada
  estática (`Renderer.hiddenId`) — senão o texto sairia duplicado, meio pixel fora.
- **A caixa nova só entra no documento se receber texto.** Enquanto se digita ela é apenas
  o `<div>`; uma caixa aberta por engano não deixa objeto invisível nem passo de undo.
  Esvaziar uma caixa que já existia a remove, pelo mesmo motivo. Uma sessão de edição
  inteira é **um** passo de undo.
- **`Esc` sai da caixa mantendo o texto.** O texto já está na tela e sumir com ele seria
  perda de trabalho; quem quer descartar usa `Ctrl+Z`, que desfaz a sessão inteira.
- **Colar dentro da caixa cola texto puro.** Colar de um site traria fonte, corpo e cor da
  origem, e o resumo viraria uma colcha de retalhos.
- **A altura de linha vem da fonte, com piso no multiplicador.** `fontSize × lineHeight`
  sozinho quebra em dois casos reais aqui: emoji e fonte substituta. Medindo
  `fontBoundingBox` **e** `actualBoundingBox` por linha, a caixa acompanha o que vai ser
  desenhado — que é o mesmo critério do motor de CSS.

O layout ([render/text/layout.ts](../src/renderer/render/text/layout.ts)) é ponto único de
verdade para **três** consumidores que precisam concordar: o painter que desenha, o
importador que grava o tamanho da caixa no `.wbd` e o editor. Cada um medindo por conta
própria foi exatamente a divergência que a importação carregou da Fase 2 até aqui.

## Exportar e autosave

`Ctrl+E` (ou o botão **exportar**) abre as opções: **PNG**, **SVG** ou **PDF**; o quadro
todo ou só a seleção; resolução 1x/2x/3x; com fundo ou transparente. O que sai é o
conteúdo — **nada de cromo**: régua, alças, guias de encaixe, destaque da busca e fichas
de post-it fixado são respostas do app a quem edita, não parte do quadro.

- **O PNG sai do mesmo caminho de desenho do app** (`paintObject`, os mesmos painters, o
  mesmo adaptador de cor). Um renderizador separado para exportar significaria manter dois
  desenhos do mesmo quadro — e eles divergiriam na primeira funcionalidade nova, que foi
  exatamente o que aconteceu com a medição de texto entre a Fase 2 e a 5. A única
  diferença deliberada: exporta sempre em **detalhe cheio**, porque LOD existe para
  segurar 60fps enquanto se navega e um arquivo não tem frame rate.
- **O SVG não pôde reaproveitar os painters** — eles falam `CanvasRenderingContext2D`. O
  que se reaproveita é o que decide a aparência: layout de texto, adaptador de cor e as
  constantes do post-it. Duas perdas conhecidas: a modulação de pressão do lápis vira
  espessura média (manter exigiria um caminho por segmento, multiplicando o arquivo por
  dezenas), e o texto sai como `<text>`, dependente da fonte de quem abrir — converter
  glifo em caminho perderia o texto selecionável, que é metade da razão de exportar vetor.
  O apagamento da borracha vira `<mask>`, então o buraco continua buraco em outro programa.
- **O PDF é montado no processo principal**, por uma janela invisível com `printToPDF` —
  a mesma engine que desenhou o quadro. Escrever o formato à mão significaria manter
  tabela de referências cruzadas e dicionários de objeto para ganhar o que o Chromium já
  faz. A página sai do tamanho exato da imagem; com papel fixo, um quadro largo sairia
  reduzido no meio de uma folha A4 em branco.
- **O teto de 64 MP reduz a escala em vez de falhar.** Um quadro de 40.000 unidades a 3x
  pediria um canvas que o navegador não aloca, e a exportação morreria sem explicação; o
  aviso do arquivo salvo diz a escala que coube.

**O autosave grava sozinho 3 segundos depois da última alteração** (com teto de 30s para
quem desenha sem parar), e só sob duas condições:

1. **O quadro já foi salvo uma vez.** Sem caminho não há nome, e inventar um encheria a
   pasta de "Quadro sem nome (3)" a cada rabisco de experiência. Até o primeiro `Ctrl+S`,
   quem protege o trabalho é o aviso ao fechar a janela.
2. **Nenhuma caixa de texto aberta.** Durante a edição o conteúdo ainda está no editor e
   não no documento — gravar ali salvaria a versão anterior do texto.

A regra mora sozinha em [autosave.ts](../src/renderer/features/storage/autosave.ts), separada
de quem grava, para poder ser conferida no auto-teste sem escrever nada no disco.

## Imagens

Entram de duas formas: **colar** (`Ctrl+V` com uma imagem na área de transferência do
sistema) e **arrastar o arquivo** para dentro do quadro — nesse caso ela cai exatamente
onde foi solta, porque quem arrastou até um ponto escolheu esse ponto. Várias de uma vez
entram lado a lado, e não empilhadas: empilhar esconderia todas menos a de cima.

Uma imagem entra em **tamanho de tela** (720px no maior lado), não no tamanho do arquivo:
um print de 3840×2160 colado em 1:1 cobriria o quadro inteiro. Imagem menor que o teto
entra no tamanho natural — ampliar só borraria.

**Recortar** é duplo clique na imagem (ou o menu de contexto). A área de fora fica
escurecida em vez de sumir, porque um recorte se escolhe olhando o que vai embora; as
linhas de terço são a mesma referência de qualquer editor de foto. `Enter` confirma, `Esc`
descarta, e "Remover recorte" devolve o arquivo inteiro.

Três decisões:

- **O recorte só aperta para dentro.** Arrastar para fora exigiria desenhar a imagem
  inteira além das bordas do objeto, com o quadro aparecendo por baixo no meio do gesto —
  para um ganho que "Remover recorte" já entrega: voltar ao original e recomeçar.
- **A composição é no espaço normalizado do arquivo** (0..1), não em pixels. Assim
  recortar duas vezes seguidas não acumula erro de arredondamento e nunca depende do
  tamanho em que a imagem está no quadro. Sem compor, o segundo corte voltaria a medir
  sobre o arquivo inteiro e pularia para outro pedaço da foto.
- **O arquivo original é preservado byte a byte**, e o recorte é só um retângulo por cima.
  É o que permite desfazer, e é o que mantém a imagem legível quando você der zoom — o
  `AssetStore` já guardava assim desde a importação.

Um detalhe que morde: um arquivo solto na janela do Electron **sem `preventDefault` faz a
janela navegar até ele** — o app inteiro some e vira um visualizador de imagem, sem volta.
Por isso `dragover` e `drop` são barrados na janela toda, e não só no canvas.

## Buscar

`Ctrl+F` abre uma barra no topo com os resultados listados, cada um com o **trecho em
volta do casamento** — num resumo com dezenas de ocorrências de "matriz", o que distingue
uma da outra é a frase em volta. `Enter` vai para o resultado destacado e, de novo, para o
próximo; `Shift+Enter` volta; `Esc` fecha.

Quatro decisões:

- **Ignora acento e caixa.** Num resumo em português escrito a duas mãos — digitado aqui
  e importado do Whiteboard — procurar "revisao" e não achar "revisão" seria inutilizável.
- **Ordem de leitura do quadro**, de cima para baixo e da esquerda para a direita. A ordem
  de camada (`z`) seria arbitrária para quem lê, e a de criação não descreve o que se vê.
- **Ir para o resultado leva o zoom a 100%** (ou ao que fizer o objeto caber, o que for
  menor). Manter o zoom de onde se estava resolveria "centralizar" e não "encontrar": num
  quadro visto a 8%, o resultado chegaria centralizado e ilegível.
- **O destaque não depende da ferramenta ativa.** O quadro de seleção só aparece com a
  seleção ativa; buscar no meio de um desenho não deve obrigar a trocar de ferramenta para
  ver o que foi encontrado. Por isso o achado ganha contorno próprio, em roxo — cor
  distinta do azul da seleção e do laranja das guias, que são outras três respostas do
  sistema.

**Não há índice invertido, e isso foi medido.** Com 10.000 objetos: varrer todos sem casar
com nada custa **0,9 ms** — procurar nunca foi o gargalo. O custo real é montar o trecho
de cada acerto, limitado pelo teto de resultados, e o total por tecla fica em **4,0 ms**.
Um índice otimizaria justamente a parte de 0,9 ms, em troca de mantê-lo sincronizado a
cada edição, undo e importação. O que *estava* caro era dobrar o texto de tudo a cada
tecla (20,8 ms); resolveu-se guardando o texto dobrado num `WeakMap` chaveado pelo próprio
objeto — como toda mutação substitui o objeto, a invalidação sai de graça.

## Selecionar e manipular

O botão **esquerdo pertence às ferramentas**; direito e meio são da navegação. Essa
fronteira é o que permite arrastar o quadro no meio de um gesto sem trocar de modo.

| Gesto | O que faz |
|---|---|
| Clique | Seleciona o objeto sob o cursor |
| Shift + clique | Soma à seleção; num objeto já selecionado, tira |
| Arrastar do vazio | Laço: pega tudo na área (Shift soma ao que já estava) |
| Arrastar a seleção | Move — **Shift** trava no eixo dominante |
| Arrastar uma alça | Redimensiona — **Shift** mantém a proporção, **Alt** ancora no centro |
| Arrastar a alça de cima | Gira — **Shift** trava de 15 em 15 graus |
| Setas | Move 1px; com Shift, 10px |

Quatro decisões que valem saber:

- **O clique segue a geometria, não o retângulo.** Um traço manuscrito na diagonal
  ocupa um retângulo enorme e quase nenhum pixel dele; um "V" grande tem o meio vazio.
  Selecionar pelo AABB faria o clique no vazio agarrar o traço — e, pior, agarrar o
  traço de cima em vez do texto que está visivelmente ali. O AABB serve só como filtro
  barato (via R-tree) e a decisão final vai contra a geometria real: distância à
  polilinha nos traços, `isPointInPath` no **mesmo `Path2D` que foi desenhado** na tinta
  importada, e polígono/elipse nas formas. O laço é a exceção deliberada: arrastar um
  laço é "pegue tudo por aqui", não mira, e refinar por geometria faria ele ignorar
  objetos que o usuário visivelmente cercou.
- **Um arraste inteiro é um passo de undo.** Durante o gesto os patches são aplicados
  direto no documento, sem passar pelo histórico; o comando só é empurrado ao soltar o
  botão. A alternativa — um comando por frame, confiando na fusão do `History` — se
  desfaz se o usuário parar de mexer no meio do arraste por mais que a janela de fusão,
  quebrando um gesto em dois passos.
- **Escala vai para o `transform`, não para a largura do objeto.** Assim existe um só
  caminho de código para todos os tipos: traço e tinta importada nem têm largura/altura,
  e reescalá-los significaria reescrever milhares de coordenadas por frame. Pelo
  transform é O(1) e o `.wbd` continua guardando a geometria original.
- **Selecionar vários objetos girados força escala uniforme.** Esticar só um eixo de um
  objeto girado não é escala: é cisalhamento, e `Transform` não tem onde guardar isso.
  Em vez de aplicar uma conta errada e entortar o objeto em relação ao que a alça
  prometeu, o arraste vira proporcional. Não aparece com um objeto só, porque aí o
  quadro de manipulação gira junto e os eixos coincidem.

Com **um** objeto selecionado o quadro de manipulação acompanha a rotação dele; com
vários, é o AABB e não gira — não existe orientação única que sirva para um conjunto
com rotações diferentes, e escolher a de um deles faria o quadro pular ao trocar a
seleção.

### Copiar e colar

`Ctrl+V` cola **centrado no cursor** — onde você está olhando, e não onde o original
estava. Se o mouse ainda não passou pelo quadro, cai no centro da tela.

A área de transferência é interna, e não a do Windows: um objeto do quadro não tem
representação fiel em texto nem em imagem, e serializá-lo para o clipboard do sistema
só para ler de volta em seguida perderia o que importa — traço vira bitmap, texto
perde a formatação. Colar em *outro* aplicativo é exportação, e pertence à Fase 8.

Ela **atravessa quadros**: copiar num resumo e colar noutro funciona, inclusive com
imagens. Para isso a cópia leva junto os *bytes* da imagem, não só a referência — o
`AssetStore` é esvaziado ao trocar de arquivo, então só o `assetId` chegaria do outro
lado como marcador de imagem ausente.

## Importar do Microsoft Whiteboard

Botão **"Importar do Whiteboard"** no lobby. Aceita o `.zip` da exportação
completa (ou o `.html` de dentro dele), vários de uma vez — cada arquivo vira um
quadro `.wbd` separado.

O conteúdo volta como **objetos editáveis**, não como figura. Medido nos três
resumos usados no desenvolvimento:

| Quadro | Textos | Traços | Imagens | Post-its | Tempo |
|---|---|---|---|---|---|
| CURSO 5 | 41 | 14 | 4 | 0 | 154 ms |
| Continuação cybersec | 266 | 123 | 21 | 1 | 417 ms |
| Cybersec resumão | 642 | 380 | 36 | 5 | 937 ms |

**1.533 de 1.535 objetos recuperados**, todos com **erro de posição abaixo de 0,2px**.
Os dois ignorados são um `Hyperlink` e um `ReactionSticker`, que ainda não têm
equivalente no app.

### Como o formato foi decifrado

O export é um `.zip` com um `.html` (o DOM do quadro) e um `-comments.json`
(apenas comentários — vazio na prática). Todo o conteúdo está no HTML e é
autossuficiente: nada é baixado da internet ao importar.

- Cada objeto é uma div com `data-whiteboard-type` e `style="left/top"` em
  coordenadas de mundo, mais uma matriz CSS com a escala.
- Texto vem do Draft.js: parágrafos em `[data-block]`, texto em `[data-text]`.
  Fonte, tamanho, cor e peso estão em estilo **inline**.
- Imagens vêm embutidas em base64, no `<img src="data:image/*;base64,…">`.
- Tinta vem como **contorno preenchido** em SVG, não como linha com espessura —
  a variação de pressão da caneta está na forma. Por isso foi criado o tipo
  [`PathObject`](../src/shared/model/types.ts): reduzir a uma polilinha de espessura
  constante achataria a caligrafia.

### Onde cada objeto vai parar

Descobrir a posição de um objeto no export é mais traiçoeiro do que parece, e cada uma
das armadilhas abaixo já deslocou conteúdo de verdade nesses três resumos:

| Armadilha | O que acontece se ignorar |
|---|---|
| Âncora `align center` (só imagem e sticker) | `left/top` é o **centro**, não o canto. A imagem sai meia imagem fora do lugar — até 269px |
| Rotação na matriz | `matrix(0,1,-1,0)` é 90°. Ler escala como `a` e `d` dá escala **zero** e o objeto some |
| `tx`/`ty` da matriz | Quase sempre resíduo, mas há textos reais com `ty = -14,3px` |
| `viewBox` do `<svg>` da tinta | `viewBox="116 -78 …"` empurra o desenho. 40 dos 473 grupos têm origem ≠ 0; o pior deslocava um traço em **5501px** |
| Tamanho do post-it | Mora em `.textbox`, e a cor em `.textBoxBackground` — elementos diferentes |

Nada disso foi deduzido lendo o CSS: cada regra foi **medida** contra o motor de layout
do Chromium. É para isso que existe [layoutOracle.ts](../src/renderer/dev/layoutOracle.ts),
que monta o export num iframe fora da tela (com `sandbox="allow-same-origin"`, sem
`allow-scripts` — mede-se o documento, nada dentro dele executa) e lê o
`getBoundingClientRect()` de cada elemento. O importador é conferido contra esse gabarito
a cada execução de `QB_IMPORT`.

**O tamanho da caixa de texto** era a divergência aberta desde a Fase 2, e a Fase 5
resolveu a parte que era escolha nossa. Gravávamos como largura o *teto de quebra* do
original (`max-width`), e não a largura que o texto ocupou: uma linha curta num teto largo
produzia uma caixa até **3.295px** mais larga que o texto — uma área enorme de nada que
respondia ao clique. Hoje a caixa é medida pelo layout real, quebrando no teto do original
e **encolhendo para o que o texto ocupou**. Encolher preserva a quebra, e é isso que torna
a troca segura: numa quebra gulosa cada linha já cabe na maior delas, e a palavra que não
coube no teto também não cabe aqui. O erro médio de tamanho caiu de **136px para 85px**, e
o máximo de 3.295px para 734px (`Cybersec resumão`, 642 caixas).

O que sobrou **não é decisão, é limite de medição**: o navegador monta a caixa de linha
com a métrica da fonte que realmente desenhou cada glifo — inclusive a substituta que
entra num emoji (medido no oráculo: caixa de linha de 62px para uma fonte de 34px) — e
essa métrica não aparece no `measureText` do canvas. Medimos mais estreito que o motor de
CSS nas linhas com emoji. Efeito colateral do mesmo limite: nos **dois textos girados a
45°** do resumo, a diferença de tamanho vira diferença de AABB (`pos_max` de `PlainText`
chega a 80px) — a origem do objeto continua exata, são os cantos do retângulo que chegam
mais perto.

Duas decisões que valem saber:

- O `data:` URI é decodificado à mão em [dataUri.ts](../src/renderer/features/images/dataUri.ts),
  e não por `fetch()`. A CSP do app não permite `data:` em `connect-src`, e
  afrouxá-la por conveniência de parsing seria trocar segurança por atalho. De
  quebra, o MIME real é detectado pelos bytes — o Whiteboard escreve `image/*`,
  que não é um tipo válido.
- A fonte original é **Aptos**. Se não estiver instalada, o texto cai para a
  fonte substituta e reflui um pouco.

Para conferir um arquivo sem abrir a interface:

```
$env:QB_IMPORT = "C:\caminho\para\export.zip"; npm run dev
```

Imprime no terminal quantos objetos de cada tipo foram reconhecidos, o que foi
ignorado, a extensão do quadro e o **erro de posição por tipo** contra o oráculo de
layout. A janela fecha sozinha ao terminar, então dá para rodar em sequência.

Essa conferência **não grava nada**: ela roda a importação muitas vezes seguidas e
encheria a pasta de quadros de cópias numeradas. Para reimportar de verdade por
terminal, ligue a gravação:

```
$env:QB_IMPORT_SAVE = "1"; $env:QB_IMPORT = "C:\caminho\export.zip"; npm run dev
```

## Onde os quadros ficam

Cada quadro é um arquivo `.wbd` em **`C:\Creation Board`**. O botão com o caminho, no topo
do lobby, abre a pasta no Explorador.

A pasta fica na raiz do disco **de propósito, e não em Documentos**: em muitas instalações
do Windows a pasta Documentos está redirecionada para o OneDrive, e salvar ali faria todo
quadro sincronizar para a nuvem — o oposto do que o app se propõe a ser. Aqui nada sai da
máquina. Levar um resumo para a nuvem é uma decisão manual: copiar o `.wbd` para onde
quiser, e ele reabre normalmente depois.

Se a raiz de `C:` estiver bloqueada por política de grupo, o app cai automaticamente para
`%USERPROFILE%\Creation Board` — e **avisa no terminal**, em vez de mudar de pasta calado
(foi um bug sério; está no `BUGS.md` como B11).

**Quadros de versões anteriores são trazidos sozinhos.** O app conhece os nomes que a pasta
já teve e move o que encontrar em cada um, na primeira abertura. Ele move e nunca copia:
duas cópias do mesmo quadro em pastas diferentes é pior que uma biblioteca mudada de lugar.

O lobby lê apenas `manifest.json` + `preview.png` de dentro de cada `.wbd`, sem
descompactar o documento. Por isso a lista abre rápido mesmo com quadros grandes.

## Tema claro e escuro

Os dois modos existem, e o quadro escurece de verdade no modo noturno. Para que
nada suma, as cores são adaptadas **na exibição** — o arquivo guarda sempre a cor
que você escolheu, e é ela que a exportação vai usar.

A regra distingue dois papéis:

- **Marcas** (traço de caneta, texto, contorno de forma) precisam contrastar com
  o fundo. Se o contraste cair abaixo do mínimo legível, a luminosidade é
  espelhada: traço preto vira claro no modo escuro, traço branco vira escuro no
  modo claro. Cores saturadas — vermelho, azul, verde — já contrastam nos dois
  fundos e ficam intactas.
- **Superfícies** (fundo de post-it, preenchimento, marca-texto) *devem* ter
  contraste baixo. Um post-it amarelo pastel é assim de propósito; inverter isso
  transformaria os post-its em blocos escuros. Elas nunca passam pelo adaptador.

Para conferir a matemática contra a paleta real:

```
npm run check:colors
```

Sai com erro se qualquer marca ficar ilegível em qualquer um dos dois temas.
