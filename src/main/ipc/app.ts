import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC, type AppInfo, type EstadoGraficos } from '@shared/ipc-contract';
import { definirIdioma, idiomaValido } from '@shared/i18n';
import { COR_DA_JANELA, temaDaJanelaValido } from '@shared/abertura';
import { gravarCompatibilidade, lerCompatibilidade } from '../graficos';

/**
 * Handlers IPC de escopo "aplicacao". Cada area (storage, fontes, export) ganha
 * o proprio modulo de registro em src/main/ipc/ conforme as fases avancarem.
 *
 * `compatEmUso` e o que ESTA execucao aplicou ao abrir -- a opcao gravada so
 * vale na proxima, entao os dois podem divergir.
 */
export function registerAppIpc(compatEmUso: boolean): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      packaged: app.isPackaged,
    };
  });

  // O idioma escolhido pela pagina. Validado: o valor vem do renderer, e um
  // idioma desconhecido deixaria `t()` sem dicionario.
  ipcMain.handle(IPC.appIdioma, (_e, idioma: unknown): void => {
    if (idiomaValido(idioma)) definirIdioma(idioma);
  });

  // "Aplicar alterações" de Configurações, quando so o idioma mudou.
  //
  // Pelo processo principal, e nao por `location.reload()` na pagina: no app
  // INSTALADO o `will-navigate` de `index.ts` cancela toda navegacao que a
  // pagina inicia -- inclusive recarregar a si mesma --, e a troca de idioma
  // gravava a escolha e nao aplicava (relato em 06/10/2026, com a 1.1.0
  // instalada; no dev nao aparecia, porque la o servidor do Vite e liberado).
  // `webContents.reload()` e programatico e nao passa por aquele bloqueio, que
  // continua inteiro para o resto.
  ipcMain.handle(IPC.appRecarregar, (e): void => {
    e.sender.reload();
  });

  // O X da janela, depois de a pagina perguntar sobre o quadro nao salvo (B36).
  // Fecha a janela da propria pagina que pediu; o `beforeunload` dela deixa
  // passar desta vez, porque foi ela quem decidiu.
  ipcMain.handle(IPC.appFechar, (e): void => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  // O fundo da janela segue o tema da pagina (07/10/2026). Validado: o valor
  // vem do renderer.
  ipcMain.handle(IPC.appTema, (e, tema: unknown): void => {
    if (!temaDaJanelaValido(tema)) return;
    BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(COR_DA_JANELA[tema]);
  });

  ipcMain.handle(IPC.graficosLer, (): EstadoGraficos => ({
    compatibilidade: lerCompatibilidade(app.getPath('userData')),
    emUso: compatEmUso,
  }));

  // Validado como o idioma: so um booleano de verdade grava.
  ipcMain.handle(IPC.graficosGravar, async (_e, ligada: unknown): Promise<void> => {
    if (typeof ligada !== 'boolean') throw new Error('Valor invalido.');
    await gravarCompatibilidade(app.getPath('userData'), ligada);
  });

  // "Reabrir agora", ao lado do aviso de que a opcao so vale ao reabrir.
  //
  // `quit`, e nao `exit`: passa pelo fechamento normal da janela. So aparece em
  // Configuracoes, que so abre no menu principal -- nao ha quadro aberto.
  //
  // Em DESENVOLVIMENTO so fecha. O `electron-vite dev` encerra o servidor do
  // Vite quando o Electron sai (`ps.on('close', process.exit)`), e um app
  // relancado abriria apontando para um servidor morto: janela em branco.
  ipcMain.handle(IPC.graficosReabrir, (): void => {
    if (app.isPackaged) app.relaunch();
    else console.log('[graficos] fechando; rode `npm run dev` de novo para reabrir (em dev nao ha relancar)');
    app.quit();
  });
}
