import { app, ipcMain } from 'electron';
import { IPC, type AppInfo } from '@shared/ipc-contract';

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
}
