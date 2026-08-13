# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.

**Última atualização: 13/08/2026.** **2 itens abertos** (B10 e B15), **19 fechados**.

**A Fase 9 fechou o B13, o M8 e a parte do B9 que era corrigível.** O que sobrou do B9 não
é bug: o teto de 60 é taxa de entrega de evento, e o custo de desenho do quadro real dele
já cabe num frame de 144 fps — **6,1 ms medidos, contra 6,94 ms de orçamento**. Ver abaixo.

Três relatos catalogados como bugs diferentes — **B1, B7 e B8** — eram **um só**: a conta de
"que pedaço da tela mudou" saindo errada nesta máquina. Enquanto pareciam três, cada um
ganhou o seu remendo local. Fecharam juntos, com uma correção só, quando pararam de ser
tratados como três.

**Ainda em aberto:**

- **B10** — o custo por frame **cresce com o zoom**. Medido por ele no `F3`; não sentido no
  uso.
- **B15** — `a investigar`. Uma verificação do auto-teste falhou **uma vez**, sob carga, e
  não reproduziu depois. Detalhe abaixo — está aqui porque flakiness no verificador é o que
  corrói a confiança nele.

O **M9** (plano de fundo por imagem no menu principal) foi **abandonado por ora**, por decisão
dele no mesmo dia em que teve a ideia. O item fica escrito com a viabilidade toda respondida:
se voltar, a investigação já está feita.

**Fechados na Fase 9:** B13 (exportar em ladrilhos), M8 (camadas, nas duas metades), a
parte corrigível do B9 (o painel do `F3`) e o B16 (a "sombra" atrás dos ícones da barra).

O **B11** (biblioteca partida em duas pastas) foi **corrigido no mesmo dia em que ele o
relatou**, e é o item mais sério que este arquivo já teve. Falta só **consolidar as duas
pastas**, que depende de uma decisão dele.

O **B5 fechou** no mesmo reteste: com o `F3` aberto e o projeto parado, clicar, mover e
selecionar **não produzem queda perceptível**. A verificação que reprovava em 06/08
(`interface 5,4 ms`, teto 3) deu **2,4 ms** em 08/08 com a máquina descarregada — mesmo
código. Era o teto medindo a máquina, como já tinha acontecido antes.

Vale registrar o padrão, porque ele se repete: **medir antes de corrigir devolveu mais
resultado que corrigir teria devolvido.** Na rodada de 04/08 nenhuma linha de correção foi
escrita e três dos cinco bugs fecharam ou encolheram; na de 06/08 a correção final tem
duas linhas, e as outras nove hipóteses caíram por medição — inclusive as minhas favoritas,
duas vezes.

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
`corrigido pelo B8` · `médio` · 04/08/2026, fechado em 06/08/2026

**Era o B8.** Ele relatou de novo em 06/08, no sentido contrário: *"se eu for em um quadro e
voltar rápido fica com rastro na tela do quadro no menu"* — e o sentido que faltava era
justamente o que a correção de 04/08 não cobria (`#enterBoard()` pintava na hora,
`goToLobby()` não). Fechou junto com o B8, sem precisar da segunda metade do remendo.

A correção de 04/08 fica: pintar na hora ao entrar é correto por si. Mas o que ela fazia era
**forçar repintura num gatilho** — e era isso que escondia a falha real em vez de mostrá-la.

**Correção de 04/08/2026:** `#enterBoard()` passou a pintar as duas camadas **na hora**, em
vez de esperar o próximo frame de animação. Até o `requestAnimationFrame` chegar, o canvas ainda
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
`não reproduz` · `baixo` · 04/08/2026, fechado em 08/08/2026

**Fechado pelo reteste dele**, com o `F3` aberto e o projeto parado: *"em todo lugar que eu
clico na tela, movo ou seleciono 1 item ou mais... na prática, para o aplicativo em si, eu
não senti uma queda de desempenho"*.

O relato encolheu duas vezes antes de morrer, e vale como método: **travamento geral** →
**queda ao clicar num ícone** → **nada**. Cada encolhida veio de uma medição, não de uma
correção. A primeira metade era o servidor de dev recarregando a página durante o teste; a
segunda foi junto com o B3.

**O que sobrou do reteste não é o B5, e por isso ganhou id próprio:** o teto de 60 fps ao
arrastar o quadro (**B9**) e o custo crescendo com o zoom (**B10**). Os dois apareceram
olhando o `F3` durante o teste do B5 — mas nenhum dos dois é "queda ao clicar num controle",
e enfiá-los aqui repetiria o erro do B1/B7/B8 ao contrário: **um id carregando sintomas de
mecanismos diferentes**.

<details>
<summary>Relato original</summary>

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
`corrigido pelo B8` · `alto` · 04/08/2026, fechado em 06/08/2026

**Era o B8.** A leitura de 04/08 — *"a região que já existia manteve os pixels do tamanho
antigo"* — estava **certa, e era maior do que parecia**: acontece sem redimensionar nada.

Duas coisas ficam do que se fez aqui, e as duas com a etiqueta certa desta vez:

- O `webContents.invalidate()` no resize continua, como proteção — mas é **remendo no
  gatilho**, e não conserto da causa. Se o B8 voltar, é aqui que se procura primeiro.
- O `overflow: clip` foi **testado no B8 e não é a causa** de nada. Fica por mérito próprio
  (a rolagem automática do cursor de texto é real), e não como correção deste bug.

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

### B8 — A tela pisca preto ao passar o mouse sobre ícones e cartões
`corrigido` · `alto` · 06/08/2026

**Causa: a conta de região suja.** O Chromium repinta e troca só o pedaço da tela que
mudou. Nesta máquina essa conta erra: o que ficou de fora mantém os pixels velhos (os
rastros) e a troca do pedaço aparece como um flash. **Um único defeito produzia os três
sintomas** — o piscar no hover (B8), o rasgo ao redimensionar (B7) e o rastro ao voltar
para o menu (B1).

**Correção:** `--ui-disable-partial-swap` e `--disable-partial-raster`, aplicadas por
padrão. Repinta e troca a tela inteira a cada frame. Confirmado por ele: *"os 2 bugs
pararam"*.

**O preço foi medido, não estimado.** `QB_BENCH=4000`, duas rodadas com e duas sem:

| Fase | Sem a correção | Com a correção |
|---|---|---|
| zoom 100% | 144,0 / 144,0 fps | 144,0 / 144,0 fps |
| zoom 40% | 136,4 / 132,3 fps | 133,6 / 135,0 fps |
| ajustado à tela | 111,7 / **108,0** fps | 99,7 / **108,0** fps |

A primeira rodada sugeriu 11% de custo na fase pesada; a segunda deu **9,26 ms de frame
nos dois casos**. O 99,7 era ruído. Conclusão da época: não há custo mensurável.

> **08/08/2026 — e aqui eu quase repeti o erro que este arquivo inteiro alerta.** Duas
> capturas do `F3` no quadro real, a 2% de zoom, deram frame de **17,8 ms** com a correção e
> **14,3 ms** sem ela, e eu escrevi que a correção custava ~3,5 ms por frame.
>
> **Ele derrubou na hora, e está certo:** *"sem o zoom aplicado a variação de ms é muito alta
> para considerar esses 3,5, porque ao mesmo tempo que chega num teto maior também chega numa
> baixa"*. Com o quadro todo na tela o frame oscila bastante, e **uma amostra de cada lado não
> separa sinal de ruído** — é literalmente o mesmo erro que produziu o "99,7 era ruído" três
> parágrafos acima, cometido por mim, no mesmo arquivo, dois dias depois.
>
> **O custo da correção continua não estabelecido.** Para estabelecer, seria preciso repetir a
> leitura várias vezes de cada lado e comparar as distribuições, e não os extremos. Ficou sem
> resposta porque a pergunta perdeu o objeto: a correção saiu (ver abaixo).

**Isto é remédio de sintoma.** A raiz provável está na tabela abaixo, e o conserto de
verdade virou item da Fase 9:

