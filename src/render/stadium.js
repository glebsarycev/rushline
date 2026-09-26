// TM2020-style stadium bowl around the field: LED boards, three tiers of seats
// with a Higgsfield crowd picture, glowing LED ribbons between the tiers, a white
// roof canopy on steel trusses with a floodlight strip, and two giant screens.
// The cross-section (PROFILE) is swept along the rounded field outline.

import * as THREE from 'three';
import { GeoBuffer } from '../track/geometry.js';
import { outline } from '../track/stadiumShape.js';
import { buildBufferMesh } from './trackMesh.js';

// [d0, h0, d1, h1, material, facing [d, h], v repeat]; d = metres out from the field edge
const PROFILE = [
  [0, 0, 0, 2.4, 'board', [-1, 0], 1],
  [0, 2.4, 1.4, 2.4, 'standDark', [0, 1], 1],
  [1.4, 2.4, 1.4, 3.6, 'standWhite', [-1, 0], 1],
  [1.4, 3.6, 22, 13.6, 'crowd', [-0.45, 1], 1],
  [22, 13.6, 22, 16.6, 'standDark', [-1, 0], 1],
  [18.6, 16.6, 22, 16.6, 'standWhite', [0, -1], 1],
  [18.6, 16.6, 18.6, 19.2, 'ribbon', [-1, 0], 1],
  [18.6, 19.2, 38, 29.6, 'crowd', [-0.5, 1], 1],
  [38, 29.6, 38, 31.6, 'standDark', [-1, 0], 1],
  [35, 31.6, 38, 31.6, 'standWhite', [0, -1], 1],
  [35, 31.6, 35, 33.8, 'ribbon', [-1, 0], 1],
  [35, 33.8, 50, 41.6, 'crowd', [-0.5, 1], 1],
  [50, 41.6, 50, 43.6, 'standWhite', [-1, 0], 1],
  [50, 43.6, 53, 43.6, 'standWhite', [0, 1], 1],
  [53, 0, 53, 43.6, 'facade', [1, 0], 4],
  // roof canopy: top, underside, front edge and the floodlight strip
  [14, 49, 56, 52, 'roofTop', [-0.07, 1], 1],
  [14, 48.2, 56, 51.2, 'roofUnder', [0.07, -1], 1],
  [14, 48.2, 14, 49, 'standDark', [-1, 0], 1],
  [14.4, 48.1, 17.4, 47.4, 'flood', [-0.35, -1], 1],
];
const TILE_U = { crowd: 36, ribbon: 48, board: 48, facade: 16 };

function stadiumMaterials(T, crowd) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const ribbonTex = T.ribbon;
  return {
    standWhite: std({ color: 0xe9edf1, map: T.concrete, roughness: 0.78 }),
    standDark: std({ color: 0x2b3039, roughness: 0.7, metalness: 0.2 }),
    facade: std({ color: 0xdfe4ea, map: T.corrugated, roughness: 0.6, metalness: 0.2 }),
    crowd: std({ map: crowd, roughness: 0.95 }),
    ribbon: std({ color: 0x0a0d12, emissive: 0x3d8bff, emissiveMap: ribbonTex, emissiveIntensity: 1.8, roughness: 0.35 }),
    board: std({ color: 0x0a0d12, emissive: 0x3d8bff, emissiveMap: ribbonTex, emissiveIntensity: 1.8, roughness: 0.35 }),
    roofTop: std({ color: 0xf2f4f7, roughness: 0.55 }),
    roofUnder: std({ color: 0xd3d9e0, roughness: 0.8 }),
    flood: std({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 2 }),
    steel: std({ color: 0xbfc6ce, roughness: 0.45, metalness: 0.6 }),
    screenBig: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.screen, emissiveIntensity: 1.3, roughness: 0.3 }),
    side: std({ color: 0x2b3039 }),
  };
}

export class Stadium {
  constructor(T, crowdTex) {
    this.M = stadiumMaterials(T, crowdTex);
    this.ribbonTex = T.ribbon;
    this.group = null;
  }

