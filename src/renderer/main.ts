import './styles/base.css';
import './styles/app.css';
import './styles/ui.css';
import { App } from './App';

/** Ponto de entrada do renderer. */
function bootstrap(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elemento #app nao encontrado no index.html');
  new App(root);
}

bootstrap();
