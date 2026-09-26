import { describe, expect, it } from 'vitest';
import { getMap, MAP_IDS, mapWaves, pathLength, pointAlongPath, validateMap, WAVES } from '../../src/data';

describe.each(MAP_IDS)('map %s', (id) => {
  const map = getMap(id);
  it('is well formed', () => {
    expect(validateMap(map)).toEqual([]);
  });
  it('every lane ends at the portal', () => {
    map.paths.forEach((_, lane) => {
      const end = pointAlongPath(map, pathLength(map, lane) + 5, lane).pos;
      expect(Math.floor(end.x)).toBe(map.portal.col);
      expect(Math.floor(end.y)).toBe(map.portal.row);
    });
  });
  it('has a 20-wave campaign', () => {
    expect(mapWaves(map).length).toBe(20);
  });
});

it('shared campaign has 20 waves', () => {
  expect(WAVES.length).toBe(20);
});
