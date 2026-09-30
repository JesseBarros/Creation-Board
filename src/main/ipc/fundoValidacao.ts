// Relativo, e nao `@shared`: o `check:fundo` compila este arquivo sozinho,
// sem o tsconfig que define o apelido.
import { t } from '../../shared/i18n';

/**
 * Validacao da imagem de fundo escolhida pelo usuario.
 *
 * Mora separada de `fundo.ts` por um motivo pratico: aqui nao se importa nada do
 * Electron, entao `scripts/check-fundo.mjs` consegue compilar este arquivo e
 * rodar os casos sem levantar um aplicativo. Um guarda de segurança que so da
 * para exercitar abrindo a janela e clicando no diálogo nao e exercitado nunca.
 *
 * ---
 *
 * POR QUE O TETO DEIXOU DE SER EM BYTES. Medido em 21/09/2026.
 *
 * Havia um teto de 24 MB de arquivo, e ele guardava a coisa errada. O que custa
 * memoria e o bitmap DECODIFICADO -- `largura x altura x 4 bytes` -- e ele nao
 * tem relacao fixa com o tamanho do arquivo, porque compressao de imagem
 * depende do CONTEUDO.
 *
 * O caso que prova: um PNG de cor solida de 10000x10000 ocupa **310 KB** em
 * disco e **400 MB** decodificado. O teto de bytes olhava os 310 KB e aprovava.
 * E uma bomba de descompressao, e era a unica entrada que realmente machucava.
 * (Na pratica o Chromium recusa decodificar algo desse tamanho, entao o
 * resultado era o fundo sumir sem explicacao nenhuma -- falha silenciosa, que e
 * pior que erro.)
 *
 * Ao mesmo tempo, o teto de bytes RECUSAVA fotografia legitima: um PNG de 4K sem
 * compressao com facilidade passa de 24 MB, e exibi-lo custa 35 MB de memoria,
 * que e barato.
 *
 * Entao o teto virou de PIXELS, lido do cabecalho do arquivo -- sem decodificar,
 * que e o que torna seguro perguntar o tamanho de uma bomba. O teto de bytes
 * continua existindo, mas so como sanidade grosseira ("isto nao e um filme").
 *
 * Numeros medidos no renderer, com a foto na tela:
 *
 *   3840x2270  (4K,  8,7 MP)  decode  29 ms  +30 MB de memoria
 *   7680x4542  (8K, 34,9 MP)  decode  76 ms  +67 MB
 *   10000x10000    (100 MP)   o Chromium se recusa a decodificar
 */

/** Os dois unicos temas. E uma lista, e nao um tipo, porque tipo some no runtime. */
export const TEMAS = ['claro', 'escuro'] as const;
export type TemaValidado = (typeof TEMAS)[number];

/**
 * Sanidade grosseira, NAO o guarda principal.
 *
 * Existe para "voce escolheu um arquivo de video de 2 GB" morrer antes de ser
 * lido inteiro para a memoria. Quem realmente protege e o teto de pixels.
 */
export const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Lado maximo, em pixels.
 *
 * 8192 nao e numero redondo escolhido no olho: e o limite de textura de GPU mais
 * comum com folga, e passa 8K (7680) inteiro, que foi o maior tamanho medido a
 * funcionar bem. Existe separado do teto de area porque area sozinha deixaria
 * passar uma imagem de 100000x300 -- pouca area, e mesmo assim impossivel de
 * virar textura.
 */
export const MAX_LADO = 8192;

/**
 * Area maxima, em pixels. 40 MP passa 8K (34,9 MP) com margem.
 *
 * Acima disto o custo de memoria deixa de se pagar: sao 160 MB de bitmap para
 * uma imagem que a janela vai reduzir para ~1600 px de largura de qualquer
 * jeito.
 */
export const MAX_PIXELS = 40_000_000;

/**
 * O tipo pela ASSINATURA dos primeiros bytes.
 *
 * Extensao e sugestao de quem nomeou, nao fato sobre o conteudo -- um `.exe`
 * renomeado para `.png` e recusado aqui.
 *
 * **SVG esta fora de proposito, e a ausencia dele e a decisao.** SVG e
 * "imagem" no nome, mas e um documento XML que aceita `<script>`. Como ele nao
 * tem assinatura binaria, ficar de fora e automatico -- mas alguem que resolva
 * "aceitar mais formatos" um dia precisa saber que este nao entra.
 */
