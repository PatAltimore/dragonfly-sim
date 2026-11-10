import { gust, haze, rain, type GustSpec, type Zone } from './hazards';
import type { TargetSpec } from './sortie';

/** One sortie: terrain, science targets, weather and the briefing text. */
export interface Level {
  name: string;
  /** One-line summary shown in the sortie list. */
  tagline: string;
  /** What the pilot should expect, one short line each. */
  briefing: string[];
  /** A real fact about the Dragonfly mission or Titan. */
  fact: string;
  seed: number;
  /** Multiplier on how steep the far ridges get. */
  ridgeAmp: number;
  /** Open with the parachute descent. */
  intro: boolean;
  /** Seconds added to the Titan day clock at the start (to begin later in the day). */
  clockOffset: number;
  targets: TargetSpec[];
  zones: Zone[];
  gust: GustSpec | null;
  /** Battery drain multiplier. */
  drainMult: number;
  /** Mission time (s) that earns no time bonus. */
  parTime: number;
}

export const LEVELS: Level[] = [
  {
    name: 'First Light',
    tagline: 'Land at Shangri-La and take the first samples',
    briefing: ['Drop in by parachute, then land on the LZ.', 'Three nearby targets, only light gusts.', 'Upload your data back at the LZ.'],
    fact: 'Dragonfly is a NASA New Frontiers mission: a nuclear-powered, eight-rotor lander that will fly across the surface of Saturn\'s moon Titan.',
    seed: 7,
    ridgeAmp: 0.3,
    intro: true,
    clockOffset: 0,
    targets: [
      { kind: 'dragns', x: 250 },
      { kind: 'dragoncam', x: -300 },
      { kind: 'dragms', x: 500 },
    ],
    zones: [],
    gust: gust(40),
    drainMult: 0.85,
    parTime: 100,
  },
  {
    name: 'Dune Survey',
    tagline: 'Four targets and the first wind gusts',
    briefing: ['Four targets either side of the base.', 'Gusts will shove you sideways: counter-tilt or land.', 'DragonCam jobs need a slow hover.'],
    fact: 'Launch is planned for July 2028 on a Falcon Heavy, with arrival at Titan in 2034 after about six years of cruise.',
    seed: 11,
    ridgeAmp: 0.5,
    intro: false,
    clockOffset: 0,
    targets: [
      { kind: 'dragoncam', x: -350 },
      { kind: 'dragns', x: 400 },
      { kind: 'dragms', x: 750 },
      { kind: 'dragns', x: -700 },
    ],
    zones: [],
    gust: gust(60),
    drainMult: 0.9,
    parTime: 100,
  },
  {
    name: 'Storm Front',
    tagline: 'Methane rain sits right on the drill site',
    briefing: ['A methane rain cell drifts across the track.', 'Rain slows climbing and drains the battery.', 'You can wait it out on the ground.'],
    fact: 'Titan\'s atmosphere is about 1.45 times Earth\'s surface pressure and its gravity is only 13.8% of Earth\'s, which makes flying a rotorcraft practical.',
    seed: 23,
    ridgeAmp: 0.8,
    intro: false,
    clockOffset: 0,
    targets: [
      { kind: 'dragms', x: 600 },
      { kind: 'dragoncam', x: -400 },
      { kind: 'dragns', x: 1000 },
      { kind: 'dragms', x: -800 },
    ],
    zones: [rain(620, 220, -1.5), rain(-1000, 180, 1.2)],
    gust: gust(80),
    drainMult: 1,
    parTime: 130,
  },
  {
    name: 'Haze Run',
    tagline: 'Fog banks hide the ground, ridges get steep',
    briefing: ['Haze hides the terrain: trust the SLOPE readout.', 'Red-glowing ground is too steep to land on.', 'Five targets, the farthest 1.4 km out.'],
    fact: 'The landing site is in the Shangri-La dune field, near Selk crater. Dragonfly can fly up to 8 km in a single hop.',
    seed: 5,
    ridgeAmp: 1.2,
    intro: false,
    clockOffset: 0,
    targets: [
      { kind: 'dragns', x: -500 },
      { kind: 'dragoncam', x: 450 },
      { kind: 'dragms', x: 900 },
      { kind: 'dragoncam', x: -1000 },
      { kind: 'dragms', x: 1400 },
    ],
    zones: [haze(-550, 300), haze(1000, 280, -1)],
    gust: gust(80),
    drainMult: 1,
    parTime: 160,
  },
  {
    name: 'Twilight',
    tagline: 'Dusk falls halfway through the sortie',
    briefing: ['You start late in the Titan day.', 'Night makes flight costlier but landed charging better.', 'Rain and haze both on the route.'],
    fact: 'A Titan night lasts about eight Earth days. Dragonfly recharges its battery from its MMRTG power source, mostly during the night.',
    seed: 31,
    ridgeAmp: 1,
    intro: false,
    clockOffset: 75,
    targets: [
      { kind: 'dragoncam', x: -450 },
      { kind: 'dragns', x: 500 },
      { kind: 'dragms', x: 950 },
      { kind: 'dragms', x: -900 },
      { kind: 'dragns', x: 1300 },
    ],
    zones: [rain(900, 200, -1), haze(-600, 260)],
    gust: gust(85),
    drainMult: 1.05,
    parTime: 170,
  },
  {
    name: 'Long Hop',
    tagline: 'Targets nearly two kilometers out',
    briefing: ['Six targets, the farthest 1.7 km away.', 'Plan your route: you can charge anywhere you land.', 'The base charges three times faster.'],
    fact: 'DraMS is a mass spectrometer that identifies organic chemistry in samples collected by the rotary-percussive drill, DrACO.',
    seed: 17,
    ridgeAmp: 1,
    intro: false,
    clockOffset: 0,
    targets: [
      { kind: 'dragoncam', x: -300 },
      { kind: 'dragns', x: 600 },
      { kind: 'dragms', x: -900 },
      { kind: 'dragoncam', x: 1100 },
      { kind: 'dragns', x: -1500 },
      { kind: 'dragms', x: 1700 },
    ],
    zones: [rain(-1100, 200, 1), haze(1300, 260, -1)],
    gust: gust(85),
    drainMult: 1.1,
    parTime: 230,
  },
  {
    name: 'Night Shift',
    tagline: 'Fly the whole sortie in the dark',
    briefing: ['It is already night: only your lights show the way.', 'Gusts and rain are still out there.', 'Six targets, plus steep ridges.'],
    fact: 'DraGNS, a gamma-ray and neutron spectrometer, reads the composition of the ground beneath the lander. DraGMet adds weather sensors and a seismometer.',
    seed: 41,
    ridgeAmp: 1.3,
    intro: false,
    clockOffset: 130,
    targets: [
      { kind: 'dragns', x: 350 },
      { kind: 'dragms', x: 800 },
      { kind: 'dragoncam', x: -500 },
      { kind: 'dragms', x: -1000 },
      { kind: 'dragns', x: 1200 },
      { kind: 'dragoncam', x: -1400 },
    ],
    zones: [rain(850, 220, -1.5), rain(-1100, 200, 1), haze(300, 220)],
    gust: gust(90, 24),
    drainMult: 1.1,
    parTime: 220,
  },
  {
    name: 'Selk Crater',
    tagline: 'Everything at once, on the crater floor',
    briefing: ['Seven targets, all weather, night closing in.', 'Gusts come every 22 seconds.', 'Bring it all home.'],
    fact: 'Over its primary mission Dragonfly could cover roughly 115 km, landing at 20 to 30 different sites, each chosen from the air by its cameras.',
    seed: 7,
    ridgeAmp: 1.5,
    intro: false,
    clockOffset: 45,
    targets: [
      { kind: 'dragoncam', x: -380 },
      { kind: 'dragns', x: 320 },
      { kind: 'dragms', x: 700 },
      { kind: 'dragoncam', x: 1000 },
      { kind: 'dragms', x: -850 },
      { kind: 'dragns', x: 1350 },
      { kind: 'dragms', x: -1300 },
    ],
    zones: [rain(780, 220, -1.5), rain(-1150, 180, 1.2), haze(-600, 300), haze(1250, 250, -1)],
    gust: gust(95, 22),
    drainMult: 1.15,
    parTime: 260,
  },
];
