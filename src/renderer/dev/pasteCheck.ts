import type { App } from '../App';

/**
 * Verificacao do colar de imagem (QB_PASTE=1 npm run dev).
 *
 * Existe porque um bug real passou pela verificacao do auto-teste: la o evento
 * `paste` e despachado direto, entao o que se testava era o HANDLER. Quem
 * dispara o `paste` de verdade e o navegador, em resposta ao Ctrl+V -- e era
 * esse trecho, o caminho e nao o destino, que estava quebrado.
 *
 * Aqui o processo principal envia um Ctrl+V NATIVO (`sendInputEvent`), com uma
 * imagem de verdade na area de transferencia do Windows. E o mais perto de uma
 * tecla apertada por gente que da para automatizar.
 */
export async function runPasteCheck(app: App): Promise<void> {
  const lines: string[] = [];
  const antes = app.doc.size;

  // Tempo para o Ctrl+V nativo chegar, o evento `paste` disparar e a imagem ser
  // decodificada fora da thread principal.
  await delay(2500);

  const imagens = [...app.doc.all()].filter((o) => o.type === 'image');
  lines.push(`  objetos antes=${antes}  depois=${app.doc.size}  imagens=${imagens.length}`);
  for (const img of imagens.slice(0, 3)) {
    lines.push(
      `    imagem ${img.type === 'image' ? `${img.w}x${img.h} (arquivo ${img.naturalW}x${img.naturalH})` : ''}`,
    );
  }
  lines.push(imagens.length > 0 ? '  COLOU' : '  NAO COLOU');

  app.markClean();
  console.log(`PASTECHECK\n${lines.join('\n')}\nPASTECHECK_FIM`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
