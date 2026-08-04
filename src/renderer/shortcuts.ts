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
  | 'zoomOut'
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'duplicate'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'deleteSelection'
  | 'deselect'
  | 'bringToFront'
  | 'sendToBack'
  | 'nudge'
  | 'toolSelect'
  | 'toolPen'
  | 'toolHighlighter'
  | 'toolPencil'
  | 'toolEraser'
  | 'toolShape'
  | 'toolText'
  | 'toolNote'
  | 'editText'
  | 'thinner'
  | 'thicker'
  | 'snapToGrid'
  | 'rulers'
  | 'rulerUnit';

export interface ShortcutDef {
  /** Ausente = entrada apenas informativa (gesto de mouse, sem tecla). */
  id?: ShortcutId;
  group: string;
  /** Notacao "Ctrl+Shift+K". Alternativas de TECLA separadas por "|". */
  keys: string;
  /**
   * Segunda combinacao completa, quando os modificadores tambem mudam.
   * `keys` sozinho nao da conta de "Ctrl+Shift+Z ou Ctrl+Y".
   */
  keysAlt?: string;
  label: string;
  /** Contexto em que vale. 'board' nao dispara no lobby. */
  scope?: 'board' | 'global';
  /**
   * Aceita a combinacao com ou sem Shift. Serve para atalhos em que o Shift e
   * um modificador de intensidade (setas movem 1px, Shift+setas movem 10px) e
   * nao uma combinacao diferente.
   */
  shiftOptional?: boolean;
  /** Texto a mostrar na ajuda quando `keys` nao e legivel para gente. */
  display?: string;
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

  { id: 'undo', group: 'Editar', keys: 'Ctrl+Z', label: 'Desfazer', scope: 'board' },
  { id: 'redo', group: 'Editar', keys: 'Ctrl+Shift+Z', keysAlt: 'Ctrl+Y', label: 'Refazer', scope: 'board' },
  { id: 'duplicate', group: 'Editar', keys: 'Ctrl+D', label: 'Duplicar a selecao', scope: 'board' },
  { id: 'copy', group: 'Editar', keys: 'Ctrl+C', label: 'Copiar', scope: 'board' },
  { id: 'cut', group: 'Editar', keys: 'Ctrl+X', label: 'Recortar', scope: 'board' },
  { id: 'paste', group: 'Editar', keys: 'Ctrl+V', label: 'Colar na posicao do cursor', scope: 'board' },
  {
    id: 'deleteSelection',
    group: 'Editar',
    keys: 'Delete|Backspace',
    label: 'Excluir a selecao',
    scope: 'board',
  },

  { id: 'toolSelect', group: 'Ferramentas', keys: 'V', label: 'Selecionar', scope: 'board' },
  { id: 'toolPen', group: 'Ferramentas', keys: 'P', label: 'Caneta', scope: 'board' },
  { id: 'toolHighlighter', group: 'Ferramentas', keys: 'M', label: 'Marca-texto (entra por baixo do conteudo)', scope: 'board' },
  { id: 'toolPencil', group: 'Ferramentas', keys: 'L', label: 'Lapis (a espessura acompanha a pressao)', scope: 'board' },
  { id: 'toolText', group: 'Ferramentas', keys: 'T', label: 'Texto (clique cria; arrastar define a largura)', scope: 'board' },
  { id: 'toolNote', group: 'Ferramentas', keys: 'N', label: 'Post-it (papel e alerta se escolhem na barra)', scope: 'board' },
  { id: 'toolShape', group: 'Ferramentas', keys: 'F', label: 'Formas (o tipo se escolhe na barra)', scope: 'board' },
  { id: 'toolEraser', group: 'Ferramentas', keys: 'E', label: 'Borracha (apaga o traco inteiro)', scope: 'board' },
  { id: 'thinner', group: 'Ferramentas', keys: '[', label: 'Traco mais fino (no texto, fonte menor)', scope: 'board' },
  { id: 'thicker', group: 'Ferramentas', keys: ']', label: 'Traco mais grosso (no texto, fonte maior)', scope: 'board' },
  { group: 'Ferramentas', keys: 'Arrastar', label: 'Formas: Shift trava quadrado/circulo/angulo, Alt cresce do centro' },
  { group: 'Ferramentas', keys: 'Botao direito + arrastar', label: 'Mover o quadro sem cortar o traco' },

  {
    id: 'editText',
    group: 'Texto',
    keys: 'F2|Enter',
    label: 'Editar a caixa de texto ou o post-it selecionado',
    scope: 'board',
  },
  { group: 'Texto', keys: 'Duplo clique', label: 'Editar a caixa sob o cursor, sem trocar de ferramenta' },
  { group: 'Texto', keys: 'Ctrl+B / Ctrl+I / Ctrl+U', label: 'Negrito, italico e sublinhado (dentro da caixa)' },
  { group: 'Texto', keys: 'Escape', label: 'Sair da caixa mantendo o texto (Ctrl+Z desfaz a edicao inteira)' },

  { group: 'Encaixe', keys: 'Arrastar', label: 'Guias aparecem ao alinhar com as bordas e o centro dos vizinhos' },
  { group: 'Encaixe', keys: 'Ctrl + arrastar', label: 'Ignorar o encaixe neste gesto' },
  { id: 'snapToGrid', group: 'Encaixe', keys: 'A', label: 'Grade magnetica: encaixar tambem na grade', scope: 'board' },

