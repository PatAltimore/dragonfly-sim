# Dragonfly: Titan Sortie

An arcade, Choplifter-style flight game based on NASA's Dragonfly rotorcraft mission to Saturn's moon Titan.
You pilot the lander from base to science targets, drill, scan and photograph, then bring the data home before the battery or daylight runs out.

Fan-made and unofficial: not affiliated with NASA or the Johns Hopkins Applied Physics Laboratory.

## How to play

1. Pick a sortie. The first one opens with a parachute descent: steer to the landing zone (LZ), jettison the chute with up, and land.
2. Fly to the colored target markers (the radar strip at the top shows them all):
   - **DraMS** (orange): land on the ring and drill for 4 seconds.
   - **DraGNS** (cyan): land on the ring and scan for 2 seconds.
   - **DragonCam** (violet): hover slowly inside the dashed box to take images.
3. Land at the LZ to upload your cargo and bank the points. A crash destroys any unsent data.
4. Watch the battery: flying drains it, landing recharges it (3x faster at the base), and an empty battery means an automatic emergency descent.
5. Mind the weather: wind gusts (warned a couple of seconds ahead), methane rain (slower, thirstier) and haze (hides the ground). Ground that glows red is too steep to land on.

Finish a sortie for one star, with extra stars for beating the par time and keeping battery in reserve. Clearing a sortie unlocks the next of eight.

### Controls

| | Keyboard | Touch |
|---|---|---|
| Tilt left / right | Left / Right or A / D | Joystick: drag left / right |
| Climb / descend | Up / Down or W / S | Joystick: drag up / down |
| Pause | Esc or P | II button |
| Restart sortie | R | Pause menu |
| Skip the intro descent | X | |
| Sound on / off | M | Sound button |

On a touch screen the joystick floats: put a finger down anywhere and drag. The farther you push, the harder you steer.

Menus work with the keyboard (arrows and Enter) or by tapping or clicking.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # typecheck and build into dist/
npm run preview    # serve the production build
```

Plain TypeScript, Vite and Canvas 2D, with no runtime dependencies. Audio is synthesized with WebAudio, so there are no asset files.

### Layout

```
src/
  sim/       deterministic game rules: flight model, terrain, energy, science, hazards, scoring
  content/   data: instruments, sortie definitions, weather
  render2d/  Canvas 2D renderer (reads sim state, never changes it)
  input/     keyboard and touch input
  ui/        menu screens and tutorial hints
  audio/     procedural sound
  save/      best scores and settings in localStorage
  game.ts    screen flow (menu, briefing, play, pause, debrief)
```

The simulation never touches the DOM or the canvas, so a different renderer (for example a 3D one) can be dropped in.

## Deploying to GitHub Pages

The repo includes a workflow, `.github/workflows/deploy.yml`, that builds the site and publishes it on every push to `main`.

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository settings, open **Pages** and set **Source** to **GitHub Actions**.
3. Push (or run the workflow by hand). The game appears at `https://<user>.github.io/<repo>/`.

The build uses relative asset paths, so it works under any repository name.

## Sources for the mission facts

Briefing facts were checked against the Wikipedia article on Dragonfly (July 2028 launch on a Falcon Heavy, 2034 arrival, up to 8 km per flight, instrument roles, Titan's 1.45x atmospheric pressure and 13.8% gravity). The official mission site is <https://dragonfly.jhuapl.edu/>.
