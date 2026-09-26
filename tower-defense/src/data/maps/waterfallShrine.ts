import type { MapDef } from './types';

// 20 x 12. Row 0 = back (portal under the waterfall), row 11 = front (nearest camera).
// Legend: . grass (buildable)  # path  P portal (path end)  S guardian statue
//         T tree  R rock  — S/T/R/P are not buildable.
const LAYOUT = [
  'TT.....S..P..S....TT', // 0
  'T......S..#..S.....T', // 1
  '..........#.........', // 2
  '..........########..', // 3
  '.................#..', // 4
  '..R..............#..', // 5
  '.....##########..#..', // 6
  '.....#........#..#..', // 7
  '.T...#...R....#..#..', // 8
  '.....#........####..', // 9
  '######..............', // 10
  '...T..........R.....', // 11
];

export const WATERFALL_SHRINE: MapDef = {
  id: 'waterfall-shrine',
  name: 'Waterfall Shrine',
  description: 'A misty forest shrine. One winding path with generous chokepoints.',
  theme: 'shrine',
  layout: LAYOUT,
  // Tile-unit points. Enemies spawn just off the left edge and walk to the portal.
  paths: [
    [
      { x: -0.5, y: 10.5 },
      { x: 5.5, y: 10.5 },
      { x: 5.5, y: 6.5 },
      { x: 14.5, y: 6.5 },
      { x: 14.5, y: 9.5 },
      { x: 17.5, y: 9.5 },
      { x: 17.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 10.5, y: 0.5 },
    ],
  ],
  portal: { col: 10, row: 0 },
  statues: [
    { col: 7, row: 0 },
    { col: 13, row: 0 },
  ],
};
