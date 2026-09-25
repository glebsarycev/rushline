// Loads the player car model (glTF binary built by tools/car/build-car.mjs).
// The model uses the game's conventions: metres, +Y up, forward -Z, origin on
// the ground below the centre of mass. Node names the game relies on:
//   wheel_fl / wheel_fr / wheel_rl / wheel_rr   steering + suspension pivots
//   wheel_<id>_spin                             rolling pivot inside each wheel
//   arm_<id>_upper / arm_<id>_lower             suspension rods (extras: anchor, hubOffset)
//   exhaust_l / exhaust_r, headlight_anchor     effect attachment points

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The game loads the .glb.js twin: the same GLB bytes as a base64 ES module, parsed
// in memory. Pages with a strict Content-Security-Policy (the published artifact)
// block the data:/blob: fetches GLTFLoader makes for a .glb or embedded glTF, but
// they always allow the game's own scripts. A plain .glb URL still works (preview).
export const CAR_MODEL_URLS = ['assets/models/rushline-racer.glb.js'];
const WHEEL_IDS = ['fl', 'fr', 'rl', 'rr'];

const cache = new Map();

export async function loadCarAsset(urls = CAR_MODEL_URLS, opts = {}) {
  let last;
  for (const url of Array.isArray(urls) ? urls : [urls]) {
    try {
      return await loadOne(url, opts);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

function loadOne(url, { timeout = 20000 } = {}) {
  if (cache.has(url)) return cache.get(url);
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${url}`)), timeout);
    const done = (gltf) => {
      clearTimeout(timer);
      try { resolve(prepare(gltf)); } catch (err) { reject(err); }
    };
    const fail = (err) => { clearTimeout(timer); reject(err); };
    const loader = new GLTFLoader().register((parser) => new InMemoryImages(parser));
    if (url.endsWith('.js')) {
      import(new URL(url, document.baseURI).href)
        .then((mod) => loader.parse(base64ToBuffer(mod.default), '', done, fail))
        .catch(fail);
    } else {
      loader.load(url, done, undefined, fail);
    }
  });
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
}

function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// GLTFLoader decodes embedded images by fetching a blob: URL, which a strict CSP
// blocks (the textures silently go missing). Decode them straight from the bytes.
const FILTERS = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter };
const WRAPS = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping };

class InMemoryImages {
  constructor(parser) {
    this.parser = parser;
    this.name = 'rushline_in_memory_images';
  }

  loadTexture(textureIndex) {
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];
    const sourceDef = json.images[textureDef.source];
    if (sourceDef.bufferView === undefined || typeof createImageBitmap === 'undefined') return null;
    return parser.getDependency('bufferView', sourceDef.bufferView)
      .then((view) => createImageBitmap(new Blob([view], { type: sourceDef.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((bitmap) => {
        const texture = new THREE.Texture(bitmap);
        const sampler = (json.samplers || [])[textureDef.sampler] || {};
        texture.name = textureDef.name || sourceDef.name || '';
        texture.flipY = false;
        texture.magFilter = FILTERS[sampler.magFilter] || THREE.LinearFilter;
        texture.minFilter = FILTERS[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
        texture.wrapS = WRAPS[sampler.wrapS] || THREE.RepeatWrapping;
        texture.wrapT = WRAPS[sampler.wrapT] || THREE.RepeatWrapping;
        texture.generateMipmaps = texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter;
        texture.userData.mimeType = sourceDef.mimeType;
        texture.needsUpdate = true;
        parser.associations.set(texture, { textures: textureIndex });
        return texture;
      })
      // e.g. an old browser without createImageBitmap options: use GLTFLoader's own path
      .catch(() => parser.loadTextureImage(textureIndex, textureDef.source, parser.textureLoader));
  }
}

function prepare(gltf) {
  const scene = gltf.scene;
  const root = scene.getObjectByName('RushlineRacer') || scene;
  for (const id of WHEEL_IDS) {
    if (!scene.getObjectByName(`wheel_${id}`) || !scene.getObjectByName(`wheel_${id}_spin`)) {
      throw new Error(`Car model is missing the wheel_${id} nodes`);
    }
  }
  const x = root.userData || {};
  return {
    scene,
    comHeight: x.comHeight ?? 0.7655,
    restSuspension: x.restSuspension ?? 0.2955,
    wheelRadius: x.wheelRadius ?? 0.42,
  };
}
