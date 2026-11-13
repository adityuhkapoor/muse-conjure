// Bridge messages over the MessagePort (docs/CONTRACTS.md section 4). The frame runs the real
// @muse/sync replica, so the host pipes wire messages for the app's room both ways.
import type { C2S, Member, S2C } from "@muse/protocol";
import type { Theme } from "@muse/app";

export type Mount = {
  t: "mount";
  code: string;
  room: string;
  /** This device's client id: fresh per session. */
  client: string;
  me: string;
  theme: Theme;
  /** Server-aligned ms, so the clock is right before the first tick. */
  now: number;
  /** The chat's members. Once welcomed, the frame dispatches `@members` if its log differs. */
  members?: Member[];
  /** Expose the app and replica as globalThis.__m, for the gate's render stage. */
  debug?: boolean;
};
export type HostToFrame =
  | Mount
  /** A server message for this room. */
  | { t: "recv"; m: S2C }
  /** The host's socket is (again) open: say hello, then resend pending. */
  | { t: "reconnect" }
  | { t: "members"; members: Member[] }
  | { t: "theme"; theme: Theme }
  /** Server-aligned epoch ms. Sent only while the frame has asked for the clock. */
  | { t: "tick"; now: number };
export type FrameToHost =
  /** `build`: the server start the frame document came from (a `muse-build` meta tag), when it has one. */
  | { t: "ready"; build?: string }
  /** A message for the server (hello, act or eph for this room). */
  | { t: "send"; m: C2S }
  | { t: "size"; height: number }
  | { t: "summary"; text: string }
  /** `fatal`: the tool has nothing to show (it did not load, its first render threw or drew nothing). Otherwise it keeps its last good render. */
  | { t: "error"; message: string; stack?: string; fatal?: boolean }
  | { t: "haptic"; kind: "light" | "medium" | "success" }
  | { t: "clock"; on: boolean };
