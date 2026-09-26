import { GRID_COLS, GRID_ROWS, inBounds } from '../../core/grid';
import type { TileCoord, Vec2 } from '../../core/types';
import type { MapDef, TileType } from './types';
import { WATERFALL_SHRINE } from './waterfallShrine';

export type { MapDef, TileType } from './types';

export const MAPS: Record<string, MapDef> = {
  [WATERFALL_SHRINE.id]: WATERFALL_SHRINE,
};

export const DEFAULT_MAP_ID = WATERFALL_SHRINE.id;

export function getMap(id: string = DEFAULT_MAP_ID): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map "${id}"`);
  return map;
}

const CHAR_TO_TILE: Record<string, TileType> = {
  '.': 'grass',
  '#': 'path',
  P: 'portal',
  S: 'statue',
  T: 'tree',
  R: 'rock',
};

export function tileType(map: MapDef, t: TileCoord): TileType | null {
  if (!inBounds(t)) return null;
  const ch = map.layout[t.row]?.[t.col];
  return (ch && CHAR_TO_TILE[ch]) || null;
}

export function isBuildable(map: MapDef, t: TileCoord): boolean {
  return tileType(map, t) === 'grass';
}

/** Total path length in tiles. */
export function pathLength(map: MapDef): number {
  let len = 0;
  for (let i = 1; i < map.waypoints.length; i++) {
    const a = map.waypoints[i - 1]!;
    const b = map.waypoints[i]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Position and heading at a distance along the path (clamped to the ends). */
export function pointAlongPath(map: MapDef, distance: number): { pos: Vec2; heading: number } {
  const wp = map.waypoints;
  let remaining = Math.max(0, distance);
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1]!;
    const b = wp[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    if (remaining <= seg || i === wp.length - 1) {
      const t = seg === 0 ? 1 : Math.min(1, remaining / seg);
      return { pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, heading };
    }
    remaining -= seg;
  }
  return { pos: { ...wp[0]! }, heading: 0 };
}

/** Sanity check used by tests: layout dimensions and waypoint tiles are path/portal. */
export function validateMap(map: MapDef): string[] {
  const errors: string[] = [];
  if (map.layout.length !== GRID_ROWS) errors.push(`expected ${GRID_ROWS} rows, got ${map.layout.length}`);
  map.layout.forEach((row, r) => {
    if (row.length !== GRID_COLS) errors.push(`row ${r}: expected ${GRID_COLS} cols, got ${row.length}`);
  });
  for (const p of map.waypoints) {
    const t = { col: Math.floor(p.x), row: Math.floor(p.y) };
    if (!inBounds(t)) continue; // spawn may be off-map
    const type = tileType(map, t);
    if (type !== 'path' && type !== 'portal') errors.push(`waypoint (${p.x},${p.y}) is on ${type}`);
  }
  return errors;
}
