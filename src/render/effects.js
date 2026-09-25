// Particles (tyre smoke, dust, sparks, confetti) and skid marks.

import * as THREE from 'three';

const PVS = `
attribute float size; attribute float alpha; attribute vec3 tint;
varying float vAlpha; varying vec3 vTint;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  vAlpha = alpha; vTint = tint;
}`;
const PFS = `
uniform sampler2D uMap;
varying float vAlpha; varying vec3 vTint;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vTint * t.rgb, a);
}`;

export class Particles {
  constructor(max, map, additive = false) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.active = 0;
  }

  emit(x, y, z, vx, vy, vz, { size = 1, grow = 1, life = 1, alpha = 0.6, color = [1, 1, 1], drag = 1.5, gravity = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = size; this.grow[i] = grow; this.alpha0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = gravity;
    this.tint[i3] = color[0]; this.tint[i3 + 1] = color[1]; this.tint[i3 + 2] = color[2];
  }

  update(dt) {
    const n = this.max;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * t);
      this.alpha[i] = this.alpha0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.tint.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

const SVS = `attribute float alpha; varying float vAlpha; void main(){ vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SFS = `uniform vec3 uColor; varying float vAlpha; void main(){ gl_FragColor = vec4(uColor, vAlpha); }`;

export class SkidMarks {
  constructor(maxQuads = 4000) {
    this.max = maxQuads;
    this.pos = new Float32Array(maxQuads * 6 * 3);
    this.alpha = new Float32Array(maxQuads * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x0c0d0f) } },
      vertexShader: SVS, fragmentShader: SFS,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.cursor = 0;
    this.trails = [null, null, null, null];
    this.dirty = false;
  }

  // point = contact point, n = surface normal, side = lateral vector
  add(i, point, n, side, width, intensity) {
    const lift = 0.03;
    const px = point.x + n.x * lift, py = point.y + n.y * lift, pz = point.z + n.z * lift;
    const hw = width / 2;
    const l = [px - side.x * hw, py - side.y * hw, pz - side.z * hw];
    const r = [px + side.x * hw, py + side.y * hw, pz + side.z * hw];
    const prev = this.trails[i];
    if (prev && intensity > 0.02) {
      const dx = px - prev.p[0], dy = py - prev.p[1], dz = pz - prev.p[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.25) return;
      if (d2 < 36) {
        const q = this.cursor;
        this.cursor = (this.cursor + 1) % this.max;
        const o = q * 18, a = q * 6;
        const P = this.pos;
        const verts = [prev.l, prev.r, r, prev.l, r, l];
        for (let k = 0; k < 6; k++) { P[o + k * 3] = verts[k][0]; P[o + k * 3 + 1] = verts[k][1]; P[o + k * 3 + 2] = verts[k][2]; }
        const a0 = prev.a * 0.55, a1 = intensity * 0.55;
        this.alpha[a] = a0; this.alpha[a + 1] = a0; this.alpha[a + 2] = a1; this.alpha[a + 3] = a0; this.alpha[a + 4] = a1; this.alpha[a + 5] = a1;
        this.dirty = true;
      }
    }
    this.trails[i] = intensity > 0.02 ? { p: [px, py, pz], l, r, a: intensity } : null;
  }

  lift(i) { this.trails[i] = null; }

  update() {
    if (!this.dirty) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    this.dirty = false;
  }

  clear() {
    this.pos.fill(0);
    this.alpha.fill(0);
    this.trails = [null, null, null, null];
    this.dirty = true;
    this.update();
  }
}
