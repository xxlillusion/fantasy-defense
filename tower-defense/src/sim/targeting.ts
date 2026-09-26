// Target validity, targeting modes and chain-lightning target selection.
// Stream A1 owns this file (v2: stealth, cross-lane targeting by `remaining`).
import type { TargetMode, Vec2 } from '../core/types';
import type { TowerDef } from '../data';
import { EPS, type EnemyState } from './state';

export interface HitMask {
  hitsAir: boolean;
  hitsGround: boolean;
}

/** Alive, matches the air/ground mask, and ignoring stealth (burning ground, forced hits). */
export function canTouch(mask: HitMask, enemy: EnemyState): boolean {
  return enemy.alive && (enemy.def.flying ? mask.hitsAir : mask.hitsGround);
}

/** A valid target: alive, matches the mask, and visible (stealthed enemies must be revealed). */
export function canHit(mask: HitMask, enemy: EnemyState): boolean {
  return enemy.revealed && canTouch(mask, enemy);
}

/** Squared distance (avoids Math.hypot in hot loops). */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Valid enemies within `range` of `center`. Unrevealed stealth enemies are skipped unless
 * `includeHidden` is set (burning ground hurts everything standing in it).
 */
export function enemiesInRange(
  enemies: readonly EnemyState[],
  mask: HitMask | TowerDef,
  center: Vec2,
  range: number,
  includeHidden = false,
): EnemyState[] {
  const r = range + EPS;
  const r2 = r * r;
  const test = includeHidden ? canTouch : canHit;
  const out: EnemyState[] = [];
  for (const e of enemies) if (test(mask, e) && distSq(e.pos, center) <= r2) out.push(e);
  return out;
}

/**
 * Comparator for a targeting mode (negative = a is the better target).
 * Lanes differ in length, so "first"/"last" compare `remaining` (distance to the portal), not progress.
 * Ties: closest to the portal (smallest remaining), then lowest id.
 */
export function modeComparator(mode: TargetMode, from: Vec2): (a: EnemyState, b: EnemyState) => number {
  const tie = (a: EnemyState, b: EnemyState) => a.remaining - b.remaining || a.id - b.id;
  switch (mode) {
    case 'first':
      return tie;
    case 'last':
      return (a, b) => b.remaining - a.remaining || a.id - b.id;
    case 'strongest':
      return (a, b) => b.hp - a.hp || tie(a, b);
    case 'closest':
      return (a, b) => distSq(a.pos, from) - distSq(b.pos, from) || tie(a, b);
  }
}

/** Sort candidates best-first for a targeting mode. */
export function sortByMode(candidates: readonly EnemyState[], mode: TargetMode, from: Vec2): EnemyState[] {
  return [...candidates].sort(modeComparator(mode, from));
}

/** The single best candidate for a targeting mode (linear scan), or undefined. */
export function bestByMode(candidates: readonly EnemyState[], mode: TargetMode, from: Vec2): EnemyState | undefined {
  const cmp = modeComparator(mode, from);
  let best: EnemyState | undefined;
  for (const e of candidates) if (!best || cmp(e, best) < 0) best = e;
  return best;
}

/**
 * Chain lightning: starting at `first`, each jump goes to the nearest not-yet-hit valid enemy
 * within `jumpRange` of the previous one. Returns up to `count` enemies in hit order.
 */
export function buildChain(
  enemies: readonly EnemyState[],
  mask: HitMask,
  first: EnemyState,
  count: number,
  jumpRange: number,
): EnemyState[] {
  const chain = [first];
  const hit = new Set([first.id]);
  let prev = first;
  while (chain.length < count) {
    let best: EnemyState | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (hit.has(e.id) || !canHit(mask, e)) continue;
      const d = Math.sqrt(distSq(e.pos, prev.pos));
      if (d <= jumpRange + EPS && (d < bestD || (d === bestD && best !== null && e.id < best.id))) {
        best = e;
        bestD = d;
      }
    }
    if (!best) break;
    chain.push(best);
    hit.add(best.id);
    prev = best;
  }
  return chain;
}

/** Distance from point p to the segment a-b, and the segment parameter t (0..1) of the closest point. */
export function pointSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return { dist: Math.hypot(p.x - cx, p.y - cy), t };
}
