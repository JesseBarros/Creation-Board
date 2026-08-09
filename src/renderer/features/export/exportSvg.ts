import type { Rect } from '@shared/geometry/rect';
import type {
  BoardObject,
  EraseMark,
  ImageObject,
  NoteObject,
  ShapeObject,
  StrokeObject,
  TextObject,
} from '@shared/model/types';
import type { Document } from '../../core/Document';
import { createColorAdapter, readableTextOn } from '../../render/colorAdapt';
import { STROKE_STRIDE } from '../../render/painters/stroke';
import {
  ALERT_COLORS,
  NOTE_ALERT_BAR,
  NOTE_FONT_FAMILY,
  NOTE_FONT_SIZE,
  NOTE_PAD,
  noteInset,
  noteStyle,
} from '../../render/painters/text';
import { BULLET, layoutText, styleOf } from '../../render/text/layout';
import type { AssetStore } from '../images/AssetStore';

/**
 * Exportacao vetorial.
 *
 * Diferente do PNG, aqui NAO da para reaproveitar os painters: eles falam
 * `CanvasRenderingContext2D`, e SVG e outro alfabeto. O que se reaproveita e o
 * que decide a aparencia -- o adaptador de cor, o layout de texto, as constantes
 * do post-it --, e por isso este arquivo importa dessas fontes em vez de repetir
 * numeros.
 *
 * Duas perdas conhecidas, e deliberadas:
 *
 *  - a variacao de espessura do lapis vira um traco de espessura media. Manter a
 *    modulacao exigiria um caminho por segmento, e um resumo com centenas de
 *    tracos manuscritos multiplicaria o tamanho do arquivo por dezenas;
 *  - o texto sai como `<text>`, entao depende da fonte de quem abrir. A
 *    alternativa (converter glifo em caminho) perderia o texto selecionavel, que
 *    e metade da razao de exportar em vetor.
 */

export interface SvgOptions {
  padding: number;
  /** Fundo do quadro, ou null para SVG sem retangulo de fundo. */
  background: string | null;
  /** Cor de referencia para adaptar as marcas (normalmente o proprio fundo). */
  adaptAgainst: string;
}

export function renderSvg(
  doc: Document,
  assets: AssetStore,
  area: Rect,
  ids: readonly string[],
  opts: SvgOptions,
): string {
  const box = {
    x: area.x - opts.padding,
    y: area.y - opts.padding,
    w: area.w + opts.padding * 2,
    h: area.h + opts.padding * 2,
  };
  const adapt = createColorAdapter(opts.adaptAgainst);
  const wanted = ids.length > 0 ? new Set(ids) : null;

  const body: string[] = [];
  const defs: string[] = [];

  for (const obj of doc.queryVisible(box)) {
    if (wanted && !wanted.has(obj.id)) continue;
    const el = objectToSvg(obj, adapt, assets, defs);
    if (!el) continue;
    body.push(`<g transform="${transformOf(obj)}"${maskRef(obj, defs)}>${el}</g>`);
  }

  const bg = opts.background
    ? `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${esc(opts.background)}"/>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${n(box.w)}" height="${n(box.h)}" ` +
    `viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">\n` +
    (defs.length > 0 ? `<defs>${defs.join('')}</defs>\n` : '') +
    bg +
    body.join('\n') +
    `\n</svg>\n`
  );
}

// --------------------------------------------------------------- por tipo

type Adapter = (color: string) => string;

function objectToSvg(
  obj: BoardObject,
  adapt: Adapter,
  assets: AssetStore,
  defs: string[],
): string | null {
  switch (obj.type) {
    case 'stroke':
      return strokeToSvg(obj, adapt);
    case 'path':
      return `<path d="${esc(obj.d)}" fill="${esc(adapt(obj.fill))}"${
        obj.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : ''
      }${alpha(obj.opacity)}/>`;
    case 'shape':
      return shapeToSvg(obj, adapt);
    case 'text':
      return textToSvg(obj, adapt);
    case 'note':
      return noteToSvg(obj, adapt);
    case 'image':
      return imageToSvg(obj, assets, defs);
    case 'group':
      return null;
  }
}

