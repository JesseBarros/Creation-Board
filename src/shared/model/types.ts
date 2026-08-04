import type { Rect } from '../geometry/rect';

/**
 * Modelo de dados dos objetos do quadro.
 *
 * Convencao central: a geometria de cada objeto e guardada em ESPACO LOCAL, e o
 * `transform` mapeia local -> mundo. Assim mover, escalar e rotacionar sao
 * operacoes O(1) que nao tocam nos pontos do traco.
 */

export type ObjectId = string;

export type ObjectType = 'stroke' | 'path' | 'shape' | 'text' | 'note' | 'image' | 'group';

export interface Transform {
  x: number;
  y: number;
  /** Radianos, sentido horario. */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface BaseObject {
  id: ObjectId;
  type: ObjectType;
  /** Rotulo opcional; entra no indice de busca do Ctrl+F. */
  name?: string;
  /** Grupo pai, ou null se estiver na raiz. */
  parentId: ObjectId | null;
  /**
   * Fractional index (ex.: "a0", "a0V", "a1"). Ordenar por string ordena por
   * camada, e inserir entre dois vizinhos nao renumera o resto -> "trazer para
   * frente" custa O(1) mesmo com 10 mil objetos.
   */
  z: string;
  transform: Transform;
  /**
   * AABB em coordenadas de mundo. Derivado da geometria + transform, mantido em
   * cache porque o indice espacial le isso a cada frame.
   */
  bbox: Rect;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /** Incrementa a cada mutacao; invalida o bitmap cache do objeto. */
  rev: number;
  createdAt: number;
  updatedAt: number;
}

/** Trecho de texto com formatacao propria, dentro de um TextObject ou NoteObject. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

/**
 * Rastro de borracha sobre um objeto de tinta, em espaco LOCAL do objeto.
 *
 * O apagamento progressivo e guardado como MASCARA, e nao recortando a
 * geometria. Os dois motivos:
 *
 * 1. A caligrafia importada e `PathObject` -- contorno preenchido, nao
 *    polilinha. Recortar um pedaco dela exigiria subtracao booleana de
 *    contornos, que nao existe no projeto e erra feio em caso degenerado.
 * 2. Um mecanismo so serve aos dois tipos de tinta, e desfazer vira remover uma
 *    marca da lista em vez de recolar dois cacos de traco.
 *
 * O preco esta no desenho: objeto com marca passa por um canvas intermediario
 * (ver render/painters/erase.ts). So os objetos apagados pagam isso.
 */
export interface EraseMark {
  /** Pontos achatados [x, y, ...] em espaco local. */
  points: number[];
  /** Espessura do rastro, em unidades locais. */
  width: number;
}

export type StrokeVariant = 'pen' | 'highlighter' | 'pencil';

export interface StrokeObject extends BaseObject {
  type: 'stroke';
  variant: StrokeVariant;
  /**
   * Pontos achatados em triplas [x, y, pressure, ...] em espaco local.
   * Achatado (e nao array de objetos) para caber em Float32Array em memoria e
   * serializar compacto no JSON.
   */
  points: number[];
  /** Versao simplificada por RDP, usada como LOD quando o zoom esta afastado. */
  lod?: number[];
  color: string;
  width: number;
  /** Rastros da borracha progressiva. Ausente = traco intacto. */
  erased?: EraseMark[];
}

/**
 * Contorno preenchido, definido por um caminho SVG.
 *
 * Existe para tinta importada. O Microsoft Whiteboard nao exporta o traco como
 * linha de centro + espessura: exporta o CONTORNO ja fechado, com a variacao de
 * pressao da caneta embutida na propria forma. Converter isso para um
 * StrokeObject de espessura constante achataria a caligrafia -- justamente o que
 * torna um resumo manuscrito legivel.
 *
 * Diferente de StrokeObject tambem no uso: nao e produzido pela caneta do app,
 * so por importacao. Por isso nao tem pressao nem variante.
 */
export interface PathObject extends BaseObject {
  type: 'path';
  /** Caminho SVG em coordenadas locais, consumido direto por Path2D. */
  d: string;
  fill: string;
  fillRule?: 'nonzero' | 'evenodd';
  /** Rastros da borracha progressiva. Ausente = tinta intacta. */
  erased?: EraseMark[];
}

export type ShapeKind =
  | 'rect'
  | 'square'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'line'
  | 'arrow';

export interface ShapeObject extends BaseObject {
  type: 'shape';
  kind: ShapeKind;
  /** Dimensoes em espaco local; o redimensionamento mexe aqui, nao no scale. */
  w: number;
  h: number;
  stroke: string | null;
  strokeWidth: number;
  /** null = sem preenchimento. */
  fill: string | null;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextObject extends BaseObject {
  type: 'text';
  w: number;
  h: number;
  /** Se true, a altura acompanha o conteudo em vez de ser fixa. */
  autoHeight: boolean;
  content: RichSpan[];
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  align: TextAlign;
  color: string;
  list: 'none' | 'bullet';
}

export type AlertLevel = 'importante' | 'duvida' | 'revisar';

export interface NoteObject extends BaseObject {
  type: 'note';
  w: number;
  h: number;
  bg: string;
  content: RichSpan[];
  /** null = post-it comum; preenchido = alerta destacado. */
  alert: { level: AlertLevel; icon: string } | null;
  /** Fixado: continua visivel num canto da tela mesmo fora do viewport. */
  pinned: boolean;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  w: number;
  h: number;
  /** Chave do binario em assets/ dentro do container .wbd. */
  assetId: string;
  /** Recorte normalizado 0..1 sobre a imagem original. */
  crop?: Rect;
  naturalW: number;
  naturalH: number;
}

export interface GroupObject extends BaseObject {
  type: 'group';
  children: ObjectId[];
}

/** Tinta: os dois tipos que a borracha alcanca. */
export type InkObject = StrokeObject | PathObject;

export function isInk(obj: BoardObject): obj is InkObject {
  return obj.type === 'stroke' || obj.type === 'path';
}

export type BoardObject =
  | StrokeObject
  | PathObject
  | ShapeObject
  | TextObject
  | NoteObject
  | ImageObject
  | GroupObject;

/** Estreitamento por tipo, usado pelos painters e pelo indice de busca. */
export function isType<T extends BoardObject['type']>(
  obj: BoardObject,
  type: T,
): obj is Extract<BoardObject, { type: T }> {
  return obj.type === type;
}
