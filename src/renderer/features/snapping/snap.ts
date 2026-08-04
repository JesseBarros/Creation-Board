import { inflate, type Rect } from '@shared/geometry/rect';
import type { ObjectId } from '@shared/model/types';
import type { Document } from '../../core/Document';

/**
 * Encaixe (snap) de um retangulo em movimento.
 *
 * Duas fontes, nesta ordem de prioridade:
 *
 * 1. **Vizinhos.** As bordas e o centro dos objetos por perto viram linhas
 *    candidatas. E o que serve para reorganizar um resumo importado: alinhar
 *    dois post-its pelo topo e um titulo pelo centro de uma imagem.
 * 2. **Grade**, quando `snapToGrid` esta ligado nas preferencias do quadro.
 *
 * Vizinho vence a grade quando os dois estao ao alcance: alinhar com o objeto
 * que se esta olhando e uma intencao; cair na celula da grade e so uma
 * consequencia de onde a grade calhou de ficar.
 *
 * O limiar e em px de TELA. Em unidades de mundo, o encaixe ficaria imperceptivel
 * com o zoom afastado e agarraria tudo com o zoom aproximado.
 */

/** Distancia maxima, em px de tela, para uma linha atrair o retangulo. */
const THRESHOLD_PX = 7;

/**
 * Ate onde procurar vizinhos, em px de tela ao redor do retangulo movido.
 *
 * Alinhar com um objeto que esta fora da tela nao ajuda ninguem -- a guia
 * apareceria apontando para o nada -- e varrer o quadro inteiro custaria caro
 * num resumo de mil objetos.
 */
const SEARCH_PX = 500;

export interface SnapGuide {
  /** Eixo da linha: 'x' e uma linha vertical, 'y' e horizontal. */
  axis: 'x' | 'y';
  /** Coordenada de mundo onde a linha passa. */
  at: number;
  /** Extensao da linha no eixo perpendicular, em mundo. */
  from: number;
  to: number;
  /** Encaixe na grade, e nao num vizinho. Desenhado diferente. */
  grid: boolean;
}

