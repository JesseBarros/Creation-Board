/**
 * TIRA OS METADADOS DE UMA IMAGEM -- sem recomprimir, sem tocar num pixel.
 *
 * Nasceu na auditoria de seguranca de 30/09/2026. Ate ali toda imagem colada ou
 * arrastada para um quadro era guardada no `.wbd` BYTE A BYTE, com tudo o que o
 * arquivo trazia: a posicao de GPS de uma foto de celular, o modelo do
 * aparelho, a data, o programa que editou, o manifesto de procedencia (C2PA)
 * de imagem gerada por IA. Quem recebesse o quadro -- ou o SVG exportado dele,
 * que embute os mesmos bytes -- podia ler tudo isso.
 *
 * O CORTE E POR CONTEINER, e nao por decodificar e codificar de novo: os blocos
 * de dados da imagem (IDAT do PNG, a varredura do JPEG, o VP8 do WebP) sao
 * copiados como estao. A imagem desenhada e identica, e nao ha perda de
 * qualidade nem mudanca de tamanho em pixels.
 *
 * O QUE FICA e so o que muda o DESENHO:
 *   - perfil e espaco de cor (ICC, sRGB, gama...): sem ele as cores mudam;
 *   - animacao (APNG, WebP animado, laco do GIF);
 *   - a ORIENTACAO da foto. Celular grava a foto "deitada" e diz no EXIF como
 *     gira-la; o Chromium obedece. Tirar o EXIF inteiro deixaria a foto
 *     deitada no quadro. Quando a orientacao nao e a normal, o EXIF e trocado
 *     por um minimo, com essa unica informacao.
 *
 * A miniatura embutida no EXIF sai junto com ele -- e e ela o vazamento
 * classico: a foto recortada que ainda carrega, na miniatura, a foto inteira.
 * Pelo mesmo motivo a miniatura do JFIF e zerada, e o MPF (imagens
 * secundarias, mapa de profundidade do retrato do celular) sai.
 *
 * Formatos: JPEG, PNG, WebP e GIF. Qualquer outro volta intacto e com
 * `formato: null` -- quem chama decide o que fazer (hoje: nada; BMP nao tem
 * onde guardar metadado, e AVIF/HEIC nao entram pelo colar do Chromium).
 *
 * Puro, sem DOM e sem Node: roda no renderer (imagens do quadro), no main
 * (fundo personalizado) e no `check:imagens`.
 */

export type FormatoImagem = 'jpeg' | 'png' | 'webp' | 'gif';

/** Marca de `removidos` para um conteiner que nao deu para ler. */
export const ILEGIVEL = 'ILEGIVEL';
/** Marca de `removidos` para bytes grudados depois do fim da imagem. */
export const DEPOIS_DO_FIM = 'dados depois do fim da imagem';

export interface ImagemLimpa {
  bytes: Uint8Array;
  formato: FormatoImagem | null;
  /** O que saiu, em nomes legiveis ("EXIF", "XMP", "tEXt"...). Vazio: nada a tirar. */
  removidos: string[];
}

/** Descobre o formato pela ASSINATURA dos bytes, nunca pela extensao ou pelo tipo declarado. */
export function formatoDe(b: Uint8Array): FormatoImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'gif';
  return null;
}

export function limparMetadados(bytes: Uint8Array): ImagemLimpa {
  const formato = formatoDe(bytes);
  try {
    switch (formato) {
      case 'jpeg':
        return limparJpeg(bytes);
      case 'png':
        return limparPng(bytes);
      case 'webp':
        return limparWebp(bytes);
      case 'gif':
        return limparGif(bytes);
      default:
        return { bytes, formato: null, removidos: [] };
    }
  } catch {
    // Conteiner truncado ou malformado: volta o ORIGINAL, marcado com
    // `ILEGIVEL`, e quem chama decide. Nao ha como cortar com seguranca o que
    // nao se consegue ler -- e recusar aqui apagaria, num quadro antigo, uma
    // imagem que o Chromium talvez ainda desenhe.
    return { bytes, formato, removidos: [ILEGIVEL] };
  }
}

// ------------------------------------------------------------------ JPEG

