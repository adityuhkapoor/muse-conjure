// The shape of a generated app. Source of truth: docs/CONTRACTS.md section 3.
// packages/verify and packages/factory depend on these types; change them only with the contract.

import type { InitCtx, Member, Meta } from "@muse/protocol";
import type { Theme } from "./theme.ts";

export type { Theme };

/** Plain JSON only: what app state may contain. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Who is in the chat right now. `members` changes only through the log (`@members`). */
export type Ctx = InitCtx;

/** Seeded generator. The only source of randomness an app may use. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export type VNode = unknown;

export type ViewProps<S, A, L = Record<string, Json>> = {
  /** Confirmed state with this viewer's pending actions applied on top. */
  state: S;
  /** State from the server's log only. Show anything driven by meta.seed from here. */
  confirmed: S;
  /** True while any of this viewer's actions are unconfirmed. */
  pending: boolean;
  me: string;
  members: Member[];
  dispatch: (action: A) => void;
  theme: Theme;
  /** Per-viewer UI state that is not shared with the chat. */
  local: L;
  setLocal: (patch: Partial<L>) => void;
};

type Base<S extends Json, A extends Json, L> = {
  name: string;
  summary(state: S, ctx: Ctx): string;
  /** Runs with the members from the first `@members` entry (and with none before it arrives). */
  init(ctx: Ctx): S;
  reduce(state: S, action: A, meta: Meta, ctx: Ctx): S;
  /** Adjust state when the member list changes after the first action. Default: unchanged. */
  onMembers?(state: S, ctx: Ctx): S;
  invariants: Record<string, (state: S, ctx: Ctx) => boolean>;
  /** Checks on one step: permissions, "the action did what it says". */
  transitions?: Record<string, (prev: S, next: S, action: A, meta: Meta, ctx: Ctx) => boolean>;
  arbitrary(state: S, user: string, rng: Rng, ctx: Ctx): A | null;
  view(props: ViewProps<S, A, L>): VNode;
};

/** `local` (the initial per-viewer state) is required when L has required keys. */
export type AppDef<S extends Json, A extends Json, L extends object = Record<string, Json>> = Base<S, A, L> &
  ({} extends L ? { local?: L } : { local: L });
