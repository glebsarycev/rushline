// A playable track: blocks placed on the grid, their connections, gameplay
// features (spawn, checkpoints, finish, boosts), supports and collision.

import { CELL, LEVEL, HALF, ROAD_Y, ROAD_HALF, SLAB } from '../config.js';
import { ensureBlock, worldPort, worldCells, worldFrame, rotXZ, portKey, vlerp, vnorm } from './blocks.js';
import { blockGeometry, blockProfile, featureInfo, GeoBuffer } from './geometry.js';
import { CollisionWorld } from '../physics/collision.js';
import { computeRoute } from './route.js';
import { buildScenery, trussPillar, parseHangars } from './scenery.js';

// ---- transforms for placed blocks ---------------------------------------------------
export function blockXform(b) {
  const [c, s] = [[1, 0], [0, -1], [-1, 0], [0, 1]][b.rot & 3];
  return { c, s, ox: b.x * CELL, oy: b.y * LEVEL, oz: b.z * CELL };
}

// an end of a block gets a cap when nothing joins it there, or when the joined block has
// a different cross-section (road into a wide deck)
export function needsCap(b, i) {
  const l = b.links && b.links[i];
  if (!l) return true;
  return blockProfile(l.b.def, l.b.edge) !== blockProfile(b.def, b.edge);
}

// append collision triangles (19 floats each) of `src` transformed by block `b`
export function appendColl(out, src, b) {
  const { c, s, ox, oy, oz } = blockXform(b);
  for (let i = 0; i < src.length; i += 19) {
    for (let v = 0; v < 3; v++) {
      const x = src[i + v * 3], y = src[i + v * 3 + 1], z = src[i + v * 3 + 2];
      out.push(x * c + z * s + ox, y + oy, -x * s + z * c + oz);
    }
    for (let v = 0; v < 3; v++) {
      const x = src[i + 9 + v * 3], y = src[i + 10 + v * 3], z = src[i + 11 + v * 3];
      out.push(x * c + z * s, y, -x * s + z * c);
    }
    out.push(src[i + 18]);
  }
}

export function localToWorld(b, lx, ly, lz) {
  const [x, z] = rotXZ(lx, lz, b.rot);
  return [b.x * CELL + x, b.y * LEVEL + ly, b.z * CELL + z];
}

export function dirToWorld(b, lx, ly, lz) {
  const [x, z] = rotXZ(lx, lz, b.rot);
  return [x, ly, z];
}

export function parseBlocks(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const def = ensureBlock(e[0]);
    if (!def) continue;
    out.push({ i, type: e[0], x: e[1] | 0, y: e[2] | 0, z: e[3] | 0, rot: (e[4] | 0) & 3, surf: e[5] || 'road', edge: e[6] === 'open' ? 'open' : 'wall', def });
  }
  return out;
}

// Gates of side-by-side platform cells (a checkpoint line across a plaza) become
// one wide gate: crossing any part of the line counts once.
function mergeGates(list) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    const g = list[i];
    const group = [g];
    used.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < list.length; j++) {
        if (used.has(j)) continue;
        const h = list[j];
        if (h.block.def.profile !== 'platform' || g.block.def.profile !== 'platform') continue;
        if (Math.abs(h.fwd[0] * g.fwd[0] + h.fwd[2] * g.fwd[2]) < 0.99) continue;
        const near = group.some((m) => {
          const dx = h.center[0] - m.center[0], dy = h.center[1] - m.center[1], dz = h.center[2] - m.center[2];
          const along = dx * g.fwd[0] + dz * g.fwd[2], lat = dx * g.right[0] + dz * g.right[2];
          return Math.abs(along) < 1 && Math.abs(dy) < 1 && Math.abs(Math.abs(lat) - CELL) < 1;
        });
        if (near) { group.push(h); used.add(j); grew = true; }
      }
    }
    if (group.length === 1) { out.push(g); continue; }
    const lats = group.map((m) => (m.center[0] - g.center[0]) * g.right[0] + (m.center[2] - g.center[2]) * g.right[2]);
    const lo = Math.min(...lats), hi = Math.max(...lats), mid = (lo + hi) / 2;
    out.push({ ...g, center: [g.center[0] + g.right[0] * mid, g.center[1], g.center[2] + g.right[2] * mid], halfWidth: (hi - lo) / 2 + HALF, blocks: group.map((m) => m.block) });
  }
  return out;
}

