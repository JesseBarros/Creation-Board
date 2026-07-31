import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from './wbd';
import type { ImportSource } from './importer';

/**
 * Contrato IPC compartilhado por main, preload e renderer.
 *
 * Regra: nenhum canal e referenciado por string literal fora deste arquivo.
 * Renomear um canal aqui quebra a compilacao dos dois lados, que e exatamente o
 * comportamento desejado.
 */

export const IPC = {
  appInfo: 'app:info',
  boardSave: 'board:save',
  boardList: 'board:list',
  boardLoad: 'board:load',
  boardDelete: 'board:delete',
  boardFolder: 'board:folder',
  boardRevealFolder: 'board:revealFolder',
  importPick: 'import:pick',
  importRead: 'import:read',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: NodeJS.Platform;
  packaged: boolean;
}

/** Superficie exposta em `window.quadro` pelo preload. */
export interface CreationBoardApi {
  getAppInfo(): Promise<AppInfo>;

  board: {
    save(req: SaveBoardRequest): Promise<SaveBoardResult>;
    list(): Promise<BoardSummary[]>;
    load(path: string): Promise<LoadBoardResult>;
    remove(path: string): Promise<void>;
    folder(): Promise<string>;
    revealFolder(): Promise<void>;
  };

  importer: {
    /** Abre o seletor de arquivos e devolve os HTML lidos. Vazio se cancelado. */
    pick(): Promise<ImportSource[]>;
    /** Le arquivos por caminho (arrastar-e-soltar). */
    read(paths: string[]): Promise<ImportSource[]>;
  };
}
