// Procedural canvas textures: everything in the game is drawn at load time,
// so there are no external image assets.

import * as THREE from 'three';
import { rng } from '../util/math.js';

export const FONT_DISPLAY = '"Chakra Petch", "Barlow Semi Condensed", "Arial Narrow", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, rand, n, palette, min = 1, max = 2.5, alpha = 0.35) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.fillStyle = palette[(rand() * palette.length) | 0];
    const s = min + rand() * (max - min);
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx, w, h, rand, n, color, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = rMin + rand() * (rMax - rMin);
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color.replace('A', String(alpha * (0.5 + rand() * 0.5))));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

// ---- road surfaces ----------------------------------------------------------------
export function asphalt() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(11);
  ctx.fillStyle = '#3b3f46';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, rand, 26, 'rgba(20,22,26,A)', 30, 110, 0.35);
  blotches(ctx, W, H, rand, 18, 'rgba(92,96,104,A)', 20, 80, 0.18);
  speckle(ctx, W, H, rand, 16000, ['#1d1f23', '#5c6068', '#6f747c', '#2a2d33'], 1, 2.2, 0.5);
  // tyre wear lanes
  for (const u of [0.3, 0.7]) {
    const g = ctx.createLinearGradient(W * (u - 0.1), 0, W * (u + 0.1), 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(W * (u - 0.1), 0, W * 0.2, H);
  }
  // edge lines
  ctx.fillStyle = '#eef0ea';
  ctx.globalAlpha = 0.92;
  ctx.fillRect(9, 0, 8, H);
  ctx.fillRect(W - 17, 0, 8, H);
  // centre dash
  ctx.fillRect(W / 2 - 3, 0, 6, 200);
  ctx.globalAlpha = 1;
  // wear on paint
  speckle(ctx, W, H, rand, 2500, ['#3b3f46', '#2c2f35'], 1, 2, 0.6);
  return toTex(c);
}

export function dirt() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(23);
  ctx.fillStyle = '#8a6440';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, rand, 30, 'rgba(110,78,48,A)', 30, 120, 0.5);
  blotches(ctx, W, H, rand, 20, 'rgba(168,128,86,A)', 20, 90, 0.35);
  speckle(ctx, W, H, rand, 14000, ['#5a4028', '#b08a60', '#6d4e31', '#c9a57a'], 1, 3, 0.45);
  // pebbles
  for (let i = 0; i < 380; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#c8b59a' : '#5e4b39';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(rand() * W, rand() * H, 1 + rand() * 3, 1 + rand() * 2.5, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // tyre ruts along the road
  for (const u of [0.28, 0.36, 0.64, 0.72]) {
    const g = ctx.createLinearGradient(W * (u - 0.04), 0, W * (u + 0.04), 0);
    g.addColorStop(0, 'rgba(60,40,24,0)'); g.addColorStop(0.5, 'rgba(60,40,24,0.28)'); g.addColorStop(1, 'rgba(60,40,24,0)');
    ctx.fillStyle = g; ctx.fillRect(W * (u - 0.04), 0, W * 0.08, H);
  }
  return toTex(c);
}

export function ice() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(31);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#cfe9f5'); g.addColorStop(0.5, '#e8f6fb'); g.addColorStop(1, '#c2e1ef');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, rand, 20, 'rgba(150,200,225,A)', 30, 120, 0.4);
  // scratches along the direction of travel
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 260; i++) {
    ctx.lineWidth = 0.5 + rand() * 1.2;
    const x = rand() * W, y = rand() * H, l = 20 + rand() * 120;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 12, y + l); ctx.stroke();
  }
  // cracks
  ctx.strokeStyle = 'rgba(110,160,190,0.45)';
  for (let i = 0; i < 26; i++) {
    let x = rand() * W, y = rand() * H;
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 50; y += (rand() - 0.5) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return toTex(c);
}

