// Block catalogue. Every block is described in its own local frame:
//  - it is entered from the south face of local cell (0,0,0), travelling north (-Z)
//  - `ports` are the connection points (face centres) with an outward heading
//  - `frames` is the road centreline, swept later into road geometry
// Headings: 0 = north (-Z), 1 = east (+X), 2 = south (+Z), 3 = west (-X)

import { CELL, LEVEL, HALF, ROAD_Y, ROAD_HALF, WALL_T, WALL_H, LOOP_R, PIPE } from '../config.js';

// ---- tiny vector helpers on [x, y, z] arrays ---------------------------------
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const UP = [0, 1, 0];

// rotation of block local coords around Y by quarter turns
// x' = x*c + z*s ; z' = -x*s + z*c   (rot 1 maps north -> east)
export const ROT = [[1, 0], [0, -1], [-1, 0], [0, 1]];
export function rotXZ(x, z, rot) {
  const [c, s] = ROT[rot & 3];
  return [x * c + z * s, -x * s + z * c];
}
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// frame = { p, f (forward), r (right), u (up) }
function frameUp(p, f, up0 = UP) {
  f = vnorm(f);
  const r = vnorm(vcross(f, up0));
  const u = vcross(r, f);
  return { p, f, r, u };
}

function frameRight(p, f, r0) {
  f = vnorm(f);
  const r = vnorm(vsub(r0, vscale(f, vdot(r0, f))));
  const u = vcross(r, f);
  return { p, f, r, u };
}

// tilt the cross-section around the forward axis; positive = right side down
function bankFrame(fr, b) {
  const c = Math.cos(b), s = Math.sin(b);
  return {
    p: fr.p, f: fr.f,
    u: vadd(vscale(fr.u, c), vscale(fr.r, s)),
    r: vsub(vscale(fr.r, c), vscale(fr.u, s)),
  };
}

function withArcLength(frames) {
  let s = 0;
  frames[0].s = 0;
  for (let i = 1; i < frames.length; i++) {
    s += vlen(vsub(frames[i].p, frames[i - 1].p));
    frames[i].s = s;
  }
  return frames;
}

// ---- centreline generators ----------------------------------------------------
function straightPath(len = 1) {
  return [
    frameUp([0, ROAD_Y, HALF], [0, 0, -1]),
    frameUp([0, ROAD_Y, HALF - CELL * len], [0, 0, -1]),
  ];
}

// quarter turn to the right of radius (n - 0.5) cells; entering it from the
// other port makes it a left turn
// `plateau` holds the full bank through the middle of the curve (wall rides),
// `lift` is how much of the half width the centreline is raised by at full bank
function curvePath(n, bank = 0, plateau = 0, lift = 1) {
  const R = (n - 0.5) * CELL;
  const segs = Math.max(12, Math.ceil((R * Math.PI / 2) / (bank ? 1.6 : 2.2)));
  const out = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * Math.PI / 2;
    let fr = frameUp([R - R * Math.cos(a), ROAD_Y, HALF - R * Math.sin(a)], [Math.sin(a), 0, -Math.cos(a)]);
    if (bank) {
      let k;
      if (plateau > 0) {
        const edge = (1 - plateau) / 2;
        const x = Math.min(1, Math.min(t, 1 - t) / edge);
        k = x * x * (3 - 2 * x);
      } else k = Math.pow(Math.sin(Math.PI * t), 2);
      const b = bank * k;
      fr = bankFrame(fr, b);
      fr.p = [fr.p[0], fr.p[1] + (ROAD_HALF + WALL_T) * Math.sin(b) * lift, fr.p[2]];
    }
    out.push(fr);
  }
  return out;
}

// smooth S-shaped elevation change
function hillPath(len, rise) {
  const L = CELL * len, D = LEVEL * rise;
  const segs = 14 * len + 6 * rise;
  const out = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = ROAD_Y + D * (1 - Math.cos(Math.PI * t)) / 2;
    out.push(frameUp([0, y, HALF - L * t], [0, D * Math.PI / 2 * Math.sin(Math.PI * t), -L]));
  }
  return out;
}

