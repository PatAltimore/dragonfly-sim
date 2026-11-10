import type { World } from './sim/world';
import type { Surface } from './ui/screens';

/** What the game needs from a renderer, so the 2D and 3D views are interchangeable. */
export interface SceneRenderer {
  /** Show the keyboard cheat-sheet along the bottom (hidden on touch devices). */
  keyHints: boolean;
  /** Snap the camera onto the craft (call after a restart or a new world). */
  resetCamera(w: World): void;
  /** Draw the world, and the HUD over it when `hud` is true. */
  draw(w: World, hud?: boolean): void;
  /** The 2D canvas surface menus and screens paint onto. Valid after draw(). */
  surface(): Surface;
}