| | Versão | Chromium |
|---|---|---|
| Creation Board | **Electron 33.4.11** | ~130, do fim de 2024 |
| Último Electron | 43.3.0 | atual |
| Windows desta máquina | build 26200 | 2026 |
| Driver NVIDIA | instalado em 14/07/2026 | 2026 |

Dez versões maiores atrás. É a resposta para *"por que só este programa pisca"*: é o único
Chromium de 2024 rodando numa máquina de 2026. **Dependência de plataforma envelhece
sozinha, sem ninguém tocar no código.**

`QB_GPU=normal` desliga a correção e reproduz o bug — serve para descobrir o dia em que ela
virar desnecessária, em vez de carregá-la para sempre por inércia.

> **08/08/2026 — o sintoma sumiu sozinho, e a correção FICA assim mesmo.**
>
> Rodando em `QB_GPU=normal` — o modo que em 06/08 reproduzia o piscar **sempre**, em todo
> ícone — ele confirmou: *"no aplicativo que está rodando agora não há bug algum de blip de
> tela"*. Nada no código explica a diferença: o piscar nunca foi nosso, e o que mudou por
> baixo (driver, Windows, algum overlay injetado) não passa por este repositório.
>
> **Decisão dele, e ela é a certa:** manter a correção ligada por padrão, *"pois pode ser um
> bug sazonal"*. Um defeito de ambiente que sumiu sem ninguém consertar pode voltar do mesmo
> jeito — e o custo de carregar duas flags é muito menor que o de descobrir o retorno pelo
> relato de alguém incomodado.
>
> **Fica registrado para quando voltar**, que é o objetivo desta anotação:
>
> - o sintoma exato — piscar preto ao passar o mouse sobre ícones e cartões, rastros de
>   região não repintada, rasgo ao redimensionar;
> - `QB_GPU=normal` é o modo que o reproduzia, e hoje **não reproduz mais**;
> - se ele voltar mesmo no modo padrão (`swap`), a escada de `QB_GPU` continua montada
>   (`dc`, `angle`, `comp`, `off`) e o placar de eliminação abaixo continua válido — não é
>   preciso refazer nenhuma daquelas rodadas;
> - o item da Fase 9 de **subir o Electron** (hoje num Chromium de 2024) continua sendo o
>   conserto de raiz, e `QB_GPU=normal` é como se confere se a correção ainda é necessária.
>
> **O custo da correção segue não medido**, e agora é assunto encerrado por escolha: ela fica
> independentemente do preço.

**Não dá para cobrir no `selftest`, e vale dizer por quê:** o auto-teste verifica o que o
app *faz*, e o app fazia tudo certo. O defeito está em como o Chromium entrega pixels
prontos ao Windows — depois do último ponto que qualquer JavaScript enxerga. Um teste que
pegasse isto teria que comparar frames apresentados, não estado do documento.

<details>
<summary>A investigação, e o que cada rodada eliminou</summary>

Relato dele em 06/08/2026: passando o mouse sobre o que é selecionável — **os ícones da
barra e os cartões do lobby** — a tela **pisca preto milhares de vezes**. Ele desconfia do
**tema escuro** e diz que o problema é **pior do que parecia** quando abriu o B7.

**Confirmado por ele, e cada ponto elimina uma família de causas:**

- **É só visual.** Selecionar, clicar e interagir continuam funcionando. Nada de estado,
  documento ou entrada está envolvido.
- **É só no hover, e sempre.** Todo ícone, toda vez. Não é intermitente nem depende de
  quanto tempo o app está aberto.
- **A composição por GPU está ativa** nessa máquina — medido, não suposto. A primeira
  leitura dizia "tudo em software" e estava errada: o Chromium levanta a GPU num processo
  separado, e perguntar no `whenReady` responde antes de a resposta existir. Com atraso, o
  resultado se inverte. Fica o alerta para a próxima vez que alguém for ler isso.
- **O piscar atrapalha o próprio diagnóstico.** A primeira versão do painel tinha caixas
  para marcar, e ele não conseguiu usá-las: apontar o mouse para a caixa já disparava o
  sintoma. A ferramenta produzia o que deveria medir. Agora é tudo por teclado, e o painel
  não tem um só alvo de hover.

**O que já dá para afirmar sem medir nada:** não é o nosso desenho. Com o ponteiro sobre a
barra, o `Scheduler` não repinta o canvas — nenhum `invalidate()` sai de um `:hover`, e não
existe um só ouvinte de `mouseover`/`pointerover` no renderer. O que muda no hover é
**exclusivamente CSS**. Um piscar de tela inteira com o JavaScript parado é artefato de
**composição**: o quadro que o Chromium entrega ao Windows sai preto por um instante.

**Os cinco suspeitos**, todos ligados ao que o hover repinta:

1. **`overflow: clip`** — foi o endurecimento do B7, e ficou registrado ali como *não
   provado como causa*. Ele mudou como o Chromium recorta e invalida a área pintada, e é a
   última mudança feita perto deste sintoma. O relato de que o problema piorou aponta
   direto para cá.
2. **`backdrop-filter: blur(20px)`** nas três barras flutuantes — obriga o compositor a
   reler o que está atrás da barra a cada repintura, e o hover repinta a cada frame da
   transição. Ler o fundo errado é o jeito mais comum de sair preto.
3. **O fundo translúcido** dos painéis, separado do desfoque — para saber qual dos dois é.
4. **`box-shadow`** — estende a área pintada para fora da caixa; se a invalidação ignora
   essa sobra, o que fica de fora não é repintado.
5. **As transições de hover** — cada uma promove o elemento a uma camada própria e o
   devolve no fim; o `transform: translateY(-2px)` do cartão promove com certeza. Esse
   sobe-e-desce de camada é o outro jeito clássico de piscar.

E, atrás dos cinco, a **placa de vídeo**: se nenhum resolver, o erro está na composição por
hardware, e a correção passa a ser desligar o recurso que ela erra.

**A suspeita do tema escuro tem fundamento, mas provavelmente ao contrário:** o piscar deve
existir nos dois temas — no claro, um flash preto sobre fundo `#eef1f6` seria ainda mais
visível. O que o tema escuro faz é **mudar o quanto ele incomoda**. Confirmar isso é de
graça: trocar de tema e olhar.

**Como foi medido.** `QB_DIAG=1 npm run dev` sobe o app normal com um painel de suspeitos
no canto, **operado só por teclado**: `1` a `5` desligam um suspeito cada, `9` desliga os
cinco de uma vez, `0` volta ao normal. Cada troca sai no terminal, então o resultado não
depende de ninguém descrever o que viu.

### Os cinco caíram juntos — e isso vale mais que cair um por um

Ele apertou o `9`, com **os cinco desligados ao mesmo tempo**, e o piscar continuou. Está
no terminal, repetido cinco vezes. Nenhuma combinação parcial mudou nada.

**A causa não está no CSS.** A lista inteira morreu numa tecla, e a hipótese favorita
(`overflow: clip`, herdada do B7) morreu junto — o `1` sozinho também não resolveu. O
endurecimento do B7 fica de pé por mérito próprio, mas não é isto aqui.

### O que a captura dele mostrou, e que vale mais que o piscar

Na captura de 06/08/2026 os **cartões do lobby aparecem desenhados por cima do quadro** —
uma faixa retangular da janela com pixels de outra tela, parada, tempo suficiente para sair
numa foto. Não é piscar: é **região que ninguém repintou**. E ele completou: *"se eu for em
um quadro e voltar rápido fica com rastro na tela do quadro no menu"*.

**Isto une três bugs que estavam catalogados como separados:**

| Id | Sintoma | O que "corrigiu" |
|---|---|---|
| B1 | Rastro ao alternar lobby ↔ quadro | Pintar as duas camadas na hora |
| B7 | Janela rasgada ao redimensionar | `webContents.invalidate()` depois do resize |
| B8 | Piscar preto no hover, retângulos perdidos | — |

Os três são **a mesma falha vista de três ângulos**: uma região da janela fica com os
pixels de antes porque ninguém a repintou. As duas correções anteriores funcionaram porque
**forçaram repintura**, cada uma no seu gatilho — eram sacos de areia, não a barragem. O
hover não tem gatilho para forçar, e por isso é onde o problema aparece inteiro.

