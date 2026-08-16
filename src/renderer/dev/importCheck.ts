import type { App } from '../App';
import { checkGeometry, formatGeometry } from './geometryCheck';

/**
 * Verificacao da importacao (QB_IMPORT=<caminho> npm run dev).
 *
 * Importa os arquivos indicados e imprime um relatorio no terminal: quantos
 * objetos de cada tipo foram reconhecidos, o que foi ignorado, a extensao do
 * quadro resultante e o erro de posicao contra o oraculo de layout. Serve para
 * conferir o parser contra exportacoes reais sem depender de inspecao visual.
 */
export async function runImportCheck(path: string, app: App, save = false): Promise<void> {
  const lines: string[] = [];
  try {
    const sources = await window.quadro.importer.read([path]);
    if (sources.length === 0) {
      console.log(`IMPORTCHECK\n  nenhum arquivo lido de "${path}"\nIMPORTCHECK_FIM`);
      return;
    }

    const t0 = performance.now();
    // Por padrao NAO grava: conferir a importacao nao pode criar quadro na
    // pasta do usuario. `QB_IMPORT_SAVE=1` liga a gravacao, para reimportar os
    // resumos por terminal depois de mexer no importador.
    const reports = await app.importBoards(sources, { save });
    const ms = performance.now() - t0;

    for (const r of reports) {
      const total = r.textos + r.tracos + r.imagens + r.postits;
      lines.push(`  ${r.name}`);
      lines.push(
        `    textos=${r.textos}  tracos=${r.tracos}  imagens=${r.imagens}  postits=${r.postits}  TOTAL=${total}`,
      );
      const ignorados = Object.entries(r.ignorados);
      if (ignorados.length > 0) {
        lines.push(`    ignorados: ${ignorados.map(([k, n]) => `${k}=${n}`).join(', ')}`);
      }
      for (const aviso of r.avisos.slice(0, 5)) lines.push(`    AVISO ${aviso}`);
      if (r.avisos.length > 5) lines.push(`    ... e mais ${r.avisos.length - 5} avisos`);
    }

    // Conferencia de geometria: roda por arquivo, sobre o mesmo HTML ja lido.
    for (const source of sources) {
      if (!source.html) continue;
      try {
        lines.push(...formatGeometry(await checkGeometry(source.html)));
      } catch (err) {
        lines.push(`    geometria: FALHOU ${String(err)}`);
      }
    }

    const bounds = app.doc.contentBounds();
    lines.push(
      bounds
        ? `  extensao do quadro: ${Math.round(bounds.w)} x ${Math.round(bounds.h)} unidades`
        : '  extensao do quadro: vazio',
    );
    lines.push(`  tempo total: ${ms.toFixed(0)} ms`);
    lines.push(...(await measureInteraction(app)));
  } catch (err) {
    lines.push(`  ERRO ${String(err)}`);
  }

  console.log(`IMPORTCHECK\n${lines.join('\n')}\nIMPORTCHECK_FIM`);
}

/**
 * Quanto custa MEXER no quadro real.
 *
 * Existe por causa de um relato de travamento ao alternar ferramentas e views.
 * As medicoes do auto-teste usam carga sintetica -- tracos gerados, baratos de
 * desenhar. O quadro de verdade tem centenas de caixas de texto, cada uma com
 * layout, e centenas de caminhos de tinta. Sem medir AQUI, "trocar de ferramenta
 * custa 1,6 ms" e uma conta sobre outro quadro.
 *
 * O que se mede: o preco de uma repintura completa da camada estatica -- que e
 * exatamente o que a interface manda fazer a cada troca de ferramenta.
 */
async function measureInteraction(app: App): Promise<string[]> {
  const bounds = app.doc.contentBounds();
  if (!bounds) return [];

  const out: string[] = ['  custo de interacao (repintura completa da camada estatica):'];

  for (const [nome, preparar] of [
    ['tudo na tela', (): void => app.fitToContent()],
    ['zoom 100%', (): void => app.setZoom(1)],
  ] as const) {
    preparar();
    await nextFrame();

    const REPS = 8;
    const t0 = performance.now();
    for (let i = 0; i < REPS; i++) {
      app.invalidateForMeasurement();
      await nextFrame();
    }
    const comRepintura = (performance.now() - t0) / REPS;

    // Linha de base: os mesmos frames sem mandar repintar nada.
    const t1 = performance.now();
    for (let i = 0; i < REPS; i++) await nextFrame();
    const ocioso = (performance.now() - t1) / REPS;

    const stats = app.frameStats;
    out.push(
      `    ${nome.padEnd(14)} frame ${comRepintura.toFixed(1)} ms · ocioso ${ocioso.toFixed(1)} ms · ` +
        `custo ${(comRepintura - ocioso).toFixed(1)} ms · ` +
        `render ${stats.renderMs.toFixed(1)} ms · visiveis ${stats.visible}`,
    );
  }

  return out;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
