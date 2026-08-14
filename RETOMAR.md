# Onde paramos

Ponto de retomada do **Creation Board**. O [README](README.md) explica o que o app é e
como cada parte funciona; este arquivo responde outra pergunta: *em que pé isso está e
o que fazer a seguir*. Some quando o projeto acabar.

**Última sessão: 14/08/2026.** A **Fase 9 e a Fase 7.5 acabaram**, e a busca cruzando toda a
biblioteca entrou junto. **Todas as fases planejadas estão prontas** — o que sobra são três
itens pequenos, e nenhum bloqueia o uso.

> **Retomar por aqui.** O que falta no projeto:
>
> 1. **A verificação de arrastar 10.000 objetos vive no limite.** Teto de 33 ms, faixa normal
>    25,0–26,5 — mas em 14/08 ela reprovou na maioria das execuções, sempre com o `bbox`
>    (matemática pura) em 3,4–4,9 contra a faixa normal de 3,0–3,3. **É a máquina, e o
>    diagnóstico já está escrito neste arquivo** — mas uma verificação que reprova metade das
>    vezes ensina a ignorar reprovações, que é exatamente o que o B15 alerta. A saída
>    desenhada: usar o próprio `bbox` para normalizar o teto, em vez de pedir que uma pessoa
>    interprete. Hoje o número está lá só para ser lido por gente.
> 2. **B10** — o custo por frame cresce com o zoom. Medido por ele no `F3`, nunca sentido no
>    uso.
> 3. **B11** — consolidar as duas pastas de biblioteca; depende de uma decisão dele. As
>    cópias estão estacionadas em `_substituidos-2026-08-08\`, nada perdido.
>
> O **B15** (verificação que falhou uma vez e não reproduziu) continua aberto no `BUGS.md`,
> mas não reapareceu em nenhuma das dezenas de execuções de 13 e 14/08.
>
> **O B8 saiu da lista de pendências em 14/08**, e vale saber por quê antes de reabri-lo: a
> causa foi localizada na **atualização parcial da composição por GPU**, e as duas flags do
> app deixaram de ser remendo. Não há conserto pendente do nosso lado — há um teste de
> reavaliação (`QB_GPU=normal` e olhar) para o dia em que driver ou Windows mudarem. Tudo no
> [BUGS.md](BUGS.md), no B8, seção de 14/08.
>
> **Como ele trabalha, e vale respeitar:** ele pede para **aprovar antes de seguir** para o
> item seguinte. Entregar dois de uma vez tira dele a chance de dizer o que incomodou — e foi
> assim que o título da janela, a marca duplicada e o peso dos ícones apareceram, cada um
> depois de uma entrega parada para avaliação.

<details>
<summary><strong>O que a Fase 9 entregou</strong> — 23 commits, mesclados em 14/08/2026</summary>
>
> | Item | Estado |
> |---|---|
> | `npm run dist` e o executável empacotado | **feito** — e agora se confere por terminal (`npm run check:dist`) |
> | Verificação de troca de ferramenta, que reprovava | **feita** — a conta é que era impossível, não o código |
> | Cache de texto | **feito** — 12–13% mais rápido, com as faixas sem se tocar |
> | **B13** — exportar em ladrilhos | **feito** — 1x/2x/3x voltam a significar o que prometem |
> | **M8a** — marca-texto sobre imagem | **feito** |
> | **M8b** — painel de camadas (`C`) | **feito** |
> | **B9** — o painel do `F3` | **feito** — destaca custo, e o "FPS" virou *Atualizações/s* |
> | Tela de abertura com a logo | **feita** — `QB_BOOT=hold` a segura para fotografar |
> | Ícone do sistema | **feito** — nove tamanhos, e glifo próprio abaixo de 48px |
> | Polimento das barras | **feito** — raios encadeados, sombra em duas camadas, pílula de ligado |
> | Conjunto de ícones | **feito** — área viva única (16×16), geometria arredondada, lua/sol |
> | Menu principal | **feito** — utilidades viraram ícone, ações continuam escritas |
> | Título da janela | **feito** — fixo em "Creation Board", não muda com o quadro aberto |
> | **B16** — a "sombra" atrás dos ícones | **feito** — era a pílula de ligado em cinza neutro; agora é da cor de destaque, igual à barra lateral |
> | **Revisão do tema claro** | **feita** — achou o B17 (fechado por decisão dele) e o M10 (corrigido); `QB_THEME` a tornou repetível |
> | **Subir o Electron** | **feito e DESFEITO** — testado no 41 e no 43; o B8 pisca nos três, e ele decidiu voltar ao 33.4.11. A escada inteira está medida mais abaixo |
> | **`QB_GPU=normal` no Electron novo** | **conferido por ele — o bug VOLTOU, no 41 e no 43.** As duas flags ficam, e a hipótese de raiz do B8 morreu: não era a idade do Chromium |
> | **Node 20.18.3 → 22.12.0** | **feito** (na máquina dele, não no repo) — era o que o Electron 42+ exigia. Fica útil mesmo com a volta ao 33, que instala nos dois |
> | **Instalador regerado** | **feito** — `npm run dist` + `check:dist` passam no `.exe` empacotado |
> | **B8 — a causa localizada** | **feito** — o degrau `comp`, nunca testado, curou e fechou o mecanismo |
> | **Mesclagem na `main`** | **feita** — avanço direto, como as fases anteriores |

</details>

---

## Estado em uma linha

**Todas as fases planejadas estão prontas.** Dá para importar um resumo do Microsoft
Whiteboard, **trabalhar em cima dele por inteiro** (reorganizar com alinhamento assistido,
escrever à mão, desenhar formas, digitar texto e post-its, apagar tinta por peça,
colar/arrastar/recortar imagens) e **tirar dali um PNG, SVG ou PDF**, com o quadro gravando
sozinho, a interface polida nos dois temas e o instalador validado por terminal.

**E achar o que se procura**, que é o que o material dele pede: `Ctrl+F` dentro do quadro,
**inclusive dentro das imagens** (o OCR lê 3.456 palavras nas 36 imagens do *Cybersec
resumão*), e uma busca no menu principal que atravessa **todos os quadros** de uma vez.

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
| 5 | Texto, post-its e alertas | pronta |
| 5.5 | Borracha progressiva (apagar por peça) | pronta |
| 6 | Busca `Ctrl+F` | pronta |
| 7 | Imagens: colar, arrastar e recortar | pronta |
| 8 | Exportar PNG/SVG/PDF e autosave | pronta |
| 9 | Polimento de UI, temas e build final | **pronta** — mesclada em 14/08/2026 |
| 7.5 | OCR: o `Ctrl+F` acha texto dentro das imagens | **pronta** — 14/08/2026 |
| — | Busca cruzando **toda a biblioteca**, no menu principal | **pronta** — 14/08/2026, fora do plano original |

A ordem diverge do plano original **de propósito**: o objetivo é migrar os resumos do
Whiteboard, e para isso importar e manipular vieram antes de desenhar.

A Fase 5.5 nasceu de um pedido dele ao testar a Fase 5 — a borracha apagando o traço
inteiro não servia — e **reverteu a decisão da Fase 4**. Está resolvida.

**A `main` está em dia**, com tudo até a Fase 9 (`411ac96`, mesclado em 14/08/2026 por
avanço direto, como as fases anteriores). A branch `fase-9-polimento` continua no repositório
apontando para o mesmo commit; pode ser apagada quando quiser.

---

## Como conferir que está tudo de pé

Sempre por terminal — nunca por captura de tela cheia (ver o *porquê* no README).

```
npm run typecheck     # tsc nos dois projetos, strict
npm run selftest      # ~125 verificações, deve terminar com "tudo passou"
npm run check:colors  # contraste das cores nos dois temas
npm run check:dist    # o MESMO auto-teste, dentro do .exe empacotado
```

**O `check:dist` é novo e vale explicar por que existe.** O `selftest` mede o app servido
pelo Vite, e nada nele passa pelo empacotamento — asar, caminhos absolutos diferentes,
`isPackaged` verdadeiro, sem servidor de dev. Oito fases entraram entre a validação do
instalador na Fase 0 e a Fase 9, e nenhuma foi conferida do lado de lá.

Ele precisa de `npm run dist:dir` antes (é o executável que ele roda), e resolve duas
armadilhas que custaram tempo em 12/08/2026:

1. **`ELECTRON_RUN_AS_NODE=1`** — o terminal do VS Code exporta essa variável, e com ela o
   binário do Electron roda como **Node puro**: sai em um segundo, sem janela e sem uma
   linha de saída. Parece um executável quebrado, e não é.
2. Um app de subsistema gráfico no Windows só entrega `stdout` se ele estiver
   **redirecionado** — daí `stdio: 'pipe'` e não `'inherit'`.

⚠️ **Duas delas medem a máquina, não o código.** A primeira: "arrastar 10.000 objetos selecionados
fica acima de 30fps", com teto de 33 ms por frame. Ela reprova com o computador ocupado —
em 04/08/2026 reprovou com **50–62 ms** simplesmente porque o **CS2 estava aberto**, e a
`main` sem nenhuma mudança reprovou pior que a branch nova. O sinal de que é a máquina, e
não uma regressão, está na própria linha do resultado: se o custo de `bbox` (matemática
pura, que quase nunca muda) subiu junto, é carga externa. Rodar de novo com o jogo
fechado antes de investigar qualquer coisa.

**A faixa normal, medida em 09/08/2026 com 8 execuções** (4 em cada commit de um A/B):
**25,0–26,5 ms**, com `bbox` entre **3,0 e 3,3**. O teto de 33 ms deixa só ~25% de folga,
e é por isso que ela vira para reprovada com pouca carga externa. Se você vir 36 ou 40 ms
com `bbox` acima de 3,5, **é a máquina** — no mesmo dia essa verificação reprovou duas
vezes seguidas e passou nas oito seguintes, sem uma linha de diferença no código.

**E a lição que custou caro:** duas reprovações seguidas parecem sinal. Um A/B de **uma**
execução contra **uma** não desfaz isso — se as duas estiverem sob carga, ele confirma a
conclusão errada com ar de rigor. Repetir e comparar faixas é o que separa.

A segunda é da Fase 6: **"buscar em 10.000 objetos custa menos que um frame"**, teto de
16 ms. Ela é o que sustenta não haver índice invertido, e a linha do resultado traz a
repartição — em 04/08/2026: **4,0 ms por tecla, dos quais 0,9 ms é varrer tudo**. Se um
dia ela reprovar, olhe primeiro a varredura pura: se ela continuar perto de 1 ms, o
problema não é procurar, é montar os trechos, e índice nenhum resolve isso.

E, ao tocar em `Document`, `SpatialIndex`, no importador ou no **layout de texto**,
conferir a geometria contra o oráculo:

```
$env:QB_IMPORT = "C:\Resumos-quadrobranco\_exports-originais\Cybersec resumão.zip"
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
"conferir o tema claro" dependia do que estava no `localStorage` da máquina — ou seja, não
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

