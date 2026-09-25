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
    // industrial scenery (src/track/scenery.js)
    steel: std({ color: 0x9aa3ad, metalness: 0.55, roughness: 0.42 }),
    steelDark: std({ color: 0x3b424b, metalness: 0.5, roughness: 0.55 }),
    craneYellow: std({ color: 0xf0b400, metalness: 0.25, roughness: 0.5 }),
    craneCab: std({ color: 0xe9ecef, metalness: 0.2, roughness: 0.35, emissive: 0x9fd8ff, emissiveIntensity: 0.15 }),
    hangarWall: std({ map: T.corrugated, metalness: 0.35, roughness: 0.55 }),
    hangarRoof: std({ map: T.roofMetal, metalness: 0.35, roughness: 0.6 }),
    hangarFloor: std({ map: T.floor, roughness: 0.8 }),
    hazard: std({ map: T.hazard, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    glassOut: std({ color: 0x2c4058, metalness: 0.7, roughness: 0.12, envMapIntensity: 1.4 }),
    sign: std({ map: T.hangarSign, emissive: 0xffffff, emissiveMap: T.hangarSign, emissiveIntensity: 0.35, roughness: 0.5 }),
    skylight: std({ map: T.skylight, emissive: 0xffffff, emissiveMap: T.skylight, emissiveIntensity: 0.6, roughness: 0.2 }),
    lamp: glow(0xffc27a, 7),
    lampCool: glow(0xeef4ff, 4),
    stripOrange: glow(0xff7a1a, 4),
    beacon: glow(0xff2a2a, 6),
    screen: std({ map: T.screen, emissive: 0xffffff, emissiveMap: T.screen, emissiveIntensity: 1.4, roughness: 0.3 }),
    containerRed: std({ map: T.container, color: 0xc0392b, roughness: 0.6, metalness: 0.3 }),
    containerBlue: std({ map: T.container, color: 0x2f64a8, roughness: 0.6, metalness: 0.3 }),
    containerGreen: std({ map: T.container, color: 0x3f8250, roughness: 0.6, metalness: 0.3 }),
    containerOrange: std({ map: T.container, color: 0xe07b2c, roughness: 0.6, metalness: 0.3 }),
    crate: std({ map: T.crate, roughness: 0.85 }),
    pallet: std({ color: 0x8a6a45, roughness: 0.9 }),
    barrelRed: std({ color: 0xc8322b, roughness: 0.45, metalness: 0.4 }),
    barrelBlue: std({ color: 0x2f64a8, roughness: 0.45, metalness: 0.4 }),
    tank: std({ color: 0xdde2e6, roughness: 0.4, metalness: 0.3 }),
    plinth: std({ map: T.darkConcrete, roughness: 0.9 }),
    grating: std({ map: T.grating, roughness: 0.6, metalness: 0.5 }),
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
  M.lampCool.emissiveIntensity = night ? 9 : 4;
  M.stripOrange.emissiveIntensity = night ? 6 : 4;
  M.screen.emissiveIntensity = night ? 2.2 : 1.4;
  M.skylight.emissiveIntensity = night ? 0.1 : env === 'sunset' ? 0.45 : 0.6;
}