export function mimeDosBytes(b: Uint8Array): string | null {
  if (b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';

  const texto = (i: number, n: number): string => String.fromCharCode(...b.subarray(i, i + n));
  // WebP e AVIF sao contêineres: a marca esta depois do tamanho do bloco.
  if (texto(0, 4) === 'RIFF' && texto(8, 4) === 'WEBP') return 'image/webp';
  if (texto(4, 4) === 'ftyp' && texto(8, 3) === 'avi') return 'image/avif';
  return null;
}

/**
 * A extensao sai do MIME detectado, e nunca do nome que o usuario deu.
 *
 * Ate 21/09/2026 ela saia de `extname()` do arquivo escolhido, e o resultado era
 * que um JPEG de verdade chamado `foto.bat` virava `fundo-claro.bat` dentro da
 * pasta do usuario. O conteudo era inofensivo e nada executava aquilo, mas
 * gravar um arquivo com extensao escolhida por quem veio de fora e sujeira sem
 * contrapartida -- e contradizia o proprio principio escrito no `fundo.ts`, de
 * que quem manda e a assinatura.
 */
export function extensaoDoMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/avif':
      return '.avif';
    default:
      return '.img';
  }
}

export interface Dimensoes {
  largura: number;
  altura: number;
}

/**
 * Largura e altura lidas do CABECALHO, sem decodificar a imagem.
 *
 * Nao decodificar e o ponto inteiro: perguntar "que tamanho voce tem?" a uma
 * bomba de descompressao tem de ser barato, senao a pergunta e o ataque.
 * Nenhum dos quatro formatos guarda isso longe do inicio do arquivo.
 *
 * `null` = nao deu para ler. Quem chama trata como recusa, e nao como "deve
 * estar bom": um cabecalho que nao da para ler e exatamente o formato de
 * arquivo malformado que nao se quer adiante.
 */
export function dimensoesDosBytes(b: Uint8Array, mime: string): Dimensoes | null {
  switch (mime) {
    case 'image/png':
      return dimensoesPng(b);
    case 'image/jpeg':
      return dimensoesJpeg(b);
    case 'image/webp':
      return dimensoesWebp(b);
    case 'image/avif':
      return dimensoesAvif(b);
    default:
      return null;
  }
}

/** PNG: o IHDR e sempre o primeiro bloco, e mora em posicao fixa. */
function dimensoesPng(b: Uint8Array): Dimensoes | null {
  // 8 da assinatura + 4 do tamanho + 4 de 'IHDR' = 16
  if (b.length < 24) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { largura: dv.getUint32(16, false), altura: dv.getUint32(20, false) };
}

/**
 * JPEG: e preciso ANDAR pelos marcadores ate achar o comeco do quadro (SOF).
 *
 * Nao da para usar posicao fixa porque antes do SOF vem uma quantidade variavel
 * de metadados -- EXIF, miniatura, perfil de cor. A miniatura embutida e
 * justamente a armadilha: ela e um JPEG dentro do JPEG, e um parser ingenuo
 * devolveria o tamanho DELA, que e minusculo, deixando a imagem real passar
 * livre pelo teto.
 */
function dimensoesJpeg(b: Uint8Array): Dimensoes | null {
  let i = 2; // pula o FF D8 inicial
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // byte de preenchimento entre segmentos
      continue;
    }
    const marcador = b[i + 1] ?? 0;
    // D0-D9 e 01 nao tem campo de tamanho.
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2;
      continue;
    }
    const tamanho = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (tamanho < 2) return null;

    // SOF0-SOF15 carregam a geometria. C4 (tabela de Huffman), C8 (extensao) e
    // CC (codificacao aritmetica) caem na mesma faixa e NAO sao SOF.
    const ehSof =
      marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (ehSof) {
      // marcador(2) + tamanho(2) + precisao(1) -> altura(2), largura(2)
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (i + 9 > b.length) return null;
      return { altura: dv.getUint16(i + 5, false), largura: dv.getUint16(i + 7, false) };
    }
    i += 2 + tamanho;
  }
  return null;
}

