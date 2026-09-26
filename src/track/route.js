// The driving line from start to finish, used by the AI driver, the attract
// mode camera and track validation. Follows block connections; after an open
// kicker it searches for the landing block ahead.

import { ROAD_Y, CELL, LEVEL, HALF } from '../config.js';
import { exitPort, worldFrame, DIRS, vsub, vdot, vlen, vnorm, vlerp, vcross, vscale, vadd } from './blocks.js';

const STEP = 2;
const PLAZA_MARGIN = 4;   // the racing line keeps this far from a plaza's open edge (m)

function blockFrames(b, entry, exit) {
  const def = b.def;
  let frames;
  if (def.ports.length === 2 || (entry <= 1 && exit <= 1)) {
    frames = def.frames.map((f) => worldFrame(b, f));
    if (entry === 1) frames = frames.reverse().map((f) => ({ p: f.p, f: vscale(f.f, -1), r: vscale(f.r, -1), u: f.u }));
  } else if (((b.ports[entry].d - b.ports[exit].d) & 1) !== 0) {
    // turning on a platform: quarter circle around the corner between the two ports
    const a = b.ports[entry].p, c = b.ports[exit].p;
    const [ox, oz] = DIRS[b.ports[exit].d];
    const R = Math.hypot(c[0] - a[0], c[2] - a[2]) / Math.SQRT2;
    const ctr = [a[0] + ox * R, a[1] + ROAD_Y, a[2] + oz * R];
    const va = [a[0] - ctr[0], 0, a[2] - ctr[2]], vc = [c[0] - ctr[0], 0, c[2] - ctr[2]];
    const u = [0, 1, 0];
    frames = [];
    for (let k = 0; k <= 12; k++) {
      const t = (k / 12) * Math.PI / 2;
      const p = [ctr[0] + va[0] * Math.cos(t) + vc[0] * Math.sin(t), ctr[1], ctr[2] + va[2] * Math.cos(t) + vc[2] * Math.sin(t)];
      const f = vnorm([-va[0] * Math.sin(t) + vc[0] * Math.cos(t), 0, -va[2] * Math.sin(t) + vc[2] * Math.cos(t)]);
      frames.push({ p, f, r: vnorm(vcross(f, u)), u });
    }
  } else {
    // crossing a platform sideways
    const a = b.ports[entry].p, c = b.ports[exit].p;
    const p0 = [a[0], a[1] + ROAD_Y, a[2]], p1 = [c[0], c[1] + ROAD_Y, c[2]];
    const f = vnorm(vsub(p1, p0));
    const u = [0, 1, 0];
    const r = vnorm(vcross(f, u));
    frames = [{ p: p0, f, r, u }, { p: p1, f, r, u }];
  }
  return frames;
}

function findLanding(track, b, port, visited) {
  const [dx, dz] = DIRS[port.d];
  let best = null, bestAlong = Infinity;
  for (const o of track.blocks) {
    if (o === b) continue;
    for (const q of o.ports) {
      if (q.open || ((q.d + 2) & 3) !== port.d) continue;
      if (visited.has(o.i + ':' + q.idx)) continue;
      const rx = q.p[0] - port.p[0], ry = q.p[1] - port.p[1], rz = q.p[2] - port.p[2];
      const along = rx * dx + rz * dz;
      const lateral = Math.abs(rx * -dz + rz * dx);
      if (along < 4 || along > 400 || lateral > 14 || ry > 3) continue;
      if (along < bestAlong) { bestAlong = along; best = { b: o, idx: q.idx }; }
    }
  }
  return best;
}

