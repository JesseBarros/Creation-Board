import type { LibraryBoard, LibraryEntryKind, LibraryIndex } from '@shared/librarySearch';
import { findIn, foldText } from './search';

/**
 * Busca em TODOS os quadros da biblioteca.
 *
 * ## O que ela e, e o que ela nao e
 *
 * Ela **nao** e um segundo motor de busca. O casamento e o recorte do trecho
 * saem de `findIn`, o mesmo do `Ctrl+F` de dentro do quadro: ignorar acento e
 * caixa, e mostrar o pedaco em volta do achado. Uma palavra que o `Ctrl+F` acha
 * la dentro tem de aparecer aqui, e vice-versa -- duas implementacoes de "achar"
 * produziriam justamente a divergencia que faz alguem desconfiar das duas.
 *
 * ## O texto vem de fora e fica em memoria
 *
 * O processo principal le os `.wbd` e devolve so o texto (68 ms na biblioteca
 * real dele). O resultado fica guardado aqui pela sessao: a primeira tecla paga
 * a leitura, e da segunda em diante a busca acontece inteira em memoria.
 *
 * `invalidate()` derruba o cache. Chamar depois de salvar, importar ou apagar um
 * quadro e o que mantem a busca honesta -- sem isso ela mostraria o texto de
 * antes da ultima edicao, que e pior que nao mostrar nada.
 */

export interface LibraryHit {
  path: string;
  boardName: string;
  /** Id do objeto dentro daquele quadro. */
  id: string;
  kind: LibraryEntryKind;
  snippet: string;
  at: number;
  length: number;
}

/** Resultados de um quadro, ja agrupados para a lista. */
export interface LibraryGroup {
  path: string;
  boardName: string;
  hits: LibraryHit[];
  /** Quantos casaram neste quadro, mesmo alem do teto mostrado. */
  total: number;
}

/**
 * Teto de resultados POR QUADRO.
 *
 * A busca de dentro do quadro para em 200 no total; aqui o teto e por quadro,
 * porque a pergunta e outra: la se percorre uma lista, aqui se escolhe por onde
 * comecar. Vinte por quadro cabem na tela e ja mostram do que se trata; o
 * numero total continua ao lado do nome, entao nada fica escondido em silencio.
 */
const POR_QUADRO = 20;

let cache: LibraryIndex | null = null;
let carregando: Promise<LibraryIndex> | null = null;

export function invalidateLibraryIndex(): void {
  cache = null;
  carregando = null;
}

/** Le a biblioteca, ou devolve o que ja esta em memoria. */
export function loadLibraryIndex(): Promise<LibraryIndex> {
  if (cache) return Promise.resolve(cache);
  // Guarda a PROMESSA, e nao so o resultado: duas teclas rapidas entrariam aqui
  // juntas e disparariam duas leituras da biblioteca inteira. E o mesmo cuidado
  // que a resolucao da pasta de quadros precisou ter no B11.
  carregando ??= window.quadro.board
    .searchIndex()
    .then((idx) => {
      cache = idx;
      carregando = null;
      return idx;
    })
    .catch((err: unknown) => {
      carregando = null;
      throw err;
    });
  return carregando;
}

export function searchLibrary(index: LibraryIndex, query: string): LibraryGroup[] {
  const needle = foldText(query).trim();
  if (needle.length === 0) return [];

  const grupos: LibraryGroup[] = [];
  for (const board of index.boards) {
    const grupo = buscarNoQuadro(board, needle);
    if (grupo) grupos.push(grupo);
  }
  // Quadro com mais acertos primeiro: e o mais provavel de ser o procurado.
  // Empate desfeito pelo mais recente, que ja e a ordem que chega do main.
  grupos.sort((a, b) => b.total - a.total);
  return grupos;
}

function buscarNoQuadro(board: LibraryBoard, needle: string): LibraryGroup | null {
  const hits: LibraryHit[] = [];
  let total = 0;

  for (const entry of board.entries) {
    // O teste barato primeiro, igual a busca de dentro do quadro: so quem casa
    // paga o recorte do trecho, que e a parte cara.
    if (!foldText(entry.text).includes(needle)) continue;
    total++;
    if (hits.length >= POR_QUADRO) continue;

    const achado = findIn(entry.text, needle);
    if (!achado) continue;
    hits.push({
      path: board.path,
      boardName: board.name,
      id: entry.id,
      kind: entry.kind,
      ...achado,
    });
  }

  return total === 0 ? null : { path: board.path, boardName: board.name, hits, total };
}
