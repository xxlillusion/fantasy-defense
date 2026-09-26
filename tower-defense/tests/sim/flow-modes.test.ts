import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import { DIFFICULTIES, ENEMIES, MODIFIER_FX, RULES, WAVES } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import { interestOn, waveClearBonus } from '../../src/sim/economy';
import { interestFor, waveDef } from '../../src/sim/flow';
import { computeScore } from '../../src/sim/score';
import { buildSpawnQueue } from '../../src/sim/spawner';
import type { SimulationHandle } from '../../src/sim';
import { addTower, makeSim, seconds, steps, TOWER_TILE } from './helpers';

const FORGE = 'ember-forge';

function noHero(sim: SimulationHandle): SimulationHandle {
  sim.state.hero = null;
  sim.invalidate();
  return sim;
}

/** Run the current wave to its end by killing everything as it spawns (no bounty side effects on gold). */
function killWave(sim: SimulationHandle): void {
  for (let i = 0; i < 200_000 && sim.state.phase === 'wave'; i++) {
    for (const e of sim.state.enemies) {
      if (e.alive) damageEnemy(sim.ctx, e, 1e9, { armorPierce: true, crit: false, source: { type: 'burn' } });
    }
    sim.step(SIM_DT);
  }
}

describe('lanes', () => {
  it("'alternate' round-robins spawns across lanes; numeric lanes pin (clamped)", () => {
    const { sim } = makeSim({ mapId: FORGE });
    const s = sim.state;
    expect(s.map.paths).toHaveLength(2);
    const q = buildSpawnQueue(s, [
      { enemy: 'grunt', count: 4, interval: 1, delay: 0 },
      { enemy: 'runner', count: 3, interval: 1, delay: 10, lane: 'alternate' },
      { enemy: 'brute', count: 2, interval: 1, delay: 20, lane: 1 },
      { enemy: 'flyer', count: 2, interval: 1, delay: 30, lane: 7 },
      { enemy: 'swarmling', count: 2, interval: 1, delay: 40, lane: -3 },
    ]);
    const lanesOf = (kind: string) => q.filter((e) => e.kind === kind).map((e) => e.lane);
    expect(lanesOf('grunt')).toEqual([0, 1, 0, 1]);
    // the cursor carries over between groups
    expect(lanesOf('runner')).toEqual([0, 1, 0]);
    expect(lanesOf('brute')).toEqual([1, 1]);
    expect(lanesOf('flyer')).toEqual([1, 1]);
    expect(lanesOf('swarmling')).toEqual([0, 0]);
    // time-sorted
    expect(q.map((e) => e.at)).toEqual([...q.map((e) => e.at)].sort((a, b) => a - b));
  });

  it('a real wave on Ember Forge spawns on both lanes, and the preview lists both', () => {
    const { sim, events } = makeSim({ mapId: FORGE });
    noHero(sim);
    expect(sim.snapshot().nextWaveLanes).toEqual([0, 1]);
    const lanes: number[] = [];
    events.on('enemySpawned', (p) => lanes.push(p.enemy.lane));
    sim.sendWave();
    steps(sim, seconds(WAVES[0]![0]!.interval * WAVES[0]![0]!.count + 1));
    expect(lanes).toHaveLength(WAVES[0]![0]!.count);
    expect(lanes.filter((l) => l === 0).length).toBe(lanes.length / 2);
    expect(lanes.filter((l) => l === 1).length).toBe(lanes.length / 2);
    // positions follow each lane: lane 0 enters from the left, lane 1 from the right
    const snap = sim.snapshot();
    for (const e of snap.enemies) {
      if (e.lane === 0) expect(e.pos.x).toBeLessThan(10);
      else expect(e.pos.x).toBeGreaterThan(10);
      expect(e.remaining).toBeCloseTo(sim.state.pathLengths[e.lane]! - e.progress);
    }
  });

  it('leaks use the length of their own lane', () => {
    const { sim, log } = makeSim({ mapId: FORGE });
    noHero(sim);
    const [len0, len1] = sim.state.pathLengths as [number, number];
    expect(len0).not.toBeCloseTo(len1);
    const short = len0 < len1 ? 0 : 1;
    const long = 1 - short;
    const p = Math.min(len0, len1) - 0.001;
    const a = sim.debugSpawn('grunt', p, short);
    const b = sim.debugSpawn('grunt', p, long);
    expect(b.remaining).toBeCloseTo(Math.abs(len1 - len0) + 0.001);
    sim.step(SIM_DT);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(log.of('enemyLeaked').map((e) => e.enemyId)).toEqual([a.id]);
    steps(sim, seconds(Math.abs(len1 - len0) / ENEMIES.grunt.speed + 0.1));
    expect(b.alive).toBe(false);
    expect(sim.snapshot().lives).toBe(DIFFICULTIES.normal.lives - 2);
  });
});

