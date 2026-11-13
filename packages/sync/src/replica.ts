import type { C2S, Entry, Member, Meta, Reducer, S2C } from "@muse/protocol";
import type { Transport } from "./transport.ts";

/** docs/CONTRACTS.md section 2. */
export interface Replica<S> {
  readonly state: S;
  readonly confirmed: S;
  dispatch(action: unknown): void;
  subscribe(fn: (state: S) => void): () => void;
}

export type Pending = { readonly cseq: number; readonly action: unknown; readonly time: number };

export type ReplicaOptions = {
  room: string;
  user: string;
  /** Unique per replica instance. A reused id with a restarted cseq would be deduped away. */
  client?: string;
  members?: Member[];
  /** Local clock for predicted Meta.time. */
  now?: () => number;
  onError?: (e: { code: string; message: string }) => void;
  onEph?: (user: string, key: string, value: unknown) => void;
  /** Delay before resending pending actions after `store_failed`. Default 250 ms. */
  retryMs?: number;
};

export interface SyncReplica<S> extends Replica<S> {
  readonly room: string;
  readonly client: string;
  readonly user: string;
  /** Last confirmed seq. */
  readonly head: number;
  readonly pending: readonly Pending[];
  /** True once the server welcomed the current connection. */
  readonly live: boolean;
  /** The server database's id from the last welcome, if any. */
  readonly epoch: string | undefined;
  eph(key: string, value: unknown): void;
  close(): void;
}

let counter = 0;
function freshClientId(): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `c-${rnd}-${++counter}`;
}

/**
 * Confirmed state plus a pending queue. Confirmed state only ever advances by folding entries
 * in seq order; the visible state is confirmed with pending actions replayed on top using
 * predicted Meta. Entries that arrive early are buffered until the gap fills; duplicates and
 * old entries are ignored, so any delivery order converges to the same state.
 */
export class ReplicaCore<S> implements SyncReplica<S> {
  readonly room: string;
  readonly client: string;
  readonly user: string;
  protected reducer: Reducer<S>;
  protected transport: Transport;
  protected opts: ReplicaOptions;
  protected now: () => number;

  confirmed: S;
  state: S;
  head = 0;
  pending: Pending[] = [];
  live = false;
  epoch: string | undefined;
  protected buffer = new Map<number, Entry>();
  protected nextCseq = 1;
  protected subs = new Set<(s: S) => void>();
  /** Head at which we last asked the server to fill a gap, so we ask once per gap. */
  protected gapAskedAt = -1;
  protected closed = false;
  protected retry: ReturnType<typeof setTimeout> | null = null;

  constructor(reducer: Reducer<S>, transport: Transport, opts: ReplicaOptions) {
    this.reducer = reducer;
    this.transport = transport;
    this.opts = opts;
    this.room = opts.room;
    this.user = opts.user;
    this.client = opts.client ?? freshClientId();
    this.now = opts.now ?? (() => Date.now());
    this.confirmed = this.fresh();
    this.state = this.confirmed;
    transport.start({
      open: () => this.onOpen(),
      message: (m) => this.onMessage(m),
      close: () => this.onClose(),
    });
  }

  protected fresh(): S {
    return this.reducer.init({ room: this.opts.room, members: this.opts.members ?? [] });
  }

  protected send(m: C2S) {
    if (!this.closed) this.transport.send(m);
  }

  protected hello() {
    this.send({ t: "hello", room: this.room, client: this.client, user: this.user, have: this.head });
  }

  protected onOpen() {
    this.live = false;
    this.gapAskedAt = -1;
    // Entries buffered on an earlier connection may come from another epoch; the welcome
    // carries everything above our head again.
    this.buffer.clear();
    this.hello();
  }

  protected onClose() {
    this.live = false;
  }

