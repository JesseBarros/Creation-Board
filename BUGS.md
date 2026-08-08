# Bugs e melhorias abertos

Registro do que apareceu usando o app de verdade, antes da Fase 9 (polimento).
O [RETOMAR.md](RETOMAR.md) diz em que pé o projeto está; este arquivo diz **o que está
errado e o que falta**. Some quando a lista zerar.

**Última atualização: 08/08/2026.** **2 itens abertos** (B9 e B10, os dois de desempenho),
**15 fechados** e **1 decisão a revisar** (**M8**, camadas — vai para a Fase 9).


**Ainda em aberto:**




Vale registrar o padrão, porque ele se repete: **medir antes de corrigir devolveu mais
resultado que corrigir teria devolvido.** Na rodada de 04/08 nenhuma linha de correção foi
escrita e três dos cinco bugs fecharam ou encolheram; na de 06/08 a correção final tem
duas linhas, e as outras nove hipóteses caíram por medição — inclusive as minhas favoritas,
duas vezes.

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
`corrigido pelo B8` · `médio` · 04/08/2026, fechado em 06/08/2026


A correção de 04/08 fica: pintar na hora ao entrar é correto por si. Mas o que ela fazia era
**forçar repintura num gatilho** — e era isso que escondia a falha real em vez de mostrá-la.

**Correção de 04/08/2026:** `#enterBoard()` passou a pintar as duas camadas **na hora**, em
vez de esperar o próximo frame de animação. Até o `requestAnimationFrame` chegar, o canvas ainda
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

### B7 — Interface "rasgada" ao redimensionar a janela
`corrigido pelo B8` · `alto` · 04/08/2026, fechado em 06/08/2026

**Era o B8.** A leitura de 04/08 — [...] — estava **certa, e era maior do que parecia**: acontece sem redimensionar nada.

Duas coisas ficam do que se fez aqui, e as duas com a etiqueta certa desta vez:

- O `webContents.invalidate()` no resize continua, como proteção — mas é **remendo no
  gatilho**, e não conserto da causa. Se o B8 voltar, é aqui que se procura primeiro.
- O `overflow: clip` foi **testado no B8 e não é a causa** de nada. Fica por mérito próprio
  (a rolagem automática do cursor de texto é real), e não como correção deste bug.


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

**A causa apareceu quando foi dito que [...].** Isso descarta layout e aponta para **pintura**: a tela ficou com pixels
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
padrão. Repinta e troca a tela inteira a cada frame. Confirmado: [...].

**O preço foi medido, não estimado.** `QB_BENCH=4000`, duas rodadas com e duas sem:

| Fase | Sem a correção | Com a correção |
|---|---|---|
| zoom 100% | 144,0 / 144,0 fps | 144,0 / 144,0 fps |
| zoom 40% | 136,4 / 132,3 fps | 133,6 / 135,0 fps |
| ajustado à tela | 111,7 / **108,0** fps | 99,7 / **108,0** fps |

A primeira rodada sugeriu 11% de custo na fase pesada; a segunda deu **9,26 ms de frame
nos dois casos**. O 99,7 era ruído. **Não há custo mensurável** — e teria sido fácil
"economizar" a correção por causa de uma amostra só.

**Isto é remédio de sintoma.** A raiz provável está na tabela abaixo, e o conserto de
verdade virou item da Fase 9:

| | Versão | Chromium |
|---|---|---|
| Creation Board | **Electron 33.4.11** | ~130, do fim de 2024 |
| Último Electron | 43.3.0 | atual |
| Windows desta máquina | build 26200 | 2026 |
| Driver NVIDIA | instalado em 14/07/2026 | 2026 |

Dez versões maiores atrás. É a resposta para [...]: é o único
Chromium de 2024 rodando numa máquina de 2026. **Dependência de plataforma envelhece
sozinha, sem ninguém tocar no código.**

`QB_GPU=normal` desliga a correção e reproduz o bug — serve para descobrir o dia em que ela
virar desnecessária, em vez de carregá-la para sempre por inércia.

