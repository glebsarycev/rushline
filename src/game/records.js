// Personal bests, ghosts, settings and custom tracks (browser storage).

import { load, save, remove } from '../util/storage.js';
import { Ghost } from './ghost.js';
import { MEDALS } from '../config.js';

export const DEFAULT_SETTINGS = {
  master: 0.8, sfx: 0.9, engine: 0.75, music: 0.45, raceMusic: false,
  quality: 'high', bloom: true, shadows: 'high',
  ghost: true, units: 'kmh', camera: 'chase', color: '#ff3b30', showFps: false,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(load('settings', {}) || {}) };
}

export function saveSettings(s) {
  save('settings', s);
}

export function medalFor(ms, medals) {
  if (!medals || ms == null) return null;
  for (const m of MEDALS) if (medals[m] != null && ms <= medals[m]) return m;
  return null;
}

// medal thresholds from an author time (ms)
export function medalsFromAuthor(author) {
  const r = (v) => Math.ceil(v / 10) * 10;
  return { author: r(author), gold: r(author * 1.08), silver: r(author * 1.25), bronze: r(author * 1.55) };
}

export function getRecord(trackId) {
  return load('rec.' + trackId, null);
}

export function getGhost(trackId) {
  return Ghost.deserialize(load('ghost.' + trackId, null));
}

// Returns { improved, prev, record }
export function submitRun(trackId, ms, splits, ghost, medals) {
  const prev = getRecord(trackId);
  const improved = !prev || ms < prev.best;
  if (improved) {
    const record = { best: ms, splits: splits.map((s) => Math.round(s * 1000)), date: Date.now(), medal: medalFor(ms, medals) };
    save('rec.' + trackId, record);
    if (ghost) {
      const ok = save('ghost.' + trackId, ghost.serialize());
      if (!ok) remove('ghost.' + trackId);
    }
    return { improved, prev, record };
  }
  return { improved, prev, record: prev };
}

export function clearRecord(trackId) {
  remove('rec.' + trackId);
  remove('ghost.' + trackId);
}

// ---- custom tracks -------------------------------------------------------------------------
export function listTracks() {
  return load('tracks', []) || [];
}

export function saveTrack(t) {
  const list = listTracks();
  const i = list.findIndex((x) => x.id === t.id);
  const entry = { ...t, updated: Date.now() };
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  save('tracks', list);
  return entry;
}

export function deleteTrack(id) {
  save('tracks', listTracks().filter((t) => t.id !== id));
  clearRecord(id);
}

export function newTrackId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// share codes: base64 of compact JSON
export function exportCode(t) {
  const data = { v: 1, n: t.name, a: t.author, e: t.env, m: t.authorTime || null, b: t.blocks };
  if (t.land) data.l = t.land;
  if (t.hangars && t.hangars.length) data.h = t.hangars;
  if (t.decor && t.decor.length) data.d = t.decor;
  const json = JSON.stringify(data);
  return 'RL1:' + btoa(unescape(encodeURIComponent(json)));
}

export function importCode(code) {
  const s = code.trim().replace(/^RL1:/, '');
  const data = JSON.parse(decodeURIComponent(escape(atob(s))));
  if (!data || !Array.isArray(data.b)) throw new Error('This code does not contain a track.');
  return {
    name: data.n || 'Imported track', author: data.a || 'Unknown', env: data.e || 'day', land: data.l || 'mountains', authorTime: data.m || null, blocks: data.b,
    hangars: Array.isArray(data.h) ? data.h : [], decor: Array.isArray(data.d) ? data.d : [],
  };
}
