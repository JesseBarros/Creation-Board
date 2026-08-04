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
  exportSave: 'export:save',
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

export type ExportFormat = 'png' | 'svg' | 'pdf';

export interface ExportRequest {
  /** Nome sugerido no dialogo, sem extensao. */
  name: string;
  format: ExportFormat;
  /**
   * PNG e PDF chegam como bytes de um PNG; SVG, como o texto ja codificado em
   * UTF-8. O PDF e montado no processo principal (ver ipc/exporter.ts), porque
   * so ele tem `printToPDF`.
   */
  data: ArrayBuffer;
  /** Tamanho do PNG em pixels. So o PDF usa, para a pagina sair na proporcao. */
  widthPx?: number;
  heightPx?: number;
  /**
   * Caminho pronto, pulando o dialogo. So a verificacao por terminal
   * (`QB_EXPORT`) usa: o dialogo nativo e a unica parte que nao se automatiza,
   * e sem esta porta o caminho do PDF so seria exercitado a mao.
   */
  path?: string;
}

export interface ExportResult {
  /** Caminho gravado, ou null se o usuario cancelou o dialogo. */
  path: string | null;
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

  exporter: {
    /** Pergunta onde salvar e grava. `path: null` = cancelado. */
    save(req: ExportRequest): Promise<ExportResult>;
  };
}
