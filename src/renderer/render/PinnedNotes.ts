import { intersects } from '@shared/geometry/rect';
import type { NoteObject } from '@shared/model/types';
import type { Camera } from '../core/Camera';
import type { Document } from '../core/Document';
import { readableTextOn } from './colorAdapt';
import { ALERT_COLORS } from './painters/text';
import { plainText } from '../features/text/spans';

/**
 * Post-its fixados, na borda direita da tela.
 *
 * O ponto de fixar um post-it e ele nao depender de onde a camera esta: num
 * quadro de 80 mil unidades de largura, o lembrete que importa fica fora da tela
 * na maior parte do tempo, e um lembrete que so aparece quando ja se chegou onde
 * ele estava nao lembra nada.
 *
 * So aparece aqui o que NAO esta visivel no quadro: com o post-it a vista, a
 * ficha no canto seria uma segunda copia do mesmo papel, competindo com o
 * original. E cromo de interface, como as reguas -- desenhado em px de tela e
 * fora da miniatura gravada.
 */

const CARD_W = 168;
const CARD_H = 44;
const MARGIN = 12;
const GAP = 6;
/** Mais que isto vira uma coluna que cobre a tela; o resto fica no quadro. */
const MAX_CARDS = 6;

/**
 * Post-its fixados que estao FORA da tela -- os que ganham ficha no canto.
 *
 * Separado do desenho para poder ser conferido por numero no autoteste: a
 * regra que importa aqui ("so o que nao esta a vista") e uma decisao, e nao um
 * detalhe de pintura.
 */
export function offscreenPinnedNotes(
  doc: Document,
  camera: Camera,
  viewportW: number,
  viewportH: number,
): NoteObject[] {
  const view = camera.viewportRect(viewportW, viewportH);
  const out: NoteObject[] = [];
  for (const obj of doc.all()) {
    if (obj.type !== 'note' || !obj.pinned || obj.hidden) continue;
    if (intersects(obj.bbox, view)) continue;
    out.push(obj);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

export function paintPinnedNotes(
  ctx: CanvasRenderingContext2D,
  doc: Document,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  topOffset: number,
): void {
  const cards = offscreenPinnedNotes(doc, camera, viewportW, viewportH);
  if (cards.length === 0) return;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  let y = topOffset + MARGIN;
  for (const note of cards) {
    const x = viewportW - CARD_W - MARGIN;

    ctx.fillStyle = note.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, CARD_W, CARD_H, 6);
    ctx.fill();

    if (note.alert) {
      ctx.fillStyle = ALERT_COLORS[note.alert.level];
      ctx.beginPath();
      ctx.roundRect(x, y, 5, CARD_H, [6, 0, 0, 6]);
      ctx.fill();
    }

    ctx.fillStyle = readableTextOn(note.bg);
    ctx.font = '12px "Segoe UI", sans-serif';
    // A ficha e um lembrete, nao o post-it: cabe a primeira linha e o resto vira
    // reticencias. Quem quiser ler o texto inteiro vai ate ele no quadro.
    ctx.fillText(ellipsis(ctx, firstLine(note), CARD_W - 20), x + 12, y + CARD_H / 2);

    y += CARD_H + GAP;
  }

  ctx.restore();
}

function firstLine(note: NoteObject): string {
  const text = plainText(note.content).trim();
  if (text.length === 0) return '(post-it sem texto)';
  return text.split('\n')[0]!;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut--;
  return `${text.slice(0, cut)}…`;
}