**Não dá para cobrir no `selftest`, e vale dizer por quê:** o auto-teste verifica o que o
app *faz*, e o app fazia tudo certo. O defeito está em como o Chromium entrega pixels
prontos ao Windows — depois do último ponto que qualquer JavaScript enxerga. Um teste que
pegasse isto teria que comparar frames apresentados, não estado do documento.

<details>
<summary>A investigação, e o que cada rodada eliminou</summary>


**Confirmado, e cada ponto elimina uma família de causas:**

- **É só visual.** Selecionar, clicar e interagir continuam funcionando. Nada de estado,
  documento ou entrada está envolvido.
- **É só no hover, e sempre.** Todo ícone, toda vez. Não é intermitente nem depende de
  quanto tempo o app está aberto.
- **A composição por GPU está ativa** nessa máquina — medido, não suposto. A primeira
  leitura dizia [...] e estava errada: o Chromium levanta a GPU num processo
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

### O que a captura de teste mostrou, e que vale mais que o piscar

Na captura de 06/08/2026 os **cartões do lobby aparecem desenhados por cima do quadro** —
uma faixa retangular da janela com pixels de outra tela, parada, tempo suficiente para sair
numa foto. Não é piscar: é **região que ninguém repintou**. E ele completou: [...].

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


**O piscar continuou.** Sem um único quadro na pasta, não há conteúdo importado para
culpar. Hipótese fechada, e os 6,6 MB de resumo de teste nunca correram risco.

Ficou registrado o método, porque ele serve para a próxima vez: *tirar do caminho não
precisa significar destruir*.

### Os "quadros fantasmas" eram o próprio bug — **ERRADO, ver o B11**

> **Corrigido em 08/08/2026.** Esta seção chegou à conclusão errada, e o motivo vale mais
> que a conclusão: eu comparei com **uma** pasta e concluí que a tela mentia. O app estava
> lendo **outra**. Os dois cards eram dois arquivos de verdade, e estão em
> `C:\Users\<usuario>\Resumos-quadrobranco` — com exatamente as duas datas da captura:
> `Quadro B (2).wbd` criado em **05/08 01:38** e `Quadro B.wbd` criado em **30/07 21:48**,
> os dois com **59 objetos**. Ver o **B11**.
>
> A lição sobrevive à conclusão, só que ao contrário: comparar com o disco **é** o método
> certo — mas "o disco" não é uma pasta que eu escolhi, e sim a que o app resolveu. Eu não
> verifiquei qual era, e o app não tinha como dizer.


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
essa máquina tem esse perfil) quebram a conta das regiões sujas. E [...] é,
literalmente, [...].

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
`a investigar` · `médio` · 08/08/2026



**O que já dá para afirmar sem medir nada, e é o achado que orienta tudo:** o `QB_BENCH` de
06/08 mediu **144,0 fps** com a câmera varrendo o quadro e **redesenhando todo frame**. O
motor alcança 144 — quando quem move a câmera é código. O gesto de arrastar move a câmera
pela **mesma via**, e chega em 60. A diferença entre os dois não está em desenhar.

**Cravar em exatamente 60** também é assinatura, e não número qualquer: custo produz números
quebrados (17,4; 9,26) e oscilantes. Um valor redondo e estável é **teto**, não preço.

**Três famílias, e cada uma tem uma medição que a mata ou a confirma:**


**Evidência que caiu no colo em 08/08, e ela é boa:** a verificação [...] mede `frame com troca − frame sem troca`, e o segundo termo **é o piso do
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

**Um detalhe que vale corrigir junto, se a meta virar 144:** o próprio painel do `F3` trata
**60 como alvo** — pinta o número de verde a partir de 55 fps (`DebugPanel.ts:111`). Com a
meta em 144, o medidor está dizendo "ótimo" justamente no número que incomoda.

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
> **Consolidado em 08/08/2026, e nada foi perdido.** As três cópias de `Quadro B` eram
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


| Pasta | Conteúdo | Última escrita |
|---|---|---|
| `C:\Resumos-quadrobranco` (a documentada) | Continuação (411 obj), Quadro B (59), quadro de referência (1.063), teste (0) | **08/08 14:44** |
| `C:\Users\<usuario>\Resumos-quadrobranco` (o *fallback*) | Quadro B (59), Quadro B **(2)** (59) | **08/08 15:29** |