O B1 tem ainda a pista extra de que a correção foi **só num sentido**: `#enterBoard()`
pinta na hora, `goToLobby()` não. É exatamente o sentido em que ele vê rastro agora.

### Não é o conteúdo salvo — testado, não suposto

Ele levantou a hipótese de que a importação do Whiteboard tivesse deixado resto, e pediu
para zerar o storage. Feito **sem destruir nada**: `QB_BOARDS=<pasta>` aponta o app para
outra pasta, e ele abriu com a biblioteca **vazia**, mais `GPUCache`, `DawnGraphiteCache`,
`DawnWebGPUCache`, `Code Cache`, `Cache`, `Local Storage` e `Session Storage` apagados.

**O piscar continuou.** Sem um único quadro na pasta, não há conteúdo importado para
culpar. Hipótese fechada, e os 6,6 MB de resumo dele nunca correram risco.

Ficou registrado o método, porque ele serve para a próxima vez: *tirar do caminho não
precisa significar destruir*.

### Os "quadros fantasmas" eram o próprio bug — **ERRADO, ver o B11**

> **Corrigido em 08/08/2026.** Esta seção chegou à conclusão errada, e o motivo vale mais
> que a conclusão: eu comparei com **uma** pasta e concluí que a tela mentia. O app estava
> lendo **outra**. Os dois cards eram dois arquivos de verdade, e estão em
> `C:\Users\jbdea\Resumos-quadrobranco` — com exatamente as duas datas da captura:
> `CURSO 5 (2).wbd` criado em **05/08 01:38** e `CURSO 5.wbd` criado em **30/07 21:48**,
> os dois com **59 objetos**. Ver o **B11**.
>
> A lição sobrevive à conclusão, só que ao contrário: comparar com o disco **é** o método
> certo — mas "o disco" não é uma pasta que eu escolhi, e sim a que o app resolveu. Eu não
> verifiquei qual era, e o app não tinha como dizer.

Ele relatou 2 quadros a mais no menu, que sumiram sozinhos ao navegar. A captura mostra
**dois cards com o mesmo nome** ("CURSO 5", 59 objetos, 301 KB cada) e **datas
diferentes** — 05/08 01:38 e 30/07 21:48.

Na pasta existe **um** arquivo com esse nome, e `listBoards()` lê o diretório na hora, sem
índice nem cache. Um arquivo não produz duas datas. **Não eram dois quadros: era o mesmo
card pintado duas vezes**, um deles sobrado do desenho de outra sessão — e por isso sumiram
quando navegar forçou repintura.

### Dois injetores no processo — e os dois inocentados

Medido em 06/08/2026, lendo os módulos carregados no processo do app:

| DLL injetada | Origem | Veredito |
|---|---|---|
| `RTSSHooks64.dll` | **RivaTuner Statistics Server** | **inocente** — fechado, o piscar continuou igual |
| `nvspcap64.dll` | **NVIDIA ShadowPlay** (`nvcontainer`) | ainda dentro; não isolado sozinho |

O RivaTuner era um suspeito forte e caiu do jeito certo: fechado, uma variável de cada vez,
com o resultado igual. Vale mais registrar o método que o veredito — **medir qual DLL está
dentro do processo** é uma pergunta que dá para fazer, e ninguém tinha feito.

### O `dc` não curou, mas disse onde dói

Sem DirectComposition, o piscar continuou — **e mudou de cor, de preto para branco**. A cor
do flash acompanha o caminho de apresentação. Isso prova que o que pisca é a **superfície
da janela sem nada pintado**, e não conteúdo nosso desenhado errado.

### A hipótese que sobrou: cintilação de taxa variável (VRR)

O vídeo da máquina, medido:

| Achado | Peso |
|---|---|
| Dois monitores 1920×1080 | Composição multi-tela erra região suja com mais facilidade |
| **Parsec Virtual Display Adapter** instalado | Um adaptador de vídeo virtual além da NVIDIA |
| RTX 3050 a **143 Hz** | 143 e não 144: assinatura de G-SYNC/VRR ativo |

Com G-SYNC em modo janela, o painel segue a taxa de quadros do app em foco. Um app parado
produz **zero quadros**; o hover dispara as transições e ele produz quadros por uma fração
de segundo, e para. A taxa do painel salta e volta dezenas de vezes por segundo — e painel
com taxa saltando pisca.

**Explica o que nenhuma hipótese anterior explicava:** por que é exatamente no hover (único
momento em que o app sai da imobilidade e volta), por que sobreviveu a apagar CSS, cache,
biblioteca e RivaTuner (nada disso muda a taxa de quadros), e por que a cor do flash mudou
com o caminho gráfico.

**E tem uma lição de leitura de relato aqui:** ele escreveu *"a **tela** fica piscando"*
desde a primeira mensagem. Eu li "janela" e investiguei a janela por várias rodadas. A
palavra estava certa desde o começo.

### A causa antiga que não era: dois programas injetados no processo

Medido em 06/08/2026, lendo os módulos carregados no processo do app:

| DLL injetada | Origem | O que faz |
|---|---|---|
| `RTSSHooks64.dll` | **RivaTuner Statistics Server** (`RTSS` + `RTSSHooksLoader64` ativos) | Engancha a apresentação de todo processo para desenhar o overlay de FPS |
| `nvspcap64.dll` | **NVIDIA ShadowPlay** (`nvcontainer`, `EncoderServer`) | Engancha a apresentação para capturar vídeo |

O RivaTuner intercepta justamente a camada que decide **qual região da janela está suja**.
Região suja errada é, literalmente, o sintoma: pedaço de tela com pixels de antes.

E fecha com a única evidência positiva que existia: a sessão que parou de piscar era a que
rodou **sem DirectComposition** — o caminho que ele engancha.

Isto também explica por que o app parecia ter três bugs de repintura diferentes. Não tinha
nenhum: o desenho está certo, e quem erra é o andar de baixo.

### O que sobrou: a apresentação

Eliminado o CSS, resta **como o Chromium entrega o quadro pronto ao Windows**. A composição
por GPU está ativa nessa máquina (medido), então o próximo corte é o caminho de
apresentação, e não o desenho.

`QB_GPU=<modo>` desce essa escada, do mais barato ao mais caro:

| Modo | O que muda | Custo |
|---|---|---|
| `dc` | Sem DirectComposition | nenhum — segue acelerado |
| `angle` | ANGLE por OpenGL em vez de Direct3D | baixo |
| `comp` | Composição pela CPU, GPU ainda desenha | médio |
| `off` | Sem aceleração nenhuma | alto |

Começar pelo `dc` não é ordem arbitrária: é o único que **não abre mão de nada**, e é onde
programas que se enfiam entre o app e a tela (ReShade, overlays de jogo, gravadores —
essa máquina tem esse perfil) quebram a conta das regiões sujas. E "região suja errada" é,
literalmente, "pedaço da tela com pixels de antes".

O `dc` **não curou** — e mudou a cor do flash, de preto para branco. Foi essa mudança de cor
que provou que o que pisca é a **superfície da janela sem nada pintado**, e não conteúdo
nosso desenhado errado. Um teste que "falha" e ainda assim entrega a informação decisiva.

### O modo de desenvolvimento também caiu

O próprio B5 já registrava um caso em que **o servidor de dev fabricou um bug** (o
travamento era a página recarregando durante o teste). Todas as rodadas até aqui eram em
modo dev, então o app foi construído e rodado em `preview`, sem Vite, sem HMR: **piscou
igual**, e voltou a piscar preto — porque o DirectComposition estava de volta ao normal.

### Placar final da eliminação

| Suspeito | Como caiu |
|---|---|
| Conteúdo importado do Whiteboard | Biblioteca vazia via `QB_BOARDS`, bug igual |
| Caches gráficos e `Local Storage` | Apagados, bug igual |
| CSS (desfoque, sombra, `clip`, transições) | Cinco desligados juntos, bug igual |
| "Quadros fantasmas" | Eram o bug: disco tem 1 arquivo, tela mostrava 2 |
| RivaTuner (`RTSSHooks64.dll`) | Fechado, bug igual |
| Modo de desenvolvimento | App construído, bug igual |
| G-SYNC em modo janela | Trocado para só tela cheia, bug igual |
| Máquina em geral | **Só este app pisca**; sistema normal e responsivo |
| DirectComposition | Não curou, mas mudou a cor do flash |
| **Repintura parcial** | **Desligada: os dois sintomas pararam** |

