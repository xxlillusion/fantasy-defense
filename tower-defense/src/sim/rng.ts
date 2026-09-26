// Injectable random source. The simulation only ever draws randomness through an Rng so that
// runs are reproducible given a seeded generator (tests) while the game uses Math.random.

/** Returns a float in [0, 1). */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** Small, fast, seedable PRNG (mulberry32). */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
