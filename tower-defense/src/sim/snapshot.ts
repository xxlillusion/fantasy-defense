// Copies internal state into fresh, frozen GameSnapshot objects.
// Lead-owned layout (v2); Stream A2 may extend it.
import type {
  AbilitySnapshot,
  EnemySnapshot,
  GameSnapshot,
  GroundEffectSnapshot,
  HeroSnapshot,
  ProjectileSnapshot,
  TowerSnapshot,
  WaveGroupPreview,
} from '../core/types';
import { ABILITIES, ABILITY_IDS, branchOptions, HERO, HERO_MAX_LEVEL, mapWaves, towerStats } from '../data';
import { earlySendBonus, sellValue, upgradeCost } from './economy';
import { currentSlow, isStunned } from './effects';
import { waveDef } from './flow';
import { computeScore } from './score';
import type { EnemyState, GroundEffectState, HeroInternal, ProjectileState, SimState, TowerState } from './state';

export function toTowerSnapshot(t: TowerState): TowerSnapshot {
  const stats = towerStats(t.kind, t.level, t.branch);
  const period = 1 / stats.fireRate;
  return Object.freeze({
    id: t.id,
    kind: t.kind,
    level: t.level,
    branch: t.branch,
    tile: Object.freeze({ ...t.tile }),
    pos: Object.freeze({ ...t.pos }),
    targetMode: t.targetMode,
    targetId: t.targetId,
    facing: t.facing,
    lastFiredAt: t.lastFiredAt,
    invested: t.invested,
    sellValue: sellValue(t.invested),
    upgradeCost: upgradeCost(t.kind, t.level),
    range: stats.range,
    cooldownFraction: Math.min(1, Math.max(0, 1 - t.cooldown / period)),
    branchOptions: t.level === 3 ? Object.freeze(branchOptions(t.kind)) : null,
  });
}

export function toEnemySnapshot(e: EnemyState): EnemySnapshot {
  return Object.freeze({
    id: e.id,
    kind: e.kind,
    pos: Object.freeze({ ...e.pos }),
    hp: e.hp,
    maxHp: e.maxHp,
    armor: e.armor,
    flying: e.def.flying,
    slow: currentSlow(e),
    stunned: isStunned(e),
    burning: e.burning,
    progress: e.progress,
    heading: e.heading,
    lane: e.lane,
    remaining: e.remaining,
    shield: e.shield,
    stealthed: e.stealth,
    revealed: e.revealed,
    vulnerable: e.vulnerable !== null && e.vulnerable.remaining > 0,
    blockedByHero: e.blockedByHero,
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

function toHeroSnapshot(h: HeroInternal): HeroSnapshot {
  const next = h.level < HERO_MAX_LEVEL ? HERO.levelXp[h.level]! : null;
  return Object.freeze({
    pos: Object.freeze({ ...h.pos }),
    rally: Object.freeze({ ...h.rally }),
    state: h.state,
    hp: h.hp,
    maxHp: h.maxHp,
    level: h.level,
    maxLevel: HERO_MAX_LEVEL,
    xp: h.xp,
    xpNext: next,
    facing: h.facing,
    lastAttackAt: h.lastAttackAt,
    respawnIn: h.respawnIn,
    blocking: Object.freeze([...h.blocking]),
  });
}

function toAbilitySnapshots(state: SimState): readonly AbilitySnapshot[] {
  return Object.freeze(
    ABILITY_IDS.map((id) => {
      const def = ABILITIES[id];
      const a = state.abilities[id];
      return Object.freeze({
        id,
        unlocked: state.phase !== 'title' && state.wave >= def.unlockWave,
        unlockWave: def.unlockWave,
        cooldown: Math.max(0, a.cooldown),
        cooldownMax: def.cooldown,
        activeRemaining: Math.max(0, a.active),
        targeted: def.targeted,
        radius: def.radius,
      });
    }),
  );
}

function nextWavePreview(state: SimState): readonly WaveGroupPreview[] | null {
  if (state.phase !== 'build' && state.phase !== 'wave') return null;
  const def = waveDef(state, state.wave + 1);
  if (!def) return null;
  return Object.freeze(def.map((g) => Object.freeze({ enemy: g.enemy, count: g.count })));
}

function nextWaveLanes(state: SimState): readonly number[] {
  const lanes = state.map.paths.length;
  const def = state.phase === 'build' || state.phase === 'wave' ? waveDef(state, state.wave + 1) : null;
  if (!def) return Object.freeze([]);
  const set = new Set<number>();
  for (const g of def) {
    if (typeof g.lane === 'number') set.add(Math.min(lanes - 1, Math.max(0, g.lane)));
    else for (let l = 0; l < Math.min(lanes, g.count); l++) set.add(l);
  }
  return Object.freeze([...set].sort((a, b) => a - b));
}

export function buildSnapshot(state: SimState): GameSnapshot {
  const inBuild = state.phase === 'build';
  return Object.freeze({
    time: state.time,
    phase: state.phase,
    difficulty: state.difficulty,
    mapId: state.mapId,
    mode: state.mode,
    modifiers: Object.freeze([...state.modifiers]),
    wave: state.wave,
    totalWaves: state.mode === 'endless' ? null : mapWaves(state.map).length,
    score: computeScore(state),
    lastInterest: state.lastInterest,
    gold: state.gold,
    lives: state.lives,
    maxLives: state.maxLives,
    speed: state.speed,
    paused: state.paused,
    buildCountdown: inBuild ? state.buildCountdown : null,
    earlySendBonus: inBuild ? earlySendBonus(state.buildCountdown) : 0,
    nextWave: nextWavePreview(state),
    nextWaveLanes: nextWaveLanes(state),
    hero: state.hero ? toHeroSnapshot(state.hero) : null,
    abilities: toAbilitySnapshots(state),
    towers: Object.freeze(state.towers.map(toTowerSnapshot)),
    enemies: Object.freeze(state.enemies.filter((e) => e.alive).map(toEnemySnapshot)),
    projectiles: Object.freeze(state.projectiles.map((p) => toProjectileSnapshot(p, state))),
    groundEffects: Object.freeze(state.groundEffects.map(toGroundEffectSnapshot)),
    stats: Object.freeze({ ...state.stats }),
    stars: state.phase === 'victory' ? state.stars : 0,
  });
}
