# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.

**Última atualização: 04/08/2026.** 11 itens abertos (5 bugs, 6 melhorias), vindos da
primeira rodada de testes dele. B1, B2 e B5 já passaram por medição — e **duas suspeitas
minhas caíram**, o que mudou a ordem de correção.

---

## Como um relato vira entrada aqui

Cada item recebe um id (`B` para bug, `M` para melhoria) que **não é reaproveitado**,
mesmo depois de fechado: é por ele que a correção, o commit e a verificação se referem ao
problema.

Antes de virar "bug", cada relato passa por triagem contra as **decisões deliberadas** já
registradas no README e no RETOMAR — o projeto tem escolhas que *parecem* defeito e não
são. Quando o relato bate numa delas, não é descartado: vira `decisão a revisar`, que é
como a Fase 5.5 nasceu.

| Estado | O que significa |
|---|---|
| `aberto` | Reproduzido e entendido, esperando correção |
| `a investigar` | Relatado, mas ainda não sei a causa nem se reproduz sempre |
| `em correção` | Sendo corrigido agora |
| `corrigido` | Corrigido **e** coberto por verificação no `selftest` |
| `decisão a revisar` | Funciona como projetado; o que está em questão é o projeto |
| `não reproduz` | Não consegui reproduzir; fica aqui até aparecer de novo |

| Severidade | Critério |
|---|---|
| `crítico` | Perde trabalho, corrompe arquivo ou trava o app |
| `alto` | Impede uma tarefa comum, sem contornar |
| `médio` | Atrapalha, mas tem contorno |
| `baixo` | Incômodo visual ou de acabamento |

---

## Bugs

### B1 — Lapsos visuais ao alternar rápido entre o lobby e o quadro
`a investigar` · `médio`

Navegando rapidamente entre as abas e o quadro, aparecem falhas visuais.

Ele confirmou o sintoma: **resíduo do frame anterior** — aparece por um instante o que
estava na tela antes.

**Causa provável, e ela é estrutural:** o canvas guarda os pixels do quadro anterior até
alguém repintar. `#enterBoard()` torna a view visível e agenda o redesenho, mas o
redesenho só acontece no próximo `requestAnimationFrame` — e entre uma coisa e outra a
tela mostra o quadro antigo. Nada limpa as duas camadas na troca.

**Correção provável:** limpar (ou redesenhar de forma síncrona) antes de mostrar a view.
Um frame em branco incomoda muito menos que o quadro de outra pessoa.

### B2 — A régua não é o que ele quer que ela seja
`decisão a revisar` · `alto`

**O relato mudou de natureza quando ele explicou.** Os botões não estão quebrados: a
régua *funciona*, mas o que ela faz não é o que ele quer. Hoje ela são duas **faixas
graduadas nas bordas** da tela (topo e esquerda), em px ou cm.

O que ele quer é a régua do Microsoft Whiteboard: **um objeto físico no meio do quadro,
que se gira 360°** e serve de apoio para riscar linhas retas — a tinta encosta na borda
dela e sai reta.

**Isto reverte uma decisão da Fase 4.5**, registrada no RETOMAR: *"régua = réguas nas
bordas em px/cm, não a régua-transferidor do Whiteboard"*. Foi escolha dele na época; a
documentação precisa mudar junto, senão a próxima sessão lê a decisão e "conserta" de
volta.

**Falta decidir:** as faixas das bordas **saem** ou **ficam** convivendo com a régua nova
(elas respondem "onde eu estou", que é outra pergunta)? E se ficarem, qual das duas leva a
tecla `R`.

**Tamanho real:** isto não é correção, é funcionalidade — do porte de uma fase. Precisa de
objeto com posição e ângulo, gesto de girar com trava em ângulos redondos, indicação do
ângulo enquanto gira, e **encaixe da tinta na borda**, que é a parte que a torna útil.

### B2b — Grade e ímã: confirmar se há defeito
`a investigar` · `médio`

Os outros dois botões do relato original. A medição mostrou que **fazem efeito** quando
clicados por código, e o problema relatado era a régua. Fica aberto até ele confirmar se
grade e ímã também incomodam — pode ser só que o efeito seja difícil de ver (a grade são
pontos de 1px; o ímã só se percebe arrastando perto de uma linha).

**Medido em 04/08/2026 (novo no auto-teste):** os três botões foram procurados no DOM,
clicados e **os três fizeram efeito**. O caminho do botão funciona — o que confirma que o
problema estava no *comportamento esperado*, e não na fiação.

### B3 — Lentidão ao trocar de cor
`a investigar` · `médio`

O seletor de cores responde com atraso.

**Suspeita inicial:** cada troca chama `DrawStyle.#commit()`, que grava em `localStorage`
(síncrono) e dispara os ouvintes, e o ouvinte da barra **reconstrói todas as linhas de
opção** (cores, espessuras, formas) a cada mudança. Provavelmente a mesma família de causa
do B5.

