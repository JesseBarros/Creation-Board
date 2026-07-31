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
    const reports = await app.importWhiteboard(sources, { save });
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
  } catch (err) {
    lines.push(`  ERRO ${String(err)}`);
  }

  console.log(`IMPORTCHECK\n${lines.join('\n')}\nIMPORTCHECK_FIM`);
}
