import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8124);
const url = (process.argv[2] || 'http://localhost:8124/').replace('8123', '8124');
const out = process.argv[3] || new URL('./out', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const script = process.argv[4] || 'basic';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await sleep(1500);
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return 'no webgl2'; const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl2'; });
  console.log('GL:', gl);
  await sleep(3500);
  await shot('01-title');
  if (script === 'basic' || script === 'race') {
    await page.evaluate(() => window.rushline.navigate('campaign'));
    await sleep(600);
    await shot('02-campaign');
    const idx = +(process.env.TRACK || 0);
    await page.evaluate((i) => { window.rushline.autopilot = true; window.rushline.playCampaign(i); }, idx);
    await sleep(1200);
    await shot('03-countdown');
    await sleep(4500);
    await shot('04-race');
    await sleep(5000);
    await shot('05-race2');
    await sleep(6000);
    await shot('06-race3');
    const st = await page.evaluate(() => ({ state: window.rushline.race.state, t: window.rushline.race.time, fps: window.rushline.fps }));
    console.log('race', JSON.stringify(st));
  }
  if (script === 'basic' || script === 'editor') {
    await page.evaluate(() => { window.rushline.autopilot = false; window.rushline.openEditor(null); });
    await sleep(1500);
    await page.mouse.move(700, 380);
    await sleep(300);
    await shot('07-editor');
  }
} catch (e) {
  console.log('HARNESS ERROR', e.message);
}
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
srv.close();
