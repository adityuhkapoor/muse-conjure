import type { C2S, Entry, S2C } from "@muse/protocol";

/**
 * In-memory model of the server's ordering rules (server/src/room.rs), for tests in any
 * package. Synchronous: an act is committed and broadcast inside `receive`.
 *
 * Rules mirrored: hello before act or eph; `(room, client, cseq)` applied once, a resend
 * returns the original entry only to a subscriber whose `have` already covers it (others get
 * it through the welcome or the stream); seq gap-free from 1; time non-decreasing per room;
 * uint32 seed; eph fanned out to everyone but the sender, last value per (user, key) replayed
 * to joiners for 5 s, never logged. The welcome carries the database's epoch; a `have` above
 * the head gets every entry from seq 1. `wipe()` stands for a new database (new epoch, empty
 * logs, every connection dropped); `failWrites(n)` makes the next n acts fail to store, which
 * the room reports with `store_failed` and forgets, as the server does.
 */

export type SequencerOptions = {
  now?: () => number;
  /** Seed for the uint32 generator. */
  seed?: number;
  ephTtl?: number;
};

export interface SequencerConnection {
  readonly id: number;
  receive(m: C2S): void;
  close(): void;
}

type Sub = { conn: number; have: number };
type Joined = { client: string; user: string };
type Room = {
  log: Entry[];
  dedupe: Map<string, number>;
  lastTime: number;
  subs: Map<number, Sub>;
  eph: Map<string, { msg: S2C; at: number }>;
};

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const clone = <T>(v: T): T => (v === undefined ? (null as T) : JSON.parse(JSON.stringify(v)));

export class Sequencer {
  protected rooms = new Map<string, Room>();
  protected conns = new Map<number, { send: (m: S2C) => void; joined: Map<string, Joined> }>();
  protected nextConn = 1;
  protected now: () => number;
  protected rand: () => number;
  protected ephTtl: number;
  protected failing = 0;
  protected generation = 0;
  epoch: string;

  constructor(opts: SequencerOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.rand = mulberry32(opts.seed ?? 1);
    this.ephTtl = opts.ephTtl ?? 5000;
    this.epoch = this.newEpoch();
  }

  protected newEpoch(): string {
    return `e${++this.generation}`;
  }

  /** A new, empty database: new epoch, no logs, every connection dropped. */
  wipe(): void {
    this.rooms.clear();
    this.conns.clear();
    this.epoch = this.newEpoch();
  }

  /** The next `n` acts fail to store. */
  failWrites(n: number): void {
    this.failing = n;
  }

  /** The room's log so far. */
  log(room: string): readonly Entry[] {
    return this.rooms.get(room)?.log ?? [];
  }

  protected room(name: string): Room {
    let r = this.rooms.get(name);
    if (!r) {
      r = { log: [], dedupe: new Map(), lastTime: 0, subs: new Map(), eph: new Map() };
      this.rooms.set(name, r);
    }
    return r;
  }

  /** The seq already assigned to this (room, client, cseq), if any. */
  protected findDuplicate(r: Room, client: string, cseq: number): number | undefined {
    return r.dedupe.get(`${client}\u0000${cseq}`);
  }

  connect(send: (m: S2C) => void): SequencerConnection {
    const id = this.nextConn++;
    const conn = { send, joined: new Map<string, Joined>() };
    this.conns.set(id, conn);
    return {
      id,
      receive: (m) => this.receive(id, m),
      close: () => {
        for (const room of conn.joined.keys()) this.rooms.get(room)?.subs.delete(id);
        this.conns.delete(id);
      },
    };
  }

  protected to(conn: number, m: S2C) {
    this.conns.get(conn)?.send(clone(m));
  }

  protected receive(connId: number, m: C2S) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    if (m.t === "hello") {
      const r = this.room(m.room);
      conn.joined.set(m.room, { client: m.client, user: m.user });
      r.subs.set(connId, { conn: connId, have: m.have });
      const from = m.have > r.log.length ? 0 : m.have;
      this.to(connId, { t: "welcome", room: m.room, epoch: this.epoch, head: r.log.length, entries: r.log.slice(from) });
      const now = this.now();
      for (const [k, v] of r.eph) {
        if (now - v.at >= this.ephTtl) r.eph.delete(k);
        else this.to(connId, v.msg);
      }
      return;
    }
    const j = conn.joined.get(m.room);
    if (!j) {
      this.to(connId, { t: "error", room: m.room, code: "not_joined", message: "send hello for this room first" });
      return;
    }
    const r = this.room(m.room);
    if (m.t === "eph") {
      const msg: S2C = { t: "eph", room: m.room, user: j.user, key: m.key, value: clone(m.value) };
      r.eph.set(`${j.user}\u0000${m.key}`, { msg, at: this.now() });
      for (const id of r.subs.keys()) if (id !== connId) this.to(id, msg);
      return;
    }
    const dup = this.findDuplicate(r, j.client, m.cseq);
    if (dup !== undefined) {
      const have = r.subs.get(connId)?.have ?? 0;
      const entry = r.log[dup - 1];
      if (entry && dup <= have) this.to(connId, { t: "entry", room: m.room, entry });
      return;
    }
    if (this.failing > 0) {
      this.failing--;
      for (const id of r.subs.keys()) this.to(id, { t: "error", room: m.room, code: "store_failed", message: "write failed" });
      return;
    }
    r.lastTime = Math.max(r.lastTime, this.now());
    const entry: Entry = {
      seq: r.log.length + 1,
      client: j.client,
      cseq: m.cseq,
      user: j.user,
      time: r.lastTime,
      seed: this.rand(),
      action: clone(m.action),
    };
    r.log.push(entry);
    r.dedupe.set(`${j.client}\u0000${m.cseq}`, entry.seq);
    for (const id of r.subs.keys()) this.to(id, { t: "entry", room: m.room, entry });
  }
}
