# Planos de fundo do menu principal

Duas imagens, uma por tema. O app escolhe pelo `data-theme` da raiz; o CSS que
as consome está em `styles/base.css`, na seção do fundo do lobby.

| arquivo | tema | dimensões | tamanho |
|---|---|---|---|
| `praia.webp` | claro | 2560×1702 | 185 KB |
| `galaxia.webp` | escuro | 2560×1514 | 410 KB |

## Procedência

**As duas são fotografias do Unsplash, sob a Licença Unsplash** — e não sob a
MIT do restante do repositório. A distinção não atrapalha nada, mas precisa
estar escrita por arquivo:

| arquivo | fotógrafo | origem |
|---|---|---|
| `praia.webp` | Sean Oulashin ([@oulashin](https://unsplash.com/@oulashin)) | [unsplash.com/photos/KMn4VEeEPR8](https://unsplash.com/photos/KMn4VEeEPR8) |
| `galaxia.webp` | Felix Wegerer ([@felixwegerer](https://unsplash.com/@felixwegerer)) | [unsplash.com/photos/Gi1kD265cdw](https://unsplash.com/photos/Gi1kD265cdw) |

A Licença Unsplash concede uso gratuito, **inclusive comercial**, sem pedir
permissão e **sem exigir atribuição** — e a concessão é irrevogável, então uma
foto retirada do site depois continua licenciada na cópia que já está aqui. As
duas restrições da licença (não revender cópias inalteradas, não montar um
serviço concorrente de fotos) não encostam neste uso.

O crédito acima é, portanto, cortesia e não obrigação. Ele fica porque em um ano
ninguém vai lembrar de onde a imagem veio, e porque o que protege este uso é a
licença desta foto — não o fato de ninguém reparar. A mesma imagem vinda de um
banco pago seria problema real com a mesma chance de passar despercebida.

*(Até 21/09/2026 as duas eram geradas por IA pelo autor, sob MIT. Foram trocadas
por fotografias de resolução muito maior — as anteriores estavam abaixo de
1920×1080, que era a fraqueza conhecida delas.)*

## Por que WebP, e por que 2560 e não o original

O alvo de build é `chrome130` (ver `electron.vite.config.ts`), então WebP é
nativo e não precisa de alternativa. Conversão a qualidade 0,78, redimensionadas
com Lanczos.

Os originais do Unsplash têm 4621×3072 e 5949×3518, e **não** são versionados —
nem usados. A escolha está medida no `ENGENHARIA.md`: o original **não** engasga
(o Chromium decodifica imagem numa thread própria, e o compositor não sente os
138 ms), mas também **não ganha nitidez**, porque a janela pede ~1584 px de
largura e os pixels a mais são descartados pelo reamostrador antes de virarem
luz. Ele cobraria 3,5–5× o bitmap em memória para entregar a mesma imagem na
tela.

## Trocar uma delas

Substituir o arquivo mantendo o nome basta — o CSS aponta para o nome, não para
um hash. Recomendações:

- **WebP**, qualidade 75–80. PNG é o container errado para fotografia: a mesma
  imagem sai várias vezes maior sem ganho visível.
- **2560 de largura, e não mais que isso.** Há um piso e um teto, e os dois têm
  motivo — este foi **medido**, e o registro completo está no `ENGENHARIA.md`.

  O piso é ~1920: abaixo disso as margens começam a denunciar, que era a
  fraqueza das imagens anteriores. No meio da tela não apareceria, porque o
  painel de vidro desfoca; nas margens, onde a foto fica nítida, um olhar atento
  nota.

  O teto **não** existe porque o original engasgue — ele não engasga, e isso foi
  medido: o Chromium decodifica imagem numa thread própria, e os 138 ms de uma
  foto de 21 MP não chegam ao compositor, que seguiu em 7,1 ms por frame. Existe
  porque o original **também não ganha nada**. A janela pede ~1584 px de largura
  a `devicePixelRatio` 1, então uma imagem de 4621 px já é reduzida 2,9× antes
  de virar luz, e a captura ampliada das margens não mostra vantagem nenhuma
  dela. O que o original cobra por essa imagem idêntica: 3,5–5× o bitmap em
  memória (`largura × altura × 4 bytes`, independente da compressão) e 2,5–3× o
  trabalho de decodificação.

  **Onde isso deixa de valer:** num monitor a `devicePixelRatio` 2 a janela
  pediria ~3168 px físicos e o 2560 passaria a subir de escala. A medição é
  `dpr` 1. Trocou de monitor, refaça a conta.
- **Cuidado com região clara na faixa de baixo.** É onde os cards pousam, e no
  tema escuro o texto é claro. Luz **difusa** ali o véu e o desfoque seguram bem
  — é o caso do núcleo da Via Láctea na `galaxia.webp` atual. Um **ponto** de
  luz é outra história: borrar não escurece um ponto, só o espalha (a galáxia
  anterior tinha uma fogueira, e foi ela que ditou o enquadramento de então).
  Se a imagem nova tiver um ponto assim, ajuste o `background-position` em vez
  de reforçar o véu, que escureceria a foto toda — e saiba que **o curso
  disponível depende da proporção**: uma imagem quase tão larga quanto a janela
  quase não desliza na vertical. Se não houver curso, recorte a imagem.

O usuário pode sobrepor qualquer uma delas pela sua própria imagem, em
**Configurações → Plano de fundo**. Nesse caso o arquivo dele é copiado para
`<pasta dos quadros>/.creation-board/fundos/` e estes aqui continuam sendo o
"padrão" para onde o botão *Restaurar padrão* volta.