**A suspeita inicial do tema escuro tinha fundamento, mas ao contrário:** a cor do flash não
vem do tema, vem do caminho de apresentação — preto com DirectComposition, branco sem ele.
O tema só mudava o quanto incomodava.

</details>

### B9 — O quadro crava em 60 fps ao arrastar com o botão direito
`fechado — não é custo de desenho` · `médio` · 08/08/2026, fechado em 12/08/2026

> **Fechado em 12/08/2026 por medição, e o número que fecha é este:** no quadro real dele
> (Cybersec resumão, 1.063 objetos, **tudo na tela**), desenhar custa **6,1 ms**. O orçamento
> de um frame a 144 fps é **6,94 ms**. O material de verdade já desenha dentro da meta.
>
> Ou seja: o teto de 60 (e depois 66) nunca foi preço de desenho, exatamente como a análise
> abaixo suspeitava. É taxa de entrega dos eventos de ponteiro somada ao vsync — nada que
> otimizar o renderer alcance.
>
> **O que foi corrigido:** o painel do `F3`, que era o que convidava à leitura errada. Ele
> agora destaca **Render** (trabalho puro, colorido contra o orçamento de 144 fps) e o antigo
> "FPS" desceu para o fim com o nome honesto, *Atualizações/s*, **sem cor** — um número baixo
> ali costuma significar "nada mudou", que é o comportamento certo. O verde antigo começava
> em 55 fps: o medidor dizia "ótimo" exatamente no número que o incomodava.
>
> **A tensão com o B12 também se dissolveu, e por medição.** A suspeita era que desenhar todo
> texto custaria fps. A repartição por tipo mostrou outra coisa (ms por mil objetos na tela):
>
> | | Desenhar do zero | Com o cache |
> |---|---|---|
> | traço | 6,4–6,7 | — (não cacheia) |
> | forma | 5,7–6,0 | — (não cacheia) |
> | texto | ~200 | **6,3–6,5** |
>
> **Cachear traço e forma economizaria menos que zero:** colar um bitmap (6,3–7,0) não é mais
> barato que desenhar um traço curto (6,4–6,7). O custo que domina é **fixo por objeto**, e o
> bitmap paga esse custo igual. O que torna o cache valioso em texto não é colar ser barato —
> é desenhar texto do zero custar ~200 ms por mil. Fator 30.
>
> **E uma otimização "óbvia" foi testada e reprovada:** reaproveitar um `PaintContext` para o
> frame inteiro, em vez de montar um por objeto — 4.000 alocações por frame a menos. Quatro
> execuções de cada lado: faixas idênticas. Revertida, com o porquê comentado no lugar onde
> alguém tentaria de novo.

<details>
<summary>A investigação original</summary>

Relato dele: arrastando o quadro com o botão direito, *"o fps começa baixo e sobe até cravar
em 60"*. E a meta é explícita: *"eu queria esse aplicativo rodando a 144 para ter uma extrema
fluidez para o usuário — como os aplicativos Apple"*.

**Isto é meta de produto, não defeito com sintoma.** Ninguém reclamou de engasgo — ele diz
que na prática não sentiu queda. O que está em questão é o teto.

**O que já dá para afirmar sem medir nada, e é o achado que orienta tudo:** o `QB_BENCH` de
06/08 mediu **144,0 fps** com a câmera varrendo o quadro e **redesenhando todo frame**. O
motor alcança 144 — quando quem move a câmera é código. O gesto de arrastar move a câmera
pela **mesma via**, e chega em 60. A diferença entre os dois não está em desenhar.

**Cravar em exatamente 60** também é assinatura, e não número qualquer: custo produz números
quebrados (17,4; 9,26) e oscilantes. Um valor redondo e estável é **teto**, não preço.

**Três famílias, e cada uma tem uma medição que a mata ou a confirma:**

| Suspeito | Por que é candidato | Como separar, de graça |
|---|---|---|
| **Taxa de entrada** | A câmera só muda quando chega um `pointermove`; se ele chega 60 vezes por segundo, o conteúdo é redesenhado 60 vezes — e o contador de fps, que só amostra frames de **conteúdo** (`Scheduler.ts:79-89`), leria 60 mesmo com o motor livre | Desenhar um traço longo e contínuo com a caneta: se **também** cravar em 60, é entrada, e não pan |
| **O monitor onde a janela está** | Ele tem **dois monitores** (medido no B8) e o Chromium acompanha a taxa do painel em que a janela está. Um deles a 60 Hz explicaria tudo | Arrastar a **janela** para o outro monitor e repetir o gesto |
| **A correção do B8** | `--ui-disable-partial-swap` repinta e troca a tela inteira a cada frame; o pan é o gesto que mais repinta | `QB_GPU=normal` desliga a correção (e traz o piscar de volta) — arrastar e ler o número |

**Evidência que caiu no colo em 08/08, e ela é boa:** a verificação *"trocar de ferramenta
custa quase nada"* mede `frame com troca − frame sem troca`, e o segundo termo **é o piso do
vsync**. Três rodadas do mesmo código, no mesmo dia:

| Hora | Piso (só repintura) | Taxa implícita | "Interface" | Veredito |
|---|---|---|---|---|
| 14:37 | **16,6 ms** | ~60 Hz | 2,4 ms | passou |
| 16:0x | 8,1 ms | ~123 Hz | 5,3 ms | reprovou |
| 16:1x | 8,7 ms | ~115 Hz | 5,0 ms | reprovou |

**Duas coisas saem daqui.** Primeira: o app **não está preso em 60** — ele alterna entre ~60
e ~120 Hz entre execuções, o que reforça que o B9 é teto de apresentação, e não custo de
desenho. Segunda: **a verificação está medindo o vsync junto com o que quer medir**, e por
isso passa quando a máquina está a 60 Hz e reprova quando está a 120. O teto de 3 ms não é
frouxo nem apertado — a conta é que está contaminada. Isso é da própria verificação e vale
consertar junto com o B9.

**Em 08/08/2026 o painel foi pego medindo a coisa errada, e isso reenquadra o bug.** Ele
relatou, no quadro real: *"quanto mais rápido eu movo, maior o fps, chegando a um teto
próximo a 66; quando movo um pouco fica uns 28-30; parado fica ocioso"*.

**Custo não se comporta assim.** Se desenhar fosse o gargalo, mover mais rápido daria menos
fps, e não mais. O que o contador mede é o **intervalo entre redesenhos**, e o `Scheduler`
só redesenha quando algo muda: mover devagar produz menos mudanças de posição, logo menos
frames, logo um número menor. Ele lê "o app está lento"; o painel está respondendo "a tela
mudou 30 vezes neste segundo".

O número que importa estava na mesma captura: **render de 6,40 ms com 1.049 objetos
desenhados a 2% de zoom** — daria 156 fps se houvesse o que desenhar.

**Consequência para este bug:** o teto de 60 (e agora 66) é quase certamente a **taxa de
entrega dos eventos de ponteiro**, e não um teto de desenho. A medição que separa isso está
na tabela de suspeitos acima, e continua valendo.

**Consequência para o painel:** o `F3` deve destacar o **custo do frame**, com o fps como
informação secundária e com nome honesto ("atualizações por segundo"). Item da Fase 9.

**Um detalhe que vale corrigir junto, se a meta virar 144:** o próprio painel do `F3` trata
**60 como alvo** — pinta o número de verde a partir de 55 fps (`DebugPanel.ts:111`). Com a
meta em 144, o medidor está dizendo "ótimo" justamente no número que incomoda.

</details>

### B11 — A biblioteca está partida em DUAS pastas
`corrigido` · `crítico` · 08/08/2026

