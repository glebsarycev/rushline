// Drives the real game with keyboard input and checks the new car model:
// it is the GLB view, accelerates, steers (front wheels turn), brakes and collides.
//   node tests/browser/drive.mjs [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { serve, ROOT, CHROME } from './server.mjs';

const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const srv = await serve(ROOT, 8132);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) logs.push('[http ' + r.status() + '] ' + r.url()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => {
  const a = window.rushline, c = a.race.car, v = a.carView;
  return {
    view: v.constructor.name, state: a.race.state, speed: +(c.speed * 3.6).toFixed(1),
    pos: c.pos.toArray().map((x) => +x.toFixed(1)), steer: +c.steerAngle.toFixed(3),
    wheelYaw: v.wheels ? +v.wheels[0].pivot.rotation.y.toFixed(3) : null,
    wheelSpin: v.wheels ? +v.wheels[2].spin.rotation.x.toFixed(2) : null,
    impact: +(a.frameFx.impact || 0).toFixed(1), grounded: c.grounded, hull: c.nContacts,
  };
});
const results = {};
await page.goto('http://localhost:8132/', { waitUntil: 'load' });
await sleep(3000);
results.menuView = await page.evaluate(() => window.rushline.carView.constructor.name);
await page.screenshot({ path: `${out}/d-menu.png` });
await page.click('[data-go="campaign"]');
await sleep(400);
await page.click('[data-act="play-campaign"][data-index="0"]');
await sleep(2600); // countdown
results.spawn = await state();
await page.keyboard.down('ArrowUp');
await sleep(3000);
results.accel = await state();
await page.screenshot({ path: `${out}/d-accel.png` });
await page.keyboard.down('ArrowLeft');
await sleep(500);
results.steer = await state();
await page.screenshot({ path: `${out}/d-steer.png` });
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowDown');
await sleep(1200);
results.brake = await state();
await page.screenshot({ path: `${out}/d-brake.png` });
await page.keyboard.up('ArrowDown');
// drive into the side wall
await page.keyboard.down('ArrowUp');
await page.keyboard.down('ArrowRight');
let maxImpact = 0;
for (let i = 0; i < 25; i++) { await sleep(100); const s = await state(); maxImpact = Math.max(maxImpact, s.impact); if (s.hull > 0) results.wallContact = s; }
results.maxImpact = maxImpact;
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.screenshot({ path: `${out}/d-wall.png` });
// night look with headlights and brake lights
await page.evaluate(() => window.rushline.playCampaign(5));
await sleep(2700);
await page.keyboard.down('ArrowUp'); await sleep(1500); await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowDown'); await sleep(300);
await page.screenshot({ path: `${out}/d-night.png` });
await page.keyboard.up('ArrowDown');
console.log(JSON.stringify(results, null, 1));
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
srv.close();