function strokeToSvg(o: StrokeObject, adapt: Adapter): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < o.points.length; i += STROKE_STRIDE) {
    pts.push(`${n(o.points[i]!)},${n(o.points[i + 1]!)}`);
  }
  if (pts.length === 0) return '';

  const highlighter = o.variant === 'highlighter';
  const color = highlighter ? o.color : adapt(o.color);
  const opacity = o.opacity * (highlighter ? 0.4 : 1);

  // Um ponto so: o canvas desenha um pingo por causa do `lineCap` redondo, e
  // uma `polyline` de um ponto nao desenha nada. Vira circulo.
  if (pts.length === 1) {
    const [x, y] = pts[0]!.split(',');
    return `<circle cx="${x}" cy="${y}" r="${n(o.width / 2)}" fill="${esc(color)}"${alpha(opacity)}/>`;
  }

  return (
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${esc(color)}" ` +
    `stroke-width="${n(strokeWidthOf(o))}" stroke-linecap="round" stroke-linejoin="round"${alpha(opacity)}/>`
  );
}

/** Lapis: espessura media da pressao. Ver a nota de perdas no topo. */
function strokeWidthOf(o: StrokeObject): number {
  if (o.variant !== 'pencil') return o.width;
  let sum = 0;
  let count = 0;
  for (let i = 2; i < o.points.length; i += STROKE_STRIDE) {
    sum += o.points[i]!;
    count++;
  }
  const avg = count > 0 ? sum / count : 0.5;
  return o.width * (0.45 + 0.55 * Math.min(1, Math.max(0, avg)));
}

function shapeToSvg(o: ShapeObject, adapt: Adapter): string {
  const { w, h } = o;
  const open = o.kind === 'line' || o.kind === 'arrow';
  const fill = o.fill && !open ? esc(o.fill) : 'none';
  const stroke = o.stroke && o.strokeWidth > 0 ? esc(adapt(o.stroke)) : 'none';
  const attrs =
    `fill="${fill}" stroke="${stroke}" stroke-width="${n(o.strokeWidth)}" ` +
    `stroke-linejoin="round" stroke-linecap="round"${alpha(o.opacity)}`;

  switch (o.kind) {
    case 'rect':
    case 'square':
      return `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" ${attrs}/>`;
    case 'ellipse':
    case 'circle':
      return `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(Math.abs(w / 2))}" ry="${n(Math.abs(h / 2))}" ${attrs}/>`;
    case 'triangle':
      return `<polygon points="${n(w / 2)},0 ${n(w)},${n(h)} 0,${n(h)}" ${attrs}/>`;
    case 'diamond':
      return `<polygon points="${n(w / 2)},0 ${n(w)},${n(h / 2)} ${n(w / 2)},${n(h)} 0,${n(h / 2)}" ${attrs}/>`;
    case 'line':
      return `<line x1="0" y1="0" x2="${n(w)}" y2="${n(h)}" ${attrs}/>`;
    case 'arrow': {
      // Mesma ponta do painter: duas hastes a partir do fim, com o comprimento
      // preso a um teto para nao virar uma seta gigante numa linha longa.
      const angle = Math.atan2(h, w);
      const head = Math.min(Math.hypot(w, h) * 0.28, o.strokeWidth * 6 + 10);
      const barbs = [-0.5, 0.5]
        .map((spread) => {
          const x = w - head * Math.cos(angle + spread);
          const y = h - head * Math.sin(angle + spread);
          return `M ${n(w)} ${n(h)} L ${n(x)} ${n(y)}`;
        })
        .join(' ');
      return `<path d="M 0 0 L ${n(w)} ${n(h)} ${barbs}" ${attrs}/>`;
    }
  }
}

/**
 * Prende o trecho na largura que NOS medimos.
 *
 * Sem isto, cada `<text>` e posicionado no ponto que medimos mas desenhado com a
 * fonte de quem abre o arquivo. Quando essa fonte e um pouco mais larga, o
 * trecho transborda e invade o comeco do trecho seguinte -- e o resultado e
 * texto por cima de texto, que nao existe no quadro original. Relatado por ele
 * em 08/08/2026 (B14).
 *
 * `spacingAndGlyphs` distribui a diferenca no espacamento E na largura dos
 * glifos. So `spacing` empilharia todo o erro nos espacos, o que aperta ou
 * espalha as palavras de forma bem mais visivel.
 *
 * A alternativa definitiva seria embutir a fonte no arquivo -- fidelidade
 * perfeita, arquivo muito maior e licenca de fonte para resolver. Isto aqui
 * custa dois atributos.
 */
