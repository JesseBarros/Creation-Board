import { app, ipcMain } from 'electron';
import { IPC, type AppInfo } from '@shared/ipc-contract';
import { definirIdioma, idiomaValido } from '@shared/i18n';

/**
 * Handlers IPC de escopo "aplicacao". Cada area (storage, fontes, export) ganha
 * o proprio modulo de registro em src/main/ipc/ conforme as fases avancarem.
 */
export function registerAppIpc(): void {
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
}