**Por que é `crítico` pela régua deste arquivo:** não corrompe e não trava, mas **some com
trabalho da vista**. Um quadro salvo numa das pastas não aparece no lobby da sessão
seguinte, se ela resolver a outra — e a pessoa não tem como saber que ele existe. As duas
cópias de Quadro B já **divergiram**: uma foi atualizada em 07/08 23:04, a outra em 08/08
15:29.

**Isto explica os "quadros fantasmas" do B8**, e é a mesma dupla de datas da captura
daquele dia: 05/08 01:38 e 30/07 21:48 são os `createdAt` dos dois arquivos do *fallback*.
Não eram cards pintados duas vezes. Eram dois arquivos.

**Onde a decisão é tomada** (`src/main/storage/wbdFile.ts:61-101`): `ensureBoardsDir()`
tenta `C:\Resumos-quadrobranco`; se a escrita de prova falhar, cai **calado** para
`~\Resumos-quadrobranco`. Um `catch {}` vazio decide onde mora o trabalho do usuário, e
nada é registrado — nem no terminal, nem na interface.

**O que já foi eliminado por medição, em 08/08:**


**O mecanismo ainda não está identificado, e não vou fingir que está.** O que o processo em
execução mostra é o que mais incomoda: **um único processo** (vivo desde 14:41) gravou em
`C:\` às 14:44 e no *fallback* às 15:29. Se fosse só [...],
isso não podia acontecer — `resolvedDir` é resolvido uma vez por processo.

**Primeiro passo, e é o que faltava desde 30/07:** fazer o app **dizer** qual pasta resolveu
— no terminal ao subir, e visível na interface. Hoje ele só registra quando `QB_BOARDS`
troca a pasta; no caminho que interessa, o do `catch` silencioso, ele não diz nada. Sem
isso, toda investigação daqui para frente é adivinhação — foi exatamente o que aconteceu no
B8.

**Nada foi perdido:** os quatro quadros de `C:\` estão íntegros e legíveis, e as duas cópias
de Quadro B do *fallback* também. O que falta é decidir qual das duas Quadro B vale, e juntar
tudo numa pasta só.

### B10 — O custo por frame cresce com o zoom
`a investigar` · `baixo` · 08/08/2026


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

### M8 — Camadas, com cadeado — **e o marca-texto que [...]*
`decisão a revisar` · `médio` · 08/08/2026 · **para a Fase 9**

Pedido: [...].

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
- **travar objeto** — já implementado e coberto pelo `selftest` ([...], [...]).

Ou seja, o cadeado que ele pede **já existe por objeto**; o que falta é **enxergá-lo e
alcançá-lo**, que é justamente o papel de um painel de camadas.

**As duas perguntas de projeto, que valem decidir antes de codar:**

1. **Camada é grupo ou é objeto?** No Photoshop é um grupo com nome, que se cria e se
   ordena. O que ele descreve resolvido [...] pode ser só um painel
   listando os objetos do quadro, com olho e cadeado — sem inventar o conceito de grupo.
2. **O marca-texto sobre imagem:** a saída mais barata é a regra deixar de ser absoluta —
   grifo vai por baixo de **texto** e por cima de **imagem**. Isso resolve o caso sem
   painel nenhum, e o painel passa a ser o controle geral, não o remendo.

### M6 — Seletor de cores personalizado
`corrigido` · `médio` · 04/08/2026

A paleta ganhou um **+** que abre o seletor do sistema. A cor escolhida entra como mais uma
amostra na fila (para ser reescolhida com um clique) e sobrevive ao fechar o app.

**O aviso mudou de ideia durante a implementação, e o motivo vale registrar.** A intenção
era avisar quando a cor tivesse *contraste baixo* — mas a primeira verificação mostrou que
isso quase nunca acontece: **o adaptador de tema resgata a cor invertendo a luminosidade**,
então ela não some. A pergunta útil não era "ela some?", e sim *[...]*.


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

