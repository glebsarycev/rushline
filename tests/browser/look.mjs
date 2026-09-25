import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8125);
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const track = +(process.argv[3] || 0);
const wait = +(process.argv[4] || 9000);
const variants = JSON.parse(process.argv[5] || '[{}]');
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
await page.goto('http://localhost:8125/', { waitUntil: 'load' });
await sleep(3000);
await page.evaluate((i) => { window.rushline.autopilot = true; window.rushline.playCampaign(i); }, track);
await sleep(wait);
await page.evaluate(() => { window.rushline.debugLook({ frozen: true }); });
for (let i = 0; i < variants.length; i++) {
  await page.evaluate((v) => window.rushline.debugLook(v), variants[i]);
  await sleep(400);
  await page.screenshot({ path: `${out}/look-${i}.png` });
  console.log('look', i, JSON.stringify(variants[i]));
}
console.log(logs.join('\n'));
await browser.close();
srv.close();
