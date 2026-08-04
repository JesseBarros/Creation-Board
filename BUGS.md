# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.

**Última atualização: 04/08/2026.** **1 item aberto** e **11 fechados**. A lista começou
com 11 relatos, ganhou dois no caminho (o colar de imagem e a remoção do lápis) e está
praticamente zerada.

**Ainda em aberto:** só o **B5** — a queda breve de fps ao clicar num controle. Ela tinha a
mesma raiz do B3 (painel reconstruído a cada clique), que foi corrigida, e a medição de
troca de ferramenta caiu para 2,5 ms. **Precisa do reteste dele com o `F3` aberto** para
fechar ou reabrir com número novo.

Vale registrar o padrão, porque ele se repete: **medir antes de corrigir devolveu mais
resultado que corrigir teria devolvido.** Nenhuma linha de correção foi escrita, e três
dos cinco bugs fecharam ou encolheram.

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
`corrigido` · `médio` · 04/08/2026

**Correção:** `#enterBoard()` passou a pintar as duas camadas **na hora**, em vez de
esperar o próximo frame de animação. Até o `requestAnimationFrame` chegar, o canvas ainda
tinha os pixels do quadro anterior — e era isso que aparecia.

<details>
<summary>Investigação</summary>

Navegando rapidamente entre as abas e o quadro, aparecem falhas visuais.

Ele confirmou o sintoma: **resíduo do frame anterior** — aparece por um instante o que
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
atual**: *"não vamos alterar, essa régua não está ruim"*. A decisão da Fase 4.5 continua
valendo, e a documentação não muda.

Fica registrado o que ele descreveu, caso volte à mesa algum dia: uma régua física no meio
do quadro, girável 360°, com a tinta encaixando na borda para sair reta. O texto completo
do que ela precisaria está no histórico deste arquivo (commit `d502ef9`).

<details>
<summary>Descrição original do relato</summary>

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
`corrigido` · `baixo` · 04/08/2026

A caneta e o marca-texto passaram a usar um **cursor de caneta** desenhado em SVG, embutido
no próprio valor de `cursor` (sem arquivo em disco nem caminho de build). Ele tem contorno
branco por baixo, porque a caneta escura sumiria justamente sobre tinta escura — que é onde
ela costuma estar —, e o **ponto quente fica na ponta**: sem isso a tinta sairia deslocada
do cursor.

**Formas, post-it e texto continuam com o cursor de precisão** (`crosshair` e `text`): ali
o gesto é posicionar um canto ou um ponto de inserção, e a cruz diz exatamente onde ele
vai cair. Trocar tudo por caneta seria consistência que atrapalha.

### B5 — Queda breve de fps ao clicar num ícone da barra inferior
`aberto` · `baixo`

**O relato encolheu depois de ele medir com o `F3` aberto**, com o projeto parado: não há
travamento geral. A única diferença de fps que ele sentiu é **ao clicar num ícone da barra
inferior**, e **estabiliza rápido**.

Isso confirma que os sintomas maiores da primeira rodada eram do ambiente — ele testava
enquanto o servidor de desenvolvimento recarregava a página a cada alteração minha.

O que sobra é pequeno e provavelmente da mesma família do B3: clicar num botão da barra
troca classes e dispara recálculo de estilo, e o app manda repintar junto. Vale corrigir
com o B3, não sozinho.

<details>
<summary>Investigação original (relato de travamento geral)</summary>

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

**Por que passou pelo auto-teste:** a verificação existente despachava o evento `paste`
**direto**. Ela testava o *handler*; o que estava quebrado era o *caminho até ele*. É o
mesmo erro de mira dos botões da barra — testar a ação em vez do gesto.

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

Relato dele: *"caneta e lápis são literalmente a mesma coisa; não precisamos de duas
funções idênticas com nomes diferentes"*.

**Ele está certo no uso dele, e o motivo importa:** a única diferença é o lápis modular a
espessura pela **pressão**, e `PointerEvent.pressure` vem sempre 0,5 com mouse. Sem mesa
digitalizadora, as duas ferramentas produzem traços idênticos — era um botão a mais sem
função.

