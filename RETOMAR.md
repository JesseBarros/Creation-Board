# Onde paramos

Ponto de retomada do **Creation Board**. O [README](README.md) explica o que o app é e
como cada parte funciona; este arquivo responde outra pergunta: *em que pé isso está e
o que fazer a seguir*. Some quando o projeto acabar.

**Última sessão: 03/08/2026.** Fase 3 concluída.

---

## Estado em uma linha

Fases 0 a 3 prontas. O quadro importado do Microsoft Whiteboard já se **navega e se
reorganiza**. Ainda não dá para **desenhar** — é a próxima entrega.

## O que existe hoje

| Fase | O que entrega | Estado |
|---|---|---|
| 0 | Setup, janela, instalador `.exe` validado | pronta |
| 1 | Canvas infinito, modelo, índice espacial, culling, `F3` | pronta |
| 1.5 | Lobby com miniaturas, salvar `.wbd`, `F1` | pronta |
| 2 | Importação do Whiteboard, conferida contra o motor de layout | pronta |
| 3 | Seleção, mover/redimensionar/girar, duplicar, excluir, camadas, undo/redo, copiar/colar | pronta |
| **4** | **Caneta, marca-texto, lápis, borracha, cores e espessura** | **próxima** |

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Whiteboard, e para isso importar e manipular vêm antes de desenhar. Caneta não serve
para migrar.

---

## ⚠️ A decisão que ficou pendente

**Nenhuma branch foi mesclada na `main`.** É a primeira coisa a resolver amanhã.

```
main                      8cee67b   ← parada nas Fases 0-2
fase-2-importacao-precisa ac35041   ← Fase 2, testada e aprovada, nunca mesclada
fase-3-selecao            c479fa9   ← Fase 3, sai de cima da fase-2  (ATUAL)
```

`fase-3-selecao` contém tudo. Mesclar ela leva as duas fases de uma vez, em avanço
rápido:

```
git checkout main
git merge fase-3-selecao
```

Não fiz por conta própria porque você nunca pediu, e mexer no histórico da `main` é
decisão sua. Se preferir continuar sem mesclar, a Fase 4 pode sair de
`fase-3-selecao` normalmente.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # 33 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
```

E, ao tocar em `Document`, `SpatialIndex` ou no importador, conferir a geometria contra
o oráculo de layout:

```
$env:QB_IMPORT = "C:\Resumos-quadrobranco\_exports-originais\Cybersec resumão.zip"
npm run dev
```

Deve sair **1.063 objetos** com erro de posição **≤ 0,2px**. Qualquer número maior que
isso é regressão.

Para ver renderização, `QB_SHOT=<arquivo.png> npm run selftest` fotografa **só a janela
do app** e deixa a cena selecionada na tela — é a conferência visual das alças.

**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## Como começar a Fase 4

A camada de ferramentas já está montada e a caneta encaixa nela sem tocar em mais nada:

1. **`src/renderer/tools/PenTool.ts`** — implementa a interface `Tool`
   (`src/renderer/tools/types.ts`), a mesma que a `SelectTool` usa. O botão **esquerdo
   pertence às ferramentas**; direito e meio são da navegação, e essa fronteira é o que
   permite arrastar o quadro no meio de um traço sem trocar de modo.
2. **Registrar** em `ToolManager` (hoje tem só `select`) e criar o seletor de ferramenta
   na UI.
3. O tipo `StrokeObject` e o painter `render/painters/stroke.ts` **já existem** — foram
   escritos na Fase 1 e são usados pela carga de teste. A caneta precisa produzi-los, não
   inventá-los.
4. O traço em andamento vai na **camada de overlay** (`Renderer.beginOverlay`), não na
   estática: assim desenhar não obriga a redesenhar 10 mil objetos por frame. Só ao
   soltar o traço vira um objeto de verdade, via `AddObjects`.
5. Cobrir no `selftest` junto — ver a nota abaixo.

Atenção: `StrokeObject` guarda pressão por ponto (`[x, y, pressão, ...]`) e um `lod`
simplificado por RDP. `PointerEvent.pressure` já entrega isso em mesa digitalizadora;
com mouse vem sempre 0,5.

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
6. **Funcionalidade nova entra com cobertura no `selftest`.** Ele despacha eventos de
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
├─ tools/       Tool, ToolManager, SelectTool      ← a caneta entra aqui
├─ features/
│  ├─ selection/  hitTest, frame, transformOps, actions, clipboard
│  ├─ import/     leitor do export do Whiteboard
│  ├─ images/     AssetStore
│  └─ storage/    boardIO
├─ render/      Renderer (estática + overlay), painters, SelectionOverlay
├─ ui/          Lobby, ViewportBar, ContextMenu, ShortcutsModal, DebugPanel
└─ dev/         selftest, layoutOracle, importCheck, stress  ← ferramentas de medição
```

**Atalhos são registro único:** `src/renderer/shortcuts.ts` alimenta ao mesmo tempo a
tela de ajuda (`F1`) e o despacho de teclas. Se o atalho aparece na ajuda, ele funciona.
Adicionar atalho é adicionar linha lá, nunca escrever o texto da ajuda à mão.
