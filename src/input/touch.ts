import type { Input } from '../sim/world';

/** A tappable rectangle in canvas pixels, set up by whichever screen is showing. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  onTap: () => void;
}

interface Point {
  x: number;
  y: number;
}

/** Fraction of the stick radius that is ignored, and the fraction that already counts as full push. */
const DEAD_ZONE = 0.12;
const FULL_PUSH = 0.85;

/**
 * Pointer input for phones and tablets: a floating joystick while flying (touch anywhere, drag to
 * steer: left/right tilts, up/down climbs or descends) and tap regions on the menu screens.
 */
export class TouchControls {
  /** True once a touch has been seen (or the device has a coarse pointer): show the joystick. */
  enabled: boolean;
  /** True while the flight screen is showing, so pointer presses mean flight controls. */
  playing = false;
  regions: Region[] = [];
  onPause: () => void = () => {};
  private stickId: number | null = null;
  /** Once the player has used the stick, stop drawing the idle hint of it. */
  private used = false;
  private origin: Point = { x: 0, y: 0 };
  private pos: Point = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.enabled = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Stick travel in canvas pixels. */
  private radius(): number {
    return Math.min(this.canvas.height * 0.17, this.canvas.width * 0.14);
  }

  /** Where the idle stick is drawn, so players can see there is one. */
  private home(): Point {
    const r = this.radius();
    return { x: this.canvas.width / 2, y: this.canvas.height - r * 1.7 };
  }

  private pauseButton(): { cx: number; cy: number; r: number } {
    const r = Math.min(this.canvas.height * 0.07, this.canvas.width * 0.06);
    return { cx: this.canvas.width - r * 1.7, cy: r * 1.7, r };
  }

  private point(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * this.canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * this.canvas.height) / rect.height,
    };
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'touch') this.enabled = true;
    const p = this.point(e);
    if (this.playing) {
      if (!this.enabled) return;
      const b = this.pauseButton();
      if (Math.hypot(p.x - b.cx, p.y - b.cy) <= b.r * 1.4) {
        this.onPause();
      } else if (this.stickId === null) {
        this.stickId = e.pointerId;
        this.used = true;
        this.origin = p;
        this.pos = p;
      }
    } else {
      for (let i = this.regions.length - 1; i >= 0; i--) {
        const r = this.regions[i];
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          r.onTap();
          break;
        }
      }
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; ignore if the pointer is already gone.
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) this.pos = this.point(e);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) this.stickId = null;
  }

  /** Let go of the stick, e.g. when the screen changes. */
  release(): void {
    this.stickId = null;
  }

  /** Stick deflection as a vector of length at most 1, with dead zone applied. */
  private deflection(): Point {
    if (this.stickId === null) return { x: 0, y: 0 };
    const r = this.radius() * FULL_PUSH;
    let dx = (this.pos.x - this.origin.x) / r;
    let dy = (this.pos.y - this.origin.y) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const mag = Math.min(1, len);
    if (mag < DEAD_ZONE) return { x: 0, y: 0 };
    const scale = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / mag;
    return { x: dx * scale, y: dy * scale };
  }

  read(): Input {
    const d = this.deflection();
    // Screen y grows downward, so pushing the stick up means climb.
    return { tilt: d.x, climb: -d.y };
  }

  /** Draw the joystick and pause button over the flight view. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled || !this.playing) return;
    const r = this.radius();
    const active = this.stickId !== null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (active || !this.used) {
      const base = active ? this.origin : this.home();

      ctx.beginPath();
      ctx.arc(base.x, base.y, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(20,10,0,0.35)' : 'rgba(20,10,0,0.22)';
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(255,226,176,0.75)' : 'rgba(255,226,176,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      let knob = base;
      if (active) {
        // Draw the knob where the finger is, held inside the ring.
        const fx = (this.pos.x - this.origin.x) / r;
        const fy = (this.pos.y - this.origin.y) / r;
        const fl = Math.hypot(fx, fy);
        const k = fl > 1 ? 1 / fl : 1;
        knob = { x: base.x + fx * k * r, y: base.y + fy * k * r };
      } else {
        // Faint direction marks so a new player can see what it does.
        ctx.fillStyle = 'rgba(255,226,176,0.45)';
        ctx.font = `bold ${Math.round(r * 0.3)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▲', base.x, base.y - r * 0.72);
        ctx.fillText('▼', base.x, base.y + r * 0.72);
        ctx.fillText('◄', base.x - r * 0.72, base.y);
        ctx.fillText('►', base.x + r * 0.72, base.y);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(255,210,122,0.6)' : 'rgba(255,210,122,0.3)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,226,176,0.85)';
      ctx.stroke();
    }

    const p = this.pauseButton();
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,10,0,0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,176,0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,226,176,0.9)';
    ctx.font = `bold ${Math.round(p.r * 0.9)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('II', p.cx, p.cy);
    ctx.textBaseline = 'alphabetic';
  }
}

export function mergeInput(a: Input, b: Input): Input {
  return {
    tilt: Math.max(-1, Math.min(1, a.tilt + b.tilt)),
    climb: Math.max(-1, Math.min(1, a.climb + b.climb)),
  };
}
