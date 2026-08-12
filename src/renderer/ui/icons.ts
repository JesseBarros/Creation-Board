/**
 * Icones da interface, desenhados em SVG.
 *
 * Em SVG e nao em glifo de fonte por um motivo concreto: um `▦` ou um `⌗`
 * depende da fonte instalada e do fallback do sistema para desenhar -- muda de
 * maquina para maquina, e as vezes vira um retangulo vazio. Aqui a forma e a
 * mesma em qualquer lugar, acompanha a cor do texto (`currentColor`) e escala
 * com o zoom da interface sem serrilhar.
 *
 * Todos partem do mesmo desenho: caixa de 24, traco de 1,75, pontas
 * arredondadas. E o que faz uma fila de icones parecer um conjunto em vez de
 * uma colecao.
 */

export type IconName =
  // barra inferior
  | 'voltar'
  | 'salvar'
  | 'exportar'
  | 'desfazer'
  | 'refazer'
  | 'grade'
  | 'ima'
  | 'regua'
  | 'ajustar'
  | 'sol'
  | 'lua'
  | 'comandos'
  | 'menos'
  | 'mais'
  // barra lateral: ferramentas
  | 'selecionar'
  | 'caneta'
  | 'marcaTexto'
  | 'lapis'
  | 'texto'
  | 'postit'
  | 'formas'
  | 'borracha'
  // barra lateral: formas
  | 'retangulo'
  | 'elipse'
  | 'triangulo'
  | 'losango'
  | 'linha'
  | 'seta'
  | 'preencher'
  // barra lateral: modos da borracha
  | 'apagarPeca'
  | 'apagarTraco'
  // painel de camadas (M8)
  | 'camadas'
  | 'olho'
  | 'olhoFechado'
  | 'cadeado'
  | 'cadeadoAberto'
  | 'subir'
  | 'descer';

/**
 * Traços de cada ícone, em coordenadas de uma caixa 24x24.
 *
 * **Todos vivem dentro de uma área de 16x16, entre 4 e 20.** Essa regra é o que
 * mais mudou em 12/08/2026, a pedido dele ("o mais clean possível"): antes cada
 * ícone tinha a sua própria extensão — a grade ia de 4 a 20, a régua de 3 a 21,
 * o ímã de 4 a 17 — e o peso óptico variava tanto que a fila parecia desalinhada
 * mesmo estando alinhada. Com a mesma área viva, eles viram um conjunto.
 *
 * As exceções são deliberadas e são poucas: os traços que *representam* a
 * largura de algo (o rastro do marca-texto, a base do salvar) passam do limite
 * de propósito.
 */
