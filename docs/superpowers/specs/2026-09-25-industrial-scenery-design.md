# Industrial scenery: hangars, decor, indoor lighting (step 1 of 3)

Date: 2026-09-25. Concept art: `assets/concept/map/` (Higgsfield, original designs).

## Why

Tracks run on flat grass inside a stadium, so the game looks empty next to
Trackmania, where the road rides walls and enters big buildings. The user chose
to keep the stadium but fill it with giant industrial structures.

Agreed plan (20 questions, see conversation of 2026-09-25):

1. **Look (this spec):** hangars over the track, industrial decor, truss supports,
   dim hangar interiors with lamps. Auto decor on every track, including the
   10 existing campaign tracks (their layouts and medal times stay the same).
2. Wall driving that holds by speed (like TM), per-block edge choice (low curb,
   high wall, none), half-pipes. Separate spec.
3. New campaign: 30–45 s tracks, separate full-speed and technical tracks, not
   hard. Separate spec. Step 1 adds one showcase technical track with a hangar.

Style: industrial metal (corrugated panels, steel trusses, yellow/black hazard
stripes). Target hardware: the user's MacBook.

## Track data

Backward compatible additions to the track object (and share code keys `h`, `d`):

- `hangars: [[x0, z0, x1, z1], ...]` inclusive cell rectangle. The height is not
  stored: roof = max(3 levels, top of the blocks inside + 12 m, rounded up to a level).
- `decor: [[type, x, z, rot], ...]` manual decor on ground cells.

## Scenery geometry (`src/track/scenery.js`, runs in Node)

Plain `GeoBuffer` geometry plus collision triangles, like track blocks, so the
physics and the AI tests see the same walls.

- **Hangar:** walls on the rectangle's cell boundaries, built as panels of one
  cell face × one level. A panel is a gate (left open) when the cells on both
  sides at that level hold track blocks, so every road that crosses the wall
  gets a 32 m wide opening. Hazard-striped gate frames, steel columns, roof with
  trusses and skylight strips, concrete floor, orange strip lights on the
  inner walls, one hanging lamp per cell. Walls, roof and floor collide.
- **Decor catalogue** (each fits one 32 m cell): `crane`, `containers`,
  `light` (floodlight mast), `screen` (LED screen on truss legs), `tanks`,
  `scaffold` (truss tower with beacon), `crates`. Simple box collision at the base.
- **Auto decor:** deterministic (seeded by the track), on free cells inside the
  stadium: not under or next to any block, not near the driving line (route
  points, which include kicker jumps), not in or next to hangars, not on manual
  decor. Small items near the road, tall items further out, at most 3 cranes.
- **Truss supports:** the concrete pillars under raised road become steel
  lattice pylons (same collision box as before).

## Indoor lighting (`src/render/indoor.js`)

A shader patch on the standard materials (track, scenery, ground, car): inside a
hangar box (soft 2 m edge) sun and sky light are scaled down to a dim level,
and up to 24 hangar lamps nearest the camera add warm light pools. Lamps and
strip lights are emissive, so bloom makes them glow. No extra real lights, so
the cost stays low.

## Editor

Two new tabs next to the block tabs:

- **Hangar:** drag a rectangle on the ground (min 2×2 cells, no overlap).
  Shown as translucent walls without a roof. Right-click inside one deletes it.
- **Decor:** pick an item, click a free ground cell, `R` rotates, right-click deletes.
  Placing a block over decor removes that decor in the same (undoable) edit.

Undo/redo, save, share codes, test drive and My Tracks carry hangars and decor.

## Testing

- `tests/tracks.mjs` and `tests/medals.mjs`: every campaign track, including the
  hangar track, is finished by the AI with no respawns; old medal times unchanged.
- A Node check that gates open wherever the road crosses a hangar wall.
- Headless Chrome: screenshots outside/inside a hangar, decor, editor tools; no
  console errors; the artifact build loads under a strict CSP.
