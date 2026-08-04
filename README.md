# Creation Board

Quadro branco infinito local para estudos. Substituto pessoal do Microsoft Whiteboard,
rodando 100% offline no Windows: sem login, sem nuvem, sem servidor.

**Status:** canvas infinito, lobby, importação do Whiteboard, **seleção completa**
(mover, redimensionar, girar, duplicar, excluir, ordem de camadas, undo/redo), **desenho
à mão** (caneta, marca-texto, lápis e borracha progressiva), **formas com encaixe e
réguas**, **texto, post-its e alertas**, **busca `Ctrl+F`** e **imagens** (colar, arrastar
e recortar). Dá para importar um resumo do Whiteboard e trabalhar em cima dele por
inteiro. Faltam exportação, autosave e o polimento final.

> Retomando o desenvolvimento depois de uma pausa? Comece por **[RETOMAR.md](RETOMAR.md)**:
> em que pé está e o que fazer a seguir.

---

## Rodar sem instalar

```
npm install
npm run dev
```

A janela abre direto, sem instalador e sem deixar nada no sistema. É assim que se
usa o app durante o desenvolvimento. Fechar a janela encerra tudo; nada fica
registrado no Windows.

## Controles

Todos os atalhos estão dentro do app: tecla **`F1`** (ou o botão `?` na barra
inferior). Essa tela é gerada a partir de
[shortcuts.ts](src/renderer/shortcuts.ts), o mesmo registro que despacha as
teclas — se o atalho aparece na ajuda, ele funciona.

| Ação | Como |
|---|---|
| Salvar | `Ctrl+S` · autosave 3s depois da última alteração (após o 1º save) |
| Exportar | `Ctrl+E` — PNG, SVG ou PDF; quadro todo ou seleção |
| Voltar ao lobby | `Ctrl+O` |
| Ferramentas | `V` selecionar · `P` caneta · `M` marca-texto · `L` lápis · `T` texto · `N` post-it · `F` formas · `E` borracha |
| Espessura do traço | `[` mais fino · `]` mais grosso (no texto, corpo da fonte; na borracha, diâmetro) |
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

Oito ferramentas na barra vertical à esquerda: seleção, caneta, marca-texto, lápis,
texto, post-it, formas e borracha. Com uma delas que produza marca ativa, o painel ao lado
traz cor e espessura (e o tipo de forma ou o papel do post-it, quando for o caso) — e
lembra a escolha **por ferramenta**, porque quem grifa de amarelo e volta para a caneta
espera a caneta de antes, não uma caneta amarela grossa.

As três variantes produzem o mesmo `StrokeObject`, que já existia desde a Fase 1 — é o
mesmo tipo que a importação e a carga de teste usam. A caneta *produz* esses objetos;
não inventa nada novo.

Cinco decisões que o código não conta sozinho:

- **O marca-texto entra por baixo de tudo.** Grifar é destacar o que já está no quadro;
  entrando no topo, a faixa translúcida cobriria justamente o texto que se quis
  destacar. Caneta e lápis entram por cima, que é onde se espera encontrar o que se
  acabou de escrever. Tudo isso é uma chave de camada (`z`), não ordem de desenho.
- **O lápis é o único que usa a pressão.** `StrokeObject` guarda pressão por ponto desde
  a Fase 1 e nada lia esse valor; agora o painter modula a espessura do lápis entre 45%
  e 100% da largura nominal, segmento a segmento. O teto de 100% não pode subir: o AABB
  é calculado inflando a linha de centro em `width / 2`, e um pico maior desenharia
  tinta fora do próprio retângulo do objeto — que o culling corta na borda da tela. Em
  mesa digitalizadora a variação é real; com mouse, `PointerEvent.pressure` vem sempre
  0,5 e o traço sai uniforme.
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

O layout ([render/text/layout.ts](src/renderer/render/text/layout.ts)) é ponto único de
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

A regra mora sozinha em [autosave.ts](src/renderer/features/storage/autosave.ts), separada
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
  [`PathObject`](src/shared/model/types.ts): reduzir a uma polilinha de espessura
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
do Chromium. É para isso que existe [layoutOracle.ts](src/renderer/dev/layoutOracle.ts),
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