  protected onMessage(m: S2C) {
    if (m.t === "error") {
      if (m.room !== undefined && m.room !== this.room) return;
      if (m.code === "not_joined") this.hello();
      if (m.code === "store_failed") this.resendLater();
      this.opts.onError?.({ code: m.code, message: m.message });
      return;
    }
    if (m.room !== this.room) return;
    switch (m.t) {
      case "welcome": {
        if (this.epoch !== undefined && m.epoch !== this.epoch) {
          this.reset();
          this.epoch = m.epoch;
          // The welcome only holds entries above our old head; ask again from the start.
          if (m.head > 0 && m.entries[0]?.seq !== 1) {
            this.hello();
            return;
          }
        }
        this.epoch = m.epoch;
        if (m.head < this.head) {
          // Same database but it holds less than we do: it was rewound. Nothing safe can be
          // done automatically.
          this.opts.onError?.({ code: "rewound", message: `server head ${m.head} is behind local head ${this.head}` });
        }
        for (const e of m.entries) this.accept(e);
        this.flush();
        this.live = true;
        this.resend();
        // An answer to an older hello (sent before a reset) can stop short of its own head.
        if (this.head < m.head && this.gapAskedAt !== this.head) {
          this.gapAskedAt = this.head;
          this.hello();
        }
        return;
      }
      case "entry":
        this.accept(m.entry);
        if (this.live) this.flush();
        else if (this.gapAskedAt !== -2) {
          // An entry before this connection's welcome: the welcome was lost. Fold nothing
          // until a welcome says which log this is.
          this.gapAskedAt = -2;
          this.hello();
        }
        return;
      case "eph":
        this.opts.onEph?.(m.user, m.key, m.value);
        return;
    }
  }

  /** The server's log was replaced: drop confirmed state and pending actions for this room. */
  protected reset() {
    this.confirmed = this.fresh();
    this.head = 0;
    this.pending = [];
    // The buffer only holds entries from this connection (see onOpen), so from the new log.
    this.gapAskedAt = -1;
    this.setState(this.confirmed);
    this.opts.onError?.({ code: "epoch", message: "the server's log was replaced; starting over" });
  }

  protected resend() {
    for (const p of this.pending) this.send({ t: "act", room: this.room, cseq: p.cseq, action: p.action });
  }

  /** A write failed on the server. It recovers on the next good write, so try again soon. */
  protected resendLater() {
    if (this.retry || this.closed) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.live) this.resend();
    }, this.opts.retryMs ?? 250);
  }

  /** Take an entry into the buffer unless we already have it. Before this connection's welcome
   * we cannot tell which log an entry is from, so keep it whatever its seq. */
  protected accept(e: Entry) {
    if ((e.seq > this.head || !this.live) && !this.buffer.has(e.seq)) this.buffer.set(e.seq, e);
  }

  /** Fold every entry that is next in line into confirmed state, then replay pending. */
  protected flush() {
    let changed = false;
    for (const k of this.buffer.keys()) if (k <= this.head) this.buffer.delete(k);
    for (let e = this.buffer.get(this.head + 1); e; e = this.buffer.get(this.head + 1)) {
      this.buffer.delete(e.seq);
      this.confirmed = this.apply(this.confirmed, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed });
      this.head = e.seq;
      if (e.client === this.client) {
        const i = this.pending.findIndex((p) => p.cseq === e.cseq);
        if (i >= 0) this.pending.splice(i, 1);
      }
      changed = true;
    }
    if (this.buffer.size > 0 && this.gapAskedAt !== this.head) {
      // Something is missing below what we hold. A real socket never does this; a faulty
      // one might. Ask for a catch-up from our head.
      this.gapAskedAt = this.head;
      this.hello();
    }
    if (changed) this.setState(this.replay());
  }

  protected apply(s: S, action: unknown, meta: Meta): S {
    try {
      return this.reducer.reduce(s, action, meta);
    } catch (err) {
      this.opts.onError?.({ code: "reducer_threw", message: String(err) });
      return s;
    }
  }

  protected predicted(i: number, p: Pending): Meta {
    return { seq: this.head + i + 1, user: this.user, time: p.time, seed: 0 };
  }

  /** Confirmed state with every pending action replayed on top. */
  protected replay(): S {
    let s = this.confirmed;
    this.pending.forEach((p, i) => {
      s = this.apply(s, p.action, this.predicted(i, p));
    });
    return s;
  }

  protected setState(s: S) {
    if (s === this.state) return;
    this.state = s;
    for (const fn of [...this.subs]) fn(s);
  }

  dispatch(action: unknown): void {
    if (this.closed) throw new Error("replica is closed");
    const p: Pending = { cseq: this.nextCseq++, action, time: this.now() };
    this.pending.push(p);
    if (this.live) this.send({ t: "act", room: this.room, cseq: p.cseq, action });
    // The new action goes last, so applying it to the current state equals a full replay.
    this.setState(this.apply(this.state, action, this.predicted(this.pending.length - 1, p)));
  }

  subscribe(fn: (state: S) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  eph(key: string, value: unknown): void {
    if (this.live) this.send({ t: "eph", room: this.room, key, value });
  }

  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.live = false;
    this.transport.stop();
    this.subs.clear();
  }
}

export function createReplica<S>(reducer: Reducer<S>, transport: Transport, opts: ReplicaOptions): SyncReplica<S> {
  return new ReplicaCore(reducer, transport, opts);
}
