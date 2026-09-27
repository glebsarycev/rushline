// Sky dome from Higgsfield panoramas plus a distant landscape band.
//
// Sky images are the upper half of an equirectangular panorama: the horizon is a
// straight row (`horizon`, from the top), the top row is the zenith, and the sun
// or moon sits at `sun` (u, v). Their wrap seam was cross-faded offline.
// Landscapes are photos with the sky cut out (alpha); they are wrapped around the
// horizon in mirrored copies and tinted for the time of day. The sea has no
// ground in the picture: the water is drawn here and reflects the sky.

import * as THREE from 'three';

// measured by the asset preprocessing step (see README, Environment)
export const SKIES = {
  morning: { file: 'assets/env/sky-morning.jpg', horizon: 0.5316, sun: [0.5263, 0.5097] },
  day: { file: 'assets/env/sky-day.jpg', horizon: 0.5255, sun: [0.5263, 0.1893] },
  sunset: { file: 'assets/env/sky-sunset.jpg', horizon: 0.5273, sun: [0.523, 0.5097] },
  night: { file: 'assets/env/sky-night.jpg', horizon: 0.5358, sun: [0.5296, 0.3131] },
};

export const LANDS = {
  mountains: { label: 'Mountains', file: 'assets/env/land-mountains.webp', aspect: 2.3294, copies: 4, base: -0.8 },
  city: { label: 'City', file: 'assets/env/land-city.webp', aspect: 2.3294, copies: 4, base: -0.5, windows: true },
  sea: { label: 'Sea', file: 'assets/env/land-sea.webp', aspect: 2.3294, copies: 4, base: -1.2, water: true },
  canyon: { label: 'Canyon', file: 'assets/env/land-canyon.webp', aspect: 2.3294, copies: 4, base: -0.9 },
};

const VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}`;

const FS = /* glsl */`
uniform sampler2D uSky;
uniform float uHorizon;
uniform float uOffset;
uniform float uLift;
uniform float uGain;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
uniform sampler2D uLand;
uniform float uLandOn;
uniform float uCopies;
uniform float uBase;
uniform float uHeight;
uniform vec3 uLandLight;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uWater;
uniform float uWindows;
uniform vec3 uGround;
uniform float uMirror;
varying vec3 vDir;

#define PI 3.14159265359

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// wrapped derivative of the azimuth (it jumps at +-PI)
float dWrap(float d) { return d > PI ? d - 2.0 * PI : (d < -PI ? d + 2.0 * PI : d); }

vec3 skyAt(float az, float el, vec2 gAz, vec2 gEl) {
  el -= uLift; // low suns are lifted above the stadium roof
  float u = az / (2.0 * PI) + uOffset;
  float yTop = el >= 0.0 ? uHorizon * (1.0 - el / (0.5 * PI)) : uHorizon + (1.0 - uHorizon) * min(1.0, -el / (0.5 * PI));
  vec2 uv = vec2(fract(u), 1.0 - yTop);
  float kv = el >= 0.0 ? uHorizon / (0.5 * PI) : (1.0 - uHorizon) / (0.5 * PI);
  return textureGrad(uSky, uv, vec2(gAz.x / (2.0 * PI), gEl.x * kv), vec2(gAz.y / (2.0 * PI), gEl.y * kv)).rgb;
}

void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z);            // 0 = north (-Z), PI/2 = east (+X)
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 gAz = vec2(dWrap(dFdx(az)), dWrap(dFdy(az)));
  vec2 gEl = vec2(dFdx(el), dFdy(el));
  // mirror world: below the horizon the whole sky, landscape and sun are reflected
  float mirrored = uMirror > 0.5 && el < 0.0 ? 1.0 : 0.0;
  if (mirrored > 0.5) { el = -el; gEl = -gEl; d.y = -d.y; }

  vec3 col = skyAt(az, el, gAz, gEl);

  // below the horizon: water that mirrors the sky, or hazy ground
  if (el < 0.0) {
    if (uWater > 0.5) {
      vec3 refl = skyAt(az, -el, gAz, -gEl);
      float fres = 0.25 + 0.75 * pow(1.0 - min(1.0, -el * 6.0), 5.0);
      col = mix(vec3(0.02, 0.06, 0.09) * uLandLight, refl, fres);
      vec3 r = vec3(d.x, -d.y, d.z);
      col += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 700.0) * 3.0;
    } else {
      col = mix(uHaze, uGround, smoothstep(0.0, 0.25, -el));
    }
  }

  // distant landscape in mirrored copies around the horizon
  if (uLandOn > 0.5) {
    float x = az / (2.0 * PI) * uCopies;
    float seg = floor(x);
    float lu = fract(x);
    float mirror = mod(seg, 2.0);
    if (mirror > 0.5) lu = 1.0 - lu;
    float lv = (el - uBase) / uHeight;
    if (lv > 0.0 && lv < 1.0) {
      float sgn = mirror > 0.5 ? -1.0 : 1.0;
      vec2 dx = vec2(sgn * gAz.x / (2.0 * PI) * uCopies, gEl.x / uHeight);
      vec2 dy = vec2(sgn * gAz.y / (2.0 * PI) * uCopies, gEl.y / uHeight);
      vec4 land = textureGrad(uLand, vec2(lu, lv), dx, dy);
      vec3 lc = land.rgb * uLandLight;
      lc = mix(lc, uHaze, uHazeAmt * (1.0 - 0.6 * lv));
      if (uWindows > 0.5) {
        // sparse warm windows, a few cool ones; cells big enough not to shimmer
        vec2 cell = floor(vec2(lu * 460.0, lv * 170.0));
        float h = hash21(cell + seg * 17.0);
        float lit = step(0.9, h) * step(0.03, lv) * step(lv, 0.44) * step(0.75, land.a);
        lc += lit * mix(vec3(1.0, 0.68, 0.32), vec3(0.55, 0.75, 1.0), step(0.975, h)) * 0.75;
      }
      col = mix(col, lc, land.a);
    }
  }

  col *= uGain;
  // HDR sun core and halo so the bloom pass turns it into rays
  if (el > -0.03) {
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunGlow * (pow(s, 2400.0) * 12.0 + pow(s, 90.0) * 0.35);
  }
  if (mirrored > 0.5) col *= vec3(0.82, 0.84, 0.88);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const loader = new THREE.TextureLoader();
