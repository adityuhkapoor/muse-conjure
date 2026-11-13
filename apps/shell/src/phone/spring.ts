/**
 * A damped spring from 0 to 1 (position as a fraction of the way), the same model as a UIKit or Framer-style spring:
 * stiffness k, damping c, mass m, optional initial velocity v0 (fractions per second). Used by scripts/spring.ts to
 * generate the CSS easings in the tokens, and live by the swipe-back release so a flick carries its speed.
 */
export type Spring = { k: number; c: number; m: number };

export function springAt({ k, c, m }: Spring, t: number, v0 = 0): number {
  const w = Math.sqrt(k / m);
  const z = c / (2 * Math.sqrt(k * m));
  // x(t) is the displacement from rest (1 - position); start displaced by 1 with velocity -v0.
  let x: number;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    x = Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w - v0) / wd) * Math.sin(wd * t));
  } else if (z === 1) {
    x = Math.exp(-w * t) * (1 + (w - v0) * t);
  } else {
    const r = w * Math.sqrt(z * z - 1);
    const s1 = -z * w + r;
    const s2 = -z * w - r;
    const a = (-v0 - s2) / (s1 - s2); // x(0) = 1, x'(0) = -v0
    x = a * Math.exp(s1 * t) + (1 - a) * Math.exp(s2 * t);
  }
  return 1 - x;
}

/** Seconds until the spring stays within 0.2 percent of rest. */
export function settleTime(s: Spring): number {
  let last = 0;
  for (let t = 0; t < 3; t += 0.005) if (Math.abs(1 - springAt(s, t)) > 0.002) last = t;
  return last + 0.005;
}

/** The pop spring (the swipe-back release). */
export const PUSH_SPRING: Spring = { k: 350, c: 37.4, m: 1 };
