/**
 * Ramer-Douglas-Peucker sobre pontos achatados.
 *
 * Um traco de caneta capturado a 120Hz chega com centenas de pontos, muitos
 * deles a menos de um pixel de distancia do vizinho. Guardar tudo incha o
 * arquivo e o custo de desenho sem mudar nada visualmente. O RDP mantem so os
 * pontos que realmente definem a forma dentro de uma tolerancia.
 *
 * Implementado de forma iterativa (com pilha explicita) em vez de recursiva:
 * um traco longo com milhares de pontos estouraria a pilha de chamadas.
 */
export function simplifyFlat(
  points: readonly number[],
  stride: number,
  epsilon: number,
): number[] {
  const n = Math.floor(points.length / stride);
  if (n < 3 || epsilon <= 0) return [...points];

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const eps2 = epsilon * epsilon;
  const stack: Array<[number, number]> = [[0, n - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    const ax = points[first * stride]!;
    const ay = points[first * stride + 1]!;
    const bx = points[last * stride]!;
    const by = points[last * stride + 1]!;
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;

    let maxDist2 = -1;
    let maxIndex = -1;

    for (let i = first + 1; i < last; i++) {
      const px = points[i * stride]!;
      const py = points[i * stride + 1]!;

      // Distancia perpendicular ao segmento, ao quadrado (evita a raiz).
      let d2: number;
      if (len2 === 0) {
        const dx = px - ax;
        const dy = py - ay;
        d2 = dx * dx + dy * dy;
      } else {
        let t = ((px - ax) * abx + (py - ay) * aby) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (ax + t * abx);
        const dy = py - (ay + t * aby);
        d2 = dx * dx + dy * dy;
      }

      if (d2 > maxDist2) {
        maxDist2 = d2;
        maxIndex = i;
      }
    }

    if (maxDist2 > eps2 && maxIndex > 0) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    for (let k = 0; k < stride; k++) out.push(points[i * stride + k]!);
  }
  return out;
}
