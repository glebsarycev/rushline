import { TrackBuilder } from '../../src/track/builder.js';
const B = () => new TrackBuilder();
export const TRACKS = [
  {
    id: 'st3', name: 'Speed tech v3 (towers)', style: 'tech',
    build: () => B().at(0, 20, 0, 0).prof('deck')
      // start, turbo; tower A: right-hand spiral around pillar A
      .sweep('s1', { feature: 's' }).sweep('s1', { feature: 'b' }).sweep('s1')
      .sweep('r3', { bank: 20 })                       // -> E
      .sweep('s1', { bank: 0, feature: 'c' })          // CP1 (top of tower A)
      .sweep('s1', { rise: -1 }).sweep('s2', { rise: -2 })   // drop
      .sweep('r3', { rise: -2, bank: 30 })             // -> S, tilted into the turn
      .sweep('r3', { rise: -1, bank: 30 })             // -> W, under the start straight
      .sweep('s1', { rise: 0, bank: 0, feature: 'c' }) // CP2 crest
      .sweep('r3', { rise: -1, bank: 25 })             // -> N
      .sweep('s1', { bank: 0 })                        // unwind
      .sweep('s2', { rise: -1, bank: -25 })            // tilt the other way
      .sweep('l4', { rise: -1, bank: -40, feature: 'c' })  // long steep tilted left -> W, CP3 on the tilt
      .sweep('l4', { rise: -1, bank: -30 })            // -> S
      .sweep('s1', { bank: 0 })
      // tower B: drop, right, CP4, then a full left-hand helix that passes under CP4
      .sweep('s2', { rise: -1 })
      .sweep('r3', { rise: -1, bank: 30 })             // -> W
      .sweep('s1', { bank: 0, feature: 'c' })          // CP4
      .sweep('l4', { rise: -1, bank: -35 })            // -> S
      .sweep('l4', { rise: -1, bank: -40 })            // -> E
      .sweep('l4', { rise: -1, bank: -40, feature: 'c' })  // -> N, CP5
      .sweep('l4', { rise: -1, bank: -30 })            // -> W, 32 m under CP4
      .sweep('s1', { bank: 0 })
      // last part: right with turbo, big banked right U-turn, drop to the finish
      .sweep('r3', { bank: 30 })                       // -> N
      .sweep('s1', { bank: 0, feature: 'b' })
      .sweep('r4', { bank: 35, feature: 'c' })         // -> E, CP6
      .sweep('r3', { rise: -1, bank: 30 })             // -> S
      .sweep('s1', { bank: 0 })
      .sweep('s2', { rise: -1 })
      .sweep('s1', { feature: 'f' })
      .build(),
  },
];
