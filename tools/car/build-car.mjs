// Builds the player car as a glTF binary: assets/models/rushline-racer.glb
//   node --import ./tests/hooks.mjs tools/car/build-car.mjs [--json out.gltf.json]
//
// The design follows the Higgsfield concept art in assets/concept/ (original design).
// Dimensions come from the physics car (src/physics/vehicle.js) so wheels, ride
// height and body match the simulation exactly.
//
// Model conventions (match the game, see extras on the root node):
//   units metres, +Y up, forward = -Z, right = +X
//   origin on the ground directly below the physics centre of mass

import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFBuilder, encodePNG } from './gltf.mjs';
import { CAR } from '../../src/physics/vehicle.js';

const OUT = new URL('../../assets/models/rushline-racer.glb', import.meta.url);

// ---- dimensions from physics ------------------------------------------------------------------
const GRAV = 9.81;
const STATIC_COMP = (CAR.mass * GRAV) / (4 * CAR.springK);
const REST_LEN = CAR.suspRest - STATIC_COMP;                      // suspension length at rest
const COM_H = -(CAR.wheels[0].y - REST_LEN) + CAR.wheelRadius;     // centre of mass above ground
const WR = CAR.wheelRadius;                                        // wheel centre height = tyre radius
const WHEELS = [
  { id: 'fl', ...CAR.wheels[0], width: 0.34 },
  { id: 'fr', ...CAR.wheels[1], width: 0.34 },
  { id: 'rl', ...CAR.wheels[2], width: 0.40 },
  { id: 'rr', ...CAR.wheels[3], width: 0.40 },
];
const FRONT_Z = CAR.wheels[0].z, REAR_Z = CAR.wheels[2].z;
const FRONT_X = Math.abs(CAR.wheels[0].x), REAR_X = Math.abs(CAR.wheels[2].x);

// ---- small helpers -------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;

function toGeo(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return fixNormals(g);
}

// vertices that only touch zero-area triangles end up with a zero normal:
// point them away from the part's centre instead (glTF requires unit normals)
function fixNormals(g) {
  const n = g.attributes.normal, p = g.attributes.position;
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(V());
  const v = V();
  for (let i = 0; i < n.count; i++) {
    if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > 1e-6) continue;
    v.set(p.getX(i) - c.x, p.getY(i) - c.y, p.getZ(i) - c.z);
    if (v.lengthSq() < 1e-12) v.set(0, 1, 0);
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}

// flat shading: unshare vertices so each face keeps its own normal
function flat(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.computeVertexNormals();
  const idx = [];
  for (let i = 0; i < n.attributes.position.count; i++) idx.push(i);
  n.setIndex(idx);
  return fixNormals(n);
}

// Orient every triangle so it faces away from `centerOf(triangleCentroid)`.
function orientFaces(g, centerOf) {
  const p = g.attributes.position.array, idx = g.index.array;
  const a = V(), b = V(), c = V(), n = V(), m = V(), e1 = V(), e2 = V();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(p, idx[t] * 3); b.fromArray(p, idx[t + 1] * 3); c.fromArray(p, idx[t + 2] * 3);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    m.copy(a).add(b).add(c).divideScalar(3);
    if (n.dot(m.clone().sub(centerOf(m))) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  g.computeVertexNormals();
  return fixNormals(g);
}

// Skin a list of rings (arrays of Vector3 with equal length). Faces are oriented
// away from the local ring centre, so closed sections always face outwards.
// Returns { [material]: geometry } when `zone(k)` maps ring segments to materials.
function skin(rings, { closed = true, uvScale = 1, zone = null, center = null, capStart = null, capEnd = null } = {}) {
  const N = rings[0].length, M = rings.length;
  const cols = closed ? N + 1 : N;
  const cent = rings.map((r) => r.reduce((s, q) => s.add(q), V()).divideScalar(r.length));
  const along = [0];
  for (let i = 1; i < M; i++) along.push(along[i - 1] + cent[i].distanceTo(cent[i - 1]));
  const pos = [], uv = [];
  for (let i = 0; i < M; i++) {
    let u = 0;
    for (let k = 0; k < cols; k++) {
      const q = rings[i][k % N];
      if (k > 0) u += q.distanceTo(rings[i][(k - 1) % N]);
      pos.push(q.x, q.y, q.z);
      uv.push(u * uvScale, along[i] * uvScale);
    }
  }
  const groups = new Map();
  for (let i = 0; i < M - 1; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const mat = zone ? zone(k % N, i) : 'default';
      if (!groups.has(mat)) groups.set(mat, []);
      const a = i * cols + k, b = a + 1, c = (i + 1) * cols + k + 1, d = (i + 1) * cols + k;
      groups.get(mat).push(a, b, c, a, c, d);
    }
  }
  // local centre for orientation: nearest ring centre (or a custom function)
  const ringOf = (m) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < M; i++) { const d = cent[i].distanceToSquared(m); if (d < bd) { bd = d; bi = i; } }
    return cent[bi];
  };
  const out = {};
  // shared normals across material zones: build one geometry, then split indices
  const all = [];
  for (const list of groups.values()) all.push(...list);
  const full = orientFaces(toGeo(pos, uv, all), center || ringOf);
  const oriented = full.index.array;
  let o = 0;
  for (const [mat, list] of groups) {
    const g = full.clone();
    g.setIndex(Array.from(oriented.slice(o, o + list.length)));
    o += list.length;
    out[mat] = compact(g);
  }
  if (capStart) out[capStart.mat] = merge([out[capStart.mat], fanCap(rings[0], cent[0], cent[1])].filter(Boolean));
  if (capEnd) out[capEnd.mat] = merge([out[capEnd.mat], fanCap(rings[M - 1], cent[M - 1], cent[M - 2])].filter(Boolean));
  return zone || capStart || capEnd ? out : out.default;
}

