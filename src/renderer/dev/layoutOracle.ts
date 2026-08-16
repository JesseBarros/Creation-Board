/**
 * Oraculo de layout: a posicao VERDADEIRA de cada objeto de um export do
 * outro aplicativo, medida pelo motor de CSS em vez de deduzida por nos.
 *
 * Por que existe: o importador le `left/top` e a matriz do estilo inline e
 * calcula a posicao na mao. Esse calculo tem armadilhas -- a classe `align`
 * muda o significado de `left/top`, e a matriz e aplicada a partir do centro da
 * caixa, nao do canto. Errar qualquer uma desloca o objeto no quadro.
 *
 * Em vez de escolher uma hipotese e torcer, montamos o HTML num iframe fora da
 * tela e perguntamos ao Chromium onde cada elemento REALMENTE ficou. O
 * resultado serve de gabarito para conferir a aritmetica do importador com
 * numero, nao com impressao visual.
 *
 * Ferramenta de desenvolvimento: nao entra no caminho da importacao normal.
 * O iframe roda com `sandbox="allow-same-origin"` e SEM `allow-scripts` --
 * mede-se o documento, mas nada dentro dele executa.
 */

export interface MeasuredRect {
  /** Valor de `data-whiteboard-type` da ancora. */
  kind: string;
  /** Canto superior esquerdo e tamanho, em coordenadas de MUNDO. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Como o navegador resolveu o texto desta ancora: alinhamento, fonte e altura
   * de linha JA COMPUTADAS. E o que transforma "a caixa nao fecha" em "a caixa
   * nao fecha porque a fonte que entrou nao e a que o importador assumiu" --
   * sem isto, so o desvio numerico e todo diagnostico vira palpite.
   */
  detail?: string;
}

/**
 * Elemento que representa visualmente cada tipo de objeto.
 *
 * A ancora e um container que pode ter folga em volta do conteudo; medir ela
 * responderia a pergunta errada. O importador tira largura e altura desses
 * elementos internos, entao e neles que a comparacao fecha.
 */
const CONTENT_SELECTOR: Record<string, string> = {
  AzureImage: '.imageComponent',
  PlainText: '.textbox',
  Note: '.textbox',
  // Tinta: a uniao dos tracos, e nao a caixa do <svg>. O elemento SVG e maior
  // que o desenho, entao compara-lo com o bbox dos caminhos acusaria uma
  // diferenca que nao e erro de posicao.
  InkGroup: 'g.inkStroke path',
};

/** Mede todas as ancoras de um export, na mesma ordem em que o importador as visita. */
export async function measureLayout(html: string): Promise<MeasuredRect[]> {
  const frame = document.createElement('iframe');
  // Fora da tela, mas COM layout: `display:none` nao posiciona nada e zeraria
  // todas as medidas. E preciso caber o quadro inteiro sem recorte.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText =
    'position:fixed;left:-20000px;top:0;width:3000px;height:3000px;border:0;visibility:hidden';

  // `srcdoc` ANTES de entrar no DOM: um iframe inserido sem conteudo carrega
  // `about:blank` primeiro e dispara um `load` proprio. Esperar por esse evento
  // devolveria o documento em branco, e a medicao sairia toda zerada.
  frame.srcdoc = html;

  const ready = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener('error', () => reject(new Error('iframe falhou ao carregar')), {
      once: true,
    });
  });

  document.body.append(frame);
  try {
    await ready;

    const doc = frame.contentDocument;
    if (!doc) throw new Error('documento do iframe inacessivel');

    // O export inteiro vive dentro de um contêiner com translate+scale para
    // caber na pagina. Desfazer essa transformacao devolve as coordenadas de
    // mundo, que sao as que o importador grava.
    const stage = doc.querySelector<HTMLElement>('.transformComponent');
    const origin = doc.querySelector<HTMLElement>('#canvasContent') ?? stage;
    if (!stage || !origin) {
      // Diagnostico junto: sem ele, "nao encontrado" nao distingue um export de
      // formato diferente de um iframe que carregou vazio.
      throw new Error(
        `contêiner do quadro nao encontrado (readyState=${doc.readyState}, ` +
          `body=${doc.body?.innerHTML.length ?? 0} chars, ` +
          `ancoras=${doc.querySelectorAll('[data-whiteboard-type]').length})`,
      );
    }

    const scale = readScale(frame.contentWindow, stage);
    if (!Number.isFinite(scale) || scale === 0) {
      throw new Error(`escala do contêiner invalida: ${scale}`);
    }

    const base = origin.getBoundingClientRect();
    const out: MeasuredRect[] = [];

    for (const anchor of doc.querySelectorAll<HTMLElement>('[data-whiteboard-type]')) {
      const kind = anchor.dataset['whiteboardType'] ?? '';
      const sel = CONTENT_SELECTOR[kind];
      // Varios elementos por ancora (tinta): o objeto e a uniao deles.
      const targets = sel ? [...anchor.querySelectorAll<Element>(sel)] : [];
      const r = unionRects(targets.length > 0 ? targets : [anchor]);

      const detail =
        kind === 'PlainText' || kind === 'Note'
          ? describeText(frame.contentWindow, anchor, scale)
          : undefined;

      out.push({
        kind,
        x: (r.left - base.left) / scale,
        y: (r.top - base.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
        ...(detail ? { detail } : {}),
      });
    }

    return out;
  } finally {
    frame.remove();
  }
}

