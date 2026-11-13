// A small pool of long-lived worker threads. A task that runs past its deadline (an infinite
// loop in generated code) gets its worker terminated and replaced.

import { availableParallelism } from "node:os";

type Job = { id: number; task: string; args: unknown[]; resolve: (v: any) => void; reject: (e: Error) => void; timeoutMs: number };
type Slot = { w: Worker; busy: Job | null; timer?: ReturnType<typeof setTimeout> };

export class TimeoutError extends Error {}

export class Pool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private closed = false;

  constructor(readonly size = Math.max(2, Math.min(10, availableParallelism() - 2))) {
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const w = new Worker(new URL("./worker.ts", import.meta.url).href);
    const slot: Slot = { w, busy: null };
    w.onmessage = (ev: MessageEvent) => {
      const job = slot.busy;
      if (!job || ev.data.id !== job.id) return;
      clearTimeout(slot.timer);
      slot.busy = null;
      if (ev.data.ok) job.resolve(ev.data.out);
      else job.reject(new Error(ev.data.error));
      this.pump();
    };
    w.onerror = (ev: ErrorEvent) => {
      const job = slot.busy;
      slot.busy = null;
      clearTimeout(slot.timer);
      this.replace(slot);
      job?.reject(new Error(ev.message));
      this.pump();
    };
    // Let the process exit when the pool is idle.
    (w as unknown as { unref?: () => void }).unref?.();
    return slot;
  }

  private replace(slot: Slot) {
    slot.w.terminate();
    const i = this.slots.indexOf(slot);
    if (i >= 0 && !this.closed) this.slots[i] = this.spawn();
  }

  run<T>(task: string, args: unknown[], timeoutMs: number): Promise<T> {
    if (this.closed) return Promise.reject(new Error("pool closed"));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, task, args, resolve, reject, timeoutMs });
      this.pump();
    });
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.busy || !this.queue.length) continue;
      const job = this.queue.shift()!;
      slot.busy = job;
      slot.timer = setTimeout(() => {
        if (slot.busy !== job) return;
        slot.busy = null;
        this.replace(slot);
        job.reject(new TimeoutError(`${job.task} did not finish within ${job.timeoutMs} ms`));
        this.pump();
      }, job.timeoutMs);
      slot.w.postMessage({ id: job.id, task: job.task, args: job.args });
    }
  }

  close() {
    this.closed = true;
    for (const s of this.slots) s.w.terminate();
    this.slots = [];
  }
}

let shared: Pool | undefined;
export function sharedPool(): Pool {
  return (shared ??= new Pool());
}
export function closeSharedPool() {
  shared?.close();
  shared = undefined;
}
