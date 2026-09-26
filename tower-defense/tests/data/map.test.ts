import { describe, expect, it } from 'vitest';
import { getMap, pathLength, pointAlongPath, validateMap, WAVES } from '../../src/data';

describe('waterfall shrine map', () => {
  const map = getMap();
  it('is well formed', () => {
    expect(validateMap(map)).toEqual([]);
  });
  it('path ends at the portal', () => {
    const end = pointAlongPath(map, pathLength(map) + 5).pos;
    expect(Math.floor(end.x)).toBe(map.portal.col);
    expect(Math.floor(end.y)).toBe(map.portal.row);
  });
  it('has 20 waves', () => {
    expect(WAVES.length).toBe(20);
  });
});
