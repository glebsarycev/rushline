// Application controller: owns the renderer, the scene and the game modes
// (menu attract mode, racing, editor) and wires physics, rendering, audio and UI.

import * as THREE from 'three';
import { PHYS_DT, SURFACES } from './config.js';
import { Track } from './track/track.js';
import { CAMPAIGN } from './track/campaign.js';
import { Race } from './game/race.js';
import { Bot } from './game/bot.js';
import * as Records from './game/records.js';
import { load as loadStore, save as saveStore } from './util/storage.js';
import { createTextures } from './render/textures.js';
import { createMaterials, applyMaterialMood } from './render/materials.js';
import { buildTrackMesh, disposeGroup } from './render/trackMesh.js';
import { CarView } from './render/carModel.js';
import { GlbCarView } from './render/glbCarView.js';
import { loadCarAsset } from './render/carAsset.js';
import { IndoorLighting } from './render/indoor.js';
import { Ghost } from './game/ghost.js';
import { Environment } from './render/environment.js';
import { Particles, SkidMarks } from './render/effects.js';
import { CameraRig } from './render/cameraRig.js';
import { Post } from './render/post.js';
import { AudioEngine } from './audio/audio.js';
import { Input } from './input/input.js';
import { UI } from './ui/ui.js';
import { Editor } from './editor/editor.js';
import { clamp, formatTime } from './util/math.js';

const _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _up = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// Render tiers from sharpest to cheapest. On a retina screen, 4x MSAA on the
// full-size HDR target costs more than everything else in the frame.
function renderTiers(dpr) {
  if (dpr < 1.4) return [{ pr: 1, samples: 4 }, { pr: 1, samples: 2 }, { pr: 1, samples: 0 }];
  return [{ pr: 2, samples: 4 }, { pr: 1.5, samples: 2 }, { pr: 1.5, samples: 0 }, { pr: 1.25, samples: 0 }, { pr: 1, samples: 0 }];
}

