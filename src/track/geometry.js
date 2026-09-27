// Turns block centrelines into renderable geometry data + collision triangles.
// Everything here is plain arrays so it also runs in Node for tests.

import {
  HALF, ROAD_Y, ROAD_HALF, CURB_W, WALL_T, WALL_H, SLAB, SURF, VARIANT_SURF, PIPE, TECH, DECK,
} from '../config.js';
import { ensureBlock, vadd, vsub, vscale, vlen, vcross, vdot } from './blocks.js';

const RH = ROAD_HALF, C = CURB_W, WT = WALL_T, WH = WALL_H, SL = SLAB;

// Half-pipe: the road's flat floor (so it joins road blocks without a step), quarter
// circles up into short vertical walls, then the walls curl back inwards so a car
// that climbs high is turned back down instead of flying out.
function pipeProfile() {
  const { floor: F, radius: R, rise: H, curl, lip: L } = PIPE;
  const top = (curl * Math.PI) / 180;
  const segs = [[-F, 0, F, 0, 0, 1, 'surface', 'surface']];
  const n = 7, m = 9;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI / 2, a1 = ((i + 1) / n) * Math.PI / 2, am = (a0 + a1) / 2;
      // normal points back to the circle centre (into the pipe)
      segs.push([side * (F + R * Math.sin(a0)), R - R * Math.cos(a0), side * (F + R * Math.sin(a1)), R - R * Math.cos(a1),
        -side * Math.sin(am), Math.cos(am), 'surface', 'surface']);
    }
    const uw = side * (F + R);
    segs.push([uw, R, uw, R + H, -side, 0, 'surface', 'surface']);
    // the curl: arc around (F, R + H) from the wall inwards over the top
    for (let i = 0; i < m; i++) {
      const a0 = (i / m) * top, a1 = ((i + 1) / m) * top, am = (a0 + a1) / 2;
      segs.push([side * (F + R * Math.cos(a0)), R + H + R * Math.sin(a0), side * (F + R * Math.cos(a1)), R + H + R * Math.sin(a1),
        -side * Math.cos(am), -Math.sin(am), 'surface', 'surface']);
      // outer shell of the curl
      const Ro = R + L;
      segs.push([side * (F + Ro * Math.cos(a0)), R + H + Ro * Math.sin(a0), side * (F + Ro * Math.cos(a1)), R + H + Ro * Math.sin(a1),
        side * Math.cos(am), Math.sin(am), 'side', 'wall']);
    }
    // rim where the curl ends, and the outer wall down to the deck
    const ue = F + R * Math.cos(top), ve = R + H + R * Math.sin(top), uo = F + (R + L) * Math.cos(top), vo = R + H + (R + L) * Math.sin(top);
    segs.push([side * ue, ve, side * uo, vo, -side * Math.sin(top), Math.cos(top), 'wallTop', 'wall']);
    segs.push([uw + side * L, -SL, uw + side * L, R + H, side, 0, 'side', 'wall']);
  }
  segs.push([-F - R - L, -SL, F + R + L, -SL, 0, -1, 'under', 'wall']);
  return segs;
}

// Rounded border beside a surface of half width `w`: a half ellipse `bw` wide and `bh`
// high. Its inner face rises almost vertically, so a car that runs wide glances off it
// like a low wall instead of riding up and taking off.
function bumpEdges(w, bw, bh, mat) {
  const segs = [];
  const n = 8;
  const at = (t) => { const a = Math.PI * t; return [w + (bw / 2) * (1 - Math.cos(a)), bh * Math.sin(a)]; };
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const [u0, v0] = at(i / n), [u1, v1] = at((i + 1) / n);
      const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv);
      segs.push([side * u0, v0, side * u1, v1, -side * dv / l, du / l, mat, 'wall']);
    }
    segs.push([side * (w + bw), -SL, side * (w + bw), 0, side, 0, 'side', 'wall']);
  }
  segs.push([-(w + bw), -SL, w + bw, -SL, 0, -1, 'under', 'wall']);
  return segs;
}