const cache = new Map();

function loadTexture(file) {
  if (!cache.has(file)) {
    cache.set(file, new Promise((resolve, reject) => {
      loader.load(file, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.anisotropy = 4;
        resolve(t);
      }, undefined, (e) => { cache.delete(file); reject(e); });
    }));
  }
  return cache.get(file);
}

const EMPTY = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
EMPTY.needsUpdate = true;

export class SkyDome {
  constructor() {
    this.uniforms = {
      uSky: { value: EMPTY }, uHorizon: { value: 0.53 }, uOffset: { value: 0 }, uLift: { value: 0 }, uGain: { value: 1 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunGlow: { value: new THREE.Color(0, 0, 0) },
      uLand: { value: EMPTY }, uLandOn: { value: 0 }, uCopies: { value: 4 }, uBase: { value: 0 }, uHeight: { value: 0.5 },
      uLandLight: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color(0.7, 0.8, 0.9) }, uHazeAmt: { value: 0.3 },
      uWater: { value: 0 }, uWindows: { value: 0 }, uGround: { value: new THREE.Color(0.2, 0.25, 0.2) }, uMirror: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
    // centred on whatever camera draws it (the race camera, the editor, the cube bake)
    this.mesh.onBeforeRender = (r, s, cam) => { this.mesh.position.copy(cam.position); this.mesh.updateMatrixWorld(); };
  }

  preload(sky, land) {
    return Promise.all([loadTexture(SKIES[sky].file), land && LANDS[land] ? loadTexture(LANDS[land].file) : null]);
  }

  // time of day preset P (see ENV_PRESETS) and landscape id; resolves when textures are in.
  // mirror: the lower half of the sky reflects the upper half (mirror world theme)
  async set(P, landId, { mirror = false } = {}) {
    const S = SKIES[P.sky];
    const L = LANDS[landId] || null;
    const [skyTex, landTex] = await this.preload(P.sky, landId);
    const U = this.uniforms;
    U.uSky.value = skyTex;
    U.uHorizon.value = S.horizon;
    // put the sun of the picture at the preset's world azimuth
    const az = THREE.MathUtils.degToRad(P.sunAz);
    U.uOffset.value = S.sun[0] - az / (2 * Math.PI);
    U.uLift.value = THREE.MathUtils.degToRad(P.skyLift || 0);
    this.sunElevation = (Math.PI / 2) * (S.horizon - S.sun[1]) / S.horizon + U.uLift.value;
    this.sunAzimuth = az;
    U.uSunDir.value.set(Math.sin(az) * Math.cos(this.sunElevation), Math.sin(this.sunElevation), -Math.cos(az) * Math.cos(this.sunElevation));
    U.uGain.value = P.skyGain;
    U.uSunGlow.value.set(P.sunGlow);
    U.uHaze.value.fromArray(P.haze);
    U.uHazeAmt.value = P.hazeAmt;
    U.uLandLight.value.set(P.landLight);
    U.uGround.value.set(P.groundHaze);
    U.uLandOn.value = L ? 1 : 0;
    U.uMirror.value = mirror ? 1 : 0;
    if (L) {
      U.uLand.value = landTex;
      U.uCopies.value = L.copies;
      U.uBase.value = THREE.MathUtils.degToRad(L.base);
      U.uHeight.value = (2 * Math.PI / L.copies) / L.aspect;
      U.uWater.value = L.water ? 1 : 0;
      U.uWindows.value = L.windows && P.night ? 1 : 0;
    } else {
      U.uWater.value = 0;
      U.uWindows.value = 0;
    }
  }
}
