// A tool's compiled code in its own vm context, as packages/verify loads apps: only the
// JavaScript intrinsics and a DOM-free @muse/app stub, intrinsics frozen, nothing from the host.
// The context lives on its own worker thread (realm-worker.ts); calls are synchronous for the
// replica's reducer but wait with a time limit, and only strings cross (state, actions and meta
// as JSON). A tool that throws or loops costs that tool, never the service.
//
// The fold mirrors packages/app/src/runtime.ts (appReducer): `@members` sets ctx.members and
// reruns init until the first app action changes state; other `@` actions and non-actions are
// dropped; a throwing reduce is a no-op.
//
// Why a thread: per-call `vm` timeouts on the main thread hang Bun 1.3 now and then after many
// calls (seen in the soak test); in a worker a hang only loses that worker, which is replaced.

import type { Meta } from "../../../packages/protocol/src/index.ts";
import { compileModule } from "../../../packages/verify/src/compile.ts";
import { runtimeSource } from "../../../packages/verify/src/adapters/app-runtime.ts";
import { loadRealRng } from "../../../packages/verify/src/sandbox.ts";

/** The fold's state as JSON: { s, members, started }. */
export type FoldJson = string;

export class RealmError extends Error {}

const BUFFER = 2 * 1024 * 1024;
const dec = new TextDecoder();
const WORKER = new URL("./realm-worker.ts", import.meta.url).href;

export class ToolRealm {
  readonly name: string;
  readonly room: string;
  #js: string;
  #timeoutMs: number;
  #w!: Worker;
  #i32!: Int32Array;
  #bytes!: Uint8Array;
  /** calls that threw */
  faults = 0;
  /** calls that ran out of time; after two the tool is left alone for good */
  timeouts = 0;
  #closed = false;
  get dead() {
    return this.timeouts >= 2 || this.#closed;
  }

  constructor(code: string, room: string, opts: { timeoutMs?: number } = {}) {
    this.#timeoutMs = opts.timeoutMs ?? 250;
    this.room = room;
    const compiled = compileModule(code, "app.js");
    if (!compiled.ok) throw new RealmError(`the tool does not compile: ${compiled.message}`);
    this.#js = compiled.js;
    this.name = this.#spawn();
  }

  /** A fresh worker with the tool loaded. Returns the app's name. */
  #spawn(): string {
    const sab = new SharedArrayBuffer(8 + BUFFER);
    this.#i32 = new Int32Array(sab, 0, 2);
    this.#bytes = new Uint8Array(sab, 8);
    this.#w = new Worker(WORKER);
    this.#w.unref();
    const r = this.#post({ op: "load", sab, js: this.#js, rt: runtimeSource(loadRealRng().source), room: this.room, timeoutMs: this.#timeoutMs }, 5000);
    if (r.ok) return r.text;
    this.close();
    throw new RealmError(r.text);
  }

  #post(m: unknown, waitMs: number): { ok: boolean; text: string; timedOut?: boolean } {
    Atomics.store(this.#i32, 0, 0);
    this.#w.postMessage(m);
    if (Atomics.wait(this.#i32, 0, 0, waitMs) === "timed-out") return { ok: false, text: "out of time", timedOut: true };
    const n = Atomics.load(this.#i32, 1);
    const text = dec.decode(this.#bytes.slice(0, n));
    return { ok: Atomics.load(this.#i32, 0) === 1, text };
  }

  #run(k: string, a: string, b: string, c: string): string {
    if (this.dead) throw new RealmError("this tool is left alone");
    const r = this.#post({ op: "call", k, a, b, c }, this.#timeoutMs * 2 + 50);
    if (r.timedOut) {
      // A loop in the tool, or the worker got stuck: replace the worker and give up after two.
      this.timeouts++;
      this.#w.terminate();
      if (!this.dead) {
        try {
          this.#spawn();
        } catch {
          this.timeouts = 99;
        }
      }
      throw new RealmError(`${k} ran out of time`);
    }
    if (!r.ok) throw new RealmError(r.text);
    return r.text;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#w.terminate();
  }

  init(): FoldJson {
    try {
      return this.#run("init", "", "", "");
    } catch {
      this.faults++;
      return JSON.stringify({ s: null, members: [], started: false });
    }
  }

  /** One step of the fold. Never throws: a fault is a no-op, as in the frame. */
  reduce(f: FoldJson, action: unknown, meta: Meta): FoldJson {
    let aj: string;
    try {
      aj = JSON.stringify(action ?? null);
    } catch {
      return f;
    }
    try {
      return this.#run("reduce", f, aj, JSON.stringify(meta));
    } catch {
      this.faults++;
      return f;
    }
  }

  /** A plausible next action for `user`, or null (also when arbitrary throws). */
  arbitrary(f: FoldJson, user: string, seed: number): unknown {
    try {
      return JSON.parse(this.#run("arbitrary", f, user, String(seed >>> 0)));
    } catch {
      this.faults++;
      return null;
    }
  }

  summary(f: FoldJson): string {
    try {
      return this.#run("summary", f, "", "").slice(0, 200);
    } catch {
      this.faults++;
      return "";
    }
  }
}
