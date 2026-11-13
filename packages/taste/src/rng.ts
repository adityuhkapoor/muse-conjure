// Mulberry32, seeded. Same generator as @muse/app's rng, kept local so this package has no runtime deps.
export type Rand = { next(): number; int(n: number): number; pick<T>(xs: readonly T[]): T; shuffle<T>(xs: readonly T[]): T[] };

export function rand(seed: number): Rand {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (xs) => xs[int(xs.length)]!,
    shuffle: (xs) => {
      const o = [...xs];
      for (let i = o.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [o[i], o[j]] = [o[j]!, o[i]!];
      }
      return o;
    },
  };
}

/** Stable 32-bit hash of a string, for seeding per item. */
export function hash(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x1000193);
  return x >>> 0;
}
