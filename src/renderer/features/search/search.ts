import type { BoardObject, ObjectId } from '@shared/model/types';
import type { Document } from '../../core/Document';
import { plainText } from '../text/spans';

/**
 * Busca de texto no quadro.
 *
 * Varredura direta sobre os objetos, sem indice invertido -- mas com o texto
 * dobrado em CACHE por objeto. A diferenca entre as duas coisas importa: um
 * indice invertido precisaria ser mantido a cada edicao, a cada undo e a cada
 * importacao; o cache aqui e memoizacao pura, com a mesma chave `id:rev` que o
 * layout de texto usa, e um objeto alterado simplesmente perde a entrada.
 *
 * O caminho ate esta forma foi medido, nao adivinhado (os numeros saem no
 * autoteste, com 10.000 objetos):
 *
 *   - dobrar o texto de tudo a cada tecla: 20,8 ms -- mais que um frame;
 *   - dobrando a string inteira de uma vez e guardando o resultado: 4,0 ms.
 *
 * E a reparticao desses 4 ms diz onde NAO adianta mexer: varrer os 10.000
 * objetos sem casar com nada custa **0,9 ms**. Procurar nunca foi o gargalo --
 * o custo esta em montar o trecho de cada acerto, que e limitado por `MAX_HITS`.
 * Um indice invertido otimizaria justamente a parte de 0,9 ms.
 *
 * Por isso o mapa de indices (que recorta o trecho no texto ORIGINAL) so e
 * montado para os objetos que casaram.
 *
 * O que casa: o texto das caixas e dos post-its, mais o `name` do objeto (campo
 * do modelo desde a Fase 1, sem produtor ainda -- entra aqui para que rotular um
 * objeto ja nasca buscavel).
 */

export type HitKind = 'text' | 'note' | 'name';

export interface SearchHit {
  id: ObjectId;
  kind: HitKind;
  /** Trecho do texto original em volta do casamento, para mostrar na lista. */
  snippet: string;
  /** Onde o casamento comeca dentro de `snippet`, e quanto ele ocupa. */
  at: number;
  length: number;
}

/** Teto de resultados. Além disto a lista deixa de ajudar e só custa. */
const MAX_HITS = 200;

/** Contexto em volta do casamento, em caracteres. */
const BEFORE = 32;
const AFTER = 72;

export function searchBoard(doc: Document, query: string, limit = MAX_HITS): SearchHit[] {
  const needle = foldText(query).trim();
  if (needle.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const obj of doc.all()) {
    if (obj.hidden) continue;
    const hit = matchObject(obj, needle);
    if (hit) hits.push(hit);
    if (hits.length >= limit) break;
  }

  // Ordem de LEITURA do quadro, de cima para baixo e da esquerda para a direita.
  // A ordem de camada (`z`) seria arbitraria para quem le, e a ordem do Map
  // seria a de criacao -- nenhuma das duas descreve o que se ve na tela.
  const rank = new Map(hits.map((h) => [h.id, doc.get(h.id)?.bbox]));
  hits.sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (!ra || !rb) return 0;
    return ra.y - rb.y || ra.x - rb.x;
  });
  return hits;
}

function matchObject(obj: BoardObject, needle: string): SearchHit | null {
  if (obj.type === 'text' || obj.type === 'note') {
    // O teste barato primeiro, sobre o texto ja dobrado e em cache. So quem
    // passa aqui paga o recorte do trecho, que e a parte cara.
    if (foldedOf(obj).includes(needle)) {
      const hit = findIn(plainText(obj.content), needle);
      if (hit) return { id: obj.id, kind: obj.type, ...hit };
    }
  }
  if (obj.name && foldText(obj.name).includes(needle)) {
    const hit = findIn(obj.name, needle);
    if (hit) return { id: obj.id, kind: 'name', ...hit };
  }
  return null;
}

/**
 * Texto dobrado de um objeto, memoizado pelo PROPRIO OBJETO.
 *
 * `WeakMap` em vez da chave `id:rev` que o cache de layout usa, porque aqui o
 * acesso e por objeto a cada tecla digitada: montar `${id}:${rev}` custava uma
 * string nova por objeto por busca -- 10.000 alocacoes por tecla, medidas em
 * 10,4 ms. A identidade serve de chave sozinha, ja que toda mutacao substitui o
 * objeto por um novo (ver Document.replaceMany), e o que sai do documento e
 * coletado sem precisar de teto de tamanho nem de limpeza.
 */
function foldedOf(obj: BoardObject): string {
  const hit = foldedCache.get(obj);
  if (hit !== undefined) return hit;

  const text = obj.type === 'text' || obj.type === 'note' ? plainText(obj.content) : '';
  const folded = foldText(text);
  foldedCache.set(obj, folded);
  return folded;
}

const foldedCache = new WeakMap<BoardObject, string>();

/** Primeiro casamento dentro de um texto, ja recortado em trecho. */
function findIn(text: string, needle: string): Omit<SearchHit, 'id' | 'kind'> | null {
  if (text.length === 0) return null;
  const folded = fold(text);
  const found = folded.text.indexOf(needle);
  if (found < 0) return null;

  // Os indices voltam para o texto ORIGINAL pelo mapa: dobrar "coração" tira o
  // acento e encurta a string, entao a posicao no texto dobrado nao serve para
  // recortar o que o usuario escreveu.
  const start = folded.map[found] ?? 0;
  const endFolded = Math.min(folded.map.length - 1, found + needle.length - 1);
  const end = (folded.map[endFolded] ?? start) + 1;

  const from = Math.max(0, start - BEFORE);
  const to = Math.min(text.length, end + AFTER);
  // A quebra de linha vira espaco: o trecho e uma linha so numa lista.
  const raw = text.slice(from, to).replace(/\s+/g, ' ');
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';

  // O recorte encolheu os espacos, entao a posicao do casamento e recalculada
  // sobre o proprio trecho em vez de deduzida das contas acima.
  const inSnippet = fold(prefix + raw).text.indexOf(needle);

  return {
    snippet: prefix + raw + suffix,
    at: inSnippet < 0 ? 0 : inSnippet,
    length: inSnippet < 0 ? 0 : needle.length,
  };
}

const COMBINING = /[̀-ͯ]/g;

/**
 * Dobra a string inteira de uma vez -- e o caminho quente, usado no teste de
 * casamento de todos os objetos. Dobrar caractere a caractere, como `fold` faz
 * para poder montar o mapa, custava mais que um frame com 10.000 objetos.
 */
function foldText(text: string): string {
  return text.normalize('NFD').replace(COMBINING, '').toLowerCase();
}

/**
 * Texto "dobrado" para comparacao: minusculas e sem acento.
 *
 * Sem isto, procurar "revisao" nao acharia "revisão" e "MATRIZ" nao acharia
 * "matriz" -- e num resumo em portugues escrito a duas maos (digitado e
 * importado) isso e a regra, nao a excecao.
 *
 * O mapa devolve, para cada caractere dobrado, de qual caractere do original ele
 * veio. E o que permite recortar o trecho no texto de verdade.
 */
function fold(text: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.normalize('NFD').replace(COMBINING, '').toLowerCase();
    for (let k = 0; k < ch.length; k++) {
      out += ch[k];
      map.push(i);
    }
  }
  return { text: out, map };
}
