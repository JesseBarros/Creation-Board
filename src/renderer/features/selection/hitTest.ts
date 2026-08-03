import type { Rect } from '@shared/geometry/rect';
import { intersects } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import { localBounds, worldToLocal } from '@shared/model/bbox';
import type { BoardObject, ShapeObject, StrokeObject } from '@shared/model/types';
import type { Document } from '../../core/Document';
import { path2dFor } from '../../render/painters/path';

/**
 * Hit-test: que objeto esta sob o cursor.
 *
 * O ponto central e que o AABB NAO responde essa pergunta. Um traco manuscrito
 * diagonal ocupa um retangulo enorme e quase nenhum pixel dele; um "V" grande
 * tem o meio vazio. Selecionar por AABB faria o clique no vazio agarrar o traco
 * -- e, pior, agarrar o traco de cima em vez do texto que esta visivelmente ali.
 * Por isso o AABB serve so como filtro barato (via R-tree) e a decisao final e
 * tomada contra a geometria real de cada tipo.
 */

/**
 * Folga do clique, em px de tela. Convertida para mundo pelo zoom, o que mantem
 * a sensacao constante: um traco de cabelo continua clicavel a 10% de zoom.
 */
const SLOP_PX = 4;

/** Canvas de 1x1 usado so como dono de um contexto para `isPointInPath`. */
let probeCtx: CanvasRenderingContext2D | null = null;

function pathProbe(): CanvasRenderingContext2D {
  if (!probeCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Contexto 2D indisponivel para o hit-test');
    probeCtx = ctx;
  }
  return probeCtx;
}

/** Objeto mais acima sob o ponto (em mundo), ou null se o clique caiu no vazio. */
export function hitTest(doc: Document, world: Vec2, zoom: number): BoardObject | null {
  const tol = SLOP_PX / zoom;
  const probe: Rect = { x: world.x - tol, y: world.y - tol, w: tol * 2, h: tol * 2 };

  // `queryVisible` ja devolve ordenado de tras para frente e sem os ocultos;
  // percorrer ao contrario da a resposta que o usuario enxerga -- o de cima.
  const candidates = doc.queryVisible(probe);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const obj = candidates[i]!;
    if (obj.locked) continue;
    if (hitsObject(obj, world.x, world.y, tol)) return obj;
  }
  return null;
}

/**
 * Objetos pegos por um retangulo de selecao (marquee).
 *
 * Aqui o criterio e o AABB, e nao a geometria fina: arrastar um laco e um gesto
 * de "pegue tudo por aqui", nao de mira. Refinar por geometria faria o laco
 * ignorar objetos que o usuario visivelmente cercou, que surpreende mais do que
 * pegar um a mais -- e o excedente sai com um Shift+clique.
 */
export function hitTestRect(doc: Document, rect: Rect): BoardObject[] {
  const out: BoardObject[] = [];
  for (const obj of doc.queryVisible(rect)) {
    if (obj.locked) continue;
    if (intersects(obj.bbox, rect)) out.push(obj);
  }
  return out;
}

