/** Weather zones along the track. They drift slowly, so the pilot has to watch the radar. */
export interface Zone {
  kind: 'rain' | 'haze';
  /** Center along the track at time 0 (m). */
  center: number;
  halfWidth: number;
  /** Drift speed (m/s). */
  drift: number;
}

/** Wind gusts: one per period at a pseudo-random moment, with a warning beforehand. All in seconds. */
export interface GustSpec {
  period: number;
  warn: number;
  blow: number;
  /** Peak sideways acceleration (m/s^2). */
  strength: number;
}

/** Zone edges fade over this distance (m). */
export const ZONE_RAMP = 90;

export const rain = (center: number, halfWidth: number, drift = 0): Zone => ({ kind: 'rain', center, halfWidth, drift });
export const haze = (center: number, halfWidth: number, drift = 0): Zone => ({ kind: 'haze', center, halfWidth, drift });
export const gust = (strength: number, period = 26): GustSpec => ({ period, warn: 2, blow: 5, strength });