function limparJpeg(b: Uint8Array): ImagemLimpa {
  const partes: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  const removidos: string[] = [];
  let orientacao: number | null = null;
  let i = 2;
  let depoisDoApp0 = 1; // onde entra o EXIF minimo, se precisar

  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('marcador esperado');
    let m = b[i + 1]!;
    // Bytes de preenchimento 0xFF antes do marcador.
    let ini = i;
    while (m === 0xff) {
      i++;
      m = b[i + 1]!;
    }
    ini = i;

    if (m === 0xd9) {
      partes.push(b.subarray(ini, ini + 2));
      i = ini + 2;
      break;
    }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      partes.push(b.subarray(ini, ini + 2));
      i = ini + 2;
      continue;
    }
    if (m === 0xda) {
      // Inicio de uma varredura: o cabecalho dela e, depois, os dados
      // comprimidos, copiados como estao ate o proximo marcador de verdade.
      // Dentro deles 0xFF so aparece seguido de 0x00 (escape) ou de RSTn.
      // Percorrer -- em vez de copiar o resto do arquivo -- e o que deixa de
      // fora o que vem grudado DEPOIS do fim: o video da "foto com movimento"
      // do celular e as imagens secundarias do MPF.
      const lenSos = (b[ini + 2]! << 8) | b[ini + 3]!;
      let j = ini + 2 + lenSos;
      if (j > b.length) throw new Error('varredura truncada');
      while (j < b.length) {
        if (b[j] === 0xff) {
          const n = b[j + 1];
          if (n === 0x00 || (n !== undefined && n >= 0xd0 && n <= 0xd7)) {
            j += 2;
            continue;
          }
          if (n !== 0xff) break;
        }
        j++;
      }
      partes.push(b.subarray(ini, j));
      i = j;
      continue;
    }

    const len = (b[ini + 2]! << 8) | b[ini + 3]!;
    if (len < 2 || ini + 2 + len > b.length) throw new Error('segmento truncado');
    const seg = b.subarray(ini, ini + 2 + len);
    const dados = b.subarray(ini + 4, ini + 2 + len);
    i = ini + 2 + len;

    if (m === 0xe0) {
      if (ascii(dados, 0, 5) === 'JFIF\0' && dados.length >= 14) {
        // Mantem o cabecalho JFIF (densidade), sem a miniatura.
        const novo = new Uint8Array(18);
        novo.set([0xff, 0xe0, 0x00, 0x10]);
        novo.set(dados.subarray(0, 12), 4);
        novo[16] = 0; // largura da miniatura
        novo[17] = 0; // altura da miniatura
        if (dados.length > 14) removidos.push('miniatura JFIF');
        partes.push(novo);
        depoisDoApp0 = partes.length;
      } else {
        removidos.push('APP0');
      }
      continue;
    }
    if (m === 0xe1) {
      if (ascii(dados, 0, 6) === 'Exif\0\0' && soOrientacao(dados.subarray(6))) {
        // O EXIF minimo que este mesmo corte deixa: ja esta limpo.
        partes.push(seg);
        continue;
      }
      if (ascii(dados, 0, 6) === 'Exif\0\0') {
        orientacao ??= orientacaoDoTiff(dados.subarray(6));
        removidos.push('EXIF');
      } else if (ascii(dados, 0, 28) === 'http://ns.adobe.com/xap/1.0/') {
        removidos.push('XMP');
      } else {
        removidos.push('APP1');
      }
      continue;
    }
    if (m === 0xe2 && ascii(dados, 0, 12) === 'ICC_PROFILE\0') {
      partes.push(seg);
      continue;
    }
    if (m === 0xee && ascii(dados, 0, 5) === 'Adobe') {
      // Diz como converter as cores (YCC/CMYK): sem ele o decodificador erra.
      partes.push(seg);
      continue;
    }
    if (m >= 0xe2 && m <= 0xef) {
      removidos.push(m === 0xed ? 'IPTC/Photoshop' : m === 0xe2 ? `APP2 ${ascii(dados, 0, 4)}` : `APP${m - 0xe0}`);
      continue;
    }
    if (m === 0xfe) {
      removidos.push('comentario');
      continue;
    }
    // Tabelas, cabecalho do quadro etc.: e a imagem.
    partes.push(seg);
  }
  if (i < b.length) removidos.push(DEPOIS_DO_FIM);

  if (removidos.length === 0) return { bytes: b, formato: 'jpeg', removidos };

  if (orientacao !== null && orientacao !== 1) {
    const tiff = tiffSoComOrientacao(orientacao);
    const app1 = new Uint8Array(4 + 6 + tiff.length);
    const len = 2 + 6 + tiff.length;
    app1.set([0xff, 0xe1, len >> 8, len & 0xff]);
    app1.set(bytesAscii('Exif\0\0'), 4);
    app1.set(tiff, 10);
    partes.splice(depoisDoApp0, 0, app1);
  }
  return { bytes: juntar(partes), formato: 'jpeg', removidos };
}

// ------------------------------------------------------------------- PNG

/**
 * Pedacos que ficam. Os criticos, e dos auxiliares so os que mudam o desenho:
 * transparencia, cor, e a animacao do APNG (acTL/fcTL/fdAT).
 */
