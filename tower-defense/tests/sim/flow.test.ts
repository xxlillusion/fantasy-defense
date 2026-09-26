import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import type { GamePhase } from '../../src/core/types';
import { DEFAULT_MAP_ID, DIFFICULTIES, RULES, WAVES } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import { waveClearBonus } from '../../src/sim/economy';
import type { SimulationHandle } from '../../src/sim';
import { addTower, makeSim, seconds, steps, TOWER_TILE } from './helpers';

function runUntil(sim: SimulationHandle, pred: () => boolean, maxSteps = 200_000): void {
  for (let i = 0; i < maxSteps && !pred(); i++) sim.step(SIM_DT);
  if (!pred()) throw new Error('condition not reached');
}

const phase = (sim: SimulationHandle): GamePhase => sim.snapshot().phase;

describe('phases and waves', () => {
  it('title: step does nothing and nothing can be built', () => {
    const { sim } = makeSim({ start: false });
    expect(phase(sim)).toBe('title');
    steps(sim, 10);
    expect(sim.snapshot().time).toBe(0);
    expect(sim.sendWave().ok).toBe(false);
  });

  it('before wave 1 the build phase is untimed with no early bonus', () => {
    const { sim, log } = makeSim();
    const s = sim.snapshot();
    expect(s).toMatchObject({ phase: 'build', wave: 0, buildCountdown: null, earlySendBonus: 0, gold: 150, lives: 20, maxLives: 20 });
    expect(s.nextWave).toEqual(WAVES[0]!.map((g) => ({ enemy: g.enemy, count: g.count })));
    steps(sim, seconds(60));
    expect(phase(sim)).toBe('build');
    expect(sim.sendWave().ok).toBe(true);
    expect(log.of('waveStarted')).toEqual([{ wave: 1, early: false, bonus: 0 }]);
    expect(sim.sendWave()).toEqual({ ok: false, reason: 'Wave already in progress' });
  });

  it('wave clear bonus, countdown, early send bonus and auto-send', () => {
    const { sim, log } = makeSim({ difficulty: 'easy' });
    sim.sendWave();
    runUntil(sim, () => log.of('waveCleared').length > 0);
    expect(log.of('enemyLeaked')).toHaveLength(WAVES[0]![0]!.count);
    expect(log.of('waveCleared')).toMatchObject([{ wave: 1, bonus: waveClearBonus(1) }]);
    expect(waveClearBonus(1)).toBe(RULES.waveClearBonusBase + RULES.waveClearBonusPerWave);
    expect(sim.snapshot()).toMatchObject({ phase: 'build', wave: 1, buildCountdown: RULES.buildCountdown });
    expect(sim.snapshot().gold).toBe(DIFFICULTIES.easy.startGold + waveClearBonus(1));

    steps(sim, seconds(5.5));
    const s = sim.snapshot();
    expect(s.buildCountdown).toBeCloseTo(RULES.buildCountdown - 5.5);
    const expected = Math.floor(RULES.buildCountdown - 5.5) * RULES.earlySendGoldPerSecond;
    expect(s.earlySendBonus).toBe(expected);
    const gold = s.gold;
    sim.sendWave();
    expect(log.of('waveStarted')[1]).toEqual({ wave: 2, early: true, bonus: expected });
    expect(sim.snapshot().gold).toBe(gold + expected);
    expect(sim.snapshot()).toMatchObject({ phase: 'wave', buildCountdown: null, earlySendBonus: 0 });

    // wave 2 clears (towers help), then the countdown auto-sends wave 3
    addTower(sim, 'sniper', { col: 6, row: 9 }, 3);
    runUntil(sim, () => log.of('waveCleared').length > 1);
    steps(sim, seconds(RULES.buildCountdown) - 2);
    expect(phase(sim)).toBe('build');
    steps(sim, 3);
    expect(phase(sim)).toBe('wave');
    expect(log.of('waveStarted')[2]).toEqual({ wave: 3, early: false, bonus: 0 });
  });

  it('leaks cost lives and reaching 0 lives is a defeat (gameOver once)', () => {
    const { sim, log } = makeSim({ difficulty: 'hard' });
    sim.sendWave();
    runUntil(sim, () => phase(sim) !== 'wave');
    expect(sim.snapshot().lives).toBe(DIFFICULTIES.hard.lives - WAVES[0]![0]!.count);
    expect(log.of('enemyLeaked')[0]!.livesLost).toBe(1);
    sim.sendWave();
    runUntil(sim, () => phase(sim) === 'defeat');
    expect(sim.snapshot()).toMatchObject({ phase: 'defeat', lives: 0, stars: 0 });
    expect(log.of('gameOver')).toMatchObject([{ result: 'defeat', stars: 0, mode: 'campaign' }]);
    const t = sim.snapshot().time;
    const n = log.all.length;
    steps(sim, 100);
    expect(sim.snapshot().time).toBe(t);
    expect(log.all.length).toBe(n);
    expect(sim.placeTower('arrow', TOWER_TILE).ok).toBe(false);
    expect(sim.sendWave().ok).toBe(false);
  });

  it('boss leak costs its livesCost', () => {
    const { sim, log } = makeSim();
    sim.debugSpawn('boss', sim.state.pathLengths[0]! - 0.001);
    sim.step(SIM_DT);
    expect(log.of('enemyLeaked')[0]).toMatchObject({ kind: 'boss', livesLost: 5 });
    expect(sim.snapshot().lives).toBe(15);
    expect(sim.snapshot().stats.leaks).toBe(1);
  });

  function clearFinalWave(livesLeft?: number) {
    const h = makeSim();
    const { sim } = h;
    sim.state.wave = WAVES.length - 1;
    if (livesLeft !== undefined) sim.state.lives = livesLeft;
    sim.sendWave();
    runUntil(sim, () => {
      for (const e of sim.state.enemies) damageEnemy(sim.ctx, e, 1e9, { armorPierce: true, crit: false, source: { type: 'burn' } });
      return phase(sim) !== 'wave';
    });
    return h;
  }

  it('clearing the final wave is a victory with stars', () => {
    const { sim, log } = clearFinalWave();
    expect(log.of('waveCleared').at(-1)).toMatchObject({ wave: WAVES.length, bonus: waveClearBonus(WAVES.length) });
    expect(sim.snapshot()).toMatchObject({ phase: 'victory', stars: 3, nextWave: null, buildCountdown: null });
    expect(log.of('gameOver')).toMatchObject([{ result: 'victory', stars: 3 }]);
    steps(sim, 10);
    expect(log.of('gameOver')).toHaveLength(1);

    expect(clearFinalWave(12).sim.snapshot().stars).toBe(2);
    expect(clearFinalWave(3).sim.snapshot().stars).toBe(1);
  });
});

