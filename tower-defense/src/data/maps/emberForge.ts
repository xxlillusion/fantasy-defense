import type { MapDef } from './types';

// 20 x 12. Two lanes enter from the left and right edges, wind through the forge floor and merge
// on row 8 before marching up the central causeway (col 10) to the forge-heart portal.
// Legend: . basalt (buildable)  # path  P portal  S anvil brazier (statue)  T slag spire (tree)
//         R rock  L lava (unbuildable, glowing)
const LAYOUT = [
  'LLLLL...S.P.S...LLLL', // 0
  'LLL.....S.#.S.....LL', // 1
  'L.........#........L', // 2
  '..........#.........', // 3
  '....T.....#.....T...', // 4
  '...#####..#..#####..', // 5
  '...#...#..#..#...#..', // 6
  '...#...#..#..#...#..', // 7
  '...#...#######...#..', // 8
  '####.............###', // 9
  '.R........LL......R.', // 10
  'LL.....T......T...LL', // 11
];

export const EMBER_FORGE: MapDef = {
  id: 'ember-forge',
  name: 'Ember Forge',
  description: 'Two lanes of foes converge on the forge heart. Guard the central causeway.',
  theme: 'forge',
  layout: LAYOUT,
  paths: [
    [
      { x: -0.5, y: 9.5 },
      { x: 3.5, y: 9.5 },
      { x: 3.5, y: 5.5 },
      { x: 7.5, y: 5.5 },
      { x: 7.5, y: 8.5 },
      { x: 10.5, y: 8.5 },
      { x: 10.5, y: 0.5 },
    ],
    [
      { x: 20.5, y: 9.5 },
      { x: 17.5, y: 9.5 },
      { x: 17.5, y: 5.5 },
      { x: 13.5, y: 5.5 },
      { x: 13.5, y: 8.5 },
      { x: 10.5, y: 8.5 },
      { x: 10.5, y: 0.5 },
    ],
  ],
  portal: { col: 10, row: 0 },
  statues: [
    { col: 8, row: 0 },
    { col: 12, row: 0 },
  ],
};
