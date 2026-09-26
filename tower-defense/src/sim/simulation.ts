// The simulation facade: GameCommands + step() + snapshot(), wiring all the systems together.
// Stream A2 owns this file. The step() pipeline order below is part of the v2 A1/A2 contract.
import { fail, OK, type CommandResult } from '../core/commands';
import type { EventBus } from '../core/events';
import { sameTile, tileAt, tileCenter } from '../core/grid';
import type { ISimulation } from '../core/interfaces';
import type {
  AbilityId,
  EnemyKind,
  EntityId,
  GameOptions,
  GameSnapshot,
  GameSpeed,
  TargetMode,
  TileCoord,
  TowerBranch,
  TowerKind,
  TowerLevel,
  Vec2,
} from '../core/types';
import { DEFAULT_MAP_ID, DIFFICULTIES, isBuildable, isWalkable, MAPS, TOWERS } from '../data';
import { cast, checkCast, updateAbilities } from './abilities';
import { buildCost, sellValue, upgradeCost } from './economy';
import { tickStatuses, updateGroundEffects } from './effects';
import { canSendWave, checkDefeat, checkWaveCleared, startNextWave, updateBuildCountdown } from './flow';
import { createHero, onEnemyKilledForHero, orderHeroRally, updateHeroCombat, updateHeroMovement } from './hero';
import { applyStartModifiers } from './modifiers';
import { moveEnemies } from './movement';
import { updateProjectiles } from './projectiles';
import { defaultRng, type Rng } from './rng';
import { buildSnapshot, toTowerSnapshot } from './snapshot';
import { spawnEnemy, updateSpawner } from './spawner';
import {
  allocId,
  createInitialState,
  findTower,
  hasModifier,
  type EnemyState,
  type SimContext,
  type SimState,
  type TowerState,
} from './state';
import { updateTowers } from './towers';
import { updateTraits } from './traits';

export interface SimulationOptions {
  /** Random source (crits, freeze/stun chances). Defaults to Math.random. */
  rng?: Rng;
}

/** ISimulation plus test/debug hooks. Only the ISimulation part is the public contract. */
export interface SimulationHandle extends ISimulation {
  /** Live internal state (tests/debug only; mutate with care and call snapshot() afterwards). */
  readonly state: SimState;
  readonly ctx: SimContext;
  /** Spawn an enemy directly at a distance along a lane (tests/debug). */
  debugSpawn(kind: EnemyKind, progress?: number, lane?: number): EnemyState;
  /** Force the next snapshot() to rebuild (after mutating `state` directly). */
  invalidate(): void;
}

const TARGET_MODES: readonly TargetMode[] = ['first', 'last', 'strongest', 'closest'];

export const DEFAULT_OPTIONS: GameOptions = { difficulty: 'normal', mapId: DEFAULT_MAP_ID, mode: 'campaign', modifiers: [] };

