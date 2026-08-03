import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import { corners } from '@shared/model/bbox';
import type { BoardObject } from '@shared/model/types';
import type { Camera } from '../core/Camera';
import {
  framePoint,
  rotateHandlePoint,
  SCALE_HANDLES,
  HANDLE_PX,
  type SelectionFrame,
} from '../features/selection/frame';

/**
 * Cromo da selecao: contorno, alcas e laco.
 *
 * Tudo aqui e desenhado em px de TELA (ver `Renderer.beginOverlayScreen`), o que
 * mantem a espessura da linha e o tamanho da alca constantes de 1% a 6400% de
 * zoom. Desenhar no espaco do mundo faria a alca virar um ponto invisivel de
 * longe e um quadrado gigante de perto.
 */

const ACCENT = '#3b6ff0';

/** Contorno dos objetos individuais quando ha mais de um selecionado. */
const MEMBER_ALPHA = 0.5;

/**
 * A partir de quantos objetos o contorno individual deixa de ser desenhado.
 * Com uma selecao de milhares de objetos o contorno vira ruido visual solido e
 * ainda custa um path por objeto por frame -- justamente durante um arraste.
 */
const MAX_MEMBER_OUTLINES = 400;

export interface OverlayState {
  frame: SelectionFrame | null;
  /** Objetos selecionados, para o contorno individual. */
  members: readonly BoardObject[];
  /** Retangulo do laco em curso, em mundo. */
  marquee: Rect | null;
  /** Alcas so aparecem quando o gesto permite usa-las. */
  showHandles: boolean;
  /** Alca de rotacao some na selecao multipla girada, onde ela nao se aplica. */
  showRotate: boolean;
}

export function paintSelection(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  state: OverlayState,
): void {
  const { frame, members, marquee } = state;

  if (members.length > 1 && members.length <= MAX_MEMBER_OUTLINES) {
    ctx.save();
    ctx.globalAlpha = MEMBER_ALPHA;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const obj of members) {
      const pts = corners(obj).map((p) => camera.worldToScreen(p));
      tracePolygon(ctx, pts);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (frame) {
    const quad = [
      framePoint(frame, 0, 0),
      framePoint(frame, 1, 0),
      framePoint(frame, 1, 1),
      framePoint(frame, 0, 1),
    ].map((p) => camera.worldToScreen(p));

    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    tracePolygon(ctx, quad);
    ctx.stroke();

    if (state.showHandles) {
      if (state.showRotate) {
        const top = camera.worldToScreen(framePoint(frame, 0.5, 0));
        const knob = camera.worldToScreen(rotateHandlePoint(frame, camera.zoom));
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(knob.x, knob.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(knob.x, knob.y, HANDLE_PX / 2, 0, Math.PI * 2);
        fillHandle(ctx);
      }

      for (const h of SCALE_HANDLES) {
        const p = camera.worldToScreen(framePoint(frame, h.u, h.v));
        ctx.beginPath();
        // Meio pixel de deslocamento alinha a borda de 1px a grade de pixels,
        // senao a alca sai borrada entre dois pixels.
        ctx.rect(
          Math.round(p.x - HANDLE_PX / 2) + 0.5,
          Math.round(p.y - HANDLE_PX / 2) + 0.5,
          HANDLE_PX,
          HANDLE_PX,
        );
        fillHandle(ctx);
      }
    }
    ctx.restore();
  }

  if (marquee) {
    const a = camera.worldToScreen({ x: marquee.x, y: marquee.y });
    const b = camera.worldToScreen({ x: marquee.x + marquee.w, y: marquee.y + marquee.h });
    ctx.save();
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      Math.round(a.x) + 0.5,
      Math.round(a.y) + 0.5,
      Math.round(b.x - a.x),
      Math.round(b.y - a.y),
    );
    ctx.restore();
  }
}

function fillHandle(ctx: CanvasRenderingContext2D): void {
  // Miolo branco com borda de acento: legivel tanto sobre o quadro claro quanto
  // sobre uma imagem escura por baixo.
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: readonly Vec2[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}
