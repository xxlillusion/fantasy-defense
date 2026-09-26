// Copies internal state into fresh, frozen GameSnapshot objects.
import type {
  EnemySnapshot,
  GameSnapshot,
  GroundEffectSnapshot,
  ProjectileSnapshot,
  TowerSnapshot,
  WaveGroupPreview,
} from '../core/types';
import { TOWERS, WAVES } from '../data';
import { earlySendBonus, sellValue, upgradeCost } from './economy';
import { currentSlow, isStunned } from './effects';
import type { EnemyState, GroundEffectState, ProjectileState, SimState, TowerState } from './state';

export function toTowerSnapshot(t: TowerState): TowerSnapshot {
  return Object.freeze({
    id: t.id,
    kind: t.kind,
    level: t.level,
    tile: Object.freeze({ ...t.tile }),
    pos: Object.freeze({ ...t.pos }),
    targetMode: t.targetMode,
    targetId: t.targetId,
    facing: t.facing,
    lastFiredAt: t.lastFiredAt,
    invested: t.invested,
    sellValue: sellValue(t.invested),
    upgradeCost: upgradeCost(t.kind, t.level),
    range: TOWERS[t.kind].levels[t.level].range,
  });
}

export function toEnemySnapshot(e: EnemyState): EnemySnapshot {
  return Object.freeze({
    id: e.id,
    kind: e.kind,
    pos: Object.freeze({ ...e.pos }),
    hp: e.hp,
    maxHp: e.maxHp,
    armor: e.def.armor,
    flying: e.def.flying,
    slow: currentSlow(e),
    stunned: isStunned(e),
    burning: e.burning,
    progress: e.progress,
    heading: e.heading,
  });
}

function toProjectileSnapshot(p: ProjectileState, state: SimState): ProjectileSnapshot {
  const target = p.targetId === null ? undefined : state.enemies.find((e) => e.id === p.targetId && e.alive);
  return Object.freeze({
    id: p.id,
    kind: p.kind,
    sourceTowerId: p.sourceTowerId,
    pos: Object.freeze({ ...p.pos }),
    from: Object.freeze({ ...p.from }),
    to: Object.freeze({ ...p.to }),
    targetId: target ? target.id : null,
    targetFlying: target ? target.def.flying : false,
  });
}

function toGroundEffectSnapshot(g: GroundEffectState): GroundEffectSnapshot {
  return Object.freeze({ id: g.id, kind: g.kind, pos: Object.freeze({ ...g.pos }), radius: g.radius, remaining: g.remaining });
}

function nextWavePreview(state: SimState): readonly WaveGroupPreview[] | null {
  if (state.phase !== 'build' && state.phase !== 'wave') return null;
  const def = WAVES[state.wave];
  if (!def) return null;
  return Object.freeze(def.map((g) => Object.freeze({ enemy: g.enemy, count: g.count })));
}

export function buildSnapshot(state: SimState): GameSnapshot {
  const inBuild = state.phase === 'build';
  return Object.freeze({
    time: state.time,
    phase: state.phase,
    difficulty: state.difficulty,
    mapId: state.mapId,
    wave: state.wave,
    totalWaves: WAVES.length,
    gold: state.gold,
    lives: state.lives,
    maxLives: state.maxLives,
    speed: state.speed,
    paused: state.paused,
    buildCountdown: inBuild ? state.buildCountdown : null,
    earlySendBonus: inBuild ? earlySendBonus(state.buildCountdown) : 0,
    nextWave: nextWavePreview(state),
    towers: Object.freeze(state.towers.map(toTowerSnapshot)),
    enemies: Object.freeze(state.enemies.filter((e) => e.alive).map(toEnemySnapshot)),
    projectiles: Object.freeze(state.projectiles.map((p) => toProjectileSnapshot(p, state))),
    groundEffects: Object.freeze(state.groundEffects.map(toGroundEffectSnapshot)),
    stats: Object.freeze({ ...state.stats }),
    stars: state.phase === 'victory' ? state.stars : 0,
  });
}
