// Player / ghost car rendered from the glTF model. Same interface as CarView
// (object, update, setColor, setHeadlights, mat.paint) so the rest of the game
// does not care which one is used.

import * as THREE from 'three';
import { CAR } from '../physics/vehicle.js';

const WHEEL_IDS = ['fl', 'fr', 'rl', 'rr']; // same order as CAR.wheels
const MAX_TRAVEL = 0.12; // visual wheel travel, keeps tyres out of the fender shells

const _hub = new THREE.Vector3(), _mid = new THREE.Vector3(), _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class GlbCarView {
  constructor(asset, { color = '#ff3b30', ghost = false } = {}) {
    this.ghost = ghost;
    this.object = new THREE.Group();
    this.object.name = ghost ? 'ghost' : 'car';
    this.model = asset.scene.clone(true);
    this.model.position.y = -asset.comHeight;
    this.object.add(this.model);
    this.restLen = asset.restSuspension;
    this.time = 0;
    this._materials(color);

    this.wheels = WHEEL_IDS.map((id, i) => {
      const pivot = this.model.getObjectByName(`wheel_${id}`);
      return { id, pivot, spin: this.model.getObjectByName(`wheel_${id}_spin`), rest: pivot.position.clone(), front: CAR.wheels[i].front };
    });
    this.arms = [];
    this.model.traverse((o) => {
      const x = o.userData;
      if (!x || !x.anchor || !x.wheel) return;
      const wheel = this.wheels.find((w) => w.id === x.wheel);
      if (wheel) this.arms.push({ mesh: o, wheel, anchor: new THREE.Vector3().fromArray(x.anchor), hubOffset: new THREE.Vector3().fromArray(x.hubOffset || [0, 0, 0]) });
    });

    this.flames = [];
    if (!ghost) {
      for (const name of ['exhaust_l', 'exhaust_r']) {
        const node = this.model.getObjectByName(name);
        if (node) this.flames.push(this._flame(node));
      }
      const anchor = this.model.getObjectByName('headlight_anchor');
      this.headlight = new THREE.SpotLight(0xfff1d6, 0, 90, 0.55, 0.5, 1.2);
      this.headlight.castShadow = false;
      const p = anchor ? anchor.position : new THREE.Vector3(0, 0.42, -2.2);
      this.headlight.position.copy(p);
      this.headlight.target.position.set(p.x, p.y - 1.2, p.z - 12);
      this.model.add(this.headlight, this.headlight.target);
    }
  }

  _materials(color) {
    this.mat = {};
    if (this.ghost) {
      const m = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x3aa8ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.34, depthWrite: false, roughness: 0.3, metalness: 0.1 });
      this.model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = m;
        o.castShadow = false;
        o.receiveShadow = false;
        o.renderOrder = 2;
      });
      this.mat.paint = m;
      return;
    }
    // per-instance copies so colour and brake lights never leak between cars
    const copies = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      let c = copies.get(o.material);
      if (!c) {
        c = o.material.clone();
        for (const k of ['map', 'metalnessMap', 'roughnessMap', 'emissiveMap']) if (c[k]) c[k].anisotropy = 8;
        copies.set(o.material, c);
      }
      o.material = c;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    for (const m of copies.values()) this.mat[m.name] = m;
    this.mat.paint = this.mat.Paint;
    this.mat.tail = this.mat.TailLight;
    this.tailBase = this.mat.tail ? this.mat.tail.emissiveIntensity : 1;
    this.setColor(color);
  }

  _flame(node) {
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1, 12, 1, true), fm);
    flame.geometry.translate(0, -0.5, 0);
    flame.rotation.x = -Math.PI / 2;
    flame.position.copy(node.position);
    flame.visible = false;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.045, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.geometry.translate(0, -0.5, 0);
    flame.add(core);
    this.model.add(flame);
    return flame;
  }

  setColor(color) {
    if (!this.ghost && this.mat.paint) this.mat.paint.color.set(color);
  }

  setHeadlights(on) {
    if (this.headlight) this.headlight.intensity = on ? 900 : 0;
  }

  // state: { pos, quat, wheels:[{len, spin}], steerAngle, brake, boost }
  update(state, dt) {
    this.time += dt;
    this.object.position.copy(state.pos);
    this.object.quaternion.copy(state.quat);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const ws = state.wheels ? state.wheels[i] : null;
      const lift = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, this.restLen - (ws ? ws.len : this.restLen)));
      w.pivot.position.y = w.rest.y + lift;
      w.pivot.rotation.y = w.front ? -(state.steerAngle || 0) : 0;
      w.spin.rotation.x = -(ws ? ws.spin : 0);
    }
    for (const a of this.arms) {
      _hub.copy(a.wheel.pivot.position).add(a.hubOffset);
      _mid.copy(a.anchor).add(_hub).multiplyScalar(0.5);
      _dir.subVectors(_hub, a.anchor);
      const len = _dir.length();
      a.mesh.position.copy(_mid);
      a.mesh.scale.set(1, len, 1);
      a.mesh.quaternion.setFromUnitVectors(_up, _dir.divideScalar(len));
    }
    if (this.ghost) return;
    if (this.mat.tail) this.mat.tail.emissiveIntensity = state.brake > 0.1 ? this.tailBase * 3 : this.tailBase;
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

  dispose() {
    this.object.traverse((o) => {
      if (o.isMesh && o.material && !this.ghost) o.material.dispose?.();
    });
  }
}
