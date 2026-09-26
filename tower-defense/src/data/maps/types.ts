import type { MapTheme, TileCoord, Vec2 } from '../../core/types';
import type { WaveDef } from '../waves';

export type TileType = 'grass' | 'path' | 'portal' | 'statue' | 'tree' | 'rock' | 'lava';

export interface MapDef {
  id: string;
  name: string;
  /** One-line flavour / tactical hint for map select. */
  description: string;
  /** Selects the environment art set. */
  theme: MapTheme;
  /** One string per row (GRID_ROWS rows of GRID_COLS chars). See legend in the map file. */
  layout: readonly string[];
  /**
   * Enemy routes (lanes) in tile units, spawn first, portal last. Every lane ends at `portal`.
   * Lanes may share tiles (e.g. merge before the portal).
   */
  paths: readonly (readonly Vec2[])[];
  /** Portal tile (base / path end). */
  portal: TileCoord;
  /** Top-left tile of each 1x2 (col, row..row+1) statue / set piece flanking the portal. */
  statues: readonly TileCoord[];
  /** Map-specific wave set; defaults to the shared WAVES. */
  waves?: readonly WaveDef[];
}
