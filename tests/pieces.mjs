// Open-track pieces: plazas, wide gates, forks, wall-less road, half-pipes.
//   node --import ./tests/hooks.mjs tests/pieces.mjs
import { TrackBuilder } from '../src/track/builder.js';
import { Track } from '../src/track/track.js';
import { Race } from '../src/game/race.js';
import { Bot } from '../src/game/bot.js';
import { blockGeometry } from '../src/track/geometry.js';
import { PHYS_DT, PIPE } from '../src/config.js';

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); if (!ok) failed++; };
const B = () => new TrackBuilder().at(0, 0, 0, 0);
const drive = (track, input) => {
  const race = new Race(track); const bot = new Bot(track.route, race.car);
  race.reset({ countdown: false });
  let t = 0, maxY = 0, respawns = 0;
  race.on('autoRespawn', () => { respawns++; race.respawn(); });
  while (t < 60 && race.state !== 'finished' && respawns < 3) {
    const inp = input ? input(race.car) : bot.update(race.car, PHYS_DT);
    race.step(PHYS_DT, inp); t += PHYS_DT; maxY = Math.max(maxY, race.car.pos.y);
  }
  return { finished: race.state === 'finished', time: race.finishTime, maxY, respawns };
};

// plaza: a checkpoint line three cells wide is one gate; the line turns across the plaza
{
  const t = new Track({ ...B().start().straight(2).plaza(2, 1, 1).plazaCp(1, 1).plaza(1, 1, 1).plazaTurn('R', 1, 1).plaza(2, 1, 1).plazaFinish(1, 1).build(), id: 'plaza' });
  check('plaza: one checkpoint gate', t.checkpoints.length === 1, `${t.checkpoints.length} gate(s), half width ${t.checkpoints[0]?.halfWidth} m`);
  check('plaza: gate spans three cells', t.checkpoints[0]?.halfWidth === 48);
  check('plaza: one finish gate', t.finishes.length === 1);
  const r = drive(t);
  check('plaza: AI finishes through the plaza turn', r.finished && !r.respawns, r.finished ? `${r.time.toFixed(2)} s` : 'DNF');
}

// fork: a branch leaves one plaza and rejoins the next; no loose ends
{
  const t = new Track({ ...B().start().straight(2).plaza(1, 1, 1).mark('side', 'R').plaza(1, 1, 1).straight(6).plaza(1, 1, 1).plaza(1, 1, 1).straight(2).finish()
    .branch('side', (b) => b.straight(1).left(2).straight(5).left(2).straight(1)).build(), id: 'fork' });
  const loose = [];
  for (const b of t.blocks) b.ports.forEach((p, i) => { if (!p.open && !b.links[i] && b.def.ports.length === 2 && b.def.feature !== 'start' && b.def.feature !== 'finish') loose.push(`${b.type}@${b.x},${b.z}`); });
  check('fork: branch rejoins the plaza', loose.length === 0, loose.join(' '));
  check('fork: driving line ignores the branch', t.route.finished);
}

// wall-less road has no wall collision
{
  const g = blockGeometry('straight', 'road', 'open');
  const walls = [];
  for (let i = 0; i < g.body.coll.length; i += 19) { const ny = g.body.coll[i + 10]; if (Math.abs(ny) < 0.5 && g.body.coll[i + 1] > 0.3) walls.push(i); }
  check('open road: no side walls above the deck', walls.length === 0, `${walls.length} wall triangles`);
}

// half-pipe: a car that drives straight into the curve rides the wall and stays inside
{
  const t = new Track({ ...B().start().straight(6).boost().straight(6).pipe(2).pipeRight(3).pipe(3).finish().build(), id: 'pipe' });
  const r = drive(t, () => ({ throttle: 1, steer: 0 }));
  check('half-pipe: no steering, the curl keeps the car inside', r.maxY < PIPE.wall + 1 && !r.respawns, `max height ${r.maxY.toFixed(1)} m (wall top ${PIPE.wall.toFixed(1)} m)`);
  const a = drive(t);
  check('half-pipe: AI finishes', a.finished && !a.respawns, a.finished ? `${a.time.toFixed(2)} s` : 'DNF');
}

if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('all piece checks passed');
