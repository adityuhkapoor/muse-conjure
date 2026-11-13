// Stage 4 simulation: three real replicas (@muse/sync ReplicaCore) and the in-memory Sequencer,
// joined by a network the fuzzer drives one message at a time, with one disconnect and
// reconnect per user per run. The fold is the runtime's (sim/core.ts): the first entry is the
// host's @members, and member changes arrive as more @members entries. Invariants are checked
// on every replica's confirmed and optimistic state after every step, transitions on every
// reduce; at the end every replica must equal a straight fold of the server log.

import type { C2S, Entry, S2C } from "@muse/protocol";
import { ReplicaCore, Sequencer, type SequencerConnection, type Transport, type TransportHandlers } from "@muse/sync";
import { brief, canonical } from "../json.ts";
import type { TraceStep } from "../report.ts";
import { type Bad, type Case, garbage, type Kind, MEMBERS, membersFor, ROOM, Room, T0, USERS, type W } from "./core.ts";

/** One simulated socket: queues in both directions, delivered only when the fuzzer says so. */
class SimLink implements Transport {
  h!: TransportHandlers;
  up: C2S[] = [];
  down: S2C[] = [];
  conn: SequencerConnection | null = null;
  start(h: TransportHandlers) {
    this.h = h;
  }
  send(m: C2S) {
    if (this.conn) this.up.push(m);
  }
  stop() {}
}

type Peer = { r: ReplicaCore<W>; link: SimLink; user: string; dropped: boolean };

export type SyncResult = { trace: TraceStep[]; fail?: Bad };