export class Track {
  constructor(data, { collision = true } = {}) {
    this.data = data;
    this.id = data.id || 'custom';
    this.name = data.name || 'Untitled';
    this.author = data.author || 'Unknown';
    this.env = data.env || 'day';
    this.land = data.land || 'mountains';
    this.medals = data.medals || null;
    this.blocks = parseBlocks(data.blocks || []);
    this._ports();
    this._features();
    this._bounds();
    this._guides();
    if (collision) this._collision();
    this._route = undefined;
  }

  get route() {
    if (this._route === undefined) this._route = computeRoute(this);
    return this._route;
  }

  _ports() {
    this.portMap = new Map();
    for (const b of this.blocks) {
      b.ports = b.def.ports.map((_, i) => worldPort(b, i));
      for (const p of b.ports) {
        if (p.open) continue;
        const k = portKey(p.p);
        let list = this.portMap.get(k);
        if (!list) this.portMap.set(k, (list = []));
        list.push({ b, p });
      }
    }
    for (const b of this.blocks) {
      b.links = b.ports.map((p) => {
        if (p.open) return null;
        const list = this.portMap.get(portKey(p.p)) || [];
        const o = list.find((e) => e.b !== b && ((e.p.d + 2) & 3) === p.d);
        return o ? { b: o.b, idx: o.p.idx } : null;
      });
    }
  }

  _features() {
    this.spawn = null;
    this.startBlock = null;
    this.checkpoints = [];
    this.finishes = [];
    this.boosts = [];
    for (const b of this.blocks) {
      const info = featureInfo(b.def);
      if (!info) continue;
      if (info.frame) { this._sweepFeature(b, info); continue; }
      const fwd = dirToWorld(b, 0, 0, -1);
      const right = dirToWorld(b, 1, 0, 0);
      if (info.type === 'start') {
        if (!this.spawn) {
          this.spawn = { pos: localToWorld(b, ...info.spawn), heading: b.rot, fwd };
          this.startBlock = b;
        }
      } else if (info.type === 'cp' || info.type === 'finish') {
        const g = {
          type: info.type,
          center: localToWorld(b, 0, ROAD_Y, info.gateZ),
          fwd, right, up: [0, 1, 0],
          halfWidth: b.def.profile === 'platform' ? HALF : ROAD_HALF + 2.5,
          height: 10,
          block: b,
        };
        if (info.type === 'cp') { g.index = this.checkpoints.length; this.checkpoints.push(g); } else this.finishes.push(g);
      } else if (info.type === 'boost') {
        this.boosts.push({
          center: localToWorld(b, 0, ROAD_Y, 0), fwd, right,
          halfLen: info.halfLen, halfWidth: info.halfWidth, strength: info.strength, block: b,
        });
      }
    }
    this.checkpoints.forEach((g, i) => { g.index = i; });
    this.checkpoints = mergeGates(this.checkpoints);
    this.checkpoints.forEach((g, i) => { g.index = i; });
    this.finishes = mergeGates(this.finishes);
  }

  // checkpoint / finish / turbo on a sweep piece: gate and pad follow its bank and grade
  _sweepFeature(b, info) {
    const fr = worldFrame(b, info.frame);
    if (info.type === 'start') {
      if (!this.spawn) {
        this.spawn = { pos: worldFrame(b, info.spawnFrame).p, heading: b.rot, fwd: fr.f };
        this.startBlock = b;
      }
      return;
    }
    if (info.type === 'boost') {
      this.boosts.push({ center: fr.p, fwd: fr.f, right: fr.r, up: fr.u, halfLen: info.halfLen, halfWidth: info.halfWidth, strength: info.strength, block: b });
      return;
    }
    const g = { type: info.type, center: fr.p, fwd: fr.f, right: fr.r, up: fr.u, halfWidth: info.halfWidth, height: 10, block: b };
    if (info.type === 'cp') this.checkpoints.push(g); else this.finishes.push(g);
  }

