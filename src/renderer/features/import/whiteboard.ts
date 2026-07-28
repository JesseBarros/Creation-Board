import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import { scalePath } from '@shared/geometry/svgPath';
import type {
  BoardObject,
  ImageObject,
  NoteObject,
  PathObject,
  TextObject,
  Transform,
} from '@shared/model/types';
import type { ImportReport } from '@shared/importer';
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
  let z = '';
  const nextZ = (): string => (z = keyBetween(z, null));

  const anchors = doc.querySelectorAll<HTMLElement>('[data-whiteboard-type]');
  for (const anchor of anchors) {
    const kind = anchor.dataset['whiteboardType'] ?? '';

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
  }

  const bgRect = doc.querySelector('rect.canvasBackgroundColor');
  const background = bgRect?.getAttribute('fill') ?? null;

  return { name, objects, report, background };
}

// ------------------------------------------------------------------ posicao

/** Posicao de mundo e escala de um objeto, lidas do estilo inline da ancora. */
function readTransform(anchor: HTMLElement): Transform {
  const x = parseFloat(anchor.style.left) || 0;
  const y = parseFloat(anchor.style.top) || 0;

  // A matriz CSS carrega a escala do objeto: matrix(a, b, c, d, tx, ty).
  // Rotacao nao aparece nesses exports, entao `a` e `d` bastam.
  let scaleX = 1;
  let scaleY = 1;
  const m = anchor.style.transform.match(/matrix\(([^)]+)\)/);
  if (m?.[1]) {
    const n = m[1].split(',').map((v) => parseFloat(v.trim()));
    if (n.length >= 4 && Number.isFinite(n[0]) && Number.isFinite(n[3])) {
      scaleX = n[0]!;
      scaleY = n[3]!;
    }
  }

  return { x, y, rotation: 0, scaleX, scaleY };
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
  const w = parseFloat(box?.style.maxWidth ?? '') || 400;
  const lineCount = content.split('\n').length;

  const bold = (parseInt(core.style.fontWeight, 10) || 400) >= 600;
  const italic = core.style.fontStyle === 'italic';

  return finish<TextObject>({
    ...baseFields(z),
    type: 'text',
    transform: readTransform(anchor),
    w,
    h: fontSize * 1.35 * lineCount,
    autoHeight: true,
    content: [{ text: content, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) }],
    fontFamily: core.style.fontFamily || "'Segoe UI', sans-serif",
    fontSize,
    lineHeight: 1.35,
    align: 'left',
    color: core.style.color || '#000000',
    list: 'none',
  } as TextObject);
}

function readNote(anchor: HTMLElement, z: string): NoteObject | null {
  const core = anchor.querySelector<HTMLElement>('.textBoxCore');
  const content = core ? readBlocks(core) : '';

  // O fundo do post-it esta no elemento visual, nao na ancora.
  const surface = anchor.querySelector<HTMLElement>('.content, .noteBackground, .textBoxNotInteractive');
  const bg = surface?.style.backgroundColor || '#fff3bf';
  const w = parseFloat(surface?.style.width ?? '') || 160;
  const h = parseFloat(surface?.style.height ?? '') || 160;

  return finish<NoteObject>({
    ...baseFields(z),
    type: 'note',
    transform: readTransform(anchor),
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
    transform: readTransform(anchor),
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
 * O `<g>` traz uma matriz de escala (tipicamente 1/128, porque as coordenadas
 * sao gravadas em unidades inteiras finas). Ela e assada nas coordenadas do
 * caminho para o objeto nao depender de um transform extra na hora de desenhar.
 */
function readInk(anchor: HTMLElement, nextZ: () => string): PathObject[] {
  const base = readTransform(anchor);
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

    out.push(
      finish<PathObject>({
        ...baseFields(nextZ()),
        type: 'path',
        transform: { ...base },
        d: scalePath(d, scale),
        fill: path?.getAttribute('fill') || '#1f2933',
      } as PathObject),
    );
  }

  return out;
}
