// The driving line from start to finish, used by the AI driver, the attract
// mode camera and track validation. Follows block connections; after an open
// kicker it searches for the landing block ahead.

import { ROAD_Y } from '../config.js';
import { exitPort, worldFrame, DIRS, vsub, vdot, vlen, vnorm, vlerp, vcross, vscale, vadd } from './blocks.js';

const STEP = 2;

function blockFrames(b, entry, exit) {
  const def = b.def;
  let frames;
  if (def.ports.length === 2 || (entry <= 1 && exit <= 1)) {
    frames = def.frames.map((f) => worldFrame(b, f));
    if (entry === 1) frames = frames.reverse().map((f) => ({ p: f.p, f: vscale(f.f, -1), r: vscale(f.r, -1), u: f.u }));
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
    const exit = exitPort(b.def, entry);
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

  // resample at uniform spacing
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
