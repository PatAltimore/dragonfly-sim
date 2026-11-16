import { AUTO_RELEASE_AGL, LANDER_AUTO_RELEASE_AGL } from '../sim/constants';
import { altitudeAGL, type World } from '../sim/world';

/** Contextual tutorial prompt, or null when there is nothing to say. */
export function hintFor(w: World): string | null {
  if (w.status === 'crashed') return null;
  if (w.intro && w.phase === 'chute') {
    const release = w.assist ? AUTO_RELEASE_AGL : LANDER_AUTO_RELEASE_AGL;
    return altitudeAGL(w) < release + 170
      ? `Press ↑ to jettison the chute now (automatic at ${release} m)`
      : 'Steer with ←/→ toward the landing zone (LZ)';
  }
  if (w.intro && w.phase === 'spinup') return 'Rotors spinning up: you are in free fall';
  if (w.intro && !w.landing && w.status === 'flying') {
    return w.assist
      ? 'Powered flight! ←/→ tilt, ↓ descend, ↑ climb. Ease down level onto the pad.'
      : 'Powered flight! Hold ↑ for thrust to catch the fall, ←/→ tilt. Cut thrust to sink, touch down level.';
  }
  const until = w.science.hintUntil;
  // Further hints follow the first: the gates, then (on Medium and Hard) the vents.
  const live = w.phase === 'flight' && !w.science.complete && until > 0;
  if (live && w.obstacles.gates.length > 0 && w.time >= until && w.time < until + 9) {
    return 'Fly through the gaps between hills and methane clouds. Touching either destroys you.';
  }
  if (live && w.obstacles.vents.length > 0 && w.time >= until + 9 && w.time < until + 19) {
    return 'Ice vents lob balls that bounce and roll, pushed by the wind. Any hit destroys you.';
  }
  if (live && !w.assist && w.time >= until + 19 && w.time < until + 25) {
    return 'No assist: gravity never stops pulling. Press F to turn flight assist on.';
  }
  if (w.phase === 'flight' && !w.science.complete && w.science.hintUntil > w.time) {
    return 'Land on orange/cyan rings to drill and scan, hover in violet boxes to image. Land at the LZ to upload.';
  }
  return null;
}
