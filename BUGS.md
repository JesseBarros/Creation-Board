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

### B2 — Botões de grade, ímã e régua não funcionam direito
`a investigar` · `alto`

Relato dele: **"não acontece nada"** ao clicar nos três.

**Medido em 04/08/2026 (novo no auto-teste):** os três botões foram procurados no DOM,
clicados e **os três fizeram efeito** — `grid.enabled`, `snapToGrid` e as réguas mudaram
de estado. Numa instância nova do app, o caminho do botão funciona.

Isso descarta as hipóteses fáceis (handler não ligado, clique engolido por um elemento por
cima) e deixa três em pé:

1. o efeito acontece mas **não se vê** no contexto dele — a grade é de pontos de 1px, e o
   ímã só se percebe arrastando perto de uma linha da grade;
2. a instância que ele testou estava velha (o servidor de dev recarrega a página a cada
   alteração minha, e várias entraram durante o teste);
3. o clique real (com hit-test do mouse) esbarra em algo que o `.click()` sintético do
   teste não vê.

**Como separar em um gesto:** apertar `R` no teclado e depois clicar no botão "régua". Se
a tecla mostra a régua e o botão não, é (3). Se os dois mostram, é (1) ou (2).

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

**O que sobra como suspeito, e depende de uma pergunta:** se "alternar os ícones" for
alternar entre o **lobby e o quadro**, o caminho é outro e é caro de verdade — voltar ao
lobby lista os arquivos do disco e decodifica as miniaturas, e abrir um quadro
**descompacta o `.wbd` e decodifica os assets**. Repetir isso rápido engasga, e explicaria
o B1 pelo mesmo motivo.

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

### Etapa 1 — B1 (resíduo do frame) e o que a pergunta do B5 apontar
O B1 já tem causa e correção provável: limpar as camadas antes de mostrar a view. Se o B5
for a troca lobby↔quadro, ele é da mesma família — a transição é o caminho caro (listar
disco, descompactar `.wbd`, decodificar assets) — e as duas correções andam juntas.

### Etapa 2 — B2 e B3, depois de saber o que o gesto real faz
O B2 depende do teste de um gesto (tecla `R` contra o botão "régua"). O B3 (lentidão do
seletor de cor) tem causa provável já lida no código: cada troca grava em `localStorage` e
**reconstrói todas as linhas do painel**. Vêm antes do M3 porque redesenhar uma barra com
defeito dentro só esconderia o defeito.

### Etapa 3 — Barra inferior e nomes (M3, M4, M2)
Mesmo arquivo (`ViewportBar`), mais o rótulo do lobby (M2). Fazer junto evita mexer duas
vezes no mesmo lugar. Depende de decidir a direção do redesenho.

### Etapa 4 — Painel das ferramentas (M5, M6, M1) e cursor (B4)
`ToolBar` + `DrawStyle` são tocados pelos três: a barra de espessura (M5), o seletor de
cor (M6) e a linha B/I/U do texto (M1). O cursor (B4) entra junto por ser da mesma família
— aparência das ferramentas — e por ser barato.

Última de propósito: é a etapa que mais mexe em interface, e vai partir de uma barra já
redesenhada e de um app que não trava mais.
