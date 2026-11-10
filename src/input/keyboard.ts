import type { Input } from '../sim/world';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW', 'Space'];
const DOWN = ['ArrowDown', 'KeyS'];
const GAME_KEYS = [...LEFT, ...RIGHT, ...UP, ...DOWN, 'KeyR', 'KeyX', 'KeyP', 'KeyQ', 'KeyM', 'KeyV', 'KeyL', 'Enter', 'Escape', 'Backspace'];

export class Keyboard {
  private down = new Set<string>();
  private pressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
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

  /** Forget presses made so far, e.g. when the screen changes. */
  clearPresses(): void {
    this.pressed.clear();
  }

  /** True once per keypress of the given key code (e.g. 'KeyR'). */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }
}
