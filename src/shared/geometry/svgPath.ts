import type { Rect } from './rect';

/**
 * Utilitarios minimos para caminhos SVG.
 *
 * Nao e um parser completo de SVG -- e o suficiente para os caminhos que a
 * importacao produz, que usam apenas M, L e A com coordenadas absolutas.
 * Escrever isto a mao evita arrastar uma biblioteca de geometria inteira para
 * dentro do app por causa de uma unica funcao.
 */

/**
 * AABB de um caminho.
 *
 * Considera os pontos de destino de cada comando e, nos arcos, tambem os
 * extremos reais da curva. O arco importa: a tinta importada termina em calotas
 * arredondadas, que avancam um raio alem do ultimo ponto NA DIRECAO DO TRACO --
 * e so nela. Medido contra o motor de layout (dev/layoutOracle.ts), ignorar o
 * arco encolhia o retangulo de um traco em 6px em cima e embaixo, e inflar o
 * ponto pelo raio nos dois eixos o alargava 6px de cada lado. Nenhuma das duas
 * aproximacoes serve; o extremo do arco resolve as duas.
 *
 * Continua sendo aproximacao para curvas de Bezier, cuja curvatura e ignorada.
 * A tinta importada nao usa nenhuma.
 */
export function pathBounds(d: string): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pathPoints(d)) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Numero de parametros de cada comando, e quantos formam o ponto final. */
const COMMANDS: Record<string, { params: number; endpoint: number }> = {
  M: { params: 2, endpoint: 2 },
  L: { params: 2, endpoint: 2 },
  T: { params: 2, endpoint: 2 },
  H: { params: 1, endpoint: 1 },
  V: { params: 1, endpoint: 1 },
  S: { params: 4, endpoint: 2 },
  Q: { params: 4, endpoint: 2 },
  C: { params: 6, endpoint: 2 },
  // Arco: rx ry rotacao arco-grande varredura x y -- so os dois ultimos sao o destino.
  A: { params: 7, endpoint: 2 },
  Z: { params: 0, endpoint: 0 },
};

/** Pontos que definem o AABB: destinos dos comandos e extremos dos arcos. */
function* pathPoints(d: string): Generator<[number, number]> {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return;

  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/[a-z]/i.test(token)) {
      cmd = token;
      i++;
      if (cmd.toUpperCase() === 'Z') continue;
    }

    const spec = COMMANDS[cmd.toUpperCase()];
    if (!spec || spec.params === 0) {
      i++;
      continue;
    }

    const relative = cmd === cmd.toLowerCase();
    const args: number[] = [];
    for (let k = 0; k < spec.params && i < tokens.length; k++, i++) {
      args.push(Number(tokens[i]));
    }
    if (args.length < spec.params) return; // caminho truncado

    const upper = cmd.toUpperCase();
    const fromX = cx;
    const fromY = cy;

    if (upper === 'H') {
      cx = relative ? cx + args[0]! : args[0]!;
    } else if (upper === 'V') {
      cy = relative ? cy + args[0]! : args[0]!;
    } else {
      const ex = args[spec.params - 2]!;
      const ey = args[spec.params - 1]!;
      cx = relative ? cx + ex : ex;
      cy = relative ? cy + ey : ey;
    }

    // `A rx ry rotacao arco-grande varredura x y`
    if (upper === 'A') {
      yield* arcExtremes(fromX, fromY, args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, cx, cy);
    }

    yield [cx, cy];
  }
}

/**
 * Pontos extremos de um arco eliptico, em coordenadas absolutas.
 *
 * Converte da forma "por pontos-fim" do SVG para a forma "por centro" (o
 * procedimento F.6.5 da especificacao) e devolve os pontos onde a tangente fica
 * horizontal ou vertical, descartando os que caem fora do trecho percorrido.
 * Sao esses pontos, e nao os pontos-fim, que definem ate onde a curva chega.
 */
