// Sky, lighting, fog, ground and the stadium around the track.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { rng } from '../util/math.js';

export const ENV_PRESETS = {
  day: {
    label: 'Day', sunElev: 50, sunAzim: 320, turbidity: 4.5, rayleigh: 1.1, mie: 0.004, mieG: 0.82,
    exposure: 0.62, sun: 0xfff1dc, sunI: 3.0, hemiSky: 0xcfe3ff, hemiGround: 0x4b6a3a, hemiI: 0.5, envI: 0.42,
    fog: 0xbfd5ea, fogNear: 350, fogFar: 3400, clouds: 0.85, cloudTint: 0xffffff,
    mountains: [0x7f9bb8, 0x9bb3cb], lampI: 0.6,
  },
  sunset: {
    label: 'Sunset', sunElev: 7, sunAzim: 285, turbidity: 8, rayleigh: 2.4, mie: 0.008, mieG: 0.9,
    exposure: 0.66, sun: 0xffb574, sunI: 2.7, hemiSky: 0xffc6a0, hemiGround: 0x413a2e, hemiI: 0.45, envI: 0.45,
    fog: 0xe6b48e, fogNear: 280, fogFar: 3000, clouds: 1.0, cloudTint: 0xffc4a6,
    mountains: [0x6f5467, 0x9a7480], lampI: 1.2,
  },
  night: {
    label: 'Night', night: true, sunElev: 62, sunAzim: 70,
    exposure: 1.05, sun: 0xe4ecff, sunI: 2.9, hemiSky: 0x5a6aa0, hemiGround: 0x1c2029, hemiI: 1.0, envI: 0.9,
    fog: 0x0a0f1d, fogNear: 220, fogFar: 2500, clouds: 0.25, cloudTint: 0x5a6a90,
    mountains: [0x121829, 0x1a2238], lampI: 3.2,
  },
};

