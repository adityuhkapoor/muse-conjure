// The slice of `@muse/app` an app needs at gate time (init, reduce, invariants, arbitrary, summary),
// as JavaScript source evaluated inside the app's own vm context so no host object leaks in.
//
// `rng` is the real packages/app/src/rng.ts, compiled and inlined by sandbox.ts (loadRealRng),
// because every client folds the log with it. The mulberry32 copy below is only a fallback for
// a checkout without that file. `h`, `jsx` and the components are inert stubs: the real runtime
// needs a DOM, and only stage 6 (render, headless Chrome) runs the view, with the real runtime.

export const FALLBACK_RNG_SOURCE = `
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
  };
}`;

export function runtimeSource(rngSource: string): string {
  return `
"use strict";
${rngSource}
const Fragment = Symbol.for("muse.fragment");
function h(type, props, ...children) { return { type, props: props || {}, children }; }
function jsx(type, props) { return { type, props: props || {}, children: props && props.children }; }
const component = (name) => (props) => ({ type: name, props: props || {}, children: props && props.children });
const signal = (v) => ({ value: v, peek() { return this.value; } });
const computed = (fn) => ({ get value() { return fn(); } });
const effect = () => () => {};
const spring = (t) => ({ value: t });
const tween = (a, b) => ({ value: b });
const clock = { value: 0, peek() { return 0; } };
const haptic = () => {};
const running = () => null;
const color = (theme, name) => (theme && theme.color && theme.color[name]) || "";
const userColor = (m, theme) => (theme && theme.people && theme.people[0]) || "";
const app = Object.freeze({
  defineApp: (def) => def, h, Fragment, rng, signal, computed, effect, spring, tween,
  Button: component("Button"), OptionRow: component("OptionRow"), Facepile: component("Facepile"),
  Avatar: component("Avatar"), Progress: component("Progress"), CardHeader: component("CardHeader"),
  Rsvp: component("Rsvp"), Toast: component("Toast"), SystemLine: component("SystemLine"),
  Canvas: component("Canvas"), clock, haptic, running, color, userColor, springs: Object.freeze({}), easings: Object.freeze({}),
});
const jsxRuntime = Object.freeze({ jsx, jsxs: jsx, jsxDEV: jsx, Fragment });
({ app, jsxRuntime, rng });
`;
}
