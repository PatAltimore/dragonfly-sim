import { Keyboard } from './input/keyboard';
import { Renderer } from './render2d/renderer';
import { FIXED_DT } from './sim/constants';
import { createWorld, step } from './sim/world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const keyboard = new Keyboard(window);
const renderer = new Renderer(canvas);

const SEED = 7;
let world = createWorld(SEED);
renderer.resetCamera(world);

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;

  const restart = keyboard.consumePress('KeyR');
  const skipIntro = keyboard.consumePress('KeyX');
  if (restart || skipIntro) {
    world = createWorld(SEED, { intro: !skipIntro });
    renderer.resetCamera(world);
    acc = 0;
  }

  while (acc >= FIXED_DT) {
    step(world, keyboard.read(), FIXED_DT);
    acc -= FIXED_DT;
  }
  renderer.draw(world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