### B4 — Cursor de cruz é feio nas ferramentas de desenho
`aberto` · `baixo`

Ele quer um cursor com cara de caneta no lugar do `crosshair`.

**Onde:** `cursorFor()` de cada ferramenta (`DrawTool`, `ShapeTool`, `NoteTool`, `TextTool`).
A borracha já faz diferente e serve de modelo: ela esconde o cursor do sistema e desenha o
próprio círculo no overlay.

### B5 — HUD lenta e travamentos gerais
`a investigar` · `crítico`

Relato dele: **engasga ao alternar os ícones rapidamente** — "como se não tivesse
desempenho suficiente para a tarefa, ou o processo de troca gerasse um bug".

**A suspeita inicial caiu.** Eu apostava no autosave da Fase 8 (grava 3s depois de cada
alteração e gera miniatura do quadro inteiro). Não é: o sintoma está preso à troca, não ao
tempo parado.

**Medido em 04/08/2026, com 4.000 objetos todos na tela:**

| | Custo |
|---|---|
| Trocar de ferramenta (só o DOM do painel) | **0,11 ms** |
| Troca + o frame que ela obriga | 17,4 ms |
| Frame ocioso, sem trocar nada (piso do vsync) | 15,8 ms |
| **Custo real da troca** | **1,6 ms** |

Ou seja: o repaint que a troca dispara **cabe folgado num frame**. Trocar de ferramenta,
sozinho, não explica o engasgo.

**Ele confirmou: são os DOIS caminhos** — alternar ferramentas na barra lateral *e* ir e
voltar entre o lobby e o quadro. E a intuição dele é que o problema está "na engine que
criou as HUDs".

Isso derruba a explicação mais simples (um caminho caro específico) e deixa o suspeito
mais desconfortável: **algo comum aos dois** é lento. O que os dois compartilham é a
reconstrução de DOM da interface e o `invalidate()` que força repintura completa.

**Medido sobre o quadro REAL (resumo importado, 1.063 objetos), em 04/08/2026:**

| Situação | Custo da repintura completa | Render |
|---|---|---|
| Tudo na tela (1.063 objetos visíveis) | **0,1 ms** acima do frame ocioso | 1,7 ms |
| Zoom 100% (1 objeto visível) | 0,1 ms | 0,6 ms |

**Repintar o quadro inteiro não custa nada perceptível, nem no material dele.** Somando às
medições anteriores, todos os suspeitos caíram:

| Suspeito | Veredito |
|---|---|
| Autosave gerando miniatura | Descartado — sintoma preso à troca, não ao tempo parado |
| Repintura ao trocar de ferramenta | Descartado — 0,1 ms no quadro real |
| DOM do painel de opções | Descartado — 0,11 ms por troca |
| Clique não chegando ao botão | Descartado — os botões respondem |

**A hipótese que sobra é sobre o ambiente, não sobre o código:** ele testou enquanto eu
editava o projeto. O servidor de desenvolvimento recarrega a página a cada alteração, e
umas vinte entraram durante a sessão de testes. Recarga no meio do uso produz exatamente
os três sintomas juntos — engasgo, resíduo do frame anterior e botão que "não responde"
(porque a página estava trocando).

**Como separar, e é a única coisa que ainda falta:** ele reproduzir com o **`F3` aberto**
(o painel mostra fps e ms por frame) enquanto eu não mexo em nada. Se os números caírem no
momento do engasgo, é o app. Se ficarem firmes e o engasgo acontecer mesmo assim, é fora
do loop de render — e aí o alvo passa a ser a interface em DOM, que é a intuição dele.

---

## Melhorias

### M1 — Botão de negrito na caixa de texto
`aberto` · `médio`

**Importante:** negrito **já funciona** com `Ctrl+B` dentro da caixa (e `Ctrl+I`, `Ctrl+U`).
O que falta é o controle visível — o recurso existe e ninguém descobre. A correção é de
descoberta, não de capacidade: uma linha **B / I / U** no painel da ferramenta de texto.

### M2 — Renomear o botão de importação do Whiteboard
`aberto` · `baixo`

O botão do lobby diz "Importar do Whiteboard". Novo nome, decidido por ele:
**"Importar arquivo"**.

### M3 — Redesenhar a barra de ferramentas inferior
`aberto` · `médio`

A barra acumulou doze controles ao longo de oito fases — já estava anotada no RETOMAR como
candidata a polimento. **Falta decidir a direção**: agrupar em menus, esconder o que é
raro, ou separar em duas barras.

### M4 — Renomear o ícone de interrogação para "comandos"
`aberto` · `baixo`

O `?` da barra inferior abre a tela de atalhos. Trocar por um rótulo escrito. Faz par com
o M3: é o mesmo arquivo.

