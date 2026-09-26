// Lead-owned STUB (v2). Minimal, approximate simulation so other streams can see things move while
// Streams A1/A2 rebuild src/sim/. Not balanced: instant hits, no traits. The hero stands where you
// rally him (teleports), abilities just emit events and go on cooldown.
import { fail, OK, type CommandResult } from '../core/commands';
import type { EventBus } from '../core/events';
import { dist, sameTile, tileAt, tileCenter } from '../core/grid';
import type { ISimulation } from '../core/interfaces';
import type {
  AbilityId,
  AbilitySnapshot,
  Difficulty,
  EnemySnapshot,
  EntityId,
  GameMode,
  GameOptions,
  GamePhase,
  GameSnapshot,
  GameSpeed,
  HeroSnapshot,
  ModifierId,
  TargetMode,
  TileCoord,
  TowerBranch,
  TowerKind,
  TowerLevel,
  TowerSnapshot,
  Vec2,
} from '../core/types';
import {
  ABILITIES,
  ABILITY_IDS,
  branchOptions,
  DEFAULT_MAP_ID,
  DIFFICULTIES,
  ENEMIES,
  getMap,
  HERO,
  HERO_MAX_LEVEL,
  isBuildable,
  isWalkable,
  MAPS,
  mapWaves,
  nextUpgradeCost,
  pathLength,
  pointAlongPath,
  RULES,
  TOWERS,
  towerStats,
} from '../data';

interface Spawn {
  at: number;
  kind: EnemySnapshot['kind'];
  lane: number;
}

type TowerCore = Omit<TowerSnapshot, 'sellValue' | 'upgradeCost' | 'range' | 'branchOptions' | 'cooldownFraction'>;

