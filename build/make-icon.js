// Gera build/icon.ico (PNG 256x256 dentro de um container ICO) a partir da logo
// do aplicativo, sem dependencias externas.
//
// Uso: node build/make-icon.js <saida.ico> [origem.png]
//
// A origem padrao e a versao SO DO SIMBOLO da logo, sem o texto "Creation
// Board": num atalho de 32px o nome escrito seria uma mancha ilegivel, e o
// simbolo sozinho continua reconhecivel.
//
// O PNG e decodificado aqui a mao (zlib do Node + desfiltragem das linhas)
// porque trazer uma biblioteca de imagem para o projeto por causa de um
// arquivo gerado uma vez nao se paga. Cobre PNG de 8 bits, RGB ou RGBA, sem
// entrelacamento -- que e o que os exportadores de logo produzem.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.argv[2];
const SRC = process.argv[3] ?? path.join(__dirname, 'onlycloselogo.png');
const S = 256; // resolucao final

// --- decodificador PNG ---

function decodePng(buf) {
  const SIG = '89504e470d0a1a0a';
  if (buf.slice(0, 8).toString('hex') !== SIG) throw new Error(`${SRC} nao e um PNG`);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];

  if (depth !== 8) throw new Error(`profundidade ${depth} nao suportada (esperado 8)`);
  if (interlace !== 0) throw new Error('PNG entrelacado nao suportado');
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`tipo de cor ${colorType} nao suportado (esperado 2 ou 6)`);
  }

  const channels = colorType === 6 ? 4 : 3;

  // Os dados podem vir divididos em varios IDAT; a especificacao manda
  // concatenar antes de descomprimir.
  const parts = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString('ascii');
    if (type === 'IDAT') parts.push(buf.slice(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);

  // Desfiltragem: cada linha comeca com um byte dizendo como ela foi codificada
  // em relacao aos vizinhos da esquerda e de cima.
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0; // esquerda
      const b = prev[i]; // acima
      const c = i >= channels ? prev[i - channels] : 0; // diagonal
      let value = line[i];
      switch (filter) {
        case 1:
          value += a;
          break;
        case 2:
          value += b;
          break;
        case 3:
          value += (a + b) >> 1;
          break;
        case 4:
          value += paeth(a, b, c);
          break;
        case 0:
          break;
        default:
          throw new Error(`filtro PNG desconhecido: ${filter}`);
      }
      line[i] = value & 0xff;
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const o = (y * width + x) * 4;
      out[o] = line[s];
      out[o + 1] = line[s + 1];
      out[o + 2] = line[s + 2];
      out[o + 3] = channels === 4 ? line[s + 3] : 255;
    }

    line.copy(prev);
  }

  return { width, height, data: out };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// --- quadrado + reducao ---

const src = decodePng(fs.readFileSync(SRC));

// O icone precisa ser quadrado; a logo nao e. Centraliza no maior lado e
// preenche a sobra com a cor do proprio canto, para a borda nao aparecer como
// uma faixa de cor diferente.
const side = Math.max(src.width, src.height);
const padX = Math.round((side - src.width) / 2);
const padY = Math.round((side - src.height) / 2);
const corner = [src.data[0], src.data[1], src.data[2], src.data[3]];

const square = Buffer.alloc(side * side * 4);
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const o = (y * side + x) * 4;
    const sx = x - padX;
    const sy = y - padY;
    if (sx >= 0 && sx < src.width && sy >= 0 && sy < src.height) {
      src.data.copy(square, o, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4);
    } else {
      square[o] = corner[0];
      square[o + 1] = corner[1];
      square[o + 2] = corner[2];
      square[o + 3] = corner[3];
    }
  }
}

// Reducao por media de area: cada pixel de saida e a media da regiao que ele
// cobre na origem. Sem isso a logo, cheia de bordas finas, sairia serrilhada.
const img = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  const y0 = Math.floor((y * side) / S);
  const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * side) / S));
  for (let x = 0; x < S; x++) {
    const x0 = Math.floor((x * side) / S);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * side) / S));

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (let sy = y0; sy < y1; sy++) {
      for (let sx = x0; sx < x1; sx++) {
        const o = (sy * side + sx) * 4;
        // Media ponderada pelo alfa: pixels transparentes nao devem puxar a cor.
        const al = square[o + 3] / 255;
        r += square[o] * al;
        g += square[o + 1] * al;
        b += square[o + 2] * al;
        a += al;
        n++;
      }
    }

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
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
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
dir.writeUInt16LE(1, 2); // type = icon
dir.writeUInt16LE(1, 4); // count
dir[6] = 0;
dir[7] = 0; // 0 significa 256
dir[8] = 0;
dir[9] = 0;
dir.writeUInt16LE(1, 10); // planes
dir.writeUInt16LE(32, 12);
dir.writeUInt32LE(png.length, 14);
dir.writeUInt32LE(22, 18);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ico = Buffer.concat([dir, png]);
fs.writeFileSync(OUT, ico);
console.log(`icon.ico escrito a partir de ${path.basename(SRC)} (${src.width}x${src.height}):`);
console.log(`  ${OUT} — ${ico.length} bytes`);
