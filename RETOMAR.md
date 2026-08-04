# Onde paramos

Ponto de retomada do **Creation Board**. O [README](README.md) explica o que o app é e
como cada parte funciona; este arquivo responde outra pergunta: *em que pé isso está e
o que fazer a seguir*. Some quando o projeto acabar.

**Última sessão: 04/08/2026.** Fase 4.5 concluída.

---

## Estado em uma linha

Fases 0 a 4.5 prontas. Dá para importar um resumo do Microsoft Whiteboard, **reorganizá-lo
com alinhamento assistido, escrever à mão e desenhar formas em cima dele**. Falta edição
de texto.

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
| **5** | **Texto, post-its e alertas** | **próxima** |

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Whiteboard, e para isso importar e manipular vieram antes de desenhar.

**A `main` foi até a Fase 4** (mesclada em 04/08/2026, em avanço rápido). A Fase 4.5 está
na branch **`fase-4-5-formas`**, ainda sem mesclar — ele não pediu.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # 60 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
```

⚠️ **Uma das 60 mede a máquina, não o código:** "arrastar 10.000 objetos selecionados
fica acima de 30fps", com teto de 33 ms por frame. Ela reprova com o computador ocupado —
em 04/08/2026 reprovou com **50–62 ms** simplesmente porque o **CS2 estava aberto**, e a
`main` sem nenhuma mudança reprovou pior que a branch nova. O sinal de que é a máquina, e
não uma regressão, está na própria linha do resultado: se o custo de `bbox` (matemática
pura, que quase nunca muda) subiu junto, é carga externa. Rodar de novo com o jogo
fechado antes de investigar qualquer coisa.

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
do app** e deixa na tela a cena de conferência: seleção com alças, um traço de cada
variante, duas formas, as réguas ligadas e um objeto encostado noutro pelo encaixe —
tudo produzido pelas ferramentas de verdade. Atenção: com `QB_SHOT` a janela **não fecha
sozinha** — o processo fica aberto até você encerrá-lo.

**A guia de encaixe não sai na foto**, e não é bug: ela existe só enquanto o botão está
pressionado, e um gesto deixado em aberto é desfeito pelo guarda de `blur` do
`ToolManager` assim que a janela perde o foco (comportamento certo — gesto pendurado não
pode sobreviver). Quem verifica a guia é a checagem numérica sobre `snapRect`; para vê-la
com os olhos, arraste um objeto perto de outro no app.

**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## Como começar a Fase 5

Texto é a fase que resolve a pendência da importação (ver decisão 3 abaixo) e é a maior
até aqui, porque precisa de **layout de texto de verdade**: quebra de linha, medição de
glifos e um cursor que anda pelo texto.

1. O tipo `TextObject` e o painter `render/painters/text.ts` **já existem** e já são
   usados pela importação — inclusive com LOD por objeto. O que falta é *editar*.
2. A edição usa `contentEditable` sobre o canvas, que é a decisão de arquitetura já
   registrada no README: cursor, seleção, acentuação e IME saem de graça do navegador, e
   o canvas volta a desenhar quando a edição termina. Um editor de texto próprio dentro
   do canvas seria meses de trabalho para reimplementar o que o Chromium já faz.
3. `NoteObject` (post-it, com `alert` e `pinned`) segue o mesmo caminho e reaproveita o
   editor — a diferença é o fundo e o comportamento de fixar.
4. A ferramenta nova entra como as outras: arquivo em `tools/`, `ToolId` novo, botão em
   `ui/ToolBar.ts`, atalho em `shortcuts.ts`. Teclas livres: `T`, `N`, `O`, `S`.
5. Quando o layout de texto existir, **rever o tamanho das caixas importadas**: é ali que
   a divergência conhecida deixa de ser deliberada e passa a ser corrigível.
6. Cobrir no `selftest` junto — ver a nota abaixo.

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
9. **O encaixe devolve uma correção, não uma posição.** Quem arrasta tem um delta
   acumulado desde o início do gesto; substituir a posição faria o objeto perder o
   vínculo com o cursor. Vale para mover, redimensionar e criar forma.
10. **Linha e seta não são normalizadas para o canto superior esquerdo.** Elas guardam a
    direção em `w`/`h` (o painter vai de `0,0` até `w,h`); normalizar viraria uma seta
    apontando sempre para baixo e para a direita.
11. **A prévia de um gesto passa pelo adaptador de cor** (`ToolContext.adapt`), igual aos
    painters. Sem isso, no tema escuro a prévia de um traço quase preto sumiria no fundo e
    só reapareceria clara quando o gesto terminasse.
12. **Funcionalidade nova entra com cobertura no `selftest`.** Ele despacha eventos de
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
├─ tools/       Tool, ToolManager, SelectTool, DrawTool, EraserTool, ShapeTool, DrawStyle
├─ features/
│  ├─ selection/  hitTest, frame, transformOps, actions, clipboard
│  ├─ snapping/   snap (guias de alinhamento + grade)
│  ├─ import/     leitor do export do Whiteboard
│  ├─ images/     AssetStore
│  └─ storage/    boardIO
├─ render/      Renderer (estática + overlay), painters, SelectionOverlay, SnapGuides, Rulers
├─ ui/          ToolBar, Lobby, ViewportBar, ContextMenu, ShortcutsModal, DebugPanel
└─ dev/         selftest, layoutOracle, importCheck, stress  ← ferramentas de medição
```

**Atalhos são registro único:** `src/renderer/shortcuts.ts` alimenta ao mesmo tempo a
tela de ajuda (`F1`) e o despacho de teclas. Se o atalho aparece na ajuda, ele funciona.
Adicionar atalho é adicionar linha lá, nunca escrever o texto da ajuda à mão.

**O `Scheduler` tem dois níveis de sujeira:** `invalidate()` redesenha conteúdo +
overlay; `invalidateOverlay()` só o de cima. Gesto em andamento usa o segundo — é o que
mantém desenhar barato num quadro cheio.