> **Causa encontrada e corrigida em 08/08/2026: a sonda de escrita usava um nome de arquivo
> FIXO.** `ensureBoardsDir()` testava se a pasta aceitava escrita criando e apagando
> `.escrita-ok`. Com dois processos do app sondando a mesma pasta ao mesmo tempo, cada um
> apaga o arquivo do outro — e o `catch {}` vazio lia isso como *"esta pasta não aceita
> escrita"* sobre uma pasta perfeitamente gravável, mandando a biblioteca para a pasta
> alternativa, calado.
>
> **Medido, e não deduzido:**
>
> | Cenário | Sondas que falharam |
> |---|---|
> | Um processo sozinho (controle) | **0 / 300** |
> | Dois processos, nome de arquivo fixo | **120 / 300** e **144 / 300** (`ENOENT`, `EPERM`) |
> | Dois processos, nome único por processo (a correção) | **0 / 300** |
> | Três processos, nome único | **0 / 300** cada |
>
> **A correção tem três partes, e só a primeira é o conserto:**
>
> 1. **Nome de sonda único por processo** (`.escrita-ok-<pid>-<aleatório>`) — mata a corrida.
> 2. **Nunca mais cair de pasta calado.** Se a pasta principal já tem quadros e recusa
>    escrita, o app **falha alto** em vez de gravar noutro lugar: mudar de pasta com trabalho
>    salvo lá dentro é a pior saída possível. E a pasta resolvida agora sai **sempre** no
>    terminal (`[boards] pasta: …`), não só quando `QB_BOARDS` a troca — foi a falta dessa
>    linha que me fez errar o diagnóstico dos "quadros fantasmas" no B8.
> 3. **A resolução guarda a promessa, não o resultado** — duas chamadas concorrentes dentro
>    do mesmo processo entravam juntas antes da primeira terminar, e cada uma sondava por
>    conta própria.
>
> **Verificação no `selftest`:** a pasta é pedida **quatro vezes ao mesmo tempo** e as quatro
> respostas têm de ser idênticas e terminar em `Resumos-quadrobranco`. Uma chamada de cada vez
> nunca teria pego isto — que é exatamente por que ninguém pegou entre 30/07 e 08/08.
>
> **O que ficou sem resposta, e vale dizer:** por que o processo vivo desde as 14:41 gravou
> em `C:\` às 14:44 e na pasta alternativa às 15:29. A instrumentação existe agora para
> responder isso na próxima vez; antes dela, qualquer explicação seria invenção.
>
> **Consolidado em 08/08/2026, e nada foi perdido.** As três cópias de `CURSO 5` eram
> **três importações independentes do mesmo `.zip`** — 59 objetos cada, ids **todos
> diferentes** (nenhum em comum entre as cópias), mesma composição (41 textos, 14 traços, 4
> imagens) e nenhum apagamento aplicado. Ou seja: **nenhum trabalho feito dentro do app
> estava preso na pasta alternativa** — o que se perderia era só o esforço de reimportar.
>
> Duas delas têm geometria idêntica; a terceira difere em **0,5px de altura média de texto**,
> que é o ruído de medição de fonte já documentado no `RETOMAR`, e não uma versão melhor.
>
> As duas cópias da pasta alternativa foram **estacionadas** em
> `C:\Resumos-quadrobranco\_substituidos-2026-08-08\`, e não apagadas: 0,29 MB cada não
> justificam uma decisão irreversível. Elas não aparecem no lobby porque `listBoards()` só
> lista arquivos, nunca subpastas.

Relato dele: *"ao abrir o aplicativo de formas diferentes ele busca os diretórios de forma
diferente"*. **Está certo, e é pior do que parecia:** existem duas pastas de quadros com
conteúdo real, e as duas recebem escrita até hoje.

| Pasta | Conteúdo | Última escrita |
|---|---|---|
| `C:\Resumos-quadrobranco` (a documentada) | Continuação (411 obj), CURSO 5 (59), Cybersec resumão (1.063), teste (0) | **08/08 14:44** |
| `C:\Users\jbdea\Resumos-quadrobranco` (o *fallback*) | CURSO 5 (59), CURSO 5 **(2)** (59) | **08/08 15:29** |

**Por que é `crítico` pela régua deste arquivo:** não corrompe e não trava, mas **some com
trabalho da vista**. Um quadro salvo numa das pastas não aparece no lobby da sessão
seguinte, se ela resolver a outra — e a pessoa não tem como saber que ele existe. As duas
cópias de CURSO 5 já **divergiram**: uma foi atualizada em 07/08 23:04, a outra em 08/08
15:29.

**Isto explica os "quadros fantasmas" do B8**, e é a mesma dupla de datas da captura
daquele dia: 05/08 01:38 e 30/07 21:48 são os `createdAt` dos dois arquivos do *fallback*.
Não eram cards pintados duas vezes. Eram dois arquivos.

**Onde a decisão é tomada** (`src/main/storage/wbdFile.ts:61-101`): `ensureBoardsDir()`
tenta `C:\Resumos-quadrobranco`; se a escrita de prova falhar, cai **calado** para
`~\Resumos-quadrobranco`. Um `catch {}` vazio decide onde mora o trabalho do usuário, e
nada é registrado — nem no terminal, nem na interface.

**O que já foi eliminado por medição, em 08/08:**

| Suspeito | Como caiu |
|---|---|
| `QB_BOARDS` preso no terminal dele | Nenhuma variável `QB_*` no ambiente, nem em `User`/`Machine`, nem `.env` no repo |
| Permissão da pasta em `C:\` | ACL dá `Modify` a "Usuários autenticados"; escrita de prova pelo usuário comum **funcionou** |
| Build instalado antigo com outro caminho | Não existe `dist/`, nem app em `Programs`, nem atalho |
| Pasta antiga do `QuadroBranco` (Documentos) | Não existe; a migração não é a origem |
| Corrida entre duas chamadas de `ensureBoardsDir()` | Simulada isolada, **6 rodadas**, sempre concordaram — era a minha favorita |
| Caminho guardado em `localStorage` | O renderer não guarda caminho de quadro |

**O mecanismo ainda não está identificado, e não vou fingir que está.** O que o processo em
execução mostra é o que mais incomoda: **um único processo** (vivo desde 14:41) gravou em
`C:\` às 14:44 e no *fallback* às 15:29. Se fosse só "cada abertura resolve uma pasta",
isso não podia acontecer — `resolvedDir` é resolvido uma vez por processo.

**Primeiro passo, e é o que faltava desde 30/07:** fazer o app **dizer** qual pasta resolveu
— no terminal ao subir, e visível na interface. Hoje ele só registra quando `QB_BOARDS`
troca a pasta; no caminho que interessa, o do `catch` silencioso, ele não diz nada. Sem
isso, toda investigação daqui para frente é adivinhação — foi exatamente o que aconteceu no
B8.

**Nada foi perdido:** os quatro quadros de `C:\` estão íntegros e legíveis, e as duas cópias
de CURSO 5 do *fallback* também. O que falta é decidir qual das duas CURSO 5 vale, e juntar
tudo numa pasta só.

### B12 — Texto vira barra cinza: no PNG exportado e na tela afastada
`corrigido` · `alto` · 08/08/2026

Relato dele, exportando o `Cybersec resumão` para PNG: *"os textos dentro das notas não
ficam visíveis, eles não aparecem"* e *"alguns textos ficaram quebrados ainda, sem zoom, não
visível"*. A captura mostra **barras cinzas no lugar das palavras**.

**Causa:** o painter de texto tinha um corte de legibilidade — abaixo de **6px de glifo**
(`MIN_GLYPH_PX`), o texto virava barra e o conteúdo do post-it não era desenhado. O corte
faz sentido para a tela e **vazava para o arquivo**, porque exportar reusa os painters (e
reusar é a decisão certa: dois renderizadores divergiriam). O comentário do `exportBoard`
até dizia *"sempre em detalhe cheio"* e passava `lod: 'full'` — mas o corte do glifo é um
**segundo portão**, que não olha o LOD e sim `fontSize × escala do objeto × escala do
arquivo`.

**Medido no quadro dele:**

| | |
|---|---|
| Área real do quadro | **82.967 × 19.274** unidades |
| Escala usada pedindo 1x, 2x **ou** 3x | **0,199x nos três casos** (ver o B13) |
| Textos abaixo do corte de 6px | **126 de 642** |
| Post-its | **todos** sem texto |

**A correção foi além do export, a pedido dele:** *"não sou adepto a essas barras quando
tira o zoom do texto, não quero que elas existam no aplicativo mesmo que isso signifique
consumir mais processamento ou uso de GPU; quero que seja possível visualizar mesmo que
minimamente, sem zoom nenhum ou com zoom negativo, todas as palavras"*.

E a razão dele é boa: num resumo, saber **onde** estão as palavras não substitui saber
**quais** são — e afastar o zoom é justamente como se procura algo no quadro inteiro.

**A correção saiu em duas rodadas, e a primeira foi curta demais.** Eu isentei texto e
post-it e deixei o resto no atalho; ele voltou com uma captura: *"as prints presentes no
quadro e alguns elementos gráficos desenhados viram quadrados e retângulos de cores fixas"*.
Estava certo — imagem e forma continuavam virando bloco.

**O que mudou, no fim:**

1. O corte por glifo **deixou de existir** — a constante e o desenho da barra saíram do
   código, para ninguém reintroduzir.
2. O nível de LOD **`blocks` foi removido inteiro**. Ele trocava *todo* objeto por um
   retângulo da cor dominante abaixo de 12% de zoom, e era barato justamente porque mentia.
   Saiu do renderer, da miniatura do lobby e do tipo `LodLevel`.
3. Sobrou um único nível reduzido, o `simplified`, e ele **não troca o objeto por outra
   coisa**: usa a polilinha simplificada do traço, que continua sendo o traço.

O único limite que ficou é físico: objeto menor que meio pixel de tela não é desenhado,
porque não há pixel onde mostrá-lo.

**O preço, medido e não estimado** (`QB_BENCH=4000`):

| Fase | Antes | Só texto | Sem `blocks` |
|---|---|---|---|
| zoom 100% | 144 fps | 144 fps | **144 fps** |
| zoom 40% | 144 fps | 144 fps | **144 fps** |
| ajustado à tela (4.000 visíveis) | ~108 fps | 45 fps | **23,3 fps** (frame 43 ms) |

**Navegar e desenhar não mudaram nada.** O custo é inteiro do caso "quadro todo na tela" —
que é exatamente o que ele quis comprar, e disse isso antes de ver a conta. Vale lembrar que
4.000 objetos é quase quatro vezes o resumo real dele (1.063).

**Isto entra em tensão direta com o B9** (meta de 144 fps), e as duas coisas não são
conciliáveis desenhando tudo do zero a cada frame. A saída que não obriga a escolher é
**cachear o objeto rasterizado**: desenhar cada caixa de texto e cada imagem uma vez para um
bitmap e reaproveitar enquanto o objeto não muda — que é como um editor de verdade resolve
isto. Fica para a Fase 9, e é o item que destrava o B9 junto.

### B14 — Texto por cima de texto no SVG exportado
`corrigido` · `médio` · 08/08/2026

Relato dele, depois de passar nos testes 3 e 5: *"quase tudo está vindo no local correto do
resumo, porém algumas linhas e textos ainda estão vindo com dimensões bugadas (vindo texto
em cima do texto), o que não é presente no original"*.

**Causa:** o SVG posiciona cada trecho de texto no ponto que **nós** medimos, mas quem
desenha os glifos é a fonte de **quem abre o arquivo**. Quando essa fonte é um pouco mais
larga que a nossa, o trecho transborda e invade o começo do trecho seguinte — que está
ancorado num ponto fixo e não sai do lugar. O resultado é sobreposição.

Isso não acontece no PNG, e a razão está na decisão 19 do `RETOMAR`: o PNG **reusa os
painters**, então ele é pixel a pixel o que está na tela. O SVG não pode reusar (os painters
falam canvas), e é aí que a fonte de terceiros entra na conta.

**Correção:** cada `<text>` passou a carregar `textLength` com a largura que medimos, mais
`lengthAdjust="spacingAndGlyphs"`. O navegador então **comprime ou estica o trecho para
caber exatamente** na largura prevista, e ele nunca invade o vizinho. `spacingAndGlyphs`
distribui a diferença no espaçamento e na largura dos glifos; só `spacing` empilharia todo o
erro nos espaços, o que salta à vista muito mais.

**A alternativa definitiva seria embutir a fonte no arquivo** — fidelidade perfeita, arquivo
muito maior e licença de fonte para resolver. Isto custa dois atributos.

**Verificação no `selftest`:** todo `<text>` do SVG tem de sair com `textLength`, e o arquivo
tem de conter `spacingAndGlyphs`. É o par que some se alguém simplificar a emissão.

### B16 — Uma "sombra" atrás dos ícones da barra polui a interface
`corrigido` · `baixo` · 12/08/2026, fechado em 13/08/2026

> **Era o candidato 1, e a foto da janela mediu o porquê.** A "sombra" é a **pílula de
> ligado** da barra inferior — o retângulo arredondado atrás de grade, régua e camadas. Ela
> era cinza neutro (`--fg` a 11%); passou a ser da **cor de destaque** (`--accent` a 16%), a
> mesma que a barra lateral já usava.
>
> **Os números, lidos pixel a pixel de uma captura da janela no tema escuro:**
>
> | | RGB | Passo em luminância |
> |---|---|---|
> | quadro, fora da barra | 19,21,26 | — |
> | barra | 27,30,37 | +8 sobre o quadro |
> | pílula **neutra** (o bug) | 48,53,59 | **+22 sobre a barra** |
> | pílula **de destaque** (a correção) | 31,44,69 | **+13 sobre a barra** |
>
> **Duas coisas saem daí, e nenhuma era visível lendo o CSS.**
>
> Primeira: o cinza neutro dava um degrau de luminância quase **três vezes maior** que o da
> própria barra contra o quadro. O indicador de estado estava gritando mais alto que a
> superfície em que ele mora — daí "polui", e não "está errado".
>
> Segunda, e é a que explica a palavra *sombra*: **o tema escuro inteiro é azulado.** A razão
> azul/vermelho é 1,37 no fundo do quadro e 1,37 na barra; a pílula neutra caía para **1,23**.
> Uma mancha *cinza* sobre uma interface azulada não se lê como destaque, se lê como sujeira.
> O azul faz o contrário: metade do degrau de luminância, e a diferença vai para a cor — e,
> como o glifo já é azul, pílula e ícone viram um objeto só em vez de um ícone pousado sobre
> um borrão.
>
> **Os candidatos 2 e 3 caíram, e não por eliminação:** a captura mostra a barra com quatorze
> ícones e **só os três ligados** tinham fundo. `saturate(160%)` e o brilho interno de 1px são
> da barra inteira; se fossem eles, todos os quatorze estariam manchados.
>
> **A hipótese dele de "só no modo noturno" estava meio certa, e vale registrar o meio.** A
> pílula neutra aparece nos dois temas — no claro ela daria `#e3e4e5` sobre o painel branco
> (isto é composição no papel, e não medido: a foto é do tema escuro). O que
> muda é a **leitura**: sobre fundo claro, um cinza um pouco mais escuro é o idioma normal de
> "pressionado"; sobre fundo escuro, um cinza mais *claro* é o idioma de véu. Ele viu certo o
> sintoma e quase certo a causa.
>
> **Verificação no `selftest`:** *"a pílula de ligado usa a cor de destaque, e é a mesma nas
> duas barras"*. Ela compara **matiz** — a cor composta, sem o alfa — do fundo do botão ligado
> nas duas barras contra o token `--accent`. Mexer na opacidade da pílula é acabamento e
> continua passando; voltar para cinza é a regressão, e reprova. A comparação lê `#rrggbb`,
> `rgb()` e `color(srgb …)` como a mesma coisa, porque `color-mix` sai na terceira forma.