// Cross-section segments: [u0, v0, u1, v1, normalU, normalV, material, collision]
const DH = DECK.half;
const PROFILES = {
  road: [
    [-RH + C, 0, RH - C, 0, 0, 1, 'surface', 'surface'],
    [-RH, 0, -RH + C, 0, 0, 1, 'curb', 'surface'],
    [RH - C, 0, RH, 0, 0, 1, 'curb', 'surface'],
    [-RH, 0, -RH, WH, 1, 0, 'wall', 'wall'],
    [-RH - WT, WH, -RH, WH, 0, 1, 'wallTop', 'wall'],
    [-RH - WT, -SL, -RH - WT, WH, -1, 0, 'side', 'wall'],
    [RH, 0, RH, WH, -1, 0, 'wall', 'wall'],
    [RH, WH, RH + WT, WH, 0, 1, 'wallTop', 'wall'],
    [RH + WT, -SL, RH + WT, WH, 1, 0, 'side', 'wall'],
    [-RH - WT, -SL, RH + WT, -SL, 0, -1, 'under', 'wall'],
  ],
  // road without side walls: fall off if you run wide
  roadOpen: [
    [-RH + C, 0, RH - C, 0, 0, 1, 'surface', 'surface'],
    [-RH, 0, -RH + C, 0, 0, 1, 'curb', 'surface'],
    [RH - C, 0, RH, 0, 0, 1, 'curb', 'surface'],
    [-RH, -SL, -RH, 0, -1, 0, 'side', 'wall'],
    [RH, -SL, RH, 0, 1, 0, 'side', 'wall'],
    [-RH, -SL, RH, -SL, 0, -1, 'under', 'wall'],
  ],
  pipe: pipeProfile(),
  // tech road: road width, painted curbs, rounded borders instead of walls
  tech: [
    [-RH + C, 0, RH - C, 0, 0, 1, 'surface', 'surface'],
    [-RH, 0, -RH + C, 0, 0, 1, 'curb', 'surface'],
    [RH - C, 0, RH, 0, 0, 1, 'curb', 'surface'],
    ...bumpEdges(RH, TECH.bump, TECH.bumpH, 'bump'),
  ],
  // deck: a wide open road (speed tech) with a painted edge line and a low lip
  deck: [
    [-DH + C, 0, DH - C, 0, 0, 1, 'surface', 'surface'],
    [-DH, 0, -DH + C, 0, 0, 1, 'deckEdge', 'surface'],
    [DH - C, 0, DH, 0, 0, 1, 'deckEdge', 'surface'],
    ...bumpEdges(DH, DECK.lip, DECK.lipH, 'lip'),
  ],
  platform: [
    [-HALF, 0, HALF, 0, 0, 1, 'surface', 'surface'],
    [-HALF, -SL, -HALF, 0, -1, 0, 'side', 'wall'],
    [HALF, -SL, HALF, 0, 1, 0, 'side', 'wall'],
    [-HALF, -SL, HALF, -SL, 0, -1, 'under', 'wall'],
  ],
};

// End caps as rectangles in the cross-section plane: [u0, v0, u1, v1]
const CAPS = {
  road: [[-RH - WT, -SL, RH + WT, 0], [-RH - WT, 0, -RH, WH], [RH, 0, RH + WT, WH]],
  roadOpen: [[-RH, -SL, RH, 0]],
  pipe: [[-RH - PIPE.radius - PIPE.lip, -SL, RH + PIPE.radius + PIPE.lip, 0], [-RH - PIPE.radius - PIPE.lip, 0, -RH - PIPE.radius, PIPE.radius + PIPE.rise], [RH + PIPE.radius, 0, RH + PIPE.radius + PIPE.lip, PIPE.radius + PIPE.rise]],
  platform: [[-HALF, -SL, HALF, 0]],
  tech: [[-RH - TECH.bump, -SL, RH + TECH.bump, 0]],
  deck: [[-DH - DECK.lip, -SL, DH + DECK.lip, 0]],
};

