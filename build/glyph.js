// Glifo do icone para os TAMANHOS PEQUENOS, desenhado por distancia.
//
// POR QUE ELE EXISTE, e o numero que decidiu.
// A arte da logo tem o traco do quadro com 30px numa imagem de 726. Reduzida
// para 16px, esse traco vira **0,9 pixel** -- fino demais para existir, e o
// resultado e a mancha borrada que aparecia na barra de tarefas. Nao ha recorte
// nem filtro que conserte isso: para o traco ter 1,5px aos 16, ele precisaria
// ocupar 9% da largura, e ocupa 4%.
//
// Entao os tamanhos pequenos ganham um desenho PROPRIO, com as proporcoes
// refeitas para o tamanho em que vao aparecer. Nao e outra marca: e a mesma --
// o quadro aberto, o rabisco dentro e a caneta apoiada --, com o traco na
// espessura que 16px comporta. Simplificar conforme o tamanho cai e o que
// qualquer conjunto de icones de sistema faz.
//
// Desenhado por DISTANCIA (SDF) e nao por caminho: sem canvas no Node, medir a
// distancia de cada pixel ate a forma e o jeito curto de ter borda suave em
// qualquer tamanho. Com 4x4 amostras por pixel, a borda sai limpa.

const AMOSTRAS = 4;

/** Distancia com sinal ate um retangulo arredondado centrado em (cx, cy). */
function sdfRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Distancia ate um segmento de reta. */
function sdfSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distancia ate uma polilinha, com pontas arredondadas. */
function sdfPolyline(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    d = Math.min(d, sdfSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  }
  return d;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Compoe `src` (RGBA, alfa 0..1) sobre `dst` (RGBA 0..255), no lugar. */
function over(dst, o, r, g, b, a) {
  if (a <= 0) return;
  const inv = 1 - a;
  dst[o] = Math.round(r * a + dst[o] * inv);
  dst[o + 1] = Math.round(g * a + dst[o + 1] * inv);
  dst[o + 2] = Math.round(b * a + dst[o + 2] * inv);
  dst[o + 3] = Math.round(255 * a + dst[o + 3] * inv);
}

/**
 * Desenha o glifo num quadrado de lado `size`.
 *
 * Todas as medidas sao FRACAO do lado, e nao pixels: e isso que faz o mesmo
 * desenho sair com a mesma presenca a 16 e a 48.
 */
function renderGlyph(size) {
  const out = Buffer.alloc(size * size * 4);
  const S = size;
  const px = (f) => f * S;

  // Ladrilho de fundo, na cor da propria logo.
  const tileR = px(0.22);
  // Quadro: aberto no canto superior direito, como na logo.
  const frameHW = px(0.335);
  const frameHH = px(0.235);
  const frameCX = px(0.5);
  const frameCY = px(0.535);
  const frameR = px(0.08);
  const stroke = px(0.088); // ~1,4px aos 16 -- o numero que motivou este arquivo
  const meio = stroke / 2;

  // O rabisco: DUAS subidas altas, e nao tres baixas.
  //
  // A primeira versao tinha tres, na proporcao do desenho grande, e aos 16px
  // elas viravam uma barra horizontal -- os vales nao chegavam a um pixel.
  // Menos picos e mais amplitude e o que faz o gesto continuar parecendo
  // escrita a mao no tamanho pequeno.
  const rab = [
    px(0.3), px(0.62),
    px(0.38), px(0.44),
    px(0.47), px(0.61),
    px(0.56), px(0.44),
    px(0.65), px(0.58),
  ];
  const rabStroke = px(0.07);

  // A caneta apoiada na borda de baixo.
  const canetaY = px(0.735);
  const canetaX0 = px(0.45);
  const canetaX1 = px(0.62);
  const canetaStroke = px(0.05);

  // A abertura do quadro: a faixa do topo, a direita, que nao e desenhada.
  const aberturaX0 = px(0.55);
  const aberturaTopo = frameCY - frameHH;

  const passo = 1 / AMOSTRAS;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let tile = 0;
      let quadro = 0;
      let rabisco = 0;
      let caneta = 0;

      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const fx = x + (sx + 0.5) * passo;
          const fy = y + (sy + 0.5) * passo;

          if (sdfRoundRect(fx, fy, S / 2, S / 2, S / 2, S / 2, tileR) <= 0) tile++;

          // Contorno = |distancia ao retangulo| menor que meia espessura.
          const dq = Math.abs(sdfRoundRect(fx, fy, frameCX, frameCY, frameHW, frameHH, frameR));
          const naAbertura = fx > aberturaX0 && fy < aberturaTopo + stroke;
          if (dq <= meio && !naAbertura) quadro++;

          if (sdfPolyline(fx, fy, rab) <= rabStroke / 2) rabisco++;
          if (sdfSegment(fx, fy, canetaX0, canetaY, canetaX1, canetaY) <= canetaStroke / 2) caneta++;
        }
      }

      const n = AMOSTRAS * AMOSTRAS;
      const o = (y * S + x) * 4;

      over(out, o, 10, 13, 22, tile / n);

      // O quadro tem gradiente do azul escuro (embaixo, a esquerda) para o claro
      // (em cima, a direita), como na logo.
      const t = (x / S) * 0.5 + (1 - y / S) * 0.5;
      over(out, o, mix(43, 76, t), mix(92, 157, t), mix(240, 255, t), quadro / n);
      over(out, o, 108, 196, 255, rabisco / n);
      over(out, o, 238, 242, 248, caneta / n);
    }
  }

  return { width: S, height: S, data: out };
}

module.exports = { renderGlyph };
