// Keyboard, gamepad and touch input, merged into one driving state plus
// edge-triggered actions (respawn, restart, camera, pause...).

const DRIVE = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS', 'Space'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};

const ACTIONS = {
  Enter: 'respawn', NumpadEnter: 'respawn', Backspace: 'respawn',
  Delete: 'restart', KeyR: 'restart',
  KeyC: 'camera', Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3',
  KeyG: 'ghost', Escape: 'pause', KeyP: 'pause', KeyM: 'mute', KeyN: 'next', KeyH: 'hud',
};

const PAD_ACTIONS = { 1: 'respawn', 3: 'restart', 9: 'pause', 8: 'camera', 5: 'camera', 4: 'ghost' };

export class Input {
  constructor() {
    this.keys = new Set();
    this.handlers = [];
    this.touch = { up: 0, down: 0, left: 0, right: 0 };
    this.padPrev = [];
    this.padActive = false;
    this.enabled = true;
    this.captureKeys = false;
    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  onAction(fn) { this.handlers.push(fn); }

  _emit(action, source) {
    for (const h of this.handlers) h(action, source);
  }

  _down(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.captureKeys && (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Backspace')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = ACTIONS[e.code];
    if (a) this._emit(a, 'key');
    this._emit('key:' + e.code, e);
  }

  has(list) {
    for (const k of list) if (this.keys.has(k)) return true;
    return false;
  }

  setTouch(name, v) { this.touch[name] = v ? 1 : 0; }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    if (!pad) return;
    pad.buttons.forEach((b, i) => {
      const pressed = b.pressed || b.value > 0.5;
      if (pressed && !this.padPrev[i]) {
        this.padActive = true;
        if (PAD_ACTIONS[i]) this._emit(PAD_ACTIONS[i], 'pad');
        this._emit('pad:' + i, 'pad');
      }
      this.padPrev[i] = pressed;
    });
    if (Math.abs(pad.axes[0] || 0) > 0.3) this.padActive = true;
  }

  // Current driving input
  drive() {
    let throttle = this.has(DRIVE.up) || this.touch.up ? 1 : 0;
    let brake = this.has(DRIVE.down) || this.touch.down ? 1 : 0;
    let steer = (this.has(DRIVE.right) || this.touch.right ? 1 : 0) - (this.has(DRIVE.left) || this.touch.left ? 1 : 0);
    const p = this.pad;
    if (p) {
      const ax = p.axes[0] || 0;
      const dz = 0.14;
      if (Math.abs(ax) > dz) steer += Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.4);
      if (p.buttons[14]?.pressed) steer -= 1;
      if (p.buttons[15]?.pressed) steer += 1;
      throttle = Math.max(throttle, p.buttons[7]?.value || 0, p.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, p.buttons[6]?.value || 0, p.buttons[2]?.pressed ? 1 : 0);
    }
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0 };
    return { throttle, brake, steer: Math.max(-1, Math.min(1, steer)) };
  }

  anyDriveKey() {
    return this.has(DRIVE.up) || this.has(DRIVE.down) || this.has(DRIVE.left) || this.has(DRIVE.right);
  }
}