// texture tile length along the road, per material
const TILE = {
  surface_road: 16, surface_dirt: 16, surface_ice: 16, surface_grass: 16, surface_platform: 8,
  curb: 4, wall: 12, wallTop: 12, side: 8, under: 8, bump: 4, lip: 4, deckEdge: 6,
};

// half width of the drivable surface for each cross-section
const SURF_HALF = { road: RH, roadOpen: RH, tech: RH, pipe: RH, deck: DH, platform: HALF };

function matFor(seg, variant, profile) {
  const m = seg[6];
  if (m === 'surface') return profile === 'platform' && variant === 'road' ? 'surface_platform' : 'surface_' + variant;
  if (m === 'curb' || m === 'deckEdge') return variant === 'road' ? m : 'surface_' + variant;
  return m;
}

// U texture coordinate (across the road) for a cross-section point
function acrossU(mat, u, v, profile) {
  if (profile === 'pipe' && mat.startsWith('surface_')) return (Math.abs(u) + v) / (2 * RH) * Math.sign(u || 1);
  const W = SURF_HALF[profile] ?? RH;
  switch (mat) {
    case 'surface_road': return (u + W - C) / (2 * (W - C));
    case 'surface_dirt':
    case 'surface_ice':
    case 'surface_grass': return (u + W) / (2 * W);
    case 'surface_platform': return u / 8;
    case 'curb':
    case 'deckEdge': return (Math.abs(u) - (W - C)) / C;
    case 'bump':
    case 'lip': return (Math.abs(u) - W) / (profile === 'deck' ? DECK.lip : TECH.bump);
    case 'wall': return v / WH;
    case 'wallTop': return (Math.abs(u) - RH) / WT;
    case 'side': return (v + SL) / (WH + SL);
    default: return u / 8;
  }
}

export class GeoBuffer {
  constructor() { this.mats = {}; this.coll = []; }
  mat(key) {
    let m = this.mats[key];
    if (!m) m = this.mats[key] = { pos: [], nrm: [], uv: [] };
    return m;
  }
  // triangle with per-vertex normals; `want` is the intended facing used to fix winding
  tri(key, a, b, c, na, nb, nc, ta, tb, tc, surf, want) {
    const g = vcross(vsub(b, a), vsub(c, a));
    if (vdot(g, want) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; [tb, tc] = [tc, tb]; }
    if (key) {
      const m = this.mat(key);
      m.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      m.nrm.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
      m.uv.push(ta[0], ta[1], tb[0], tb[1], tc[0], tc[1]);
    }
    if (surf != null) {
      this.coll.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
        na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2], surf);
    }
  }
  quad(key, a, b, c, d, na, nb, nc, nd, ta, tb, tc, td, surf, want) {
    this.tri(key, a, b, c, na, nb, nc, ta, tb, tc, surf, want);
    this.tri(key, a, c, d, na, nc, nd, ta, tc, td, surf, want);
  }
  // axis aligned box in local coords (optionally skip bottom face)
  box(key, cx, cy, cz, sx, sy, sz, surf = SURF.WALL, uvScale = 0.25, skipBottom = true) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    // u runs along the face horizontally, v upwards (or along z on top)
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sz, sy],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sz, sy],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], sx, sz],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sx, sy],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sx, sy],
    ];
    if (!skipBottom) faces.push([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sx, sz]);
    for (const [a, b, c, d, n, w, h] of faces) {
      const W = w * uvScale, H = h * uvScale;
      this.quad(key, a, b, c, d, n, n, n, n, [0, 0], [W, 0], [W, H], [0, H], surf, n);
    }
  }
  // flat quad with explicit uv rectangle
  flat(key, a, b, c, d, n, uv0 = [0, 0], uv1 = [1, 1], surf = null) {
    this.quad(key, a, b, c, d, n, n, n, n, [uv0[0], uv0[1]], [uv1[0], uv0[1]], [uv1[0], uv1[1]], [uv0[0], uv1[1]], surf, n);
  }
  // square-section bar from a to b (truss members, braces, cables); no end faces
  beam(key, a, b, w, h = w, surf = null) {
    const d = vsub(b, a);
    const len = vlen(d);
    if (len < 1e-6) return;
    const f = vscale(d, 1 / len);
    const side = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : vnormalize(vcross(f, [0, 1, 0]));
    const up = vcross(side, f);
    const hs = vscale(side, w / 2), hu = vscale(up, h / 2);
    const corner = (p, s, u) => vadd(vadd(p, vscale(hs, s)), vscale(hu, u));
    const faces = [[side, 1, -1, 1, 1, h], [vscale(side, -1), -1, 1, -1, -1, h], [up, 1, 1, -1, 1, w], [vscale(up, -1), -1, -1, 1, -1, w]];
    for (const [n, s0, u0, s1, u1, width] of faces) {
      const p0 = corner(a, s0, u0), p1 = corner(a, s1, u1), p2 = corner(b, s1, u1), p3 = corner(b, s0, u0);
      this.quad(key, p0, p1, p2, p3, n, n, n, n, [0, 0], [width * 0.25, 0], [width * 0.25, len * 0.25], [0, len * 0.25], surf, n);
    }
  }
  // vertical cylinder (side + top), base at y0
  cylinder(key, cx, y0, cz, r, h, seg = 16, surf = null, uvScale = 0.25) {
    const y1 = y0 + h;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      const p0 = [cx + n0[0] * r, y0, cz + n0[2] * r], p1 = [cx + n1[0] * r, y0, cz + n1[2] * r];
      const u0 = (i / seg) * circ * uvScale, u1 = ((i + 1) / seg) * circ * uvScale;
      this.quad(key, p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], n0, n1, n1, n0, [u0, 0], [u1, 0], [u1, h * uvScale], [u0, h * uvScale], surf, vadd(n0, n1));
      this.tri(key, [cx, y1, cz], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [0, 1, 0], [0, 1, 0], [0, 1, 0],
        [0.5, 0.5], [0.5 + n0[0] * 0.5, 0.5 + n0[2] * 0.5], [0.5 + n1[0] * 0.5, 0.5 + n1[2] * 0.5], surf, [0, 1, 0]);
    }
  }
}

