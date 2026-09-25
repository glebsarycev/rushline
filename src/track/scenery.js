// Industrial scenery around a track: hangars built over parts of the road,
// decor items (placed by the author or automatically) and steel truss supports.
// Plain GeoBuffer geometry with collision, like the blocks, so it also runs in
// Node for the physics and AI tests.
//
// Track data (both optional):
//   hangars: [[x0, z0, x1, z1], ...]   inclusive cell rectangle; height is automatic
//   decor:   [[type, x, z, rot], ...]  one ground cell each

import { CELL, LEVEL, HALF, SURF } from '../config.js';
import { GeoBuffer } from './geometry.js';
import { worldCells, rotXZ, DIRS } from './blocks.js';
import { rng, hashString } from '../util/math.js';

export const DECOR_TYPES = [
  { id: 'containers', name: 'Containers', tall: false },
  { id: 'crates', name: 'Crates', tall: false },
  { id: 'light', name: 'Floodlight', tall: true },
  { id: 'screen', name: 'Screen', tall: true },
  { id: 'tanks', name: 'Tanks', tall: true },
  { id: 'scaffold', name: 'Scaffold', tall: true },
  { id: 'crane', name: 'Crane', tall: true },
];
export const DECOR = Object.fromEntries(DECOR_TYPES.map((d) => [d.id, d]));

const WALL_T = 0.8;          // hangar wall thickness
const MIN_HANGAR_H = 3 * LEVEL;
const LAMP_DROP = 3;         // lamps hang at least this far below the roof
const CONTAINER_KEYS = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange'];

// ---- track occupancy ------------------------------------------------------------------------
export function occupancy(blocks) {
  const cells = new Set();
  const cols = new Map(); // "x,z" -> top of the highest block cell (m)
  for (const b of blocks) {
    for (const [x, y, z] of worldCells(b)) {
      cells.add(x + ',' + y + ',' + z);
      const k = x + ',' + z;
      cols.set(k, Math.max(cols.get(k) ?? 0, (y + 1) * LEVEL));
    }
  }
  return { cells, cols, has: (x, y, z) => cells.has(x + ',' + y + ',' + z) };
}

export function parseHangars(list) {
  const out = [];
  for (const h of list || []) {
    if (!Array.isArray(h) || h.length < 4) continue;
    const [a, b, c, d] = h.map((v) => v | 0);
    out.push({ x0: Math.min(a, c), z0: Math.min(b, d), x1: Math.max(a, c), z1: Math.max(b, d) });
  }
  return out;
}

export const hangarContains = (h, x, z) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1;

// roof height: clear of every block inside, at least three levels
export function hangarHeight(h, occ) {
  let top = 0;
  for (let x = h.x0; x <= h.x1; x++) for (let z = h.z0; z <= h.z1; z++) top = Math.max(top, occ.cols.get(x + ',' + z) ?? 0);
  return Math.max(MIN_HANGAR_H, Math.ceil((top + 12) / LEVEL) * LEVEL);
}

// ---- local placement helper: builds a decor item in its own cell frame ------------------------
// local -Z is the item's front; rot turns it like a block (1 = front faces east)
class Place {
  constructor(buf, x, z, rot) {
    this.buf = buf; this.ox = x * CELL; this.oz = z * CELL; this.rot = rot & 3;
  }
  p(x, y, z) { const [wx, wz] = rotXZ(x, z, this.rot); return [this.ox + wx, y, this.oz + wz]; }
  n(x, y, z) { const [wx, wz] = rotXZ(x, z, this.rot); return [wx, y, wz]; }
  box(key, x, y, z, sx, sy, sz, surf = null, uv = 0.25, skipBottom = true) {
    const [cx, , cz] = this.p(x, 0, z);
    const odd = this.rot & 1;
    this.buf.box(key, cx, y, cz, odd ? sz : sx, sy, odd ? sx : sz, surf, uv, skipBottom);
  }
  beam(key, a, b, w, h = w) { this.buf.beam(key, this.p(...a), this.p(...b), w, h); }
  cyl(key, x, y, z, r, h, seg = 16, surf = null) { const [cx, , cz] = this.p(x, 0, z); this.buf.cylinder(key, cx, y, cz, r, h, seg, surf); }
  flat(key, a, b, c, d, n, uv0, uv1) { this.buf.flat(key, this.p(...a), this.p(...b), this.p(...c), this.p(...d), this.n(...n), uv0, uv1); }
}

