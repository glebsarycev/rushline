// Block track editor: place, rotate and stack blocks on the grid, then test
// drive, validate (author time), save and share.

import * as THREE from 'three';
import { CELL, LEVEL, ROAD_Y, GRID_MIN, GRID_MAX, MAX_LEVEL, SURFACE_VARIANTS } from '../config.js';
import { BLOCKS, BLOCK_LIST, CATEGORIES, worldCells, worldPort, portKey, DIRS } from '../track/blocks.js';
import { buildBlockMesh, buildBufferMesh } from '../render/trackMesh.js';
import { GeoBuffer } from '../track/geometry.js';
import { Track } from '../track/track.js';
import { DECOR, DECOR_TYPES, buildDecor, decorSeed, hangarHeight, occupancy } from '../track/scenery.js';
import { applyMaterialMood } from '../render/materials.js';
import { ENV_PRESETS, ENV_IDS, LANDS, LAND_IDS } from '../render/environment.js';
import * as Records from '../game/records.js';
import { formatTime } from '../util/math.js';

const SURF_LABEL = { road: 'Road', dirt: 'Dirt', ice: 'Ice' };
// editor-only tabs after the block categories
const SCENERY_TABS = [{ id: 'hangar', name: 'Hangar' }, { id: 'decor', name: 'Decor' }];
const TABS = [...CATEGORIES, ...SCENERY_TABS];
const MAX_HANGARS = 8, MAX_HANGAR_SIDE = 16;
const HANGAR_ICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="#1a222d"/><path d="M20 96V50l60-22 60 22v46z" fill="#8e969f"/><path d="M20 50l60-22 60 22" fill="none" stroke="#3b424b" stroke-width="5"/><rect x="58" y="62" width="44" height="34" fill="#15171b"/><path d="M58 62h44v8H58z" fill="#f2b705"/><path d="M62 62l-4 8h6l4-8zm12 0l-4 8h6l4-8zm12 0l-4 8h6l4-8zm12 0l-4 8h4v-8z" fill="#15171b"/><rect x="28" y="56" width="22" height="6" fill="#2c4058"/><rect x="110" y="56" width="22" height="6" fill="#2c4058"/></svg>`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();

export class Editor {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = 'editor';
    this.blockGroup = new THREE.Group();
    this.group.add(this.blockGroup);
    this.blocks = [];
    this.occ = new Map();
    this.hangars = [];
    this.decor = [];
    this.sceneryGroup = new THREE.Group();
    this.group.add(this.sceneryGroup);
    this.decorType = 'containers';
    this.hangarDrag = null;
    this.type = 'straight';
    this.rot = 0;
    this.level = 0;
    this.surf = 'road';
    this.edge = 'wall';
    this.cat = 'road';
    this.tool = 'place';
    this.cursor = null;
    this.autoRot = true;
    this.undoStack = [];
    this.redoStack = [];
    this.cam = { target: new THREE.Vector3(0, 0, -64), yaw: 0.75, pitch: 0.92, dist: 230 };
    this.active = false;
    this.built = false;
    this.thumbs = {};
    this.meta = { id: null, name: 'Untitled track', author: 'Me', env: 'day', land: 'mountains' };
    this.authorTime = null;
    this.testBest = null;
    this.testGhost = null;
    this.testSplits = null;
    this.dirty = false;
    this.drag = null;
  }

  get root() { return this.app.ui.$('#editor-ui'); }

  // ---- lifecycle ---------------------------------------------------------------------------
  _ensureBuilt() {
    if (this.built) return;
    this.built = true;
    const M = this.app.materials;
    this.previewMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, emissive: 0x32d67a, emissiveIntensity: 0.35, depthWrite: false });
    this.footMat = new THREE.MeshBasicMaterial({ color: 0x32d67a, transparent: true, opacity: 0.28, depthWrite: false });
    this.footMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL - 1, 0.3, CELL - 1), this.footMat, 256);
    this.footMesh.count = 0;
    this.footMesh.frustumCulled = false;
    this.group.add(this.footMesh);
    const cone = new THREE.ConeGeometry(2.2, 5, 4);
    cone.rotateX(-Math.PI / 2);
    this.portMesh = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ color: 0xffb627 }), 256);
    this.portMesh.count = 0;
    this.portMesh.frustumCulled = false;
    this.group.add(this.portMesh);
    const n = GRID_MAX - GRID_MIN + 1;
    this.grid = new THREE.GridHelper(n * CELL, n, 0x0b1016, 0x0b1016);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.45;
    this.grid.material.depthWrite = false;
    this.group.add(this.grid);
    this.preview = null;
    this._buildUI();
    this._bindPointer();
    void M;
  }

  open(entry) {
    this._ensureBuilt();
    this._clearAll();
    if (entry) {
      this.meta = { id: entry.id, name: entry.name || 'Untitled track', author: entry.author || 'Me', env: entry.env || 'day', land: entry.land || 'mountains' };
      this.authorTime = entry.authorTime || null;
      for (const b of entry.blocks) this._add({ type: b[0], x: b[1], y: b[2], z: b[3], rot: b[4] || 0, surf: b[5] || 'road', edge: b[6] === 'open' ? 'open' : 'wall' });
      for (const h of entry.hangars || []) this._add({ kind: 'hangar', x0: Math.min(h[0], h[2]), z0: Math.min(h[1], h[3]), x1: Math.max(h[0], h[2]), z1: Math.max(h[1], h[3]) });
      for (const d of entry.decor || []) if (DECOR[d[0]]) this._add({ kind: 'decor', type: d[0], x: d[1], z: d[2], rot: d[3] || 0 });
      this._refreshHangars();
    } else {
      this.meta = { id: null, name: 'Untitled track', author: 'Me', env: 'day', land: 'mountains' };
      this.authorTime = null;
      this._add({ type: 'start', x: 0, y: 0, z: 0, rot: 0, surf: 'road' });
    }
    this.testBest = null;
    this.testGhost = null;
    this.testSplits = null;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.level = 0;
    this.resume();
    this._frameCamera();
  }

  resume() {
    this._ensureBuilt();
    this.active = true;
    const app = this.app;
    if (!this.group.parent) app.scene.add(this.group);
    app.env.setPreset(this.meta.env, this.meta.land);
    applyMaterialMood(app.materials, this.meta.env);
    if (app.env.stadium) app.env.stadium.visible = false;
    app.indoor.setEnabled(false);
    this.root.hidden = false;
    this._makeThumbs();
    this._refreshPalette();
    this._refreshInfo();
    this._updateGrid();
    this._updatePorts();
    this._updatePreview();
    const n = this.root.querySelector('#ed-name');
    n.value = this.meta.name;
    this.root.querySelector('#ed-env').value = this.meta.env;
    this.root.querySelector('#ed-land').value = this.meta.land;
  }

  hide() {
    this.active = false;
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.built) this.root.hidden = true;
    this.drag = null;
  }

  exit() { this.hide(); }

  _clearAll() {
    for (const b of this.blocks) this.blockGroup.remove(b.mesh);
    this.blocks = [];
    this.occ.clear();
    for (const o of [...this.hangars, ...this.decor]) this._dispose(o.mesh);
    this.hangars = [];
    this.decor = [];
  }

  _dispose(mesh) {
    if (!mesh) return;
    this.sceneryGroup.remove(mesh);
    mesh.traverse((o) => { if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose(); if (o.userData.ownMaterial) o.material.dispose(); });
  }

  // ---- block bookkeeping --------------------------------------------------------------------
  _key(x, y, z) { return x + ',' + y + ',' + z; }

  _cells(b) { return worldCells(b); }

  _fits(b, ignore = null) {
    for (const [x, y, z] of this._cells(b)) {
      if (x < GRID_MIN || x > GRID_MAX || z < GRID_MIN || z > GRID_MAX || y < 0 || y > MAX_LEVEL) return false;
      const o = this.occ.get(this._key(x, y, z));
      if (o && o !== ignore) return false;
    }
    return true;
  }

  _add(data) {
    if (data.kind === 'hangar') {
      const h = { ...data };
      this.hangars.push(h);
      return h;
    }
    if (data.kind === 'decor') {
      const d = { ...data };
      d.mesh = this._decorMesh(d.type, d.x, d.z, d.rot);
      d.mesh.traverse((o) => { o.userData.decor = d; });
      this.sceneryGroup.add(d.mesh);
      this.decor.push(d);
      return d;
    }
    if (!BLOCKS[data.type]) return null;
    const b = { ...data };
    b.mesh = buildBlockMesh(b.type, b.surf, this.app.materials, b.edge);
    b.mesh.position.set(b.x * CELL, b.y * LEVEL, b.z * CELL);
    b.mesh.rotation.y = (-b.rot * Math.PI) / 2;
    b.mesh.traverse((o) => { o.userData.block = b; });
    this.blockGroup.add(b.mesh);
    for (const [x, y, z] of this._cells(b)) this.occ.set(this._key(x, y, z), b);
    this.blocks.push(b);
    return b;
  }

  _remove(b) {
    if (b.kind === 'hangar' || b.kind === 'decor') {
      const list = b.kind === 'hangar' ? this.hangars : this.decor;
      const k = list.indexOf(b);
      if (k >= 0) list.splice(k, 1);
      this._dispose(b.mesh);
      return;
    }
    const i = this.blocks.indexOf(b);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    this.blockGroup.remove(b.mesh);
    for (const [x, y, z] of this._cells(b)) if (this.occ.get(this._key(x, y, z)) === b) this.occ.delete(this._key(x, y, z));
  }

  _plain(b) {
    if (b.kind === 'hangar') return { kind: 'hangar', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
    if (b.kind === 'decor') return { kind: 'decor', type: b.type, x: b.x, z: b.z, rot: b.rot };
    return { type: b.type, x: b.x, y: b.y, z: b.z, rot: b.rot, surf: b.surf, edge: b.edge || 'wall' };
  }

  _find(p) {
    if (p.kind === 'hangar') return this.hangars.find((h) => h.x0 === p.x0 && h.z0 === p.z0 && h.x1 === p.x1 && h.z1 === p.z1);
    if (p.kind === 'decor') return this.decor.find((d) => d.type === p.type && d.x === p.x && d.z === p.z);
    return this.blocks.find((b) => b.type === p.type && b.x === p.x && b.y === p.y && b.z === p.z && b.rot === p.rot);
  }

  // apply an edit { add: [plain], remove: [plain] } and record it for undo
  _commit(edit, record = true) {
    for (const p of edit.remove) { const b = this._find(p); if (b) this._remove(b); }
    for (const p of edit.add) this._add(p);
    if (record) {
      this.undoStack.push(edit);
      if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
    }
    this.dirty = true;
    if (this.authorTime) {
      this.authorTime = null;
      this.app.ui.toast('Track changed: drive it again to set the author time');
    }
    this.testBest = null; this.testGhost = null; this.testSplits = null;
    this._refreshHangars();
    this._updatePorts();
    this._refreshInfo();
    this._updatePreview();
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this._commit({ add: e.remove, remove: e.add }, false);
    this.redoStack.push(e);
    this.app.audio.erase();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this._commit(e, false);
    this.undoStack.push(e);
    this.app.audio.place();
  }

  // ---- placing ------------------------------------------------------------------------------
  _candidate() {
    if (!this.cursor) return null;
    return { type: this.type, x: this.cursor.x, y: this.level, z: this.cursor.z, rot: this.rot, surf: BLOCKS[this.type].surfaces ? this.surf : 'road', edge: BLOCKS[this.type].profile === 'road' ? this.edge : 'wall' };
  }

  place() {
    if (this.cat === 'decor') { this.placeDecor(); return; }
    if (this.cat === 'hangar') return;
    const c = this._candidate();
    if (!c) return;
    if (!this._fits(c)) { this.app.audio.denied(); return; }
    const remove = [];
    // a block placed over decor replaces it
    const cols = new Set(this._cells(c).map(([x, , z]) => x + ',' + z));
    for (const d of this.decor) if (cols.has(d.x + ',' + d.z)) remove.push(this._plain(d));
    if (BLOCKS[c.type].feature === 'start') {
      for (const b of this.blocks) if (b.def?.feature === 'start' || BLOCKS[b.type].feature === 'start') remove.push(this._plain(b));
    }
    this._commit({ add: [c], remove });
    this.app.audio.place();
    this.autoRot = true;
  }

  // right click / erase tool: what gets removed depends on the tab
  eraseAt(e) {
    if (this.cat === 'hangar') { this.eraseBlock(this._hangarAt(this.cursor)); return; }
    if (this.cat === 'decor') { this.eraseBlock(this._decorAt(this.cursor) || this._pickDecor(e)); return; }
    this.eraseBlock(this._pick(e));
  }

  eraseBlock(b) {
    if (!b) { this.app.audio.denied(); return; }
    this._commit({ add: [], remove: [this._plain(b)] });
    this.app.audio.erase();
  }

  // ---- hangars and decor -------------------------------------------------------------------
  _colFree(x, z) {
    for (let y = 0; y <= MAX_LEVEL; y++) if (this.occ.has(this._key(x, y, z))) return false;
    return true;
  }

  _hangarAt(c) { return c ? this.hangars.find((h) => c.x >= h.x0 && c.x <= h.x1 && c.z >= h.z0 && c.z <= h.z1) : null; }

  _decorAt(c) { return c ? this.decor.find((d) => d.x === c.x && d.z === c.z) : null; }

  _pickDecor(e) {
    if (!e) return null;
    this._ndc(e);
    const hits = _ray.intersectObjects(this.decor.map((d) => d.mesh), true);
    return hits.length ? hits[0].object.userData.decor : null;
  }

  _decorFits(type, x, z) {
    if (x < GRID_MIN || x > GRID_MAX || z < GRID_MIN || z > GRID_MAX) return false;
    if (!this._colFree(x, z) || this._decorAt({ x, z })) return false;
    return !(DECOR[type].tall && this._hangarAt({ x, z }));
  }

  placeDecor() {
    const c = this.cursor;
    if (!c || !this._decorFits(this.decorType, c.x, c.z)) { this.app.audio.denied(); return; }
    this._commit({ add: [{ kind: 'decor', type: this.decorType, x: c.x, z: c.z, rot: this.rot }], remove: [] });
    this.app.audio.place();
  }

  _decorMesh(type, x, z, rot) {
    const buf = new GeoBuffer();
    buildDecor(buf, type, 0, 0, rot, decorSeed(type, x, z));
    const mesh = buildBufferMesh(buf, this.app.materials);
    mesh.position.set(x * CELL, 0, z * CELL);
    return mesh;
  }

  _rect(a, b) {
    return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
  }

  _hangarProblem(r, ignore = null) {
    const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
    if (w < 2 || d < 2) return 'Drag over at least 2×2 cells.';
    if (w > MAX_HANGAR_SIDE || d > MAX_HANGAR_SIDE) return `A hangar can be at most ${MAX_HANGAR_SIDE} cells long.`;
    if (this.hangars.some((h) => h !== ignore && r.x0 <= h.x1 && r.x1 >= h.x0 && r.z0 <= h.z1 && r.z1 >= h.z0)) return 'Hangars cannot overlap.';
    if (this.hangars.length >= MAX_HANGARS) return `At most ${MAX_HANGARS} hangars per track.`;
    return null;
  }

  finishHangarDrag() {
    const drag = this.hangarDrag;
    this.hangarDrag = null;
    if (!drag || !this.cursor) { this._updatePreview(); return; }
    const r = this._rect(drag, this.cursor);
    const problem = this._hangarProblem(r);
    if (problem) { this.app.audio.denied(); this.app.ui.toast(problem, 'error'); this._updatePreview(); return; }
    // tall decor cannot stand under a roof
    const remove = this.decor.filter((d) => DECOR[d.type].tall && d.x >= r.x0 && d.x <= r.x1 && d.z >= r.z0 && d.z <= r.z1).map((d) => this._plain(d));
    this._commit({ add: [{ kind: 'hangar', ...r }], remove });
    this.app.audio.place();
  }

  // translucent walls without a roof, so the track inside stays visible
  _hangarMesh(r, color, opacity) {
    const occ = occupancy(this.blocks);
    const H = hangarHeight(r, occ);
    const X0 = r.x0 * CELL - CELL / 2, X1 = r.x1 * CELL + CELL / 2, Z0 = r.z0 * CELL - CELL / 2, Z1 = r.z1 * CELL + CELL / 2;
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(X1 - X0, H, Z1 - Z0);
    geo.translate((X0 + X1) / 2, H / 2, (Z0 + Z1) / 2);
    const walls = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    walls.userData.ownMaterial = true;
    walls.renderOrder = 4;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
    edges.userData.ownMaterial = true;
    g.add(walls, edges);
    return g;
  }

  _refreshHangars() {
    for (const h of this.hangars) {
      this._dispose(h.mesh);
      h.mesh = this._hangarMesh(h, 0xf2b705, 0.1);
      this.sceneryGroup.add(h.mesh);
    }
  }

  // open ports (no neighbour) for markers and auto-rotation
  _updatePorts() {
    const map = new Map();
    for (const b of this.blocks) {
      b.wports = BLOCKS[b.type].ports.map((_, i) => worldPort(b, i));
      for (const p of b.wports) if (!p.open) {
        const k = portKey(p.p);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push({ b, p });
      }
    }
    this.openPorts = [];
    for (const b of this.blocks) {
      for (const p of b.wports) {
        if (p.open) continue;
        const list = map.get(portKey(p.p)) || [];
        if (!list.some((o) => o.b !== b && ((o.p.d + 2) & 3) === p.d)) this.openPorts.push({ b, p });
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    let n = 0;
    for (const { p } of this.openPorts) {
      if (n >= 256) break;
      const [dx, dz] = DIRS[p.d];
      pos.set(p.p[0] + dx * 3, p.p[1] + ROAD_Y + 3.5, p.p[2] + dz * 3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dx, -dz) + Math.PI);
      m.compose(pos, q, s);
      this.portMesh.setMatrixAt(n++, m);
    }
    this.portMesh.count = n;
    this.portMesh.instanceMatrix.needsUpdate = true;
  }

  // if the hovered cell sits right after an open port on this level, face the block into it
  _autoRotate() {
    if (!this.autoRot || !this.cursor || !this.openPorts) return;
    const def = BLOCKS[this.type];
    for (const { p } of this.openPorts) {
      const [dx, dz] = DIRS[p.d];
      const cx = Math.round((p.p[0] + dx * 16) / CELL), cz = Math.round((p.p[2] + dz * 16) / CELL);
      if (cx === this.cursor.x && cz === this.cursor.z && Math.round(p.p[1] / LEVEL) === this.level) {
        this.rot = (((p.d + 2 - def.ports[0].d) % 4) + 4) % 4;
        return;
      }
    }
  }

  // ---- preview -------------------------------------------------------------------------------
  _updatePreview() {
    if (this.preview) {
      this.group.remove(this.preview);
      if (this.preview.userData.scenery) this.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.userData.ownMaterial) o.material.dispose(); });
      this.preview = null;
    }
    this.footMesh.count = 0;
    if (!this.cursor || this.tool !== 'place' || !this.active) return;
    if (this.cat === 'hangar' || this.cat === 'decor') { this._sceneryPreview(); return; }
    this._autoRotate();
    const c = this._candidate();
    const ok = this._fits(c);
    this.preview = buildBlockMesh(c.type, c.surf, this.app.materials, c.edge);
    this.previewMat.emissive.set(ok ? 0x32d67a : 0xff4d4d);
    this.preview.traverse((o) => { if (o.isMesh) { o.material = this.previewMat; o.castShadow = false; o.renderOrder = 5; } });
    this.preview.position.set(c.x * CELL, c.y * LEVEL + 0.05, c.z * CELL);
    this.preview.rotation.y = (-c.rot * Math.PI) / 2;
    this.group.add(this.preview);
    this.footMat.color.set(ok ? 0x32d67a : 0xff4d4d);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const [x, y, z] of this._cells(c)) {
      if (n >= 64) break;
      m.makeTranslation(x * CELL, y * LEVEL + 0.2, z * CELL);
      this.footMesh.setMatrixAt(n++, m);
    }
    this.footMesh.count = n;
    this.footMesh.instanceMatrix.needsUpdate = true;
    this._refreshInfo(true);
  }

  _sceneryPreview() {
    const c = this.cursor;
    let ok, cells;
    if (this.cat === 'hangar') {
      const r = this.hangarDrag ? this._rect(this.hangarDrag, c) : { x0: c.x, z0: c.z, x1: c.x, z1: c.z };
      ok = !this.hangarDrag || !this._hangarProblem(r);
      if (this.hangarDrag) {
        this.preview = this._hangarMesh(r, ok ? 0x32d67a : 0xff4d4d, 0.22);
        this.preview.userData.scenery = true;
        this.group.add(this.preview);
      }
      cells = [];
      for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) cells.push([x, z]);
    } else {
      ok = this._decorFits(this.decorType, c.x, c.z);
      this.preview = this._decorMesh(this.decorType, c.x, c.z, this.rot);
      this.preview.userData.scenery = true;
      this.preview.traverse((o) => { if (o.isMesh) { o.material = this.previewMat; o.castShadow = false; o.renderOrder = 5; } });
      this.previewMat.emissive.set(ok ? 0x32d67a : 0xff4d4d);
      this.group.add(this.preview);
      cells = [[c.x, c.z]];
    }
    this.footMat.color.set(ok ? 0x32d67a : 0xff4d4d);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const [x, z] of cells) {
      if (n >= 256) break;
      m.makeTranslation(x * CELL, 0.2, z * CELL);
      this.footMesh.setMatrixAt(n++, m);
    }
    this.footMesh.count = n;
    this.footMesh.instanceMatrix.needsUpdate = true;
    this._refreshInfo(true);
  }

  _onGround() { return this.cat === 'hangar' || this.cat === 'decor'; }

  _updateGrid() {
    this.grid.position.set(0, (this._onGround() ? 0 : this.level * LEVEL) + 0.06, 0);
  }

  // ---- camera ---------------------------------------------------------------------------------
  _frameCamera() {
    if (!this.blocks.length) { this.cam.target.set(0, 0, 0); return; }
    const box = new THREE.Box3();
    for (const b of this.blocks) box.expandByObject(b.mesh);
    box.getCenter(this.cam.target);
    this.cam.target.y = 0;
    const size = box.getSize(new THREE.Vector3());
    this.cam.dist = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.1, 140, 900);
  }

  _applyCamera() {
    const c = this.cam, cam = this.app.camera;
    c.pitch = THREE.MathUtils.clamp(c.pitch, 0.15, 1.5);
    c.dist = THREE.MathUtils.clamp(c.dist, 30, 1400);
    const lim = GRID_MAX * CELL;
    c.target.x = THREE.MathUtils.clamp(c.target.x, -lim, lim);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -lim, lim);
    cam.position.set(
      c.target.x + Math.cos(c.pitch) * Math.sin(c.yaw) * c.dist,
      c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z + Math.cos(c.pitch) * Math.cos(c.yaw) * c.dist,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(c.target);
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
  }

  update(dt) {
    if (!this.active) return;
    const keys = this.app.input.keys;
    const sp = this.cam.dist * 1.1 * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (!typing && !this.app.ui.modalOpen) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) this.cam.target.addScaledVector(fwd, sp);
      if (keys.has('KeyS') || keys.has('ArrowDown')) this.cam.target.addScaledVector(fwd, -sp);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) this.cam.target.addScaledVector(right, -sp);
      if (keys.has('KeyD') || keys.has('ArrowRight')) this.cam.target.addScaledVector(right, sp);
    }
    this._applyCamera();
    this.app.env.update(this.cam.target);
    const t = performance.now() / 1000;
    this.portMesh.material.color.setHSL(0.11, 1, 0.5 + Math.sin(t * 5) * 0.12);
  }

  // ---- input ----------------------------------------------------------------------------------
  _bindPointer() {
    const cv = this.app.canvas;
    cv.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      cv.setPointerCapture?.(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false, shift: e.shiftKey, id: e.pointerId, touch: e.pointerType === 'touch' };
      if (this.cat === 'hangar' && this.tool === 'place' && e.button === 0 && !e.shiftKey && !this.drag.touch) {
        this._hover(e);
        if (this.cursor) { this.hangarDrag = { x: this.cursor.x, z: this.cursor.z }; this._updatePreview(); }
      }
      this.pointers = this.pointers || new Map();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (this.pointers?.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers && this.pointers.size === 2) { this._pinch(); return; }
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true;
        if (d.moved) {
          const orbit = d.button === 2 || (d.touch && !d.shift && !this.hangarDrag);
          const pan = d.button === 1 || (d.button === 0 && d.shift);
          if (orbit) {
            this.cam.yaw -= dx * 0.006;
            this.cam.pitch += dy * 0.005;
          } else if (pan) {
            const k = this.cam.dist * 0.0022;
            const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
            const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
            this.cam.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
          }
          d.x = e.clientX; d.y = e.clientY;
          if (orbit || pan) return;
        }
      }
      this._hover(e);
    });
    const up = (e) => {
      if (!this.active) return;
      this.pointers?.delete(e.pointerId);
      const d = this.drag;
      this.drag = null;
      if (this.hangarDrag && d && d.id === e.pointerId) { this._hover(e); this.finishHangarDrag(); return; }
      if (!d || d.moved || d.id !== e.pointerId) return;
      this._hover(e);
      if (d.button === 0 && !d.shift) {
        if (this.tool === 'erase') this.eraseAt(e);
        else this.place();
      } else if (d.button === 2) {
        this.eraseAt(e);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { this.pointers?.delete(e.pointerId); this.drag = null; this.hangarDrag = null; });
    cv.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.cam.dist *= Math.exp(e.deltaY * 0.0012);
    }, { passive: false });
  }

  _pinch() {
    const pts = [...this.pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (this.pinchDist) this.cam.dist *= this.pinchDist / Math.max(20, dist);
    this.pinchDist = dist;
    this.drag = null;
    clearTimeout(this.pinchTimer);
    this.pinchTimer = setTimeout(() => { this.pinchDist = null; }, 150);
  }

  _ndc(e) {
    const r = this.app.canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.app.camera);
  }

  _hover(e) {
    this._ndc(e);
    _plane.set(new THREE.Vector3(0, 1, 0), this._onGround() ? 0 : -(this.level * LEVEL + ROAD_Y));
    const hit = _ray.ray.intersectPlane(_plane, _hit);
    let cur = null;
    if (hit) {
      const x = Math.round(hit.x / CELL), z = Math.round(hit.z / CELL);
      if (x >= GRID_MIN && x <= GRID_MAX && z >= GRID_MIN && z <= GRID_MAX) cur = { x, z };
    }
    const changed = (cur?.x !== this.cursor?.x) || (cur?.z !== this.cursor?.z);
    if (changed) {
      this.cursor = cur;
      this.autoRot = true;
      this._updatePreview();
    }
  }

  _pick(e) {
    this._ndc(e);
    const hits = _ray.intersectObjects(this.blockGroup.children, true);
    return hits.length ? hits[0].object.userData.block : null;
  }

  onAction(a, src) {
    if (!this.active) return;
    const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (a === 'pause') { if (typing) document.activeElement.blur(); else this.leave(); return; }
    if (a === 'mute') { this.app.ui.toast(this.app.audio.toggleMute() ? 'Sound muted' : 'Sound on'); return; }
    if (!a.startsWith('key:') || typing) return;
    const e = src;
    const code = a.slice(4);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (mod && code === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (mod) return;
    switch (code) {
      case 'KeyR': this.rotate(e.shiftKey ? -1 : 1); break;
      case 'KeyE': case 'PageUp': this.setLevel(this.level + 1); break;
      case 'KeyQ': case 'PageDown': this.setLevel(this.level - 1); break;
      case 'KeyF': this.cycleSurface(); break;
      case 'KeyV': this.setEdge(this.edge === 'open' ? 'wall' : 'open'); break;
      case 'KeyX': this.setTool(this.tool === 'erase' ? 'place' : 'erase'); break;
      case 'KeyB': this.setTool('place'); break;
      case 'KeyT': this.test(); break;
      case 'Tab': e.preventDefault?.(); this.nextCategory(); break;
      case 'Delete': case 'Backspace': if (this.lastPointer) this.eraseAt(this.lastPointer); break;
      default:
        if (/^Digit[1-9]$/.test(code)) {
          if (this.cat === 'decor') { const t = DECOR_TYPES[+code.slice(5) - 1]; if (t) this.selectDecor(t.id); break; }
          const list = BLOCK_LIST.filter((b) => b.cat === this.cat);
          const d = list[+code.slice(5) - 1];
          if (d) this.select(d.id);
        }
    }
  }

  rotate(dir) {
    this.rot = (this.rot + dir + 4) % 4;
    this.autoRot = false;
    this._updatePreview();
    this.app.audio.click();
  }

  setLevel(l) {
    this.level = Math.max(0, Math.min(MAX_LEVEL, l));
    this._updateGrid();
    this._updatePreview();
    this._refreshInfo();
  }

  setEdge(e) {
    this.edge = e;
    this.root.querySelectorAll('[data-edge]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.edge === this.edge)));
    this._updatePreview();
    this._refreshInfo(true);
  }

  cycleSurface() {
    this.surf = SURFACE_VARIANTS[(SURFACE_VARIANTS.indexOf(this.surf) + 1) % SURFACE_VARIANTS.length];
    this._syncSurface();
    this._updatePreview();
  }

  setTool(t) {
    this.tool = t;
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    this._updatePreview();
    this._refreshInfo();
  }

  select(id) {
    this.type = id;
    this.cat = BLOCKS[id].cat;
    this.hangarDrag = null;
    this._updateGrid();
    this.setTool('place');
    this._refreshPalette();
    this._updatePreview();
    this._refreshInfo();
  }

  selectDecor(id) {
    this.decorType = id;
    this.setCategory('decor');
  }

  setCategory(id) {
    this.cat = id;
    this.hangarDrag = null;
    if (id !== 'hangar' && id !== 'decor') {
      const first = BLOCKS[this.type]?.cat === id ? BLOCKS[this.type] : BLOCK_LIST.find((b) => b.cat === id);
      if (first) { this.select(first.id); return; }
    }
    this.setTool('place');
    this._updateGrid();
    this._refreshPalette();
    this._updatePreview();
    this._refreshInfo();
  }

  nextCategory() {
    const i = TABS.findIndex((c) => c.id === this.cat);
    this.setCategory(TABS[(i + 1) % TABS.length].id);
  }

  // ---- track data -------------------------------------------------------------------------------
  data() {
    return {
      name: this.meta.name, env: this.meta.env, land: this.meta.land,
      blocks: this.blocks.map((b) => (b.edge === 'open' ? [b.type, b.x, b.y, b.z, b.rot, b.surf, 'open'] : [b.type, b.x, b.y, b.z, b.rot, b.surf])),
      hangars: this.hangars.map((h) => [h.x0, h.z0, h.x1, h.z1]),
      decor: this.decor.map((d) => [d.type, d.x, d.z, d.rot]),
    };
  }

  counts() {
    let start = 0, finish = 0, cp = 0;
    for (const b of this.blocks) {
      const f = BLOCKS[b.type].feature;
      if (f === 'start') start++; else if (f === 'finish') finish++; else if (f === 'cp') cp++;
    }
    // plaza gates of side-by-side cells count once (see mergeGates)
    if (cp || finish) {
      try {
        const t = new Track({ blocks: this.data().blocks }, { collision: false });
        cp = t.checkpoints.length; finish = t.finishes.length;
      } catch { /* keep the block counts */ }
    }
    return { start, finish, cp, blocks: this.blocks.length, open: this.openPorts ? this.openPorts.length : 0 };
  }

  test() {
    const c = this.counts();
    if (!c.start) { this.app.ui.toast('Place a Start block first (Special tab).', 'error'); return; }
    this.meta.name = this.root.querySelector('#ed-name').value.trim() || 'Untitled track';
    this.hide();
    this.app.testTrack(this.data(), this.meta.name);
    if (!c.finish) this.app.ui.toast('No Finish block yet: this is a free drive.');
  }

  setAuthorTime(ms) {
    if (!ms) return;
    if (!this.counts().finish) return;
    this.authorTime = ms;
    this.dirty = true;
    this.app.ui.toast(`Author time set: ${formatTime(ms)}. Save to keep it.`);
  }

  save() {
    const c = this.counts();
    if (!c.blocks) { this.app.ui.toast('Nothing to save yet.', 'error'); return null; }
    this.meta.name = this.root.querySelector('#ed-name').value.trim() || 'Untitled track';
    if (!this.meta.id) this.meta.id = Records.newTrackId();
    const data = this.data();
    const entry = Records.saveTrack({ id: this.meta.id, name: this.meta.name, author: this.meta.author, env: this.meta.env, land: this.meta.land, blocks: data.blocks, hangars: data.hangars, decor: data.decor, authorTime: this.authorTime });
    this.dirty = false;
    this.app.ui.toast(`Saved “${entry.name}”${this.authorTime ? '' : ' (not validated yet)'}`);
    return entry;
  }

  leave() {
    if (!this.dirty) { this.app.enterMenu('title'); return; }
    this.app.ui.modal({
      title: 'Leave the editor?',
      body: '<p>You have unsaved changes.</p>',
      actions: [
        { label: 'Save and leave', primary: true, onClick: () => { if (this.save()) this.app.enterMenu('title'); } },
        { label: 'Leave without saving', danger: true, onClick: () => this.app.enterMenu('title') },
        { label: 'Stay' },
      ],
    });
  }

  clearAll() {
    if (!this.blocks.length && !this.hangars.length && !this.decor.length) return;
    this.app.ui.modal({
      title: 'Clear the track?',
      body: '<p>Every block, hangar and decor item is removed. You can undo this with Ctrl+Z.</p>',
      actions: [
        { label: 'Clear', danger: true, onClick: () => { this._commit({ add: [], remove: [...this.blocks, ...this.hangars, ...this.decor].map((b) => this._plain(b)) }); } },
        { label: 'Cancel', primary: true },
      ],
    });
  }

  // ---- UI -------------------------------------------------------------------------------------
  _buildUI() {
    const root = this.root;
    root.innerHTML = `
      <div class="ed-top">
        <button class="btn small" data-ed="menu"><span>Menu</span></button>
        <input class="text" id="ed-name" maxlength="40" aria-label="Track name" spellcheck="false">
        <select id="ed-env" aria-label="Time of day">${ENV_IDS.map((id) => `<option value="${id}">${ENV_PRESETS[id].label}</option>`).join('')}</select>
        <select id="ed-land" aria-label="Landscape">${LAND_IDS.map((id) => `<option value="${id}">${LANDS[id].label}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button class="btn small" data-ed="undo" title="Ctrl+Z"><span>Undo</span></button>
        <button class="btn small" data-ed="redo" title="Ctrl+Y"><span>Redo</span></button>
        <button class="btn small" data-ed="clear"><span>Clear</span></button>
        <button class="btn small" data-ed="settings"><span>Settings</span></button>
        <button class="btn small" data-ed="share"><span>Share</span></button>
        <button class="btn small" data-ed="save" title="Ctrl+S"><span>Save</span></button>
        <button class="btn small primary" data-ed="test"><span>Test drive <kbd>T</kbd></span></button>
      </div>
      <div class="ed-info">
        <div class="eyebrow" id="ed-mode">Placing</div>
        <div class="sel" id="ed-sel"></div>
        <div class="kv"><span>Rotation</span><span id="ed-rot"></span></div>
        <div class="kv"><span>Level</span><span id="ed-level"></span></div>
        <div class="kv"><span>Surface</span><span id="ed-surf"></span></div>
        <div class="status" id="ed-status"></div>
        <div class="ed-help">
          <kbd>Click</kbd> place · <kbd>Right-click</kbd> delete<br>
          <kbd>R</kbd> rotate · <kbd>Q</kbd>/<kbd>E</kbd> level down/up<br>
          <kbd>F</kbd> surface · <kbd>V</kbd> walls/open · <kbd>X</kbd> erase · <kbd>Tab</kbd> next tab<br>
          <kbd>Right-drag</kbd> orbit · <kbd>Shift-drag</kbd> pan · <kbd>Wheel</kbd> zoom<br>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move camera · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo<br>
          Yellow arrows mark open road ends.
        </div>
      </div>
      <div class="ed-bottom">
        <div class="ed-tabs" role="tablist" id="ed-tabs"></div>
        <div class="ed-palette" id="ed-palette"></div>
      </div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed], [data-block], [data-decor], [data-cat], [data-tool], [data-surf], [data-edge], [data-lvl]');
      if (!b) return;
      this.app.audio.click();
      if (b.dataset.ed) this._ui(b.dataset.ed);
      else if (b.dataset.block) this.select(b.dataset.block);
      else if (b.dataset.decor) this.selectDecor(b.dataset.decor);
      else if (b.dataset.cat) this.setCategory(b.dataset.cat);
      else if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (b.dataset.surf) { this.surf = b.dataset.surf; this._syncSurface(); this._updatePreview(); }
      else if (b.dataset.edge) this.setEdge(b.dataset.edge);
      else if (b.dataset.lvl) this.setLevel(this.level + +b.dataset.lvl);
    });
    root.querySelector('#ed-name').addEventListener('input', (e) => { this.meta.name = e.target.value; this.dirty = true; });
    root.querySelector('#ed-env').addEventListener('change', (e) => {
      this.meta.env = e.target.value;
      this.dirty = true;
      this.app.env.setPreset(this.meta.env, this.meta.land);
      applyMaterialMood(this.app.materials, this.meta.env);
      e.target.blur();
    });
    root.querySelector('#ed-land').addEventListener('change', (e) => {
      this.meta.land = e.target.value;
      this.dirty = true;
      this.app.env.setPreset(this.meta.env, this.meta.land);
      e.target.blur();
    });
    this.app.canvas.addEventListener('pointermove', (e) => { this.lastPointer = { clientX: e.clientX, clientY: e.clientY }; });
  }

  _ui(cmd) {
    switch (cmd) {
      case 'menu': this.leave(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'clear': this.clearAll(); break;
      case 'save': this.save(); break;
      case 'test': this.test(); break;
      case 'settings': this.app.settingsReturn = 'editor'; this.app.ui.syncSettings(); this.app.ui.showScreen('settings'); break;
      case 'share': {
        const e = this.save();
        if (e) this.app.showExport(e);
        break;
      }
      default: break;
    }
  }

  _refreshPalette() {
    const tabs = this.root.querySelector('#ed-tabs');
    tabs.innerHTML = TABS.map((c) => `<button class="tab" role="tab" data-cat="${c.id}" aria-selected="${c.id === this.cat}">${c.name}</button>`).join('') +
      `<span class="spacer"></span>` +
      (this._onGround() ? '' : `
       <div class="seg" id="ed-edges" title="Road side walls (V)"><button data-edge="wall" aria-pressed="${this.edge === 'wall'}">Walls</button><button data-edge="open" aria-pressed="${this.edge === 'open'}">Open</button></div>
       <div class="seg" id="ed-surfaces">${SURFACE_VARIANTS.map((s) => `<button data-surf="${s}" aria-pressed="${s === this.surf}">${SURF_LABEL[s]}</button>`).join('')}</div>
       <div class="seg"><button data-lvl="-1" aria-label="Level down">Level −</button><button data-lvl="1" aria-label="Level up">Level +</button></div>`) +
      `<div class="seg"><button class="ed-tool" data-tool="place" aria-pressed="${this.tool === 'place'}">Place</button><button class="ed-tool" data-tool="erase" aria-pressed="${this.tool === 'erase'}">Erase</button></div>`;
    const pal = this.root.querySelector('#ed-palette');
    if (this.cat === 'hangar') {
      pal.innerHTML = `
        <button class="ed-block" aria-pressed="true" title="Hangar"><img src="${HANGAR_ICON}" alt=""><span>Hangar</span></button>
        <div class="ed-hint">Drag on the ground to cover part of your track with a hangar.<br>Roads that cross its walls get gates, the roof height is automatic.<br>Right-click inside a hangar to remove it.</div>`;
      return;
    }
    if (this.cat === 'decor') {
      pal.innerHTML = DECOR_TYPES.map((d, i) => `
        <button class="ed-block" data-decor="${d.id}" aria-pressed="${d.id === this.decorType}" title="${esc(d.name)} (${i + 1})">
          ${this.thumbs['decor:' + d.id] ? `<img src="${this.thumbs['decor:' + d.id]}" alt="">` : '<span class="ph"></span>'}
          <span>${esc(d.name)}</span>
        </button>`).join('');
      return;
    }
    pal.innerHTML = BLOCK_LIST.filter((b) => b.cat === this.cat).map((b, i) => `
      <button class="ed-block" data-block="${b.id}" aria-pressed="${b.id === this.type}" title="${esc(b.name)} (${i + 1})">
        ${this.thumbs[b.id] ? `<img src="${this.thumbs[b.id]}" alt="">` : '<span class="ph"></span>'}
        <span>${esc(b.name)}</span>
      </button>`).join('');
  }

  _syncSurface() {
    this.root.querySelectorAll('[data-surf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.surf === this.surf)));
    this._refreshInfo();
  }

  _refreshInfo(light = false) {
    if (!this.built) return;
    const R = this.root;
    const def = BLOCKS[this.type];
    const erase = this.tool === 'erase';
    let sel = erase ? 'Click a block' : def.name;
    if (this.cat === 'hangar') sel = erase ? 'Click a hangar' : 'Hangar: drag on the ground';
    if (this.cat === 'decor') sel = erase ? 'Click a decor item' : DECOR[this.decorType].name;
    R.querySelector('#ed-mode').textContent = erase ? 'Erasing' : 'Placing';
    R.querySelector('#ed-sel').textContent = sel;
    R.querySelector('#ed-rot').textContent = this.cat === 'hangar' ? '-' : `${this.rot * 90}°`;
    R.querySelector('#ed-level').textContent = this._onGround() ? 'Ground' : String(this.level);
    R.querySelector('#ed-surf').textContent = this._onGround() ? '-' : (def.surfaces ? SURF_LABEL[this.surf] : 'Road only') + (def.profile === 'road' && this.edge === 'open' ? ', open' : '');
    if (light) return;
    const c = this.counts();
    const ok = (b, text) => `<span class="${b ? 'ok' : 'bad'}">${b ? '✓' : '✗'}</span> ${text}`;
    R.querySelector('#ed-status').innerHTML = [
      ok(c.start === 1, 'Start block'),
      ok(c.finish > 0, `Finish (${c.finish})`),
      `<span class="ok">•</span> Checkpoints: ${c.cp}`,
      `<span class="ok">•</span> Blocks: ${c.blocks} · open ends: ${c.open}`,
      `<span class="ok">•</span> Hangars: ${this.hangars.length} · decor: ${this.decor.length}`,
      this.authorTime ? `<span class="ok">✓</span> Author time ${formatTime(this.authorTime)}` : '<span class="bad">✗</span> Not validated: finish a test drive',
    ].join('<br>');
  }

  // Render small previews of every block with the main renderer.
  _makeThumbs() {
    if (this.thumbsDone) return;
    this.thumbsDone = true;
    const app = this.app, r = app.renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a222d);
    scene.environment = app.scene.environment;
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x303844, 1.4));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(60, 120, 40);
    scene.add(dl);
    const cam = new THREE.PerspectiveCamera(32, 4 / 3, 1, 5000);
    const W = 160, H = 120;
    const pr = r.getPixelRatio();
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const prevShadow = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    r.setScissorTest(true);
    for (const def of BLOCK_LIST) {
      const mesh = buildBlockMesh(def.id, 'road', app.materials);
      scene.add(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const c = box.getCenter(new THREE.Vector3());
      const rad = box.getSize(new THREE.Vector3()).length() / 2;
      cam.position.copy(c).add(new THREE.Vector3(1, 0.85, 1.05).normalize().multiplyScalar(rad * 2.9));
      cam.lookAt(c);
      r.setViewport(0, 0, W / pr, H / pr);
      r.setScissor(0, 0, W / pr, H / pr);
      r.render(scene, cam);
      const src = r.domElement;
      ctx.drawImage(src, 0, src.height - H, W, H, 0, 0, W, H);
      this.thumbs[def.id] = canvas.toDataURL('image/jpeg', 0.85);
      scene.remove(mesh);
    }
    for (const d of DECOR_TYPES) {
      const mesh = this._decorMesh(d.id, 0, 0, 1);
      scene.add(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const c = box.getCenter(new THREE.Vector3());
      const rad = box.getSize(new THREE.Vector3()).length() / 2;
      cam.position.copy(c).add(new THREE.Vector3(1, 0.6, 1.05).normalize().multiplyScalar(rad * 2.4));
      cam.lookAt(c);
      r.setViewport(0, 0, W / pr, H / pr);
      r.setScissor(0, 0, W / pr, H / pr);
      r.render(scene, cam);
      const src = r.domElement;
      ctx.drawImage(src, 0, src.height - H, W, H, 0, 0, W, H);
      this.thumbs['decor:' + d.id] = canvas.toDataURL('image/jpeg', 0.85);
      scene.remove(mesh);
      mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    r.setScissorTest(false);
    const size = r.getSize(new THREE.Vector2());
    r.setViewport(0, 0, size.x, size.y);
    r.shadowMap.enabled = prevShadow;
  }
}