- O `data:` URI é decodificado à mão em [dataUri.ts](src/renderer/features/images/dataUri.ts),
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

Cada quadro é um arquivo `.wbd` em **`C:\Resumos-quadrobranco`**. O botão com o
caminho, no topo do lobby, abre a pasta no Explorador.

O nome da pasta não acompanhou a renomeação do app de propósito: mudá-lo faria os
resumos já salvos sumirem do lobby. Trocar exige uma migração, como a que já existe
para a pasta antiga em Documentos.

A pasta fica na raiz do disco **de propósito, e não em Documentos**: a pasta
Documentos desta máquina está redirecionada para o OneDrive, e salvar ali faria
todo quadro sincronizar para a nuvem — o oposto do que o app se propõe a ser.
Aqui nada sai da máquina. Levar um resumo para a nuvem é uma decisão manual:
copiar o `.wbd` para onde quiser, e ele reabre normalmente depois.

Se a raiz de `C:` estiver bloqueada por política de grupo, o app cai
automaticamente para `%USERPROFILE%\Resumos-quadrobranco`. Quadros salvos por
versões anteriores em `Documentos\QuadroBranco` são movidos na primeira execução.

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

## Auto-teste de navegação

```
npm run selftest
```

Abre o app, dispara eventos de ponteiro e de teclado direto no app e imprime o
resultado no terminal — sem depender da janela estar em primeiro plano e sem
capturar a tela. **107 verificações**, em dez frentes:

- **Navegação:** pan com botão direito e com o do meio, o limiar que separa arrastar
  de clicar, o botão esquerdo permanecendo livre para as ferramentas, o zoom ancorado
  no cursor, os dois limites de zoom e a rolagem sem Ctrl.
- **Seleção:** clique, Shift+clique somando e tirando, laço por área, mover,
  Shift travando o eixo, redimensionar pela alça com a âncora oposta parada, girar um
  quarto de volta, excluir, desfazer, duplicar, setas, `Ctrl+A`, `Esc`, ordem de
  camadas e objeto travado recusando seleção. Inclui a verificação de que **um arraste
  inteiro vira um único passo de undo** e a de que clicar no vazio dentro do retângulo
  de um traço diagonal *não* seleciona.
- **Desenho:** a caneta ancorando o traço onde o gesto começou, o AABB incluindo a
  espessura, o traço recém-criado respondendo ao clique, a caneta *não* selecionando ao
  clicar num objeto, o marca-texto entrando por baixo, a pressão chegando ao traço, as
  teclas de ferramenta, `[` e `]`, a borracha apagando tinta e devolvendo no `Ctrl+Z`,
  e ela recusando forma, texto e objeto travado. Inclui o caso que justifica a divisão
  de botões inteira: **arrastar o quadro com o botão direito no meio de um traço** não
  o corta em dois nem o deixa no lugar errado.
- **Borracha por peça:** o buraco aparecendo sem o traço sair do quadro, o buraco *não*
  respondendo ao clique enquanto a tinta que sobrou responde, apagar tudo aos poucos
  removendo o objeto, a caligrafia importada (`PathObject`) aceitando o mesmo apagamento,
  o rastro sobrevivendo ao `.wbd` e o modo traço inteiro continuando disponível.
- **Formas e encaixe:** a forma criada pelo arraste, `Shift` travando o quadrado, `Alt`
  crescendo do centro, a seta guardando a direção, o preenchimento translúcido, o clique
  sem arraste *não* deixando forma de tamanho zero, e as teclas `F`, `R` e `U`. No
  encaixe: alinhar com a borda do vizinho, `Ctrl` ignorando, a grade magnética agindo só
  quando ligada, a guia saindo junto com a correção, e — o que mais importa — o encaixe
  agindo **durante** o arraste e não só ao soltar.
- **Texto e post-its:** clicar abrindo a caixa **sem** criar objeto, o texto digitado
  virando objeto num passo de undo, a caixa deixada em branco não deixando rastro,
  esvaziar removendo a caixa existente, duplo clique abrindo a caixa e tirando-a do
  canvas, editar e desfazer, a largura vindo do arraste com a altura vindo do texto,
  marcadores de lista, o post-it nascendo com o papel e o alerta da barra, a barra
  reestilizando o que já existe, a ficha do post-it fixado aparecendo só fora da tela, e
  `T`/`N`. Inclui a propriedade em que a importação se apoia: **encolher a caixa até a
  maior linha preserva a quebra**.
