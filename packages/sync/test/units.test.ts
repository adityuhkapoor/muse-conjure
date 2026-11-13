import { describe, expect, test } from "bun:test";
import type { C2S, Entry, S2C } from "@muse/protocol";
import { createReplica, Sequencer, sharedSocket, type Transport, type TransportHandlers } from "../src/index.ts";
import { counter, seats } from "./reducers.ts";

/** A transport the test drives by hand. */
function manual() {
  const sent: C2S[] = [];
  let h: TransportHandlers | null = null;
  const t: Transport = {
    start: (x) => {
      h = x;
    },
    send: (m) => sent.push(m),
    stop: () => {},
  };
  return {
    t,
    sent,
    open: () => h!.open(),
    close: () => h!.close(),
    deliver: (m: S2C) => h!.message(m),
  };
}

const R = "a:1";
const entry = (seq: number, cseq: number, action: unknown, client = "other", user = "u9"): Entry => ({
  seq,
  client,
  cseq,
  user,
  time: 1000 + seq,
  seed: seq,
  action,
});

describe("replica", () => {
  test("applies a dispatch at once and confirms it from the entry", () => {
    const n = manual();
    const r = createReplica(counter.reducer, n.t, { room: R, user: "u1", client: "me", now: () => 5 });
    const seen: number[] = [];
    r.subscribe((s) => seen.push(s));
    n.open();
    expect(n.sent).toEqual([{ t: "hello", room: R, client: "me", user: "u1", have: 0 }]);
    r.dispatch({ add: 2 });
    expect(r.state).toBe(2);
    expect(r.confirmed).toBe(0);
    // Not welcomed yet: held, not sent.
    expect(n.sent.length).toBe(1);
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 0, entries: [] });
    expect(n.sent[1]).toEqual({ t: "act", room: R, cseq: 1, action: { add: 2 } });
    n.deliver({ t: "entry", room: R, entry: entry(1, 1, { add: 2 }, "me", "u1") });
    expect([r.confirmed, r.state, r.pending.length, r.head]).toEqual([2, 2, 0, 1]);
    expect(seen).toEqual([2]);
  });

  test("buffers out-of-order entries, ignores duplicates, asks once to fill a gap", () => {
    const n = manual();
    const r = createReplica(seats.reducer, n.t, { room: R, user: "u1", client: "me" });
    n.open();
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 0, entries: [] });
    n.deliver({ t: "entry", room: R, entry: entry(2, 1, { claim: 0 }, "x", "bob") });
    n.deliver({ t: "entry", room: R, entry: entry(3, 2, { claim: 1 }, "x", "bob") });
    expect(r.head).toBe(0);
    const hellos = n.sent.filter((m) => m.t === "hello").length;
    expect(hellos).toBe(2);
    n.deliver({ t: "entry", room: R, entry: entry(1, 1, { claim: 0 }, "y", "amy") });
    n.deliver({ t: "entry", room: R, entry: entry(1, 1, { claim: 0 }, "y", "amy") });
    expect(r.head).toBe(3);
    // amy got seat 0 first; bob's claim on 0 was a no-op, his claim on 1 stood.
    expect(r.confirmed.seats).toEqual(["amy", "bob", null, null]);
  });

  test("resends pending after reconnect with have, and replays on top of new entries", () => {
    const n = manual();
    const r = createReplica(counter.reducer, n.t, { room: R, user: "u1", client: "me" });
    n.open();
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 0, entries: [] });
    r.dispatch({ add: 1 });
    r.dispatch({ add: 10 });
    n.close();
    r.dispatch({ add: 100 });
    expect(r.state).toBe(111);
    n.sent.length = 0;
    n.open();
    expect(n.sent).toEqual([{ t: "hello", room: R, client: "me", user: "u1", have: 0 }]);
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 2, entries: [entry(1, 1, { add: 1 }, "me"), entry(2, 9, { add: 1000 })] });
    expect(r.confirmed).toBe(1001);
    expect(r.state).toBe(1111);
    expect(n.sent.slice(1).map((m) => (m.t === "act" ? m.cseq : -1))).toEqual([2, 3]);
  });

  test("a throwing reducer is a no-op and reported", () => {
    const n = manual();
    const errors: string[] = [];
    const r = createReplica(
      { init: () => 0, reduce: () => { throw new Error("boom"); } },
      n.t,
      { room: R, user: "u1", onError: (e) => errors.push(e.code) },
    );
    r.dispatch(1);
    expect(r.state).toBe(0);
    expect(errors).toEqual(["reducer_threw"]);
  });
});

