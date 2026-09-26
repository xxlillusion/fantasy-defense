// Enemy traits that tick every step: healer auras and stealth reveal.
// Stream A1 owns this file. (Shield / split / vulnerable / execute live in damage.ts & effects.ts.)
import type { SimContext } from './state';

/**
 * TODO(A1):
 *  - heal: every def.traits.heal.interval s, heal OTHER alive enemies within radius by pct * maxHp
 *    (capped at maxHp); emit enemyHealed.
 *  - reveal: stealth enemies are revealed while within any tower's `detection` radius (Frost range,
 *    Sniper Seer) or HERO.detection of a hero that is not down; emit enemyRevealed on the false->true edge.
 */
export function updateTraits(_ctx: SimContext, _dt: number): void {}
