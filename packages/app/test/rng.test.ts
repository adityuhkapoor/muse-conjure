import { expect, test } from "bun:test";
import { rng } from "../src/index.ts";

// Reference Mulberry32 in BigInt arithmetic: independent of Math.imul and float behavior.
function reference(seed: number, n: number): number[] {
  const M = 0xffffffffn;
  const imul = (a: bigint, b: bigint) => (a * b) & M;
  let a = BigInt(seed >>> 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5n) & M;
    let t = imul(a ^ (a >> 15n), a | 1n);
    t = (t ^ ((t + imul(t ^ (t >> 7n), t | 61n)) & M)) & M;
    out.push(Number((t ^ (t >> 14n)) & M));
  }
  return out;
}

// Golden values. The same numbers are checked in V8 by the sandbox bridge test; bun runs JavaScriptCore.
export const GOLDEN: Record<number, number[]> = {
  0: [1144304738, 1416247, 958946056, 627933444, 2007157716],
  1: [2693262067, 11749833, 2265367787, 4213581821, 4159151403],
  42: [2581720956, 1925393290, 3661312704, 2876485805, 750819978],
  4294967295: [3850105811, 813802916, 3073704848, 4054706436, 3630262831],
};

test("matches the reference algorithm", () => {
  for (const seed of [0, 1, 42, 4294967295, 123456789, 2 ** 31]) {
    const r = rng(seed);
    const got = Array.from({ length: 50 }, () => r.next() * 4294967296);
    expect(got).toEqual(reference(seed, 50));
  }
});

test("golden values", () => {
  for (const [seed, want] of Object.entries(GOLDEN)) {
    const r = rng(Number(seed));
    expect(want.map(() => r.next() * 4294967296)).toEqual(want);
  }
});

test("int, pick and shuffle", () => {
  const r = rng(7);
  for (let i = 0; i < 1000; i++) {
    const n = r.int(6);
    expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
  }
  expect(r.int(0)).toBe(0);
  expect(rng(9).pick(["a", "b", "c"])).toBe(rng(9).pick(["a", "b", "c"]));
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const s = rng(3).shuffle(items);
  expect([...s].sort()).toEqual(items);
  expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(rng(3).shuffle(items)).toEqual(s);
});
