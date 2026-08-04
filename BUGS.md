# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.

**Última atualização: 04/08/2026.** 11 itens abertos (5 bugs, 6 melhorias), vindos da
primeira rodada de testes dele.

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

**Suspeita inicial:** ao voltar para o quadro, o host esteve com `display:none` e mediu
0×0; `#enterBoard()` força uma medição, mas o `ResizeObserver` dispara depois e pode
produzir um frame com o backing store do tamanho errado. Também é possível que o overlay
não seja limpo na troca.

**Falta saber:** o "lapso" é o quadro piscando em branco, conteúdo aparecendo cortado, ou
resíduo do frame anterior?

### B2 — Botões de grade, ímã e régua não funcionam direito
`a investigar` · `alto`

Os três botões da barra inferior não respondem como esperado.

**O que já se sabe:** os mesmos comandos **pelo teclado** (`G`, `A`, `R`) são cobertos
pelo auto-teste e passam. Logo, o defeito está no caminho do botão — não na ação. Isso
estreita muito a busca: é a `ViewportBar`, ou algo que engole o clique antes dela.

**Falta saber:** não fazem nada, precisam de dois cliques, ou funcionam mas o destaque de
"ligado" não acompanha?

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

O app engasga durante o uso.

**Suspeita inicial (a medir, não a assumir):** o **autosave da Fase 8** grava 3s depois de
cada alteração, e gravar chama `renderThumbnail`, que desenha o quadro **inteiro** num
canvas fora da tela. Num resumo de 1.063 objetos isso acontece a cada pausa de 3 segundos.
Outras pistas: o `pollStats` roda um `requestAnimationFrame` eterno mesmo com o painel
fechado, e o `localStorage` do B3.

**Falta saber:** trava desde sempre ou começou agora? Em quadro importado grande ou também
num quadro vazio? Trava periodicamente (a cada poucos segundos) ou durante um gesto?

---

## Melhorias

### M1 — Botão de negrito na caixa de texto
`aberto` · `médio`

**Importante:** negrito **já funciona** com `Ctrl+B` dentro da caixa (e `Ctrl+I`, `Ctrl+U`).
O que falta é o controle visível — o recurso existe e ninguém descobre. A correção é de
descoberta, não de capacidade: uma linha **B / I / U** no painel da ferramenta de texto.

### M2 — Renomear o botão de importação do Whiteboard
`aberto` · `baixo`

O botão do lobby diz "Importar do Whiteboard". **Falta decidir o novo nome.**

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

### Etapa 0 — Medir antes de corrigir (B5, B3, B1)

Nada é corrigido aqui. B5, B3 e B1 têm cara de **causa comum**, e o projeto já errou duas
vezes ao adivinhar gargalo (Fase 3 e Fase 6). Instrumentar primeiro: frame time durante o
uso, custo do autosave com miniatura, custo do `localStorage`, e o que acontece com o
canvas na troca de view.

Se a causa for comum, uma correção fecha três relatos — e redesenhar a barra (M3) antes
disso seria reescrever código que a correção vai mexer.

### Etapa 1 — Desempenho (B5, B3, B1)
Corrigir o que a Etapa 0 apontar. É a etapa `crítico`: travamento é o que faz o app deixar
de ser usável.

### Etapa 2 — Botões da barra inferior (B2)
Independente do resto e já delimitado (teclado funciona, botão não). Vem antes do M3
porque **redesenhar uma barra com um defeito de clique dentro** só esconderia o defeito.

### Etapa 3 — Barra inferior e nomes (M3, M4, M2)
Mesmo arquivo (`ViewportBar`), mais o rótulo do lobby (M2). Fazer junto evita mexer duas
vezes no mesmo lugar. Depende de decidir a direção do redesenho.

### Etapa 4 — Painel das ferramentas (M5, M6, M1) e cursor (B4)
`ToolBar` + `DrawStyle` são tocados pelos três: a barra de espessura (M5), o seletor de
cor (M6) e a linha B/I/U do texto (M1). O cursor (B4) entra junto por ser da mesma família
— aparência das ferramentas — e por ser barato.

Última de propósito: é a etapa que mais mexe em interface, e vai partir de uma barra já
redesenhada e de um app que não trava mais.
