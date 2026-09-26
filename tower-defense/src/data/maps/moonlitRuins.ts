import { RUINS_WAVES } from '../waves';
import type { MapDef } from './types';

// 20 x 12. One long serpentine lane: three full-width switchbacks (rows 10, 7, 4) then a short
// climb to the ruined-arch portal. Lots of double coverage, but a very long walk — and wraiths.
// Legend: . moss (buildable)  # path  P portal  S broken column (statue)  T dead tree  R fallen stone
const LAYOUT = [
  'T......S..P..S.....T', // 0
  '.......S..#..S......', // 1
  '..R.......########..', // 2
  '.................#..', // 3
  '..################..', // 4
  '..#...............T.', // 5
  '..#.....R...........', // 6
  '..################..', // 7
  'T................#..', // 8
  '......R..........#..', // 9
  '##################..', // 10
  '....T.........T....R', // 11
];

export const MOONLIT_RUINS: MapDef = {
  id: 'moonlit-ruins',
  name: 'Moonlit Ruins',
  description: 'A long moonlit switchback haunted by wraiths. Bring Frost towers to reveal them.',
  theme: 'ruins',
  layout: LAYOUT,
  paths: [
    [
      { x: -0.5, y: 10.5 },
      { x: 17.5, y: 10.5 },
      { x: 17.5, y: 7.5 },
      { x: 2.5, y: 7.5 },
      { x: 2.5, y: 4.5 },
      { x: 17.5, y: 4.5 },
      { x: 17.5, y: 2.5 },
      { x: 10.5, y: 2.5 },
      { x: 10.5, y: 0.5 },
    ],
  ],
  portal: { col: 10, row: 0 },
  statues: [
    { col: 7, row: 0 },
    { col: 13, row: 0 },
  ],
  waves: RUINS_WAVES,
};