  { group: 'Selecao', keys: 'Clique', label: 'Selecionar o objeto sob o cursor' },
  { group: 'Selecao', keys: 'Shift + clique', label: 'Somar ou tirar da selecao' },
  { group: 'Selecao', keys: 'Arrastar no vazio', label: 'Laco: selecionar por area' },
  { id: 'selectAll', group: 'Selecao', keys: 'Ctrl+A', label: 'Selecionar tudo', scope: 'board' },
  { id: 'deselect', group: 'Selecao', keys: 'Escape', label: 'Cancelar o gesto ou limpar a selecao', scope: 'board' },

  { group: 'Manipular', keys: 'Arrastar a selecao', label: 'Mover (Shift trava num eixo)' },
  { group: 'Manipular', keys: 'Arrastar uma alca', label: 'Redimensionar (Shift mantem a proporcao, Alt ancora no centro)' },
  { group: 'Manipular', keys: 'Arrastar a alca de cima', label: 'Girar (Shift trava de 15 em 15 graus)' },
  {
    id: 'nudge',
    group: 'Manipular',
    keys: 'ArrowLeft|ArrowRight|ArrowUp|ArrowDown',
    display: '← ↑ ↓ →',
    label: 'Mover a selecao 1 px (Shift: 10 px)',
    scope: 'board',
    shiftOptional: true,
  },
  {
    id: 'bringToFront',
    group: 'Manipular',
    keys: 'Ctrl+Shift+]',
    label: 'Trazer para frente',
    scope: 'board',
  },
  {
    id: 'sendToBack',
    group: 'Manipular',
    keys: 'Ctrl+Shift+[',
    label: 'Enviar para tras',
    scope: 'board',
  },

  { id: 'grid', group: 'Visualizacao', keys: 'G', label: 'Ligar/desligar a grade de fundo', scope: 'board' },
  { id: 'rulers', group: 'Visualizacao', keys: 'R', label: 'Reguas nas bordas', scope: 'board' },
  { id: 'rulerUnit', group: 'Visualizacao', keys: 'U', label: 'Unidade das reguas: px ou cm', scope: 'board' },
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

/** Prefixo modificador no inicio do que sobrou da especificacao. */
const MODIFIER = /^(ctrl|shift|alt)\s*\+\s*/i;

/**
 * Separa os modificadores da tecla.
 *
 * Os modificadores sao consumidos como PREFIXO, um a um, e tudo que sobra e a
 * tecla. Partir a string inteira em "+" -- que era como isto funcionava --
 * destroi justamente os atalhos cuja tecla e o proprio "+": `"Ctrl+=|+"` virava
 * `["Ctrl", "=|", ""]`, a lista de teclas terminava como `[""]` e o Ctrl+= de
 * aumentar zoom nunca casava com tecla nenhuma.
 */
function parse(spec: string): ParsedKeys | null {
  const cached = parseCache.get(spec);
  if (cached !== undefined) return cached;

  const result: ParsedKeys = { ctrl: false, shift: false, alt: false, keys: [] };
  let rest = spec.trim();

  for (;;) {
    const m = MODIFIER.exec(rest);
    if (!m) break;
    const mod = m[1]!.toLowerCase();
    if (mod === 'ctrl') result.ctrl = true;
    else if (mod === 'shift') result.shift = true;
    else result.alt = true;
    rest = rest.slice(m[0].length);
  }

  result.keys = rest
    .split('|')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  // Entradas de mouse ("Arrastar no vazio") nao viram atalho de teclado.
  const parsed = result.keys.length > 0 && !result.keys.some((k) => k.includes(' ')) ? result : null;
  parseCache.set(spec, parsed);
  return parsed;
}

/** Testa se um evento de teclado corresponde a uma combinacao declarada. */
export function matches(e: KeyboardEvent, spec: string, shiftOptional = false): boolean {
  const p = parse(spec);
  if (!p) return false;
  if (p.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (p.alt !== e.altKey) return false;
  // Shift nao e comparado quando a tecla ja exige shift para ser digitada
  // (ex.: "?" e "+"), senao o atalho nunca casaria num teclado ABNT. Nem quando
  // o proprio atalho usa Shift como intensidade (setas).
  const shiftMatters = !shiftOptional && !p.keys.some((k) => k === '?' || k === '+');
  if (shiftMatters && p.shift !== e.shiftKey) return false;
  return p.keys.includes(e.key.toLowerCase());
}

/** Resolve qual acao uma tecla dispara no contexto atual. */
export function resolve(e: KeyboardEvent, scope: 'board' | 'lobby'): ShortcutId | null {
  for (const s of SHORTCUTS) {
    if (!s.id) continue;
    if (s.scope === 'board' && scope !== 'board') continue;
    if (matches(e, s.keys, s.shiftOptional)) return s.id;
    if (s.keysAlt && matches(e, s.keysAlt, s.shiftOptional)) return s.id;
  }
  return null;
}

/** Como a combinacao aparece na tela de ajuda. */
export function displayKeys(s: ShortcutDef): string[] {
  if (s.display) return [s.display];
  // "Ctrl+=|+" mostra so a primeira alternativa de tecla; as demais existem
  // para o matcher aceitar variacoes de layout de teclado.
  const primary = s.keys.split('|')[0]!;
  return s.keysAlt ? [primary, s.keysAlt] : [primary];
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
