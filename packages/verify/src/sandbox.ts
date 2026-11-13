// Load a compiled app into a fresh vm context with frozen globals.
//
// The context has only the JavaScript intrinsics (no timers, fetch, DOM, storage). Clock and
// randomness that slip past the static stage are not removed but made to drift: `Date.now()`
// advances on every call and `Math.random()` is seeded per context. A reducer that reads them
// then yields different states on two runs of the same sequence, which stage 3 reports.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { transformSync } from "oxc-transform";
import { FALLBACK_RNG_SOURCE, runtimeSource } from "./adapters/app-runtime.ts";

export type AppLike = {
  name?: unknown;
  summary?: (s: unknown, ctx: unknown) => unknown;
  init: (ctx: unknown) => unknown;
  reduce: (s: unknown, a: unknown, m: unknown, ctx: unknown) => unknown;
  onMembers?: (s: unknown, ctx: unknown) => unknown;
  invariants?: Record<string, (s: unknown, ctx: unknown) => unknown>;
  transitions?: Record<string, (prev: unknown, next: unknown, a: unknown, m: unknown, ctx: unknown) => unknown>;
  arbitrary?: (s: unknown, user: string, rng: unknown, ctx: unknown) => unknown;
  view?: unknown;
};

export type Loaded = {
  app: AppLike;
  rng: (seed: number) => unknown;
  /** Convert a value into the app's realm (so frozen inputs are realm-local objects). */
  toRealm: <T>(v: T) => T;
};

const APP_SRC = join(import.meta.dir, "../../app/src");

let rngSourceCache: string | undefined;
/** Uses packages/app/src/rng.ts when it exists and is self-contained; else the fallback. */
export function loadRealRng(): { source: string; real: boolean } {
  if (rngSourceCache !== undefined) return { source: rngSourceCache, real: rngSourceCache !== FALLBACK_RNG_SOURCE };
  rngSourceCache = FALLBACK_RNG_SOURCE;
  const file = join(APP_SRC, "rng.ts");
  if (existsSync(file)) {
    const src = readFileSync(file, "utf8");
    if (!/^\s*import\s[^;]*from\s/m.test(src.replace(/^\s*import\s+type\s[^;]*;/gm, ""))) {
      const t = transformSync("rng.ts", src, { lang: "ts" } as Parameters<typeof transformSync>[2]);
      if (!t.errors.length) {
        const body = t.code.replace(/^export\s+default\s+/gm, "").replace(/^export\s+(?=(function|const|let|class)\b)/gm, "");
        if (/\bfunction\s+rng\b|\b(const|let)\s+rng\b/.test(body)) rngSourceCache = body;
      }
    }
  }
  return { source: rngSourceCache, real: rngSourceCache !== FALLBACK_RNG_SOURCE };
}

const PRELUDE = (nonce: number) => `
"use strict";
(() => {
  const g = globalThis;
  let seed = ${nonce >>> 0} || 1;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  Math.random = rand;
  const RealDate = Date;
  let clock = 1700000000000 + ${nonce % 100000} * 7919;
  const now = () => (clock += 13);
  function FakeDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return args.length ? new RealDate(...args) : new RealDate(now());
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = now;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  g.Date = FakeDate;
  g.performance = { now: () => now() - 1700000000000 };
  // Freeze the intrinsics so an app cannot stash state on them between runs. (Freezing the
  // global object itself breaks name lookup in Bun's vm, and strict mode already stops
  // implicit globals; \`globalThis\` is banned by the static stage.)
  const names = ["Object", "Function", "Array", "Number", "String", "Boolean", "Symbol", "Math", "JSON", "Date",
    "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "Map", "Set", "WeakMap", "WeakSet",
    "Promise", "Reflect", "Proxy", "BigInt", "ArrayBuffer", "DataView", "Uint8Array", "Int32Array", "Float64Array", "performance"];
  for (const name of names) {
    let v;
    try { v = g[name]; } catch { continue; }
    if (v && (typeof v === "object" || typeof v === "function")) {
      Object.freeze(v);
      if (v.prototype) Object.freeze(v.prototype);
    }
  }
})();
`;

/** Throws when the module cannot be evaluated or has no usable default export. */
export function loadApp(js: string, nonce = 1): Loaded {
  const ctx = vm.createContext(Object.create(null));
  const rt = vm.runInContext(runtimeSource(loadRealRng().source), ctx) as {
    app: Record<string, unknown>;
    jsxRuntime: Record<string, unknown>;
    rng: (seed: number) => unknown;
  };
  const toRealm = vm.runInContext("(s) => s === undefined ? undefined : JSON.parse(s)", ctx) as (s: string | undefined) => any;
  vm.runInContext(PRELUDE(nonce), ctx);
  const exportsObj = vm.runInContext("({})", ctx) as Record<string, unknown>;
  const require = (spec: string) => {
    if (spec === "@muse/app") return rt.app;
    if (spec === "@muse/app/jsx-runtime" || spec === "@muse/app/jsx-dev-runtime") return rt.jsxRuntime;
    throw new Error(`import "${spec}" is not available to apps`);
  };
  const fn = vm.runInContext(`(function (__require, __exports) {\n${js}\n})`, ctx) as (r: unknown, e: unknown) => void;
  fn(require, exportsObj);
  const app = exportsObj.default as AppLike | undefined;
  if (!app || typeof app !== "object") throw new Error("the module has no default export from defineApp(...)");
  for (const k of ["init", "reduce"] as const) {
    if (typeof app[k] !== "function") throw new Error(`defineApp is missing \`${k}\``);
  }
  return {
    app,
    rng: rt.rng,
    toRealm: <T>(v: T) => toRealm(v === undefined ? undefined : JSON.stringify(v)) as T,
  };
}
