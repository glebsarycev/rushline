// Low-poly trees and rocks (Higgsfield 3D models baked into assets/models/nature.js:
// simplified, one colour per face, unit height with the base at y = 0), drawn as
// instanced meshes so a hundred trees cost one draw call per kind.

import * as THREE from 'three';

let dataPromise = null;
const geos = new Map();

export function loadNature() {
  if (!dataPromise) dataPromise = import('../../assets/models/nature.js').then((m) => m.NATURE);
  return dataPromise;
}

function decode(b64, Type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Type(bytes.buffer);
}

// geometry of one kind ('autumn', 'green', 'cherry', 'pine', 'rock'), cached
export function natureGeometry(data, kind) {
  if (geos.has(kind)) return geos.get(kind);
  const d = data[kind];
  const q = decode(d.pos, Int16Array);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / 16000;
  const c8 = decode(d.col, Uint8Array);
  const col = new Float32Array(c8.length);
  // the baked colours are sRGB; vertex colours are linear
  for (let i = 0; i < c8.length; i++) {
    const c = c8[i] / 255;
    col[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geos.set(kind, g);
  return g;
}

let material = null;
export function natureMaterial() {
  if (!material) material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  return material;
}

// items: [{ x, y, z, s (height, m), rot (radians), sx (optional width factor) }]
export function natureInstances(data, kind, items) {
  const mesh = new THREE.InstancedMesh(natureGeometry(data, kind), natureMaterial(), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot || 0);
    p.set(it.x, it.y, it.z);
    s.set(it.s * (it.sx || 1), it.s, it.s * (it.sx || 1));
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.shared = true; // the geometry is cached, never disposed with the scene
  mesh.name = 'nature-' + kind;
  return mesh;
}
