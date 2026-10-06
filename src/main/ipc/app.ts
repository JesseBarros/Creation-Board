import { app, ipcMain } from 'electron';
import { IPC, type AppInfo, type EstadoGraficos } from '@shared/ipc-contract';
import { definirIdioma, idiomaValido } from '@shared/i18n';
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

  ipcMain.handle(IPC.graficosLer, (): EstadoGraficos => ({
    compatibilidade: lerCompatibilidade(app.getPath('userData')),
    emUso: compatEmUso,
  }));

  // Validado como o idioma: so um booleano de verdade grava.
  ipcMain.handle(IPC.graficosGravar, async (_e, ligada: unknown): Promise<void> => {
    if (typeof ligada !== 'boolean') throw new Error('Valor invalido.');
    await gravarCompatibilidade(app.getPath('userData'), ligada);
  });
}
