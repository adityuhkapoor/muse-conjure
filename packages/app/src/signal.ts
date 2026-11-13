// Fine-grained signals. Push dirty marks, pull values: a computed recomputes only when read and
// only if a dependency's version moved; an effect re-runs only if a dependency really changed.

type Src = { ver: number; subs: Set<Obs>; refresh?(): void };
type Obs = { deps: Map<Src, number>; mark(): void };

let cur: Obs | undefined;
let depth = 0;
const queue: Effect[] = [];

function track(s: Src) {
  if (cur) {
    cur.deps.set(s, s.ver);
    s.subs.add(cur);
  }
}

function changed(o: Obs) {
  for (const [d, v] of o.deps) {
    d.refresh?.();
    if (d.ver !== v) return true;
  }
  return false;
}

function unlink(o: Obs) {
  for (const d of o.deps.keys()) d.subs.delete(o);
  o.deps.clear();
}

function run<T>(o: Obs, fn: () => T): T {
  unlink(o);
  const prev = cur;
  cur = o;
  try {
    return fn();
  } finally {
    cur = prev;
  }
}

/** Run `fn` and apply its signal writes as one update. */
export function batch<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    if (--depth === 0) flush();
  }
}

let flushing = false;
function flush() {
  if (flushing) return;
  flushing = true;
  let n = 0;
  try {
    while (queue.length) {
      if (++n > 1e4) {
        for (const e of queue.splice(0)) e.queued = false;
        throw new Error("Effects did not settle (an effect keeps writing a signal it reads)");
      }
      queue.shift()!.tick();
    }
  } finally {
    flushing = false;
  }
}

export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
}
export interface Signal<T> extends ReadonlySignal<T> {
  value: T;
}

class Sig<T> implements Src {
  ver = 0;
  subs = new Set<Obs>();
  constructor(public v: T) {}
  get value() {
    track(this);
    return this.v;
  }
  set value(n: T) {
    if (Object.is(n, this.v)) return;
    this.v = n;
    this.ver++;
    depth++;
    for (const s of [...this.subs]) s.mark();
    if (--depth === 0) flush();
  }
  peek() {
    return this.v;
  }
}

class Comp<T> implements Src, Obs {
  ver = 0;
  subs = new Set<Obs>();
  deps = new Map<Src, number>();
  dirty = true;
  init = false;
  v!: T;
  constructor(public fn: () => T) {}
  mark() {
    if (this.dirty) return;
    this.dirty = true;
    for (const s of [...this.subs]) s.mark();
  }
  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.init && !changed(this)) return;
    const n = run(this, this.fn);
    if (!this.init || !Object.is(n, this.v)) {
      this.v = n;
      this.ver++;
    }
    this.init = true;
  }
  get value() {
    this.refresh();
    track(this);
    return this.v;
  }
  peek() {
    this.refresh();
    return this.v;
  }
}

class Effect implements Obs {
  deps = new Map<Src, number>();
  queued = false;
  stop?: (() => void) | void;
  constructor(public fn: () => void | (() => void)) {}
  mark() {
    if (!this.queued) {
      this.queued = true;
      queue.push(this);
    }
  }
  tick() {
    this.queued = false;
    if (changed(this)) this.go();
  }
  go() {
    if (typeof this.stop === "function") this.stop();
    this.stop = run(this, this.fn);
  }
  dispose() {
    unlink(this);
    if (typeof this.stop === "function") this.stop();
  }
}

/** A value that notifies readers when written. Read and write `.value`. */
export function signal<T>(value: T): Signal<T> {
  return new Sig(value);
}

/** A cached value derived from other signals. Recomputes lazily. */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  return new Comp(fn);
}

/** Run `fn` now and again whenever a signal it read changes. `fn` may return a cleanup. Returns dispose. */
export function effect(fn: () => void | (() => void)): () => void {
  const e = new Effect(fn);
  depth++;
  try {
    e.go();
  } finally {
    if (--depth === 0) flush();
  }
  return () => e.dispose();
}

/** Read signals inside `fn` without subscribing to them. */
export function untrack<T>(fn: () => T): T {
  const prev = cur;
  cur = undefined;
  try {
    return fn();
  } finally {
    cur = prev;
  }
}

/** True while some computed or effect reads `s`. */
export function watched(s: ReadonlySignal<unknown>): boolean {
  return ((s as unknown as Src).subs?.size ?? 0) > 0;
}
