// Shared materials for track, gates and stadium.

import * as THREE from 'three';

export const GATE_COLORS = { CP: 0x35c9ff, Start: 0x4ee08a, Finish: 0xff8a1f };

export function createMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (color, intensity = 5) => std({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const decal = (map, extra = {}) => std({
    map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.6, ...extra,
  });
  const M = {
    surface_road: std({ map: T.asphalt, roughness: 0.88, metalness: 0 }),
    surface_dirt: std({ map: T.dirt, roughness: 1 }),
    surface_ice: std({ map: T.ice, roughness: 0.1, metalness: 0.05, envMapIntensity: 1.5 }),
    surface_platform: std({ map: T.platform, roughness: 0.72, metalness: 0.08 }),
    curb: std({ map: T.curb, roughness: 0.65 }),
    wall: std({ map: T.wall, roughness: 0.5, metalness: 0.05, emissive: 0xff6b1a, emissiveMap: T.wallGlow, emissiveIntensity: 0 }),
    wallTop: std({ map: T.graphite, roughness: 0.55, metalness: 0.2 }),
    side: std({ map: T.concrete, roughness: 0.85 }),
    under: std({ map: T.darkConcrete, roughness: 0.9 }),
    pillar: std({ map: T.pillar, roughness: 0.85 }),
    pillarBase: std({ map: T.graphite, roughness: 0.6, metalness: 0.2 }),
    gateFrame: std({ map: T.graphite, roughness: 0.35, metalness: 0.6 }),
    panelCP: std({ map: T.panelCP, emissive: 0xffffff, emissiveMap: T.panelCP, emissiveIntensity: 1.5, roughness: 0.4 }),
    panelStart: std({ map: T.panelStart, emissive: 0xffffff, emissiveMap: T.panelStart, emissiveIntensity: 1.5, roughness: 0.4 }),
    panelFinish: std({ map: T.panelFinish, emissive: 0xffffff, emissiveMap: T.panelFinish, emissiveIntensity: 1.5, roughness: 0.4 }),
    glowCP: glow(GATE_COLORS.CP),
    glowStart: glow(GATE_COLORS.Start),
    glowFinish: glow(GATE_COLORS.Finish),
    lineCP: decal(T.lineCP, { emissive: GATE_COLORS.CP, emissiveMap: T.lineCP, emissiveIntensity: 1.2 }),
    lineStart: decal(T.lineStart),
    checker: std({ map: T.checker, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    boostPad: std({ map: T.boost, emissive: 0xffffff, emissiveMap: T.boost, emissiveIntensity: 1.3, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    superPad: std({ map: T.superboost, emissive: 0xffffff, emissiveMap: T.superboost, emissiveIntensity: 1.5, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  return M;
}

// Night makes the track stripes and gates glow harder
export function applyMaterialMood(M, env) {
  const night = env === 'night';
  M.wall.emissiveIntensity = night ? 4.5 : env === 'sunset' ? 0.6 : 0;
  for (const k of ['panelCP', 'panelStart', 'panelFinish']) M[k].emissiveIntensity = night ? 5 : 2.2;
  for (const k of ['glowCP', 'glowStart', 'glowFinish']) M[k].emissiveIntensity = night ? 9 : 3.4;
  M.boostPad.emissiveIntensity = night ? 3.5 : 1.6;
  M.superPad.emissiveIntensity = night ? 4 : 1.9;
}
