/**
 * Contrato do reconhecimento de texto em imagens (OCR).
 *
 * O motor e o do proprio Windows (`Windows.Media.Ocr`), e a escolha foi medida
 * antes de ser feita -- ver `src/main/ocr/windowsOcr.ts`. O que importa aqui e
 * que o renderer nunca fala com ele: manda bytes, recebe texto.
 */

export interface OcrItem {
  /** Id do asset. Volta igual na resposta, e e por ele que se casa o resultado. */
  id: string;
  mime: string;
  data: ArrayBuffer;
}

export interface OcrText {
  id: string;
  /** Texto reconhecido, com quebra de linha entre as linhas lidas. */
  text: string;
  /** Preenchido quando aquela imagem falhou; as outras do lote seguem. */
  error?: string;
}

export interface OcrReport {
  /**
   * Falso quando a maquina nao tem OCR (nenhum idioma instalado, ou nao e
   * Windows). O app precisa distinguir "nao ha texto na imagem" de "nao da para
   * ler imagem nenhuma aqui" -- sem isso, ele tentaria de novo a cada abertura.
   */
  available: boolean;
  /** Idioma do motor, ex.: "pt-BR". Vazio quando indisponivel. */
  language: string;
  items: OcrText[];
  /** Custo total do lote, em ms. Sai no `F3` e no auto-teste. */
  ms: number;
}
