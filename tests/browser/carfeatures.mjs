// Ghost, paint colour setting, finish orbit and model-load fallback for the car.
//   node tests/browser/carfeatures.mjs [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { serve, ROOT, CHROME } from './server.mjs';
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const srv = await serve(ROOT, 8133);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8133/', { waitUntil: 'load' });
await sleep(3000);
const r = {};
// paint colour from settings
r.colour = await page.evaluate(() => {
  const a = window.rushline;
  a.settings.color = '#2f7bff';
  a.applySettings();
  return a.carView.mat.paint.color.getHexString();
});
// fallback path: a missing model rejects, so the game would use the built-in car
r.fallback = await page.evaluate(() => import('/src/render/carAsset.js').then((m) => m.loadCarAsset('assets/models/missing.glb', { timeout: 4000 })).then(() => 'loaded?!', (e) => 'rejected: ' + (e.message || e).toString().slice(0, 60)));
// finish a run with the autopilot, then restart to see the ghost
await page.evaluate(() => { window.rushline.autopilot = true; window.rushline.playCampaign(0); });
const t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await page.evaluate(() => window.rushline.race.state === 'finished')) break; await sleep(200); }
await sleep(3200);
await page.screenshot({ path: `${out}/c-orbit.png` });
await page.evaluate(() => { window.rushline.autopilot = false; window.rushline.restart(); });
await sleep(2600);
await page.keyboard.down('ArrowUp');
await sleep(1800);
r.ghost = await page.evaluate(() => ({ view: window.rushline.ghostView.constructor.name, visible: window.rushline.ghostView.object.visible, dist: +window.rushline.ghostView.object.position.distanceTo(window.rushline.carView.object.position).toFixed(1) }));
await page.screenshot({ path: `${out}/c-ghost.png` });
await page.keyboard.up('ArrowUp');
console.log(JSON.stringify(r, null, 1));
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
srv.close();