- **Busca:** achar ignorando acento e caixa, a ordem de leitura do quadro, o trecho
  marcando o pedaço que casou, `Ctrl+F` abrindo e listando ao digitar, `Enter` levando a
  câmera com zoom legível e selecionando, a volta no fim da lista, `Esc` fechando junto com
  o destaque, e post-it entrando na busca. Mais a **medição** que sustenta não haver índice
  invertido, com a repartição do custo.
- **Imagens:** arrastar um arquivo inserindo onde ele caiu, imagem grande entrando
  reduzida e pequena não sendo ampliada, colar do sistema, o recorte encolhendo a caixa e
  deslocando a origem, `Ctrl+Z` desfazendo tudo junto, **dois recortes seguidos compondo**
  em vez de reiniciar, "remover recorte" devolvendo o arquivo inteiro, e a imagem com seus
  bytes sobrevivendo ao `.wbd`. O PNG do teste é gerado na hora, então nada depende de
  arquivo em disco.
- **Exportar e autosave:** o PNG saindo no tamanho da área com margem e escala, exportar
  só a seleção medindo só ela, o teto de pixels **reduzindo a escala em vez de estourar**
  o canvas, o SVG trazendo os objetos como elementos vetoriais, o SVG **escapando** texto
  do usuário (um resumo com `<script>` escrito dentro não pode virar marcação), o buraco
  da borracha virando `<mask>`, e as cinco combinações da regra do autosave.
- **Persistência:** copiar, recortar, colar no cursor, o traço desenhado e o texto
  formatado sobrevivendo à ida e volta pelo formato gravado, e um teste que move e
  redimensiona um objeto e passa o documento pelo mesmo JSON que vai para dentro do
  `.wbd`. Sem ele, um `transform` que não sobrevivesse à gravação devolveria o quadro
  reorganizado às posições originais na próxima abertura — e só se descobriria isso
  depois de reorganizar um resumo inteiro.
- **Desempenho:** arrastar 10.000 objetos selecionados de uma vez, com teto de 33 ms
  por frame (30fps). É um piso de qualidade, não uma medição — falha se uma mudança
  futura tornar a manipulação em massa lenta. A repartição do custo sai junto na
  linha do resultado.

Como o teste exercita `ToolManager` e o registro de atalhos de ponta a ponta, ele pega
regressão de fiação, não só de matemática — foi assim que apareceu, por exemplo, um
gesto de mover que nunca chegava a promover o arraste.

Um bloco que **explode** vira FALHA com a mensagem, e não uma execução pendurada: sem
isso, uma exceção aborta o relatório antes do `markClean()`, o guarda de `beforeunload`
recusa o fechamento e a janela fica aberta esperando alguém no teclado.

O que ele **não** cobre: a tradução que o Windows faz do botão físico para
`PointerEvent.button` (padrão, não varia) nem os pixels desenhados. Para os pixels, o
teste termina montando uma cena com a seleção ativa e **tudo produzido pelas ferramentas
de verdade** — então `QB_SHOT=<arquivo.png> npm run selftest` fotografa só a janela do app
e mostra o contorno, as alças, a alça de rotação, o grifo passando por baixo da tinta, a
espessura do lápis variando com a pressão, as formas, as réguas, uma caixa de texto com
negrito, sublinhado e marcadores, um post-it com alerta, **um buraco de borracha no meio
de um traço** — nenhum número prova que o pedaço sumiu com a borda certa e sem deixar
mancha da cor do fundo —, a **busca aberta** com o trecho marcado e o contorno roxo em
volta do achado, e uma **imagem com o recorte aberto**, mostrando a sombra do que ficaria
de fora, as linhas de terço e as alças.

## Requisitos

- **Node.js ≥ 20.18** — testado em 20.18.3
- **Windows x64**
- Nada mais. Sem Python, sem Visual Studio Build Tools (não há dependências nativas).

## Instalação das dependências