export class App {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.settings = Records.loadSettings();
    this.audio = new AudioEngine();
    this.input = new Input();
    this.ui = new UI(uiRoot, this);
    this.mode = 'boot';
    this.paused = false;
    this.acc = 0;
    this.alpha = 0;
    this.prevPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), speed: 0, grounded: 4, airTime: 0, boost: 0 };
    this.ghostPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.frameFx = { impact: 0, landing: 0, scrape: 0 };
    this.attractIndex = 0;
    this.fps = { frames: 0, t: 0 };
    // automatic quality: the tier reached is kept for the next visit
    this.perf = { tier: loadStore('perf.tier', 0) | 0, quality: null, acc: 0, n: 0, hold: 3 };
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  async init() {
    this.ui.showLoading(true, 'Loading fonts');
    try { await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fonts are optional */ }
    this.ui.showLoading(true, 'Building the stadium');
    await new Promise((r) => setTimeout(r, 20));

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);
    this.textures = createTextures();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const t of Object.values(this.textures)) {
      if (Array.isArray(t)) t.forEach((x) => { x.anisotropy = aniso; }); else if (t && t.isTexture) t.anisotropy = aniso;
    }
    this.materials = createMaterials(this.textures);
    this.env = new Environment(renderer, this.scene, this.textures);
    // hangar interiors: dim sun/sky inside, lamp light pools
    this.indoor = new IndoorLighting();
    for (const m of Object.values(this.materials)) this.indoor.patch(m);
    this.indoor.patch(this.env.groundMat);
    this.post = new Post(renderer, this.scene, this.camera);
    this.rig = new CameraRig(this.camera);
    this.smoke = new Particles(1600, this.textures.dot, false);
    this.sparks = new Particles(700, this.textures.dot, true);
    this.skids = new SkidMarks(5000);
    this.scene.add(this.smoke.points, this.sparks.points, this.skids.mesh);
    // player car: the glTF model, or the built-in procedural car if it can't be loaded
    this.ui.showLoading(true, 'Loading the car');
    try {
      this.carAsset = await loadCarAsset();
    } catch (err) {
      console.warn('Car model unavailable, using the built-in car:', err && err.message ? err.message : err);
      this.carAsset = null;
    }
    const makeCar = (opts) => (this.carAsset ? new GlbCarView(this.carAsset, opts) : new CarView(opts));
    this.carView = makeCar({ color: this.settings.color });
    this.scene.add(this.carView.object);
    this.ghostView = makeCar({ ghost: true });
    this.ghostView.object.visible = false;
    this.scene.add(this.ghostView.object);
    // the author medal run of campaign tracks, raced alongside your personal best
    this.authorView = makeCar({ ghost: 'author' });
    this.authorView.object.visible = false;
    this.scene.add(this.authorView.object);
    this.indoor.patchObject(this.authorView.object);
    this.indoor.patchObject(this.carView.object);
    this.indoor.patchObject(this.ghostView.object);
    this.editor = new Editor(this);

    this.campaign = CAMPAIGN.map((def) => ({ ...def, data: { ...def.build(), env: def.env, land: def.land, name: def.name } }));

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onAction((a, src) => this.onAction(a, src));
    this.canvas.addEventListener('pointerdown', () => { this.audio.init(); this._maybeStartMusic(); });
    window.addEventListener('keydown', () => { this.audio.init(); this._maybeStartMusic(); }, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'race' && this.race?.state === 'running') this.setPaused(true); });

    this.applySettings();
    // the menu's first track: have its sky and landscape in before the first frame
    this.ui.showLoading(true, 'Painting the sky');
    const first = this.campaign[this.attractIndex % this.campaign.length];
    try { await this.env.preload(first.env, first.land); } catch { /* the sky falls back to plain colours */ }
    this.startAttract();
    this.ui.showLoading(false);
    this.ui.showScreen('title');
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    const tiers = renderTiers(dpr);
    const base = q === 'low' ? tiers.length - 1 : q === 'medium' ? Math.min(2, tiers.length - 1) : 0;
    const tier = tiers[Math.min(tiers.length - 1, Math.max(base, this.perf.tier))];
    const pr = Math.min(dpr, tier.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    this.post.setSamples(tier.samples);
    const scale = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.smoke.material.uniforms.uScale.value = scale;
    this.sparks.material.uniforms.uScale.value = scale;
  }

  applySettings() {
    const s = this.settings;
    Records.saveSettings(s);
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, engine: s.engine, music: s.music });
    if (this.renderer) {
      // picking a quality by hand restarts the automatic tuning from there
      if (this.perf.quality && this.perf.quality !== s.quality) { this.perf.tier = 0; saveStore('perf.tier', 0); }
      this.perf.quality = s.quality;
      this.post.enabled = s.bloom && s.quality !== 'low';
      this.env.setShadowQuality(s.quality === 'low' ? 'low' : s.quality === 'medium' ? 'medium' : 'high');
      this.resize();
      this.carView.setColor(s.color);
      this.rig.setMode(s.camera);
    }
    this.ui.syncSettings();
    if (this.mode === 'race') {
      if (s.raceMusic) this.audio.startMusic(); else this.audio.stopMusic();
    }
  }

  _maybeStartMusic() {
    if (this.mode === 'menu' || this.mode === 'editor' || (this.mode === 'race' && this.settings.raceMusic)) this.audio.startMusic();
  }

  // ---- tracks -----------------------------------------------------------------------------
  loadTrack(data, id) {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      disposeGroup(this.trackGroup);
      this.trackGroup = null;
    }
    this.track = new Track({ ...data, id });
    this.trackGroup = buildTrackMesh(this.track, this.materials);
    this.scene.add(this.trackGroup);
    this.env.setPreset(this.track.env, this.track.land);
    applyMaterialMood(this.materials, this.track.env);
    this.carView.setHeadlights(this.track.env === 'night');
    this.env.buildStadium(this.track);
    this.indoor.setTrack(this.track);
    this.indoor.setEnabled(true);
    this.perf.hold = 2; // shaders and textures warm up after a track change
    this.skids.clear();
    this.smoke.clear();
    this.sparks.clear();
    return this.track;
  }

  // a campaign track opens once the one before it has been finished
  campaignEntries() {
    return this.campaign.map((c, i) => ({
      ...c,
      record: Records.getRecord(c.id),
      locked: i > 0 && !Records.getRecord(this.campaign[i - 1].id),
      lockedBy: i > 0 ? this.campaign[i - 1].name : null,
    }));
  }

  // ---- menu attract mode ------------------------------------------------------------------
  startAttract() {
    const entry = this.campaign[this.attractIndex % this.campaign.length];
    this.loadTrack(entry.data, entry.id);
    this.race = new Race(this.track);
    this.race.reset({ countdown: false });
    this.bot = this.track.route ? new Bot(this.track.route, this.race.car, { skill: 1.05, fullSpeed: entry.style === 'fs' }) : null;
    this.mode = 'menu';
    this.paused = false;
    this.context = null;
    this.carView.object.visible = true;
    this.ghostView.object.visible = false;
    this.authorView.object.visible = false;
    this.ui.showHud(false);
    this.ui.showFinish(null);
    this.ui.showPause(false);
    this.input.captureKeys = false;
    this.rig.tv = null;
    this._snapPose();
    this.audio.stopEngine();
    this._maybeStartMusic();
  }

  enterMenu(screen = 'title') {
    this.editor.exit();
    if (this.mode !== 'menu') this.startAttract();
    this.ui.showScreen(screen);
    if (screen === 'campaign') this.ui.renderCampaign(this.campaignEntries());
    if (screen === 'mytracks') this.ui.renderMyTracks(this._myTracks());
  }

  _myTracks() {
    return Records.listTracks().map((t) => ({ ...t, record: Records.getRecord(t.id) }));
  }

  navigate(to) {
    this._maybeStartMusic();
    switch (to) {
      case 'title': this.ui.showScreen('title'); break;
      case 'campaign': this.ui.renderCampaign(this.campaignEntries()); this.ui.showScreen('campaign'); break;
      case 'mytracks': this.ui.renderMyTracks(this._myTracks()); this.ui.showScreen('mytracks'); break;
      case 'settings': this.settingsReturn = this.ui.screen || 'title'; this.ui.syncSettings(); this.ui.showScreen('settings'); break;
      case 'help': this.ui.showScreen('help'); break;
      case 'editor': this.openEditor(null); break;
      default: break;
    }
  }

  // ---- racing -----------------------------------------------------------------------------
  playCampaign(index) {
    const c = this.campaign[index];
    if (!c) { this.enterMenu('campaign'); return; }
    const entry = this.campaignEntries()[index];
    if (entry.locked) {
      this.ui.toast(`Finish ${entry.lockedBy} to unlock ${c.name}.`);
      this.enterMenu('campaign');
      return;
    }
    this.playTrack({ id: c.id, name: c.name, data: c.data, medals: c.medals, style: c.style, from: 'campaign', index, sub: `Campaign ${String(index + 1).padStart(2, '0')}` });
  }

  playCustom(id) {
    const t = Records.listTracks().find((x) => x.id === id);
    if (!t) return;
    const medals = t.authorTime ? Records.medalsFromAuthor(t.authorTime) : null;
    this.playTrack({ id: t.id, name: t.name, data: { blocks: t.blocks, hangars: t.hangars, decor: t.decor, env: t.env, land: t.land, name: t.name }, medals, from: 'custom', sub: `By ${t.author || 'you'}` });
  }

  playTrack(ctx) {
    this.audio.init();
    this.editor.hide();
    this.context = ctx;
    this.loadTrack(ctx.data, ctx.id);
    if (!this.track.spawn) { this.ui.toast('This track has no Start block.', 'error'); this.enterMenu('title'); return; }
    this.race = new Race(this.track);
    this._wireRace(this.race);
    this.bestRecord = ctx.from === 'editor' ? null : Records.getRecord(ctx.id);
    this.bestGhost = ctx.from === 'editor' ? this.editor.testGhost : Records.getGhost(ctx.id);
    this.tutorial = ctx.from === 'campaign' && !loadStore('tutorial.done', false);
    // author ghosts ship with the campaign (written by tests/medals.mjs), loaded on demand
    this.authorGhost = null;
    if (ctx.from === 'campaign') {
      import('./track/authorGhosts.js').then((m) => {
        if (this.context === ctx) this.authorGhost = Ghost.deserialize(m.AUTHOR_GHOSTS[ctx.id]);
      }).catch(() => { /* no author ghost */ });
    }
    this.mode = 'race';
    this.paused = false;
    this.ui.showScreen(null);
    this.ui.showPause(false);
    this.ui.showHud(true);
    this.ui.setTouchVisible(this.touch);
    this.ui.setHudInfo(ctx.name, ctx.sub || '');
    this._refreshMedalBoard();
    this.input.captureKeys = true;
    this.carView.object.visible = true;
    this.audio.startEngine();
    if (this.settings.raceMusic) this.audio.startMusic(); else this.audio.stopMusic();
    this.restart();
    this.canvas.focus({ preventScroll: true });
  }

  _refreshMedalBoard() {
    const ctx = this.context;
    const cur = ctx.from === 'editor' && this.editor.authorTime ? { label: 'Author', time: this.editor.authorTime } : null;
    this.ui.setMedalBoard(ctx.medals, this.bestRecord ? this.bestRecord.best : ctx.from === 'editor' ? this.editor.testBest : null, cur);
  }

  _wireRace(race) {
    race.on('count', (n) => { this.ui.countdown(n); this.audio.countdown(n); });
    race.on('go', () => { this.ui.countdown(0); this.audio.go(); });
    race.on('checkpoint', (e) => {
      const ms = e.time * 1000;
      const ref = this.bestRecord?.splits?.[e.n - 1] ?? (this.context.from === 'editor' ? this.editor.testSplits?.[e.n - 1] : null);
      const delta = ref != null ? ms - ref : null;
      this.ui.showSplit(ms, delta);
      this.ui.setCp(e.n, e.total);
      this.audio.checkpoint(delta == null ? null : delta <= 0);
    });
    race.on('finish', (e) => this._onFinish(e));
    race.on('boost', (lvl) => { this.audio.boost(lvl); this.rig.addShake(0.2); });
    race.on('missing', (e) => this.ui.toast(`Missing checkpoints: ${e.taken} of ${e.total} taken`, 'error'));
    race.on('autoRespawn', () => this.respawn());
  }

  restart() {
    if (!this.race) return;
    this.race.reset();
    this.skids.clear();
    this.smoke.clear();
    this.sparks.clear();
    this.ui.clearSplit();
    this.ui.showFinish(null);
    this.ui.hint(null);
    this.ui.setCp(0, this.track.checkpoints.length);
    this.finishTimer = null;
    this.acc = 0;
    this._snapPose();
    this.rig.snap(this.pose);
  }

  respawn() {
    if (this.mode !== 'race' || !this.race) return;
    if (this.race.state === 'finished') { this.restart(); return; }
    if (this.race.state !== 'running' || !this.race.respawn()) { this.restart(); return; }
    this.audio.respawn();
    this.skids.lift(0); this.skids.lift(1); this.skids.lift(2); this.skids.lift(3);
    this._snapPose();
    this.rig.snap(this.pose);
  }

  _onFinish(e) {
    if (this.tutorial) { this.tutorial = false; saveStore('tutorial.done', true); }
    const ctx = this.context;
    const ms = Math.round(e.time * 1000);
    const ghost = this.race.ghost();
    let result = { improved: false, prev: null, record: null };
    if (ctx.from === 'editor') {
      const prev = this.editor.testBest;
      result = { improved: prev == null || ms < prev, prev };
      if (result.improved) { this.editor.testBest = ms; this.editor.testGhost = ghost; this.editor.testSplits = e.splits.map((s) => Math.round(s * 1000)); this.bestGhost = ghost; }
    } else {
      result = Records.submitRun(ctx.id, ms, e.splits, ghost, ctx.medals);
      if (result.improved) { this.bestRecord = result.record; this.bestGhost = ghost; }
    }
    const medal = Records.medalFor(ms, ctx.medals);
    this.audio.finish(result.improved);
    if (medal && result.improved) this.audio.medal();
    this._confetti();
    this.rig.addShake(0.3);
    const best = ctx.from === 'editor' ? this.editor.testBest : this.bestRecord?.best;
    let buttons;
    if (ctx.from === 'editor') {
      buttons = [
        { act: 'retry', label: 'Retry', key: 'R' },
        { act: 'set-author', label: 'Use as author time', primary: true },
        { act: 'quit', label: 'Back to editor', key: 'Esc' },
      ];
    } else if (ctx.from === 'campaign') {
      buttons = [
        { act: 'retry', label: 'Retry', key: 'R', primary: true },
        ...(ctx.index < this.campaign.length - 1 ? [{ act: 'next', label: 'Next track', key: 'N' }] : []),
        { act: 'menu', label: 'Menu', key: 'Esc' },
      ];
    } else {
      buttons = [{ act: 'retry', label: 'Retry', key: 'R', primary: true }, { act: 'menu', label: 'Menu', key: 'Esc' }];
    }
    this.lastFinish = { time: ms };
    this._refreshMedalBoard();
    clearTimeout(this.finishTimer);
    this.finishTimer = setTimeout(() => {
      if (this.mode !== 'race' || this.race.state !== 'finished') return;
      this.ui.showFinish({ trackName: ctx.name, time: ms, prev: result.prev ? (result.prev.best ?? result.prev) : null, improved: result.improved, best, respawns: e.respawns, medal, medals: ctx.medals, buttons });
    }, 900);
  }

  _confetti() {
    const p = this.race.car.pos;
    const colors = [[1, 0.72, 0.15], [1, 0.42, 0.1], [0.23, 0.63, 1], [1, 1, 1], [0.2, 0.85, 0.5]];
    for (let i = 0; i < 160; i++) {
      const c = colors[i % colors.length];
      this.sparks.emit(p.x + (Math.random() - 0.5) * 16, p.y + 6 + Math.random() * 3, p.z + (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 8, 4 + Math.random() * 7, (Math.random() - 0.5) * 8,
        { size: 0.35, grow: 0, life: 2 + Math.random(), alpha: 1, color: c, drag: 0.8, gravity: 6 });
    }
  }

  setPaused(on) {
    if (this.mode !== 'race') return;
    if (this.race.state === 'finished' && on) return;
    this.paused = on;
    this.ui.showPause(on, this.context?.name, this.context?.from === 'editor');
    if (on) this.audio.stopEngine(); else this.audio.startEngine();
    this.input.captureKeys = !on;
  }

  // ---- actions -------------------------------------------------------------------------------
  onAction(a, src) {
    if (this.ui.modalOpen) { if (a === 'pause') this.ui.closeModal(); return; }
    if (this.mode === 'editor') { this.editor.onAction(a, src); return; }
    if (this.mode === 'race') {
      const fin = this.race.state === 'finished';
      switch (a) {
        case 'pause':
          if (fin) { this.action(this.context.from === 'editor' ? 'quit' : 'menu'); break; }
          if (this.ui.screen === 'settings') { this.action('settings-back'); break; }
          this.setPaused(!this.paused);
          break;
        case 'respawn': if (!this.paused) this.respawn(); break;
        case 'restart': if (this.paused) this.setPaused(false); this.restart(); break;
        case 'camera': this.settings.camera = this.rig.cycle(); this.ui.syncSettings(); this.ui.toast(`Camera: ${{ chase: 'close', far: 'far', hood: 'hood' }[this.rig.mode]}`); break;
        case 'cam1': case 'cam2': case 'cam3': this.rig.setMode(['chase', 'far', 'hood'][+a.slice(3) - 1]); break;
        case 'ghost': {
          // both -> personal best only -> author only -> none
          const s = this.settings, state = (s.ghost ? 1 : 0) + (s.authorGhost ? 2 : 0);
          const next = { 3: 1, 1: 2, 2: 0, 0: 3 }[state];
          s.ghost = !!(next & 1); s.authorGhost = !!(next & 2);
          this.applySettings();
          this.ui.toast(['Ghosts off', 'Your best ghost', 'Author ghost', 'Your best + author ghosts'][next]);
          break;
        }
        case 'mute': this.ui.toast(this.audio.toggleMute() ? 'Sound muted' : 'Sound on'); break;
        case 'next': if (fin && this.context.from === 'campaign') this.action('next'); break;
        case 'hud': this.ui.$('#hud').hidden = !this.ui.$('#hud').hidden; break;
        default: break;
      }
      return;
    }
    if (this.mode === 'menu') {
      if (a === 'pause' && this.ui.screen && this.ui.screen !== 'title') {
        if (this.ui.screen === 'settings') this.action('settings-back'); else this.ui.showScreen('title');
      } else if (a === 'mute') this.ui.toast(this.audio.toggleMute() ? 'Sound muted' : 'Sound on');
    }
  }

  action(act, data = {}) {
    switch (act) {
      case 'play-campaign': this.playCampaign(+data.index); break;
      case 'resume': this.setPaused(false); break;
      case 'restart': this.setPaused(false); this.restart(); break;
      case 'retry': this.restart(); break;
      case 'next': this.playCampaign((this.context?.index ?? -1) + 1); break;
      case 'quit':
        this.paused = false;
        this.ui.showPause(false);
        if (this.context?.from === 'editor') this.returnToEditor();
        else this.enterMenu(this.context?.from === 'custom' ? 'mytracks' : 'campaign');
        break;
      case 'menu': this.enterMenu(this.context?.from === 'custom' ? 'mytracks' : 'campaign'); break;
      case 'pause-settings': this.settingsReturn = 'pause'; this.ui.showPause(false); this.ui.syncSettings(); this.ui.showScreen('settings'); break;
      case 'settings-back':
        if (this.settingsReturn === 'pause') { this.ui.showScreen(null); this.ui.showPause(true, this.context?.name, this.context?.from === 'editor'); } else if (this.settingsReturn === 'editor') { this.ui.showScreen(null); } else this.ui.showScreen(this.settingsReturn && this.settingsReturn !== 'settings' ? this.settingsReturn : 'title');
        break;
      case 'set-author': this.editor.setAuthorTime(this.lastFinish?.time); this.returnToEditor(); break;
      case 'new-track': this.openEditor(null); break;
      case 'play-custom': this.playCustom(data.id); break;
      case 'edit-custom': this.openEditor(Records.listTracks().find((t) => t.id === data.id)); break;
      case 'export-custom': this.showExport(Records.listTracks().find((t) => t.id === data.id)); break;
      case 'delete-custom': this.confirmDelete(data.id); break;
      case 'import': this.showImport(); break;
      default: this.editor.action?.(act, data); break;
    }
  }

  showExport(t) {
    if (!t) return;
    const code = Records.exportCode(t);
    this.ui.modal({
      title: 'Share track',
      body: `<p>Send this code to a friend. They can paste it under My tracks → Import code.</p><textarea readonly id="share-code">${code}</textarea>`,
      actions: [
        { label: 'Copy code', primary: true, onClick: (panel) => {
          const ta = panel.querySelector('textarea');
          navigator.clipboard?.writeText(code).then(() => this.ui.toast('Code copied'), () => { ta.select(); this.ui.toast('Press Ctrl+C to copy'); });
          if (!navigator.clipboard) { ta.select(); this.ui.toast('Press Ctrl+C to copy'); }
          return true;
        } },
        { label: 'Close' },
      ],
    });
  }

  showImport() {
    this.ui.modal({
      title: 'Import track',
      body: '<p>Paste a track code that starts with RL1.</p><textarea id="import-code" placeholder="RL1:..."></textarea>',
      actions: [
        { label: 'Import', primary: true, onClick: (panel) => {
          try {
            const t = Records.importCode(panel.querySelector('textarea').value);
            const saved = Records.saveTrack({ ...t, id: Records.newTrackId() });
            this.ui.toast(`Imported “${saved.name}”`);
            this.ui.renderMyTracks(this._myTracks());
            return false;
          } catch (err) {
            this.ui.toast(err.message && err.message.includes('track') ? err.message : 'That code could not be read. Check that it was copied completely.', 'error');
            return true;
          }
        } },
        { label: 'Cancel' },
      ],
    });
  }

  confirmDelete(id) {
    const t = Records.listTracks().find((x) => x.id === id);
    if (!t) return;
    this.ui.modal({
      title: 'Delete track?',
      body: `<p>“${t.name.replace(/</g, '&lt;')}” and its best time will be removed from this browser.</p>`,
      actions: [
        { label: 'Delete', danger: true, onClick: () => { Records.deleteTrack(id); this.ui.renderMyTracks(this._myTracks()); this.ui.toast('Track deleted'); } },
        { label: 'Keep it', primary: true },
      ],
    });
  }

  // ---- editor --------------------------------------------------------------------------------
  openEditor(trackEntry) {
    this.audio.init();
    this.audio.stopEngine();
    this.mode = 'editor';
    this.paused = false;
    this.ui.showScreen(null);
    this.ui.showHud(false);
    this.ui.showFinish(null);
    this.ui.showPause(false);
    this.input.captureKeys = false;
    if (this.trackGroup) { this.scene.remove(this.trackGroup); disposeGroup(this.trackGroup); this.trackGroup = null; }
    if (this.env.stadium) this.env.stadium.visible = false;
    this.carView.object.visible = false;
    this.ghostView.object.visible = false;
    this.authorView.object.visible = false;
    this.skids.clear(); this.smoke.clear(); this.sparks.clear();
    this.editor.open(trackEntry);
    this._maybeStartMusic();
  }

  testTrack(data, name) {
    this.playTrack({ id: 'editor-test', name: name || 'Test drive', data, medals: this.editor.authorTime ? Records.medalsFromAuthor(this.editor.authorTime) : null, from: 'editor', sub: 'Test drive' });
  }

  returnToEditor() {
    this.audio.stopEngine();
    this.ui.showFinish(null);
    this.ui.showHud(false);
    this.ui.setTouchVisible(false);
    if (this.trackGroup) { this.scene.remove(this.trackGroup); disposeGroup(this.trackGroup); this.trackGroup = null; }
    if (this.env.stadium) this.env.stadium.visible = false;
    this.carView.object.visible = false;
    this.ghostView.object.visible = false;
    this.authorView.object.visible = false;
    this.skids.clear(); this.smoke.clear(); this.sparks.clear();
    this.mode = 'editor';
    this.input.captureKeys = false;
    this.editor.resume();
  }

  // debug helper for tuning the look from the console
  debugLook(o = {}) {
    if (o.exposure != null) this.renderer.toneMappingExposure = o.exposure;
    if (o.env != null) this.scene.environmentIntensity = o.env;
    if (o.hemi != null) this.env.hemi.intensity = o.hemi;
    if (o.sun != null) this.env.sun.intensity = o.sun;
    if (o.bloom != null) this.post.enabled = o.bloom;
    if (o.threshold != null) this.post.bloom.threshold = o.threshold;
    if (o.strength != null) this.post.bloom.strength = o.strength;
    if (o.bg != null) this.scene.backgroundIntensity = o.bg;
    if (o.fogNear != null) this.scene.fog.near = o.fogNear;
    if (o.fogFar != null) this.scene.fog.far = o.fogFar;
    if (o.frozen != null) this.frozen = o.frozen;
    if (o.preset) { this.env.setPreset(o.preset); applyMaterialMood(this.materials, o.preset); this.carView.setHeadlights(o.preset === 'night'); }
    if (o.cam) this.rig.setMode(o.cam);
  }

  // ---- frame loop ---------------------------------------------------------------------------
  _frame = (now) => {
    requestAnimationFrame(this._frame);
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, raw);
    this.last = now;
    this._watchPerf(raw);
    this.input.pollGamepad();
    this.fps.frames++; this.fps.t += dt;
    if (this.fps.t >= 0.5) { if (this.settings.showFps) this.ui.setFps(Math.round(this.fps.frames / this.fps.t)); this.fps.frames = 0; this.fps.t = 0; }
    try {
      if (this.mode === 'editor') {
        this.editor.update(dt);
      } else if (this.mode === 'race' || this.mode === 'menu') {
        this._simulate(dt);
        this._present(dt);
        this.indoor.update(this.camera);
      }
      this.post.render(dt);
    } catch (err) {
      console.error(err);
      if (!this.crashed) { this.crashed = true; this.ui.toast('Something went wrong: ' + err.message, 'error'); }
    }
  };

  // step the render tier down while frames keep taking longer than ~20 ms
  _watchPerf(raw) {
    const P = this.perf;
    if ((this.mode !== 'race' && this.mode !== 'menu') || this.paused || raw > 0.25) { P.acc = 0; P.n = 0; return; }
    if (P.hold > 0) { P.hold -= raw; return; }
    P.acc += raw; P.n++;
    if (P.acc < 1.5) return;
    const avg = P.acc / P.n;
    P.acc = 0; P.n = 0;
    if (avg > 0.0205 && P.tier < renderTiers(window.devicePixelRatio || 1).length - 1) {
      P.tier++;
      saveStore('perf.tier', P.tier);
      P.hold = 1;
      this.resize();
    }
  }

  _simulate(dt) {
    if (this.paused || !this.race || this.frozen) return;
    this.acc += dt;
    let steps = 0;
    let drive = this.mode === 'race' ? this.input.drive() : null;
    if (this.mode === 'race' && this.autopilot && this.track.route) {
      if (!this.pilot || this.pilot.route !== this.track.route) this.pilot = new Bot(this.track.route, this.race.car, { skill: 1.05, fullSpeed: this.context?.style === 'fs' });
      drive = null;
    }
    const car = this.race.car;
    this.frameFx.impact = 0; this.frameFx.landing = 0; this.frameFx.scrape = 0;
    while (this.acc >= PHYS_DT && steps < 30) {
      this.prevPose.pos.copy(car.pos);
      this.prevPose.quat.copy(car.quat);
      let input = drive;
      if (!input && this.mode === 'race') {
        input = this.race.state === 'running' ? this.pilot.update(car, PHYS_DT) : { throttle: 0, brake: 0, steer: 0 };
        if (input.respawn) this.respawn();
      }
      if (this.mode === 'menu') {
        input = this.bot ? this.bot.update(car, PHYS_DT) : { throttle: 0, brake: 0, steer: 0 };
        if (input.respawn) {
          if (!this.race.respawn()) { this.race.reset({ countdown: false }); this.bot.reset(); } else this.bot.reset(this.track.route.nearest(car.pos.toArray()));
          this._snapPose();
        }
      }
      this.race.step(PHYS_DT, input);
      this.frameFx.impact = Math.max(this.frameFx.impact, car.impact);
      this.frameFx.landing = Math.max(this.frameFx.landing, car.landing);
      if (car.scrape > this.frameFx.scrape) this.frameFx.scrape = car.scrape;
      this.acc -= PHYS_DT;
      steps++;
    }
    if (steps >= 30) this.acc = 0;
    this.alpha = this.acc / PHYS_DT;
    if (this.mode === 'menu' && this.race.state === 'finished' && this.race.afterFinish > 2.5) {
      this.attractIndex++;
      this.startAttract();
    }
  }

  _snapPose() {
    const car = this.race.car;
    this.prevPose.pos.copy(car.pos);
    this.prevPose.quat.copy(car.quat);
    this.alpha = 1;
    this._updatePose();
  }

  _updatePose() {
    const car = this.race.car;
    const P = this.pose;
    P.pos.lerpVectors(this.prevPose.pos, car.pos, this.alpha);
    P.quat.slerpQuaternions(this.prevPose.quat, car.quat, this.alpha);
    P.vel.copy(car.vel);
    P.speed = car.speed;
    P.grounded = car.grounded;
    P.airTime = car.airTime;
    P.boost = car.boostTime > 0 ? car.boostLevel : 0;
  }

  _present(dt) {
    const race = this.race, car = race.car;
    this._updatePose();
    const P = this.pose;
    this.carView.update({ pos: P.pos, quat: P.quat, wheels: car.wheels, steerAngle: car.steerAngle, brake: car.brake > 0.1 && car.fwdSpeed > 1 ? 1 : 0, boost: P.boost }, dt);

    // ghost
    const showGhost = this.mode === 'race' && this.settings.ghost && this.bestGhost;
    this.ghostView.object.visible = !!showGhost;
    if (showGhost) {
      const t = race.state === 'countdown' ? 0 : race.state === 'finished' ? race.finishTime + race.afterFinish : race.time;
      const g = this.bestGhost.sample(t, this.ghostPose.pos, this.ghostPose.quat);
      const spin = (this.ghostSpin = (this.ghostSpin || 0) + (g.speed / 0.42) * dt);
      const wheels = [0, 1, 2, 3].map(() => ({ len: 0.3, spin }));
      this.ghostView.update({ pos: this.ghostPose.pos, quat: this.ghostPose.quat, wheels, steerAngle: g.steer * 0.3 }, dt);
      const d = this.ghostPose.pos.distanceTo(P.pos);
      this.ghostView.mat.paint.opacity = clamp((d - 2) / 10, 0.08, 0.34);
    }
    const showAuthor = this.mode === 'race' && this.settings.authorGhost && this.authorGhost;
    this.authorView.object.visible = !!showAuthor;
    if (showAuthor) {
      const t = race.state === 'countdown' ? 0 : race.state === 'finished' ? race.finishTime + race.afterFinish : race.time;
      const g = this.authorGhost.sample(t, this.ghostPose.pos, this.ghostPose.quat);
      const spin = (this.authorSpin = (this.authorSpin || 0) + (g.speed / 0.42) * dt);
      const wheels = [0, 1, 2, 3].map(() => ({ len: 0.3, spin }));
      this.authorView.update({ pos: this.ghostPose.pos, quat: this.ghostPose.quat, wheels, steerAngle: g.steer * 0.3 }, dt);
      const d = this.ghostPose.pos.distanceTo(P.pos);
      this.authorView.mat.paint.opacity = clamp((d - 2) / 10, 0.06, 0.28);
    }

    this._effects(dt);

    // camera
    if (this.mode === 'menu') {
      this.rig.tvUpdate(dt, P, this.track.route, this.bot ? this.bot.idx : 0);
    } else if (race.state === 'finished' && race.afterFinish > 1.4) {
      this.rig.orbit(dt, P.pos);
    } else {
      this.rig.update(dt, P);
    }
    this.env.update(P.pos);

    // audio + HUD
    if (this.mode === 'race') {
      let skid = 0;
      for (const w of car.wheels) skid = Math.max(skid, w.contact ? w.skid : 0);
      const surf = SURFACES[car.surface] || SURFACES[0];
      this.audio.updateEngine({
        rpm: car.rpm, throttle: race.state === 'countdown' ? 0.25 * this.input.drive().throttle : car.throttle, speed: car.speed,
        skid: car.speed > 4 ? skid : 0, grounded: car.grounded > 0, scrape: this.frameFx.scrape, surfaceDust: surf.dust, boost: P.boost,
      });
      const ms = race.state === 'countdown' ? 0 : race.state === 'finished' ? race.finishTime * 1000 : race.time * 1000;
      this.ui.setTime(ms);
      this.ui.setSpeed(car.speed, this.settings.units, car.gear);
      this.ui.setBoost(car.boostTime > 0 ? car.boostTime / car.P.boost[Math.max(1, car.boostLevel)].time : 0);
      this.ui.setVignette(clamp((car.speed - 55) / 60, 0, 0.9) + (P.boost ? 0.25 : 0));
      if (race.state === 'running' && race.stuckTime > 1.6) this.ui.hint(this.touch ? 'Stuck? Tap Respawn' : 'Stuck? Press <kbd>Enter</kbd> to respawn');
      else if (race.state === 'running' && car.pos.y < -2) this.ui.hint('Press <kbd>Enter</kbd> to respawn');
      else this.ui.hint(this._tutorialHint(race, car));
    }
  }

  // First-race hints (until the first campaign finish), PolyTrack style
  _tutorialHint(race, car) {
    if (!this.tutorial || race.state === 'finished') return null;
    const cps = race.cpTaken.size, total = this.track.checkpoints.length;
    if (race.state === 'countdown' || (car.speed < 12 && race.time < 6)) {
      return this.touch ? 'Hold the right pedal to go, tilt the stick to steer' : 'Hold <kbd>↑</kbd> or <kbd>W</kbd> to go · <kbd>←</kbd> <kbd>→</kbd> to steer';
    }
    if (cps === 0) return `Drive through the yellow checkpoint lines: all ${total} before the finish`;
    if (cps < total || race.time - (race.splits[race.splits.length - 1] || 0) < 3.5) {
      if (race.time - (race.splits[0] || 0) < 4) return this.touch ? 'Crashed? Respawn puts you back on the last checkpoint' : 'Crashed? <kbd>Enter</kbd> puts you back on the last checkpoint · <kbd>R</kbd> restarts';
      return null;
    }
    return this.authorGhost ? 'Now the finish! Beat the teal ghost for the Author medal' : 'Now the finish!';
  }

  _effects(dt) {
    const car = this.race.car;
    car.right(_right); car.forward(_fwd); car.up(_up);
    const sp = car.speed;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      if (w.contact && w.skid > 0.15 && sp > 3) {
        this.skids.add(i, w.point, w.normal, _right, w.front ? 0.32 : 0.38, Math.min(1, w.skid));
        const surf = SURFACES[w.surf] || SURFACES[0];
        const rate = w.skid * Math.min(1, sp / 20) * dt * 60;
        if (Math.random() < rate) {
          const dust = surf.dust > 0;
          const col = dust ? (w.surf === 4 ? [0.55, 0.6, 0.42] : [0.66, 0.52, 0.38]) : [0.92, 0.93, 0.95];
          this.smoke.emit(w.point.x + (Math.random() - 0.5) * 0.4, w.point.y + 0.25, w.point.z + (Math.random() - 0.5) * 0.4,
            car.vel.x * 0.25 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, car.vel.z * 0.25 + (Math.random() - 0.5) * 2,
            { size: dust ? 1.3 : 1.0, grow: dust ? 3.2 : 4, life: dust ? 1.6 : 1.3, alpha: dust ? 0.45 : 0.3, color: col, drag: 1.2 });
        }
      } else {
        this.skids.lift(i);
        // light dust behind the wheels on dirt / grass at speed
        const surf = SURFACES[w.surf] || SURFACES[0];
        if (w.contact && surf.dust > 0 && sp > 12 && Math.random() < surf.dust * dt * 25) {
          const col = w.surf === 4 ? [0.5, 0.58, 0.4] : [0.7, 0.56, 0.4];
          this.smoke.emit(w.point.x, w.point.y + 0.3, w.point.z, -_fwd.x * 2, 1, -_fwd.z * 2, { size: 1.1, grow: 3, life: 1.3, alpha: 0.28 * surf.dust, color: col, drag: 1.4 });
        }
      }
    }
    if (this.frameFx.scrape > 4) {
      const n = Math.min(8, Math.floor(this.frameFx.scrape / 6) + 1);
      const s = car.scrapePoint;
      for (let k = 0; k < n; k++) {
        this.sparks.emit(s.x, s.y, s.z, car.vel.x * 0.6 + (Math.random() - 0.5) * 6, 1 + Math.random() * 4, car.vel.z * 0.6 + (Math.random() - 0.5) * 6,
          { size: 0.12, grow: 0, life: 0.35 + Math.random() * 0.3, alpha: 1, color: [1, 0.72 + Math.random() * 0.2, 0.3], drag: 1.5, gravity: 9 });
      }
    }
    if (this.frameFx.landing > 0.2) {
      this.rig.addShake(this.frameFx.landing * 0.6);
      if (this.mode === 'race') this.audio.land(this.frameFx.landing);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        this.smoke.emit(car.pos.x + Math.cos(a) * 1.5, car.pos.y - 0.5, car.pos.z + Math.sin(a) * 1.5, Math.cos(a) * 5, 0.8, Math.sin(a) * 5,
          { size: 1.4, grow: 3, life: 1, alpha: 0.25, color: [0.85, 0.86, 0.88], drag: 2.5 });
      }
    }
    if (this.frameFx.impact > 7) {
      this.rig.addShake(Math.min(1, this.frameFx.impact / 30));
      if (this.mode === 'race' && (!this.lastImpact || performance.now() - this.lastImpact > 180)) { this.audio.impact(this.frameFx.impact); this.lastImpact = performance.now(); }
    }
    if (car.boostTime > 0) {
      for (const sx of [-0.2, 0.2]) {
        _p.set(sx, 0.1, 2.5).applyQuaternion(car.quat).add(car.pos);
        if (Math.random() < 0.7) {
          this.sparks.emit(_p.x, _p.y, _p.z, -_fwd.x * 8 + car.vel.x * 0.7, (Math.random() - 0.3) * 2, -_fwd.z * 8 + car.vel.z * 0.7,
            { size: 0.35, grow: -0.5, life: 0.25, alpha: 0.9, color: car.boostLevel > 1 ? [1, 0.35, 0.25] : [1, 0.7, 0.25], drag: 3 });
        }
      }
    }
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.skids.update();
  }
}
