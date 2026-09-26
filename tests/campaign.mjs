// Checks every campaign track against its style.
//   node --import ./tests/hooks.mjs tests/campaign.mjs
// - the AI finishes without a respawn within TIME_RANGE (on 'fs' tracks it never brakes)
// - 'fs' (full speed): a driver that never lifts or brakes also finishes cleanly
// - 'tech': that same full-throttle driver crashes out or is clearly slower
import { Track } from '../src/track/track.js';
import { CAMPAIGN } from '../src/track/campaign.js';
import { Race } from '../src/game/race.js';
import { Bot } from '../src/game/bot.js';
import { PHYS_DT } from '../src/config.js';

export const TIME_RANGE = [15, 45]; // seconds

export function drive(track, { fullThrottle = false, skill = 1, maxTime = 120 } = {}) {
  const race = new Race(track);
  const bot = new Bot(track.route, race.car, { skill });
  race.reset({ countdown: false });
  let t = 0, respawns = 0;
  race.on('autoRespawn', () => { respawns++; race.respawn(); });
  while (t < maxTime && race.state !== 'finished' && respawns < 6) {
    let input = race.state === 'running' ? bot.update(race.car, PHYS_DT) : {};
    if (input.respawn) { respawns++; if (!race.respawn()) break; bot.reset(track.route.nearest(race.car.pos.toArray())); }
    if (fullThrottle && race.state === 'running') input = { ...input, throttle: 1, brake: 0, noDrift: true };
    race.step(PHYS_DT, input);
    t += PHYS_DT;
  }
  const clean = race.state === 'finished' && respawns === 0;
  return { clean, time: clean ? race.finishTime : null, respawns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  CAMPAIGN.forEach((def, i) => {
    const track = new Track({ ...def.build(), id: def.id });
    const ai = drive(track, { fullThrottle: def.style === 'fs' }), ft = drive(track, { fullThrottle: true });
    const problems = [];
    if (!ai.clean) problems.push(`AI respawned ${ai.respawns}x`);
    else if (ai.time < TIME_RANGE[0] - 0.5 || ai.time > TIME_RANGE[1] + 0.5) problems.push(`AI time ${ai.time.toFixed(2)} s outside ${TIME_RANGE.join('-')}`);
    if (def.style === 'fs' && !ft.clean) problems.push('full throttle does not finish cleanly');
    if (def.style === 'tech' && ft.clean && ai.clean && ft.time < ai.time + 2) problems.push('full throttle is as fast as braking');
    const f = (r) => (r.clean ? r.time.toFixed(2) + ' s' : `crash (${r.respawns} respawns)`);
    console.log(`${String(i + 1).padStart(2, '0')} ${def.name.padEnd(14)} ${def.style.padEnd(4)} AI ${f(ai).padEnd(20)} full throttle ${f(ft).padEnd(20)} ${problems.length ? 'FAIL: ' + problems.join('; ') : 'ok'}`);
    if (problems.length) failed++;
  });
  if (failed) { console.log(`${failed} track(s) failed`); process.exit(1); }
  console.log('all campaign tracks match their style');
}
