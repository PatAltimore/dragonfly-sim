# Dragonfly Titan Sim: Project Plan

An arcade, Choplifter-style side-scroller based on NASA's Dragonfly rotorcraft mission to Titan.
Hosted on GitHub Pages. A 3D version (Three.js) is a possible later phase, so the design keeps simulation and rendering separate.

## Game concept

You pilot Dragonfly across Titan's Shangri-La dunes toward Selk crater.
Each level is a "sortie": leave the lander, fly to science targets, land and sample them, and get back before the battery or daylight runs out.

| Choplifter | Dragonfly sim |
|---|---|
| Rescue hostages | Collect samples and instrument readings at science targets |
| Fuel / damage | Flight battery, trickle-charged by the MMRTG |
| Enemy fire | Wind gusts, dune ridges, methane rain, haze, night |
| Return to base | Return to the lander to upload data and recharge |
| Levels | Hops across the terrain, each farther and riskier |

Core loop: **plan the sortie, fly, land and drill, return, upload, score.**

Arcade priorities: tight and readable controls, quick restarts, short sorties (2 to 4 minutes), and generous but real constraints. Realism is flavor (real instrument names, mission facts in the briefing screens), not a rule that overrides fun.

## Tech decisions

- **TypeScript + Vite**, static build, deployed to GitHub Pages with a GitHub Actions workflow.
- **Plain Canvas 2D** for rendering, with no engine. This keeps the sim reusable under a Three.js renderer later and avoids engine lock-in.
- **Procedural art and WebAudio** (no asset pipeline). Pixel or vector style, with an orange haze palette.
- Keyboard first, with touch controls added in the polish milestone.

### Architecture (3D-ready)

```
src/
  sim/       fixed-timestep, deterministic, no DOM or canvas. Pure game state + update(dt, input).
             Units are SI-ish (meters, seconds). Positions use x (along track) and y (up);
             state types are written so a z axis can be added later.
  content/   levels, science targets and hazards as data (TS objects or JSON)
  render2d/  canvas renderer: reads sim state, draws it. Never mutates it.
  input/     keyboard, gamepad and touch mapped to an abstract Input { thrust, pitch, drill, ... }
  audio/     WebAudio synth
  ui/        HUD, briefing, results screens
  main.ts    loop: fixed-step sim, interpolated render
```

Rule: `sim/` never imports from `render2d/`, `ui/` or the DOM. A future `render3d/` just replaces `render2d/`.

## Milestones

**M0: Scaffold and deploy.** Vite + TS project, lint and format, an empty canvas, and the GitHub Pages workflow. Done when a placeholder is live at the Pages URL.

**M1: Flight and terrain.** Rotorcraft flight model with Titan-ish low gravity and thick air (floaty but controllable, with drag). Scrolling procedural dune terrain, a camera that follows the craft, and landing and crash detection. Done when flying and landing feel good.

**M2: Energy and day/night.** Battery drain tied to thrust, MMRTG trickle charge, and a compressed Titan day/night cycle with a darkness visual. Low battery gives a warning and then forced landing. Done when a sortie has real tension about range.

**M3: Landing level (intro).** A short Lunar Lander-style descent: parachute, rotor spin-up, touchdown on the dunes. Done when it works as a tutorial for the controls.

**M4: Science loop.** Science targets, landing zones, a drill timer (stay landed and stable), a data inventory, and uploading at the lander. Includes the Dragonfly-flavored instruments (DraMS samples, DraGNS scans, DragonCam shots) as target types. Done when a full sortie is playable start to finish.

**M5: Hazards.** Wind gusts, methane rain (visibility and drag), haze, and uneven landing slopes, plus the lander as a safe base. Done when each hazard is readable and avoidable.

**M6: Progression and polish.** Level sequence with rising difficulty, a scoring system (science value, speed, battery left), briefing screens with mission facts, HUD and audio. Done when a player can play 8 to 10 sorties in a session.

**M7: Ship.** Touch controls, performance pass, save of best scores (localStorage), a README, and a final Pages deploy.

## 3D later

When we get there:
1. Write `render3d/` with Three.js reading the same sim state.
2. Add the z axis to the sim (free flight, cross-winds).
3. Generate terrain from the same noise seeds, so levels carry over.

## Risks and open items

- Flight model feel is the biggest risk and gets playtested first (M1).
- Scale: use a compressed arcade scale for distances and day length, tuned by feel rather than mission numbers.
- Art style (pixel vs. vector) is undecided; the default is vector with flat shading.
- Mission facts in the briefings should be checked against the JHU APL Dragonfly site before shipping.