Relato dele, com captura da barra inferior: *"atrás dos ícones existe uma espécie de
'sombra' que deixa a interface do aplicativo meio poluída, acredito que ela só seja visível
no modo noturno"*.

**Ficou agendado de propósito.** Ele pediu para verificar isto **depois** de fecharmos a
rodada de ícones — mexer nas duas coisas ao mesmo tempo tornaria impossível dizer qual
mudança melhorou o quê. É a mesma razão pela qual as correções deste arquivo são agrupadas
por área tocada, e não por ordem de chegada.

<details>
<summary>Os três candidatos, antes de medir</summary>

**O que já dava para afirmar sem medir:** a captura é de 12/08/2026, logo depois do polimento
das barras, e nela os únicos ícones com fundo visível são os **três interruptores ligados**
(grade, régua e camadas). Então o primeiro suspeito era meu, e recente.

1. **A pílula de "ligado" da barra inferior.** Ela é `color-mix(var(--fg) 11%, transparent)`
   — cinza claro sobre um painel translúcido escuro. Isso pode dar uma mancha sem forma
   definida em vez de um retângulo limpo, que é exatamente "sombra atrás do ícone". Foi
   escolhida neutra de propósito (quatro pílulas azuis manchariam a fila), mas neutro sobre
   translúcido pode ser pior que colorido. — **era esta.**