const vnormalize = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const pointOn = (fr, u, v) => vadd(fr.p, vadd(vscale(fr.r, u), vscale(fr.u, v)));
const normalOn = (fr, nu, nv) => vadd(vscale(fr.r, nu), vscale(fr.u, nv));

// Sweep a profile along frames into a GeoBuffer.
export function sweep(buf, frames, profileName, variant, collide = true) {
  const profile = PROFILES[profileName];
  const surfId = VARIANT_SURF[profileName === 'platform' && variant === 'road' ? 'platform' : variant] ?? VARIANT_SURF.road;
  for (const seg of profile) {
    const [u0, v0, u1, v1, nu, nv, , coll] = seg;
    const key = matFor(seg, variant, profileName);
    const surf = !collide || !coll ? null : coll === 'surface' ? surfId : SURF.WALL;
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    // arc length along this segment's midline
    const s = [0];
    for (let i = 1; i < frames.length; i++) {
      s.push(s[i - 1] + vlen(vsub(pointOn(frames[i], um, vm), pointOn(frames[i - 1], um, vm))));
    }
    const total = s[s.length - 1];
    const tile = TILE[key] || 8;
    const reps = Math.max(1, Math.round(total / tile));
    const vs = s.map((x) => (x / (total || 1)) * reps);
    const uA = acrossU(key, u0, v0, profileName), uB = acrossU(key, u1, v1, profileName);
    for (let i = 0; i < frames.length - 1; i++) {
      const f0 = frames[i], f1 = frames[i + 1];
      const a = pointOn(f0, u0, v0), b = pointOn(f0, u1, v1), c = pointOn(f1, u1, v1), d = pointOn(f1, u0, v0);
      const n0 = normalOn(f0, nu, nv), n1 = normalOn(f1, nu, nv);
      buf.quad(key, a, b, c, d, n0, n0, n1, n1,
        [uA, vs[i]], [uB, vs[i]], [uB, vs[i + 1]], [uA, vs[i + 1]], surf, n0);
    }
  }
}