function fanCap(ring, c, inner) {
  const pos = [c.x, c.y, c.z], uv = [0, 0], idx = [];
  for (const q of ring) { pos.push(q.x, q.y, q.z); uv.push((q.x - c.x) * 2, (q.y - c.y) * 2); }
  for (let k = 0; k < ring.length; k++) idx.push(0, 1 + k, 1 + ((k + 1) % ring.length));
  const g = toGeo(pos, uv, idx);
  const outward = c.clone().sub(inner).normalize();
  return flat(orientFaces(g, (m) => m.clone().sub(outward)));
}

// drop unused vertices after an index split
function compact(g) {
  const idx = g.index.array, map = new Map();
  const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
  const pos = [], nrm = [], uv = [], out = [];
  for (const i of idx) {
    let j = map.get(i);
    if (j === undefined) {
      j = map.size; map.set(i, j);
      pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      uv.push(U[i * 2], U[i * 2 + 1]);
    }
    out.push(j);
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  r.setIndex(out);
  return r;
}

function merge(geos) {
  geos = geos.filter(Boolean);
  if (geos.length === 1) return geos[0];
  let nv = 0;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let g of geos) {
    if (!g.index) g = flat(g);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + nv);
    nv += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  r.setIndex(idx);
  return r;
}

// mirror across x = 0 (keeps faces front-facing)
function mirrorX(g) {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const idx = m.index.array;
  for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  m.index.needsUpdate = true;
  return m;
}

const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1)));
  return g;
};

// box with metre-based UVs and flat normals
function box(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u, v);
  }
  return g;
}

// thin plate: polygon in the (z, y) plane extruded along x by `thick`
function plateZY(points, thick) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  // shape x -> world z, shape y -> world y, extrusion z -> world x
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -thick / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return flat(flipWinding(g));
}

// plate in the (x, z) plane extruded along y
function plateXZ(points, thick) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return flat(flipWinding(g));
}

// the plate transforms above mirror the extrusion, which reverses triangle winding
function flipWinding(g) {
  const n = g.index ? g.toNonIndexed() : g;
  const p = n.attributes.position, uv = n.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, uv]) {
      if (!a) continue;
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
  return n;
}

// superellipse section: starts at the bottom centre, runs up the right side (+x)
function superRing(cx, cy, z, w, hTop, hBot, nTop = 2.4, nBot = 3.2, N = 32) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const n = sa >= 0 ? nTop : nBot;
    out.push(V(cx + w * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n), cy + (sa >= 0 ? hTop : hBot) * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n), z));
  }
  return out;
}

// Catmull-Rom interpolation of numeric station tables
function stations(table, steps) {
  const keys = Object.keys(table[0]);
  const out = [];
  for (let s = 0; s < table.length - 1; s++) {
    const p0 = table[Math.max(0, s - 1)], p1 = table[s], p2 = table[s + 1], p3 = table[Math.min(table.length - 1, s + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const o = {};
      for (const key of keys) {
        o[key] = 0.5 * ((2 * p1[key]) + (-p0[key] + p2[key]) * t + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * t2 + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * t3);
      }
      out.push(o);
    }
  }
  out.push({ ...table[table.length - 1] });
  return out;
}

// airfoil outline (closed, convex) in chord units: [u along chord, t thickness]
function airfoil(n = 14, thick = 0.1, camber = 0.04) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = 0.5 - 0.5 * Math.cos((i / n) * Math.PI);
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = camber * 4 * x * (1 - x);
    top.push([x, yc + yt]);
    bot.push([x, yc - yt]);
  }
  return [...top, ...bot.reverse().slice(1, -1)];
}

// wing element: airfoil swept along x between x0 and x1, placed at leading edge (z, y)
function wing(x0, x1, chord, thick, camber, aoa, z, y) {
  const prof = airfoil(12, thick / chord, camber / chord);
  const c = Math.cos(aoa), s = Math.sin(aoa);
  const ring = (x) => prof.map(([u, t]) => {
    const dz = u * chord, dy = t * chord;
    return V(x, y + dy * c + dz * s, z + dz * c - dy * s);
  });
  return skin([ring(x0), ring(x1)], { uvScale: 1, capStart: { mat: 'default' }, capEnd: { mat: 'default' } }).default;
}

