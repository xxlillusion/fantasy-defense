import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import { MAP_IDS, mapWaves, getMap } from '../../src/data';
import { createSeededRng } from '../../src/sim';
import { makeSim } from './helpers';
import { playOut, rallyHero, strongBuild } from './smoke-player';

describe('headless smoke tests', () => {
  it('no towers: everything leaks and the game ends in defeat', () => {
    const { sim, log } = makeSim();
    sim.state.hero = null; // the hero alone would kill a few
    playOut(sim, { abilities: false });
    expect(sim.snapshot().phase).toBe('defeat');
    expect(log.of('gameOver')).toMatchObject([{ result: 'defeat', stars: 0 }]);
    expect(log.of('enemyKilled')).toHaveLength(0);
  });

  it('a strong scripted build plays all 20 waves without throwing', () => {
    const { sim, log } = makeSim({ rng: createSeededRng(7) });
    strongBuild(sim);
    expect(sim.snapshot().towers.length).toBeGreaterThan(20);
    playOut(sim, { abilities: false });
    expect(log.of('waveStarted')).toHaveLength(20);
    expect(sim.snapshot().phase).toBe('victory');
    expect(sim.snapshot().stars).toBeGreaterThanOrEqual(1);
    expect(log.of('gameOver')).toHaveLength(1);
    expect(sim.snapshot().stats.kills).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed (hero and abilities included)', () => {
    const run = () => {
      const { sim } = makeSim({ rng: createSeededRng(99), mapId: 'ember-forge' });
      strongBuild(sim);
      rallyHero(sim);
      playOut(sim, { maxSteps: 4000 });
      return JSON.stringify(sim.snapshot());
    };
    expect(run()).toBe(run());
  });

  for (const mapId of MAP_IDS) {
    it(`full campaign on ${mapId}: scripted build, hero and abilities; gameOver exactly once`, () => {
      const { sim, log } = makeSim({ rng: createSeededRng(11), mapId });
      strongBuild(sim);
      rallyHero(sim, 0.12); // near the spawn, where he meets enemies before the towers finish them
      const r = playOut(sim);
      expect(['victory', 'defeat']).toContain(r.phase);
      expect(log.of('gameOver')).toHaveLength(1);
      const over = log.of('gameOver')[0]!;
      expect(over).toMatchObject({ mode: 'campaign', wave: sim.state.wave, score: sim.snapshot().score });
      if (r.phase === 'victory') expect(sim.state.wave).toBe(mapWaves(getMap(mapId)).length);
      expect(sim.snapshot().totalWaves).toBe(mapWaves(getMap(mapId)).length);
      // everything got exercised
      expect(log.of('heroAttacked').length).toBeGreaterThan(0);
      expect(log.of('abilityCast').map((c) => c.id)).toEqual(expect.arrayContaining(['meteor', 'frostNova', 'goldRush', 'bladeStorm']));
      expect(log.of('meteorImpact').length).toBeGreaterThan(0);
      // no stray events after the end
      const n = log.all.length;
      for (let i = 0; i < 60; i++) sim.step(SIM_DT);
      expect(log.all.length).toBe(n);
      console.log(
        `[smoke] ${mapId}: ${r.phase} wave ${r.wave} lives ${sim.state.lives}/${sim.state.maxLives} score ${sim.snapshot().score}` +
          ` hero L${sim.state.hero!.level} downs ${log.of('heroDowned').length} kills ${sim.state.stats.kills}`,
      );
    });
  }
});
