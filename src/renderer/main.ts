import './styles/base.css';
import './styles/app.css';
import './styles/ui.css';
import { App } from './App';
import { aplicarIdioma, escolherIdioma } from './idioma';

/** Ponto de entrada do renderer. */
function bootstrap(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elemento #app nao encontrado no index.html');
  // ANTES de montar qualquer tela: os textos sao escritos na construcao.
  aplicarIdioma(escolherIdioma());
  new App(root);
}

bootstrap();
