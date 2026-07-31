import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import { transformPath } from '@shared/geometry/svgPath';
import type {
  BoardObject,
  ImageObject,
  NoteObject,
  PathObject,
  TextObject,
  Transform,
} from '@shared/model/types';
import type { ImportReport } from '@shared/importer';
import { textFont, wrap } from '../../render/painters/text';
import type { AssetStore } from '../images/AssetStore';
import { dataUriToBlob } from '../images/dataUri';

/**
 * Importador da exportacao HTML do Microsoft Whiteboard.
 *
 * Formato de entrada (verificado em exports reais): cada objeto do quadro e uma
 * div `.anchor` com `data-whiteboard-type`, posicionada por `style="left/top"`
 * em coordenadas de mundo e opcionalmente escalada por uma matriz CSS. Todo o
 * conteudo vem embutido -- imagens em base64, tinta em SVG -- entao o arquivo e
 * autossuficiente e a importacao funciona offline.
 *
 * Por que DOMParser e nao regex: o HTML tem ~800 divs aninhadas e estilos
 * inline; extrair posicoes e texto com expressao regular seria fragil a
 * qualquer mudanca de formatacao. O parser nativo nao executa scripts nem
 * carrega recursos externos, entao interpretar o arquivo aqui e seguro.
 */

/** Tipos que sabemos converter. O resto e contabilizado e ignorado. */
const SUPPORTED = new Set(['PlainText', 'Note', 'AzureImage', 'InkGroup']);

export interface ImportResult {
  name: string;
  objects: BoardObject[];
  report: ImportReport;
  /** Cor de fundo do quadro original, quando declarada. */
  background: string | null;
  /**
   * Indice da ancora que originou cada objeto, na mesma ordem de `objects`.
   *
   * Existe para a verificacao de geometria (dev/importCheck): e o que permite
   * cruzar cada objeto importado com a medida real do mesmo elemento feita pelo
   * oraculo de layout. Um InkGroup gera varios objetos, todos com o mesmo
   * indice.
   */
  anchorOf: number[];
}

export async function importWhiteboardHtml(
  name: string,
  html: string,
  assets: AssetStore,
): Promise<ImportResult> {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const report: ImportReport = {
    name,
    textos: 0,
    tracos: 0,
    imagens: 0,
    postits: 0,
    ignorados: {},
    avisos: [],
  };

  const objects: BoardObject[] = [];
  const anchorOf: number[] = [];
  let z = '';
  const nextZ = (): string => (z = keyBetween(z, null));

  const anchors = doc.querySelectorAll<HTMLElement>('[data-whiteboard-type]');
  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index]!;
    const kind = anchor.dataset['whiteboardType'] ?? '';
    const before = objects.length;

    if (!SUPPORTED.has(kind)) {
      report.ignorados[kind] = (report.ignorados[kind] ?? 0) + 1;
      continue;
    }

    try {
      switch (kind) {
        case 'PlainText': {
          const obj = readText(anchor, nextZ());
          if (obj) {
            objects.push(obj);
            report.textos++;
          }
          break;
        }
        case 'Note': {
          const obj = readNote(anchor, nextZ());
          if (obj) {
            objects.push(obj);
            report.postits++;
          }
          break;
        }
        case 'AzureImage': {
          const obj = await readImage(anchor, nextZ(), assets);
          if (obj) {
            objects.push(obj);
            report.imagens++;
          }
          break;
        }
        case 'InkGroup': {
          const strokes = readInk(anchor, nextZ);
          objects.push(...strokes);
          report.tracos += strokes.length;
          break;
        }
      }
    } catch (err) {
      // Um objeto malformado nao pode abortar a importacao do quadro inteiro.
      report.avisos.push(`${kind}: ${String(err)}`);
    }

    for (let i = before; i < objects.length; i++) anchorOf.push(index);
  }

  const bgRect = doc.querySelector('rect.canvasBackgroundColor');
  const background = bgRect?.getAttribute('fill') ?? null;

  return { name, objects, report, background, anchorOf };
}

// ------------------------------------------------------------------ posicao

