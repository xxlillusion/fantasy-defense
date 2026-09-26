import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import type { TileCoord, TowerKind } from '../../src/core/types';
import { getMap, isBuildable, TOWER_KINDS } from '../../src/data';
import { createSeededRng, type SimulationHandle } from '../../src/sim';
import { makeSim } from './helpers';

/** Play until the game ends, sending each wave as soon as possible. */
function playOut(sim: SimulationHandle, maxSteps = 400_000): number {
  let n = 0;
  for (; n < maxSteps; n++) {
    const phase = sim.state.phase;
    if (phase === 'victory' || phase === 'defeat') break;
    if (phase === 'build') sim.sendWave();
    sim.step(SIM_DT);
  }
  return n;
}

/** Grass tiles orthogonally or diagonally adjacent to the path. */
function tilesBesidePath(): TileCoord[] {
  const map = getMap();
  const out: TileCoord[] = [];
  for (let row = 0; row < map.layout.length; row++) {
    for (let col = 0; col < map.layout[row]!.length; col++) {
      if (!isBuildable(map, { col, row })) continue;
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++)
        for (let dc = -1; dc <= 1 && !near; dc++) if (map.layout[row + dr]?.[col + dc] === '#') near = true;
      if (near) out.push({ col, row });
    }
  }
  return out;
}

function strongBuild(sim: SimulationHandle): void {
  sim.state.gold = 1e7;
  const kinds: TowerKind[] = [...TOWER_KINDS];
  tilesBesidePath()
    .filter((_, i) => i % 2 === 0)
    .forEach((tile, i) => {
    const r = sim.placeTower(kinds[i % kinds.length]!, tile);
    if (!r.ok) throw new Error(r.reason);
  });
  for (const t of sim.snapshot().towers) {
    sim.upgradeTower(t.id);
    sim.upgradeTower(t.id);
  }
  sim.state.gold = 0;
}

describe('headless smoke tests', () => {
  it('no towers: everything leaks and the game ends in defeat', () => {
    const { sim, log } = makeSim();
    playOut(sim);
    expect(sim.snapshot().phase).toBe('defeat');
    expect(log.of('gameOver')).toEqual([{ result: 'defeat', stars: 0 }]);
    expect(log.of('enemyKilled')).toHaveLength(0);
  });

  it('a strong scripted build plays all 20 waves without throwing', () => {
    const { sim, log } = makeSim({ rng: createSeededRng(7) });
    strongBuild(sim);
    expect(sim.snapshot().towers.length).toBeGreaterThan(20);
    playOut(sim);
    expect(log.of('waveStarted')).toHaveLength(20);
    expect(sim.snapshot().phase).toBe('victory');
    expect(sim.snapshot().stars).toBeGreaterThanOrEqual(1);
    expect(log.of('gameOver')).toHaveLength(1);
    expect(sim.snapshot().stats.kills).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const { sim } = makeSim({ rng: createSeededRng(99) });
      strongBuild(sim);
      for (let i = 0; i < 3000; i++) {
        if (sim.state.phase === 'build') sim.sendWave();
        sim.step(SIM_DT);
      }
      return JSON.stringify(sim.snapshot());
    };
    expect(run()).toBe(run());
  });
});
