// Motion as pure functions of elapsed time. The host supplies the clock (`clock` signal, `tick`
// messages), so the same elapsed time always gives the same value: deterministic under test,
// and nothing here schedules timers.

/** Progress for an elapsed time in ms: 0 at the start, settles at exactly 1 after `duration` ms. */
export type Motion = ((elapsed: number) => number) & { readonly duration: number };
export type Bezier = readonly [number, number, number, number];

/**
 * Named cubic-bezier curves.
 * - standard: Material 3 standard (0.2, 0, 0, 1)
 * - decelerate: Material 3 emphasized decelerate (0.05, 0.7, 0.1, 1). Good for a wheel coming to rest.
 * - accelerate: Material 3 emphasized accelerate (0.3, 0, 0.8, 0.15)
 * - enter: Facebook FDS enter-exit-in (0.14, 1, 0.34, 1)
 * - move: Facebook FDS quick-move (0.1, 0.9, 0.2, 1)
 * - easeInOut: Core Animation default ease-in-ease-out (0.42, 0, 0.58, 1)
 * - linear
 */
export const easings = {
  standard: [0.2, 0, 0, 1],
  decelerate: [0.05, 0.7, 0.1, 1],
  accelerate: [0.3, 0, 0.8, 0.15],
  enter: [0.14, 1, 0.34, 1],
  move: [0.1, 0.9, 0.2, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

function bezier([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const f = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  return (x) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      const e = f(x1, x2, t) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return f(y1, y2, t);
  };
}

/** Time-based curve. `easing` is a name from `easings` or a cubic-bezier tuple. */
export function tween(o: { duration: number; easing?: keyof typeof easings | Bezier }): Motion {
  const e = bezier(typeof o.easing === "object" ? o.easing : easings[o.easing ?? "standard"]);
  const d = Math.max(0, o.duration);
  return Object.assign((t: number) => (t <= 0 ? 0 : t >= d ? 1 : e(t / d)), { duration: d });
}

/**
 * Damped spring from 0 to 1, solved in closed form (no integration, so no frame-rate drift).
 * stiffness k (N/m), damping c (N·s/m), mass m (kg), initial velocity in units per second.
 * Settles (returns exactly 1) once the envelope is under 0.001.
 */
export function spring(o: { stiffness: number; damping: number; mass?: number; velocity?: number }): Motion {
  const m = o.mass ?? 1, k = o.stiffness, v0 = o.velocity ?? 0;
  const w0 = Math.sqrt(k / m), z = o.damping / (2 * Math.sqrt(k * m));
  let y: (t: number) => number, decay: number;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z), b = (v0 - z * w0) / wd;
    y = (t) => Math.exp(-z * w0 * t) * (-Math.cos(wd * t) + b * Math.sin(wd * t));
    decay = z * w0;
  } else if (z === 1) {
    y = (t) => (-1 + (v0 - w0) * t) * Math.exp(-w0 * t);
    decay = w0 * 0.8;
  } else {
    const s = Math.sqrt(z * z - 1), r1 = -w0 * (z - s), r2 = -w0 * (z + s), c2 = (v0 + r1) / (r2 - r1);
    y = (t) => (-1 - c2) * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    decay = -r1;
  }
  const d = (Math.log(1000) / decay) * 1000;
  return Object.assign((ms: number) => (ms <= 0 ? 0 : ms >= d ? 1 : 1 + y(ms / 1000)), { duration: d });
}

/**
 * Platform spring presets (mass 1).
 * - ios: SwiftUI `.spring()` default, response 0.5 s, damping fraction 0.825
 *        -> stiffness (2π/0.5)² = 157.91, damping 4π·0.825/0.5 = 20.73
 * - iosBouncy: SwiftUI `.bouncy` (duration 0.5, bounce 0.3 -> damping fraction 0.7)
 *        -> stiffness 157.91, damping 17.59
 * - material: Material 3 standard default spatial spring, damping ratio 0.9, stiffness 700
 *        -> damping 2·0.9·√700 = 47.62
 * - materialFast: Material 3 standard fast spatial, ratio 0.9, stiffness 1400 -> damping 67.35
 */
export const springs = {
  ios: { stiffness: 157.91, damping: 20.73 },
  iosBouncy: { stiffness: 157.91, damping: 17.59 },
  material: { stiffness: 700, damping: 47.62 },
  materialFast: { stiffness: 1400, damping: 67.35 },
} as const;
