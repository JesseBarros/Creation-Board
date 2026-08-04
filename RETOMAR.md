# Onde paramos

Ponto de retomada do **Creation Board**. O [README](README.md) explica o que o app é e
como cada parte funciona; este arquivo responde outra pergunta: *em que pé isso está e
o que fazer a seguir*. Some quando o projeto acabar.

**Última sessão: 04/08/2026.** Fases 5, 5.5, 6, 7 e 8 concluídas, mais uma **rodada de
correção de bugs** vinda do uso real — ver **[BUGS.md](BUGS.md)**.

> **Retomar por aqui:** dois itens esperam **reteste dele**, e é a primeira coisa a
> perguntar:
> - **B7** — a janela "rasgava" ao redimensionar. Corrigido (repintura forçada no processo
>   principal + repintura síncrona ao medir), mas ele não chegou a testar.
> - **B5** — queda breve de fps ao clicar num controle. Provavelmente foi junto com o B3;
>   confirmar com o `F3` aberto.
>
> Com esses dois fechados, a lista zera e a **Fase 9** (polimento, temas, build final)
> começa. E ela começa por `npm run dist`: o instalador não é gerado desde a Fase 0.

---

## Estado em uma linha

Fases 0 a 8 prontas. Dá para importar um resumo do Microsoft Whiteboard, **trabalhar em
cima dele por inteiro** (reorganizar com alinhamento assistido, escrever à mão, desenhar
formas, digitar texto e post-its, apagar tinta por peça, achar palavra com `Ctrl+F`,
colar/arrastar/recortar imagens) e **tirar dali um PNG, SVG ou PDF**, com o quadro
gravando sozinho. Falta o polimento final (Fase 9) e o OCR (7.5), que ficou para depois.

## O que existe hoje

| Fase | O que entrega | Estado |
|---|---|---|
| 0 | Setup, janela, instalador `.exe` validado | pronta |
| 1 | Canvas infinito, modelo, índice espacial, culling, `F3` | pronta |
| 1.5 | Lobby com miniaturas, salvar `.wbd`, `F1` | pronta |
| 2 | Importação do Whiteboard, conferida contra o motor de layout | pronta |
| 3 | Seleção, mover/redimensionar/girar, duplicar, excluir, camadas, undo/redo, copiar/colar | pronta |
| 4 | Caneta, marca-texto, lápis, borracha, cores e espessura | pronta |
| 4.5 | Formas, encaixe com guias, grade magnética, réguas | pronta |
| 5 | Texto, post-its e alertas | pronta |
| 5.5 | Borracha progressiva (apagar por peça) | pronta |
| 6 | Busca `Ctrl+F` | pronta |
| 7 | Imagens: colar, arrastar e recortar | pronta |
| 8 | Exportar PNG/SVG/PDF e autosave | pronta |
| **9** | **Polimento de UI, temas e build final** | **próxima** |
| 7.5 | OCR: transcrever imagem em texto | adiada, fica para depois da 9 |

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Whiteboard, e para isso importar e manipular vieram antes de desenhar.

A Fase 5.5 nasceu de um pedido dele ao testar a Fase 5 — a borracha apagando o traço
inteiro não servia — e **reverteu a decisão da Fase 4**. Está resolvida.

