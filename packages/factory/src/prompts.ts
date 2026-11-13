// Loads the prompt files and fills their {{SLOTS}}. API.md and the example pieces are read from
// disk on every call, so prompts always carry the current API.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { piece, pieces, type Piece } from "@muse/library";
import type { GenerateRequest } from "./types.ts";

export const PROMPTS_DIR = join(import.meta.dir, "..", "prompts");
export const API_PATH = join(import.meta.dir, "..", "..", "app", "API.md");

const read = (name: string) => readFileSync(join(PROMPTS_DIR, name), "utf8");
export const fillSlots = (text: string, slots: Record<string, string>) => text.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k: string) => slots[k] ?? m);

export function apiText(): string {
  return readFileSync(API_PATH, "utf8").trim();
}

/** The build system prompt: rules, the current API and two worked examples from the library. */
export function systemPrompt(): string {
  return fillSlots(read("system.md"), {
    API: apiText(),
    EXAMPLE_1: piece("poll")!.source.trim(),
    EXAMPLE_2: piece("slots")!.source.trim(),
  });
}

export function pieceCard(p: Piece, rank?: number): string {
  return [
    `## ${p.id}: ${p.name}${rank !== undefined && rank < 3 ? "  (close match)" : ""}`,
    `Use when: ${p.use_when.join("; ")}.`,
    `Don't use when: ${p.dont_use_when.join("; ")}.`,
    `Guarantees: ${p.guarantees.join("; ")}.`,
    `Parameter schema: ${JSON.stringify(p.params)}`,
  ].join("\n");
}

export function routeSystem(ranked: Piece[]): string {
  return fillSlots(read("route.md"), { PIECES: ranked.map((p, i) => pieceCard(p, i)).join("\n\n") });
}

const SURFACE: Record<string, string> = {
  chat: "a Messenger group chat",
  event: "a Facebook event page (the people going or invited)",
  group: "a Facebook group",
  feed: "a Facebook feed post",
  marketplace: "a Marketplace listing",
  gaming: "a gaming chat",
  story: "a story frame",
};

/** The ask, the chat and the members, as the model sees them. Names only: ids are not for code. */
export function chatContext(req: GenerateRequest, facts?: { people: string[]; content: string[]; job: string }): string {
  const lines = [
    `Where: ${SURFACE[req.surface] ?? req.surface}${req.chat.title ? ` called "${req.chat.title}"` : ""}.`,
    `Members (${req.members.length}): ${req.members.map((m) => m.name).join(", ")}.`,
    `The ask: "${req.ask}"`,
    "",
    `The last ${Math.min(40, req.chat.messages.length)} messages, oldest first:`,
    ...req.chat.messages.slice(-40).map((m) => `${m.from}: ${m.text}`),
  ];
  if (facts) {
    lines.push("", "Facts pulled from the chat:", `- job: ${facts.job}`, `- people: ${facts.people.join(", ") || "none named"}`, `- content: ${facts.content.join("; ") || "none"}`);
  }
  return lines.join("\n");
}

export function routeUser(req: GenerateRequest): string {
  return `${chatContext(req)}\n\nDecide the path and fill the parameters. JSON only.`;
}

export function planUser(req: GenerateRequest, facts: Facts, base?: { piece: Piece; change: string }): string {
  return fillSlots(read("plan.md"), {
    CONTEXT: chatContext(req, facts),
    BASE: base ? `This adapts the library piece \`${base.piece.id}\` (${base.piece.name}). The change: ${base.change}\nIts guarantees today: ${base.piece.guarantees.join("; ")}.` : "This is a new tool, built from scratch.",
  });
}

export function draftUser(req: GenerateRequest, facts: Facts, plan: unknown, reference: Piece | null): string {
  return fillSlots(read("draft.md"), {
    CONTEXT: chatContext(req, facts),
    PLAN: JSON.stringify(plan, null, 2),
    REFERENCE: reference
      ? `The closest library piece, for reference only (its patterns pass the gate; do not copy its job):\n\n\`\`\`tsx\n${reference.source.trim()}\n\`\`\``
      : "",
  });
}

export function adaptUser(req: GenerateRequest, facts: Facts, plan: unknown, p: Piece, filled: string, change: string): string {
  return fillSlots(read("adapt.md"), { CONTEXT: chatContext(req, facts), CHANGE: change, PLAN: JSON.stringify(plan, null, 2), PIECE: p.id, SOURCE: filled.trim() });
}

const HINTS = JSON.parse(read("hints.json")) as Record<string, string>;

export type Failure = { rule: string; message: string; trace?: unknown[]; line?: number; detail?: Record<string, unknown> };

export function repairUser(source: string, stage: string, f: Failure): string {
  const trace = f.trace?.length
    ? `Shortest failing trace (replay it from init; users u1 u2 u3 are Maya, Leo, Ana):\n${f.trace.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}`
    : "";
  const detail = f.detail ? `Detail: ${JSON.stringify(f.detail).slice(0, 2500)}` : "";
  const line = f.line ? `Line ${f.line}: ${source.split("\n")[f.line - 1]?.trim() ?? ""}` : "";
  return fillSlots(read("repair.md"), {
    STAGE: stage,
    RULE: f.rule,
    MESSAGE: f.message,
    LINE: line,
    TRACE: trace,
    DETAIL: detail,
    HINT: HINTS[f.rule] ?? "Read the message and fix the cause.",
    SOURCE: source.trim(),
  });
}

export type Facts = { people: string[]; content: string[]; job: string };

export const allPieces = pieces;
