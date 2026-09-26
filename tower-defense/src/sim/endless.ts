// Endless mode: deterministic procedural waves past the campaign.
// Stream A2 owns this file.
//
// A wave is a pure function of (map id, wave number): it never touches ctx.rng, so the preview, the
// spawn queue and every replay agree. Outline:
//  - k = wave - campaignWaves (1 for the first endless wave).
//  - Point budget = endlessBudgetBase * endlessBudgetGrowth^k, spent on 3..6 groups.
//  - Point cost of an enemy ~ its bounty (plus its split children) / COST_DIVISOR, so 120 points is about
//    as much as a late campaign wave.
//  - The pool widens with k: the v1 basics first, then Shield Orcs, Broodmothers, Wraiths. Shamans come
//    as a small support group (healers stack badly, so they are not bought in bulk) from k = 4.
//  - Group sizes are capped (perf); once a cheap kind would overflow a group, pricier kinds are bought.
//  - Every endlessBossEvery waves a boss group joins: golem and dragon alternate, count 1 + floor(k/10).
//  - Groups are staggered a few seconds apart and last at most ~GROUP_SPAN seconds; lanes alternate.
import type { EnemyKind } from '../core/types';
import { ENEMIES, mapWaves, RULES, type WaveDef, type WaveGroup } from '../data';
import { createSeededRng, type Rng } from './rng';
import type { SimState } from './state';

/** Budget points per bounty gold. */
const COST_DIVISOR = 3;
/** Max enemies per regular group (keeps late waves bounded for performance and readability). */
const MAX_GROUP = 45;
/** Shaman support group: from this k, on roughly this share of waves. */
const SHAMAN_FROM_K = 4;
const SHAMAN_CHANCE = 0.6;
const SHAMAN_MAX = 6;
/** Upper bound on how long one group keeps spawning (seconds). */
const GROUP_SPAN = 18;

interface PoolEntry {
  kind: EnemyKind;
  /** First endless wave offset (k) at which this kind can appear. */
  fromK: number;
  weight: number;
  /** Preferred spawn interval (seconds) before compression. */
  interval: number;
}

const POOL: readonly PoolEntry[] = [
  { kind: 'grunt', fromK: 1, weight: 3, interval: 0.7 },
  { kind: 'runner', fromK: 1, weight: 3, interval: 0.4 },
  { kind: 'swarmling', fromK: 1, weight: 2, interval: 0.2 },
  { kind: 'brute', fromK: 1, weight: 3, interval: 1.3 },
  { kind: 'flyer', fromK: 1, weight: 2.5, interval: 0.6 },
  { kind: 'shieldbearer', fromK: 2, weight: 2, interval: 0.9 },
  { kind: 'broodmother', fromK: 6, weight: 1.5, interval: 1.4 },
  { kind: 'wraith', fromK: 8, weight: 1.5, interval: 0.8 },
];

/** Budget points for one enemy of a kind (bounty-based; split children included). */
export function endlessPointCost(kind: EnemyKind): number {
  const def = ENEMIES[kind];
  const split = def.traits?.split;
  const bounty = def.bounty + (split ? ENEMIES[split.kind].bounty * split.count : 0);
  return bounty / COST_DIVISOR;
}

/** Point budget of a wave (k = waves past the campaign). */
export function endlessBudget(wave: number, campaignWaves: number): number {
  return RULES.endlessBudgetBase * Math.pow(RULES.endlessBudgetGrowth, wave - campaignWaves);
}

/** Boss kind and count for a wave, or null if it is not a boss wave. */
export function endlessBosses(wave: number, campaignWaves: number): { kind: EnemyKind; count: number } | null {
  const k = wave - campaignWaves;
  if (k <= 0 || k % RULES.endlessBossEvery !== 0) return null;
  const n = k / RULES.endlessBossEvery; // 1, 2, 3...
  return { kind: n % 2 === 1 ? 'boss' : 'dragon', count: 1 + Math.floor(k / 10) };
}

