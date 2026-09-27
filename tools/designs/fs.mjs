import { TrackBuilder } from '../../src/track/builder.js';
const B = () => new TrackBuilder();
export const TRACKS = [
  {
    id: 'fs1', name: 'FullSpeed draft', style: 'fs',
    build: () => B().at(0, 6, 0, 0)
      // 1: start, turbo into a banked right, S-bend left, turbo straight, climb, CP1
      .start().boost()
      .bankRight(3)                                  // -> E
      .straight(1).left(4)                           // -> N
      .boost().straight(1).cp()                      // CP1
      .straight(1)
      .up(5, 2).straight(1)
      .down(5, 2).straight(1)
      // 2: wide tilted deck bending left, turbo on the tilt, CP2
      .prof('deck')
      .sweep('s1')
      .sweep('l4', { rise: -1, bank: -30 })          // -> W
      .sweep('s2', { bank: -30, feature: 'b' })
      .sweep('s1', { bank: 0, feature: 'c' })        // CP2
      // 3: half-pipe bend, wall ride, long descent, loop, CP3
      .prof('road')
      .pipe(1).pipeLeft(3)                           // -> S
      .pipe(1).straight(1)
      .wallRight()                                   // -> W
      .straight(2)
      .sweep('s3', { rise: -1 }).sweep('s3', { rise: -1 })   // long smooth descent
      .cp()                                          // CP3
      .loop('R').straight(2)
      // 4: banked right, descending tilted S on the deck, big wall ride, tube bend, finish
      .bankRight(3)                                  // -> N
      .prof('deck')
      .sweep('r4', { rise: -1, bank: 30 })           // -> E
      .sweep('s1', { bank: 0, feature: 'c' })        // CP4
      .sweep('l4', { rise: -1, bank: -30 })          // -> N
      .sweep('s1', { bank: 0 })
      .prof('road')
      .wallRight()                                   // -> E
      .straight(1).pipe(1).pipeRight(3)              // -> S
      .pipe(1).straight(1).boost()
      .finish()
      .build(),
  },
];