```
npm install
```

## Desenvolvimento

```
npm run dev
```

Sobe o Vite com HMR e abre a janela do Electron com o DevTools destacado.
Editar arquivos em `src/renderer/` recarrega na hora; editar `src/main/` ou
`src/preload/` reinicia o processo principal.

## Verificação de tipos

```
npm run typecheck
```

Roda `tsc` nos dois projetos (`tsconfig.node.json` para main/preload/shared,
`tsconfig.web.json` para renderer/shared). O `npm run build` já executa isso antes
de empacotar — build não passa com erro de tipo.

## Build de produção

```
npm run build
```

Gera os três bundles em `out/` (`main/`, `preload/`, `renderer/`). Não gera executável.

## Gerar o instalador .exe

```
npm run dist
```

Saída em `release/`:

| Arquivo | O que é |
|---|---|
| `Creation Board-Setup-0.1.0.exe` | **Instalador NSIS** — é este que você executa |
| `win-unpacked/Creation Board.exe` | App já descompactado, para testar sem instalar |

O instalador é *per-user* (não pede admin), permite escolher a pasta de instalação
e **cria o atalho na área de trabalho automaticamente**. Depois de instalado, o app
abre pelo atalho — nunca por terminal.

Para gerar só a pasta descompactada, sem instalador (bem mais rápido durante o
desenvolvimento):

```
npm run dist:dir
```

### SmartScreen na primeira execução

O instalador não é assinado digitalmente (assinatura de código custa algumas centenas
de dólares por ano e não faz sentido para uso pessoal). Na primeira execução o Windows
mostra a tela azul do SmartScreen: clique em **"Mais informações" → "Executar assim mesmo"**.
Só acontece uma vez.

### Ícone do app

O `build/icon.ico` é gerado a partir da logo, sem dependências de imagem:

```
npm run icon
```

A origem é `build/onlycloselogo.png` — a versão **só do símbolo**, sem o texto
"Creation Board". Num atalho de 32px o nome escrito viraria uma mancha ilegível,
enquanto o símbolo sozinho continua reconhecível. O script decodifica o PNG à mão
(zlib do Node + desfiltragem das linhas), centraliza num quadrado e reduz para 256px
por média de área. Para usar outra imagem:

```
node build/make-icon.js build/icon.ico caminho/da/imagem.png
```

## Estrutura de pastas

```
src/
├─ main/          Processo principal (Node). Janela, menus, disco, IPC.
│  ├─ index.ts        bootstrap e ciclo de vida
│  └─ ipc/            handlers IPC, um módulo por área
├─ preload/       Ponte contextBridge → window.quadro (única superfície exposta)
├─ shared/        Código que atravessa main ↔ renderer
│  ├─ model/          tipos dos objetos, esquema do .wbd, migrações
│  ├─ geometry/       Vec2, Rect, interseções
│  └─ ipc-contract.ts nomes de canais + tipos de payload
└─ renderer/      Interface e canvas (sem acesso a Node)
   ├─ core/           Document, SpatialIndex, Camera, Scheduler, History
   ├─ commands/       um comando por mutação (base do undo/redo)
   ├─ render/         Renderer, camadas, painters, bitmap cache
   │  └─ text/           layout de texto (medida, quebra, linhas) — usado por
   │                     painter, importador e editor
   ├─ tools/          uma ferramenta por arquivo, interface Tool comum
   ├─ features/       text, search, snapping, clipboard, images, import, storage
   ├─ ui/             toolbar, painéis, modais
   ├─ state/          preferências, tema, favoritos
   └─ styles/
```

**Como adicionar uma ferramenta nova:** um arquivo em `tools/`, um painter em
`render/painters/`, um tipo em `shared/model/types.ts`. Nada mais precisa ser tocado.

## Decisões de arquitetura