export function computeRoute(track) {
  const start = track.startBlock;
  if (!start) return null;
  const raw = [];
  const visited = new Set();
  let b = start, entry = 0, finished = false, guard = 0;
  while (b && guard++ < 4000) {
    const key = b.i + ':' + entry;
    if (visited.has(key)) break;
    visited.add(key);
    let exit = exitPort(b.def, entry);
    // four-way blocks (platforms, plazas): the driving line leaves towards the next
    // block in build order; otherwise straight on, otherwise whichever side continues
    if (b.def.ports.length > 2) {
      const next = b.links.findIndex((l, i) => l && i !== entry && l.b.i === b.i + 1);
      if (next >= 0) exit = next;
      else if (!b.links[exit]) {
        const k = b.links.findIndex((l, i) => l && i !== entry);
        if (k >= 0) exit = k;
      }
    }
    const frames = blockFrames(b, entry, exit);
    for (const f of frames) {
      const last = raw[raw.length - 1];
      if (last && vlen(vsub(last.p, f.p)) < 0.05) continue;
      raw.push({ ...f, air: false, block: b });
    }
    if (b.def.feature === 'finish') { finished = true; break; }
    const link = b.links[exit];
    if (link) { b = link.b; entry = link.idx; continue; }
    const land = findLanding(track, b, b.ports[exit], visited);
    if (!land) break;
    raw[raw.length - 1].jump = true;
    b = land.b; entry = land.idx;
  }
  if (raw.length < 2) return null;

  let pts = resample(raw);
  // across plazas take the widest line the open floor allows, then resample again
  if (smoothPlazas(track, pts)) pts = resample(pts.map((q) => ({ ...q, jump: q.air })));
  const length = pts[pts.length - 1].s;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], c = pts[Math.min(pts.length - 1, i + 2)];
    const ds = c.s - a.s;
    if (ds <= 0 || pts[i].air) continue;
    // curvature is meaningless across the take-off / landing seam of a jump
    let nearAir = false;
    for (let k = Math.max(0, i - 3); k <= Math.min(pts.length - 1, i + 3); k++) if (pts[k].air) nearAir = true;
    if (nearAir) { pts[i].nearAir = true; continue; }
    const df = vscale(vsub(c.f, a.f), 1 / ds);
    pts[i].k = vdot(df, pts[i].r);
    pts[i].kv = vdot(df, pts[i].u);
  }
  return new Route(pts, length, finished);
}

// uniform STEP spacing; a raw point with `jump` starts an airborne segment
function resample(raw) {
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + vlen(vsub(raw[i].p, raw[i - 1].p)));
  const length = cum[cum.length - 1];
  const pts = [];
  let j = 0;
  for (let s = 0; s <= length + 1e-6; s += STEP) {
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const a = raw[j], c = raw[j + 1];
    const t = Math.min(1, Math.max(0, (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])));
    const air = !!a.jump;
    const f = air ? vnorm(vsub(c.p, a.p)) : vnorm(vlerp(a.f, c.f, t));
    const u = air ? [0, 1, 0] : vnorm(vlerp(a.u, c.u, t));
    const r = vnorm(vcross(f, u));
    pts.push({ p: vlerp(a.p, c.p, t), f, u: vcross(r, f), r, s, air, k: 0, block: t < 0.5 ? a.block : c.block });
  }
  return pts;
}