// kicker: flat entry, launches the car at the end
function rampPath(rise) {
  const segs = 16;
  const out = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    out.push(frameUp([0, ROAD_Y + rise * t * t, HALF - CELL * t], [0, 2 * rise * t, -CELL]));
  }
  return out;
}

// Vertical loop that shifts one cell sideways so the exit clears the entry.
// The road surface follows the curve's principal normal (a geodesic), so a
// car drives through it without steering.
function loopPath(side) {
  const R = LOOP_R, segs = 132, TAU = Math.PI * 2;
  const out = [frameUp([0, ROAD_Y, HALF], [0, 0, -1])];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, th = u * TAU;
    const sh = u * u * u * (u * (u * 6 - 15) + 10);
    const sh1 = 30 * u * u * (u - 1) * (u - 1);
    const sh2 = 60 * u * (2 * u - 1) * (u - 1);
    const p = [side * CELL * sh, ROAD_Y + R - R * Math.cos(th), -HALF - R * Math.sin(th)];
    const d1 = [side * CELL * sh1, R * Math.sin(th) * TAU, -R * Math.cos(th) * TAU];
    const d2 = [side * CELL * sh2, R * Math.cos(th) * TAU * TAU, R * Math.sin(th) * TAU * TAU];
    const f = vnorm(d1);
    const n = vnorm(vsub(d2, vscale(f, vdot(d2, f))));
    const r = vnorm(vcross(f, n));
    out.push({ p, f, r, u: vcross(r, f) });
  }
  out.push(frameUp([side * CELL, ROAD_Y, -HALF - CELL], [0, 0, -1]));
  return out;
}

// ---- catalogue -------------------------------------------------------------------
export const BLOCKS = {};
export const BLOCK_LIST = [];

function P(x, y, z, d, extra = {}) {
  return { p: [x, y, z], d, ...extra };
}

const SOUTH_IN = () => P(0, 0, HALF, 2);

function def(id, spec) {
  const b = { id, profile: 'road', feature: null, cat: 'road', surfaces: true, ...spec };
  b.frames = withArcLength(spec.path());
  b.length = b.frames[b.frames.length - 1].s;
  b.cells = computeCells(b);
  BLOCKS[id] = b;
  BLOCK_LIST.push(b);
  return b;
}

// occupied cells, found by sampling the swept road volume
function computeCells(b) {
  const set = new Map();
  const halfW = b.profile === 'platform' ? HALF - 0.6 : b.profile === 'pipe' ? PIPE.floor + PIPE.radius + PIPE.lip - 0.15 : ROAD_HALF + WALL_T - 0.15;
  const tall = b.profile === 'pipe' ? PIPE.wall * 0.95 : WALL_H * 0.9;
  const fr = b.frames;
  const add = (pt) => {
    const cx = Math.floor((pt[0] + HALF) / CELL);
    const cz = Math.floor((pt[2] + HALF) / CELL);
    const cy = Math.floor(Math.max(0, pt[1] - 0.05) / LEVEL);
    const key = `${cx},${cy},${cz}`;
    if (!set.has(key)) set.set(key, [cx, cy, cz]);
  };
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], c = fr[i + 1];
    const d = vlen(vsub(c.p, a.p));
    const steps = Math.max(1, Math.ceil(d / 1.5));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      let p = vlerp(a.p, c.p, t);
      const f = vnorm(vlerp(a.f, c.f, t));
      const r = vnorm(vlerp(a.r, c.r, t));
      const u = vnorm(vlerp(a.u, c.u, t));
      if (i === 0 && k === 0) p = vadd(p, vscale(f, 0.08));
      if (i === fr.length - 2 && k === steps) p = vsub(p, vscale(f, 0.08));
      for (let w = -halfW; w <= halfW + 1e-6; w += halfW / 5) {
        add(vadd(p, vscale(r, w)));
        if (b.profile !== 'platform') add(vadd(vadd(p, vscale(r, w)), vscale(u, tall)));
      }
    }
  }
  return [...set.values()];
}

