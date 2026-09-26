import type { TileCoord, Vec2 } from '../../core/types';

export type TileType = 'grass' | 'path' | 'portal' | 'statue' | 'tree' | 'rock';

export interface MapDef {
  id: string;
  name: string;
  /** One string per row (GRID_ROWS rows of GRID_COLS chars). See legend in the map file. */
  layout: readonly string[];
  /** Enemy route in tile units, spawn first, portal last. */
  waypoints: readonly Vec2[];
  /** Portal tile (base / path end). */
  portal: TileCoord;
  /** Top-left tile of each 1x2 (col, row..row+1) guardian statue. */
  statues: readonly TileCoord[];
}