| Tema | Escolha | Motivo |
|---|---|---|
| Renderização | Canvas 2D puro, sem framework | Controle total do loop; WebGL só se a meta de 60fps com 10k objetos não bater |
| UI fora do canvas | TS vanilla + CSS | Zero dependências, uma única fonte de verdade de estado |
| Índice espacial | R-tree (`rbush`) | Lida bem com AABBs de tamanhos muito diferentes — traço curto e imagem gigante no mesmo quadro |
| Formato `.wbd` | Container ZIP | `document.json` + `assets/` com binários originais: arquivo único, sem inchaço de base64 |
| Texto | `contentEditable` sobre o canvas ao editar | Cursor, seleção, acentuação e IME de graça; renderiza no canvas quando ocioso |
| PDF | Vetorial via SVG | Zoom sem perda e texto selecionável; reaproveita o exportador SVG |
| Undo/redo | Command pattern | Snapshots de estado inteiro estourariam a memória com muitos objetos |
| Camadas (`z`) | Fractional index | "Trazer para frente" é O(1), sem renumerar a lista |

## Notas de build (Windows)

O `npm run dist` chama `scripts/prepare-wincodesign.mjs` antes do electron-builder.
Isso resolve uma falha específica do Windows: o pacote `winCodeSign` do electron-builder
contém symlinks do macOS, e criar symlink no Windows exige Modo de Desenvolvedor ou
admin — sem isso a extração falha e o empacotamento aborta, **mesmo sem assinar nada**.
O script extrai o pacote excluindo a pasta `darwin`, que é irrelevante aqui. É idempotente
e roda em segundos.

## Performance

Meta do projeto: **60fps com 10.000+ objetos**. Medições nesta máquina
(monitor de 144Hz — por isso os 144fps aparecem como teto de vsync, não como
limite do renderer):

| Objetos | Visão | Objetos no viewport | Render | FPS |
|---|---|---|---|---|
| 10.000 | zoom 100% | 13 | 0,7 ms | 144 (vsync) |
| 10.000 | zoom 40% | 122 | 2,5 ms | 144 (vsync) |
| 10.000 | tudo na tela | 6.698 | 10,3 ms | **82** |
| 50.000 | zoom 100% | 20 | 1,1 ms | 144 (vsync) |
| 50.000 | tudo na tela | 7.297 | 16,9 ms | **50** |

O pior caso é sempre "tudo na tela" — a única situação em que o culling não tem
o que descartar. Mesmo assim, com 5x a carga exigida, fica acima de 45fps.

Reproduzir a medição:

```
$env:QB_BENCH = "10000"; npm run dev
```

Roda três cenários automaticamente e imprime o resultado no terminal. Descarta o
primeiro segundo de cada fase (aquecimento de JIT e cache de fontes) e move a
câmera durante a coleta, para medir fps sustentado em vez de fps de cena parada.

### Conferir a exportação por terminal

```
$env:QB_EXPORT = "C:\caminho\prefixo"; npm run dev
```

Gera uma cena variada e grava `prefixo.png`, `.svg` e `.pdf` **sem passar pelo diálogo de
salvar** — que é justamente a parte que não se automatiza. Imprime tamanho e tempo de
cada formato, e faz uma verificação que nenhum outro caminho faz: **devolve o SVG gerado
ao navegador para ser lido de volta** (`prefixo-svg.png` é o resultado rasterizado). Um
SVG com marcação inválida ou transform errado simplesmente não carrega — e um SVG que só
nós sabemos ler não serve para exportar. Medido com 120 objetos: PNG 6432×6130 em ~700ms,
SVG 75 KB em 4ms, PDF em ~800ms.

### O que faz o desempenho

- **Culling por viewport** via R-tree: com 50.000 objetos e zoom 100%, apenas ~20
  chegam ao renderer.
- **Redesenho sob demanda**: com o quadro parado o loop não desenha nada. FPS
  aparece como "ocioso" no painel — não é lentidão, é ausência de trabalho.
- **LOD em três níveis**: abaixo de 40% de zoom os traços usam a polilinha
  simplificada por RDP; abaixo de 12%, cada objeto vira um bloco sólido.
- **Texto decide por objeto, não pelo zoom.** O critério é o tamanho que o glifo
  ocupa em pixel físico (`fontSize × escala do objeto × zoom × dpr`), e abaixo de
  6px ele vira barra cinza. A diferença é prática: nos resumos importados os
  títulos têm 34 unidades de mundo e o corpo tem 12,5, então a 22% de zoom os
  títulos saem com 7,5px (legíveis) e o corpo com 2,8px (mancha). Decidir pelo
  zoom da câmera trataria os dois igual e apagaria justamente os títulos — que são
  o que se procura ao olhar o resumo inteiro de longe.
