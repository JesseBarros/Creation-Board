import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * A pasta dos quadros escolhida em Configuracoes (06/10/2026).
 *
 * Mora no `userData`, como a compatibilidade grafica: e escolha DESTA maquina.
 * A pasta de quadros pode ir para outro computador, e la o caminho daqui nao
 * existe. Sem arquivo, vale o padrao (`C:\Creation Board`).
 *
 * Nao importa nada do Electron.
 */

export const ARQUIVO_PASTA = 'pasta-dos-quadros.json';

/** O caminho gravado, ou null. Qualquer coisa estranha vale como "nao escolheu". */
export function lerPastaEscolhida(userData: string): string | null {
  try {
    const dados: unknown = JSON.parse(readFileSync(join(userData, ARQUIVO_PASTA), 'utf8'));
    const caminho = typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>)['caminho'] : null;
    return typeof caminho === 'string' && caminho.length > 0 && isAbsolute(caminho) ? caminho : null;
  } catch {
    return null;
  }
}

/** Grava num temporario e renomeia, como o `graficos.json`. */
export async function gravarPastaEscolhida(userData: string, caminho: string): Promise<void> {
  await fs.mkdir(userData, { recursive: true });
  const destino = join(userData, ARQUIVO_PASTA);
  await fs.writeFile(`${destino}.tmp`, JSON.stringify({ caminho }, null, 2), 'utf8');
  await fs.rename(`${destino}.tmp`, destino);
}
