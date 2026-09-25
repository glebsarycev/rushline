// Prints what the AI driver sees while driving a campaign track.
//   node --import ./tests/hooks.mjs tests/trace.mjs <trackIndex> [seconds] [printEvery]
import { Track } from '../src/track/track.js';
import { CAMPAIGN } from '../src/track/campaign.js';
import { Race } from '../src/game/race.js';
import { Bot } from '../src/game/bot.js';
import { PHYS_DT } from '../src/config.js';
const idx = +process.argv[2], T = +(process.argv[3] || 30), every = +(process.argv[4] || 0.25);
const def = CAMPAIGN[idx];
const track = new Track({ ...def.build(), name: def.name });
const route = track.route;
const race = new Race(track);
const bot = new Bot(route, race.car);
console.log('route pts', route.pts.length, 'first', route.pts.slice(0, 4).map(p => p.p.map(v => v.toFixed(1)).join('/') + ' vt=' ), 'vt0', Array.from(bot.vt.slice(0, 12)).map(v=>v.toFixed(0)).join(','));
race.reset({ countdown: false });
let t = 0;
while (t < T) {
  const input = race.state === 'running' ? bot.update(race.car, PHYS_DT) : { throttle: 0, brake: 0, steer: 0 };
  if (input.respawn) { console.log('RESPAWN REQUEST at', t.toFixed(2)); if (!race.respawn()) { race.reset({ countdown: false }); bot.reset(); } else bot.reset(route.nearest([race.car.pos.x, race.car.pos.y, race.car.pos.z])); }
  race.step(PHYS_DT, input);
  t += PHYS_DT;
  const c = race.car;
  if (Math.abs(t / every - Math.round(t / every)) < PHYS_DT / every / 2) {
    const pt = route.pts[bot.idx];
    console.log(`${t.toFixed(2)} pos=(${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)},${c.pos.z.toFixed(1)}) v=${(c.speed*3.6).toFixed(0)} g=${c.grounded} idx=${bot.idx} rp=(${pt.p.map(v=>v.toFixed(0))}) vt=${(bot.vt[bot.idx]*3.6).toFixed(0)} in=${input.throttle.toFixed(1)}/${input.brake.toFixed(1)}/${input.steer.toFixed(2)} imp=${c.impact.toFixed(1)} drift=${c.drifting?1:0} st=${bot.stuck.toFixed(2)}`);
  }
  if (race.state === 'finished') { console.log('FINISHED', race.finishTime); break; }
}
