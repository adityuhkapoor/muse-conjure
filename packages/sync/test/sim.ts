// Simulated network and the sync properties, shared by the main tests and the broken-variant
// fixtures. fc.scheduler() decides the order every message is delivered in, so messages are
// delayed and reordered at random; a fault plan drops or duplicates some of them; commands
// dispatch, disconnect and reconnect clients. Messages still in flight when a connection
// closes are lost, as on a real socket.

import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import type { C2S, Entry, Meta, Reducer, S2C } from "@muse/protocol";
import { ReplicaCore, type ReplicaOptions, type SyncReplica } from "../src/replica.ts";
import { Sequencer, type SequencerConnection, type SequencerOptions } from "../src/sequencer.ts";
import type { Transport, TransportHandlers } from "../src/transport.ts";
import type { Spec } from "./reducers.ts";

export type Fault = "ok" | "drop" | "dup";

export type Variant = {
  name: string;
  replica: <S>(r: Reducer<S>, t: Transport, o: ReplicaOptions) => SyncReplica<S>;
  sequencer: (o: SequencerOptions) => Sequencer;
};

export const correct: Variant = {
  name: "correct",
  replica: (r, t, o) => new ReplicaCore(r, t, o),
  sequencer: (o) => new Sequencer(o),
};

const ROOM = "a:sim";