function medida(largura: number): string {
  // Largura zero (ou trecho so de espaco) faz o navegador ignorar ou dividir por
  // zero: nesses casos nao ha o que prender.
  if (!(largura > 0.01)) return '';
  return ` textLength="${n(largura)}" lengthAdjust="spacingAndGlyphs"`;
}

function textToSvg(o: TextObject, adapt: Adapter): string {
  const layout = layoutText(o.content, styleOf(o));
  const color = adapt(o.color);
  const out: string[] = [];

  for (const line of layout.lines) {
    if (line.y + line.height > o.h + 0.5) break;
    const baseY = line.y + line.baseline;

    if (layout.indent > 0 && line.first) {
      out.push(
        `<text x="${n(line.x - layout.indent)}" y="${n(baseY)}" ` +
          `font-family="${esc(o.fontFamily)}" font-size="${n(o.fontSize)}" fill="${esc(color)}"` +
          medida(layout.indent) +
          `>${esc(BULLET)}</text>`,
      );
    }

    for (const run of line.runs) {
      out.push(
        `<text x="${n(line.x + run.x)}" y="${n(baseY)}" ` +
          `font-family="${esc(o.fontFamily)}" font-size="${n(o.fontSize)}" ` +
          `fill="${esc(run.color ? adapt(run.color) : color)}"` +
          (run.bold ? ' font-weight="bold"' : '') +
          (run.italic ? ' font-style="italic"' : '') +
          (run.underline ? ' text-decoration="underline"' : '') +
          medida(run.width) +
          `${alpha(o.opacity)}>${esc(run.text)}</text>`,
      );
    }
  }
  return out.join('');
}

function noteToSvg(o: NoteObject, adapt: Adapter): string {
  const out: string[] = [
    `<rect x="0" y="0" width="${n(o.w)}" height="${n(o.h)}" rx="4" fill="${esc(o.bg)}"${alpha(o.opacity)}/>`,
  ];

  if (o.alert) {
    out.push(
      `<path d="M 4 0 L ${n(NOTE_ALERT_BAR)} 0 L ${n(NOTE_ALERT_BAR)} ${n(o.h)} L 4 ${n(o.h)} ` +
        `A 4 4 0 0 1 0 ${n(o.h - 4)} L 0 4 A 4 4 0 0 1 4 0 Z" fill="${esc(ALERT_COLORS[o.alert.level])}"/>`,
    );
  }

  const inset = noteInset(o);
  const layout = layoutText(o.content, noteStyle(o));
  const color = readableTextOn(o.bg);
  for (const line of layout.lines) {
    if (line.y + line.height > o.h - NOTE_PAD * 2 + 0.5) break;
    for (const run of line.runs) {
      out.push(
        `<text x="${n(inset + line.x + run.x)}" y="${n(NOTE_PAD + line.y + line.baseline)}" ` +
          `font-family="${esc(NOTE_FONT_FAMILY)}" font-size="${n(NOTE_FONT_SIZE)}" ` +
          `fill="${esc(color)}"${medida(run.width)}>${esc(run.text)}</text>`,
      );
    }
  }

  if (o.alert?.icon) {
    const size = Math.min(16, o.h / 2);
    out.push(
      `<text x="${n(o.w - 6)}" y="${n(o.h - 6)}" text-anchor="end" ` +
        `font-family="${esc(NOTE_FONT_FAMILY)}" font-size="${n(size)}" ` +
        `fill="${esc(ALERT_COLORS[o.alert.level])}">${esc(o.alert.icon)}</text>`,
    );
  }

  // O adaptador nao e usado aqui de proposito: papel e texto do post-it sao
  // superficie, como no painter.
  void adapt;
  return out.join('');
}

