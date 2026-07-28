// Gera build/icon.ico (PNG 256x256 dentro de um container ICO), sem dependencias.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.argv[2];
const S = 256; // resolucao final
const SS = 4; // supersampling para antialiasing
const N = S * SS;

// --- helpers de desenho (coordenadas em [0,N)) ---
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  return Math.min(Math.max(cx, cy), 0) + Math.hypot(dx, dy) - r;
}

function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
    if (d < best) best = d;
  }
  return best;
}

// Curva de caneta: uma senoide suave atravessando o quadro.
const curve = [];
for (let i = 0; i <= 60; i++) {
  const t = i / 60;
  const x = 0.24 * N + t * 0.42 * N;
  const y = 0.55 * N - Math.sin(t * Math.PI * 1.0) * 0.16 * N + t * 0.03 * N;
  curve.push(x, y);
}

function over(dst, src, a) {
  // composicao "source over" em RGB opaco
  for (let i = 0; i < 3; i++) dst[i] = src[i] * a + dst[i] * (1 - a);
}

const TILE = [0x3b, 0x6f, 0xf0];
const BOARD = [0xff, 0xff, 0xff];
const STROKE = [0x2b, 0x50, 0xc8];
const NOTE = [0xff, 0xc4, 0x4d];

const hi = new Uint8Array(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;

    let a = 0;
    const col = [0, 0, 0];

    // tile arredondado (define o alpha do icone)
    if (sdRoundRect(px, py, 0.03 * N, 0.03 * N, 0.94 * N, 0.94 * N, 0.20 * N) < 0) {
      a = 1;
      col[0] = TILE[0]; col[1] = TILE[1]; col[2] = TILE[2];
    }
    if (a === 0) { const o = (y * N + x) * 4; hi[o + 3] = 0; continue; }

    // quadro branco interno
    if (sdRoundRect(px, py, 0.16 * N, 0.18 * N, 0.68 * N, 0.64 * N, 0.06 * N) < 0) {
      over(col, BOARD, 1);
    } else { const o = (y * N + x) * 4; hi[o] = col[0]; hi[o+1] = col[1]; hi[o+2] = col[2]; hi[o+3] = 255; continue; }

    // traco de caneta
    if (distToPolyline(px, py, curve) < 0.045 * N) over(col, STROKE, 1);

    // post-it amarelo no canto inferior direito do quadro
    if (sdRoundRect(px, py, 0.615 * N, 0.60 * N, 0.165 * N, 0.165 * N, 0.02 * N) < 0) {
      over(col, NOTE, 1);
    }

    const o = (y * N + x) * 4;
    hi[o] = col[0]; hi[o + 1] = col[1]; hi[o + 2] = col[2]; hi[o + 3] = 255;
  }
}

// --- downsample box SSxSS ---
const img = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const o = ((y * SS + sy) * N + (x * SS + sx)) * 4;
        const al = hi[o + 3] / 255;
        r += hi[o] * al; g += hi[o + 1] * al; b += hi[o + 2] * al; a += al;
      }
    }
    const n = SS * SS;
    const o = (y * S + x) * 4;
    img[o] = a > 0 ? Math.round(r / a) : 0;
    img[o + 1] = a > 0 ? Math.round(g / a) : 0;
    img[o + 2] = a > 0 ? Math.round(b / a) : 0;
    img[o + 3] = Math.round((a / n) * 255);
  }
}

// --- encoder PNG minimo ---
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filtro None
  img.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// --- container ICO com uma unica entrada PNG 256x256 ---
const dir = Buffer.alloc(22);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);  // type = icon
dir.writeUInt16LE(1, 4);  // count
dir[6] = 0; dir[7] = 0;   // 0 significa 256
dir[8] = 0; dir[9] = 0;
dir.writeUInt16LE(1, 10); // planes
dir.writeUInt16LE(32, 12);
dir.writeUInt32BE(0, 14);
dir.writeUInt32LE(png.length, 14);
dir.writeUInt32LE(22, 18);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([dir, png]));
console.log('icon.ico escrito:', OUT, Buffer.concat([dir, png]).length, 'bytes');
