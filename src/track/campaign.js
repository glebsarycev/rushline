// Built-in campaign. Every layout is an original design written with the
// turtle builder; medal times come from validated AI runs (tests/tracks.mjs).

import { TrackBuilder } from './builder.js';
import { CAMPAIGN_MEDALS } from './medals.js';

const B = () => new TrackBuilder();

export const CAMPAIGN = [
  {
    id: 'c01', name: 'Morning Warmup', env: 'morning', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2)
      .right(2).straight(1).cp()
      .up(3, 1).straight(1)
      .right(3).boost()
      .down(3, 1)
      .right(2).cp().straight(2)
      .left(2).straight(2)
      .right(3).straight(1)
      .right(2).straight(2)
      .finish()
      .build(),
  },
  {
    id: 'c02', name: 'Kicker Park', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3)
      .kicker().jump(2, 0).straight(4).cp()
      .right(2).straight(1).boost()
      .kicker().jump(3, 0).straight(4)
      .right(3).straight(1).cp()
      .up(2, 1).straight(1)
      .kicker(true).jump(4, 0).straight(5)
      .right(2).straight(3).boost().straight(1)
      .finish()
      .build(),
  },
  {
    id: 'c03', name: 'Loop Avenue', env: 'day', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(4)
      .loop('R').straight(2).cp()
      .right(2).straight(2).boost().straight(1)
      .loop('L').straight(2)
      .right(2).cp().straight(3)
      .loop('R').straight(2)
      .right(2).straight(3)
      .finish()
      .build(),
  },
  {
    id: 'c04', name: 'Dust Bowl', env: 'sunset', land: 'canyon',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(1)
      .surface('dirt').straight(1)
      .right(2).straight(2)
      .left(2).cp().straight(1)
      .right(1).right(1).straight(2)
      .left(2).boost().straight(2)
      .right(3).cp().straight(2)
      .right(2).straight(3)
      .surface('road').straight(2)
      .finish()
      .build(),
  },
  {
    id: 'c05', name: 'Skyline', env: 'sunset', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(1)
      .up(4, 2).straight(1)
      .bankRight(2).boost().straight(2).cp()
      .up(3, 1).straight(1)
      .bankRight(3).straight(1)
      .down(4, 2).cp()
      .right(2).straight(2)
      .down(3, 1)
      .right(2).straight(1)
      .finish()
      .build(),
  },
  {
    id: 'c06', name: 'Frostbite', env: 'night', land: 'mountains',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2).boost().straight(1)
      .surface('ice').straight(2).right(4).surface('road').straight(1).cp()
      .straight(1).bankLeft(3).straight(1)
      .surface('ice').straight(1).left(3).surface('road').straight(1).cp()
      .up(3, 1).straight(1).right(2)
      .surface('ice').straight(2).surface('road')
      .down(3, 1).right(3).straight(1)
      .finish()
      .build(),
  },
  {
    id: 'c07', name: 'Wall Street', env: 'day', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3).boost().straight(1)
      .wallRight().platform(1).straight(1).cp()
      .straight(1).superBoost().straight(2)
      .wallRight().platform(1)
      .loop('L').straight(1).cp()
      .right(2).straight(2).boost()
      .wallRight().platform(1).straight(2)
      .finish()
      .build(),
  },
  {
    id: 'c08', name: 'Platform Leap', env: 'sunset', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(1).boost()
      .up(4, 2).straight(3)
      .kicker().jump(2, 2).platform(3).cp()
      .straight(1).kicker().jump(2, 2).platform(3)
      .right(2).straight(1).superBoost()
      .kicker(true).jump(4, 2).platform(6).cp()
      .left(2).straight(1)
      .down(4, 2).straight(2)
      .finish()
      .build(),
  },
  {
    id: 'c09', name: 'Night Shift', env: 'night', land: 'city',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(2)
      .right(2).surface('dirt').straight(2).left(1).right(1).straight(1).surface('road').cp()
      .boost().straight(2).loop('R').straight(1)
      .right(3).up(3, 1).straight(2).cp()
      .kicker().jump(3, 1).straight(3).down(3, 1)
      .left(2).straight(2)
      .finish()
      .build(),
  },
  {
    id: 'c10', name: 'Grand Rush', env: 'morning', land: 'sea',
    medals: null,
    build: () => B().at(0, 0, 0, 0)
      .start().straight(3)
      .up(4, 2).straight(3).bankRight(3).straight(1).cp()
      .down(4, 2).straight(1).loop('L').straight(2)
      .right(2).surface('dirt').straight(2).left(2).surface('road').cp()
      .boost().straight(2).wallLeft().platform(1).straight(1)
      .kicker(true).jump(3, 0).straight(6).cp()
      .right(3).surface('ice').straight(2).surface('road').right(2)
      .straight(2)
      .finish()
      .build(),
  },
  {
    // technical: brake for the tight turns inside the hangar
    id: 'c11', name: 'Hangar Run', env: 'day', land: 'mountains',
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
];

for (const c of CAMPAIGN) c.medals = CAMPAIGN_MEDALS[c.id] || null;
