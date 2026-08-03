import type { PathObject } from '@shared/model/types';
import type { PaintContext } from './types';

/**
 * Cache de Path2D por objeto.
 *
 * Reconstruir um Path2D a partir da string a cada frame seria o gargalo do
 * desenho de tinta importada: um traco manuscrito tem alguns milhares de
 * comandos, e reparsear centenas deles por frame custa mais que rasterizar.
 * O Path2D, uma vez construido, e reutilizavel e a rasterizacao vai para a GPU.
 *
 * Invalidacao por `rev`: qualquer mutacao do objeto incrementa esse contador.
 */
const cache = new Map<string, { rev: number; path: Path2D }>();

/**
 * Teto do cache. Um quadro grande pode ter milhares de tracos, mas so os
 * visiveis sao desenhados; guardar muito alem disso so consome memoria.
 */
const MAX_CACHED = 4000;

/**
 * Path2D do objeto, reconstruido so quando `rev` muda.
 *
 * Exportado porque o hit-test precisa exatamente do mesmo path que foi
 * desenhado: e `isPointInPath` sobre ele que responde se o clique caiu DENTRO da
 * caligrafia ou apenas dentro do retangulo que a envolve.
 */
export function path2dFor(o: PathObject): Path2D {
  const hit = cache.get(o.id);
  if (hit && hit.rev === o.rev) return hit.path;

  const path = new Path2D(o.d);
  // Descarte simples: ao estourar, limpa tudo em vez de manter uma ordem LRU.
  // O custo e um frame de reconstrucao, e evita a contabilidade de acesso.
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(o.id, { rev: o.rev, path });
  return path;
}

export function paintPath(o: PathObject, p: PaintContext): void {
  const { ctx } = p;
  ctx.globalAlpha = o.opacity;
  ctx.fillStyle = p.adapt(o.fill);
  ctx.fill(path2dFor(o), o.fillRule ?? 'nonzero');
  ctx.globalAlpha = 1;
}

/** Libera o cache. Chamado ao trocar de quadro. */
export function clearPathCache(): void {
  cache.clear();
}
