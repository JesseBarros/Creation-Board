/**
 * Undo/redo por command pattern.
 *
 * Cada mutacao do documento vira um objeto que sabe se aplicar e se reverter.
 * A alternativa -- guardar snapshots do documento inteiro a cada acao -- e
 * simples de escrever e impossivel de sustentar: com 10 mil objetos, 200 passos
 * de historico seriam 2 milhoes de copias de objeto na memoria. Um comando
 * guarda so o delta, normalmente algumas dezenas de bytes.
 */

export interface Command {
  /** Rotulo curto, usado em log e futuramente num painel de historico. */
  readonly label: string;
  apply(): void;
  revert(): void;
  /**
   * Tenta absorver o comando seguinte, devolvendo true se conseguiu.
   * Serve para arrastes: mover um objeto gera dezenas de comandos por segundo,
   * e sem fusao cada pixel de movimento viraria um passo de undo.
   */
  merge?(next: Command): boolean;
}

const DEFAULT_LIMIT = 500;

/** Janela em que dois comandos do mesmo tipo ainda podem se fundir. */
const MERGE_WINDOW_MS = 700;

export class History {
  #undo: Command[] = [];
  #redo: Command[] = [];
  #lastPushAt = 0;
  #listeners = new Set<() => void>();
  /** Evita que um comando disparado de dentro de apply/revert entre no historico. */
  #applying = false;

  constructor(private readonly limit = DEFAULT_LIMIT) {}

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  get undoLabel(): string | null {
    return this.#undo.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.#redo.at(-1)?.label ?? null;
  }

  get depth(): number {
    return this.#undo.length;
  }

  /** Executa o comando e o registra. */
  push(cmd: Command): void {
    if (this.#applying) {
      cmd.apply();
      return;
    }

    this.#applying = true;
    try {
      cmd.apply();
    } finally {
      this.#applying = false;
    }

    const now = performance.now();
    const top = this.#undo.at(-1);
    if (top?.merge && now - this.#lastPushAt < MERGE_WINDOW_MS && top.merge(cmd)) {
      // Fundido no comando anterior: nao cresce o historico.
      this.#lastPushAt = now;
      this.#redo.length = 0;
      this.#emit();
      return;
    }

    this.#undo.push(cmd);
    // Qualquer acao nova invalida o caminho de redo.
    this.#redo.length = 0;
    if (this.#undo.length > this.limit) this.#undo.shift();
    this.#lastPushAt = now;
    this.#emit();
  }

  /**
   * Encerra a possibilidade de fusao. Chamado ao soltar o mouse: o proximo
   * arraste deve ser um passo de undo separado, mesmo que venha logo em seguida.
   */
  seal(): void {
    this.#lastPushAt = 0;
  }

  undo(): boolean {
    const cmd = this.#undo.pop();
    if (!cmd) return false;
    this.#applying = true;
    try {
      cmd.revert();
    } finally {
      this.#applying = false;
    }
    this.#redo.push(cmd);
    this.seal();
    this.#emit();
    return true;
  }

  redo(): boolean {
    const cmd = this.#redo.pop();
    if (!cmd) return false;
    this.#applying = true;
    try {
      cmd.apply();
    } finally {
      this.#applying = false;
    }
    this.#undo.push(cmd);
    this.seal();
    this.#emit();
    return true;
  }

  clear(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.seal();
    this.#emit();
  }

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit(): void {
    for (const fn of this.#listeners) fn();
  }
}
