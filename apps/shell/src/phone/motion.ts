/** Motion values from the tokens, for the few places that move things from script (swipe-back release). */
import { PUSH_SPRING, type Spring } from "./spring";

const num = (name: string, fallback: number) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

export const springFromTokens = (): Spring => ({ k: num("--m-pop-k", PUSH_SPRING.k), c: num("--m-pop-c", PUSH_SPRING.c), m: num("--m-pop-m", PUSH_SPRING.m) });
export const commit = () => ({ dist: num("--m-commit-dist", 0.35), vel: num("--m-commit-vel", 500) });

/** A duration token in ms. The browser may hand back ".2s" or "200ms" for the same value. */
export function tokenMs(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}