describe("replica: epoch and write failures", () => {
  test("a new epoch drops confirmed state and pending, and asks again from the start", () => {
    const n = manual();
    const r = createReplica(counter.reducer, n.t, { room: R, user: "u1", client: "me" });
    n.open();
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 2, entries: [entry(1, 1, { add: 1 }), entry(2, 2, { add: 2 })] });
    r.dispatch({ add: 100 });
    expect([r.confirmed, r.state, r.head]).toEqual([3, 103, 2]);
    n.close();
    n.sent.length = 0;
    n.open();
    expect(n.sent).toEqual([{ t: "hello", room: R, client: "me", user: "u1", have: 2 }]);
    // The new database already holds 3 entries; this welcome only has the ones above 2.
    n.deliver({ t: "welcome", room: R, epoch: "e2", head: 3, entries: [entry(3, 1, { add: 7 })] });
    expect([r.confirmed, r.state, r.head, r.pending.length, r.epoch]).toEqual([0, 0, 0, 0, "e2"]);
    expect(n.sent.at(-1)).toEqual({ t: "hello", room: R, client: "me", user: "u1", have: 0 });
    n.deliver({ t: "welcome", room: R, epoch: "e2", head: 3, entries: [entry(1, 1, { add: 5 }), entry(2, 2, { add: 5 }), entry(3, 3, { add: 7 })] });
    expect([r.confirmed, r.state, r.head]).toEqual([17, 17, 3]);
  });

  test("store_failed resends pending after a short wait", async () => {
    const n = manual();
    const r = createReplica(counter.reducer, n.t, { room: R, user: "u1", client: "me", retryMs: 5 });
    n.open();
    n.deliver({ t: "welcome", room: R, epoch: "e1", head: 0, entries: [] });
    r.dispatch({ add: 1 });
    n.sent.length = 0;
    n.deliver({ t: "error", room: R, code: "store_failed", message: "x" });
    n.deliver({ t: "error", room: R, code: "store_failed", message: "x" });
    await new Promise((res) => setTimeout(res, 20));
    expect(n.sent).toEqual([{ t: "act", room: R, cseq: 1, action: { add: 1 } }]);
    r.close();
  });
});

