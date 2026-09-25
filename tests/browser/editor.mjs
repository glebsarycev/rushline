import puppeteer from 'puppeteer-core';
import { serve, ROOT, CHROME } from './server.mjs';
const srv = await serve(ROOT, 8127);
const out = process.argv[2] || new URL('./out', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:8127/', { waitUntil: 'load' });
await sleep(2500);
// open editor through the real menu button
await page.click('[data-go="editor"]');
await sleep(1200);
await page.evaluate(() => { const e = window.rushline.editor; e.cam.target.set(40, 0, -70); e.cam.dist = 300; });
await sleep(300);
const cellPx = async (x, z, level = 0) => page.evaluate(([x, z, level]) => {
  const app = window.rushline;
  const v = new app.camera.position.constructor(x * 32, level * 8 + 0.25, z * 32);
  v.project(app.camera);
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
}, [x, z, level]);
const clickCell = async (x, z) => {
  const [px, py] = await cellPx(x, z);
  await page.mouse.move(px, py, { steps: 4 });
  await sleep(80);
  const cur = await page.evaluate(() => [window.rushline.editor.cursor, window.rushline.editor.rot, window.rushline.editor.type]);
  console.log('target', x, z, 'px', px.toFixed(0), py.toFixed(0), 'cursor', JSON.stringify(cur));
  await page.mouse.down(); await page.mouse.up();
  await sleep(120);
};
// straights north of the start
for (const z of [-1, -2, -3]) await clickCell(0, z);
// a right curve (select via palette), then finish
await page.click('[data-block="curve2"]');
await sleep(200);
await clickCell(0, -4);
await page.click('[data-cat="special"]');
await sleep(200);
await page.click('[data-block="finish"]');
await sleep(200);
await clickCell(2, -5);
await sleep(300);
await page.screenshot({ path: `${out}/ed-1.png` });
const info = await page.evaluate(() => ({ blocks: window.rushline.editor.blocks.map((b) => [b.type, b.x, b.y, b.z, b.rot]), open: window.rushline.editor.openPorts.map((o) => [o.b.type, o.p.p, o.p.d]) }));
console.log('editor blocks', JSON.stringify(info));
// test drive with autopilot
await page.evaluate(() => { window.rushline.autopilot = true; });
await page.keyboard.press('KeyT');
await sleep(1000);
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const st = await page.evaluate(() => window.rushline.race && window.rushline.race.state);
  if (st === 'finished') break;
  await sleep(200);
}
await sleep(1500);
await page.screenshot({ path: `${out}/ed-2-finish.png` });
await page.click('[data-act="set-author"]').catch((e) => console.log('no set-author button', e.message));
await sleep(800);
await page.evaluate(() => { window.rushline.autopilot = false; });
await page.click('[data-ed="save"]');
await sleep(500);
await page.screenshot({ path: `${out}/ed-3-saved.png` });
const saved = await page.evaluate(() => localStorage.getItem('rushline.tracks'));
console.log('saved', saved && saved.slice(0, 200));
await page.click('[data-ed="menu"]');
await sleep(800);
await page.evaluate(() => window.rushline.navigate('mytracks'));
await sleep(600);
await page.screenshot({ path: `${out}/ed-4-mytracks.png` });
console.log(logs.join('\n'));
await browser.close();
srv.close();
