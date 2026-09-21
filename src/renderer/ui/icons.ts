import { ICONES_PNG } from './iconesPersonalizados';

/**
 * Icones da interface.
 *
 * A MAIORIA VEM DO LUCIDE (lucide.dev), sob licenca ISC/MIT -- o texto esta em
 * `assets/icones/LICENSE-lucide.txt`, e e a unica obrigacao que essas licencas
 * impoem: nenhuma tela de creditos, nenhum link, nenhum pagamento.
 *
 * A troca aconteceu em 21/09/2026. O conjunto anterior era desenhado a mao aqui
 * dentro e o veredito dele foi direto: [...]. Desenhar quarenta icones consistentes e trabalho de quem faz isso
 * em tempo integral -- o Lucide tem 2.112 deles, na mesma grade de 24, e
 * resolvidos por gente que conhece o oficio.
 *
 * O QUE **NAO** VEIO DO LUCIDE, e por que:
 *
 *   - as PREVIAS DE FORMA (retangulo, elipse, triangulo, losango, linha, seta,
 *     preencher). Elas nao sao icones de comando: sao o desenho do objeto que
 *     vai nascer no quadro. Um triangulo de cantos arredondados prometeria um
 *     triangulo arredondado;
 *   - os MODOS DA BORRACHA (apagar peca, apagar traco). Nao existe equivalente:
 *     sao uma distincao deste app.
 *
 * ---
 *
 * DUAS CAMADAS. O Lucide e monolinha puro; aqui cada icone pode ganhar um CORPO
 * preenchido, desenhado atras do contorno em opacidade baixa.
 *
 * Isso nao e enfeite -- foi o que resolveu a barra de vidro. Com a superficie da
 * barra 100% transparente, contorno sozinho perde a forma sobre um resumo denso;
 * o corpo segura a silhueta quando o traco perde contraste. E continua UMA cor
 * so: o preenchimento e `currentColor`, entao tema, destaque e pilula branca
 * seguem funcionando sem uma variante por estado.
 *
 * Quem tem corpo e escolha: icone que e um GESTO (desfazer, mais, alinhar) nao
 * tem, porque gesto nao tem dentro; icone que e um OBJETO (post-it, cadeado,
 * teclado) tem. Preencher tudo deixaria a fila pesada e apagaria a distincao.
 *
 * ---
 *
 * E QUALQUER `.png` largado em `assets/icones/` com o nome de um icone substitui
 * o desenho, sem mexer em codigo -- ver iconesPersonalizados.ts.
 */

export type IconName =
  // barra inferior
  | 'voltar'
  | 'salvar'
  | 'exportar'
  | 'desfazer'
  | 'refazer'
  | 'grade'
  | 'regua'
  | 'ajustar'
  | 'sol'
  | 'lua'
  | 'alinharEsquerda'
  | 'alinharCentro'
  | 'alinharDireita'
  | 'comandos'
  | 'menos'
  | 'mais'
  // busca
  | 'busca'
  | 'fechar'
  // ferramentas
  | 'selecionar'
  | 'caneta'
  | 'marcaTexto'
  | 'lapis'
  | 'texto'
  | 'postit'
  | 'formas'
  | 'borracha'
  // seletor de formas -- desenhados aqui
  | 'retangulo'
  | 'elipse'
  | 'triangulo'
  | 'losango'
  | 'linha'
  | 'seta'
  | 'preencher'
  // modos da borracha -- desenhados aqui
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
 * Um icone: o miolo do SVG, e quais dos elementos dele levam corpo.
 *
 * `corpo` guarda INDICES, e nao um caminho a parte. A razao e que as duas
 * camadas precisam coincidir exatamente: repetir o desenho como fill separado
 * abriria espaco para uma das copias sair meio pixel fora da outra na primeira
 * vez que alguem editasse so uma delas.
 */
interface IconSpec {
  svg: string;
  corpo?: number[];
}

