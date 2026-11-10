import type { GameAudio } from './audio/audio';
import { LEVELS } from './content/levels';
import type { Keyboard } from './input/keyboard';
import { mergeInput, type TouchControls } from './input/touch';
import type { Renderer } from './render2d/renderer';
import { isUnlocked, recordResult, saveProgress, type Progress } from './save/progress';
import { FIXED_DT } from './sim/constants';
import { evaluate, type RunResult } from './sim/scoring';
import { createWorld, step, type World } from './sim/world';
import { drawBriefing, drawDebrief, drawMenu, drawPause, type Hit } from './ui/screens';

export type Screen = 'menu' | 'briefing' | 'play' | 'paused' | 'debrief';

/** Seconds the sortie keeps running after a crash or completion before the debrief appears. */
const CRASH_DELAY = 1.4;
const COMPLETE_DELAY = 1.8;

/** Screen flow: menu, briefing, play, pause and debrief, plus progress, audio and touch hooks. */
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
    private touch: TouchControls,
    private audio: GameAudio,
    private progress: Progress,
  ) {
    this.world = createWorld(LEVELS[0], { skipIntro: true });
    this.backdrop = this.world;
    this.renderer.resetCamera(this.backdrop);
    this.touch.onPause = () => {
      if (this.screen === 'play') this.go('paused');
    };
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.keyboard.clearPresses();
    this.touch.release();
    this.touch.regions = [];
  }

  /** Show an idle view of a sortie's terrain and time of day behind the menus. */
  private showBackdrop(index: number): World {
    if (this.backdropIndex !== index) {
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

  private toMenu(): void {
    this.cursor = this.index;
    this.go('menu');
  }

  private openBriefing(index: number): void {
    this.index = index;
    this.audio.sfx('confirm');
    this.go('briefing');
  }

  private toggleSound(): void {
    this.progress.muted = this.audio.toggleMute();
    saveProgress(this.progress);
  }

  /** The debrief's main button: next sortie after a win, retry after a loss. */
  private debriefPrimary(): void {
    const r = this.result;
    if (!r) return this.go('menu');
    this.audio.sfx('confirm');
    if (!r.completed) return this.startPlay(this.skipIntro);
    if (this.index + 1 < LEVELS.length) {
      this.index++;
      this.cursor = this.index;
      return this.go('briefing');
    }
    this.toMenu();
  }

  private confirm = (): boolean => this.keyboard.consumePress('Enter') || this.keyboard.consumePress('Space');
  private pressed = (...codes: string[]): boolean => codes.map((c) => this.keyboard.consumePress(c)).some(Boolean);

  /** Route a tap on a drawn button or row to the same action its key would do. */
  private tap(id: string): void {
    if (id === 'sound') return this.toggleSound();
    switch (this.screen) {
      case 'menu': {
        const i = Number(id.split(':')[1]);
        if (Number.isNaN(i)) return;
        if (i === this.cursor && isUnlocked(this.progress, i)) this.openBriefing(i);
        else {
          this.cursor = i;
          this.audio.sfx('select');
        }
        break;
      }
      case 'briefing':
        if (id === 'launch') {
          this.audio.sfx('confirm');
          this.startPlay(false);
        } else if (id === 'back') this.toMenu();
        break;
      case 'paused':
        if (id === 'resume') this.go('play');
        else if (id === 'restart') this.startPlay(this.skipIntro);
        else if (id === 'quit') this.toMenu();
        break;
      case 'debrief':
        if (id === 'primary') this.debriefPrimary();
        else if (id === 'retry') this.startPlay(this.skipIntro);
        else if (id === 'menu') this.toMenu();
        break;
      default:
        break;
    }
  }

  /** Make the hits from the screen just drawn tappable. */
  private arm(hits: Hit[]): void {
    this.touch.regions = hits.map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h, onTap: () => this.tap(h.id) }));
  }

  frame(dt: number): void {
    this.touch.playing = this.screen === 'play';
    this.renderer.keyHints = !this.touch.enabled;
    if (this.keyboard.consumePress('KeyM')) this.toggleSound();

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
    if (this.confirm() && isUnlocked(this.progress, this.cursor)) return this.openBriefing(this.cursor);
    this.renderer.draw(this.showBackdrop(this.cursor), false);
    this.arm(drawMenu(this.renderer.surface(), this.progress, this.cursor));
    this.audio.update(null, false);
  }

  private briefing(): void {
    if (this.confirm()) {
      this.audio.sfx('confirm');
      return this.startPlay(false);
    }
    if (this.pressed('Escape', 'Backspace')) return this.toMenu();
    this.renderer.draw(this.showBackdrop(this.index), false);
    this.arm(drawBriefing(this.renderer.surface(), LEVELS[this.index], this.index));
    this.audio.update(null, false);
  }

  private play(dt: number): void {
    const kb = this.keyboard;
    if (kb.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (kb.consumePress('KeyX')) return this.startPlay(true);
    if (this.pressed('Escape', 'KeyP')) return this.go('paused');

    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      step(this.world, mergeInput(kb.read(), this.touch.read()), FIXED_DT);
      this.acc -= FIXED_DT;
    }

    const w = this.world;
    if (w.status === 'crashed' || w.science.complete) {
      this.endTimer += dt;
      if (this.endTimer >= (w.science.complete ? COMPLETE_DELAY : CRASH_DELAY)) {
        this.result = evaluate(w);
        this.newBest = recordResult(this.progress, this.index, this.result);
        return this.go('debrief');
      }
    }
    this.renderer.draw(w, true);
    this.touch.draw(this.renderer.surface().ctx);
    this.audio.update(w, true);
  }

  private paused(): void {
    if (this.pressed('Escape', 'KeyP')) return this.go('play');
    if (this.keyboard.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (this.keyboard.consumePress('KeyQ')) return this.toMenu();
    this.renderer.draw(this.world, true);
    this.arm(drawPause(this.renderer.surface(), this.progress.muted));
    this.audio.update(null, false);
  }

  private debrief(): void {
    const r = this.result;
    if (!r) return this.go('menu');
    if (this.keyboard.consumePress('KeyR')) return this.startPlay(this.skipIntro);
    if (this.pressed('Escape')) return this.toMenu();
    if (this.confirm()) return this.debriefPrimary();
    this.renderer.draw(this.world, false);
    const hasNext = r.completed && this.index + 1 < LEVELS.length;
    this.arm(drawDebrief(this.renderer.surface(), r, LEVELS[this.index], this.index, this.newBest, hasNext));
    this.audio.update(null, false);
  }
}
