// AI driver that follows the route centreline (pure pursuit steering plus a
// curvature based speed plan). Used for the menu attract mode and for
// validating the built-in tracks.

import * as THREE from 'three';
import { SURFACES, VARIANT_SURF, GRAVITY } from '../config.js';
import { clamp } from '../util/math.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

export class Bot {
  // fullSpeed: never lift or brake (the intended line on full-speed tracks)
  constructor(route, car, { skill = 1, lateral = 0, fullSpeed = false } = {}) {
    this.route = route;
    this.P = car.P;
    this.skill = skill;
    this.fullSpeed = fullSpeed;
    this.lateral = lateral;
    this.idx = 0;
    this.stuck = 0;
    this.vt = this._speedProfile();
  }

  reset(idx = 0) {
    this.idx = idx;
    this.stuck = 0;
  }

  _grip(pt) {
    const b = pt.block;
    if (!b) return 1;
    const surf = VARIANT_SURF[b.def.profile === 'platform' && b.surf === 'road' ? 'platform' : b.surf];
    return (SURFACES[surf] || SURFACES[0]).grip;
  }

  _speedProfile() {
    const pts = this.route.pts, P = this.P;
    const n = pts.length;
    const vt = new Float32Array(n);
    const vmax = 160;
    for (let i = 0; i < n; i++) {
      const k = Math.abs(pts[i].k || 0);
      const grip = this._grip(pts[i]);
      const mu = P.mu * grip * 0.78 * this.skill;
      const a0 = mu * GRAVITY;
      const cd = (mu * P.downforce) / P.mass;
      if (k < 1e-4) vt[i] = vmax;
      else {
        const den = k - cd;
        vt[i] = den <= 0 ? vmax : Math.min(vmax, Math.sqrt(a0 / den));
      }
      // crests: stay (mostly) on the ground
      const kv = pts[i].kv || 0;
      const cdown = P.downforce / P.mass;
      if (kv < -cdown && !pts[i].air) {
        const g = GRAVITY * Math.max(0.3, pts[i].u[1]);
        vt[i] = Math.min(vt[i], 1.12 * Math.sqrt(g / (-kv - cdown)));
      }
    }
    for (let i = n - 2; i >= 0; i--) {
      const ds = pts[i + 1].s - pts[i].s;
      const aBrake = 15 * this.skill * Math.min(this._grip(pts[i]), this._grip(pts[i + 1]));
      const lim = pts[i].air ? vt[i + 1] : Math.sqrt(vt[i + 1] * vt[i + 1] + 2 * aBrake * ds);
      vt[i] = Math.min(vt[i], lim);
    }
    return vt;
  }

  update(car, dt) {
    const route = this.route;
    const pos = [car.pos.x, car.pos.y, car.pos.z];
    this.idx = route.nearest(pos, this.idx, 8, 50);
    const pt = route.pts[this.idx];
    const v = car.speed;
    car.forward(_f); car.right(_r); car.up(_u);

    const Ld = clamp(6 + v * 0.42, 8, 50);
    const tgt = route.at(pt.s + Ld);
    const dx = tgt.p[0] - pos[0], dy = tgt.p[1] - pos[1], dz = tgt.p[2] - pos[2];
    const x = dx * _r.x + dy * _r.y + dz * _r.z;
    const z = dx * _f.x + dy * _f.y + dz * _f.z;
    const alpha = Math.atan2(x, Math.max(z, 0.5));
    const kappa = (2 * Math.sin(alpha)) / Ld;
    const delta = Math.atan(this.P.wheelbase * kappa);
    const lim = Math.max(0.005, car.steerLimit(car.fwdSpeed));
    let steer = clamp(delta / lim, -1, 1);

    // speed plan
    const look = Math.min(route.pts.length - 1, this.idx + Math.ceil((v * 0.35) / route.step) + 1);
    let target = Infinity;
    for (let i = this.idx; i <= look; i++) target = Math.min(target, this.vt[i]);
    let throttle = 1, brake = 0;
    if (v > target + 2.5) { throttle = 0; brake = clamp((v - target) / 6, 0.35, 1); } else if (v > target) throttle = 0.3;

    if (car.grounded === 0) { steer = 0; throttle = 1; brake = 0; }

    // stuck / lost detection
    const off = Math.hypot(pt.p[0] - pos[0], pt.p[2] - pos[2]);
    if ((car.speed < 2 && car.grounded < 4) || off > 40 || pos[1] < pt.p[1] - 12) this.stuck += dt; else this.stuck = 0;
    const respawn = this.stuck > 2.0;
    if (respawn) this.stuck = 0;
    if (this.fullSpeed) return { throttle: 1, brake: 0, steer, respawn, noDrift: true };
    return { throttle, brake, steer, respawn, noDrift: true };
  }
}
