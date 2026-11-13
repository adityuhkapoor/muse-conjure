/**
 * bun scripts/spring.ts [stiffness damping mass [duration ms]]: prints the CSS `linear()` easing and settle time for a spring,
 * to paste into the motion tokens (--m-*-ease, --m-*-dur). Defaults are the reference mockup's push spring
 * (stiffness 340, damping 38, mass 1). The same maths drives the swipe-back release in src/phone/spring.ts.
 */
import { springAt, settleTime } from "../src/phone/spring.ts";

const [k, c, m, ms] = process.argv.slice(2).map(Number);
const p = { k: k ?? 340, c: c ?? 38, m: m ?? 1 };
const T = ms ? ms / 1000 : settleTime(p); // a fourth argument fixes the duration (the spring is sampled over it)
const pts: number[] = [];
const N = 20;
for (let i = 0; i <= N; i++) pts.push(+springAt(p, (T * i) / N).toFixed(3));
pts[N] = 1;
console.log(`stiffness ${p.k}, damping ${p.c}, mass ${p.m}: settles in ${Math.round(T * 1000)} ms`);
console.log(`linear(${pts.join(", ")})`);
