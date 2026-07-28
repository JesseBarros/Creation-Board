const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Pool de bytes aleatorios. Pedir 12 bytes por id ao crypto 50 mil vezes seguidas
// e mensuravelmente lento; um pool amortiza isso em poucas chamadas.
const POOL_SIZE = 4096;
let pool = new Uint8Array(POOL_SIZE);
let poolOffset = POOL_SIZE;

function nextBytes(n: number): Uint8Array {
  if (poolOffset + n > pool.length) {
    crypto.getRandomValues(pool);
    poolOffset = 0;
  }
  const out = pool.subarray(poolOffset, poolOffset + n);
  poolOffset += n;
  return out;
}

/** Id curto e opaco para objetos do quadro. 12 chars base-62. */
export function createId(size = 12): string {
  const bytes = nextBytes(size);
  let out = '';
  for (let i = 0; i < size; i++) {
    // 62 nao divide 256, entao ha um vies minusculo entre os simbolos.
    // Irrelevante aqui: ids sao identificadores locais, nao material criptografico.
    out += ALPHABET[bytes[i]! % 62];
  }
  return out;
}

/** Reinicia o pool. Existe para testes determinísticos. */
export function resetIdPool(): void {
  pool = new Uint8Array(POOL_SIZE);
  poolOffset = POOL_SIZE;
}
