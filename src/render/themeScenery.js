// Theme scenery: the big set pieces that give each campaign track its own world
// (see track/themes.js). Built as plain Three.js meshes around the track; they are
// looked at, not driven on.
//   violet: giant glowing rings floating around the stadium
//   mirror: wooden towers inside the spirals, pillar islands with autumn trees, and
//           the whole world reflected upside down in a mirror plane at ground level
//   valley: terrain, a river and a waterfall, a rock cave, rocks and trees (valley.js)

import * as THREE from 'three';
import { themeOf } from '../track/themes.js';
import { rng, hashString } from '../util/math.js';
import { CELL, HALF, DECK } from '../config.js';
import { localToWorld } from '../track/track.js';
import { loadNature, natureInstances } from './nature.js';
import { buildValley } from './valley.js';
import { buildSigns } from './signs.js';

export class ThemeScenery {
  constructor(scene, textures) {
    this.scene = scene;
    this.T = textures;
    this.group = null;
    this.mirror = null;
    this.mats = {};
    this.version = 0;
  }

  _mat(key, make) {
    return this.mats[key] || (this.mats[key] = make());
  }

  clear() {
    this.version++;
    for (const k of ['group', 'mirror']) {
      const grp = this[k];
      if (!grp) continue;
      this.scene.remove(grp);
      grp.traverse((o) => {
        if (o.isInstancedMesh && k === 'group') o.dispose();
        else if (o.isMesh && !o.userData.shared && k === 'group') o.geometry.dispose();
      });
      this[k] = null;
    }
  }

  // trackGroup: the track's meshes (mirrored in the mirror world)
  build(track, trackGroup = null) {
    this.clear();
    const th = themeOf(track.theme);
    const g = new THREE.Group();
    g.name = 'themeScenery';
    const rand = rng(hashString('theme:' + track.id));
    this.group = g;
    this.scene.add(g);
    this.anim = null;
    track.groundAt = null;
    // direction signs on every track (before the mirror world copies the scene)
    g.add(buildSigns(track, th.sign || '#15181d'));
    if (track.theme === 'violet') this._rings(g, track, rand);
    if (track.theme === 'mirror') this._mirrorWorld(g, track, rand, trackGroup);
    if (track.theme === 'valley') {
      const v = buildValley(g, track, this.T, hashString('valley:' + track.id));
      // a car below the grass respawns; the cave is lit like a hangar interior
      track.groundAt = v.groundAt;
      if (track.scenery) track.scenery.indoor = track.scenery.indoor.concat(v.indoor);
      this.anim = v.update;
      this._plant(g, v.items);
    }
    return th;
  }

  // plant nature models once they have loaded (the scene may have changed by then)
  _plant(parent, byKind, after) {
    const v = this.version;
    loadNature().then((data) => {
      if (v !== this.version) return;
      for (const kind in byKind) {
        if (!byKind[kind].length) continue;
        const m = natureInstances(data, kind, byKind[kind]);
        parent.add(m);
        if (after) after(m);
      }
    }).catch((err) => console.warn('Nature models unavailable:', err && err.message ? err.message : err));
  }

  update(dt) {
    if (this.anim) this.anim(dt);
  }