**A `main` foi até a Fase 7** (mesclada em 04/08/2026, em avanço rápido). A Fase 8 está
na branch **`fase-8-exportar`**, ainda sem mesclar — ele não pediu.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # 107 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
```

⚠️ **Duas das 107 medem a máquina, não o código.** A primeira: "arrastar 10.000 objetos selecionados
fica acima de 30fps", com teto de 33 ms por frame. Ela reprova com o computador ocupado —
em 04/08/2026 reprovou com **50–62 ms** simplesmente porque o **CS2 estava aberto**, e a
`main` sem nenhuma mudança reprovou pior que a branch nova. O sinal de que é a máquina, e
não uma regressão, está na própria linha do resultado: se o custo de `bbox` (matemática
pura, que quase nunca muda) subiu junto, é carga externa. Rodar de novo com o jogo
fechado antes de investigar qualquer coisa.

A segunda é da Fase 6: **"buscar em 10.000 objetos custa menos que um frame"**, teto de
16 ms. Ela é o que sustenta não haver índice invertido, e a linha do resultado traz a
repartição — em 04/08/2026: **4,0 ms por tecla, dos quais 0,9 ms é varrer tudo**. Se um
dia ela reprovar, olhe primeiro a varredura pura: se ela continuar perto de 1 ms, o
problema não é procurar, é montar os trechos, e índice nenhum resolve isso.

E, ao tocar em `Document`, `SpatialIndex`, no importador ou no **layout de texto**,
conferir a geometria contra o oráculo:

```
$env:QB_IMPORT = "C:\Resumos-quadrobranco\_exports-originais\Cybersec resumão.zip"
npm run dev
```

Deve sair **1.063 objetos**. Os números de referência depois da Fase 5:

| Tipo | n | pos_méd | pos_máx | tam_méd | tam_máx |
|---|---|---|---|---|---|
| PlainText | 642 | 0,3 | 80,1 | 84,9 | 734,5 |
| InkGroup | 345 | 0,0 | 0,2 | 0,0 | 0,3 |
| AzureImage | 36 | 0,0 | 0,1 | 0,0 | 0,0 |
| Note | 5 | 0,0 | 0,1 | 3,8 | 4,6 |

Tinta, imagem e post-it fecham em **≤ 0,2px de posição** — qualquer número maior ali é
regressão. **O texto é o caso com história** (leia antes de suspeitar de bug):

- O erro de *tamanho* caiu de 136,2 para 84,9 de média (máx. de 3.295 para 734) porque a
  caixa deixou de guardar o teto de quebra e passa a guardar o que o texto ocupou.
- O que sobrou é **limite de medição, não decisão**: o navegador monta a caixa de linha
  com a métrica da fonte que desenhou cada glifo, inclusive a substituta de um emoji
  (medido: 62px de caixa para fonte de 34px), e essa métrica não aparece no `measureText`
  do canvas.
- `pos_máx` de 80px vem dos **dois textos girados a 45°**: num objeto girado o AABB
  depende dos dois lados da caixa, então uma caixa mais estreita move os cantos. A origem
  do objeto continua exata.

Para ver renderização, `QB_SHOT=<arquivo.png> npm run selftest` fotografa **só a janela
do app** e deixa na tela a cena de conferência: seleção com alças, um traço de cada
variante, duas formas, as réguas ligadas, um objeto encostado noutro pelo encaixe, uma
caixa de texto com negrito, sublinhado e marcadores, um post-it com alerta, um buraco de
borracha no meio de um traço, a busca aberta com o achado destacado e uma imagem com o
recorte aberto (sombra, terços e alças) — tudo produzido pelas ferramentas de verdade. Atenção: com `QB_SHOT` a janela **não fecha
sozinha** — o processo fica aberto até você encerrá-lo.

**A guia de encaixe não sai na foto**, e não é bug: ela existe só enquanto o botão está
pressionado, e um gesto deixado em aberto é desfeito pelo guarda de `blur` do
`ToolManager` assim que a janela perde o foco (comportamento certo — gesto pendurado não
pode sobreviver). Quem verifica a guia é a checagem numérica sobre `snapRect`; para vê-la
com os olhos, arraste um objeto perto de outro no app.

E, ao mexer em exportação, conferir os três formatos por terminal — o diálogo de salvar e
o `printToPDF` não passam pelo auto-teste:

```
$env:QB_EXPORT = "$env:TEMP\qb-export"; npm run dev
```

Grava `.png`, `.svg`, `.pdf` e ainda `-svg.png`, que é **o SVG relido pelo navegador**:
se ele não carregar, o arquivo que geramos não serve. Referência em 04/08/2026, com 120
objetos: PNG 6432×6130 em ~700ms, SVG 75 KB em 4ms, PDF em ~800ms.

**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## Como começar a Fase 9

Polimento de UI, temas e build final. É a fase que fecha o projeto, e por isso vale
começar **usando o app por uma hora** e anotando o que incomoda — foi assim que a 5.5
nasceu, e ela era mais importante que metade do que estava planejado.

1. **Rodar `npm run dist`** cedo, e não no fim: o instalador foi validado na Fase 0 e
   nunca mais desde então. Oito fases de código novo entraram depois.
2. **Reimportar os resumos de verdade** (`QB_IMPORT_SAVE=1`) e abrir cada um: é o teste
   de aceitação que importa, já que o objetivo do projeto é migrar esses arquivos.
3. Candidatos de polimento já visíveis: a barra inferior está com doze controles, o painel
   de opções da barra lateral cresce a cada ferramenta, e não há indicação visual de que o
   autosave gravou (só a dica do nome).
4. O tema escuro nunca foi olhado com todas as fases prontas — `npm run check:colors`
   garante contraste de marca, mas não diz se a interface ficou boa.

---

## Decisões que não estão óbvias no código

1. **A pasta de quadros continua `C:\Resumos-quadrobranco`** mesmo com o app renomeado
   de QuadroBranco para Creation Board. Trocar o nome faria os resumos já salvos sumirem
   do lobby. É deliberado.
2. **Reimportar sobrescreve o `.wbd`.** Os `.zip` originais em
   `C:\Resumos-quadrobranco\_exports-originais\` são a fonte de verdade para reimportar.
3. **Geometria de importação se mede, não se deduz.** Ler o CSS do export já levou a
   hipóteses plausíveis e erradas — três, contando a da Fase 5 (achei que as âncoras de
   texto fossem centradas; o oráculo mostrou `align topLeft`). Existe um oráculo
   (`src/renderer/dev/layoutOracle.ts`) que mede no próprio Chromium — usar ele. Ele
   agora também relata **fonte, peso, entrelinha e número de linhas computados**, que é o
   que transformou "a caixa não fecha" em "a caixa não fecha por causa de emoji".
4. **O mesmo vale para desempenho.** Na Fase 3, o palpite natural sobre o gargalo do
   arraste em massa (recalcular o AABB dos traços) era o menor dos custos: 3,1 ms de
   27,3. O real era o índice espacial, 20,4 ms. Medir primeiro, otimizar depois.
5. **O marca-texto entra por baixo de tudo** (chave `z`, não ordem de desenho), senão
   grifar cobriria o texto que se quis destacar. Caneta e lápis entram por cima.
6. **A borracha apaga por peça (padrão) ou o traço inteiro, e só tinta** (`stroke` e
   `path`). Ela ignora texto, post-it e imagem de propósito: um gesto largo apagaria o
   resumo inteiro sem ninguém ter pedido. Os comandos são `EraseInk` e `EraseObjects`,
   separados de `RemoveObjects` porque a borracha apaga *durante* o arraste — quando o
   gesto termina o estado já mudou, e a captura tardia viria vazia.
6b. **O apagamento por peça é MÁSCARA, não recorte da geometria.** O objeto guarda os
   rastros em `erased` e o buraco aparece no desenho, com `destination-out` num canvas
   intermediário (`render/painters/erase.ts`). Recortar seria viável no traço de caneta e
   **impossível de estender** à caligrafia importada, que é contorno preenchido e exigiria
   subtração booleana de contornos. Pintar por cima com a cor do fundo — a saída barata —
   estaria errado: no tema escuro a mancha apareceria clara, o marca-texto por baixo
   continuaria visível e a miniatura sairia com retângulos brancos. Um objeto que ficou
   sem nenhum pixel visível sai do quadro; quem decide isso é uma rasterização de 64px, e
   não a geometria, porque `PathObject` não tem "pontos do traço" para conferir.
7. **A espessura do lápis nunca passa de 100% da largura nominal.** O AABB é calculado
   inflando a linha de centro em `width / 2`; um pico maior desenharia tinta fora do
   retângulo do objeto, e o culling a cortaria na borda da tela.
8. **O encaixe devolve uma correção, não uma posição.** Quem arrasta tem um delta
   acumulado desde o início do gesto; substituir a posição faria o objeto perder o
   vínculo com o cursor. Vale para mover, redimensionar e criar.
9. **Linha e seta não são normalizadas para o canto superior esquerdo.** Elas guardam a
   direção em `w`/`h`; normalizar viraria uma seta apontando sempre para baixo e para a
   direita.
10. **A prévia de um gesto passa pelo adaptador de cor** (`ToolContext.adapt`), igual aos
    painters. Sem isso, no tema escuro a prévia de um traço quase preto sumiria no fundo.
11. **A edição de texto é um `contentEditable` sobre o canvas.** Cursor, seleção,
    acentuação e IME saem de graça do Chromium; um editor próprio dentro do canvas seria
    reescrever um motor de texto. Enquanto a caixa está aberta o objeto **não é
    desenhado** (`Renderer.hiddenId`), senão o texto sai duplicado meio pixel fora.
12. **A caixa nova só entra no documento se receber texto.** Enquanto se digita ela é só
    o `<div>` — por isso uma caixa aberta por engano não deixa objeto invisível nem passo
    de undo. Esvaziar uma caixa existente a remove, pelo mesmo motivo.
13. **O layout de texto é ponto único de verdade** (`render/text/layout.ts`): painter,
    importador e editor medem pelo mesmo código. Foi cada um medindo por conta própria
    que produziu a divergência de tamanho que a importação carregou da Fase 2 à 5.
14. **A altura de linha vem da fonte, com piso no multiplicador** — `fontBoundingBox` e
    `actualBoundingBox`, a maior das duas. `fontSize × lineHeight` sozinho corta emoji.
15. **A busca não tem índice invertido, e isso foi medido.** Varrer 10.000 objetos sem
    casar com nada custa 0,9 ms: procurar nunca foi o gargalo. O que estava caro era
    dobrar o texto (tirar acento e caixa) de tudo a cada tecla — 20,8 ms —, resolvido com
    um `WeakMap` chaveado pelo próprio objeto, já que toda mutação o substitui e a
    invalidação sai de graça. Antes de "otimizar a busca", ler a repartição na linha do
    autoteste.
16. **Arquivo solto na janela do Electron NAVEGA** se ninguém chamar `preventDefault` —
    o app some e a janela vira um visualizador de imagem, sem volta. Por isso `dragover` e
    `drop` são barrados na `window` inteira, e não só no canvas.
17. **O recorte de imagem só aperta para dentro, e compõe no espaço normalizado** (0..1)
    do arquivo. Compor é o que faz o segundo corte continuar de onde o primeiro parou;
    medir em pixels acumularia erro e dependeria do tamanho no quadro. "Remover recorte"
    é o caminho de volta, e por isso arrastar para fora não precisa existir.
18. **`PatchObjects` é o comando genérico de conteúdo+geometria** (texto, marcadores,
    recorte). Ele nasceu como `EditText` e foi renomeado na Fase 7, quando o terceiro uso
    apareceu — se você procurar `EditText` no histórico, é ele.
19. **Exportar reaproveita os painters no PNG e NÃO no SVG.** No PNG é o mesmo
    `paintObject` da tela — dois renderizadores divergiriam na primeira funcionalidade
    nova. No SVG isso é impossível (os painters falam canvas), então o que se reaproveita
    é o que decide aparência: layout de texto, adaptador de cor, constantes do post-it.
    Duas perdas assumidas: pressão do lápis vira espessura média, e texto sai como
    `<text>` (dependente da fonte de quem abrir, mas selecionável).
20. **O autosave só grava quadro que já tem caminho, e nunca com caixa de texto aberta.**
    A regra mora em `features/storage/autosave.ts`, separada de quem grava, porque um
    teste que gravasse de verdade encheria a pasta de quadros a cada execução.
21. **Funcionalidade nova entra com cobertura no `selftest`.** Ele despacha eventos de
    ponteiro e teclado no app real, então pega regressão de fiação, não só de matemática.
    Foi ele que achou, na Fase 5, um `commit()` que lia `#isNew` **depois** de fechar o
    editor — toda caixa nova virava "edição" de um objeto inexistente. Armadilha ao mexer
    nele: se deixar o quadro marcado como sujo, o guarda de `beforeunload` recusa o
    fechamento e a execução pendura — por isso existe `App.markClean()`, e por isso cada
    bloco roda dentro de um guarda que transforma exceção em FALHA.