describe('modifiers', () => {
  it('glass: exactly one life; the first leak loses', () => {
    const { sim, log } = makeSim({ modifiers: ['glass'] });
    noHero(sim);
    expect(sim.snapshot()).toMatchObject({ lives: 1, maxLives: 1, modifiers: ['glass'] });
    sim.sendWave();
    for (let i = 0; i < seconds(120) && sim.state.phase === 'wave'; i++) sim.step(SIM_DT);
    expect(sim.snapshot().phase).toBe('defeat');
    expect(log.of('enemyLeaked')).toHaveLength(1);
    expect(log.of('gameOver')).toMatchObject([{ result: 'defeat', mode: 'campaign', wave: 1 }]);
  });

  it('austerity: 60% start gold (floored) and no interest', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const { sim } = makeSim({ difficulty: d, modifiers: ['austerity'] });
      expect(sim.snapshot().gold).toBe(Math.floor(DIFFICULTIES[d].startGold * MODIFIER_FX.austerityGold));
    }
    const { sim, log } = makeSim({ modifiers: ['austerity'] });
    sim.state.gold = 900;
    expect(interestFor(sim.state)).toBe(0);
    sim.sendWave();
    killWave(sim);
    expect(log.of('waveCleared')).toMatchObject([{ wave: 1, bonus: waveClearBonus(1), interest: 0 }]);
    expect(sim.snapshot().lastInterest).toBe(0);
  });

  it('swift: enemies move 30% faster', () => {
    const run = (modifiers: ('swift' | 'ironclad')[]) => {
      const { sim } = makeSim({ modifiers });
      noHero(sim);
      const e = sim.debugSpawn('grunt', 1);
      steps(sim, seconds(2));
      return e.progress - 1;
    };
    const base = run([]);
    expect(base).toBeCloseTo(2 * ENEMIES.grunt.speed, 5);
    expect(run(['swift'])).toBeCloseTo(base * MODIFIER_FX.swiftSpeed, 5);
  });

  it('ironclad: +2 armor on every spawned enemy (and it mitigates damage)', () => {
    const { sim } = makeSim({ modifiers: ['ironclad'] });
    const g = sim.debugSpawn('grunt', 2);
    const b = sim.debugSpawn('brute', 3);
    expect(g.armor).toBe(ENEMIES.grunt.armor + MODIFIER_FX.ironcladArmor);
    expect(b.armor).toBe(ENEMIES.brute.armor + MODIFIER_FX.ironcladArmor);
    expect(sim.snapshot().enemies.find((e) => e.id === b.id)!.armor).toBe(5);
    const hp = g.hp;
    damageEnemy(sim.ctx, g, 10, { armorPierce: false, crit: false, source: { type: 'burn' } });
    expect(hp - g.hp).toBeLessThanOrEqual(10 - MODIFIER_FX.ironcladArmor);
  });

  it('horde: every group count x1.5 (ceil), the preview matches, and the group keeps its duration', () => {
    const { sim } = makeSim({ modifiers: ['horde'] });
    const w1 = WAVES[0]!;
    const def = waveDef(sim.state, 1)!;
    expect(def.map((g) => g.count)).toEqual(w1.map((g) => Math.ceil(g.count * MODIFIER_FX.hordeCount)));
    expect(sim.snapshot().nextWave).toEqual(def.map((g) => ({ enemy: g.enemy, count: g.count })));
    const g0 = def[0]!;
    expect(g0.interval * (g0.count - 1)).toBeCloseTo(w1[0]!.interval * (w1[0]!.count - 1));
    // mixed waves too
    const w6 = waveDef(sim.state, 6)!;
    expect(w6.map((g) => g.count)).toEqual(WAVES[5]!.map((g) => Math.ceil(g.count * 1.5)));
    sim.sendWave();
    expect(sim.state.spawnQueue).toHaveLength(g0.count);
    // no horde: untouched
    const plain = makeSim().sim;
    expect(waveDef(plain.state, 1)).toBe(WAVES[0]);
  });

  it('nosell: selling is rejected', () => {
    const { sim, log } = makeSim({ modifiers: ['nosell'] });
    const t = addTower(sim, 'arrow', TOWER_TILE);
    expect(sim.sellTower(t.id)).toEqual({ ok: false, reason: 'Selling is disabled (No Refunds)' });
    expect(sim.snapshot().towers).toHaveLength(1);
    expect(log.of('commandRejected')).toHaveLength(1);
  });

  it('duplicate modifiers are ignored', () => {
    const { sim } = makeSim({ modifiers: ['glass', 'glass'] });
    expect(sim.snapshot().modifiers).toEqual(['glass']);
  });
});

