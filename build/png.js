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

/**
 * Recorta `rect` da imagem e centraliza o recorte num quadrado de lado `side`,
 * preenchendo a sobra com `bg`.
 *
 * Serve aos tamanhos pequenos do icone: apertar a arte inteira em 16px vira
 * mancha, entao o recorte fica no que ainda se reconhece nesse tamanho. A sobra
 * e pintada com a cor de fundo em vez de puxada da origem -- puxar traria de
 * volta justamente o que o recorte tirou.
 */
function cropSquare(img, rect, side, bg) {
  const out = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    out[i * 4] = bg[0];
    out[i * 4 + 1] = bg[1];
    out[i * 4 + 2] = bg[2];
    out[i * 4 + 3] = bg[3];
  }

  const offX = Math.round((side - rect.w) / 2);
  const offY = Math.round((side - rect.h) / 2);
  for (let y = 0; y < rect.h; y++) {
    const sy = rect.y + y;
    const dy = offY + y;
    if (sy < 0 || sy >= img.height || dy < 0 || dy >= side) continue;
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x;
      const dx = offX + x;
      if (sx < 0 || sx >= img.width || dx < 0 || dx >= side) continue;
      img.data.copy(out, (dy * side + dx) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
    }
  }
  return { width: side, height: side, data: out };
}

/**
 * Uma imagem como DIB de icone (BITMAPINFOHEADER + BGRA de baixo para cima +
 * mascara AND).
 *
 * Os tamanhos pequenos vao como DIB e nao como PNG por compatibilidade: PNG
 * dentro de ICO so vale do Vista em diante e, mesmo hoje, alguns caminhos do
 * shell tratam melhor o DIB nos tamanhos de lista. Acima de 48 o PNG compensa,
 * porque o DIB e sempre sem compressao.
 */
function encodeIconDib(img) {
  const { width: w, height: h } = img;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  // Altura DOBRADA: o formato conta a imagem mais a mascara, mesmo com alfa.
  header.writeInt32LE(h * 2, 8);
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bits por pixel
  header.writeUInt32LE(0, 16); // BI_RGB

  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    // De baixo para cima, que e a ordem do DIB.
    const src = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = src + x * 4;
      const d = (y * w + x) * 4;
      pixels[d] = img.data[s + 2]; // B
      pixels[d + 1] = img.data[s + 1]; // G
      pixels[d + 2] = img.data[s]; // R
      pixels[d + 3] = img.data[s + 3]; // A
    }
  }

  // Mascara AND zerada: com 32 bits quem manda e o alfa, mas ela e obrigatoria
  // e as linhas sao alinhadas em 4 bytes.
  const maskStride = Math.ceil(w / 32) * 4;
  const mask = Buffer.alloc(maskStride * h);

  return Buffer.concat([header, pixels, mask]);
}

/** Monta o container ICO a partir de entradas ja codificadas. */
function packIco(entries) {
  const dir = Buffer.alloc(6 + entries.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type = icon
  dir.writeUInt16LE(entries.length, 4);

  let offset = dir.length;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size; // 0 significa 256
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0; // cores da paleta
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });

  return Buffer.concat([dir, ...entries.map((e) => e.data)]);
}

module.exports = { decodePng, resize, encodePng, cropSquare, encodeIconDib, packIco };