// revolve a profile [[r, x], ...] around the X axis (wheels): u around, v along the profile
function revolveX(profile, segs, arc = Math.PI * 2, arcStart = 0, uRepeat = 1) {
  const len = [0];
  for (let i = 1; i < profile.length; i++) len.push(len[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = len[len.length - 1] || 1;
  const pos = [], uv = [], idx = [];
  const full = Math.abs(arc - Math.PI * 2) < 1e-6;
  const cols = segs + 1;
  for (let i = 0; i < profile.length; i++) {
    const [r, x] = profile[i];
    for (let k = 0; k <= segs; k++) {
      const a = arcStart + (k / segs) * arc;
      pos.push(x, r * Math.cos(a), r * Math.sin(a));
      uv.push((k / segs) * uRepeat, len[i] / total);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * cols + k, b = a + 1, c = (i + 1) * cols + k + 1, d = (i + 1) * cols + k;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = toGeo(pos, uv, idx);
  void full;
  return g;
}

// ---- procedural textures -----------------------------------------------------------------------
function makeTexture(w, h, fn) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = fn(x, y);
    const o = (y * w + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  }
  return encodePNG(w, h, data);
}

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, cell, s) {
  const x0 = Math.floor(x / cell), y0 = Math.floor(y / cell);
  const fx = x / cell - x0, fy = y / cell - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wrap = Math.round(256 / cell);
  const h = (a, b) => hash(((a % wrap) + wrap) % wrap, ((b % wrap) + wrap) % wrap, s);
  return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
}

// 2x2 twill carbon weave: 16 px tows, colour + roughness
function carbonAt(x, y) {
  const T = 16;
  const cx = Math.floor(x / T), cy = Math.floor(y / T);
  const horizontal = ((cx + cy) & 3) < 2;
  const f = horizontal ? (y % T) / T : (x % T) / T;
  const along = horizontal ? (x % T) / T : (y % T) / T;
  const tow = Math.sin(Math.PI * f);
  const sheen = horizontal ? 1 : 0.72;
  return { tow, sheen, along };
}
const carbonBase = () => makeTexture(256, 256, (x, y) => {
  const { tow, sheen } = carbonAt(x, y);
  const v = 16 + tow * 16 * sheen + hash(x, y, 3) * 3;
  return [v, v + 1, v + 3];
});
const carbonMR = () => makeTexture(256, 256, (x, y) => {
  const { tow } = carbonAt(x, y);
  return [0, Math.round((0.46 - tow * 0.2) * 255), Math.round(0.2 * 255)];
});
const paintMR = () => makeTexture(256, 256, (x, y) => {
  const n = valueNoise(x, y, 32, 7) * 0.6 + valueNoise(x, y, 8, 8) * 0.3 + hash(x, y, 9) * 0.1;
  return [0, Math.round((0.2 + n * 0.08) * 255), Math.round((0.28 + n * 0.1) * 255)];
});
// tyre: u = around the wheel, v = across the profile (0 inner bead .. 1 outer bead)
const tyreBase = () => makeTexture(256, 256, (x, y) => {
  const v = y / 255;
  let c = 20;
  const tread = v > 0.3 && v < 0.7;
  if (tread) {
    c = 24;
    for (const g of [0.38, 0.47, 0.53, 0.62]) if (Math.abs(v - g) < 0.008) c = 9;
  } else {
    c = 17;
    if (Math.abs(v - 0.14) < 0.012 || Math.abs(v - 0.86) < 0.012) c = 30;
  }
  c += hash(x, y, 11) * 5;
  return [c, c, c + 1];
});
const tyreMR = () => makeTexture(64, 256, (x, y) => {
  const v = y / 255;
  const tread = v > 0.3 && v < 0.7;
  return [0, Math.round((tread ? 0.72 : 0.9) * 255), 0];
});

// ---- the car ---------------------------------------------------------------------------------------
const chassis = new Map(); // material -> [geometries]
const add = (mat, g) => {
  if (!g) return;
  if (!chassis.has(mat)) chassis.set(mat, []);
  chassis.get(mat).push(g);
};
const addZones = (res) => { for (const [mat, g] of Object.entries(res)) add(mat, g); };

// Body: one lofted shell. Each section has a raised central spine (cockpit and
// engine cover) and, through the middle, wide shoulders that form the sidepods.
// Carbon underneath, black intake band on the sidepod flanks, paint elsewhere.
const BODY = [
  { z: -2.42, W: 0.10, ws: 0.10, yb: 0.26, hs: 0.31, hc: 0.36, r: 0.04 },
  { z: -2.18, W: 0.21, ws: 0.21, yb: 0.23, hs: 0.33, hc: 0.43, r: 0.06 },
  { z: -1.80, W: 0.30, ws: 0.30, yb: 0.21, hs: 0.38, hc: 0.51, r: 0.07 },
  { z: -1.40, W: 0.37, ws: 0.36, yb: 0.20, hs: 0.43, hc: 0.59, r: 0.08 },
  { z: -1.02, W: 0.46, ws: 0.41, yb: 0.19, hs: 0.47, hc: 0.66, r: 0.08 },
  { z: -0.72, W: 0.72, ws: 0.44, yb: 0.19, hs: 0.51, hc: 0.70, r: 0.09 },
  { z: -0.20, W: 0.80, ws: 0.46, yb: 0.19, hs: 0.55, hc: 0.73, r: 0.10 },
  { z: 0.40, W: 0.78, ws: 0.46, yb: 0.19, hs: 0.55, hc: 0.75, r: 0.10 },
  { z: 0.90, W: 0.64, ws: 0.42, yb: 0.20, hs: 0.54, hc: 0.74, r: 0.09 },
  { z: 1.30, W: 0.46, ws: 0.36, yb: 0.22, hs: 0.52, hc: 0.67, r: 0.08 },
  { z: 1.75, W: 0.34, ws: 0.30, yb: 0.25, hs: 0.50, hc: 0.59, r: 0.07 },
  { z: 2.12, W: 0.25, ws: 0.23, yb: 0.30, hs: 0.47, hc: 0.53, r: 0.05 },
];
const bodySt = stations(BODY, 5);
const topAt = (z) => {
  for (let i = 0; i < bodySt.length - 1; i++) {
    const a = bodySt[i], b = bodySt[i + 1];
    if (z >= a.z && z <= b.z) return lerp(a.hc, b.hc, (z - a.z) / (b.z - a.z));
  }
  return z < bodySt[0].z ? bodySt[0].hc : bodySt[bodySt.length - 1].hc;
};
const bodyAt = (z) => {
  for (let i = 0; i < bodySt.length - 1; i++) {
    const a = bodySt[i], b = bodySt[i + 1];
    if (z >= a.z && z <= b.z) { const t = (z - a.z) / (b.z - a.z); const o = {}; for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k], t); return o; }
  }
  return bodySt[z < 0 ? 0 : bodySt.length - 1];
};
// how far the side intake is sunk into the sidepod flank at z (0 = no intake)
function intakeDepth(z) {
  if (z < -1.0 || z > 0.62) return 0;
  if (z < -0.72) return 0.13 * ((z + 1.0) / 0.28);
  if (z < 0.05) return 0.13;
  return 0.13 * (1 - (z - 0.05) / 0.57);
}

