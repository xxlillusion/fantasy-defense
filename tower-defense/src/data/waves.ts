import type { EnemyKind } from '../core/types';

export interface WaveGroup {
  enemy: EnemyKind;
  count: number;
  /** Seconds between spawns within the group. */
  interval: number;
  /** Seconds after wave start before the group's first spawn. */
  delay: number;
}

export type WaveDef = WaveGroup[];

const g = (enemy: EnemyKind, count: number, interval: number, delay = 0): WaveGroup => ({ enemy, count, interval, delay });

export const WAVES: readonly WaveDef[] = [
  /* 1 */ [g('grunt', 8, 1.2)],
  /* 2 */ [g('grunt', 12, 1.0)],
  /* 3 */ [g('grunt', 8, 1.0), g('runner', 6, 0.8, 6)],
  /* 4 */ [g('swarmling', 15, 0.35), g('grunt', 6, 1.0, 3)],
  /* 5 */ [g('grunt', 10, 0.9), g('brute', 2, 3, 5)],
  /* 6 */ [g('runner', 12, 0.6), g('swarmling', 18, 0.3, 8)],
  /* 7 */ [g('flyer', 6, 1.2), g('grunt', 10, 0.8)],
  /* 8 */ [g('brute', 4, 2.5), g('flyer', 8, 1.0, 4), g('runner', 10, 0.5, 8)],
  /* 9 */ [g('swarmling', 25, 0.25), g('flyer', 10, 0.9, 5), g('brute', 3, 2.5, 8)],
  /* 10 */ [g('boss', 1, 1), g('grunt', 10, 1.0, 2)],
  /* 11 */ [g('runner', 16, 0.45), g('brute', 4, 2, 5)],
  /* 12 */ [g('flyer', 14, 0.7), g('swarmling', 20, 0.3, 4)],
  /* 13 */ [g('brute', 8, 1.6), g('grunt', 14, 0.6, 2)],
  /* 14 */ [g('runner', 20, 0.4), g('flyer', 12, 0.7, 3), g('swarmling', 25, 0.22, 8)],
  /* 15 */ [g('brute', 10, 1.4), g('flyer', 14, 0.6, 4)],
  /* 16 */ [g('swarmling', 40, 0.18), g('runner', 20, 0.35, 5)],
  /* 17 */ [g('brute', 12, 1.2), g('flyer', 18, 0.5, 3), g('grunt', 20, 0.5, 6)],
  /* 18 */ [g('runner', 30, 0.3), g('brute', 10, 1.2, 4)],
  /* 19 */ [g('flyer', 24, 0.45), g('brute', 14, 1.0, 3), g('swarmling', 40, 0.15, 8)],
  /* 20 */ [g('boss', 1, 1), g('brute', 10, 1.5, 4), g('flyer', 16, 0.6, 8), g('runner', 20, 0.4, 14)],
];
