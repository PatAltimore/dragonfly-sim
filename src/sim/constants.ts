// Tunable flight constants. Units are meters and seconds. Values favor arcade feel over realism.

/** Titan surface gravity (m/s^2), about 1/7 of Earth. */
export const GRAVITY = 1.352;
/** Max rotor thrust expressed as acceleration (m/s^2). */
export const MAX_THRUST_ACCEL = 8.0;
/** Vertical speed the pilot commands (m/s). Releasing the key brakes to a hover. */
export const CLIMB_SPEED = 54;
export const DESCEND_SPEED = 24;
/** Descent rate near the ground: LAND_TAPER_MIN + LAND_TAPER_RATE * altitude (m/s). */
export const LAND_TAPER_MIN = 2;
export const LAND_TAPER_RATE = 2.5;
/** How fast vertical speed converges on the command (1/s). */
export const VS_GAIN = 12;
/** Horizontal push at full tilt (m/s^2) and thick-air drag (1/s): top speed is about H_ACCEL*sin(MAX_TILT)/DRAG_X. */
export const H_ACCEL = 288;
export const DRAG_X = 3;
/** How quickly the rotors spool toward their target throttle (1/s). */
export const THROTTLE_RESPONSE = 12;

/** Max body tilt (rad) and how quickly it follows the stick (1/s). */
export const MAX_TILT = 0.75;
export const TILT_RESPONSE = 16;

/** Distance from craft center to the bottom of its skids, and skid half-span (m). */
export const SKID_DROP = 1.0;
export const SKID_HALF_SPAN = 1.4;

/** Landing limits. */
export const MAX_IMPACT_SPEED = 7;
export const MAX_SLIDE_SPEED = 14;
export const MAX_LAND_TILT = 0.28;
export const MAX_LAND_SLOPE = 0.35;

/** Fixed simulation step (s). */
export const FIXED_DT = 1 / 60;
