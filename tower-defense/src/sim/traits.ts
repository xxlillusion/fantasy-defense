// Enemy traits that tick every step: healer auras and stealth reveal.
// Stream A1 owns this file. (Shield / split / vulnerable / execute live in damage.ts & effects.ts.)
import { HERO, towerStats } from '../data';
import { distSq } from './targeting';
import { EPS, type EnemyState, type SimContext } from './state';

export function updateTraits(ctx: SimContext, dt: number): void {
  updateHealers(ctx, dt);
  updateReveal(ctx);
}

/**
 * Healers: every `interval` s, heal every OTHER alive enemy within `radius` by pct * its maxHp,
 * capped at maxHp. enemyHealed fires only for enemies that actually gained HP.
 */
function updateHealers(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const healer of state.enemies) {
    const heal = healer.def.traits?.heal;
    if (!heal || !healer.alive) continue;
    healer.healTimer -= dt;
    if (healer.healTimer > EPS) continue;
    healer.healTimer += heal.interval;
    if (healer.healTimer <= EPS) healer.healTimer = heal.interval; // never pulse twice in one step
    const r2 = (heal.radius + EPS) ** 2;
    for (const e of state.enemies) {
      if (e === healer || !e.alive || e.hp >= e.maxHp) continue;
      if (distSq(e.pos, healer.pos) > r2) continue;
      const amount = Math.min(e.maxHp - e.hp, heal.pct * e.maxHp);
      if (amount <= 0) continue;
      e.hp += amount;
      ctx.events.emit('enemyHealed', { enemyId: e.id, amount, pos: { ...e.pos }, sourceId: healer.id });
    }
  }
}

/**
 * Stealth: a stealth enemy is revealed while it is within any tower's detection radius or within
 * HERO.detection of a hero who is not down. enemyRevealed fires on the hidden -> revealed edge.
 * Non-stealth enemies are always revealed.
 */
function updateReveal(ctx: SimContext): void {
  const { state } = ctx;
  let detectors: { x: number; y: number; r2: number }[] | null = null;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (!e.stealth) {
      e.revealed = true;
      continue;
    }
    detectors ??= buildDetectors(ctx);
    const now = isDetected(e, detectors);
    if (now && !e.revealed) ctx.events.emit('enemyRevealed', { enemyId: e.id, pos: { ...e.pos } });
    e.revealed = now;
  }
}

function buildDetectors(ctx: SimContext): { x: number; y: number; r2: number }[] {
  const { state } = ctx;
  const out: { x: number; y: number; r2: number }[] = [];
  for (const t of state.towers) {
    const r = towerStats(t.kind, t.level, t.branch).detection;
    if (r && r > 0) out.push({ x: t.pos.x, y: t.pos.y, r2: (r + EPS) ** 2 });
  }
  const hero = state.hero;
  if (hero && hero.state !== 'down') out.push({ x: hero.pos.x, y: hero.pos.y, r2: (HERO.detection + EPS) ** 2 });
  return out;
}

function isDetected(e: EnemyState, detectors: readonly { x: number; y: number; r2: number }[]): boolean {
  for (const d of detectors) if (distSq(e.pos, d) <= d.r2) return true;
  return false;
}
