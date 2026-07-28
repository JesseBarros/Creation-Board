/**
 * Registro unico de atalhos.
 *
 * A mesma lista alimenta a tela de ajuda E o despacho de teclas. Sem isso, a
 * tela de atalhos vira documentacao que envelhece: alguem muda uma tecla no
 * codigo e esquece de atualizar o texto. Aqui, se o atalho existe, ele aparece
 * na ajuda; se aparece na ajuda, ele funciona.
 */

export type ShortcutId =
  | 'save'
  | 'lobby'
  | 'help'
  | 'debug'
  | 'benchmark'
  | 'grid'
  | 'zoom100'
  | 'fit'
  | 'zoomIn'
  | 'zoomOut';

export interface ShortcutDef {
  /** Ausente = entrada apenas informativa (gesto de mouse, sem tecla). */
  id?: ShortcutId;
  group: string;
  /** Notacao "Ctrl+Shift+K". Alternativas de tecla separadas por "|". */
  keys: string;
  label: string;
  /** Contexto em que vale. 'board' nao dispara no lobby. */
  scope?: 'board' | 'global';
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'save', group: 'Arquivo', keys: 'Ctrl+S', label: 'Salvar quadro', scope: 'board' },
  { id: 'lobby', group: 'Arquivo', keys: 'Ctrl+O', label: 'Voltar ao lobby (meus quadros)', scope: 'board' },

  { group: 'Navegacao', keys: 'Botao direito + arrastar', label: 'Mover o quadro (pan)' },
  { group: 'Navegacao', keys: 'Botao do meio', label: 'Mover o quadro (pan)' },
  { group: 'Navegacao', keys: 'Dois dedos', label: 'Mover o quadro no trackpad' },
  { group: 'Navegacao', keys: 'Roda', label: 'Rolar na vertical' },
  { group: 'Navegacao', keys: 'Shift + roda', label: 'Rolar na horizontal' },
  { group: 'Navegacao', keys: 'Ctrl + roda', label: 'Zoom centrado no cursor' },
  { group: 'Navegacao', keys: 'Pinca', label: 'Zoom no trackpad' },

  { id: 'zoom100', group: 'Zoom', keys: 'Ctrl+0', label: 'Zoom em 100%', scope: 'board' },
  { id: 'fit', group: 'Zoom', keys: 'Ctrl+1', label: 'Ajustar todo o conteudo a tela', scope: 'board' },
  { id: 'zoomIn', group: 'Zoom', keys: 'Ctrl+=|+', label: 'Aumentar o zoom', scope: 'board' },
  { id: 'zoomOut', group: 'Zoom', keys: 'Ctrl+-', label: 'Diminuir o zoom', scope: 'board' },

  { id: 'grid', group: 'Visualizacao', keys: 'G', label: 'Ligar/desligar a grade de fundo', scope: 'board' },
  { id: 'help', group: 'Visualizacao', keys: 'F1|?', label: 'Mostrar esta lista de atalhos' },
  { id: 'debug', group: 'Visualizacao', keys: 'F3', label: 'Painel de debug e carga de teste', scope: 'board' },
  { id: 'benchmark', group: 'Visualizacao', keys: 'B', label: 'Medir fps sustentado', scope: 'board' },
];

interface ParsedKeys {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: string[];
}

const parseCache = new Map<string, ParsedKeys | null>();

function parse(spec: string): ParsedKeys | null {
  const cached = parseCache.get(spec);
  if (cached !== undefined) return cached;

  const parts = spec.split('+').map((p) => p.trim());
  const result: ParsedKeys = { ctrl: false, shift: false, alt: false, keys: [] };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl') result.ctrl = true;
    else if (lower === 'shift') result.shift = true;
    else if (lower === 'alt') result.alt = true;
    else result.keys = part.split('|').map((k) => k.toLowerCase());
  }

  // Entradas de mouse ("Espaco + arrastar") nao viram atalho de teclado.
  const parsed = result.keys.length > 0 && !result.keys.some((k) => k.includes(' ')) ? result : null;
  parseCache.set(spec, parsed);
  return parsed;
}

/** Testa se um evento de teclado corresponde a um atalho declarado. */
export function matches(e: KeyboardEvent, spec: string): boolean {
  const p = parse(spec);
  if (!p) return false;
  if (p.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (p.alt !== e.altKey) return false;
  // Shift nao e comparado quando a tecla ja exige shift para ser digitada
  // (ex.: "?" e "+"), senao o atalho nunca casaria num teclado ABNT.
  const shiftMatters = !p.keys.some((k) => k === '?' || k === '+');
  if (shiftMatters && p.shift !== e.shiftKey) return false;
  return p.keys.includes(e.key.toLowerCase());
}

/** Resolve qual acao uma tecla dispara no contexto atual. */
export function resolve(e: KeyboardEvent, scope: 'board' | 'lobby'): ShortcutId | null {
  for (const s of SHORTCUTS) {
    if (!s.id) continue;
    if (s.scope === 'board' && scope !== 'board') continue;
    if (matches(e, s.keys)) return s.id;
  }
  return null;
}

/** Agrupa para exibicao na tela de ajuda, preservando a ordem de declaracao. */
export function groupedShortcuts(): Array<[string, ShortcutDef[]]> {
  const groups = new Map<string, ShortcutDef[]>();
  for (const s of SHORTCUTS) {
    const list = groups.get(s.group);
    if (list) list.push(s);
    else groups.set(s.group, [s]);
  }
  return [...groups.entries()];
}
