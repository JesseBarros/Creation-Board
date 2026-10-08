# Guia de uso

**Português** · [English](USO.en.md)

Como usar o **Creation Board** no dia a dia. Se você ainda não instalou, comece pelo
[README](../README.md).

---

## Menu principal

É a tela que abre com o app: seus quadros, com miniatura, data, número de objetos e tamanho.

- **Novo quadro** (ou `Ctrl+N`) cria um quadro e pergunta o nome e a cor do papel. Com nome, ele já nasce salvo.
- O **+** no fim da grade cria um quadro ou uma pasta.
- **Importar arquivo** traz quadros exportados de outro aplicativo (ver [Importar](#importar-de-outros-aplicativos)).
- **Buscar em todos os quadros**, no alto do painel, procura texto em toda a biblioteca de uma vez, inclusive o texto dentro das imagens.
- O selo com o caminho, ao lado do título, abre a pasta dos quadros no Explorador.

### Pastas

- **Nova pasta** (ou o **+**) cria uma pasta vazia. **Arrastar um quadro sobre outro** cria uma pasta com os dois e pergunta o nome.
- Arraste um quadro sobre uma pasta para guardá-lo nela.
- Clique numa pasta para abri-la numa janela, com a tela principal ainda à vista. Arrastar um quadro da janela para a tela principal o tira da pasta. `Esc` fecha a janela.
- Renomear (lápis ou `F2`) e excluir estão no próprio card da pasta. **Excluir uma pasta nunca apaga quadros**: eles voltam para a tela principal.

As pastas são uma organização do app, e não pastas do Windows: os arquivos `.wbd` continuam todos juntos na pasta de quadros, e arrastar nunca move arquivo.

### Configurações

O botão de ajustes, ao lado do tema, abre:

- **Idioma:** Português (Brasil) ou English (US). Na primeira abertura, o app segue o Windows: português do Brasil abre em português, e os outros idiomas, em inglês.
- **Animações:** Desligadas, Ligadas ou **Máximas** (padrão).
- **Tutorial:** **Ver de novo** mostra os passos guiados do menu e do quadro.
- **Fundo do tema claro / escuro:** uma imagem sua no lugar da foto que vem com o app. A imagem é copiada para a pasta dos quadros, sem os dados escondidos (como localização de GPS). **Restaurar padrão** volta para a foto original.
- **Compatibilidade gráfica:** desativa a aceleração por GPU. Use se a tela piscar ou o desenho duplicar; o defeito depende da placa de vídeo de cada computador.

Idioma e compatibilidade gráfica valem ao clicar em **Aplicar alterações**, no rodapé (a compatibilidade reabre o app).

O botão de sol/lua alterna entre o tema claro e o escuro.

---

## Atalhos

Todos os atalhos estão dentro do app: tecla **`F1`**, ou o botão de teclado na barra do quadro.

| Ação | Como |
|---|---|
| Novo quadro | `Ctrl+N` · no menu ou dentro de um quadro |
| Salvar | `Ctrl+S` · depois do primeiro, salva sozinho 3 s após a última alteração |
| Exportar | `Ctrl+E` — PNG, SVG ou PDF; o quadro todo ou a seleção |
| Voltar ao menu principal | `Ctrl+O` |
| Ferramentas | `V` selecionar · `P` caneta · `M` marca-texto · `T` texto · `N` post-it · `F` formas · `E` borracha |
| Espessura | Barra de 0 a 100% · `[` e `]` mudam de 10 em 10% (no texto é o tamanho da fonte; na borracha, o diâmetro) |
| Editar texto | `F2` ou `Enter` na seleção · duplo clique na caixa |
| Formatar (dentro da caixa) | `Ctrl+B` · `Ctrl+I` · `Ctrl+U` · `Esc` sai mantendo o texto |
| Selecionar | Clique · `Shift`+clique soma · arrastar no vazio faz laço · `Ctrl+A` tudo · `Esc` limpa |
| Mover · redimensionar · girar | Arrastar a seleção · uma alça · a alça de cima |
| Desfazer / refazer | `Ctrl+Z` / `Ctrl+Shift+Z` (ou `Ctrl+Y`) |
| Duplicar / excluir | `Ctrl+D` / `Delete` |
| Copiar · recortar · colar | `Ctrl+C` · `Ctrl+X` · `Ctrl+V` (cola no cursor) |
| Trazer para a frente / enviar para trás | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Buscar no quadro | `Ctrl+F` · `Enter` próximo · `Shift+Enter` anterior · `Esc` fecha |
| Mover o quadro | **Botão direito + arrastar** · botão do meio · dois dedos no trackpad · roda do mouse |
| Zoom | `Ctrl` + roda · pinça · `Ctrl+0` tamanho real · `Ctrl+1` centraliza o conteúdo em 50% |
| Pontilhado · réguas · unidade | `G` · `R` · `U` (px ou cm) · pontilhado e réguas começam desligados, e o app lembra a escolha |
| Painel de camadas | `C` |
| Menu de contexto | Clique direito sem arrastar |

A barra mostra o zoom de **1% a 100%**, do mínimo ao máximo (64 vezes o tamanho real). O tamanho real aparece como 53%.

---

## Desenhar

A barra fica embaixo. Com uma ferramenta de desenho ativa, um painel sobe da barra com cor, espessura e as opções da ferramenta. Clicar de novo na ferramenta ativa fecha o painel. Cada ferramenta lembra a própria cor e espessura.

- **Caneta** e **marca-texto**. O marca-texto fica **por baixo** do conteúdo, para destacar sem cobrir o texto.
- **Borracha:** apaga **por peça** (padrão, só o que ela cobre) ou o **traço inteiro** que tocar. Ela apaga só tinta: texto, post-it e imagem se excluem selecionando e apertando `Delete`.
- **Cor:** a paleta ou o **+**, que abre o seletor do sistema. Se a cor escolhida ficar ilegível num dos temas, o app avisa e a exibe ajustada; o arquivo guarda sempre a cor original.
- Escrevendo perto da borda, dá para mover o quadro com o botão direito **sem interromper o traço**.

### Formas e encaixe

**Formas** (`F`) tem retângulo, elipse, triângulo, losango, linha e seta; o tipo se escolhe no painel. `Shift` trava quadrado, círculo ou o ângulo de 15 em 15 graus; `Alt` faz a forma crescer a partir do centro.

Ao mover, redimensionar ou criar, **guias laranja** aparecem quando você alinha com a borda ou o centro de um objeto vizinho. `Ctrl` durante o arraste ignora o encaixe.

As **réguas** (`R`) mostram a posição no topo e à esquerda, em px ou cm (`U`).

---

## Texto, post-its e alertas

- **Texto** (`T`): clique cria uma caixa; arrastar define a largura. Clicar numa caixa que já existe abre a caixa, em vez de criar outra.
- **Redimensionar texto** não distorce as letras: o **canto** muda o tamanho da fonte e a **lateral** muda a largura da caixa (o texto se reorganiza).
- **Negrito, itálico e sublinhado** valem enquanto se digita, numa palavra só. Colar dentro da caixa cola texto puro.
- **Cor do texto:** selecione um trecho e escolha a cor no painel do Texto. `Ctrl+A` dentro da caixa muda o texto todo; com a caixa selecionada no quadro, muda a caixa inteira.
- A **barra de tamanho** do painel vale para o texto em edição ou selecionado.
- **Post-it** (`N`) tem tamanho próprio. A cor e o **alerta** (importante, dúvida, revisar) se escolhem no painel, e os mesmos botões mudam o post-it selecionado.
- Um post-it **fixado** (menu de contexto) vira uma ficha no canto da tela enquanto estiver fora da vista.

---

## Imagens

- **Colar** (`Ctrl+V`) ou **arrastar o arquivo** para dentro do quadro. Arrastada, ela cai onde foi solta; várias entram lado a lado.
- Uma imagem grande entra reduzida para caber na tela (720 px no maior lado); as pequenas entram no tamanho natural.
- **Cortar imagem:** duplo clique na imagem (ou menu de contexto). `Enter` confirma, `Esc` descarta, e **Remover corte** devolve a imagem inteira.
- A imagem é guardada **sem os dados escondidos** do arquivo original (localização de GPS, modelo do aparelho, data), mas com a mesma qualidade.

---

## Buscar

- **`Ctrl+F` no quadro** lista os resultados com o trecho em volta. `Enter` vai para o próximo, `Shift+Enter` volta, `Esc` fecha.
- A busca **ignora acento e maiúsculas**: "revisao" acha "revisão".
- **Texto dentro das imagens** também é encontrado: o app lê as imagens com o reconhecimento de texto do próprio Windows, sem enviar nada para lugar nenhum.
- **No menu principal**, `Ctrl+F` procura em **todos os quadros** de uma vez, inclusive nos que estão em pastas.

---

## Exportar e salvar

`Ctrl+E` abre as opções: **PNG**, **SVG** ou **PDF**; o quadro todo ou a seleção; resolução 1x, 2x ou 3x; com fundo ou transparente. Réguas, alças, guias e destaques da busca não entram no arquivo.

- Um quadro muito grande em PNG sai **em partes**, em vários arquivos, para manter a resolução pedida. O diálogo avisa quantos antes de exportar.
- O SVG é vetorial e mantém o texto selecionável.

**Salvar:** `Ctrl+S`. Depois do primeiro salvamento, o app salva sozinho 3 segundos após a última alteração. Um quadro que nunca foi salvo é protegido pelo aviso ao sair.

---

## Selecionar e manipular

| Gesto | O que faz |
|---|---|
| Clique | Seleciona o objeto sob o cursor (pelo desenho, e não pelo retângulo em volta) |
| `Shift` + clique | Soma à seleção; num objeto já selecionado, tira |
| Arrastar no vazio | Laço: pega tudo na área |
| Arrastar a seleção | Move — `Shift` trava num eixo |
| Arrastar uma alça | Redimensiona — `Shift` mantém a proporção, `Alt` ancora no centro |
| Arrastar a alça de cima | Gira — `Shift` trava de 15 em 15 graus |
| Setas | Move 1 px; com `Shift`, 10 px |

Copiar e colar **funciona entre quadros**, inclusive com imagens. `Ctrl+V` cola centrado no cursor.

O **painel de camadas** (`C`) lista o que está na tela, com botões para trazer para a frente, enviar para trás, esconder (olho) e travar (cadeado).

---

## Importar de outros aplicativos

**Importar arquivo**, no menu principal, aceita o `.zip` exportado do Microsoft Whiteboard (ou o `.html` de dentro dele), vários de uma vez. Cada arquivo vira um quadro `.wbd` separado.

O conteúdo volta **editável**: texto, tinta, imagens e post-its, cada um no lugar certo. Elementos que o app ainda não tem (links e reações) são ignorados.

---

## Onde os quadros ficam

Cada quadro é um arquivo `.wbd` em **`C:\Creation Board`**. A pasta fica na raiz do disco **de propósito**, e não em Documentos: em muitos computadores Documentos sincroniza com o OneDrive, e os quadros iriam para a nuvem sem ninguém pedir.

- Para levar um quadro a outro computador, copie o `.wbd`; ele reabre normalmente.
- Se a raiz do disco estiver bloqueada, o app usa `%USERPROFILE%\Creation Board`.
- Desinstalar o app **não apaga** seus quadros.

---

## Tema claro e escuro

As cores são adaptadas **só na exibição**, para nada sumir: traço preto aparece claro no tema escuro, e vice-versa. Cores fortes (vermelho, azul, verde) e superfícies (post-it, marca-texto) ficam como são. O arquivo guarda sempre a cor que você escolheu, e é ela que a exportação usa.
