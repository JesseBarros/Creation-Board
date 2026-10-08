import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from './wbd';
import type { ImportSource } from './importer';
import type { OcrItem, OcrReport } from './ocr';
import type { LibraryIndex } from './librarySearch';
import type { IndicePastas } from './pastas';
import type { Idioma } from './i18n';

/**
 * Contrato IPC compartilhado por main, preload e renderer.
 *
 * Regra: nenhum canal e referenciado por string literal fora deste arquivo.
 * Renomear um canal aqui quebra a compilacao dos dois lados, que e exatamente o
 * comportamento desejado.
 */

export const IPC = {
  appInfo: 'app:info',
  appIdioma: 'app:idioma',
  appRecarregar: 'app:recarregar',
  appFechar: 'app:fechar',
  appTema: 'app:tema',
  graficosLer: 'graficos:ler',
  graficosGravar: 'graficos:gravar',
  graficosReabrir: 'graficos:reabrir',
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
  fundoEscolher: 'fundo:escolher',
  fundoLer: 'fundo:ler',
  fundoLimpar: 'fundo:limpar',
  pastasLer: 'pastas:ler',
  pastasGravar: 'pastas:gravar',
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

/**
 * A opcao "compatibilidade grafica" (ver `main/graficos.ts`). Sao dois valores
 * porque ela so vale ao reabrir: o gravado pode ser diferente do que esta em uso.
 */
export interface EstadoGraficos {
  /** O que esta gravado -- vale na proxima abertura. */
  compatibilidade: boolean;
  /** Se ESTA execucao esta com a composicao pela CPU. */
  emUso: boolean;
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

/** Qual dos dois fundos do menu principal. Um por tema. */
export type TemaFundo = 'claro' | 'escuro';

/**
 * Uma imagem de fundo escolhida pelo usuario, como ela esta no disco.
 *
 * Trafega os BYTES, e nao o caminho: a CSP do aplicativo permite `data:` e
 * `blob:` em imagem, mas nao `file:` -- entao um caminho nao teria como ser
 * exibido. O renderer monta um `blob:` com isto.
 */
export interface FundoImagem {
  bytes: ArrayBuffer;
  /** Deduzido da ASSINATURA dos bytes, nao da extensao. */
  mime: string;
  /** Nome original do arquivo, so para o dialogo de Configuracoes mostrar. */
  nome: string;
}

/** Superficie exposta em `window.quadro` pelo preload. */
export interface CreationBoardApi {
  getAppInfo(): Promise<AppInfo>;
  /** O idioma escolhido pela pagina, para os dialogos nativos e as mensagens do main. */
  definirIdioma(idioma: Idioma): Promise<void>;
  /**
   * Recarrega a janela -- pelo processo principal, e nao por `location.reload()`:
   * no app instalado o bloqueio de navegacao cancela o recarregar da propria
   * pagina (ver `ipc/app.ts`).
   */
  recarregar(): Promise<void>;
  /**
   * Fecha a janela depois de a pagina ja ter perguntado o que fazer com as
   * alteracoes pendentes (ver `#guardUnsavedOnClose` no App).
   */
  fecharJanela(): Promise<void>;
  /**
   * O tema que a pagina acabou de aplicar, para a COR DE FUNDO DA JANELA seguir
   * junto (ver `shared/abertura.ts`): sem isso, ao redimensionar, a borda nova
   * aparecia na cor do outro tema por um instante.
   */
  temaDaJanela(tema: 'light' | 'dark'): Promise<void>;

  graficos: {
    ler(): Promise<EstadoGraficos>;
    /** Grava a opcao; vale na proxima vez que o app abrir. */
    gravar(compatibilidade: boolean): Promise<void>;
    /**
     * Fecha e abre o app de novo, para a opcao valer. Em desenvolvimento so
     * fecha: o servidor do Vite morre junto com a janela (ver `ipc/app.ts`).
     */
    reabrir(): Promise<void>;
  };

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
     * Le os arquivos na hora -- 68 ms numa biblioteca de estudo real. O renderer guarda
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

  /**
   * O plano de fundo do menu principal, um por tema.
   *
   * O renderer nunca manda caminho -- so o tema. Nao ha como pedir "copie" ou
   * "apague" um caminho arbitrario do disco a partir da interface.
   */
  fundo: {
    /** Abre o seletor e COPIA o escolhido para a pasta do app. null = cancelou. */
    escolher(tema: TemaFundo): Promise<FundoImagem | null>;
    /** O que ja esta guardado. null = nao ha, usar a imagem que vem com o app. */
    ler(tema: TemaFundo): Promise<FundoImagem | null>;
    /** Volta para a imagem que vem com o app. */
    limpar(tema: TemaFundo): Promise<void>;
  };

  /**
   * O indice de pastas do menu principal.
   *
   * Duas operacoes so, e de propósito: o renderer le o indice inteiro e grava o
   * indice inteiro. Nao ha "criar pasta" nem "mover quadro" no IPC, porque essas
   * sao decisoes de INTERFACE -- o main nao precisa conhece-las, e cada uma que
   * ele conhecesse seria uma regra a mais para manter em dois lugares.
   *
   * O arquivo e pequeno (nomes, nao conteudo) e reescrito inteiro, o que torna a
   * gravacao atomica de raciocinar: ou o arquivo novo esta la, ou o antigo esta.
   */
  pastas: {
    /** O que esta gravado. Indice vazio quando nao ha arquivo ou ele e ilegivel. */
    ler(): Promise<IndicePastas>;
    gravar(indice: IndicePastas): Promise<void>;
  };

  ocr: {
    /**
     * Le o texto de um LOTE de imagens. Um lote por chamada, e nao uma imagem:
     * o custo esta na partida do motor, e ela se paga uma vez so.
     */
    recognize(items: OcrItem[]): Promise<OcrReport>;
  };
}