// square lattice tower: corner posts, X braces on every face, ties at each segment
function lattice(P, key, cx, cz, w, y0, y1, seg, post = 0.35, brace = 0.18) {
  const h = w / 2;
  const n = Math.max(1, Math.round((y1 - y0) / seg));
  const dy = (y1 - y0) / n;
  const C = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [x, z] of C) P.beam(key, [cx + x, y0, cz + z], [cx + x, y1, cz + z], post);
  for (let i = 0; i < n; i++) {
    const ya = y0 + i * dy, yb = ya + dy;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
      P.beam(key, [cx + ax, ya, cz + az], [cx + bx, yb, cz + bz], brace);
      P.beam(key, [cx + bx, ya, cz + bz], [cx + ax, yb, cz + az], brace);
      P.beam(key, [cx + ax, yb, cz + az], [cx + bx, yb, cz + bz], brace);
    }
  }
}

// horizontal lattice girder along local X from xa to xb, square section w, bottom at y
function girder(P, key, xa, xb, y, z, w, seg, brace = 0.16) {
  const h = w / 2;
  const n = Math.max(1, Math.round(Math.abs(xb - xa) / seg));
  const dx = (xb - xa) / n;
  const C = [[-h, 0], [h, 0], [h, w], [-h, w]]; // (z offset, y offset)
  for (const [oz, oy] of C) P.beam(key, [xa, y + oy, z + oz], [xb, y + oy, z + oz], 0.3);
  for (let i = 0; i < n; i++) {
    const xa2 = xa + i * dx, xb2 = xa2 + dx;
    for (let k = 0; k < 4; k++) {
      const [az, ay] = C[k], [bz, by] = C[(k + 1) % 4];
      P.beam(key, [xa2, y + ay, z + az], [xb2, y + by, z + bz], brace);
    }
  }
}

