// Shared constants for the world grid, physics and surfaces.

// ---- World grid -----------------------------------------------------------
export const CELL = 32;        // horizontal size of one block cell (m)
export const LEVEL = 8;        // vertical size of one block level (m)
export const HALF = CELL / 2;
export const ROAD_Y = 0.25;    // road surface height above the level floor
export const ROAD_HALF = 10;   // half width of the drivable road
export const CURB_W = 1.2;     // painted curb strip on each side
export const WALL_T = 1.0;     // side wall thickness
export const WALL_H = 1.2;     // side wall height above the road
export const SLAB = 1.2;       // thickness of the road deck
export const LOOP_R = 26;      // loop radius
// half-pipe cross-section: flat floor, quarter circles (radius) up into short vertical
// walls, then a tighter curl (curlR) back inwards; floor + radius + lip = one cell half
export const PIPE = { floor: 8.5, radius: 7, rise: 1.5, curlR: 5.5, curl: 120, lip: 0.5 };
PIPE.wall = PIPE.radius + PIPE.rise + PIPE.curlR * Math.sin((PIPE.curl * Math.PI) / 180) + PIPE.lip; // total height
// tech road: road width with low rounded borders instead of walls
export const TECH = { bump: 1.4, bumpH: 1.2 };
// deck: wide open road (speed tech), a low rounded lip marks the edge
export const DECK = { half: 14, lip: 1.4, lipH: 1.2 };
export const GRID_MIN = -24;   // editor grid limits (cells)
export const GRID_MAX = 24;
export const MAX_LEVEL = 20;

// ---- Simulation -----------------------------------------------------------
export const PHYS_HZ = 240;
export const PHYS_DT = 1 / PHYS_HZ;
export const GHOST_HZ = 30;
export const GRAVITY = 9.81;

// ---- Surfaces ---------------------------------------------------------------
export const SURF = { ROAD: 0, WALL: 1, DIRT: 2, ICE: 3, GRASS: 4, PLATFORM: 5 };

// grip multiplies the base tyre friction, roll is rolling resistance (m/s^2)
export const SURFACES = [
  { id: 0, key: 'road', grip: 1.0, roll: 0.10, rearDrift: 1.0, dust: 0 },
  { id: 1, key: 'wall', grip: 0.9, roll: 0.20, rearDrift: 1.0, dust: 0 },
  { id: 2, key: 'dirt', grip: 0.74, roll: 0.45, rearDrift: 1.0, dust: 1 },
  { id: 3, key: 'ice', grip: 0.3, roll: 0.03, rearDrift: 1.0, dust: 0 },
  { id: 4, key: 'grass', grip: 0.62, roll: 2.4, rearDrift: 0.95, dust: 0.6 },
  { id: 5, key: 'platform', grip: 1.0, roll: 0.10, rearDrift: 1.0, dust: 0 },
];

export const SURFACE_VARIANTS = ['road', 'dirt', 'ice', 'grass'];
export const VARIANT_SURF = { road: SURF.ROAD, dirt: SURF.DIRT, ice: SURF.ICE, grass: SURF.GRASS, platform: SURF.PLATFORM };

// ---- Medals -----------------------------------------------------------------
export const MEDALS = ['author', 'gold', 'silver', 'bronze'];
export const MEDAL_LABEL = { author: 'Author', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
