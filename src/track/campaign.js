// Built-in campaign: three 35-45 s tracks, one per Trackmania style, built after the
// "recipe" of a well-known map of that style (order of sections, pace, checkpoint
// rhythm). style 'fs' = full speed (never lift), 'st' = speed tech (fast, tilted, pick
// the line), 'tech' = brake for the corners;
// tests/campaign.mjs checks both, plus the time range. Medal times come from AI runs
// (tests/medals.mjs). `theme` picks the scenery (see render/themes.js).

import { TrackBuilder } from './builder.js';
import { CAMPAIGN_MEDALS } from './medals.js';

const B = () => new TrackBuilder();

export const CAMPAIGN = [
  {
    // full speed through a violet stadium: turbos, banked decks, wall rides, a
    // half-pipe and a loop (after "purple" by entrylag)
    id: 'ultraviolet', name: 'Ultraviolet', style: 'fs', theme: 'violet', env: 'sunset', land: 'city',
    medals: null,
    build: () => B().at(0, 6, 0, 0)
      // 1: start, turbo into a banked right, S-bend left, turbo straight, CP1
      .start().boost()
      .bankRight(3)                                  // -> E
      .straight(1).left(4)                           // -> N
      .boost().straight(1).cp()
      // 2: over the crest, wide tilted deck bending left, turbo on the tilt, CP2
      .straight(1)
      .up(5, 2).straight(1)
      .down(5, 2).straight(1)
      .prof('deck')
      .sweep('s1')
      .sweep('l4', { rise: -1, bank: -30 })          // -> W
      .sweep('s2', { bank: -30, feature: 'b' })
      .sweep('s1', { bank: 0, feature: 'c' })
      // 3: half-pipe bend, wall ride, long smooth descent, CP3
      .prof('road')
      .pipe(1).pipeLeft(3)                           // -> S
      .pipe(1).straight(1)
      .wallRight()                                   // -> W
      .straight(2)
      .sweep('s3', { rise: -1 }).sweep('s3', { rise: -1 })
      .cp()
      // 4: loop, banked right, tilted S on the deck, CP4
      .loop('R').straight(2)
      .bankRight(3)                                  // -> N
      .prof('deck')
      .sweep('r4', { rise: -1, bank: 30 })           // -> E
      .sweep('s1', { bank: 0, feature: 'c' })
      .sweep('l4', { rise: -1, bank: -30 })          // -> N
      .sweep('s1', { bank: 0 })
      // 5: big wall ride, half-pipe bend, turbo, finish in the hall
      .prof('road')
      .wallRight()                                   // -> E
      .straight(1).pipe(1).pipeRight(3)              // -> S
      .pipe(1).straight(1).boost()
      .finish()
      .hangar(-7, -31, -5, -28)                      // the finish hall
      .build(),
  },
  {
    // speed tech on wide tilted decks spiralling down two towers, passing under
    // itself (after "MirrorWorld" by OregoX)
    id: 'looking-glass', name: 'Looking Glass', style: 'st', theme: 'mirror', env: 'morning', land: 'mountains',
    medals: null,
    build: () => B().at(0, 20, 0, 0).prof('deck')
      // 1: start on top of tower A, turbo, right, CP1
      .sweep('s1', { feature: 's' }).sweep('s1', { feature: 'b' }).sweep('s1')
      .sweep('r3', { bank: 20 })                     // -> E
      .sweep('s1', { bank: 0, feature: 'c' })
      // 2: drop, tilted U-turn under the start straight, CP2 on the crest
      .sweep('s1', { rise: -1 }).sweep('s2', { rise: -2 })
      .sweep('r3', { rise: -2, bank: 30 })           // -> S
      .sweep('r3', { rise: -1, bank: 30 })           // -> W
      .sweep('s1', { bank: 0, feature: 'c' })
      // 3: right with a tilt, unwind, long steep tilted left with CP3 on the tilt
      .sweep('r3', { rise: -1, bank: 25 })           // -> N
      .sweep('s1', { bank: 0 })
      .sweep('s2', { rise: -1, bank: -25 })
      .sweep('l4', { rise: -1, bank: -40, feature: 'c' })  // -> W
      .sweep('l4', { rise: -1, bank: -30 })          // -> S
      .sweep('s1', { bank: 0 })
      // 4: drop to tower B, right, CP4
      .sweep('s2', { rise: -1 })
      .sweep('r3', { rise: -1, bank: 30 })           // -> W
      .sweep('s1', { bank: 0, feature: 'c' })
      // 5: a full left-hand helix that passes 32 m under CP4, CP5 on the way
      .sweep('l4', { rise: -1, bank: -35 })          // -> S
      .sweep('l4', { rise: -1, bank: -40 })          // -> E
      .sweep('l4', { rise: -1, bank: -40, feature: 'c' })  // -> N
      .sweep('l4', { rise: -1, bank: -30 })          // -> W
      .sweep('s1', { bank: 0 })
      // 6: turbo, big banked right U-turn with CP6, drop to the finish
      .sweep('r3', { bank: 30 })                     // -> N
      .sweep('s1', { bank: 0, feature: 'b' })
      .sweep('r4', { bank: 35, feature: 'c' })       // -> E
      .sweep('r3', { rise: -1, bank: 30 })           // -> S
      .sweep('s1', { bank: 0 })
      .sweep('s2', { rise: -1 })
      .sweep('s1', { feature: 'f' })
      .build(),
  },
  {
    // tech down a mountain valley: hairpins, a grass hillside, dirt, a jump off a
    // cliff over the river and a finish in a cave (after "Vanndalen" by Ealipse)
    id: 'stillwater', name: 'Stillwater', style: 'tech', theme: 'valley', env: 'day', land: 'mountains',
    medals: null,
    build: () => B().at(0, 12, 0, 0).prof('tech')
      // 1: start high, drop, right, left around a rock, CP1
      .sweep('s1', { feature: 's' })
      .sweep('s1', { rise: -1 })
      .sweep('r2')                                   // -> E
      .sweep('l2', { feature: 'c' })                 // -> N
      // 2: right hairpin, S-bend along the barriers, CP2
      .sweep('r1').sweep('r1')                       // hairpin -> S
      .sweep('l2', { rise: -1 })                     // -> E
      .sweep('r2', { rise: -1 })                     // -> S
      .sweep('l2', { feature: 'c' })                 // -> E
      // 3: grass hillside, dirt bend, CP3
      .prof('platform').surface('grass')
      .sweep('s2', { rise: -2 })
      .prof('tech').surface('road')
      .sweep('r3')                                   // -> S
      .surface('dirt')
      .sweep('l3', { rise: -1 })                     // -> E
      .sweep('s1', { feature: 'c' })
      // 4: off the cliff over the river, fast right (CP4), turbo, long left, CP5
      .surface('road')
      .sweep('s1').jump(1, 5)                        // no turbo here: faster cars overshoot the landing
      .sweep('s3', { rise: -1 })                     // landing downhill (no gate to fly into)
      .sweep('s1')
      .sweep('r4', { rise: -1, feature: 'c' })       // -> S
      .sweep('s1', { feature: 'b' })
      .sweep('l4')                                   // -> E
      .sweep('s2', { rise: -1, feature: 'c' })
      // 5: tight left, dirt, left, CP6
      .sweep('l1')                                   // -> N
      .surface('dirt').sweep('r2')                   // -> E
      .surface('road').sweep('l2', { feature: 'c' }) // -> N
      // 6: tight left hairpin, down under the road, CP7 in the dirt
      .sweep('l1').sweep('l1', { rise: -1 })         // hairpin -> S
      .sweep('r2')                                   // -> W, under the road above
      .surface('dirt').sweep('l2', { rise: -1, feature: 'c' })  // -> S
      // 7: into the cave, finish
      .surface('road').sweep('r2')                   // -> W
      .sweep('s1', { feature: 'f' })
      .build(),
  },
];

for (const c of CAMPAIGN) c.medals = CAMPAIGN_MEDALS[c.id] || null;
