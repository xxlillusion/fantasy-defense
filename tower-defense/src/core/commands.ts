// Player intents. FROZEN during parallel work — request changes, don't edit.
// Implemented by the simulation; called by the UI.

import type { Difficulty, EntityId, GameSpeed, TargetMode, TileCoord, TowerKind } from './types';

export type CommandResult = { ok: true } | { ok: false; reason: string };

export const OK: CommandResult = { ok: true };
export const fail = (reason: string): CommandResult => ({ ok: false, reason });

export interface GameCommands {
  /** Reset all state and begin a new game in the 'build' phase. */
  startGame(difficulty: Difficulty, mapId?: string): void;
  /** Abandon the current game and go back to the 'title' phase. */
  returnToTitle(): void;

  /** Pure query: would placeTower succeed? Used for the placement ghost. */
  canPlaceTower(kind: TowerKind, tile: TileCoord): CommandResult;
  placeTower(kind: TowerKind, tile: TileCoord): CommandResult;
  upgradeTower(id: EntityId): CommandResult;
  sellTower(id: EntityId): CommandResult;
  setTargetMode(id: EntityId, mode: TargetMode): CommandResult;

  /** Start the next wave now (only valid in 'build'). Grants the early-send bonus. */
  sendWave(): CommandResult;

  setSpeed(speed: GameSpeed): void;
  setPaused(paused: boolean): void;
}
