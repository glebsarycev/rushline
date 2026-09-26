// Physics scenarios: run with
//   node --import ./tests/hooks.mjs tests/physics.mjs
import * as THREE from 'three';
import { Track } from '../src/track/track.js';
import { TrackBuilder } from '../src/track/builder.js';
import { Race } from '../src/game/race.js';
import { PHYS_DT } from '../src/config.js';

const kmh = (v) => (v * 3.6).toFixed(0);
const f2 = (v) => v.toFixed(2);

function straightTrack(n = 40) {
  const t = new TrackBuilder().at(0, 0, 0, 0).start().straight(n).finish();
  return new Track(t.build({ name: 'straight' }));
}

function skidpad() {
  // start in the middle so turns in any direction stay on the pad
  const blocks = [['start', 0, 0, 0, 0]];
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) if (x || z) blocks.push(['platform', x, 0, z, 0]);
  return new Track({ name: 'skidpad', blocks });
}

function runRace(track, fn, seconds, { skipCountdown = true } = {}) {
  const race = new Race(track);
  race.reset({ countdown: !skipCountdown });
  // settle during countdown
  for (let i = 0; i < 240; i++) race.step(PHYS_DT, { throttle: 0, brake: 0, steer: 0 });
  const car = race.car;
  const steps = Math.round(seconds / PHYS_DT);
  for (let i = 0; i < steps; i++) {
    const t = i * PHYS_DT;
    const input = fn(t, car, race) || {};
    race.step(PHYS_DT, input);
  }
  return race;
}

function euler(q) {
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return { yaw: e.y, pitch: e.x, roll: e.z };
}

// 1. settling
{
  const tr = straightTrack();
  const race = new Race(tr);
  race.reset({ countdown: false });
  const car = race.car;
  const y0 = car.pos.y;
  let maxV = 0;
  for (let i = 0; i < 480; i++) { race.step(PHYS_DT, {}); if (i > 240) maxV = Math.max(maxV, car.vel.length()); }
  console.log(`[settle] spawn y=${f2(y0)} rest y=${f2(car.pos.y)} (road ${f2(tr.spawn.pos[1])}) jitter maxV=${maxV.toFixed(4)} grounded=${car.grounded} comp=${car.wheels.map((w) => w.comp.toFixed(3)).join(',')}`);
}

// 2. acceleration / top speed
{
  const tr = straightTrack(60);
  const marks = {};
  const race = runRace(tr, (t, car) => {
    const v = car.speed;
    for (const k of [100, 200, 300, 350]) if (!marks[k] && v * 3.6 >= k) marks[k] = t;
    return { throttle: 1 };
  }, 20);
  console.log(`[accel] 0-100 ${f2(marks[100] ?? NaN)}s, 0-200 ${f2(marks[200] ?? NaN)}s, 0-300 ${f2(marks[300] ?? NaN)}s, 0-350 ${f2(marks[350] ?? NaN)}s; v@20s=${kmh(race.car.speed)} km/h, drift from centre x=${f2(race.car.pos.x)}, y=${f2(race.car.pos.y)}`);
}

// 3. braking from 200 km/h
{
  const tr = straightTrack(60);
  let phase = 0, tb = 0, db = 0, start = null;
  const race = runRace(tr, (t, car) => {
    if (phase === 0 && car.speed * 3.6 >= 200) { phase = 1; tb = t; start = car.pos.clone(); }
    if (phase === 1 && car.speed < 0.5) { phase = 2; db = car.pos.distanceTo(start); tb = t - tb; }
    return phase === 0 ? { throttle: 1 } : { brake: phase === 1 ? 1 : 0 };
  }, 16);
  console.log(`[brake] 200->0 in ${f2(tb)}s over ${f2(db)}m, final speed ${f2(race.car.speed)}`);
}

// 4. steady cornering on the skidpad
for (const target of [12, 25, 40, 60]) {
  const tr = skidpad();
  let maxRoll = 0, samples = [];
  runRace(tr, (t, car) => {
    const v = car.speed;
    if (t < 6) return { throttle: v < target ? 1 : 0, steer: 0 };
    const e = euler(car.quat);
    maxRoll = Math.max(maxRoll, Math.abs(e.roll));
    if (t > 8) samples.push({ v, w: car.angVel.y, slip: car.slipAngle });
    return { throttle: v < target ? 1 : 0.2, steer: 1 };
  }, 11);
  const v = samples.reduce((a, s) => a + s.v, 0) / samples.length;
  const w = samples.reduce((a, s) => a + s.w, 0) / samples.length;
  const slip = samples.reduce((a, s) => a + Math.abs(s.slip), 0) / samples.length;
  console.log(`[corner] target ${kmh(target)} km/h -> v=${kmh(v)} km/h radius=${f2(Math.abs(v / w))}m latAcc=${f2(Math.abs(v * w))} m/s2 (${f2(Math.abs(v * w) / 9.81)} g) slip=${f2(slip * 57.3)}deg maxRoll=${f2(maxRoll * 57.3)}deg`);
}