**O que saiu:** a ferramenta da barra, o atalho `L`, a entrada de estilo e a instância.

**O que FICOU, de propósito:** a variante `pencil` no modelo e o caminho de desenho no
painter. Quadros salvos antes disso têm traços de lápis, e um arquivo antigo tem de
continuar sendo desenhado como foi criado. O auto-teste passou a **rasterizar um traço de
lápis e exigir pixels** — sem isso, alguém limparia esse caminho por parecer código morto e
os quadros já salvos perderiam tinta.

A gravação de pressão por ponto também ficou: é o que uma mesa digitalizadora entrega, e é
o que permitiria a caneta modular a espessura sozinha, se um dia isso for desejado — com
mouse continuaria idêntica ao que é hoje.

### B7 — Interface "rasgada" ao redimensionar a janela
`corrigido — aguarda reteste` · `alto` · 04/08/2026

Relato dele em 04/08/2026, com captura: digitando numa caixa de texto, a janela aparece
**partida ao meio**, com pedaços da interface repetidos embaixo (barra lateral e réguas
aparecendo duas vezes) e duas linhas azuis atravessando a altura toda. Nas palavras dele:
*"quando eu digito ele meio que sai da progressão do texto, a escala sem acompanhar a
digitalização"*.

**O que foi endurecido, e é correto por si:** `body`, `.qb-app`, `.qb-view` e
`.qb-canvas-host` usavam `overflow: hidden`. Ele esconde o que passa da borda mas
**continua sendo um container rolável** — só não pela roda do mouse. E o navegador rola por
programa toda vez que o cursor de texto se mexe, para mantê-lo à vista; como a caixa em
edição é posicionada por `transform`, e área transformada conta como área rolável, essa
rolagem automática podia arrastar a interface inteira. Agora é `overflow: clip`, que **não
cria container rolável**.

Esse endurecimento **não** foi provado como a causa: o guarda que escrevi passa, mas
passou também com o CSS antigo de volta — ou seja, o cenário do teste não produz a
rolagem. Fica como proteção, não como explicação.

**A causa apareceu quando ele disse que "o rasgo se autocorrige quando eu faço qualquer
outra coisa".** Isso descarta layout e aponta para **pintura**: a tela ficou com pixels
velhos até algo forçar repintura. Relendo a captura com isso em mente, o desenho fecha: a
barra lateral aparece **na posição de uma janela mais baixa** em cima, e na posição da
janela atual embaixo. É a janela sendo **redimensionada** — a região que já existia manteve
os pixels do tamanho antigo, e só a faixa recém-exposta foi pintada com o layout novo.

**Correção, em duas frentes:**

1. **No processo principal:** `webContents.invalidate()` depois de `resize`, `maximize`,
   `unmaximize`, `restore` e tela cheia. É a API que existe exatamente para pedir repintura
   completa — a interface em DOM depende do compositor invalidar a área certa, e é aí que
   ele falhava. Com um atraso curto, para a rajada de eventos do arraste de borda virar uma
   repintura só.
2. **No renderer:** `#measure()` passou a repintar **sempre**, e de forma **síncrona**
   quando o tamanho muda. Uma medição só acontece porque algo mexeu na janela; nesses
   momentos a tela pode estar com pixels de antes, e repintar é barato demais para apostar
   que não está.

**Como confirmar:** redimensionar e maximizar a janela repetidamente, com e sem uma caixa
de texto aberta. Se não rasgar mais, fecha.

## Melhorias

### M1 — Botão de negrito na caixa de texto
`corrigido` · `médio` · 04/08/2026

Negrito **já funcionava** com `Ctrl+B` dentro da caixa (e `Ctrl+I`, `Ctrl+U`); faltava o
controle visível — recurso sem botão é recurso que ninguém descobre.

