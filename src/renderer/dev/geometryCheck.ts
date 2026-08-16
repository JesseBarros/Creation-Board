import { importBoardHtml } from '../features/import/boardHtml';
import { AssetStore } from '../features/images/AssetStore';
import type { Rect } from '@shared/geometry/rect';
import { measureLayout, type MeasuredRect } from './layoutOracle';

/**
 * Confere a geometria do importador contra o oraculo de layout.
 *
 * O importador calcula a posicao de cada objeto a partir do estilo inline; o
 * oraculo pergunta ao motor de CSS onde o elemento realmente ficou. Se os dois
 * concordam, a importacao esta posicionando certo -- e isso vira um numero, nao
 * uma impressao visual.
 *
 * A comparacao e feita por ANCORA, e nao por objeto: um InkGroup vira varios
 * PathObject, e o que corresponde ao elemento medido e a uniao deles.
 */

export interface GeometryError {
  kind: string;
  count: number;
  /** Distancia entre o canto superior esquerdo calculado e o medido, em px de mundo. */
  posAvg: number;
  posMax: number;
  /** Diferenca de tamanho (maior lado), em px de mundo. */
  sizeAvg: number;
  sizeMax: number;
  /** Piores casos, para inspecao quando algo nao fecha. */
  worstPos: string;
  worstSize: string;
}

export async function checkGeometry(html: string): Promise<GeometryError[]> {
  const [measured, result] = await Promise.all([
    measureLayout(html),
    // AssetStore proprio: esta conferencia nao pode sujar os assets do quadro.
    importBoardHtml('check', html, new AssetStore()),
  ]);

  // Uniao dos objetos gerados por cada ancora.
  const union = new Map<number, Rect>();
  for (let i = 0; i < result.objects.length; i++) {
    const idx = result.anchorOf[i]!;
    const b = result.objects[i]!.bbox;
    const cur = union.get(idx);
    union.set(idx, cur ? merge(cur, b) : { ...b });
  }

  const byKind = new Map<string, GeometryError>();

  for (const [idx, got] of union) {
    const want = measured[idx];
    if (!want) continue;

    const dPos = Math.hypot(got.x - want.x, got.y - want.y);
    const dSize = Math.max(Math.abs(got.w - want.w), Math.abs(got.h - want.h));

    let e = byKind.get(want.kind);
    if (!e) {
      e = {
        kind: want.kind,
        count: 0,
        posAvg: 0,
        posMax: 0,
        sizeAvg: 0,
        sizeMax: 0,
        worstPos: '',
        worstSize: '',
      };
      byKind.set(want.kind, e);
    }
    e.count++;
    e.posAvg += dPos;
    e.sizeAvg += dSize;
    if (dPos > e.posMax) {
      e.posMax = dPos;
      e.worstPos = describe(want, got);
    }
    if (dSize > e.sizeMax) {
      e.sizeMax = dSize;
      e.worstSize = describe(want, got);
    }
  }

  const out = [...byKind.values()];
  for (const e of out) {
    e.posAvg /= e.count;
    e.sizeAvg /= e.count;
  }
  return out.sort((a, b) => b.posMax - a.posMax);
}

/** Linhas prontas para o relatorio do terminal. */
export function formatGeometry(errors: readonly GeometryError[]): string[] {
  if (errors.length === 0) return ['    geometria: nada a comparar'];

  const lines = ['    geometria (px de mundo)   n   pos_med  pos_max  tam_med  tam_max'];
  for (const e of errors) {
    lines.push(
      `      ${e.kind.padEnd(20)}${String(e.count).padStart(4)}` +
        `${f(e.posAvg).padStart(9)}${f(e.posMax).padStart(9)}` +
        `${f(e.sizeAvg).padStart(9)}${f(e.sizeMax).padStart(9)}`,
    );
  }
  // O pior caso de cada tipo que passa de 1px: e nele que se ve o padrao do erro
  // (um desvio de exatamente metade da largura aponta a origem errada, por
  // exemplo), e sem isso o relatorio diz que ha um problema mas nao qual.
  for (const e of errors) {
    if (e.posMax > 1) lines.push(`      PIOR pos ${e.kind}: ${e.worstPos}`);
    if (e.sizeMax > 1) lines.push(`      PIOR tam ${e.kind}: ${e.worstSize}`);
  }

  // A posicao tem que fechar em zero, com UMA excecao conhecida (abaixo).
  //
  // O tamanho da caixa de texto ainda nao fecha, e a causa esta medida: o
  // navegador monta a caixa de linha com a metrica da fonte que REALMENTE
  // desenhou cada glifo, inclusive a substituta que entra num emoji (medido no
  // oraculo: 62px de caixa de linha para uma fonte de 34px), e essa metrica nao
  // aparece no `measureText` do canvas. Medimos mais estreito e mais baixo que
  // o motor de CSS nas linhas com emoji, e dai a diferenca de tamanho.
  //
  // A Fase 5 tirou daqui a parte que era escolha nossa: a largura gravada era o
  // teto de quebra (`max-width`), o que deixava caixas ate 3.295px mais largas
  // que o texto. Hoje a caixa encolhe para o que o texto ocupou. O que sobrou e
  // limite de medicao, nao decisao.
  if (errors.some((e) => e.kind === 'PlainText' && e.sizeMax > 1)) {
    lines.push('      (tamanho de PlainText: metrica de emoji do canvas != do DOM; ver comentario)');
    // Texto GIRADO transforma diferenca de tamanho em diferenca de posicao: o
    // AABB de uma caixa a 45 graus depende dos dois lados dela. A origem do
    // objeto continua exata -- sao os cantos do retangulo que chegam mais perto.
    // Por isso `pos_max` de PlainText pode passar de 1px enquanto todo o resto
    // fecha em zero; ha dois textos a 45 graus neste export.
    lines.push('      (pos de PlainText girado carrega a diferenca de tamanho; origem segue exata)');
  }
  return lines;
}

function describe(want: MeasuredRect, got: Rect): string {
  return (
    `medido x=${f(want.x)} y=${f(want.y)} ${f(want.w)}x${f(want.h)} | ` +
    `importado x=${f(got.x)} y=${f(got.y)} ${f(got.w)}x${f(got.h)} | ` +
    `desvio dx=${f(got.x - want.x)} dy=${f(got.y - want.y)} ` +
    `dw=${f(got.w - want.w)} dh=${f(got.h - want.h)}` +
    (want.detail ? `\n        ${want.detail}` : '')
  );
}

function merge(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function f(n: number): string {
  return n.toFixed(1);
}
