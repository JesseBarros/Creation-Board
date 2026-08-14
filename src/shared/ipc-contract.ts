import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from './wbd';
import type { ImportSource } from './importer';
import type { OcrItem, OcrReport } from './ocr';
import type { LibraryIndex } from './librarySearch';

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
  ocrRecognize: 'ocr:recognize',
  boardSearchIndex: 'board:searchIndex',
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
  /**
   * Ladrilhos alem do primeiro (ver o B13).
   *
   * Um quadro grande nao cabe num PNG so -- o dele daria 1,6 gigapixel a 1x --,
   * entao a escala pedida e honrada gravando uma GRADE de arquivos. Eles vem
   * juntos num pedido unico de proposito: sao um gesto so para quem exporta, e
   * perguntar onde salvar uma vez por ladrilho seria insuportavel.
   *
   * `data` do pedido e sempre o primeiro ladrilho; estes sao do segundo em
   * diante, cada um com o sufixo que entra antes da extensao.
   */
  parts?: ExportPart[];
  /**
   * Sufixo do PRIMEIRO arquivo, quando a exportacao sai em ladrilhos.
   *
   * Sem ele o primeiro sairia `quadro.png` e os vizinhos `quadro-l1c2.png`: numa
   * pasta ordenada por nome, o canto superior esquerdo cairia longe do resto da
   * primeira linha. Com `-l1c1`, ordenar por nome ja remonta a grade.
   */
  suffix?: string;
}

export interface ExportPart {
  data: ArrayBuffer;
  /** Sufixo antes da extensao, ex.: "-l1c2". */
  suffix: string;
}

export interface ExportResult {
  /** Caminho gravado, ou null se o usuario cancelou o dialogo. */
  path: string | null;
  /** Quantos arquivos foram gravados. Maior que 1 quando saiu em ladrilhos. */
  count?: number;
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
    /**
     * Texto buscavel de TODOS os quadros, para a busca da biblioteca.
     *
     * Le os arquivos na hora -- 68 ms na biblioteca real dele. O renderer guarda
     * o resultado em memoria e so pede de novo depois de salvar ou apagar um
     * quadro.
     */
    searchIndex(): Promise<LibraryIndex>;
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

  ocr: {
    /**
     * Le o texto de um LOTE de imagens. Um lote por chamada, e nao uma imagem:
     * o custo esta na partida do motor, e ela se paga uma vez so.
     */
    recognize(items: OcrItem[]): Promise<OcrReport>;
  };
}
