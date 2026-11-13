// Motion clips: one small transition (a card arriving, a vote bar filling, a wheel settling, a row
// being claimed) under different curves. Curves come from @muse/app's motion presets and from the
// measured platform presets in the design notes (values copied here with their
// sources; no Python at run time). The app renders each clip live with @muse/app's tween/spring.

import type { Feats } from "../features.ts";
import { rand } from "../rng.ts";

export type Curve =
  | { kind: "bezier"; p: [number, number, number, number]; duration: number }
  | { kind: "spring"; stiffness: number; damping: number; mass: number };
export type Transition = "card" | "bar" | "wheel" | "row";
export const TRANSITIONS: Transition[] = ["card", "bar", "wheel", "row"];
export type MotionItem = { id: string; kind: "motion"; group: string; transition: Transition; preset: string; platform: Platform; curve: Curve; x: Feats };
type Platform = "meta" | "ios" | "material" | "android" | "rn" | "css";

type Preset = { name: string; platform: Platform; src: string } & ({ kind: "bezier"; p: [number, number, number, number] } | { kind: "spring"; k: number; c: number; m?: number });

const sw = (response: number, zeta: number) => ({ k: (2 * Math.PI / response) ** 2, c: (4 * Math.PI * zeta) / response });
const z = (k: number, zeta: number, m = 1) => ({ k, c: 2 * zeta * Math.sqrt(k * m) });
function pop(bounciness: number, speed: number) {
  const n = (v: number, a: number, b: number) => (v - a) / (b - a);
  const proj = (t: number, a: number, b: number) => a + t * (b - a);
  const nob = (t: number) => (t <= 18 ? 0.0007 * t ** 3 - 0.031 * t ** 2 + 0.64 * t + 1.28 : t <= 44 ? 0.000044 * t ** 3 - 0.006 * t ** 2 + 0.36 * t + 2 : 0.00000045 * t ** 3 - 0.000332 * t ** 2 + 0.1078 * t + 5.84);
  const b = proj(n(bounciness / 1.7, 0, 20), 0, 0.8);
  const tension = proj(n(speed / 1.7, 0, 20), 0.5, 200);
  const q = 2 * b - b * b;
  return { k: tension, c: q * 0.01 + (1 - q) * nob(tension) };
}

// prettier-ignore
export const PRESETS: Preset[] = [
  // @muse/app easings (packages/app/src/motion.ts)
  { name: "app standard (M3 standard)", platform: "material", src: "packages/app easings.standard", kind: "bezier", p: [0.2, 0, 0, 1] },
  { name: "app decelerate (M3 emphasized decelerate)", platform: "material", src: "packages/app easings.decelerate", kind: "bezier", p: [0.05, 0.7, 0.1, 1] },
  { name: "app accelerate (M3 emphasized accelerate)", platform: "material", src: "packages/app easings.accelerate", kind: "bezier", p: [0.3, 0, 0.8, 0.15] },
  { name: "FDS enter", platform: "meta", src: "packages/app easings.enter (Facebook FDS enter-exit-in)", kind: "bezier", p: [0.14, 1, 0.34, 1] },
  { name: "FDS quick move", platform: "meta", src: "packages/app easings.move (Facebook FDS quick-move)", kind: "bezier", p: [0.1, 0.9, 0.2, 1] },
  { name: "Core Animation ease in-out", platform: "ios", src: "packages/app easings.easeInOut", kind: "bezier", p: [0.42, 0, 0.58, 1] },
  { name: "linear", platform: "css", src: "packages/app easings.linear", kind: "bezier", p: [0, 0, 1, 1] },
  // presets.py beziers not already above
  { name: "M3 standard decelerate", platform: "material", src: "presets.py m3-standard-decelerate", kind: "bezier", p: [0, 0, 0, 1] },
  { name: "M3 standard accelerate", platform: "material", src: "presets.py m3-standard-accelerate", kind: "bezier", p: [0.3, 0, 1, 1] },
  { name: "M2 standard", platform: "material", src: "presets.py m3-legacy", kind: "bezier", p: [0.4, 0, 0.2, 1] },
  { name: "iOS ease out", platform: "ios", src: "presets.py ios-ease-out", kind: "bezier", p: [0, 0, 0.58, 1] },
  { name: "iOS ease in", platform: "ios", src: "presets.py ios-ease-in", kind: "bezier", p: [0.42, 0, 1, 1] },
  // @muse/app springs
  { name: "app ios spring", platform: "ios", src: "packages/app springs.ios", kind: "spring", k: 157.91, c: 20.73 },
  { name: "app ios bouncy", platform: "ios", src: "packages/app springs.iosBouncy", kind: "spring", k: 157.91, c: 17.59 },
  { name: "app material", platform: "material", src: "packages/app springs.material", kind: "spring", k: 700, c: 47.62 },
  { name: "app material fast", platform: "material", src: "packages/app springs.materialFast", kind: "spring", k: 1400, c: 67.35 },
  // presets.py springs
  { name: "M3 slow spatial", platform: "material", src: "presets.py m3-spatial-slow-standard", kind: "spring", ...z(300, 0.9) },
  { name: "M3 expressive", platform: "material", src: "presets.py m3-spatial-default-expressive", kind: "spring", ...z(380, 0.8) },
  { name: "M3 expressive fast", platform: "material", src: "presets.py m3-spatial-fast-expressive", kind: "spring", ...z(800, 0.6) },
  { name: "SpringForce default", platform: "android", src: "presets.py springforce-default", kind: "spring", ...z(1500, 0.5) },
  { name: "SpringForce low bouncy", platform: "android", src: "presets.py springforce-low-bouncy", kind: "spring", ...z(1500, 0.75) },
  { name: "SpringForce high bouncy, low stiffness", platform: "android", src: "presets.py springforce-high-bouncy-low", kind: "spring", ...z(200, 0.2) },
  { name: "SpringForce no bounce, low", platform: "android", src: "presets.py springforce-no-bounce-low", kind: "spring", ...z(200, 1) },
  { name: "SwiftUI smooth", platform: "ios", src: "presets.py swiftui-smooth", kind: "spring", ...sw(0.5, 1) },
  { name: "SwiftUI snappy", platform: "ios", src: "presets.py swiftui-snappy", kind: "spring", ...sw(0.5, 0.85) },
  { name: "SwiftUI bouncy", platform: "ios", src: "presets.py swiftui-bouncy", kind: "spring", ...sw(0.5, 0.7) },
  { name: "iOS keyboard", platform: "ios", src: "presets.py ios-keyboard-spring", kind: "spring", k: 1000, c: 500, m: 3 },
  { name: "React Native spring", platform: "rn", src: "presets.py rn-animated-spring-default", kind: "spring", k: 100, c: 10 },
  { name: "Rebound 40/7", platform: "meta", src: "presets.py rebound-40-7", kind: "spring", k: 40, c: 7 },
  { name: "Rebound 40/7 via RN", platform: "meta", src: "presets.py rebound-40-7-rn-converted", kind: "spring", k: (40 - 30) * 3.62 + 194, c: (7 - 8) * 3 + 25 },
  { name: "Pop default", platform: "meta", src: "presets.py pop-bounciness4-speed12", kind: "spring", ...pop(4, 12) },
];

