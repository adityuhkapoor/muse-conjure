// A small server-side protocol client (Bun WebSocket) for the seeder and tests: hello a room,
// read its welcome, send actions with fixed cseqs, wait for them to come back.

import type { C2S, Entry, S2C } from "@muse/protocol";

export class RoomClient {
  readonly entries: Entry[] = [];
  head = 0;
  #ws: WebSocket;
  #opened: Promise<void>;
  #welcome: Promise<void>;
  #onWelcome!: () => void;
  #waiters: { pred: () => boolean; res: () => void }[] = [];

  constructor(url: string, readonly room: string, readonly client: string, readonly user: string) {
    this.#ws = new WebSocket(url);
    this.#welcome = new Promise((r) => (this.#onWelcome = r));
    this.#opened = new Promise((res, rej) => {
      this.#ws.onopen = () => res();
      this.#ws.onerror = () => rej(new Error(`could not connect to ${url}`));
    });
    this.#ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as S2C;
      if (m.t === "welcome" && m.room === room) {
        for (const e of m.entries) this.#take(e);
        this.head = Math.max(this.head, m.head);
        this.#onWelcome();
      } else if (m.t === "entry" && m.room === room) this.#take(m.entry);
      else if (m.t === "error") console.warn(`seed ${room}: ${m.code} ${m.message}`);
      this.#waiters = this.#waiters.filter((w) => (w.pred() ? (w.res(), false) : true));
    };
  }

  #take(e: Entry) {
    if (this.entries.some((x) => x.seq === e.seq)) return;
    this.entries.push(e);
    this.entries.sort((a, b) => a.seq - b.seq);
    this.head = Math.max(this.head, e.seq);
  }

  async join(): Promise<this> {
    await this.#opened;
    this.#send({ t: "hello", room: this.room, client: this.client, user: this.user, have: 0 });
    await this.#welcome;
    return this;
  }

  #send(m: C2S) {
    this.#ws.send(JSON.stringify(m));
  }

  act(cseq: number, action: unknown) {
    this.#send({ t: "act", room: this.room, cseq, action });
  }

  /** Our own entry for this cseq (sent now or in an earlier run). */
  mine(cseq: number): Entry | undefined {
    return this.entries.find((e) => e.client === this.client && e.cseq === cseq);
  }

  until(pred: () => boolean, ms = 10_000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timed out in ${this.room}`)), ms);
      this.#waiters.push({ pred, res: () => (clearTimeout(t), res()) });
    });
  }

  /** Send actions as cseq 1..n (resends of the same cseq are deduped by the server) and wait. */
  async sendAll(actions: unknown[]): Promise<Entry[]> {
    actions.forEach((a, i) => this.act(i + 1, a));
    await this.until(() => actions.every((_, i) => this.mine(i + 1)), 15_000);
    return actions.map((_, i) => this.mine(i + 1)!);
  }

  close() {
    this.#ws.close();
  }
}
