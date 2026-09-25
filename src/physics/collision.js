// Static collision world: triangle soup in a uniform spatial hash, plus an
// analytic ground plane and stadium boundary walls.

import { SURF } from '../config.js';

const IN = 19;      // floats per input triangle: a b c na nb nc surf
const ST = 22;      // floats per stored triangle: a b c n na nb nc surf
const MAX_CONTACTS = 48;

export class CollisionWorld {
  constructor(cellSize = 6) {
    this.cs = cellSize;
    this.inv = 1 / cellSize;
    this.T = new Float64Array(0);
    this.count = 0;
    this.cells = new Map();
    this.stamp = new Uint32Array(0);
    this.qid = 0;
    this.groundY = 0;
    this.groundSurf = SURF.GRASS;
    this.bounds = null; // { minX, maxX, minZ, maxZ }
    this.contacts = [];
    for (let i = 0; i < MAX_CONTACTS; i++) this.contacts.push({ px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, depth: 0, surf: 0 });
  }

  key(ix, iy, iz) {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  setTriangles(src) {
    const n = Math.floor(src.length / IN);
    const T = new Float64Array(n * ST);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const o = i * IN;
      const ax = src[o], ay = src[o + 1], az = src[o + 2];
      const bx = src[o + 3], by = src[o + 4], bz = src[o + 5];
      const cx = src[o + 6], cy = src[o + 7], cz = src[o + 8];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      nx /= len; ny /= len; nz /= len;
      const w = k * ST;
      T[w] = ax; T[w + 1] = ay; T[w + 2] = az;
      T[w + 3] = bx; T[w + 4] = by; T[w + 5] = bz;
      T[w + 6] = cx; T[w + 7] = cy; T[w + 8] = cz;
      T[w + 9] = nx; T[w + 10] = ny; T[w + 11] = nz;
      for (let j = 0; j < 9; j++) T[w + 12 + j] = src[o + 9 + j];
      T[w + 21] = src[o + 18];
      k++;
    }
    this.T = T;
    this.count = k;
    this.stamp = new Uint32Array(k);
    this.qid = 0;
    this.cells = new Map();
    const inv = this.inv;
    for (let i = 0; i < k; i++) {
      const w = i * ST;
      const minX = Math.min(T[w], T[w + 3], T[w + 6]) - 0.01, maxX = Math.max(T[w], T[w + 3], T[w + 6]) + 0.01;
      const minY = Math.min(T[w + 1], T[w + 4], T[w + 7]) - 0.01, maxY = Math.max(T[w + 1], T[w + 4], T[w + 7]) + 0.01;
      const minZ = Math.min(T[w + 2], T[w + 5], T[w + 8]) - 0.01, maxZ = Math.max(T[w + 2], T[w + 5], T[w + 8]) + 0.01;
      const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
      const y0 = Math.floor(minY * inv), y1 = Math.floor(maxY * inv);
      const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
        const key = this.key(ix, iy, iz);
        let list = this.cells.get(key);
        if (!list) { list = []; this.cells.set(key, list); }
        list.push(i);
      }
    }
  }

  _nextQuery() {
    this.qid++;
    if (this.qid > 0xfffffff0) { this.stamp.fill(0); this.qid = 1; }
    return this.qid;
  }

  // One-sided ray cast (only hits faces pointing against the ray).
  // Returns true and fills `out` { t, px, py, pz, nx, ny, nz, surf } on hit.
  raycast(ox, oy, oz, dx, dy, dz, maxT, out, withGround = true) {
    const T = this.T, inv = this.inv, stamp = this.stamp;
    const q = this._nextQuery();
    let best = maxT, hit = -1, bu = 0, bv = 0;
    const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
    const x0 = Math.floor(Math.min(ox, ex) * inv), x1 = Math.floor(Math.max(ox, ex) * inv);
    const y0 = Math.floor(Math.min(oy, ey) * inv), y1 = Math.floor(Math.max(oy, ey) * inv);
    const z0 = Math.floor(Math.min(oz, ez) * inv), z1 = Math.floor(Math.max(oz, ez) * inv);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) <= 512) {
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.key(ix, iy, iz));
        if (!list) continue;
        for (let li = 0; li < list.length; li++) {
          const id = list[li];
          if (stamp[id] === q) continue;
          stamp[id] = q;
          const w = id * ST;
          const ax = T[w], ay = T[w + 1], az = T[w + 2];
          const e1x = T[w + 3] - ax, e1y = T[w + 4] - ay, e1z = T[w + 5] - az;
          const e2x = T[w + 6] - ax, e2y = T[w + 7] - ay, e2z = T[w + 8] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det < 1e-9) continue; // back face or parallel
          const id2 = 1 / det;
          const sx = ox - ax, sy = oy - ay, sz = oz - az;
          const u = (sx * px + sy * py + sz * pz) * id2;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * id2;
          if (v < 0 || u + v > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * id2;
          if (t < 0 || t >= best) continue;
          best = t; hit = id; bu = u; bv = v;
        }
      }
    }
    let groundHit = false;
    if (withGround && dy < -1e-6 && oy > this.groundY) {
      const t = (this.groundY - oy) / dy;
      if (t >= 0 && t < best) { best = t; groundHit = true; }
    }
    if (groundHit) {
      out.t = best;
      out.px = ox + dx * best; out.py = this.groundY; out.pz = oz + dz * best;
      out.nx = 0; out.ny = 1; out.nz = 0;
      out.surf = this.groundSurf;
      out.tri = -1;
      return true;
    }
    if (hit < 0) return false;
    const w = hit * ST;
    const wa = 1 - bu - bv;
    let nx = T[w + 12] * wa + T[w + 15] * bu + T[w + 18] * bv;
    let ny = T[w + 13] * wa + T[w + 16] * bu + T[w + 19] * bv;
    let nz = T[w + 14] * wa + T[w + 17] * bu + T[w + 20] * bv;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 1e-6 && (nx * T[w + 9] + ny * T[w + 10] + nz * T[w + 11]) / nl > 0.5) { nx /= nl; ny /= nl; nz /= nl; } else { nx = T[w + 9]; ny = T[w + 10]; nz = T[w + 11]; }
    out.t = best;
    out.px = ox + dx * best; out.py = oy + dy * best; out.pz = oz + dz * best;
    out.nx = nx; out.ny = ny; out.nz = nz;
    out.surf = T[w + 21];
    out.tri = hit;
    return true;
  }

  // Collect sphere contacts. Returns the number of contacts written to this.contacts.
  sphere(cx, cy, cz, r) {
    const T = this.T, inv = this.inv, stamp = this.stamp, C = this.contacts;
    let n = 0;
    const q = this._nextQuery();
    const x0 = Math.floor((cx - r) * inv), x1 = Math.floor((cx + r) * inv);
    const y0 = Math.floor((cy - r) * inv), y1 = Math.floor((cy + r) * inv);
    const z0 = Math.floor((cz - r) * inv), z1 = Math.floor((cz + r) * inv);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      const list = this.cells.get(this.key(ix, iy, iz));
      if (!list) continue;
      for (let li = 0; li < list.length; li++) {
        const id = list[li];
        if (stamp[id] === q) continue;
        stamp[id] = q;
        const w = id * ST;
        const ax = T[w], ay = T[w + 1], az = T[w + 2];
        const fnx = T[w + 9], fny = T[w + 10], fnz = T[w + 11];
        const plane = (cx - ax) * fnx + (cy - ay) * fny + (cz - az) * fnz;
        if (plane < 0 || plane > r) continue; // behind the face or too far from its plane
        // closest point on triangle (Ericson, RTCD 5.1.5)
        const bx = T[w + 3], by = T[w + 4], bz = T[w + 5];
        const ccx = T[w + 6], ccy = T[w + 7], ccz = T[w + 8];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = ccx - ax, acy = ccy - ay, acz = ccz - az;
        const apx = cx - ax, apy = cy - ay, apz = cz - az;
        const d1 = abx * apx + aby * apy + abz * apz;
        const d2 = acx * apx + acy * apy + acz * apz;
        let qx, qy, qz;
        if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
          const bpx = cx - bx, bpy = cy - by, bpz = cz - bz;
          const d3 = abx * bpx + aby * bpy + abz * bpz;
          const d4 = acx * bpx + acy * bpy + acz * bpz;
          if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; } else {
            const vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) {
              const v = d1 / (d1 - d3);
              qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v;
            } else {
              const cpx = cx - ccx, cpy = cy - ccy, cpz = cz - ccz;
              const d5 = abx * cpx + aby * cpy + abz * cpz;
              const d6 = acx * cpx + acy * cpy + acz * cpz;
              if (d6 >= 0 && d5 <= d6) { qx = ccx; qy = ccy; qz = ccz; } else {
                const vb = d5 * d2 - d1 * d6;
                if (vb <= 0 && d2 >= 0 && d6 <= 0) {
                  const ww = d2 / (d2 - d6);
                  qx = ax + acx * ww; qy = ay + acy * ww; qz = az + acz * ww;
                } else {
                  const va = d3 * d6 - d5 * d4;
                  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                    const ww = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                    qx = bx + (ccx - bx) * ww; qy = by + (ccy - by) * ww; qz = bz + (ccz - bz) * ww;
                  } else {
                    const den = 1 / (va + vb + vc);
                    const v = vb * den, ww = vc * den;
                    qx = ax + abx * v + acx * ww; qy = ay + aby * v + acy * ww; qz = az + abz * v + acz * ww;
                  }
                }
              }
            }
          }
        }
        const dx = cx - qx, dy = cy - qy, dz = cz - qz;
        const d2s = dx * dx + dy * dy + dz * dz;
        if (d2s >= r * r) continue;
        const d = Math.sqrt(d2s);
        if (n >= MAX_CONTACTS) continue;
        const c = C[n++];
        c.px = qx; c.py = qy; c.pz = qz;
        if (d > 1e-5) { c.nx = dx / d; c.ny = dy / d; c.nz = dz / d; } else { c.nx = fnx; c.ny = fny; c.nz = fnz; }
        c.depth = r - d;
        c.surf = T[w + 21];
      }
    }
    // ground plane
    if (cy - r < this.groundY && n < MAX_CONTACTS) {
      const c = C[n++];
      c.px = cx; c.py = this.groundY; c.pz = cz;
      c.nx = 0; c.ny = 1; c.nz = 0;
      c.depth = this.groundY - (cy - r);
      c.surf = this.groundSurf;
    }
    // stadium boundary
    const B = this.bounds;
    if (B) {
      if (cx - r < B.minX) n = this._wall(n, B.minX, cy, cz, 1, 0, B.minX - (cx - r));
      if (cx + r > B.maxX) n = this._wall(n, B.maxX, cy, cz, -1, 0, cx + r - B.maxX);
      if (cz - r < B.minZ) n = this._wall(n, cx, cy, B.minZ, 0, 1, B.minZ - (cz - r));
      if (cz + r > B.maxZ) n = this._wall(n, cx, cy, B.maxZ, 0, -1, cz + r - B.maxZ);
    }
    return n;
  }

  _wall(n, px, py, pz, nx, nz, depth) {
    if (n >= MAX_CONTACTS) return n;
    const c = this.contacts[n];
    c.px = px; c.py = py; c.pz = pz;
    c.nx = nx; c.ny = 0; c.nz = nz;
    c.depth = depth;
    c.surf = SURF.WALL;
    return n + 1;
  }
}