export const BEZIER_DURATIONS = [150, 250, 400, 700];

/** Spring position at t ms (0 -> 1), same closed form as @muse/app's spring(). */
export function springAt(c: Extract<Curve, { kind: "spring" }>, ms: number): number {
  const m = c.mass, k = c.stiffness, w0 = Math.sqrt(k / m), zeta = c.damping / (2 * Math.sqrt(k * m)), t = ms / 1000;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta), b = (0 - zeta * w0) / wd;
    return 1 + Math.exp(-zeta * w0 * t) * (-Math.cos(wd * t) + b * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 + (-1 - w0 * t) * Math.exp(-w0 * t);
  const s = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - s), r2 = -w0 * (zeta + s), c2 = r1 / (r2 - r1);
  return 1 + (-1 - c2) * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/** Time to stay within 2% of the end, and the largest overshoot past it. */
export function measure(c: Curve): { settle: number; overshoot: number } {
  if (c.kind === "bezier") return { settle: c.duration, overshoot: Math.max(0, c.p[1] - 1, c.p[3] - 1) * 0.5 };
  let last = 0, over = 0;
  for (let ms = 0; ms <= 6000; ms += 4) {
    const y = springAt(c, ms);
    over = Math.max(over, y - 1);
    if (Math.abs(y - 1) > 0.02) last = ms;
  }
  return { settle: last, overshoot: over };
}

function features(t: Transition, pr: Preset, c: Curve): Feats {
  const { settle, overshoot } = measure(c);
  const f: Feats = { [`motion.transition=${t}`]: 1 };
  if (c.kind === "spring") f["motion.family=spring"] = 1;
  if (settle < 200) f["motion.dur=fast"] = 1;
  else if (settle > 700) f["motion.dur=very_slow"] = 1;
  else if (settle >= 400) f["motion.dur=slow"] = 1;
  if (overshoot > 0.05) f["motion.overshoot=large"] = 1;
  else if (overshoot > 0.005) f["motion.overshoot=small"] = 1;
  if (pr.kind === "bezier" && pr.p.join() === "0,0,1,1") f["motion.curve=linear"] = 1;
  if (pr.kind === "bezier" && pr.p[1] === 0 && pr.p[3] < 1 && pr.p[0] > 0.25) f["motion.curve=ease_in"] = 1;
  if (pr.platform === "meta") f["motion.platform=meta"] = 1;
  if (pr.platform === "ios") f["motion.platform=ios"] = 1;
  if (pr.platform === "material") f["motion.platform=material"] = 1;
  return f;
}

/** Every transition under every spring, and under every bezier at 2 of the 4 durations (seeded). */
export function motionItems(): MotionItem[] {
  const out: MotionItem[] = [];
  const r = rand(7);
  for (const t of TRANSITIONS) {
    for (const pr of PRESETS) {
      const curves: Curve[] =
        pr.kind === "spring"
          ? [{ kind: "spring", stiffness: pr.k, damping: pr.c, mass: pr.m ?? 1 }]
          : r.shuffle(BEZIER_DURATIONS).slice(0, 2).map((d) => ({ kind: "bezier" as const, p: pr.p, duration: d }));
      for (const c of curves) {
        const id = `motion:${t}:${pr.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${c.kind === "bezier" ? `:${c.duration}` : ""}`;
        out.push({ id, kind: "motion", group: `motion:${t}`, transition: t, preset: pr.name, platform: pr.platform, curve: c, x: features(t, pr, c) });
      }
    }
  }
  return out;
}
