// Direction signs on the outer border before sharp corners, U-turns and drops, facing
// the driver (black with a white arrow, or in the theme's colour).

import * as THREE from 'three';
import { ROAD_HALF, WALL_T, WALL_H, TECH, DECK } from '../config.js';
import { arrowSign } from './textures.js';

// where the border of each cross-section is: [distance from the centreline, height]
const BORDER = {
  road: [ROAD_HALF + WALL_T / 2, WALL_H], tech: [ROAD_HALF + TECH.bump / 2, TECH.bumpH],
  deck: [DECK.half + DECK.lip / 2, DECK.lipH],
};
const texCache = new Map();

export function buildSigns(track, bg = '#15181d') {
  const g = new THREE.Group();
  g.name = 'signs';
  const route = track.route;
  if (!route) return g;
  const pts = route.pts;
  const tex = (kind) => {
    const k = kind + bg;
    if (!texCache.has(k)) texCache.set(k, arrowSign(kind, bg));
    return texCache.get(k);
  };
  const back = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.6 });
  const mats = new Map();
  const face = (kind) => {
    if (!mats.has(kind)) mats.set(kind, new THREE.MeshStandardMaterial({ map: tex(kind), emissive: 0xffffff, emissiveMap: tex(kind), emissiveIntensity: 0.35, roughness: 0.5 }));
    return mats.get(kind);
  };
  const plane = new THREE.PlaneGeometry(5.2, 3.9);
  const post = new THREE.CylinderGeometry(0.16, 0.16, 1, 8);

  // one sign at route index i, on the side `side` (+1 right, -1 left)
  const place = (i, side, kind) => {
    const q = pts[i];
    const def = q.block && q.block.def;
    const [off, h] = BORDER[def && def.profile] || BORDER.road;
    const f = new THREE.Vector3(q.f[0], 0, q.f[2]).normalize();
    const r = new THREE.Vector3(q.r[0], q.r[1], q.r[2]);
    const base = new THREE.Vector3(q.p[0], q.p[1], q.p[2]).addScaledVector(r, side * off).add(new THREE.Vector3(0, h, 0));
    const s = new THREE.Group();
    const stick = new THREE.Mesh(post, pole);
    stick.scale.y = 3.6; stick.position.y = 1.8;
    s.add(stick);
    const panel = new THREE.Mesh(plane, face(kind));
    panel.position.y = 3.6 + 1.95;
    s.add(panel);
    const rear = new THREE.Mesh(plane, back);
    rear.position.set(0, 3.6 + 1.95, -0.06); rear.rotation.y = Math.PI;
    s.add(rear);
    s.position.copy(base);
    // face the oncoming car, turned a little towards the road
    s.rotation.y = Math.atan2(-f.x, -f.z) + side * 0.35;
    s.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(s);
  };

  // corners: runs of curvature (radius under ~130 m), skipping stunt pieces
  const sharp = (i) => {
    const c = pts[i].block && pts[i].block.def.cat;
    return !pts[i].air && !pts[i].nearAir && c !== 'stunt' && c !== 'pipe' && Math.abs(pts[i].k || 0) > 1 / 130;
  };
  let i = 0, lastSign = -1e9;
  while (i < pts.length) {
    if (!sharp(i)) { i++; continue; }
    const dir = Math.sign(pts[i].k);
    let j = i, turn = 0;
    // follow the corner, bridging short straights between two turns the same way
    while (j < pts.length - 1) {
      if (sharp(j) && Math.sign(pts[j].k) === dir) { turn += (pts[j].k || 0) * (pts[j + 1].s - pts[j].s); j++; continue; }
      let k = j;
      while (k < pts.length - 1 && k - j < 12 && !(sharp(k) && Math.sign(pts[k].k) === dir)) k++;
      if (k - j < 12 && sharp(k)) { j = k; continue; }
      break;
    }
    const deg = Math.abs(turn) * 180 / Math.PI;
    const at = Math.max(0, i - 10); // ~20 m before the corner
    if (deg > 70 && pts[at].s - lastSign > 60) {
      place(at, -dir, deg > 150 ? (dir > 0 ? 'uright' : 'uleft') : dir > 0 ? 'right' : 'left');
      lastSign = pts[at].s;
    }
    i = j + 1;
  }
  // drops: the road ahead falls away steeply after a flat stretch
  for (let n = 20; n < pts.length - 20; n++) {
    const a = pts[n], b = pts[n + 15];
    if (a.air || b.air || a.nearAir) continue;
    const grade = (b.p[1] - a.p[1]) / Math.max(1, b.s - a.s);
    if (grade < -0.2 && a.s - lastSign > 80) {
      place(n, 1, 'down');
      lastSign = a.s;
      n += 20;
    }
  }
  return g;
}