### M5 — Trocar os três degraus de espessura por uma barra de 0 a 100%
`aberto` · `médio`

Hoje cada ferramenta tem três degraus fixos. Ele quer controle contínuo.

**Consequências a resolver junto:** 0% seria um traço invisível, então a barra precisa
mapear para uma faixa mínima–máxima por ferramenta (o lápis não pode passar de 100% da
largura nominal — ver a decisão do AABB no README). E `[` / `]` deixam de andar entre
degraus e passam a somar/subtrair uma porcentagem.

### M6 — Seletor de cores personalizado
`aberto` · `médio`

Hoje a paleta é fixa (8 cores de tinta, 5 de marca-texto, 5 de papel).

**Consequência a registrar:** `npm run check:colors` garante que **toda cor da paleta**
continua legível nos dois temas. Cor livre sai dessa garantia — o adaptador ainda impede
que ela suma no tema escuro, mas ninguém conferiu o contraste dela. Vale decidir se o
seletor avisa quando a cor escolhida tem contraste baixo.

---

## Ordem de correção

Agrupada por **área tocada** e por **dependência**, e não pela ordem em que os relatos
chegaram: corrigir na ordem de chegada faria mexer duas vezes nos mesmos arquivos.

### Etapa 0 — Medir antes de corrigir · **feita em 04/08/2026**

Duas suspeitas minhas caíram, e é por isso que esta etapa existe:

- o autosave **não** é a causa do B5 (o sintoma está preso à troca, não ao tempo parado);
- trocar de ferramenta custa **1,6 ms** com 4.000 objetos na tela — cabe folgado num
  frame, então o repaint da troca também não explica o engasgo;
- os três botões do B2 **funcionam** quando clicados por código.

Sobrou uma pergunta que decide a etapa seguinte: o que exatamente é "alternar os ícones".

O auto-teste ganhou as duas verificações que faltavam — os botões da barra pelo **clique**
(o teclado já era coberto) e o custo da troca de ferramenta com o quadro cheio.

### Etapa 0b — Medir sobre o quadro REAL (B5)
Ele confirmou que engasga nos dois caminhos e desconfia da "engine das HUDs". Tudo que
medi até aqui foi com carga sintética; o quadro dele é o resumo importado, com 642 caixas
de texto e 380 caminhos de tinta. **Repintar isso não custa o mesmo.** Sem esse número,
qualquer correção de desempenho é chute.

### Etapa 1 — B1 (resíduo do frame) e o que a Etapa 0b apontar (B5, B3)
O B1 já tem causa e correção: limpar as camadas antes de mostrar a view. B3 tem causa
provável já lida no código — cada troca de cor grava em `localStorage` e **reconstrói
todas as linhas do painel**. Se a Etapa 0b apontar a repintura como culpada, os três se
resolvem juntos, porque a raiz é a mesma: **a interface manda repintar o quadro inteiro
por mudanças que só afetam a interface**.

### Etapa 2 — B2b (grade e ímã), se ele confirmar que incomodam
Pequeno e independente. A régua saiu daqui — virou funcionalidade nova (abaixo).

### Etapa 3 — Barra inferior e nomes (M3, M4, M2)
Mesmo arquivo (`ViewportBar`), mais o rótulo do lobby (M2). Fazer junto evita mexer duas
vezes no mesmo lugar. Depende de decidir a direção do redesenho.

### Etapa 4 — Painel das ferramentas (M5, M6, M1) e cursor (B4)
`ToolBar` + `DrawStyle` são tocados pelos três: a barra de espessura (M5), o seletor de
cor (M6) e a linha B/I/U do texto (M1). O cursor (B4) entra junto por ser da mesma família
— aparência das ferramentas — e por ser barato.

Última de propósito: é a etapa que mais mexe em interface, e vai partir de uma barra já
redesenhada e de um app que não trava mais.

### Fora da rodada — Régua giratória (B2)

**Não cabe num patch de correções.** É funcionalidade do porte de uma fase, e entra
depois — ou no lugar da Fase 9, se ele preferir. O que ela precisa:

1. Um instrumento com posição e ângulo, desenhado no overlay. **Não é objeto do quadro**:
   régua não se salva no `.wbd` nem entra na exportação, do mesmo jeito que a grade e as
   guias de encaixe não entram.
2. Gesto de girar 360°, com trava em ângulos redondos (0/15/30/45/90) e o ângulo escrito
   na tela enquanto gira — sem ler o número, alinhar vira tentativa e erro.
3. **A parte que a torna útil:** a tinta encosta na borda e sai reta. Isso é encaixe, e o
   projeto já tem a peça — `features/snapping/snap.ts` devolve uma *correção*, não uma
   posição, que é exatamente o que um traço em andamento precisa.
4. Decidir o convívio com as faixas das bordas (ficam? saem? quem leva o `R`?).
