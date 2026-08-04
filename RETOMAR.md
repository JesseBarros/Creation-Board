# Onde paramos

Ponto de retomada do **Creation Board**. O [README](README.md) explica o que o app é e
como cada parte funciona; este arquivo responde outra pergunta: *em que pé isso está e
o que fazer a seguir*. Some quando o projeto acabar.

**Última sessão: 03/08/2026.** Fase 4 concluída.

---

## Estado em uma linha

Fases 0 a 4 prontas. Dá para importar um resumo do Microsoft Whiteboard, **reorganizá-lo
e escrever à mão em cima dele**. Faltam formas geométricas e edição de texto.

## O que existe hoje

| Fase | O que entrega | Estado |
|---|---|---|
| 0 | Setup, janela, instalador `.exe` validado | pronta |
| 1 | Canvas infinito, modelo, índice espacial, culling, `F3` | pronta |
| 1.5 | Lobby com miniaturas, salvar `.wbd`, `F1` | pronta |
| 2 | Importação do Whiteboard, conferida contra o motor de layout | pronta |
| 3 | Seleção, mover/redimensionar/girar, duplicar, excluir, camadas, undo/redo, copiar/colar | pronta |
| 4 | Caneta, marca-texto, lápis, borracha, cores e espessura | pronta |
| **4.5** | **Formas geométricas, régua e snap** | **próxima** |

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Whiteboard, e para isso importar e manipular vieram antes de desenhar.