/**
 * Posicao de mundo e escala de um objeto, lidas do estilo inline da ancora.
 *
 * `w` e `h` sao o tamanho NAO escalado da caixa do objeto. Sao necessarios
 * porque a classe da ancora muda o significado de `left/top`, e a conta de
 * centralizacao usa o tamanho ja escalado.
 *
 * As regras abaixo nao foram deduzidas do CSS: foram medidas contra o motor de
 * layout do Chromium (ver dev/layoutOracle.ts), que e a unica autoridade sobre
 * onde o elemento realmente fica. O desvio residual ficou em zero.
 */
function readTransform(anchor: HTMLElement, w: number, h: number): Transform {
  let x = parseFloat(anchor.style.left) || 0;
  let y = parseFloat(anchor.style.top) || 0;

  // A matriz CSS carrega rotacao, escala e deslocamento: matrix(a,b,c,d,tx,ty).
  //
  // ATENCAO: ha objetos ROTACIONADOS nesses exports -- 5 grupos de tinta a 90 graus
  // e 2 textos a 45 no "Cybersec resumao". Ler a escala como `a` e `d` os
  // destroi: numa rotacao de 90 graus a matriz e (0, 1, -1, 0), o que daria
  // escala zero nos dois eixos e o objeto sumiria. Por isso a matriz e
  // decomposta em rotacao + escala, e nao lida posicao a posicao.
  let scaleX = 1;
  let scaleY = 1;
  let rotation = 0;
  const m = anchor.style.transform.match(/matrix\(([^)]+)\)/);
  if (m?.[1]) {
    const n = m[1].split(',').map((v) => parseFloat(v.trim()));
    const [a, b, c, d] = n;
    if (n.length >= 4 && [a, b, c, d].every((v) => Number.isFinite(v))) {
      rotation = Math.atan2(b!, a!);
      scaleX = Math.hypot(a!, b!);
      scaleY = Math.hypot(c!, d!);
      // Determinante negativo = um dos eixos esta espelhado. Sem isto o objeto
      // apareceria invertido.
      if (a! * d! - b! * c! < 0) scaleY = -scaleY;
    }
    // `tx`/`ty` sao quase sempre residuos de ponto flutuante, mas nem sempre:
    // ha textos reais com ty = -14.3px. Ignora-los desloca o objeto.
    if (n.length >= 6 && Number.isFinite(n[4]) && Number.isFinite(n[5])) {
      x += n[4]!;
      y += n[5]!;
    }
  }

  // Ancora `align center` -- usada por imagem e sticker de reacao: `left/top` e
  // o CENTRO do objeto, nao o canto. Tratar como canto joga a imagem meia
  // imagem fora do lugar, que era o sintoma relatado. As demais ancoras sao
  // `align topLeft` e ja chegam no canto certo.
  //
  // O recuo ate o canto acompanha a rotacao: e um vetor no espaco do objeto,
  // nao no do quadro. Sem rotacao a conta se reduz a metade do tamanho.
  if (anchor.classList.contains('center')) {
    const halfW = (w * scaleX) / 2;
    const halfH = (h * scaleY) / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    x -= halfW * cos - halfH * sin;
    y -= halfW * sin + halfH * cos;
  }

  return { x, y, rotation, scaleX, scaleY };
}

function finish<T extends BoardObject>(obj: T): T {
  obj.bbox = computeBbox(obj);
  return obj;
}