function bodyHalf(s) {
  const { W, ws, yb, hs, hc, r } = s;
  const k = Math.max(0, Math.min(1, (W - ws) / 0.25));
  const rs = r * k;
  const d = intakeDepth(s.z) * k;
  return [
    [0, yb], [0.55 * W, yb], [W - r, yb + 0.01], [W - 0.29 * r, yb + 0.29 * r], [W - d * 0.4, yb + r],
    [W - d, (yb + hs) / 2], [W - d * 0.55, hs - rs - 0.02 * k], [W - 0.29 * rs, hs - 0.29 * rs], [W - rs, hs],
    [lerp(W - rs, ws, 0.6), hs + 0.012 * k], [ws + 0.02 * k, hs + 0.03 * k], [ws - 0.01 * (1 - k), lerp(hs, hc, 0.55)],
    [ws * 0.72, hc - 0.035], [ws * 0.38, hc - 0.008], [0, hc],
  ];
}
{
  const rings = bodySt.map((s) => {
    const h = bodyHalf(s);
    const right = h.map(([x, y]) => V(x, y, s.z));
    const left = h.slice(1, -1).reverse().map(([x, y]) => V(-x, y, s.z));
    return [...right, ...left];
  });
  const zRing = bodySt.map((s) => s.z);
  const zoneRight = (seg, z) => {
    if (seg <= 3) return 'Carbon';
    if (seg <= 5) return z > -0.98 && z < 0.62 ? 'Trim' : 'Paint';
    return 'Paint';
  };
  const zone = (seg, i) => {
    const z = (zRing[i] + zRing[i + 1]) / 2;
    return zoneRight(seg < 14 ? seg : 27 - seg, z);
  };
  addZones(skin(rings, { zone, capStart: { mat: 'Paint' }, capEnd: { mat: 'Carbon' } }));
}

// Cockpit canopy: open arcs sitting on the fuselage, dark smoked glass with a black frame
const CANOPY = [
  { z: -1.05, w: 0.10, h: 0.03 },
  { z: -0.80, w: 0.28, h: 0.20 },
  { z: -0.45, w: 0.36, h: 0.33 },
  { z: -0.05, w: 0.37, h: 0.37 },
  { z: 0.35, w: 0.31, h: 0.30 },
  { z: 0.75, w: 0.18, h: 0.16 },
  { z: 1.05, w: 0.06, h: 0.04 },
];
const canopySt = stations(CANOPY, 5);
{
  const N = 22;
  const rings = canopySt.map((s) => {
    const base = topAt(s.z) - 0.03;
    const ring = [];
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      ring.push(V(s.w * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / 2.2), base + s.h * Math.pow(sa, 2 / 2.2), s.z));
    }
    return ring;
  });
  const zone = (k) => (k <= 1 || k >= N - 2 ? 'Trim' : k === 10 || k === 11 ? 'Trim' : 'Glass');
  const res = skin(rings, { closed: false, uvScale: 1, zone, center: (m) => V(0, topAt(m.z) - 0.25, m.z) });
  addZones(res);
  // interior floor under the glass so the paint doesn't show through it
  const inner = canopySt.map((s) => {
    const base = topAt(s.z) - 0.035;
    const ring = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI;
      ring.push(V(s.w * 0.96 * Math.cos(a), base + 0.015 * Math.sin(a), s.z));
    }
    return ring;
  });
  add('Interior', skin(inner, { closed: false, center: (m) => V(0, m.y - 1, m.z) }));
}

// Driver: helmet, visor, head rest
{
  const helmet = new THREE.SphereGeometry(0.135, 20, 14);
  at(helmet, 0, topAt(-0.05) + 0.14, -0.08);
  add('Helmet', helmet);
  const visor = new THREE.SphereGeometry(0.139, 20, 8, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.38, Math.PI * 0.2);
  at(visor, 0, topAt(-0.05) + 0.14, -0.08);
  add('Trim', visor);
  add('Interior', at(box(0.22, 0.26, 0.08), 0, topAt(0.12) + 0.08, 0.12));
}

