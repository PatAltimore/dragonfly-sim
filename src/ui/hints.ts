import { AUTO_RELEASE_AGL } from '../sim/constants';
import { altitudeAGL, type World } from '../sim/world';

/** Contextual tutorial prompt, or null when there is nothing to say. */
export function hintFor(w: World): string | null {
  if (w.status === 'crashed') return null;
  if (w.intro && w.phase === 'chute') {
    return altitudeAGL(w) < AUTO_RELEASE_AGL + 170
      ? `Press ↑ to jettison the chute now (automatic at ${AUTO_RELEASE_AGL} m)`
      : 'Steer with ←/→ toward the landing zone (LZ)';
  }
  if (w.intro && w.phase === 'spinup') return 'Rotors spinning up: you are in free fall';
  if (w.intro && !w.landing && w.status === 'flying') {
    return 'Powered flight! ←/→ tilt, ↓ descend, ↑ climb. Ease down level onto the pad.';
  }
  // On Medium and Hard, a second hint right after the first explains the new obstacles.
  const hazards = w.obstacles.spires.length + w.obstacles.cells.length > 0;
  const until = w.science.hintUntil;
  if (hazards && w.phase === 'flight' && !w.science.complete && until > 0 && w.time >= until && w.time < until + 12) {
    return 'Rock spires are solid: climb over them. Turbulence cells shove you: go around or over.';
  }
  const threats = w.obstacles.squalls.length + w.obstacles.vents.length > 0;
  if (threats && w.phase === 'flight' && !w.science.complete && until > 0 && w.time >= until + 12 && w.time < until + 24) {
    return 'Squalls patrol the high sky, vents erupt on a timer. A strike costs a rotor: repair at the base.';
  }
  if (w.phase === 'flight' && !w.science.complete && w.science.hintUntil > w.time) {
    return 'Land on orange/cyan rings to drill and scan, hover in violet boxes to image. Land at the LZ to upload.';
  }
  return null;
}
