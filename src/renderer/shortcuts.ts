import { t, type ChaveTexto } from '@shared/i18n';
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
  | 'export'
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
  | 'find'
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
  | 'toolEraser'
  | 'toolShape'
  | 'toolText'
  | 'toolNote'
  | 'editText'
  | 'thinner'
  | 'thicker'
  | 'rulers'
  | 'rulerUnit'
  | 'layers'
  | 'findLibrary'
  | 'debugLobby'
  | 'newBoard'
  | 'saveLobby';

export interface ShortcutDef {
  /** Ausente = entrada apenas informativa (gesto de mouse, sem tecla). */
  id?: ShortcutId;
  /** Chave de traducao do grupo -- ver `@shared/i18n`. */
  group: ChaveTexto;
  /** Notacao "Ctrl+Shift+K". Alternativas de TECLA separadas por "|". */
  keys: string;
  /**
   * Segunda combinacao completa, quando os modificadores tambem mudam.
   * `keys` sozinho nao da conta de "Ctrl+Shift+Z ou Ctrl+Y".
   */
  keysAlt?: string;
  /** Chave de traducao do que o atalho faz. */
  label: ChaveTexto;
  /**
   * Nos GESTOS de mouse (entradas sem `id`), o `keys` e texto para gente --
   * "Botao direito + arrastar" -- e nao combinacao de teclas. Este e o mesmo
   * texto, traduzido, e e ele que a ajuda mostra.
   */
  gesto?: ChaveTexto;
  /**
   * Contexto em que vale. 'board' nao dispara no lobby, e 'lobby' e o contrario
   * -- e e o que permite `Ctrl+F` significar "neste quadro" la dentro e "em
   * todos" aqui fora, sem que um cancele o outro.
   */
  scope?: 'board' | 'lobby' | 'global';
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
  // Ctrl+N vale nos dois lugares (06/10/2026: criar mais rapido).
  // Dentro de um quadro, passa pelo aviso de alteracoes nao salvas.
  { id: 'newBoard', group: 'atalhoGrupo.arquivo', keys: 'Ctrl+N', label: 'atalho.novoQuadro', scope: 'global' },
  { id: 'save', group: 'atalhoGrupo.arquivo', keys: 'Ctrl+S', label: 'atalho.salvar', scope: 'board' },
  // O Ctrl+S no menu nao fazia NADA, e quem aperta por habito ficava sem
  // resposta. Nao ha o que salvar ali: ele lembra do Ctrl+N.
  { id: 'saveLobby', group: 'atalhoGrupo.arquivo', keys: 'Ctrl+S', label: 'atalho.salvarNoMenu', scope: 'lobby' },
  { id: 'lobby', group: 'atalhoGrupo.arquivo', keys: 'Ctrl+O', label: 'atalho.voltarAoMenu', scope: 'board' },
  { id: 'export', group: 'atalhoGrupo.arquivo', keys: 'Ctrl+E', label: 'atalho.exportar', scope: 'board' },
  {
    group: 'atalhoGrupo.arquivo',
    keys: 'Automatico', gesto: 'gesto.automatico',
    label: 'atalho.autosave',
  },

  { group: 'atalhoGrupo.navegacao', keys: 'Botao direito + arrastar', gesto: 'gesto.botaoDireitoArrastar', label: 'atalho.mover' },
  { group: 'atalhoGrupo.navegacao', keys: 'Botao do meio', gesto: 'gesto.botaoDoMeio', label: 'atalho.mover' },
  { group: 'atalhoGrupo.navegacao', keys: 'Dois dedos', gesto: 'gesto.doisDedos', label: 'atalho.moverTrackpad' },
  { group: 'atalhoGrupo.navegacao', keys: 'Roda', gesto: 'gesto.roda', label: 'atalho.rolarVertical' },
  { group: 'atalhoGrupo.navegacao', keys: 'Shift + roda', gesto: 'gesto.shiftRoda', label: 'atalho.rolarHorizontal' },
  { group: 'atalhoGrupo.navegacao', keys: 'Ctrl + roda', gesto: 'gesto.ctrlRoda', label: 'atalho.zoomCursor' },
  { group: 'atalhoGrupo.navegacao', keys: 'Pinca', gesto: 'gesto.pinca', label: 'atalho.zoomTrackpad' },

  { id: 'zoom100', group: 'atalhoGrupo.zoom', keys: 'Ctrl+0', label: 'atalho.zoom100', scope: 'board' },
  { id: 'fit', group: 'atalhoGrupo.zoom', keys: 'Ctrl+1', label: 'atalho.ajustar', scope: 'board' },
  { id: 'zoomIn', group: 'atalhoGrupo.zoom', keys: 'Ctrl+=|+', label: 'atalho.zoomMais', scope: 'board' },
  { id: 'zoomOut', group: 'atalhoGrupo.zoom', keys: 'Ctrl+-', label: 'atalho.zoomMenos', scope: 'board' },