Grava `.png`, `.svg`, `.pdf` e ainda `-svg.png`, que é **o SVG relido pelo navegador**:
se ele não carregar, o arquivo que geramos não serve. Referência em 04/08/2026, com 120
objetos: PNG 6432×6130 em ~700ms, SVG 75 KB em 4ms, PDF em ~800ms.

**Rodar sempre por `npm run dev`.** O instalador (`npm run dist`) só quando você pedir,
com tudo estável.

---

## O Electron subiu até o 43, e VOLTOU para o 33 — a escada inteira está medida

**O projeto está no `^33.2.1` (33.4.11), de propósito e por decisão dele.** Quem ler
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
indexado, a pergunta deixou de ser "onde está isto neste quadro" e virou "em qual dos meus
quadros eu escrevi sobre isto". Daí a **busca da biblioteca**, no menu principal — 68 ms para
ler os três quadros, com um motor de busca só compartilhado com o `Ctrl+F` (`findIn`).

<details>
<summary>O plano original da fase, antes de as medições responderem</summary>

**Transcrever imagem em texto.** É a última funcionalidade que falta, e a única fase que
nunca começou. Foi adiada duas vezes de propósito: o objetivo do projeto é migrar os resumos
do Whiteboard, e mover/desenhar/exportar vinham antes de ler.

