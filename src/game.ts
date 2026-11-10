import type { GameAudio } from './audio/audio';
import { LEVELS } from './content/levels';
import type { Keyboard } from './input/keyboard';
import type { Renderer } from './render2d/renderer';
import { isUnlocked, recordResult, saveProgress, type Progress } from './save/progress';
import { FIXED_DT } from './sim/constants';
import { evaluate, type RunResult } from './sim/scoring';
import { createWorld, step, type World } from './sim/world';
import { drawBriefing, drawDebrief, drawMenu, drawPause } from './ui/screens';

export type Screen = 'menu' | 'briefing' | 'play' | 'paused' | 'debrief';

/** Seconds the sortie keeps running after a crash or completion before the debrief appears. */
const CRASH_DELAY = 1.4;
const COMPLETE_DELAY = 1.8;

/** Screen flow: menu, briefing, play, pause and debrief, plus progress and audio hooks. */
export class Game {
  screen: Screen = 'menu';
  private cursor = 0;
  private index = 0;
  private world: World;
  private backdrop: World;
  private backdropIndex = 0;
  private result: RunResult | null = null;
  private newBest = false;
  private endTimer = 0;
  private acc = 0;
  private skipIntro = false;

  constructor(
    private renderer: Renderer,
    private keyboard: Keyboard,
    private audio: GameAudio,
    private progress: Progress,
  ) {
    this.world = createWorld(LEVELS[0], { skipIntro: true });
    this.backdrop = this.world;
    this.renderer.resetCamera(this.backdrop);
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.keyboard.clearPresses();
  }

  /** Show an idle view of a sortie's terrain and time of day behind the menus. */
  private showBackdrop(index: number): World {
    if (this.backdropIndex !== index || !this.backdrop) {
      this.backdrop = createWorld(LEVELS[index], { skipIntro: true });
      this.backdropIndex = index;
      this.renderer.resetCamera(this.backdrop);
    }
    return this.backdrop;
  }

  private startPlay(skipIntro: boolean): void {
    this.skipIntro = skipIntro;
    this.world = createWorld(LEVELS[this.index], { skipIntro });
    this.renderer.resetCamera(this.world);
    this.audio.reset();
    this.acc = 0;
    this.endTimer = 0;
    this.result = null;
    this.go('play');
  }

  private confirm = (): boolean => this.keyboard.consumePress('Enter') || this.keyboard.consumePress('Space');
  private pressed = (...codes: string[]): boolean => codes.map((c) => this.keyboard.consumePress(c)).some(Boolean);

  frame(dt: number): void {
    const kb = this.keyboard;
    if (kb.consumePress('KeyM')) {
      this.progress.muted = this.audio.toggleMute();
      saveProgress(this.progress);
    }

    switch (this.screen) {
      case 'menu':
        this.menu();
        break;
      case 'briefing':
        this.briefing();
        break;
      case 'play':
        this.play(dt);
        break;
      case 'paused':
        this.paused();
        break;
      case 'debrief':
        this.debrief();
        break;
    }
  }

  private menu(): void {
    const n = LEVELS.length;
    if (this.pressed('ArrowUp', 'KeyW') && this.cursor > 0) {
      this.cursor--;
      this.audio.sfx('select');
    }
    if (this.pressed('ArrowDown', 'KeyS') && this.cursor < n - 1) {
      this.cursor++;
      this.audio.sfx('select');
    }
    if (this.confirm() && isUnlocked(this.progress, this.cursor)) {
      this.index = this.cursor;
      this.audio.sfx('confirm');
      this.go('briefing');
    }
    this.renderer.draw(this.showBackdrop(this.cursor), false);
    drawMenu(this.renderer.surface(), this.progress, this.cursor);
    this.audio.update(null, false);
  }

  private briefing(): void {
    if (this.confirm()) {
      this.audio.sfx('confirm');
      this.startPlay(false);
      return;
    }
    if (this.pressed('Escape', 'Backspace')) {
      this.cursor = this.index;
      this.go('menu');
      return;
    }
    this.renderer.draw(this.showBackdrop(this.index), false);
    drawBriefing(this.renderer.surface(), LEVELS[this.index], this.index);
    this.audio.update(null, false);
  }

  private play(dt: number): void {
    const kb = this.keyboard;
    if (kb.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (kb.consumePress('KeyX')) return this.startPlay(true);
    if (this.pressed('Escape', 'KeyP')) return this.go('paused');

    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      step(this.world, kb.read(), FIXED_DT);
      this.acc -= FIXED_DT;
    }

    const w = this.world;
    if (w.status === 'crashed' || w.science.complete) {
      this.endTimer += dt;
      if (this.endTimer >= (w.science.complete ? COMPLETE_DELAY : CRASH_DELAY)) {
        this.result = evaluate(w);
        this.newBest = recordResult(this.progress, this.index, this.result);
        this.go('debrief');
      }
    }
    this.renderer.draw(w, true);
    this.audio.update(w, true);
  }

  private paused(): void {
    if (this.pressed('Escape', 'KeyP')) return this.go('play');
    if (this.keyboard.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (this.keyboard.consumePress('KeyQ')) {
      this.cursor = this.index;
      return this.go('menu');
    }
    this.renderer.draw(this.world, true);
    drawPause(this.renderer.surface());
    this.audio.update(null, false);
  }

  private debrief(): void {
    const r = this.result;
    if (!r) return this.go('menu');
    const hasNext = r.completed && this.index + 1 < LEVELS.length;
    if (this.keyboard.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (this.pressed('Escape')) {
      this.cursor = this.index;
      return this.go('menu');
    }
    if (this.confirm()) {
      this.audio.sfx('confirm');
      if (!r.completed) return this.startPlay(this.skipIntro);
      if (hasNext) {
        this.index++;
        this.cursor = this.index;
        return this.go('briefing');
      }
      this.cursor = this.index;
      return this.go('menu');
    }
    this.renderer.draw(this.world, false);
    drawDebrief(this.renderer.surface(), r, LEVELS[this.index], this.index, this.newBest, hasNext);
    this.audio.update(null, false);
  }
}
