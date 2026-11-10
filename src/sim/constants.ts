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

/**
 * Methane ice balls lobbed by vents. Gravity here is arcade strength: Titan's real gravity would fling them far higher.
 * Bounces keep some energy, then a ball settles into rolling. Gusts push balls in the air and on the ground.
 */
export const BALL_GRAVITY = 12;
export const BALL_RESTITUTION = 0.58;
/** Share of a ball's sideways speed kept at each bounce. */
export const BALL_BOUNCE_KEEP = 0.88;
/** Below this speed into the ground a ball stops bouncing and rolls. */
export const BALL_REST_SPEED = 4;
/** In the air a ball is pulled toward the wind speed at this rate (1/s); on the ground gusts push it along. */
export const BALL_WIND_COUPLING = 0.5;
export const BALL_GROUND_PUSH = 0.5;
export const BALL_ROLL_DRAG = 0.5;
/** Gust acceleration (m/s^2) to an equivalent wind speed (m/s). */
export const WIND_SPEED_PER_ACCEL = 0.12;
/** Balls break up before reaching the base: it stays safe. At most this many exist at once. */
export const BALL_BASE_SHIELD = 70;
export const BALL_LIMIT = 24;

/** Fixed simulation step (s). */
export const FIXED_DT = 1 / 60;

/** Energy. Battery is a fraction in [0, 1]; rates are fractions per second. */
export const HOVER_DRAIN = 0.01;
export const CLIMB_DRAIN = 0.012;
export const TILT_DRAIN = 0.012;
/** MMRTG trickle: small while flying, much faster once landed. */
export const FLIGHT_CHARGE = 0.002;
export const LANDED_CHARGE = 0.03;
/** Below this the HUD warns. The craft cannot lift off below the takeoff minimum. */
export const LOW_BATTERY = 0.2;
export const MIN_TAKEOFF_BATTERY = 0.1;

/** Titan day, compressed (s). The sortie starts just after dawn. */
export const DAY_LENGTH = 240;
export const START_PHASE = 0.05;
/** Night is cold and dark: flight costs more, landed charging is better. */
export const NIGHT_DRAIN_MULT = 1.25;
export const NIGHT_CHARGE_MULT = 1.5;

/** Intro descent. The craft starts high and off to the side of the landing zone (x = 0). */
export const START_X = -220;
export const START_AGL = 600;
/** Under the parachute: fall speed (m/s), drift (m/s, negative = away from the pad) and steering speed (m/s). */
export const CHUTE_SPEED = 40;
export const CHUTE_WIND = -5;
export const CHUTE_STEER_SPEED = 30;
/** The chute is jettisoned automatically at this altitude (m) if the pilot hasn't done it. */
export const AUTO_RELEASE_AGL = 130;
/** Rotor spin-up after jettison: duration (s), arcade fall acceleration (m/s^2) and fall speed cap (m/s). */
export const SPINUP_TIME = 2;
export const SPINUP_GRAVITY = 14;
export const SPINUP_MAX_FALL = 60;
/** Rotors that finish spinning up below this altitude (m) can't arrest the fall. */
export const MIN_RECOVERY_AGL = 15;
/** Touching down within this distance (m) of the pad center counts as a bullseye. */
export const PAD_BULLSEYE = 8;

/** Science. Radii in meters, times in seconds, altitudes in meters above ground. */
export const TARGET_RADIUS = 8;
export const PHOTO_RADIUS = 14;
export const PHOTO_MIN_AGL = 10;
export const PHOTO_MAX_AGL = 60;
export const PHOTO_MAX_SPEED = 25;
/** Unfinished work drains away at this rate (progress per second) when the pilot leaves. */
export const PROGRESS_DECAY = 0.6;
/** Landing within this distance of x = 0 counts as being at the base. */
export const BASE_RADIUS = 12;
export const UPLOAD_TIME = 2;

/** Methane rain: how much it slows climbing, adds drag and burns battery at full intensity. */
export const RAIN_CLIMB_PENALTY = 0.3;
export const RAIN_DRAG = 0.6;
export const RAIN_DRAIN = 0.5;
/** Landed at the base (the lander's power station) the battery charges this much faster. */
export const BASE_CHARGE_MULT = 3;
