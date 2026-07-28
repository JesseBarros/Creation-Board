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
 * AABB dos pontos-fim de um caminho.
 *
 * Aproximacao consciente: ignora a curvatura de arcos e curvas, considerando so
 * os pontos de destino de cada comando. Nos caminhos de tinta importados os
 * arcos sao degenerados (comecam e terminam no mesmo ponto, servem de emenda
 * arredondada), entao os extremos reais coincidem com os pontos-fim. Para
 * qualquer caminho, o resultado nunca subestima em mais que o raio da curva.
 */
export function pathBounds(d: string): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pathEndpoints(d)) {
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

function* pathEndpoints(d: string): Generator<[number, number]> {
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

    yield [cx, cy];
  }
}

/** Aplica uma escala uniforme a todas as coordenadas de um caminho. */
export function scalePath(d: string, scale: number): string {
  if (scale === 1) return d;
  let out = '';
  let cmd = '';
  // Contador de parametros dentro do comando atual: em A, os parametros 3, 4 e 5
  // (rotacao e as duas flags) nao sao distancias e nao podem ser escalados.
  let argIndex = 0;

  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return d;

  for (const token of tokens) {
    if (/[a-z]/i.test(token)) {
      cmd = token.toUpperCase();
      argIndex = 0;
      out += `${out ? ' ' : ''}${token}`;
      continue;
    }

    const n = Number(token);
    const isFlagOrAngle = cmd === 'A' && (argIndex % 7 === 2 || argIndex % 7 === 3 || argIndex % 7 === 4);
    const value = isFlagOrAngle ? n : n * scale;
    // Arredonda para nao inflar o arquivo com casas decimais irrelevantes.
    out += ` ${isFlagOrAngle ? value : Math.round(value * 100) / 100}`;
    argIndex++;
  }

  return out.trim();
}