export function createStubSimulation(events: EventBus): ISimulation {
  let nextId = 1;
  let time = 0;
  let phase: GamePhase = 'title';
  let difficulty: Difficulty = 'normal';
  let mode: GameMode = 'campaign';
  let modifiers: ModifierId[] = [];
  let mapId = DEFAULT_MAP_ID;
  let wave = 0;
  let gold = 0;
  let lives = 0;
  let maxLives = 0;
  let speed: GameSpeed = 1;
  let paused = false;
  let towers: TowerCore[] = [];
  let enemies: EnemySnapshot[] = [];
  let spawns: Spawn[] = [];
  let waveTime = 0;
  let laneCursor = 0;
  let hero: HeroSnapshot | null = null;
  const abilityCd: Record<AbilityId, number> = { meteor: 0, frostNova: 0, goldRush: 0, bladeStorm: 0 };
  const cooldowns = new Map<EntityId, number>();
  const stats = { kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 };

  const map = () => getMap(mapId);
  const waves = () => mapWaves(map());

  function towerSnap(t: TowerCore): TowerSnapshot {
    const stats_ = towerStats(t.kind, t.level, t.branch);
    return {
      ...t,
      sellValue: Math.floor(t.invested * RULES.sellRefund),
      upgradeCost: nextUpgradeCost(t.kind, t.level),
      range: stats_.range,
      cooldownFraction: Math.min(1, 1 - (cooldowns.get(t.id) ?? 0) * stats_.fireRate),
      branchOptions: t.level === 3 ? branchOptions(t.kind) : null,
    };
  }

  function makeHero(): HeroSnapshot {
    const pos = tileCenter(map().portal);
    return { pos, rally: pos, state: 'idle', hp: HERO.hp, maxHp: HERO.hp, level: 1, maxLevel: HERO_MAX_LEVEL, xp: 0, xpNext: HERO.levelXp[1], facing: Math.PI / 2, lastAttackAt: -Infinity, respawnIn: 0, blocking: [] };
  }

  const sim: ISimulation = {
    startGame(opts: GameOptions) {
      difficulty = opts.difficulty;
      mapId = MAPS[opts.mapId] ? opts.mapId : DEFAULT_MAP_ID;
      mode = opts.mode;
      modifiers = [...opts.modifiers];
      const dd = DIFFICULTIES[difficulty];
      gold = dd.startGold;
      lives = maxLives = dd.lives;
      wave = 0;
      time = 0;
      towers = [];
      enemies = [];
      spawns = [];
      paused = false;
      speed = 1;
      phase = 'build';
      hero = makeHero();
      for (const id of ABILITY_IDS) abilityCd[id] = 0;
      Object.assign(stats, { kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 });
      events.emit('gameStarted', { difficulty, mapId, mode, modifiers: [...modifiers] });
      events.emit('heroSpawned', { pos: hero.pos });
    },
    returnToTitle() {
      phase = 'title';
      towers = [];
      enemies = [];
      hero = null;
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
      const tower: TowerCore = { id: nextId++, kind, level: 1, branch: null, tile, pos: tileCenter(tile), targetMode: 'first', targetId: null, facing: Math.PI / 2, lastFiredAt: -Infinity, invested: cost };
      towers = [...towers, tower];
      stats.towersBuilt++;
      events.emit('towerPlaced', { tower: towerSnap(tower) });
      return OK;
    },
    upgradeTower(id, branch?: TowerBranch) {
      const t = towers.find((x) => x.id === id);
      if (!t || t.level >= 4) return fail('Cannot upgrade');
      if (t.level === 3 && !branch) return fail('Choose a specialization');
      const cost = nextUpgradeCost(t.kind, t.level, branch ?? null)!;
      if (gold < cost) {
        events.emit('commandRejected', { command: 'upgradeTower', reason: 'Not enough gold' });
        return fail('Not enough gold');
      }
      gold -= cost;
      const up: TowerCore = { ...t, level: (t.level + 1) as TowerLevel, branch: t.level === 3 ? branch! : t.branch, invested: t.invested + cost };
      towers = towers.map((x) => (x.id === id ? up : x));
      events.emit('towerUpgraded', { tower: towerSnap(up) });
      return OK;
    },
    sellTower(id) {
      const t = towers.find((x) => x.id === id);
      if (!t) return fail('No such tower');
      const refund = Math.floor(t.invested * RULES.sellRefund);
      gold += refund;
      towers = towers.filter((x) => x.id !== id);
      events.emit('towerSold', { towerId: id, kind: t.kind, tile: t.tile, refund });
      return OK;
    },
    setTargetMode(id, mode_: TargetMode) {
      towers = towers.map((x) => (x.id === id ? { ...x, targetMode: mode_ } : x));
      return OK;
    },
    sendWave() {
      if (phase !== 'build') return fail('Cannot send wave now');
      const list = waves();
      const def = list[wave] ?? (mode === 'endless' ? [{ enemy: 'grunt' as const, count: 10 + wave, interval: 0.6, delay: 0 }] : null);
      if (!def) return fail('No more waves');
      wave++;
      phase = 'wave';
      waveTime = 0;
      spawns = [];
      const lanes = map().paths.length;
      for (const grp of def) {
        for (let i = 0; i < grp.count; i++) {
          const lane = typeof grp.lane === 'number' ? Math.min(lanes - 1, grp.lane) : laneCursor++ % lanes;
          spawns.push({ at: grp.delay + i * grp.interval, kind: grp.enemy, lane });
        }
      }
      spawns.sort((a, b) => a.at - b.at);
      events.emit('waveStarted', { wave, early: false, bonus: 0 });
      return OK;
    },
    canSetHeroRally(point: Vec2) {
      if (!hero) return fail('No hero');
      return isWalkable(map(), tileAt(point)) ? OK : fail("Can't go there");
    },
    setHeroRally(point: Vec2) {
      const r = sim.canSetHeroRally(point);
      if (!r.ok || !hero) return r;
      hero = { ...hero, pos: { ...point }, rally: { ...point } };
      events.emit('heroMoved', { rally: { ...point } });
      return OK;
    },
    canCastAbility(id: AbilityId, target?: Vec2) {
      if (phase !== 'build' && phase !== 'wave') return fail('Not in a game');
      if (abilityCd[id] > 0) return fail('On cooldown');
      if (ABILITIES[id].targeted && !target) return fail('Pick a target');
      return OK;
    },
    castAbility(id: AbilityId, target?: Vec2) {
      const r = sim.canCastAbility(id, target);
      if (!r.ok) return r;
      abilityCd[id] = ABILITIES[id].cooldown;
      events.emit('abilityCast', { id, target: target ? { ...target } : null });
      if (id === 'meteor' && target) events.emit('meteorImpact', { pos: { ...target }, radius: ABILITIES.meteor.radius });
      return OK;
    },
    setSpeed(s) {
      speed = s;
    },
    setPaused(p) {
      paused = p;
    },

    step(dt) {
      if (phase !== 'wave' && phase !== 'build') return;
      time += dt;
      for (const id of ABILITY_IDS) abilityCd[id] = Math.max(0, abilityCd[id] - dt);
      if (phase !== 'wave') return;
      waveTime += dt;
      const m = map();
      while (spawns.length && spawns[0]!.at <= waveTime) {
        const s = spawns.shift()!;
        const def = ENEMIES[s.kind];
        const hp = Math.round(def.hp * Math.pow(RULES.hpGrowthPerWave, wave - 1) * DIFFICULTIES[difficulty].hpMultiplier);
        const p = pointAlongPath(m, 0, s.lane);
        const stealth = !!def.traits?.stealth;
        const e: EnemySnapshot = { id: nextId++, kind: s.kind, pos: p.pos, hp, maxHp: hp, armor: def.armor, flying: def.flying, slow: 0, stunned: false, burning: false, progress: 0, heading: p.heading, lane: s.lane, remaining: pathLength(m, s.lane), shield: def.traits?.shieldHits ?? 0, stealthed: stealth, revealed: true, vulnerable: false, blockedByHero: false };
        enemies.push(e);
        events.emit('enemySpawned', { enemy: e });
      }
      // move
      const next: EnemySnapshot[] = [];
      for (const e of enemies) {
        const total = pathLength(m, e.lane);
        const progress = e.progress + ENEMIES[e.kind].speed * dt;
        if (progress >= total) {
          const lost = ENEMIES[e.kind].livesCost;
          lives = Math.max(0, lives - lost);
          stats.leaks++;
          events.emit('enemyLeaked', { enemyId: e.id, kind: e.kind, livesLost: lost });
          continue;
        }
        const p = pointAlongPath(m, progress, e.lane);
        next.push({ ...e, progress, remaining: total - progress, pos: p.pos, heading: p.heading });
      }
      enemies = next;
      // shoot (instant hits)
      towers = towers.map((t) => {
        const st = towerStats(t.kind, t.level, t.branch);
        const cd = (cooldowns.get(t.id) ?? 0) - dt;
        const target = enemies.filter((e) => dist(e.pos, t.pos) <= st.range && (!e.flying || TOWERS[t.kind].hitsAir)).sort((a, b) => a.remaining - b.remaining)[0];
        if (!target) {
          cooldowns.set(t.id, Math.max(0, cd));
          return t.targetId === null ? t : { ...t, targetId: null };
        }
        const facing = Math.atan2(target.pos.y - t.pos.y, target.pos.x - t.pos.x);
        if (cd > 0) {
          cooldowns.set(t.id, cd);
          return { ...t, targetId: target.id, facing };
        }
        cooldowns.set(t.id, 1 / st.fireRate);
        events.emit('towerFired', { towerId: t.id, kind: t.kind, level: t.level, branch: t.branch, from: t.pos, targets: [{ id: target.id, pos: target.pos }] });
        const idx = enemies.findIndex((e) => e.id === target.id);
        const dmg = Math.max(1, st.damage - (st.armorPierce ? 0 : target.armor));
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
        events.emit('gameOver', { result: 'defeat', stars: 0, score: stats.goldEarned, mode, wave });
      } else if (!spawns.length && !enemies.length) {
        const bonus = RULES.waveClearBonusBase + RULES.waveClearBonusPerWave * wave;
        gold += bonus;
        events.emit('waveCleared', { wave, bonus, interest: 0 });
        if (mode === 'campaign' && wave >= waves().length) {
          phase = 'victory';
          events.emit('gameOver', { result: 'victory', stars: lives === maxLives ? 3 : 1, score: stats.goldEarned, mode, wave });
        } else phase = 'build';
      }
    },

    snapshot(): GameSnapshot {
      const list = waves();
      const nw = list[wave];
      const abilities: AbilitySnapshot[] = ABILITY_IDS.map((id) => ({
        id,
        unlocked: phase !== 'title',
        unlockWave: ABILITIES[id].unlockWave,
        cooldown: abilityCd[id],
        cooldownMax: ABILITIES[id].cooldown,
        activeRemaining: 0,
        targeted: ABILITIES[id].targeted,
        radius: ABILITIES[id].radius,
      }));
      return {
        time,
        phase,
        difficulty,
        mapId,
        mode,
        modifiers,
        wave,
        totalWaves: mode === 'endless' ? null : list.length,
        score: stats.goldEarned,
        lastInterest: 0,
        gold,
        lives,
        maxLives,
        speed,
        paused,
        buildCountdown: null,
        earlySendBonus: 0,
        nextWave: nw ? nw.map((g) => ({ enemy: g.enemy, count: g.count })) : null,
        nextWaveLanes: map().paths.map((_, i) => i),
        hero,
        abilities,
        towers: towers.map(towerSnap),
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