// Roof intake behind the canopy and a shark fin on the engine cover
{
  const rings = [];
  const S = [
    { z: 0.42, w: 0.03, h: 0.02 }, { z: 0.55, w: 0.09, h: 0.1 }, { z: 0.8, w: 0.1, h: 0.12 }, { z: 1.05, w: 0.08, h: 0.07 }, { z: 1.2, w: 0.03, h: 0.01 },
  ];
  for (const s of stations(S, 4)) rings.push(superRing(0, topAt(s.z) + 0.03 + s.h * 0.5, s.z, s.w, s.h * 0.55, s.h * 0.5, 2.6, 3, 16));
  addZones(skin(rings, { uvScale: 1, zone: () => 'Carbon', capStart: { mat: 'Trim' }, capEnd: { mat: 'Carbon' } }));
  add('Paint', plateZY([[1.05, topAt(1.05) - 0.02], [1.95, topAt(1.95) - 0.02], [1.92, topAt(1.9) + 0.05], [1.3, topAt(1.3) + 0.2], [1.1, topAt(1.1) + 0.12]], 0.022));
}

// Fender shells: swept over the wheel along an arc, thin closed section with a crown
function fender(wx, wz, width, R, phi0, phi1, segs, inset = 0.02) {
  const rings = [];
  const side = Math.sign(wx);
  const x0 = wx - side * (width * 0.52), x1 = wx + side * (width * 0.48);
  for (let i = 0; i <= segs; i++) {
    const phi = THREE.MathUtils.degToRad(lerp(phi0, phi1, i / segs));
    const dir = V(0, Math.sin(phi), -Math.cos(phi));
    const ring = [];
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = lerp(x0, x1, t), crown = Math.sin(Math.PI * t) * 0.035;
      ring.push(V(x, WR, wz).addScaledVector(dir, R + crown));
    }
    for (let k = n; k >= 0; k--) {
      const t = k / n, x = lerp(x0, x1, t), crown = Math.sin(Math.PI * t) * 0.02;
      ring.push(V(x, WR, wz).addScaledVector(dir, R - 0.035 + crown - inset * 0));
    }
    rings.push(ring);
  }
  return skin(rings, { uvScale: 1, capStart: { mat: 'default' }, capEnd: { mat: 'default' } }).default;
}

for (const w of WHEELS) {
  const front = w.z < 0;
  const side = Math.sign(w.x);
  const width = w.width + 0.16;
  add('Paint', front ? fender(w.x, w.z, width, 0.55, -24, 118, 26) : fender(w.x, w.z, width, 0.56, 24, 150, 24));
  const innerX = Math.abs(w.x) - width * 0.52;
  if (front) {
    // aero bridge from the nose to the pod, LED brow on the pod front, dive planes
    const nose = bodyAt(-1.8);
    add('Paint', wing(side > 0 ? nose.ws - 0.03 : -innerX - 0.02, side > 0 ? innerX + 0.02 : -(nose.ws - 0.03), 0.36, 0.04, 0.012, -0.12, -2.02, 0.6));
    const phi = THREE.MathUtils.degToRad(-8);
    const dir = V(0, Math.sin(phi), -Math.cos(phi));
    const p = V(w.x, WR, w.z).addScaledVector(dir, 0.587);
    add('HeadLight', at(box(width - 0.06, 0.02, 0.028), p.x, p.y, p.z, phi, 0, 0));
    const outer = Math.abs(w.x) + width * 0.48;
    for (const [dy, dz] of [[0.0, 0], [0.1, 0.07]]) {
      const pts = [[0, -0.2], [0.13, -0.04], [0.13, 0.05], [0, 0.1]].map(([x, z]) => [side * x, z]);
      add('Carbon', at(plateXZ(pts, 0.016), side * (outer - 0.02), 0.3 + dy, w.z - 0.46 + dz, 0, 0, -side * 0.22));
    }
  } else {
    // aerofoil buttress from the body shoulder up to the rear haunch
    const b = bodyAt(w.z - 0.15);
    const x0 = b.W - 0.06, y0 = b.hs - 0.03, x1 = innerX + 0.04, y1 = 0.86;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const foil = wing(0, len, 0.5, 0.045, 0.012, 0, -0.25, 0);
    foil.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(y1 - y0, x1 - x0)));
    add('Paint', at(side > 0 ? foil : mirrorX(foil), side * x0, y0, w.z - 0.15));
  }
}

// Front wing: main plane, split flap, endplates, nose pylons
add('Carbon', wing(-1.12, 1.12, 0.40, 0.035, 0.03, 0.10, -2.47, 0.12));
add('Carbon', wing(-1.1, -0.26, 0.2, 0.02, 0.02, 0.42, -2.13, 0.2));
add('Carbon', wing(0.26, 1.1, 0.2, 0.02, 0.02, 0.42, -2.13, 0.2));
for (const side of [1, -1]) {
  add('Carbon', at(plateZY([[-2.52, 0.05], [-1.94, 0.05], [-1.88, 0.3], [-2.05, 0.4], [-2.45, 0.31]], 0.022), side * 1.13, 0, 0));
  add('Carbon', at(plateZY([[-2.35, 0.14], [-2.08, 0.14], [-2.1, 0.27], [-2.3, 0.25]], 0.018), side * 0.15, 0, 0));
}
// nose LED strips along the nose flanks
for (const side of [1, -1]) {
  add('HeadLight', at(box(0.018, 0.02, 0.36), side * 0.265, 0.37, -1.98, 0, side * 0.2, 0));
}

// Floor plank and side skirts
add('Carbon', at(plateXZ([[-0.3, -1.95], [0.3, -1.95], [0.62, -1.55], [0.86, -1.0], [0.86, 1.0], [0.74, 1.32], [-0.74, 1.32], [-0.86, 1.0], [-0.86, -1.0], [-0.62, -1.55]], 0.025), 0, 0.18, 0));

