import { describe, expect, it } from 'vitest';
import type { WaveDef } from '../../src/data';
import { DIFFICULTIES, ENEMIES, RULES, WAVES } from '../../src/data';
import { enemyMaxHp } from '../../src/sim/economy';
import { clearEndlessCache, endlessBosses, endlessBudget, endlessPointCost, generateEndlessWave } from '../../src/sim/endless';
import { waveDef } from '../../src/sim/flow';
import { createSeededRng } from '../../src/sim';
import { makeSim } from './helpers';
import { playOut, rallyHero, strongBuild } from './smoke-player';

const CAMPAIGN = WAVES.length; // 20 on every map

function endlessState(mapId = 'waterfall-shrine') {
  return makeSim({ mode: 'endless', mapId }).sim;
}

function waves(mapId: string, from = CAMPAIGN + 1, to = 60): WaveDef[] {
  const sim = endlessState(mapId);
  const out: WaveDef[] = [];
  for (let w = from; w <= to; w++) out.push(waveDef(sim.state, w)!);
  return out;
}

/** Total HP a wave throws at you (normal difficulty; split children included). */
function waveHp(def: WaveDef, wave: number): number {
  let hp = 0;
  for (const g of def) {
    const split = ENEMIES[g.enemy].traits?.split;
    const each = enemyMaxHp(g.enemy, wave, 'normal', CAMPAIGN) + (split ? split.count * enemyMaxHp(split.kind, wave, 'normal', CAMPAIGN) : 0);
    hp += g.count * each;
  }
  return hp;
}

describe('endless generator', () => {
  it('only exists in endless mode, past the campaign', () => {
    const campaign = makeSim().sim;
    expect(waveDef(campaign.state, CAMPAIGN)).toBe(WAVES[CAMPAIGN - 1]);
    expect(waveDef(campaign.state, CAMPAIGN + 1)).toBeNull();
    const endless = endlessState();
    expect(waveDef(endless.state, 5)).toBe(WAVES[4]);
    expect(waveDef(endless.state, CAMPAIGN + 1)!.length).toBeGreaterThan(0);
    expect(endless.snapshot()).toMatchObject({ mode: 'endless', totalWaves: null });
  });

  it('waves 21-60 are deterministic in (map, wave) and do not touch the sim rng', () => {
    for (const mapId of ['waterfall-shrine', 'ember-forge', 'moonlit-ruins']) {
      clearEndlessCache();
      const a = JSON.stringify(waves(mapId));
      clearEndlessCache();
      const sim = makeSim({ mode: 'endless', mapId, rng: () => { throw new Error('rng used'); } }).sim;
      const b: WaveDef[] = [];
      for (let w = CAMPAIGN + 1; w <= 60; w++) b.push(waveDef(sim.state, w)!);
      expect(JSON.stringify(b)).toBe(a);
    }
    // different maps get different waves
    expect(JSON.stringify(waves('waterfall-shrine', 21, 30))).not.toBe(JSON.stringify(waves('moonlit-ruins', 21, 30)));
  });

  it('groups are well-formed: positive counts, sensible intervals and delays', () => {
    for (const [i, def] of waves('ember-forge').entries()) {
      expect(def.length).toBeGreaterThanOrEqual(3);
      for (const g of def) {
        expect(Number.isInteger(g.count) && g.count >= 1).toBe(true);
        expect(g.interval).toBeGreaterThanOrEqual(0.1);
        expect(g.interval).toBeLessThanOrEqual(4);
        expect(g.delay).toBeGreaterThanOrEqual(0);
        expect(g.delay).toBeLessThan(40);
        expect(g.interval * (g.count - 1)).toBeLessThanOrEqual(20);
        expect(g.count).toBeLessThanOrEqual(45);
        expect(g.lane === 'alternate' || g.lane === 0 || g.lane === 1).toBe(true);
      }
      void i;
    }
  });

  it('budget, point costs and the widening mix', () => {
    expect(endlessBudget(21, CAMPAIGN)).toBeCloseTo(RULES.endlessBudgetBase * RULES.endlessBudgetGrowth);
    expect(endlessBudget(30, CAMPAIGN)).toBeCloseTo(RULES.endlessBudgetBase * RULES.endlessBudgetGrowth ** 10);
    // bounty-based, with split children priced in
    expect(endlessPointCost('brute') / endlessPointCost('grunt')).toBeCloseTo(ENEMIES.brute.bounty / ENEMIES.grunt.bounty);
    expect(endlessPointCost('broodmother')).toBeGreaterThan(endlessPointCost('grunt') * (ENEMIES.broodmother.bounty / ENEMIES.grunt.bounty));

    const kindsIn = (defs: WaveDef[]) => new Set(defs.flatMap((d) => d.map((g) => g.enemy)));
    const early = kindsIn(waves('waterfall-shrine', 21, 22));
    const late = kindsIn(waves('waterfall-shrine', 40, 60));
    for (const k of ['shaman', 'broodmother', 'wraith'] as const) expect(early.has(k)).toBe(false);
    for (const k of ['shieldbearer', 'shaman', 'broodmother', 'wraith', 'flyer', 'brute'] as const) expect(late.has(k)).toBe(true);
  });

  it('grows in difficulty', () => {
    const defs = waves('waterfall-shrine');
    const hp = defs.map((d, i) => waveHp(d, CAMPAIGN + 1 + i));
    const blocks: number[] = [];
    for (let b = 0; b < 8; b++) blocks.push(hp.slice(b * 5, b * 5 + 5).reduce((x, y) => x + y, 0));
    for (let b = 1; b < blocks.length; b++) expect(blocks[b]!).toBeGreaterThan(blocks[b - 1]!);
    expect(hp[hp.length - 1]!).toBeGreaterThan(hp[0]! * 10);
    // the first endless wave is in the league of the last campaign waves
    const w20 = waveHp(WAVES[19]!, 20);
    expect(hp[0]!).toBeGreaterThan(w20 * 0.3);
  });

  it('bosses every endlessBossEvery waves, alternating golem/dragon, +1 per 10 waves', () => {
    const defs = waves('waterfall-shrine');
    defs.forEach((def, i) => {
      const w = CAMPAIGN + 1 + i;
      const bossGroups = def.filter((g) => ENEMIES[g.enemy].boss);
      const expected = endlessBosses(w, CAMPAIGN);
      if ((w - CAMPAIGN) % RULES.endlessBossEvery !== 0) {
        expect(bossGroups).toHaveLength(0);
        expect(expected).toBeNull();
      } else {
        expect(bossGroups).toHaveLength(1);
        expect(bossGroups[0]).toMatchObject({ enemy: expected!.kind, count: expected!.count });
      }
    });
    expect(endlessBosses(25, CAMPAIGN)).toEqual({ kind: 'boss', count: 1 });
    expect(endlessBosses(30, CAMPAIGN)).toEqual({ kind: 'dragon', count: 2 });
    expect(endlessBosses(35, CAMPAIGN)).toEqual({ kind: 'boss', count: 2 });
    expect(endlessBosses(40, CAMPAIGN)).toEqual({ kind: 'dragon', count: 3 });
    expect(endlessBosses(24, CAMPAIGN)).toBeNull();
  });

  it('the preview uses the generated wave; the generator is memoized per (map, wave)', () => {
    const sim = endlessState('ember-forge');
    sim.state.wave = 24;
    sim.invalidate();
    const def = generateEndlessWave(sim.state, 25);
    expect(generateEndlessWave(sim.state, 25)).toBe(def);
    expect(sim.snapshot().nextWave).toEqual(def.map((g) => ({ enemy: g.enemy, count: g.count })));
    expect(sim.snapshot().nextWaveLanes).toEqual([0, 1]);
  });
});

