// Built-in campaign: short PolyTrack-style tracks (15-25 s) with open plazas,
// forks, half-pipes and jumps. style 'fs' = full speed (never lift), 'tech' = brake
// for the corners; tests/campaign.mjs checks both, plus the time range (a track may
// widen it with `time`). Medal times come from AI runs (tests/medals.mjs).

import { TrackBuilder } from './builder.js';
import { CAMPAIGN_MEDALS } from './medals.js';

const B = () => new TrackBuilder();

export const CAMPAIGN = [
  {
    // technical: brake for the tight turns inside the hangar
    id: 'c11', name: 'Hangar Run', style: 'tech', env: 'day', land: 'mountains', time: [15, 32],
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3)
      .right(1).straight(1).left(1)
      .straight(1).cp()
      .left(1).straight(2).left(1)
      .straight(1).right(1).right(1)
      .up(2, 1).straight(1).right(2)
      .straight(2).down(2, 1)
      .right(1).left(1).straight(2).cp()
      .left(3).straight(2)
      .finish()
      .hangar(-2, -10, 4, -4)
      .prop('containers', 0, -6, 1).prop('crates', 1, -5).prop('containers', 2, -8).prop('crates', 0, -8)
      .build(),
  },
  {
    // full speed: two wide plazas, sweep across them on your own line
    id: 'p02', name: 'Plaza Sprint', style: 'fs', env: 'morning', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(3)
      .plaza(3, 2, 2).plazaTurn('R', 2, 2).plaza(2, 2, 2).plazaCp(2, 2).plaza(2, 2, 2)
      .straight(3).right(4).straight(4).boost().straight(2)
      .plaza(3, 2, 2).plazaTurn('R', 2, 2).plaza(2, 2, 2).plazaCp(2, 2).plaza(1, 2, 2)
      .straight(2).left(4).straight(3).finish()
      .build(),
  },
  {
    // full speed: half-pipe sweepers, ride the walls
    id: 'p04', name: 'Tube Rush', style: 'fs', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(2)
      .pipe(3).pipeRight(3).pipe(2).cp().pipe(1).pipeRight(3).pipe(3)
      .straight(1).boost().pipe(2).pipeLeft(3).pipe(2).pipeLeft(3).pipe(2)
      .straight(2).finish()
      .build(),
  },
  {
    // full speed: the long sweeper or the shortcut over the plaza jump
    id: 'p03', name: 'Split Decision', style: 'fs', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1).up(5, 2).straight(2)
      .plaza(3, 2, 2).plazaCp(2, 2).mark('cut', 'R')
      .straight(3).right(4).straight(4).right(4).straight(2)
      .plaza(3, 2, 2).plazaFinish(2, 2)
      .branch('cut', (b) => b.edges('open').straight(2).kicker())
      .build(),
  },
  {
    // technical: tight plaza corners and dirt, brake and pick your line
    id: 'p06', name: 'Drift Yard', style: 'tech', env: 'night', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .plaza(1, 1, 1).plazaTurn('L', 1, 1).plaza(1, 1, 1).plazaTurn('R', 1, 1).plaza(1, 1, 1).plazaCp(1, 1)
      .straight(1).surface('dirt').right(1).straight(1).left(1).surface('road').straight(1).boost()
      .plaza(1, 1, 1).plazaTurn('R', 1, 1).plaza(1, 1, 1).plazaTurn('R', 1, 1).plaza(1, 1, 1).plazaFinish(1, 1)
      .hangar(-3, -15, 3, -5)
      .build(),
  },
  {
    // full speed: kickers from plaza to plaza
    id: 'p07', name: 'Canyon Cut', style: 'fs', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(2)
      .kicker().jump(4, 0).plaza(6, 2, 2).plazaCp(2, 2)
      .straight(1).right(4).straight(2).kicker().jump(4, 0).plaza(6, 2, 2)
      .straight(1).right(4).straight(3).finish()
      .build(),
  },
  {
    // full speed: a sky deck with no side walls and wide landings
    id: 'p05', name: 'Sky Deck', style: 'fs', env: 'day', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .up(5, 2).straight(2).up(5, 2).edges('open').straight(3).right(4).straight(2)
      .plaza(3, 2, 2).plazaCp(2, 2).plaza(2, 2, 2).edges('wall')
      .straight(1).right(4).edges('open').straight(3).edges('wall')
      .down(5, 2).straight(2).down(5, 2).straight(3).finish()
      .build(),
  },
  {
    // technical: an ice rink, slide wide and catch it
    id: 'p09', name: 'Ice Rink', style: 'tech', env: 'night', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .surface('ice').plaza(2, 1, 1).plazaTurn('R', 1, 1).plaza(1, 1, 1).plazaTurn('R', 1, 1).plaza(1, 1, 1).surface('road')
      .plazaCp(1, 1).straight(2).boost()
      .surface('ice').plaza(1, 1, 1).plazaTurn('L', 1, 1).plaza(2, 1, 1).surface('road').plazaFinish(1, 1)
      .hangar(-1, -8, 5, 1)
      .build(),
  },
  {
    // full speed: loops, a pipe and a plaza between them
    id: 'p08', name: 'Loop Garden', style: 'fs', env: 'morning', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(2)
      .loop('R').straight(2).plaza(3, 2, 2).plazaCp(2, 2).plaza(1, 2, 2)
      .straight(1).right(4).pipe(3).pipeRight(3).pipe(1)
      .straight(1).loop('L').straight(3).finish()
      .build(),
  },
  {
    // full speed finale: climb, sky plaza, pipe, loop and a plaza finish
    id: 'p10', name: 'Grand Finale', style: 'fs', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .up(5, 2).straight(3).plaza(3, 2, 2).plazaTurn('R', 2, 2).plaza(2, 2, 2).plazaCp(2, 2).plaza(1, 2, 2)
      .straight(1).down(5, 2).straight(2).pipe(2).pipeRight(3).pipe(2)
      .straight(1).loop('R').straight(2).plaza(2, 2, 2).plazaFinish(2, 2)
      .build(),
  },
];

for (const c of CAMPAIGN) c.medals = CAMPAIGN_MEDALS[c.id] || null;
