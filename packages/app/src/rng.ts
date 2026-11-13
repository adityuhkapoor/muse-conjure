import type { Rng } from "./types.ts";

/**
 * Seeded generator: Mulberry32 (Tommy Ettinger, public domain), 32-bit state.
 * Uses only uint32 integer ops (`Math.imul`, `>>>`, `^`, `|`) and one exact division by 2^32,
 * so every engine (V8, JavaScriptCore, SpiderMonkey) yields the same sequence for the same seed.
 *   a += 0x6D2B79F5; t = imul(a ^ a>>>15, a | 1); t ^= t + imul(t ^ t>>>7, t | 61); out = (t ^ t>>>14) >>> 0
 * next() = out / 2^32. int(n) = floor(next() * n). shuffle = Fisher-Yates from the end.
 */
export function rng(seed: number): Rng {
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
    pick: (items) => items[int(items.length)]!,
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
