// Ghost recording / playback: position, rotation and steering sampled at a fixed rate.

import * as THREE from 'three';
import { GHOST_HZ } from '../config.js';
import { f32ToBase64, base64ToF32 } from '../util/math.js';

const STRIDE = 8; // px py pz qx qy qz qw steer

export class GhostRecorder {
  constructor(hz = GHOST_HZ) {
    this.hz = hz;
    this.buf = new Float32Array(STRIDE * hz * 60);
    this.count = 0;
    this.nextT = 0;
    this.duration = 0;
  }

  start(car) {
    this.count = 0;
    this.nextT = 0;
    this.duration = 0;
    this._push(car);
    this.nextT = 1 / this.hz;
  }

  _push(car) {
    if ((this.count + 1) * STRIDE > this.buf.length) {
      const nb = new Float32Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
    const o = this.count * STRIDE;
    const b = this.buf;
    b[o] = car.pos.x; b[o + 1] = car.pos.y; b[o + 2] = car.pos.z;
    b[o + 3] = car.quat.x; b[o + 4] = car.quat.y; b[o + 5] = car.quat.z; b[o + 6] = car.quat.w;
    b[o + 7] = car.steer;
    this.count++;
  }

  sample(t, car) {
    while (t >= this.nextT) {
      this._push(car);
      this.nextT += 1 / this.hz;
    }
    this.duration = t;
  }

  finish(t, car) {
    this.sample(t, car);
    this._push(car);
    this.duration = t;
  }

  toGhost() {
    return new Ghost(this.buf.slice(0, this.count * STRIDE), this.hz, this.duration);
  }
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class Ghost {
  constructor(data, hz, duration) {
    this.data = data;
    this.hz = hz;
    this.duration = duration;
    this.count = Math.floor(data.length / STRIDE);
  }

  // Interpolated pose at time t (seconds). Returns steer and a speed estimate.
  sample(t, outPos, outQuat) {
    const n = this.count;
    if (!n) return { steer: 0, speed: 0 };
    const f = Math.max(0, Math.min(n - 1.0001, t * this.hz));
    const i = Math.floor(f), k = f - i;
    const d = this.data, a = i * STRIDE, b = Math.min(n - 1, i + 1) * STRIDE;
    outPos.set(d[a] + (d[b] - d[a]) * k, d[a + 1] + (d[b + 1] - d[a + 1]) * k, d[a + 2] + (d[b + 2] - d[a + 2]) * k);
    _qa.set(d[a + 3], d[a + 4], d[a + 5], d[a + 6]);
    _qb.set(d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
    outQuat.slerpQuaternions(_qa, _qb, k);
    const dx = d[b] - d[a], dy = d[b + 1] - d[a + 1], dz = d[b + 2] - d[a + 2];
    return { steer: d[a + 7] + (d[b + 7] - d[a + 7]) * k, speed: Math.hypot(dx, dy, dz) * this.hz };
  }

  serialize() {
    return { hz: this.hz, duration: this.duration, data: f32ToBase64(this.data) };
  }

  static deserialize(o) {
    if (!o || !o.data) return null;
    try {
      return new Ghost(base64ToF32(o.data), o.hz, o.duration);
    } catch {
      return null;
    }
  }
}
