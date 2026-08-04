# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.



Vale registrar o padrão, porque ele se repete: **medir antes de corrigir devolveu mais
resultado que corrigir teria devolvido.** Nenhuma linha de correção foi escrita, e três
dos cinco bugs fecharam ou encolheram.

---





| Severidade | Critério |
|---|---|
| `crítico` | Perde trabalho, corrompe arquivo ou trava o app |
| `alto` | Impede uma tarefa comum, sem contornar |
| `médio` | Atrapalha, mas tem contorno |
| `baixo` | Incômodo visual ou de acabamento |

---

## Bugs

### B1 — Lapsos visuais ao alternar rápido entre o lobby e o quadro
`corrigido` · `médio` · 04/08/2026

**Correção:** `#enterBoard()` passou a pintar as duas camadas **na hora**, em vez de
esperar o próximo frame de animação. Até o `requestAnimationFrame` chegar, o canvas ainda
tinha os pixels do quadro anterior — e era isso que aparecia.

<details>
<summary>Investigação</summary>

Navegando rapidamente entre as abas e o quadro, aparecem falhas visuais.

foi confirmado o sintoma: **resíduo do frame anterior** — aparece por um instante o que
estava na tela antes.

**Causa provável, e ela é estrutural:** o canvas guarda os pixels do quadro anterior até
alguém repintar. `#enterBoard()` torna a view visível e agenda o redesenho, mas o
redesenho só acontece no próximo `requestAnimationFrame` — e entre uma coisa e outra a
tela mostra o quadro antigo. Nada limpa as duas camadas na troca.

**Correção provável:** limpar (ou redesenhar de forma síncrona) antes de mostrar a view.
Um frame em branco incomoda muito menos que o quadro de outra pessoa.

</details>

### B2 — A régua: decisão da Fase 4.5 **mantida**
`fechado — não é bug` · 04/08/2026

Ele avaliou a régua-instrumento do Whiteboard contra a que existe e **decidiu ficar com a
atual**: [...]. A decisão da Fase 4.5 continua
valendo, e a documentação não muda.




O que se quer é a régua do Microsoft Whiteboard: **um objeto físico no meio do quadro,
que se gira 360°** e serve de apoio para riscar linhas retas — a tinta encosta na borda
dela e sai reta.

**Isto reverte uma decisão da Fase 4.5**, registrada no RETOMAR: *"régua = réguas nas
bordas em px/cm, não a régua-transferidor do Whiteboard"*. Foi escolha na época; a
documentação precisa mudar junto, senão a próxima sessão lê a decisão e "conserta" de
volta.

**Falta decidir:** as faixas das bordas **saem** ou **ficam** convivendo com a régua nova
(elas respondem [...], que é outra pergunta)? E se ficarem, qual das duas leva a
tecla `R`.

**Tamanho real:** isto não é correção, é funcionalidade — do porte de uma fase. Precisa de
objeto com posição e ângulo, gesto de girar com trava em ângulos redondos, indicação do
ângulo enquanto gira, e **encaixe da tinta na borda**, que é a parte que a torna útil.

</details>

### B2b — Grade e ímã
`fechado — não é bug` · 04/08/2026

Ele esclareceu que o incômodo era só a régua. A medição já mostrava que os dois botões
fazem efeito.

**Medido em 04/08/2026 (novo no auto-teste):** os três botões foram procurados no DOM,
clicados e **os três fizeram efeito**. O caminho do botão funciona — o que confirma que o
problema estava no *comportamento esperado*, e não na fiação.

### B3 — Lentidão ao trocar de cor
`corrigido` · `médio` · 04/08/2026

O seletor de cores respondia com atraso. Eram **duas** causas somadas, e as duas na mesma
linha de código — o `#commit()` do `DrawStyle`:

1. **Gravava em disco a cada clique.** `localStorage.setItem` é síncrono, então cada cor
   escolhida punha uma ida ao disco no meio do gesto. Agora a gravação é adiada 400 ms; o
   estado em memória muda na hora, e quem desenha nunca vê o valor velho.
2. **Reconstruía o painel inteiro.** O ouvinte da barra recriava as quatro linhas de opção
   — cerca de vinte botões — a cada mudança, e cada elemento novo obriga o navegador a
   recalcular estilo e layout. Agora o painel só é reconstruído quando a **ferramenta**
   muda; trocar cor ou espessura apenas move o destaque.

**Verificação:** o auto-teste guarda a referência de um botão de cor, troca a cor e exige
que **seja o mesmo elemento** — com o destaque no lugar certo.

### B4 — Cursor de cruz é feio nas ferramentas de desenho
`aberto` · `baixo`

se quer um cursor com cara de caneta no lugar do `crosshair`.

**Onde:** `cursorFor()` de cada ferramenta (`DrawTool`, `ShapeTool`, `NoteTool`, `TextTool`).
A borracha já faz diferente e serve de modelo: ela esconde o cursor do sistema e desenha o
próprio círculo no overlay.

