# Fontes embutidas

Uma fonte só, e para uma coisa só: o **título do menu principal**, que é a
assinatura do app na tela inicial.

| arquivo | fonte | pesos | tamanho | caracteres |
|---|---|---|---|---|
| `outfit.woff2` | Outfit (variável) | 100–900 | 32 KB | latim básico + latim-1 (acentos do português) |

## Por que esta, e por que embutida


**Embutida porque a CSP não deixa buscar fonte de fora** (`font-src 'self'
data:`) — e um app sem rede não deveria mesmo depender de um servidor de fontes
para desenhar a própria tela inicial.

O resto da interface continua na Segoe UI de propósito: a fonte de marca vale
para a marca. Espalhada por botões e cards, ela deixaria de ser assinatura e
viraria só mais uma fonte.

## Procedência e licença

**Licença: SIL Open Font License 1.1** (`OFL-outfit.txt`, ao lado) — e não a MIT
do restante do repositório. A OFL permite embutir e redistribuir a fonte com o
programa; não permite vendê-la sozinha, e o nome "Outfit" fica reservado aos
autores.

| | |
|---|---|
| autores | The Outfit Project Authors ([github.com/Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts)) |
| obtida de | pacote npm `@fontsource-variable/outfit` 5.3.0, arquivo `files/outfit-latin-wght-normal.woff2` |
| SHA-256 | `6c18d579fd87c3776be068b762cbc83fde3acb543d49eabd3ade842eb987e887` |

Trocar a fonte é substituir `outfit.woff2` mantendo o nome; o `@font-face` está
em `styles/base.css`, junto do token `--font-marca`.
