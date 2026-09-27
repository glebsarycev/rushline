import { TrackBuilder } from '../../src/track/builder.js';
const B = () => new TrackBuilder();
export const TRACKS = [
  {
    id: 'te3', name: 'Tech draft v3', style: 'tech',
    build: () => B().at(0, 12, 0, 0).prof('tech')
      // 1: start high, drop, right, left around a rock, CP1
      .sweep('s1', { feature: 's' })
      .sweep('s1', { rise: -1 })
      .sweep('r2')                                   // -> E
      .sweep('l2', { feature: 'c' })                 // -> N, CP1
      // 2: right hairpin, S-bends along the barriers, CP2
      .sweep('r1').sweep('r1')                       // hairpin -> S
      .sweep('l2', { rise: -1 })                     // -> E
      .sweep('r2', { rise: -1 })                     // -> S
      .sweep('l2', { feature: 'c' })                 // -> E, CP2
      // 3: grass hillside, dirt bend, off the cliff over the river, CP3
      .prof('platform').surface('grass')
      .sweep('s2', { rise: -2 })
      .prof('tech').surface('road')
      .sweep('r3')                                   // -> S
      .surface('dirt')
      .sweep('l3', { rise: -1 })                     // -> E
      .sweep('s1', { feature: 'c' })                 // CP3
      .surface('road')
      .sweep('s1', { feature: 'b' }).jump(1, 5)      // off the cliff edge, over the river
      .sweep('s3', { rise: -1 })                     // landing downhill (no gate to fly into)
      .sweep('s1')
      // 4: fast sweeping right (CP4 + turbo), long left, CP5
      .sweep('r4', { rise: -1, feature: 'c' })       // -> S, CP4
      .sweep('s1', { feature: 'b' })
      .sweep('l4')                                   // -> E
      .sweep('s2', { rise: -1, feature: 'c' })       // CP5
      // 5: tight left, dirt drift, left, CP6
      .sweep('l1')                                   // -> N
      .surface('dirt').sweep('r2')                   // -> E
      .surface('road').sweep('l2', { feature: 'c' }) // -> N, CP6
      // 6: tight left hairpin, down under the road, CP7 in the dirt
      .sweep('l1').sweep('l1', { rise: -1 })         // hairpin -> S
      .sweep('r2')                                   // -> W, under the road above
      .surface('dirt').sweep('l2', { rise: -1, feature: 'c' })  // -> S, CP7
      // 7: into the cave, finish
      .surface('road').sweep('r2')                   // -> W
      .sweep('s1', { feature: 'f' })
      .build(),
  },
];
