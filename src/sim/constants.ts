// Tunable flight constants. Units are meters and seconds. Values favor arcade feel over realism.

/** Titan surface gravity (m/s^2), about 1/7 of Earth. */
export const GRAVITY = 1.352;
/** Thick atmosphere: linear drag coefficient (1/s). */
export const DRAG = 0.22;
/** Max rotor thrust expressed as acceleration (m/s^2). */
export const MAX_THRUST_ACCEL = 4.0;
/** Throttle added/removed while climb/descend is held. */
export const CLIMB_THROTTLE = 0.42;
export const DESCEND_THROTTLE = -0.12;
/** Hover assist: with no climb input, throttle bleeds off vertical speed at this rate (1/s). */
export const VS_DAMP = 2.0;
/** Arcade thrust vectoring: horizontal push per unit of tilt, and horizontal drag (1/s). */
export const H_BOOST = 2.4;
export const DRAG_X = 0.35;
/** How quickly the rotors spool toward their target throttle (1/s). */
export const THROTTLE_RESPONSE = 3.5;

/** Max body tilt (rad) and how quickly it follows the stick (1/s). */
export const MAX_TILT = 0.75;
export const TILT_RESPONSE = 5;

/** Distance from craft center to the bottom of its skids, and skid half-span (m). */
export const SKID_DROP = 1.0;
export const SKID_HALF_SPAN = 1.4;

/** Landing limits. */
export const MAX_IMPACT_SPEED = 3.0;
export const MAX_SLIDE_SPEED = 3.0;
export const MAX_LAND_TILT = 0.28;
export const MAX_LAND_SLOPE = 0.35;

/** Fixed simulation step (s). */
export const FIXED_DT = 1 / 60;