  { id: 'undo', group: 'atalhoGrupo.editar', keys: 'Ctrl+Z', label: 'atalho.desfazer', scope: 'board' },
  { id: 'redo', group: 'atalhoGrupo.editar', keys: 'Ctrl+Shift+Z', keysAlt: 'Ctrl+Y', label: 'atalho.refazer', scope: 'board' },
  { id: 'duplicate', group: 'atalhoGrupo.editar', keys: 'Ctrl+D', label: 'atalho.duplicar', scope: 'board' },
  { id: 'copy', group: 'atalhoGrupo.editar', keys: 'Ctrl+C', label: 'atalho.copiar', scope: 'board' },
  { id: 'cut', group: 'atalhoGrupo.editar', keys: 'Ctrl+X', label: 'atalho.recortar', scope: 'board' },
  { id: 'paste', group: 'atalhoGrupo.editar', keys: 'Ctrl+V', label: 'atalho.colar', scope: 'board' },
  {
    id: 'deleteSelection',
    group: 'atalhoGrupo.editar',
    keys: 'Delete|Backspace',
    label: 'atalho.excluir',
    scope: 'board',
  },

  { id: 'toolSelect', group: 'atalhoGrupo.ferramentas', keys: 'V', label: 'atalho.ferramentaSelecionar', scope: 'board' },
  { id: 'toolPen', group: 'atalhoGrupo.ferramentas', keys: 'P', label: 'atalho.ferramentaCaneta', scope: 'board' },
  { id: 'toolHighlighter', group: 'atalhoGrupo.ferramentas', keys: 'M', label: 'atalho.ferramentaMarcaTexto', scope: 'board' },
  { id: 'find', group: 'atalhoGrupo.buscar', keys: 'Ctrl+F', label: 'atalho.buscar', scope: 'board' },
  // O MESMO Ctrl+F no menu principal busca em todos os quadros. Duas entradas
  // com a mesma tecla e escopos diferentes, e nao um atalho novo: a pergunta e a
  // mesma ("onde esta isto"), o que muda e o alcance de onde voce esta.
  {
    id: 'findLibrary',
    group: 'atalhoGrupo.buscar',
    keys: 'Ctrl+F',
    label: 'atalho.buscarTodos',
    scope: 'lobby',
  },
  { group: 'atalhoGrupo.buscar', keys: 'Enter', label: 'atalho.buscarProximo' },
  { group: 'atalhoGrupo.buscar', keys: 'Shift+Enter', label: 'atalho.buscarAnterior' },
  { group: 'atalhoGrupo.buscar', keys: 'Escape', label: 'atalho.buscarFechar' },

  { id: 'toolText', group: 'atalhoGrupo.ferramentas', keys: 'T', label: 'atalho.ferramentaTexto', scope: 'board' },
  { id: 'toolNote', group: 'atalhoGrupo.ferramentas', keys: 'N', label: 'atalho.ferramentaPostit', scope: 'board' },
  { id: 'toolShape', group: 'atalhoGrupo.ferramentas', keys: 'F', label: 'atalho.ferramentaFormas', scope: 'board' },
  { id: 'toolEraser', group: 'atalhoGrupo.ferramentas', keys: 'E', label: 'atalho.ferramentaBorracha', scope: 'board' },
  { group: 'atalhoGrupo.ferramentas', keys: 'Arrastar', gesto: 'gesto.arrastar', label: 'atalho.borrachaModo' },
  { id: 'thinner', group: 'atalhoGrupo.ferramentas', keys: '[', label: 'atalho.maisFino', scope: 'board' },
  { id: 'thicker', group: 'atalhoGrupo.ferramentas', keys: ']', label: 'atalho.maisGrosso', scope: 'board' },
  { group: 'atalhoGrupo.ferramentas', keys: 'Arrastar', gesto: 'gesto.arrastar', label: 'atalho.formasModificadores' },
  { group: 'atalhoGrupo.ferramentas', keys: 'Botao direito + arrastar', gesto: 'gesto.botaoDireitoArrastar', label: 'atalho.moverSemCortar' },

  {
    id: 'editText',
    group: 'atalhoGrupo.texto',
    keys: 'F2|Enter',
    label: 'atalho.editarTexto',
    scope: 'board',
  },
  { group: 'atalhoGrupo.texto', keys: 'Duplo clique', gesto: 'gesto.duploClique', label: 'atalho.editarSobCursor' },
  { group: 'atalhoGrupo.texto', keys: 'Ctrl+B / Ctrl+I / Ctrl+U', label: 'atalho.formatacao' },
  { group: 'atalhoGrupo.texto', keys: 'Escape', label: 'atalho.sairDaCaixa' },

  { group: 'atalhoGrupo.encaixe', keys: 'Arrastar', gesto: 'gesto.arrastar', label: 'atalho.guias' },
  { group: 'atalhoGrupo.encaixe', keys: 'Ctrl + arrastar', gesto: 'gesto.ctrlArrastar', label: 'atalho.semEncaixe' },

