import type { AlertLevel, NoteObject, RichSpan, TextObject } from '@shared/model/types';
import { glyphPixels, MIN_GLYPH_PX, type PaintContext } from './types';
import { readableTextOn } from '../colorAdapt';

/** Concatena os spans. A Fase 5 troca isso por layout real com formatacao por span. */
export function spansToPlainText(spans: readonly RichSpan[]): string {
  let out = '';
  for (const s of spans) out += s.text;
  return out;
}

/**
 * Monta a string de fonte do canvas.
 *
 * Ponto unico de verdade: o importador mede o texto com ela para saber quantas
 * linhas a caixa precisa, e o painter desenha com ela. Montar a fonte em dois
 * lugares faria a medida e o desenho discordarem, e a caixa cortaria linha.
 */
export function textFont(
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
): string {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
}

/**
 * Negrito e italico da caixa.
 *
 * Enquanto o layout por span nao existe (Fase 5), o estilo do primeiro span
 * vale para a caixa inteira. Para o conteudo importado isso e exato: o
 * importador gera um unico span por caixa.
 */
function boxStyle(spans: readonly RichSpan[]): { bold: boolean; italic: boolean } {
  const first = spans[0];
  return { bold: first?.bold ?? false, italic: first?.italic ?? false };
}

/**
 * Quebra de linha por largura. Versao provisoria da Fase 1: mede com
 * `measureText` e quebra por palavra. A Fase 5 substitui por um layout que
 * respeita formatacao por span, listas e alinhamento vertical.
 */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function paintText(o: TextObject, p: PaintContext): void {
  const { ctx } = p;
  ctx.globalAlpha = o.opacity;

  // A decisao e por OBJETO, e nao pelo zoom da camera: no mesmo quadro e no
  // mesmo zoom, um titulo pode estar legivel enquanto o corpo do texto nao
  // esta. Decidir pela camera trataria os dois igual e apagaria justamente os
  // titulos, que sao o que se procura ao olhar o resumo de longe.
  if (glyphPixels(o.fontSize, p) < MIN_GLYPH_PX) {
    paintTextPlaceholder(ctx, o.w, o.h, o.fontSize, o.lineHeight, p.adapt(o.color));
    ctx.globalAlpha = 1;
    return;
  }

  const { bold, italic } = boxStyle(o.content);
  ctx.font = textFont(o.fontSize, o.fontFamily, bold, italic);
  ctx.fillStyle = p.adapt(o.color);
  ctx.textBaseline = 'top';
  ctx.textAlign = o.align;

  const x = o.align === 'center' ? o.w / 2 : o.align === 'right' ? o.w : 0;
  const lineH = o.fontSize * o.lineHeight;
  const lines = wrap(ctx, spansToPlainText(o.content), o.w);

  for (let i = 0; i < lines.length; i++) {
    const y = i * lineH;
    if (y > o.h) break; // nao transborda a caixa
    ctx.fillText(lines[i]!, x, y);
  }

  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function paintNote(o: NoteObject, p: PaintContext): void {
  const { ctx } = p;
  ctx.globalAlpha = o.opacity;

  // Corpo do post-it: superficie, mantida como o autor escolheu em qualquer tema.
  const bg = o.bg;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, o.w, o.h, 4);
  ctx.fill();

  // Alerta ganha uma barra lateral na cor da urgencia.
  if (o.alert) {
    ctx.fillStyle = ALERT_COLORS[o.alert.level];
    ctx.beginPath();
    ctx.roundRect(0, 0, 8, o.h, [4, 0, 0, 4]);
    ctx.fill();
  }

  const pad = 12;
  const fontSize = 14;

  // Mesmo criterio do texto solto: o post-it desenha o conteudo quando ele cabe
  // como letra, e para no fundo colorido quando nao cabe.
  if (glyphPixels(fontSize, p) < MIN_GLYPH_PX) {
    ctx.globalAlpha = 1;
    return;
  }

  ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
  // O texto acompanha o fundo ja adaptado: num post-it que escureceu, texto
  // preto sumiria.
  ctx.fillStyle = readableTextOn(bg);
  ctx.textBaseline = 'top';

  const inset = o.alert ? pad + 8 : pad;
  const lines = wrap(ctx, spansToPlainText(o.content), o.w - inset - pad);
  for (let i = 0; i < lines.length; i++) {
    const y = pad + i * fontSize * 1.35;
    if (y + fontSize > o.h - pad) break;
    ctx.fillText(lines[i]!, inset, y);
  }

  ctx.globalAlpha = 1;
}

export const ALERT_COLORS: Record<AlertLevel, string> = {
  importante: '#e03131',
  duvida: '#1971c2',
  revisar: '#f08c00',
};

function paintTextPlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fontSize: number,
  lineHeight: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.45;
  const lineH = fontSize * lineHeight;
  for (let y = 0; y + fontSize <= h; y += lineH) {
    // Ultima barra mais curta imita o fim de paragrafo.
    const barW = y + lineH * 2 > h ? w * 0.6 : w;
    ctx.fillRect(0, y + fontSize * 0.15, barW, fontSize * 0.62);
  }
}
