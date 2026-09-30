import { ptBR } from './pt-BR';
import { enUS } from './en-US';
import { idiomaAtual, type Idioma } from './estado';

export { definirIdioma, formatarBytes, formatarData, formatarNumero, idiomaAtual, type Idioma } from './estado';

/**
 * OS IDIOMAS DO APP: portugues do Brasil e ingles dos Estados Unidos
 * (30/09/2026).
 *
 * Todo texto que a pessoa LE passa por `t()`. O dicionario de referencia e o
 * portugues (`pt-BR.ts`); o ingles (`en-US.ts`) e tipado contra ele, entao uma
 * chave nova sem traducao -- ou uma traducao com parametros diferentes -- e erro
 * de compilacao, e nao texto em portugues aparecendo no meio da interface em
 * ingles.
 *
 * Texto com valor dentro ("Pasta X excluida", "3 quadros") e uma FUNCAO no
 * dicionario, e nao um texto com marcador: os parametros ficam tipados, e cada
 * idioma resolve a propria gramatica -- plural, ordem das palavras -- em vez de
 * herdar a do portugues.
 *
 * O modulo roda nos dois processos. Cada um tem a sua copia do estado: a pagina
 * decide o idioma ao iniciar e avisa o processo principal (canal `app:idioma`),
 * que o usa nos dialogos nativos e nas mensagens de erro.
 */

export const IDIOMAS: readonly Idioma[] = ['pt-BR', 'en-US'];

/**
 * O nome de cada idioma NA PROPRIA LINGUA, e por isso fora dos dicionarios: quem
 * abriu o app num idioma que nao le precisa achar o seu pelo nome que conhece.
 */
export const NOMES_DOS_IDIOMAS: Readonly<Record<Idioma, string>> = {
  'pt-BR': 'Português (Brasil)',
  'en-US': 'English (US)',
};

export type Dicionario = typeof ptBR;
export type Chave = keyof Dicionario;

/** So as chaves que sao TEXTO (sem parametro) -- as que podem ser guardadas numa lista e traduzidas depois. */
export type ChaveTexto = { [K in Chave]: Dicionario[K] extends string ? K : never }[Chave];

/** O mesmo formato do portugues: texto onde ele e texto, funcao com os mesmos parametros onde ele e funcao. */
export type Traducao = {
  [K in Chave]: Dicionario[K] extends (...a: infer A) => string ? (...a: A) => string : string;
};

type Args<K extends Chave> = Dicionario[K] extends (...a: infer A) => string ? A : [];

const DICIONARIOS: Record<Idioma, Traducao> = { 'pt-BR': ptBR, 'en-US': enUS };

export function idiomaValido(v: unknown): v is Idioma {
  return v === 'pt-BR' || v === 'en-US';
}

/**
 * O idioma a partir das preferencias do sistema: qualquer portugues vira
 * `pt-BR`, e qualquer outra coisa, `en-US` -- decisao de produto: "segue o Windows".
 */
export function idiomaDoSistema(preferidos: readonly string[]): Idioma {
  return preferidos[0]?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

/** O texto de uma chave no idioma atual. */
export function t<K extends Chave>(chave: K, ...args: Args<K>): string {
  const v = DICIONARIOS[idiomaAtual()][chave] as string | ((...a: unknown[]) => string);
  return typeof v === 'function' ? v(...args) : v;
}