/** FNV-1a string hash. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function waveRng(mapId: string, wave: number): Rng {
  const seed = (hashString(mapId) ^ Math.imul(wave + 1, 0x9e3779b1)) >>> 0;
  return createSeededRng(seed);
}

function pickWeighted<T extends { weight: number }>(rng: Rng, items: readonly T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return items[items.length - 1]!;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

const cache = new Map<string, WaveDef>();

/** Drop memoized waves (tests use it to prove generation itself is deterministic). */
export function clearEndlessCache(): void {
  cache.clear();
}

/** Deterministic endless wave for (map, wave). Waves inside the campaign are not handled here. */
export function generateEndlessWave(state: SimState, wave: number): WaveDef {
  const campaign = mapWaves(state.map).length;
  const lanes = state.map.paths.length;
  const key = `${state.map.id}|${lanes}|${campaign}|${wave}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rng = waveRng(state.map.id, wave);
  const k = Math.max(1, wave - campaign);
  const pool = POOL.filter((p) => k >= p.fromK);
  let budget = endlessBudget(Math.max(wave, campaign + 1), campaign);

  // Shaman support group (paid from the budget first).
  let shamans: WaveGroup | null = null;
  if (k >= SHAMAN_FROM_K && rng() < SHAMAN_CHANCE) {
    const count = Math.min(SHAMAN_MAX, 1 + Math.floor(k / 5));
    budget = Math.max(budget * 0.5, budget - count * endlessPointCost('shaman'));
    shamans = { enemy: 'shaman', count, interval: 2.5, delay: round2(3 + rng() * 5) };
  }

  const groupCount = Math.min(6, 3 + Math.floor(k / 6) + (rng() < 0.5 ? 1 : 0));

  // Split the budget into weighted shares.
  const shares = Array.from({ length: groupCount }, () => 0.6 + rng());
  const shareSum = shares.reduce((a, b) => a + b, 0);

  const groups: WaveGroup[] = [];
  let delay = 0;
  let laneCursor = Math.floor(rng() * lanes);
  const used = new Set<EnemyKind>();
  for (let i = 0; i < groupCount; i++) {
    const points = (budget * shares[i]!) / shareSum;
    // Prefer kinds not used yet in this wave, and kinds that fit in one group.
    const fits = (p: PoolEntry): boolean => points / endlessPointCost(p.kind) <= MAX_GROUP;
    let candidates = pool.filter((p) => !used.has(p.kind) && fits(p));
    if (!candidates.length) candidates = pool.filter(fits);
    if (!candidates.length) {
      // Budget outgrew every group: take the priciest kinds (count will be capped).
      const maxCost = Math.max(...pool.map((p) => endlessPointCost(p.kind)));
      candidates = pool.filter((p) => endlessPointCost(p.kind) >= maxCost * 0.55 && !used.has(p.kind));
      if (!candidates.length) candidates = pool.filter((p) => endlessPointCost(p.kind) >= maxCost * 0.55);
    }
    const entry = pickWeighted(rng, candidates);
    used.add(entry.kind);
    const count = Math.max(1, Math.min(MAX_GROUP, Math.round(points / endlessPointCost(entry.kind))));
    const interval = count > 1 ? round2(Math.max(0.1, Math.min(entry.interval, GROUP_SPAN / (count - 1)))) : 1;
    const group: WaveGroup = { enemy: entry.kind, count, interval, delay: round2(delay) };
    if (lanes > 1) {
      // Mostly alternate; sometimes pin a group to one lane to force a split defence.
      if (rng() < 0.35) group.lane = laneCursor++ % lanes;
      else group.lane = 'alternate';
    }
    groups.push(group);
    delay += 2 + rng() * 3;
  }

  if (shamans) {
    if (lanes > 1) shamans.lane = 'alternate';
    groups.push(shamans);
  }

  const bosses = endlessBosses(wave, campaign);
  if (bosses) {
    const group: WaveGroup = { enemy: bosses.kind, count: bosses.count, interval: 4, delay: round2(3 + rng() * 4) };
    if (lanes > 1) group.lane = 'alternate';
    groups.push(group);
  }

  const def: WaveDef = Object.freeze(groups.map((g) => Object.freeze(g))) as WaveDef;
  if (cache.size > 512) cache.clear();
  cache.set(key, def);
  return def;
}