**O que ela precisa responder antes de qualquer linha de código, e nenhuma tem resposta
hoje:**

1. **De onde vem o motor de OCR.** Este app é **local e offline** — é a proposta dele desde
   o começo, e está escrita no `wbdFile.ts`: *"todo quadro sincronizar para a nuvem é o
   oposto do que o app se propõe a ser"*. Um serviço de nuvem contradiz isso. Um motor
   embutido (Tesseract em WebAssembly, por exemplo) custa dezenas de MB no instalador, que
   hoje tem 142 MB de Electron. **É a decisão que define a fase, e é dele.**
2. **O que vira o texto reconhecido.** Um `PlainText` novo ao lado da imagem? Um campo na
   própria imagem, invisível, que só a busca do `Ctrl+F` enxerga? Os dois têm sentido, e
   respondem a pedidos diferentes: o primeiro é "quero editar", o segundo é "quero achar".
3. **Se entra na importação ou só sob demanda.** Os resumos dele têm **36 imagens** só no
   Cybersec; reconhecer todas na importação atrasaria a abertura de um arquivo que hoje abre
   em 642 ms.

**O que já está pronto e a fase pode usar:** `AssetStore` guarda os bitmaps, `PatchObjects` é
o comando genérico de conteúdo (foi ele que absorveu o recorte na Fase 7), a busca já varre
texto sem índice invertido, e o `selftest` sabe inserir imagem por arraste.