const PATHS: Record<IconName, string[]> = {
  voltar: ['M14.5 5.5L8 12l6.5 6.5'],
  // Bandeja com seta para BAIXO: guardar no disco. A bandeja (dois lados que
  // sobem) diz "entra aqui"; a linha reta que havia antes so dizia "chao".
  salvar: ['M12 4.5v8.6', 'M8.4 9.7l3.6 3.6 3.6-3.6', 'M4.8 15v2.5a2 2 0 002 2h10.4a2 2 0 002-2V15'],
  // A MESMA bandeja, seta para CIMA: tirar do app para fora. Os dois so se
  // distinguem pela direcao da seta, e e assim que se le "o par".
  exportar: ['M12 13.1V4.5', 'M8.4 8.1L12 4.5l3.6 3.6', 'M4.8 15v2.5a2 2 0 002 2h10.4a2 2 0 002-2V15'],
  desfazer: ['M9 7.5L5 12l4 4.5', 'M5 12h8.5a4.5 4.5 0 014.5 4.5v1.5'],
  refazer: ['M15 7.5l4 4.5-4 4.5', 'M19 12h-8.5A4.5 4.5 0 006 16.5v1.5'],
  // Janela dividida em quatro, e nao quatro linhas soltas: com moldura o icone
  // tem silhueta -- fechado, ele se reconhece de longe e aguenta ficar
  // translucido sem virar quatro riscos perdidos.
  grade: ['M6.2 5h11.6a1.8 1.8 0 011.8 1.8v10.4a1.8 1.8 0 01-1.8 1.8H6.2a1.8 1.8 0 01-1.8-1.8V6.8A1.8 1.8 0 016.2 5z', 'M12 5v14', 'M4.4 12h15.2'],
  // Imã em U, com as duas pontas. Ocupa a area viva inteira (4.5 a 19.5): antes
  // ele parava em 17 e ficava visivelmente menor que os vizinhos na mesma fila.
  ima: ['M6.4 4.5v8a5.6 5.6 0 0011.2 0v-8h-3.7v8a1.9 1.9 0 01-3.8 0v-8z', 'M6.4 8.6h3.8', 'M13.9 8.6h3.7'],
  // Marcas de tamanhos diferentes, como numa regua de verdade -- quatro iguais
  // liam como uma cerca.
  //
  // A caixa e mais alta do que parece necessario (7,5 contra 6) por um motivo
  // de tamanho pequeno: descontado o traco, sobram menos de 3px de vao aos 17px
  // de tela, e as marcas encostam no lado de baixo. Com o vao maior, a regua
  // continua sendo uma regua mesmo quando o botao esta ligado e preenchido.
  regua: [
    'M6 8.2h12a2 2 0 012 2v3.6a2 2 0 01-2 2H6a2 2 0 01-2-2v-3.6a2 2 0 012-2z',
    'M8.4 8.2v2.6',
    'M12 8.2v3.6',
    'M15.6 8.2v2.6',
  ],
  ajustar: ['M4.5 9V4.5H9', 'M19.5 9V4.5H15', 'M4.5 15v4.5H9', 'M19.5 15v4.5H15'],
  // Sol e lua, e nao um circulo meio preenchido: o interruptor de tema mostra
  // PARA ONDE vai, e um crescente diz "escuro" sem precisar de legenda.
  sol: [
    'M15.2 12a3.2 3.2 0 11-6.4 0 3.2 3.2 0 016.4 0z',
    'M12 4.2v1.8',
    'M12 18v1.8',
    'M4.2 12H6',
    'M18 12h1.8',
    'M6.5 6.5l1.3 1.3',
    'M16.2 16.2l1.3 1.3',
    'M17.5 6.5l-1.3 1.3',
    'M7.8 16.2l-1.3 1.3',
  ],
  lua: ['M19.5 14.6A8 8 0 019.4 4.5a8 8 0 1010.1 10.1z'],
  // Teclado: a tela que ele abre e a lista de teclas. Tres teclas e nao quatro
  // -- a quarta nao acrescentava informacao e fechava os vaos.
  comandos: [
    'M6 7.5h12a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5a2 2 0 012-2z',
    'M8 11h.01',
    'M12 11h.01',
    'M16 11h.01',
    'M9.4 14h5.2',
  ],
  menos: ['M5.5 12h13'],
  mais: ['M12 5.5v13', 'M5.5 12h13'],

  // A seta do cursor, em CONTORNO como todos os outros. Ela era o unico icone
  // preenchido da fila, e por isso pesava mais que os vizinhos.
  selecionar: ['M7 4.6l9.6 6.2-4.3 1 1.9 4.4-2 .9-1.9-4.4-3.3 2.6z'],
  // Caneta e lapis dividem o corpo inclinado; o que os separa e a ponta --
  // a caneta termina em bico, o lapis tem a madeira marcada.
  caneta: ['M5 19l1.2-4L16 5.2l2.8 2.8L9 17.8z', 'M14.2 7l2.8 2.8'],
  lapis: ['M5 19l1.2-4L16 5.2l2.8 2.8L9 17.8z', 'M13 8.2l2.8 2.8', 'M6.4 14.8l2.8 2.8'],
  // Marca-texto: corpo CURTO e GORDO com ponta chanfrada, mais o rastro largo
  // embaixo. Antes ele dividia o corpo comprido com a caneta e os dois se
  // confundiam na barra; agora a silhueta e outra desde longe.
  marcaTexto: ['M9 13.8l4.6-4.6 3.6 3.6-4.6 4.6H9z', 'M12.6 8.2l3.6 3.6', 'M4.5 19.8h15'],
  texto: ['M6.5 5.5h11', 'M12 5.5v13', 'M9 18.5h6'],
  // Post-it: o canto dobrado fica EMBAIXO, e nao em cima. Em cima ele e o
  // desenho universal de "documento", e era isso que o icone dizia.
  postit: [
    'M6.4 4.5h11.2a1.9 1.9 0 011.9 1.9v6.7L13.6 19.5H6.4a1.9 1.9 0 01-1.9-1.9V6.4a1.9 1.9 0 011.9-1.9z',
    'M19.5 13.1h-4a1.9 1.9 0 00-1.9 1.9v4.5',
  ],
  // Um quadrado e um circulo se cruzando: e a ferramenta das varias formas.
  formas: [
    'M6.2 5.5h5.6a1.7 1.7 0 011.7 1.7v5.6a1.7 1.7 0 01-1.7 1.7H6.2a1.7 1.7 0 01-1.7-1.7V7.2A1.7 1.7 0 016.2 5.5z',
    'M19.5 14.6a5 5 0 11-10 0 5 5 0 0110 0z',
  ],
  borracha: ['M5 15l6.6-6.6a1.5 1.5 0 012.1 0l3.9 3.9a1.5 1.5 0 010 2.1L14 18H8.2z', 'M4.5 19.8h15', 'M9.3 10.3l5.7 5.7'],

  // As PREVIAS das formas: aqui o desenho e o proprio objeto que sera criado,
  // entao os cantos seguem a forma de verdade e nao a linguagem da interface.
  // Arredondar o triangulo aqui prometeria um triangulo arredondado no quadro.
  retangulo: ['M4.5 6.5h15v11h-15z'],
  elipse: ['M19.5 12a7.5 5.5 0 11-15 0 7.5 5.5 0 0115 0z'],
  triangulo: ['M12 5.5l7.5 13h-15z'],
  losango: ['M12 4.5l7.5 7.5-7.5 7.5-7.5-7.5z'],
  linha: ['M5 19L19 5'],
  seta: ['M5 19L19 5', 'M19 11.5V5h-6.5'],
  preencher: ['M4.5 6.5h15v11h-15z', 'M4.5 6.5h7.5v11H4.5z'],

  // Apagar por peca: o rastro come um pedaco do traco e o resto fica.
  apagarPeca: ['M3 12h4', 'M17 12h4', 'M15.5 12a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z'],
  // Apagar o traco inteiro: a linha toda riscada.
  apagarTraco: ['M4 12h16', 'M8.5 7.5l7 9', 'M15.5 7.5l-7 9'],

  // Painel de camadas. Folhas empilhadas, e nao um "L" de lista: o que o painel
  // mostra e uma PILHA, e a ordem dela e o assunto.
  camadas: ['M12 4l8 4.5-8 4.5-8-4.5z', 'M4 13l8 4.5 8-4.5'],
  olho: ['M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z', 'M14.5 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z'],
  // O olho fechado e o MESMO olho com um corte por cima, e nao outro desenho:
  // ligado e desligado tem de se reconhecer como o mesmo controle.
  olhoFechado: ['M2.5 12S6 6.5 12 6.5c1.6 0 3 .4 4.2 1M21.5 12s-1.4 2.2-3.8 3.8', 'M4 4l16 16'],
  cadeado: [
    'M7.6 10.6h8.8a2 2 0 012 2v5.4a2 2 0 01-2 2H7.6a2 2 0 01-2-2v-5.4a2 2 0 012-2z',
    'M9.2 10.6V8.2a2.8 2.8 0 015.6 0v2.4',
  ],
  cadeadoAberto: [
    'M7.6 10.6h8.8a2 2 0 012 2v5.4a2 2 0 01-2 2H7.6a2 2 0 01-2-2v-5.4a2 2 0 012-2z',
    'M9.2 10.6V8.2a2.8 2.8 0 015.3-1.2',
  ],
  subir: ['M12 19V6', 'M7 11l5-5 5 5'],
  descer: ['M12 5v13', 'M7 13l5 5 5-5'],
};

