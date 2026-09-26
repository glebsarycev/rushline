# Rushline

An arcade stunt time-attack racer for the browser, in the spirit of block-built
stadium racers: loops, kickers, wall rides, turbo pads, checkpoints, ghosts,
medals and a block track editor. Everything (car, tracks, textures, sounds and
music) is original and generated in code; the only library is Three.js.

## Play

**macOS:** double-click `start.command`. It starts a local server and opens the
game in your browser. Keep the Terminal window open while you play.

**Any system:** from this folder run

```sh
python3 -m http.server 8080
```

and open <http://localhost:8080>. The game needs to be served over http because
it uses JavaScript modules; opening `index.html` directly from the file system
won't work. An internet connection is only used for the UI fonts.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate | ↑ / W | RT or A |
| Brake / reverse | ↓ / S / Space | LT or X |
| Steer | ← → / A D | Left stick / d-pad |
| Respawn at last checkpoint | Enter / Backspace | B |
| Restart the run | R / Delete | Y |
| Camera (close, far, hood) | C or 1 / 2 / 3 | RB / Back |
| Ghost on/off | G | LB |
| Pause | Esc / P | Start |
| Mute | M | |

On phones and tablets touch buttons appear during races.

**Drifting:** tap the brake while steering at speed. A drift turns tighter than
grip driving but costs speed. **Respawning** keeps the clock running and puts you
back on the last checkpoint with the speed you had there.

## What's in it

- **Campaign:** 10 tracks of 30-45 s, each marked **FS** (full speed: never
  lift) or **TECH** (brake for the corners), with Bronze, Silver, Gold and Author
  medals. `tests/campaign.mjs` checks every track against its style: the AI
  finishes cleanly in 30-45 s, a never-lift driver finishes FS tracks cleanly and
  crashes out of TECH ones. Medal times come from AI runs (`npm run medals`).
- **Premium environment:** four times of day (morning, day, sunset, night) and
  four landscapes (mountains, city, sea, canyon) chosen per track; skies and
  landscapes are Higgsfield pictures, the stadium is a TM2020-style bowl with
  three tiers of spectators, scrolling LED ribbons, a roof canopy and giant
  screens, and the field is a striped stadium lawn.
- **Industrial stadium:** hangars built over parts of the road (gates open
  automatically where the road crosses a wall, dim inside with hanging lamps),
  steel truss supports under raised road, and decor around every track: cranes,
  container stacks, floodlights, LED screens, tanks, scaffolds, crates.
- **Personal best ghost** and live checkpoint splits (blue = faster, red = slower).
- **Surfaces:** asphalt, dirt, ice and grass, each with its own grip.
- **Stunt blocks:** loops, wall rides, banked turns, kickers, platforms, turbo and
  super turbo pads.
- **Track editor:** place blocks on the grid, stack them in levels, pick road,
  dirt or ice, test drive, set the author time by finishing your own track, save,
  and share tracks as a text code (My tracks → Share / Import code).
- **Menu attract mode:** the AI drives the campaign behind the menu with TV-style
  cameras.
- Settings for sound, graphics quality, glow, camera, units and car colour.
  Records and custom tracks are stored in your browser (localStorage).

## Track editor

| Action | Input |
| --- | --- |
| Place block | Left click |
| Delete block | Right click (or Erase tool) |
| Rotate | R (Shift+R backwards) |
| Level up / down | E / Q |
| Surface road → dirt → ice | F |
| Orbit / pan / zoom | Right-drag / Shift-drag / wheel |
| Move camera | W A S D |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Test drive | T |
| Hangar | Hangar tab, drag a rectangle on the ground |
| Decor | Decor tab, pick an item, click a free cell (R rotates) |

Yellow arrows mark open road ends; hovering the cell in front of one turns the
selected block to connect automatically. A track needs one Start and at least
one Finish. Finish a test drive and choose *Use as author time* to validate it.

Hangars cover at least 2×2 cells and at most 16 cells per side (up to 8 per
track). The roof height follows the tallest block inside. A block placed on a
decor cell replaces the decor; tall decor (cranes, screens...) can't stand under
a hangar roof. Every track also gets automatic decor around it at race time.

## Industrial scenery

`src/track/scenery.js` builds hangars, decor and the steel truss supports as
plain geometry with collision (so the physics and the AI tests see the same
walls). Track data carries it as `hangars: [[x0, z0, x1, z1]]` and
`decor: [[type, x, z, rot]]`; both are optional and saved in share codes.
Hangar walls are made of one-cell, one-level panels; a panel is left open as a
gate when track blocks sit on both sides of it at that level.
`src/render/indoor.js` patches the standard materials: inside a hangar the sun
and sky light fade out and the 24 lamps nearest the camera light the scene.
Design notes: `docs/superpowers/specs/2026-09-25-industrial-scenery-design.md`,
concept art: `assets/concept/map/`.

