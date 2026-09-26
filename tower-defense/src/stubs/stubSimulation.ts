// Lead-owned STUB. Minimal, approximate simulation so other streams can see things move.
// Stream A replaces this with src/sim/. Not balanced, no projectiles, no status effects.
import { fail, OK, type CommandResult } from '../core/commands';
import type { EventBus } from '../core/events';
import { dist, sameTile, tileCenter } from '../core/grid';
import type { ISimulation } from '../core/interfaces';
import type {
  Difficulty,
  EnemySnapshot,
  EntityId,
  GamePhase,
  GameSnapshot,
  GameSpeed,
  TargetMode,
  TileCoord,
  TowerKind,
  TowerLevel,
  TowerSnapshot,
} from '../core/types';
import { DEFAULT_MAP_ID, DIFFICULTIES, ENEMIES, getMap, isBuildable, pathLength, pointAlongPath, RULES, TOWERS, WAVES } from '../data';

interface Spawn {
  at: number;
  kind: EnemySnapshot['kind'];
}

export function createStubSimulation(events: EventBus): ISimulation {
  let nextId = 1;
  let time = 0;
  let phase: GamePhase = 'title';
  let difficulty: Difficulty = 'normal';
  let mapId = DEFAULT_MAP_ID;
  let wave = 0;
  let gold = 0;
  let lives = 0;
  let maxLives = 0;
  let speed: GameSpeed = 1;
  let paused = false;
  let towers: TowerSnapshot[] = [];
  let enemies: EnemySnapshot[] = [];
  let spawns: Spawn[] = [];
  let waveTime = 0;
  const cooldowns = new Map<EntityId, number>();
  const stats = { kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 };

  const map = () => getMap(mapId);

  function towerSnap(t: Omit<TowerSnapshot, 'sellValue' | 'upgradeCost' | 'range'>): TowerSnapshot {
    const def = TOWERS[t.kind];
    return {
      ...t,
      sellValue: Math.floor(t.invested * RULES.sellRefund),
      upgradeCost: t.level < 3 ? def.levels[(t.level + 1) as TowerLevel].cost : null,
      range: def.levels[t.level].range,
    };
  }

  const sim: ISimulation = {
    startGame(d: Difficulty, id = DEFAULT_MAP_ID) {
      difficulty = d;
      mapId = id;
      const dd = DIFFICULTIES[d];
      gold = dd.startGold;
      lives = maxLives = dd.lives;
      wave = 0;
      time = 0;
      towers = [];
      enemies = [];
      spawns = [];
      phase = 'build';
      Object.assign(stats, { kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 });
      events.emit('gameStarted', { difficulty: d, mapId: id });
    },
    returnToTitle() {
      phase = 'title';
      towers = [];
      enemies = [];
      events.emit('gameExited', {});
    },
    canPlaceTower(kind: TowerKind, tile: TileCoord): CommandResult {
      if (phase !== 'build' && phase !== 'wave') return fail('Not in a game');
      if (!isBuildable(map(), tile)) return fail("Can't build there");
      if (towers.some((t) => sameTile(t.tile, tile))) return fail('Tile occupied');
      if (gold < TOWERS[kind].levels[1].cost) return fail('Not enough gold');
      return OK;
    },
    placeTower(kind, tile) {
      const r = sim.canPlaceTower(kind, tile);
      if (!r.ok) {
        events.emit('commandRejected', { command: 'placeTower', reason: r.reason });
        return r;
      }
      const cost = TOWERS[kind].levels[1].cost;
      gold -= cost;
      const tower = towerSnap({ id: nextId++, kind, level: 1, tile, pos: tileCenter(tile), targetMode: 'first', targetId: null, facing: Math.PI / 2, lastFiredAt: -Infinity, invested: cost });
      towers = [...towers, tower];
      stats.towersBuilt++;
      events.emit('towerPlaced', { tower });
      return OK;
    },
    upgradeTower(id) {
      const t = towers.find((x) => x.id === id);
      if (!t || t.upgradeCost === null) return fail('Cannot upgrade');
      if (gold < t.upgradeCost) {
        events.emit('commandRejected', { command: 'upgradeTower', reason: 'Not enough gold' });
        return fail('Not enough gold');
      }
      gold -= t.upgradeCost;
      const up = towerSnap({ ...t, level: (t.level + 1) as TowerLevel, invested: t.invested + t.upgradeCost });
      towers = towers.map((x) => (x.id === id ? up : x));
      events.emit('towerUpgraded', { tower: up });
      return OK;
    },
    sellTower(id) {
      const t = towers.find((x) => x.id === id);
      if (!t) return fail('No such tower');
      gold += t.sellValue;
      towers = towers.filter((x) => x.id !== id);
      events.emit('towerSold', { towerId: id, kind: t.kind, tile: t.tile, refund: t.sellValue });
      return OK;
    },
    setTargetMode(id, mode: TargetMode) {
      towers = towers.map((x) => (x.id === id ? { ...x, targetMode: mode } : x));
      return OK;
    },
    sendWave() {
      if (phase !== 'build' || wave >= WAVES.length) return fail('Cannot send wave now');
      wave++;
      phase = 'wave';
      waveTime = 0;
      spawns = [];
      for (const grp of WAVES[wave - 1]!) {
        for (let i = 0; i < grp.count; i++) spawns.push({ at: grp.delay + i * grp.interval, kind: grp.enemy });
      }
      spawns.sort((a, b) => a.at - b.at);
      events.emit('waveStarted', { wave, early: false, bonus: 0 });
      return OK;
    },
    setSpeed(s) {
      speed = s;
    },
    setPaused(p) {
      paused = p;
    },

    step(dt) {
      if (phase !== 'wave') return;
      time += dt;
      waveTime += dt;
      const m = map();
      const total = pathLength(m);
      while (spawns.length && spawns[0]!.at <= waveTime) {
        const s = spawns.shift()!;
        const def = ENEMIES[s.kind];
        const hp = Math.round(def.hp * Math.pow(RULES.hpGrowthPerWave, wave - 1) * DIFFICULTIES[difficulty].hpMultiplier);
        const p = pointAlongPath(m, 0);
        const e: EnemySnapshot = { id: nextId++, kind: s.kind, pos: p.pos, hp, maxHp: hp, armor: def.armor, flying: def.flying, slow: 0, stunned: false, burning: false, progress: 0, heading: p.heading };
        enemies.push(e);
        events.emit('enemySpawned', { enemy: e });
      }
      // move
      const next: EnemySnapshot[] = [];
      for (const e of enemies) {
        const progress = e.progress + ENEMIES[e.kind].speed * dt;
        if (progress >= total) {
          const lost = ENEMIES[e.kind].livesCost;
          lives = Math.max(0, lives - lost);
          stats.leaks++;
          events.emit('enemyLeaked', { enemyId: e.id, kind: e.kind, livesLost: lost });
          continue;
        }
        const p = pointAlongPath(m, progress);
        next.push({ ...e, progress, pos: p.pos, heading: p.heading });
      }
      enemies = next;
      // shoot (instant hits)
      towers = towers.map((t) => {
        const stats_ = TOWERS[t.kind].levels[t.level];
        const cd = (cooldowns.get(t.id) ?? 0) - dt;
        const target = enemies.filter((e) => dist(e.pos, t.pos) <= stats_.range && (!e.flying || TOWERS[t.kind].hitsAir)).sort((a, b) => b.progress - a.progress)[0];
        if (!target) {
          cooldowns.set(t.id, Math.max(0, cd));
          return t.targetId === null ? t : { ...t, targetId: null };
        }
        const facing = Math.atan2(target.pos.y - t.pos.y, target.pos.x - t.pos.x);
        if (cd > 0) {
          cooldowns.set(t.id, cd);
          return { ...t, targetId: target.id, facing };
        }
        cooldowns.set(t.id, 1 / stats_.fireRate);
        events.emit('towerFired', { towerId: t.id, kind: t.kind, level: t.level, from: t.pos, targets: [{ id: target.id, pos: target.pos }] });
        const idx = enemies.findIndex((e) => e.id === target.id);
        const dmg = Math.max(1, stats_.damage - (stats_.armorPierce ? 0 : target.armor));
        const hp = target.hp - dmg;
        events.emit('enemyDamaged', { enemyId: target.id, amount: dmg, pos: target.pos, crit: false });
        if (hp <= 0) {
          enemies.splice(idx, 1);
          const bounty = ENEMIES[target.kind].bounty;
          gold += bounty;
          stats.kills++;
          stats.goldEarned += bounty;
          events.emit('enemyKilled', { enemyId: target.id, kind: target.kind, pos: target.pos, bounty });
        } else {
          enemies[idx] = { ...target, hp };
        }
        return { ...t, targetId: target.id, facing, lastFiredAt: time };
      });

      if (lives <= 0) {
        phase = 'defeat';
        events.emit('gameOver', { result: 'defeat', stars: 0 });
      } else if (!spawns.length && !enemies.length) {
        const bonus = RULES.waveClearBonusBase + RULES.waveClearBonusPerWave * wave;
        gold += bonus;
        events.emit('waveCleared', { wave, bonus });
        if (wave >= WAVES.length) {
          phase = 'victory';
          events.emit('gameOver', { result: 'victory', stars: lives === maxLives ? 3 : 1 });
        } else phase = 'build';
      }
    },

    snapshot(): GameSnapshot {
      const nw = WAVES[wave];
      return {
        time,
        phase,
        difficulty,
        mapId,
        wave,
        totalWaves: WAVES.length,
        gold,
        lives,
        maxLives,
        speed,
        paused,
        buildCountdown: null,
        earlySendBonus: 0,
        nextWave: nw ? nw.map((g) => ({ enemy: g.enemy, count: g.count })) : null,
        towers,
        enemies,
        projectiles: [],
        groundEffects: [],
        stats: { ...stats },
        stars: 0,
      };
    },
  };
  return sim;
}
