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
    build: () => B().at(0, 6, 0, 0).smoothing('spline')
      // 1: start, turbo into a banked right, S-bend left, turbo straight, CP1
      .start().boost()
      .bankRight(3)                                  // -> E
      .straight(1).left(4)                           // -> N
      .boost().straight(1).cp()
      // 2: over the crest, wide tilted deck bending left, turbo on the tilt, CP2
      .prof('road')
      .sweep('s4', { rise: 1 }).sweep('s2').sweep('s4', { rise: -1 })  // a long low hump
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
    // one steady descent of about 6 % (every piece after the start drops a level, the
    // height is a spline over the whole run), and tilt comes in on the straight before
    // a turn, holds through it and goes out on the straight after: no crest and no
    // sudden change of tilt, so the car stays on the deck even flat out
    build: () => B().at(0, 34, 0, 0).prof('deck').smoothing('spline')
      .sweep('s1', { feature: 's' }).sweep('s1', { feature: 'b' })
      // 1: tilt in, right, tilt out with CP1
      .sweep('s3', { rise: -1, bank: 25 })
      .sweep('r3', { rise: -1, bank: 25 })                   // -> E
      .sweep('s4', { rise: -1, bank: 0, feature: 'c' })
      // 2: tilted right U-turn, CP2 on the way out
      .sweep('s3', { rise: -1, bank: 30 })
      .sweep('r3', { rise: -1, bank: 30 })                   // -> S
      .sweep('r3', { rise: -1, bank: 30 })                   // -> W
      .sweep('s4', { rise: -1, bank: 0, feature: 'c' })
      // 3: right under the start, then a long tilted left with CP3 on the tilt
      .sweep('s3', { rise: -1, bank: 25 })
      .sweep('r3', { rise: -1, bank: 25 })                   // -> N
      .sweep('s3', { rise: -1, bank: 0 })
      .sweep('s3', { rise: -1, bank: -30 })
      .sweep('l4', { rise: -2, bank: -35, feature: 'c' })    // -> W
      .sweep('l4', { rise: -1, bank: -35 })                  // -> S
      .sweep('s4', { rise: -1, bank: 0 })
      // 4: right to tower B, CP4
      .sweep('s3', { rise: -1, bank: 30 })
      .sweep('r3', { rise: -1, bank: 30 })                   // -> W
      .sweep('s4', { rise: -1, bank: 0, feature: 'c' })
      // 5: a full left helix at a steady tilt, CP5 on the way
      .sweep('s3', { rise: -1, bank: -35 })
      .sweep('l4', { rise: -1, bank: -35 })                  // -> S
      .sweep('l4', { rise: -2, bank: -35 })                  // -> E
      .sweep('l4', { rise: -1, bank: -35, feature: 'c' })    // -> N
      .sweep('l4', { rise: -2, bank: -35 })                  // -> W
      .sweep('s4', { rise: -1, bank: 0 })
      // 6: turbo, big right U-turn with CP6, down to the finish
      .sweep('s3', { rise: -1, bank: 30, feature: 'b' })
      .sweep('r4', { rise: -1, bank: 35, feature: 'c' })     // -> N
      .sweep('r3', { rise: -1, bank: 35 })                   // -> E
      .sweep('s4', { rise: -1, bank: 0 })
      .sweep('s3', { rise: -1 })
      .sweep('s2', { feature: 'f' })
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
      .sweep('s2', { rise: -1 })
      .sweep('r2')                                   // -> E
      .sweep('l2', { feature: 'c' })                 // -> N
      // 2: right hairpin, S-bend along the barriers, CP2
      .sweep('r1').sweep('r1')                       // hairpin -> S
      .sweep('l2', { rise: -1 })                     // -> E
      .sweep('r2', { rise: -1 })                     // -> S
      .sweep('l2', { feature: 'c' })                 // -> E
      // 3: grass hillside, dirt bend, CP3
      .prof('platform').surface('grass')
      .sweep('s4', { rise: -2 })
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
      .sweep('s3', { rise: -1, feature: 'c' })
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
