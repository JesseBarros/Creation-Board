/**
 * Decodificacao de data: URIs para Blob.
 *
 * Feito a mao em vez de `fetch(uri)` por dois motivos. Primeiro, a CSP do app
 * nao permite `data:` em connect-src, e afrouxa-la para conveniencia de parsing
 * seria trocar seguranca por atalho. Segundo, o Whiteboard escreve o tipo como
 * `image/*`, que nao e um MIME valido -- o tipo real precisa ser detectado pelos
 * bytes de assinatura, senao o decodificador de imagem pode recusar o blob.
 */

export function dataUriToBlob(uri: string): Blob {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) {
    throw new Error('data: URI malformado');
  }

  const header = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const bytes = header.endsWith(';base64')
    ? base64ToBytes(payload)
    : new TextEncoder().encode(decodeURIComponent(payload));

  const declared = header.replace(/;base64$/, '');
  return new Blob([bytes.buffer as ArrayBuffer], { type: sniffMime(bytes) ?? normalize(declared) });
}

function normalize(mime: string): string {
  // `image/*` nao e um tipo concreto; na duvida, PNG e o mais provavel aqui.
  return !mime || mime.includes('*') ? 'image/png' : mime;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Detecta o formato pelos bytes iniciais do arquivo. */
function sniffMime(b: Uint8Array): string | null {
  if (b.length < 4) return null;

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';

  // WEBP: "RIFF" .... "WEBP"
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  }

  // SVG: texto comecando por '<' (possivelmente apos espacos ou BOM).
  for (let i = 0; i < Math.min(b.length, 8); i++) {
    const c = b[i]!;
    if (c === 0x3c) return 'image/svg+xml';
    if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0xef && c !== 0xbb && c !== 0xbf) {
      break;
    }
  }

  return null;
}
