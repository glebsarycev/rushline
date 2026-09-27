// Sky, lighting, fog, ground and the stadium around the track.

import * as THREE from 'three';
import { SkyDome, LANDS } from './sky.js';
import { Stadium } from './stadium.js';
import { themeOf, applyThemeStadium } from './themes.js';

// Time-of-day presets. The sky picture sets the sun position; `sunAz` turns the
// picture so its sun sits at that world azimuth (0 = north / -Z, 90 = east / +X),
// the light never drops below `sunElMin` so low suns still light the track.
// haze = the picture's horizon colour (sRGB), used for fog and landscape haze.
export const ENV_PRESETS = {
  morning: {
    label: 'Morning', ribbon: 0x2fd3c4, sky: 'morning', sunAz: 70, sunElMin: 11, skyLift: 15.5,
    sun: 0xffdcb8, sunI: 2.6, hemiSky: 0xffe2c6, hemiGround: 0x55603f, hemiI: 0.5, envI: 0.55,
    exposure: 0.95, skyGain: 1.0, sunGlow: [2.2, 1.7, 1.1], haze: [0.938, 0.677, 0.517], hazeAmt: 0.5,
    landLight: 0xffe0c8, groundHaze: 0x8c7a66, fogNear: 450, fogFar: 3800, ground: 0xfff2e0, lampI: 0.4,
  },
  day: {
    label: 'Day', ribbon: 0x3d8bff, sky: 'day', sunAz: 200, sunElMin: 25,
    sun: 0xfff4e6, sunI: 3.0, hemiSky: 0xcfe3ff, hemiGround: 0x4b6a3a, hemiI: 0.5, envI: 0.5,
    exposure: 0.85, skyGain: 1.0, sunGlow: [2.4, 2.3, 2.1], haze: [0.673, 0.823, 0.984], hazeAmt: 0.35,
    landLight: 0xffffff, groundHaze: 0x7d8a86, fogNear: 500, fogFar: 4200, ground: 0xffffff, lampI: 0.4,
  },
  sunset: {
    label: 'Sunset', ribbon: 0xff7a1a, sky: 'sunset', sunAz: 285, sunElMin: 9, skyLift: 15.5,
    sun: 0xffae78, sunI: 2.3, hemiSky: 0xffb393, hemiGround: 0x3d3128, hemiI: 0.5, envI: 0.6,
    exposure: 0.95, skyGain: 1.0, sunGlow: [2.8, 1.5, 0.6], haze: [0.91, 0.401, 0.178], hazeAmt: 0.55,
    landLight: 0xffab80, groundHaze: 0x6b3d28, fogNear: 380, fogFar: 3400, ground: 0xf4d6bc, lampI: 1.1,
  },
  night: {
    label: 'Night', ribbon: 0x8a5cff, night: true, sky: 'night', sunAz: 150, sunElMin: 48,
    sun: 0xe8eeff, sunI: 2.7, hemiSky: 0x5a6aa0, hemiGround: 0x1c2029, hemiI: 0.9, envI: 0.9,
    exposure: 1.05, skyGain: 1.0, sunGlow: [0.5, 0.55, 0.65], haze: [0.065, 0.232, 0.552], hazeAmt: 0.55,
    landLight: 0x28324c, groundHaze: 0x070c18, fogNear: 260, fogFar: 2600, ground: 0x6d7d8f, lampI: 3.2,
  },
};
export const ENV_IDS = Object.keys(ENV_PRESETS);
export { LANDS };
export const LAND_IDS = Object.keys(LANDS);

// Stadium lawn: detail texture, mowing stripes and a slow colour variation.
// Stripes only inside the field rectangle (uField = minX, minZ, maxX, maxZ).
function patchLawn(mat, macro, field) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    shader.uniforms.uField = field;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLawnPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnPos;\nuniform sampler2D uMacro;\nuniform vec4 uField;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 lp = vLawnPos.xz;
          float stripe = step(0.5, fract(lp.x / 24.0));
          float fade = 1.0 - smoothstep(250.0, 900.0, length(lp - cameraPosition.xz));
          float inField = step(uField.x, lp.x) * step(lp.x, uField.z) * step(uField.y, lp.y) * step(lp.y, uField.w);
          diffuseColor.rgb *= mix(1.0, mix(0.84, 1.1, stripe), fade * inField);
          diffuseColor.rgb *= 0.82 + 0.36 * texture2D(uMacro, lp / 96.0).g;
          diffuseColor.rgb *= mix(0.62, 1.0, inField);
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
    this.fieldU = { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) };
    patchLawn(this.groundMat, textures.grass, this.fieldU);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    scene.add(this.ground);

    // stadium: materials live as long as the environment, geometry per track
    const crowd = new THREE.TextureLoader().load('assets/env/crowd.jpg');
    crowd.colorSpace = THREE.SRGBColorSpace;
    crowd.wrapS = THREE.MirroredRepeatWrapping;
    crowd.anisotropy = 8;
    this.bowl = new Stadium(textures, crowd);
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
  setPreset(name, land = 'mountains', theme = 'classic') {
    if (!ENV_PRESETS[name]) name = 'day';
    if (!LANDS[land]) land = 'mountains';
    const th = themeOf(theme);
    // the lawn only where the theme has one (the mirror world and the valley bring their own ground)
    this.ground.visible = th.ground === 'lawn';
    if (this.preset === name && this.land === land && this.theme === theme) return this.ready || Promise.resolve();
    this.preset = name;
    this.land = land;
    this.theme = theme;
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
    this.bowl.setMood(P);
    const v = ++this.version;
    this.ready = this.sky.set({ ...P, haze: haze.toArray() }, land, { mirror: th.ground === 'mirror' }).then(() => {
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
    this.bowl.update(performance.now() / 1000);
  }

  // TM2020-style stadium bowl around the play area of a track (themes without a
  // stadium get none).
  buildStadium(track) {
    if (this.stadium) {
      this.scene.remove(this.stadium);
      this.stadium.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      this.stadium = null;
    }
    if (!themeOf(track.theme).stadium) return;
    this.stadium = this.bowl.build(track.stadium);
    const S = track.stadium;
    this.fieldU.value.set(S.minX, S.minZ, S.maxX, S.maxZ);
    this.bowl.setMood(this.P || ENV_PRESETS.day);
    applyThemeStadium(this.bowl, track.theme);
    this.scene.add(this.stadium);
  }
}

const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