**E o teste de aceitação já existe:** as 36 imagens do *Cybersec resumão*. Se o `Ctrl+F`
achar uma palavra que só existe dentro de uma delas, a fase entregou o que prometia.

</details>

---

## Decisões que não estão óbvias no código

0. **NADA DE NUVEM. Decidido em 14/08/2026, com a alternativa toda avaliada.** Ele perguntou
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
     fidelidade. As cópias manuais dele são backup de verdade; o Drive seria só uma segunda
     cópia do estado atual.
   - **O autosave regrava o arquivo inteiro** (3 s parado, 30 s no máximo). O *Cybersec
     resumão* tem 4,7 MB: uma tarde de trabalho seriam dezenas de re-envios completos, e
     palavra dele — *"pode criar muito lixo eletrônico no meu Drive sem necessidade"*.

   **O que fica no lugar:** o app continua **local e offline**, e mover quadro é assunto de
   importar/exportar arquivo.

1. **A pasta de quadros continua `C:\Resumos-quadrobranco`** mesmo com o app renomeado
   de QuadroBranco para Creation Board. Trocar o nome faria os resumos já salvos sumirem
   do lobby. É deliberado.
2. **Reimportar sobrescreve o `.wbd`.** Os `.zip` originais em
   `C:\Resumos-quadrobranco\_exports-originais\` são a fonte de verdade para reimportar.
3. **Geometria de importação se mede, não se deduz.** Ler o CSS do export já levou a
   hipóteses plausíveis e erradas — três, contando a da Fase 5 (achei que as âncoras de
   texto fossem centradas; o oráculo mostrou `align topLeft`). Existe um oráculo
   (`src/renderer/dev/layoutOracle.ts`) que mede no próprio Chromium — usar ele. Ele
   agora também relata **fonte, peso, entrelinha e número de linhas computados**, que é o
   que transformou "a caixa não fecha" em "a caixa não fecha por causa de emoji".
4. **O mesmo vale para desempenho.** Na Fase 3, o palpite natural sobre o gargalo do
   arraste em massa (recalcular o AABB dos traços) era o menor dos custos: 3,1 ms de
   27,3. O real era o índice espacial, 20,4 ms. Medir primeiro, otimizar depois.
5. **O marca-texto entra por baixo de TEXTO e por cima de IMAGEM** (chave `z`, não ordem de
   desenho). Por baixo, senão grifar cobriria o texto que se quis destacar. Por cima da
   imagem, porque imagem é **opaca** e não há "atrás" que se veja — a regra nasceu na Fase 4,
   quando o app não tinha imagens, e ele relatou o sintoma no M8. **E a subida é local:** o
   grifo sobe só até acima da imagem mais alta **que ele encosta**, e não acima de todas as
   imagens do quadro. Subir sempre trocaria o problema pelo oposto em outro lugar. Caneta e
   lápis entram por cima de tudo.
6. **A borracha apaga por peça (padrão) ou o traço inteiro, e só tinta** (`stroke` e
   `path`). Ela ignora texto, post-it e imagem de propósito: um gesto largo apagaria o
   resumo inteiro sem ninguém ter pedido. Os comandos são `EraseInk` e `EraseObjects`,
   separados de `RemoveObjects` porque a borracha apaga *durante* o arraste — quando o
   gesto termina o estado já mudou, e a captura tardia viria vazia.
6b. **O apagamento por peça é MÁSCARA, não recorte da geometria.** O objeto guarda os
   rastros em `erased` e o buraco aparece no desenho, com `destination-out` num canvas
   intermediário (`render/painters/erase.ts`). Recortar seria viável no traço de caneta e
   **impossível de estender** à caligrafia importada, que é contorno preenchido e exigiria
   subtração booleana de contornos. Pintar por cima com a cor do fundo — a saída barata —
   estaria errado: no tema escuro a mancha apareceria clara, o marca-texto por baixo
   continuaria visível e a miniatura sairia com retângulos brancos. Um objeto que ficou
   sem nenhum pixel visível sai do quadro; quem decide isso é uma rasterização de 64px, e
   não a geometria, porque `PathObject` não tem "pontos do traço" para conferir.
7. **A espessura do lápis nunca passa de 100% da largura nominal.** O AABB é calculado
   inflando a linha de centro em `width / 2`; um pico maior desenharia tinta fora do
   retângulo do objeto, e o culling a cortaria na borda da tela.
8. **O encaixe devolve uma correção, não uma posição.** Quem arrasta tem um delta
   acumulado desde o início do gesto; substituir a posição faria o objeto perder o
   vínculo com o cursor. Vale para mover, redimensionar e criar.
9. **Linha e seta não são normalizadas para o canto superior esquerdo.** Elas guardam a
   direção em `w`/`h`; normalizar viraria uma seta apontando sempre para baixo e para a
   direita.
10. **A prévia de um gesto passa pelo adaptador de cor** (`ToolContext.adapt`), igual aos
    painters. Sem isso, no tema escuro a prévia de um traço quase preto sumiria no fundo.
11. **A edição de texto é um `contentEditable` sobre o canvas.** Cursor, seleção,
    acentuação e IME saem de graça do Chromium; um editor próprio dentro do canvas seria
    reescrever um motor de texto. Enquanto a caixa está aberta o objeto **não é
    desenhado** (`Renderer.hiddenId`), senão o texto sai duplicado meio pixel fora.
12. **A caixa nova só entra no documento se receber texto.** Enquanto se digita ela é só
    o `<div>` — por isso uma caixa aberta por engano não deixa objeto invisível nem passo
    de undo. Esvaziar uma caixa existente a remove, pelo mesmo motivo.
13. **O layout de texto é ponto único de verdade** (`render/text/layout.ts`): painter,
    importador e editor medem pelo mesmo código. Foi cada um medindo por conta própria
    que produziu a divergência de tamanho que a importação carregou da Fase 2 à 5.
14. **A altura de linha vem da fonte, com piso no multiplicador** — `fontBoundingBox` e
    `actualBoundingBox`, a maior das duas. `fontSize × lineHeight` sozinho corta emoji.
15. **A busca não tem índice invertido, e isso foi medido.** Varrer 10.000 objetos sem
    casar com nada custa 0,9 ms: procurar nunca foi o gargalo. O que estava caro era
    dobrar o texto (tirar acento e caixa) de tudo a cada tecla — 20,8 ms —, resolvido com
    um `WeakMap` chaveado pelo próprio objeto, já que toda mutação o substitui e a
    invalidação sai de graça. Antes de "otimizar a busca", ler a repartição na linha do
    autoteste.
16. **Arquivo solto na janela do Electron NAVEGA** se ninguém chamar `preventDefault` —
    o app some e a janela vira um visualizador de imagem, sem volta. Por isso `dragover` e
    `drop` são barrados na `window` inteira, e não só no canvas.
17. **O recorte de imagem só aperta para dentro, e compõe no espaço normalizado** (0..1)
    do arquivo. Compor é o que faz o segundo corte continuar de onde o primeiro parou;
    medir em pixels acumularia erro e dependeria do tamanho no quadro. "Remover recorte"
    é o caminho de volta, e por isso arrastar para fora não precisa existir.
18. **`PatchObjects` é o comando genérico de conteúdo+geometria** (texto, marcadores,
    recorte). Ele nasceu como `EditText` e foi renomeado na Fase 7, quando o terceiro uso
    apareceu — se você procurar `EditText` no histórico, é ele.
19b. **O PNG sai em LADRILHOS quando não cabe num arquivo, e a escala pedida é honrada**
    (B13). Não existe imagem única para o quadro dele — 82.967 × 19.274 unidades são 1,6
    gigapixel a 1x. Cada ladrilho vira um arquivo irmão, com sufixo `-l<linha>c<coluna>` em
    base 1 **inclusive no primeiro**, para ordenar por nome remontar a grade. O PDF continua
    cedendo escala: uma página não tem onde pôr o segundo ladrilho.

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
│  ├─ import/     leitor do export do Whiteboard
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