const PNG_FICA = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND',
  'tRNS', 'sRGB', 'gAMA', 'cHRM', 'iCCP', 'sBIT', 'cICP', 'mDCv', 'cLLI',
  'acTL', 'fcTL', 'fdAT',
]);

function limparPng(b: Uint8Array): ImagemLimpa {
  const partes: Uint8Array[] = [b.subarray(0, 8)];
  const removidos: string[] = [];
  let orientacao: number | null = null;
  let antesDoIdat = -1;
  let i = 8;
  while (i < b.length) {
    const len = u32be(b, i);
    const tipo = ascii(b, i + 4, 4);
    const fim = i + 12 + len;
    if (fim > b.length) throw new Error('pedaco truncado');
    if (tipo === 'IDAT' && antesDoIdat < 0) antesDoIdat = partes.length;
    if (PNG_FICA.has(tipo) || (tipo === 'eXIf' && soOrientacao(b.subarray(i + 8, i + 8 + len)))) {
      partes.push(b.subarray(i, fim));
    }
    else {
      if (tipo === 'eXIf') orientacao ??= orientacaoDoTiff(b.subarray(i + 8, i + 8 + len));
      removidos.push(tipo);
    }
    i = fim;
    if (tipo === 'IEND') break;
  }
  if (i < b.length) removidos.push(DEPOIS_DO_FIM);
  if (removidos.length === 0) return { bytes: b, formato: 'png', removidos };
  if (orientacao !== null && orientacao !== 1 && antesDoIdat > 0) {
    partes.splice(antesDoIdat, 0, pedacoPng('eXIf', tiffSoComOrientacao(orientacao)));
  }
  return { bytes: juntar(partes), formato: 'png', removidos };
}

function pedacoPng(tipo: string, dados: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + dados.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, dados.length);
  out.set(bytesAscii(tipo), 4);
  out.set(dados, 8);
  dv.setUint32(8 + dados.length, crc32(out.subarray(4, 8 + dados.length)));
  return out;
}

// ------------------------------------------------------------------ WebP

const WEBP_FICA = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function limparWebp(b: Uint8Array): ImagemLimpa {
  const partes: Uint8Array[] = [];
  const removidos: string[] = [];
  let orientacao: number | null = null;
  let vp8x: Uint8Array | null = null;
  // O RIFF declara o proprio tamanho; o que passar dele esta grudado depois.
  const fimRiff = Math.min(b.length, 8 + u32le(b, 4));
  if (fimRiff < b.length) removidos.push(DEPOIS_DO_FIM);
  let i = 12;
  while (i + 8 <= fimRiff) {
    const tipo = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const fim = i + 8 + len + (len & 1);
    if (i + 8 + len > fimRiff) throw new Error('pedaco truncado');
    const exifLimpo = tipo === 'EXIF' && soOrientacao(b.subarray(i + 8, i + 8 + len));
    if (WEBP_FICA.has(tipo) || exifLimpo) {
      const p = b.slice(i, Math.min(fim, fimRiff));
      if (tipo === 'VP8X') vp8x = p;
      partes.push(p);
    } else {
      if (tipo === 'EXIF') {
        const d = b.subarray(i + 8, i + 8 + len);
        orientacao ??= orientacaoDoTiff(ascii(d, 0, 6) === 'Exif\0\0' ? d.subarray(6) : d);
      }
      removidos.push(tipo.trim());
    }
    i = fim;
  }
  if (removidos.length === 0) return { bytes: b, formato: 'webp', removidos };

  let exifMinimo = false;
  if (orientacao !== null && orientacao !== 1 && vp8x) {
    const tiff = tiffSoComOrientacao(orientacao);
    const p = new Uint8Array(8 + tiff.length + (tiff.length & 1));
    p.set(bytesAscii('EXIF'));
    new DataView(p.buffer).setUint32(4, tiff.length, true);
    p.set(tiff, 8);
    partes.push(p); // EXIF vai depois dos dados da imagem, como manda a especificacao
    exifMinimo = true;
  }
  if (vp8x) {
    vp8x[8] = (vp8x[8]! & ~(VP8X_EXIF | VP8X_XMP)) | (exifMinimo ? VP8X_EXIF : 0);
  }
  const corpo = juntar(partes);
  const out = new Uint8Array(12 + corpo.length);
  out.set(bytesAscii('RIFF'));
  new DataView(out.buffer).setUint32(4, 4 + corpo.length, true);
  out.set(bytesAscii('WEBP'), 8);
  out.set(corpo, 12);
  return { bytes: out, formato: 'webp', removidos };
}

// ------------------------------------------------------------------- GIF

