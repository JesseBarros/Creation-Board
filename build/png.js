// Decodificador e codificador PNG minimos, sem dependencias externas.
//
// Nasceram dentro do `make-icon.js` e sairam de la quando o segundo uso
// apareceu (`make-boot-logo.js`): duas copias do mesmo decodificador
// divergiriam na primeira correcao.
//
// Cobrem PNG de 8 bits, RGB ou RGBA, sem entrelacamento -- que e o que os
// exportadores de logo produzem. Trazer uma biblioteca de imagem para o projeto
// por causa de dois arquivos gerados uma vez nao se paga.
const zlib = require('node:zlib');

function decodePng(buf, nome = 'arquivo') {
  const SIG = '89504e470d0a1a0a';
  if (buf.slice(0, 8).toString('hex') !== SIG) throw new Error(`${nome} nao e um PNG`);

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

/**
 * Reducao por MEDIA DE AREA: cada pixel de saida e a media da regiao que ele
 * cobre na origem. Sem isso a logo, cheia de bordas finas e de gradientes,
 * sairia serrilhada -- amostrar o pixel do meio joga fora o resto.
 *
 * A media e ponderada pelo alfa, senao pixels transparentes puxariam a cor.
 */
function resize(img, outW, outH) {
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor((y * img.height) / outH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / outH));
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * img.width) / outW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / outW));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * img.width + sx) * 4;
          const al = img.data[o + 3] / 255;
          r += img.data[o] * al;
          g += img.data[o + 1] * al;
          b += img.data[o + 2] * al;
          a += al;
          n++;
        }
      }

      const o = (y * outW + x) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return { width: outW, height: outH, data: out };
}

// --- codificador ---

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

function encodePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const stride = img.width * 4;
  const raw = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { decodePng, resize, encodePng };