export function platformTiles() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(41);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, rand, 5000, ['#8a939d', '#adb5be', '#7d858f'], 1, 2, 0.4);
  ctx.strokeStyle = 'rgba(40,46,54,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  return toTex(c);
}

export function curb(color = '#d8322c') {
  const W = 64, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#f1f1ee'; ctx.fillRect(0, H / 2, W, H / 2);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, rng(5), 900, ['#000', '#fff'], 1, 2, 0.08);
  return toTex(c);
}

// rounded tech-road border: white with a dark stripe band, canvas x = across (0 = road side)
export function techBump() {
  const W = 64, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#eef0ee'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2f9a55'; ctx.fillRect(W * 0.72, 0, W * 0.28, H);
  ctx.fillStyle = 'rgba(20,24,28,0.85)';
  for (let y = 0; y < H; y += 64) ctx.fillRect(W * 0.2, y, W * 0.3, 24);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.2)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, rng(7), 700, ['#000', '#fff'], 1, 2, 0.08);
  return toTex(c);
}

// painted edge line of a deck, canvas x = across (0 = inner side)
export function deckEdge() {
  const W = 64, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, rng(9), 900, ['#2c3036', '#4a5058'], 1, 2, 0.5);
  ctx.fillStyle = '#f2f2ee'; ctx.fillRect(W * 0.35, 0, W * 0.5, H);
  return toTex(c);
}

// warm vertical planks (mirror world towers), canvas y = up the tower
export function woodPlanks() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(91);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = rand();
    ctx.fillStyle = `rgb(${(204 + t * 30) | 0},${(164 + t * 26) | 0},${(118 + t * 22) | 0})`;
    ctx.fillRect((W / n) * i, 0, W / n, H);
    // grain
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = `rgba(90,52,24,${0.05 + rand() * 0.08})`;
      ctx.fillRect((W / n) * i + rand() * (W / n), 0, 1 + rand() * 2, H);
    }
    ctx.fillStyle = 'rgba(60,34,16,0.55)';
    ctx.fillRect((W / n) * i, 0, 2, H);
  }
  speckle(ctx, W, H, rand, 4000, ['#6b4020', '#e2b27a'], 1, 2, 0.15);
  return toTex(c);
}

// ---- walls / structures ------------------------------------------------------------
// canvas x = across the wall height (0 = road level), canvas y = along the road
export function wallFace() {
  const W = 128, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(51);
  ctx.fillStyle = '#e6eaee';
  ctx.fillRect(0, 0, W, H);
  // grime near the road
  const g = ctx.createLinearGradient(0, 0, W * 0.35, 0);
  g.addColorStop(0, 'rgba(60,64,70,0.45)'); g.addColorStop(1, 'rgba(60,64,70,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.35, H);
  // accent stripe
  ctx.fillStyle = '#ff6b1a';
  ctx.fillRect(W * 0.66, 0, W * 0.18, H);
  ctx.fillStyle = '#20252c';
  ctx.fillRect(W * 0.88, 0, W * 0.05, H);
  // panel seams
  ctx.fillStyle = 'rgba(40,44,50,0.5)';
  for (let k = 0; k < 3; k++) ctx.fillRect(0, (H / 3) * k, W, 2);
  speckle(ctx, W, H, rand, 1500, ['#9aa0a8', '#ffffff'], 1, 2, 0.2);
  return toTex(c);
}

export function wallGlowMask() {
  const W = 128, H = 16;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(W * 0.67, 0, W * 0.16, H);
  return toTex(c);
}

export function concrete(base = '#b7bcc3', seed = 61, seams = true) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, rand, 16, 'rgba(90,96,104,A)', 20, 80, 0.2);
  speckle(ctx, W, H, rand, 6000, ['#8e949c', '#d2d6db', '#7a8088'], 1, 2, 0.35);
  if (seams) {
    ctx.fillStyle = 'rgba(50,54,60,0.35)';
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, 0, 2, H);
  }
  // rain streaks
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(70,74,80,0.12)';
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 20 + rand() * 60);
  }
  return toTex(c);
}

