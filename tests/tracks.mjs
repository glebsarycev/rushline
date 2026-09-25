// Builds every campaign track, prints a top-down map and lets the AI drive it.
//   node --import ./tests/hooks.mjs tests/tracks.mjs [trackIndex] [--map]
import { Track } from '../src/track/track.js';
import { worldCells } from '../src/track/blocks.js';
import { CAMPAIGN } from '../src/track/campaign.js';
import { Race } from '../src/game/race.js';
import { Bot } from '../src/game/bot.js';
import { PHYS_DT } from '../src/config.js';

const args = process.argv.slice(2);
const only = args.find((a) => /^\d+$/.test(a));
const showMap = args.includes('--map');

const CH = {
  start: 'S', finish: 'F', cp: 'C', boost: 'B', superboost: 'X', straight: '=', platform: '#',
  curve1: 'c', curve2: 'c', curve3: 'c', curve4: 'c', bank2: 'b', bank3: 'b', wallride: 'w',
  hill1: '/', hill2: '/', hill3: '/', hill22: '/', hill32: '/', hill42: '/', ramp: 'k', rampBig: 'K', loop: 'O', loopL: 'O',
};

function map(track) {
  const cells = new Map();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const b of track.blocks) {
    for (const [x, y, z] of worldCells(b)) {
      const k = x + ',' + z;
      const prev = cells.get(k);
      if (!prev || prev.y < y) cells.set(k, { ch: CH[b.type] || '?', y, surf: b.surf });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  const rows = [];
  for (let z = minZ; z <= maxZ; z++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      const c = cells.get(x + ',' + z);
      if (!c) { row += ' . '; continue; }
      const ch = c.surf === 'dirt' ? c.ch.toLowerCase() === c.ch ? c.ch : c.ch : c.ch;
      row += (c.surf === 'dirt' ? '~' : c.surf === 'ice' ? '*' : ' ') + ch + (c.y > 9 ? '+' : c.y);
    }
    rows.push(`${String(z).padStart(4)} ${row}`);
  }
  return `x: ${minX}..${maxX}\n` + rows.join('\n');
}

function drive(track, maxTime = 240) {
  const race = new Race(track);
  const route = track.route;
  if (!route) return { ok: false, reason: 'no route' };
  const bot = new Bot(route, race.car);
  race.reset({ countdown: false });
  let respawns = 0, restarts = 0, maxSpeed = 0, t = 0;
  let cpLog = [];
  race.on('checkpoint', (e) => cpLog.push(e.time.toFixed(2)));
  race.on('autoRespawn', () => { if (!race.respawn()) { race.reset({ countdown: false }); bot.reset(); restarts++; } else respawns++; });
  while (t < maxTime) {
    const input = race.state === 'running' ? bot.update(race.car, PHYS_DT) : { throttle: 0, brake: 0, steer: 0 };
    if (input.respawn) {
      if (race.respawn()) { respawns++; bot.reset(route.nearest([race.car.pos.x, race.car.pos.y, race.car.pos.z])); } else { race.reset({ countdown: false }); bot.reset(); restarts++; }
    }
    race.step(PHYS_DT, input);
    maxSpeed = Math.max(maxSpeed, race.car.speed);
    t += PHYS_DT;
    if (race.state === 'finished') break;
  }
  return {
    ok: race.state === 'finished', time: race.finishTime, respawns, restarts, maxSpeed: maxSpeed * 3.6, cps: cpLog,
    routeLen: route.length, routeFinished: route.finished, where: race.car.pos.toArray().map((v) => v.toFixed(0)).join(','),
    botIdx: bot.idx, routePts: route.pts.length,
  };
}

CAMPAIGN.forEach((def, i) => {
  if (only !== undefined && +only !== i) return;
  let data;
  try {
    data = def.build();
  } catch (e) {
    console.log(`#${i} ${def.name}: BUILD ERROR ${e.message}`);
    return;
  }
  const track = new Track({ ...data, id: def.id, name: def.name });
  const s = track.summary;
  console.log(`\n#${i} ${def.name} [${def.env}] blocks=${s.blocks} cps=${s.checkpoints} finish=${s.finishes} tris=${track.world.count}`);
  if (showMap) console.log(map(track));
  const r = drive(track);
  console.log(`  route ${r.routeLen?.toFixed(0)}m finished=${r.routeFinished} | bot ${r.ok ? 'FINISHED' : 'DNF'} time=${r.time?.toFixed(3)} respawns=${r.respawns} restarts=${r.restarts} vmax=${r.maxSpeed?.toFixed(0)} cps=[${r.cps}] ${r.ok ? '' : 'at ' + r.where + ' idx ' + r.botIdx + '/' + r.routePts}`);
});
