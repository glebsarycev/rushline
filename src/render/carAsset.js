// Loads the player car model (glTF binary built by tools/car/build-car.mjs).
// The model uses the game's conventions: metres, +Y up, forward -Z, origin on
// the ground below the centre of mass. Node names the game relies on:
//   wheel_fl / wheel_fr / wheel_rl / wheel_rr   steering + suspension pivots
//   wheel_<id>_spin                             rolling pivot inside each wheel
//   arm_<id>_upper / arm_<id>_lower             suspension rods (extras: anchor, hubOffset)
//   exhaust_l / exhaust_r, headlight_anchor     effect attachment points

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The .glb is the asset; the .gltf.json twin (same model, embedded data) is only
// published where .glb files can't be served. The first one that loads wins.
export const CAR_MODEL_URLS = ['assets/models/rushline-racer.glb', 'assets/models/rushline-racer.gltf.json'];
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
    new GLTFLoader().load(
      url,
      (gltf) => {
        clearTimeout(timer);
        try { resolve(prepare(gltf)); } catch (err) { reject(err); }
      },
      undefined,
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
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
