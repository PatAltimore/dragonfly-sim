import { GameAudio } from './audio/audio';
import { Game } from './game';
import { Keyboard } from './input/keyboard';
import { TouchControls } from './input/touch';
import { Renderer } from './render2d/renderer';
import { loadProgress } from './save/progress';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const progress = loadProgress();
const audio = new GameAudio(progress.muted);

// Browsers only start audio after a user gesture.
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

const game = new Game(new Renderer(canvas), new Keyboard(window), new TouchControls(canvas), audio, progress);

let last = performance.now();
function frame(now: number): void {
  game.frame(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
