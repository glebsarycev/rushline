// Mountain valley around a track (theme 'valley'): low-poly terrain that meets the
// road from below and rises into hills away from it, a river in the gorge under
// the jump, a waterfall, a rock cave over the last stretch, and rocks and trees on
// the slopes. Returns the ground height so a car that leaves the road respawns
// instead of sinking through the grass.

import * as THREE from 'three';
import { rng } from '../util/math.js';

const STEP = 8;          // terrain grid (m): big facets for the low-poly look
const CORRIDOR = 13;     // under the road (m from the centreline)
const MARGIN = 520;      // terrain beyond the track box (m)

// smooth value noise in [0, 1], a few octaves
function makeNoise(seed) {
  const r = rng(seed);
  const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, z) => P[((x * 73856093) ^ (z * 19349663)) & 511];
  const s = (t) => t * t * (3 - 2 * t);
  const n1 = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = s(x - xi), zf = s(z - zi);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
  return (x, z) => (n1(x, z) * 0.55 + n1(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + n1(x * 4.3 - 11, z * 4.3 + 5) * 0.15);
}

export function buildValley(g, track, T, seed) {
  const rand = rng(seed);
  const noise = makeNoise(seed);
  const pts = track.route ? track.route.pts : [];
  // spatial hash of the driving line
  const HC = 32, hash = new Map();
  pts.forEach((q, i) => {
    if (i % 2) return;
    const k = Math.floor(q.p[0] / HC) + ',' + Math.floor(q.p[2] / HC);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(q);
  });
  // nearest line point (horizontal) and the lowest road in the corridor
  const near = (x, z, R) => {
    let best = Infinity, by = 0, low = Infinity;
    const cx = Math.floor(x / HC), cz = Math.floor(z / HC), n = Math.ceil(R / HC);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const list = hash.get((cx + i) + ',' + (cz + j));
      if (!list) continue;
      for (const q of list) {
        const d = Math.hypot(q.p[0] - x, q.p[2] - z);
        if (d < best) { best = d; by = q.p[1]; }
        if (d < CORRIDOR && q.p[1] < low) low = q.p[1];
      }
    }
    return { d: best, y: by, low };
  };

  // the gorge: where the line flies over a gap (the jump), a river crosses under it
  let river = null;
  const air = pts.filter((q) => q.air);
  if (air.length) {
    const mid = air[(air.length / 2) | 0];
    const f = new THREE.Vector2(mid.f[0], mid.f[2]).normalize();
    const lowEnd = Math.min(air[0].p[1], air[air.length - 1].p[1]);
    river = { x: mid.p[0], z: mid.p[2], fx: f.x, fz: f.y, y: lowEnd - 14 };
  }
  // the river meanders along the gorge but crosses straight under the jump
  const meander = (t) => 46 * Math.sin(t / 170) * Math.min(1, Math.abs(t) / 120);
  const riverDist = (x, z) => {
    if (!river) return Infinity;
    const dx = x - river.x, dz = z - river.z;
    const t = -dx * river.fz + dz * river.fx;          // along the river
    return Math.abs(dx * river.fx + dz * river.fz - meander(t));
  };
  // waterfall: off to one side of the gorge, falling from a cliff into the river
  const fall = river ? { x: river.x - river.fz * 110, z: river.z + river.fx * 110 } : null;

  const B = track.bbox;
  const x0 = B.minX - MARGIN, x1 = B.maxX + MARGIN, z0 = B.minZ - MARGIN, z1 = B.maxZ + MARGIN;
  const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
  const H = new Float32Array(nx * nz);
  const baseY = Math.min(0, ...pts.map((q) => q.p[1])) - 6;
  // coarse distance field (every 4th grid point, a thinned line) for the far terrain;
  // exact lookups only near the road
  const sparse = pts.filter((_, i) => i % 6 === 0);
  const cs = 4, cnx = Math.ceil(nx / cs) + 1, cnz = Math.ceil(nz / cs) + 1;
  const cd = new Float32Array(cnx * cnz), cy = new Float32Array(cnx * cnz);
  for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) {
    const x = x0 + i * cs * STEP, z = z0 + j * cs * STEP;
    let best = Infinity, by = 0;
    for (const q of sparse) { const d = Math.hypot(q.p[0] - x, q.p[2] - z); if (d < best) { best = d; by = q.p[1]; } }
    cd[j * cnx + i] = best; cy[j * cnx + i] = by;
  }
  const coarse = (i, j) => {
    const fi = i / cs, fj = j / cs, a = Math.min(cnx - 2, Math.floor(fi)), b = Math.min(cnz - 2, Math.floor(fj));
    const u = fi - a, v = fj - b, k = b * cnx + a;
    const lerp2 = (A) => (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + cnx] * (1 - u) + A[k + cnx + 1] * u) * v;
    return { d: lerp2(cd), y: lerp2(cy), low: Infinity };
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * STEP, z = z0 + j * STEP;
      const c0 = coarse(i, j);
      let n = c0.d < 110 ? near(x, z, 96) : c0;
      if (n.d === Infinity) n = c0;
      let h;
      if (n.low < Infinity) h = n.low - 1.6;                          // right under the road
      else if (n.d === Infinity) h = baseY + 40 + noise(x / 140, z / 140) * 160;
      else {
        // embankment next to the road, rolling into hills and mountains further out
        const t = Math.min(1, Math.max(0, (n.d - CORRIDOR) / 90));
        const e = t * t * (3 - 2 * t);
        const hills = baseY + 10 + noise(x / 110, z / 110) * 90 + (n.d / 260) * 70;
        h = (n.y - 1.6) * (1 - e) + Math.max(hills, n.y - 30) * e;
      }
      // the river valley (wide, with sloping banks) and a cliff for the waterfall
      if (river) {
        const dr = riverDist(x, z);
        const W = 95;
        if (dr < W && n.low === Infinity) {
          const k = dr < 16 ? 0 : ((dr - 16) / (W - 16)) ** 1.6;
          h = Math.min(h, river.y - 3 + k * Math.max(0, h - river.y + 3));
        }
        if (fall) {
          const df = Math.hypot(x - fall.x, z - fall.z);
          if (df < 70 && dr > 20) h = Math.max(h, river.y + 44 * (1 - (df / 70) ** 2));
        }
      }
      H[j * nx + i] = h;
    }
  }
  const groundAt = (x, z) => {
    const fx = (x - x0) / STEP, fz = (z - z0) / STEP;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  // terrain mesh: one colour per facet, grass on gentle slopes, rock on steep ones
  const pos = [], col = [];
  const grassA = new THREE.Color(0x5f9a3c), grassB = new THREE.Color(0x7bb24a), rock = new THREE.Color(0x7d8088), rockDark = new THREE.Color(0x5e6168);
  const c = new THREE.Color();
  const tri = (ax, az, bx, bz, cx, cz) => {
    const ay = H[az * nx + ax], by = H[bz * nx + bx], cy = H[cz * nx + cx];
    const A = [x0 + ax * STEP, ay, z0 + az * STEP], Bv = [x0 + bx * STEP, by, z0 + bz * STEP], C = [x0 + cx * STEP, cy, z0 + cz * STEP];
    const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    const slope = Math.abs(nyv) / Math.hypot(nxv, nyv, nzv);
    const k = noise(A[0] / 23, A[2] / 23);
    if (slope < 0.8) c.copy(rockDark).lerp(rock, k); else c.copy(grassA).lerp(grassB, k);
    if (nyv < 0) { pos.push(...A, ...C, ...Bv); } else { pos.push(...A, ...Bv, ...C); }
    for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if ((i + j) & 1) { tri(i, j, i + 1, j, i, j + 1); tri(i + 1, j, i + 1, j + 1, i, j + 1); } else { tri(i, j, i + 1, j + 1, i, j + 1); tri(i, j, i + 1, j, i + 1, j + 1); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  g.add(terrain);

  // river and waterfall
  const anim = [];
  if (river) {
    const wn = T.waterNormal.clone(); wn.needsUpdate = true;
    const wp = [], wuv = [];
    const span = Math.max(x1 - x0, z1 - z0);
    const half = 22;
    for (let t = -span; t < span; t += 12) {
      const row = (tt) => {
        const m = meander(tt);
        const cx = river.x - river.fz * tt + river.fx * m, cz = river.z + river.fx * tt + river.fz * m;
        return [[cx - river.fx * half, river.y, cz - river.fz * half], [cx + river.fx * half, river.y, cz + river.fz * half]];
      };
      const [a, b] = row(t), [c2, d] = row(t + 12);
      wp.push(...a, ...c2, ...b, ...b, ...c2, ...d);
      wuv.push(0, t / 40, 0, (t + 12) / 40, 1, t / 40, 1, t / 40, 0, (t + 12) / 40, 1, (t + 12) / 40);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
    wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      color: 0x1ba3b0, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide,
    }));
    water.name = 'river';
    g.add(water);
    anim.push((dt) => { wn.offset.y -= dt * 0.25; });
    if (fall) {
      const wt = T.waterfall.clone(); wt.needsUpdate = true; wt.repeat.set(2, 1.5);
      const top = river.y + 44, w = 22;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, top - river.y), new THREE.MeshStandardMaterial({ map: wt, transparent: true, opacity: 0.92, roughness: 0.3, emissive: 0x9fe6ee, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
      // facing the gorge, a few metres in front of the cliff
      const dx = river.x - fall.x, dz = river.z - fall.z, l = Math.hypot(dx, dz);
      m.position.set(fall.x + (dx / l) * 44, (top + river.y) / 2, fall.z + (dz / l) * 44);
      m.rotation.y = Math.atan2(dx, dz);
      m.name = 'waterfall';
      g.add(m);
      anim.push((dt) => { wt.offset.y += dt * 1.4; });
    }
  }

  // rock cave over the last stretch (from the last checkpoint to the finish)
  const indoor = [];
  const lastCp = track.checkpoints[track.checkpoints.length - 1];
  if (lastCp && pts.length) {
    let i0 = 0, bd = Infinity;
    pts.forEach((q, i) => { const d = Math.hypot(q.p[0] - lastCp.center[0], q.p[2] - lastCp.center[2]); if (d < bd) { bd = d; i0 = i; } });
    i0 = Math.min(pts.length - 2, i0 + 14);
    const ring = 14, rows = [];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = i0; i < pts.length; i += 3) {
      const q = pts[i];
      const r = new THREE.Vector3(q.r[0], 0, q.r[2]).normalize();
      const row = [];
      for (let k = 0; k <= ring; k++) {
        const a = (k / ring) * Math.PI;
        const bump = 1 + (noise(i * 0.37, k * 1.3) - 0.5) * 0.35;
        const px = q.p[0] + r.x * Math.cos(a) * 17 * bump, pz = q.p[2] + r.z * Math.cos(a) * 17 * bump;
        const py = q.p[1] - 1.5 + Math.sin(a) * 13 * bump;
        row.push([px, py, pz]);
        min[0] = Math.min(min[0], px); min[1] = Math.min(min[1], py); min[2] = Math.min(min[2], pz);
        max[0] = Math.max(max[0], px); max[1] = Math.max(max[1], py); max[2] = Math.max(max[2], pz);
      }
      rows.push(row);
    }
    const cp = [];
    for (let i = 0; i < rows.length - 1; i++) {
      for (let k = 0; k < ring; k++) {
        const a = rows[i][k], b = rows[i][k + 1], c2 = rows[i + 1][k], d = rows[i + 1][k + 1];
        cp.push(...a, ...b, ...c2, ...b, ...d, ...c2);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.computeVertexNormals();
    const cave = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x6d6f76, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
    cave.castShadow = true; cave.receiveShadow = true; cave.name = 'cave';
    g.add(cave);
    // dim inside, a few warm lamps along the roof
    const lamps = [];
    for (let i = 0; i < rows.length; i += 4) lamps.push(rows[i][ring / 2].map((v, k) => (k === 1 ? v - 2 : v)));
    indoor.push({ min, max, lamps });
  }

  // rocks and trees on the slopes, clear of the road
  const items = { rock: [], pine: [], green: [], cherry: [] };
  const place = (kind, n, dMin, dMax, sMin, sMax, sink = 0) => {
    let tries = 0, got = 0;
    while (got < n && tries++ < n * 40) {
      const q = pts[(rand() * pts.length) | 0];
      if (!q) break;
      const a = rand() * Math.PI * 2, d = dMin + rand() * (dMax - dMin);
      const x = q.p[0] + Math.cos(a) * d, z = q.p[2] + Math.sin(a) * d;
      const nn = near(x, z, dMin + 8);
      if (nn.d < dMin) continue;
      if (river && riverDist(x, z) < 30) continue;
      let s = sMin + rand() * (sMax - sMin);
      // the footprint must sit on the ground: shrink on slopes, skip cliffs
      const r0 = kind === 'rock' ? s * 0.85 : s * 0.15;
      const hs = [groundAt(x, z), groundAt(x + r0, z), groundAt(x - r0, z), groundAt(x, z + r0), groundAt(x, z - r0)];
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (hi - lo > (kind === 'rock' ? s * 0.45 : 3)) { if (kind !== 'rock' || s < sMin * 1.6) continue; s *= 0.6; }
      items[kind].push({ x, y: lo - sink * s, z, s, rot: rand() * 6.28 });
      got++;
    }
  };
  place('rock', 70, 20, 150, 5, 18, 0.2);
  place('pine', 90, 22, 260, 12, 24);
  place('green', 45, 20, 180, 9, 16);
  place('cherry', 35, 18, 120, 8, 13);

  return { groundAt, items, indoor, update: (dt) => anim.forEach((f) => f(dt)) };
}
