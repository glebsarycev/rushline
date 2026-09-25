// localStorage wrapper that never throws (private windows, blocked storage, sandboxed frames).

const PREFIX = 'rushline.';
const memory = new Map();

function backend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const k = PREFIX + '__probe';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

let ls;

export function load(key, fallback = null) {
  if (ls === undefined) ls = backend();
  try {
    const raw = ls ? ls.getItem(PREFIX + key) : memory.get(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  if (ls === undefined) ls = backend();
  const raw = JSON.stringify(value);
  try {
    if (ls) ls.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
    return true;
  } catch {
    // quota exceeded: keep it in memory for this session
    memory.set(key, raw);
    return false;
  }
}

export function remove(key) {
  if (ls === undefined) ls = backend();
  try {
    if (ls) ls.removeItem(PREFIX + key);
  } catch { /* ignore */ }
  memory.delete(key);
}

export function keys(prefix = '') {
  if (ls === undefined) ls = backend();
  const out = [];
  try {
    if (ls) {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
      }
    }
  } catch { /* ignore */ }
  for (const k of memory.keys()) if (k.startsWith(prefix) && !out.includes(k)) out.push(k);
  return out;
}