2. **`saturate(160%)` no `backdrop-filter`.** Subiu de 140% no polimento. Saturar o que está
   atrás de um painel escuro puxa a cor do quadro para dentro da barra.
3. **O brilho interno de 1px** (`inset 0 1px 0 rgba(255,255,255,.06)`), que entrou junto e só
   existe no tema escuro — o que casa com a suspeita dele de ser só no modo noturno.

</details>

### B15 — Uma verificação do auto-teste falhou uma vez e não reproduziu
`a investigar` · `baixo` · 12/08/2026

Em 12/08/2026, numa execução do `selftest`, a verificação *"arrastar um arquivo insere a
imagem onde ela foi solta"* devolveu **centro=(700, 600)** onde esperava **(700, 400)**.

**Não reproduziu.** Quatro execuções depois — duas no mesmo código, uma no commit anterior
e uma no seguinte — deram (700, 400). A execução que falhou estava sob carga: na mesma
saída, o teste de arraste marcou `bbox 3.9` (faixa normal 3,0–3,3).

**Está registrado apesar de não reproduzir, e o motivo é o método:** este projeto trata o
`selftest` como o verificador, e uma verificação que falha sozinha de vez em quando é pior
que uma que falha sempre — ela ensina a ignorar falhas. Se aparecer de novo, o suspeito
inicial é o teste depender do retângulo do host medido num instante em que o layout ainda
estava assentando.

**O que NÃO explica:** 200px de diferença não é jitter de tempo. A carga externa pode ter
mudado *quando* algo foi medido, mas alguma medição está lendo estado que ela supõe pronto.

### B13 — Os três botões de resolução da exportação não fazem nada em quadro grande
`corrigido` · `alto` · 08/08/2026, fechado em 12/08/2026

> **Corrigido na Fase 9, e a saída registrada aqui não era alcançável.**
>
> O plano anterior dizia "renderizar em pedaços e **juntar no arquivo final**". Isso não dá:
> o quadro dele tem 82.967 × 19.274 unidades, o que são **1,6 gigapixel a 1x** — 6,4 GB de
> pixel cru. Não existe PNG único para isso, com ou sem ladrilhos, e nenhum visualizador
> abriria. **O teto de 64 MP nunca foi o limite que apertava; a aritmética era.**
>
> Então o ladrilho virou **arquivo**, e não pedaço costurado. A escala pedida passa a ser
> respeitada exatamente, e o quadro sai numa grade de imagens de tamanho normal — que é o
> que torna o resumo legível, o pedido original.
>
> | Pedido | Antes | Agora |
> |---|---|---|
> | 1x | 0,199x, 1 arquivo | **1x**, ~25 arquivos |
> | 2x | 0,199x, 1 arquivo | **2x**, ~100 arquivos |
> | 3x | 0,199x, 1 arquivo | **3x**, ~225 arquivos |
>
> **E o mínimo honesto que este arquivo pedia veio junto:** o diálogo diz o que vai sair
> **antes** de exportar — tamanho final em pixels, escala real e quantos arquivos —, e muda
> a cada clique. Acima de 24 arquivos ele avisa que são muitos e sugere 1x ou o SVG.
>
> O **PDF continua cedendo escala**, e o diálogo diz isso com todas as letras: uma página não
> tem onde pôr o segundo ladrilho.
>
> Sufixo `-l<linha>c<coluna>` com base 1, **inclusive no primeiro arquivo** — ordenar a pasta
> por nome remonta a grade.
>
> **Verificação em duas camadas:** no `selftest`, que as três escalas dão tamanhos
> diferentes (era isso que o bug quebrava), que nenhum ladrilho passa dos tetos, que a soma
> deles é exatamente a imagem inteira e que dois vizinhos gravam pedaços **diferentes**
> (bytes iguais denunciariam a mesma região gravada N vezes); e no `QB_EXPORT`, a grade
> gravada de verdade, 4 arquivos irmãos no disco.

Relato dele: *"a qualidade é um problema, dificulta ou impossibilita a leitura de textos
muito pequenos"*.

**Não é impressão, e a causa é diferente da do B12.** A exportação tem um teto de **64
megapixels** — acima dele a escala é reduzida para o canvas não estourar. No quadro dele,
que tem **82.967 × 19.274** unidades, o teto engole qualquer escolha:

| Pedido | Usado | Resultado |
|---|---|---|
| 1x | **0,199x** | 16.515 × 3.837 px |
| 2x | **0,199x** | 16.515 × 3.837 px |
| 3x | **0,199x** | 16.515 × 3.837 px |

Ou seja: **os três botões produzem o mesmo arquivo**, e ninguém avisa. Um controle que não
faz nada é pior que um controle ausente — ele promete.

**O teto em si está certo** (o navegador não aloca um canvas maior), mas ele é um limite de
*uma imagem só*. A saída conhecida é **exportar em ladrilhos e costurar**: renderizar o
quadro em pedaços de até 64 MP e juntá-los no arquivo final. Com isso o 2x volta a
significar 2x, e o resumo fica legível.

**Enquanto isso não existe, o mínimo honesto é avisar:** mostrar no diálogo o tamanho final
em pixels e a escala que será realmente usada, antes de exportar.

### B10 — O custo por frame cresce com o zoom
`a investigar` · `baixo` · 08/08/2026

Relato dele, no mesmo reteste: *"quanto maior o zoom, menor o fps e maior o ms"* — e, logo
em seguida, *"na prática eu não senti uma queda de desempenho"*.

**Está separado do B9 de propósito:** ali é um teto redondo (60), aqui é preço que sobe
junto com uma variável. Teto e preço não têm a mesma causa nem a mesma correção, e juntá-los
num id só foi exatamente o que atrasou o B1/B7/B8.

**A explicação provável é a menos interessante, e por isso precisa de medição antes:** com
zoom alto, um traço curto vira uma geometria enorme na tela, e rasterizar caminho grande
custa mais pixels — mesmo com **menos** objetos visíveis, que é o que o culling entrega. Se
for isso, é o preço correto de desenhar, e o item fecha como `não é bug`.

**O que mediria:** custo de render (não de frame) em três níveis de zoom sobre o mesmo
quadro real, contra o número de objetos visíveis em cada um. Se o custo sobe **enquanto a
contagem de objetos cai**, é rasterização, e não travessia de cena.

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

### M8 — Camadas, com cadeado — **e o marca-texto que "pula para trás"**
`corrigido` · `médio` · 08/08/2026, fechado em 12/08/2026

