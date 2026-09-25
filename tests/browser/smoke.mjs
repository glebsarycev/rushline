import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8129);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8129/', { waitUntil: 'load' });
await sleep(2500);
for (let i = 0; i < 10; i++) {
  await page.evaluate((i) => { window.rushline.autopilot = true; window.rushline.playCampaign(i); }, i);
  await sleep(3500);
  const st = await page.evaluate(() => ({ name: window.rushline.context.name, env: window.rushline.track.env, state: window.rushline.race.state, t: window.rushline.race.time.toFixed(1), crashed: !!window.rushline.crashed }));
  console.log(i, JSON.stringify(st));
}
// pause/resume, camera cycle, restart, respawn via keyboard
await page.keyboard.press('KeyC'); await sleep(200);
await page.keyboard.press('Escape'); await sleep(300);
const paused = await page.evaluate(() => window.rushline.paused);
await page.keyboard.press('Escape'); await sleep(300);
await page.keyboard.press('KeyR'); await sleep(300);
await page.keyboard.press('Enter'); await sleep(300);
console.log('paused-toggle', paused, 'mode', await page.evaluate(() => window.rushline.mode));
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
srv.close();