export function graphite() {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#2a2f37';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, rng(71), 2500, ['#1d2127', '#3a414b'], 1, 2, 0.5);
  return toTex(c);
}

// ---- industrial scenery --------------------------------------------------------------
// corrugated metal sheet: vertical ribs, horizontal panel seams, streaks of grime
export function corrugated(base = '#8e969f', seed = 301) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, H);
  }
  ctx.fillStyle = 'rgba(30,34,40,0.45)';
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H / 2, W, 2);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${60 + rand() * 40 | 0},${50 + rand() * 20 | 0},${40},${0.05 + rand() * 0.1})`;
    ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 5, 30 + rand() * 120);
  }
  speckle(ctx, W, H, rand, 2500, ['#6f767e', '#c9ced4', '#8c7a66'], 1, 2, 0.25);
  return toTex(c);
}

export function hazardStripes() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#15171b';
  for (let k = -2; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 64, S); ctx.lineTo(k * 64 + 32, S); ctx.lineTo(k * 64 + 32 + S, 0); ctx.lineTo(k * 64 + S, 0);
    ctx.fill();
  }
  speckle(ctx, S, S, rng(307), 700, ['#6b5a2a', '#2b2b2b', '#fff3c4'], 1, 2.5, 0.25);
  return toTex(c);
}

export function containerSide() {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(311);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 12) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 7, 6, 4, H - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 2, 6, 3, H - 12);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(110,70,40,${0.06 + rand() * 0.12})`;
    ctx.fillRect(rand() * W, rand() * H, 3 + rand() * 10, 8 + rand() * 40);
  }
  return toTex(c);
}

export function crateWood() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rand = rng(313);
  ctx.fillStyle = '#a57c4a';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 21) {
    ctx.fillStyle = `rgba(60,36,14,${0.25 + rand() * 0.2})`;
    ctx.fillRect(0, y, S, 2);
  }
  ctx.strokeStyle = '#6b4a24';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, S - 10, S - 10);
  ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(S - 8, S - 8); ctx.stroke();
  speckle(ctx, S, S, rand, 900, ['#7a5530', '#c49a64'], 1, 2, 0.35);
  return toTex(c);
}

export function skylightPanes() {
  const W = 128, H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#26303a';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e9f4ff'); g.addColorStop(1, '#b9d4ec');
  ctx.fillStyle = g;
  for (let x = 4; x < W; x += 32) for (let y = 4; y < H; y += 30) ctx.fillRect(x, y, 26, 26);
  return toTex(c);
}

export function grating() {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#2c3138';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#7d858f';
  for (let k = 0; k < S; k += 8) { ctx.fillRect(k, 0, 2, S); ctx.fillRect(0, k, S, 2); }
  return toTex(c);
}

// big LED screen: the game's own graphics on a dark panel with a pixel grid
export function ledScreen() {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d1422'); g.addColorStop(1, '#1b0d18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff6b1a';
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.15 + i * 0.1;
    ctx.beginPath();
    ctx.moveTo(60 + i * 44, H - 90); ctx.lineTo(120 + i * 44, 90); ctx.lineTo(150 + i * 44, 90); ctx.lineTo(90 + i * 44, H - 90);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = `italic 700 150px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tg = ctx.createLinearGradient(0, 160, 0, 330);
  tg.addColorStop(0, '#ffe08a'); tg.addColorStop(1, '#ff8a1f');
  ctx.fillStyle = tg;
  ctx.fillText('RUSHLINE', 420, H / 2 - 20);
  ctx.font = `600 44px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText('FULL THROTTLE · NO LIMITS', 430, H / 2 + 88);
  // pixel grid
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < W; x += 6) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1);
  return toTex(c, { repeat: false });
}

