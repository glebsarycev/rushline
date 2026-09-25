// Hangar interiors: a shader patch for the standard materials. Inside a hangar
// box the sun and sky light fade to a dim level and the hangar lamps nearest to
// the camera add warm pools of light. No real lights are added, so it stays cheap
// however many lamps a track has.

import * as THREE from 'three';

const MAX_BOX = 8;
const MAX_LAMPS = 24;

const FRAG_HEAD = /* glsl */`
#define INDOOR_MAX_BOX ${MAX_BOX}
#define INDOOR_MAX_LAMPS ${MAX_LAMPS}
uniform vec3 uIndoorMin[ INDOOR_MAX_BOX ];
uniform vec3 uIndoorMax[ INDOOR_MAX_BOX ];
uniform int uIndoorCount;
uniform vec3 uLampPos[ INDOOR_MAX_LAMPS ];
uniform int uLampCount;
uniform vec3 uLampColor;
uniform float uLampRange;
uniform vec2 uIndoorDim;
varying vec3 vIndoorPos;
// 1 inside a hangar, 0 outside; the edge sits on the wall centre so the inner
// face is dark and the outer face lit
float indoorFactor( vec3 p ) {
  float f = 0.0;
  for ( int i = 0; i < INDOOR_MAX_BOX; i ++ ) {
    if ( i >= uIndoorCount ) break;
    vec3 a = smoothstep( uIndoorMin[ i ] - 0.4, uIndoorMin[ i ] + 0.4, p );
    vec3 b = 1.0 - smoothstep( uIndoorMax[ i ] - 0.4, uIndoorMax[ i ] + 0.4, p );
    f = max( f, a.x * a.y * a.z * b.x * b.y * b.z );
  }
  return f;
}
`;

const FRAG_APPLY = /* glsl */`
{
  float indoor = indoorFactor( vIndoorPos );
  if ( indoor > 0.0 ) {
    float dimDirect = mix( 1.0, uIndoorDim.x, indoor );
    float dimAmbient = mix( 1.0, uIndoorDim.y, indoor );
    reflectedLight.directDiffuse *= dimDirect;
    reflectedLight.directSpecular *= dimDirect;
    reflectedLight.indirectDiffuse *= dimAmbient;
    reflectedLight.indirectSpecular *= dimAmbient;
    vec3 wN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    vec3 lamp = vec3( 0.0 );
    for ( int i = 0; i < INDOOR_MAX_LAMPS; i ++ ) {
      if ( i >= uLampCount ) break;
      vec3 L = uLampPos[ i ] - vIndoorPos;
      float d = max( length( L ), 0.001 );
      float att = clamp( 1.0 - d / uLampRange, 0.0, 1.0 );
      lamp += att * att * max( dot( wN, L / d ), 0.0 );
    }
    reflectedLight.directDiffuse += indoor * lamp * uLampColor * ( material.diffuseContribution + 0.25 * material.specularColorBlended );
  }
}
`;

const VERT_APPLY = /* glsl */`
#include <project_vertex>
vec4 indoorP = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  indoorP = batchingMatrix * indoorP;
#endif
#ifdef USE_INSTANCING
  indoorP = instanceMatrix * indoorP;
#endif
vIndoorPos = ( modelMatrix * indoorP ).xyz;
`;

export class IndoorLighting {
  constructor() {
    const vecs = (n) => Array.from({ length: n }, () => new THREE.Vector3());
    this.uniforms = {
      uIndoorMin: { value: vecs(MAX_BOX) },
      uIndoorMax: { value: vecs(MAX_BOX) },
      uIndoorCount: { value: 0 },
      uLampPos: { value: vecs(MAX_LAMPS) },
      uLampCount: { value: 0 },
      uLampColor: { value: new THREE.Color(0xffc68a).multiplyScalar(7) },
      uLampRange: { value: 32 },
      uIndoorDim: { value: new THREE.Vector2(0.03, 0.12) },
    };
    this.boxes = [];
    this.lamps = [];
    this.enabled = true;
    this._order = [];
  }

  // hangar boxes and lamps of a built track (track.scenery.indoor)
  setTrack(track) {
    const list = (track && track.scenery ? track.scenery.indoor : []).slice(0, MAX_BOX);
    this.boxes = list;
    list.forEach((h, i) => {
      this.uniforms.uIndoorMin.value[i].set(h.min[0], -50, h.min[2]);
      this.uniforms.uIndoorMax.value[i].set(h.max[0], h.max[1] + 0.4, h.max[2]);
    });
    this.lamps = list.flatMap((h) => h.lamps.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    this._order = this.lamps.map((_, i) => i);
    this._apply();
  }

  clear() { this.setTrack(null); }

  setEnabled(on) {
    this.enabled = on;
    this._apply();
  }

  _apply() {
    this.uniforms.uIndoorCount.value = this.enabled ? this.boxes.length : 0;
    if (!this.enabled || this.lamps.length > MAX_LAMPS) this.uniforms.uLampCount.value = 0;
    if (this.enabled && this.lamps.length <= MAX_LAMPS) {
      this.lamps.forEach((p, i) => this.uniforms.uLampPos.value[i].copy(p));
      this.uniforms.uLampCount.value = this.lamps.length;
    }
  }

  // with more lamps than slots, light the ones nearest the camera
  update(camera) {
    if (!this.enabled || this.lamps.length <= MAX_LAMPS) return;
    const c = camera.position;
    const L = this.lamps;
    this._order.sort((a, b) => L[a].distanceToSquared(c) - L[b].distanceToSquared(c));
    for (let i = 0; i < MAX_LAMPS; i++) this.uniforms.uLampPos.value[i].copy(L[this._order[i]]);
    this.uniforms.uLampCount.value = MAX_LAMPS;
  }

  patch(material) {
    if (!material || !material.isMeshStandardMaterial || material.userData.indoor) return;
    material.userData.indoor = true;
    const U = this.uniforms;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIndoorPos;')
        .replace('#include <project_vertex>', VERT_APPLY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_APPLY);
    };
    const key = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => key() + '|indoor';
    material.needsUpdate = true;
  }

  patchObject(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.patch(m);
    });
  }
}
