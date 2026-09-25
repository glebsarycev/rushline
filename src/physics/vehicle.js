// Arcade rigid-body car: raycast suspension, impulse based tyre grip with a
// friction circle, bump-stop and hull contacts solved with sequential impulses.

import * as THREE from 'three';
import { SURFACES, GRAVITY } from '../config.js';
import { clamp, approach } from '../util/math.js';

export const CAR = {
  mass: 1000,
  inertia: [2000, 2150, 950], // local x (pitch), y (yaw), z (roll)
  wheelRadius: 0.42,
  suspRest: 0.36,
  suspTravel: 0.27,
  springK: 38000,
  damperC: 3700,
  antiRoll: 16000,
  rayUp: 0.5,
  wheelbase: 2.7,
  wheels: [
    { x: -0.93, y: -0.05, z: -1.38, front: true },
    { x: 0.93, y: -0.05, z: -1.38, front: true },
    { x: -0.97, y: -0.05, z: 1.32, front: false },
    { x: 0.97, y: -0.05, z: 1.32, front: false },
  ],
  // hull spheres [x, y, z, radius] in car space (forward = -Z)
  hull: [
    [0, 0.02, -2.05, 0.42],
    [-0.62, 0.05, -1.3, 0.46], [0.62, 0.05, -1.3, 0.46],
    [-0.72, 0.08, 0.0, 0.5], [0.72, 0.08, 0.0, 0.5],
    [-0.7, 0.1, 1.3, 0.48], [0.7, 0.1, 1.3, 0.48],
    [0, 0.12, 2.0, 0.4],
    [0, 0.06, -0.05, 0.38], // cockpit canopy (top ~0.44 m above the centre of mass)
    [0, 0.42, 2.2, 0.26], // rear wing
  ],
  mu: 2.85,
  accel0: 19.5,
  vmax: 118,
  accelExp: 0.85,
  brakeDecel: 24,
  reverseAccel: 9,
  reverseMax: 17,
  coastDecel: 0.8,
  drag: 0.11,
  downforce: 2.7,
  driveFront: 0.35,
  brakeFront: 0.6,
  steerMax: 0.6,
  steerRate: 9,
  steerReturn: 13,
  rollFactor: 0.8,
  hullInvIScale: 0.45,
  hullRestitution: 0.12,
  hullFriction: 0.28,
  driftRearGrip: 0.6,
  driftAngle: 0.22,
  driftSteer: 0.12,
  driftPull: 0.4,
  driftKp: 240000,
  driftKd: 36000,
  driftMaxTorque: 60000,
  stabilityAngle: 0.14,
  stabilityKp: 110000,
  stabilityKd: 18000,
  airDamping: 0.35,
  boost: [null, { accel: 13, time: 1.2 }, { accel: 20, time: 2.4 }],
};

const GEARS = [0, 17, 31, 47, 65, 86, 1e9];
const ORDER_A = [0, 1, 2, 3];
const ORDER_B = [1, 0, 3, 2];

// scratch objects (no allocations in the hot loop)
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3(), _tmp3 = new THREE.Vector3();
const _r = new THREE.Vector3(), _rApp = new THREE.Vector3(), _vp = new THREE.Vector3();
const _force = new THREE.Vector3(), _torque = new THREE.Vector3();
const _mount = new THREE.Vector3(), _wf = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _J = new THREE.Vector3(), _n = new THREE.Vector3();
const _hit = { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, surf: 0, tri: -1 };

export class Vehicle {
  constructor(world, P = CAR) {
    this.world = world;
    this.P = P;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.invMass = 1 / P.mass;
    this.invI = new THREE.Vector3(1 / P.inertia[0], 1 / P.inertia[1], 1 / P.inertia[2]);
    this.wheels = P.wheels.map((w) => ({
      mount: new THREE.Vector3(w.x, w.y, w.z), front: w.front, left: w.x < 0,
      contact: false, comp: 0, len: P.suspRest, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
      surf: 0, load: 0, bump: 0, accL: 0, accF: 0, slipLat: 0, slipLong: 0, sliding: false, spin: 0, skid: 0,
    }));
    this.hull = P.hull.map(([x, y, z, r]) => ({ local: new THREE.Vector3(x, y, z), r }));
    this.contacts = [];
    for (let i = 0; i < 64; i++) {
      this.contacts.push({ p: new THREE.Vector3(), n: new THREE.Vector3(), r: new THREE.Vector3(), depth: 0, kind: 0, wheel: -1, e: 0, mu: 0, massN: 0, target: 0, jn: 0, iscale: 1, surf: 0 });
    }
    this.nContacts = 0;
    this.reset(new THREE.Vector3(), new THREE.Quaternion());
  }

