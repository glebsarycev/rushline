// "Turtle" style track builder used to author the campaign: each call attaches
// a block to the current open end, so layouts always connect. Overlapping
// blocks throw, which keeps hand-made tracks honest.

import { CELL, LEVEL, HALF } from '../config.js';
import { BLOCKS, rotXZ, worldCells, DIRS, exitPort } from './blocks.js';

const CURVES = [null, 'curve1', 'curve2', 'curve3', 'curve4'];
const HILLS = { '1,1': 'hill1', '2,1': 'hill2', '3,1': 'hill3', '2,2': 'hill22', '3,2': 'hill32', '4,2': 'hill42', '5,2': 'hill52', '6,3': 'hill63' };

export class TrackBuilder {
  constructor() {
    this.blocks = [];
    this.occ = new Map();
    this.pos = [0, 0, HALF];
    this.dir = 0;
    this.variant = 'road';
    this.open = false;
    this.hangars = [];
    this.decor = [];
  }

  // cover cells x0..x1, z0..z1 with a hangar (height is automatic)
  hangar(x0, z0, x1, z1) { this.hangars.push([x0, z0, x1, z1]); return this; }

  // place a decor item on a ground cell (see DECOR_TYPES in scenery.js)
  prop(type, x, z, rot = 0) { this.decor.push([type, x, z, rot]); return this; }

  // next block will occupy cell (cx, cy, cz), entered while heading `dir`
  at(cx, cy, cz, dir = 0) {
    const [dx, dz] = DIRS[dir];
    this.pos = [cx * CELL - dx * HALF, cy * LEVEL, cz * CELL - dz * HALF];
    this.dir = dir;
    this.open = false;
    return this;
  }

  surface(v) { this.variant = v; return this; }

  // `exit` picks a side port of a four-way block (platform turns)
  place(type, entry = 0, exit = null) {
    const def = BLOCKS[type];
    if (!def) throw new Error('unknown block ' + type);
    if (this.open) throw new Error(`cannot attach ${type}: previous block ends in the air (use jump)`);
    const P = def.ports[entry];
    const rot = (((this.dir + 2 - P.d) % 4) + 4) % 4;
    const [lx, lz] = rotXZ(P.p[0], P.p[2], rot);
    const ox = this.pos[0] - lx, oy = this.pos[1] - P.p[1], oz = this.pos[2] - lz;
    const bx = Math.round(ox / CELL), by = Math.round(oy / LEVEL), bz = Math.round(oz / CELL);
    if (Math.abs(bx * CELL - ox) > 0.01 || Math.abs(by * LEVEL - oy) > 0.01 || Math.abs(bz * CELL - oz) > 0.01) {
      throw new Error(`misaligned ${type} at ${ox},${oy},${oz}`);
    }
    if (by < 0) throw new Error(`${type} goes below ground at block ${this.blocks.length}`);
    const block = { type, x: bx, y: by, z: bz, rot };
    const cells = worldCells(block);
    for (const c of cells) {
      const k = c.join(',');
      if (this.occ.has(k)) throw new Error(`overlap: ${type}#${this.blocks.length} at cell ${k} with ${this.occ.get(k)}`);
    }
    for (const c of cells) this.occ.set(c.join(','), `${type}#${this.blocks.length}`);
    this.blocks.push([type, bx, by, bz, rot, this.variant]);
    const E = def.ports[exit ?? exitPort(def, entry)];
    const [ex, ez] = rotXZ(E.p[0], E.p[2], rot);
    this.pos = [bx * CELL + ex, by * LEVEL + E.p[1], bz * CELL + ez];
    this.dir = (E.d + rot) & 3;
    this.open = !!E.open;
    return this;
  }

  repeat(n, fn) { for (let i = 0; i < n; i++) fn(this, i); return this; }

  start() { return this.place('start'); }
  finish() { return this.place('finish'); }
  cp() { return this.place('cp'); }
  boost() { return this.place('boost'); }
  superBoost() { return this.place('superboost'); }
  straight(n = 1) { for (let i = 0; i < n; i++) this.place('straight'); return this; }
  platform(n = 1) { for (let i = 0; i < n; i++) this.place('platform'); return this; }
  // quarter turn across one platform (no walls: too fast and you fall off)
  platformTurn(side = 'R') { return this.place('platform', 0, side === 'R' ? 2 : 3); }
  right(size = 2) { return this.place(CURVES[size], 0); }
  left(size = 2) { return this.place(CURVES[size], 1); }
  bankRight(size = 2) { return this.place(size === 3 ? 'bank3' : 'bank2', 0); }
  bankLeft(size = 2) { return this.place(size === 3 ? 'bank3' : 'bank2', 1); }
  wallRight() { return this.place('wallride', 0); }
  wallLeft() { return this.place('wallride', 1); }
  up(len = 2, levels = 1) { return this.place(HILLS[`${len},${levels}`], 0); }
  down(len = 2, levels = 1) { return this.place(HILLS[`${len},${levels}`], 1); }
  loop(side = 'R') { return this.place(side === 'R' ? 'loop' : 'loopL'); }
  kicker(big = false) { return this.place(big ? 'rampBig' : 'ramp'); }

  // fly over `cells` empty cells and continue at floor `level`
  jump(cells, level) {
    const [dx, dz] = DIRS[this.dir];
    this.pos = [this.pos[0] + dx * CELL * cells, level * LEVEL, this.pos[2] + dz * CELL * cells];
    this.open = false;
    return this;
  }

  get level() { return Math.round(this.pos[1] / LEVEL); }

  build(meta = {}) {
    const out = { ...meta, blocks: this.blocks.map((b) => b.slice()) };
    if (this.hangars.length) out.hangars = this.hangars.map((h) => h.slice());
    if (this.decor.length) out.decor = this.decor.map((d) => d.slice());
    return out;
  }
}