describe("shared socket", () => {
  class FakeWS {
    static OPEN = 1;
    static all: FakeWS[] = [];
    readyState = 0;
    sent: unknown[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      FakeWS.all.push(this);
    }
    send(s: string) {
      this.sent.push(JSON.parse(s));
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    up() {
      this.readyState = 1;
      this.onopen?.();
    }
    push(m: S2C) {
      this.onmessage?.({ data: JSON.stringify(m) });
    }
  }

  test("one socket carries many rooms, routes by room, and reopens them all", async () => {
    FakeWS.all = [];
    const sock = sharedSocket("ws://x/ws", { WebSocket: FakeWS as unknown as typeof WebSocket, backoff: () => 1 });
    const a = createReplica(counter.reducer, sock.transport("a:1"), { room: "a:1", user: "u1", client: "ca" });
    const b = createReplica(counter.reducer, sock.transport("a:2"), { room: "a:2", user: "u1", client: "cb" });
    expect(FakeWS.all.length).toBe(1);
    const ws = FakeWS.all[0]!;
    ws.up();
    expect(ws.sent.map((m: any) => m.room).sort()).toEqual(["a:1", "a:2"]);
    ws.push({ t: "welcome", room: "a:1", epoch: "e", head: 1, entries: [{ ...entry(1, 1, { add: 4 }) }] });
    ws.push({ t: "welcome", room: "a:2", epoch: "e", head: 0, entries: [] });
    expect([a.state, b.state]).toEqual([4, 0]);
    b.dispatch({ add: 2 });
    expect(ws.sent.at(-1)).toEqual({ t: "act", room: "a:2", cseq: 1, action: { add: 2 } });
    ws.close();
    expect([a.live, b.live]).toEqual([false, false]);
    await new Promise((res) => setTimeout(res, 10));
    expect(FakeWS.all.length).toBe(2);
    const ws2 = FakeWS.all[1]!;
    ws2.up();
    expect(ws2.sent).toEqual([
      { t: "hello", room: "a:1", client: "ca", user: "u1", have: 1 },
      { t: "hello", room: "a:2", client: "cb", user: "u1", have: 0 },
    ]);
    ws2.push({ t: "welcome", room: "a:2", epoch: "e", head: 0, entries: [] });
    expect(ws2.sent.at(-1)).toEqual({ t: "act", room: "a:2", cseq: 1, action: { add: 2 } });
    a.close();
    b.close();
    sock.close();
  });
});

describe("sequencer model", () => {
  function setup() {
    let t = 0;
    const seq = new Sequencer({ now: () => t, seed: 3 });
    const inbox = (): S2C[] => [];
    const a = { got: inbox(), conn: null as any };
    const b = { got: inbox(), conn: null as any };
    a.conn = seq.connect((m) => a.got.push(m));
    b.conn = seq.connect((m) => b.got.push(m));
    return { seq, a, b, tick: (ms: number) => (t += ms) };
  }

  test("orders, dedupes and answers a resend with the original entry", () => {
    const { seq, a } = setup();
    a.conn.receive({ t: "act", room: R, cseq: 1, action: 1 });
    expect(a.got[0]).toMatchObject({ t: "error", code: "not_joined" });
    a.conn.receive({ t: "hello", room: R, client: "ca", user: "u1", have: 0 });
    a.conn.receive({ t: "act", room: R, cseq: 1, action: "x" });
    a.conn.receive({ t: "act", room: R, cseq: 1, action: "y" });
    a.conn.receive({ t: "act", room: R, cseq: 2, action: "z" });
    expect(seq.log(R).map((e) => [e.seq, e.cseq, e.action])).toEqual([[1, 1, "x"], [2, 2, "z"]]);
    for (const e of seq.log(R)) expect(e.seed >>> 0).toBe(e.seed);
    // A connection whose have covers seq 1 gets the original back on resend.
    const got: S2C[] = [];
    const c = seq.connect((m) => got.push(m));
    c.receive({ t: "hello", room: R, client: "ca", user: "u1", have: 2 });
    c.receive({ t: "act", room: R, cseq: 1, action: "again" });
    expect(got[1]).toMatchObject({ t: "entry", entry: { seq: 1, action: "x" } });
    expect(seq.log(R).length).toBe(2);
  });

  test("welcome carries entries after have; time never goes back", () => {
    const { seq, a, b, tick } = setup();
    a.conn.receive({ t: "hello", room: R, client: "ca", user: "u1", have: 0 });
    tick(100);
    a.conn.receive({ t: "act", room: R, cseq: 1, action: 1 });
    tick(-50); // a clock step backwards
    a.conn.receive({ t: "act", room: R, cseq: 2, action: 2 });
    const [e1, e2] = seq.log(R);
    expect(e2!.time).toBeGreaterThanOrEqual(e1!.time);
    b.conn.receive({ t: "hello", room: R, client: "cb", user: "u2", have: 1 });
    expect(b.got[0]).toMatchObject({ t: "welcome", head: 2, entries: [{ seq: 2 }] });
  });

  test("eph fans out to others, last value wins for joiners, expires after 5 s, is not logged", () => {
    const { seq, a, b, tick } = setup();
    a.conn.receive({ t: "hello", room: R, client: "ca", user: "u1", have: 0 });
    b.conn.receive({ t: "hello", room: R, client: "cb", user: "u2", have: 0 });
    a.conn.receive({ t: "eph", room: R, key: "typing", value: true });
    a.conn.receive({ t: "eph", room: R, key: "typing", value: false });
    expect(b.got.filter((m) => m.t === "eph").map((m) => (m as { value: unknown }).value)).toEqual([true, false]);
    expect(a.got.filter((m) => m.t === "eph")).toEqual([]);
    const late: S2C[] = [];
    const c = seq.connect((m) => late.push(m));
    tick(4_999);
    c.receive({ t: "hello", room: R, client: "cc", user: "u3", have: 0 });
    expect(late.filter((m) => m.t === "eph")).toEqual([{ t: "eph", room: R, user: "u1", key: "typing", value: false }]);
    tick(1);
    const later: S2C[] = [];
    seq.connect((m) => later.push(m)).receive({ t: "hello", room: R, client: "cd", user: "u4", have: 0 });
    expect(later.filter((m) => m.t === "eph")).toEqual([]);
    expect(seq.log(R)).toEqual([]);
  });
});
