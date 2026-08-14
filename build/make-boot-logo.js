// Embute a logo do projeto na tela de abertura do `index.html`, como data: URI.
//
// Uso: node build/make-boot-logo.js
//
// POR QUE data: URI, e nao um `<img src>` normal.
// A tela de abertura precisa estar pintada no PRIMEIRO frame -- antes de
// qualquer modulo, folha de estilo ou requisicao. Um `src` para um arquivo faria
// a marca aparecer um ou dois frames depois do fundo, e a abertura comecaria com
// um retangulo escuro vazio, que e exatamente o que ela existe para evitar.
//
// POR QUE a logo de verdade, e nao um SVG desenhado a mao.
// A primeira versao desta tela redesenhava a marca em SVG. Ficava parecida e nao
// era ela: os gradientes, o sombreamento e o espacamento das formas soltas nao
// sobrevivem a uma reinterpretacao. A logo e do projeto, e usar o arquivo
// verdadeiro custa ~30 KB de HTML.
//
// A escrita e feita ENTRE MARCADORES no index.html, e nao por concatenacao, para
// rodar o script duas vezes nao acumular duas copias.
const fs = require('node:fs');
const path = require('node:path');
const { decodePng, resize, encodePng } = require('./png');

const SRC = path.join(__dirname, 'logo.png');
const HTML = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const INICIO = '<!-- LOGO:INICIO -->';
const FIM = '<!-- LOGO:FIM -->';

// A marca aparece a 180px de CSS, e o arquivo vai com 1,5x disso.
//
// 1,5 e nao 2: os dois monitores desta maquina sao 1920x1080 (medido no B8),
// entao o DPR e 1 -- 2x seria resolucao que ninguem ve, custando o dobro de HTML
// numa tela que dura 642 ms. A folga de 1,5 cobre o Windows em 150%, que e o
// unico caso realista aqui.
const CSS_PX = 180;
const LARGURA = Math.round(CSS_PX * 1.5);

const src = decodePng(fs.readFileSync(SRC), path.basename(SRC));
const altura = Math.round((src.height / src.width) * LARGURA);
const png = encodePng(resize(src, LARGURA, altura));
const uri = `data:image/png;base64,${png.toString('base64')}`;

const html = fs.readFileSync(HTML, 'utf8');
const i = html.indexOf(INICIO);
const f = html.indexOf(FIM);
if (i < 0 || f < 0) {
  console.error(`[boot-logo] marcadores ${INICIO} / ${FIM} nao encontrados em ${HTML}`);
  process.exit(1);
}

const img =
  `\n        <img class="qb-boot__mark" width="${CSS_PX}" alt=""\n` +
  `          src="${uri}" />\n        `;

fs.writeFileSync(HTML, html.slice(0, i + INICIO.length) + img + html.slice(f), 'utf8');

console.log(
  `[boot-logo] ${path.basename(SRC)} ${src.width}x${src.height} -> ${LARGURA}x${altura}, ` +
    `${(png.length / 1024).toFixed(0)} KB (${(uri.length / 1024).toFixed(0)} KB em base64)`,
);
