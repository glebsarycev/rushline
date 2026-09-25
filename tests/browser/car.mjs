// Screenshots of the car model preview from several angles.
//   node tests/browser/car.mjs [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { serve, ROOT, CHROME } from './server.mjs';
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const srv = await serve(ROOT, 8131);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8131/tools/car/preview.html', { waitUntil: 'load' });
for (let i = 0; i < 50; i++) { if (await page.evaluate(() => window.previewReady || window.previewError)) break; await sleep(200); }
console.log('msg:', await page.evaluate(() => document.getElementById('msg').textContent));
for (const v of ['front', 'side', 'rear', 'top', 'wheel']) {
  await page.evaluate((v) => window.setView(v), v);
  if (v === 'wheel') await page.evaluate(() => window.setPose({ steer: 0.45, spin: 0.6 }));
  await sleep(400);
  await page.screenshot({ path: `${out}/car-${v}.png` });
}
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
srv.close();
