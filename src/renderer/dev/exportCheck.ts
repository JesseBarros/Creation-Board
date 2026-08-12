import type { App } from '../App';
import {
  exportBounds,
  planTiles,
  renderPng,
  renderPngTile,
  type TilePlan,
} from '../features/export/exportBoard';
import { renderSvg } from '../features/export/exportSvg';
import { generateStressObjects } from './stress';

/**
 * Verificacao da exportacao (QB_EXPORT=<prefixo> npm run dev).
 *
 * Gera uma cena com um pouco de cada tipo de objeto e exporta nos tres
 * formatos, gravando em `<prefixo>.png`, `.svg` e `.pdf` -- sem passar pelo
 * dialogo de salvar, que e a unica parte que nao se automatiza.
 *
 * Por que existe: PNG e SVG sao conferiveis por numero no autoteste, mas o PDF
 * nasce no processo principal, numa janela invisivel, pelo `printToPDF`. Nada
 * disso passa pelo renderer -- sem esta verificacao, a unica forma de saber que
 * o PDF sai e clicando.
 */
export async function runExportCheck(prefix: string, app: App): Promise<void> {
  const lines: string[] = [];

  try {
    // Cena pequena e variada: a carga de teste ja produz traco, forma, post-it
    // e texto com semente fixa, entao duas execucoes exportam o mesmo quadro.
    app.doc.clear();
    app.doc.add(generateStressObjects(120));

    const area = exportBounds(app.doc, []);
    if (!area) throw new Error('cena vazia');

    const theme = { boardBg: '#ffffff', gridColor: '#dde2ea' };
    const t0 = performance.now();
    const png = await renderPng(app.doc, app.assets, area, [], {
      scale: 2,
      padding: 24,
      background: theme.boardBg,
      theme,
    });
    const msPng = performance.now() - t0;

    const t1 = performance.now();
    const svg = renderSvg(app.doc, app.assets, area, [], {
      padding: 24,
      background: theme.boardBg,
      adaptAgainst: theme.boardBg,
    });
    const msSvg = performance.now() - t1;
    const svgBytes = new TextEncoder().encode(svg);

    lines.push(`  objetos=${app.doc.size}  area=${Math.round(area.w)}x${Math.round(area.h)}`);
    lines.push(
      `  PNG  ${png.width}x${png.height}px  ${kb(png.bytes.length)}  ${msPng.toFixed(0)} ms`,
    );
    lines.push(`  SVG  ${kb(svgBytes.length)}  ${msSvg.toFixed(0)} ms`);

    // O SVG e devolvido ao navegador para ser LIDO: se o arquivo tiver
    // marcacao invalida, transform errado ou referencia quebrada, ele nao
    // carrega -- e um SVG que so nos sabemos ler nao serve para exportar.
    const t2 = performance.now();
    const raster = await rasterizeSvg(svg, Math.round(png.width / 4), Math.round(png.height / 4));
    lines.push(
      raster
        ? `  SVG relido pelo navegador: ${kb(raster.length)} rasterizados em ${(performance.now() - t2).toFixed(0)} ms`
        : `  FALHOU: o navegador nao conseguiu ler o SVG gerado`,
    );
    if (raster) {
      await window.quadro.exporter.save({
        name: 'verificacao',
        format: 'png',
        data: raster.slice().buffer,
        path: `${prefix}-svg.png`,
      });
    }

    for (const [format, data, extra] of [
      ['png', png.bytes, { widthPx: png.width, heightPx: png.height }],
      ['svg', svgBytes, {}],
      ['pdf', png.bytes, { widthPx: png.width, heightPx: png.height }],
    ] as const) {
      const t = performance.now();
      const result = await window.quadro.exporter.save({
        name: 'verificacao',
        format,
        data: data.slice().buffer,
        path: `${prefix}.${format}`,
        ...extra,
      });
      lines.push(
        result.path
          ? `  gravado ${format.toUpperCase()}: ${result.path}  (${(performance.now() - t).toFixed(0)} ms)`
          : `  FALHOU ${format.toUpperCase()}: nada gravado`,
      );
    }

    // --- B13: a grade de ladrilhos, gravada de verdade
    //
    // O autoteste ja confere o PLANO (escalas diferentes, teto por ladrilho,
    // soma exata) e o desenho de dois ladrilhos vizinhos. O que so aqui se
    // confere e o resto do caminho: mandar N ladrilhos num pedido so pelo IPC e
    // acabar com N arquivos irmaos no disco, com o sufixo antes da extensao.
    //
    // A escala e escolhida para forcar uma grade PEQUENA de proposito: gravar
    // 180 arquivos a cada verificacao seria inutilizavel.
    const plano = planTiles(area, 24, 2);
    const forcado: TilePlan = {
      ...plano,
      cols: 2,
      rows: 2,
      tileW: Math.ceil(plano.width / 2),
      tileH: Math.ceil(plano.height / 2),
    };

    const ladrilhos = [];
    for (let row = 0; row < forcado.rows; row++) {
      for (let col = 0; col < forcado.cols; col++) {
        ladrilhos.push(
          await renderPngTile(
            app.doc,
            app.assets,
            [],
            { scale: forcado.scale, padding: 24, background: theme.boardBg, theme },
            forcado,
            col,
            row,
          ),
        );
      }
    }

    const t3 = performance.now();
    const grade = await window.quadro.exporter.save({
      name: 'verificacao',
      format: 'png',
      data: ladrilhos[0]!.bytes.slice().buffer,
      path: `${prefix}-grade.png`,
      suffix: '-l1c1',
      parts: ladrilhos.slice(1).map((t, i) => ({
        data: t.bytes.slice().buffer,
        suffix: `-l${Math.floor((i + 1) / forcado.cols) + 1}c${((i + 1) % forcado.cols) + 1}`,
      })),
    });
    lines.push(
      grade.count === 4
        ? `  gravada a grade: ${grade.count} arquivos a partir de ${grade.path} ` +
          `(${forcado.cols}x${forcado.rows} de ${ladrilhos[0]!.width}x${ladrilhos[0]!.height}px, ` +
          `${(performance.now() - t3).toFixed(0)} ms)`
        : `  FALHOU a grade: esperava 4 arquivos, gravou ${grade.count ?? 0}`,
    );
  } catch (err) {
    lines.push(`  ERRO ${String(err)}`);
  }

  app.markClean();
  console.log(`EXPORTCHECK\n${lines.join('\n')}\nEXPORTCHECK_FIM`);
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Desenha o SVG gerado num canvas e devolve o PNG.
 *
 * Devolve null se o navegador recusar o arquivo -- que e exatamente o sinal
 * procurado. Vai por `Blob` e nao por `data:` URL porque um quadro grande vira
 * um SVG de megabytes.
 */
async function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    if (!loaded) return null;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