function imageToSvg(o: ImageObject, assets: AssetStore, defs: string[]): string {
  const asset = assets.get(o.assetId);
  if (!asset) {
    return `<rect x="0" y="0" width="${n(o.w)}" height="${n(o.h)}" fill="rgba(130,145,175,0.18)" stroke="rgba(130,145,175,0.55)"/>`;
  }

  const href = `data:${asset.meta.mime};base64,${base64(asset.bytes)}`;
  if (!o.crop) {
    return `<image x="0" y="0" width="${n(o.w)}" height="${n(o.h)}" xlink:href="${href}" href="${href}"${alpha(o.opacity)}/>`;
  }

  // Recorte: a imagem inteira e desenhada ampliada e presa a um retangulo de
  // corte. E o equivalente do `drawImage` com retangulo de origem.
  const id = `crop-${o.id}`;
  const fullW = o.w / o.crop.w;
  const fullH = o.h / o.crop.h;
  defs.push(
    `<clipPath id="${esc(id)}"><rect x="0" y="0" width="${n(o.w)}" height="${n(o.h)}"/></clipPath>`,
  );
  return (
    `<g clip-path="url(#${esc(id)})">` +
    `<image x="${n(-o.crop.x * fullW)}" y="${n(-o.crop.y * fullH)}" ` +
    `width="${n(fullW)}" height="${n(fullH)}" xlink:href="${href}" href="${href}"${alpha(o.opacity)}/>` +
    `</g>`
  );
}

/**
 * Mascara da borracha, quando o objeto tem rastros.
 *
 * Em SVG o apagamento vira `<mask>`: branco pinta, preto apaga -- o mesmo
 * efeito do `destination-out` do canvas, e o unico jeito de o buraco continuar
 * sendo buraco quando o arquivo for aberto noutro programa.
 */
function maskRef(obj: BoardObject, defs: string[]): string {
  const marks: readonly EraseMark[] | undefined =
    obj.type === 'stroke' || obj.type === 'path' ? obj.erased : undefined;
  if (!marks || marks.length === 0) return '';

  const id = `erase-${obj.id}`;
  const b = obj.bbox;
  // O retangulo branco cobre com folga o objeto em espaco local; a folga evita
  // que a espessura do traco fique de fora da area pintada da mascara.
  const pad = 64;
  const strokes = marks
    .map((m) => {
      const pts: string[] = [];
      for (let i = 0; i + 1 < m.points.length; i += 2) {
        pts.push(`${n(m.points[i]!)},${n(m.points[i + 1]!)}`);
      }
      if (pts.length === 0) return '';
      if (pts.length === 1) {
        const [x, y] = pts[0]!.split(',');
        return `<circle cx="${x}" cy="${y}" r="${n(m.width / 2)}" fill="black"/>`;
      }
      return (
        `<polyline points="${pts.join(' ')}" fill="none" stroke="black" ` +
        `stroke-width="${n(m.width)}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    })
    .join('');

  defs.push(
    `<mask id="${esc(id)}" maskUnits="userSpaceOnUse" x="${n(-pad)}" y="${n(-pad)}" ` +
      `width="${n(b.w + pad * 2)}" height="${n(b.h + pad * 2)}">` +
      `<rect x="${n(-pad)}" y="${n(-pad)}" width="${n(b.w + pad * 2)}" height="${n(b.h + pad * 2)}" fill="white"/>` +
      strokes +
      `</mask>`,
  );
  return ` mask="url(#${esc(id)})"`;
}

// ------------------------------------------------------------- utilitarios

function transformOf(obj: BoardObject): string {
  const t = obj.transform;
  const parts = [`translate(${n(t.x)} ${n(t.y)})`];
  if (t.rotation !== 0) parts.push(`rotate(${n((t.rotation * 180) / Math.PI)})`);
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${n(t.scaleX)} ${n(t.scaleY)})`);
  return parts.join(' ');
}

function alpha(opacity: number): string {
  return opacity >= 1 ? '' : ` opacity="${n(opacity)}"`;
}

/** Numero curto: 3 casas bastam em unidades de mundo e encolhem o arquivo. */
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Base64 sem estourar a pilha com `apply` num arquivo de megabytes. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
