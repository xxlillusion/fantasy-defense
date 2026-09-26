// State and services shared between UI components (implemented in index.ts).
import type { CommandResult } from '../core/commands';
import type { UiContext, UiSound, UserSettings } from '../core/interfaces';
import type { EntityId, GameSnapshot, TowerKind } from '../core/types';

export type Overlay = 'none' | 'pause' | 'settings';
export type ToastKind = 'info' | 'error' | 'gold' | 'warn';

export interface UiState {
  placing: TowerKind | null;
  selected: EntityId | null;
  overlay: Overlay;
  /** Where the settings screen returns to. */
  settingsFrom: 'title' | 'pause';
  settings: UserSettings;
  /** Id of the tower whose Sell button is armed (second click/press sells). */
  sellArmed: EntityId | null;
}

export interface Ui {
  readonly ctx: UiContext;
  readonly state: UiState;
  snap(): GameSnapshot;
  sfx(sound: UiSound): void;
  toast(text: string, kind?: ToastKind): void;
  /** Run a command; if it fails and the sim didn't already emit commandRejected, show the reason. */
  run(cmd: () => CommandResult): CommandResult;
  startPlacing(kind: TowerKind): void;
  cancelPlacing(): void;
  select(id: EntityId | null): void;
  sendWave(): void;
  toggleSpeed(): void;
  togglePause(): void;
  openPause(): void;
  closeOverlay(): void;
  openSettings(from: 'title' | 'pause'): void;
  saveSettings(): void;
}

export const inGame = (s: GameSnapshot): boolean => s.phase === 'build' || s.phase === 'wave';
