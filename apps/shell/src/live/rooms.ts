// ADAPTER: @muse/sync. The shell's own trusted rooms (chats and the directory) are sync
// replicas folding the chat reducer. Only this file calls createReplica.

import { createReplica, type SyncReplica } from "@muse/sync";
import type { Reducer } from "@muse/protocol";
import type { Socket } from "./socket";
import { rid } from "./socket";

export type Room<S> = {
  readonly room: string;
  readonly state: S;
  readonly confirmed: S;
  /** true once the server has welcomed the current connection */
  readonly live: boolean;
  dispatch(action: unknown): void;
  eph(key: string, value: unknown): void;
  subscribe(fn: (s: S) => void): () => void;
  close(): void;
};

export function openRoom<S>(
  socket: Socket,
  room: string,
  user: string,
  reducer: Reducer<S>,
  onEph?: (user: string, key: string, value: unknown) => void,
): Room<S> {
  // A fresh client id per session (contract v2), on the room's transport of the shared socket.
  const r: SyncReplica<S> = createReplica(reducer, socket.transport(room), {
    room,
    user,
    client: rid("c-"),
    ...(onEph ? { onEph } : {}),
    onError: (e) => {
      if (e.code !== "not_joined" && e.code !== "store_failed") console.warn("sync", room, e.code, e.message);
    },
  });
  return {
    room,
    get state() {
      return r.state;
    },
    get confirmed() {
      return r.confirmed;
    },
    get live() {
      return r.live;
    },
    dispatch: (a) => r.dispatch(a),
    eph: (k, v) => r.eph(k, v),
    subscribe: (fn) => r.subscribe(fn),
    close: () => r.close(),
  };
}