// ---- decor catalogue -----------------------------------------------------------------------------
const W = SURF.WALL;
const BUILD = {
  containers(P, rand) {
    const L = 12.2, H = 2.6, D = 2.45;
    const rows = [-4.2, -1.4, 1.4];
    const count = 2 + ((rand() * 2) | 0);
    for (let r = 0; r < count; r++) {
      const zc = rows[r] + (rand() - 0.5) * 0.6;
      const xc = (rand() - 0.5) * 6;
      const stack = 1 + ((rand() * (r === 0 ? 3 : 2)) | 0);
      for (let s = 0; s < stack; s++) {
        const key = CONTAINER_KEYS[(rand() * CONTAINER_KEYS.length) | 0];
        const jitter = (rand() - 0.5) * 0.8;
        P.box(key, xc + jitter, s * H + H / 2, zc, L, H, D, W, 0.25);
      }
    }
  },
  crates(P, rand) {
    for (let i = 0; i < 7; i++) {
      const x = (rand() - 0.5) * 18, z = (rand() - 0.5) * 18;
      const s = 1.4 + rand() * 1.2;
      const n = 1 + ((rand() * 3) | 0);
      P.box('pallet', x, 0.08, z, s + 0.3, 0.16, s + 0.3, null);
      for (let k = 0; k < n; k++) P.box('crate', x, 0.16 + k * s + s / 2, z, s, s, s, W, 0.5);
    }
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 20, z = (rand() - 0.5) * 20;
      P.cyl(i & 1 ? 'barrelBlue' : 'barrelRed', x, 0, z, 0.45, 1.3, 10, W);
    }
  },
  light(P) {
    P.box('plinth', 0, 0.5, 0, 3, 1, 3, W);
    P.beam('steelDark', [0, 1, 0], [0, 34, 0], 1.1);
    P.box(null, 0, 17, 0, 1.2, 34, 1.2, W);
    P.box('steelDark', 0, 34, 0.6, 9, 5, 0.8);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = -3.3 + i * 2.2, y = 32.8 + j * 2.4;
      P.flat('lampCool', [x - 0.9, y - 0.9, 0.18], [x + 0.9, y - 0.9, 0.18], [x + 0.9, y + 0.9, 0.18], [x - 0.9, y + 0.9, 0.18], [0, 0, -1], [0, 0], [1, 1]);
    }
    P.box('steel', 0, 30.5, 0, 4, 0.3, 4);
  },
  screen(P) {
    for (const x of [-7.5, 7.5]) {
      lattice(P, 'steelDark', x, 0, 2.2, 0, 11, 2.75, 0.3, 0.14);
      P.box(null, x, 5.5, 0, 2.4, 11, 2.4, W);
      P.box('plinth', x, 0.3, 0, 3.2, 0.6, 3.2, W);
    }
    P.box('steelDark', 0, 16, 0.5, 20, 10.4, 0.9);
    P.flat('screen', [9.6, 11.2, 0], [-9.6, 11.2, 0], [-9.6, 20.8, 0], [9.6, 20.8, 0], [0, 0, -1], [0, 0], [1, 1]);
    P.box('hazard', 0, 10.9, 0.5, 20.4, 0.6, 1.0);
  },
  tanks(P) {
    for (const x of [-7, 7]) {
      P.box('plinth', x, 0.4, 0, 11, 0.8, 11, W);
      P.cyl('tank', x, 0.8, 0, 4.6, 12, 24, null);
      P.box(null, x, 6.8, 0, 9, 12, 9, W);
      P.cyl('hazard', x, 2.2, 0, 4.65, 0.9, 24);
      P.cyl('tank', x, 12.8, 0, 2.4, 1.2, 16);
      // ladder
      const lz = -4.75;
      P.beam('steel', [x - 0.35, 0.8, lz], [x - 0.35, 13, lz], 0.1);
      P.beam('steel', [x + 0.35, 0.8, lz], [x + 0.35, 13, lz], 0.1);
      for (let y = 1.4; y < 13; y += 0.6) P.beam('steel', [x - 0.35, y, lz], [x + 0.35, y, lz], 0.07);
    }
    P.beam('steel', [-2.4, 9, 0], [2.4, 9, 0], 0.7);
    P.beam('steel', [-2.4, 4, 1.5], [2.4, 4, 1.5], 0.5);
  },
  scaffold(P) {
    const H = 24;
    lattice(P, 'steel', 0, 0, 6, 0, H, 3, 0.4, 0.18);
    P.box(null, 0, H / 2, 0, 6.4, H, 6.4, W);
    for (const y of [8, 16, H]) P.box('grating', 0, y, 0, 7.4, 0.3, 7.4);
    for (const y of [8.6, 16.6, H + 0.6]) {
      P.box('hazard', 0, y, -3.7, 7.4, 0.9, 0.12);
      P.box('hazard', 0, y, 3.7, 7.4, 0.9, 0.12);
      P.box('hazard', -3.7, y, 0, 0.12, 0.9, 7.4);
      P.box('hazard', 3.7, y, 0, 0.12, 0.9, 7.4);
    }
    P.beam('steelDark', [0, H, 0], [0, H + 5, 0], 0.25);
    P.box('beacon', 0, H + 5.3, 0, 0.8, 0.6, 0.8);
  },
  crane(P, rand, ctx) {
    const top = ctx.craneTop;
    P.box('plinth', 0, 0.75, 0, 7, 1.5, 7, W);
    lattice(P, 'craneYellow', 0, 0, 2.8, 1.5, top, 2.8, 0.3, 0.14);
    P.box(null, 0, top / 2, 0, 3, top, 3, W);
    // slewing unit and cab
    P.box('steelDark', 0, top + 0.6, 0, 3.6, 1.2, 3.6);
    P.box('craneCab', 1.2, top - 1.4, -2.2, 2.4, 2.6, 2.2);
    // jib (+X) and counter-jib (-X)
    girder(P, 'craneYellow', 1.6, 44, top + 1.2, 0, 1.8, 3);
    girder(P, 'craneYellow', -16, -1.6, top + 1.2, 0, 1.8, 3);
    P.box('plinth', -13, top + 0.2, 0, 4, 2.4, 3.2);
    // peak and tie bars
    P.beam('craneYellow', [-1.3, top + 1.2, 0], [0, top + 9, 0], 0.4);
    P.beam('craneYellow', [1.3, top + 1.2, 0], [0, top + 9, 0], 0.4);
    P.beam('steel', [0, top + 9, 0], [30, top + 3, 0], 0.1);
    P.beam('steel', [0, top + 9, 0], [-15, top + 3, 0], 0.1);
    // trolley, hook cable and hook block
    const hx = 18 + rand() * 18, hy = top * (0.35 + rand() * 0.3);
    P.box('steelDark', hx, top + 0.9, 0, 2, 0.8, 2);
    P.beam('steel', [hx - 0.3, top + 0.5, 0], [hx - 0.3, hy, 0], 0.06);
    P.beam('steel', [hx + 0.3, top + 0.5, 0], [hx + 0.3, hy, 0], 0.06);
    P.box('hazard', hx, hy - 0.6, 0, 1.2, 1.2, 0.8);
  },
};

