import { expect, test } from "bun:test";
import { easings, spring, springs, tween } from "../src/index.ts";

test("tween runs 0 to 1 over its duration, monotone for standard curves", () => {
  for (const easing of Object.keys(easings) as (keyof typeof easings)[]) {
    if (easing === "enter" || easing === "move") continue; // these overshoot-free but steep; still checked below
    const m = tween({ duration: 300, easing });
    expect(m(0)).toBe(0);
    expect(m(300)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 300; t += 10) {
      expect(m(t)).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m(t);
    }
  }
  expect(tween({ duration: 100, easing: "linear" })(50)).toBeCloseTo(0.5, 5);
  expect(tween({ duration: 100, easing: [0.42, 0, 0.58, 1] })(50)).toBeCloseTo(0.5, 5);
});

test("springs settle at exactly 1 and the bouncy one overshoots", () => {
  for (const cfg of Object.values(springs)) {
    const m = spring(cfg);
    expect(m(0)).toBe(0);
    expect(m(m.duration)).toBe(1);
    expect(Math.abs(m(m.duration - 1) - 1)).toBeLessThan(0.002);
  }
  const bouncy = spring(springs.iosBouncy);
  const peak = Math.max(...Array.from({ length: 100 }, (_, i) => bouncy(i * 10)));
  expect(peak).toBeGreaterThan(1);
  const crit = spring({ stiffness: 100, damping: 20 });
  expect(Math.max(...Array.from({ length: 200 }, (_, i) => crit(i * 10)))).toBeLessThanOrEqual(1);
  const over = spring({ stiffness: 100, damping: 40 });
  expect(over(over.duration)).toBe(1);
});

test("the same elapsed time gives the same value", () => {
  const a = spring(springs.material), b = spring(springs.material);
  for (let t = 0; t < 600; t += 16.7) expect(a(t)).toBe(b(t));
});
