# Registro de bugs

**O que deu errado no app, a causa e a correção.**


## Abertos

- **[B34](#b34--um-teste-do-arrasto-de-pastas-reprova-com-escala-de-tela-de-150)** — um teste
  do arrasto de pastas reprova com a escala de tela em 150%.
- **[B15](#b15--uma-verificação-do-selftest-falhou-uma-vez-e-não-reproduziu)** — uma
  verificação do `selftest` falhou uma vez e não reproduziu.

## Por onde procurar

| Sintoma | Veja |
|---|---|
| A tela pisca, deixa rastro ou duplica o desenho no zoom | [B8](#b8--a-tela-pisca-ao-passar-o-mouse-sobre-ícones-e-cartões) e [B18](#b18--fantasma-do-desenho-ao-dar-zoom) |
| Quadros sumiram do menu ou apareceram duplicados | [B11](#b11--a-biblioteca-estava-partida-em-duas-pastas) |
| Arrastar ou dar zoom pesa | [B31](#b31--zoom-rápido-com-ctrlroda-travava-o-quadro) e [B32](#b32--arrastar-o-quadro-redesenhava-tudo-a-cada-quadro) |
| A borracha trava | [B24](#b24--a-borracha-apagava-em-bolas-e-travava-o-aplicativo) e [B25](#b25--a-borracha-travava-o-app-com-zoom-alto) |
| Texto distorce ou muda a quebra | [B19](#b19--redimensionar-texto-distorcia-as-letras) e [B21](#b21--a-quebra-de-linha-mudava-ao-sair-da-caixa) |
| Algo treme com o mouse parado | [B37](#b37--quadros-e-botões-tremiam-com-o-mouse-parado-na-borda) e [B38](#b38--com-uma-pasta-aberta-os-quadros-tremiam-todos-juntos) |

---

## Bugs

### B38 — Com uma pasta aberta, os quadros tremiam todos juntos
`corrigido` · 07/10/2026

**Problema.** Com uma pasta aberta, passar o mouse pelos quadros do menu fazia todos tremerem.

**Causa.** Com a pasta aberta, o painel do menu fica perto da altura exata de uma fileira. A
barra de rolagem aparecia, a grade estreitava, os quadros encolhiam e passavam a caber, a
barra sumia — e o ciclo recomeçava a cada hover.

**Correção.** O lugar da barra de rolagem fica sempre reservado (`scrollbar-gutter`), então a
largura da grade não muda. Verificado no `selftest`.

### B37 — Quadros e botões tremiam com o mouse parado na borda
`corrigido` · 07/10/2026

**Problema.** Com o mouse parado na borda de baixo de um quadro ou botão, ele subia e descia
sem parar.

**Causa.** O hover levanta o elemento; a borda saía de baixo do mouse, o hover caía, o
elemento descia e o hover voltava.

**Correção.** Enquanto levantado, uma faixa invisível embaixo do elemento cobre o lugar de
onde ele saiu, e o hover se mantém. Vale para todo elemento que levanta; o `selftest` confere
que nenhum fica sem a faixa.

### B36 — Depois de sair de um quadro sem salvar, o X não fechava mais o app
`corrigido` · 06/10/2026

**Problema.** Criar um quadro, sair sem salvar e depois clicar no X do Windows não fechava o
app.

**Causa.** Sair sem salvar deixava o quadro marcado como alterado, e o aviso de fechamento do
Electron cancelava o X sem mostrar nada.

**Correção.** Descartar limpa o estado. Com um quadro não salvo na tela, o X abre o aviso do
app (Cancelar, Perder o progresso ou Salvar e sair). Verificado no `selftest`.

### B35 — Trocar o idioma no app instalado não aplicava
`corrigido` · 06/10/2026

**Problema.** No app instalado, trocar o idioma em Configurações não tinha efeito.

**Causa.** A página se recarregava com `location.reload()`, e o bloqueio de navegação do app
instalado barrava esse recarregar.

**Correção.** O recarregar é pedido ao processo principal. Configurações ganhou o botão
**Aplicar alterações**. Verificado no `selftest`.

### B34 — Um teste do arrasto de pastas reprova com escala de tela de 150%
`aberto` · 30/09/2026

**Problema.** Com a escala de tela em 150%, a verificação de arrastar quadros na janela da
pasta reprova. Em 100% passa.

**Falta.** Confirmar se o arrasto real numa tela de 150% também erra o alvo, ou se é só o
teste.

### B33 — Com escala de tela acima de 100%, a grade cobria só parte do quadro
`corrigido` · 30/09/2026

**Causa.** A grade era desenhada em pixels CSS sobre um canvas em pixels físicos.

**Correção.** A grade desenha em pixel físico.

### B32 — Arrastar o quadro redesenhava tudo a cada quadro
`corrigido` · 30/09/2026

**Problema.** Arrastar um quadro grande ficava pesado.

**Causa.** Todos os objetos eram redesenhados a cada quadro, mesmo só mudando de lugar.

**Correção.** Arrastar sem mudar o zoom desloca a imagem pronta e desenha só a faixa que
entrou na tela. Verificado no `selftest`, pixel a pixel contra o desenho completo.

### B31 — Zoom rápido com Ctrl+roda travava o quadro
`corrigido` · 30/09/2026

**Problema.** Ir e voltar no zoom rapidamente travava quadros grandes.

**Causa.** Cada mudança de escala refazia o bitmap de todos os textos visíveis no mesmo
quadro.

**Correção.** No máximo 4 ms de textos refeitos por quadro; o resto é refeito nos quadros
seguintes. Verificado no `selftest`.

### B30 — Fechar o app no meio de uma leitura deixava a print na pasta temporária
`corrigido` · 30/09/2026

**Causa.** A pasta temporária da leitura de texto só era apagada se o app continuasse aberto
até o fim.

**Correção.** Ao abrir, o app apaga as pastas `qb-ocr-*` esquecidas. Verificado no
`check:pastas`.

### B29 — Colar uma print congelava a janela por 1 a 2 segundos
`corrigido` · 30/09/2026

**Causa.** No app instalado, o antivírus segurava a criação do PowerShell com comando
codificado, usado para ler o texto da imagem.

**Correção.** O script vai pela entrada padrão. O `check:dist` reprova travadas do processo
principal acima de 500 ms.

### B28 — Print colada com o quadro aberto não aparecia na busca
`corrigido` · 30/09/2026

**Causa.** O texto das imagens só era lido ao abrir o quadro.

**Correção.** Colar ou arrastar uma imagem dispara a leitura na hora. Verificado no
`selftest`.

### B27 — Abrir o app criava uma pasta vazia dentro da pasta de quadros
`corrigido` · 30/09/2026

**Causa.** Ler o fundo personalizado usava a mesma função que grava, e ela criava a pasta.

**Correção.** Ler não cria nada; só escolher uma imagem cria a pasta.

### B26 — As animações pareciam não funcionar
`corrigido` · 21/09/2026

**Causa.** O Windows estava com "menos movimento" ligado, e o app obedecia. Seis controles
também não tinham o efeito de levantar.

**Correção.** Todo controle interativo levanta, a partir de uma lista só no `app.css`. As
animações passaram a ser uma escolha do app, em **Configurações**.

### B25 — A borracha travava o app com zoom alto
`corrigido` · 21/09/2026

**Causa.** O recorte da borracha era do tamanho do objeto inteiro: com zoom alto, 4
megapixels por objeto, a cada quadro.

**Correção.** O recorte segue a tela. Verificado no `selftest`.

### B24 — A borracha apagava em bolas e travava o aplicativo
`corrigido` · 21/09/2026

**Causas.** Ao passar por um vão, a borracha abria um rastro novo de um ponto só, desenhado
como bola. E o canvas de recorte ficava na CPU.

**Correção.** O rastro continua enquanto a borracha está a menos de um diâmetro do anterior,
e o canvas de recorte é acelerado. Verificado no `selftest`.

### B23 — Mancha escura em volta das barras
`corrigido` · 20/09/2026

**Causa.** Uma das sombras espalhava escuro igualmente para todos os lados.

**Correção.** Uma sombra só, deslocada para baixo.

### B22 — O tema claro cansava a vista
`corrigido` · 20/09/2026

**Correção.** Fundo do quadro mais escuro (`#e3e7ee`) e ícones com mais contraste. A
exportação continua em fundo branco.

### B21 — A quebra de linha mudava ao sair da caixa
`corrigido` · 21/09/2026

**Causa.** Uma palavra com formatação diferente em cada metade podia quebrar no meio.

**Correção.** A quebra é feita por palavra inteira, como no editor.

### B20 — O negrito só funcionava depois de digitar
`corrigido` · 20/09/2026

**Causa.** Clicar no botão fechava a caixa de texto antes de aplicar o formato.

**Correção.** Os botões B/I/U não tiram o foco da caixa e mostram o formato em vigor.

### B19 — Redimensionar texto distorcia as letras
`corrigido` · 20/09/2026

**Causa.** O texto era esticado como uma imagem.

**Correção.** O canto muda o tamanho da fonte; a lateral muda a largura da caixa. Verificado
no `selftest`.

### B18 — Fantasma do desenho ao dar zoom
`corrigido` · 21/09/2026

**Problema.** Ao dar zoom, o desenho anterior ficava na tela por um instante, em outra
escala.

**Causa.** Defeito da composição gráfica pela GPU em alguns computadores. Não aparece em
outros PCs com o mesmo app.

**Correção.** A opção **Compatibilidade gráfica**, em **Configurações**, desativa a
aceleração por GPU para quem tiver o defeito. A GPU continua sendo o padrão. Verificado no
`check:graficos`.

### B17 — As miniaturas do menu guardam o tema em que o quadro foi salvo
`fechado — decisão` · 14/08/2026

A miniatura é gravada no tema em uso ao salvar. Fica assim: não há diferença no uso normal.

### B16 — Uma "sombra" atrás dos ícones da barra
`corrigido` · 13/08/2026

**Causa.** O destaque de botão ligado era cinza sobre uma interface azulada.

**Correção.** O destaque usa a cor de realce. Verificado no `selftest`.

### B15 — Uma verificação do selftest falhou uma vez e não reproduziu
`aberto` · 12/08/2026

A verificação [...] falhou uma vez,
com a máquina sob carga. Não reproduziu nas execuções seguintes.

### B14 — Texto por cima de texto no SVG exportado
`corrigido` · 08/08/2026

**Causa.** Quem abre o SVG pode ter uma fonte um pouco mais larga.

**Correção.** Cada trecho leva a largura medida (`textLength`) e se ajusta a ela. Verificado
no `selftest`.

### B13 — Os botões de resolução da exportação não mudavam nada em quadro grande
`corrigido` · 12/08/2026

**Causa.** O teto de tamanho de imagem reduzia toda escala ao mesmo valor.

**Correção.** Quadros grandes saem em vários arquivos, na escala pedida, e o diálogo mostra o
resultado antes de exportar. Verificado no `selftest`.

### B12 — Texto virava barra cinza no PNG e com o zoom afastado
`corrigido` · 08/08/2026

**Causa.** Abaixo de um tamanho mínimo, texto e imagens eram trocados por blocos.

**Correção.** Tudo é desenhado de verdade em qualquer zoom. O texto usa um cache de bitmap
para manter o desempenho.

### B11 — A biblioteca estava partida em duas pastas
`corrigido` · 08/08/2026

**Causa.** Dois processos do app testando a mesma pasta ao mesmo tempo apagavam o arquivo de
teste um do outro, e o app caía calado na pasta alternativa.

**Correção.** Cada processo testa com um nome próprio. O app nunca troca de pasta calado e
mostra no terminal qual pasta usa. Verificado no `selftest`.

### B10 — O custo por quadro crescia com o zoom
`fechado — não é bug` · 14/08/2026

Sem efeito no uso.

### B9 — O quadro parava em 60 fps ao arrastar
`fechado — não é bug` · 12/08/2026

O desenho cabe em 144 fps; o limite era a entrega dos eventos do mouse. O painel do `F3`
passou a mostrar o custo de desenho em destaque.

### B8 — A tela pisca ao passar o mouse sobre ícones e cartões
`corrigido` · 06/08/2026

**Problema.** Piscar preto no hover, rastros ao voltar para o menu e janela rasgada ao
redimensionar (os três sintomas do B1, do B7 e deste item).

**Causa.** Defeito da composição gráfica pela GPU em alguns computadores. Não aparece em
outros PCs com o mesmo app.

**Correção.** A opção **Compatibilidade gráfica**, em **Configurações**, desativa a
aceleração por GPU para quem tiver o defeito. A GPU continua sendo o padrão.

### B7 — Interface rasgada ao redimensionar a janela
`corrigido` · 06/08/2026

Mesmo defeito do [B8](#b8--a-tela-pisca-ao-passar-o-mouse-sobre-ícones-e-cartões). A janela
também é repintada inteira ao mudar de tamanho.

### B6 — `Ctrl+V` não colava imagem da área de transferência
`corrigido` · 04/08/2026

**Causa.** O atalho cancelava a ação padrão do navegador, que é a que entrega a imagem.

**Correção.** O `Ctrl+V` não cancela mais o padrão. Verificado no `selftest`.

### B5 — Queda de fps ao clicar na barra
`fechado — não reproduz` · 08/08/2026

Era o servidor de desenvolvimento recarregando a página durante o teste.

### B4 — Cursor de cruz nas ferramentas de desenho
`corrigido` · 04/08/2026

Caneta e marca-texto usam um cursor de caneta, com a ponta no lugar do traço.

### B3 — Lentidão ao trocar de cor
`corrigido` · 04/08/2026

**Causas.** Gravar no disco a cada clique e reconstruir o painel inteiro.

**Correção.** A gravação é adiada e só o destaque muda. Verificado no `selftest`.

### B2b — Grade e ímã
`fechado — não é bug` · 04/08/2026

Os botões funcionavam.

### B2 — A régua
`fechado — decisão` · 04/08/2026

A régua nas bordas da tela fica como está.

### B1 — Rastro ao alternar entre o menu e o quadro
`corrigido` · 06/08/2026

Mesmo defeito do [B8](#b8--a-tela-pisca-ao-passar-o-mouse-sobre-ícones-e-cartões). O quadro
também é pintado na hora ao entrar.

---

## Melhorias

### M10 — A amostra de tinta quase preta sumia no tema escuro
`feita` · 14/08/2026

O anel da amostra usa a cor de primeiro plano do tema. Verificado no `selftest`.

### M9 — Foto de fundo no menu, com painéis de vidro
`feita na 1.1.0`

Foto de fundo por tema, trocável em **Configurações**, com o painel de vidro.

### M8 — Camadas, com cadeado, e o marca-texto sobre imagens
`feita` · 12/08/2026

O marca-texto fica acima das imagens que ele toca e abaixo do texto. Painel de camadas
(`C`) com olho e cadeado.

### M7 — Remover o lápis da barra
`feita` · 04/08/2026

Sem mesa digitalizadora, o lápis era igual à caneta. Quadros antigos com traços de lápis
continuam sendo desenhados.

### M6 — Seletor de cores personalizado
`feita` · 04/08/2026

O **+** da paleta abre o seletor do sistema e avisa se a cor vai aparecer ajustada no tema.

### M5 — Barra de espessura de 0 a 100%
`feita` · 04/08/2026

No lugar de três degraus fixos. `[` e `]` andam de 10 em 10%.

### M4 — "Comandos" no lugar do ícone de interrogação
`feita` · 04/08/2026

### M3 — Barra inferior redesenhada
`feita` · 04/08/2026

Ícones em SVG, agrupados, sobre fundo translúcido.

### M2 — "Importar arquivo" como nome do botão de importação
`feita` · 04/08/2026

### M1 — Botões de negrito, itálico e sublinhado
`feita` · 04/08/2026
