# Planos de fundo do menu principal

Duas imagens, uma por tema. O app escolhe pelo `data-theme` da raiz; o CSS que
as consome está em `styles/base.css`, na seção do fundo do lobby.

| arquivo | tema | dimensões | tamanho |
|---|---|---|---|
| `praia.webp` | claro | 1376×768 | 135 KB |
| `galaxia.webp` | escuro | 1024×572 | 121 KB |

## Procedência

**As duas foram geradas por inteligência artificial por Jessé Barros**, autor do
aplicativo, e entram aqui sob a mesma licença MIT do repositório.

Vale registrar uma ressalva que não atrapalha nada, mas explica por que não há um
arquivo de licença separado como o do Lucide: imagem puramente gerada por IA não
recebe proteção de direito autoral em várias jurisdições (a posição do US
Copyright Office é essa desde 2023). Isso não impede distribuir sob MIT — só
significa que ninguém pode reivindicar exclusividade sobre elas.

## Por que WebP, e não os JPEG originais

O alvo de build é `chrome130` (ver `electron.vite.config.ts`), então WebP é
nativo e não precisa de alternativa. A conversão a qualidade 0,78 cortou 83% da
imagem clara e 36% da escura, sem diferença visível — e elas ficam, na maior
parte da tela, atrás de um painel com `blur(10px)` e sob véu.

Os JPEG originais **não** são versionados: o repositório guarda o que o app usa.

## Trocar uma delas

Substituir o arquivo mantendo o nome basta — o CSS aponta para o nome, não para
um hash. Recomendações:

- **WebP**, qualidade 75–80. PNG é o container errado para fotografia: a mesma
  imagem sai várias vezes maior sem ganho visível.
- **1920×1080 ou mais.** As atuais estão abaixo disso e é a fraqueza conhecida
  delas — no meio da tela não aparece, porque o painel de vidro desfoca; nas
  margens, onde a foto fica nítida, um olhar atento nota.
- **Cuidado com ponto de luz no centro-inferior.** É onde o painel e os cards
  ficam, e no tema escuro o texto é claro. A `galaxia.webp` tem uma fogueira
  justamente ali; o enquadramento no CSS foi deslocado por causa disso. Borrar
  não escurece — se a imagem nova tiver o mesmo problema, ajuste o
  `background-position` em vez de reforçar o véu, que escureceria a foto toda.

