// Theme scenery: the big set pieces that give each campaign track its own world
// (see track/themes.js). Built as plain Three.js meshes around the track; they are
// looked at, not driven on.
//   violet: giant glowing rings floating around the stadium

import * as THREE from 'three';
import { themeOf } from '../track/themes.js';
import { rng, hashString } from '../util/math.js';

export class ThemeScenery {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.mats = {};
  }

  _mat(key, make) {
    return this.mats[key] || (this.mats[key] = make());
  }

  clear() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
    this.group = null;
  }

  build(track) {
    this.clear();
    const th = themeOf(track.theme);
    const g = new THREE.Group();
    g.name = 'themeScenery';
    const rand = rng(hashString('theme:' + track.id));
    if (track.theme === 'violet') this._rings(g, track, rand);
    this.group = g;
    this.scene.add(g);
    return th;
  }

  update() {}

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
}
