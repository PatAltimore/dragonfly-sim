import { AUTO_RELEASE_AGL } from '../sim/constants';
import { altitudeAGL, type World } from '../sim/world';

/** Tutorial prompt for the intro descent, or null when there is nothing to say. */
export function hintFor(w: World): string | null {
  if (!w.intro || w.status === 'crashed') return null;
  if (w.phase === 'chute') {
    return altitudeAGL(w) < AUTO_RELEASE_AGL + 170
      ? `Press ↑ to jettison the chute now (automatic at ${AUTO_RELEASE_AGL} m)`
      : 'Steer with ←/→ toward the landing zone (LZ)';
  }
  if (w.phase === 'spinup') return 'Rotors spinning up: you are in free fall';
  if (!w.landing && w.status === 'flying') {
    return 'Powered flight! ←/→ tilt, ↓ descend, ↑ climb. Ease down level onto the pad.';
  }
  return null;
}