// manual decor looks the same in the editor and in the race
export const decorSeed = (type, x, z) => hashString(`${type}:${x | 0}:${z | 0}`);
export const CRANE_TOP_MIN = 46;

export function buildDecor(buf, type, x, z, rot, seed, ctx = { craneTop: CRANE_TOP_MIN }) {
  const fn = BUILD[type];
  if (!fn) return;
  fn(new Place(buf, x, z, rot), rng(seed >>> 0), ctx);
}

// ---- hangar ------------------------------------------------------------------------------------------
// Returns the indoor box and lamp positions; adds geometry + collision to buf.
function buildHangar(buf, h, occ) {
  const H = hangarHeight(h, occ);
  const levels = H / LEVEL;
  const X0 = h.x0 * CELL - HALF, X1 = h.x1 * CELL + HALF, Z0 = h.z0 * CELL - HALF, Z1 = h.z1 * CELL + HALF;
  const gates = [];

  // walls: one face (cell edge) at a time; a level is open where road crosses it
  const sides = [
    { n: 'N', along: 'x', a0: h.x0, a1: h.x1, fixed: Z0, inner: (a) => [a, h.z0], outer: (a) => [a, h.z0 - 1], inward: [0, 1] },
    { n: 'S', along: 'x', a0: h.x0, a1: h.x1, fixed: Z1, inner: (a) => [a, h.z1], outer: (a) => [a, h.z1 + 1], inward: [0, -1] },
    { n: 'W', along: 'z', a0: h.z0, a1: h.z1, fixed: X0, inner: (a) => [h.x0, a], outer: (a) => [h.x0 - 1, a], inward: [1, 0] },
    { n: 'E', along: 'z', a0: h.z0, a1: h.z1, fixed: X1, inner: (a) => [h.x1, a], outer: (a) => [h.x1 + 1, a], inward: [-1, 0] },
  ];
  const wallBox = (key, sd, a, y0, y1, surf) => {
    const c = a * CELL, cy = (y0 + y1) / 2, sy = y1 - y0;
    if (sd.along === 'x') buf.box(key, c, cy, sd.fixed, CELL + WALL_T, sy, WALL_T, surf, 0.25);
    else buf.box(key, sd.fixed, cy, c, WALL_T, sy, CELL + WALL_T, surf, 0.25);
  };
  // decal quad on the inner (+1) or outer (-1) face of a wall face column;
  // span limits it along the wall, uv is the texture repeat (tiles of ~4 m)
  const faceQuad = (key, sd, a, y0, y1, side, { span = [-HALF, HALF], uv = [(span[1] - span[0]) / 4, (y1 - y0) / 4] } = {}) => {
    const off = (WALL_T / 2 + 0.03) * side;
    const nx = sd.inward[0] * side, nz = sd.inward[1] * side;
    const c0 = a * CELL + span[0], c1 = a * CELL + span[1];
    let A, B, C, D;
    if (sd.along === 'x') {
      const z = sd.fixed + sd.inward[1] * off;
      A = [c0, y0, z]; B = [c1, y0, z]; C = [c1, y1, z]; D = [c0, y1, z];
    } else {
      const x = sd.fixed + sd.inward[0] * off;
      A = [x, y0, c0]; B = [x, y0, c1]; C = [x, y1, c1]; D = [x, y1, c0];
    }
    buf.flat(key, A, B, C, D, [nx, 0, nz], [0, 0], uv);
  };

  for (const sd of sides) {
    for (let a = sd.a0; a <= sd.a1; a++) {
      const [ix, iz] = sd.inner(a), [ox, oz] = sd.outer(a);
      const open = [];
      for (let L = 0; L < levels; L++) open.push(occ.has(ix, L, iz) && occ.has(ox, L, oz));
      // merge closed runs into single boxes
      let L = 0;
      while (L < levels) {
        if (open[L]) { L++; continue; }
        let e = L;
        while (e + 1 < levels && !open[e + 1]) e++;
        wallBox('hangarWall', sd, a, L * LEVEL, (e + 1) * LEVEL, W);
        L = e + 1;
      }
      if (!open[0]) {
        faceQuad('hazard', sd, a, 0.02, 1.6, 1);
        faceQuad('hazard', sd, a, 0.02, 1.6, -1);
        faceQuad('stripOrange', sd, a, 4.6, 4.9, 1, { uv: [1, 1] });
      }
      for (let k = 0; k < levels; k++) {
        if (!open[k]) continue;
        gates.push({ side: sd.n, a, level: k });
        const y0 = k * LEVEL, y1 = y0 + LEVEL;
        // striped lintel on the wall right above the gate, striped jambs outside
        if (k + 1 < levels && !open[k + 1]) {
          faceQuad('hazard', sd, a, y1, y1 + 1.4, 1);
          faceQuad('hazard', sd, a, y1, y1 + 1.4, -1);
        }
        faceQuad('hazard', sd, a, y0, y1, -1, { span: [-HALF, -HALF + 2.4] });
        faceQuad('hazard', sd, a, y0, y1, -1, { span: [HALF - 2.4, HALF] });
      }
      // clerestory windows under the roof: dark glass outside, daylight inside
      const wy0 = H - 7.5, wy1 = H - 4.5;
      if (!open[Math.floor(wy0 / LEVEL)] && !open[Math.floor(wy1 / LEVEL)]) {
        faceQuad('glassOut', sd, a, wy0, wy1, -1, { span: [-HALF + 2, HALF - 2], uv: [1, 1] });
        faceQuad('skylight', sd, a, wy0, wy1, 1, { span: [-HALF + 2, HALF - 2], uv: [7, 1] });
      }
      sd.gateLevels = (sd.gateLevels || new Set());
      open.forEach((o, k) => { if (o) sd.gateLevels.add(k); });
    }
  }

  // big sign on the outside of the long walls, where no gate cuts through it
  const signH = 7, signY0 = H - 17;
  for (const sd of sides) {
    const len = (sd.a1 - sd.a0 + 1) * CELL;
    const w = Math.min(72, len - 24);
    const hitsGate = [...(sd.gateLevels || [])].some((k) => k * LEVEL < signY0 + signH && (k + 1) * LEVEL > signY0);
    if (w < 40 || signY0 < 3 || hitsGate) continue;
    const mid = ((sd.a0 + sd.a1) / 2) * CELL;
    const off = WALL_T / 2 + 0.95;
    const n = [-sd.inward[0], 0, -sd.inward[1]];
    // u runs to the viewer's right: right = cross(-n, up)
    const r = [n[2], 0, -n[0]];
    const base = sd.along === 'x' ? [mid, 0, sd.fixed + n[2] * off] : [sd.fixed + n[0] * off, 0, mid];
    const at = (u, y) => [base[0] + r[0] * u, y, base[2] + r[2] * u];
    buf.flat('sign', at(-w / 2, signY0), at(w / 2, signY0), at(w / 2, signY0 + signH), at(-w / 2, signY0 + signH), n, [0, 0], [1, 1]);
    buf.box('steelDark', ...at(0, signY0 - 0.4), ...(sd.along === 'x' ? [w + 1, 0.8, 1.2] : [1.2, 0.8, w + 1]));
  }

  // columns on every cell corner along the walls, just inside; striped at gate edges
  const colAt = (x, z, striped) => {
    buf.box(striped ? 'hazard' : 'steelDark', x, H / 2, z, 1.3, H, 1.3, W, 0.5);
  };
  const gateEdge = new Set(gates.filter((g) => g.level === 0).flatMap((g) => [g.side + (g.a - 0.5), g.side + (g.a + 0.5)]));
  for (let a = h.x0 - 0.5; a <= h.x1 + 0.5; a += 1) {
    const x = Math.min(Math.max(a * CELL, X0 + 1.1), X1 - 1.1);
    colAt(x, Z0 + 1.1, gateEdge.has('N' + a));
    colAt(x, Z1 - 1.1, gateEdge.has('S' + a));
  }
  for (let a = h.z0 + 0.5; a <= h.z1 - 0.5; a += 1) {
    colAt(X0 + 1.1, a * CELL, gateEdge.has('W' + a));
    colAt(X1 - 1.1, a * CELL, gateEdge.has('E' + a));
  }

  // outside: pilasters at every cell edge and a fascia band under the roof edge
  const out = WALL_T / 2 + 0.45;
  for (let a = h.x0 - 0.5; a <= h.x1 + 0.5; a += 1) {
    buf.box('steelDark', a * CELL, H / 2, Z0 - out, 1.4, H, 0.9, null, 0.5);
    buf.box('steelDark', a * CELL, H / 2, Z1 + out, 1.4, H, 0.9, null, 0.5);
  }
  for (let a = h.z0 - 0.5; a <= h.z1 + 0.5; a += 1) {
    buf.box('steelDark', X0 - out, H / 2, a * CELL, 0.9, H, 1.4, null, 0.5);
    buf.box('steelDark', X1 + out, H / 2, a * CELL, 0.9, H, 1.4, null, 0.5);
  }
  buf.box('steelDark', (X0 + X1) / 2, H - 1, Z0 - out, X1 - X0 + 2.8, 2.2, 0.9, null, 0.5);
  buf.box('steelDark', (X0 + X1) / 2, H - 1, Z1 + out, X1 - X0 + 2.8, 2.2, 0.9, null, 0.5);
  buf.box('steelDark', X0 - out, H - 1, (Z0 + Z1) / 2, 0.9, 2.2, Z1 - Z0 + 2.8, null, 0.5);
  buf.box('steelDark', X1 + out, H - 1, (Z0 + Z1) / 2, 0.9, 2.2, Z1 - Z0 + 2.8, null, 0.5);

  // roof slab (collides from below and above), skylight strips underneath
  buf.box('hangarRoof', (X0 + X1) / 2, H + 0.5, (Z0 + Z1) / 2, X1 - X0 + 2, 1.0, Z1 - Z0 + 2, W, 0.25, false);
  const alongX = X1 - X0 >= Z1 - Z0;
  const rowsA = alongX ? [h.z0, h.z1] : [h.x0, h.x1];
  for (let r = rowsA[0]; r <= rowsA[1]; r++) {
    const c = r * CELL;
    if (alongX) buf.flat('skylight', [X0 + 4, H - 0.02, c + 3], [X1 - 4, H - 0.02, c + 3], [X1 - 4, H - 0.02, c - 3], [X0 + 4, H - 0.02, c - 3], [0, -1, 0], [0, 0], [(X1 - X0) / 8, 1]);
    else buf.flat('skylight', [c - 3, H - 0.02, Z0 + 4], [c - 3, H - 0.02, Z1 - 4], [c + 3, H - 0.02, Z1 - 4], [c + 3, H - 0.02, Z0 + 4], [0, -1, 0], [0, 0], [(Z1 - Z0) / 8, 1]);
  }
  // glazing strips and fans on top of the roof
  for (let r = rowsA[0]; r <= rowsA[1]; r++) {
    const c = r * CELL, y = H + 1.02;
    if (alongX) buf.flat('glassOut', [X0 + 4, y, c + 3], [X1 - 4, y, c + 3], [X1 - 4, y, c - 3], [X0 + 4, y, c - 3], [0, 1, 0]);
    else buf.flat('glassOut', [c - 3, y, Z0 + 4], [c - 3, y, Z1 - 4], [c + 3, y, Z1 - 4], [c + 3, y, Z0 + 4], [0, 1, 0]);
  }
  for (let x = h.x0; x <= h.x1; x++) {
    for (let z = h.z0; z <= h.z1; z++) {
      if ((x + z) & 1) continue;
      const cx = x * CELL + (alongX ? 0 : 9), cz = z * CELL + (alongX ? 9 : 0);
      buf.box('steelDark', cx, H + 1.8, cz, 3.2, 1.6, 3.2, null);
      buf.cylinder('steel', cx, H + 2.6, cz, 1.3, 0.5, 12);
    }
  }
  // roof trusses across the short side at every interior cell edge
  const P = new Place(buf, 0, 0, 0);
  const trussDepth = 3.6, yTop = H - 0.1, yBot = H - trussDepth;
  if (alongX) {
    for (let a = h.x0 + 0.5; a <= h.x1 - 0.5; a += 1) {
      const x = a * CELL;
      const n = Math.max(2, Math.round((Z1 - Z0) / 4));
      const dz = (Z1 - Z0) / n;
      P.beam('steel', [x, yTop, Z0], [x, yTop, Z1], 0.45);
      P.beam('steel', [x, yBot, Z0], [x, yBot, Z1], 0.45);
      for (let i = 0; i < n; i++) {
        const z = Z0 + i * dz;
        P.beam('steel', [x, yBot, z], [x, yTop, z], 0.22);
        P.beam('steel', [x, i & 1 ? yTop : yBot, z], [x, i & 1 ? yBot : yTop, z + dz], 0.22);
      }
    }
  } else {
    for (let a = h.z0 + 0.5; a <= h.z1 - 0.5; a += 1) {
      const z = a * CELL;
      const n = Math.max(2, Math.round((X1 - X0) / 4));
      const dx = (X1 - X0) / n;
      P.beam('steel', [X0, yTop, z], [X1, yTop, z], 0.45);
      P.beam('steel', [X0, yBot, z], [X1, yBot, z], 0.45);
      for (let i = 0; i < n; i++) {
        const x = X0 + i * dx;
        P.beam('steel', [x, yBot, z], [x, yTop, z], 0.22);
        P.beam('steel', [x, i & 1 ? yTop : yBot, z], [x + dx, i & 1 ? yBot : yTop, z], 0.22);
      }
    }
  }

  // floor
  buf.flat('hangarFloor', [X0, 0.03, Z1], [X1, 0.03, Z1], [X1, 0.03, Z0], [X0, 0.03, Z0], [0, 1, 0], [0, 0], [(X1 - X0) / 16, (Z1 - Z0) / 16], SURF.PLATFORM);

  // lamps on long cables, low enough to throw pools of light on the road
  const lamps = [];
  for (let x = h.x0; x <= h.x1; x++) {
    for (let z = h.z0; z <= h.z1; z++) {
      const top = occ.cols.get(x + ',' + z) ?? 0;
      const ly = Math.min(H - LAMP_DROP, Math.max(13, top + 7));
      if (top > ly - 6) continue;
      const cx = x * CELL, cz = z * CELL;
      buf.beam('steelDark', [cx, H, cz], [cx, ly + 0.9, cz], 0.08);
      buf.cylinder('steelDark', cx, ly + 0.3, cz, 1.3, 0.6, 12);
      buf.flat('lamp', [cx - 0.9, ly + 0.28, cz + 0.9], [cx + 0.9, ly + 0.28, cz + 0.9], [cx + 0.9, ly + 0.28, cz - 0.9], [cx - 0.9, ly + 0.28, cz - 0.9], [0, -1, 0]);
      lamps.push([cx, ly - 0.5, cz]);
    }
  }
  return { min: [X0, 0, Z0], max: [X1, H, Z1], height: H, lamps, gates };
}

