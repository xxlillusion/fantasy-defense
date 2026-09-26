// Grid <-> world mapping. FROZEN during parallel work — request changes, don't edit.
//
// World space (Three.js): 1 tile = 1 world unit, Y is up, the map lies on the Y=0 plane,
// centered on the origin. Gameplay x -> world +X, gameplay y (rows, toward camera) -> world +Z.
// The camera sits at +Z looking toward -Z, so row 0 is the far (back) edge.

import type { TileCoord, Vec2 } from './types';

export const GRID_COLS = 20;
export const GRID_ROWS = 12;
export const TILE_SIZE = 1;

/** Fixed simulation step in seconds (60 Hz). */
export const SIM_DT = 1 / 60;

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** Tile-unit gameplay position -> world point on the ground plane (y = height). */
export function toWorld(p: Vec2, height = 0): WorldPoint {
  return { x: (p.x - GRID_COLS / 2) * TILE_SIZE, y: height, z: (p.y - GRID_ROWS / 2) * TILE_SIZE };
}

/** World X/Z on the ground plane -> tile-unit gameplay position. */
export function fromWorld(x: number, z: number): Vec2 {
  return { x: x / TILE_SIZE + GRID_COLS / 2, y: z / TILE_SIZE + GRID_ROWS / 2 };
}

export function tileCenter(t: TileCoord): Vec2 {
  return { x: t.col + 0.5, y: t.row + 0.5 };
}

/** Tile containing a tile-unit position (may be out of bounds). */
export function tileAt(p: Vec2): TileCoord {
  return { col: Math.floor(p.x), row: Math.floor(p.y) };
}

export function inBounds(t: TileCoord): boolean {
  return t.col >= 0 && t.col < GRID_COLS && t.row >= 0 && t.row < GRID_ROWS;
}

export function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