export function check(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export function same(a: unknown, b: unknown, message: string) {
  if (!isDeepStrictEqual(a, b)) throw new Error(`${message}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}

class Net {
  failure: unknown = null;
  healthy = false;
  private i = 0;
  constructor(
    readonly s: fc.Scheduler,
    readonly seq: Sequencer,
    private faults: Fault[],
  ) {}

  private fault(): Fault {
    if (this.healthy || this.faults.length === 0) return "ok";
    return this.faults[this.i++ % this.faults.length]!;
  }

  /** Schedule fn as a delivery, applying the next fault. Errors are kept, not lost. */
  deliver(label: string, fn: () => void) {
    const f = this.fault();
    if (f === "drop") return;
    const run = () => {
      try {
        fn();
      } catch (e) {
        this.failure ??= e;
      }
    };
    this.s.schedule(Promise.resolve(), label).then(run);
    if (f === "dup") this.s.schedule(Promise.resolve(), `${label} (dup)`).then(run);
  }
}

class Link implements Transport {
  up = false;
  private epoch = 0;
  private h: TransportHandlers | null = null;
  private conn: SequencerConnection | null = null;
  afterMessage: () => void = () => {};

  constructor(
    private net: Net,
    readonly name: string,
  ) {}

  start(h: TransportHandlers) {
    this.h = h;
    this.connect();
  }

  connect() {
    const ep = ++this.epoch;
    this.up = true;
    this.conn = this.net.seq.connect((m) => this.fromServer(ep, m));
    this.h?.open();
  }

  disconnect() {
    this.up = false;
    this.conn?.close();
    this.h?.close();
  }

  send(m: C2S) {
    if (!this.up || !this.conn) return;
    const ep = this.epoch;
    const conn = this.conn;
    const wire = JSON.stringify(m);
    this.net.deliver(`${this.name} > ${m.t}`, () => {
      if (this.epoch === ep && this.up) conn.receive(JSON.parse(wire));
    });
  }

  private fromServer(ep: number, m: S2C) {
    const wire = JSON.stringify(m);
    this.net.deliver(`${this.name} < ${m.t}`, () => {
      if (this.epoch === ep && this.up) {
        this.h?.message(JSON.parse(wire));
        this.afterMessage();
      }
    });
  }

  stop() {
    this.up = false;
    this.conn?.close();
  }
}

type Real<S> = {
  reps: SyncReplica<S>[];
  links: Link[];
  dispatched: { client: string; cseq: number; action: unknown }[];
  spec: Spec<S>;
  seq: Sequencer;
  /** The server lost its database at least once. */
  wiped: boolean;
};
type Model = { up: boolean[] };

/** Confirmed state with pending replayed using predicted Meta, computed independently. */
export function expectedState<S>(r: Reducer<S>, rep: SyncReplica<S>): S {
  let s = rep.confirmed;
  rep.pending.forEach((p, i) => {
    const meta: Meta = { seq: rep.head + i + 1, user: rep.user, time: p.time, seed: 0 };
    s = r.reduce(s, p.action, meta);
  });
  return s;
}

function checkLocal<S>(spec: Spec<S>, rep: SyncReplica<S>, when: string) {
  same(rep.state, expectedState(spec.reducer, rep), `${rep.client}: state is not confirmed + pending replay (${when})`);
}

class Dispatch<S> implements fc.AsyncCommand<Model, Real<S>> {
  constructor(
    readonly c: number,
    readonly action: unknown,
  ) {}
  check = () => true;
  async run(m: Model, r: Real<S>) {
    const rep = r.reps[this.c % m.up.length]!;
    rep.dispatch(this.action);
    const p = rep.pending[rep.pending.length - 1];
    check(p !== undefined, "dispatch must add a pending action");
    r.dispatched.push({ client: rep.client, cseq: p.cseq, action: this.action });
    checkLocal(r.spec, rep, "after dispatch");
  }
  toString = () => `dispatch(c${this.c}, ${JSON.stringify(this.action)})`;
}

class Disconnect<S> implements fc.AsyncCommand<Model, Real<S>> {
  constructor(readonly c: number) {}
  check = (m: Readonly<Model>) => m.up[this.c % m.up.length]!;
  async run(m: Model, r: Real<S>) {
    const i = this.c % m.up.length;
    m.up[i] = false;
    r.links[i]!.disconnect();
  }
  toString = () => `disconnect(c${this.c})`;
}

class Reconnect<S> implements fc.AsyncCommand<Model, Real<S>> {
  constructor(readonly c: number) {}
  check = (m: Readonly<Model>) => !m.up[this.c % m.up.length]!;
  async run(m: Model, r: Real<S>) {
    const i = this.c % m.up.length;
    m.up[i] = true;
    r.links[i]!.connect();
  }
  toString = () => `reconnect(c${this.c})`;
}

/** The server comes back with a new, empty database: every socket drops and reconnects. */
class Wipe<S> implements fc.AsyncCommand<Model, Real<S>> {
  check = () => true;
  async run(m: Model, r: Real<S>) {
    r.seq.wipe();
    r.wiped = true;
    r.links.forEach((link, i) => {
      if (!m.up[i]) return;
      link.disconnect();
      link.connect();
    });
  }
  toString = () => "wipe()";
}

/** The next n writes fail on the server. */
class Fail<S> implements fc.AsyncCommand<Model, Real<S>> {
  constructor(readonly n: number) {}
  check = () => true;
  async run(_m: Model, r: Real<S>) {
    r.seq.failWrites(this.n);
  }
  toString = () => `fail(${this.n})`;
}

export type PropertyOptions = { wipes?: boolean; failures?: boolean };

/** The sync property for one reducer against one implementation variant. */
export function syncProperty<S>(spec: Spec<S>, variant: Variant = correct, po: PropertyOptions = {}) {
  const client = fc.nat({ max: 4 });
  const dispatch = fc.tuple(client, spec.action).map(([c, a]) => new Dispatch<S>(c, a));
  // fc.commands picks uniformly among these, so repeat dispatch to weight it.
  const list: fc.Arbitrary<fc.AsyncCommand<Model, Real<S>>>[] = [
    dispatch, dispatch, dispatch, dispatch, client.map((c) => new Disconnect<S>(c)), client.map((c) => new Reconnect<S>(c)),
  ];
  if (po.wipes) list.push(fc.constant(new Wipe<S>()));
  if (po.failures) list.push(fc.integer({ min: 1, max: 3 }).map((n) => new Fail<S>(n)));
  const commands = fc.commands(list, { maxCommands: 100, size: "large" });
  const faults = fc.array(fc.constantFrom<Fault>("ok", "ok", "ok", "ok", "ok", "ok", "drop", "dup"), { maxLength: 60, size: "large" });

  return fc.asyncProperty(
    fc.scheduler(),
    fc.integer({ min: 2, max: 5 }),
    faults,
    commands,
    fc.nat(),
    async (s, n, plan, cmds, seed) => {
      let clock = 1_000;
      const now = () => (clock += 7);
      const seq = variant.sequencer({ now, seed });
      const net = new Net(s, seq, plan);
      const real: Real<S> = { reps: [], links: [], dispatched: [], spec, seq, wiped: false };
      for (let i = 0; i < n; i++) {
        const link = new Link(net, `c${i}`);
        // Resends after store_failed wait for the heal's reconnect: no real timers in here.
        const rep = variant.replica(spec.reducer, link, { room: ROOM, user: `u${i % 3}`, client: `c${i}`, now, retryMs: 1e9 });
        link.afterMessage = () => checkLocal(spec, rep, "after a message");
        real.links.push(link);
        real.reps.push(rep);
      }

      await fc.scheduledModelRun(s, () => ({ model: { up: real.links.map(() => true) }, real }), cmds);

      // Heal: a clean network and a fresh connection for everyone, then let it all settle.
      net.healthy = true;
      seq.failWrites(0);
      for (const link of real.links) {
        if (link.up) link.disconnect();
        link.connect();
      }
      await s.waitIdle();
      for (const rep of real.reps) rep.close();
      if (net.failure) throw net.failure;

      const log: readonly Entry[] = seq.log(ROOM);
      log.forEach((e, i) => check(e.seq === i + 1, `log has a gap at index ${i}`));
      const fold = log.reduce(
        (st, e) => spec.reducer.reduce(st, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed }),
        spec.reducer.init({ room: ROOM, members: [] }),
      );
      for (const rep of real.reps) {
        same(rep.pending.length, 0, `${rep.client}: pending queue did not empty`);
        same(rep.head, log.length, `${rep.client}: head`);
        same(rep.confirmed, fold, `${rep.client}: confirmed state differs from a fold of the log`);
        same(rep.state, fold, `${rep.client}: state differs from a fold of the log`);
      }
      const key = (c: string, q: number) => `${c}/${q}`;
      const inLog = log.map((e) => key(e.client, e.cseq));
      same(new Set(inLog).size, inLog.length, "an action appears in the log more than once");
      for (const rep of real.reps) same(rep.epoch, seq.epoch, `${rep.client}: epoch`);
      if (real.wiped) {
        // Pending actions are discarded on a new epoch, so the log holds only some of them.
        const sent = new Set(real.dispatched.map((d) => key(d.client, d.cseq)));
        for (const k of inLog) check(sent.has(k), `the log holds ${k}, which was never dispatched`);
      } else
        same(
          [...inLog].sort(),
          real.dispatched.map((d) => key(d.client, d.cseq)).sort(),
          "the log does not hold exactly the dispatched actions",
        );
      for (const d of real.dispatched) {
        const e = log.find((x) => x.client === d.client && x.cseq === d.cseq);
        if (e || !real.wiped) same(e?.action, d.action, `action for ${key(d.client, d.cseq)}`);
      }
    },
  );
}
