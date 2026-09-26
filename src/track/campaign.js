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
    // full speed: start high, dive to the sea level, climb back to a sky platform run, loop at the end
    id: 'n02', name: 'Open Throttle', style: 'fs', env: 'morning', land: 'sea',
    medals: null,
    build: () => B().at(0, 4, 0, 0)
      .start().straight(2).boost().straight(2)
      .down(5, 2).straight(2).right(4).straight(2).cp()
      .up(5, 2).straight(6).bankRight(3).straight(1)
      .platform(5).cp()
      .straight(1).down(5, 2).straight(4).down(5, 2).straight(3)
      .right(4).straight(3).loop('R').straight(4)
      .finish()
      .build(),
  },
  {
    // technical: dirt switchbacks up a mesa, platform corners on top, dirt drops down
    id: 'n03', name: 'Dust Devil', style: 'tech', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .surface('dirt').right(1).up(3, 1).left(1).up(3, 1).right(2)
      .surface('road').straight(1).cp()
      .platform(2).platformTurn('L').platform(1).platformTurn('L').platform(2)
      .surface('dirt').down(3, 1).right(1).straight(1).down(3, 1).left(2).cp()
      .surface('road').straight(2).boost().right(1).straight(2)
      .finish()
      .build(),
  },
  {
    // full speed: a highway in the sky, never touches the ground until the finish dive
    id: 'n04', name: 'Skyway', style: 'fs', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 5, 0, 0)
      .start().straight(2).boost().straight(2)
      .right(4).straight(2).up(5, 2).straight(2).cp()
      .bankRight(3).straight(2).platform(4)
      .down(5, 2).straight(2).right(4).straight(2).cp()
      .left(4).up(5, 2).straight(6).bankLeft(3).straight(2).platform(3)
      .straight(2).down(5, 2).straight(2).down(5, 2).straight(2).down(5, 2).straight(5)
      .finish()
      .build(),
  },
  {
    // technical: a ground hangar, a climb, and a second hangar high up
    id: 'n05', name: 'Twin Hangars', style: 'tech', env: 'night', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(1)
      .right(1).left(1).straight(1).right(2).cp()
      .straight(1).up(3, 1).straight(1).up(3, 1).straight(1)
      .platformTurn('L').platform(1).platformTurn('L')
      .straight(2).boost().left(1).straight(1).right(1).straight(1).cp()
      .right(1).down(4, 2).straight(1).left(2).straight(2)
      .finish()
      .hangar(0, -9, 2, -6).hangar(9, -11, 13, -9)
      .prop('crates', 0, -8).prop('containers', 2, -7, 1).prop('crates', 11, -10)
      .build(),
  },
  {
    // full speed: loops at two heights joined by long slopes
    id: 'n06', name: 'Loop Fever', style: 'fs', env: 'sunset', land: 'sea',
    medals: null,
    build: () => B().at(0, 3, 0, 0)
      .start().straight(2).boost().straight(2)
      .loop('R').straight(3).bankRight(3).straight(2).cp()
      .down(5, 2).straight(1).down(3, 1).straight(4)
      .loop('L').straight(4).right(4).straight(2).cp()
      .up(5, 2).straight(6).bankRight(3).straight(2).platform(3)
      .down(5, 2).straight(4)
      .finish()
      .build(),
  },
  {
    // technical: an icy factory in the sky with platform corners
    id: 'n07', name: 'Ice Works', style: 'tech', env: 'night', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .up(4, 2).surface('ice').straight(2).surface('road')
      .platformTurn('R').platform(1).platformTurn('R').cp()
      .surface('ice').straight(2).surface('road').boost().straight(1)
      .platformTurn('L').platform(1).platformTurn('L')
      .up(3, 1).straight(1).platformTurn('R').platformTurn('R').cp()
      .straight(1).down(4, 2).surface('ice').straight(1).surface('road').down(3, 1).straight(2)
      .finish()
      .hangar(0, -11, 5, -5)
      .prop('containers', 1, -8).prop('crates', 3, -8).prop('crates', 1, -6)
      .build(),
  },
  {
    // full speed: kicker drops from the top of the canyon down to the floor
    id: 'n08', name: 'Canyon Jump', style: 'fs', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 5, 0, 0)
      .start().straight(3).boost().straight(1)
      .kicker().jump(2, 3).straight(7).cp()
      .right(4).straight(2).kicker().jump(2, 1).straight(8).cp()
      .right(4).straight(2).up(5, 2).straight(3).kicker().jump(2, 3).straight(10)
      .left(4).straight(2).down(5, 2).straight(6)
      .finish()
      .build(),
  },
  {
    // technical: a factory hangar with a three-level ramp inside
    id: 'n09', name: 'Factory Floor', style: 'tech', env: 'morning', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(1)
      .right(2).straight(1).cp()
      .up(2, 1).right(1).up(2, 1).right(1).up(2, 1).right(1).straight(1)
      .platformTurn('R').platform(1).cp()
      .straight(1).boost().right(1).straight(1).down(4, 2).straight(1)
      .left(1).down(3, 1).straight(2)
      .finish()
      .hangar(3, -7, 8, -4)
      .prop('containers', 7, -7).prop('crates', 4, -5).prop('crates', 7, -4)
      .build(),
  },
  {
    // full speed finale: climb to the sky, platform run, dive, loop, banked finish
    id: 'n10', name: 'Grand Line', style: 'fs', env: 'day', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(4)
      .bankRight(3).straight(1).up(5, 2).straight(2)
      .bankRight(3).straight(1).up(5, 2).straight(2)
      .bankRight(3).straight(1).up(5, 2).straight(2).cp()
      .bankRight(3).straight(2).platform(4)
      .down(5, 2).straight(4).down(5, 2).straight(4)
      .loop('L').straight(4)
      .right(4).straight(3).cp()
      .down(5, 2).straight(4)
      .finish()
      .build(),
  },
];

for (const c of CAMPAIGN) c.medals = CAMPAIGN_MEDALS[c.id] || null;
