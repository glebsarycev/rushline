// Builds Three.js meshes from track geometry data: one merged mesh per
// material for racing, and per-block meshes for the editor.

import * as THREE from 'three';
import { blockGeometry } from '../track/geometry.js';
import { blockXform } from '../track/track.js';

const NO_CAST = new Set(['lineCP', 'lineStart', 'checker', 'boostPad', 'superPad', 'surface_road', 'surface_dirt', 'surface_ice', 'surface_platform', 'curb', 'under', 'panelCP', 'panelStart', 'panelFinish']);

function append(acc, mats, b) {
  for (const key in mats) {
    const src = mats[key];
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { pos: [], nrm: [], uv: [] }));
    if (!b) {
      for (let i = 0; i < src.pos.length; i++) a.pos.push(src.pos[i]);
      for (let i = 0; i < src.nrm.length; i++) a.nrm.push(src.nrm[i]);
      for (let i = 0; i < src.uv.length; i++) a.uv.push(src.uv[i]);
      continue;
    }
    const { c, s, ox, oy, oz } = blockXform(b);
    const P = src.pos, N = src.nrm;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      a.pos.push(x * c + z * s + ox, y + oy, -x * s + z * c + oz);
      const nx = N[i], ny = N[i + 1], nz = N[i + 2];
      a.nrm.push(nx * c + nz * s, ny, -nx * s + nz * c);
    }
    for (let i = 0; i < src.uv.length; i++) a.uv.push(src.uv[i]);
  }
}

function toMeshes(acc, materials, group) {
  for (const [key, a] of acc) {
    if (!a.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, materials[key] || materials.side);
    mesh.name = key;
    mesh.castShadow = !NO_CAST.has(key);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// Whole track, merged by material.
export function buildTrackMesh(track, materials) {
  const acc = new Map();
  for (const b of track.blocks) {
    const g = blockGeometry(b.type, b.surf);
    append(acc, g.body.mats, b);
    for (let i = 0; i < 2; i++) if (!b.links || !b.links[i]) append(acc, g.caps[i].mats, b);
  }
  if (track.pillars) append(acc, track.pillars.mats, null);
  const group = new THREE.Group();
  group.name = 'track';
  return toMeshes(acc, materials, group);
}

// Single block in its local frame (editor). Geometry is cached per type/surface.
const blockCache = new Map();
export function buildBlockMesh(type, surf, materials) {
  const key = type + '|' + surf;
  let geos = blockCache.get(key);
  if (!geos) {
    const g = blockGeometry(type, surf);
    const acc = new Map();
    append(acc, g.body.mats, null);
    append(acc, g.caps[0].mats, null);
    append(acc, g.caps[1].mats, null);
    geos = [];
    for (const [k, a] of acc) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      geo.computeBoundingSphere();
      geos.push([k, geo]);
    }
    blockCache.set(key, geos);
  }
  const group = new THREE.Group();
  for (const [k, geo] of geos) {
    const mesh = new THREE.Mesh(geo, materials[k] || materials.side);
    mesh.castShadow = !NO_CAST.has(k);
    mesh.receiveShadow = true;
    mesh.userData.sharedGeometry = true;
    group.add(mesh);
  }
  return group;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
  });
}
