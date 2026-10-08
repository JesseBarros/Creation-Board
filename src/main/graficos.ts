import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * A "compatibilidade grafica" de Configuracoes: composicao pela CPU em vez da
 * GPU. Nasceu em 06/10/2026, quando a GPU virou o padrao do app.
 *
 * O contorno do B8/B18 (composicao pela CPU + repintura completa) foi o padrao
 * de 21/09 a 06/10. Em 30/09 ficou provado que os dois defeitos sao DE UMA
 * MAQUINA so: o instalador com GPU rodou limpo em dois outros PCs com
 * Windows. Pagar o contorno em todo computador -- arrasto e zoom mais pesados --
 * para consertar um so deixou de fazer sentido. Quem tiver o defeito liga esta opcao.
 *
 * TRES DECISOES QUE NAO SAO OBVIAS:
 *
 * 1. **Mora no `userData`, e nao na pasta de quadros.** O indice de pastas mora
 *    la porque e do conteudo e viaja com ele. Isto e da MAQUINA: levar a pasta
 *    de quadros para outro PC nao pode levar junto um contorno que so este
 *    precisa.
 *
 * 2. **Leitura SINCRONA, no topo do processo principal.** As chaves do Chromium
 *    so valem se entrarem antes de o app ficar pronto -- depois disso nao ha
 *    efeito. Por isso a opcao vale ao REABRIR, e nao na hora.
 *
 * 3. **Qualquer coisa que nao seja `true` e "desligada".** Arquivo ausente,
 *    corrompido, campo do tipo errado: cai na GPU, que e o padrao de todo mundo.
 *    Quem precisa da opcao a liga de novo em Configuracoes, e o defeito que ela
 *    contorna e visivel o bastante para nao passar despercebido.
 *
 * Nao importa nada do Electron: e exercitado por `npm run check:graficos`.
 */

export const ARQUIVO_GRAFICOS = 'graficos.json';

/** O modo que a opcao liga: o contorno inteiro do B8/B18. */
export const MODO_COMPAT = 'compat';
/** O padrao de todo mundo: composicao pela GPU, sem correcao nenhuma. */
export const MODO_PADRAO = 'normal';

export function lerCompatibilidade(pasta: string): boolean {
  try {
    const dados: unknown = JSON.parse(readFileSync(join(pasta, ARQUIVO_GRAFICOS), 'utf8'));
    return (
      typeof dados === 'object' &&
      dados !== null &&
      (dados as Record<string, unknown>)['compatibilidade'] === true
    );
  } catch {
    return false;
  }
}

/**
 * Grava num temporario e renomeia: um desligamento no meio da gravacao deixa o
 * arquivo antigo inteiro, e nao um JSON pela metade. (Pela decisao 3 um JSON
 * quebrado so desligaria a opcao -- mas desligaria calado.)
 */
export async function gravarCompatibilidade(pasta: string, ligada: boolean): Promise<void> {
  await fs.mkdir(pasta, { recursive: true });
  const destino = join(pasta, ARQUIVO_GRAFICOS);
  const temp = `${destino}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ compatibilidade: ligada }, null, 2), 'utf8');
  await fs.rename(temp, destino);
}

/**
 * Qual modo da escada `QB_GPU` vale nesta execucao.
 *
 * Ordem: `QB_GPU` (instrumento de diagnostico, manda em tudo), `QB_NOGPU=1`, a
 * opcao de Configuracoes, e por fim o padrao. Um `QB_GPU` com nome que nao existe
 * cai no que a CONFIGURACAO diria, e nao na GPU: um erro de digitacao na maquina
 * que precisa do contorno faria o defeito voltar calado.
 */
export function resolverModo(opts: {
  qbGpu: string | undefined;
  qbNoGpu: string | undefined;
  compatibilidade: boolean;
  existe: (modo: string) => boolean;
}): { modo: string; pedidoInvalido: string | null } {
  const daConfiguracao = opts.compatibilidade ? MODO_COMPAT : MODO_PADRAO;
  if (opts.qbGpu !== undefined) {
    return opts.existe(opts.qbGpu)
      ? { modo: opts.qbGpu, pedidoInvalido: null }
      : { modo: daConfiguracao, pedidoInvalido: opts.qbGpu };
  }
  if (opts.qbNoGpu === '1') return { modo: 'off', pedidoInvalido: null };
  return { modo: daConfiguracao, pedidoInvalido: null };
}
