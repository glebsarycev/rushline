// Procedural car model: a lofted open-wheel racer (original design).
// Local origin = the physics centre of mass, forward = -Z.

import * as THREE from 'three';
import { CAR } from '../physics/vehicle.js';

// superellipse cross-sections lofted along Z
function loft(stations, segs = 28, n = 2.6, flatBottom = 0.65, stripe = null) {
  const pos = [], col = [], idx = [];
  const ring = segs;
  const white = new THREE.Color(1, 1, 1);
  for (const st of stations) {
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = st.w * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) + (st.x || 0);
      const hy = sa < 0 ? st.h * flatBottom : st.h;
      const y = st.y + hy * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
      pos.push(x, y, st.z);
      const c = stripe && Math.abs(x - (st.x || 0)) < stripe.width && sa > 0.2 ? stripe.color : white;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k, b = i * ring + ((k + 1) % ring);
      const c = (i + 1) * ring + ((k + 1) % ring), d = (i + 1) * ring + k;
      idx.push(a, d, b, b, d, c);
    }
  }
  // end caps
  const capCenter = (i, flip) => {
    const st = stations[i];
    const ci = pos.length / 3;
    pos.push(st.x || 0, st.y, st.z);
    col.push(1, 1, 1);
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k, b = i * ring + ((k + 1) % ring);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  capCenter(0, true);
  capCenter(stations.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tyreGeometry(r, w) {
  const pts = [
    [r * 0.6, -w / 2], [r * 0.86, -w / 2], [r * 0.97, -w / 2 + 0.035], [r, -w / 4], [r, w / 4], [r * 0.97, w / 2 - 0.035], [r * 0.86, w / 2], [r * 0.6, w / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateZ(Math.PI / 2);
  return g;
}

export class CarView {
  constructor({ color = '#ff3b30', accent = '#15181d', ghost = false, envMap = null } = {}) {
    this.ghost = ghost;
    this.object = new THREE.Group();
    this.object.name = ghost ? 'ghost' : 'car';
    this.body = new THREE.Group();
    this.object.add(this.body);
    this._materials(color, accent, ghost);
    this._build();
    this.boostLevel = 0;
    this.time = 0;
    if (ghost) {
      this.object.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; } });
    }
  }

  _materials(color, accent, ghost) {
    if (ghost) {
      const m = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x3aa8ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.34, depthWrite: false, roughness: 0.3, metalness: 0.1 });
      this.mat = { paint: m, dark: m, carbon: m, metal: m, tyre: m, glass: m, head: m, tail: m, helmet: m, visor: m };
      return;
    }
    this.mat = {
      paint: new THREE.MeshPhysicalMaterial({ color, vertexColors: true, metalness: 0.12, roughness: 0.4, clearcoat: 0.65, clearcoatRoughness: 0.12, envMapIntensity: 0.55 }),
      dark: new THREE.MeshStandardMaterial({ color: accent, metalness: 0.3, roughness: 0.45 }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.35, roughness: 0.4 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.95, roughness: 0.22 }),
      tyre: new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0, roughness: 0.92 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1320, metalness: 0.2, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 }),
      head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 4 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1a1a, emissiveIntensity: 1.2 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.2, roughness: 0.3 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.1 }),
    };
  }

  setColor(color) {
    if (!this.ghost) this.mat.paint.color.set(color);
  }

  setHeadlights(on) {
    if (this.headlight) this.headlight.intensity = on ? 900 : 0;
  }

  _mesh(geo, mat, parent = this.body) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _box(sx, sy, sz, x, y, z, mat, rx = 0, parent = this.body) {
    const m = this._mesh(new THREE.BoxGeometry(sx, sy, sz), mat, parent);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    return m;
  }

  _build() {
    const M = this.mat;
    const stripe = this.ghost ? null : { width: 0.13, color: new THREE.Color(0.08, 0.09, 0.11) };
    // main hull
    this._mesh(loft([
      { z: -2.4, w: 0.14, h: 0.07, y: -0.2 },
      { z: -2.15, w: 0.3, h: 0.12, y: -0.18 },
      { z: -1.7, w: 0.46, h: 0.18, y: -0.14 },
      { z: -1.1, w: 0.58, h: 0.25, y: -0.08 },
      { z: -0.5, w: 0.64, h: 0.3, y: -0.03 },
      { z: 0.2, w: 0.68, h: 0.32, y: -0.01 },
      { z: 0.9, w: 0.66, h: 0.3, y: -0.01 },
      { z: 1.55, w: 0.58, h: 0.25, y: -0.03 },
      { z: 2.05, w: 0.48, h: 0.19, y: -0.05 },
      { z: 2.28, w: 0.38, h: 0.14, y: -0.06 },
    ], 28, 2.7, 0.62, stripe), M.paint);
    // side pods
    for (const sx of [-1, 1]) {
      this._mesh(loft([
        { z: -0.75, w: 0.12, h: 0.1, y: -0.12, x: sx * 0.62 },
        { z: -0.45, w: 0.24, h: 0.17, y: -0.1, x: sx * 0.66 },
        { z: 0.4, w: 0.27, h: 0.19, y: -0.1, x: sx * 0.68 },
        { z: 1.25, w: 0.22, h: 0.15, y: -0.11, x: sx * 0.64 },
        { z: 1.6, w: 0.1, h: 0.08, y: -0.12, x: sx * 0.6 },
      ], 20, 3, 0.7, null), M.paint);
      // pod intake
      this._box(0.3, 0.2, 0.05, sx * 0.68, -0.08, -0.78, M.dark);
    }
    // cockpit glass and driver
    const canopy = this._mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    canopy.scale.set(0.4, 0.26, 0.82);
    canopy.position.set(0, 0.22, -0.2);
    const helmet = this._mesh(new THREE.SphereGeometry(0.15, 16, 12), M.helmet);
    helmet.position.set(0, 0.36, 0.05);
    const visor = this._mesh(new THREE.SphereGeometry(0.152, 16, 8, -Math.PI * 0.35 - Math.PI / 2, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.25), M.visor);
    visor.position.copy(helmet.position);
    // airbox + fin
    this._box(0.28, 0.22, 0.5, 0, 0.42, 0.62, M.paint);
    this._box(0.2, 0.12, 0.04, 0, 0.44, 0.36, M.dark);
    this._box(0.035, 0.3, 1.1, 0, 0.36, 1.35, M.paint);
    // floor + diffuser
    this._box(1.55, 0.05, 3.9, 0, -0.33, 0.05, M.carbon);
    this._box(1.2, 0.18, 0.3, 0, -0.26, 2.2, M.carbon, -0.4);
    // front wing
    this._box(2.12, 0.045, 0.42, 0, -0.34, -2.18, M.carbon);
    this._box(1.9, 0.035, 0.2, 0, -0.27, -2.08, M.paint, 0.25);
    for (const sx of [-1, 1]) this._box(0.04, 0.22, 0.52, sx * 1.06, -0.27, -2.15, M.dark);
    // rear wing
    this._box(2.0, 0.05, 0.44, 0, 0.64, 2.02, M.carbon, -0.12);
    this._box(2.0, 0.04, 0.22, 0, 0.78, 2.16, M.paint, -0.35);
    for (const sx of [-1, 1]) {
      this._box(0.045, 0.52, 0.66, sx * 1.02, 0.58, 2.04, M.dark);
      this._box(0.05, 0.42, 0.12, sx * 0.24, 0.41, 1.96, M.carbon);
    }
    // lights
    for (const sx of [-1, 1]) {
      const h = this._box(0.2, 0.05, 0.06, sx * 0.4, -0.08, -1.68, M.head);
      h.rotation.y = sx * 0.35;
    }
    this.tail = this._box(0.9, 0.06, 0.04, 0, 0.02, 2.29, M.tail);
    if (!this.ghost) {
      this.headlight = new THREE.SpotLight(0xfff1d6, 0, 90, 0.55, 0.5, 1.2);
      this.headlight.position.set(0, 0.1, -1.8);
      this.headlight.target.position.set(0, -1.2, -14);
      this.headlight.castShadow = false;
      this.body.add(this.headlight, this.headlight.target);
    }
    this._box(0.12, 0.12, 0.04, 0, 0.18, 2.3, M.tail);
    // exhausts + boost flames
    this.flames = [];
    for (const sx of [-1, 1]) {
      const ex = this._mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.28, 12), M.metal);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx * 0.2, 0.1, 2.28);
      if (!this.ghost) {
        const fm = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1, 12, 1, true), fm);
        flame.geometry.translate(0, -0.5, 0);
        flame.rotation.x = -Math.PI / 2;
        flame.position.set(sx * 0.2, 0.1, 2.4);
        flame.visible = false;
        this.body.add(flame);
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.geometry.translate(0, -0.5, 0);
        flame.add(core);
        this.flames.push(flame);
      }
    }
    // wheels
    this.wheels = CAR.wheels.map((w) => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y - CAR.suspRest, w.z);
      this.object.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const width = w.front ? 0.34 : 0.4;
      const r = CAR.wheelRadius;
      this._mesh(tyreGeometry(r, width), this.mat.tyre, spin);
      const rim = this._mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, width * 0.82, 20), this.mat.metal, spin);
      rim.rotation.z = Math.PI / 2;
      const side = Math.sign(w.x);
      for (let k = 0; k < 5; k++) {
        const sp = this._mesh(new THREE.BoxGeometry(0.03, r * 1.1, 0.06), this.mat.dark, spin);
        sp.position.x = side * width * 0.42;
        sp.rotation.x = (k / 5) * Math.PI;
      }
      const hub = this._mesh(new THREE.CylinderGeometry(0.07, 0.07, width * 0.9, 10), this.mat.paint, spin);
      hub.rotation.z = Math.PI / 2;
      // suspension arms (re-aimed each frame)
      const arms = [0.06, -0.12].map((dy) => {
        const arm = this._mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), this.mat.carbon, this.object);
        return { mesh: arm, anchor: new THREE.Vector3(side * 0.55, dy, w.z), dy };
      });
      return { def: w, pivot, spin, arms };
    });
  }

  // state: { pos, quat, wheels:[{len, spin}], steerAngle, brake, boost }
  update(state, dt) {
    this.time += dt;
    this.object.position.copy(state.pos);
    this.object.quaternion.copy(state.quat);
    const P = CAR;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const ws = state.wheels ? state.wheels[i] : null;
      const len = ws ? ws.len : P.suspRest;
      w.pivot.position.y = w.def.y - len;
      w.pivot.rotation.y = w.def.front ? -(state.steerAngle || 0) : 0;
      w.spin.rotation.x = -(ws ? ws.spin : 0);
      for (const a of w.arms) {
        const hub = _v.set(Math.sign(w.def.x) * (Math.abs(w.def.x) - 0.12), w.pivot.position.y + a.dy * 0.4, w.def.z);
        const mid = _v2.copy(a.anchor).add(hub).multiplyScalar(0.5);
        a.mesh.position.copy(mid);
        const dir = _v3.subVectors(hub, a.anchor);
        const l = dir.length();
        a.mesh.scale.set(1, l, 1);
        a.mesh.quaternion.setFromUnitVectors(_up, dir.divideScalar(l));
      }
    }
    if (!this.ghost) {
      this.mat.tail.emissiveIntensity = state.brake > 0.1 ? 9 : 2;
      const b = state.boost || 0;
      for (const f of this.flames) {
        f.visible = b > 0;
        if (b > 0) {
          const flick = 0.75 + Math.sin(this.time * 60 + f.position.x * 10) * 0.12 + Math.random() * 0.2;
          f.scale.set(1 + b * 0.3, (0.6 + b * 0.7) * flick, 1 + b * 0.3);
          f.material.color.set(b > 1 ? 0xff5a3c : 0xffa640);
        }
      }
    }
  }

  dispose() {
    this.object.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const k in this.mat) this.mat[k].dispose?.();
  }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
