import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8128);
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const logs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(vp) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:8128/', { waitUntil: 'load' });
  await sleep(2800);
  return page;
}
const d = await open({ width: 1280, height: 720, deviceScaleFactor: 1 });
await d.evaluate(() => window.rushline.navigate('settings')); await sleep(500);
await d.screenshot({ path: `${out}/s-settings.png` });
await d.evaluate(() => window.rushline.navigate('help')); await sleep(500);
await d.screenshot({ path: `${out}/s-help.png` });
const m = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.screenshot({ path: `${out}/m-title.png` });
await m.evaluate(() => window.rushline.navigate('campaign')); await sleep(500);
await m.screenshot({ path: `${out}/m-campaign.png` });
await m.evaluate(() => { window.rushline.autopilot = true; window.rushline.playCampaign(2); }); await sleep(7000);
await m.screenshot({ path: `${out}/m-race.png` });
const overflow = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log('mobile overflow', JSON.stringify(overflow));
console.log(logs.join('\n'));
await browser.close();
srv.close();
