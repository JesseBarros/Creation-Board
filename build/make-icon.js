// Gera build/icon.ico a partir da logo do projeto, sem dependencias externas.
//
// Uso: node build/make-icon.js <saida.ico> [origem.png]
//
// DUAS COISAS AQUI SAO O CONSERTO, e as duas vieram de olhar o icone pequeno:
//
// 1. **Varios tamanhos, e nao um so.** A versao anterior gravava UMA entrada de
//    256x256. O Windows entao reduzia 256 -> 16 sozinho, com um redutor
//    generico, e o resultado na barra de tarefas e na barra de titulo era uma
//    mancha borrada. Agora cada tamanho e reduzido aqui, por media de area, e
//    o Windows so escolhe o que ja esta pronto.
//
// 2. **Os tamanhos pequenos usam um DESENHO PROPRIO** (build/glyph.js), e nao a
//    arte reduzida. O numero que decidiu: o traco do quadro tem 30px numa arte
//    de 726, o que da **0,9 pixel** aos 16 -- fino demais para existir. Nao ha
//    filtro que conserte; o desenho precisa ser refeito nas proporcoes do
//    tamanho em que vai aparecer. Nao e outra marca, e a mesma com o traco na
//    espessura que 16px comporta.
//
// O PNG e decodificado e codificado a mao (ver build/png.js) porque trazer uma
// biblioteca de imagem por causa de um arquivo gerado uma vez nao se paga.
const fs = require('node:fs');
const path = require('node:path');
const { decodePng, resize, encodePng, cropSquare, encodeIconDib, packIco } = require('./png');
const { renderGlyph } = require('./glyph');

const OUT = process.argv[2];
const SRC = process.argv[3] ?? path.join(__dirname, 'onlycloselogo.png');

// Os tamanhos que o Windows realmente pede: lista (16), barra de titulo e
// tarefas (20/24/32), area de trabalho (48), telas grandes (64/128) e a loja e
// o instalador (256).
const TAMANHOS = [16, 20, 24, 32, 40, 48, 64, 128, 256];

// Ate aqui vale o glifo proprio; acima, a arte de verdade. Em 64px a arte
// inteira ja tem pixels suficientes para as formas soltas e o rabisco lerem.
const LIMITE_DO_GLIFO = 48;

const src = decodePng(fs.readFileSync(SRC), path.basename(SRC));

// A cor do canto e o fundo da propria arte. Lida do arquivo, e nao escrita a
// mao: trocar a logo por outra com fundo diferente continua funcionando.
const fundo = [src.data[0], src.data[1], src.data[2], src.data[3]];

// Arte cheia, em quadrado (a logo e mais larga que alta).
const lado = Math.max(src.width, src.height);
const cheia = cropSquare(
  src,
  { x: 0, y: 0, w: src.width, h: src.height },
  lado,
  fundo,
);

/** A imagem de um tamanho: glifo proprio embaixo, arte reduzida em cima. */
function paraTamanho(size) {
  return size <= LIMITE_DO_GLIFO ? renderGlyph(size) : resize(cheia, size, size);
}

const entries = TAMANHOS.map((size) => {
  const img = paraTamanho(size);
  // DIB ate 48, PNG acima: ver a nota em png.js. Um DIB de 256x256 seriam
  // 256 KB sem compressao, contra ~50 KB de PNG.
  const data = size <= 48 ? encodeIconDib(img) : encodePng(img);
  return { size, data };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ico = fs.writeFileSync(OUT, packIco(entries)) ?? fs.statSync(OUT);

console.log(`icon.ico escrito a partir de ${path.basename(SRC)} (${src.width}x${src.height}):`);
console.log(`  ${OUT} — ${(ico.size / 1024).toFixed(0)} KB, ${entries.length} tamanhos`);
for (const e of entries) {
  const modo = e.size <= LIMITE_DO_GLIFO ? 'glifo proprio' : 'arte cheia';
  console.log(`  ${String(e.size).padStart(3)}px  ${String(e.data.length).padStart(6)} bytes  ${modo}`);
}

// Previa em PNG, para conferir com os olhos o que o Windows vai mostrar.
// Sem isto, "o icone pequeno melhorou" seria opiniao.
if (process.env['QB_ICON_PREVIEW']) {
  const dir = process.env['QB_ICON_PREVIEW'];
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [16, 24, 32, 48, 64]) {
    fs.writeFileSync(path.join(dir, `icone-${size}.png`), encodePng(paraTamanho(size)));
  }
  // Uma previa AMPLIADA do glifo de 16px, com cada pixel virando um bloco: e a
  // unica forma de olhar de perto o que a barra de tarefas mostra.
  const g = renderGlyph(16);
  const ampliada = { width: 160, height: 160, data: Buffer.alloc(160 * 160 * 4) };
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const s = (Math.floor(y / 10) * 16 + Math.floor(x / 10)) * 4;
      g.data.copy(ampliada.data, (y * 160 + x) * 4, s, s + 4);
    }
  }
  fs.writeFileSync(path.join(dir, 'icone-16-ampliado.png'), encodePng(ampliada));
  console.log(`  previas em ${dir}`);
}