function limparGif(b: Uint8Array): ImagemLimpa {
  const removidos: string[] = [];
  const partes: Uint8Array[] = [];
  const flags = b[10]!;
  let i = 13 + ((flags & 0x80) !== 0 ? 3 * (1 << ((flags & 0x07) + 1)) : 0);
  partes.push(b.subarray(0, i));

  /** Fim de uma sequencia de sub-blocos que comeca em `j`. */
  const pularSubBlocos = (j: number): number => {
    while (j < b.length && b[j] !== 0) j += b[j]! + 1;
    if (j >= b.length) throw new Error('sub-blocos truncados');
    return j + 1;
  };

  while (i < b.length) {
    const tipo = b[i]!;
    if (tipo === 0x3b) {
      partes.push(b.subarray(i, i + 1));
      if (i + 1 < b.length) removidos.push(DEPOIS_DO_FIM);
      break;
    }
    if (tipo === 0x2c) {
      const f = b[i + 9]!;
      let j = i + 10 + ((f & 0x80) !== 0 ? 3 * (1 << ((f & 0x07) + 1)) : 0);
      j = pularSubBlocos(j + 1); // +1: tamanho minimo do codigo LZW
      partes.push(b.subarray(i, j));
      i = j;
      continue;
    }
    if (tipo === 0x21) {
      const rotulo = b[i + 1]!;
      const fim = pularSubBlocos(i + 2);
      const app = rotulo === 0xff ? ascii(b, i + 3, 11) : '';
      const fica =
        rotulo === 0xf9 || // controle grafico: atraso e transparencia
        rotulo === 0x01 || // texto simples: e desenho
        (rotulo === 0xff && (app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0')); // laco
      if (fica) partes.push(b.subarray(i, fim));
      else removidos.push(rotulo === 0xfe ? 'comentario' : rotulo === 0xff ? app.trim() || 'aplicacao' : `extensao ${rotulo}`);
      i = fim;
      continue;
    }
    throw new Error('bloco desconhecido');
  }
  if (removidos.length === 0) return { bytes: b, formato: 'gif', removidos };
  return { bytes: juntar(partes), formato: 'gif', removidos };
}

// ------------------------------------------------------- EXIF: orientacao

/** A orientacao (tag 0x0112) de um bloco TIFF/EXIF, ou null se nao houver. */
export function orientacaoDoTiff(t: Uint8Array): number | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const ifd = dv.getUint32(4, le);
  if (ifd + 2 > t.length) return null;
  const n = dv.getUint16(ifd, le);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return null;
    if (dv.getUint16(e, le) === 0x0112 && dv.getUint16(e + 2, le) === 3) {
      const v = dv.getUint16(e + 8, le);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/**
 * O TIFF e o EXIF minimo que este corte deixa -- uma entrada so, a orientacao,
 * e nenhum IFD depois? E o que torna limpar DUAS vezes igual a limpar uma: sem
 * isto a segunda passada via "EXIF", tirava e recolocava, e toda imagem ja
 * limpa era refeita a cada vez que o quadro abrisse.
 */
function soOrientacao(t: Uint8Array): boolean {
  // EXATAMENTE o tamanho do minimo: um TIFF "de uma entrada so" com bytes a
  // mais no fim poderia carregar qualquer coisa ali.
  if (t.length !== 26) return false;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return false;
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const ifd = dv.getUint32(4, le);
  if (ifd + 18 > t.length) return false;
  return dv.getUint16(ifd, le) === 1 && dv.getUint16(ifd + 2, le) === 0x0112 && dv.getUint32(ifd + 14, le) === 0;
}

/** Um TIFF com UMA entrada so: a orientacao. 26 bytes. */
function tiffSoComOrientacao(o: number): Uint8Array {
  const t = new Uint8Array(26);
  const dv = new DataView(t.buffer);
  t.set([0x4d, 0x4d, 0x00, 0x2a]); // "MM", 42
  dv.setUint32(4, 8); // IFD0 logo depois do cabecalho
  dv.setUint16(8, 1); // uma entrada
  dv.setUint16(10, 0x0112); // orientacao
  dv.setUint16(12, 3); // SHORT
  dv.setUint32(14, 1); // um valor
  dv.setUint16(18, o);
  dv.setUint32(22, 0); // sem proximo IFD
  return t;
}

// ---------------------------------------------------------------- miudos

function ascii(b: Uint8Array, ini: number, n: number): string {
  let s = '';
  for (let k = ini; k < ini + n && k < b.length; k++) s += String.fromCharCode(b[k]!);
  return s;
}

function bytesAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k);
  return out;
}

function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
}

function u32le(b: Uint8Array, i: number): number {
  return b[i]! + (b[i + 1]! << 8) + (b[i + 2]! << 16) + ((b[i + 3]! << 24) >>> 0);
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

let tabelaCrc: Uint32Array | null = null;

function crc32(b: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let k = 0; k < b.length; k++) c = tabelaCrc[(c ^ b[k]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