/**
 * Estilo de texto ja resolvido pelo navegador, mais o teto de quebra declarado.
 *
 * O `max-width` vem do estilo inline (e o que o importador le); a fonte e a
 * altura de linha vem do estilo COMPUTADO, que e onde a heranca e a fonte
 * substituta aparecem.
 */
function describeText(win: Window | null, anchor: HTMLElement, scale: number): string {
  const box = anchor.querySelector<HTMLElement>('.textbox');
  const core = anchor.querySelector<HTMLElement>('.textBoxCore');
  if (!box) return '';
  const cs = (win ?? window).getComputedStyle(core ?? box);
  const r = box.getBoundingClientRect();
  return (
    `ancora=${anchor.className || '(sem classe)'} ` +
    `maxW=${box.style.maxWidth || '-'} fonte=${cs.fontFamily} ${cs.fontSize} ` +
    `peso=${cs.fontWeight} entrelinha=${cs.lineHeight} ` +
    `caixa=${(r.width / scale).toFixed(1)}x${(r.height / scale).toFixed(1)}` +
    // O que o IMPORTADOR le e o estilo inline, nao o computado. Sao coisas
    // diferentes quando o valor vem de heranca, de classe ou de variavel CSS --
    // e e nessa diferenca que a fonte usada para medir deixa de ser a fonte
    // usada para desenhar.
    ` | inline: familia=${core?.style.fontFamily || '-'} ` +
    `peso=${core?.style.fontWeight || '-'} tamanho=${box.style.fontSize || '-'}` +
    ` | espacamento=${cs.letterSpacing}/${cs.wordSpacing} caixaAlta=${cs.textTransform}` +
    ` linhas=${lineBoxes(core ?? box)} chars=${(core ?? box).textContent?.length ?? 0}`
  );
}

/**
 * Quantas linhas o navegador realmente formou.
 *
 * Um `Range` sobre o conteudo devolve um retangulo por caixa de linha; contar
 * retangulos distintos por altura da o numero de linhas sem depender de
 * interpretar o HTML. E o dado que separa "medimos a fonte errada" de "quebramos
 * em lugares diferentes".
 */
function lineBoxes(el: Element): number {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const tops = new Set<number>();
  for (const r of range.getClientRects()) tops.add(Math.round(r.top));
  return tops.size;
}

/** Retangulo que envolve todos os elementos, em coordenadas de tela do iframe. */
function unionRects(els: readonly Element[]): DOMRect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.left < left) left = r.left;
    if (r.top < top) top = r.top;
    if (r.right > right) right = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }

  return new DOMRect(left, top, right - left, bottom - top);
}

/** Fator de escala do contêiner, lido da matriz ja resolvida pelo navegador. */
function readScale(win: Window | null, el: HTMLElement): number {
  const t = (win ?? window).getComputedStyle(el).transform;
  if (!t || t === 'none') return 1;
  const n = t
    .slice(t.indexOf('(') + 1, t.lastIndexOf(')'))
    .split(',')
    .map((v) => parseFloat(v.trim()));
  // matrix(a,b,c,d,tx,ty) -- sem rotacao aqui, `a` e a escala horizontal.
  return Number.isFinite(n[0]) ? n[0]! : 1;
}