function baseFields(z: string): Omit<BoardObject, 'type' | 'bbox' | 'transform'> {
  const now = Date.now();
  return {
    id: createId(),
    parentId: null,
    z,
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// -------------------------------------------------------------------- texto

/**
 * Extrai o texto de um bloco do editor.
 *
 * O Whiteboard usa Draft.js: cada paragrafo e uma div `[data-block]` e o texto
 * fica em spans `[data-text]`. Concatenar todos os spans direto perderia as
 * quebras de paragrafo, entao a juncao acontece por bloco.
 */
function readBlocks(root: Element): string {
  const blocks = root.querySelectorAll('[data-block="true"]');
  if (blocks.length === 0) {
    return [...root.querySelectorAll('[data-text="true"]')].map((s) => s.textContent ?? '').join('');
  }
  return [...blocks]
    .map((b) => [...b.querySelectorAll('[data-text="true"]')].map((s) => s.textContent ?? '').join(''))
    .join('\n');
}

function readText(anchor: HTMLElement, z: string): TextObject | null {
  const core = anchor.querySelector<HTMLElement>('.textBoxCore');
  const box = anchor.querySelector<HTMLElement>('.textbox');
  if (!core) return null;

  const content = readBlocks(core);
  if (content.trim() === '') return null; // caixa vazia nao vira objeto

  const fontSize = parseFloat(box?.style.fontSize ?? '') || 16;
  // `max-width` e a largura de quebra que o Whiteboard aplicou; sem ela o texto
  // reflui diferente e o layout do resumo se desfaz.
  const maxWidth = parseFloat(box?.style.maxWidth ?? '') || 400;
  const fontFamily = core.style.fontFamily || "'Segoe UI', sans-serif";
  const lineHeight = 1.35;

  const bold = (parseInt(core.style.fontWeight, 10) || 400) >= 600;
  const italic = core.style.fontStyle === 'italic';

  // Tamanho medido com a MESMA quebra de linha que o renderer vai aplicar.
  //
  // A versao anterior contava paragrafos (`split('\n')`) para achar a altura.
  // Um paragrafo que quebra em duas linhas contava como um, a caixa saia com
  // metade da altura necessaria e o painter descartava a linha que passava do
  // limite -- texto sumia da tela. Medir aqui e a unica forma de a altura
  // corresponder ao que sera desenhado.
  // A largura gravada e o TETO DE QUEBRA do original, nao a largura que o texto
  // acabou ocupando. Sao coisas diferentes, e a distincao importa: a fonte real
  // (Aptos) costuma faltar nesta maquina, e a substituta mede cerca de 1,5x mais
  // estreito. Gravar a largura medida por nos congelaria no arquivo um valor que
  // nao e do original, e o texto passaria a quebrar errado no dia em que a fonte
  // certa estivesse instalada. O teto de quebra vale para qualquer fonte.
  const w = maxWidth;
  const { lines } = measureText(content, w, fontSize, fontFamily, bold, italic);
  const h = fontSize * lineHeight * lines;

  return finish<TextObject>({
    ...baseFields(z),
    type: 'text',
    transform: readTransform(anchor, w, h),
    w,
    h,
    autoHeight: true,
    content: [{ text: content, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) }],
    fontFamily,
    fontSize,
    lineHeight,
    align: 'left',
    color: core.style.color || '#000000',
    list: 'none',
  } as TextObject);
}

/**
 * Contexto 2D so para medir texto, sem canvas visivel.
 *
 * Criado uma vez e reaproveitado: um resumo tem centenas de caixas de texto, e
 * alocar um canvas por caixa seria desperdicio puro.
 */
let measureCtx: CanvasRenderingContext2D | null = null;

function measuringContext(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('Contexto 2D indisponivel para medir texto');
    measureCtx = ctx;
  }
  return measureCtx;
}

/**
 * Quantas linhas o texto ocupa depois de quebrado.
 *
 * Usa a MESMA funcao de quebra e a MESMA montagem de fonte que o painter -- por
 * isso as duas sao importadas dele em vez de reescritas aqui. Se divergirem, a
 * altura gravada deixa de corresponder ao que e desenhado e o painter volta a
 * cortar linha.
 */
function measureText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
): { lines: number } {
  const ctx = measuringContext();
  ctx.font = textFont(fontSize, fontFamily, bold, italic);
  return { lines: Math.max(1, wrap(ctx, text, maxWidth).length) };
}

function readNote(anchor: HTMLElement, z: string): NoteObject | null {
  const core = anchor.querySelector<HTMLElement>('.textBoxCore');
  const content = core ? readBlocks(core) : '';

  // Cor e tamanho moram em elementos DIFERENTES, e nenhum dos dois e a ancora:
  // o papel colorido e `.textBoxBackground`, a caixa que define o tamanho e
  // `.textbox` (a mesma classe do texto solto, aqui com `stickyNote`). Medido
  // contra o oraculo, procurar o tamanho no elemento errado devolvia o padrao
  // de 160px onde o post-it real tinha 304.
  const paper = anchor.querySelector<HTMLElement>('.textBoxBackground');
  const surface = anchor.querySelector<HTMLElement>('.textbox');
  const bg = paper?.style.backgroundColor || '#fff3bf';
  const w = parseFloat(surface?.style.width ?? '') || 160;
  const h = parseFloat(surface?.style.height ?? '') || 160;

  return finish<NoteObject>({
    ...baseFields(z),
    type: 'note',
    transform: readTransform(anchor, w, h),
    w,
    h,
    bg,
    content: [{ text: content }],
    alert: null,
    pinned: false,
  } as NoteObject);
}

