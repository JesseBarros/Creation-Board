/**
 * Contrato da busca em TODOS os quadros da biblioteca.
 *
 * O processo principal le os arquivos e devolve so o texto; quem casa a busca e
 * o renderer, com o MESMO codigo que o `Ctrl+F` de dentro do quadro usa. Essa
 * divisao existe para que "buscar" tenha uma definicao so no app inteiro:
 * ignorar acento e caixa, e recortar o trecho em volta do achado.
 */

export type LibraryEntryKind = 'text' | 'note' | 'image' | 'name';

/** Um pedaco de texto buscavel dentro de um quadro. */
export interface LibraryEntry {
  /** Id do objeto, para a camera ir ate ele depois de abrir o quadro. */
  id: string;
  kind: LibraryEntryKind;
  text: string;
}

export interface LibraryBoard {
  path: string;
  name: string;
  updatedAt: number;
  entries: LibraryEntry[];
}

export interface LibraryIndex {
  boards: LibraryBoard[];
  /** Custo da leitura, em ms. Sai no auto-teste. */
  ms: number;
  /** Quadros que nao puderam ser lidos (corrompidos, em uso). */
  falhas: number;
}
