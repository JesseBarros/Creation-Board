/**
 * Ícones desenhados à mão, em PNG, que substituem os do conjunto SVG.
 *
 * COMO USAR: largue um `.png` em `src/renderer/assets/icones/` com o nome do
 * ícone (`postit.png`, `caneta.png`, …) e ele passa a valer. Nada de código
 * muda — o `icon()` procura aqui primeiro e só cai no SVG quando não encontra.
 * Apagar o arquivo devolve o SVG. É o mecanismo inteiro.
 *
 * ---
 *
 * O PNG É USADO COMO MÁSCARA, e não como imagem, e essa é a decisão que faz o
 * resto funcionar.
 *
 * Um `<img>` pinta os pixels do arquivo. Isso quebraria três coisas que hoje
 * funcionam sozinhas: o ícone apagado vira azul quando o botão liga, fica branco
 * sobre a pílula cheia, e inverte entre tema claro e escuro. Com `<img>` cada
 * uma dessas cores exigiria um arquivo — quatro por ícone, e todos a refazer se
 * a cor de destaque mudar.
 *
 * Como MÁSCARA, o navegador usa só o canal ALFA do arquivo: onde o PNG é opaco,
 * ele pinta com `currentColor`; onde é transparente, não pinta. O desenho é seu,
 * a cor continua sendo do CSS. Por isso o arquivo pode ser preto, branco ou
 * roxo — a cor dele é ignorada, e o que importa é o recorte.
 *
 * A contrapartida é que o ícone fica MONOCROMÁTICO. Um desenho de duas cores
 * chega achatado numa só. Se um dia houver um ícone que precise de cor própria,
 * ele é a exceção e entra como `<img>`, do jeito que a marca do app já faz.
 *
 * `eager: true` porque são poucos arquivos e pequenos: carregar sob demanda
 * faria o ícone aparecer um frame depois do botão.
 */
const arquivos = import.meta.glob('../assets/icones/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Nome do ícone (o do arquivo, sem extensão) -> URL empacotada pelo Vite. */
export const ICONES_PNG: ReadonlyMap<string, string> = new Map(
  Object.entries(arquivos).map(([caminho, url]) => [
    caminho.replace(/^.*\//, '').replace(/\.png$/i, ''),
    url,
  ]),
);
