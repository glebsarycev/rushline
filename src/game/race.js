// One attempt on a track: countdown, timing, checkpoints, respawns, finish.

import * as THREE from 'three';
import { Vehicle } from '../physics/vehicle.js';
import { GhostRecorder } from './ghost.js';

export const COUNTDOWN = 2.1; // seconds (3 - 2 - 1 - GO)

const _gf = new THREE.Vector3(), _gu = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion();

// Fraction along a->b where the segment crosses the gate plane, or -1.
const UP = [0, 1, 0];

export function crossGate(g, a, b) {
  const c = g.center, f = g.fwd;
  const da = (a.x - c[0]) * f[0] + (a.y - c[1]) * f[1] + (a.z - c[2]) * f[2];
  const db = (b.x - c[0]) * f[0] + (b.y - c[1]) * f[1] + (b.z - c[2]) * f[2];
  if (da === db || (da > 0) === (db > 0)) return -1;
  const t = da / (da - db);
  const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t, pz = a.z + (b.z - a.z) * t;
  // measured in the gate's own frame (tilted gates on banked pieces)
  const ex = px - c[0], ey = py - c[1], ez = pz - c[2];
  const lat = ex * g.right[0] + ey * g.right[1] + ez * g.right[2];
  const h = ex * g.up[0] + ey * g.up[1] + ez * g.up[2];
  if (Math.abs(lat) > g.halfWidth || h < -2.5 || h > g.height) return -1;
  return t;
}

export class Race {
  constructor(track, opts = {}) {
    this.track = track;
    this.car = new Vehicle(track.world, opts.vehicle);
    this.listeners = {};
    this.prevPos = new THREE.Vector3();
    this.recorder = new GhostRecorder();
    this.reset();
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
    return this;
  }

  emit(evt, data) {
    for (const fn of this.listeners[evt] || []) fn(data);
  }