// ---- ground --------------------------------------------------------------------------
export function grass() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(81);
  // mowing stripes: 4 stripes per tile
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#4f8a37' : '#5b9a40';
    ctx.fillRect(0, (H / 4) * i, W, H / 4);
  }
  blotches(ctx, W, H, rand, 30, 'rgba(38,78,30,A)', 20, 90, 0.3);
  blotches(ctx, W, H, rand, 20, 'rgba(120,160,70,A)', 20, 70, 0.18);
  speckle(ctx, W, H, rand, 26000, ['#3c722a', '#6aa84a', '#2f5d22', '#7fb85a'], 1, 2, 0.45);
  return toTex(c);
}

// ---- gameplay decals -----------------------------------------------------------------
export function boostPad(color1, color2) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#16181c';
  ctx.fillRect(0, 0, W, H);
  // chevrons pointing towards -y in canvas (forward along +v)
  const draw = (y) => {
    ctx.beginPath();
    ctx.moveTo(W * 0.1, y + 70); ctx.lineTo(W * 0.5, y); ctx.lineTo(W * 0.9, y + 70);
    ctx.lineTo(W * 0.9, y + 110); ctx.lineTo(W * 0.5, y + 40); ctx.lineTo(W * 0.1, y + 110);
    ctx.closePath();
    ctx.fill();
  };
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color1); g.addColorStop(1, color2);
  ctx.fillStyle = g;
  draw(20);
  draw(148);
  ctx.strokeStyle = color1;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.7;
  ctx.strokeRect(3, -10, W - 6, H + 20);
  ctx.globalAlpha = 1;
  return toTex(c);
}

export function checker() {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#15171b'; ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
  const t = toTex(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function textPanel(text, color, bg = '#0f1318') {
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 8, W, 8);
  // slanted end marks
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.25 + i * 0.15;
    ctx.beginPath();
    ctx.moveTo(24 + i * 26, H - 18); ctx.lineTo(44 + i * 26, 18); ctx.lineTo(58 + i * 26, 18); ctx.lineTo(38 + i * 26, H - 18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W - 24 - i * 26, 18); ctx.lineTo(W - 44 - i * 26, H - 18); ctx.lineTo(W - 58 - i * 26, H - 18); ctx.lineTo(W - 38 - i * 26, 18);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = `italic 700 84px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 4);
  const t = toTex(c, { repeat: false });
  return t;
}

export function linePaint(color, dashed = false) {
  const [c, ctx] = canvas(256, 16);
  ctx.fillStyle = color;
  if (!dashed) ctx.fillRect(0, 0, 256, 16);
  else for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 20, 16);
  return toTex(c, { repeat: false });
}

// ---- stadium --------------------------------------------------------------------------
// LED ribbon: white graphics on black, tinted per time of day by the emissive colour
export function ledRibbon() {
  const W = 2048, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const words = ['RUSHLINE', 'GO FASTER', 'RUSHLINE', 'FULL THROTTLE'];
  words.forEach((w, i) => {
    const x0 = i * 512;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, 0, 512, 10); ctx.fillRect(x0, H - 10, 512, 10);
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = 0.35 + k * 0.2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x0 + 22 + k * 22, H - 26); ctx.lineTo(x0 + 38 + k * 22, 26); ctx.lineTo(x0 + 50 + k * 22, 26); ctx.lineTo(x0 + 34 + k * 22, H - 26);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `italic 700 ${w.length > 10 ? 66 : 80}px ${FONT_DISPLAY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(w, x0 + 290, H / 2 + 4);
  });
  // LED pixel grid
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const t = toTex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function crowd() {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(91);
  ctx.fillStyle = '#39414c';
  ctx.fillRect(0, 0, W, H);
  const colors = ['#e84a3c', '#f2c14e', '#3b82f6', '#f5f5f5', '#22c55e', '#f97316', '#a855f7', '#111827', '#ec4899', '#14b8a6'];
  const rows = 8, rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#4a5360';
    ctx.fillRect(0, r * rowH + rowH * 0.7, W, rowH * 0.3);
    for (let x = 2; x < W; x += 7 + rand() * 3) {
      if (rand() < 0.12) continue;
      ctx.fillStyle = colors[(rand() * colors.length) | 0];
      const h = rowH * (0.45 + rand() * 0.2);
      ctx.fillRect(x, r * rowH + rowH * 0.7 - h, 5, h);
      ctx.fillStyle = '#e0b89a';
      ctx.fillRect(x + 1, r * rowH + rowH * 0.7 - h - 4, 3, 4);
    }
  }
  return toTex(c);
}