// Straights and specials
def('straight', { name: 'Straight', cat: 'road', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('start', { name: 'Start', cat: 'special', feature: 'start', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('cp', { name: 'Checkpoint', cat: 'special', feature: 'cp', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('finish', { name: 'Finish', cat: 'special', feature: 'finish', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('boost', { name: 'Turbo', cat: 'special', feature: 'boost', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('superboost', { name: 'Super Turbo', cat: 'special', feature: 'superboost', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });

// Curves (right turn from port 0, left turn from port 1)
def('curve1', { name: 'Tight Curve', cat: 'road', path: () => curvePath(1), ports: [SOUTH_IN(), P(HALF, 0, 0, 1)] });
def('curve2', { name: 'Curve', cat: 'road', path: () => curvePath(2), ports: [SOUTH_IN(), P(CELL + HALF, 0, -CELL, 1)] });
def('curve3', { name: 'Wide Curve', cat: 'road', path: () => curvePath(3), ports: [SOUTH_IN(), P(2 * CELL + HALF, 0, -2 * CELL, 1)] });
def('curve4', { name: 'Sweeper', cat: 'road', path: () => curvePath(4), ports: [SOUTH_IN(), P(3 * CELL + HALF, 0, -3 * CELL, 1)] });

// Elevation
def('hill1', { name: 'Steep Slope', cat: 'slope', path: () => hillPath(1, 1), ports: [SOUTH_IN(), P(0, LEVEL, -HALF, 0)] });
def('hill2', { name: 'Slope', cat: 'slope', path: () => hillPath(2, 1), ports: [SOUTH_IN(), P(0, LEVEL, -HALF - CELL, 0)] });
def('hill22', { name: 'Double Slope', cat: 'slope', path: () => hillPath(2, 2), ports: [SOUTH_IN(), P(0, 2 * LEVEL, -HALF - CELL, 0)] });
def('hill3', { name: 'Gentle Slope', cat: 'slope', path: () => hillPath(3, 1), ports: [SOUTH_IN(), P(0, LEVEL, -HALF - 2 * CELL, 0)] });
def('hill32', { name: 'Long Climb', cat: 'slope', path: () => hillPath(3, 2), ports: [SOUTH_IN(), P(0, 2 * LEVEL, -HALF - 2 * CELL, 0)] });
def('hill42', { name: 'Grand Climb', cat: 'slope', path: () => hillPath(4, 2), ports: [SOUTH_IN(), P(0, 2 * LEVEL, -HALF - 3 * CELL, 0)] });
// long, gentle slopes: their crests hold the car at full speed
def('hill52', { name: 'Long Slope', cat: 'slope', path: () => hillPath(5, 2), ports: [SOUTH_IN(), P(0, 2 * LEVEL, -HALF - 4 * CELL, 0)] });
def('hill63', { name: 'Great Climb', cat: 'slope', path: () => hillPath(6, 3), ports: [SOUTH_IN(), P(0, 3 * LEVEL, -HALF - 5 * CELL, 0)] });
def('ramp', { name: 'Kicker', cat: 'slope', path: () => rampPath(2.6), ports: [SOUTH_IN(), P(0, 2.6, -HALF, 0, { open: true })] });
def('rampBig', { name: 'Big Kicker', cat: 'slope', path: () => rampPath(4.2), ports: [SOUTH_IN(), P(0, 4.2, -HALF, 0, { open: true })] });

// Stunts
def('loop', { name: 'Loop Right', cat: 'stunt', guided: { lateral: 3, damp: 3.5, yaw: 6, stick: 6 }, path: () => loopPath(1), ports: [SOUTH_IN(), P(CELL, 0, -HALF - CELL, 0)] });
def('loopL', { name: 'Loop Left', cat: 'stunt', guided: { lateral: 3, damp: 3.5, yaw: 6, stick: 6 }, path: () => loopPath(-1), ports: [SOUTH_IN(), P(-CELL, 0, -HALF - CELL, 0)] });
def('bank2', { name: 'Banked Curve', cat: 'stunt', path: () => curvePath(2, 0.42, 0, 0), ports: [SOUTH_IN(), P(CELL + HALF, 0, -CELL, 1)] });
def('bank3', { name: 'Banked Sweeper', cat: 'stunt', path: () => curvePath(3, 0.5, 0, 0), ports: [SOUTH_IN(), P(2 * CELL + HALF, 0, -2 * CELL, 1)] });
def('wallride', { name: 'Wall Ride', cat: 'stunt', guided: { lateral: 1.6, damp: 2.4, yaw: 3, stick: 30, reach: 8, align: 5 }, path: () => curvePath(3, 1.05, 0.45, 0.45), ports: [SOUTH_IN(), P(2 * CELL + HALF, 0, -2 * CELL, 1)] });

// Open platform (no walls, connects on all four sides)
def('platform', {
  name: 'Platform', cat: 'platform', profile: 'platform',
  path: () => straightPath(1),
  ports: [SOUTH_IN(), P(0, 0, -HALF, 0), P(HALF, 0, 0, 1), P(-HALF, 0, 0, 3)],
});

// Checkpoint and finish for plazas: a banner across the whole cell; side-by-side
// cells form one wide gate (see mergeGates in track.js)
def('cpPad', { name: 'Plaza Checkpoint', cat: 'platform', profile: 'platform', feature: 'cp', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0), P(HALF, 0, 0, 1), P(-HALF, 0, 0, 3)] });
def('finishPad', { name: 'Plaza Finish', cat: 'platform', profile: 'platform', feature: 'finish', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0), P(HALF, 0, 0, 1), P(-HALF, 0, 0, 3)] });

// Half-pipes: ride up the curved sides; above ~200 km/h the car holds on the walls
def('pipe', { name: 'Half-Pipe', cat: 'pipe', profile: 'pipe', path: () => straightPath(1), ports: [SOUTH_IN(), P(0, 0, -HALF, 0)] });
def('pipe2', { name: 'Half-Pipe Curve', cat: 'pipe', profile: 'pipe', path: () => curvePath(2), ports: [SOUTH_IN(), P(CELL + HALF, 0, -CELL, 1)] });
def('pipe3', { name: 'Half-Pipe Sweeper', cat: 'pipe', profile: 'pipe', path: () => curvePath(3), ports: [SOUTH_IN(), P(2 * CELL + HALF, 0, -2 * CELL, 1)] });

export const CATEGORIES = [
  { id: 'road', name: 'Road' },
  { id: 'slope', name: 'Slopes' },
  { id: 'stunt', name: 'Stunts' },
  { id: 'special', name: 'Special' },
  { id: 'platform', name: 'Platform' },
  { id: 'pipe', name: 'Pipes' },
];

// For a block entered through `entry`, which port does the car leave through?
export function exitPort(def, entry) {
  if (def.ports.length === 2) return 1 - entry;
  return [1, 0, 3, 2][entry];
}

// Transform a local port to world coordinates for a placed block
export function worldPort(block, idx) {
  const def = BLOCKS[block.type];
  const lp = def.ports[idx];
  const [x, z] = rotXZ(lp.p[0], lp.p[2], block.rot);
  return {
    p: [block.x * CELL + x, block.y * LEVEL + lp.p[1], block.z * CELL + z],
    d: (lp.d + block.rot) & 3,
    open: !!lp.open,
    idx,
  };
}

export function worldCells(block) {
  const def = BLOCKS[block.type];
  return def.cells.map(([cx, cy, cz]) => {
    const [x, z] = rotXZ(cx, cz, block.rot);
    return [block.x + x, block.y + cy, block.z + z];
  });
}

// local frame -> world frame for a placed block
export function worldFrame(block, fr) {
  const rot = block.rot;
  const ox = block.x * CELL, oy = block.y * LEVEL, oz = block.z * CELL;
  const tp = (v) => { const [x, z] = rotXZ(v[0], v[2], rot); return [x, v[1], z]; };
  const p = tp(fr.p);
  return { p: [p[0] + ox, p[1] + oy, p[2] + oz], f: tp(fr.f), r: tp(fr.r), u: tp(fr.u), s: fr.s };
}

export function portKey(p) {
  return `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)},${Math.round(p[2] * 2)}`;
}