async function readImage(
  anchor: HTMLElement,
  z: string,
  assets: AssetStore,
): Promise<ImageObject | null> {
  const img = anchor.querySelector('img');
  const src = img?.getAttribute('src');
  if (!src?.startsWith('data:')) return null;

  const asset = await assets.add(dataUriToBlob(src));

  const surface = anchor.querySelector<HTMLElement>('.imageComponent');
  const w = parseFloat(surface?.style.width ?? '') || asset.meta.width;
  const h = parseFloat(surface?.style.height ?? '') || asset.meta.height;

  return finish<ImageObject>({
    ...baseFields(z),
    type: 'image',
    transform: readTransform(anchor, w, h),
    w,
    h,
    assetId: asset.meta.id,
    naturalW: asset.meta.width,
    naturalH: asset.meta.height,
  } as ImageObject);
}

/**
 * Converte um grupo de tinta.
 *
 * Cada `<g class="inkStroke">` e um traco, desenhado como CONTORNO PREENCHIDO --
 * a variacao de pressao da caneta esta na forma, nao numa espessura de linha.
 * Por isso vira PathObject e nao StrokeObject: reduzir a uma polilinha de
 * espessura constante achataria a caligrafia.
 *
 * Duas transformacoes separam as coordenadas gravadas do espaco do objeto, e as
 * DUAS precisam ser assadas no caminho:
 *
 * 1. A matriz do `<g>` (tipicamente 1/128, porque a caneta grava em unidades
 *    inteiras finas).
 * 2. O `viewBox` do `<svg>`, que pode ter origem diferente de zero. Nesses
 *    resumos 40 dos 473 grupos tem -- `viewBox="116 -78 1087 1087"` empurra o
 *    desenho em (116, -78), e ignorar isso deslocava o traco em ate 5501px no
 *    "Cybersec resumao". Foi o maior erro de posicao que restava.
 */
function readInk(anchor: HTMLElement, nextZ: () => string): PathObject[] {
  // Tinta usa ancora `topLeft`, entao o tamanho nao participa da conta: os
  // zeros so satisfazem a assinatura.
  const base = readTransform(anchor, 0, 0);
  const out: PathObject[] = [];

  for (const g of anchor.querySelectorAll<SVGGElement>('g.inkStroke')) {
    const path = g.querySelector('path');
    const d = path?.getAttribute('d');
    if (!d) continue;

    let scale = 1;
    const m = g.getAttribute('transform')?.match(/matrix\(([^)]+)\)/);
    if (m?.[1]) {
      const n = parseFloat(m[1].split(',')[0]!.trim());
      if (Number.isFinite(n) && n !== 0) scale = n;
    }

    const view = readViewBox(g.ownerSVGElement);

    out.push(
      finish<PathObject>({
        ...baseFields(nextZ()),
        type: 'path',
        transform: { ...base },
        d: transformPath(
          d,
          scale * view.scaleX,
          scale * view.scaleY,
          -view.minX * view.scaleX,
          -view.minY * view.scaleY,
        ),
        fill: path?.getAttribute('fill') || '#1f2933',
      } as PathObject),
    );
  }

  return out;
}

/**
 * Mapeamento do `viewBox` para o espaco do elemento `<svg>`.
 *
 * `viewBox="minX minY largura altura"` faz o canto (minX, minY) do sistema
 * interno cair no canto do elemento, e estica o conteudo ate os atributos
 * `width`/`height`. Sem viewBox, nada muda.
 */
function readViewBox(svg: SVGSVGElement | null): {
  minX: number;
  minY: number;
  scaleX: number;
  scaleY: number;
} {
  const none = { minX: 0, minY: 0, scaleX: 1, scaleY: 1 };
  const raw = svg?.getAttribute('viewBox');
  if (!raw) return none;

  const n = raw.trim().split(/[\s,]+/).map(Number);
  if (n.length < 4 || n.some((v) => !Number.isFinite(v)) || n[2] === 0 || n[3] === 0) return none;

  const width = parseFloat(svg?.getAttribute('width') ?? '') || n[2]!;
  const height = parseFloat(svg?.getAttribute('height') ?? '') || n[3]!;

  return { minX: n[0]!, minY: n[1]!, scaleX: width / n[2]!, scaleY: height / n[3]! };
}
