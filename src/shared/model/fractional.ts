/**
 * Fractional indexing para a ordem de camadas (`z`).
 *
 * A ideia: a camada e uma string comparada lexicograficamente. Para inserir algo
 * entre dois objetos basta gerar uma string entre as duas chaves -- nenhum outro
 * objeto precisa ser renumerado. "Trazer para frente" com 10 mil objetos custa
 * O(1) em vez de reescrever a lista inteira.
 *
 * Alfabeto base-62 em ordem ASCII crescente ('0'<'9'<'A'<'Z'<'a'<'z'), para que
 * a comparacao de string coincida com a comparacao numerica.
 */
const BASE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Gera uma chave estritamente entre `a` e `b`.
 * `a` vazio significa "antes de tudo"; `b` null significa "depois de tudo".
 *
 * Invariante: nenhuma chave pode terminar em '0'. Se terminasse, nao seria
 * possivel gerar outra chave abaixo dela sem crescer indefinidamente.
 */
export function keyBetween(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`keyBetween: ordem invalida (${a} >= ${b})`);
  }
  if (a.endsWith('0') || (b !== null && b.endsWith('0'))) {
    throw new Error('keyBetween: chave invalida terminando em "0"');
  }

  if (b !== null) {
    // Consome o prefixo comum e resolve o problema no primeiro digito que difere.
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + keyBetween(a.slice(n), b.slice(n));
  }

  const digitA = a.length > 0 ? BASE.indexOf(a[0]!) : 0;
  const digitB = b !== null ? BASE.indexOf(b[0]!) : BASE.length;

  // Ha espaco entre os digitos: pega o do meio e termina.
  if (digitB - digitA > 1) {
    return BASE[Math.round(0.5 * (digitA + digitB))]!;
  }

  // Digitos consecutivos. Se `b` tem mais digitos, o prefixo dele ja serve.
  if (b !== null && b.length > 1) return b.slice(0, 1);

  // Caso restante: desce um nivel mantendo o digito de `a`.
  return BASE[digitA]! + keyBetween(a.slice(1), null);
}

/** Sequencia de `count` chaves crescentes, para popular um documento do zero. */
export function keySequence(count: number): string[] {
  const out: string[] = [];
  let prev = '';
  for (let i = 0; i < count; i++) {
    prev = keyBetween(prev, null);
    out.push(prev);
  }
  return out;
}
