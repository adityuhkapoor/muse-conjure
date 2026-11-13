// Time for the cast. The real clock is wall time and timers; the fake clock lets tests run an
// hour of a chat in well under a second, in a fixed order, so a seed gives one sequence.

export interface Clock {
  now(): number;
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, Math.max(0, ms)) as unknown as number,
  clear: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};

type Timer = { id: number; at: number; fn: () => void };

/** Timers fire in time order, ties in the order they were set. Microtasks run between timers. */
export class FakeClock implements Clock {
  #now: number;
  #timers: Timer[] = [];
  #next = 1;
  constructor(start = 1_700_000_000_000) {
    this.#now = start;
  }
  now() {
    return this.#now;
  }
  set(fn: () => void, ms: number) {
    const t = { id: this.#next++, at: this.#now + Math.max(0, ms), fn };
    this.#timers.push(t);
    return t.id;
  }
  clear(id: number) {
    this.#timers = this.#timers.filter((t) => t.id !== id);
  }
  get pending() {
    return this.#timers.length;
  }
  /** Moves time forward by `ms`, firing every timer that falls due on the way. */
  async advance(ms: number) {
    const end = this.#now + ms;
    await flush();
    for (;;) {
      let best: Timer | undefined;
      for (const t of this.#timers) if (t.at <= end && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
      if (!best) break;
      this.#timers = this.#timers.filter((t) => t !== best);
      this.#now = Math.max(this.#now, best.at);
      best.fn();
      await flush();
    }
    this.#now = end;
    await flush();
  }
}

/** Lets queued microtasks (and the in-memory network's deliveries) run. */
export async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
