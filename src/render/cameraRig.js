// Race cameras (chase / far / hood), finish orbit and the TV-style attract camera.

import * as THREE from 'three';
import { clamp } from '../util/math.js';

export const CAM_MODES = ['chase', 'far', 'hood'];
const MODES = {
  chase: { dist: 6.3, height: 2.05, ahead: 3.2, lookH: 0.95, fov: 68 },
  far: { dist: 10.5, height: 3.7, ahead: 4.5, lookH: 1.25, fov: 64 },
  hood: { fov: 76 },
};

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _vd = new THREE.Vector3(), _t = new THREE.Vector3();
const _look = new THREE.Vector3(), _desired = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.dir = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.pos = new THREE.Vector3();
    this.shake = 0;
    this.fov = 68;
    this.orbitAngle = 0;
    this.tv = null;
    this.time = 0;
    this.distBoost = 0;
  }

  setMode(m) { this.mode = m; }

  cycle() {
    this.mode = CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length];
    return this.mode;
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  snap(t) {
    this.orbiting = false;
    _fwd.set(0, 0, -1).applyQuaternion(t.quat);
    this.dir.copy(_fwd);
    this.up.set(0, 1, 0).applyQuaternion(t.quat);
    this.update(0, t, true);
  }

  // t: { pos, quat, vel, speed, grounded, airTime, boost }
  update(dt, t, instant = false) {
    this.time += dt;
    this.orbiting = false;
    const cam = this.camera;
    const M = MODES[this.mode];
    _fwd.set(0, 0, -1).applyQuaternion(t.quat);
    _up.set(0, 1, 0).applyQuaternion(t.quat);
    const k = (rate) => (instant ? 1 : 1 - Math.exp(-rate * dt));

    if (this.mode === 'hood') {
      cam.position.copy(t.pos).addScaledVector(_up, 0.62).addScaledVector(_fwd, -0.15);
      _look.copy(t.pos).addScaledVector(_fwd, 30).addScaledVector(_up, 0.4);
      this.up.lerp(_up, k(10)).normalize();
      this.dir.copy(_fwd);
    } else {
      // heading: blend of car nose and travel direction
      _t.copy(_fwd);
      if (t.speed > 6) {
        _vd.copy(t.vel).normalize();
        _vd.addScaledVector(_up, -_vd.dot(_up)).normalize();
        _t.lerp(_vd, 0.45).normalize();
      }
      const grounded = t.grounded > 0;
      this.dir.lerp(_t, k(grounded ? 6.5 : 2.2)).normalize();
      const upTarget = grounded || t.airTime < 0.4 ? _up : WORLD_UP;
      this.up.lerp(upTarget, k(grounded ? 3.2 : 1.3)).normalize();
      const speedPull = clamp((t.speed - 20) / 90, 0, 1);
      this.distBoost += ((t.boost ? 1.2 : 0) - this.distBoost) * k(3);
      const dist = M.dist + speedPull * 1.1 + this.distBoost;
      _desired.copy(t.pos).addScaledVector(this.dir, -dist).addScaledVector(this.up, M.height + speedPull * 0.2);
      this.pos.lerp(_desired, k(28));
      cam.position.copy(this.pos);
      _look.copy(t.pos).addScaledVector(this.dir, M.ahead).addScaledVector(this.up, M.lookH);
    }
    if (cam.position.y < 0.45) cam.position.y = 0.45;
    // shake
    if (this.shake > 0.001) {
      const s = this.shake * 0.22;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-6 * dt);
    }
    // speed rumble
    const rumble = clamp((t.speed - 60) / 60, 0, 1) * 0.02 * (t.grounded ? 1 : 0.2);
    cam.position.y += Math.sin(this.time * 47) * rumble;
    cam.up.copy(this.up);
    cam.lookAt(_look);
    // FOV opens up with speed
    const targetFov = M.fov + clamp((t.speed - 15) / 95, 0, 1) * 20 + (t.boost ? 6 : 0);
    this.fov += (targetFov - this.fov) * k(4);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  // slow orbit around a (possibly moving) point: finish screen
  orbit(dt, center, radius = 10, height = 3) {
    const cam = this.camera;
    if (!this.orbiting) {
      this.orbiting = true;
      this.orbitAngle = Math.atan2(cam.position.z - center.z, cam.position.x - center.x);
      this.orbitOffset = new THREE.Vector3().subVectors(cam.position, center);
    }
    this.orbitAngle += dt * 0.3;
    const goal = _desired.set(Math.cos(this.orbitAngle) * radius, height, Math.sin(this.orbitAngle) * radius);
    this.orbitOffset.lerp(goal, 1 - Math.exp(-2.5 * dt));
    cam.position.copy(center).add(this.orbitOffset);
    if (cam.position.y < 0.6) cam.position.y = 0.6;
    this.up.lerp(WORLD_UP, 1 - Math.exp(-3 * dt)).normalize();
    cam.up.copy(this.up);
    // aim below the car so it sits in the upper part of the frame, above the finish panel
    _look.copy(center).y -= 2.0;
    cam.lookAt(_look);
    this.fov += (58 - this.fov) * (1 - Math.exp(-2 * dt));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  // TV coverage: fixed trackside cameras picked ahead of the car along the route
  tvUpdate(dt, t, route, routeIdx) {
    const cam = this.camera;
    this.time += dt;
    const need = !this.tv || this.tv.car !== t || cam.position.distanceTo(t.pos) > 140 ||
      (this.tv.passed && cam.position.distanceTo(t.pos) > 60) || this.time > this.tv.until;
    if (need && route) {
      const ahead = route.at(route.pts[routeIdx].s + 70 + Math.random() * 60);
      const side = Math.random() < 0.5 ? -1 : 1;
      const r = new THREE.Vector3().crossVectors(new THREE.Vector3(...ahead.f), WORLD_UP).normalize();
      const p = new THREE.Vector3(...ahead.p).addScaledVector(r, side * (18 + Math.random() * 14));
      p.y = Math.max(ahead.p[1], 0) + 3 + Math.random() * 9;
      this.tv = { pos: p, car: t, passed: false, until: this.time + 9, zoom: 30 + Math.random() * 20 };
      cam.position.copy(p);
    }
    if (!this.tv) return;
    const toCar = _vd.subVectors(t.pos, this.tv.pos);
    if (toCar.dot(_fwd.set(0, 0, -1).applyQuaternion(t.quat)) > 0) this.tv.passed = true;
    cam.position.copy(this.tv.pos);
    cam.up.set(0, 1, 0);
    _look.copy(t.pos);
    _look.y += 0.5;
    cam.lookAt(_look);
    const dist = toCar.length();
    const fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(9 / Math.max(dist, 1))), 18, 70);
    this.fov += (fov - this.fov) * (1 - Math.exp(-4 * dt));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
