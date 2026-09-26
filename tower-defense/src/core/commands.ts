// Player intents. FROZEN during parallel work — request changes, don't edit.
// Implemented by the simulation; called by the UI.

import type { AbilityId, EntityId, GameOptions, GameSpeed, TargetMode, TileCoord, TowerBranch, TowerKind, Vec2 } from './types';

export type CommandResult = { ok: true } | { ok: false; reason: string };

export const OK: CommandResult = { ok: true };
export const fail = (reason: string): CommandResult => ({ ok: false, reason });

export interface GameCommands {
  /** Reset all state and begin a new game in the 'build' phase. */
  startGame(options: GameOptions): void;
  /** Abandon the current game and go back to the 'title' phase. */
  returnToTitle(): void;

  /** Pure query: would placeTower succeed? Used for the placement ghost. */
  canPlaceTower(kind: TowerKind, tile: TileCoord): CommandResult;
  placeTower(kind: TowerKind, tile: TileCoord): CommandResult;
  /** L1→L2→L3 take no branch. L3→L4 requires a branch ('a' | 'b'). */
  upgradeTower(id: EntityId, branch?: TowerBranch): CommandResult;
  sellTower(id: EntityId): CommandResult;
  setTargetMode(id: EntityId, mode: TargetMode): CommandResult;

  /** Start the next wave now (only valid in 'build'). Grants the early-send bonus. */
  sendWave(): CommandResult;

  /** Pure query: can the hero rally to this ground point (tile units)? */
  canSetHeroRally(point: Vec2): CommandResult;
  /** Send the hero walking to a ground point (tile units). Allowed in build and wave, not while down. */
  setHeroRally(point: Vec2): CommandResult;

  /** Pure query. `target` is required for targeted abilities (Meteor). */
  canCastAbility(id: AbilityId, target?: Vec2): CommandResult;
  castAbility(id: AbilityId, target?: Vec2): CommandResult;

  setSpeed(speed: GameSpeed): void;
  setPaused(paused: boolean): void;
}