## Environment

`src/render/sky.js` draws the sky dome from `assets/env/sky-*.jpg`: each is the
upper half of an equirectangular panorama (horizon row and sun position are in
`SKIES`), so the sun light, fog colour and reflections follow the picture. Low
suns are lifted (`skyLift`) to clear the stadium roof. `assets/env/land-*.webp`
are photos with the sky removed (Higgsfield background removal), wrapped around
the horizon in mirrored copies and tinted per time of day; the sea's water and
the city's night windows are drawn in the shader. `src/render/stadium.js` sweeps
the stand cross-section along the rounded field outline
(`src/track/stadiumShape.js`). Presets live in `ENV_PRESETS`
(`src/render/environment.js`); tracks pick `env` and `land`.
Design notes: `docs/superpowers/specs/2026-09-26-premium-environment-design.md`,
concept art: `assets/concept/env/`.

## Player car

The car is a real 3D model: `assets/models/rushline-racer.glb` (glTF 2.0 binary,
about 20k triangles, 13 PBR materials, embedded textures). It was designed from
the Higgsfield concept art in `assets/concept/` and is generated by
`tools/car/build-car.mjs`, which takes its dimensions (wheelbase, track, wheel
radius, ride height) from the physics car in `src/physics/vehicle.js`, so the
model always matches the simulation.

- Conventions: metres, +Y up, forward −Z (same as the game), origin on the
  ground below the centre of mass.
- Materials: `Paint` (clear-coated, roughness-varied), `Carbon` (woven texture),
  `Glass`, `Trim`, `Interior`, `Helmet`, `Metal`, `HeadLight` and `TailLight`
  (emissive), `Tire`, `Rim`, `BrakeDisc`, `Caliper`.
- Nodes the game drives: `wheel_fl/fr/rl/rr` (steering and suspension pivots),
  `wheel_<id>_spin` (rolling), `arm_<id>_upper/lower` (suspension rods),
  `exhaust_l/r` (turbo flames) and `headlight_anchor` (night headlight).
- Loading: the game loads `assets/models/rushline-racer.glb.js`, the same GLB
  bytes as a base64 ES module, and `src/render/carAsset.js` parses it with
  Three.js `GLTFLoader` in memory (textures are decoded with
  `createImageBitmap`). This works on pages with a strict Content-Security-Policy,
  such as the published artifact, where the data:/blob: fetches `GLTFLoader`
  normally makes are blocked. `src/render/glbCarView.js` renders the player car
  and the ghost from it. If the model can't be loaded the game falls back to the
  built-in procedural car in `src/render/carModel.js`.
- Rebuild after changing the design: `npm run build:car` (needs Node.js).
  `tools/car/preview.html` shows the model in a studio scene.

## Project layout

```
index.html            page shell + import map
styles/main.css       UI styles
src/main.js           entry point
src/app.js            renderer, scene, game modes and main loop
src/config.js         world grid, physics rate, surfaces
src/track/            block catalogue, geometry sweeps, track assembly, scenery
                      (hangars, decor, supports), route for the AI, campaign
                      builder and tracks, medals
src/physics/          collision world (spatial hash) and the car model
src/game/             race timing, ghosts, AI driver, records/storage
src/render/           textures, materials, meshes, car views and model loading,
                      sky/stadium, hangar lighting, effects, cameras, post-processing
assets/models/        the player car model (.glb)
assets/concept/       Higgsfield concept art for the car and (map/) the scenery
tools/car/            car model generator, glTF writer, studio preview page
src/audio/            synthesised engine, effects and music (Web Audio)
src/input/            keyboard, gamepad and touch
src/ui/               menus, HUD, dialogs
src/editor/           the block track editor
vendor/three/         Three.js r186 (MIT licence), incl. GLTFLoader
tests/                Node scripts for physics, tracks and medal times;
                      tests/browser/ drives the real game in headless Chrome
```

## Tests (optional, need Node.js 22+)

```sh
npm run test:physics   # acceleration, braking, cornering, drift, loop, jump, wall hit
npm run test:tracks    # the AI drives every campaign track
npm run test:campaign  # each track matches its FS / TECH style and 30-45 s
npm run medals         # recompute campaign medal times into src/track/medals.js
npm run build:car      # regenerate assets/models/rushline-racer.glb and .glb.js
npm run test:browser   # drive the real game in headless Chrome (needs puppeteer-core)
```