// Cap the open cross-section at a frame; dir = -1 at the start, +1 at the end
export function cap(buf, fr, profileName, dir, collide = true) {
  const n = vscale(fr.f, dir);
  for (const [u0, v0, u1, v1] of CAPS[profileName]) {
    const a = pointOn(fr, u0, v0), b = pointOn(fr, u1, v0), c = pointOn(fr, u1, v1), d = pointOn(fr, u0, v1);
    buf.quad('side', a, b, c, d, n, n, n, n, [u0 / 8, v0 / 8], [u1 / 8, v0 / 8], [u1 / 8, v1 / 8], [u0 / 8, v1 / 8], collide ? SURF.WALL : null, n);
  }
}

// ---- block features (gates, pads) ------------------------------------------------
const GATE_STYLE = { cp: 'CP', start: 'Start', finish: 'Finish' };

// Trackmania-style arch: a flattened half ring over the road with a glowing band on
// its underside and the gate's name at the crown. Its crown stays under 9 m, inside
// the level above that the gate claims (see computeCells).
function gate(buf, kind, z, half = RH + WT) {
  const style = GATE_STYLE[kind];
  const a = half + 1.2, b = 7.6;   // inner half span at the feet, inner crown height
  const T = 1.2, D = 1.1;          // band thickness and half depth
  const N = 28;
  const at = (th, k) => [(a + k) * Math.cos(th), ROAD_Y + (b + k) * Math.sin(th)];
  const nrm = (th) => { const nx = Math.cos(th) / a, ny = Math.sin(th) / b, l = Math.hypot(nx, ny); return [nx / l, ny / l, 0]; };
  for (let i = 0; i < N; i++) {
    const t0 = (Math.PI * i) / N, t1 = (Math.PI * (i + 1)) / N;
    const [x0i, y0i] = at(t0, 0), [x1i, y1i] = at(t1, 0), [x0o, y0o] = at(t0, T), [x1o, y1o] = at(t1, T);
    const n0 = nrm(t0), n1 = nrm(t1), m0 = vscale(n0, -1), m1 = vscale(n1, -1);
    const u0 = i / N, u1 = (i + 1) / N;
    buf.quad('gateFrame', [x0o, y0o, z + D], [x1o, y1o, z + D], [x1o, y1o, z - D], [x0o, y0o, z - D], n0, n1, n1, n0, [u0, 0], [u1, 0], [u1, 1], [u0, 1], null, n0);
    buf.quad('glow' + style, [x0i, y0i, z - D], [x1i, y1i, z - D], [x1i, y1i, z + D], [x0i, y0i, z + D], m0, m1, m1, m0, [u0, 0], [u1, 0], [u1, 1], [u0, 1], null, m0);
    for (const [zz, nz] of [[z + D, 1], [z - D, -1]]) {
      const n = [0, 0, nz];
      buf.quad('gateFrame', [x0i, y0i, zz], [x1i, y1i, zz], [x1o, y1o, zz], [x0o, y0o, zz], n, n, n, n, [u0, 0], [u1, 0], [u1, 1], [u0, 1], null, n);
    }
  }
  // feet: solid, so the car cannot drive through them
  const base = ROAD_Y - SL;
  for (const sx of [-1, 1]) buf.box('gateFrame', sx * (a + T / 2), base + 0.9, z, T + 0.6, 1.8, 2 * D + 0.6, SURF.WALL, 0.25);
  // name panels on both faces at the crown
  const pw = Math.min(10.4, a * 0.9), py0 = ROAD_Y + b + 0.05, py1 = py0 + pw / 8, pz = D + 0.03;
  buf.flat('panel' + style, [-pw / 2, py0, z + pz], [pw / 2, py0, z + pz], [pw / 2, py1, z + pz], [-pw / 2, py1, z + pz], [0, 0, 1], [0, 0], [1, 1]);
  buf.flat('panel' + style, [pw / 2, py0, z - pz], [-pw / 2, py0, z - pz], [-pw / 2, py1, z - pz], [pw / 2, py1, z - pz], [0, 0, -1], [0, 0], [1, 1]);
  // line painted across the road
  const y = ROAD_Y + 0.025, lw = half - WT;
  if (kind === 'finish') {
    buf.flat('checker', [-lw, y, z + 1.6], [lw, y, z + 1.6], [lw, y, z - 1.6], [-lw, y, z - 1.6], [0, 1, 0], [0, 0], [lw / 2, 1.6]);
  } else {
    buf.flat('line' + style, [-lw, y, z + 0.35], [lw, y, z + 0.35], [lw, y, z - 0.35], [-lw, y, z - 0.35], [0, 1, 0], [0, 0], [1, 1]);
  }
}

