/**
 * Connection state for the "Reconnecting" line. `watchConnection` is called by live/socket.ts with the shared socket.
 * Quiet by design: the line appears only after the connection has been down for OFFLINE_AFTER_MS.
 */
import type { SharedSocket } from "@muse/sync";

export const OFFLINE_AFTER_MS = 2500;
type Listener = (down: boolean) => void;
const listeners = new Set<Listener>();
let down = false;

export function onDown(fn: Listener): () => void {
  listeners.add(fn);
  fn(down);
  return () => listeners.delete(fn);
}
const set = (v: boolean) => {
  if (v === down) return;
  down = v;
  listeners.forEach((fn) => fn(v));
};

export function watchConnection(s: SharedSocket): void {
  let since = 0;
  const poll = () => {
    if (s.open) since = 0;
    else if (!since) since = Date.now();
    set(!!since && Date.now() - since >= OFFLINE_AFTER_MS);
  };
  setInterval(poll, 500);
  // Coming back to the app: look again straight away instead of waiting for the next tick.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && poll());
  addEventListener("online", poll);
  addEventListener("offline", () => (since = since || Date.now() - OFFLINE_AFTER_MS));
}
