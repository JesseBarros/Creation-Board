import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppInfo,
  type EstadoGraficos,
  type CreationBoardApi,
  type ExportRequest,
  type ExportResult,
  type FundoImagem,
  type TemaFundo,
} from '@shared/ipc-contract';
import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from '@shared/wbd';
import type { ImportSource } from '@shared/importer';
import type { OcrItem, OcrReport } from '@shared/ocr';
import type { LibraryIndex } from '@shared/librarySearch';
import type { IndicePastas } from '@shared/pastas';
import type { Idioma } from '@shared/i18n';

/**
 * Unica ponte entre renderer e main. Nada de `ipcRenderer` cru exposto: cada
 * capacidade e uma funcao nomeada e tipada, para que a superficie de ataque
 * cresca so quando eu deliberadamente adicionar algo aqui.
 */
const api: CreationBoardApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
  definirIdioma: (idioma: Idioma): Promise<void> =>
    ipcRenderer.invoke(IPC.appIdioma, idioma) as Promise<void>,
  recarregar: (): Promise<void> => ipcRenderer.invoke(IPC.appRecarregar) as Promise<void>,
  fecharJanela: (): Promise<void> => ipcRenderer.invoke(IPC.appFechar) as Promise<void>,
  temaDaJanela: (tema: 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke(IPC.appTema, tema) as Promise<void>,

  graficos: {
    ler: (): Promise<EstadoGraficos> =>
      ipcRenderer.invoke(IPC.graficosLer) as Promise<EstadoGraficos>,
    gravar: (compatibilidade: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.graficosGravar, compatibilidade) as Promise<void>,
    reabrir: (): Promise<void> => ipcRenderer.invoke(IPC.graficosReabrir) as Promise<void>,
  },

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
    searchIndex: (): Promise<LibraryIndex> =>
      ipcRenderer.invoke(IPC.boardSearchIndex) as Promise<LibraryIndex>,
  },

  importer: {
    pick: (): Promise<ImportSource[]> =>
      ipcRenderer.invoke(IPC.importPick) as Promise<ImportSource[]>,
    read: (paths: string[]): Promise<ImportSource[]> =>
      ipcRenderer.invoke(IPC.importRead, paths) as Promise<ImportSource[]>,
  },

  fundo: {
    escolher: (tema: TemaFundo): Promise<FundoImagem | null> =>
      ipcRenderer.invoke(IPC.fundoEscolher, tema) as Promise<FundoImagem | null>,
    ler: (tema: TemaFundo): Promise<FundoImagem | null> =>
      ipcRenderer.invoke(IPC.fundoLer, tema) as Promise<FundoImagem | null>,
    limpar: (tema: TemaFundo): Promise<void> =>
      ipcRenderer.invoke(IPC.fundoLimpar, tema) as Promise<void>,
  },

  pastas: {
    ler: (): Promise<IndicePastas> => ipcRenderer.invoke(IPC.pastasLer) as Promise<IndicePastas>,
    gravar: (indice: IndicePastas): Promise<void> =>
      ipcRenderer.invoke(IPC.pastasGravar, indice) as Promise<void>,
  },

  exporter: {
    save: (req: ExportRequest): Promise<ExportResult> =>
      ipcRenderer.invoke(IPC.exportSave, req) as Promise<ExportResult>,
  },

  ocr: {
    recognize: (items: OcrItem[]): Promise<OcrReport> =>
      ipcRenderer.invoke(IPC.ocrRecognize, items) as Promise<OcrReport>,
  },
};

contextBridge.exposeInMainWorld('quadro', api);