function* arcExtremes(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Generator<[number, number]> {
  // Arco degenerado: a especificacao manda ignora-lo. E o caso das emendas
  // entre amostras da caneta, que comecam e terminam no mesmo ponto.
  if ((x1 === x2 && y1 === y2) || rx === 0 || ry === 0) return;

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotation * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const px = cosP * dx + sinP * dy;
  const py = -sinP * dx + cosP * dy;

  // Raios menores que a corda nao alcancam os dois pontos: a especificacao
  // manda aumenta-los ate o arco fechar.
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const num = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
  const den = rx * rx * py * py + ry * ry * px * px;
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * py) / ry;
  const cyp = (-coef * ry * px) / rx;

  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

  const start = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  const end = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx);
  let delta = end - start;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  // Angulos em que a tangente zera em cada eixo. Os dois opostos entram junto,
  // porque a elipse tem um extremo de cada lado.
  const candidates = [
    Math.atan2(-ry * sinP, rx * cosP),
    Math.atan2(ry * cosP, rx * sinP),
  ];

  for (const base of candidates) {
    for (const theta of [base, base + Math.PI]) {
      if (!withinSweep(theta, start, delta)) continue;
      yield [
        cx + rx * cosP * Math.cos(theta) - ry * sinP * Math.sin(theta),
        cy + rx * sinP * Math.cos(theta) + ry * cosP * Math.sin(theta),
      ];
    }
  }
}

/** O angulo esta no trecho percorrido a partir de `start` girando `delta`? */
function withinSweep(theta: number, start: number, delta: number): boolean {
  const TAU = 2 * Math.PI;
  // Distancia angular de `start` ate `theta` no sentido do giro, em [0, 2pi).
  const travelled = delta >= 0 ? mod(theta - start, TAU) : mod(start - theta, TAU);
  return travelled <= Math.abs(delta);
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Papel de cada parametro dentro de um comando, para saber o que escalar e deslocar. */
type ParamRole = 'x' | 'y' | 'rx' | 'ry' | 'raw';

const PARAM_ROLES: Record<string, ParamRole[]> = {
  M: ['x', 'y'],
  L: ['x', 'y'],
  T: ['x', 'y'],
  H: ['x'],
  V: ['y'],
  C: ['x', 'y', 'x', 'y', 'x', 'y'],
  S: ['x', 'y', 'x', 'y'],
  Q: ['x', 'y', 'x', 'y'],
  // rx ry rotacao arco-grande varredura x y -- rotacao e as duas flags nao sao
  // distancias e nao podem ser tocadas.
  A: ['rx', 'ry', 'raw', 'raw', 'raw', 'x', 'y'],
  Z: [],
};

/**
 * Assa uma escala e um deslocamento nas coordenadas de um caminho.
 *
 * Serve para tirar o caminho do sistema de coordenadas em que ele foi gravado e
 * levá-lo ao espaco local do objeto, de uma vez, para nenhum transform extra
 * precisar acompanhar o caminho na hora de desenhar.
 *
 * O deslocamento so vale para comandos ABSOLUTOS. Num comando relativo as
 * coordenadas sao distancias, nao posicoes: desloca-las duplicaria o efeito a
 * cada segmento e desmontaria o traco.
 */
export function transformPath(
  d: string,
  scaleX: number,
  scaleY: number,
  offsetX: number,
  offsetY: number,
): string {
  if (scaleX === 1 && scaleY === 1 && offsetX === 0 && offsetY === 0) return d;

  let out = '';
  let cmd = '';
  let absolute = true;
  let argIndex = 0;

  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return d;

  for (const token of tokens) {
    if (/[a-z]/i.test(token)) {
      cmd = token.toUpperCase();
      absolute = token === cmd;
      argIndex = 0;
      out += `${out ? ' ' : ''}${token}`;
      continue;
    }

    const roles = PARAM_ROLES[cmd];
    const n = Number(token);
    if (!roles || roles.length === 0) {
      out += ` ${n}`;
      argIndex++;
      continue;
    }

    // Um comando pode trazer varios conjuntos de parametros seguidos; o resto da
    // divisao diz em que posicao do conjunto estamos.
    const role = roles[argIndex % roles.length]!;
    let value: number;
    switch (role) {
      case 'x':
        value = n * scaleX + (absolute ? offsetX : 0);
        break;
      case 'y':
        value = n * scaleY + (absolute ? offsetY : 0);
        break;
      case 'rx':
        value = n * scaleX;
        break;
      case 'ry':
        value = n * scaleY;
        break;
      default:
        value = n;
    }

    // Arredonda para nao inflar o arquivo com casas decimais irrelevantes.
    out += ` ${role === 'raw' ? value : Math.round(value * 100) / 100}`;
    argIndex++;
  }

  return out.trim();
}
