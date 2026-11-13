// Wire types. Source of truth: docs/CONTRACTS.md section 1. Keep in step with server/.

export type C2S =
  | { t: "hello"; room: string; client: string; user: string; have: number }
  | { t: "act"; room: string; cseq: number; action: unknown }
  | { t: "eph"; room: string; key: string; value: unknown };

export type Entry = {
  seq: number;
  client: string;
  cseq: number;
  user: string;
  time: number;
  seed: number;
  action: unknown;
};

/** `epoch` names the server's database. A new epoch means the log was replaced: start over. */
export type S2C =
  | { t: "welcome"; room: string; epoch: string; head: number; entries: Entry[] }
  | { t: "entry"; room: string; entry: Entry }
  | { t: "eph"; room: string; user: string; key: string; value: unknown }
  | { t: "error"; room?: string; code: ErrorCode; message: string };

export type ErrorCode = "not_joined" | "bad_message" | "store_failed";

export type Member = { id: string; name: string; avatar?: string };
export type Meta = { seq: number; user: string; time: number; seed: number };
export type InitCtx = { room: string; members: Member[] };

export interface Reducer<S> {
  init(ctx: InitCtx): S;
  reduce(state: S, action: unknown, meta: Meta): S;
}
export { miniName, sentenceCase } from "./mini-name.ts";