// ---- steel truss supports under raised road ------------------------------------------------------
export function trussPillar(buf, x, bottom, z) {
  const P = new Place(buf, 0, 0, 0);
  lattice(P, 'steel', x, z, 2.9, 0.4, bottom - 1.0, 3.2, 0.42, 0.2);
  buf.box(null, x, bottom / 2, z, 2.6, bottom, 2.6, SURF.WALL, 0.25);
  buf.box('pillarBase', x, 0.2, z, 3.8, 0.4, 3.8, null, 0.25);
  buf.box('pillarBase', x, bottom - 0.5, z, 3.4, 1.0, 3.4, null, 0.25);
}

// ---- automatic decor ---------------------------------------------------------------------------------
function chebyshevField(cols, xMin, xMax, zMin, zMax) {
  const list = [...cols.keys()].map((k) => k.split(',').map(Number));
  const dist = new Map();
  for (let x = xMin; x <= xMax; x++) for (let z = zMin; z <= zMax; z++) {
    let d = Infinity;
    for (const [cx, cz] of list) { const v = Math.max(Math.abs(cx - x), Math.abs(cz - z)); if (v < d) d = v; }
    dist.set(x + ',' + z, { d, near: list.length ? nearestDir(list, x, z) : 0 });
  }
  return dist;
}

