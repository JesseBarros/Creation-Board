import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { IPC, type PlanoPastaQuadros } from '@shared/ipc-contract';
import { t } from '@shared/i18n';
import { definirPastaResolvida, ensureBoardsDir, podeEscrever } from '../storage/wbdFile';
import { moverPasta, planejarMudanca } from '../storage/moverPasta';
import { gravarPastaEscolhida } from '../storage/pastaEscolhida';

/**
 * Trocar a pasta dos quadros, em Configuracoes (06/10/2026).
 *
 * Dois passos, e a pagina NUNCA manda caminho -- o mesmo desenho do fundo: um
 * IPC que aceitasse caminho arbitrario seria um [...]
 * na mao de quem comprometesse a pagina. O `escolher` abre o dialogo nativo e
 * guarda AQUI a pasta escolhida; o `mover` so sabe mover para ela.
 *
 * A logica de disco mora em `storage/moverPasta.ts` (ver la as tres regras).
 */

let pendente: string | null = null;

export function registerPastaQuadrosIpc(): void {
  ipcMain.handle(IPC.pastaQuadrosEscolher, async (e): Promise<PlanoPastaQuadros | null> => {
    pendente = null;
    const win = BrowserWindow.fromWebContents(e.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: t('pastaQuadros.escolherTitulo'),
      properties: ['openDirectory', 'createDirectory'],
    };
    // QB_PASTA_ESCOLHA=<pasta> responde no lugar do seletor, so em
    // desenvolvimento -- o dialogo nativo e a unica parte que nao se dirige por
    // script (o mesmo motivo do QB_EXPORT). Todo o resto do caminho e o real.
    const automatica = !app.isPackaged ? process.env['QB_PASTA_ESCOLHA'] : undefined;
    const r = automatica
      ? { canceled: false, filePaths: [automatica] }
      : win
        ? await dialog.showOpenDialog(win, opcoes)
        : await dialog.showOpenDialog(opcoes);
    const escolhida = r.canceled ? undefined : r.filePaths[0];
    if (!escolhida) return null;

    const plano = await planejarMudanca(await ensureBoardsDir(), escolhida);
    if (!plano.problema && plano.conflitos.length === 0) pendente = escolhida;
    return {
      destino: escolhida,
      quadros: plano.quadros.length,
      conflitos: plano.conflitos,
      problema: plano.problema,
    };
  });

  ipcMain.handle(IPC.pastaQuadrosMover, async (): Promise<{ movidos: number; destino: string }> => {
    const destino = pendente;
    pendente = null;
    if (!destino) throw new Error(t('pastaQuadros.mesma'));

    const origem = await ensureBoardsDir();
    await fs.mkdir(destino, { recursive: true });
    const ok = await podeEscrever(destino);
    if (ok !== true) throw new Error(t('erro.pastaEscolhidaSemAcesso', destino, String(ok)));

    const { movidos } = await moverPasta(origem, destino);
    // Depois da mudanca, e nao antes: se ela falhar (e voltar), a escolha
    // gravada continua apontando para onde os quadros de fato estao.
    await gravarPastaEscolhida(app.getPath('userData'), destino);
    definirPastaResolvida(destino);
    console.log(`[boards] ${movidos} quadro(s) movido(s) de "${origem}" para "${destino}"`);
    return { movidos, destino };
  });
}