  build(S) {
    const { pts, total } = outline(S, 6);
    const buf = new GeoBuffer();
    const N = pts.length;
    const at = (i, d, h) => { const q = pts[i % N]; return [q.p[0] + q.n[0] * d, h, q.p[1] + q.n[1] * d]; };
    const nrm = (i, f) => { const q = pts[i % N]; const v = [q.n[0] * f[0], f[1], q.n[1] * f[0]]; const l = Math.hypot(...v); return v.map((x) => x / l); };
    for (const [d0, h0, d1, h1, key, face, vRep] of PROFILE) {
      const tile = TILE_U[key] || 24;
      for (let i = 0; i < N; i++) {
        const u0 = pts[i].s / tile, u1 = (i + 1 < N ? pts[i + 1].s : total) / tile;
        const n0 = nrm(i, face), n1 = nrm(i + 1, face);
        buf.quad(key, at(i, d0, h0), at(i + 1, d0, h0), at(i + 1, d1, h1), at(i, d1, h1), n0, n1, n1, n0,
          [u0, 0], [u1, 0], [u1, vRep], [u0, vRep], null, n0);
      }
    }
    // roof trusses and back columns every ~30 m
    let next = 0;
    for (let i = 0; i < N; i++) {
      if (pts[i].s < next) continue;
      next = pts[i].s + 30;
      buf.beam('steel', at(i, 54.2, 0), at(i, 54.2, 51.6), 1.1);
      buf.beam('steel', at(i, 54, 50.6), at(i, 15, 47.9), 0.5);
      buf.beam('steel', at(i, 54, 46.8), at(i, 17, 46.9), 0.45);
      for (let k = 0; k < 8; k++) {
        const a = 54 - (k * 39) / 8, b = 54 - ((k + 1) * 39) / 8;
        const ya = 50.6 - (k * 2.7) / 8, yb = 50.6 - ((k + 1) * 2.7) / 8;
        buf.beam('steel', at(i, a, k & 1 ? ya : 46.8), at(i, b, k & 1 ? 46.85 : yb), 0.25);
      }
    }
    // two giant screens under the roof edge, in opposite corners, facing the field
    const cornerMid = (c) => {
      // middle of corner arc c: the sample whose normal points most diagonally
      let best = 0, bv = -1;
      const dir = [[1, -1], [1, 1], [-1, 1], [-1, -1]][c];
      for (let i = 0; i < N; i++) { const v = pts[i].n[0] * dir[0] + pts[i].n[1] * dir[1]; if (v > bv) { bv = v; best = i; } }
      return best;
    };
    for (const c of [0, 2]) {
      const i = cornerMid(c);
      const q = pts[i];
      const r = [-q.n[1], 0, q.n[0]];
      const C = at(i, 16, 37);
      const P = (u, v, off) => [C[0] + r[0] * u - q.n[0] * off, C[1] + v, C[2] + r[2] * u - q.n[1] * off];
      const w = 17, h = 9.5;
      buf.beam('standDark', P(-w - 0.8, 0, -0.9), P(w + 0.8, 0, -0.9), 1.6, 2 * h + 1.6);
      const n = [-q.n[0], 0, -q.n[1]];
      buf.quad('screenBig', P(-w, -h, 0.01), P(w, -h, 0.01), P(w, h, 0.01), P(-w, h, 0.01), n, n, n, n, [0, 0], [1, 0], [1, 1], [0, 1], null, n);
      buf.beam('steel', P(-w * 0.6, h + 0.8, -0.9), [C[0] - r[0] * w * 0.6 + q.n[0] * 1, 48.2, C[2] - r[2] * w * 0.6 + q.n[1] * 1], 0.3);
      buf.beam('steel', P(w * 0.6, h + 0.8, -0.9), [C[0] + r[0] * w * 0.6 + q.n[0] * 1, 48.2, C[2] + r[2] * w * 0.6 + q.n[1] * 1], 0.3);
    }
    const group = buildBufferMesh(buf, this.M);
    group.name = 'stadium';
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      o.castShadow = !['ribbon', 'board', 'flood', 'screenBig', 'crowd'].includes(o.name);
      o.userData.sharedMat = true;
    });
    this.group = group;
    return group;
  }

  // per time of day: LED colour and floodlight strength
  setMood(P) {
    this.M.ribbon.emissive.set(P.ribbon);
    this.M.board.emissive.set(P.ribbon);
    this.M.ribbon.emissiveIntensity = this.M.board.emissiveIntensity = P.night ? 2.6 : 1.8;
    this.M.flood.emissiveIntensity = P.lampI * 1.6;
    this.M.screenBig.emissiveIntensity = P.night ? 1.6 : 1.2;
  }

  update(t) {
    this.ribbonTex.offset.x = (t * 0.035) % 1;
  }
}
