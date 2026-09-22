import type { BoardSummary } from './wbd';

/**
 * Pastas do menu principal — um INDICE, e nao subpastas de verdade.
 *
 * Decisao de produto, tomada antes de escrever a primeira linha: os `.wbd` continuam
 * soltos numa pasta so, e arrastar um quadro para dentro de uma pasta NUNCA
 * move arquivo. O que existe e um arquivo de indice dizendo quem esta onde.
 *
 * O PRECO dessa escolha e que o indice pode discordar do disco. A resposta para
 * isso e a regra que atravessa este modulo inteiro:
 *
 *   **O INDICE E CONSELHO. O DISCO E VERDADE.**
 *
 * `listBoards()` continua mandando. Um quadro que sumiu do disco some da pasta;
 * um quadro que apareceu e nao esta em indice nenhum aparece solto. Nenhum
 * estado do indice pode esconder um quadro que existe, nem inventar um que nao
 * existe. E isso que torna este arquivo impossivel de corromper de forma
 * danosa: o pior que um indice destruido faz e desfazer o agrupamento, e o
 * usuario reorganiza. Nenhum trabalho se perde.
 *
 * O indice guarda NOME DE ARQUIVO, e nao caminho. Caminho quebraria no dia em
 * que a pasta de quadros mudasse de lugar, e abriria a porta para o indice
 * apontar para fora dela -- ver `nomeDeArquivoValido`.
 */

/** Versao do formato gravado. */
export const VERSAO_INDICE = 1;

export interface Pasta {
  /** Identidade estavel, para renomear sem perder o conteudo. */
  id: string;
  nome: string;
  /** NOMES DE ARQUIVO (`algo.wbd`), nunca caminhos. */
  quadros: string[];
}

export interface IndicePastas {
  versao: number;
  pastas: Pasta[];
}

export function indiceVazio(): IndicePastas {
  return { versao: VERSAO_INDICE, pastas: [] };
}

/**
 * Um nome de arquivo que o indice tem permissao de citar.
 *
 * NAO e formalidade. O indice e um arquivo JSON dentro da pasta do usuario, e
 * qualquer coisa que o leia vai concatenar esse nome com o caminho da pasta. Um
 * nome como `..\\..\\Windows\\System32\\algo.wbd` faria a leitura sair da pasta
 * de quadros -- e foi exatamente esse tipo de descuido que apareceu no
 * `fundo.ts` em 21/09/2026, onde o tema era interpolado no caminho e `../`
 * escapava.
 *
 * Aqui a regra e fechada em vez de aberta: tem de terminar em `.wbd` e nao pode
 * conter separador nem `..`. O que nao passar e descartado em silencio, porque
 * um indice com uma linha estranha nao deve impedir as outras de funcionar.
 *
 * DUAS RESSALVAS HONESTAS, das duas descobertas conferindo esta guarda ao
 * contrario em 22/09/2026 -- as duas dizem que ela e mais folgada do que parece,
 * e ficam escritas para ninguem confiar nela mais do que ela merece:
 *
 * 1. **O `..` e redundante hoje.** Removido sozinho, nenhum caso do
 *    `check:pastas` muda de resultado: `..` so atravessa pasta quando vem com
 *    separador, e o separador ja e recusado. Fica como cinto e suspensorio, nao
 *    como a trava. Quem carrega o peso sao as duas linhas acima dele.
 * 2. **Hoje o indice nunca ABRE arquivo.** Os nomes daqui so sao COMPARADOS com
 *    o que o `listBoards()` leu de um `readdir` de verdade (ver `reconciliar`),
 *    entao um nome que nao case simplesmente nao aparece. A validacao existe
 *    para o dia em que alguem concatenar isto com a pasta e abrir -- e esse dia
 *    chega sem aviso.
 *
 * Conferido tambem que `path.join` NAO escapa com caminho relativo a unidade
 * (`C:algo.wbd` vira segmento literal), entao aquela porta especifica ja estava
 * fechada pelo Node.
 */
export function nomeDeArquivoValido(nome: unknown): nome is string {
  if (typeof nome !== 'string' || nome.length === 0 || nome.length > 255) return false;
  if (!nome.toLowerCase().endsWith('.wbd')) return false;
  if (nome.includes('/') || nome.includes('\\')) return false;
  if (nome.includes('..')) return false;
  // `.wbd` sozinho nao e nome de arquivo, e um arquivo oculto sem nome.
  if (nome.toLowerCase() === '.wbd') return false;
  return true;
}

/**
 * Le o indice de um texto, tolerando QUALQUER coisa. Nunca lanca.
 *
 * Arquivo faltando, JSON quebrado, campo do tipo errado, versao do futuro: tudo
 * devolve indice vazio ou a parte que der para aproveitar. A alternativa --
 * lancar -- transformaria um arquivo de agrupamento corrompido num lobby que
 * nao abre, e o agrupamento vale menos que abrir.
 *
 * **Versao desconhecida devolve VAZIO**, e isso perde o agrupamento de quem
 * voltou de uma versao mais nova do app. E aceitavel exatamente porque o indice
 * e conselho: os quadros continuam todos la, soltos.
 */