// heading (0..3) from cell (x, z) towards the nearest block column
function nearestDir(list, x, z) {
  let best = null, bd = Infinity;
  for (const [cx, cz] of list) { const d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) { bd = d; best = [cx - x, cz - z]; } }
  const [dx, dz] = best;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

function autoDecor(track, occ, hangars, manual) {
  const S = track.stadium;
  const xMin = Math.ceil((S.minX + HALF + 10) / CELL), xMax = Math.floor((S.maxX - HALF - 10) / CELL);
  const zMin = Math.ceil((S.minZ + HALF + 10) / CELL), zMax = Math.floor((S.maxZ - HALF - 10) / CELL);
  const reserved = new Set();
  // jumps: keep the flight path clear (route points in the air and their neighbours)
  const route = track.route;
  if (route) {
    for (const p of route.pts) {
      if (!p.air && !p.nearAir) continue;
      const cx = Math.round(p.p[0] / CELL), cz = Math.round(p.p[2] / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) reserved.add((cx + dx) + ',' + (cz + dz));
    }
  }
  // open kicker ends without a route (editor free drive): reserve a lane ahead
  for (const b of track.blocks) {
    for (const p of b.ports || []) {
      if (!p.open) continue;
      const [dx, dz] = DIRS[p.d];
      const cx = Math.round((p.p[0] + dx * HALF) / CELL), cz = Math.round((p.p[2] + dz * HALF) / CELL);
      for (let k = 0; k < 8; k++) for (let s = -1; s <= 1; s++) reserved.add((cx + dx * k + dz * s) + ',' + (cz + dz * k + dx * s));
    }
  }
  for (const h of hangars) {
    for (let x = h.x0 - 1; x <= h.x1 + 1; x++) for (let z = h.z0 - 1; z <= h.z1 + 1; z++) reserved.add(x + ',' + z);
  }
  for (const d of manual) reserved.add(d[1] + ',' + d[2]);

  const field = chebyshevField(occ.cols, xMin, xMax, zMin, zMax);
  const seed = hashString(track.id + ':' + track.blocks.length + ':' + (track.blocks[0]?.type || ''));
  const rand = rng(seed);
  const out = [];
  let cranes = 0;
  const pick = (opts) => {
    let t = rand() * opts.reduce((s, o) => s + o[1], 0);
    for (const [id, w] of opts) { t -= w; if (t <= 0) return id; }
    return opts[opts.length - 1][0];
  };
  for (let x = xMin; x <= xMax; x++) {
    for (let z = zMin; z <= zMax; z++) {
      const k = x + ',' + z;
      if (reserved.has(k) || occ.cols.has(k)) continue;
      const { d, near } = field.get(k);
      if (d === 0 || d === Infinity) continue;
      let type = null;
      const r = rand();
      if (d === 1) {
        if (r < 0.2) type = pick([['containers', 5], ['crates', 4], ['light', 2]]);
      } else if (d === 2) {
        if (r < 0.2) type = pick([['light', 3], ['containers', 3], ['tanks', 2], ['scaffold', 2], ['screen', 2]]);
      } else if (r < 0.14) {
        type = pick([['crane', cranes < 3 ? 3 : 0], ['screen', 2], ['tanks', 2], ['scaffold', 2], ['light', 2], ['containers', 2]]);
      }
      if (!type) continue;
      if (type === 'crane') cranes++;
      const rot = type === 'screen' || type === 'light' ? near : (rand() * 4) | 0;
      out.push([type, x, z, rot]);
      if (out.length >= 48) return out;
    }
  }
  return out;
}