const ICONS: Record<IconName, IconSpec> = {
  voltar: { svg: '<path d="m15 18-6-6 6-6" />' },
  salvar: {
    svg: '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
    corpo: [1],
  },
  exportar: {
    svg: '<path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />',
    corpo: [2],
  },
  desfazer: { svg: '<path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />' },
  refazer: { svg: '<path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />' },
  grade: {
    svg: '<path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />',
    corpo: [2],
  },
  // A regua do Lucide ja e diagonal -- e por isso nao se confunde com o teclado,
  // que foi o defeito do conjunto anterior. SEM corpo: as marcas sao o que faz
  // uma regua ser uma regua, e com tinta atras elas somem aos 17px.
  regua: {
    svg: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" />',
  },
  ajustar: {
    svg: '<path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />',
  },
  sol: {
    svg: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />',
    corpo: [0],
  },
  lua: {
    svg: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />',
    corpo: [0],
  },
  alinharEsquerda: { svg: '<path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" />' },
  alinharCentro: { svg: '<path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" />' },
  alinharDireita: { svg: '<path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" />' },
  comandos: {
    svg: '<path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" />',
    corpo: [8],
  },
  menos: { svg: '<path d="M5 12h14" />' },
  mais: { svg: '<path d="M5 12h14" /><path d="M12 5v14" />' },

  // A LUPA -- ela nao existia no conjunto anterior, e o campo "buscar em todos
  // os quadros" usava o icone de TECLADO no lugar dela.
  busca: { svg: '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />', corpo: [1] },
  fechar: { svg: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />' },

  selecionar: {
    svg: '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
    corpo: [0],
  },
  caneta: {
    svg: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />',
    corpo: [0],
  },
  marcaTexto: {
    svg: '<path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />',
    corpo: [0],
  },
  // Caneta e lapis dividem o corpo inclinado; o que os separa e a marca da
  // madeira perto da ponta.
  lapis: {
    svg: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
    corpo: [0],
  },
  texto: {
    svg: '<path d="M12 4v16" /><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /><path d="M9 20h6" />',
  },
  /*
    O POST-IT continua sendo o nosso, e nao o `sticky-note` do Lucide.

    O deles poe a dobra no canto de CIMA -- e ali ela e o desenho universal de
    "documento", nao de post-it. O conjunto anterior ja tinha resolvido isso: a
    dobra vai EMBAIXO, que e onde ela fica num papel colado na parede. Visto na
    folha de contato lado a lado, o do Lucide lia como arquivo.

    Vale registrar que trocar de biblioteca nao e motivo para jogar fora uma
    decisao que ja tinha sido tomada por um motivo.
  */
  postit: {
    svg: '<path d="M6.4 4.5h11.2a1.9 1.9 0 0 1 1.9 1.9v6.7L13.6 19.5H6.4a1.9 1.9 0 0 1-1.9-1.9V6.4a1.9 1.9 0 0 1 1.9-1.9z" /><path d="M19.5 13.1h-4a1.9 1.9 0 0 0-1.9 1.9v4.5" />',
    corpo: [0],
  },
  // So o CIRCULO leva corpo -- preencher as tres formas apagaria o cruzamento
  // entre elas, que e justamente o que diz [...].
  formas: {
    svg: '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" /><rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" />',
    corpo: [2],
  },
  borracha: {
    svg: '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /><path d="m5.082 11.09 8.828 8.828" />',
    corpo: [0],
  },

  /*
    As PREVIAS das formas, desenhadas aqui e nao trazidas do Lucide.

    Aqui o desenho e o proprio objeto que sera criado, entao os cantos seguem a
    forma de verdade e nao a linguagem da interface -- arredondar o triangulo
    prometeria um triangulo arredondado no quadro.

    E por isso tambem que elas nao levam corpo: preenchidas, prometeriam uma
    forma preenchida, e quem decide isso e o botao `preencher`, ao lado.
  */
  retangulo: { svg: '<path d="M4.5 6.5h15v11h-15z" />' },
  elipse: { svg: '<path d="M19.5 12a7.5 5.5 0 1 1-15 0 7.5 5.5 0 0 1 15 0z" />' },
  triangulo: { svg: '<path d="M12 5.5l7.5 13h-15z" />' },
  losango: { svg: '<path d="M12 4.5l7.5 7.5-7.5 7.5-7.5-7.5z" />' },
  linha: { svg: '<path d="M5 19L19 5" />' },
  seta: { svg: '<path d="M5 19L19 5" /><path d="M19 11.5V5h-6.5" />' },
  /*
    Meio cheio, meio vazio: o botao mostra os dois estados que ele alterna.

    O preenchimento e SOLIDO, e nao os 16% do corpo duotone -- ele nao esta ali
    para dar silhueta, esta ali para DIZER "cheio". Em 16% ele apareceu na folha
    de contato como um cinza lavado, e o icone virava um retangulo com um risco
    no meio. Por isso o `fill` vem escrito no proprio elemento, fora do
    mecanismo de corpo.
  */
  preencher: {
    svg: '<path d="M4.5 6.5h15v11h-15z" /><path d="M4.5 6.5h7.5v11H4.5z" fill="currentColor" stroke="none" />',
  },

  /*
    Os MODOS DA BORRACHA. Nao existem no Lucide porque sao uma distincao deste
    app: apagar um PEDACO do traco contra apagar o traco INTEIRO.

    O par foi desenhado para se ler um contra o outro -- em cima, a borracha
    come o meio da linha e as pontas ficam; embaixo, a curva de tinta de um lado
    e o X do outro, com sujeito e predicado separados.
  */
  apagarPeca: {
    svg: '<path d="M3 12h4" /><path d="M17 12h4" /><path d="M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z" />',
    corpo: [2],
  },
  apagarTraco: {
    svg: '<path d="M3.8 15.2c2.2-4.6 4.4-4.6 6.6 0" /><path d="M14 8.6l5.6 5.6" /><path d="M19.6 8.6L14 14.2" />',
  },

  // So a folha de CIMA leva corpo: e ela que esta na frente, e o degrade de peso
  // e o que desenha a pilha.
  camadas: {
    svg: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
    corpo: [0],
  },
  olho: {
    svg: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />',
    corpo: [1],
  },
  // Sem corpo: o que ele diz e ausencia.
  olhoFechado: {
    svg: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
  },
  cadeado: {
    svg: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
    corpo: [0],
  },
  cadeadoAberto: {
    svg: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />',
    corpo: [0],
  },
  subir: { svg: '<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />' },
  descer: { svg: '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />' },
};

/**
 * Opacidade do corpo.
 *
 * 0,16 nao e chute: e o mesmo valor da pilula de "ligado" da barra, e a razao e
 * a mesma medida no B16 -- acima disso o preenchimento passa a competir com o
 * contorno e o icone vira uma mancha com um risco em volta; abaixo, ele some no
 * tema escuro, onde a diferenca entre 8% e nada e invisivel.
 */
const CORPO_OPACIDADE = '0.16';

/**
 * Espessura do traco.
 *
 * 2 e a do Lucide, e as curvas deles foram desenhadas PARA ela: os raios de
 * canto e as folgas entre elementos assumem esse peso. O conjunto anterior
 * usava 1,75, e manter esse valor aqui deixaria os icones visivelmente mais
 * magros do que o desenho original previa.
 */
const TRACO = '2';

/**
 * O icone, como elemento pronto para entrar num botao.
 *
 * Devolve `Element` e nao `SVGSVGElement` porque ele pode ser duas coisas: o
 * desenho vetorial, ou um `<span>` mascarado por um PNG desenhado a mao (ver
 * iconesPersonalizados.ts). Quem chama nao precisa saber qual -- os dois herdam
 * a cor do texto e ocupam o mesmo quadrado.
 */
export function icon(name: IconName, size = 17): Element {
  const png = ICONES_PNG.get(name);
  if (png) return iconePng(png, size);
  return iconeSvg(name, size);
}

/**
 * O PNG vira uma mascara sobre uma caixa da cor atual.
 *
 * `background-color: currentColor` e o que pinta, e a mascara e o que recorta.
 */
function iconePng(url: string, size: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'qb-icone-png';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.setProperty('--icone', `url("${url}")`);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function iconeSvg(name: IconName, size: number): SVGSVGElement {
  const spec = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', TRACO);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // Decorativo: quem nomeia o botao e o `aria-label` dele, e nao o desenho.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  // O miolo e uma string CONSTANTE deste arquivo -- nunca vem de fora --, entao
  // nao ha caminho por onde um conteudo de terceiro chegue aqui.
  svg.innerHTML = spec.svg;

  /*
    O corpo e uma CLONAGEM do elemento, inserida antes dele.

    Clonar em vez de preencher o proprio elemento e o que permite ter as duas
    camadas: o original continua sendo so contorno, e a copia atras so
    preenchimento. Preencher o proprio elemento daria uma forma so, com o
    contorno grudado no preenchimento -- que e um desenho diferente, e mais
    pesado.
  */
  for (const i of spec.corpo ?? []) {
    const alvo = svg.children[i];
    if (!alvo) continue;
    const copia = alvo.cloneNode(false) as SVGElement;
    copia.setAttribute('fill', 'currentColor');
    copia.setAttribute('fill-opacity', CORPO_OPACIDADE);
    copia.setAttribute('stroke', 'none');
    svg.insertBefore(copia, svg.firstChild);
  }

  return svg;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A marca do aplicativo, em miniatura.
 *
 * Nao entra no conjunto acima porque ela e a unica coisa aqui que NAO acompanha
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