---

## Onde as coisas ficam

```
src/renderer/
├─ core/        Document, SpatialIndex, Camera, Scheduler, History, Selection
├─ commands/    um comando por mutação — é a base do undo/redo
├─ tools/       Tool, ToolManager, SelectTool, DrawTool, EraserTool, ShapeTool,
│               TextTool, NoteTool, CropTool (modo, não fica na barra), DrawStyle
├─ features/
│  ├─ selection/  hitTest, frame, transformOps, actions, clipboard
│  ├─ snapping/   snap (guias de alinhamento + grade)
│  ├─ search/     busca por texto, sem índice invertido (ver a medição)
│  ├─ export/     exportBoard (PNG, reusa os painters) e exportSvg (não reusa)
│  ├─ text/       TextEditor (contentEditable), spans (DOM ↔ RichSpan)
│  ├─ import/     leitor do export do Whiteboard
│  ├─ images/     AssetStore, insert (colar e arrastar arquivo)
│  └─ storage/    boardIO, autosave (a regra, separada de quem grava)
├─ render/      Renderer (estática + overlay), painters (+ erase: máscara da borracha),
│               text/layout, SelectionOverlay, SnapGuides, Rulers, PinnedNotes,
│               SearchHighlight, CropOverlay
├─ ui/          ToolBar, SearchBar, Lobby, ViewportBar, ContextMenu, ShortcutsModal,
│               DebugPanel
└─ dev/         selftest, layoutOracle, importCheck, exportCheck, stress
                ← ferramentas de medição
```

**Atalhos são registro único:** `src/renderer/shortcuts.ts` alimenta ao mesmo tempo a
tela de ajuda (`F1`) e o despacho de teclas. Se o atalho aparece na ajuda, ele funciona.
Adicionar atalho é adicionar linha lá, nunca escrever o texto da ajuda à mão.

**O `Scheduler` tem dois níveis de sujeira:** `invalidate()` redesenha conteúdo +
overlay; `invalidateOverlay()` só o de cima. Gesto em andamento usa o segundo — é o que
mantém desenhar barato num quadro cheio.
