import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8126);
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const track = +(process.argv[3] || 0);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8126/', { waitUntil: 'load' });
await sleep(3000);
await page.screenshot({ path: `${out}/f-title.png` });
await page.evaluate(() => window.rushline.navigate('campaign'));
await sleep(500);
await page.screenshot({ path: `${out}/f-campaign.png` });
await page.evaluate((i) => { window.rushline.autopilot = true; window.rushline.playCampaign(i); }, track);
await sleep(1600);
await page.screenshot({ path: `${out}/f-countdown.png` });
let cpShot = false;
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const st = await page.evaluate(() => ({ s: window.rushline.race.state, cps: window.rushline.race.splits.length, t: window.rushline.race.time }));
  if (!cpShot && st.cps >= 1) { await sleep(150); await page.screenshot({ path: `${out}/f-cp.png` }); cpShot = true; }
  if (st.s === 'finished') break;
  await sleep(100);
}
await sleep(2200);
await page.screenshot({ path: `${out}/f-finish.png` });
const res = await page.evaluate(() => ({ state: window.rushline.race.state, time: window.rushline.race.finishTime, rec: localStorage.getItem('rushline.rec.' + window.rushline.context.id) }));
console.log(JSON.stringify(res));
console.log(logs.join('\n'));
await browser.close();
srv.close();