/** WebP tem tres formas, e cada uma guarda a geometria num lugar. */
function dimensoesWebp(b: Uint8Array): Dimensoes | null {
  if (b.length < 30) return null;
  const forma = String.fromCharCode(...b.subarray(12, 16));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  if (forma === 'VP8X') {
    // Lona do formato estendido: 3 bytes little-endian, guardando valor-1.
    const ler3 = (i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
    return { largura: ler3(24) + 1, altura: ler3(27) + 1 };
  }
  if (forma === 'VP8 ') {
    // Com perda: 3 do rotulo + 3 do codigo de inicio (9D 01 2A), dai a geometria
    // em 14 bits, com os 2 de cima sendo a escala.
    return { largura: dv.getUint16(26, true) & 0x3fff, altura: dv.getUint16(28, true) & 0x3fff };
  }
  if (forma === 'VP8L') {
    // Sem perda: assinatura 0x2F, depois 14 bits de largura-1 e 14 de altura-1,
    // empacotados sem respeitar limite de byte.
    if ((b[20] ?? 0) !== 0x2f) return null;
    const bits = dv.getUint32(21, true);
    return { largura: (bits & 0x3fff) + 1, altura: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * AVIF: a geometria mora numa caixa `ispe`, enterrada em meta/iprp/ipco.
 *
 * Aqui a caixa e PROCURADA em vez de se andar a arvore de caixas do ISOBMFF.
 * A troca e consciente: andar a arvore seria um analisador de contêiner inteiro
 * dentro do processo principal, para ler dois numeros. A busca tem um limite de
 * alcance e, se nao achar, devolve `null` -- que aqui significa RECUSA. O pior
 * caso e um AVIF exotico ser recusado, nunca um passar sem ser medido.
 */
function dimensoesAvif(b: Uint8Array): Dimensoes | null {
  const limite = Math.min(b.length - 12, 64 * 1024);
  for (let i = 0; i < limite; i++) {
    if (b[i] !== 0x69 || b[i + 1] !== 0x73 || b[i + 2] !== 0x70 || b[i + 3] !== 0x65) continue; // 'ispe'
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // 'ispe'(4) + versao e marcas(4) -> largura(4), altura(4)
    const largura = dv.getUint32(i + 8, false);
    const altura = dv.getUint32(i + 12, false);
    if (largura > 0 && altura > 0) return { largura, altura };
  }
  return null;
}

export type Veredito =
  | { ok: true; mime: string; extensao: string; largura: number; altura: number }
  | { ok: false; erro: string };

/**
 * A porta unica. Recebe os bytes do arquivo escolhido e diz sim ou nao.
 *
 * Toda recusa traz uma frase para mostrar ao usuario, com o numero que a causou.
 * "Nao deu" e a resposta que faz alguem desligar a verificacao.
 */
export function validarImagem(bytes: Uint8Array, nomeParaMensagem: string): Veredito {
  if (bytes.byteLength > MAX_BYTES) {
    return {
      ok: false,
      erro: t('erro.arquivoGrande', nomeParaMensagem, bytes.byteLength / 1024 / 1024, MAX_BYTES / 1024 / 1024),
    };
  }

  const mime = mimeDosBytes(bytes);
  if (!mime) {
    return {
      ok: false,
      erro: t('erro.naoEImagem', nomeParaMensagem),
    };
  }

  const dim = dimensoesDosBytes(bytes, mime);
  if (!dim) {
    return {
      ok: false,
      erro: t('erro.dimensoesIlegiveis', nomeParaMensagem),
    };
  }

  if (dim.largura > MAX_LADO || dim.altura > MAX_LADO) {
    return {
      ok: false,
      erro: t('erro.ladoGrande', nomeParaMensagem, dim.largura, dim.altura, MAX_LADO),
    };
  }

  if (dim.largura * dim.altura > MAX_PIXELS) {
    return {
      ok: false,
      erro: t(
        'erro.megapixels',
        nomeParaMensagem,
        Math.round((dim.largura * dim.altura) / 1e6),
        MAX_PIXELS / 1e6,
        Math.round((dim.largura * dim.altura * 4) / 1024 / 1024),
      ),
    };
  }

  return { ok: true, mime, extensao: extensaoDoMime(mime), largura: dim.largura, altura: dim.altura };
}

/**
 * O tema, conferido no runtime.
 *
 * NAO e formalidade de tipo. `tema` e interpolado no CAMINHO do arquivo
 * gravado, e `path.join` resolve `..` -- entao, ate 21/09/2026, um `tema` de
 * `"../../../../../../Users/<nome>/Desktop/evil"` fazia a gravacao sair em
 * `C:\Users\<nome>\Desktop\evil.jpg`. Confirmado rodando a linha real.
 *
 * O `fundo.ts` se gabava, com razao, de o renderer nunca mandar caminho. So que
 * `tema` ERA um pedaco de caminho, e ninguem tinha reparado. Tipo de TypeScript
 * desaparece na compilacao e nao defende a fronteira de IPC de nada.
 */
export function temaValido(tema: unknown): tema is TemaValidado {
  return typeof tema === 'string' && (TEMAS as readonly string[]).includes(tema);
}