### B5 — Queda breve de fps ao clicar num ícone da barra inferior
`aberto` · `baixo`



O que sobra é pequeno e provavelmente da mesma família do B3: clicar num botão da barra
troca classes e dispara recálculo de estilo, e o app manda repintar junto. Vale corrigir
com o B3, não sozinho.


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

**foi confirmado: são os DOIS caminhos** — alternar ferramentas na barra lateral *e* ir e
voltar entre o lobby e o quadro. E a intuição dele é que o problema está [...].

Isso derruba a explicação mais simples (um caminho caro específico) e deixa o suspeito
mais desconfortável: **algo comum aos dois** é lento. O que os dois compartilham é a
reconstrução de DOM da interface e o `invalidate()` que força repintura completa.

**Medido sobre o quadro REAL (resumo importado, 1.063 objetos), em 04/08/2026:**

| Situação | Custo da repintura completa | Render |
|---|---|---|
| Tudo na tela (1.063 objetos visíveis) | **0,1 ms** acima do frame ocioso | 1,7 ms |
| Zoom 100% (1 objeto visível) | 0,1 ms | 0,6 ms |


| Suspeito | Veredito |
|---|---|
| Autosave gerando miniatura | Descartado — sintoma preso à troca, não ao tempo parado |
| Repintura ao trocar de ferramenta | Descartado — 0,1 ms no quadro real |
| DOM do painel de opções | Descartado — 0,11 ms por troca |
| Clique não chegando ao botão | Descartado — os botões respondem |

**A hipótese que sobra é sobre o ambiente, não sobre o código:** no teste enquanto eu
editava o projeto. O servidor de desenvolvimento recarrega a página a cada alteração, e
umas vinte entraram durante a sessão de testes. Recarga no meio do uso produz exatamente
os três sintomas juntos — engasgo, resíduo do frame anterior e botão que "não responde"
(porque a página estava trocando).

**Como separar:** ele reproduzir com o `F3` aberto, com o projeto parado. **Feito** — ver
o resumo acima.

</details>

---

### B6 — `Ctrl+V` não cola imagem da área de transferência
`corrigido` · `alto` · 04/08/2026

Copiar uma imagem fora do app e apertar `Ctrl+V` num quadro aberto não colava nada.

**Causa (bug meu, da Fase 7):** o despacho de atalhos chamava `e.preventDefault()` em
**todo** atalho reconhecido — e `preventDefault` num `Ctrl+V` cancela a ação padrão do
navegador. É essa ação que dispara o evento `paste`, o único caminho pelo qual a imagem da
área de transferência do sistema chega ao app. Com ela cancelada, sobrava só a área de
transferência interna, e a tecla parecia morta.


**Correção:** não cancelar o padrão no `paste`. Uma linha, com o porquê ao lado dela.

**Como foi verificado** (três camadas, porque uma só já falhou aqui):

1. verificação no auto-teste de que o `Ctrl+V` **não** cancela o padrão — é o guarda que
   pega a regressão se alguém reintroduzir o `preventDefault` geral;
2. `QB_PASTE=1`, um modo novo em que o processo principal envia um **Ctrl+V nativo**
   (`sendInputEvent`) com uma imagem de verdade na área de transferência do Windows;
3. a prova invertida: desfiz a correção, rodei de novo e o resultado virou **"NÃO COLOU"**
   — depois restaurei. Sem esse passo, eu teria uma correção que funciona e nenhuma
   garantia de que era ela a causa.

### M7 — Remover o lápis da barra
`corrigido` · `médio` · 04/08/2026



**O que saiu:** a ferramenta da barra, o atalho `L`, a entrada de estilo e a instância.

**O que FICOU, de propósito:** a variante `pencil` no modelo e o caminho de desenho no
painter. Quadros salvos antes disso têm traços de lápis, e um arquivo antigo tem de
continuar sendo desenhado como foi criado. O auto-teste passou a **rasterizar um traço de
lápis e exigir pixels** — sem isso, alguém limparia esse caminho por parecer código morto e
os quadros já salvos perderiam tinta.

A gravação de pressão por ponto também ficou: é o que uma mesa digitalizadora entrega, e é
o que permitiria a caneta modular a espessura sozinha, se um dia isso for desejado — com
mouse continuaria idêntica ao que é hoje.

## Melhorias

### M1 — Botão de negrito na caixa de texto
`aberto` · `médio`

**Importante:** negrito **já funciona** com `Ctrl+B` dentro da caixa (e `Ctrl+I`, `Ctrl+U`).
O que falta é o controle visível — o recurso existe e ninguém descobre. A correção é de
descoberta, não de capacidade: uma linha **B / I / U** no painel da ferramenta de texto.

### M2 — Renomear o botão de importação do Whiteboard
`corrigido` · `baixo` · 04/08/2026

