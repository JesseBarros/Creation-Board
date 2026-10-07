# Engenharia

**Por que o código é assim, e como conferir que continua de pé.**

O [README](README.md) explica *o que* o app faz e como usá-lo. O [BUGS.md](BUGS.md) registra
*o que já deu errado* e como foi resolvido. Este arquivo responde a terceira pergunta, a que
não cabe em nenhum dos dois: **as decisões que o código não consegue explicar sozinho, e as
medições que as sustentam.**

Ele existe porque quase toda decisão aqui teve uma alternativa plausível que foi descartada
por medição — e um comentário no código diz *o que* foi escolhido, nunca *o que foi testado e
falhou*. Sem este registro, a próxima pessoa refaz a investigação e chega à mesma conclusão
duas semanas depois.


**Leia antes de:**

| Se você vai… | Leia |
|---|---|
| mudar qualquer coisa | **Decisões que não estão óbvias no código** — 20 itens, cada um com o porquê |
| mexer em desempenho | **Como conferir que está tudo de pé** — as faixas normais e o que cada número significa |
| atualizar o Electron | **A escada do Electron** — 33, 41 e 43 já foram testados, e o resultado surpreende |
| procurar onde algo mora | **Onde as coisas ficam** |

---

## Como o app foi construído

Em fases, cada uma entregando algo usável de ponta a ponta. **A ordem diverge do que seria
natural, e isso é a primeira decisão do projeto:** importar e manipular vieram *antes* de
desenhar, porque o objetivo era migrar resumos que já existiam em outros aplicativos — de nada
adiantaria uma caneta ótima num app que não abrisse o material.

| Fase | O que entrega | Estado |
|---|---|---|
| 0 | Setup, janela, instalador `.exe` validado | pronta |
| 1 | Canvas infinito, modelo, índice espacial, culling, `F3` | pronta |
| 1.5 | Lobby com miniaturas, salvar `.wbd`, `F1` | pronta |
| 2 | Importação de quadros exportados, conferida contra o motor de layout | pronta |
| 3 | Seleção, mover/redimensionar/girar, duplicar, excluir, camadas, undo/redo, copiar/colar | pronta |
| 4 | Caneta, marca-texto, lápis, borracha, cores e espessura | pronta |
| 4.5 | Formas, encaixe com guias, grade magnética, réguas | pronta |
| 5 | Texto, post-its e alertas | pronta |
| 5.5 | Borracha progressiva (apagar por peça) | pronta |
| 6 | Busca `Ctrl+F` | pronta |
| 7 | Imagens: colar, arrastar e recortar | pronta |
| 8 | Exportar PNG/SVG/PDF e autosave | pronta |
| 9 | Polimento de UI, temas e build final | **pronta** — mesclada em 14/08/2026 |
| 7.5 | OCR: o `Ctrl+F` acha texto dentro das imagens | **pronta** — 14/08/2026 |
| — | Busca cruzando **toda a biblioteca**, no menu principal | **pronta** — 14/08/2026, fora do plano original |

**A Fase 5.5 não estava no plano** — ela nasceu de usar o app. A borracha apagava o traço
inteiro, e isso não servia para corrigir um resumo; a fase **reverteu uma decisão da Fase 4**.
O mesmo aconteceu com a busca da biblioteca, que só fez sentido depois que o OCR indexou o
texto das imagens.

É um padrão que vale mais que qualquer roadmap: **as duas funcionalidades mais úteis deste
app não foram planejadas.** Apareceram porque alguém usou o que estava pronto e disse o que
incomodava.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # 156 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
npm run check:dist    # o MESMO auto-teste, dentro do .exe empacotado
```

Modos de diagnóstico, todos por variável de ambiente e nenhum gravando preferência:

```
QB_GPU=normal|compat|comp|swap|canvas|raster|dc|angle|off
                                  # escada de composição do B8 e do B18.
                                  # `normal` (GPU, nada aplicado) é o padrão
                                  # desde 06/10/2026. `compat` é a opção
                                  # "compatibilidade gráfica" de Configurações
                                  # (a SOMA de `comp` + `swap`; até 06/10 se
                                  # chamava `padrao`). Os outros são degraus
                                  # puros, para bissecção. QB_GPU manda na
                                  # opção gravada.
QB_ALPHA=1                        # devolve o canal alfa à camada estática (B18)
QB_DESYNC=1                       # `desynchronized` nos dois canvas (B18).
                                  # ATENÇÃO: introduz um piscar preto ao clicar
