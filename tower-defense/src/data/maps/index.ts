import { GRID_COLS, GRID_ROWS, inBounds } from '../../core/grid';
import type { TileCoord, Vec2 } from '../../core/types';
import { WAVES, type WaveDef } from '../waves';
import { EMBER_FORGE } from './emberForge';
import { MOONLIT_RUINS } from './moonlitRuins';
import type { MapDef, TileType } from './types';
import { WATERFALL_SHRINE } from './waterfallShrine';

export type { MapDef, TileType } from './types';

export const MAPS: Record<string, MapDef> = {
  [WATERFALL_SHRINE.id]: WATERFALL_SHRINE,
  [EMBER_FORGE.id]: EMBER_FORGE,
  [MOONLIT_RUINS.id]: MOONLIT_RUINS,
};

/** Map-select order. */
export const MAP_IDS: readonly string[] = [WATERFALL_SHRINE.id, EMBER_FORGE.id, MOONLIT_RUINS.id];

export const DEFAULT_MAP_ID = WATERFALL_SHRINE.id;

export function getMap(id: string = DEFAULT_MAP_ID): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map "${id}"`);
  return map;
}

/** The campaign wave list for a map. */
export function mapWaves(map: MapDef): readonly WaveDef[] {
  return map.waves ?? WAVES;
}

const CHAR_TO_TILE: Record<string, TileType> = {
  '.': 'grass',
  '#': 'path',
  P: 'portal',
  S: 'statue',
  T: 'tree',
  R: 'rock',
  L: 'lava',
};

export function tileType(map: MapDef, t: TileCoord): TileType | null {
  if (!inBounds(t)) return null;
  const ch = map.layout[t.row]?.[t.col];
  return (ch && CHAR_TO_TILE[ch]) || null;
}

export function isBuildable(map: MapDef, t: TileCoord): boolean {
  return tileType(map, t) === 'grass';
}

/** Tiles the hero may stand on / rally to. */
export function isWalkable(map: MapDef, t: TileCoord): boolean {
  const type = tileType(map, t);
  return type === 'grass' || type === 'path';
}

/** Path length in tiles of one lane. */
export function pathLength(map: MapDef, lane = 0): number {
  const wp = map.paths[lane] ?? map.paths[0]!;
  let len = 0;
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1]!;
    const b = wp[i]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Position and heading at a distance along a lane (clamped to the ends). */
export function pointAlongPath(map: MapDef, distance: number, lane = 0): { pos: Vec2; heading: number } {
  const wp = map.paths[lane] ?? map.paths[0]!;
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

/** Sanity check used by tests: layout dimensions, every lane on path tiles and ending at the portal. */
export function validateMap(map: MapDef): string[] {
  const errors: string[] = [];
  if (map.layout.length !== GRID_ROWS) errors.push(`expected ${GRID_ROWS} rows, got ${map.layout.length}`);
  map.layout.forEach((row, r) => {
    if (row.length !== GRID_COLS) errors.push(`row ${r}: expected ${GRID_COLS} cols, got ${row.length}`);
    for (const ch of row) if (!CHAR_TO_TILE[ch]) errors.push(`row ${r}: unknown tile char "${ch}"`);
  });
  if (!map.paths.length) errors.push('no paths');
  map.paths.forEach((wp, lane) => {
    // every tile crossed by each segment must be path/portal (spawn may start off-map)
    for (let i = 1; i < wp.length; i++) {
      const a = wp[i - 1]!;
      const b = wp[i]!;
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
      for (let k = 0; k <= steps; k++) {
        const x = a.x + ((b.x - a.x) * k) / steps;
        const y = a.y + ((b.y - a.y) * k) / steps;
        const t = { col: Math.floor(x), row: Math.floor(y) };
        if (!inBounds(t)) continue;
        const type = tileType(map, t);
        if (type !== 'path' && type !== 'portal') {
          errors.push(`lane ${lane}: segment ${i} crosses ${type} at (${t.col},${t.row})`);
          break;
        }
      }
    }
    const end = wp[wp.length - 1]!;
    if (Math.floor(end.x) !== map.portal.col || Math.floor(end.y) !== map.portal.row) {
      errors.push(`lane ${lane}: does not end at the portal`);
    }
  });
  if (mapWaves(map).length < 1) errors.push('no waves');
  return errors;
}
