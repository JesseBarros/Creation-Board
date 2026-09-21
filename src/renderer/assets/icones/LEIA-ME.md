# Ícones desenhados à mão

Largue um `.png` aqui com o **nome do ícone** e ele passa a valer no lugar do
desenho SVG. Apagar o arquivo devolve o SVG. É o mecanismo inteiro — nenhuma
linha de código muda.

```
postit.png      →  substitui o ícone do post-it
caneta.png      →  substitui o da caneta
busca.png       →  substitui a lupa
```

Os nomes válidos são os do tipo `IconName`, em [`../../ui/icons.ts`](../../ui/icons.ts).
Nome errado não quebra nada: o arquivo é ignorado e o SVG continua valendo.

---

## Como o arquivo é usado

**O PNG não é exibido — ele recorta.** O app pinta um quadrado com a cor atual e
usa o **canal alfa** do seu arquivo como máscara: onde o PNG é opaco, aparece
cor; onde é transparente, não aparece nada.

A consequência prática, e é a parte boa: **a cor do seu arquivo é ignorada.**
Desenhe em preto, branco ou roxo — dá no mesmo. O ícone continua ficando
apagado quando o botão está desligado, azul quando liga, branco sobre a pílula
cheia, e invertendo sozinho entre tema claro e escuro. Sem isso, cada um desses
estados precisaria de um arquivo separado.

A contrapartida: o ícone fica **monocromático**. Um desenho de duas cores chega
achatado numa só.

---

## Especificação

| | |
|---|---|
| **Formato** | PNG com transparência real (canal alfa), não um fundo branco |
| **Tamanho** | 128×128 px, quadrado |
| **Desenho** | dentro de uma área central de ~104 px — deixe ~12 px de folga em volta |
| **Cor** | qualquer uma; só a opacidade conta |
| **Antisserrilhado** | ligado. As bordas suaves entram na máscara e deixam o ícone macio |

**Por que 128 e não 17.** O ícone é exibido a 17 px, mas o Windows escala a
interface em 125%, 150% e 175% — e nessas escalas ele é desenhado com mais
pixels do que 17. Reduzir uma imagem grande mantém nitidez; ampliar uma pequena
borra. 128 cobre até 175% com folga.

**Por que a folga de 12 px.** Os ícones SVG do app vivem todos dentro da mesma
área viva, e é isso que faz a fila parecer um conjunto em vez de uma coleção. Um
PNG que use a borda inteira aparecerá visivelmente maior que os vizinhos.

---

## Conferindo o resultado

A folha de contato renderiza todos os ícones lado a lado, em tamanho grande e no
tamanho real de uso, sobre a pastilha e sobre a pílula de ligado. É a forma de
julgar um ícone antes de ele entrar — quatro defeitos do conjunto SVG só
apareceram nela, incluindo um ícone que estava quebrado havia semanas.

Peça a folha quando trocar algum arquivo.
