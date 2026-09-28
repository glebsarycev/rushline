// "Turtle" style track builder used to author the campaign: each call attaches
// a block to the current open end, so layouts always connect. Overlapping
// blocks throw, which keeps hand-made tracks honest.

import { CELL, LEVEL, HALF } from '../config.js';
import { BLOCKS, rotXZ, worldCells, DIRS, exitPort, ensureBlock, sweepId } from './blocks.js';

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
    this.bank = 0;        // bank (degrees) and grade (%) at the open end, see sweep()
    this.grade = 0;
    this.profile = 'road'; // cross-section of sweep pieces: road, tech, deck, platform
    this.gradeMode = 'monotone'; // how sweep grades are chosen, see smoothing()
  }

  // 'monotone' (default): each joint blends its neighbours' slopes without overshoot,
  // flat where a climb turns into a fall; suits short tech pieces.
  // 'spline': one clamped cubic spline over each run of pieces, continuous slope and
  // curvature; for long fast pieces (no crest at any joint).
  smoothing(mode) { this.gradeMode = mode; return this; }

  // cross-section of the sweep pieces placed from now on
  prof(p) { this.profile = p; return this; }

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
    const def = ensureBlock(type);
    if (!def) throw new Error('unknown block ' + type);
    if (this.open) throw new Error(`cannot attach ${type}: previous block ends in the air (use jump)`);
    const P = def.ports[entry];
    if ((P.bank || 0) !== this.bank || (P.grade || 0) !== this.grade) {
      throw new Error(`${type} at block ${this.blocks.length} starts at bank ${P.bank || 0}, grade ${P.grade || 0}; the road ends at bank ${this.bank}, grade ${this.grade}`);
    }
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
    this.bank = E.bank || 0;
    this.grade = E.grade || 0;
    return this;
  }

  // Parametric piece (sweep blocks in blocks.js) that starts where the road ends:
  // shape 's2' straight, 'r3' / 'l3' quarter turn; rise in levels; bank (degrees,
  // positive = right side down) and grade (%) at its end default to the current ones.
  // feature: 'b' turbo, 'B' super turbo, 'c' checkpoint, 'f' finish, 's' start
  // grade: the end grade in %, or 'smooth' (default): chosen at build() from the rises of
  // the neighbouring pieces so a run of sweeps climbs and falls without kinks
  // peak: extra bank in the middle of the piece, so a curve tilts in and out by itself
  sweep(shape, { rise = 0, bank = this.bank, grade = 'smooth', profile = this.profile, feature = '', peak = 0 } = {}) {
    const smooth = grade === 'smooth';
    const g1 = smooth ? 0 : grade;
    this.place(sweepId(profile, shape, rise, this.bank, bank, this.grade, g1, feature, peak));
    const n = +shape.slice(1);
    const e = this.blocks[this.blocks.length - 1];
    if (!this.branching) {
      e.sw = { profile, shape, rise, b0: +e[0].split('.')[4], b1: bank, feature, smooth,
        L: shape[0] === 's' ? n * CELL : ((n - 0.5) * CELL * Math.PI) / 2 };
    }
    return this;
  }

  // Grades at the joints of consecutive sweep pieces: the height along a run of pieces
  // is one clamped cubic spline through the joint heights (continuous slope and
  // curvature, so no crest or dip at a joint). A run ends at an ordinary block (flat)
  // or at a piece with an explicit grade, which then fixes the slope there.
  _smoothGrades() {
    if (this.gradeMode === 'spline') this._splineGrades(); else this._monotoneGrades();
    // the new grades reshape the pieces slightly: check they still fit
    const occ = new Map();
    for (const e of this.blocks.concat(this.extra)) {
      for (const c of worldCells({ type: e[0], x: e[1], y: e[2], z: e[3], rot: e[4] })) {
        const k = c.join(',');
        if (occ.has(k) && occ.get(k) !== e) throw new Error(`overlap after smoothing grades: ${e[0]} at cell ${k}`);
        occ.set(k, e);
      }
    }
  }

  _monotoneGrades() {
    const B = this.blocks;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!e.sw || e.sw.feature === 's') continue;
      const prev = i > 0 && B[i - 1].sw && B[i - 1].sw.feature !== 's' ? B[i - 1] : null;
      const next = i < B.length - 1 && B[i + 1].sw ? B[i + 1] : null;
      const m = (x) => (x.sw.rise * LEVEL) / x.sw.L;
      const joint = (a, b) => {
        if (!a || !b) return 0;
        const ma = m(a), mb = m(b);
        if (ma * mb <= 0) return 0;
        return Math.round((100 * 2 * ma * mb) / (ma + mb));
      };
      const parts = e[0].split('.');
      // id fields: sw.profile.shape.rise.b0.b1.g0.g1[...]
      const g0 = prev ? (prev.sw.smooth ? joint(prev, e) : +prev[0].split('.')[7]) : +parts[6];
      const g1 = e.sw.smooth ? joint(e, next) : +parts[7];
      parts[6] = String(g0); parts[7] = String(g1);
      e[0] = parts.join('.');
    }
  }

  _splineGrades() {
    const B = this.blocks;
    const field = (e, k) => +e[0].split('.')[k];
    // the start piece stays flat: it bounds a run like an ordinary block
    const smoothable = (e) => e.sw && e.sw.feature !== 's';
    let i = 0;
    while (i < B.length) {
      if (!smoothable(B[i])) { i++; continue; }
      // a run of sweep pieces [i, j)
      let j = i;
      while (j < B.length && smoothable(B[j])) { j++; if (!B[j - 1].sw.smooth) break; }
      const run = B.slice(i, j);
      const n = run.length;
      const h = run.map((e) => e.sw.L), d = run.map((e) => (e.sw.rise * LEVEL) / e.sw.L);
      const m = new Array(n + 1).fill(0);
      m[0] = field(run[0], 6) / 100;
      m[n] = run[n - 1].sw.smooth ? 0 : field(run[n - 1], 7) / 100;
      if (n > 1) {
        // tridiagonal system for the interior slopes (Thomas algorithm)
        const a = [], b = [], c = [], r = [];
        for (let k = 1; k < n; k++) {
          a.push(h[k]); b.push(2 * (h[k - 1] + h[k])); c.push(h[k - 1]);
          r.push(3 * (h[k] * d[k - 1] + h[k - 1] * d[k]));
        }
        r[0] -= a[0] * m[0];
        r[n - 2] -= c[n - 2] * m[n];
        for (let k = 1; k < n - 1; k++) { const w = a[k] / b[k - 1]; b[k] -= w * c[k - 1]; r[k] -= w * r[k - 1]; }
        m[n - 1] = r[n - 2] / b[n - 2];
        for (let k = n - 3; k >= 0; k--) m[k + 1] = (r[k] - c[k] * m[k + 2]) / b[k];
      }
      run.forEach((e, k) => {
        const parts = e[0].split('.');
        parts[6] = String(Math.round(m[k] * 100));
        parts[7] = String(Math.round(m[k + 1] * 100));
        e[0] = parts.join('.');
      });
      i = j;
    }
  }
  // bring bank and grade back to zero over `n` cells (ordinary blocks need a flat end)
  level(n = 1, rise = 0) { return this.sweep('s' + n, { rise, bank: 0, grade: 0 }); }

  // occupancy-checked insert; off-line blocks go to `extra` (after the finish in
  // build order, so the driving line through plazas stays the built one)
  // A line block may run over a plaza cell placed earlier off the line: that cell
  // then becomes part of the line. Returns false when `skip` and the cell is taken.
  _put(type, bx, by, bz, rot, offLine = false, skip = false) {
    const cells = worldCells({ type, x: bx, y: by, z: bz, rot });
    if (cells.some((c) => c[1] < 0)) throw new Error(`${type} at block ${this.blocks.length} reaches below the ground`);
    const n = this.blocks.length + this.extra.length;
    const plazaCell = ensureBlock(type).profile === 'platform' && cells.length === 1;
    for (const c of cells) {
      const k = c.join(',');
      const o = this.occ.get(k);
      if (!o) continue;
      if (skip) return false;
      const takeOver = plazaCell && !offLine && o.offLine && ensureBlock(o.entry[0]).profile === 'platform';
      if (!takeOver) throw new Error(`overlap: ${type}#${n} at cell ${k} with ${o.label}`);
    }
    for (const c of cells) {
      const o = this.occ.get(c.join(','));
      if (o) this.extra.splice(this.extra.indexOf(o.entry), 1);
    }
    const e = [type, bx, by, bz, rot, this.variant];
    if (this.edgeMode === 'open' && ensureBlock(type).profile === 'road') e.push('open');
    for (const c of cells) this.occ.set(c.join(','), { label: `${type}#${n}`, entry: e, offLine });
    (offLine ? this.extra : this.blocks).push(e);
    return true;
  }

  _isPlaza(x, y, z) {
    const o = this.occ.get(`${x},${y},${z}`);
    return !!o && ensureBlock(o.entry[0]).profile === 'platform';
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
    if (!side) { this.marks[name] = { pos: this.pos.slice(), dir: this.dir, open: this.open, bank: this.bank, grade: this.grade }; return this; }
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
    const saved = { pos: this.pos, dir: this.dir, open: this.open, last: this.last, edge: this.edgeMode, variant: this.variant, bank: this.bank, grade: this.grade };
    this.pos = m.pos.slice(); this.dir = m.dir; this.open = m.open; this.bank = m.bank || 0; this.grade = m.grade || 0;
    this.branching = true;
    fn(this);
    this.branching = false;
    Object.assign(this, { pos: saved.pos, dir: saved.dir, open: saved.open, last: saved.last, edgeMode: saved.edge, variant: saved.variant, bank: saved.bank, grade: saved.grade });
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
    this._smoothGrades();
    const out = { ...meta, blocks: this.blocks.concat(this.extra).map((b) => b.slice()) };
    if (this.hangars.length) out.hangars = this.hangars.map((h) => h.slice());
    if (this.decor.length) out.decor = this.decor.map((d) => d.slice());
    return out;
  }
}
