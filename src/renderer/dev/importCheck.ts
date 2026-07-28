import type { App } from '../App';

/**
 * Verificacao da importacao (QB_IMPORT=<caminho> npm run dev).
 *
 * Importa os arquivos indicados e imprime um relatorio no terminal: quantos
 * objetos de cada tipo foram reconhecidos, o que foi ignorado, e a extensao do
 * quadro resultante. Serve para conferir o parser contra exportacoes reais sem
 * depender de inspecao visual.
 */
export async function runImportCheck(path: string, app: App): Promise<void> {
  const lines: string[] = [];
  try {
    const sources = await window.quadro.importer.read([path]);
    if (sources.length === 0) {
      console.log(`IMPORTCHECK\n  nenhum arquivo lido de "${path}"\nIMPORTCHECK_FIM`);
      return;
    }

    const t0 = performance.now();
    const reports = await app.importWhiteboard(sources);
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

    const bounds = app.doc.contentBounds();
    lines.push(
      bounds
        ? `  extensao do quadro: ${Math.round(bounds.w)} x ${Math.round(bounds.h)} unidades`
        : '  extensao do quadro: vazio',
    );
    lines.push(`  tempo total: ${ms.toFixed(0)} ms`);
  } catch (err) {
    lines.push(`  ERRO ${String(err)}`);
  }

  console.log(`IMPORTCHECK\n${lines.join('\n')}\nIMPORTCHECK_FIM`);
}
