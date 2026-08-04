import type { Camera } from '../core/Camera';
import type { SnapGuide } from '../features/snapping/snap';

/**
 * Guias de encaixe.
 *
 * Desenhadas em px de TELA, como o resto do cromo: a linha tem de sair com 1px
 * nitido em qualquer zoom. Cor propria, diferente do azul da selecao -- guia e
 * uma resposta do sistema ("encaixei aqui"), nao parte do objeto selecionado, e
 * confundir as duas faria parecer que o contorno da selecao ficou torto.
 */

const NEIGHBOR = '#e8590c';
const GRID = '#868e96';

export function paintSnapGuides(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  guides: readonly SnapGuide[],
): void {
  if (guides.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1;
  for (const g of guides) {
    const a =
      g.axis === 'x'
        ? camera.worldToScreen({ x: g.at, y: g.from })
        : camera.worldToScreen({ x: g.from, y: g.at });
    const b =
      g.axis === 'x'
        ? camera.worldToScreen({ x: g.at, y: g.to })
        : camera.worldToScreen({ x: g.to, y: g.at });

    ctx.strokeStyle = g.grid ? GRID : NEIGHBOR;
    // Grade tracejada, vizinho continuo: o encaixe na grade e mais fraco e nao
    // deve competir visualmente com o alinhamento que o usuario buscou.
    ctx.setLineDash(g.grid ? [3, 3] : []);
    ctx.beginPath();
    // Meio pixel alinha a linha de 1px a grade de pixels; sem isso ela sai
    // borrada em dois pixels de meio tom.
    if (g.axis === 'x') {
      const x = Math.round(a.x) + 0.5;
      ctx.moveTo(x, a.y);
      ctx.lineTo(x, b.y);
    } else {
      const y = Math.round(a.y) + 0.5;
      ctx.moveTo(a.x, y);
      ctx.lineTo(b.x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