QB_BLUR=0                         # desliga TODO backdrop-filter (B18)
QB_FUNDO=off                      # tira a foto de fundo do menu principal
QB_THEME=light|dark               # força o tema desta execução
QB_SHOT=<arquivo.png>             # fotografa só a janela
QB_BENCH=<n>                      # medição de frame rate com n objetos
```

**O `check:dist` é novo e vale explicar por que existe.** O `selftest` mede o app servido
pelo Vite, e nada nele passa pelo empacotamento — asar, caminhos absolutos diferentes,
`isPackaged` verdadeiro, sem servidor de dev. Oito fases entraram entre a validação do
instalador na Fase 0 e a Fase 9, e nenhuma foi conferida do lado de lá.

Ele precisa de `npm run dist:dir` antes (é o executável que ele roda), e resolve duas
armadilhas que custaram tempo em 12/08/2026:


### A verificação de arrastar: como ela parou de medir a máquina

**"Arrastar 10.000 objetos selecionados fica acima de 30fps"** foi, por duas semanas, a
verificação que mais atrapalhou. Ela reprovava com o computador ocupado: em 04/08/2026 deu
**50–62 ms** porque o **CS2 estava aberto**, e em 14/08 reprovou na maioria das execuções
com o Discord e o Chrome ligados — sempre sem uma linha de diferença no código.

**A causa não era o teto. Era ela responder DUAS perguntas com um número só:**

| | |
|---|---|
| *"o código regrediu?"* | relativa — a única que um teste pode responder numa máquina compartilhada |
| [...] | absoluta — depende de quem mais está aberto no Windows naquele minuto |

Ela afirmava a segunda e era lida como a primeira. **Corrigida em 14/08/2026, com duas
mudanças de método:**

1. **O menor de três medições, e não uma.** Ruído só sabe somar — uma interrupção do sistema
   aumenta o tempo, nunca diminui. O menor de várias é a melhor estimativa do custo real, e
   uma amostra única é a pior.
2. **O teto acompanha a velocidade da máquina.** O `bbox` é matemática pura e já estava
   impresso ali como sinal de carga, para uma *pessoa* interpretar — a regra *"se o `bbox`
   subiu junto, é carga externa"* estava escrita neste arquivo. Agora quem aplica a regra é o
   teste: ele divide o medido pelo quanto a máquina está mais lenta que a de referência
   (`bbox` de **3,15**, medido em 09/08/2026 com 8 execuções). O fator só corrige **para
   cima** — numa máquina mais rápida, apertar o teto faria reprovar por ter melhorado — e
   para em 3×, senão uma máquina em colapso ganharia aprovação automática.

**O efeito, medido no mesmo dia e na mesma máquina carregada:**

| | Antes | Depois |
|---|---|---|
| Faixa observada | 25,7 – 49,2 ms | **26,1 – 27,5 ms** |
| Variação | 23,5 ms | **1,4 ms** |
| Reprovações | metade das execuções | nenhuma |

**E ela continua reprovando quando deve** — isso foi provado, não suposto. Com uma piora de
50% injetada de propósito no arraste, ela deu **FALHA em 38,4 ms**; removida a piora, voltou
a passar em 26,8. Sem esse passo, eu teria uma verificação que passa e nenhuma garantia de
que ela ainda serve para alguma coisa.

**A sensibilidade que sobra, dita com todas as letras:** com o normal em ~26,5 e o teto em
33, ela pega regressões acima de **~25%**. Uma piora de 10% passaria despercebida. É o preço
de um teto absoluto, e é deliberado: apertá-lo devolveria a instabilidade que acabou de sair.

**A lição que custou caro, e continua valendo para qualquer medição aqui:** duas reprovações
seguidas parecem sinal. Um A/B de **uma** execução contra **uma** não desfaz isso — se as
duas estiverem sob carga, ele confirma a conclusão errada com ar de rigor. Repetir e comparar
faixas é o que separa.

⚠️ **A outra verificação que ainda mede a máquina** é da Fase 6: *[...]*, teto de
16 ms. Ela é o que sustenta não haver índice invertido, e a linha do resultado traz a
repartição — em 04/08/2026: **4,0 ms por tecla, dos quais 0,9 ms é varrer tudo**. Se um
dia ela reprovar, olhe primeiro a varredura pura: se ela continuar perto de 1 ms, o
problema não é procurar, é montar os trechos, e índice nenhum resolve isso.

E, ao tocar em `Document`, `SpatialIndex`, no importador ou no **layout de texto**,
conferir a geometria contra o oráculo:

```
$env:QB_IMPORT = "C:\caminho\para\um-quadro-exportado.zip"
npm run dev
```

Deve sair **1.063 objetos**. Os números de referência depois da Fase 5:

| Tipo | n | pos_méd | pos_máx | tam_méd | tam_máx |
|---|---|---|---|---|---|
| PlainText | 642 | 0,3 | 80,1 | 84,9 | 734,5 |
| InkGroup | 345 | 0,0 | 0,2 | 0,0 | 0,3 |
| AzureImage | 36 | 0,0 | 0,1 | 0,0 | 0,0 |
| Note | 5 | 0,0 | 0,1 | 3,8 | 4,6 |

Tinta, imagem e post-it fecham em **≤ 0,2px de posição** — qualquer número maior ali é
regressão. **O texto é o caso com história** (leia antes de suspeitar de bug):

- O erro de *tamanho* caiu de 136,2 para 84,9 de média (máx. de 3.295 para 734) porque a
  caixa deixou de guardar o teto de quebra e passa a guardar o que o texto ocupou.
- O que sobrou é **limite de medição, não decisão**: o navegador monta a caixa de linha
  com a métrica da fonte que desenhou cada glifo, inclusive a substituta de um emoji
  (medido: 62px de caixa para fonte de 34px), e essa métrica não aparece no `measureText`
  do canvas.
- `pos_máx` de 80px vem dos **dois textos girados a 45°**: num objeto girado o AABB
  depende dos dois lados da caixa, então uma caixa mais estreita move os cantos. A origem
  do objeto continua exata.

Para conferir os dois temas, `QB_THEME=light` ou `QB_THEME=dark` manda no tema da execução
**sem gravar a preferência**. Ele soma-se aos outros modos em vez de substituí-los
(`QB_THEME=light QB_SHOT=... npm run selftest` é o que se usa), e existe porque antes disto
[...] dependia do que estava no `localStorage` da máquina — ou seja, não
era repetível.

Para ver renderização, `QB_SHOT=<arquivo.png> npm run selftest` fotografa **só a janela
do app** e deixa na tela a cena de conferência: seleção com alças, um traço de cada
variante, duas formas, as réguas ligadas, um objeto encostado noutro pelo encaixe, uma
caixa de texto com negrito, sublinhado e marcadores, um post-it com alerta, um buraco de
borracha no meio de um traço, a busca aberta com o achado destacado e uma imagem com o
recorte aberto (sombra, terços e alças) — tudo produzido pelas ferramentas de verdade. Atenção: com `QB_SHOT` a janela **não fecha
sozinha** — o processo fica aberto até você encerrá-lo.

**A foto espera o marcador de fim, e não um cronômetro** (mudou em 13/08/2026). Quanto o
auto-teste demora depende da máquina; com o cronômetro de 9 s a foto caía no meio da
execução — numa tentativa saiu a cena de carga de 4.000 objetos a 2% de zoom, que não mostra
nada do que se queria conferir. Acertar era sorte. O cronômetro (`QB_SHOT_DELAY`) continua
valendo onde não há fim que se possa ouvir: `npm run dev` puro e `QB_BOOT=hold`.

**A guia de encaixe não sai na foto**, e não é bug: ela existe só enquanto o botão está
pressionado, e um gesto deixado em aberto é desfeito pelo guarda de `blur` do
`ToolManager` assim que a janela perde o foco (comportamento certo — gesto pendurado não
pode sobreviver). Quem verifica a guia é a checagem numérica sobre `snapRect`; para vê-la
com os olhos, arraste um objeto perto de outro no app.

E, ao mexer em exportação, conferir os três formatos por terminal — o diálogo de salvar e
o `printToPDF` não passam pelo auto-teste:

```
$env:QB_EXPORT = "$env:TEMP\qb-export"; npm run dev
```


**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## O Electron subiu até o 43, e VOLTOU para o 33 — a escada inteira está medida

**O projeto está no `^33.2.1` (33.4.11), de propósito e por decisão de produto.** Quem ler
"Electron de 2024" e quiser subir: já foi feito, em 14/08/2026, e o resultado está aqui.
Não refaça a subida esperando outra resposta — refaça só se tiver um motivo *novo*.

**O item existia como conserto de raiz do B8** (o piscar de tela), sob a tese de que o app
era o único Chromium de 2024 numa máquina de 2026. A tese foi testada em três degraus:

| Electron | Chromium | O B8 com `QB_GPU=normal` |
|---|---|---|
| 33.4.11 (o de origem) | ~130, fim de 2024 | pisca |
| 41.0.0 | 146.0.7680.65, 2026 | **pisca igual** |
| 43.4.0 | o mais novo publicado | **pisca igual** |

**A idade do Chromium não é a causa, e isso agora é fato medido e não suspeita.** As duas
flags de repintura ficam. O que sobrou de suspeito está no [BUGS.md](BUGS.md), no B8 — e o
`QB_GPU=angle` (ANGLE por OpenGL, que troca Direct3D) **nunca foi testado**, apesar de estar
na escada desde 06/08.

**O que a subida mudou de verdade, medido com 4 execuções de cada lado:**

| | Electron 33 | Electron 41 |
|---|---|---|
| custo de desenho por tipo (traço, forma, post-it, texto) | faixas **sobrepostas** | faixas **sobrepostas** |
| "arrastar 10.000 objetos", com Discord e Chrome abertos | **reprovou 8 de 9** (31–49 ms) | **passou 5 de 5** (25,3–28,8 ms) |
| `bbox` (matemática pura) nas mesmas execuções | 4,0–9,3 | **3,2–3,5** |

**A primeira linha quase virou notícia errada.** A primeira execução no 41 deu 25–30% a
menos em tudo, e escrever isso teria sido o mesmo erro que este projeto já cometeu duas
vezes: repetindo, as faixas se sobrepõem e **não há ganho de desenho demonstrável**.

**A segunda e a terceira são o achado real**, e valem juntas: o `bbox` é matemática pura em
JavaScript — não passa por GPU, nem por composição, nem por vsync. Ele voltar para a faixa
normal **sob a mesma carga de fundo** que fazia o 33 disparar diz que o V8 e o agendador do
Chromium novo lidam melhor com máquina ocupada, e não que o app desenhe mais rápido. **É o
que se perde ao ficar no 33**, junto com as correções de segurança (o `npm audit` sai de 4
alertas no 43 para 18 no 33).

### Duas armadilhas que a subida encontrou, e que valem para a próxima tentativa

1. **Electron 42+ exige Node ≥ 22.12.0.** Com Node 20 o `npm install` morre em
   `ERR_REQUIRE_ESM`: o script de instalação faz `require()` de um `@electron/get` que virou
   só ESM. Ele subiu para o **Node 22.12.0** em 14/08 por causa disto, e o `engines` do
   `package.json` continua dizendo `>=20.18.0` — o que hoje é **frouxo, e não errado**,
   porque o Electron 33 instala nos dois.
2. **A faixa `^41` não é instalável em Node 20**, só a versão exata `41.0.0`: qualquer
   patch acima (até o 41.10.5) já traz o `@electron/get` novo. Se um dia voltar ao 41, ou
   trave a versão exata, ou esteja em Node 22+.

E a boa notícia da volta: **o Electron 33 instala sem problema no Node 22**, binário e tudo.
Subir o Node não fecha a porta de trás.

---

## A Fase 7.5, e o que ela virou

**Feita em 14/08/2026, e o motor não custou nada.** As três perguntas abaixo foram
respondidas por medição, e as respostas mudaram o tamanho da fase. Ficam registradas porque
explicam por que o código é do jeito que é.

| Pergunta | Resposta |
|---|---|
| De onde vem o motor | **Do próprio Windows** (`Windows.Media.Ocr`), com pt-BR já instalado. **0 MB no instalador**, contra dezenas de MB do Tesseract |
| Como o Electron o alcança | **PowerShell em lote**, não módulo nativo — o projeto não tem nenhuma dependência nativa e não ter é parte de por que ele compila em segundos |
| O que o texto vira | Campo `ocr` no próprio objeto de imagem, gravado no `.wbd`. Roda uma vez por imagem na vida do quadro |
| Quando roda | Em segundo plano, depois de o quadro estar na tela |

**Medido nas 36 imagens do resumo real:** 1,65 s no total, 46 ms de média, **30 imagens com
texto, 3.456 palavras**, zero erros. Da segunda abertura em diante, zero.

**E ela puxou uma funcionalidade que não estava no plano:** com o texto das imagens
indexado, a pergunta deixou de ser [...] e virou [...]. Daí a **busca da biblioteca**, no menu principal — 68 ms para
ler os três quadros, com um motor de busca só compartilhado com o `Ctrl+F` (`findIn`).

<details>
<summary>O plano original da fase, antes de as medições responderem</summary>

**Transcrever imagem em texto.** É a última funcionalidade que falta, e a única fase que
nunca começou. Foi adiada duas vezes de propósito: o objetivo do projeto é migrar os resumos
de outros aplicativos, e mover/desenhar/exportar vinham antes de ler.

**O que ela precisa responder antes de qualquer linha de código, e nenhuma tem resposta
hoje:**


**O que já está pronto e a fase pode usar:** `AssetStore` guarda os bitmaps, `PatchObjects` é
o comando genérico de conteúdo (foi ele que absorveu o recorte na Fase 7), a busca já varre
texto sem índice invertido, e o `selftest` sabe inserir imagem por arraste.

**E o teste de aceitação já existe:** as 36 imagens do *quadro de referência*. Se o `Ctrl+F`
achar uma palavra que só existe dentro de uma delas, a fase entregou o que prometia.

</details>

---

## A rodada de interface e texto — 20–21/09/2026

Ela nasceu de um uso real: montar resumos no app e esbarrar no que atrapalhava. Quase tudo
que apareceu estava em **texto** e em **interface**, e o registro completo dos defeitos está
no [BUGS.md](BUGS.md) (B19 a B23). Aqui ficam as decisões de projeto que sobraram delas.

**Texto deixou de escalar pelo `transform`.** Todo o resto do quadro escala pela matriz, e
para tinta e imagem isso está certo: o desenho aumenta. Texto não — esticar o desenho da
letra produz glifo condensado. O modelo passou a ser o do Microsoft Whiteboard: canto muda o
**corpo da fonte**, lado muda a **largura de quebra**, e a altura sai sempre do conteúdo. O
`ObjectPatch` ganhou `fontSize`, `autoHeight` e `align` por causa disso.

**Palavra maior que a caixa passou a ser partida.** Valia o contrário —
`word-wrap: normal`, o padrão do navegador —, escolhido para a importação reproduzir a quebra
do original. O que derrubou isso foi estreitar uma caixa à mão: a linha continuava inteira e
saía pela direita, e não havia largura nenhuma em que ela voltasse. Só acontece quando a
palavra não cabe nem numa linha inteira, então a quebra do quadro importado continua sendo a
do original.

**Duas barras viraram uma.** A fila de ferramentas era uma segunda barra flutuante. Duas
barras trazem dois fundos, duas sombras e duas bordas, competem pela mesma atenção e espremem
o quadro — que é o assunto — entre as duas. A fila entra na barra inferior por injeção
(`ViewportBar.mountTools`), e não por construção: quem monta os botões continua sendo o
`ToolBar`, que sabe de ferramenta, cor e espessura. Sem isso, um dos dois teria de aprender o
assunto do outro.


**O acabamento vitrificado é o único**, desde 21/09. Ele nasceu como modo, com interruptor na
barra e no lobby, e venceu o outro. A superfície é 100% transparente: o que faz a barra
existir são a refração (`feDisplacementMap` em `backdrop-filter`) e o aro de luz. A tinta
mudou de lugar — saiu da lâmina e entrou em **pastilhas atrás de cada controle**, porque sem
superfície nenhuma os ícones somem sobre um resumo denso.

> **A refração foi conferida de um jeito que vale registrar.** Sobre um gradiente liso ela é
> invisível, e isso levou à conclusão errada de que não funcionava — empurrar uma cor que
> muda devagar devolve quase a mesma cor. Trocando o fundo por **listras diagonais**, as
> listras aparecem visivelmente entortadas. O efeito só existe onde há detalhe atrás.

**O papel do quadro é escolhido na criação.** `prefs.background` existia desde a Fase 1, era
gravado pela importação e **nunca era lido**. Virou a cor do quadro na tela e no arquivo
exportado, no tema claro. Sete papéis, todos na mesma faixa de luminância (~0,80): escolher
papel não pode desfazer o conserto do B22.

**O aviso de "não salvo" trocou de forma.** Era um ponto ao lado do nome do quadro; o nome
saiu da barra (dizia "Quadro sem nome" quase sempre, ocupando a maior largura da fila), e o
ponto foi para o botão de salvar — onde leu como defeito, não como aviso, e saiu também. A
informação migrou para o diálogo de saída, que agora tem **três saídas** em vez de duas:
sair sem salvar, cancelar e **salvar e sair**. Antes, quem quisesse salvar — o desfecho mais
provável — tinha de cancelar, procurar o botão e clicar.

### Os ícones passaram a vir do Lucide


O [Lucide](https://lucide.dev) tem 2.112 ícones na mesma grade de 24, resolvidos
por gente do ofício. Trinta e três dos nossos quarenta e um vieram de lá.

**A licença foi verificada lendo o arquivo, e não um resumo.** ISC (Lucide) mais
MIT (os herdados do Feather), e a única obrigação das duas é esta:

> *"provided that the above copyright notice and this permission notice appear
> in all copies"*

Isso é **manter um arquivo de texto no repositório** — nada de tela de créditos,
nada de link, nada de pagamento. O texto está em
`src/renderer/assets/icones/LICENSE-lucide.txt`, copiado do pacote oficial.

> **O Flaticon foi avaliado e recusado, e o motivo não foi o preço.** No plano
> grátis ele exige crédito **visível** — uma tela de créditos dentro do app — e,
> o que pesa mais: este projeto é MIT e público. O nosso `LICENSE` promete a
> quem clonar o direito de redistribuir e sublicenciar; com arquivos de
> terceiros sob termos mais restritos lá dentro, ele estaria prometendo um
> direito que não temos para ceder. Daria para resolver com uma ressalva
> explícita no repositório, mas ISC e MIT custam **zero** disso.
>
> Não foi possível ler os termos do Flaticon na fonte: a página devolveu 403 e
> os termos redirecionaram para outro domínio. Recusar algo cuja licença não se
> consegue ler é a decisão conservadora certa.

**O que NÃO veio do Lucide**, e por quê:

- as **prévias de forma** (retângulo, elipse, triângulo, losango, linha, seta,
  preencher). Elas não são ícones de comando: são o desenho do objeto que vai
  nascer no quadro. Um triângulo de cantos arredondados prometeria um triângulo
  arredondado;
- os **modos da borracha** (apagar peça, apagar traço). Não há equivalente —
  essa distinção é deste app.

**A camada de corpo ficou.** O Lucide é monolinha puro; aqui cada ícone pode
ganhar um preenchimento em 16% atrás do contorno. Isso não é enfeite: com a
barra de vidro em 100% de transparência, contorno sozinho perde a forma sobre um
resumo denso, e o corpo segura a silhueta quando o traço perde contraste. Quem
tem corpo é escolha — **gesto** (desfazer, mais, alinhar) não tem, porque gesto
não tem dentro; **objeto** (post-it, cadeado, teclado) tem.

**E qualquer `.png` largado em `assets/icones/` com o nome de um ícone substitui
o desenho**, sem tocar em código. O arquivo é usado como **máscara**, e não como
imagem: o app pinta com a cor atual e o canal alfa do PNG recorta. Por isso o
ícone desenhado à mão continua herdando tema, destaque e a pílula branca, em vez
de exigir um arquivo por estado. A especificação está no `LEIA-ME.md` da pasta.

> **A folha de contato virou parte do método.** Ela renderiza todos os ícones
> lado a lado — grandes, no tamanho real de uso, sobre a pastilha e sobre a
> pílula de ligado. Quatro defeitos do conjunto antigo **só apareceram nela**,
> incluindo um `olhoFechado` que estava quebrado: as duas metades da pálpebra
> viviam num caminho único, coladas por um `M` no meio, e o
> `stroke-linejoin: round` ligava as pontas desenhando uma terceira curva. De
> longe virava um rabisco. Julgar ícone sem ver os quarenta juntos é chutar.

### A borracha: uma bandeira de canvas no lugar errado

Vale registrar porque a decisão é reaproveitável e o erro é fácil de repetir.

`willReadFrequently` num `getContext('2d')` parece uma otimização barata, e é — para quem
**lê** o canvas. Ela pede ao Chromium para manter o bitmap na CPU, porque um `getImageData`
num canvas de GPU obriga a trazer os pixels de volta a cada chamada.


**A regra que fica:** a bandeira pertence ao canvas que é lido, não ao canvas que é desenhado.
Quando os dois usos moram no mesmo módulo, são dois canvas, e não um com a bandeira do pior
caso. Depois da separação, o mesmo render custa **1,3–1,5 ms**.

A checagem que guarda isso é **binária de propósito** — ela pergunta se o canvas de desenho
está acelerado, e não quantos ms ele leva. Um teto em ms passaria numa máquina e falharia na
seguinte; a pergunta [...] tem a mesma resposta em qualquer PC.

O resto do caso — a fileira de bolas, que era um defeito **separado**, de continuidade de
rastro — está no [B24](BUGS.md#b24--a-borracha-apagava-em-bolas-e-travava-o-aplicativo).


**A regra que fica, e ela é mais geral que a borracha:** superfície intermediária se dimensiona
pelo que vai ser **visto**, não pelo que existe. Quando o custo de desenhar acompanha o tamanho
do objeto em pixel de tela, o zoom vira multiplicador de trabalho jogado fora.

A janela de visão não precisou entrar no `PaintContext` para isso. O `ctx` que chega ao painter
já carrega a matriz local → pixel físico montada pelo renderer, e invertê-la leva os quatro
cantos do canvas para o espaço local do objeto — inclusive com rotação, porque o AABB do
losango resultante contém tudo que aparece. Acrescentar um campo teria obrigado todos os
chamadores (quadro, miniatura do lobby, ladrilhos de exportação) a preenchê-lo corretamente,
e o dado já estava ali.

Essa guarda também afirma sobre **pixel**, e não sobre ms, pelo mesmo motivo da anterior — e
aqui com uma evidência concreta: rodada com o código antigo de volta, ela acusa 4,0016 MP
pedidos para uma tela de 1,23 MP, enquanto o render do cenário de teste marca 0,28 ms nos dois
casos. O tempo só explode num quadro de verdade; a área denuncia em qualquer máquina.

### O movimento virou preferência do app, e não do sistema

Vale registrar porque é uma decisão que **troca uma coisa por outra**, e não uma melhoria
pura.


**A decisão de produto:** o app anima por padrão, independente do Windows, com um interruptor em
Configurações no menu principal.

**O que se perde, dito com todas as letras:** o app deixa de atender sozinho quem pede menos
movimento ao sistema por sensibilidade vestibular. O que fica no lugar é um interruptor
visível na tela inicial — mais fácil de achar que a página de acessibilidade do Windows, mas
que **precisa ser encontrado**, e a preferência do sistema não precisava. Se algum dia isso
for revisto, o caminho é usar o valor do sistema como **padrão inicial** do interruptor, em
vez de ignorá-lo: atende os dois casos e não custa nada além de uma linha na inicialização.

### Um token num lugar só não serve se a LISTA estiver espalhada

O `--levanta` nasceu com um objetivo declarado no próprio comentário: [...]. E o número estava mesmo num lugar.

Só que a **lista de quem usa o número** foi espalhada por trinta regras `:hover`, uma linha de
`transform` de cada vez. O resultado, medido em 21/09: **seis controles interativos com hover
e sem levantar** — camadas, busca, segmentado, amostra de cor, escolha de forma e alerta.
Ninguém "decidiu" deixá-los de fora; eles só não estavam na cabeça de quem editou as outras.

**A lição:** centralizar o VALOR e espalhar a APLICAÇÃO resolve metade do problema e esconde a
outra metade. A lista agora vive num bloco único no fim do `app.css`, e a checagem do selftest
percorre o CSSOM exigindo duas coisas de treze seletores — que cada um tenha regra de levantar,
e que **nenhum** use valor cravado, porque valor cravado é exatamente o que escapa do
interruptor.

### O menu principal ganhou fundo, e a rolagem teve de mudar de lugar

Registrado porque a mudança estrutural parece gratuita e não é.

Para uma imagem de fundo ficar **parada** enquanto a lista corre, o caminho
óbvio é `background-attachment: fixed`. Num elemento que rola, isso obriga o
Chromium a repintar o fundo a cada frame — e este projeto tem histórico
documentado de rastro ao rolar (B8 e B18). Então a raiz `.qb-lobby` virou um
palco que **nunca rola** (`overflow: clip`) e a rolagem desceu para um filho.
Pintado num elemento parado, o fundo é fixo de graça: sem `attachment: fixed`,
sem elemento extra, sem `z-index`.

Medido numa janela à parte: o palco fica com `scrollTop` 0 depois de rolar
300 px no filho.

**A foto substitui as manchas ambiente, e não soma com elas.** As três manchas
radiais existem para uma coisa só — dar ao `backdrop-filter` um gradiente para
refratar. Uma foto faz isso com sobra. Mantidas por cima, deixariam de ser [...] e passariam a ser um véu de azul, roxo e verde sujando a
imagem que o usuário escolheu.

**O véu virou token.** Os 22% de tinta do lobby estavam cravados na regra. Sobre
gradiente 22% basta; sobre fotografia não, porque foto tem detalhe e contraste
local. Agora é `--veu-lobby`, e o escuro pede mais que o claro (54% contra 46%)
porque uma galáxia é luz **pontual** contra preto: o contraste local varia muito
mais do que numa praia difusa. A lista de quem recebe tinta já morava num lugar
só; agora o número também.

### A imagem do usuário trafega por bytes, não por caminho

A CSP do aplicativo (`renderer/index.html`) permite `data:` e `blob:` em imagem,
mas **não `file:`** — e `webSecurity` está ligado com `sandbox: true`. Um
caminho de arquivo não teria como ser exibido. Então o IPC devolve os bytes.

**Como `ArrayBuffer` → `Blob` → `blob:`, e não data URL.** O precedente do
projeto é data URL (o preview dos cards, montado no main), e está certo *lá*:
dezenas de imagens de 20 a 60 KB. Aqui é uma imagem só, de vários megabytes, e a
conta inverte — base64 infla 33%, atravessa o IPC como string, fica viva dentro
do CSSOM e é reanalisada a cada troca de tema. Um `blob:` deixa no CSS uma URL
de ~50 caracteres e é **revogável**, que é como a memória volta.

Três decisões de contorno que valem além deste caso:

1. **Copiar o arquivo, não guardar o caminho.** Guardar caminho faria o fundo
   sumir sem aviso no dia em que ele movesse a foto, e romperia a autocontenção
   da pasta `Creation Board`.
2. **O renderer nunca manda caminho — só o tema.** Não há como a interface pedir
   "copie" ou "apague" um caminho arbitrário do disco.
3. **O tipo vem da assinatura dos bytes, não da extensão.** Um arquivo que mente
   vira erro legível em vez de imagem quebrada silenciosa, e o `blob:` nunca sai
   com um mime que não corresponde ao conteúdo.

### O custo em performance foi medido

A pergunta era direta: [...] `QB_BENCH=4000`, três execuções, tema escuro:

| Fase | fps | frame | **render** |
|---|---|---|---|
| zoom 100% | 144,0 · 142,4 · 144,0 | 6,95 · 7,02 · 6,95 ms | 0,90 · 1,10 · 0,90 ms |
| zoom 40% | 135,0 · 128,3 · 140,8 | 7,41 · 7,80 · 7,10 ms | 2,00 · 2,10 · 1,70 ms |
| ajustado à tela | 21,2 · 19,6 · 22,0 | 47,2 · 51,0 · 45,4 ms | 14,3 · 15,9 · 14,6 ms |

**A coluna que responde é `render`** — o tempo de desenhar o quadro. Ela ficou em 14,3–15,9 ms
na fase pesada, contra 14,0–14,5 ms medidos antes da rodada: dentro da dispersão entre
execuções da própria rodada (1,6 ms de espalhamento em três amostras). **Não há custo de
desenho mensurável.**

E isso é esperado pelo desenho do sistema: as barras são compostas pela GPU e só mudam quando
o mouse passa por elas; o `backdrop-filter` trabalha sobre uma faixa de ~1000×50 px. A única
mudança que toca o caminho quente é a quebra por palavra no layout de texto — e o layout é
cacheado por `id:rev`, então só roda quando o texto muda.

> **A ressalva honesta é a do B8, e ela vale aqui também:** três amostras de um lado só não
> estabelecem ausência de custo com rigor. O que se pode afirmar é que a diferença, se
> existe, é menor que o ruído entre execuções na mesma máquina.

---

## Quanto custa uma foto de fundo grande — medido em 21/09/2026

A pergunta foi direta: mandar as fotos do Unsplash no tamanho original (14 e 21
megapixels) é problema? E o critério que ele deu foi o certo — **nitidez e desempenho**,
não tamanho de instalador.

Eu tinha respondido com aritmética de memória e um receio de engasgo na troca de tema.
**A medição desmontou o receio.** Instrumento em `scratchpad/medir/` (fora do
repositório): Electron próprio, página gravada em disco e carregada por `loadFile`,
janela de 1600×900, três execuções.

| | megapixels | bitmap | decode frio | maior frame na troca | nitidez |
|---|---|---|---|---|---|
| praia original 4621×3072 | 14,2 MP | 57 MB | 80–90 ms | 7,1 ms¹ | — |
| praia 2560×1702 | 4,4 MP | 17 MB | 32 ms | 7,1 ms | igual ou um fio melhor |
| galáxia original 5949×3518 | 20,9 MP | 84 MB | 138–139 ms | 7,1 ms | — |
| galáxia 2560×1514 | 3,9 MP | 16 MB | 43–48 ms | 7,1 ms | igual |

¹ Deu 20,9 e 13,9 ms em duas das três execuções, mas **a praia original é sempre o
primeiro caso do laço** e come o aquecimento. A galáxia original, que é 47% maior, deu
7,1 ms nas três. Não é efeito de resolução.

**O que a medição mostrou, e é o ponto principal:** o Chromium decodifica imagem numa
thread própria. Os 138 ms de decode da galáxia original **não aparecem como engasgo** —
o compositor segue em 7,1 ms por frame, que é o intervalo do monitor desta máquina. Pelo
critério do desempenho, a foto original não custa nada que o usuário sinta, e ele estava
certo.


**Conclusão: 2560 de largura, e o motivo mudou.** Não é "o original engasga", que é falso
e medido. É que o original cobra 3,5–5× o bitmap e 2,5–3× o trabalho de decodificação
**para entregar exatamente a mesma imagem na tela**. O teto continua, o argumento é que
ficou honesto.

**Onde isto deixaria de valer:** num monitor a `dpr` 2 a janela pediria ~3168 px físicos e
o 2560 passaria a subir de escala. Esta medição é `dpr` 1, que é a máquina de teste. Se ele
trocar de monitor, a conta se refaz.

**Duas armadilhas do instrumento**, as duas registradas em "Armadilhas de desenvolvimento", no fim deste arquivo: o ambiente
traz `ELECTRON_RUN_AS_NODE=1`, e com ela o binário do Electron roda como Node puro e
`require('electron')` não resolve; e `capturePage` atrasou uma imagem mesmo com os dois
`requestAnimationFrame` de espera — a galáxia saiu byte a byte igual à praia anterior. A
correção foi fazer o instrumento se conferir sozinho: fotografa até o quadro **mudar**.

---

## O painel de vidro do lobby não custou nada — medido em 21/09/2026

> **Esta medição deixou de valer no dia seguinte.** Ela foi feita com a tela
> composta pela GPU; em 22/09 o B18 passou a composição para a CPU, e com isso o
> mesmo painel derrubou o menu para **14 quadros por segundo**. Ver a seção
> seguinte. O registro abaixo fica como estava, porque o que ele mediu era
> verdade *naquela* configuração — e o erro foi não refazê-lo quando ela mudou.

O plano da Parte 2 marcou isto como **o maior risco de toda a repaginação**: um
`backdrop-filter` com `feTurbulence` numa área quase de tela cheia é a família de
causa do B8. Havia um plano B escrito — dar ao painel um `--chrome-blur-liso`,
sem o deslocamento, assumido por escrito. **Ele não foi necessário.**

Instrumento em `scratchpad/medir/painel.{html,js}`, fora do repositório. A página
monta o DOM do lobby com as classes reais e **carrega a folha de estilo
construída pelo Vite** — copiar o CSS para o instrumento mediria uma cópia, e
bastaria uma divergência de valor para o número deixar de dizer respeito ao app.
Rola 60 passos por caso e mede o intervalo entre frames. Três execuções.

| tema | cards | desfoque | painel | rolagem | mediana | pior | frames > 25 ms |
|---|---|---|---|---|---|---|---|
| claro | 5 | ligado | 615/835 | não rola | — | — | 0 |
| claro | 40 | **ligado** | 2035/835 | 1420 px | **7,0 ms** | 13,9–20,7 | 0 |
| claro | 40 | off | 2035/835 | 1420 px | **7,0 ms** | 13,9–34,7 | 0–1 |
| escuro | 40 | **ligado** | 2035/835 | 1420 px | **6,9 ms** | 7,1 | 0 |
| escuro | 40 | off | 2035/835 | 1420 px | **6,9 ms** | 7,1 | 0 |

6,9–7,0 ms é o intervalo do monitor desta máquina. **A mediana é idêntica com o
desfoque ligado e desligado**, nos dois temas.

O dado que fecha a questão não é a mediana, é um acidente da rodada 2: **o pior
frame de toda a medição (34,7 ms) aconteceu com o desfoque DESLIGADO.** Se a
lâmina custasse, isso não poderia acontecer. Os "piores" variam de 7 a 35 ms sem
correlação nenhuma com o filtro — é ruído de agendamento, e não custo.

A coluna `filtro` do instrumento existe por desconfiança de instrumento: ela lê o
`backdropFilter` computado do painel em cada rodada. Um número bom medido com o
desfoque desligado por engano não valeria nada, e essa é a forma mais fácil de
essa medição mentir.

**Por que provavelmente saiu de graça, e o que isso ensina:** a troca da Parte 2
foi uma por outra — o painel entrou na lista de vidro e **o `.qb-card` saiu**.
Antes, um lobby com quarenta quadros eram quarenta `backdrop-filter`, cada um
obrigando a uma leitura separada do fundo. Agora é **um**. A área cresceu e o
número de passes despencou, e é o número de passes que pesa. A decisão já estava
escrita no `app.css` sob [...]: a lâmina desfoca, os
controles são objetos pousados nela.

> **A ressalva honesta é a mesma do B8:** três execuções numa máquina não
> estabelecem ausência de custo com rigor. O que se pode afirmar é que a
> diferença, se existe, é menor que o ruído entre execuções — e que num teste
> desenhado para encontrá-la ela não apareceu.

**Armadilha do instrumento, que custou uma rodada:** a primeira versão contava 61
frames e só terminava neles. Se cada frame custasse um segundo — que é
exatamente o desastre procurado — ela nunca terminaria, e "muito lento" ficaria
indistinguível de "o instrumento travou". Foi o que pareceu acontecer na
primeira execução, que pendurou nos 40 cards. Com um orçamento de tempo de
**parede** a lentidão vira número em vez de silêncio; com ele, as três execuções
seguintes passaram sem encostar no orçamento. (A causa provável do travamento
original é oclusão da janela parando o `requestAnimationFrame`, e não custo.)

---

## O painel de vidro CUSTOU, sim — pela CPU. Medido em 24/09/2026


A medição de 21/09 (seção anterior) tinha sido feita com a composição pela GPU.
Em 22/09 o B18 fez a composição pela CPU virar o padrão, e ninguém refez a
medição do painel. Instrumento novo, **dentro do repositório** desta vez:
`QB_BENCH_LOBBY=1` (`src/renderer/dev/lobbyBench.ts`), que abre o menu de
verdade com `QB_BOARDS` apontando para seis cópias e mede o intervalo entre
`requestAnimationFrame` em três cenas: parado, um card por vez levantando como no
hover, e o arrasto real da Parte 4 — cancelado com Esc, nada é gravado.

| composição | desfoque | parado | levantar | arrastar |
|---|---|---|---|---|
| **CPU (padrão)** | **ao vivo** | 144 q/s | **14,4** | **13,9** (pior quadro 167 ms) |
| CPU | desligado (`QB_BLUR=0`) | 144 | 135,7 | 103,4 |
| GPU (`QB_GPU=normal`) | ao vivo | 144 | 141,9 | 143,3 |
| GPU | desligado | 144 | 143,6 | 143,0 |

**A causa:** o modo padrão soma a composição pela CPU (B18) com a repintura da
tela inteira a cada quadro (B8). Com as duas, o `backdrop-filter` de tela cheia
do painel é refeito na CPU a cada quadro em que qualquer coisa se mexe — cerca de
70 ms por quadro. Parado não custa nada, e foi por isso que só apareceu mexendo.

**A saída, decisão de produto entre três com os números na mesa:** o que está atrás do
painel é uma foto PARADA, então ela é desfocada **uma vez**, pequena (480 px), num
canvas (`src/renderer/ui/vidroPronto.ts`), e o painel a pinta alinhada com o
fundo por `background-attachment: fixed`. As outras duas eram tirar todo
desfoque do menu (103–136 q/s, sem vidro) e voltar à composição pela GPU (vidro
inteiro a 143 q/s, mas o fantasma do B18 no zoom volta).

| vidro | levantar | arrastar | arrastar de dentro da janela de pasta |
|---|---|---|---|
| ao vivo (antes) | 14,4 | 13,9 | — |
| **pronto** (duas rodadas) | **92,8–101,9** | **87,7–99,7** | **86,8–93,0** |

Com as animações da Parte 5 ligadas (duas rodadas, mesmo dia): levantar
112–113, arrastar 98–99, **a janela abrindo e fechando a cada 400 ms 105–106**,
arrastar de dentro da janela 92–94 q/s. As animações não trouxeram a lentidão de
volta.

O pior quadro caiu de 167 ms para 14–28 ms. **O preço assumido:** o painel perde
a leve ondulação de refração (`url(#qb-refracao)`), que é um deslocamento
calculado AO VIVO sobre o que está atrás. Botões e busca mantêm o vidro inteiro —
são pequenos, e o que sobra de custo até os 144 vem em parte deles.

**Um defeito que só a captura pegou:** a primeira versão pôs a tinta
(`--veu-lobby`, uma **cor**) numa camada do meio do `background`. Cor só é aceita
na última camada; a declaração inteira ficou inválida, o painel ficou sem fundo,
e o que se via era a foto nítida do palco por trás. O número de desempenho
parecia ótimo justamente porque não havia nada sendo desenhado. Hoje há uma
guarda no selftest que lê o `background-image` calculado com o vidro pronto e
exige a tinta **e** a foto.


### A segunda rodada: ~100 → 144 q/s, e o atraso que a contagem não via (30/09/2026)


| cena (CPU, vidro pronto) | antes | `QB_BLUR=0` | GPU | **depois** |
|---|---|---|---|---|
| levantar | 99,5 | 144 | 144 | **142,7–143,9** |
| arrastar | 101,3 | 142,6 | 141,3 | **143,3** |
| abre/fecha a janela | 71,6 | 139,8 | 141,9 | **143,2–143,6** |
| arrastar da janela | 91,3 | 135,6 | 142,6 | **135,6–136,0** |

**A causa:** `QB_BLUR=0` levava tudo a 144, e o painel já não desfocava — sobrava
o `--chrome-blur` dos **botões do cabeçalho e da busca**, que tem o deslocamento
de refração `url(#qb-refracao)`, o filtro mais caro que há na CPU. A nota da
rodada anterior ("são pequenos") estava errada. **A saída:** o mesmo vidro
pronto do painel, nos dois. Mesmo preço: perdem a ondulação, mantêm desfoque e
cor. Conferido por captura nos dois temas.

**E um atraso que nenhum q/s mostra:** o fantasma é clone do card, e herdava do
`.qb-card` a `transition: transform 0.12s` do levantar. Cada posição nova do
mouse virava uma animação de 120 ms, e o fantasma andava sempre **atrás** do
cursor. `transition: none` nele, guardado no selftest nos níveis ligado e
máximo (a mola do máximo vazaria para ele pelo mesmo caminho).

**O borrão discreto do painel (mesmo dia, decisão de produto: [...]).** O vidro pronto passou de 480 px com raio 4 (~12 px de borrão na tela)
para 1440 px com raio 3 (~3 px), e a tinta do painel caiu para 26% no claro e 30%
no escuro. A primeira medição parecia uma queda (claro: parado 114, abre/fecha
99) — e o borrão ANTIGO, medido em seguida, também caiu para 85 parado: era a
máquina ocupada (Chrome e Discord), e não o painel. Refeita com três rodadas
alternadas de cada e olhando a **mediana**:

| cena (claro) | 480 px (antigo) | 1440 px (novo) |
|---|---|---|
| parado | 144,0 | 144,0 |
| arrastar | 143,3 | 143,3 |
| abre/fecha | 135,7 | 131,5 |
| da janela | 136,3 | 137,0 |

Empate. O custo de desenhar é o mesmo (são os mesmos pixels na tela); a imagem
pronta maior custa memória uma vez (~5,5 MB), e não por quadro. **Lição de
método:** com o app de teste ou outros programas pesados abertos, uma rodada só não
distingue custo de ruído — alternar as versões e comparar medianas.

**O nível máximo de animações**, medido junto (`QB_ANIM=max`): parado,
levantar e arrastar a **144 cravados** nos dois temas — o fantasma vivo tem
camada própria (`will-change`) e não repinta card e sombra a cada quadro.
Abrir e fechar a janela a cada 400 ms fica em **130**, porque as animações de
420 ms se sobrepõem; no uso normal elas não se cruzam.

---

## O quadro aberto: arrastar e zoom rápido — medido em 30/09/2026


| gesto | antes | depois |
|---|---|---|
| arrastar | 59–61 q/s · pior 42 ms · desenho 12 ms | **68–71 q/s** · pior 28 ms · desenho **0,3 ms** |
| Ctrl+roda rápido | 25 q/s · pior 153 ms · 2,7 s de tarefas longas | **63–66 q/s** · pior 28 ms · **nenhuma** |

As duas correções estão no [BUGS.md](BUGS.md) (**B31** e **B32**). O que fica registrado aqui é
o que elas **não** fazem, e por quê:

- **O teto agora é a composição pela CPU.** Um único `fillRect` por quadro, sem mais nada, já
  fica em 57 q/s na janela cheia: qualquer mudança no canvas obriga a janela inteira a ser
  recomposta por software (~17 ms). A composição pela GPU arrasta a ~67 q/s, mas é ela que traz
  de volta o fantasma do B18 — **na máquina de teste**: no mesmo dia o build com GPU rodou limpo em
  outros computadores (ver o fim do B18). Trocar o padrão é decisão de produto, e não foi feito.
- **O desfoque da barra quase não pesa** no quadro (89 contra 95 q/s com `QB_BLUR=0`): ficou.
- **A camada de cima vazia custa ~14 q/s** e não foi mexida. A saída medida embrulhava as
  operações de pintura do canvas; foi desfeita por ser invasiva (ver o B32).
- **Com outros programas pesados abertos**, a bancada mede a máquina: uma rodada com um jogo
  aberto deu 40 q/s para o mesmo código que deu 89 sem ele. Comparar sempre na mesma
  execução — por isso a bancada mede o arrasto também com o caminho antigo
  (`arrastar sem deslizar`).

---

## Decisões que não estão óbvias no código

0. **NADA DE NUVEM. Decidido em 14/08/2026, com a alternativa toda avaliada.** foi perguntado
   se dava para ligar uma pasta do Google Drive ao app, e a resposta foi levantada inteira
   antes de decidir. **Não é para reabrir isto**, a menos que ele peça.

   A integração por API do Drive é um **subsistema, não uma funcionalidade**: projeto no
   Google Cloud, OAuth de aplicativo instalado, renovação de token (que expira a cada 7 dias
   sem passar pela verificação do Google), e — a parte cara — semântica de sincronização:
   mesmo quadro alterado em dois lugares, offline, queda no meio da gravação. Maior que
   qualquer fase que este projeto teve, e contra a premissa escrita no `wbdFile.ts`.

   O **caminho barato existia** e também foi recusado: o Google Drive para computador monta
   o Drive como pasta, e uma junção do Windows (`mklink /J`) apontaria a biblioteca para lá
   sem uma linha de código — e com segurança, porque **a gravação já é atômica** (`.tmp` +
   rename, `wbdFile.ts`), então o cliente de sincronização nunca vê um `.wbd` pela metade.

   **Dois motivos concretos derrubaram até esse:**
   - **Sincronizar não é backup.** O Drive replica corrupção e apagamento com a mesma
     fidelidade. As cópias manuais de teste são backup de verdade; o Drive seria só uma segunda
     cópia do estado atual.
   - **O autosave regrava o arquivo inteiro** (3 s parado, 30 s no máximo). O *quadro
     de referência* tem 4,7 MB: uma tarde de trabalho seriam dezenas de re-envios completos, e
     palavras do teste — [...].

   **O que fica no lugar:** o app continua **local e offline**, e mover quadro é assunto de
   importar/exportar arquivo.



<details>
   <summary>A decisão anterior, que esta substitui</summary>

   **A pasta de quadros continua `C:\Resumos-quadrobranco`** mesmo com o app renomeado
   de QuadroBranco para Creation Board. Trocar o nome faria os resumos já salvos sumirem
   do lobby. É deliberado.

   </details>


19c. **Medir desenho pelo rAF mente, e há um caminho que não mente.**
    `App.renderNowForMeasurement()` desenha a camada estática na hora e devolve o custo. O
    rAF erra em dois casos comuns: **janela encoberta** (o Chromium para de entregar frames,
    e `backgroundThrottling: false` não cobre isso — em 12/08/2026 o `QB_BENCH` devolveu
    `0.0 fps` em duas das três fases) e **vsync** (esperar o frame soma a espera do monitor
    ao trabalho). Toda verificação de custo de desenho passa por aqui.

19d. **O cache de rasterização vale para texto e post-it, e NÃO para traço e forma.**
    Medido, não deduzido: colar mil bitmaps custa 6,3–7,0 ms e desenhar mil traços custa
    6,4–6,7. O custo que domina é **fixo por objeto**, e o bitmap paga esse custo igual. O
    ganho em texto vem de desenhar texto do zero custar ~200 ms por mil — fator 30, não de
    colar ser barato. O cache é um `WeakMap` chaveado pelo próprio objeto: como toda mutação
    o substitui, a invalidação sai de graça, sem string de chave e sem LRU para manter.

20b. **A tela de abertura mora no `index.html`, e não num módulo.** Ela precisa estar pintada
    no primeiro frame, antes de qualquer CSS ou JavaScript. Não adia nada — sai quando a
    biblioteca está listada (642 ms medidos), sem tempo mínimo. A marca é a logo de verdade,
    embutida por `npm run boot-logo`; o fundo é `#060912`, a cor **exata** do fundo do
    arquivo, que é opaco. Os modos de verificação a removem na hora, senão ela intercepta os
    eventos do auto-teste. `QB_BOOT=hold` a segura para o `QB_SHOT` fotografá-la.

19. **Exportar reaproveita os painters no PNG e NÃO no SVG.** No PNG é o mesmo
    `paintObject` da tela — dois renderizadores divergiriam na primeira funcionalidade
    nova. No SVG isso é impossível (os painters falam canvas), então o que se reaproveita
    é o que decide aparência: layout de texto, adaptador de cor, constantes do post-it.
    Duas perdas assumidas: pressão do lápis vira espessura média, e texto sai como
    `<text>` (dependente da fonte de quem abrir, mas selecionável).
20. **O autosave só grava quadro que já tem caminho, e nunca com caixa de texto aberta.**
    A regra mora em `features/storage/autosave.ts`, separada de quem grava, porque um
    teste que gravasse de verdade encheria a pasta de quadros a cada execução.
21. **Funcionalidade nova entra com cobertura no `selftest`.** Ele despacha eventos de
    ponteiro e teclado no app real, então pega regressão de fiação, não só de matemática.
    Foi ele que achou, na Fase 5, um `commit()` que lia `#isNew` **depois** de fechar o
    editor — toda caixa nova virava "edição" de um objeto inexistente. Armadilha ao mexer
    nele: se deixar o quadro marcado como sujo, o guarda de `beforeunload` recusa o
    fechamento e a execução pendura — por isso existe `App.markClean()`, e por isso cada
    bloco roda dentro de um guarda que transforma exceção em FALHA.

---

## Onde as coisas ficam

```
src/renderer/
├─ core/        Document, SpatialIndex, Camera, Scheduler, History, Selection
├─ commands/    um comando por mutação — é a base do undo/redo
├─ tools/       Tool, ToolManager, SelectTool, DrawTool, EraserTool, ShapeTool,
│               TextTool, NoteTool, CropTool (modo, não fica na barra), DrawStyle
├─ features/
│  ├─ selection/  hitTest, frame, transformOps, actions, clipboard
│  ├─ snapping/   snap (guias de alinhamento + grade)
│  ├─ search/     busca por texto, sem índice invertido (ver a medição)
│  ├─ export/     exportBoard (PNG, reusa os painters) e exportSvg (não reusa)
│  ├─ text/       TextEditor (contentEditable), spans (DOM ↔ RichSpan)
│  ├─ import/     leitor de quadros exportados
│  ├─ images/     AssetStore, insert (colar e arrastar arquivo)
│  └─ storage/    boardIO, autosave (a regra, separada de quem grava)
├─ render/      Renderer (estática + overlay), painters (+ erase: máscara da borracha),
│               text/layout, SelectionOverlay, SnapGuides, Rulers, PinnedNotes,
│               SearchHighlight, CropOverlay
├─ ui/          ToolBar, SearchBar, Lobby, ViewportBar, ContextMenu, ShortcutsModal,
│               DebugPanel, LayersPanel (M8)
└─ dev/         selftest, layoutOracle, importCheck, exportCheck, stress
                ← ferramentas de medição
```

**Atalhos são registro único:** `src/renderer/shortcuts.ts` alimenta ao mesmo tempo a
tela de ajuda (`F1`) e o despacho de teclas. Se o atalho aparece na ajuda, ele funciona.
Adicionar atalho é adicionar linha lá, nunca escrever o texto da ajuda à mão.

**O `Scheduler` tem dois níveis de sujeira:** `invalidate()` redesenha conteúdo +
overlay; `invalidateOverlay()` só o de cima. Gesto em andamento usa o segundo — é o que
mantém desenhar barato num quadro cheio.

---

<!-- As tres secoes abaixo vieram do ponto de retomada de desenvolvimento
     (docs/nova-versao/CONTINUAR.md), que saiu do repositorio na versao 1.1.0 junto
     com os outros relatorios de trabalho. Estas ficaram porque o codigo as cita:
     "armadilha N" nos comentarios aponta para a lista daqui. -->

## Decisões de produto da versão 1.1 — não reabrir sem motivo novo

| Questão | Decisão |
|---|---|
| Imagens de fundo | **Fotografias do Unsplash**, a 2560 de largura (Sean Oulashin e Felix Wegerer). Entram sob a **Licença Unsplash**, e não sob a MIT — a procedência está por arquivo no `assets/fundos/LEIA-ME.md`. Trocar é substituir o arquivo mantendo o nome; nenhuma linha de código muda. |
| Pastas | **Índice no app**, não subpastas reais no disco. Arrastar nunca move arquivo. Clicar numa pasta abre uma **janela** sobre a tela principal (desde 24/09 — antes trocava a tela). Dentro dela, o X **só tira da pasta**. |
| Fantasma ao dar zoom (B18) | Contornado por **composição pela CPU**, que foi o padrão de 21/09 a 06/10. É contorno, não causa encontrada — e em 30/09 ficou confirmado que o defeito é **da máquina de teste**: o build com GPU e sem correções não mostrou nada em dois outros computadores. **Desde 06/10 a GPU é o padrão** (arrastar 56 → 144 q/s, zoom rápido 40 → 77 q/s no quadro de teste), e o contorno virou a opção **"Compatibilidade gráfica"** de Configurações (`src/main/graficos.ts`), que vale ao reabrir e que se liga no PC de teste. **Custo no menu, achado em 24/09:** o desfoque ao vivo do painel ia a 14 q/s — resolvido com o vidro pronto, sem mexer no B18. |
| "Restaurar padrão" | Volta para a foto que vem com o app, não para o fundo sem imagem. |
| Movimento | O app anima por padrão, independente do Windows. Toda animação nova tem de passar por `[data-anim='off']`. |

---

## Armadilhas de desenvolvimento — já custaram tempo, não repetir

**Do instrumento de captura** (as três me custaram três tentativas):

1. Página `data:` tem **origem opaca** e o Chromium recusa qualquer sub-recurso
   `file://` a partir dela. Para sonda com imagem, gravar um `.html` e usar
   `loadFile`.
2. `capturePage` devolve o **último frame composto**. Trocar `data-theme` e
   fotografar em seguida entrega o frame **anterior** — a captura "escura" saiu
   com a tela clara. Esperar dois `requestAnimationFrame` antes.
3. As imagens precisam de `decode()` **antes** da primeira captura.

**Do ambiente:**

10. O ambiente traz **`ELECTRON_RUN_AS_NODE=1`**. Com ela ligada,
    `node_modules/.bin/electron script.js` roda como **Node puro** — não abre
    janela e `require('electron')` falha com `MODULE_NOT_FOUND`, o que parece
    instalação quebrada e não é. Rodar com `env -u ELECTRON_RUN_AS_NODE`.
11. `capturePage` atrasa **mais** do que os dois `requestAnimationFrame` da
    armadilha 2 dão conta: a captura da galáxia saiu byte a byte igual à da
    praia anterior, e o único sinal foi os dois PNG terem o mesmo tamanho. Não
    confiar em espera fixa — fazer o instrumento **se conferir sozinho**,
    fotografando até o quadro mudar em relação ao anterior.


**Da leitura de cor pelo CSSOM** (custou uma rodada inteira de selftest):

9. **Não leia cor PINTADA numa verificação — leia o token.** Esta armadilha foi
   registrada de manhã com a conclusão *oposta*, e a tarde a derrubou; fica o
   caminho inteiro porque ele é a lição.

   Primeiro apareceu que `color-mix(in srgb, …)` não volta como `rgba(r,g,b,a)`
   e sim como `color(srgb r g b / a)`, com o alfa depois de uma barra. Escrevi um
   `alfaDeCor()` que entendia os dois formatos e conclui que ler a cor pintada
   era o jeito certo, porque [...].

   Horas depois a mesma verificação passou a reprovar devolvendo o **mesmo valor
   nos quatro estados**, serializado em **`oklab(...)`** — que não existe em
   lugar nenhum do CSS deste projeto. `oklab` é o espaço que o CSS usa para
   **interpolar** cor: a leitura estava pegando um valor no meio do caminho.

   **Ler cor pintada expõe a verificação ao instante em que ela acontece**, e
   nenhuma quantidade de formatos suportados conserta isso — foi por isso que
   `alfaDeCor()` foi removida em vez de ganhar um terceiro formato.
   `getComputedStyle(raiz).getPropertyValue('--token')` devolve a declaração com
   os `var()` já substituídos, sem pintar nada e sem instante. Compare o
   **número** de dentro dela.

   Corolário de diagnóstico: quando uma verificação de CSS reprovar, inclua na
   mensagem **o que os atributos da raiz realmente tinham** na hora da leitura.
   Sem isso não dá para distinguir [...] de [...],
   e as duas mandam quem investiga para arquivos diferentes.

**Do fluxo de trabalho** (as duas de 22/09/2026):

12. **Não desfaça uma quebra proposital com `git checkout` em arquivo que ainda
    não foi commitado.** Ao conferir uma guarda ao contrário no `preload`, o
    `checkout` devolveu o arquivo à versão commitada — levando junto a edição
    nova que era o objeto do teste. Em arquivo não versionado ainda, desfazer é
    pela substituição reversa.
13. **Um script de verificação tem de sobreviver ao módulo que ele testa.** O
    `check-pastas.mjs` morria quando `lerIndice` lançava: a exceção matou a
    execução no meio, três casos não rodaram, e o relatório saiu com duas falhas
    e **sem a linha final** — parecia que as outras guardas não pegavam nada.
    Ganhou um `caso()` que transforma exceção em FALHA, mesmo desenho do
    `block()` do `selftest`. Todo `check:*` novo nasce com isso.

14. **O app mantém um `.qb-overlay` no DOM o tempo todo** — a tela de atalhos
    (`ShortcutsModal`), montada e escondida. Teste que abre diálogo e procura
    `document.querySelector('.qb-overlay')` acha **esse**, clica no lugar
    errado e deixa o diálogo de verdade aberto. Anotar os overlays que já
    existiam antes e só tocar nos novos (ver o bloco de pastas do selftest).
    Pelo mesmo motivo, **nunca** fechar modal [...].

15. **Para conferir que algo NÃO aconteceu, dê tempo para acontecer.** A
    guarda do Escape no arrasto lia o índice logo depois do `pointerup` e,
    conferida ao contrário com o Escape desligado, **passou**: o quadro tinha
    caído na pasta, mas a gravação é assíncrona e ainda não tinha chegado.
    Esperar a fila assentar antes de ler o "nada mudou".

16. **Uma medição vale para a configuração em que foi feita.** A do painel de
    vidro (21/09) dizia [...] — com a composição pela GPU. O B18
    trocou a composição do app inteiro no dia seguinte, e só a medição do
    quadro foi refeita. Ao mudar `QB_GPU`, flags do Chromium ou versão do
    Electron, **toda medição de interface anterior vira suspeita**.
17. **Número de desempenho bom demais: confira que há algo sendo desenhado.** A
    primeira versão do vidro pronto pôs uma cor numa camada do meio do
    `background` (cor só vale na última); a declaração inteira caiu, o painel
    ficou sem fundo — e a medição parecia ótima justamente por isso. Só a
    captura pegou.
18. **Script Python escrito por heredoc come barra invertida.** `\1` numa regex
    virou o byte `\x01` dentro do `.ts`, e o typecheck não reclamou. Para
    trecho com barra, escrever o arquivo com a ferramenta de escrita e usar
    string crua (`r"""..."""`). Varredura rápida:
    `grep -rlP '[\x00-\x08\x0b\x0c\x0e-\x1f]' src scripts` — só as fotos podem aparecer.

**Do projeto:**


---

## Como conferir que nada quebrou

```
npm run typecheck
npm run selftest      # 191/191, tem de terminar com "tudo passou"
npm run check:fundo   # 22 casos da validação do fundo personalizado
npm run check:pastas  # 26 casos do índice de pastas
npm run check:graficos # 19 casos da opção de compatibilidade gráfica
```

E a regra que vale desde o B24: **cada checagem nova é conferida ao contrário** —
quebrando de propósito o que ela guarda e confirmando que ela acusa. Uma guarda
que nunca falhou não é guarda.
