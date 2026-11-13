// ADAPTER: the network. One `@muse/sync` shared socket carries every room this phone uses
// (chats, the directory, tool rooms). The replicas handle epochs, resends and store_failed.

import { sharedSocket, type SharedSocket } from "@muse/sync";
import { watchConnection } from "../phone/conn"; // phone: drives the Reconnecting line

export type Socket = SharedSocket;

/** Reconnect quickly: phones drop sockets often, and the demo server restarts in well under a second. */
export const openSocket = (url: string): Socket => {
  const s = sharedSocket(url, { backoff: (n) => Math.min(3000, 150 * 2 ** n) * (0.6 + Math.random() * 0.4) });
  watchConnection(s);
  return s;
};

/** Random id that works on plain http (crypto.randomUUID needs a secure context; phones on a LAN are not). */
export function rid(prefix = ""): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return prefix + Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 14);
}