describe('endless HP growth', () => {
  it('switches to endlessHpGrowth past the campaign', () => {
    const base = ENEMIES.grunt.hp * RULES.hpGrowthPerWave ** (CAMPAIGN - 1);
    expect(enemyMaxHp('grunt', CAMPAIGN, 'normal', CAMPAIGN)).toBe(Math.round(base));
    expect(enemyMaxHp('grunt', CAMPAIGN + 1, 'normal', CAMPAIGN)).toBe(Math.round(base * RULES.endlessHpGrowth));
    expect(enemyMaxHp('brute', CAMPAIGN + 10, 'hard', CAMPAIGN)).toBe(
      Math.round(ENEMIES.brute.hp * RULES.hpGrowthPerWave ** (CAMPAIGN - 1) * RULES.endlessHpGrowth ** 10 * DIFFICULTIES.hard.hpMultiplier),
    );
    // without a campaign length (v1 callers) it is the plain formula
    expect(enemyMaxHp('grunt', 25, 'normal')).toBe(Math.round(ENEMIES.grunt.hp * RULES.hpGrowthPerWave ** 24));
  });

  it('spawned endless enemies use it', () => {
    const sim = endlessState();
    sim.state.wave = 30;
    const e = sim.debugSpawn('grunt', 1);
    expect(e.maxHp).toBe(enemyMaxHp('grunt', 30, 'normal', CAMPAIGN));
  });
});

describe('endless headless run', () => {
  it('a strong build plays to wave 45 without throwing; no victory; then loses with gameOver once', () => {
    const { sim, log } = makeSim({ mode: 'endless', mapId: 'ember-forge', rng: createSeededRng(3) });
    strongBuild(sim, 4, 3);
    rallyHero(sim, 0.8);
    // Keep the suite fast: start at the last campaign wave, step at 20 Hz, and make it immortal until 45.
    sim.state.wave = CAMPAIGN - 1;
    sim.state.lives = sim.state.maxLives = 1_000_000;
    const dt = 1 / 20;
    const r = playOut(sim, { untilWave: 45, maxSteps: 1_000_000, dt });
    expect(r.phase).toBe('build');
    expect(r.wave).toBe(45);
    expect(log.of('gameOver')).toHaveLength(0);
    expect(log.of('waveCleared').map((c) => c.wave)).toEqual(Array.from({ length: 45 - (CAMPAIGN - 1) }, (_, i) => CAMPAIGN + i));
    expect(sim.snapshot().totalWaves).toBeNull();
    expect(log.of('enemySpawned').some((e) => e.enemy.kind === 'dragon')).toBe(true);
    console.log(
      `[endless] reached wave ${r.wave}; leaks ${sim.state.stats.leaks} (first at wave ${firstLeakWave(log)}), kills ${sim.state.stats.kills}, hero L${sim.state.hero!.level}`,
    );

    // now make it mortal: it ends in defeat, exactly once, carrying mode/wave/score
    sim.state.lives = sim.state.maxLives = 20;
    playOut(sim, { maxSteps: 200_000, dt });
    expect(sim.state.phase).toBe('defeat');
    expect(log.of('gameOver')).toHaveLength(1);
    expect(log.of('gameOver')[0]).toMatchObject({ result: 'defeat', mode: 'endless', stars: 0, score: sim.snapshot().score });
    expect(log.of('gameOver')[0]!.wave).toBeGreaterThanOrEqual(46);
  }, 30_000);
});

function firstLeakWave(log: ReturnType<typeof makeSim>['log']): number | null {
  let wave = 0;
  for (const e of log.all) {
    if (e.name === 'waveStarted') wave = (e.payload as { wave: number }).wave;
    if (e.name === 'enemyLeaked') return wave;
  }
  return null;
}