// Diffuser with fins
{
  const ramp = [V(-0.72, 0.19, 1.22), V(0.72, 0.19, 1.22), V(0.72, 0.42, 2.22), V(-0.72, 0.42, 2.22)];
  const r0 = [ramp[0], ramp[1], ramp[1].clone().add(V(0, 0.02, 0)), ramp[0].clone().add(V(0, 0.02, 0))];
  const r1 = [ramp[3], ramp[2], ramp[2].clone().add(V(0, 0.02, 0)), ramp[3].clone().add(V(0, 0.02, 0))];
  add('Carbon', flat(skin([r0, r1], { uvScale: 1, capStart: { mat: 'default' }, capEnd: { mat: 'default' } }).default));
  for (const x of [-0.54, -0.27, 0, 0.27, 0.54]) add('Carbon', at(plateZY([[1.3, 0.2], [2.24, 0.43], [2.24, 0.17], [1.9, 0.17]], 0.016), x, 0, 0));
}

// Rear structure, tail light bar, rain light, exhausts
add('Carbon', at(box(1.24, 0.12, 0.12), 0, 0.5, 2.07));
add('TailLight', at(box(1.2, 0.034, 0.02), 0, 0.5, 2.135));
add('TailLight', at(box(0.1, 0.07, 0.02), 0, 0.3, 2.2));
for (const side of [1, -1]) {
  const pipe = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 16, 1, true);
  at(pipe, side * 0.11, 0.64, 2.02, Math.PI / 2, 0, 0);
  add('Metal', pipe);
  const inner = new THREE.CircleGeometry(0.04, 16);
  at(inner, side * 0.11, 0.64, 2.115);
  add('Trim', inner);
}

// Rear wing: main plane, flap, red endplates, swan-neck pylons
add('Carbon', wing(-1.0, 1.0, 0.46, 0.045, 0.05, 0.17, 1.94, 1.08));
add('Carbon', wing(-0.98, 0.98, 0.22, 0.022, 0.02, 0.56, 2.34, 1.19));
for (const side of [1, -1]) {
  add('Paint', at(plateZY([[1.9, 0.96], [2.52, 0.96], [2.58, 1.36], [2.26, 1.4], [1.98, 1.27]], 0.026), side * 1.02, 0, 0));
  // swan neck: offset band around a quadratic curve, hooking over the main plane
  const P0 = [1.42, topAt(1.42) - 0.02], P1 = [1.62, 1.42], P2 = [2.18, 1.34];
  const top = [], bot = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const z = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0];
    const y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1];
    const dz = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
    const dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const l = Math.hypot(dz, dy);
    const w = lerp(0.06, 0.035, t);
    top.push([z - (dy / l) * w, y + (dz / l) * w]);
    bot.push([z + (dy / l) * w, y - (dz / l) * w]);
  }
  bot.push([2.2, 1.17]);
  add('Carbon', at(plateZY([...top, [2.24, 1.3], ...bot.reverse()], 0.03), side * 0.3, 0, 0));
}

// Wing mirrors on stalks
for (const side of [1, -1]) {
  add('Carbon', at(box(0.03, 0.2, 0.03), side * 0.64, 0.64, -0.55, 0, 0, -side * 0.15));
  const housing = new THREE.SphereGeometry(1, 16, 10);
  housing.applyMatrix4(new THREE.Matrix4().makeScale(0.1, 0.048, 0.07));
  at(housing, side * 0.66, 0.76, -0.55);
  add('Paint', housing);
  add('Trim', at(box(0.14, 0.06, 0.004), side * 0.66, 0.76, -0.482));
}

// ---- wheels ----------------------------------------------------------------------------------------
function tyre(width) {
  const W = width, Rr = 0.305;
  const prof = [
    [Rr, -W / 2], [Rr + 0.03, -W / 2 - 0.004], [0.385, -W / 2], [0.408, -W / 2 + 0.018], [0.418, -W / 2 + 0.045],
    [WR, -W / 2 + 0.07], [WR, W / 2 - 0.07], [0.418, W / 2 - 0.045], [0.408, W / 2 - 0.018], [0.385, W / 2], [Rr + 0.03, W / 2 + 0.004], [Rr, W / 2],
  ];
  return orientFaces(revolveX(prof, 48, Math.PI * 2, 0, 6), (m) => V(m.x, 0, 0).setLength(0).add(V(0, m.y, m.z).setLength(0.36)));
}

function rim(width) {
  const W = width, out = W / 2;
  const parts = [];
  // barrel: faces the axle
  const barrel = revolveX([[0.3, -W / 2 + 0.012], [0.3, out - 0.012]], 40);
  parts.push(orientFaces(barrel, (m) => V(m.x, m.y, m.z).multiply(V(1, 2, 2))));
  // (the machined outer lip is built separately in rimLip)
  // ten dished spokes
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + (k % 2 ? 0.08 : -0.08);
    const r0 = 0.07, r1 = 0.296;
    const ring = (r, x, hw, d) => {
      const c = Math.cos(a), s = Math.sin(a), tc = -s, ts = c;
      const cy = r * c, cz = r * s;
      return [V(x, cy + tc * hw, cz + ts * hw), V(x, cy - tc * hw, cz - ts * hw), V(x - d, cy - tc * hw, cz - ts * hw), V(x - d, cy + tc * hw, cz + ts * hw)];
    };
    parts.push(flat(skin([ring(r0, out + 0.012, 0.02, 0.03), ring(r1, out - 0.02, 0.015, 0.024)], { capStart: { mat: 'default' }, capEnd: { mat: 'default' } }).default));
  }
  // hub
  const hub = new THREE.CylinderGeometry(0.075, 0.08, 0.06, 20);
  hub.rotateZ(Math.PI / 2);
  hub.translate(out - 0.01, 0, 0);
  parts.push(hub);
  return merge(parts);
}