function pad(buf, key, w = RH - C) {
  const y = ROAD_Y + 0.02;
  buf.flat(key, [-w, y, 9], [w, y, 9], [w, y, -9], [-w, y, -9], [0, 1, 0], [0, 0], [1, 3]);
}

// Checkpoint / finish on a platform: a banner floating across the whole cell, so the
// gates of neighbouring cells join into one wide gate. No posts, no collision.
function padGate(buf, kind) {
  const style = GATE_STYLE[kind];
  const y0 = ROAD_Y + 8.2, y1 = y0 + 1.8, hz = 0.6;
  buf.box('gateFrame', 0, y0 + 0.9, 0, 2 * HALF, 1.8, 2 * hz, null, 0.25);
  const py0 = y0 + 0.1, py1 = y1 - 0.1, pz = hz + 0.02;
  buf.flat('panel' + style, [-HALF, py0, pz], [HALF, py0, pz], [HALF, py1, pz], [-HALF, py1, pz], [0, 0, 1], [0, 0], [1, 1]);
  buf.flat('panel' + style, [HALF, py0, -pz], [-HALF, py0, -pz], [-HALF, py1, -pz], [HALF, py1, -pz], [0, 0, -1], [0, 0], [1, 1]);
  buf.flat('glow' + style, [-HALF, y0 - 0.02, hz], [HALF, y0 - 0.02, hz], [HALF, y0 - 0.02, -hz], [-HALF, y0 - 0.02, -hz], [0, -1, 0]);
  const y = ROAD_Y + 0.025;
  if (kind === 'finish') buf.flat('checker', [-HALF, y, 1.6], [HALF, y, 1.6], [HALF, y, -1.6], [-HALF, y, -1.6], [0, 1, 0], [0, 0], [16, 1.6]);
  else buf.flat('line' + style, [-HALF, y, 0.35], [HALF, y, 0.35], [HALF, y, -0.35], [-HALF, y, -0.35], [0, 1, 0], [0, 0], [1, 1]);
}

// half width to the outside of the road edge, per cross-section (gate posts stand beyond it)
const EDGE_HALF = { road: RH + WT, roadOpen: RH + WT, tech: RH + TECH.bump, deck: DH + DECK.lip, pipe: RH + PIPE.radius + PIPE.lip, platform: HALF };

// copy `src` into `dst` placed on frame `fr` (src coords: x right, y up from the level
// floor, z backwards along the road)
function placeOnFrame(dst, src, fr) {
  const o = vsub(fr.p, vscale(fr.u, ROAD_Y));
  const tp = (x, y, z) => [o[0] + fr.r[0] * x + fr.u[0] * y - fr.f[0] * z, o[1] + fr.r[1] * x + fr.u[1] * y - fr.f[1] * z, o[2] + fr.r[2] * x + fr.u[2] * y - fr.f[2] * z];
  const tn = (x, y, z) => [fr.r[0] * x + fr.u[0] * y - fr.f[0] * z, fr.r[1] * x + fr.u[1] * y - fr.f[1] * z, fr.r[2] * x + fr.u[2] * y - fr.f[2] * z];
  for (const key in src.mats) {
    const m = src.mats[key], d = dst.mat(key);
    for (let i = 0; i < m.pos.length; i += 3) {
      d.pos.push(...tp(m.pos[i], m.pos[i + 1], m.pos[i + 2]));
      d.nrm.push(...tn(m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]));
    }
    for (const v of m.uv) d.uv.push(v);
  }
  const c = src.coll;
  for (let i = 0; i < c.length; i += 19) {
    for (let v = 0; v < 3; v++) dst.coll.push(...tp(c[i + v * 3], c[i + v * 3 + 1], c[i + v * 3 + 2]));
    for (let v = 0; v < 3; v++) dst.coll.push(...tn(c[i + 9 + v * 3], c[i + 10 + v * 3], c[i + 11 + v * 3]));
    dst.coll.push(c[i + 18]);
  }
}

