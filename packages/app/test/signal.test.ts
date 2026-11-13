import { expect, test } from "bun:test";
import { computed, effect, signal } from "../src/index.ts";
import { batch, untrack } from "../src/internal.ts";

test("effect runs at once and on change, not on equal writes", () => {
  const a = signal(1);
  const seen: number[] = [];
  effect(() => void seen.push(a.value));
  a.value = 2;
  a.value = 2;
  a.value = 3;
  expect(seen).toEqual([1, 2, 3]);
});

test("computed is lazy, cached and glitch-free", () => {
  const a = signal(1);
  let runs = 0;
  const b = computed(() => (runs++, a.value * 2));
  const c = computed(() => a.value + b.value);
  expect(runs).toBe(0);
  const seen: number[] = [];
  effect(() => void seen.push(c.value));
  expect(runs).toBe(1);
  a.value = 2;
  expect(seen).toEqual([3, 6]); // never 2+2 or 1+4
  expect(c.value).toBe(6);
  expect(runs).toBe(2);
});

test("an effect behind an unchanged computed does not re-run", () => {
  const a = signal(1);
  const even = computed(() => a.value % 2 === 0);
  let runs = 0;
  effect(() => void (even.value, runs++));
  a.value = 3;
  a.value = 5;
  expect(runs).toBe(1);
  a.value = 4;
  expect(runs).toBe(2);
});

test("dependencies are re-tracked each run", () => {
  const flag = signal(true), x = signal("x"), y = signal("y");
  const seen: string[] = [];
  effect(() => void seen.push(flag.value ? x.value : y.value));
  y.value = "y2"; // not a dependency yet
  flag.value = false;
  x.value = "x2"; // no longer a dependency
  y.value = "y3";
  expect(seen).toEqual(["x", "y2", "y3"]);
});

test("batch coalesces writes; cleanup and dispose", () => {
  const a = signal(1), b = signal(1);
  const seen: number[] = [];
  let cleanups = 0;
  const stop = effect(() => {
    seen.push(a.value + b.value);
    return () => void cleanups++;
  });
  batch(() => {
    a.value = 10;
    b.value = 20;
  });
  expect(seen).toEqual([2, 30]);
  expect(cleanups).toBe(1);
  stop();
  expect(cleanups).toBe(2);
  a.value = 0;
  expect(seen).toEqual([2, 30]);
});

test("untrack and peek do not subscribe", () => {
  const a = signal(1), b = signal(1);
  let runs = 0;
  effect(() => void (runs++, a.value, untrack(() => b.value), b.peek()));
  b.value = 2;
  expect(runs).toBe(1);
});

test("a runaway effect is stopped", () => {
  const a = signal(0);
  expect(() => effect(() => void (a.value = a.value + 1))).toThrow(/did not settle/);
});
