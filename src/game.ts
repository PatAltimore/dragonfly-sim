import type { GameAudio } from './audio/audio';
import { DIFFICULTY_ORDER, type Difficulty } from './content/difficulty';
import { LEVELS } from './content/levels';
import type { Keyboard } from './input/keyboard';
import { mergeInput, type TouchControls } from './input/touch';
import type { SceneRenderer } from './scene-renderer';
import { isUnlocked, recordResult, saveProgress, type Progress } from './save/progress';
import { FIXED_DT } from './sim/constants';
import { evaluate, type RunResult } from './sim/scoring';
import { createWorld, step, type World } from './sim/world';
import { LIBRARY } from './content/library';
import { drawLibrary, SECTION_START } from './ui/library';
import { drawBriefing, drawDebrief, drawMenu, drawPause, type Hit } from './ui/screens';

export type Screen = 'menu' | 'briefing' | 'play' | 'paused' | 'debrief' | 'library';

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
  private backdropDifficulty: Difficulty = 'easy';
  private result: RunResult | null = null;
  private newBest = false;
  private endTimer = 0;
  private acc = 0;
  private skipIntro = false;
  private libraryPage = 0;
  private libraryFrom: Screen = 'menu';

  constructor(
    private renderer: SceneRenderer,
    private keyboard: Keyboard,
    private touch: TouchControls,
    private audio: GameAudio,
    private progress: Progress,
    private view3d: boolean,
    private onToggleView: () => void,
  ) {
    this.world = createWorld(LEVELS[0], { skipIntro: true, difficulty: progress.difficulty });
    this.backdropDifficulty = progress.difficulty;
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
    if (this.backdropIndex !== index || this.backdropDifficulty !== this.progress.difficulty) {
      this.backdrop = createWorld(LEVELS[index], { skipIntro: true, difficulty: this.progress.difficulty });
      this.backdropIndex = index;
      this.backdropDifficulty = this.progress.difficulty;
      this.renderer.resetCamera(this.backdrop);
    }
    return this.backdrop;
  }

  private startPlay(skipIntro: boolean): void {
    this.skipIntro = skipIntro;
    this.world = createWorld(LEVELS[this.index], { skipIntro, difficulty: this.progress.difficulty });
    this.renderer.resetCamera(this.world);
    this.audio.reset();
    this.acc = 0;
    this.endTimer = 0;
    this.result = null;
    this.go('play');
  }

  private openLibrary(from: Screen): void {
    this.libraryFrom = from;
    this.audio.sfx('select');
    this.go('library');
  }

  private flipLibrary(delta: number): void {
    const n = LIBRARY.length;
    this.libraryPage = (this.libraryPage + delta + n) % n;
    this.audio.sfx('select');
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

  /** Choose a difficulty by index (Easy, Medium, Hard). Remembered between visits. */
  private setDifficulty(i: number): void {
    const next = DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.length - 1, Math.max(0, i))];
    if (next === this.progress.difficulty) return;
    this.progress.difficulty = next;
    saveProgress(this.progress);
    this.audio.sfx('select');
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
    if (id === 'view') return this.onToggleView();
    if (id === 'library') return this.openLibrary(this.screen);
    switch (this.screen) {
      case 'menu': {
        if (id.startsWith('diff:')) return this.setDifficulty(Number(id.slice(5)));
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
      case 'library':
        if (id === 'close') this.go(this.libraryFrom);
        else if (id === 'prev') this.flipLibrary(-1);
        else if (id === 'next') this.flipLibrary(1);
        else if (id.startsWith('tab:')) {
          this.libraryPage = SECTION_START[Number(id.slice(4))] ?? 0;
          this.audio.sfx('select');
        }
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
    if (this.keyboard.consumePress('KeyV')) return this.onToggleView();

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
      case 'library':
        this.library();
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
    const diff = DIFFICULTY_ORDER.indexOf(this.progress.difficulty);
    if (this.pressed('ArrowLeft', 'KeyA')) this.setDifficulty(diff - 1);
    if (this.pressed('ArrowRight', 'KeyD')) this.setDifficulty(diff + 1);
    if (this.keyboard.consumePress('KeyL')) return this.openLibrary('menu');
    if (this.confirm() && isUnlocked(this.progress, this.cursor)) return this.openBriefing(this.cursor);
    this.renderer.draw(this.showBackdrop(this.cursor), false);
    this.arm(drawMenu(this.renderer.surface(), this.progress, this.cursor, this.view3d));
    this.audio.update(null, false);
  }

  private briefing(): void {
    if (this.confirm()) {
      this.audio.sfx('confirm');
      return this.startPlay(false);
    }
    if (this.pressed('Escape', 'Backspace')) return this.toMenu();
    this.renderer.draw(this.showBackdrop(this.index), false);
    this.arm(drawBriefing(this.renderer.surface(), this.showBackdrop(this.index), this.index));
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
        this.newBest = recordResult(this.progress, this.index, w.difficulty.id, this.result);
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
    if (this.keyboard.consumePress('KeyL')) return this.openLibrary('paused');
    this.renderer.draw(this.world, true);
    this.arm(drawPause(this.renderer.surface(), this.progress.muted));
    this.audio.update(null, false);
  }

  private library(): void {
    if (this.pressed('ArrowLeft', 'KeyA')) this.flipLibrary(-1);
    if (this.pressed('ArrowRight', 'KeyD')) this.flipLibrary(1);
    if (this.pressed('Escape', 'Backspace', 'KeyL')) return this.go(this.libraryFrom);
    this.renderer.draw(this.libraryFrom === 'paused' ? this.world : this.showBackdrop(this.cursor), false);
    this.arm(drawLibrary(this.renderer.surface(), this.libraryPage));
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
    this.arm(drawDebrief(this.renderer.surface(), r, this.world.level, this.index, this.newBest, hasNext));
    this.audio.update(null, false);
  }
}
