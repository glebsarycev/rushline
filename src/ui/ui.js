// DOM user interface: menus, HUD, pause, finish panel, toasts and dialogs.

import { formatTime, formatDelta } from '../util/math.js';
import { MEDALS, MEDAL_LABEL } from '../config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function digits(str) {
  let out = '';
  for (const ch of str) out += /\d/.test(ch) ? `<span class="d">${ch}</span>` : `<span class="p">${esc(ch)}</span>`;
  return `<span class="digits">${out}</span>`;
}

const ENV_LABEL = { day: 'Day', sunset: 'Sunset', night: 'Night' };
export const CAR_COLORS = ['#ff3b30', '#ff8a00', '#ffd21a', '#2fd26e', '#18c1d6', '#2f7bff', '#8b5cf6', '#f43f9e', '#f4f4f0', '#20242b'];

const ARC_LEN = 200;

export class UI {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.cache = {};
    this.toastTimer = null;
    this._build();
  }

  $(sel) { return this.root.querySelector(sel); }

  _build() {
    this.root.innerHTML = `
      <div id="loading" class="interactive">
        <h1 class="logo"><span>Rush</span><span class="l2">line</span></h1>
        <div class="loadbar"><i></i></div>
        <div id="loading-msg" class="muted">Warming up the engines</div>
      </div>

      <div id="hud" class="layer" hidden>
        <div class="speed-vignette" id="vignette"></div>
        <div class="hud-tl">
          <div class="hud-track" id="hud-track"></div>
          <div class="hud-sub" id="hud-sub"></div>
        </div>
        <div class="hud-top">
          <div class="cp-count" id="hud-cp" hidden><span></span></div>
          <div id="hud-split"></div>
        </div>
        <div class="hud-tr" id="hud-medals" hidden></div>
        <div class="countdown" id="countdown" hidden></div>
        <div class="hint" id="hint" hidden></div>
        <div class="boost-bar" id="boost-bar" hidden><i></i></div>
        <div class="hud-bottom"><div class="timer" id="timer"><span></span></div></div>
        <div class="speedo" id="speedo">
          <svg viewBox="0 0 170 120" aria-hidden="true">
            <path d="M22 108 A 68 68 0 1 1 150 86" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="6" stroke-linecap="round" pathLength="${ARC_LEN}"/>
            <path id="speed-arc" d="M22 108 A 68 68 0 1 1 150 86" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" pathLength="${ARC_LEN}" stroke-dasharray="0 ${ARC_LEN}"/>
          </svg>
          <div class="gear" id="gear">1</div>
          <div class="num" id="speed">0</div>
          <div class="unit" id="unit">km/h</div>
        </div>
        <div class="fps" id="fps" hidden></div>
        <div class="touch" id="touch" hidden>
          <div class="grp"><button data-t="left" aria-label="Steer left">◀</button><button data-t="right" aria-label="Steer right">▶</button></div>
          <div class="grp"><button data-t="down" aria-label="Brake">Brake</button><button data-t="up" aria-label="Accelerate">Gas</button></div>
        </div>
        <div class="touch-top interactive" id="touch-top" hidden>
          <button class="btn small" data-a="respawn"><span>Respawn</span></button>
          <button class="btn small" data-a="pause"><span>Pause</span></button>
        </div>
      </div>

      <section class="screen scrim-left" id="title" hidden>
        <div class="title-col">
          <div>
            <div class="eyebrow">Arcade stunt time attack</div>
            <h1 class="logo" style="margin-top:14px"><span>Rush</span><span class="l2">line</span></h1>
            <div class="logo-bar" aria-hidden="true"><i></i><i></i><i></i></div>
          </div>
          <p class="tagline">Chase the clock on loops, kickers and wall rides. Beat your ghost, win the medals, then build tracks of your own.</p>
          <nav class="menu" aria-label="Main menu">
            <button class="btn primary" data-go="campaign"><span>Play campaign</span></button>
            <button class="btn" data-go="editor"><span>Track editor</span></button>
            <button class="btn" data-go="mytracks"><span>My tracks</span></button>
            <button class="btn" data-go="settings"><span>Settings</span></button>
            <button class="btn" data-go="help"><span>How to play</span></button>
          </nav>
          <div class="title-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive</span><span>Gamepad supported</span></div>
        </div>
      </section>

      <section class="screen scrim" id="campaign" hidden>
        <div class="wrap">
          <div class="screen-head">
            <div><div class="eyebrow">Campaign</div><h2>Choose a track</h2></div>
            <button class="btn" data-go="title"><span>Back</span></button>
          </div>
          <p class="muted" id="campaign-summary" style="margin:0 0 16px"></p>
          <div class="track-grid" id="campaign-grid"></div>
        </div>
      </section>

      <section class="screen scrim" id="mytracks" hidden>
        <div class="wrap">
          <div class="screen-head">
            <div><div class="eyebrow">Your creations</div><h2>My tracks</h2></div>
            <div class="row-btns">
              <button class="btn primary" data-act="new-track"><span>New track</span></button>
              <button class="btn" data-act="import"><span>Import code</span></button>
              <button class="btn" data-go="title"><span>Back</span></button>
            </div>
          </div>
          <div class="list" id="mytracks-list"></div>
        </div>
      </section>

      <section class="screen scrim" id="settings" hidden>
        <div class="wrap">
          <div class="screen-head">
            <div><div class="eyebrow">Options</div><h2>Settings</h2></div>
            <button class="btn" data-act="settings-back"><span>Done</span></button>
          </div>
          <div class="settings">
            <div class="card">
              <h3>Sound</h3>
              <label class="field" for="s-master">Master <input type="range" id="s-master" min="0" max="1" step="0.05"><output></output></label>
              <label class="field" for="s-engine">Engine <input type="range" id="s-engine" min="0" max="1" step="0.05"><output></output></label>
              <label class="field" for="s-sfx">Effects <input type="range" id="s-sfx" min="0" max="1" step="0.05"><output></output></label>
              <label class="field" for="s-music">Music <input type="range" id="s-music" min="0" max="1" step="0.05"><output></output></label>
              <label class="toggle" for="s-raceMusic">Music during races <input type="checkbox" id="s-raceMusic"></label>
            </div>
            <div class="card">
              <h3>Graphics</h3>
              <div class="field"><span>Quality</span><div class="seg" id="s-quality"><button data-v="low">Low</button><button data-v="medium">Medium</button><button data-v="high">High</button></div><span></span></div>
              <label class="toggle" for="s-bloom">Glow (bloom) <input type="checkbox" id="s-bloom"></label>
              <label class="toggle" for="s-showFps">Show FPS <input type="checkbox" id="s-showFps"></label>
            </div>
            <div class="card">
              <h3>Racing</h3>
              <div class="field"><span>Camera</span><div class="seg" id="s-camera"><button data-v="chase">Close</button><button data-v="far">Far</button><button data-v="hood">Hood</button></div><span></span></div>
              <div class="field"><span>Speed unit</span><div class="seg" id="s-units"><button data-v="kmh">km/h</button><button data-v="mph">mph</button></div><span></span></div>
              <label class="toggle" for="s-ghost">Show personal best ghost <input type="checkbox" id="s-ghost"></label>
              <div class="field"><span>Car colour</span><div class="swatches" id="s-color"></div><span></span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="screen scrim" id="help" hidden>
        <div class="wrap">
          <div class="screen-head">
            <div><div class="eyebrow">How to play</div><h2>Controls and tips</h2></div>
            <button class="btn" data-go="title"><span>Back</span></button>
          </div>
          <div class="keys">
            <div class="card">
              <h3>Driving</h3>
              <dl>
                <dt><kbd>↑</kbd><kbd>W</kbd></dt><dd>Accelerate</dd>
                <dt><kbd>↓</kbd><kbd>S</kbd><kbd>Space</kbd></dt><dd>Brake, reverse when stopped</dd>
                <dt><kbd>←</kbd><kbd>→</kbd><kbd>A</kbd><kbd>D</kbd></dt><dd>Steer</dd>
                <dt><kbd>Enter</kbd><kbd>⌫</kbd></dt><dd>Respawn at the last checkpoint</dd>
                <dt><kbd>R</kbd><kbd>Del</kbd></dt><dd>Restart the run</dd>
                <dt><kbd>C</kbd><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></dt><dd>Change camera</dd>
                <dt><kbd>G</kbd></dt><dd>Show or hide your ghost</dd>
                <dt><kbd>Esc</kbd></dt><dd>Pause</dd>
                <dt><kbd>M</kbd></dt><dd>Mute</dd>
              </dl>
            </div>
            <div class="card">
              <h3>Gamepad</h3>
              <dl>
                <dt><kbd>RT</kbd><kbd>A</kbd></dt><dd>Accelerate</dd>
                <dt><kbd>LT</kbd><kbd>X</kbd></dt><dd>Brake</dd>
                <dt><kbd>Stick</kbd></dt><dd>Steer</dd>
                <dt><kbd>B</kbd></dt><dd>Respawn</dd>
                <dt><kbd>Y</kbd></dt><dd>Restart</dd>
                <dt><kbd>RB</kbd><kbd>Back</kbd></dt><dd>Camera</dd>
                <dt><kbd>Start</kbd></dt><dd>Pause</dd>
              </dl>
            </div>
            <div class="card">
              <h3>Tips</h3>
              <ul class="tips">
                <li>Tap the brake while steering at speed to start a drift. Drifts turn tighter than grip, but cost speed.</li>
                <li>Checkpoints can be taken in any order, but you need all of them before the finish counts.</li>
                <li>Respawning keeps the clock running and puts you back on the last checkpoint with the speed you had there.</li>
                <li>Yellow pads give a short turbo, red pads a long one.</li>
                <li>Crests throw you into the air at high speed. Lift off a little before a turn that follows a hill.</li>
                <li>Loops need speed. Don't brake in them.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section class="screen scrim" id="pause" hidden>
        <div class="center-panel">
          <div><div class="eyebrow" id="pause-track"></div><h2 class="pause-title">Paused</h2></div>
          <div class="menu">
            <button class="btn primary" data-act="resume"><span>Resume</span></button>
            <button class="btn" data-act="restart"><span>Restart run</span></button>
            <button class="btn" data-act="pause-settings"><span>Settings</span></button>
            <button class="btn" data-act="quit"><span id="quit-label">Quit to menu</span></button>
          </div>
        </div>
      </section>

      <section class="screen" id="finish" hidden style="background:linear-gradient(0deg, rgba(6,9,14,0.7), rgba(6,9,14,0.15))">
        <div class="center-panel" style="margin-bottom:0">
          <div class="finish-head"><div class="eyebrow" id="fin-track"></div><div id="fin-badge"></div></div>
          <div class="finish-time" id="fin-time"></div>
          <div class="finish-stats" id="fin-stats"></div>
          <div class="medal-row" id="fin-medals"></div>
          <div class="row-btns" id="fin-btns"></div>
        </div>
      </section>

      <div id="editor-ui" class="layer" hidden></div>
      <div class="toasts" id="toasts" aria-live="polite"></div>
      <div id="modal-root"></div>
    `;
    this.root.addEventListener('click', (e) => this._click(e));
    this.root.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.btn, .track-card');
      if (b && b !== this._lastHover) { this._lastHover = b; this.app.audio.hover(); }
    });
    this._bindSettings();
    this._bindTouch();
  }

  _click(e) {
    const el = e.target.closest('[data-go], [data-act], [data-a]');
    if (!el) return;
    this.app.audio.init();
    this.app.audio.click();
    if (el.dataset.go) this.app.navigate(el.dataset.go);
    else if (el.dataset.act) this.app.action(el.dataset.act, el.dataset);
    else if (el.dataset.a) this.app.onAction(el.dataset.a, 'touch');
  }

  // ---- screens ------------------------------------------------------------------------
  showLoading(on, msg) {
    this.$('#loading').hidden = !on;
    if (msg) this.$('#loading-msg').textContent = msg;
  }

  showError(msg) {
    const l = this.$('#loading');
    l.hidden = false;
    l.innerHTML = `<h1 class="logo"><span>Rush</span><span class="l2">line</span></h1><div class="errbox">${esc(msg)}</div>`;
  }

  showScreen(name) {
    for (const id of ['title', 'campaign', 'mytracks', 'settings', 'help']) this.$('#' + id).hidden = id !== name;
    this.screen = name;
    const first = name && this.$('#' + name + ' .btn, #' + name + ' .track-card');
    if (first && name !== 'title') setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  renderCampaign(entries) {
    const grid = this.$('#campaign-grid');
    let medalCount = 0;
    grid.innerHTML = entries.map((t, i) => {
      const rec = t.record;
      const got = rec ? rec.medal : null;
      const gi = got ? MEDALS.indexOf(got) : 99;
      if (got) medalCount++;
      const medals = [...MEDALS].reverse().map((m) => `<span class="medal ${m} ${MEDALS.indexOf(m) >= gi ? 'on' : ''}" title="${MEDAL_LABEL[m]}"></span>`).join('');
      return `<button class="track-card" data-act="play-campaign" data-index="${i}">
        <div class="top"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="chip ${t.env}">${ENV_LABEL[t.env] || t.env}</span></div>
        <div class="name">${esc(t.name)}</div>
        <div class="row"><span class="muted">Best</span><span class="pb">${rec ? formatTime(rec.best) : '-:--.---'}</span></div>
        <div class="row"><span class="medals">${medals}</span><span class="muted tnum">Author ${t.medals ? formatTime(t.medals.author) : '-'}</span></div>
      </button>`;
    }).join('');
    this.$('#campaign-summary').textContent = `${medalCount} of ${entries.length} tracks medalled. Press Enter on a card to race.`;
  }

  renderMyTracks(list) {
    const el = this.$('#mytracks-list');
    if (!list.length) {
      el.innerHTML = `<div class="empty">You haven't built a track yet.<br>Open the editor, place a Start, some road and a Finish, then drive it once to set the author time.</div>`;
      return;
    }
    el.innerHTML = list.map((t) => `
      <div class="list-item">
        <div>
          <div class="name">${esc(t.name)}</div>
          <div class="meta"><span>${t.blocks.length} blocks</span><span class="chip ${t.env}">${ENV_LABEL[t.env] || t.env}</span>
          <span>${t.authorTime ? 'Author ' + formatTime(t.authorTime) : 'Not validated'}</span>
          <span>${t.record ? 'Best ' + formatTime(t.record.best) : ''}</span></div>
        </div>
        <div class="actions">
          <button class="btn small primary" data-act="play-custom" data-id="${esc(t.id)}"><span>Play</span></button>
          <button class="btn small" data-act="edit-custom" data-id="${esc(t.id)}"><span>Edit</span></button>
          <button class="btn small" data-act="export-custom" data-id="${esc(t.id)}"><span>Share</span></button>
          <button class="btn small danger" data-act="delete-custom" data-id="${esc(t.id)}"><span>Delete</span></button>
        </div>
      </div>`).join('');
  }

  // ---- settings ---------------------------------------------------------------------
  _bindSettings() {
    const s = () => this.app.settings;
    for (const k of ['master', 'engine', 'sfx', 'music']) {
      const input = this.$('#s-' + k);
      input.addEventListener('input', () => {
        s()[k] = +input.value;
        input.nextElementSibling.textContent = Math.round(input.value * 100);
        this.app.applySettings();
      });
    }
    for (const k of ['raceMusic', 'bloom', 'ghost', 'showFps']) {
      const input = this.$('#s-' + k);
      input.addEventListener('change', () => { s()[k] = input.checked; this.app.applySettings(); });
    }
    for (const k of ['quality', 'camera', 'units']) {
      this.$('#s-' + k).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        s()[k] = b.dataset.v;
        this.syncSettings();
        this.app.applySettings();
      });
    }
    const sw = this.$('#s-color');
    sw.innerHTML = CAR_COLORS.map((c) => `<button style="background:${c}" data-v="${c}" aria-label="Colour ${c}"></button>`).join('');
    sw.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      s().color = b.dataset.v;
      this.syncSettings();
      this.app.applySettings();
    });
  }

  syncSettings() {
    const s = this.app.settings;
    for (const k of ['master', 'engine', 'sfx', 'music']) {
      const input = this.$('#s-' + k);
      input.value = s[k];
      input.nextElementSibling.textContent = Math.round(s[k] * 100);
    }
    for (const k of ['raceMusic', 'bloom', 'ghost', 'showFps']) this.$('#s-' + k).checked = !!s[k];
    for (const k of ['quality', 'camera', 'units']) {
      this.$('#s-' + k).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s[k])));
    }
    this.$('#s-color').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.color)));
    this.$('#unit').textContent = s.units === 'mph' ? 'mph' : 'km/h';
    this.$('#fps').hidden = !s.showFps;
  }

  // ---- touch ------------------------------------------------------------------------
  _bindTouch() {
    const t = this.$('#touch');
    const set = (btn, on) => {
      if (!btn) return;
      btn.classList.toggle('on', on);
      this.app.input.setTouch(btn.dataset.t, on);
    };
    t.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { b.setPointerCapture?.(e.pointerId); set(b, true); e.preventDefault(); } });
    t.addEventListener('pointerup', (e) => set(e.target.closest('button'), false));
    t.addEventListener('pointercancel', (e) => set(e.target.closest('button'), false));
    t.addEventListener('pointerleave', (e) => set(e.target.closest('button'), false), true);
    t.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setTouchVisible(on) {
    this.$('#touch').hidden = !on;
    this.$('#touch-top').hidden = !on;
  }

  // ---- HUD --------------------------------------------------------------------------
  showHud(on) {
    this.$('#hud').hidden = !on;
    if (!on) { this.$('#hud-split').innerHTML = ''; this.$('#countdown').hidden = true; this.$('#hint').hidden = true; }
  }

  setHudInfo(track, sub) {
    this.$('#hud-track').textContent = track;
    this.$('#hud-sub').textContent = sub || '';
  }

  setMedalBoard(medals, pb, current = null) {
    const el = this.$('#hud-medals');
    if (!medals && pb == null) { el.hidden = true; return; }
    el.hidden = false;
    let rows = '';
    let nextMarked = false;
    if (medals) {
      for (const m of MEDALS) {
        const beat = pb != null && pb <= medals[m];
        const cls = !beat && !nextMarked && m !== 'author' ? '' : '';
        rows += `<div class="row ${cls}"><span class="medal ${m}" style="opacity:${beat ? 1 : 0.55}"></span><span class="lbl">${MEDAL_LABEL[m]}</span><span class="val">${formatTime(medals[m])}</span></div>`;
      }
    }
    rows += `<div class="row pb"><span class="medal" style="background:var(--text);opacity:${pb != null ? 1 : 0.3}"></span><span class="lbl">Best</span><span class="val">${pb != null ? formatTime(pb) : '-:--.---'}</span></div>`;
    if (current) rows += `<div class="row"><span class="medal" style="background:var(--accent)"></span><span class="lbl">${esc(current.label)}</span><span class="val">${formatTime(current.time)}</span></div>`;
    el.innerHTML = rows;
  }

  setTime(ms) {
    const s = formatTime(Math.max(0, ms));
    if (s === this.cache.time) return;
    this.cache.time = s;
    this.$('#timer').firstElementChild.innerHTML = digits(s);
  }

  setSpeed(v, units, gear) {
    const val = Math.round(units === 'mph' ? v * 2.23694 : v * 3.6);
    if (val !== this.cache.speed) {
      this.cache.speed = val;
      this.$('#speed').textContent = val;
      const frac = Math.min(1, (v * 3.6) / 450);
      this.$('#speed-arc').setAttribute('stroke-dasharray', `${(frac * ARC_LEN).toFixed(1)} ${ARC_LEN}`);
    }
    const g = gear === 0 ? 'R' : String(gear);
    if (g !== this.cache.gear) { this.cache.gear = g; this.$('#gear').textContent = g; }
  }

  setCp(n, total) {
    const el = this.$('#hud-cp');
    el.hidden = total === 0;
    const s = `CP ${n} / ${total}`;
    if (s !== this.cache.cp) { this.cache.cp = s; el.firstElementChild.textContent = s; }
  }

  showSplit(time, delta, label = '') {
    const cls = delta == null ? '' : delta < -0.5 ? 'fast' : delta > 0.5 ? 'slow' : 'even';
    this.$('#hud-split').innerHTML = `<div class="split">${label ? `<div class="t"><span>${esc(label)}</span></div>` : ''}<div class="t"><span>${digits(formatTime(time))}</span></div>${delta != null ? `<div class="dt ${cls}"><span>${digits(formatDelta(delta))}</span></div>` : ''}</div>`;
    clearTimeout(this.splitTimer);
    this.splitTimer = setTimeout(() => { this.$('#hud-split').innerHTML = ''; }, 2600);
  }

  clearSplit() {
    clearTimeout(this.splitTimer);
    this.$('#hud-split').innerHTML = '';
  }

  countdown(n) {
    const el = this.$('#countdown');
    el.hidden = false;
    el.className = 'countdown' + (n === 0 ? ' go' : '');
    el.textContent = n === 0 ? 'GO!' : String(n);
    void el.offsetWidth;
    el.classList.add('anim');
    clearTimeout(this.countTimer);
    this.countTimer = setTimeout(() => { el.hidden = true; }, 720);
  }

  hideCountdown() { this.$('#countdown').hidden = true; }

  hint(text) {
    const el = this.$('#hint');
    if (!text) { el.hidden = true; this.cache.hint = null; return; }
    if (text === this.cache.hint) return;
    this.cache.hint = text;
    el.hidden = false;
    el.innerHTML = text;
  }

  setBoost(frac) {
    const el = this.$('#boost-bar');
    el.hidden = frac <= 0;
    if (frac > 0) el.firstElementChild.style.transform = `scaleX(${frac.toFixed(3)})`;
  }

  setVignette(a) {
    const v = a.toFixed(2);
    if (v !== this.cache.vig) { this.cache.vig = v; this.$('#vignette').style.opacity = v; }
  }

  setFps(fps) { this.$('#fps').textContent = `${fps} fps`; }

  // ---- pause / finish ---------------------------------------------------------------
  showPause(on, trackName, fromEditor) {
    this.$('#pause').hidden = !on;
    if (on) {
      this.$('#pause-track').textContent = trackName || '';
      this.$('#quit-label').textContent = fromEditor ? 'Back to editor' : 'Quit to menu';
      setTimeout(() => this.$('#pause [data-act=resume]').focus({ preventScroll: true }), 30);
    }
  }

  showFinish(d) {
    const el = this.$('#finish');
    const hudBits = ['.hud-bottom', '#speedo', '#boost-bar'];
    if (!d) { el.hidden = true; for (const s of hudBits) this.$(s).style.visibility = ''; return; }
    el.hidden = false;
    for (const s of hudBits) this.$(s).style.visibility = 'hidden';
    this.$('#fin-track').textContent = d.trackName;
    this.$('#fin-time').innerHTML = digits(formatTime(d.time));
    let badge = '';
    if (d.improved && d.prev != null) badge = `<span class="badge fast">New best ${esc(formatDelta(d.time - d.prev))}</span>`;
    else if (d.improved) badge = `<span class="badge">First finish</span>`;
    else if (d.prev != null) badge = `<span class="badge slow">${esc(formatDelta(d.time - d.prev))}</span>`;
    this.$('#fin-badge').innerHTML = badge;
    this.$('#fin-stats').innerHTML = `<span>Best <b>${d.best != null ? formatTime(d.best) : '-'}</b></span><span>Respawns <b>${d.respawns}</b></span>${d.medal ? `<span>Medal <b>${MEDAL_LABEL[d.medal]}</b></span>` : ''}`;
    if (d.medals) {
      this.$('#fin-medals').innerHTML = MEDALS.map((m) => `<div class="medal-cell ${d.time <= d.medals[m] ? 'got' : ''}"><div class="lbl"><span class="medal ${m}"></span>${MEDAL_LABEL[m]}</div><div class="t">${formatTime(d.medals[m])}</div></div>`).join('');
      this.$('#fin-medals').hidden = false;
    } else this.$('#fin-medals').hidden = true;
    this.$('#fin-btns').innerHTML = d.buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${b.act}"><span>${esc(b.label)}${b.key ? ` <kbd>${esc(b.key)}</kbd>` : ''}</span></button>`).join('');
    setTimeout(() => this.$('#fin-btns .btn')?.focus({ preventScroll: true }), 30);
  }

  // ---- toasts & modal ----------------------------------------------------------------
  toast(msg, type = '') {
    const box = this.$('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3200);
  }

  modal({ title, body = '', actions = [], onOpen }) {
    const root = this.$('#modal-root');
    root.innerHTML = `<div class="modal"><div class="center-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2 style="margin:0;font:italic 700 30px/1 var(--font-display);text-transform:uppercase">${esc(title)}</h2>${body}<div class="row-btns">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-i="${i}"><span>${esc(a.label)}</span></button>`).join('')}</div></div></div>`;
    const panel = root.querySelector('.modal');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      this.app.audio.click();
      const a = actions[+b.dataset.i];
      const keep = a.onClick ? a.onClick(panel) : false;
      if (keep !== true) this.closeModal();
    });
    this.modalOpen = true;
    onOpen?.(panel);
    setTimeout(() => (panel.querySelector('textarea, input, .btn.primary') || panel.querySelector('.btn'))?.focus(), 30);
  }

  closeModal() {
    this.$('#modal-root').innerHTML = '';
    this.modalOpen = false;
  }
}
