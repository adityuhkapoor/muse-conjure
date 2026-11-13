// One tool's vm context on its own thread. The host calls it synchronously: it posts a request,
// then waits on a shared flag with a time limit, so a tool that loops costs that tool only and
// the service's own thread never runs tool code. Answers go back through the shared buffer.

import vm from "node:vm";
import { API, FREEZE } from "./realm-src.ts";

declare const self: Worker;

let i32: Int32Array;
let bytes: Uint8Array;
let ctx: vm.Context;
let timeout = 200;
const call = new vm.Script("__r = __api[__k](__a, __b, __c)");
const enc = new TextEncoder();

function answer(ok: boolean, text: string) {
  const b = enc.encode(text);
  const fits = b.length <= bytes.length;
  if (fits) bytes.set(b);
  Atomics.store(i32, 1, fits ? b.length : 0);
  Atomics.store(i32, 0, ok && fits ? 1 : 2);
  Atomics.notify(i32, 0);
}

type Load = { op: "load"; sab: SharedArrayBuffer; js: string; rt: string; room: string; timeoutMs: number };
type Call = { op: "call"; k: string; a: string; b: string; c: string };

self.onmessage = (e: MessageEvent<Load | Call>) => {
  const m = e.data;
  if (m.op === "load") {
    i32 = new Int32Array(m.sab, 0, 2);
    bytes = new Uint8Array(m.sab, 8);
    timeout = m.timeoutMs;
    try {
      ctx = vm.createContext(Object.create(null));
      const limit = { timeout: timeout * 5 };
      ctx.__rt = vm.runInContext(m.rt, ctx, limit);
      ctx.__room = m.room;
      vm.runInContext(FREEZE, ctx, limit);
      vm.runInContext(
        `globalThis.__exports = {}; (function (__require, __exports) {\n${m.js}\n})((spec) => {
          if (spec === "@muse/app") return __rt.app;
          if (spec === "@muse/app/jsx-runtime" || spec === "@muse/app/jsx-dev-runtime") return __rt.jsxRuntime;
          throw new Error("import " + spec + " is not available");
        }, globalThis.__exports);`,
        ctx,
        limit,
      );
      const ok = vm.runInContext(`typeof __exports.default === "object" && __exports.default !== null && typeof __exports.default.init === "function" && typeof __exports.default.reduce === "function"`, ctx, limit);
      if (!ok) return answer(false, "the module has no app as its default export");
      ctx.__api = vm.runInContext(API, ctx, limit);
      answer(true, String(vm.runInContext(`__api.name()`, ctx, limit)));
    } catch (err) {
      answer(false, `the tool failed to load: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    }
    return;
  }
  try {
    ctx.__k = m.k;
    ctx.__a = m.a;
    ctx.__b = m.b;
    ctx.__c = m.c;
    ctx.__r = undefined;
    call.runInContext(ctx, { timeout });
    const r = ctx.__r;
    ctx.__a = ctx.__b = ctx.__c = ctx.__r = undefined;
    if (typeof r !== "string") answer(false, `${m.k} returned no text`);
    else answer(true, r);
  } catch (err) {
    answer(false, String((err as Error)?.message ?? err).slice(0, 200));
  }
};