Agora há uma linha **B / I / U** no painel da ferramenta de texto, com **dois destinos**:
digitando, vale para a seleção dentro da caixa (mesmo caminho do `Ctrl+B`); com uma caixa
selecionada, vale para a caixa inteira. Sem o segundo caso, o botão ficaria inerte
justamente quando a pessoa acabou de clicar num texto para mudá-lo.

A regra do estado segue a de qualquer editor: se **tudo** já está formatado, o botão tira;
senão, aplica em tudo.

### M2 — Renomear o botão de importação do Whiteboard
`corrigido` · `baixo` · 04/08/2026

Virou **"Importar arquivo"**. No lobby vazio o rótulo ficou mais longo de propósito —
"Importar arquivo do Microsoft Whiteboard" —, porque ali ele é a explicação do que fazer
primeiro, e não mais um botão numa fila.

### M3 — Redesenhar a barra de ferramentas inferior
`corrigido` · `médio` · 04/08/2026

Direção dada por ele: *"não é ruim, porém tem informação por extenso demais; algo mais
clean, na pegada da barra do Windows 11"*.

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

**Estendido para a barra lateral** (pedido dele depois de ver a inferior): as oito
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
`corrigido` · `médio` · 04/08/2026

Cada ferramenta tinha três degraus fixos; agora é uma barra contínua, com a porcentagem
escrita ao lado e o valor real em px na dica.

**As duas consequências foram resolvidas como combinado:**

- **0% não é zero.** A barra mapeia para uma faixa mínimo–máximo por ferramenta (caneta
  1–14px, marca-texto 8–44, formas 1–14, fonte 10–72, borracha 8–80 px de tela). Um traço
  de espessura zero seria invisível, e uma barra cujo começo não desenha nada teria um
  pedaço inútil.
- **`[` e `]` andam de 10 em 10%** e param nas pontas da faixa, em vez de pular degraus.

O auto-teste cobre as pontas: no mínimo a espessura ainda é maior que zero, e nem `[` nem
`]` conseguem sair da faixa.

**Efeito colateral medido, e corrigido:** o `input type="range"` (e mais ainda o
`type="color"` do M6) é **caro de instanciar**, e recriá-los a cada troca de ferramenta
levou o custo da troca de 1,6 ms para 5,3 ms — a verificação de desempenho reprovou na
hora. Os dois controles passaram a ser criados uma vez e reaproveitados: 2,5 ms.

### M6 — Seletor de cores personalizado
`corrigido` · `médio` · 04/08/2026

A paleta ganhou um **+** que abre o seletor do sistema. A cor escolhida entra como mais uma
amostra na fila (para ser reescolhida com um clique) e sobrevive ao fechar o app.

**O aviso mudou de ideia durante a implementação, e o motivo vale registrar.** A intenção
era avisar quando a cor tivesse *contraste baixo* — mas a primeira verificação mostrou que
isso quase nunca acontece: **o adaptador de tema resgata a cor invertendo a luminosidade**,
então ela não some. A pergunta útil não era "ela some?", e sim **"ela vai aparecer
diferente do que eu escolhi?"**.

Hoje o aviso diz exatamente isso: *"#f2f2f2 tem contraste baixo no tema claro e será
exibida como #0d0d0d, para não sumir"*. Avisa e não impede — a paleta é conferida pelo
`check:colors`, mas a escolha livre é dele.

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

### Etapa 0b — Medir sobre o quadro REAL · **feita**
Repintar o resumo importado inteiro custa **0,1 ms** acima do frame ocioso. Com isso, e
com ele reproduzindo de `F3` aberto, o travamento geral se dissolveu: **três dos cinco
bugs fecharam ou encolheram sem uma linha de correção**, e as duas verificações novas
ficaram no auto-teste.

### Etapa 1 — Resíduo e cliques (B1, B3) · **feita**
B1 corrigido (pintura síncrona ao entrar no quadro) e B3 corrigido (duas causas: gravação
em disco a cada clique e reconstrução do painel inteiro). **B5 pode ter ido junto** — a
queda de fps ao clicar num controle tinha a mesma raiz. Precisa de reteste dele.

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
