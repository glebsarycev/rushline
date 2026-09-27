// Scenery themes: the look of a track's surroundings (campaign tracks pick one with
// `theme`, custom tracks use 'classic'). A theme decides whether the stadium bowl
// stands, what the ground is, which automatic decor may appear (null = all kinds) and
// how the track's walls and stunt surfaces are coloured (see render/themes.js).

export const THEMES = {
  // the industrial stadium of the editor and custom tracks
  classic: { stadium: true, ground: 'lawn', autoDecor: null },
  // violet stadium: purple walls, curbs and stunt surfaces, giant rings in the air
  violet: {
    stadium: true, ground: 'lawn', autoDecor: ['screen', 'light'],
    wall: 0xcbbcff, glow: 0x9a4dff, glowI: 1.4, curb: 'curbViolet', lip: 0x4a2a8c, stunt: 'surface_violet', ribbon: 0xa45cff,
    lamp: 0xb88aff,
  },
  // abstract mirror world: no stadium, wooden towers, a mirror plane at ground level
  mirror: { stadium: false, ground: 'mirror', autoDecor: [], lip: 0x2b2f36 },
  // mountain valley: no stadium, terrain, rocks, a river and a cave
  valley: { stadium: false, ground: 'terrain', autoDecor: [], curb: 'curbGreen' },
};

export function themeOf(id) {
  return THEMES[id] || THEMES.classic;
}