/** O ponto de mundo acerta a geometria real deste objeto? */
export function hitsObject(obj: BoardObject, wx: number, wy: number, tolWorld: number): boolean {
  const t = obj.transform;
  const p = worldToLocal(t, wx, wy);

  // Tolerancia levada para o espaco local. Com escala anisotropica o circulo de
  // folga vira elipse; usar a MENOR escala mantem a folga generosa nos dois
  // eixos. E o erro certo a cometer: deixar de pegar um traco fino incomoda mais
  // que aceitar um clique 1px fora dele.
  const s = Math.min(Math.abs(t.scaleX) || 1, Math.abs(t.scaleY) || 1);
  const tol = tolWorld / s;

  // Rejeicao barata contra o retangulo local antes de qualquer conta fina.
  const lb = localBounds(obj);
  if (
    p.x < lb.x - tol ||
    p.y < lb.y - tol ||
    p.x > lb.x + lb.w + tol ||
    p.y > lb.y + lb.h + tol
  ) {
    return false;
  }

  switch (obj.type) {
    case 'stroke':
      return hitsStroke(obj, p, tol);

    case 'path': {
      // O mesmo Path2D que foi desenhado responde se o ponto caiu na tinta.
      // A matriz do contexto fica na identidade de proposito: assim `p`, que ja
      // esta em espaco local, e interpretado no espaco do proprio caminho.
      const ctx = pathProbe();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const path = path2dFor(obj);
      const rule = obj.fillRule ?? 'nonzero';
      if (ctx.isPointInPath(path, p.x, p.y, rule)) return true;
      // Tinta fina pode ser mais estreita que a mira. Quatro sondas ao redor
      // dao a mesma folga do resto sem precisar engrossar o caminho.
      for (const [dx, dy] of [
        [tol, 0],
        [-tol, 0],
        [0, tol],
        [0, -tol],
      ] as const) {
        if (ctx.isPointInPath(path, p.x + dx, p.y + dy, rule)) return true;
      }
      return false;
    }

    case 'shape':
      return hitsShape(obj, p, tol);

    case 'text':
    case 'note':
    case 'image':
      // Superficies retangulares: o retangulo local JA e a geometria real.
      return true;

    case 'group':
      // Grupo nao tem geometria propria; quem responde sao os filhos, que estao
      // no indice por conta propria.
      return false;
  }
}

function hitsStroke(o: StrokeObject, p: Vec2, tol: number): boolean {
  const pts = o.points;
  if (pts.length < 2) return false;
  const reach = o.width / 2 + tol;

  // Traco de um ponto so: um pingo, testado como circulo.
  if (pts.length < 6) return Math.hypot(p.x - pts[0]!, p.y - pts[1]!) <= reach;

  for (let i = 0; i + 4 < pts.length; i += 3) {
    if (distToSegment(p.x, p.y, pts[i]!, pts[i + 1]!, pts[i + 3]!, pts[i + 4]!) <= reach) {
      return true;
    }
  }
  return false;
}

function hitsShape(o: ShapeObject, p: Vec2, tol: number): boolean {
  const reach = (o.stroke ? o.strokeWidth / 2 : 0) + tol;

  switch (o.kind) {
    case 'line':
    case 'arrow':
      return distToSegment(p.x, p.y, 0, 0, o.w, o.h) <= reach;

    case 'ellipse':
    case 'circle': {
      const rx = Math.max(Math.abs(o.w / 2), 1e-6);
      const ry = Math.max(Math.abs(o.h / 2), 1e-6);
      const nx = (p.x - o.w / 2) / rx;
      const ny = (p.y - o.h / 2) / ry;
      const d = Math.hypot(nx, ny);
      if (o.fill !== null) return d <= 1 + reach / Math.min(rx, ry);
      // Elipse sem preenchimento: so a borda conta. A distancia normalizada e
      // reconvertida pelo menor raio, o que subestima a folga no eixo longo --
      // aceitavel, ja que a alternativa exata custa resolver uma quartica.
      return Math.abs(d - 1) * Math.min(rx, ry) <= reach;
    }

    default: {
      const poly = shapePolygon(o);
      if (o.fill !== null && pointInPolygon(p, poly)) return true;
      return distToPolygonEdge(p, poly) <= reach;
    }
  }
}

/** Vertices em espaco local das formas fechadas. */
function shapePolygon(o: ShapeObject): Vec2[] {
  const { w, h } = o;
  switch (o.kind) {
    case 'triangle':
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    case 'diamond':
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ];
    default:
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
  }
}

/** Ray casting horizontal: conta cruzamentos a direita do ponto. */
function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolygonEdge(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(p.x, p.y, poly[j]!.x, poly[j]!.y, poly[i]!.x, poly[i]!.y);
    if (d < best) best = d;
  }
  return best;
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // Segmento degenerado (dois pontos iguais): vira distancia ao ponto.
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  // Projecao escalar presa a [0,1] para nao sair das pontas do segmento.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
