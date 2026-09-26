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
    this.edgeMode = 'wall';
    this.extra = [];      // blocks off the driving line: plaza widening, branches
    this.branching = false;
    this.marks = {};
    this.last = null;     // last block on the line, with the heading it was entered at
  }

  // side walls of the road blocks placed from now on: 'wall' or 'open'
  edges(mode) { this.edgeMode = mode; return this; }

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
    const dirIn = this.dir;
    this._put(type, bx, by, bz, rot, this.branching);
    if (!this.branching) this.last = { type, x: bx, y: by, z: bz, dirIn };
    const E = def.ports[exit ?? exitPort(def, entry)];
    const [ex, ez] = rotXZ(E.p[0], E.p[2], rot);
    this.pos = [bx * CELL + ex, by * LEVEL + E.p[1], bz * CELL + ez];
    this.dir = (E.d + rot) & 3;
    this.open = !!E.open;
    return this;
  }

  // occupancy-checked insert; off-line blocks go to `extra` (after the finish in
  // build order, so the driving line through plazas stays the built one)
  // A line block may run over a plaza cell placed earlier off the line: that cell
  // then becomes part of the line. Returns false when `skip` and the cell is taken.
  _put(type, bx, by, bz, rot, offLine = false, skip = false) {
    const cells = worldCells({ type, x: bx, y: by, z: bz, rot });
    const n = this.blocks.length + this.extra.length;
    const plazaCell = BLOCKS[type].profile === 'platform' && cells.length === 1;
    for (const c of cells) {
      const k = c.join(',');
      const o = this.occ.get(k);
      if (!o) continue;
      if (skip) return false;
      const takeOver = plazaCell && !offLine && o.offLine && BLOCKS[o.entry[0]].profile === 'platform';
      if (!takeOver) throw new Error(`overlap: ${type}#${n} at cell ${k} with ${o.label}`);
    }
    for (const c of cells) {
      const o = this.occ.get(c.join(','));
      if (o) this.extra.splice(this.extra.indexOf(o.entry), 1);
    }
    const e = [type, bx, by, bz, rot, this.variant];
    if (this.edgeMode === 'open' && BLOCKS[type].profile === 'road') e.push('open');
    for (const c of cells) this.occ.set(c.join(','), { label: `${type}#${n}`, entry: e, offLine });
    (offLine ? this.extra : this.blocks).push(e);
    return true;
  }

  _isPlaza(x, y, z) {
    const o = this.occ.get(`${x},${y},${z}`);
    return !!o && BLOCKS[o.entry[0]].profile === 'platform';
  }

  repeat(n, fn) { for (let i = 0; i < n; i++) fn(this, i); return this; }

  // ---- plazas: open floors of platform cells --------------------------------------------
  // add cells beside the last block on the line (left/right of the way it was entered)
  widen(left = 0, right = 0, type = null) {
    const L = this.last;
    if (!L) throw new Error('widen: nothing placed yet');
    const kind = type || (BLOCKS[L.type].profile === 'platform' ? L.type : 'platform');
    const [lx, lz] = DIRS[(L.dirIn + 3) & 3], [rx, rz] = DIRS[(L.dirIn + 1) & 3];
    for (let i = 1; i <= left; i++) this._put(kind, L.x + lx * i, L.y, L.z + lz * i, L.dirIn, true, true);
    for (let i = 1; i <= right; i++) this._put(kind, L.x + rx * i, L.y, L.z + rz * i, L.dirIn, true, true);
    return this;
  }
  // `len` plaza rows straight ahead, each `left` + 1 + `right` cells wide
  plaza(len = 1, left = 1, right = 1) { for (let i = 0; i < len; i++) this.place('platform').widen(left, right); return this; }
  // turn on a plaza: fills the square corner around the turn cell; the rows after it
  // (plaza / plazaCp / plazaFinish) run over the corner cells
  plazaTurn(side = 'R', left = 1, right = 1) {
    this.platformTurn(side);
    const L = this.last, w = Math.max(left, right);
    for (let dx = -w; dx <= w; dx++) for (let dz = -w; dz <= w; dz++) {
      if (dx || dz) this._put('platform', L.x + dx, L.y, L.z + dz, L.dirIn, true, true);
    }
    return this;
  }
  // checkpoint / finish line across the whole plaza width
  plazaCp(left = 1, right = 1) { return this.place('cpPad').widen(left, right, 'cpPad'); }
  plazaFinish(left = 1, right = 1) { return this.place('finishPad').widen(left, right, 'finishPad'); }

  // ---- forks: remember an open end, build an alternative way from it later ---------------
  // mark the current open end, or the side of the last plaza cell ('L' / 'R')
  mark(name, side = null) {
    if (!side) { this.marks[name] = { pos: this.pos.slice(), dir: this.dir, open: this.open }; return this; }
    const L = this.last;
    const d = side === 'R' ? (L.dirIn + 1) & 3 : (L.dirIn + 3) & 3;
    const [dx, dz] = DIRS[d];
    // step out to the plaza's edge on that side
    let x = L.x, z = L.z;
    while (this._isPlaza(x + dx, L.y, z + dz)) { x += dx; z += dz; }
    this.marks[name] = { pos: [x * CELL + dx * HALF, L.y * LEVEL, z * CELL + dz * HALF], dir: d, open: false };
    return this;
  }
  // build an alternative way from a mark with `fn(builder)`; it should end next to
  // track it rejoins (ports that meet are linked automatically)
  branch(name, fn) {
    const m = this.marks[name];
    if (!m) throw new Error('branch: no mark ' + name);
    const saved = { pos: this.pos, dir: this.dir, open: this.open, last: this.last, edge: this.edgeMode, variant: this.variant };
    this.pos = m.pos.slice(); this.dir = m.dir; this.open = m.open;
    this.branching = true;
    fn(this);
    this.branching = false;
    Object.assign(this, { pos: saved.pos, dir: saved.dir, open: saved.open, last: saved.last, edgeMode: saved.edge, variant: saved.variant });
    return this;
  }

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
  pipe(n = 1) { for (let i = 0; i < n; i++) this.place('pipe'); return this; }
  pipeRight(size = 3) { return this.place(size === 2 ? 'pipe2' : 'pipe3', 0); }
  pipeLeft(size = 3) { return this.place(size === 2 ? 'pipe2' : 'pipe3', 1); }

  // fly over `cells` empty cells and continue at floor `level`
  jump(cells, level) {
    const [dx, dz] = DIRS[this.dir];
    this.pos = [this.pos[0] + dx * CELL * cells, level * LEVEL, this.pos[2] + dz * CELL * cells];
    this.open = false;
    return this;
  }

  get level() { return Math.round(this.pos[1] / LEVEL); }

  build(meta = {}) {
    const out = { ...meta, blocks: this.blocks.concat(this.extra).map((b) => b.slice()) };
    if (this.hangars.length) out.hangars = this.hangars.map((h) => h.slice());
    if (this.decor.length) out.decor = this.decor.map((d) => d.slice());
    return out;
  }
}
