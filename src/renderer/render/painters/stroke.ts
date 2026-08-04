import type { StrokeObject } from '@shared/model/types';
import type { PaintContext } from './types';

/** Passo do array achatado de pontos: [x, y, pressao]. */
export const STROKE_STRIDE = 3;

/**
 * Faixa de espessura do lapis, como fracao da largura nominal.
 *
 * O teto e 1 e nao pode subir: o AABB do traco e calculado inflando a linha de
 * centro em `width / 2` (ver shared/model/bbox.ts). Um pico de pressao que
 * passasse disso desenharia tinta fora do proprio retangulo do objeto, e o
 * culling a cortaria na borda da tela.
 */
const PENCIL_MIN = 0.45;
const PENCIL_MAX = 1;

export function paintStroke(o: StrokeObject, p: PaintContext): void {
  const { ctx } = p;

  // Em LOD reduzido usa a polilinha simplificada (RDP), que tem uma fracao dos
  // pontos e resultado visualmente identico nesse nivel de zoom.
  const pts = p.lod === 'full' ? o.points : (o.lod ?? o.points);
  if (pts.length < 4) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Marca-texto e superficie, nao marca: ele deve ter contraste baixo. Adaptar
  // sua cor o transformaria num traco opaco escuro, que e o oposto do efeito.
  ctx.strokeStyle = o.variant === 'highlighter' ? o.color : p.adapt(o.color);
  // Marca-texto e translucido por natureza; a ordem de camada que o mantem
  // atras do texto e resolvida no `z`, nao aqui.
  ctx.globalAlpha = o.opacity * (o.variant === 'highlighter' ? 0.4 : 1);

  // O lapis e o unico que usa a pressao que o modelo guarda: e ela que da a
  // variacao de peso da escrita a mao. Custa um path por segmento, entao so
  // vale de perto -- ao longe o RDP ja reduziu o traco a poucos pontos e a
  // variacao nao chegaria a um pixel.
  if (o.variant === 'pencil' && p.lod === 'full') {
    paintPressureVarying(o, pts, ctx);
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = STROKE_STRIDE; i + 1 < pts.length; i += STROKE_STRIDE) {
      ctx.lineTo(pts[i]!, pts[i + 1]!);
    }
    ctx.lineWidth = o.width;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/**
 * Um path por segmento, com a espessura media da pressao dos dois extremos.
 *
 * Media, e nao a pressao do ponto inicial: usar so um dos extremos deixaria um
 * degrau visivel em cada junta quando a pressao varia rapido.
 */
function paintPressureVarying(
  o: StrokeObject,
  pts: readonly number[],
  ctx: CanvasRenderingContext2D,
): void {
  const span = PENCIL_MAX - PENCIL_MIN;
  for (let i = 0; i + STROKE_STRIDE + 1 < pts.length; i += STROKE_STRIDE) {
    const pressure = (pts[i + 2]! + pts[i + STROKE_STRIDE + 2]!) / 2;
    const clamped = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
    ctx.beginPath();
    ctx.moveTo(pts[i]!, pts[i + 1]!);
    ctx.lineTo(pts[i + STROKE_STRIDE]!, pts[i + STROKE_STRIDE + 1]!);
    ctx.lineWidth = o.width * (PENCIL_MIN + span * clamped);
    ctx.stroke();
  }
}
