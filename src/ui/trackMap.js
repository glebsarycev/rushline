// Top-down map of a track for menu cards (PolyTrack style): the road in white at
// its real width, plazas as filled cells, start blue, checkpoints yellow, finish red.
// Higher parts of the track are drawn a little brighter.

import { CELL, LEVEL, HALF, ROAD_HALF } from '../config.js';
import { worldFrame } from '../track/blocks.js';
import { Track } from '../track/track.js';

const cache = new Map();

// Paint the map of a track into a <canvas> (drawn once per track, then copied).
// Canvases rather than data: URLs, which strict page policies may block.
export function paintTrackMap(canvas, key, data, w = 240, h = 150) {
  const k = key + '|' + w + 'x' + h;
  let src = cache.get(k);
  if (src === undefined) {
    try { src = draw(data, w, h); } catch { src = null; }
    cache.set(k, src);
  }
  if (!src) return;
  canvas.width = src.width; canvas.height = src.height;
  canvas.getContext('2d').drawImage(src, 0, 0);
}

function draw(data, W, H) {
  const t = new Track({ blocks: data.blocks }, { collision: false });
  const b = t.bbox, pad = 10;
  const sx = (W - 2 * pad) / (b.maxX - b.minX), sz = (H - 2 * pad) / (b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = (W - (b.maxX - b.minX) * s) / 2 - b.minX * s, oz = (H - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s;
  const X = (x) => ox + x * s, Z = (z) => oz + z * s;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const shade = (y) => `hsl(210, 20%, ${Math.min(100, 82 + (y / LEVEL) * 3)}%)`;
  // draw lower blocks first so bridges pass over
  const blocks = [...t.blocks].sort((a, c2) => a.y - c2.y);
  for (const blk of blocks) {
    if (blk.def.profile === 'platform') {
      g.fillStyle = shade(blk.y * LEVEL);
      g.fillRect(X(blk.x * CELL - HALF) - 0.3, Z(blk.z * CELL - HALF) - 0.3, CELL * s + 0.6, CELL * s + 0.6);
      continue;
    }
    const fr = blk.def.frames.map((f) => worldFrame(blk, f));
    g.strokeStyle = shade(fr[0].p[1]);
    g.lineWidth = Math.max(2, 2 * ROAD_HALF * s);
    g.lineCap = 'butt';
    g.beginPath();
    fr.forEach((f, i) => (i ? g.lineTo(X(f.p[0]), Z(f.p[2])) : g.moveTo(X(f.p[0]), Z(f.p[2]))));
    g.stroke();
  }
  const mark = (gate, color) => {
    const hw = gate.halfWidth * s, cx = X(gate.center[0]), cz = Z(gate.center[2]);
    g.strokeStyle = color; g.lineWidth = Math.max(2.5, 5 * s);
    g.beginPath();
    g.moveTo(cx - gate.right[0] * hw, cz - gate.right[2] * hw);
    g.lineTo(cx + gate.right[0] * hw, cz + gate.right[2] * hw);
    g.stroke();
  };
  for (const cp of t.checkpoints) mark(cp, '#f5c542');
  for (const f of t.finishes) mark(f, '#ff4d4d');
  if (t.spawn) {
    g.fillStyle = '#3aa0ff';
    const r = Math.max(3, ROAD_HALF * s * 0.9);
    g.fillRect(X(t.spawn.pos[0]) - r, Z(t.spawn.pos[2]) - r, 2 * r, 2 * r);
  }
  return c;
}