  { group: 'atalhoGrupo.selecao', keys: 'Clique', gesto: 'gesto.clique', label: 'atalho.selecionarObjeto' },
  { group: 'atalhoGrupo.selecao', keys: 'Shift + clique', gesto: 'gesto.shiftClique', label: 'atalho.somarSelecao' },
  { group: 'atalhoGrupo.selecao', keys: 'Arrastar no vazio', gesto: 'gesto.arrastarNoVazio', label: 'atalho.laco' },
  { id: 'selectAll', group: 'atalhoGrupo.selecao', keys: 'Ctrl+A', label: 'atalho.selecionarTudo', scope: 'board' },
  { id: 'deselect', group: 'atalhoGrupo.selecao', keys: 'Escape', label: 'atalho.cancelar', scope: 'board' },

  { group: 'atalhoGrupo.manipular', keys: 'Arrastar a selecao', gesto: 'gesto.arrastarSelecao', label: 'atalho.moverSelecao' },
  { group: 'atalhoGrupo.manipular', keys: 'Arrastar uma alca', gesto: 'gesto.arrastarAlca', label: 'atalho.redimensionar' },
  { group: 'atalhoGrupo.manipular', keys: 'Arrastar a alca de cima', gesto: 'gesto.arrastarAlcaDeCima', label: 'atalho.girar' },
  {
    id: 'nudge',
    group: 'atalhoGrupo.manipular',
    keys: 'ArrowLeft|ArrowRight|ArrowUp|ArrowDown',
    display: '← ↑ ↓ →',
    label: 'atalho.empurrar',
    scope: 'board',
    shiftOptional: true,
  },
  {
    id: 'bringToFront',
    group: 'atalhoGrupo.manipular',
    keys: 'Ctrl+Shift+]',
    label: 'atalho.trazerParaFrente',
    scope: 'board',
  },
  {
    id: 'sendToBack',
    group: 'atalhoGrupo.manipular',
    keys: 'Ctrl+Shift+[',
    label: 'atalho.enviarParaTras',
    scope: 'board',
  },

  { id: 'grid', group: 'atalhoGrupo.visualizacao', keys: 'G', label: 'atalho.grade', scope: 'board' },
  { id: 'rulers', group: 'atalhoGrupo.visualizacao', keys: 'R', label: 'atalho.reguas', scope: 'board' },
  { id: 'rulerUnit', group: 'atalhoGrupo.visualizacao', keys: 'U', label: 'atalho.unidadeReguas', scope: 'board' },
  { id: 'layers', group: 'atalhoGrupo.visualizacao', keys: 'C', label: 'atalho.camadas', scope: 'board' },
  { id: 'help', group: 'atalhoGrupo.visualizacao', keys: 'F1|?', label: 'atalho.ajuda' },
  { id: 'debug', group: 'atalhoGrupo.visualizacao', keys: 'F3', label: 'atalho.debug', scope: 'board' },
  // O MESMO F3 no menu principal abre o painel DELE, que mede outra coisa: o
  // custo de compor a tela, e nao o de desenhar o canvas. Ver `PainelDoMenu.ts`.
  {
    id: 'debugLobby',
    group: 'atalhoGrupo.visualizacao',
    keys: 'F3',
    label: 'atalho.debugMenu',
    scope: 'lobby',
  },
  { id: 'benchmark', group: 'atalhoGrupo.visualizacao', keys: 'B', label: 'atalho.benchmark', scope: 'board' },
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
    if (s.scope === 'lobby' && scope !== 'lobby') continue;
    if (matches(e, s.keys, s.shiftOptional)) return s.id;
    if (s.keysAlt && matches(e, s.keysAlt, s.shiftOptional)) return s.id;
  }
  return null;
}

/** Como a combinacao aparece na tela de ajuda. */
export function displayKeys(s: ShortcutDef): string[] {
  if (s.gesto) return [t(s.gesto)];
  if (s.display) return [s.display];
  // "Ctrl+=|+" mostra so a primeira alternativa de tecla; as demais existem
  // para o matcher aceitar variacoes de layout de teclado.
  const primary = s.keys.split('|')[0]!;
  return s.keysAlt ? [primary, s.keysAlt] : [primary];
}

/** Agrupa para exibicao na tela de ajuda, preservando a ordem de declaracao. */
/** Os grupos JA TRADUZIDOS, na ordem em que aparecem na lista. */
export function groupedShortcuts(): Array<[string, ShortcutDef[]]> {
  const groups = new Map<ChaveTexto, ShortcutDef[]>();
  for (const s of SHORTCUTS) {
    const list = groups.get(s.group);
    if (list) list.push(s);
    else groups.set(s.group, [s]);
  }
  return [...groups.entries()].map(([grupo, itens]) => [t(grupo), itens]);
}