  reset(pos, quat, vel = null, angVel = null) {
    this.pos.copy(pos);
    this.quat.copy(quat).normalize();
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    if (vel) this.vel.copy(vel);
    if (angVel) this.angVel.copy(angVel);
    this.steer = 0;
    this.steerAngle = 0;
    this.throttle = 0;
    this.brake = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.slipAngle = 0;
    this.prevBeta = 0;
    this.driftError = 0;
    this.flip = 0;
    this.boostTime = 0;
    this.boostAccel = 0;
    this.boostLevel = 0;
    this.grounded = 0;
    this.groundedNow = 0;
    this.airTime = 0;
    this.landing = 0;
    this.impact = 0;
    this.scrape = 0;
    this.scrapePoint = new THREE.Vector3();
    this.speed = this.vel.length();
    this.fwdSpeed = 0;
    this.rpm = 1000;
    this.gear = 1;
    this.surface = 0;
    for (const w of this.wheels) {
      w.contact = false; w.comp = 0; w.len = this.P.suspRest; w.load = 0; w.bump = 0; w.skid = 0; w.sliding = false;
    }
  }

  getState() {
    return {
      pos: this.pos.toArray(), quat: this.quat.toArray(), vel: this.vel.toArray(), angVel: this.angVel.toArray(),
      steer: this.steer, boostTime: this.boostTime, boostAccel: this.boostAccel, boostLevel: this.boostLevel,
    };
  }

  setState(s) {
    this.reset(new THREE.Vector3().fromArray(s.pos), new THREE.Quaternion().fromArray(s.quat),
      new THREE.Vector3().fromArray(s.vel), new THREE.Vector3().fromArray(s.angVel));
    this.steer = s.steer || 0;
    this.boostTime = s.boostTime || 0;
    this.boostAccel = s.boostAccel || 0;
    this.boostLevel = s.boostLevel || 0;
  }

  applyBoost(level) {
    const b = this.P.boost[level];
    if (!b) return;
    if (level >= this.boostLevel || this.boostTime <= 0) {
      this.boostLevel = level;
      this.boostAccel = b.accel;
    }
    this.boostTime = Math.max(this.boostTime, b.time);
  }

  // maximum steering angle, reduced with speed so full lock stays near the grip limit
  steerLimit(v) {
    const P = this.P;
    v = Math.abs(v);
    const aGrip = P.mu * GRAVITY * (1 + (P.downforce * v * v) / (P.mass * GRAVITY)) * 0.92;
    const lim = Math.atan((P.wheelbase * aGrip) / Math.max(v * v, 1)) * 1.22;
    return Math.min(P.steerMax, lim);
  }

  _basis() {
    const q = this.quat;
    _right.set(1, 0, 0).applyQuaternion(q);
    _up.set(0, 1, 0).applyQuaternion(q);
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _qInv.copy(q).invert();
  }

  _applyInvI(out, v, scale = 1) {
    out.copy(v).applyQuaternion(_qInv);
    out.x *= this.invI.x * scale; out.y *= this.invI.y * scale; out.z *= this.invI.z * scale;
    return out.applyQuaternion(this.quat);
  }

  _effMass(r, n, scale = 1) {
    _tmp2.crossVectors(r, n);
    this._applyInvI(_tmp3, _tmp2, scale);
    _tmp2.crossVectors(_tmp3, r);
    return 1 / (this.invMass + n.dot(_tmp2));
  }

  _impulse(J, r, scale = 1) {
    this.vel.addScaledVector(J, this.invMass);
    _tmp2.crossVectors(r, J);
    this._applyInvI(_tmp3, _tmp2, scale);
    this.angVel.add(_tmp3);
  }

  _pointVel(out, r) {
    return out.crossVectors(this.angVel, r).add(this.vel);
  }

