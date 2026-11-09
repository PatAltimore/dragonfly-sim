import type { Input } from '../sim/world';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW', 'Space'];
const DOWN = ['ArrowDown', 'KeyS'];
const GAME_KEYS = [...LEFT, ...RIGHT, ...UP, ...DOWN, 'KeyR'];

export class Keyboard {
  private down = new Set<string>();
  private restartPressed = false;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR' && !e.repeat) this.restartPressed = true;
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  read(): Input {
    return {
      tilt: (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0),
      climb: (this.any(UP) ? 1 : 0) - (this.any(DOWN) ? 1 : 0),
    };
  }

  /** True once per R keypress. */
  consumeRestart(): boolean {
    const r = this.restartPressed;
    this.restartPressed = false;
    return r;
  }
}
