/** Weather zones along the track. They drift slowly, so the pilot has to watch the radar. */
export interface Zone {
  kind: 'rain' | 'haze';
  /** Center along the track at time 0 (m). */
  center: number;
  halfWidth: number;
  /** Drift speed (m/s). */
  drift: number;
}

export const ZONES: Zone[] = [
  // Methane rain: heavy air and a thirsty battery. One cell drifts over the DraMS site at 700 m.
  { kind: 'rain', center: 780, halfWidth: 220, drift: -1.5 },
  { kind: 'rain', center: -1150, halfWidth: 180, drift: 1.2 },
  // Haze banks: nothing physical, but the ground is hard to read inside them.
  { kind: 'haze', center: -600, halfWidth: 300, drift: 0 },
  { kind: 'haze', center: 1250, halfWidth: 250, drift: -1 },
];

/** Zone edges fade over this distance (m). */
export const ZONE_RAMP = 90;

/** Wind gusts: one per period at a pseudo-random moment, with a warning beforehand. All in seconds. */
export const GUST = {
  period: 26,
  warn: 2,
  blow: 5,
  /** Peak sideways acceleration (m/s^2). */
  strength: 90,
};
