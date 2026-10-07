import { t } from '@shared/i18n';
import type { PassoDoTour } from './Tour';

/**
 * Os dois tutoriais do app (06/10/2026): o do MENU, na primeira abertura, e o
 * do QUADRO, na primeira vez que se entra em um. O mecanismo esta em `Tour.ts`.
 *
 * Os alvos sao `data-tour` (no menu) e o `data-action` que a barra ja tinha:
 * seletor por texto quebraria no dia em que o rotulo mudasse, ou na troca de
 * idioma.
 */

export type QualTutorial = 'menu' | 'quadro';

const CHAVE: Record<QualTutorial, string> = { menu: 'qb.tutorial.menu', quadro: 'qb.tutorial.quadro' };

export function tutorialVisto(qual: QualTutorial): boolean {
  try {
    return localStorage.getItem(CHAVE[qual]) === '1';
  } catch {
    return true; // sem armazenamento, nao insiste a cada abertura
  }
}

/** Visto vale tanto para quem chegou ao fim quanto para quem pulou. */
export function marcarTutorialVisto(qual: QualTutorial): void {
  try {
    localStorage.setItem(CHAVE[qual], '1');
  } catch {
    // Sem armazenamento: aparece de novo na proxima, e so isso.
  }
}

/** "Ver de novo", em Configuracoes. */
export function esquecerTutoriais(): void {
  try {
    for (const k of Object.values(CHAVE)) localStorage.removeItem(k);
  } catch {
    // idem
  }
}

export function passosDoMenu(): PassoDoTour[] {
  return [
    { titulo: t('tour.menu.boasVindasTitulo'), texto: t('tour.menu.boasVindas') },
    { alvo: '[data-tour="novo"]', titulo: t('tour.menu.novoTitulo'), texto: t('tour.menu.novo') },
    { alvo: '[data-tour="busca"]', titulo: t('tour.menu.buscaTitulo'), texto: t('tour.menu.busca') },
    { alvo: '[data-tour="pasta"]', titulo: t('tour.menu.pastaTitulo'), texto: t('tour.menu.pasta') },
    { alvo: '[data-tour="importar"]', titulo: t('tour.menu.importarTitulo'), texto: t('tour.menu.importar') },
    { alvo: '[data-tour="tema"]', titulo: t('tour.menu.temaTitulo'), texto: t('tour.menu.tema') },
    { alvo: '[data-tour="config"]', titulo: t('tour.menu.configTitulo'), texto: t('tour.menu.config') },
  ];
}

export function passosDoQuadro(): PassoDoTour[] {
  const ferramenta = (id: string): string => `.qb-tools__btn[data-action="${id}"]`;
  const barra = (acao: string): string => `.qb-bar [data-action="${acao}"]`;
  return [
    { titulo: t('tour.quadro.boasVindasTitulo'), texto: t('tour.quadro.boasVindas') },
    { alvo: ferramenta('select'), titulo: t('tour.quadro.selecionarTitulo'), texto: t('tour.quadro.selecionar') },
    { alvo: ferramenta('pen'), titulo: t('tour.quadro.canetaTitulo'), texto: t('tour.quadro.caneta') },
    { alvo: ferramenta('highlighter'), titulo: t('tour.quadro.marcaTextoTitulo'), texto: t('tour.quadro.marcaTexto') },
    { alvo: ferramenta('text'), titulo: t('tour.quadro.textoTitulo'), texto: t('tour.quadro.texto') },
    { alvo: ferramenta('note'), titulo: t('tour.quadro.postitTitulo'), texto: t('tour.quadro.postit') },
    { alvo: ferramenta('shape'), titulo: t('tour.quadro.formasTitulo'), texto: t('tour.quadro.formas') },
    { alvo: ferramenta('eraser'), titulo: t('tour.quadro.borrachaTitulo'), texto: t('tour.quadro.borracha') },
    { alvo: barra('desfazer'), titulo: t('tour.quadro.desfazerTitulo'), texto: t('tour.quadro.desfazer') },
    { alvo: barra('salvar'), titulo: t('tour.quadro.salvarTitulo'), texto: t('tour.quadro.salvar') },
    { alvo: barra('exportar'), titulo: t('tour.quadro.exportarTitulo'), texto: t('tour.quadro.exportar') },
    { alvo: barra('zoom'), titulo: t('tour.quadro.zoomTitulo'), texto: t('tour.quadro.zoom') },
    { alvo: barra('comandos'), titulo: t('tour.quadro.atalhosTitulo'), texto: t('tour.quadro.atalhos') },
  ];
}
