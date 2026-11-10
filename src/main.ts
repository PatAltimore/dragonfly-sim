import { GameAudio } from './audio/audio';
import { Game } from './game';
import { Keyboard } from './input/keyboard';
import { TouchControls } from './input/touch';
import { Renderer } from './render2d/renderer';
import { loadProgress } from './save/progress';
import type { SceneRenderer } from './scene-renderer';

type View = '2d' | '3d';
const VIEW_KEY = 'dragonfly-sim-view';

/** `?view=3d` or `?view=2d` in the address picks the view and is remembered for next time. */
function preferredView(): View {
  try {
    const asked = new URLSearchParams(location.search).get('view');
    if (asked === '2d' || asked === '3d') {
      localStorage.setItem(VIEW_KEY, asked);
      return asked;
    }
    return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const sceneCanvas = document.getElementById('scene3d') as HTMLCanvasElement;
  const progress = loadProgress();
  const audio = new GameAudio(progress.muted);

  // Browsers only start audio after a user gesture.
  const unlockAudio = () => audio.unlock();
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);

  let view = preferredView();
  let renderer: SceneRenderer;
  if (view === '3d') {
    try {
      // Loaded on demand so players of the 2D view never download the 3D engine.
      const { Renderer3D } = await import('./render3d/renderer3d');
      renderer = new Renderer3D(canvas, sceneCanvas);
      sceneCanvas.style.display = 'block';
    } catch (err) {
      console.warn('3D view unavailable, using 2D', err);
      view = '2d';
      renderer = new Renderer(canvas);
    }
  } else {
    renderer = new Renderer(canvas);
  }

  const toggleView = () => {
    const next: View = view === '3d' ? '2d' : '3d';
    location.href = `${location.pathname}?view=${next}`;
  };

  const game = new Game(renderer, new Keyboard(window), new TouchControls(canvas), audio, progress, view === '3d', toggleView);

  let last = performance.now();
  function frame(now: number): void {
    game.frame(Math.min(0.1, (now - last) / 1000));
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