export function buildFeatures(buf, def) {
  if (def.featureFrame) {
    // sweep pieces: build the feature flat, then lay it onto the mid-piece frame
    const tmp = new GeoBuffer();
    const half = EDGE_HALF[def.profile] ?? RH + WT;
    const W = (SURF_HALF[def.profile] ?? RH) - C;
    if (def.feature === 'cp' || def.feature === 'finish' || def.feature === 'start') gate(tmp, def.feature, 0, half);
    else if (def.feature === 'boost') pad(tmp, 'boostPad', W);
    else if (def.feature === 'superboost') pad(tmp, 'superPad', W);
    placeOnFrame(buf, tmp, def.featureFrame);
    return;
  }
  if (def.profile === 'platform' && (def.feature === 'cp' || def.feature === 'finish')) { padGate(buf, def.feature); return; }
  switch (def.feature) {
    case 'cp': gate(buf, 'cp', 0); break;
    case 'finish': gate(buf, 'finish', 0); break;
    case 'start': gate(buf, 'start', -6); break;
    case 'boost': pad(buf, 'boostPad'); break;
    case 'superboost': pad(buf, 'superPad'); break;
    default: break;
  }
}

// Feature placement data in local block coords (sweep pieces: `frame` is the mid-piece
// frame the feature sits on)
export function featureInfo(def) {
  if (def.featureFrame) {
    const frame = def.featureFrame;
    const half = EDGE_HALF[def.profile] ?? RH + WT;
    const W = (SURF_HALF[def.profile] ?? RH) - C;
    if (def.feature === 'boost' || def.feature === 'superboost') return { type: 'boost', frame, halfLen: 9, halfWidth: W, strength: def.feature === 'boost' ? 1 : 2 };
    if (def.feature === 'start') return { type: 'start', frame, spawnFrame: def.spawnFrame };
    return { type: def.feature, frame, halfWidth: half + 1.5 };
  }
  switch (def.feature) {
    case 'start': return { type: 'start', spawn: [0, ROAD_Y, 7], gateZ: -6 };
    case 'cp': return { type: 'cp', gateZ: 0 };
    case 'finish': return { type: 'finish', gateZ: 0 };
    case 'boost': return { type: 'boost', halfLen: 9, halfWidth: RH - C, strength: 1 };
    case 'superboost': return { type: 'boost', halfLen: 9, halfWidth: RH - C, strength: 2 };
    default: return null;
  }
}

// ---- cached local geometry per block type & surface -------------------------------
const cache = new Map();

// edge: 'wall' (default) or 'open' (road blocks without side walls)
export function blockProfile(def, edge = 'wall') {
  return def.profile === 'road' && edge === 'open' ? 'roadOpen' : def.profile;
}

export function blockGeometry(type, variant = 'road', edge = 'wall') {
  const def = ensureBlock(type);
  const v = def.profile === 'platform' || def.surfaces ? variant : 'road';
  const profile = blockProfile(def, edge);
  const key = type + '|' + v + '|' + profile;
  let g = cache.get(key);
  if (g) return g;
  const body = new GeoBuffer();
  sweep(body, def.frames, profile, v);
  buildFeatures(body, def);
  const caps = [new GeoBuffer(), new GeoBuffer()];
  cap(caps[0], def.frames[0], profile, -1);
  cap(caps[1], def.frames[def.frames.length - 1], profile, 1);
  g = { body, caps };
  cache.set(key, g);
  return g;
}
