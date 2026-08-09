import type { AlertLevel, NoteObject, TextObject } from '@shared/model/types';
import { type PaintContext } from './types';
import { readableTextOn } from '../colorAdapt';
import {
  BULLET,
  layoutCached,
  layoutOf,
  textFont,
  type TextLayout,
  type TextStyle,
} from '../text/layout';

/**
 * Metrica do post-it.
 *
 * Fica aqui, e nao no objeto, porque e aparencia e nao conteudo: um post-it e
 * uma superficie de tamanho pequeno e texto curto, e deixar o autor escolher
 * corpo de fonte nele so produziria post-its ilegiveis. O editor importa estas
 * mesmas constantes -- e o que faz o texto ficar no lugar quando a edicao
 * termina.
 */
export const NOTE_FONT_SIZE = 14;
export const NOTE_LINE_HEIGHT = 1.35;
export const NOTE_FONT_FAMILY = "'Segoe UI', sans-serif";
export const NOTE_PAD = 12;
/** Largura da barra lateral do alerta. */
export const NOTE_ALERT_BAR = 8;

export const ALERT_COLORS: Record<AlertLevel, string> = {
  importante: '#e03131',
  duvida: '#1971c2',
  revisar: '#f08c00',
};

/** Recuo esquerdo do texto: o alerta rouba a faixa da barra colorida. */
export function noteInset(o: NoteObject): number {
  return o.alert ? NOTE_PAD + NOTE_ALERT_BAR : NOTE_PAD;
}

export function noteStyle(o: NoteObject): TextStyle {
  return {
    width: Math.max(1, o.w - noteInset(o) - NOTE_PAD),
    fontSize: NOTE_FONT_SIZE,
    fontFamily: NOTE_FONT_FAMILY,
    lineHeight: NOTE_LINE_HEIGHT,
    align: 'left',
    list: 'none',
  };
}

export function paintText(o: TextObject, p: PaintContext): void {
  const { ctx } = p;
  ctx.globalAlpha = o.opacity;

  // Texto e SEMPRE desenhado como texto, em qualquer zoom.
  //
  // Ate 08/08/2026 havia aqui um corte por legibilidade: abaixo de 6px de glifo
  // o texto virava uma barra cinza, porque glifo de 3px e mancha e custa caro
  // para desenhar a cada frame. Ele pediu o contrario, e a razao e boa: num
  // resumo, ver ONDE estao as palavras nao substitui ver QUAIS sao -- e afastar
  // o zoom e justamente como se procura algo no quadro inteiro. A troca foi
  // aceita de olhos abertos: "mesmo que isso signifique consumir mais
  // processamento ou uso de GPU". Ver o B12 no BUGS.md, com o custo medido.
  //
  // Isso conserta a exportacao de graca: o PNG saia com barra cinza no lugar do
  // texto porque o painter e o mesmo, e a escala do arquivo entrava nesta conta.
  paintLayout(layoutOf(o), 0, 0, o.h, p.adapt(o.color), o.fontFamily, o.fontSize, p);
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
    ctx.roundRect(0, 0, NOTE_ALERT_BAR, o.h, [4, 0, 0, 4]);
    ctx.fill();
  }

  // Mesmo criterio do texto solto, e pelo mesmo motivo: o conteudo do post-it e
  // desenhado sempre. Era este corte que fazia o post-it sair como um retangulo
  // colorido VAZIO no PNG exportado.
  const inset = noteInset(o);
  const layout = layoutCached(`${o.id}:${o.rev}`, o.content, noteStyle(o));
  // O texto acompanha o fundo: num post-it escuro, texto preto sumiria. Nao
  // passa pelo adaptador de tema porque o fundo tambem nao passa -- os dois sao
  // superficie, e o contraste entre eles ja esta resolvido aqui.
  paintLayout(
    layout,
    inset,
    NOTE_PAD,
    o.h - NOTE_PAD * 2,
    readableTextOn(bg),
    NOTE_FONT_FAMILY,
    NOTE_FONT_SIZE,
    p,
  );

  if (o.alert) paintAlertIcon(ctx, o);

  ctx.globalAlpha = 1;
}

/**
 * Desenha as linhas ja resolvidas pelo layout.
 *
 * `maxH` corta o que nao cabe: uma caixa de altura fixa com texto demais mostra
 * o que couber, e nunca deixa a ultima linha vazar por cima do que esta embaixo.
 */
function paintLayout(
  layout: TextLayout,
  originX: number,
  originY: number,
  maxH: number,
  color: string,
  fontFamily: string,
  fontSize: number,
  p: PaintContext,
): void {
  const { ctx } = p;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  for (const line of layout.lines) {
    if (line.y + line.height > maxH + 0.5) break;
    const baseY = originY + line.y + line.baseline;

    if (layout.indent > 0 && line.first) {
      ctx.font = textFont(fontSize, fontFamily, false, false);
      ctx.fillStyle = color;
      ctx.fillText(BULLET, originX + line.x - layout.indent, baseY);
    }

    for (const run of line.runs) {
      ctx.font = textFont(fontSize, fontFamily, run.bold, run.italic);
      // Cor propria do trecho e MARCA, e passa pelo adaptador de tema; sem isso
      // um trecho pintado de preto sumiria no quadro escuro enquanto o resto do
      // paragrafo continuaria legivel.
      ctx.fillStyle = run.color ? p.adapt(run.color) : color;
      const x = originX + line.x + run.x;
      ctx.fillText(run.text, x, baseY);
      if (run.underline) paintUnderline(ctx, x, baseY, run.width, fontSize);
    }
  }

  ctx.textBaseline = 'top';
}

function paintUnderline(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  width: number,
  fontSize: number,
): void {
  const thickness = Math.max(fontSize / 14, 0.5);
  ctx.fillRect(x, baseline + fontSize * 0.12, width, thickness);
}

/**
 * Icone do alerta, no canto inferior direito.
 *
 * Fica no canto oposto ao texto de proposito: o post-it e pequeno, e um icone
 * no topo empurraria o conteudo para baixo em vez de acompanha-lo.
 */
function paintAlertIcon(ctx: CanvasRenderingContext2D, o: NoteObject): void {
  const icon = o.alert?.icon;
  if (!icon) return;
  const size = Math.min(16, o.h / 2);
  ctx.font = `${size}px ${NOTE_FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.fillStyle = ALERT_COLORS[o.alert!.level];
  ctx.fillText(icon, o.w - 6, o.h - 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