  // loops keep the car centred with a gentle assist (see Race._guide)
  _guides() {
    this.guides = [];
    for (const b of this.blocks) {
      if (!b.def.guided) continue;
      const frames = b.def.frames.map((f) => worldFrame(b, f));
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const f of frames) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], f.p[k]); max[k] = Math.max(max[k], f.p[k]); }
      min = min.map((v) => v - 6); max = max.map((v) => v + 6);
      this.guides.push({ block: b, frames, min, max, hint: 0, ...b.def.guided });
    }
  }

  _bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (const b of this.blocks) {
      for (const [cx, cy, cz] of worldCells(b)) {
        minX = Math.min(minX, cx * CELL - HALF); maxX = Math.max(maxX, cx * CELL + HALF);
        minZ = Math.min(minZ, cz * CELL - HALF); maxZ = Math.max(maxZ, cz * CELL + HALF);
        maxY = Math.max(maxY, (cy + 1) * LEVEL);
      }
    }
    if (!isFinite(minX)) { minX = -64; maxX = 64; minZ = -64; maxZ = 64; }
    this.bbox = { minX, maxX, minZ, maxZ, maxY };
    // hangars and manual decor widen the stadium, not the track box
    for (const h of parseHangars(this.data.hangars)) {
      minX = Math.min(minX, h.x0 * CELL - HALF); maxX = Math.max(maxX, h.x1 * CELL + HALF);
      minZ = Math.min(minZ, h.z0 * CELL - HALF); maxZ = Math.max(maxZ, h.z1 * CELL + HALF);
    }
    for (const d of this.data.decor || []) {
      minX = Math.min(minX, d[1] * CELL - HALF); maxX = Math.max(maxX, d[1] * CELL + HALF);
      minZ = Math.min(minZ, d[2] * CELL - HALF); maxZ = Math.max(maxZ, d[2] * CELL + HALF);
    }
    const m = 56; // field margin around the track: stands close in, the track fills the bowl
    this.stadium = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
    this.center = [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
  }

  // Collision triangles for the whole track (blocks, caps, pillars, hangars, decor)
  _collision() {
    const tris = [];
    for (const b of this.blocks) {
      const g = blockGeometry(b.type, b.surf, b.edge);
      appendColl(tris, g.body.coll, b);
      for (let i = 0; i < 2; i++) if (needsCap(b, i)) appendColl(tris, g.caps[i].coll, b);
    }
    const base = new CollisionWorld();
    base.setTriangles(tris);
    this.pillars = this._pillars(base);
    this.scenery = buildScenery(this);
    const all = tris.concat(this.pillars.coll, this.scenery.buf.coll);
    this.world = new CollisionWorld();
    this.world.setTriangles(all);
    this.world.bounds = this.stadium;
  }

  // Steel truss supports under elevated road, skipped where they would hit other road.
  _pillars(world) {
    const buf = new GeoBuffer();
    const hit = {};
    const clear = (x, y, z) => !world.raycast(x, y, z, 0, -1, 0, y - 0.2, hit, false);
    for (const b of this.blocks) {
      const fr = b.def.frames;
      const L = b.def.length;
      const n = Math.max(1, Math.round(L / 34));
      for (let k = 0; k < n; k++) {
        const s = (L * (k + 0.5)) / n;
        let i = 0;
        while (i < fr.length - 2 && fr[i + 1].s < s) i++;
        const t = (s - fr[i].s) / Math.max(1e-6, fr[i + 1].s - fr[i].s);
        const lp = vlerp(fr[i].p, fr[i + 1].p, t);
        const lu = vnorm(vlerp(fr[i].u, fr[i + 1].u, t));
        if (lu[1] < 0.93) continue;
        const [x, y, z] = localToWorld(b, lp[0], lp[1], lp[2]);
        const bottom = y - SLAB - 0.05;
        if (bottom < 2.5) continue;
        const r = 1.3;
        if (!clear(x, bottom - 0.05, z) || !clear(x - r, bottom - 0.05, z - r) || !clear(x + r, bottom - 0.05, z + r) ||
            !clear(x - r, bottom - 0.05, z + r) || !clear(x + r, bottom - 0.05, z - r)) continue;
        trussPillar(buf, x, bottom, z);
      }
    }
    return buf;
  }

  // basic sanity info for the editor / menus
  get summary() {
    return {
      blocks: this.blocks.length,
      hasStart: !!this.spawn,
      starts: this.blocks.filter((b) => b.def.feature === 'start').length,
      finishes: this.finishes.length,
      checkpoints: this.checkpoints.length,
    };
  }
}
