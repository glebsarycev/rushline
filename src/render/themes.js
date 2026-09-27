// Applies a scenery theme (track/themes.js) to the shared materials and the stadium.

import * as THREE from 'three';
import { themeOf } from '../track/themes.js';

export { themeOf };

// Recolour the shared track materials for a theme (the first call remembers the
// defaults, so switching back to 'classic' restores them). Call after
// applyMaterialMood, which sets the glow strength for the time of day.
let defaults = null;
export function applyThemeMaterials(M, T, id, env) {
  if (!defaults) {
    defaults = {
      wall: M.wall.color.getHex(), glow: M.wall.emissive.getHex(), curb: M.curb.map, lip: M.lip.color.getHex(),
    };
  }
  const th = themeOf(id);
  M.wall.color.setHex(th.wall ?? defaults.wall);
  M.wall.emissive.setHex(th.glow ?? defaults.glow);
  if (th.glowI) M.wall.emissiveIntensity = Math.max(M.wall.emissiveIntensity, env === 'night' ? th.glowI * 3 : th.glowI);
  M.curb.map = (th.curb && T[th.curb]) || defaults.curb;
  M.curb.needsUpdate = true;
  M.lip.color.setHex(th.lip ?? defaults.lip);
}

// Stadium LED ribbons and boards take the theme colour
export function applyThemeStadium(bowl, id) {
  const th = themeOf(id);
  if (th.ribbon == null) return; // keep the time-of-day colour
  const c = new THREE.Color(th.ribbon);
  for (const k of ['ribbon', 'board']) if (bowl.M[k]) bowl.M[k].emissive.copy(c);
}
