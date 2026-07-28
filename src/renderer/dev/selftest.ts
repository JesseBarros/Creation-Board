import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../core/Camera';

/**
 * Auto-teste do mapeamento de entrada da camera.
 *
 * Roda com `QB_SELFTEST=1 npm run dev` e imprime o resultado no terminal.
 *
 * Por que existe: verificar pan e zoom por screenshot exige que a janela esteja
 * em primeiro plano e captura a tela inteira -- fragil e invasivo. Aqui os
 * eventos de ponteiro sao despachados direto no elemento do canvas, exercitando
 * ViewportInput de ponta a ponta sem depender de foco nem de captura de tela.
 *
 * O que isto NAO cobre: a traducao que o sistema operacional faz do botao fisico
 * para `PointerEvent.button`. Esse mapeamento e padrao (0=esquerdo, 1=meio,
 * 2=direito) e nao varia entre plataformas.
 */

interface Result {
  nome: string;
  ok: boolean;
  detalhe: string;
}

function pointer(
  host: HTMLElement,
  type: string,
  x: number,
  y: number,
  button: number,
): void {
  host.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      button,
      // `buttons` e um bitmask: 1=esquerdo, 2=direito, 4=meio.
      buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : button === 1 ? 4 : 1,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function drag(host: HTMLElement, button: number, fromX: number, fromY: number, dx: number, dy: number): void {
  pointer(host, 'pointerdown', fromX, fromY, button);
  // Varios passos: o primeiro serve para cruzar o limiar de arrasto.
  for (let i = 1; i <= 4; i++) {
    pointer(host, 'pointermove', fromX + (dx * i) / 4, fromY + (dy * i) / 4, button);
  }
  pointer(host, 'pointerup', fromX + dx, fromY + dy, button);
}

function wheel(host: HTMLElement, x: number, y: number, deltaY: number, ctrl: boolean): void {
  host.dispatchEvent(
    new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, ctrlKey: ctrl, bubbles: true, cancelable: true }),
  );
}

const near = (a: number, b: number, tol = 0.5): boolean => Math.abs(a - b) <= tol;

export function runSelfTest(host: HTMLElement, camera: Camera): void {
  const results: Result[] = [];
  const check = (nome: string, ok: boolean, detalhe: string): void => {
    results.push({ nome, ok, detalhe });
  };

  const reset = (): void => {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
  };

  // --- pan com o botao direito
  reset();
  drag(host, 2, 400, 300, 120, 80);
  // Arrastar 120px para a direita com zoom 1 move a camera 120 unidades para a
  // esquerda: o conteudo acompanha o cursor.
  check(
    'pan com botao direito',
    near(camera.x, -120) && near(camera.y, -80),
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(-120.0, -80.0)`,
  );

  // --- clique direito sem arrastar nao pode mover
  reset();
  pointer(host, 'pointerdown', 400, 300, 2);
  pointer(host, 'pointermove', 401, 301, 2); // 1.4px: abaixo do limiar
  pointer(host, 'pointerup', 401, 301, 2);
  check(
    'clique direito parado nao move (reserva o menu de contexto)',
    camera.x === 0 && camera.y === 0,
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(0.0, 0.0)`,
  );

  // --- pan com o botao do meio continua funcionando
  reset();
  drag(host, 1, 400, 300, -60, 40);
  check(
    'pan com botao do meio',
    near(camera.x, 60) && near(camera.y, -40),
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(60.0, -40.0)`,
  );

  // --- botao esquerdo nao pode mover (fica livre para as ferramentas)
  reset();
  drag(host, 0, 400, 300, 100, 100);
  check(
    'botao esquerdo nao move o quadro',
    camera.x === 0 && camera.y === 0,
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(0.0, 0.0)`,
  );

  // --- zoom mantem fixo o ponto do mundo sob o cursor
  reset();
  const anchor = { x: 500, y: 400 };
  const worldBefore = camera.screenToWorld(anchor);
  wheel(host, anchor.x, anchor.y, -100, true);
  const worldAfter = camera.screenToWorld(anchor);
  check(
    'zoom fica ancorado no cursor',
    camera.zoom > 1 && near(worldBefore.x, worldAfter.x, 0.01) && near(worldBefore.y, worldAfter.y, 0.01),
    `zoom=${camera.zoom.toFixed(3)} mundo antes=(${worldBefore.x.toFixed(2)}, ${worldBefore.y.toFixed(2)}) depois=(${worldAfter.x.toFixed(2)}, ${worldAfter.y.toFixed(2)})`,
  );

  // --- limite superior de zoom
  reset();
  for (let i = 0; i < 400; i++) wheel(host, 500, 400, -100, true);
  check(
    `zoom maximo chega a ${MAX_ZOOM * 100}%`,
    near(camera.zoom, MAX_ZOOM, 1e-6),
    `zoom=${(camera.zoom * 100).toFixed(0)}% esperado=${MAX_ZOOM * 100}%`,
  );

  // --- limite inferior de zoom
  reset();
  for (let i = 0; i < 400; i++) wheel(host, 500, 400, 100, true);
  check(
    `zoom minimo chega a ${MIN_ZOOM * 100}%`,
    near(camera.zoom, MIN_ZOOM, 1e-6),
    `zoom=${(camera.zoom * 100).toFixed(2)}% esperado=${MIN_ZOOM * 100}%`,
  );

  // --- roda sem ctrl rola em vez de dar zoom
  reset();
  wheel(host, 500, 400, 120, false);
  check(
    'roda sem Ctrl rola na vertical',
    camera.zoom === 1 && near(camera.y, 120),
    `zoom=${camera.zoom} camera.y=${camera.y.toFixed(1)} esperado=(1, 120.0)`,
  );

  reset();

  const falhas = results.filter((r) => !r.ok).length;
  const linhas = results.map((r) => `  ${r.ok ? 'OK  ' : 'FALHA'} ${r.nome} — ${r.detalhe}`);
  console.log(`SELFTEST\n${linhas.join('\n')}\nSELFTEST_FIM ${falhas === 0 ? 'tudo passou' : `${falhas} falha(s)`}`);
}
