import type { EnemyKind } from '../core/types';

export interface WaveGroup {
  enemy: EnemyKind;
  count: number;
  /** Seconds between spawns within the group. */
  interval: number;
  /** Seconds after wave start before the group's first spawn. */
  delay: number;
  /**
   * Which lane (index into map.paths) the group spawns on. 'alternate' (default) round-robins
   * spawns across all lanes; a number pins the group to that lane (clamped to the map's lanes).
   */
  lane?: number | 'alternate';
}

export type WaveDef = WaveGroup[];

const g = (enemy: EnemyKind, count: number, interval: number, delay = 0, lane?: number | 'alternate'): WaveGroup => ({
  enemy,
  count,
  interval,
  delay,
  ...(lane !== undefined ? { lane } : {}),
});

/** Shared 20-wave campaign. New v2 enemies are introduced gradually from wave 6. */
export const WAVES: readonly WaveDef[] = [
  /* 1 */ [g('grunt', 8, 1.2)],
  /* 2 */ [g('grunt', 12, 1.0)],
  /* 3 */ [g('grunt', 8, 1.0), g('runner', 6, 0.8, 6)],
  /* 4 */ [g('swarmling', 15, 0.35), g('grunt', 6, 1.0, 3)],
  /* 5 */ [g('grunt', 10, 0.9), g('brute', 2, 3, 5)],
  /* 6 */ [g('runner', 12, 0.6), g('shieldbearer', 4, 1.5, 4), g('swarmling', 18, 0.3, 8)],
  /* 7 */ [g('flyer', 6, 1.2), g('grunt', 10, 0.8)],
  /* 8 */ [g('brute', 4, 2.5), g('shaman', 2, 3, 2), g('flyer', 8, 1.0, 4), g('runner', 10, 0.5, 8)],
  /* 9 */ [g('swarmling', 25, 0.25), g('wraith', 5, 1.2, 3), g('flyer', 10, 0.9, 6), g('brute', 3, 2.5, 8)],
  /* 10 */ [g('boss', 1, 1), g('grunt', 10, 1.0, 2), g('shaman', 2, 4, 4)],
  /* 11 */ [g('runner', 16, 0.45), g('broodmother', 4, 2, 3), g('brute', 4, 2, 6)],
  /* 12 */ [g('flyer', 14, 0.7), g('shieldbearer', 8, 0.9, 3), g('swarmling', 20, 0.3, 6)],
  /* 13 */ [g('brute', 8, 1.6), g('shaman', 3, 3, 2), g('grunt', 14, 0.6, 3)],
  /* 14 */ [g('runner', 20, 0.4), g('wraith', 8, 0.8, 3), g('flyer', 12, 0.7, 5), g('swarmling', 25, 0.22, 9)],
  /* 15 */ [g('brute', 10, 1.4), g('broodmother', 6, 1.5, 3), g('flyer', 14, 0.6, 5)],
  /* 16 */ [g('swarmling', 40, 0.18), g('shieldbearer', 10, 0.8, 4), g('runner', 20, 0.35, 6)],
  /* 17 */ [g('brute', 12, 1.2), g('shaman', 4, 2.5, 2), g('flyer', 18, 0.5, 4), g('grunt', 20, 0.5, 6)],
  /* 18 */ [g('runner', 30, 0.3), g('wraith', 12, 0.6, 3), g('brute', 10, 1.2, 5)],
  /* 19 */ [g('flyer', 24, 0.45), g('broodmother', 8, 1.2, 2), g('brute', 14, 1.0, 4), g('swarmling', 40, 0.15, 9)],
  /* 20 */ [g('boss', 1, 1), g('dragon', 1, 1, 10), g('brute', 10, 1.5, 4), g('shaman', 4, 3, 5), g('flyer', 16, 0.6, 8), g('runner', 20, 0.4, 14)],
];

/** Moonlit Ruins: the shared campaign plus extra wraiths and shamans (stealth-heavy). */
export const RUINS_WAVES: readonly WaveDef[] = WAVES.map((wave, i) => {
  const n = i + 1;
  const extra: WaveGroup[] = [];
  if (n >= 5) extra.push(g('wraith', 2 + Math.floor(n / 2), 0.9, 5));
  if (n >= 8 && n % 3 === 2) extra.push(g('shaman', 2 + Math.floor(n / 6), 2.5, 7));
  return [...wave, ...extra];
});