function rimLip(width) {
  const out = width / 2;
  const lip = revolveX([[0.296, out - 0.02], [0.318, out - 0.012], [0.32, out + 0.004], [0.3, out + 0.01]], 48);
  return orientFaces(lip, (m) => V(out - 0.01, 0, 0).add(V(0, m.y, m.z).setLength(0.29)));
}

function centreLock(width) {
  const g = new THREE.CylinderGeometry(0.032, 0.038, 0.035, 6);
  g.rotateZ(Math.PI / 2);
  g.translate(width / 2 + 0.03, 0, 0);
  return g;
}

function disc() {
  const g = revolveX([[0.12, -0.02], [0.25, -0.02], [0.25, 0.012], [0.12, 0.012], [0.12, -0.02]], 32);
  return orientFaces(g, (m) => V(-0.004, 0, 0).add(V(0, m.y, m.z).setLength(0.185)));
}

function caliper() {
  // partial ring around the disc edge, at the rear-top
  const prof = [[0.19, -0.05], [0.275, -0.05], [0.275, 0.04], [0.19, 0.04], [0.19, -0.05]];
  const a0 = 0.24, span = 1.1;
  const g = revolveX(prof, 10, span, a0);
  const shell = orientFaces(g, (m) => V(-0.005, 0, 0).add(V(0, m.y, m.z).setLength(0.232)));
  // close the two ends
  const ends = [];
  for (const [a, into] of [[a0, a0 + 0.3], [a0 + span, a0 + span - 0.3]]) {
    const pts = prof.slice(0, 4).map(([r, x]) => V(x, r * Math.cos(a), r * Math.sin(a)));
    const c = pts.reduce((s, q) => s.add(q), V()).divideScalar(4);
    ends.push(fanCap(pts, c, V(-0.005, 0.232 * Math.cos(into), 0.232 * Math.sin(into))));
  }
  return merge([shell, ...ends]);
}

