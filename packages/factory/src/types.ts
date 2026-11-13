// Shared types for the factory. Contract: docs/CONTRACTS.md section 6.

import type { Report } from "@muse/verify";

export type { Report };

export type Member = { id: string; name: string; avatar?: string };
export type Surface = "chat" | "event" | "group" | "feed" | "marketplace" | "gaming" | "story";
export type ChatMessage = { from: string; text: string; time?: number };
/** What Muse sees of the chat: who is in it and the last ~40 messages. */
export type ChatSample = { title?: string; messages: ChatMessage[] };

export type GenerateRequest = { ask: string; chat: ChatSample; members: Member[]; surface: Surface };

export type Msg = { role: "user" | "assistant"; content: string };
export type JsonSchema = Record<string, unknown>;

/** How much the model thinks before it answers: less is faster. */
export type Effort = "minimal" | "low" | "medium" | "high";

export type CompleteRequest = {
  system: string;
  messages: Msg[];
  /** Ask for JSON matching this schema. The reply is the JSON text. */
  json?: { name: string; schema: JsonSchema };
  images?: string[];
  /** Short tag for logs and recordings: "route", "plan", "draft", "repair". */
  label?: string;
  effort?: Effort;
  /** Separates cache entries for parallel candidates with the same prompt. Not sent to the model. */
  nonce?: number;
};

export interface ModelClient {
  /** Stable id, part of the cache key, e.g. "muse:muse-ember-1.0". */
  readonly id: string;
  complete(req: CompleteRequest): Promise<string>;
}

export type Path = "reuse" | "adapt" | "build";

export type ProgressEvent =
  | { t: "understanding" }
  | { t: "routed"; path: Path; piece: string | null; why: string; /** the Mini's name, when it is a lab Mini: the card says which one it is setting up */ name?: string }
  | { t: "drafting"; candidate: number }
  | { t: "checking"; candidate: number; attempt: number }
  | { t: "repairing"; candidate: number; attempt: number; rule: string; message: string }
  | { t: "ready"; name: string; summary: string }
  | { t: "failed"; message: string };

export type Timings = Record<string, number>;

/** Why an ask ended without a Mini. Every reply carries one; no two causes share a line. */
export type ReplyCode = "answer" | "cant_act" | "wont" | "greet" | "ask" | "needs_model" | "too_slow" | "busy" | "failed" | "change";

export type GenerateResult = {
  ok: boolean;
  source: string;
  report: Report | null;
  /** Model calls that produced code (draft + repairs) for the chosen candidate; 0 for reuse. */
  attempts: number;
  timings: Timings;
  /** Which path produced it and from which piece. */
  from: { path: Path; piece: string | null; model: string; cached: boolean };
  name?: string;
  summary?: string;
  /** Present when ok is false. */
  error?: string;
  /** No tool: Muse answers in the chat with this one line instead (nothing fits, no fill held up, or offline). */
  reply?: string;
  /** Why there is no tool (a machine-readable reason) and which exit in the flow ended the ask. */
  code?: ReplyCode;
  exit?: string;
  /** A Mini offered next to a reply, as a chip the person can tap. */
  chip?: { id: string; name: string };
  /** Options in the tool the model proposed (not from the chat), shown as suggestions. */
  suggested?: string[];
  /** Per candidate: attempts, final stage, mutation score. */
  candidates?: { attempts: number; ok: boolean; stage: string; score: number | null; lines: number }[];
};