export function banner(seed = 1) {
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed * 101);
  const themes = [
    ['#10151c', '#ffb627', 'RUSHLINE'],
    ['#ff6b1a', '#10151c', 'GO FASTER'],
    ['#1e88ff', '#ffffff', 'NO BRAKES CLUB'],
    ['#f4f4f0', '#10151c', 'RUSHLINE'],
    ['#22c55e', '#0b1f14', 'FULL THROTTLE'],
  ];
  const [bg, fg, text] = themes[seed % themes.length];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.font = `italic 700 78px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, W * 0.36, H / 2 + 4);
  // abstract stripes
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.35 + rand() * 0.5;
    const x = W * 0.72 + i * 42;
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 62, 0); ctx.lineTo(x + 22, H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTex(c);
}

export function carbon() {
  const [c, ctx] = canvas(64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    ctx.fillStyle = ((x + y) / 8) % 2 ? '#1a1d22' : '#23272e';
    ctx.fillRect(x, y, 8, 8);
  }
  return toTex(c);
}

export function softDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
}

export function clouds(seed = 3) {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = H * (0.56 + rand() * 0.3);
    const n = 6 + ((rand() * 10) | 0);
    const s = 18 + rand() * 50;
    for (let k = 0; k < n; k++) {
      const px = x + (rand() - 0.5) * s * 4, py = y + (rand() - 0.5) * s * 0.8;
      const r = s * (0.5 + rand());
      for (const ox of [0, W, -W]) {
        const g = ctx.createRadialGradient(px + ox, py, 0, px + ox, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px + ox - r, py - r, r * 2, r * 2);
      }
    }
  }
  const t = toTex(c, { repeat: false });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Build the full texture set once
export function createTextures() {
  return {
    asphalt: asphalt(),
    dirt: dirt(),
    ice: ice(),
    platform: platformTiles(),
    curb: curb(),
    curbViolet: curb('#7a3cf0'),
    curbGreen: curb('#2f9a55'),
    techBump: techBump(),
    wood: woodPlanks(),
    deckEdge: deckEdge(),
    wall: wallFace(),
    wallGlow: wallGlowMask(),
    concrete: concrete(),
    darkConcrete: concrete('#6f757d', 63),
    pillar: concrete('#a9afb7', 65, false),
    graphite: graphite(),
    grass: grass(),
    boost: boostPad('#ffd21a', '#ff7a00'),
    superboost: boostPad('#ff4d4d', '#b3001b'),
    checker: checker(),
    panelCP: textPanel('CHECKPOINT', '#35c9ff'),
    panelStart: textPanel('START', '#4ee08a'),
    panelFinish: textPanel('FINISH', '#ff8a1f'),
    lineCP: linePaint('#35c9ff', true),
    lineStart: linePaint('#f4f4f0'),
    crowd: crowd(),
    banners: [0, 1, 2, 3, 4].map(banner),
    carbon: carbon(),
    dot: softDot(),
    clouds: clouds(),
    corrugated: corrugated(),
    roofMetal: corrugated('#737b84', 303),
    hazard: hazardStripes(),
    container: containerSide(),
    crate: crateWood(),
    skylight: skylightPanes(),
    grating: grating(),
    screen: ledScreen(),
    floor: concrete('#8b9096', 67),
    hangarSign: textPanel('RUSHLINE WORKS', '#ff8a1f', '#1b2027'),
    ribbon: ledRibbon(),
  };
}