/** Ícones cujo segundo traço é preenchido, e não contornado. */
const FILLED_SECOND: ReadonlySet<IconName> = new Set(['preencher']);

export function icon(name: IconName, size = 17): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // Decorativo: quem nomeia o botao e o `aria-label` dele, e nao o desenho.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  PATHS[name].forEach((d, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (i === 1 && FILLED_SECOND.has(name)) {
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'none');
    }
    svg.append(path);
  });

  return svg;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A marca do aplicativo, em miniatura.
 *
 * Nao entra no `PATHS` acima porque ela e a unica coisa aqui que NAO acompanha
 * a cor do texto: os outros sao icones de comando e mudam com o tema, esta e a
 * identidade e tem cor propria. Misturar as duas coisas no mesmo mecanismo faria
 * a marca desbotar junto com a interface.
 *
 * E a MESMA geometria do glifo pequeno do icone do sistema (`build/glyph.js`),
 * nas mesmas fracoes. As duas precisam ser reconheciveis como a mesma coisa: a
 * pessoa ve uma na barra de tarefas e a outra dentro do app, lado a lado.
 */
export function brandMark(size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  const gid = 'qb-marca-grad';
  grad.setAttribute('id', gid);
  grad.setAttribute('x1', '16');
  grad.setAttribute('y1', '78');
  grad.setAttribute('x2', '84');
  grad.setAttribute('y2', '30');
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  for (const [offset, cor] of [
    ['0', '#2b5cf0'],
    ['1', '#4c9dff'],
  ] as const) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', cor);
    grad.append(stop);
  }
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.append(grad);
  svg.append(defs);

  const add = (tag: string, attrs: Record<string, string>): void => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };

  // Ladrilho de fundo, na cor da logo.
  add('rect', { x: '0', y: '0', width: '100', height: '100', rx: '22', fill: '#0a0d16' });
  // O quadro, aberto no canto superior direito. O `stroke-dasharray` desenha o
  // contorno inteiro menos a faixa da abertura -- mais curto que descrever o
  // caminho aberto a mao, e o retangulo continua sendo um retangulo.
  add('rect', {
    x: '16.5', y: '30', width: '67', height: '47', rx: '8',
    fill: 'none', stroke: `url(#${gid})`, 'stroke-width': '8.8', 'stroke-linecap': 'round',
    'stroke-dasharray': '150 34', 'stroke-dashoffset': '-18',
  });
  // O rabisco: duas subidas altas (ver o porque em build/glyph.js).
  add('polyline', {
    points: '30,62 38,44 47,61 56,44 65,58',
    fill: 'none', stroke: '#6cc4ff', 'stroke-width': '7',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  // A caneta apoiada na borda de baixo.
  add('line', {
    x1: '45', y1: '73.5', x2: '62', y2: '73.5',
    stroke: '#eef2f8', 'stroke-width': '5', 'stroke-linecap': 'round',
  });

  return svg;
}