  step(dt, input) {
    this._controls(dt, input);
    const n = Math.min(5, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.2)));
    const h = dt / n;
    this.impact = 0;
    this.scrape = 0;
    for (let i = 0; i < n; i++) this._substep(h);
    this._telemetry(dt);
  }

  _controls(dt, input) {
    const P = this.P;
    const target = clamp(input.steer || 0, -1, 1);
    const growing = Math.abs(target) > Math.abs(this.steer) && (this.steer === 0 || Math.sign(target) === Math.sign(this.steer));
    this.steer = approach(this.steer, target, (growing ? P.steerRate : P.steerReturn) * dt);
    this.throttle = clamp(input.throttle || 0, 0, 1);
    this.brake = clamp(input.brake || 0, 0, 1);
    this.hold = !!input.hold;

    this._basis();
    const vf = this.vel.dot(_fwd), vl = this.vel.dot(_right);
    const speed = this.vel.length();
    this.slipAngle = speed > 3 ? Math.atan2(-vl, Math.max(Math.abs(vf), 0.5)) : 0;
    if (!this.drifting) {
      if (!input.noDrift && this.grounded >= 3 && this.brake > 0.5 && Math.abs(target) > 0.5 && vf > 20) {
        this.drifting = true;
        this.driftDir = Math.sign(target);
        this.driftTime = 0;
      }
    } else {
      this.driftTime += dt;
      const b = Math.abs(this.slipAngle);
      if (speed < 11 || this.airTime > 0.6 || (this.driftTime > 0.4 && b < 0.07) ||
          (Math.abs(target) < 0.1 && this.driftTime > 0.3) || (target * this.driftDir < -0.5 && b < 0.2)) {
        this.drifting = false;
      }
    }
    let lim = this.steerLimit(vf);
    if (this.drifting) lim = Math.min(P.steerMax, lim * 1.5 + 0.02);
    this.steerAngle = this.steer * lim;
  }

  _substep(h) {
    const P = this.P, pos = this.pos, vel = this.vel;
    this._basis();

    // ---- wheel probes
    let grounded = 0;
    const maxT = P.rayUp + P.suspRest + P.wheelRadius;
    for (const wh of this.wheels) {
      _mount.copy(wh.mount).applyQuaternion(this.quat).add(pos);
      const ox = _mount.x + _up.x * P.rayUp, oy = _mount.y + _up.y * P.rayUp, oz = _mount.z + _up.z * P.rayUp;
      wh.bump = 0;
      wh.load = 0;
      if (this.world.raycast(ox, oy, oz, -_up.x, -_up.y, -_up.z, maxT, _hit)) {
        const len = _hit.t - P.rayUp - P.wheelRadius;
        wh.comp = P.suspRest - len;
        wh.len = Math.max(len, P.suspRest - P.suspTravel);
        wh.contact = true;
        wh.point.set(_hit.px, _hit.py, _hit.pz);
        wh.normal.set(_hit.nx, _hit.ny, _hit.nz);
        wh.surf = _hit.surf;
        grounded++;
      } else {
        wh.contact = false;
        wh.comp = 0;
        wh.len = P.suspRest;
      }
    }
    this.groundedNow = grounded;

    // ---- forces
    _force.set(0, -GRAVITY * P.mass, 0);
    _torque.set(0, 0, 0);
    for (const wh of this.wheels) {
      if (!wh.contact) continue;
      _r.subVectors(wh.point, pos);
      this._pointVel(_vp, _r);
      const compVel = -_vp.dot(_up);
      const c = Math.min(wh.comp, P.suspTravel);
      wh.load = Math.max(0, P.springK * c + P.damperC * compVel);
    }
    for (let a = 0; a < 4; a += 2) {
      const L = this.wheels[a], R = this.wheels[a + 1];
      if (L.contact && R.contact) {
        const d = (Math.min(L.comp, P.suspTravel) - Math.min(R.comp, P.suspTravel)) * P.antiRoll;
        L.load = Math.max(0, L.load + d);
        R.load = Math.max(0, R.load - d);
      }
    }
    for (const wh of this.wheels) {
      if (!wh.contact || wh.load <= 0) continue;
      _r.subVectors(wh.point, pos);
      _J.copy(_up).multiplyScalar(wh.load);
      _force.add(_J);
      _tmp.crossVectors(_r, _J);
      _torque.add(_tmp);
    }
    const vf = vel.dot(_fwd);
    if (grounded >= 2) _force.addScaledVector(_up, -P.downforce * vf * vf);
    _force.addScaledVector(vel, -P.drag * vel.length());
    if (this.boostTime > 0 && grounded >= 2) _force.addScaledVector(_fwd, P.mass * this.boostAccel);

    // drift controller: a PD loop holds the slip angle near a target set by the stick
    const beta = Math.atan2(-vel.dot(_right), Math.max(Math.abs(vf), 0.5));
    const dBeta = (beta - this.prevBeta) / h;
    this.prevBeta = beta;
    if (this.drifting && grounded >= 2) {
      const t = this.driftDir * (P.driftAngle + P.driftSteer * this.steer * this.driftDir);
      const tau = -P.driftKp * (t - beta) + P.driftKd * clamp(dBeta, -8, 8);
      _torque.addScaledVector(_up, clamp(tau, -P.driftMaxTorque, P.driftMaxTorque));
      this.driftError = beta - t;
      // arcade drift: extra sideways pull so a drift turns tighter than grip driving
      const sp = vel.length();
      if (sp > 5 && grounded >= 3) {
        _tmp.copy(vel).divideScalar(sp);
        _tmp2.crossVectors(_tmp, _up).normalize();
        const aGrip = P.mu * GRAVITY * (1 + (P.downforce * sp * sp) / (P.mass * GRAVITY));
        _force.addScaledVector(_tmp2, this.driftDir * P.mass * aGrip * P.driftPull * (0.55 + 0.45 * Math.max(0, this.steer * this.driftDir)));
      }
    } else if (grounded >= 3 && Math.abs(beta) > P.stabilityAngle && this.vel.lengthSq() > 25) {
      // stability control: resists unintended spins outside of drifts
      const t = Math.sign(beta) * P.stabilityAngle;
      const tau = -P.stabilityKp * (t - beta) + P.stabilityKd * clamp(dBeta, -8, 8);
      _torque.addScaledVector(_up, clamp(tau, -P.driftMaxTorque, P.driftMaxTorque));
    }

    vel.addScaledVector(_force, h * this.invMass);
    this._applyInvI(_tmp, _torque);
    this.angVel.addScaledVector(_tmp, h);

    // ---- contacts, tyres
    this._gatherContacts();
    this._solveContacts(h, 6);
    this._tyres(h);

    if (grounded === 0) this.angVel.multiplyScalar(Math.max(0, 1 - P.airDamping * h));
    const wl = this.angVel.length();
    if (wl > 22) this.angVel.multiplyScalar(22 / wl);

    // ---- integrate
    pos.addScaledVector(vel, h);
    const q = this.quat, w = this.angVel, hh = 0.5 * h;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    q.set(
      qx + hh * (w.x * qw + w.y * qz - w.z * qy),
      qy + hh * (w.y * qw + w.z * qx - w.x * qz),
      qz + hh * (w.z * qw + w.x * qy - w.y * qx),
      qw + hh * (-w.x * qx - w.y * qy - w.z * qz),
    ).normalize();
  }

  _contact(i) {
    return this.contacts[i];
  }

  _gatherContacts() {
    const P = this.P;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i];
      if (!wh.contact) continue;
      const pen = wh.comp - P.suspTravel;
      if (pen <= 0) continue;
      const c = this.contacts[n++];
      c.p.copy(wh.point);
      c.n.copy(wh.normal);
      c.depth = pen * Math.max(0.2, _up.dot(wh.normal));
      c.kind = 1; c.wheel = i; c.e = 0; c.mu = 0; c.iscale = 1; c.surf = wh.surf;
    }
    for (const s of this.hull) {
      _tmp.copy(s.local).applyQuaternion(this.quat).add(this.pos);
      const k = this.world.sphere(_tmp.x, _tmp.y, _tmp.z, s.r);
      const W = this.world.contacts;
      for (let j = 0; j < k && n < this.contacts.length; j++) {
        const wc = W[j];
        const c = this.contacts[n++];
        c.p.set(wc.px, wc.py, wc.pz);
        c.n.set(wc.nx, wc.ny, wc.nz);
        c.depth = wc.depth;
        c.kind = 2; c.wheel = -1; c.e = P.hullRestitution; c.mu = P.hullFriction; c.iscale = P.hullInvIScale; c.surf = wc.surf;
      }
    }
    this.nContacts = n;
  }

  _solveContacts(h, iters) {
    const n = this.nContacts;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const c = this.contacts[i];
      c.r.subVectors(c.p, this.pos);
      c.massN = this._effMass(c.r, c.n, c.iscale);
      const vn0 = this._pointVel(_vp, c.r).dot(c.n);
      const bias = Math.min(5, (Math.max(0, c.depth - 0.004) * 0.3) / h);
      c.target = Math.max(bias, vn0 < -1.5 ? -c.e * vn0 : 0);
      c.jn = 0;
      c.vn0 = vn0;
    }
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const c = this.contacts[i];
        const vn = this._pointVel(_vp, c.r).dot(c.n);
        let dj = (c.target - vn) * c.massN;
        const jn = Math.max(0, c.jn + dj);
        dj = jn - c.jn;
        c.jn = jn;
        if (dj !== 0) {
          _J.copy(c.n).multiplyScalar(dj);
          this._impulse(_J, c.r, c.iscale);
        }
      }
    }
    // positional projection so deep penetrations (loops, hard landings) cannot build up
    let cx = 0, cy = 0, cz = 0, cn = 0;
    for (let i = 0; i < n; i++) {
      const c = this.contacts[i];
      const d = c.depth - 0.02;
      if (d <= 0 || c.jn <= 0) continue;
      cx += c.n.x * d; cy += c.n.y * d; cz += c.n.z * d; cn++;
    }
    if (cn) this.pos.set(this.pos.x + (cx / cn) * 0.6, this.pos.y + (cy / cn) * 0.6, this.pos.z + (cz / cn) * 0.6);
    // friction for hull contacts, bump impulses feed tyre load
    for (let i = 0; i < n; i++) {
      const c = this.contacts[i];
      if (c.kind === 1) { this.wheels[c.wheel].bump += c.jn; continue; }
      if (c.jn <= 0) continue;
      const hitSpeed = -c.vn0;
      if (hitSpeed > 0) this.impact = Math.max(this.impact, hitSpeed);
      this._pointVel(_vp, c.r);
      _tmp.copy(c.n).multiplyScalar(_vp.dot(c.n));
      _vp.sub(_tmp);
      const vt = _vp.length();
      if (vt > 1e-3) {
        _n.copy(_vp).divideScalar(vt);
        const mt = this._effMass(c.r, _n, c.iscale);
        const jt = Math.min(vt * mt, c.mu * c.jn);
        _J.copy(_n).multiplyScalar(-jt);
        this._impulse(_J, c.r, c.iscale);
        if (vt > 4 && c.surf !== 4 && c.n.y < 0.7) {
          if (vt > this.scrape) { this.scrape = vt; this.scrapePoint.copy(c.p); }
        }
      }
    }
  }

  _tyres(h) {
    const P = this.P, vel = this.vel;
    const vf = vel.dot(_fwd);
    const thr = this.throttle, brk = this.brake;
    let drive = 0, brakeF = 0;
    if (thr > 0) {
      const x = Math.max(0, vf) / P.vmax;
      if (x < 1) drive += P.mass * P.accel0 * Math.pow(1 - x, P.accelExp) * thr;
    }
    if (this.hold) {
      drive = 0;
      brakeF = P.mass * P.brakeDecel;
    } else if (brk > 0) {
      if (vf > 1) brakeF = P.mass * P.brakeDecel * brk * (this.drifting ? 0.22 : 1);
      else if (thr < 0.1 && vf > -P.reverseMax) drive -= P.mass * P.reverseAccel * brk;
    }
    const coast = thr === 0 && brk === 0 ? P.coastDecel * P.mass : 0;
    const cs = Math.cos(this.steerAngle), sn = Math.sin(this.steerAngle);
    // alternate the solve order every substep so Gauss-Seidel bias cancels out
    this.flip ^= 1;
    const order = this.flip ? ORDER_B : ORDER_A;
    const driftRear = this.drifting ? clamp(P.driftRearGrip + 1.6 * this.driftError * this.driftDir, 0.35, 1.0) : 1;

    for (let it = 0; it < 2; it++) {
      for (let oi = 0; oi < 4; oi++) {
        const wh = this.wheels[order[oi]];
        if (!wh.contact) { if (it === 0) { wh.accL = 0; wh.accF = 0; wh.sliding = false; wh.slipLat = 0; } continue; }
        const surf = SURFACES[wh.surf] || SURFACES[0];
        const n = wh.normal;
        if (wh.front) _wf.copy(_fwd).multiplyScalar(cs).addScaledVector(_right, sn);
        else _wf.copy(_fwd);
        _f.copy(n).multiplyScalar(-_wf.dot(n)).add(_wf).normalize();
        _s.crossVectors(_f, n);
        _r.subVectors(wh.point, this.pos);
        _rApp.copy(_up).multiplyScalar(-_r.dot(_up) * P.rollFactor).add(_r);
        this._pointVel(_vp, _r);
        const vl = _vp.dot(_s), vlong = _vp.dot(_f);
        const load = wh.load + wh.bump / h;
        let mu = P.mu * surf.grip;
        if (!wh.front) mu *= driftRear * surf.rearDrift;
        const maxJ = mu * load * h;
        const mL = this._effMass(_rApp, _s);
        let newL, newF;
        if (it === 0) {
          const mF = this._effMass(_rApp, _f);
          let jF = drive * (wh.front ? P.driveFront : 1 - P.driveFront) * 0.5 * h;
          const bj = (brakeF * (wh.front ? P.brakeFront : 1 - P.brakeFront) * 0.5 + (coast + surf.roll * P.mass) * 0.25) * h;
          if (bj > 0) jF -= Math.sign(vlong) * Math.min(bj, Math.abs(vlong) * mF);
          newL = -vl * mL;
          newF = jF;
          wh.accL = 0; wh.accF = 0;
          wh.slipLat = Math.abs(vl);
          wh.slipLong = vlong;
        } else {
          newL = wh.accL - vl * mL;
          newF = wh.accF;
        }
        const tot = Math.hypot(newL, newF);
        let sliding = false;
        if (tot > maxJ) {
          const k = maxJ / tot;
          newL *= k; newF *= k;
          sliding = true;
        }
        if (it === 0) wh.sliding = sliding; else wh.sliding = wh.sliding || sliding;
        const dL = newL - wh.accL, dF = newF - wh.accF;
        wh.accL = newL; wh.accF = newF;
        _J.copy(_s).multiplyScalar(dL).addScaledVector(_f, dF);
        this._impulse(_J, _rApp);
      }
    }
  }

  _telemetry(dt) {
    const P = this.P;
    this._basis();
    this.speed = this.vel.length();
    this.fwdSpeed = this.vel.dot(_fwd);
    this.grounded = this.groundedNow;
    this.landing = 0;
    if (this.grounded === 0) this.airTime += dt;
    else {
      if (this.airTime > 0.25) this.landing = Math.min(1, this.airTime / 1.5);
      this.airTime = 0;
    }
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      if (this.boostTime <= 0) { this.boostTime = 0; this.boostAccel = 0; this.boostLevel = 0; }
    }
    let surfCount = 0;
    for (const wh of this.wheels) {
      wh.spin += ((wh.contact ? wh.slipLong : this.fwdSpeed) / P.wheelRadius) * dt;
      if (!wh.front && wh.contact && this.throttle > 0.5 && this.fwdSpeed < 8) wh.spin += 25 * dt * this.throttle;
      let skid = 0;
      if (wh.contact) {
        skid = Math.max(skid, Math.min(1, (wh.slipLat - 2.5) / 7));
        if (this.brake > 0.5 && this.fwdSpeed > 8 && !this.drifting) skid = Math.max(skid, 0.55);
        if (this.drifting && !wh.front) skid = Math.max(skid, 0.8);
        if (!wh.front && this.throttle > 0.5 && this.fwdSpeed < 10 && this.fwdSpeed > 0.5) skid = Math.max(skid, 0.6);
        if (wh.sliding) skid = Math.max(skid, 0.5);
      }
      wh.skid = Math.max(0, skid);
      if (wh.contact && surfCount === 0) { this.surface = wh.surf; surfCount++; }
    }
    // gearbox for sound / HUD
    const v = Math.abs(this.fwdSpeed);
    let g = 1;
    while (g < GEARS.length - 1 && v > GEARS[g]) g++;
    const lo = GEARS[g - 1], hi = g === GEARS.length - 1 ? 125 : GEARS[g];
    let rpm = 2400 + clamp((v - lo) / (hi - lo), 0, 1) * 6200;
    if (this.grounded === 0 && this.throttle > 0) rpm = Math.max(rpm, 8200);
    if (v < 2 && this.throttle > 0) rpm = Math.max(rpm, 4200);
    if (this.throttle === 0 && this.brake === 0) rpm = Math.max(1100, rpm * 0.85);
    this.gear = this.fwdSpeed < -0.5 ? 0 : g;
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 14);
  }

  // car basis vectors for external users
  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
}