describe('game lifecycle, pause, speed, snapshot', () => {
  it('startGame fully resets state and ids; returnToTitle emits gameExited', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    sim.sendWave();
    steps(sim, seconds(3));
    sim.setSpeed(2);
    sim.setPaused(true);
    sim.startGame({ difficulty: 'hard', mapId: DEFAULT_MAP_ID, mode: 'campaign', modifiers: [] });
    expect(log.of('gameStarted').at(-1)).toEqual({ difficulty: 'hard', mapId: 'waterfall-shrine', mode: 'campaign', modifiers: [] });
    const s = sim.snapshot();
    expect(s).toMatchObject({ phase: 'build', wave: 0, time: 0, gold: DIFFICULTIES.hard.startGold, lives: DIFFICULTIES.hard.lives, speed: 1, paused: false, difficulty: 'hard' });
    expect(s.towers).toHaveLength(0);
    expect(s.enemies).toHaveLength(0);
    expect(s.stats).toEqual({ kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 });
    sim.placeTower('arrow', TOWER_TILE);
    expect(sim.snapshot().towers[0]!.id).toBe(1);

    sim.returnToTitle();
    expect(log.of('gameExited')).toHaveLength(1);
    expect(sim.snapshot().phase).toBe('title');
    expect(sim.snapshot().towers).toHaveLength(0);
  });

  it('stores pause and speed in the snapshot', () => {
    const { sim } = makeSim();
    sim.setPaused(true);
    sim.setSpeed(2);
    expect(sim.snapshot()).toMatchObject({ paused: true, speed: 2 });
    sim.setPaused(false);
    expect(sim.snapshot().paused).toBe(false);
  });

  it('caches the snapshot until something changes; snapshots are frozen', () => {
    const { sim } = makeSim();
    const a = sim.snapshot();
    expect(sim.snapshot()).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.towers)).toBe(true);
    sim.step(SIM_DT);
    const b = sim.snapshot();
    expect(b).not.toBe(a);
    expect(b.time).toBeCloseTo(SIM_DT);
    expect(a.time).toBe(0);
    sim.setSpeed(2);
    expect(sim.snapshot()).not.toBe(b);
  });

  it('snapshot enemies and projectiles have the contract shape', () => {
    const { sim } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    sim.debugSpawn('runner', 4);
    sim.step(SIM_DT);
    const s = sim.snapshot();
    expect(Object.keys(s.enemies[0]!).sort()).toEqual(
      ['id', 'kind', 'pos', 'hp', 'maxHp', 'armor', 'flying', 'slow', 'stunned', 'burning', 'progress', 'heading', 'lane', 'remaining', 'shield', 'stealthed', 'revealed', 'vulnerable', 'blockedByHero'].sort(),
    );
    expect(Object.keys(s.projectiles[0]!).sort()).toEqual(['id', 'kind', 'sourceTowerId', 'pos', 'from', 'to', 'targetId', 'targetFlying'].sort());
    expect(s.projectiles[0]!.kind).toBe('arrow');
    expect(Object.keys(s.towers[0]!).sort()).toEqual(
      ['id', 'kind', 'level', 'tile', 'pos', 'targetMode', 'targetId', 'facing', 'lastFiredAt', 'invested', 'sellValue', 'upgradeCost', 'range', 'branch', 'cooldownFraction', 'branchOptions'].sort(),
    );
  });
});