// ---- assemble glTF ------------------------------------------------------------------------------
const gb = new GLTFBuilder('Rushline car builder (tools/car/build-car.mjs)');
gb.addSampler();
const T = {
  carbon: gb.addTexture(carbonBase(), 'carbon_basecolor'),
  carbonMR: gb.addTexture(carbonMR(), 'carbon_roughness'),
  paintMR: gb.addTexture(paintMR(), 'paint_roughness'),
  tyre: gb.addTexture(tyreBase(), 'tyre_basecolor'),
  tyreMR: gb.addTexture(tyreMR(), 'tyre_roughness'),
};
const srgb = (hex, a = 1) => {
  const c = new THREE.Color(hex); // linear components
  return [c.r, c.g, c.b, a];
};
const MAT = {
  Paint: gb.addMaterial({ name: 'Paint', color: srgb(0xd9141f), metallic: 1, roughness: 1, metallicRoughnessTexture: T.paintMR, clearcoat: 1, clearcoatRoughness: 0.05 }),
  Carbon: gb.addMaterial({ name: 'Carbon', baseColorTexture: T.carbon, metallic: 1, roughness: 1, metallicRoughnessTexture: T.carbonMR, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
  Glass: gb.addMaterial({ name: 'Glass', color: srgb(0x0b1119, 0.78), metallic: 0.1, roughness: 0.04, alphaMode: 'BLEND' }),
  Trim: gb.addMaterial({ name: 'Trim', color: srgb(0x0c0e11), metallic: 0.2, roughness: 0.32 }),
  Interior: gb.addMaterial({ name: 'Interior', color: srgb(0x15181d), metallic: 0, roughness: 0.85 }),
  Helmet: gb.addMaterial({ name: 'Helmet', color: srgb(0xeceef1), metallic: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
  Metal: gb.addMaterial({ name: 'Metal', color: srgb(0xa9aeb6), metallic: 1, roughness: 0.22 }),
  HeadLight: gb.addMaterial({ name: 'HeadLight', color: srgb(0xffffff), emissive: [0.87, 0.95, 1.0], emissiveStrength: 6, metallic: 0, roughness: 0.2 }),
  TailLight: gb.addMaterial({ name: 'TailLight', color: srgb(0x2a0000), emissive: [1.0, 0.06, 0.05], emissiveStrength: 3, metallic: 0, roughness: 0.3 }),
  Tire: gb.addMaterial({ name: 'Tire', baseColorTexture: T.tyre, metallic: 0, roughness: 1, metallicRoughnessTexture: T.tyreMR }),
  Rim: gb.addMaterial({ name: 'Rim', color: srgb(0x30343b), metallic: 0.95, roughness: 0.28 }),
  BrakeDisc: gb.addMaterial({ name: 'BrakeDisc', color: srgb(0x5d6168), metallic: 0.85, roughness: 0.45 }),
  Caliper: gb.addMaterial({ name: 'Caliper', color: srgb(0xffb627), metallic: 0.3, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
};

const UV_DENSITY = { Carbon: 5, Paint: 1.2 }; // texture repeats per metre on chassis parts
const arrays = (g, mat, scaleUV = false) => {
  const m = g.index ? g : flat(g);
  if (!m.attributes.uv) m.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2));
  const uv = new Float32Array(m.attributes.uv.array);
  if (scaleUV && UV_DENSITY[mat]) for (let i = 0; i < uv.length; i++) uv[i] *= UV_DENSITY[mat];
  return {
    position: new Float32Array(m.attributes.position.array),
    normal: new Float32Array(m.attributes.normal.array),
    uv,
    index: Uint32Array.from(m.index.array),
    material: MAT[mat],
  };
};

const stats = {};
const count = (mat, g) => { stats[mat] = (stats[mat] || 0) + g.index.count / 3; };
const meshFrom = (name, byMat, scaleUV = false) => {
  const prims = [];
  for (const [mat, list] of byMat) {
    const g = merge(list);
    count(mat, g);
    prims.push(arrays(g, mat, scaleUV));
  }
  return gb.addMesh(name, prims);
};

const children = [];
children.push(gb.addNode({ name: 'body', mesh: meshFrom('body', chassis, true) }));

// wheel meshes: right-hand versions, mirrored for the left side
const wheelMesh = (width, left) => {
  const parts = [['Tire', tyre(width)], ['Rim', rim(width)], ['Metal', rimLip(width)], ['Caliper', centreLock(width)], ['BrakeDisc', disc()]];
  const byMat = new Map(parts.map(([m, g]) => [m, [left ? mirrorX(g) : g]]));
  return meshFrom(`wheel_${width < 0.37 ? 'front' : 'rear'}_${left ? 'L' : 'R'}`, byMat);
};
const caliperMesh = (left) => meshFrom(`caliper_${left ? 'L' : 'R'}`, new Map([['Caliper', [left ? mirrorX(caliper()) : caliper()]]]));
const meshes = {
  frontL: wheelMesh(0.34, true), frontR: wheelMesh(0.34, false),
  rearL: wheelMesh(0.40, true), rearR: wheelMesh(0.40, false),
  calL: caliperMesh(true), calR: caliperMesh(false),
};
for (const w of WHEELS) {
  const left = w.x < 0, front = w.z < 0;
  const spin = gb.addNode({ name: `wheel_${w.id}_spin`, mesh: meshes[(front ? 'front' : 'rear') + (left ? 'L' : 'R')] });
  const cal = gb.addNode({ name: `caliper_${w.id}`, mesh: meshes[left ? 'calL' : 'calR'] });
  children.push(gb.addNode({ name: `wheel_${w.id}`, translation: [w.x, WR, w.z], children: [spin, cal], extras: { wheel: w.id, front, restSuspension: REST_LEN } }));
}

// suspension arms: unit-length rods the game re-aims every frame (extras hold the endpoints)
const armMesh = (() => {
  const g = new THREE.CylinderGeometry(0.02, 0.02, 1, 8, 1);
  return meshFrom('suspension_arm', new Map([['Carbon', [g]]]));
})();
for (const w of WHEELS) {
  const side = Math.sign(w.x), front = w.z < 0;
  for (const [tag, ay, hy] of [['upper', 0.6, 0.1], ['lower', 0.3, -0.1]]) {
    const anchor = V(side * (front ? 0.3 : 0.45), ay, w.z);
    const hub = V(w.x - side * 0.14, WR + hy, w.z);
    const dir = hub.clone().sub(anchor);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    const mid = anchor.clone().add(hub).multiplyScalar(0.5);
    children.push(gb.addNode({
      name: `arm_${w.id}_${tag}`, mesh: armMesh,
      translation: mid.toArray(), rotation: [q.x, q.y, q.z, q.w], scale: [1, dir.length(), 1],
      extras: { anchor: anchor.toArray(), hubOffset: [-side * 0.14, hy, 0], wheel: w.id },
    }));
  }
}

// attachment points used by the game for effects and lights
children.push(gb.addNode({ name: 'exhaust_l', translation: [-0.11, 0.64, 2.14] }));
children.push(gb.addNode({ name: 'exhaust_r', translation: [0.11, 0.64, 2.14] }));
children.push(gb.addNode({ name: 'headlight_anchor', translation: [0, 0.42, -2.2] }));

const root = gb.addNode({
  name: 'RushlineRacer',
  children,
  extras: {
    forward: '-Z', up: '+Y', units: 'metres', origin: 'ground below centre of mass',
    comHeight: +COM_H.toFixed(4), wheelRadius: WR, restSuspension: +REST_LEN.toFixed(4),
    concept: 'assets/concept/concept-a.jpg, assets/concept/concept-b.jpg (Higgsfield, gpt_image_2_5)',
  },
});
gb.setRoots([root]);

// optional: --json <file> also writes a glTF JSON variant with embedded data
const jsonArg = process.argv.indexOf('--json');
if (jsonArg > 0 && process.argv[jsonArg + 1]) {
  fs.writeFileSync(process.argv[jsonArg + 1], gb.toEmbeddedJSON());
  console.log(`wrote ${process.argv[jsonArg + 1]}`);
}

const glb = gb.toGLB();
fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, glb);
const tris = Object.values(stats).reduce((a, b) => a + b, 0);
console.log(`wrote ${OUT.pathname} (${(glb.length / 1024).toFixed(1)} KB)`);
console.log(`triangles: ${tris}`, Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`COM height ${COM_H.toFixed(4)} m, rest suspension ${REST_LEN.toFixed(4)} m, wheels at y=${WR}`);
