/**
 * The Mission File: short educational pages about the Dragonfly mission, Titan, the craft and its
 * instruments. Facts were checked against the Wikipedia articles on Dragonfly and Titan and NASA's
 * Dragonfly page; the text is paraphrased. Dates, ranges and sizes are plans or estimates.
 */
export type SectionId = 'mission' | 'titan' | 'craft' | 'tools' | 'terms' | 'sources';

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'mission', label: 'MISSION' },
  { id: 'titan', label: 'TITAN' },
  { id: 'craft', label: 'CRAFT' },
  { id: 'tools', label: 'TOOLS' },
  { id: 'terms', label: 'GLOSSARY' },
  { id: 'sources', label: 'SOURCES' },
];

/** Small diagrams drawn above a page's text. */
export type VisualKind = 'compare' | 'atmosphere' | 'tsol' | 'descent';

export interface Entry {
  section: SectionId;
  title: string;
  /** Paragraphs. Keep each page short enough to fit on a phone screen. */
  body: string[];
  visual?: VisualKind;
  /** Accent color for the title (instrument pages use the instrument's game color). */
  accent?: string;
}

export const LIBRARY: Entry[] = [
  // ---- Mission ----
  {
    section: 'mission',
    title: 'The big question',
    body: [
      'Dragonfly is a mission to study the chemistry that came before biology. It is not a life detector: it asks how far chemistry has progressed toward the ingredients of life, on a world where those ingredients may have met liquid water.',
      'The team wants to judge Titan\'s habitability, study its organic chemistry in several places, and look for chemical signs of life, whether water-based or built on hydrocarbons.',
    ],
  },
  {
    section: 'mission',
    title: 'Timeline',
    body: [
      '2017: the Johns Hopkins Applied Physics Laboratory (APL) proposes Dragonfly to NASA.',
      'June 2019: NASA selects it as the fourth mission of its New Frontiers program.',
      'July 2028: the launch window (5 to 25 July) opens, for a Falcon Heavy launch from Kennedy Space Center.',
      'About six years of cruise, including an Earth flyby, lead to arrival in 2034. The science phase is planned to last about 3.3 years.',
    ],
  },
  {
    section: 'mission',
    title: 'The team',
    body: [
      'APL manages Dragonfly, with Dr. Elizabeth "Zibi" Turtle as principal investigator.',
      'The idea grew from a conversation between planetary scientists Jason Barnes and Ralph Lorenz. Penn State\'s Vertical Lift Research Center helps design and analyze the rotors and flight controls.',
      'New Frontiers missions are competed: scientists propose ideas and NASA picks the best.',
    ],
  },
  {
    section: 'mission',
    title: 'Landing: 105 minutes, alone',
    visual: 'descent',
    body: [
      'Radio signals take 70 to 90 minutes each way, so Dragonfly has to land itself. Its big antenna is not deployed during descent.',
      'The cruise stage separates about 10 minutes before entry. A heat shield, then two parachutes, slow the craft, and powered flight begins near 1.2 km altitude. Sortie 1 is a compressed version of this.',
    ],
  },
  {
    section: 'mission',
    title: 'A day on Titan',
    visual: 'tsol',
    body: [
      'One Titan day, called a Tsol, lasts about 16 Earth days. Planned flights come once every one to two Tsols.',
      'The night lasts about 8 Earth days. The craft stays grounded, charging its battery while it analyzes samples, listens for ground motion, watches the weather and takes close-up images.',
    ],
  },
  {
    section: 'mission',
    title: 'Scouting the way',
    body: [
      'Dragonfly does not fly blind. By day its sensors and cameras scout new targets, and the craft waits until mission controllers approve new landing destinations. Safe, scientifically interesting places are chosen from the air before any hop.',
      'Game note: the rock spires and turbulence cells on Medium and Hard are arcade inventions. They stand in for the terrain and weather hazards that mission planners work to avoid, and they make you change altitude the way a careful pilot would.',
    ],
  },
  {
    section: 'mission',
    title: 'Soar with Dragonfly',
    body: [
      'NASA invites the public to sign up to have a name placed on a chip aboard the spacecraft and to receive a personalized boarding pass.',
      'Search for "Soar with Dragonfly" on NASA\'s Dragonfly page for current details.',
    ],
  },

  // ---- Titan ----
  {
    section: 'titan',
    title: 'Meet Titan',
    visual: 'compare',
    body: [
      'Titan is Saturn\'s largest moon: about 5,150 km across, 6% wider than Mercury and half again as wide as our Moon. It is tidally locked, always facing Saturn, and circles it in about 16 days, so its day is that long too.',
      'Gravity is only about 14% of Earth\'s, yet the air is thick: 1.45 times Earth\'s surface pressure. The surface is a frigid 94 K, about minus 179 degrees Celsius.',
    ],
  },
  {
    section: 'titan',
    title: 'An orange haze',
    visual: 'atmosphere',
    body: [
      'Titan\'s air is mostly nitrogen, with about 5% methane near the ground. Sunlight breaks methane and nitrogen apart high up, and the pieces build organic molecules that form a thick orange haze.',
      'The haze absorbs most sunlight before it reaches the surface, so daylight is dim. It cools the moon, while methane\'s greenhouse effect warms it.',
    ],
  },
  {
    section: 'titan',
    title: 'Methane weather',
    body: [
      'On Earth, water evaporates, forms clouds and falls as rain. On Titan, methane does that job, moving between gas, cloud and liquid.',
      'Clouds usually cover about 1% of Titan\'s disk and sometimes up to 8%. The Huygens probe\'s results point to liquid methane and organic compounds raining onto the surface. In this game, rain slows you down and drains the battery.',
    ],
  },
  {
    section: 'titan',
    title: 'Clouds and storms',
    body: [
      'Titan\'s clouds are probably made of methane, ethane or other simple organic compounds, and they are scattered and variable. They usually cover about 1% of the disk, but outbursts have spread them to as much as 8%.',
      'Windblown particles leave streaks on the surface, some hundreds of kilometers long, and the dunes show that sand generally moves west to east.',
      'Game note: the squall fronts on Medium and Hard are an arcade invention, inspired by Titan\'s changeable storm clouds.',
    ],
  },
  {
    section: 'titan',
    title: 'Seas of methane',
    body: [
      'Most of Titan\'s lakes and seas sit near the poles. Three big northern seas hold about 80% of the liquid; Kraken Mare is the largest and Ligeia Mare the second largest.',
      'They are liquid hydrocarbons, not water: one estimate for Ligeia Mare is about 71% methane, 12% ethane and 17% nitrogen. Dragonfly\'s seismometer could detect waves on the northern seas.',
    ],
  },
  {
    section: 'titan',
    title: 'Dunes of organics',
    body: [
      'Titan has vast dune fields near the equator, within about 30 degrees of it. Individual dunes are roughly 1 to 2 km wide and 80 to 130 m tall, and some run for more than 100 km.',
      'Their sand is mostly organic material that likely drifted down from the atmosphere. Dragonfly will land on dunes called Ahmakiq Undae, southwest of Selk crater.',
    ],
  },
  {
    section: 'titan',
    title: 'Tholins',
    body: [
      'Sunlight breaks methane and nitrogen apart in the upper atmosphere, and the pieces recombine into complex, sticky organic compounds called tholins.',
      'In the lab, Titan-like gases hit with ultraviolet light make tholins, and some experiments also produce nucleotide bases and amino acids, building blocks of DNA and proteins.',
    ],
  },
  {
    section: 'titan',
    title: 'A hidden ocean?',
    body: [
      'Cassini data hint at liquid water deep inside Titan: radio waves that may bounce off a liquid-ice boundary, surface features that shifted by up to 30 km between 2005 and 2007, and gravity changes as Titan orbits Saturn.',
      'Ammonia mixed into the water could keep it liquid at around 176 K. A seismometer measures ground motion, the kind of data used to probe a world\'s interior.',
    ],
  },
  {
    section: 'titan',
    title: 'Ice volcanoes?',
    body: [
      'Cassini\'s radar found candidate cryovolcanic features: the mountains Doom Mons and Erebor Mons, the large depression Sotra Patera and the flow-like Mohini Fluctus. Whether they are really volcanic is still debated.',
      'Between 2005 and 2006 parts of Sotra Patera and Mohini Fluctus grew brighter while the plains around them did not, which may hint at activity. If such volcanoes exist they might erupt water mixed with ammonia.',
      'Game note: the cryo-vents that erupt on a timer are an arcade invention. No one has seen a geyser on Titan.',
    ],
  },
  {
    section: 'titan',
    title: 'Early Earth, deep frozen',
    body: [
      'Titan\'s atmosphere resembles early Earth\'s in many ways, but without water vapor. It combines rich organic chemistry with liquid hydrocarbons, a setting where life\'s ingredients could form.',
      'Some scientists have proposed exotic methane-based life. None has been detected, and Dragonfly looks for chemical clues rather than assuming it exists.',
    ],
  },
  {
    section: 'titan',
    title: 'Huygens, 2005',
    body: [
      'On 14 January 2005 the European Space Agency\'s Huygens probe, carried by the Cassini spacecraft, landed on Titan. It is the most distant world from Earth where a probe has touched down.',
      'Selk crater lies about 800 km north-northwest of the Huygens site, so Dragonfly will explore a different region.',
    ],
  },

  // ---- Craft ----
  {
    section: 'craft',
    title: 'Why a rotorcraft?',
    body: [
      'Titan\'s low gravity and dense air make flying unusually easy: the air is about four times denser than Earth\'s and gravity is only 13.8% of Earth\'s, so flight takes roughly 40 times less power than on Earth.',
      'A flying lander can hop kilometers between very different sites instead of crawling like a rover. It would be only the second rotorcraft to fly on another world, after Ingenuity on Mars.',
    ],
  },
  {
    section: 'craft',
    title: 'Eight rotors',
    body: [
      'Dragonfly is an octocopter: eight rotors, each about 1.35 m across. The layout is redundant, so it can lose at least one rotor or motor and keep flying.',
      'It cruises at about 10 m/s (36 km/h) and can climb as high as about 4 km. Landing mass is around 875 kg. One flight can cover up to about 8 km.',
      'Game note: your craft is far faster than the real one. That is arcade license.',
      'Because of the redundant layout, a strike in the game knocks out one rotor at a time instead of ending the run. The craft climbs slower, pushes less and burns more energy until the base repairs it.',
    ],
  },
  {
    section: 'craft',
    title: 'A nuclear battery',
    body: [
      'With the haze blocking most sunlight, Dragonfly carries an MMRTG, a generator that turns the heat of radioactive decay into electricity. It is designed to produce about 70 watts.',
      'That slow trickle charges a lithium-ion battery, mostly during the Titan night, and the battery powers the flights. Twenty-four small radioisotope heater units are also reserved for the mission.',
    ],
  },
  {
    section: 'craft',
    title: 'Calling home',
    body: [
      'Dragonfly has a steerable high-gain dish, 87 cm across, that tracks Earth from the surface, plus medium- and low-gain antennas.',
      'With signals taking 70 to 90 minutes each way, controllers cannot steer it live. By day it scouts new targets and waits for approval of new landing sites; flights run on plans it carries out by itself.',
    ],
  },
  {
    section: 'craft',
    title: 'Feeding the lab',
    body: [
      'Two drills called DrACO, one on each landing skid, collect surface material. Hoses blow the samples pneumatically into the instruments inside the craft.',
      'Drilling needs the craft to sit still and stable on the ground, just as it does when you drill in this game.',
    ],
  },

  // ---- Tools (instruments) ----
  {
    section: 'tools',
    title: 'DraMS',
    accent: '#ff7a3a',
    body: [
      'The Dragonfly Mass Spectrometer weighs molecules to work out what a sample is made of. It looks especially for chemicals relevant to biology, in drilled surface samples and in the atmosphere.',
      'In the game: orange DraMS targets take the longest (4 seconds of drilling on Easy, more on harder settings) and are worth the most points.',
    ],
  },
  {
    section: 'tools',
    title: 'DraGNS',
    accent: '#5fd0ff',
    body: [
      'The Gamma-Ray and Neutron Spectrometer fires pulses of neutrons into the ground. The gamma rays and neutrons that come back reveal the composition of the ground beneath the lander.',
      'Different elements give off gamma rays at characteristic energies, which is how the instrument tells them apart. In the game: cyan DraGNS scans take 2 seconds on Easy.',
    ],
  },
  {
    section: 'tools',
    title: 'DraGMet',
    accent: '#8be07a',
    body: [
      'The Geophysics and Meteorology package combines weather sensors with a seismometer. It keeps watching through each Titan night while the craft sits still.',
      'A seismometer feels ground motion, from quakes to waves. On Titan, scientists think it could even detect waves on the northern hydrocarbon seas.',
    ],
  },
  {
    section: 'tools',
    title: 'DragonCam',
    accent: '#c79bff',
    body: [
      'A suite of cameras: a microscopic imager for close-ups of samples and a panoramic imager for the landscape. LED illuminators help with microscopic imaging at night.',
      'The cameras also help scout where to land next. In the game: violet DragonCam targets need a slow hover (1 second on Easy) inside the dashed box.',
    ],
  },

  // ---- Glossary ----
  {
    section: 'terms',
    title: 'Glossary 1',
    body: [
      'Prebiotic chemistry: chemical processes that can make the building blocks of life before any life exists.',
      'Biosignature: a measurable sign, such as a molecule or pattern, that could point to living processes.',
      'Mass spectrometer: an instrument that sorts molecules by mass to identify what a sample contains.',
      'Regolith: loose surface material, such as dust, sand and broken rock.',
    ],
  },
  {
    section: 'terms',
    title: 'Glossary 2',
    body: [
      'Cryovolcanism: eruptions of icy material, such as water, ammonia or methane, instead of molten rock.',
      'Tidal locking: when a moon always shows the same face to its planet.',
      'Tholins: sticky organic compounds made when sunlight and radiation act on nitrogen and methane.',
      'MMRTG: a generator that turns the heat from radioactive decay into electricity.',
      'Tsol: one Titan day, about 16 Earth days.',
    ],
  },

  // ---- Sources ----
  {
    section: 'sources',
    title: 'Sources and credits',
    body: [
      'Facts here were checked against the Wikipedia articles on Dragonfly (Titan space probe) and on Titan, and NASA\'s Dragonfly page at science.nasa.gov. The mission\'s own site is dragonfly.jhuapl.edu.',
      'Dates, distances and ranges are plans or estimates and can change, and sources sometimes disagree. For the latest, visit the official pages.',
      'This game is a fan project, not affiliated with NASA or APL.',
    ],
  },
];

/** One-liners for the end-of-sortie debrief. */
export const DID_YOU_KNOW: string[] = [
  'A Titan day lasts about 16 Earth days, and the night about 8.',
  'Titan\'s air is about four times denser than Earth\'s, so flying takes far less power.',
  'Dragonfly\'s eight rotors let it keep flying even if one fails.',
  'Signals take 70 to 90 minutes each way, so Dragonfly has to land itself.',
  'Titan\'s dunes are made mostly of organic material.',
  'At about minus 179 degrees Celsius, Titan\'s lakes are liquid methane and ethane, not water.',
  'The Huygens probe landed on Titan in January 2005, the most distant landing on any world.',
  'Dragonfly\'s MMRTG makes electricity from the heat of radioactive decay.',
  'Over its main mission Dragonfly could travel about 115 km, landing at 20 to 30 sites.',
  'You can put your name on a chip aboard Dragonfly: search "Soar with Dragonfly".',
  'Selk crater is about 90 km wide and young, and may hold both water ice and organic compounds.',
  'Dragonfly would be only the second rotorcraft to fly on another world, after Ingenuity.',
];
