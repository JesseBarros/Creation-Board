import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppInfo, type CreationBoardApi } from '@shared/ipc-contract';
import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from '@shared/wbd';
import type { ImportSource } from '@shared/importer';

/**
 * Unica ponte entre renderer e main. Nada de `ipcRenderer` cru exposto: cada
 * capacidade e uma funcao nomeada e tipada, para que a superficie de ataque
 * cresca so quando eu deliberadamente adicionar algo aqui.
 */
const api: CreationBoardApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,

  board: {
    save: (req: SaveBoardRequest): Promise<SaveBoardResult> =>
      ipcRenderer.invoke(IPC.boardSave, req) as Promise<SaveBoardResult>,
    list: (): Promise<BoardSummary[]> =>
      ipcRenderer.invoke(IPC.boardList) as Promise<BoardSummary[]>,
    load: (path: string): Promise<LoadBoardResult> =>
      ipcRenderer.invoke(IPC.boardLoad, path) as Promise<LoadBoardResult>,
    remove: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC.boardDelete, path) as Promise<void>,
    folder: (): Promise<string> => ipcRenderer.invoke(IPC.boardFolder) as Promise<string>,
    revealFolder: (): Promise<void> =>
      ipcRenderer.invoke(IPC.boardRevealFolder) as Promise<void>,
  },

  importer: {
    pick: (): Promise<ImportSource[]> =>
      ipcRenderer.invoke(IPC.importPick) as Promise<ImportSource[]>,
    read: (paths: string[]): Promise<ImportSource[]> =>
      ipcRenderer.invoke(IPC.importRead, paths) as Promise<ImportSource[]>,
  },
};

contextBridge.exposeInMainWorld('quadro', api);