> **Feito na Fase 9, nas duas metades — e a primeira resolve o caso dele sem painel nenhum.**
>
> **M8a, o marca-texto.** A regra deixou de ser absoluta: o grifo sobe até logo **acima da
> imagem mais alta que ele encosta**. E a correção é **local**, não global — subir sempre
> faria um grifo passar na frente de um texto que por acaso está acima de alguma imagem
> distante, trocando o problema dele pelo problema oposto em outro lugar do quadro. Duas
> verificações, e o par vale mais que cada uma: grifar sobre a imagem entra por cima; com a
> **mesma** imagem no quadro, grifar longe dela continua indo por baixo do texto.
>
> A **decisão 5 do RETOMAR mudou junto**, senão a próxima sessão lê a regra antiga e
> "conserta" de volta.
>
> **M8b, o painel.** Lista de **objetos**, não grupos com nome: das duas perguntas de projeto
> abaixo, a escolha foi a barata — "camada" é o objeto que já existe, com o `z` que já existe.
> Quase nada foi construído, e isso é o ponto: `locked` já existia e já era respeitado; o
> `hidden` já era filtrado dentro do `queryVisible`, que é por onde o renderer **e** a
> exportação pedem os objetos — então o olho vale para o arquivo também, de graça.
>
> Detalhes que são decisão: fica na lateral **direita** (a esquerda é de onde se escolhe o
> que fazer); lista **só o que está no viewport** (mil linhas não são um painel, são um
> despejo); a lista sai **invertida** em relação à ordem de desenho; o nome de um texto é o
> **próprio texto**; e **clicar no nome seleciona mesmo travado** — é o que torna o cadeado
> reversível, porque travar sem uma lista seria uma porta que fecha por fora.
>
> Atalho `C` e botão na barra inferior — recurso sem botão é recurso que ninguém descobre.

<details>
<summary>O pedido original e as duas perguntas de projeto</summary>

Pedido dele: *"quando nós colocamos um print e queremos usar o marca-texto para destacar
algo na imagem, ele pula para a camada de trás. Quero uma opção para alternar as camadas,
como tem no Photoshop, porém de forma mais simplificada para evitar esses problemas, com um
cadeado para bloquear a camada específica"*.

**O sintoma bate numa decisão deliberada**, e por isso entra como `decisão a revisar` e não
como bug (é a triagem que fez nascer a Fase 5.5). A regra está no
[RETOMAR.md](RETOMAR.md), decisão 5: **o marca-texto entra por baixo de tudo** — por chave
`z`, não por ordem de desenho — senão grifar cobriria o texto que se quis destacar.

**A regra está certa para texto e errada para imagem, e a diferença é física:** texto é
tinta escura sobre fundo claro, e o grifo por baixo aparece atrás das letras, como marcador
de verdade. Uma imagem é **opaca** — não há "atrás" que se veja. O grifo simplesmente
some. A regra foi escrita quando o app não tinha imagens (Fase 4); as imagens chegaram na
Fase 7 e ninguém revisitou.

**O que já existe e não precisa ser construído:**

- ordem de camada por objeto (`z`) e os comandos de trazer para frente / mandar para trás;
- **travar objeto** — já implementado e coberto pelo `selftest` (*"objeto travado não pode
  ser selecionado"*, *"objeto travado não pode ser apagado"*).

Ou seja, o cadeado que ele pede **já existe por objeto**; o que falta é **enxergá-lo e
alcançá-lo**, que é justamente o papel de um painel de camadas.

**As duas perguntas de projeto, que valem decidir antes de codar:**

1. **Camada é grupo ou é objeto?** No Photoshop é um grupo com nome, que se cria e se
   ordena. O que ele descreve resolvido "de forma mais simplificada" pode ser só um painel
   listando os objetos do quadro, com olho e cadeado — sem inventar o conceito de grupo.
2. **O marca-texto sobre imagem:** a saída mais barata é a regra deixar de ser absoluta —
   grifo vai por baixo de **texto** e por cima de **imagem**. Isso resolve o caso dele sem
   painel nenhum, e o painel passa a ser o controle geral, não o remendo.

</details>

### M9 — Plano de fundo no menu principal, com os painéis em vidro
`abandonada por ora` · `médio` · 12/08/2026, arquivada no mesmo dia

> **Ele desistiu dela no mesmo dia:** *"vamos abandonar a ideia de colocar a imagem de fundo
> por enquanto, vamos focar nessa informação e nas outras ideias"*.
>
> **O item fica escrito assim mesmo**, com a viabilidade toda respondida, porque a análise
> não expira: se a ideia voltar, o trabalho de descobrir o que já existe e onde está a
> dificuldade está feito. Apagá-la faria a próxima sessão refazer a mesma investigação.
>
> **E uma parte dela já foi aproveitada:** os ícones da interface são SVG com `currentColor`,
> e não PNG. Isso não foi decidido pensando em vidro — veio do M3, para não depender da fonte
> do sistema —, mas é exatamente o que um efeito de transparência precisa: eles herdam a cor,
> ficam nítidos em qualquer tamanho e aceitam opacidade sem sujar as bordas.

Pedido dele: *"uma opção de 'plano de fundo' apenas do menu principal — é possível escolher
um arquivo png ou outro formato de imagem e carregar para se tornar o plano de fundo do
aplicativo, e deixando os ícones com efeito de transparência, para melhor visibilidade com
esse efeito 'glass — vitrified' do novo iOS"*.

**Está registrado e NÃO começado, por decisão dele:** *"para fazermos essa tentativa o
aplicativo precisará estar com todas as etapas concluídas e rodando liso e commitado"*. A
regra é boa — é uma mudança visual grande, e começá-la com a fase aberta misturaria o efeito
dela com o polimento que ainda está em curso.

**Viabilidade, respondendo à pergunta dele:** sim, e a maior parte da infraestrutura já
existe. O que já está pronto e o que falta:

| Peça | Situação |
|---|---|
| Escolher o arquivo de imagem | **Pronto** — o app já abre seletor (`importer.pick`) e já lê imagem solta (`features/images/insert`) |
| Mostrar como fundo do lobby | **Trivial** — `background-image` no `.qb-lobby` |
| O efeito de vidro | **Pronto** — as barras já usam `backdrop-filter: blur() saturate()`. Hoje ele desfoca um fundo liso, ou seja, **não aparece**. É sobre uma foto que ele passa a valer alguma coisa |
| Guardar a escolha | **Falta** — copiar o arquivo para a pasta de dados e guardar o caminho. Guardar a imagem em `localStorage` como base64 não serve: uma foto de 4 MB não cabe lá |
| A CSP | **Atenção** — `img-src 'self' data: blob:` barra `file://`. A imagem tem de chegar por IPC e virar `blob:`, como as imagens do quadro já fazem |

**A parte difícil não é nenhuma dessas, e é onde a coisa vira profissional ou amadora: o
contraste.** Sobre uma foto qualquer, o texto dos cards e o nome dos quadros podem ficar
ilegíveis, e o `npm run check:colors` **não cobre isso** — ele confere as cores de marca
contra os dois fundos de tema, não contra uma imagem arbitrária que o usuário escolheu.

A saída conhecida é um **véu** entre a foto e o conteúdo (uma camada escura ou clara, com
intensidade regulável), que é exatamente o que a Apple faz. Sem véu, o efeito funciona com a
foto que se testou e quebra com a próxima.

**Restringir ao menu principal, como ele propôs, é a decisão certa** e vale registrar: o
quadro em si continua limpo, então nada disso encosta no canvas, no desempenho de desenho
nem na exportação.

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

### Etapa 5 — Pixels velhos (B8, com o B1 e o B7 dentro) · **feita em 06/08/2026**
Três relatos, um buraco, duas linhas de correção — e dez hipóteses derrubadas por medição
antes de escrever a primeira delas. O placar completo está no B8.

**Fica um item para a Fase 9, e é barato: subir o Electron.** Está em 33.4.11 (Chromium de
2024) numa máquina com Windows e driver de 2026, e é essa distância que provavelmente cria
o defeito. `QB_GPU=normal` reproduz o bug: depois de subir, é com ele que se confere se a
correção ainda é necessária — senão ela fica para sempre, por inércia.

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
| B5 (resto) | Não reproduz — reteste dele em 08/08 com o `F3` aberto: clicar, mover e selecionar não derrubam fps |
| B1, B7, B8 | Confirmados por ele em 08/08: sem piscar, sem rasgo, sem rastro |
| B13 | Corrigido na Fase 9 — ladrilhos como arquivos, e o diálogo diz o que vai sair |
| M8 | Corrigido na Fase 9 — marca-texto sobre imagem, e painel de camadas |
| B9 | Não é custo de desenho: o quadro real custa 6,1 ms, e o orçamento de 144 fps é 6,94 |
