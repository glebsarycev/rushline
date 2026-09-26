// Sky, lighting, fog, ground and the stadium around the track.

import * as THREE from 'three';
import { SkyDome, SKIES, LANDS } from './sky.js';

// Time-of-day presets. The sky picture sets the sun position; `sunAz` turns the
// picture so its sun sits at that world azimuth (0 = north / -Z, 90 = east / +X),
// the light never drops below `sunElMin` so low suns still light the track.
// haze = the picture's horizon colour (sRGB), used for fog and landscape haze.
export const ENV_PRESETS = {
  morning: {
    label: 'Morning', sky: 'morning', sunAz: 70, sunElMin: 11,
    sun: 0xffdcb8, sunI: 2.6, hemiSky: 0xffe2c6, hemiGround: 0x55603f, hemiI: 0.5, envI: 0.55,
    exposure: 0.95, skyGain: 1.0, sunGlow: [2.2, 1.7, 1.1], haze: [0.938, 0.677, 0.517], hazeAmt: 0.5,
    landLight: 0xffe0c8, groundHaze: 0x8c7a66, fogNear: 450, fogFar: 3800, ground: 0xfff2e0, lampI: 0.4,
  },
  day: {
    label: 'Day', sky: 'day', sunAz: 200, sunElMin: 25,
    sun: 0xfff4e6, sunI: 3.0, hemiSky: 0xcfe3ff, hemiGround: 0x4b6a3a, hemiI: 0.5, envI: 0.5,
    exposure: 0.85, skyGain: 1.0, sunGlow: [2.4, 2.3, 2.1], haze: [0.673, 0.823, 0.984], hazeAmt: 0.35,
    landLight: 0xffffff, groundHaze: 0x7d8a86, fogNear: 500, fogFar: 4200, ground: 0xffffff, lampI: 0.4,
  },
  sunset: {
    label: 'Sunset', sky: 'sunset', sunAz: 285, sunElMin: 9,
    sun: 0xffae78, sunI: 2.3, hemiSky: 0xffb393, hemiGround: 0x3d3128, hemiI: 0.5, envI: 0.6,
    exposure: 0.95, skyGain: 1.0, sunGlow: [2.8, 1.5, 0.6], haze: [0.91, 0.401, 0.178], hazeAmt: 0.55,
    landLight: 0xffab80, groundHaze: 0x6b3d28, fogNear: 380, fogFar: 3400, ground: 0xf4d6bc, lampI: 1.1,
  },
  night: {
    label: 'Night', night: true, sky: 'night', sunAz: 150, sunElMin: 48,
    sun: 0xe8eeff, sunI: 2.7, hemiSky: 0x5a6aa0, hemiGround: 0x1c2029, hemiI: 0.9, envI: 0.9,
    exposure: 1.05, skyGain: 1.0, sunGlow: [0.5, 0.55, 0.65], haze: [0.065, 0.232, 0.552], hazeAmt: 0.55,
    landLight: 0x28324c, groundHaze: 0x070c18, fogNear: 260, fogFar: 2600, ground: 0x6d7d8f, lampI: 3.2,
  },
};
export const ENV_IDS = Object.keys(ENV_PRESETS);
export { LANDS };
export const LAND_IDS = Object.keys(LANDS);

// Stadium lawn: detail texture, mowing stripes and a slow colour variation.
function patchLawn(mat, macro) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLawnPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnPos;\nuniform sampler2D uMacro;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 lp = vLawnPos.xz;
          float stripe = step(0.5, fract(lp.x / 24.0));
          float fade = 1.0 - smoothstep(250.0, 900.0, length(lp - cameraPosition.xz));
          diffuseColor.rgb *= mix(1.0, mix(0.84, 1.1, stripe), fade);
          diffuseColor.rgb *= 0.82 + 0.36 * texture2D(uMacro, lp / 96.0).g;
        }`);
  };
  mat.customProgramCacheKey = () => 'lawn';
}

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

    this.sky = new SkyDome();
    scene.add(this.sky.mesh);

    // ground: stadium lawn (Higgsfield detail texture, mowing stripes in the shader)
    const lawn = new THREE.TextureLoader().load('assets/env/lawn.jpg');
    lawn.colorSpace = THREE.SRGBColorSpace;
    lawn.wrapS = lawn.wrapT = THREE.MirroredRepeatWrapping;
    lawn.repeat.set(8000 / 8, 8000 / 8);
    lawn.anisotropy = 8;
    this.groundMat = new THREE.MeshStandardMaterial({ map: lawn, roughness: 0.95, metalness: 0 });
    patchLawn(this.groundMat, textures.grass);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    scene.add(this.ground);

    this.stadium = null;
    this.lampMats = [];
    this.preset = null;
    this.land = null;
    this.version = 0;
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

  // Preload the pictures of a preset + landscape (used while the loading screen is up).
  preload(name, land) {
    const P = ENV_PRESETS[name] || ENV_PRESETS.day;
    return this.sky.preload(P.sky, land);
  }

  // Apply a time of day and landscape. Lights change at once; the sky picture
  // swaps in (and the reflections are re-baked) as soon as it has loaded.
  setPreset(name, land = 'mountains') {
    if (!ENV_PRESETS[name]) name = 'day';
    if (!LANDS[land]) land = 'mountains';
    if (this.preset === name && this.land === land) return this.ready || Promise.resolve();
    this.preset = name;
    this.land = land;
    const P = (this.P = ENV_PRESETS[name]);
    this.hemi.color.set(P.hemiSky);
    this.hemi.groundColor.set(P.hemiGround);
    this.hemi.intensity = P.hemiI;
    this.sun.color.set(P.sun);
    this.sun.intensity = P.sunI;
    const haze = new THREE.Color().setRGB(P.haze[0], P.haze[1], P.haze[2], THREE.SRGBColorSpace);
    this.scene.fog.color.copy(haze).multiplyScalar(P.skyGain);
    this.scene.fog.near = P.fogNear;
    this.scene.fog.far = P.fogFar;
    this.renderer.toneMappingExposure = P.exposure;
    this.groundMat.color.set(P.ground);
    for (const m of this.lampMats) m.emissiveIntensity = P.lampI;
    const v = ++this.version;
    this.ready = this.sky.set({ ...P, haze: haze.toArray() }, land).then(() => {
      if (v !== this.version) return;
      const el = Math.max(this.sky.sunElevation, THREE.MathUtils.degToRad(P.sunElMin));
      const az = this.sky.sunAzimuth;
      this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      this._bakeReflections(P);
    }).catch((err) => console.warn('Sky pictures unavailable:', err && err.message ? err.message : err));
    return this.ready;
  }

  // Image-based lighting from the sky dome (without the HDR sun core)
  _bakeReflections(P) {
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh(this.sky.mesh.geometry, this.sky.material);
    dome.onBeforeRender = this.sky.mesh.onBeforeRender.bind(this.sky.mesh);
    scene.add(dome);
    const glow = this.sky.uniforms.uSunGlow.value.clone();
    this.sky.uniforms.uSunGlow.value.set(0, 0, 0);
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    new THREE.CubeCamera(1, 3000, rt).update(this.renderer, scene);
    this.sky.uniforms.uSunGlow.value.copy(glow);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromCubemap(rt.texture);
    rt.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = P.envI;
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