// ---- entry point -------------------------------------------------------------------------------------
// Builds hangars, manual + automatic decor. Returns { buf, indoor: [{min,max,lamps}], decor }
export function buildScenery(track, { auto = true } = {}) {
  const buf = new GeoBuffer();
  const occ = occupancy(track.blocks);
  const hangars = parseHangars(track.data.hangars);
  const indoor = hangars.map((h) => buildHangar(buf, h, occ));
  // manual decor that a block or a hangar roof now sits on is skipped
  const manual = (track.data.decor || []).filter((d) => Array.isArray(d) && DECOR[d[0]] &&
    !occ.cols.has((d[1] | 0) + ',' + (d[2] | 0)) && !(DECOR[d[0]].tall && hangars.some((h) => hangarContains(h, d[1] | 0, d[2] | 0))));
  const auto_ = auto ? autoDecor(track, occ, hangars, manual) : [];
  const ctx = { craneTop: Math.max(CRANE_TOP_MIN, (track.bbox?.maxY || 0) + 26) };
  for (const d of manual) buildDecor(buf, d[0], d[1] | 0, d[2] | 0, d[3] | 0, decorSeed(d[0], d[1], d[2]), ctx);
  auto_.forEach((d, i) => buildDecor(buf, d[0], d[1], d[2], d[3], hashString(track.id) + i * 7919, ctx));
  return { buf, indoor, decor: manual.concat(auto_), hangars };
}
