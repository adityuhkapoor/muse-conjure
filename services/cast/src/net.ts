// How the cast reaches the sync server: one real `@muse/sync` shared socket per person (a hello
// names its user), or, in tests, the same interface over the in-memory Sequencer.

import { sharedSocket, type SharedSocket, type TransportHandlers } from "../../../packages/sync/src/index.ts";
import type { Sequencer } from "../../../packages/sync/src/sequencer.ts";
import type { S2C } from "../../../packages/protocol/src/index.ts";

export type Net = (label: string) => SharedSocket;

export const wsNet =
  (url: string): Net =>
  () =>
    sharedSocket(url, { backoff: (n) => Math.min(3000, 150 * 2 ** n) });

/** Sequencer-backed sockets. Deliveries are queued as microtasks, as a network would be async. */
export function memoryNet(seq: Sequencer): Net & { drop(): void; escaped: string[] } {
  // Errors that escape a receiver would crash a real process; here they are kept for tests.
  const escaped: string[] = [];
  const all: { close(): void; reopen(): void }[] = [];
  const net = (() => {
    const rooms = new Map<string, TransportHandlers>();
    let closed = false;
    const deliver = (m: S2C) =>
      queueMicrotask(() => {
        if (closed) return;
        try {
          if (m.t === "error" && m.room === undefined) for (const h of [...rooms.values()]) h.message(m);
          else rooms.get(m.room!)?.message(m);
        } catch (e) {
          escaped.push(String((e as Error)?.message ?? e));
        }
      });
    let conn = seq.connect(deliver);
    let open = true;
    const sock: SharedSocket = {
      get open() {
        return open && !closed;
      },
      transport(room) {
        return {
          start(h) {
            rooms.set(room, h);
            queueMicrotask(() => !closed && open && h.open());
          },
          send(m) {
            if (!closed && open) conn.receive(m);
          },
          stop() {
            rooms.delete(room);
          },
        };
      },
      close() {
        closed = true;
        conn.close();
      },
    };
    all.push({
      close: () => {
        open = false;
        conn.close();
        for (const h of rooms.values()) h.close();
      },
      reopen: () => {
        conn = seq.connect(deliver);
        open = true;
        for (const h of rooms.values()) h.open();
      },
    });
    return sock;
  }) as Net & { drop(): void; escaped: string[] };
  net.escaped = escaped;
  net.drop = () => {
    for (const s of all) s.close();
    queueMicrotask(() => all.forEach((s) => s.reopen()));
  };
  return net;
}