export interface SnapResult {
  /** Correcao a somar ao deslocamento proposto. Zero quando nada encaixou. */
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export interface SnapOptions {
  doc: Document;
  zoom: number;
  /** Objetos que estao se movendo: nao podem se alinhar consigo mesmos. */
  exclude: ReadonlySet<ObjectId>;
  snapToGrid: boolean;
  gridSize: number;
  /** Eixos em que o encaixe pode agir. Shift travando um eixo desliga aquele. */
  axes?: { x?: boolean; y?: boolean };
}

const NONE: SnapResult = { dx: 0, dy: 0, guides: [] };

/**
 * Encaixa o retangulo, devolvendo a correcao e as guias a desenhar.
 *
 * O chamador soma `dx`/`dy` ao proprio deslocamento em vez de receber um
 * retangulo pronto: quem esta arrastando tem um delta acumulado desde o inicio
 * do gesto, e substituir a posicao faria o objeto perder o vinculo com o cursor.
 */
export function snapRect(r: Rect, opts: SnapOptions): SnapResult {
  const tol = THRESHOLD_PX / opts.zoom;
  if (tol <= 0) return NONE;

  const useX = opts.axes?.x ?? true;
  const useY = opts.axes?.y ?? true;
  if (!useX && !useY) return NONE;

  const neighbors = findNeighbors(r, opts);

  const x = useX ? bestAxis(r.x, r.x + r.w / 2, r.x + r.w, neighbors.x, tol) : null;
  const y = useY ? bestAxis(r.y, r.y + r.h / 2, r.y + r.h, neighbors.y, tol) : null;

  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;

  if (x) {
    dx = x.delta;
    guides.push(guideFor('x', x, r, dy));
  } else if (opts.snapToGrid && useX) {
    const g = snapToGrid(r.x, r.x + r.w / 2, r.x + r.w, opts.gridSize, tol);
    if (g) {
      dx = g.delta;
      guides.push({ axis: 'x', at: g.line, from: r.y, to: r.y + r.h, grid: true });
    }
  }

  if (y) {
    dy = y.delta;
    guides.push(guideFor('y', y, r, dx));
  } else if (opts.snapToGrid && useY) {
    const g = snapToGrid(r.y, r.y + r.h / 2, r.y + r.h, opts.gridSize, tol);
    if (g) {
      dy = g.delta;
      guides.push({ axis: 'y', at: g.line, from: r.x, to: r.x + r.w, grid: true });
    }
  }

  if (dx === 0 && dy === 0 && guides.length === 0) return NONE;
  return { dx, dy, guides };
}

/**
 * Encaixe de um PONTO -- o canto que esta sendo arrastado ao redimensionar ou ao
 * criar uma forma. Mesmas linhas candidatas, sem as bordas opostas nem o centro.
 */
export function snapPoint(
  px: number,
  py: number,
  opts: SnapOptions,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const tol = THRESHOLD_PX / opts.zoom;
  const probe: Rect = { x: px, y: py, w: 0, h: 0 };
  const neighbors = findNeighbors(probe, opts);

  const useX = opts.axes?.x ?? true;
  const useY = opts.axes?.y ?? true;

  const x = useX ? bestAxis(px, px, px, neighbors.x, tol) : null;
  const y = useY ? bestAxis(py, py, py, neighbors.y, tol) : null;

  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;

  if (x) {
    dx = x.delta;
    guides.push({ axis: 'x', at: x.line, from: x.from, to: x.to, grid: false });
  } else if (opts.snapToGrid && useX) {
    const g = snapToGrid(px, px, px, opts.gridSize, tol);
    if (g) {
      dx = g.delta;
      guides.push({ axis: 'x', at: g.line, from: py - 40 / opts.zoom, to: py + 40 / opts.zoom, grid: true });
    }
  }

  if (y) {
    dy = y.delta;
    guides.push({ axis: 'y', at: y.line, from: y.from, to: y.to, grid: false });
  } else if (opts.snapToGrid && useY) {
    const g = snapToGrid(py, py, py, opts.gridSize, tol);
    if (g) {
      dy = g.delta;
      guides.push({ axis: 'y', at: g.line, from: px - 40 / opts.zoom, to: px + 40 / opts.zoom, grid: true });
    }
  }

  return { dx, dy, guides };
}

// ------------------------------------------------------------------ interno

/** Uma linha candidata e a faixa que os objetos que a produziram ocupam. */
interface Candidate {
  line: number;
  /** Extensao dos vizinhos no eixo perpendicular, para a guia ter comprimento. */
  min: number;
  max: number;
}

interface AxisMatch {
  /** Correcao a aplicar. */
  delta: number;
  line: number;
  from: number;
  to: number;
}

function findNeighbors(r: Rect, opts: SnapOptions): { x: Candidate[]; y: Candidate[] } {
  const margin = SEARCH_PX / opts.zoom;
  const area = inflate(r, margin);

  // Um mapa por coordenada funde vizinhos que ja estao alinhados entre si: tres
  // post-its no mesmo topo produzem UMA guia atravessando os tres, e nao tres
  // linhas empilhadas no mesmo pixel.
  const xs = new Map<number, Candidate>();
  const ys = new Map<number, Candidate>();

  for (const obj of opts.doc.queryVisible(area)) {
    if (opts.exclude.has(obj.id)) continue;
    const b = obj.bbox;
    addCandidate(xs, b.x, b.y, b.y + b.h);
    addCandidate(xs, b.x + b.w / 2, b.y, b.y + b.h);
    addCandidate(xs, b.x + b.w, b.y, b.y + b.h);
    addCandidate(ys, b.y, b.x, b.x + b.w);
    addCandidate(ys, b.y + b.h / 2, b.x, b.x + b.w);
    addCandidate(ys, b.y + b.h, b.x, b.x + b.w);
  }

  return { x: [...xs.values()], y: [...ys.values()] };
}

function addCandidate(map: Map<number, Candidate>, line: number, min: number, max: number): void {
  // Quantiza em centesimos de unidade: bordas que diferem por erro de ponto
  // flutuante sao a mesma linha para quem esta olhando.
  const key = Math.round(line * 100) / 100;
  const found = map.get(key);
  if (found) {
    if (min < found.min) found.min = min;
    if (max > found.max) found.max = max;
    return;
  }
  map.set(key, { line: key, min, max });
}

/**
 * Melhor encaixe de um eixo.
 *
 * Testa as tres referencias do retangulo movido -- borda inicial, centro e borda
 * final -- contra todas as candidatas, e fica com a menor correcao. Empate vai
 * para a primeira encontrada, o que na pratica significa a borda inicial: e a
 * que o usuario esta vendo encostar.
 */
function bestAxis(
  start: number,
  center: number,
  end: number,
  candidates: readonly Candidate[],
  tol: number,
): AxisMatch | null {
  let best: AxisMatch | null = null;
  let bestDist = tol;

  for (const c of candidates) {
    for (const edge of [start, center, end]) {
      const delta = c.line - edge;
      const dist = Math.abs(delta);
      if (dist > bestDist) continue;
      // `>=` no empate manteria a ultima; `<` mantem a primeira referencia.
      if (best && dist >= bestDist) continue;
      bestDist = dist;
      best = { delta, line: c.line, from: c.min, to: c.max };
    }
  }
  return best;
}

function snapToGrid(
  start: number,
  center: number,
  end: number,
  size: number,
  tol: number,
): { delta: number; line: number } | null {
  if (size <= 0) return null;
  let best: { delta: number; line: number } | null = null;
  let bestDist = tol;

  for (const edge of [start, center, end]) {
    const line = Math.round(edge / size) * size;
    const delta = line - edge;
    const dist = Math.abs(delta);
    if (dist < bestDist) {
      bestDist = dist;
      best = { delta, line };
    }
  }
  return best;
}

/**
 * Guia de um encaixe entre objetos, esticada para incluir o proprio retangulo
 * movido -- ja na posicao corrigida. Sem isso a linha pararia no vizinho e nao
 * mostraria o que foi alinhado com o que.
 */
function guideFor(axis: 'x' | 'y', m: AxisMatch, r: Rect, otherDelta: number): SnapGuide {
  const from = axis === 'x' ? r.y + otherDelta : r.x + otherDelta;
  const to = axis === 'x' ? r.y + r.h + otherDelta : r.x + r.w + otherDelta;
  return {
    axis,
    at: m.line,
    from: Math.min(m.from, from),
    to: Math.max(m.to, to),
    grid: false,
  };
}