  spawnPose() {
    const sp = this.track.spawn;
    const pos = new THREE.Vector3(sp.pos[0], sp.pos[1] + 0.8, sp.pos[2]);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-sp.heading * Math.PI) / 2);
    return { pos, quat };
  }

  reset({ countdown = true } = {}) {
    const { pos, quat } = this.spawnPose();
    this.car.reset(pos, quat);
    this.prevPos.copy(pos);
    this.time = 0;
    this.countdown = countdown ? COUNTDOWN : 0.0001;
    this.lastCount = 4;
    this.state = 'countdown';
    this.cpTaken = new Set();
    this.splits = [];
    this.lastCp = null;
    this.respawns = 0;
    this.finishTime = null;
    this.afterFinish = 0;
    this.activeBoost = null;
    this.stuckTime = 0;
    this.emit('reset');
  }

  get countNumber() {
    return Math.max(0, Math.ceil(this.countdown / (COUNTDOWN / 3)));
  }

  step(dt, input) {
    const car = this.car;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = this.countNumber;
      if (n !== this.lastCount && n > 0) { this.lastCount = n; this.emit('count', n); }
      car.step(dt, { throttle: 0, brake: 0, hold: true, steer: input.steer || 0 });
      if (this.countdown <= 0) {
        this.state = 'running';
        this.time = 0;
        this.prevPos.copy(car.pos);
        this.recorder.start(car);
        this.emit('go');
      }
      return;
    }
    const t0 = this.time;
    this.prevPos.copy(car.pos);
    if (this.state === 'running') {
      this._guide(dt);
      car.step(dt, input);
      this.time += dt;
      this._gates(t0, dt);
      this._boosts();
      if (this.state === 'running') {
        this.recorder.sample(this.time, car);
        this._outOfBounds(dt);
      }
    } else {
      this.afterFinish += dt;
      car.step(dt, { throttle: 0, brake: this.afterFinish > 0.6 ? 0.6 : 0, steer: 0 });
    }
  }

  _gates(t0, dt) {
    const a = this.prevPos, b = this.car.pos;
    for (const g of this.track.checkpoints) {
      if (this.cpTaken.has(g.index)) continue;
      const f = crossGate(g, a, b);
      if (f < 0) continue;
      const t = t0 + f * dt;
      this.cpTaken.add(g.index);
      this.splits.push(t);
      this.lastCp = { state: this.car.getState(), gate: g, time: t };
      this.emit('checkpoint', { n: this.splits.length, total: this.track.checkpoints.length, time: t, gate: g });
    }
    for (const g of this.track.finishes) {
      const f = crossGate(g, a, b);
      if (f < 0) continue;
      if (this.cpTaken.size < this.track.checkpoints.length) {
        this.emit('missing', { taken: this.cpTaken.size, total: this.track.checkpoints.length });
        continue;
      }
      const t = t0 + f * dt;
      this.finishTime = t;
      this.state = 'finished';
      this.recorder.finish(t, this.car);
      this.emit('finish', { time: t, splits: this.splits.slice(), respawns: this.respawns });
      return;
    }
  }

  // Loop assist: nudges heading and lateral drift back to the loop centreline.
  _guide(dt) {
    const car = this.car, p = car.pos;
    for (const g of this.track.guides) {
      if (p.x < g.min[0] || p.y < g.min[1] || p.z < g.min[2] || p.x > g.max[0] || p.y > g.max[1] || p.z > g.max[2]) continue;
      const F = g.frames;
      let bi = -1, bd = Infinity;
      for (let k = 0; k < F.length; k++) {
        const q = F[k].p;
        const d = (q[0] - p.x) ** 2 + (q[1] - p.y) ** 2 + (q[2] - p.z) ** 2;
        if (d < bd) { bd = d; bi = k; }
      }
      const f = F[bi];
      const h = (p.x - f.p[0]) * f.u[0] + (p.y - f.p[1]) * f.u[1] + (p.z - f.p[2]) * f.u[2];
      if (bd > 100 || h > (g.reach || 4) || h < -1) continue;
      // keep the car pressed onto curved stunt surfaces
      if (g.stick && car.speed > 12) {
        const k = g.stick * dt;
        car.vel.x -= f.u[0] * k; car.vel.y -= f.u[1] * k; car.vel.z -= f.u[2] * k;
      }
      // tilt the car so its wheels face the surface
      if (g.align) {
        _gf.set(0, 1, 0).applyQuaternion(car.quat);
        _gu.set(f.u[0], f.u[1], f.u[2]);
        _gq.setFromUnitVectors(_gf, _gu);
        _gq2.identity().slerp(_gq, Math.min(1, g.align * dt));
        car.quat.premultiply(_gq2).normalize();
      }
      if (car.grounded < 2) continue;
      const off = (p.x - f.p[0]) * f.r[0] + (p.y - f.p[1]) * f.r[1] + (p.z - f.p[2]) * f.r[2];
      const vLat = car.vel.x * f.r[0] + car.vel.y * f.r[1] + car.vel.z * f.r[2];
      const a = Math.max(-10, Math.min(10, -g.lateral * off - g.damp * vLat));
      car.vel.x += f.r[0] * a * dt; car.vel.y += f.r[1] * a * dt; car.vel.z += f.r[2] * a * dt;
      // yaw the car towards the road direction (the block may be driven in either direction)
      _gf.set(0, 0, -1).applyQuaternion(car.quat);
      const dir = _gf.x * f.f[0] + _gf.y * f.f[1] + _gf.z * f.f[2] >= 0 ? 1 : -1;
      const side = (_gf.x * f.r[0] + _gf.y * f.r[1] + _gf.z * f.r[2]) * dir;
      const fw = (_gf.x * f.f[0] + _gf.y * f.f[1] + _gf.z * f.f[2]) * dir;
      const yawErr = Math.atan2(side, Math.max(0.1, fw));
      _gu.set(f.u[0], f.u[1], f.u[2]);
      _gq.setFromAxisAngle(_gu, yawErr * Math.min(1, g.yaw * dt));
      car.quat.premultiply(_gq).normalize();
      const wu = car.angVel.dot(_gu);
      car.angVel.addScaledVector(_gu, -wu * Math.min(1, 8 * dt));
      return;
    }
  }

  _boosts() {
    const p = this.car.pos;
    let on = null;
    for (const bz of this.track.boosts) {
      const c = bz.center;
      const dx = p.x - c[0], dy = p.y - c[1], dz = p.z - c[2];
      const up = bz.up || UP;
      const along = dx * bz.fwd[0] + dy * bz.fwd[1] + dz * bz.fwd[2];
      const lat = dx * bz.right[0] + dy * bz.right[1] + dz * bz.right[2];
      const h = dx * up[0] + dy * up[1] + dz * up[2];
      if (Math.abs(along) < bz.halfLen && Math.abs(lat) < bz.halfWidth + 0.6 && h > -1 && h < 3) { on = bz; break; }
    }
    if (on) {
      this.car.applyBoost(on.strength);
      if (this.activeBoost !== on) this.emit('boost', on.strength);
    }
    this.activeBoost = on;
  }

  _outOfBounds(dt) {
    const car = this.car, S = this.track.stadium;
    if (car.pos.y < -30 || car.pos.x < S.minX - 50 || car.pos.x > S.maxX + 50 || car.pos.z < S.minZ - 50 || car.pos.z > S.maxZ + 50) {
      this.emit('autoRespawn');
      return;
    }
    // stuck (e.g. upside down, not moving)
    if (car.speed < 1.5 && car.grounded < 2) this.stuckTime += dt; else this.stuckTime = 0;
  }

  // Respawn at the last checkpoint. Returns false when a full restart is needed.
  respawn() {
    if (this.state !== 'running') return false;
    if (!this.lastCp) return false;
    this.car.setState(this.lastCp.state);
    this.prevPos.copy(this.car.pos);
    this.respawns++;
    this.stuckTime = 0;
    this.emit('respawn', { gate: this.lastCp.gate });
    return true;
  }

  ghost() {
    return this.recorder.toGhost();
  }
}
