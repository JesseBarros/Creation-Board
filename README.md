# Creation Board

Quadro branco infinito local para estudos. Substituto pessoal do Microsoft Whiteboard,
rodando 100% offline no Windows: sem login, sem nuvem, sem servidor.

**Status:** canvas infinito, lobby, importação do Whiteboard e **seleção completa**
(mover, redimensionar, girar, duplicar, excluir, ordem de camadas, undo/redo). O quadro
importado já se reorganiza. Ainda não há **caneta** — desenhar à mão é a próxima entrega.

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
| Salvar | `Ctrl+S` |
| Voltar ao lobby | `Ctrl+O` |
| Selecionar | Clique · Shift+clique soma · arrastar no vazio faz laço |
| Selecionar tudo / limpar | `Ctrl+A` / `Esc` |
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

Uma diferença que **permanece de propósito**: o tamanho da caixa de texto não fecha com
o medido. A largura gravada é o *teto de quebra* do original (`max-width`), não a largura
que o texto ocupou — são grandezas diferentes, e gravar a medida por nós congelaria no
arquivo um valor da fonte substituta. A altura difere porque a caixa de linha do
navegador cresce com emoji e com a fonte substituta (medido: 78px de altura para uma
fonte de 34px). A Fase 5, com layout de texto de verdade, é onde isso se resolve.

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
capturar a tela. **33 verificações**, em três frentes:

- **Navegação:** pan com botão direito e com o do meio, o limiar que separa arrastar
  de clicar, o botão esquerdo permanecendo livre para as ferramentas, o zoom ancorado
  no cursor, os dois limites de zoom e a rolagem sem Ctrl.
- **Seleção:** clique, Shift+clique somando e tirando, laço por área, mover,
  Shift travando o eixo, redimensionar pela alça com a âncora oposta parada, girar um
  quarto de volta, excluir, desfazer, duplicar, setas, `Ctrl+A`, `Esc`, ordem de
  camadas e objeto travado recusando seleção. Inclui a verificação de que **um arraste
  inteiro vira um único passo de undo** e a de que clicar no vazio dentro do retângulo
  de um traço diagonal *não* seleciona.
- **Persistência:** copiar, recortar, colar no cursor, e um teste que move e
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

O que ele **não** cobre: a tradução que o Windows faz do botão físico para
`PointerEvent.button` (padrão, não varia) nem o desenho do overlay. Para o desenho,
o teste termina deixando a cena selecionada na tela, então
`QB_SHOT=<arquivo.png> npm run selftest` fotografa o contorno, as alças e a alça de
rotação de verdade.

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
   ├─ tools/          uma ferramenta por arquivo, interface Tool comum
   ├─ features/       search, snapping, clipboard, images, export
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
- [ ] **Fase 4** — Caneta, marca-texto, lápis, borracha, cores e espessura
- [ ] **Fase 4.5** — Formas geométricas, régua e snap
- [ ] **Fase 5** — Texto, post-its e alertas
- [ ] **Fase 6** — Busca Ctrl+F
- [ ] **Fase 7** — Imagens
- [ ] **Fase 7.5** — Transcrever imagem em texto (OCR). Viabilidade confirmada:
      motor nativo do Windows (`Windows.Media.Ocr`), pt-BR já instalado, offline,
      0 MB no instalador, ~355 ms por imagem. Prosa com acentos sai perfeita;
      símbolos matemáticos e letras gregas **não** — daí o passo de revisão antes
      de inserir.
- [ ] **Fase 8** — Salvar/abrir, autosave, exportação PNG/SVG/PDF
- [ ] **Fase 9** — Polimento de UI, temas, tela de atalhos, build final
