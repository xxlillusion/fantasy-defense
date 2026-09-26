// Lead-owned balance harness: a scripted "reasonable player" plays full games headless.
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import { SIM_DT } from '../../src/core/grid';
import type { Difficulty, TowerKind } from '../../src/core/types';
import { createSeededRng, createSimulationWithOptions } from '../../src/sim';
import { DEFAULT_MAP_ID } from '../../src/data';

type Plan = [TowerKind, number, number][];

const GOOD_PLAN: Plan = [
  ['arrow', 6, 8], ['arrow', 4, 9], ['cannon', 15, 8], ['frost', 16, 7], ['arrow', 16, 8],
  ['tesla', 15, 7], ['sniper', 12, 5], ['cannon', 6, 7], ['frost', 9, 5], ['arrow', 13, 4],
  ['sniper', 16, 4], ['tesla', 11, 4], ['cannon', 12, 7], ['arrow', 9, 2], ['sniper', 4, 7],
  ['tesla', 16, 5], ['cannon', 13, 5], ['arrow', 11, 2],
  ['sniper', 9, 4], ['tesla', 7, 8], ['frost', 12, 4], ['cannon', 4, 8], ['arrow', 15, 4],
  ['sniper', 8, 5], ['tesla', 13, 7], ['cannon', 16, 9], ['arrow', 9, 1], ['sniper', 11, 1],
];

function play(difficulty: Difficulty, plan: Plan, maxTowersPerWave = 4, seed = 7, trace?: string[]) {
  const events = new EventBus();
  const sim = createSimulationWithOptions(events, { rng: createSeededRng(seed) });
  sim.startGame({ difficulty, mapId: DEFAULT_MAP_ID, mode: 'campaign', modifiers: [] });
  let planIdx = 0;
  let lastWaveSpent = -1;
  for (let guard = 0; guard < 60 * 60 * 60; guard++) {
    const s = sim.snapshot();
    if (s.phase === 'victory' || s.phase === 'defeat') {
      return { result: s.phase, wave: s.wave, lives: s.lives, stars: s.stars, towers: s.towers.length };
    }
    if (s.phase === 'build' && lastWaveSpent !== s.wave) {
      lastWaveSpent = s.wave;
      trace?.push(`w${s.wave}:L${s.lives}`);
      for (;;) {
        const snap = sim.snapshot();
        const wantPlace = planIdx < plan.length && snap.towers.length < maxTowersPerWave + snap.wave * 1.2;
        if (wantPlace) {
          const [k, col, row] = plan[planIdx]!;
          if (sim.placeTower(k, { col, row }).ok) { planIdx++; continue; }
          if (!sim.canPlaceTower(k, { col, row }).ok && snap.gold >= 150) { planIdx++; continue; }
        }
        const up = [...snap.towers].filter((t) => t.upgradeCost !== null).sort((a, b) => a.upgradeCost! - b.upgradeCost!)[0];
        if (up && up.upgradeCost! <= snap.gold) { sim.upgradeTower(up.id); continue; }
        break;
      }
      sim.sendWave();
    }
    sim.step(SIM_DT);
  }
  throw new Error('game did not finish');
}

describe('balance', () => {
  for (const d of ['easy', 'normal', 'hard'] as const) {
    it(`reasonable build on ${d}`, () => {
      const r = play(d, GOOD_PLAN);
      console.log(`[balance] good/${d}:`, JSON.stringify(r));
      if (d !== 'hard') expect(r.result).toBe('victory');
    });
  }
  it('lazy build (3 arrows, never upgrades) loses on normal', () => {
    const r = play('normal', GOOD_PLAN.slice(0, 3).map(() => ['arrow', 4, 9] as [TowerKind, number, number]).map((p, i) => [p[0], [4, 6, 7][i]!, 9] as [TowerKind, number, number]), 99);
    console.log('[balance] lazy/normal:', JSON.stringify(r));
    expect(r.result).toBe('defeat');
  });
});

describe('balance trace', () => {
  it('per-wave lives on normal/hard', () => {
    for (const d of ['normal', 'hard'] as const) {
      const t: string[] = [];
      const r = play(d, GOOD_PLAN, 4, 7, t);
      console.log(`[balance] trace ${d}:`, t.join(' '), '->', r.result, r.lives);
    }
  });
});