- **Agrupamento por cor** no LOD de blocos. Trocar `fillStyle` milhares de vezes
  por frame custa mais que os próprios `fillRect`.

### Custo de manipular, que é outro problema

Arrastar uma seleção não é limitado pelo culling: o que custa é recalcular o AABB e
reposicionar no índice espacial **cada objeto selecionado**, a cada frame. O custo
cresce com o tamanho da seleção, não com o zoom — e o pior caso é `Ctrl+A` num quadro
grande seguido de um arraste.

Medido com 10.000 objetos selecionados de uma vez, pelo `npm run selftest`:

| Etapa | Custo por frame |
|---|---|
| Recalcular AABB | 3,1 ms |
| Índice espacial, objeto a objeto | ~~20,4 ms~~ |
| **Índice espacial, refeito em lote** | **6,9 ms** |
| Contorno e alças da seleção | 4,0 ms |
| **Total** | **27,3 ms (37fps)** |

A troca de 20,4 para 6,9 ms é o único ajuste que a Fase 3 precisou, e só apareceu
porque foi medido: `update` por objeto paga um `remove` — que procura a entrada na
árvore — mais um `insert` reequilibrado, enquanto a carga em lote empacota a árvore de
baixo para cima e não paga nenhum dos dois. Acima de **um quarto** do quadro alterado
de uma vez, `Document.replaceMany` refaz o índice inteiro em vez de mexer objeto a
objeto.

O palpite, aqui, teria errado o alvo: a hipótese natural era que o gargalo fosse
recalcular o AABB dos traços, varrendo milhares de pontos. São 3,1 ms — a menor
das três parcelas.

Nos resumos de verdade isso nem chega perto de apertar: o maior deles tem 1.063
objetos, cerca de um décimo da carga medida.

Uma otimização que **foi testada e descartada**: emitir os blocos como um único
path com milhares de sub-retângulos. Reduz o tempo de JS (12,9 → 11,7 ms) mas
derruba o frame rate (69 → 38 fps) — o custo migra para a rasterização do path
gigante na GPU, onde não aparece no `renderMs`. A versão mantida usa `fillRect`
individual agrupado por cor: 82fps.

## Roadmap

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Microsoft Whiteboard, e para isso importar e manipular vêm antes de desenhar. Caneta não
serve para migrar.

- [x] **Fase 0** — Setup, janela abrindo, instalador `.exe` validado
- [x] **Fase 1** — Canvas infinito, modelo de dados, índice espacial, culling, painel de debug (F3)
- [x] **Fase 1.5** — Lobby com miniaturas, salvar `.wbd` (Ctrl+S), tela de atalhos (F1)
- [x] **Fase 2** — Importação do Microsoft Whiteboard, conferida contra o motor de layout
- [x] **Fase 3** — Seleção e manipulação: mover, redimensionar, rotacionar, excluir, duplicar, ordem de camadas, undo/redo
- [x] **Fase 4** — Caneta, marca-texto, lápis, borracha, cores e espessura
- [x] **Fase 4.5** — Formas geométricas, régua e snap
- [x] **Fase 5** — Texto, post-its e alertas
- [x] **Fase 5.5** — Borracha progressiva (apagar por peça)
- [x] **Fase 6** — Busca Ctrl+F
- [x] **Fase 7** — Imagens: colar, arrastar e recortar
- [x] **Fase 8** — Exportar PNG/SVG/PDF e autosave
- [ ] **Fase 7.5** — Transcrever imagem em texto (OCR). Viabilidade confirmada:
      motor nativo do Windows (`Windows.Media.Ocr`), pt-BR já instalado, offline,
      0 MB no instalador, ~355 ms por imagem. Prosa com acentos sai perfeita;
      símbolos matemáticos e letras gregas **não** — daí o passo de revisão antes
      de inserir.
- [ ] **Fase 8** — Salvar/abrir, autosave, exportação PNG/SVG/PDF
- [ ] **Fase 9** — Polimento de UI, temas, tela de atalhos, build final