**A `main` está em dia.** As branches da Fase 2 e da Fase 3 foram mescladas em
03/08/2026, em avanço rápido; a Fase 4 saiu daí, na branch `fase-4-desenho`.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # 47 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
```

E, ao tocar em `Document`, `SpatialIndex` ou no importador, conferir a geometria contra
o oráculo de layout:

```
$env:QB_IMPORT = "C:\Resumos-quadrobranco\_exports-originais\Cybersec resumão.zip"
npm run dev
```

Deve sair **1.063 objetos** com erro de posição **≤ 0,2px**. Qualquer número maior que
isso é regressão. (O desvio de *tamanho* das caixas de texto é conhecido e deliberado —
ver a lista de decisões abaixo.)

Para ver renderização, `QB_SHOT=<arquivo.png> npm run selftest` fotografa **só a janela
do app** e deixa na tela a cena de conferência: a seleção com as alças e um traço de
cada variante, desenhados pela ferramenta de verdade. Atenção: com `QB_SHOT` a janela
**não fecha sozinha** — o processo fica aberto até você encerrá-lo.

**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## Como começar a Fase 4.5

O caminho é o mesmo que a caneta abriu, e agora ele está trilhado:

1. **`src/renderer/tools/ShapeTool.ts`** — implementa a interface `Tool`
   (`src/renderer/tools/types.ts`). Arrastar define o retângulo da forma; `Shift`
   deveria travar em quadrado/círculo, como o `Shift` da escala já faz.
2. **Registrar** em `ToolManager` (o `Record<ToolId, Tool>` do construtor), acrescentar
   o `ToolId` e um botão em `ui/ToolBar.ts` — a barra já monta cor e espessura sozinha
   para qualquer ferramenta que `isDrawTool` reconheça.
3. O tipo `ShapeObject` e o painter `render/painters/shape.ts` **já existem**, com oito
   `ShapeKind`. A ferramenta precisa produzi-los, não inventá-los.
4. A forma em andamento vai na **camada de overlay** (`ctx.invalidateOverlay()`), como o
   traço da caneta: assim arrastar uma forma não repinta 10 mil objetos por frame. Só ao
   soltar ela vira objeto de verdade, via `AddObjects`.
5. Atalho no registro único (`shortcuts.ts`) — teclas livres hoje: `R`, `O`, `A`, `T`.
   `V P M L E G B [ ]` já estão tomadas.
6. Cobrir no `selftest` junto — ver a nota abaixo.

Régua e snap são a outra metade da fase, e mexem noutro lugar: um módulo de
alinhamento consultado pelos gestos de mover e de criar, com as guias desenhadas no
overlay.

---

## Decisões que não estão óbvias no código

1. **A pasta de quadros continua `C:\Resumos-quadrobranco`** mesmo com o app renomeado
   de QuadroBranco para Creation Board. Trocar o nome faria os resumos já salvos sumirem
   do lobby. É deliberado.
2. **Reimportar sobrescreve o `.wbd`.** Os `.zip` originais em
   `C:\Resumos-quadrobranco\_exports-originais\` são a fonte de verdade para reimportar.
3. **O tamanho da caixa de texto importada não bate com o original, de propósito.** A
   largura gravada é o teto de quebra do original, não a largura que o texto ocupou; a
   altura difere por métrica de emoji e fonte substituta. Resolve na **Fase 5**, que traz
   layout de texto de verdade. Não é bug, não tentar "consertar" antes disso.
4. **Geometria de importação se mede, não se deduz.** Ler o CSS do export já levou a
   duas hipóteses plausíveis e *ambas erradas*. Existe um oráculo
   (`src/renderer/dev/layoutOracle.ts`) que mede no próprio Chromium — usar ele.
5. **O mesmo vale para desempenho.** Na Fase 3, o palpite natural sobre o gargalo do
   arraste em massa (recalcular o AABB dos traços) era o menor dos custos: 3,1 ms de
   27,3. O real era o índice espacial, 20,4 ms. Medir primeiro, otimizar depois.
6. **O marca-texto entra por baixo de tudo** (chave `z`, não ordem de desenho), senão
   grifar cobriria o texto que se quis destacar. Caneta e lápis entram por cima.
7. **A borracha apaga o objeto inteiro, e só tinta** (`stroke` e `path`). Ela ignora
   texto, post-it e imagem de propósito: um gesto largo apagaria o resumo inteiro sem
   ninguém ter pedido. O comando dela é `EraseObjects`, separado de `RemoveObjects`
   porque a borracha apaga *durante* o arraste — quando o gesto termina os objetos já
   saíram, e a captura tardia do `RemoveObjects` viria vazia.
8. **A espessura do lápis nunca passa de 100% da largura nominal.** O AABB é calculado
   inflando a linha de centro em `width / 2`; um pico de pressão maior desenharia tinta
   fora do retângulo do objeto, e o culling a cortaria na borda da tela.
9. **Funcionalidade nova entra com cobertura no `selftest`.** Ele despacha eventos de
   ponteiro e teclado no app real, então pega regressão de fiação, não só de matemática.
   Foi ele que achou, na Fase 3, um gesto de mover que nunca promovia o arraste.
   Armadilha ao mexer nele: se deixar o quadro marcado como sujo, o guarda de
   `beforeunload` recusa o fechamento e a execução automatizada pendura — por isso
   existe `App.markClean()`.

---

## Onde as coisas ficam

```
src/renderer/
├─ core/        Document, SpatialIndex, Camera, Scheduler, History, Selection
├─ commands/    um comando por mutação — é a base do undo/redo
├─ tools/       Tool, ToolManager, SelectTool, DrawTool, EraserTool, DrawStyle
├─ features/
│  ├─ selection/  hitTest, frame, transformOps, actions, clipboard
│  ├─ import/     leitor do export do Whiteboard
│  ├─ images/     AssetStore
│  └─ storage/    boardIO
├─ render/      Renderer (estática + overlay), painters, SelectionOverlay
├─ ui/          ToolBar, Lobby, ViewportBar, ContextMenu, ShortcutsModal, DebugPanel
└─ dev/         selftest, layoutOracle, importCheck, stress  ← ferramentas de medição
```

**Atalhos são registro único:** `src/renderer/shortcuts.ts` alimenta ao mesmo tempo a
tela de ajuda (`F1`) e o despacho de teclas. Se o atalho aparece na ajuda, ele funciona.
Adicionar atalho é adicionar linha lá, nunca escrever o texto da ajuda à mão.

**O `Scheduler` tem dois níveis de sujeira:** `invalidate()` redesenha conteúdo +
overlay; `invalidateOverlay()` só o de cima. Gesto em andamento usa o segundo — é o que
mantém desenhar barato num quadro cheio.