export function runSync(room: Room, c: Case): SyncResult {
  const trace: TraceStep[] = [];
  let bad: Bad | null = null;
  let clock = T0;
  // Garbage the fuzzer sent, by canonical JSON: throwing on it is allowed, on anything else not.
  const junk = new Set<string>();
  const kindOf = (a: unknown): Kind => (a && typeof a === "object" && (a as { t?: unknown }).t === "@members" ? "system" : junk.has(canonical(a)) ? "garbage" : "act");
  const reducer = {
    init: () => {
      const r = room.initEmpty();
      if (!r.ok) throw ((bad ??= r), new Error(r.message));
      return r.state;
    },
    reduce: (s: W, a: unknown, m: { seq: number; user: string; time: number; seed: number }) => {
      const kind = kindOf(a);
      const r = room.reduce(s, a, m, kind);
      // ReplicaCore catches reducer throws (and keeps the old state); record ours first.
      if (!r.ok) throw ((bad ??= r), new Error(r.message));
      const t = kind === "system" ? null : room.checkTransitions(s, r.state, a, m);
      if (t) bad ??= { rule: "transition", message: `transition "${t.name}" ${t.message}`, detail: { transition: t.name, action: brief(a, 200) } };
      return r.state;
    },
  };
  const server = new Sequencer({ seed: c.seed || 1, now: () => clock });

  const connect = (p: Peer) => {
    p.link.conn = server.connect((m) => p.link.down.push(m));
    p.link.h.open();
  };
  let peers: Peer[];
  try {
    peers = USERS.map((user, i) => {
      const link = new SimLink();
      const r = new ReplicaCore<W>(reducer, link, { room: ROOM, user, client: `c${i + 1}`, now: () => clock });
      return { r, link, user, dropped: false };
    });
  } catch {
    return { trace, fail: bad ?? { rule: "init-throws", message: "init failed" } };
  }
  const deliverUp = (p: Peer, record: boolean) => {
    const m = p.link.up.shift()!;
    if (record) trace.push(m.t === "act" ? { step: "deliver", user: p.user, cseq: m.cseq } : { step: "deliver", user: p.user, cseq: 0 });
    p.link.conn!.receive(m);
  };
  const deliverDown = (p: Peer, record: boolean) => {
    const m = p.link.down.shift()!;
    if (record) {
      if (m.t === "entry") trace.push({ step: "receive", user: p.user, seq: m.entry.seq });
      else if (m.t === "welcome") trace.push({ step: "receive", user: p.user, seq: m.head });
    }
    p.link.h.message(m);
  };
  // Handshake: everyone joins and the host records the members, before the first command (not
  // part of the trace).
  for (const p of peers) connect(p);
  for (const p of peers) while (p.link.up.length) deliverUp(p, false);
  for (const p of peers) while (p.link.down.length) deliverDown(p, false);
  peers[0]!.r.dispatch({ t: "@members", members: MEMBERS });
  for (const p of peers) while (p.link.up.length) deliverUp(p, false);
  for (const p of peers) while (p.link.down.length) deliverDown(p, false);

  const checked = new WeakSet<object>();
  const check = (): Bad | null => {
    if (bad) return bad;
    for (const p of peers) {
      for (const [label, s] of [
        ["confirmed", p.r.confirmed],
        ["optimistic", p.r.state],
      ] as const) {
        if (s && typeof s === "object") {
          if (checked.has(s)) continue;
          checked.add(s);
        }
        const v = room.checkInvariants(s);
        if (v)
          return {
            rule: "invariant",
            message: `invariant "${v.name}" ${v.message} on ${p.user}'s ${label} state`,
            detail: { invariant: v.name, user: p.user, which: label, state: brief(s, 600) },
          };
      }
    }
    return null;
  };
  const reconnect = (p: Peer) => {
    trace.push({ step: "reconnect", user: p.user });
    connect(p);
  };

  for (const cmd of c.cmds) {
    clock += 1000;
    const p = peers["u" in cmd ? cmd.u % 3 : 0]!;
    switch (cmd.k) {
      case "act": {
        const a = room.arbitrary(p.r.state, p.user, cmd.s);
        if (!a.ok) return { trace, fail: a };
        if (a.action === null) continue;
        trace.push({ step: "act", user: p.user, action: a.action });
        p.r.dispatch(a.action);
        break;
      }
      case "garbage": {
        const real = room.arbitrary(p.r.state, p.user, cmd.s);
        if (!real.ok) return { trace, fail: real };
        const g = garbage(cmd.g, cmd.s, real.action);
        trace.push({ step: "garbage", user: p.user, action: g });
        junk.add(canonical(g));
        // Garbage may be dropped, ignored or even applied; it must not break an invariant.
        const meta = { seq: p.r.head + p.r.pending.length + 1, user: p.user, time: clock, seed: 0 };
        const out = room.reduce(p.r.state, g, meta, "garbage");
        if (!out.ok) return { trace, fail: out };
        const v = room.checkInvariants(out.state);
        if (v)
          return {
            trace,
            fail: {
              rule: "garbage-breaks-invariant",
              message: `the malformed action ${brief(g, 120)} broke invariant "${v.name}" (${v.message}). Check every field's type in reduce.`,
              detail: { invariant: v.name, before: brief(p.r.state.s, 400), after: brief(out.state.s, 400) },
            },
          };
        p.r.dispatch(g);
        break;
      }
      case "members": {
        const members = membersFor(cmd.mask);
        trace.push({ step: "members", members: members.map((m) => m.id) });
        p.r.dispatch({ t: "@members", members });
        break;
      }
      case "deliver":
        if (!p.link.conn || !p.link.up.length) continue;
        deliverUp(p, true);
        break;
      case "recv":
        if (!p.link.conn || !p.link.down.length) continue;
        deliverDown(p, true);
        break;
      case "drop":
        if (!p.link.conn || p.dropped) continue;
        trace.push({ step: "disconnect", user: p.user });
        p.dropped = true;
        p.link.conn.close();
        p.link.conn = null;
        p.link.up = [];
        p.link.down = [];
        p.link.h.close();
        break;
      case "rejoin":
        if (p.link.conn) continue;
        reconnect(p);
        break;
    }
    const b = check();
    if (b) return { trace, fail: b };
  }

  // Settle: everyone reconnects; every message is delivered and received.
  trace.push({ step: "settle" });
  for (const p of peers) if (!p.link.conn) reconnect(p);
  for (let guard = 0; guard < 20000; guard++) {
    const p = peers.find((q) => q.link.up.length || q.link.down.length);
    if (!p) break;
    if (p.link.up.length) deliverUp(p, false);
    else deliverDown(p, false);
    const b = check();
    if (b) return { trace, fail: b };
  }

  // Every replica must equal a straight fold of the log.
  const log: readonly Entry[] = server.log(ROOM);
  const init = room.initEmpty();
  if (!init.ok) return { trace, fail: init };
  let s = init.state;
  for (const e of log) {
    const r = room.reduce(s, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed }, kindOf(e.action));
    if (!r.ok) return { trace, fail: r };
    s = r.state;
  }
  const want = canonical(s);
  for (const p of peers) {
    if (p.r.pending.length || p.r.head !== log.length)
      return { trace, fail: { rule: "convergence", message: `${p.user} did not catch up: head ${p.r.head} of ${log.length}, ${p.r.pending.length} pending` } };
    for (const [label, got] of [
      ["confirmed", p.r.confirmed],
      ["optimistic", p.r.state],
    ] as const)
      if (canonical(got) !== want)
        return {
          trace,
          fail: {
            rule: "convergence",
            message: `${p.user}'s ${label} state differs from a straight replay of the server log`,
            detail: { replica: brief(got, 400), replay: brief(s, 400) },
          },
        };
  }
  const sb = room.summary(peers[0]!.r.state);
  if (sb) return { trace, fail: sb };
  return { trace };
}
