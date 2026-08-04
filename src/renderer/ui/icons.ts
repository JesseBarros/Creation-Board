/**
 * Icones da interface, desenhados em SVG.
 *
 * Em SVG e nao em glifo de fonte por um motivo concreto: um `▦` ou um `⌗`
 * depende da fonte instalada e do fallback do sistema para desenhar -- muda de
 * maquina para maquina, e as vezes vira um retangulo vazio. Aqui a forma e a
 * mesma em qualquer lugar, acompanha a cor do texto (`currentColor`) e escala
 * com o zoom da interface sem serrilhar.
 *
 * Todos partem do mesmo desenho: caixa de 24, traco de 1,75, pontas
 * arredondadas. E o que faz uma fila de icones parecer um conjunto em vez de
 * uma colecao.
 */

export type IconName =
  | 'voltar'
  | 'salvar'
  | 'exportar'
  | 'desfazer'
  | 'refazer'
  | 'grade'
  | 'ima'
  | 'regua'
  | 'ajustar'
  | 'tema'
  | 'comandos'
  | 'menos'
  | 'mais';

/** Traços de cada ícone, em coordenadas de uma caixa 24x24. */
const PATHS: Record<IconName, string[]> = {
  voltar: ['M15 5l-7 7 7 7'],
  // Seta para BAIXO sobre uma base: guardar no disco.
  salvar: ['M12 4v10', 'M8 10l4 4 4-4', 'M5 19h14'],
  // A mesma base, seta para CIMA: tirar do app para fora.
  exportar: ['M12 14V4', 'M8 8l4-4 4 4', 'M5 19h14'],
  desfazer: ['M9 7l-5 5 5 5', 'M4 12h9a5 5 0 015 5v2'],
  refazer: ['M15 7l5 5-5 5', 'M20 12h-9a5 5 0 00-5 5v2'],
  grade: ['M4 9.5h16', 'M4 14.5h16', 'M9.5 4v16', 'M14.5 4v16'],
  // Imã em U, com as duas pontas: e o desenho que todo mundo reconhece.
  ima: ['M7 4v8a5 5 0 0010 0V4h-3v8a2 2 0 01-4 0V4z', 'M7 8h3', 'M14 8h3'],
  regua: ['M3 8.5h18v7H3z', 'M7 8.5v3', 'M11 8.5v3', 'M15 8.5v3', 'M19 8.5v3'],
  ajustar: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  // Circulo meio preenchido: claro de um lado, escuro do outro.
  tema: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 3v18a9 9 0 000-18z'],
  // Teclado: a tela que ele abre e a lista de teclas.
  comandos: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14.5h8'],
  menos: ['M5 12h14'],
  mais: ['M12 5v14', 'M5 12h14'],
};

/** Ícones cujo segundo traço é preenchido, e não contornado. */
const FILLED_SECOND: ReadonlySet<IconName> = new Set(['tema']);

export function icon(name: IconName, size = 17): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // Decorativo: quem nomeia o botao e o `aria-label` dele, e nao o desenho.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  PATHS[name].forEach((d, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (i === 1 && FILLED_SECOND.has(name)) {
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'none');
    }
    svg.append(path);
  });

  return svg;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