  // ---- violet ------------------------------------------------------------------------------
  // Open bands (short wide cylinders) with glowing rims, alone or linked in clusters,
  // placed where they clear the driving line.
  _rings(g, track, rand) {
    const band = this._mat('ringBand', () => new THREE.MeshStandardMaterial({
      color: 0x6a2fd8, emissive: 0x4c16b8, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide,
    }));
    const rim = this._mat('ringRim', () => new THREE.MeshStandardMaterial({ color: 0xd9b8ff, emissive: 0xb07cff, emissiveIntensity: 3.2, roughness: 0.4 }));
    const pts = track.route ? track.route.pts : [];
    const clear = (c, r) => {
      for (let i = 0; i < pts.length; i += 3) {
        const p = pts[i].p;
        if (Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) < r + 8) return false;
      }
      return true;
    };
    const ring = (c, R, H, tiltX, tiltZ, yaw) => {
      const o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 72, 1, true), band);
      o.add(body);
      for (const y of [-H / 2, H / 2]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 96), rim);
        t.rotation.x = Math.PI / 2;
        t.position.y = y;
        o.add(t);
      }
      o.position.copy(c);
      // tilt the band's axis first, then turn it around the vertical
      o.rotation.order = 'YXZ';
      o.rotation.set(tiltX, yaw, tiltZ);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.add(o);
    };
    // hoops the road runs through, on plain stretches away from gates and stunts
    const gates = track.checkpoints.concat(track.finishes).map((q) => q.center);
    const hoop = (i) => {
      const q = pts[i];
      const cat = q.block && q.block.def.cat;
      if (q.air || q.nearAir || cat === 'stunt' || cat === 'pipe' || cat === 'special') return false;
      if (gates.some((c) => Math.hypot(c[0] - q.p[0], c[2] - q.p[2]) < 45)) return false;
      const R = q.block.def.profile === 'deck' ? 21 : 17;
      const f = new THREE.Vector3(q.f[0], 0, q.f[2]).normalize();
      const side = new THREE.Vector3(-f.z, 0, f.x);
      // the band must not touch any other part of the track
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const c = new THREE.Vector3(q.p[0], q.p[1], q.p[2]).addScaledVector(side, Math.cos(a) * R).add(new THREE.Vector3(0, Math.sin(a) * R, 0));
        for (let j = 0; j < pts.length; j += 2) {
          if (Math.abs(j - i) < 30) continue;
          const p = pts[j].p;
          if (Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) < 10) return false;
        }
      }
      ring(new THREE.Vector3(q.p[0], q.p[1], q.p[2]), R, 5, Math.PI / 2, 0, Math.atan2(f.x, f.z));
      return true;
    };
    let last = -1e9;
    for (let i = 60; i < pts.length - 60; i += 4) {
      if (pts[i].s - last < 380) continue;
      if (hoop(i)) last = pts[i].s;
    }

    const B = track.bbox;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ);
    let placed = 0;
    // clusters of linked rings, like a knot hanging over the field
    for (let k = 0; k < 40 && placed < 3; k++) {
      const c = new THREE.Vector3(cx + (rand() - 0.5) * span * 0.9, 45 + rand() * 30, cz + (rand() - 0.5) * span * 0.9);
      if (!clear(c, 70)) continue;
      for (let j = 0; j < 4; j++) {
        const R = 16 + rand() * 10;
        const off = new THREE.Vector3((rand() - 0.5) * 34, (rand() - 0.5) * 14, (rand() - 0.5) * 34);
        ring(c.clone().add(off), R, 3.5 + rand() * 2.5, Math.PI / 2 * (0.6 + rand() * 0.8), (rand() - 0.5) * 1.2, rand() * Math.PI);
      }
      placed++;
    }
    // single giant rings standing or leaning around the track
    let singles = 0;
    for (let k = 0; k < 200 && singles < 10; k++) {
      const R = 26 + rand() * 26;
      const c = new THREE.Vector3(cx + (rand() - 0.5) * span * 1.1, R * (0.6 + rand() * 1.1), cz + (rand() - 0.5) * span * 1.1);
      if (!clear(c, R)) continue;
      ring(c, R, 5 + rand() * 4, Math.PI / 2 + (rand() - 0.5) * 0.9, (rand() - 0.5) * 0.6, rand() * Math.PI);
      singles++;
    }
  }

  // ---- mirror world --------------------------------------------------------------------------
  _mirrorWorld(g, track, rand, trackGroup) {
    const T = this.T;
    const wood = this._mat('wood', () => {
      const t = T.wood.clone(); t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.78, color: 0xffffff });
    });
    const grass = this._mat('terrace', () => new THREE.MeshStandardMaterial({ map: T.grass, color: 0xb8c98a, roughness: 0.95 }));
    const pts = track.route ? track.route.pts : [];
    const trees = { autumn: [], green: [], pine: [] };
    const pickTree = () => { const r = rand(); return r < 0.55 ? 'autumn' : r < 0.9 ? 'green' : 'pine'; };
    // lowest road passing over a disc (x, z, r): a tower must stay below it
    const ceiling = (x, z, r, from) => {
      let low = Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i].p;
        if (p[1] > from && Math.hypot(p[0] - x, p[2] - z) < r + DECK.half + 4) low = Math.min(low, p[1]);
      }
      return low;
    };
    const roadNear = (x, y, z, r) => {
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i].p;
        if (Math.abs(p[1] - y) < 9 && Math.hypot(p[0] - x, p[2] - z) < r + DECK.half + 6) return true;
      }
      return false;
    };
    const tower = (x, z, r, top) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, top, 48, 1, true), wood);
      body.position.set(x, top / 2, z);
      const uv = body.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.round((2 * Math.PI * r) / 24), uv.getY(i) * (top / 24));
      g.add(body);
      // grass cap with trees
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.5, r + 1.5, 2.4, 48), [wood, grass, wood]);
      cap.position.set(x, top + 1.2, z);
      g.add(cap);
      const n = Math.max(3, Math.round((r * r) / 260));
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (r - 6);
        trees[pickTree()].push({ x: x + Math.cos(a) * d, y: top + 2.4, z: z + Math.sin(a) * d, s: 14 + rand() * 12, rot: rand() * 6.28 });
      }
      // terraces: grass rings sticking out of the tower, with a few trees
      for (let y = 18 + rand() * 10; y < top - 14; y += 22 + rand() * 12) {
        if (roadNear(x, y, z, r + 6)) continue;
        const ter = new THREE.Mesh(new THREE.CylinderGeometry(r + 6, r + 6, 2, 48), [wood, grass, wood]);
        ter.position.set(x, y, z);
        g.add(ter);
        const m = Math.round(r / 24);
        for (let k = 0; k < m; k++) {
          const a = rand() * Math.PI * 2;
          trees[pickTree()].push({ x: x + Math.cos(a) * (r + 3), y: y + 1, z: z + Math.sin(a) * (r + 3), s: 8 + rand() * 7, rot: rand() * 6.28 });
        }
      }
    };

    // towers inside the spirals: centres of curvature of the curved pieces, clustered
    const centres = [];
    for (const b of track.blocks) {
      const sw = b.def.sweep;
      if (!sw || sw.shape === 's') continue;
      const R = (sw.n - 0.5) * CELL;
      const c = localToWorld(b, sw.shape === 'r' ? R : -R, 0, HALF);
      centres.push({ x: c[0], z: c[2], R });
    }
    const clusters = [];
    for (const c of centres) {
      const k = clusters.find((q) => Math.hypot(q.x - c.x, q.z - c.z) < 24);
      if (k) { k.n++; k.x += (c.x - k.x) / k.n; k.z += (c.z - k.z) / k.n; k.R = Math.min(k.R, c.R); } else clusters.push({ ...c, n: 1 });
    }
    for (const c of clusters) {
      if (c.R < 70) continue;
      const r = Math.min(46, c.R - DECK.half - DECK.lip - 10);
      const top = Math.min(ceiling(c.x, c.z, r, 0) - 7, (track.bbox.maxY || 120) + 24);
      if (top > 24) tower(c.x, c.z, r, top);
    }
    // free pillars around the track: the abstract world goes on
    const B = track.bbox;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ);
    let pillars = 0;
    for (let k = 0; k < 400 && pillars < 16; k++) {
      const r = 12 + rand() * 22;
      const x = cx + (rand() - 0.5) * span * 1.9, z = cz + (rand() - 0.5) * span * 1.9;
      const top = Math.min(ceiling(x, z, r + 6, 0) - 7, 30 + rand() * ((B.maxY || 120) + 30));
      if (top < 24) continue;
      if (clusters.some((c) => Math.hypot(c.x - x, c.z - z) < 60)) continue;
      tower(x, z, r, top);
      pillars++;
    }

    // the mirror: a faint glassy plane at ground level, and everything reflected below it
    const glass = this._mat('glass', () => new THREE.MeshStandardMaterial({
      color: 0xe9e3da, metalness: 1, roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false,
    }));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), glass);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, 0.02, cz);
    plane.renderOrder = 2;
    g.add(plane);
    const mirror = new THREE.Group();
    mirror.name = 'mirrorWorld';
    mirror.scale.y = -1;
    const reflect = (src) => {
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        if (!o.isMesh || o === plane) return;
        const m = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, o.material, o.count) : new THREE.Mesh(o.geometry, o.material);
        if (o.isInstancedMesh) m.instanceMatrix = o.instanceMatrix;
        m.matrixAutoUpdate = false;
        m.matrix.copy(o.matrixWorld);
        m.userData.shared = true;
        m.castShadow = false;
        m.receiveShadow = true;
        mirror.add(m);
      });
    };
    if (trackGroup) reflect(trackGroup);
    reflect(g);
    this.mirror = mirror;
    this.scene.add(mirror);
    this._plant(g, trees, (m) => reflect(m));
  }
}
