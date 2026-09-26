// Global abilities (Meteor, Frost Nova, Gold Rush) and the hero's Blade Storm trigger.
// Stream A2 owns this file.
import { fail, type CommandResult } from '../core/commands';
import type { AbilityId, Vec2 } from '../core/types';
import type { SimContext } from './state';

/** TODO(A2): unlock by wave, cooldown, target validity (Meteor needs a point), hero state for Blade Storm. */
export function checkCast(_ctx: SimContext, _id: AbilityId, _target?: Vec2): CommandResult {
  return fail('Not available yet');
}

/** TODO(A2): apply the ability (meteorWarning ground effect, Frost Nova slows, Gold Rush multiplier, storm). */
export function cast(_ctx: SimContext, _id: AbilityId, _target?: Vec2): void {}

/** TODO(A2): cooldowns, active timers (Gold Rush -> state.bountyMultiplier), meteorWarning -> impact. */
export function updateAbilities(_ctx: SimContext, _dt: number): void {}