// Racing line over plazas: points on platform cells are relaxed towards a smooth,
// wide arc (minimum-curvature style smoothing), clamped to stay PLAZA_MARGIN from
// any open edge. The ends of each plaza run stay put so the line meets the road.
function smoothPlazas(track, pts) {
  const cells = new Set();
  for (const b of track.blocks) if (b.def.profile === 'platform') cells.add(`${b.x},${b.y},${b.z}`);
  if (!cells.size) return false;
  const onPlaza = (q) => !q.air && q.block && q.block.def.profile === 'platform';
  const has = (x, y, z) => cells.has(`${x},${y},${z}`);
  const clamp = (p, level) => {
    const cx = Math.round(p[0] / CELL), cz = Math.round(p[2] / CELL);
    if (!has(cx, level, cz)) return null;
    let lx = p[0] - cx * CELL, lz = p[2] - cz * CELL;
    const lim = HALF - PLAZA_MARGIN;
    if (lx > lim && !has(cx + 1, level, cz)) lx = lim;
    if (lx < -lim && !has(cx - 1, level, cz)) lx = -lim;
    if (lz > lim && !has(cx, level, cz + 1)) lz = lim;
    if (lz < -lim && !has(cx, level, cz - 1)) lz = -lim;
    // don't cut across a missing diagonal cell
    if (Math.abs(lx) > lim && Math.abs(lz) > lim && !has(cx + Math.sign(lx), level, cz + Math.sign(lz))) {
      if (Math.abs(lx) > Math.abs(lz)) lz = Math.sign(lz) * lim; else lx = Math.sign(lx) * lim;
    }
    return [cx * CELL + lx, p[1], cz * CELL + lz];
  };
  let changed = false;
  let i = 0;
  while (i < pts.length) {
    if (!onPlaza(pts[i])) { i++; continue; }
    let j = i;
    while (j + 1 < pts.length && onPlaza(pts[j + 1]) && Math.abs(pts[j + 1].p[1] - pts[i].p[1]) < 0.5) j++;
    const a = i + 3, b = j - 3; // keep the entry and exit points
    if (b - a >= 4) {
      const level = Math.round((pts[i].p[1] - ROAD_Y) / LEVEL);
      const P = pts.map((q) => q.p.slice());
      // bi-Laplacian (fourth difference) steps flatten the curvature, coarse to fine;
      // plain averaging would pull the line straight and leave kinks at the ends
      // the fixed road points around the plaza take part, so the line keeps their direction
      const at = (k) => P[Math.min(P.length - 1, Math.max(0, k))];
      for (const [K, iters] of [[8, 500], [4, 400], [2, 300], [1, 200]]) {
        for (let it = 0; it < iters; it++) {
          for (let k = a; k <= b; k++) {
            const m2 = at(k - 2 * K), m1 = at(k - K), p1 = at(k + K), p2 = at(k + 2 * K), c0 = P[k];
            const dx = m2[0] - 4 * m1[0] + 6 * c0[0] - 4 * p1[0] + p2[0];
            const dz = m2[2] - 4 * m1[2] + 6 * c0[2] - 4 * p1[2] + p2[2];
            const c = clamp([c0[0] - 0.06 * dx, c0[1], c0[2] - 0.06 * dz], level);
            if (c) P[k] = c;
          }
        }
      }
      for (let k = a; k <= b; k++) pts[k].p = P[k];
      for (let k = i; k <= j; k++) {
        const f = vnorm(vsub(pts[Math.min(j + 1, pts.length - 1, k + 1)].p, pts[Math.max(i - 1, 0, k - 1)].p));
        const u = [0, 1, 0];
        const r = vnorm(vcross(f, u));
        pts[k].f = f; pts[k].u = vcross(r, f); pts[k].r = r;
      }
      changed = true;
    }
    i = j + 1;
  }
  return changed;
}

export class Route {
  constructor(pts, length, finished) {
    this.pts = pts;
    this.length = length;
    this.finished = finished;
    this.step = STEP;
  }

  // nearest point index, searching around a hint index
  nearest(pos, hint = -1, back = 12, ahead = 60) {
    const P = this.pts;
    let i0 = 0, i1 = P.length - 1;
    if (hint >= 0) { i0 = Math.max(0, hint - back); i1 = Math.min(P.length - 1, hint + ahead); }
    let best = hint >= 0 ? hint : 0, bd = Infinity;
    for (let i = i0; i <= i1; i++) {
      const p = P[i].p;
      const d = (p[0] - pos[0]) ** 2 + (p[1] - pos[1]) ** 2 * 0.5 + (p[2] - pos[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  at(s) {
    const P = this.pts;
    const f = Math.max(0, Math.min(P.length - 1.001, s / this.step));
    const i = Math.floor(f), t = f - i;
    const a = P[i], c = P[i + 1] || a;
    return { p: vlerp(a.p, c.p, t), f: vnorm(vlerp(a.f, c.f, t)), u: vnorm(vlerp(a.u, c.u, t)), air: a.air, i };
  }

  offset(p, n, d) {
    return vadd(p, vscale(n, d));
  }
}
