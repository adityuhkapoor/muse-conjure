// Seeded randomness. Every choice the cast makes draws from a stream named by what it is for
// ("maya:reply:m-12"), so one seed gives one run, and adding a new kind of choice does not shift
// the others.

export type Rand = {
  next(): number;
  int(n: number): number;
  range(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
};

export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry(seed: number): Rand {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => (n >= 1 ? Math.floor(next() * Math.floor(n)) : 0);
  return {
    next,
    int,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: <T>(items: readonly T[]) => items[int(items.length)]!,
    chance: (p) => next() < p,
  };
}

/** A stream for one purpose under one seed. */
export const stream = (seed: number, name: string): Rand => mulberry(hash32(`${seed >>> 0}:${name}`));

/** Right-skewed delay between lo and hi (most land near the low end, a few take longer). */
export function skewed(r: Rand, lo: number, hi: number): number {
  const u = r.next();
  return lo + (hi - lo) * u * u * (0.6 + 0.4 * r.next());
}
