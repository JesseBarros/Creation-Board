import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';

/**
 * Faixa de zoom.
 *
 * Larga de proposito: 1% permite enxergar um quadro de estudos inteiro de uma
 * vez, e 6400% permite acertar o detalhe de um traco fino. Os limites existem
 * so para evitar dois problemas concretos -- perda de precisao de ponto
 * flutuante na matriz do canvas em escalas extremas, e ficar "perdido" sem
 * referencia visual num zoom de onde nao se sabe voltar (dai o Ctrl+1).
 */
export const MIN_ZOOM = 0.01; // 1%
export const MAX_ZOOM = 64; // 6400%

/**
 * Camera do canvas infinito.
 *
 * Convencao: `x`/`y` sao as coordenadas de MUNDO que caem no canto superior
 * esquerdo da tela. A transformacao e sempre:
 *   tela  = (mundo - camera) * zoom
 *   mundo = tela / zoom + camera
 *
 * Nao existe limite de pan: o quadro e realmente infinito.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y };
  }

  /** Retangulo do mundo atualmente visivel, dado o tamanho da viewport em CSS px. */
  viewportRect(viewportW: number, viewportH: number): Rect {
    return { x: this.x, y: this.y, w: viewportW / this.zoom, h: viewportH / this.zoom };
  }

  panByScreen(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /**
   * Aplica zoom mantendo fixo o ponto do mundo que esta sob `anchor` (em px de
   * tela). E isso que faz o zoom parecer "centrado no cursor".
   */
  zoomAt(anchor: Vec2, factor: number): void {
    const next = clampZoom(this.zoom * factor);
    if (next === this.zoom) return;

    const worldBefore = this.screenToWorld(anchor);
    this.zoom = next;
    const worldAfter = this.screenToWorld(anchor);

    // Corrige a camera pela deriva que o zoom introduziu sob o cursor.
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
  }

  setZoomAt(anchor: Vec2, zoom: number): void {
    this.zoomAt(anchor, clampZoom(zoom) / this.zoom);
  }

  /** Enquadra um retangulo do mundo na viewport, com margem em px de tela. */
  fitTo(target: Rect, viewportW: number, viewportH: number, padding = 64): void {
    if (target.w <= 0 || target.h <= 0) {
      this.zoom = 1;
      this.x = target.x - viewportW / 2;
      this.y = target.y - viewportH / 2;
      return;
    }
    const availW = Math.max(1, viewportW - padding * 2);
    const availH = Math.max(1, viewportH - padding * 2);
    this.zoom = clampZoom(Math.min(availW / target.w, availH / target.h));
    // Centraliza: sobra de espaco dividida igualmente dos dois lados.
    this.x = target.x + target.w / 2 - viewportW / 2 / this.zoom;
    this.y = target.y + target.h / 2 - viewportH / 2 / this.zoom;
  }

  reset(viewportW: number, viewportH: number): void {
    this.zoom = 1;
    this.x = -viewportW / 2;
    this.y = -viewportH / 2;
  }

  snapshot(): { x: number; y: number; zoom: number } {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  restore(s: { x: number; y: number; zoom: number }): void {
    this.x = s.x;
    this.y = s.y;
    this.zoom = clampZoom(s.zoom);
  }
}

export function clampZoom(z: number): number {
  return z < MIN_ZOOM ? MIN_ZOOM : z > MAX_ZOOM ? MAX_ZOOM : z;
}
