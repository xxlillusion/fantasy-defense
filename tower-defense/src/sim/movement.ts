// Enemy movement along their lanes, and leaks into the portal.
// Stream A2 owns this file (v2: hero blocking, swift modifier).
import type { Vec2 } from '../core/types';
import type { MapDef } from '../data';
import { currentSlow, isStunned } from './effects';
import { speedMultiplier } from './modifiers';
import type { EnemyState, SimContext, SimState } from './state';

/** Current speed in tiles/s: 0 while stunned or blocked by the hero; slows and the swift modifier apply. */
export function enemySpeed(enemy: EnemyState, state?: SimState): number {
  if (isStunned(enemy) || enemy.blockedByHero) return 0;
  const mult = state ? speedMultiplier(state) : 1;
  return enemy.def.speed * mult * (1 - currentSlow(enemy));
}

interface LaneTable {
  points: readonly Vec2[];
  seg: number[];
  heading: number[];
}

const laneTables = new WeakMap<MapDef, LaneTable[]>();

function tablesFor(map: MapDef): LaneTable[] {
  let t = laneTables.get(map);
  if (!t) {
    t = map.paths.map((wp) => {
      const seg: number[] = [0];
      const heading: number[] = [0];
      for (let i = 1; i < wp.length; i++) {
        const a = wp[i - 1]!;
        const b = wp[i]!;
        seg.push(Math.hypot(b.x - a.x, b.y - a.y));
        heading.push(Math.atan2(b.y - a.y, b.x - a.x));
      }
      return { points: wp, seg, heading };
    });
    laneTables.set(map, t);
  }
  return t;
}

/**
 * Same result as data's pointAlongPath (identical arithmetic), with segment lengths and headings cached
 * per map: this runs for every enemy every step.
 */
export function lanePoint(map: MapDef, distance: number, lane: number): { pos: Vec2; heading: number } {
  const tables = tablesFor(map);
  const { points: wp, seg, heading } = tables[lane] ?? tables[0]!;
  let remaining = Math.max(0, distance);
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1]!;
    const b = wp[i]!;
    const len = seg[i]!;
    if (remaining <= len || i === wp.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, remaining / len);
      return { pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, heading: heading[i]! };
    }
    remaining -= len;
  }
  return { pos: { ...wp[0]! }, heading: 0 };
}

export function moveEnemies(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const speed = enemySpeed(e, state);
    if (speed <= 0) continue;
    e.progress += speed * dt;
    const len = state.pathLengths[e.lane]!;
    e.remaining = Math.max(0, len - e.progress);
    if (e.progress >= len) {
      leakEnemy(ctx, e);
      continue;
    }
    const p = lanePoint(state.map, e.progress, e.lane);
    e.pos = p.pos;
    e.heading = p.heading;
  }
}

function leakEnemy(ctx: SimContext, e: EnemyState): void {
  const { state } = ctx;
  e.alive = false;
  e.progress = state.pathLengths[e.lane]!;
  e.remaining = 0;
  const lost = e.def.livesCost;
  state.lives = Math.max(0, state.lives - lost);
  state.stats.leaks++;
  ctx.events.emit('enemyLeaked', { enemyId: e.id, kind: e.kind, livesLost: lost });
}