// 5. grip: full lock at speed and braking into a corner keep the car gripped
// (no brake drift: the car only slides when it is really driven past its grip)
for (const [name, v0, brakeT] of [['full-lock-150', 150, 0], ['full-lock-300', 300, 0], ['brake-in-corner-200', 200, 0.6]]) {
  const tr = skidpad();
  let maxSlip = 0, slide = 0, t0 = null;
  runRace(tr, (t, car) => {
    if (t0 == null) { if (car.speed * 3.6 < v0) return { throttle: 1 }; t0 = t; }
    const dt = t - t0;
    if (dt > 0.1 && dt < 2) { maxSlip = Math.max(maxSlip, Math.abs(car.slipAngle) * 57.3); if (car.wheels.some((w) => w.contact && w.sliding)) slide += PHYS_DT; }
    return dt < brakeT ? { brake: 1, steer: 1 } : { throttle: 1, steer: 1 };
  }, 14);
  const ok = maxSlip < 5 && slide < 0.3;
  console.log(`[grip] ${name}: max slip ${f2(maxSlip)} deg, sliding ${f2(slide)} s ${ok ? 'ok' : 'FAIL'}`);
}

// 6. loop
{
  const t = new TrackBuilder().at(0, 0, 0, 0).start().straight(6).loop('R').straight(4).finish();
  const tr = new Track(t.build({ name: 'loop' }));
  let maxY = 0, minUp = 1;
  const race = runRace(tr, (tt, car) => {
    maxY = Math.max(maxY, car.pos.y);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quat);
    minUp = Math.min(minUp, up.y);
    return { throttle: 1 };
  }, 12);
  console.log(`[loop] maxY=${f2(maxY)} minUp.y=${f2(minUp)} final pos=(${f2(race.car.pos.x)}, ${f2(race.car.pos.y)}, ${f2(race.car.pos.z)}) state=${race.state} time=${f2(race.finishTime ?? NaN)} speed=${kmh(race.car.speed)}`);
}

// 7. jump
{
  const t = new TrackBuilder().at(0, 0, 0, 0).start().straight(5).kicker(true).jump(3, 0).straight(8).finish();
  const tr = new Track(t.build({ name: 'jump' }));
  let maxY = 0, air = 0, maxImpact = 0, maxAng = 0;
  const race = runRace(tr, (tt, car) => {
    maxY = Math.max(maxY, car.pos.y);
    if (car.grounded === 0) air += PHYS_DT;
    maxImpact = Math.max(maxImpact, car.impact);
    maxAng = Math.max(maxAng, car.angVel.length());
    return { throttle: 1 };
  }, 12);
  console.log(`[jump] maxY=${f2(maxY)} air=${f2(air)}s maxImpact=${f2(maxImpact)} maxAngVel=${f2(maxAng)} state=${race.state} final=(${f2(race.car.pos.x)}, ${f2(race.car.pos.y)}, ${f2(race.car.pos.z)})`);
}

// 8. wall hit at an angle
{
  const tr = straightTrack(40);
  let maxAng = 0, hitV = 0, after = 0;
  const race = runRace(tr, (t, car) => {
    maxAng = Math.max(maxAng, car.angVel.length());
    if (t < 4) return { throttle: 1 };
    if (!hitV && car.impact > 0) hitV = car.speed;
    if (t < 4.35) return { throttle: 1, steer: 1 };
    after = car.speed;
    return { throttle: 1, steer: t < 5 ? -0.6 : 0 }; // steer away from the wall
  }, 7);
  const e = euler(race.car.quat);
  console.log(`[wall] speed at hit=${kmh(hitV)} after=${kmh(after)} maxAngVel=${f2(maxAng)} final x=${f2(race.car.pos.x)} y=${f2(race.car.pos.y)} roll=${f2(e.roll * 57.3)} pitch=${f2(e.pitch * 57.3)}`);
}