Virou **"Importar arquivo"**. No lobby vazio o rótulo ficou mais longo de propósito —
"Importar arquivo do Microsoft Whiteboard" —, porque ali ele é a explicação do que fazer
primeiro, e não mais um botão numa fila.

### M3 — Redesenhar a barra de ferramentas inferior
`corrigido` · `médio` · 04/08/2026


**O que mudou:** os doze rótulos escritos viraram **ícones**, agrupados por assunto com
filetes discretos, sobre fundo translúcido com desfoque (o "acrílico" do Windows 11), com
cantos mais generosos e o destaque de "ligado" numa barrinha sob o ícone.

**O que continua escrito, de propósito:** o nome do quadro (com o ponto de alterações não
salvas) e o nível de zoom. Os dois são **informação**, não rótulo de comando — virar ícone
esconderia justamente o que se precisa ler.

**Os ícones são SVG, não glifos de fonte.** Um `▦` ou um `⌗` depende da fonte instalada e
do fallback do sistema: muda de máquina para máquina e às vezes vira um retângulo vazio.
Em SVG a forma é a mesma em qualquer lugar, acompanha a cor do texto e escala sem
serrilhar.

**Consequência que virou melhoria de teste:** sem texto visível, o nome do botão passou a
viver no `aria-label` — que é o que um leitor de tela anuncia. E o auto-teste deixou de
procurar os botões pelo texto (que quebrava a cada renomeação, como aconteceu quando o `?`
virou "comandos") e passou a procurar por `data-action`, exigindo que **todos** tenham
ícone e nome acessível.

**Estendido para a barra lateral** (pedido depois de ver a inferior): as oito
ferramentas, as seis formas, o preenchimento e os dois modos da borracha também viraram
SVG, e o painel ganhou o mesmo material translúcido. Ali o ganho foi maior que na inferior,
porque os glifos antigos (`⭦`, `🖊`, `✎`, `▬`) vinham de fontes diferentes — um deles era
emoji — e chegavam em pesos e tamanhos que não combinavam entre si: a fila parecia
desalinhada mesmo estando alinhada.

O indicador de "ativo" muda de lado conforme a barra: **embaixo** na horizontal, **na
lateral** na vertical. Numa fila vertical, o indicador embaixo apontaria para o botão
seguinte.

### M4 — Renomear o ícone de interrogação para "comandos"
`corrigido` · `baixo` · 04/08/2026

O `?` virou **"comandos"** escrito. Coberto pelo auto-teste (o botão é procurado pelo
rótulo).

### M5 — Trocar os três degraus de espessura por uma barra de 0 a 100%
`aberto` · `médio`

Hoje cada ferramenta tem três degraus fixos. se quer controle contínuo.

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


### Etapa 0 — Medir antes de corrigir · **feita em 04/08/2026**

Duas suspeitas minhas caíram, e é por isso que esta etapa existe:

- o autosave **não** é a causa do B5 (o sintoma está preso à troca, não ao tempo parado);
- trocar de ferramenta custa **1,6 ms** com 4.000 objetos na tela — cabe folgado num
  frame, então o repaint da troca também não explica o engasgo;
- os três botões do B2 **funcionam** quando clicados por código.

Sobrou uma pergunta que decide a etapa seguinte: o que exatamente é [...].

O auto-teste ganhou as duas verificações que faltavam — os botões da barra pelo **clique**
(o teclado já era coberto) e o custo da troca de ferramenta com o quadro cheio.

### Etapa 0b — Medir sobre o quadro REAL · **feita**
Repintar o resumo importado inteiro custa **0,1 ms** acima do frame ocioso. Com isso, e
com ele reproduzindo de `F3` aberto, o travamento geral se dissolveu: **três dos cinco
bugs fecharam ou encolheram sem uma linha de correção**, e as duas verificações novas
ficaram no auto-teste.


Entraram de carona os dois renomes de uma linha: M2 e M4.

### Etapa 3 — Barra inferior e nomes (M3, M4, M2)
Mesmo arquivo (`ViewportBar`), mais o rótulo do lobby (M2). Fazer junto evita mexer duas
vezes no mesmo lugar. Depende de decidir a direção do redesenho.

### Etapa 4 — Painel das ferramentas (M5, M6, M1) e cursor (B4)
`ToolBar` + `DrawStyle` são tocados pelos três: a barra de espessura (M5), o seletor de
cor (M6) e a linha B/I/U do texto (M1). O cursor (B4) entra junto por ser da mesma família
— aparência das ferramentas — e por ser barato.

Última de propósito: é a etapa que mais mexe em interface, e vai partir de uma barra já
redesenhada e de um app que não trava mais.

---

## Fechados nesta rodada

| Id | Desfecho |
|---|---|
| B2 | Não é bug — a régua atual fica, decisão da Fase 4.5 mantida |
| B2b | Não é bug — grade e ímã respondem; o incômodo era só a régua |
| B5 (parte maior) | Travamento geral era o servidor de dev recarregando a página durante o teste; sobrou só uma queda breve ao clicar |
