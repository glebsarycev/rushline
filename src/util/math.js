// Small numeric helpers shared by gameplay, rendering and UI code.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const sign = (v) => (v < 0 ? -1 : 1);

// Frame-rate independent exponential smoothing towards a target.
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

export function approach(current, target, delta) {
  if (current < target) return Math.min(current + delta, target);
  return Math.max(current - delta, target);
}

// Race time formatting: 0:23.456 / 1:02.345 / 1:00:00.000
export function formatTime(ms, { plus = false } = {}) {
  if (ms == null || !isFinite(ms)) return '-:--.---';
  const neg = ms < 0;
  let t = Math.round(Math.abs(ms));
  const milli = t % 1000; t = (t - milli) / 1000;
  const sec = t % 60; t = (t - sec) / 60;
  const min = t % 60; const hrs = (t - min) / 60;
  let s = `${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  s = hrs > 0 ? `${hrs}:${String(min).padStart(2, '0')}:${s}` : `${min}:${s}`;
  if (neg) return '-' + s;
  return plus ? '+' + s : s;
}

// Split difference: -0.123 / +1.234 (short form, drops leading 0: minutes)
export function formatDelta(ms) {
  const neg = ms < 0;
  let t = Math.round(Math.abs(ms));
  const milli = t % 1000; t = (t - milli) / 1000;
  const sec = t % 60; const min = (t - sec) / 60;
  const body = min > 0 ? `${min}:${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}` : `${sec}.${String(milli).padStart(3, '0')}`;
  return (neg ? '-' : '+') + body;
}

// Deterministic PRNG (mulberry32) for procedural decoration.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Float32Array <-> base64 (ghost storage)
export function f32ToBase64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function base64ToF32(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