const NIGHT_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const NIGHT_FS = `varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 top = vec3(0.012, 0.02, 0.055);
  vec3 hor = vec3(0.06, 0.08, 0.16);
  vec3 col = mix(hor, top, pow(max(h, 0.0), 0.55));
  vec3 q = floor(vDir * 380.0);
  float s = hash(q);
  float star = step(0.9965, s) * smoothstep(0.0, 0.25, h) * (0.6 + 0.4 * hash(q + 7.0));
  col += vec3(star) * 1.4;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Environment {
  constructor(renderer, scene, textures) {
    this.renderer = renderer;
    this.scene = scene;
    this.T = textures;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.shadowExtent = 70;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowExtent; sc.right = this.shadowExtent; sc.top = this.shadowExtent; sc.bottom = -this.shadowExtent;
    sc.near = 1; sc.far = 600;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xbfd5ea, 300, 3000);

    // ground
    const gt = textures.grass.clone();
    gt.needsUpdate = true;
    gt.repeat.set(8000 / 32, 8000 / 32);
    this.groundMat = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.96, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    scene.add(this.ground);

    this._mountains();
    this.stadium = null;
    this.lampMats = [];
    this.preset = null;
  }

  setShadowQuality(q) {
    const size = q === 'high' ? 2048 : q === 'medium' ? 1024 : 512;
    this.sun.castShadow = q !== 'off';
    if (this.sun.shadow.map && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(size, size);
  }

  _mountains() {
    this.mountainGroup = new THREE.Group();
    this.mountainMats = [];
    const layers = [[2600, 170, 360, 7], [3400, 260, 560, 13]];
    layers.forEach(([R, hMin, hMax, seed], li) => {
      const rand = rng(seed);
      const N = 180;
      const heights = [];
      let a = rand(), b = rand();
      for (let k = 0; k < N; k++) {
        a = a * 0.7 + rand() * 0.3; b = b * 0.92 + rand() * 0.08;
        heights.push(hMin + (hMax - hMin) * (0.35 * a + 0.65 * b) * (0.7 + 0.3 * Math.sin(k * 0.21 + li)));
      }
      const pos = [], col = [];
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
        const h0 = heights[k], h1 = heights[(k + 1) % N];
        const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
        pos.push(x0, -30, z0, x1, -30, z1, x1, h1, z1, x0, -30, z0, x1, h1, z1, x0, h0, z0);
        col.push(0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 1, 1, 1, 0.72, 0.72, 0.72, 1, 1, 1, 1, 1, 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0x8899aa, vertexColors: true, fog: false, side: THREE.DoubleSide });
      this.mountainMats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -1;
      this.mountainGroup.add(mesh);
    });
    this.scene.add(this.mountainGroup);
  }

  setPreset(name) {
    const P = ENV_PRESETS[name] || ENV_PRESETS.day;
    if (this.preset === name) return;
    this.preset = name;
    this.P = P;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - P.sunElev), THREE.MathUtils.degToRad(P.sunAzim));
    this.sun.color.set(P.sun);
    this.sun.intensity = P.sunI;
    this.hemi.color.set(P.hemiSky);
    this.hemi.groundColor.set(P.hemiGround);
    this.hemi.intensity = P.hemiI;
    this.scene.fog.color.set(P.fog);
    this.scene.fog.near = P.fogNear;
    this.scene.fog.far = P.fogFar;
    this.renderer.toneMappingExposure = P.exposure;
    this.mountainMats[0].color.set(P.mountains[0]);
    this.mountainMats[1].color.set(P.mountains[1]);
    this.groundMat.color.set(P.night ? 0x6d7d8f : name === 'sunset' ? 0xf0d8c0 : 0xffffff);
    for (const m of this.lampMats) m.emissiveIntensity = P.lampI;
    this._bakeSky(P);
  }

  _bakeSky(P) {
    const scene = new THREE.Scene();
    let sky = null;
    if (P.night) {
      const m = new THREE.ShaderMaterial({ vertexShader: NIGHT_VS, fragmentShader: NIGHT_FS, side: THREE.BackSide, depthWrite: false });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), m));
      const cm = new THREE.MeshBasicMaterial({ map: this.T.clouds, transparent: true, opacity: P.clouds, color: P.cloudTint, depthWrite: false, side: THREE.BackSide, fog: false });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), cm);
      dome.scale.set(1, 0.55, 1);
      scene.add(dome);
    } else {
      sky = new Sky();
      sky.scale.setScalar(1500);
      const u = sky.material.uniforms;
      u.turbidity.value = P.turbidity;
      u.rayleigh.value = P.rayleigh;
      u.mieCoefficient.value = P.mie;
      u.mieDirectionalG.value = P.mieG;
      u.sunPosition.value.copy(this.sunDir);
      u.cloudCoverage.value = P.clouds * 0.45;
      u.cloudDensity.value = 0.55;
      u.cloudElevation.value = 0.55;
      u.time.value = 40;
      scene.add(sky);
    }
    const bake = (sunDisc) => {
      if (sky) sky.material.uniforms.showSunDisc.value = sunDisc ? 1 : 0;
      const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      new THREE.CubeCamera(1, 3000, rt).update(this.renderer, scene);
      return rt;
    };
    // background keeps the sun disc; the lighting probe must not (it would flood the scene)
    const bg = bake(true);
    const probe = bake(false);
    if (this.skyRT) this.skyRT.dispose();
    this.skyRT = bg;
    this.scene.background = bg.texture;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromCubemap(probe.texture);
    probe.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = P.envI;
    scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  // Keep the shadow camera centred on the action, snapped to shadow texels.
  update(focus) {
    const ext = this.shadowExtent;
    const texel = (2 * ext) / this.sun.shadow.mapSize.x;
    const d = this.sunDir;
    const right = _r.set(0, 1, 0).cross(d).normalize();
    const up = _u.copy(d).cross(right).normalize();
    const x = focus.dot(right), y = focus.dot(up);
    const f = _f.copy(focus).addScaledVector(right, Math.round(x / texel) * texel - x).addScaledVector(up, Math.round(y / texel) * texel - y);
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(d, 300);
    this.mountainGroup.position.set(focus.x, 0, focus.z);
    this.ground.position.set(Math.round(focus.x / 32) * 32, 0, Math.round(focus.z / 32) * 32);
  }

  // Stadium dressing around the play area of a track.
  buildStadium(track) {
    if (this.stadium) {
      this.scene.remove(this.stadium);
      this.stadium.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!o.userData.sharedMat) o.material.dispose?.(); } });
    }
    const S = track.stadium;
    const g = new THREE.Group();
    g.name = 'stadium';
    const T = this.T;
    const concreteMat = new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a3039, roughness: 0.7, metalness: 0.2 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const crowdTex = T.crowd.clone();
    crowdTex.needsUpdate = true;
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: this.P ? this.P.lampI : 0.6 });
    this.lampMats = [lampMat];

    const sides = [
      { a: [S.minX, S.minZ], b: [S.maxX, S.minZ], n: [0, 1] },
      { a: [S.maxX, S.minZ], b: [S.maxX, S.maxZ], n: [-1, 0] },
      { a: [S.maxX, S.maxZ], b: [S.minX, S.maxZ], n: [0, -1] },
      { a: [S.minX, S.maxZ], b: [S.minX, S.minZ], n: [1, 0] },
    ];
    const wallH = 3.2;
    sides.forEach((sd, si) => {
      const [ax, az] = sd.a, [bx, bz] = sd.b;
      const len = Math.hypot(bx - ax, bz - az);
      const dir = [(bx - ax) / len, (bz - az) / len];
      const yaw = Math.atan2(-dir[1], dir[0]);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      // perimeter wall
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 2, wallH, 1), concreteMat);
      wall.position.set(cx - sd.n[0] * 0.5, wallH / 2, cz - sd.n[1] * 0.5);
      wall.rotation.y = yaw;
      wall.castShadow = true; wall.receiveShadow = true;
      g.add(wall);
      // banners on the inner face
      const count = Math.floor(len / 18);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count - 0.5;
        const bm = new THREE.MeshStandardMaterial({ map: T.banners[(k + si) % T.banners.length], roughness: 0.6, emissive: 0xffffff, emissiveMap: T.banners[(k + si) % T.banners.length], emissiveIntensity: 0.15 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), bm);
        plane.position.set(cx + dir[0] * t * len + sd.n[0] * 0.02, 1.6, cz + dir[1] * t * len + sd.n[1] * 0.02);
        plane.rotation.y = Math.atan2(sd.n[0], sd.n[1]);
        g.add(plane);
      }
      // grandstand
      const stand = this._stand(len - 40, crowdMat, darkMat, roofMat);
      stand.position.set(cx - sd.n[0] * 6, 0, cz - sd.n[1] * 6);
      stand.rotation.y = Math.atan2(sd.n[0], sd.n[1]);
      g.add(stand);
    });
    // light towers
    const corners = [[S.minX, S.minZ], [S.maxX, S.minZ], [S.maxX, S.maxZ], [S.minX, S.maxZ]];
    for (const [x, z] of corners) {
      const cx = (S.minX + S.maxX) / 2, cz = (S.minZ + S.maxZ) / 2;
      const dx = x - cx, dz = z - cz, dl = Math.hypot(dx, dz);
      const px = x + (dx / dl) * 26, pz = z + (dz / dl) * 26;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 52, 10), darkMat);
      pole.position.set(px, 26, pz);
      pole.castShadow = true;
      g.add(pole);
      const head = new THREE.Group();
      head.position.set(px, 54, pz);
      head.lookAt(cx, 0, cz);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 1.2), darkMat);
      head.add(frame);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.3), lampMat);
        lamp.position.set(-4.2 + i * 2.8, -2.2 + j * 2.2, 0.7);
        head.add(lamp);
      }
      g.add(head);
    }
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.stadium = g;
    this.scene.add(g);
  }

  // stepped grandstand along local X, facing +Z
  _stand(len, crowdMat, darkMat, roofMat) {
    const g = new THREE.Group();
    const steps = 10, depth = 1.5, rise = 0.95, base = 3.4;
    const riserPos = [], riserUv = [], treadPos = [];
    for (let i = 0; i < steps; i++) {
      const z0 = -i * depth, y0 = base + i * rise, y1 = y0 + rise;
      riserPos.push(-len / 2, y0, z0, len / 2, y0, z0, len / 2, y1, z0, -len / 2, y0, z0, len / 2, y1, z0, -len / 2, y1, z0);
      const u = len / 16, v0 = i / steps, v1 = (i + 1) / steps;
      riserUv.push(0, v0, u, v0, u, v1, 0, v0, u, v1, 0, v1);
      treadPos.push(-len / 2, y1, z0, len / 2, y1, z0, len / 2, y1, z0 - depth, -len / 2, y1, z0, len / 2, y1, z0 - depth, -len / 2, y1, z0 - depth);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(riserPos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(riserUv, 2));
    rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, crowdMat));
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(treadPos, 3));
    tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, darkMat));
    // front and back walls
    const front = new THREE.Mesh(new THREE.BoxGeometry(len, base, 0.8), darkMat);
    front.position.set(0, base / 2, 0.4);
    g.add(front);
    const top = base + steps * rise;
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, top + 7, 1), darkMat);
    back.position.set(0, (top + 7) / 2, -steps * depth - 0.5);
    back.castShadow = true;
    g.add(back);
    // roof on columns
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.5, steps * depth + 6), roofMat);
    roof.position.set(0, top + 7.2, -steps * depth / 2 + 1);
    roof.rotation.x = -0.06;
    roof.castShadow = true;
    g.add(roof);
    for (let x = -len / 2; x <= len / 2 + 0.1; x += 24) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), darkMat);
      col.position.set(x, top + 3.5, -steps * depth - 0.2);
      g.add(col);
    }
    return g;
  }
}

const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
