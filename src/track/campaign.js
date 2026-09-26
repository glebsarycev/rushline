// Built-in campaign: ten original layouts written with the turtle builder.
// style 'fs' = full speed (never lift), 'tech' = brake for the corners; both are
// checked by tests/campaign.mjs. Medal times come from AI runs (tests/medals.mjs).

import { TrackBuilder } from './builder.js';
import { CAMPAIGN_MEDALS } from './medals.js';

const B = () => new TrackBuilder();

export const CAMPAIGN = [
  {
    // technical: brake for the tight turns inside the hangar
    id: 'c11', name: 'Hangar Run', style: 'tech', env: 'day', land: 'mountains',
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
    // full speed: wide sweepers, a banked turn and a loop
    id: 'n02', name: 'Open Throttle', style: 'fs', env: 'morning', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(7)
      .right(4).straight(7).cp()
      .bankRight(3).straight(3).loop('R').straight(6)
      .right(4).straight(5).boost().straight(3).cp()
      .right(4).straight(4).loop('L').straight(4)
      .finish()
      .build(),
  },
  {
    // technical: dirt chicanes and hairpins after the boosts
    id: 'n03', name: 'Dust Devil', style: 'tech', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(3)
      .surface('dirt').right(1).straight(2).left(1)
      .straight(3).right(2).straight(1).right(1).cp()
      .surface('road').straight(4).boost()
      .surface('dirt').left(1).left(1).straight(3)
      .right(2).straight(2).surface('road').left(1).straight(2).cp()
      .straight(3).right(1).straight(2)
      .finish()
      .build(),
  },
  {
    // full speed: raised road on steel supports and a jump
    id: 'n04', name: 'Skyway', style: 'fs', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).up(3, 1).straight(3).up(3, 1).straight(4)
      .right(4).straight(3).cp()
      .bankRight(3).straight(4)
      .kicker().jump(2, 2).straight(7).cp()
      .right(4).straight(4).down(3, 1).straight(3).down(3, 1).straight(9)
      .finish()
      .build(),
  },
  {
    // technical: two hangars, a climb and tight chicanes
    id: 'n05', name: 'Twin Hangars', style: 'tech', env: 'night', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(1)
      .right(1).left(1).straight(1).right(2).cp()
      .straight(1).left(1).left(1).straight(1)
      .up(2, 1).right(2).straight(1).down(2, 1)
      .right(1).straight(3).boost().straight(1).cp()
      .left(2).right(1).left(1).straight(2)
      .finish()
      .hangar(0, -9, 3, -6).hangar(6, -18, 9, -15)
      .prop('crates', 3, -7).prop('containers', 0, -8, 1).prop('crates', 6, -17).prop('containers', 7, -18, 1)
      .build(),
  },
  {
    // full speed: two loops and a wall ride
    id: 'n06', name: 'Loop Fever', style: 'fs', env: 'sunset', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(3)
      .loop('R').straight(4)
      .bankRight(3).straight(4).cp()
      .wallRight().straight(5)
      .loop('L').straight(5).cp()
      .right(4).straight(4).boost().straight(3)
      .right(4).straight(4)
      .finish()
      .build(),
  },
  {
    // technical: brake on ice before the hairpins
    id: 'n07', name: 'Ice Works', style: 'tech', env: 'night', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(2)
      .right(1).right(1)
      .surface('ice').straight(3).surface('road')
      .left(1).straight(1).left(1).cp()
      .boost().straight(2).surface('ice').straight(2).surface('road')
      .right(1).straight(1).right(1)
      .straight(2).left(2).cp()
      .boost().surface('ice').straight(2).surface('road').left(1).straight(3)
      .finish()
      .hangar(3, -9, 6, -3)
      .prop('crates', 4, -5).prop('containers', 4, -7)
      .build(),
  },
  {
    // full speed: three kicker jumps across the canyon
    id: 'n08', name: 'Canyon Jump', style: 'fs', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(2)
      .kicker().jump(2, 0).straight(5)
      .right(4).straight(3).cp()
      .up(3, 1).straight(2).kicker().jump(2, 1).straight(5)
      .right(4).straight(4).cp()
      .kicker().jump(2, 1).straight(6)
      .right(4).straight(3).boost().straight(3)
      .finish()
      .build(),
  },
  {
    // technical: a big factory hangar with an upper floor
    id: 'n09', name: 'Factory Floor', style: 'tech', env: 'morning', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(1)
      .right(2).straight(1).cp()
      .left(1).up(2, 1).right(1).right(1).straight(1).down(2, 1)
      .left(1).straight(2).boost().right(2).cp()
      .straight(1).left(1).left(1).straight(3).boost()
      .right(1).straight(1).left(1).straight(2)
      .finish()
      .hangar(4, -10, 11, -2)
      .prop('containers', 7, -9, 1).prop('crates', 9, -8).prop('containers', 7, -3).prop('crates', 5, -3)
      .build(),
  },
  {
    // full speed finale: loops, banked turns and a jump
    id: 'n10', name: 'Grand Line', style: 'fs', env: 'day', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).up(3, 1).straight(3).bankRight(3).straight(3).cp()
      .down(3, 1).straight(4).loop('L').straight(4)
      .right(4).straight(3).kicker().jump(2, 0).straight(8).cp()
      .bankRight(3).straight(3).loop('R').straight(4)
      .right(4).straight(3).boost().straight(3)
      .finish()
      .build(),
  },
];

for (const c of CAMPAIGN) c.medals = CAMPAIGN_MEDALS[c.id] || null;