export function lerIndice(texto: string): IndicePastas {
  let cru: unknown;
  try {
    cru = JSON.parse(texto);
  } catch {
    return indiceVazio();
  }
  if (typeof cru !== 'object' || cru === null) return indiceVazio();

  const obj = cru as Record<string, unknown>;
  if (obj['versao'] !== VERSAO_INDICE) return indiceVazio();
  if (!Array.isArray(obj['pastas'])) return indiceVazio();

  const vistos = new Set<string>();
  const pastas: Pasta[] = [];

  for (const item of obj['pastas']) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;

    const id = p['id'];
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) continue;
    // Id repetido: fica o primeiro. Duas pastas com a mesma identidade
    // tornariam "renomear a pasta X" ambiguo.
    if (vistos.has(id)) continue;

    const nome = typeof p['nome'] === 'string' ? p['nome'].slice(0, 120) : '';
    const brutos = Array.isArray(p['quadros']) ? p['quadros'] : [];

    // Descarta o que nao pode ser citado, e o repetido DENTRO da mesma pasta.
    const quadros: string[] = [];
    const dentro = new Set<string>();
    for (const q of brutos) {
      if (!nomeDeArquivoValido(q)) continue;
      const chave = q.toLowerCase();
      if (dentro.has(chave)) continue;
      dentro.add(chave);
      quadros.push(q);
    }

    vistos.add(id);
    pastas.push({ id, nome, quadros });
  }

  return { versao: VERSAO_INDICE, pastas };
}

/** Uma pasta com o conteudo ja resolvido para os quadros que existem. */
export interface PastaResolvida {
  id: string;
  nome: string;
  quadros: BoardSummary[];
}

export interface Reconciliado {
  pastas: PastaResolvida[];
  /** Quadros do disco que nao estao em pasta nenhuma. */
  soltos: BoardSummary[];
}

/**
 * Cruza o indice com o que o disco tem. **O disco manda.**
 *
 * Tres regras, e as tres existem para que nenhum estado do indice possa fazer
 * um quadro desaparecer da tela:
 *
 * 1. Quadro citado que NAO esta no disco simplesmente nao entra. (Apagado por
 *    fora, ou renomeado.)
 * 2. Quadro do disco que ninguem cita vai para `soltos`. (Criado por fora, ou o
 *    indice se perdeu.)
 * 3. Quadro citado por DUAS pastas fica na primeira, pela ordem do indice. Nao
 *    e um estado que a interface produza, mas um arquivo editado a mao produz --
 *    e [...] seria pior que [...].
 *
 * Pasta vazia CONTINUA existindo: o usuario a criou e ainda nao pos nada, e
 * faze-la sumir sozinha seria perder uma acao dele.
 */
export function reconciliar(indice: IndicePastas, doDisco: BoardSummary[]): Reconciliado {
  // Por nome de arquivo, em caixa baixa: o Windows nao distingue caixa, e um
  // indice gravado como `Resumo.wbd` tem de casar com `resumo.wbd` no disco.
  const porArquivo = new Map<string, BoardSummary>();
  for (const b of doDisco) {
    porArquivo.set(nomeDeArquivoDe(b).toLowerCase(), b);
  }

  const jaUsados = new Set<string>();
  const pastas: PastaResolvida[] = indice.pastas.map((p) => {
    const quadros: BoardSummary[] = [];
    for (const nome of p.quadros) {
      const chave = nome.toLowerCase();
      if (jaUsados.has(chave)) continue; // regra 3
      const achado = porArquivo.get(chave);
      if (!achado) continue; // regra 1
      jaUsados.add(chave);
      quadros.push(achado);
    }
    return { id: p.id, nome: p.nome, quadros };
  });

  // Regra 2, preservando a ordem em que o disco entregou.
  const soltos = doDisco.filter((b) => !jaUsados.has(nomeDeArquivoDe(b).toLowerCase()));

  return { pastas, soltos };
}

/**
 * O nome de arquivo de um quadro, a partir do resumo que o main entrega.
 *
 * `BoardSummary.path` e caminho completo e `name` e o nome SEM extensao, entao
 * nenhum dos dois serve direto. Esta funcao e o unico lugar que sabe disso --
 * se um dia o resumo passar a carregar o nome de arquivo, e aqui que muda.
 */
export function nomeDeArquivoDe(b: BoardSummary): string {
  const barra = Math.max(b.path.lastIndexOf('/'), b.path.lastIndexOf('\\'));
  return barra >= 0 ? b.path.slice(barra + 1) : b.path;
}

/**
 * Tira um quadro de todas as pastas. Usado antes de po-lo em outra.
 *
 * Separado de [...] de propósito: mover e tirar-e-por, e um mover que
 * esquece de tirar produz o estado da regra 3 acima.
 */
export function tirarDeTodas(indice: IndicePastas, nomeArquivo: string): IndicePastas {
  const chave = nomeArquivo.toLowerCase();
  return {
    versao: indice.versao,
    pastas: indice.pastas.map((p) => ({
      ...p,
      quadros: p.quadros.filter((q) => q.toLowerCase() !== chave),
    })),
  };
}