export function createSimulationWithOptions(events: EventBus, options: SimulationOptions = {}): SimulationHandle {
  const ctx: SimContext = {
    state: createInitialState(),
    events,
    rng: options.rng ?? defaultRng,
    hooks: {
      onEnemyKilled: (enemy, source) => onEnemyKilledForHero(ctx, enemy, source),
    },
  };
  let cached: GameSnapshot | null = null;

  const touch = (): void => {
    cached = null;
  };
  const inGame = (): boolean => ctx.state.phase === 'build' || ctx.state.phase === 'wave';
  const reject = (command: string, reason: string): CommandResult => {
    events.emit('commandRejected', { command, reason });
    return fail(reason);
  };

  function checkPlacement(kind: TowerKind, tile: TileCoord): CommandResult {
    const { state } = ctx;
    if (!inGame()) return fail('Not in a game');
    if (!TOWERS[kind]) return fail('Unknown tower');
    if (!tile || !Number.isInteger(tile.col) || !Number.isInteger(tile.row) || !isBuildable(state.map, tile)) {
      return fail("Can't build there");
    }
    if (state.towers.some((t) => sameTile(t.tile, tile))) return fail('Tile occupied');
    if (state.gold < buildCost(kind)) return fail('Not enough gold');
    return OK;
  }

  function checkRally(point: Vec2): CommandResult {
    const { state } = ctx;
    if (!inGame()) return fail('Not in a game');
    if (!state.hero) return fail('No hero');
    if (state.hero.state === 'down') return fail('Aldric is recovering');
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return fail("Can't go there");
    if (!isWalkable(state.map, tileAt(point))) return fail("Can't go there");
    return OK;
  }

  /**
   * One fixed step. Order (v2 contract between A1 and A2):
   *  countdown/spawner -> abilities -> hero movement & blocking -> enemy movement/leaks -> defeat
   *  -> statuses -> traits (heal, reveal) -> ground effects -> hero combat -> towers -> projectiles
   *  -> prune dead -> wave clear.
   */
  function step(dt: number): void {
    const { state } = ctx;
    if (!inGame() || !(dt > 0)) return;
    touch();
    state.time += dt;

    if (state.phase === 'build') updateBuildCountdown(ctx, dt);
    if (state.phase === 'wave') updateSpawner(ctx, dt);

    updateAbilities(ctx, dt);
    updateHeroMovement(ctx, dt);
    moveEnemies(ctx, dt);
    if (checkDefeat(ctx)) return;
    tickStatuses(ctx, dt);
    updateTraits(ctx, dt);
    updateGroundEffects(ctx, dt);
    updateHeroCombat(ctx, dt);
    updateTowers(ctx, dt);
    updateProjectiles(ctx, dt);

    state.enemies = state.enemies.filter((e) => e.alive);
    checkWaveCleared(ctx);
  }

  const sim: SimulationHandle = {
    get state() {
      return ctx.state;
    },
    ctx,

    startGame(opts: GameOptions) {
      const options: GameOptions = { ...DEFAULT_OPTIONS, ...opts };
      const map = MAPS[options.mapId] ?? MAPS[DEFAULT_MAP_ID]!;
      const dd = DIFFICULTIES[options.difficulty] ?? DIFFICULTIES.normal;
      const state = createInitialState(map);
      state.difficulty = dd.id;
      state.mode = options.mode === 'endless' ? 'endless' : 'campaign';
      state.modifiers = [...new Set(options.modifiers ?? [])];
      state.gold = dd.startGold;
      state.lives = state.maxLives = dd.lives;
      applyStartModifiers(state, options);
      state.phase = 'build';
      state.buildCountdown = null;
      state.hero = createHero(state);
      ctx.state = state;
      touch();
      events.emit('gameStarted', { difficulty: dd.id, mapId: map.id, mode: state.mode, modifiers: [...state.modifiers] });
      events.emit('heroSpawned', { pos: { ...state.hero.pos } });
    },

    returnToTitle() {
      ctx.state = createInitialState();
      touch();
      events.emit('gameExited', {});
    },

    canPlaceTower(kind, tile) {
      return checkPlacement(kind, tile);
    },

    placeTower(kind, tile) {
      const check = checkPlacement(kind, tile);
      if (!check.ok) return reject('placeTower', check.reason);
      const { state } = ctx;
      const cost = buildCost(kind);
      state.gold -= cost;
      const tower: TowerState = {
        id: allocId(state),
        kind,
        level: 1,
        branch: null,
        tile: { col: tile.col, row: tile.row },
        pos: tileCenter(tile),
        targetMode: 'first',
        targetId: null,
        facing: Math.PI / 2,
        lastFiredAt: -Infinity,
        invested: cost,
        cooldown: 0,
      };
      state.towers.push(tower);
      state.stats.towersBuilt++;
      touch();
      events.emit('towerPlaced', { tower: toTowerSnapshot(tower) });
      return OK;
    },

    upgradeTower(id: EntityId, branch?: TowerBranch) {
      if (!inGame()) return reject('upgradeTower', 'Not in a game');
      const { state } = ctx;
      const t = findTower(state, id);
      if (!t) return reject('upgradeTower', 'Tower not found');
      if (t.level === 3 && branch !== 'a' && branch !== 'b') return reject('upgradeTower', 'Choose a specialization');
      const cost = upgradeCost(t.kind, t.level, t.level === 3 ? branch! : null);
      if (cost === null) return reject('upgradeTower', 'Already at max level');
      if (state.gold < cost) return reject('upgradeTower', 'Not enough gold');
      state.gold -= cost;
      if (t.level === 3) t.branch = branch!;
      t.level = (t.level + 1) as TowerLevel;
      t.invested += cost;
      touch();
      events.emit('towerUpgraded', { tower: toTowerSnapshot(t) });
      return OK;
    },

    sellTower(id: EntityId) {
      if (!inGame()) return reject('sellTower', 'Not in a game');
      const { state } = ctx;
      if (hasModifier(state, 'nosell')) return reject('sellTower', 'Selling is disabled (No Refunds)');
      const t = findTower(state, id);
      if (!t) return reject('sellTower', 'Tower not found');
      const refund = sellValue(t.invested);
      state.gold += refund;
      state.towers = state.towers.filter((x) => x !== t);
      touch();
      events.emit('towerSold', { towerId: t.id, kind: t.kind, tile: { ...t.tile }, refund });
      return OK;
    },

    setTargetMode(id: EntityId, mode: TargetMode) {
      const t = findTower(ctx.state, id);
      if (!t) return reject('setTargetMode', 'Tower not found');
      if (!TARGET_MODES.includes(mode)) return reject('setTargetMode', 'Unknown targeting mode');
      t.targetMode = mode;
      touch();
      return OK;
    },

    sendWave() {
      if (!canSendWave(ctx)) {
        return reject('sendWave', ctx.state.phase === 'wave' ? 'Wave already in progress' : "Can't send a wave now");
      }
      startNextWave(ctx, true);
      touch();
      return OK;
    },

    canSetHeroRally(point: Vec2) {
      return checkRally(point);
    },

    setHeroRally(point: Vec2) {
      const check = checkRally(point);
      if (!check.ok) return reject('setHeroRally', check.reason);
      const hero = ctx.state.hero!;
      orderHeroRally(ctx.state, point);
      touch();
      events.emit('heroMoved', { rally: { ...hero.rally } });
      return OK;
    },

    canCastAbility(id: AbilityId, target?: Vec2) {
      if (!inGame()) return fail('Not in a game');
      return checkCast(ctx, id, target);
    },

    castAbility(id: AbilityId, target?: Vec2) {
      if (!inGame()) return reject('castAbility', 'Not in a game');
      const check = checkCast(ctx, id, target);
      if (!check.ok) return reject('castAbility', check.reason);
      cast(ctx, id, target);
      touch();
      return OK;
    },

    setSpeed(speed: GameSpeed) {
      if (speed !== 1 && speed !== 2) return;
      ctx.state.speed = speed;
      touch();
    },

    setPaused(paused: boolean) {
      ctx.state.paused = paused;
      touch();
    },

    step,

    snapshot() {
      if (!cached) cached = buildSnapshot(ctx.state);
      return cached;
    },

    debugSpawn(kind, progress = 0, lane = 0) {
      touch();
      return spawnEnemy(ctx, kind, { progress, lane });
    },

    invalidate: touch,
  };
  return sim;
}