describe('interest', () => {
  it('min(floor(gold * rate), cap)', () => {
    expect(interestOn(0)).toBe(0);
    expect(interestOn(19)).toBe(0);
    expect(interestOn(20)).toBe(1);
    expect(interestOn(399)).toBe(19);
    expect(interestOn(1000)).toBe(RULES.interestCap);
    expect(interestOn(1e6)).toBe(RULES.interestCap);
    const { sim } = makeSim();
    sim.state.gold = 300;
    expect(interestFor(sim.state)).toBe(15);
  });

  it('is paid at wave clear on the gold held (after the clear bonus), in the event and the snapshot', () => {
    const { sim, log } = makeSim();
    sim.sendWave();
    sim.state.gold = 400;
    killWave(sim); // kills via damageEnemy pay bounties too
    const cleared = log.of('waveCleared')[0]!;
    const gold = sim.snapshot().gold;
    expect(cleared.interest).toBe(Math.min(Math.floor((gold - cleared.interest) * RULES.interestRate), RULES.interestCap));
    expect(cleared.interest).toBeGreaterThan(20);
    expect(sim.snapshot().lastInterest).toBe(cleared.interest);

    // capped
    const rich = makeSim().sim;
    const richLog: number[] = [];
    rich.startGame({ difficulty: 'normal', mapId: 'waterfall-shrine', mode: 'campaign', modifiers: [] });
    rich.state.gold = 1e6;
    rich.sendWave();
    rich.ctx.events.on('waveCleared', (p) => richLog.push(p.interest));
    killWave(rich);
    expect(richLog).toEqual([RULES.interestCap]);
  });
});

describe('score', () => {
  it('(bounty + waves*100 + lives*50) x difficulty x modifiers', () => {
    const { sim } = makeSim({ difficulty: 'hard', modifiers: ['glass', 'horde'] });
    const s = sim.state;
    s.bountyEarned = 100;
    s.wavesCleared = 3;
    s.lives = 10;
    sim.invalidate();
    const expected = Math.round((100 + 3 * RULES.score.perWave + 10 * RULES.score.perLife) * 1.5 * 1.5 * 1.4);
    expect(computeScore(s)).toBe(expected);
    expect(sim.snapshot().score).toBe(expected);

    const easy = makeSim({ difficulty: 'easy' }).sim;
    easy.state.bountyEarned = 40;
    easy.state.wavesCleared = 1;
    easy.state.lives = 30;
    expect(computeScore(easy.state)).toBe(Math.round((40 + 100 + 1500) * 0.75));
    expect(computeScore(makeSim({ start: false }).sim.state)).toBe(0);
  });

  it('bounties and cleared waves feed the live score; gameOver carries it', () => {
    const { sim, log } = makeSim({ modifiers: ['nosell'] });
    noHero(sim);
    const start = sim.snapshot().score;
    expect(start).toBe(Math.round(DIFFICULTIES.normal.lives * RULES.score.perLife * 1.1));
    sim.sendWave();
    killWave(sim);
    const s = sim.state;
    expect(s.wavesCleared).toBe(1);
    expect(s.bountyEarned).toBe(WAVES[0]![0]!.count * ENEMIES.grunt.bounty);
    expect(sim.snapshot().score).toBe(Math.round((s.bountyEarned + 100 + s.lives * 50) * 1.1));
    // lose: the score is in gameOver
    s.lives = 1;
    sim.sendWave();
    for (let i = 0; i < seconds(120) && s.phase === 'wave'; i++) sim.step(SIM_DT);
    const over = log.of('gameOver');
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ result: 'defeat', wave: 2, mode: 'campaign', score: computeScore(s) });
  });
});
