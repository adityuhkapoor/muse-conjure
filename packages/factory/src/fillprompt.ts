// The short fill prompt for the fast model (Ember): the tool's params as a skeleton with one line
// per field, two worked examples of taking options and people out of a chat, and "list every
// option the chat names". Shorter than the full prompt (router.ts `fillSystem`), which the larger
// model still gets. The skeleton is the example's shape with every string emptied, so no other
// group's content reaches the model except the field notes in meta.json.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_DIR } from "@muse/library";
import { labExample } from "./lab.ts";
import { GROUNDING_RULE } from "./leak.ts";
import type { GenerateRequest } from "./types.ts";

/** The example's shape with nothing in it: strings "", numbers 0, a list as one empty item. */
export function shapeOf(v: unknown): unknown {
  if (typeof v === "string") return "";
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0])] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x)]));
  return v;
}

type Meta = { summary?: string; params?: { properties?: Record<string, { type?: string; description?: string }> } };
const metaCache = new Map<string, Meta>();
function metaOf(id: string): Meta {
  let m = metaCache.get(id);
  if (!m) {
    try {
      m = JSON.parse(readFileSync(join(LAB_DIR, id, "meta.json"), "utf8")) as Meta;
    } catch {
      m = {};
    }
    metaCache.set(id, m);
  }
  return m;
}

const oneLine = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const typeCache = new Map<string, string>();
/**
 * The Mini's own `type Params` with its doc comments and the type aliases above it (the enums a
 * field must use), as written in library/lab/<id>/app.tsx. Empty when the file has none.
 */
export function paramsType(id: string): string {
  let t = typeCache.get(id);
  if (t === undefined) {
    t = "";
    try {
      const src = readFileSync(join(LAB_DIR, id, "app.tsx"), "utf8");
      const end = src.indexOf("// @params");
      const first = src.search(/^type [A-Z]/m);
      if (end > 0 && first >= 0 && first < end && src.slice(first, end).includes("type Params")) t = src.slice(first, end).trim().slice(0, 3200);
    } catch {}
    typeCache.set(id, t);
  }
  return t;
}

/** The params as JSON lines, each with its note from meta.json: what to write there. */
export function skeleton(id: string): string {
  const ex = labExample(id) ?? {};
  const props = metaOf(id).params?.properties ?? {};
  const keys = [...new Set([...Object.keys(ex), ...Object.keys(props)])];
  const rows = keys.map((k) => {
    const shape = k in ex ? shapeOf(ex[k]) : props[k]?.type === "array" ? [] : props[k]?.type === "number" || props[k]?.type === "integer" ? 0 : "";
    const note = oneLine(props[k]?.description, 150);
    return `  ${JSON.stringify(k)}: ${JSON.stringify(shape)}${note ? `  // ${note}` : ""}`;
  });
  return `{\n${rows.join(",\n")}\n}`;
}

/** The rules the short fill prompt and one-call routing share. */
export const FILL_RULES = [
  "- List every option, place, thing, person, time, day and amount the chat names that fits a field. Read all of the recent chat, not just the last lines. Use the chat's own words for each. Never return an empty list when the chat names things for it.",
  "- People are only this chat's members, by the names given. Amounts, dates and times come from the chat's messages or a plain split or count of them.",
  "- The doc comments are each field's meaning. Their quoted examples belong to another group: never copy them. A field typed with a fixed set of words (a union) takes one of those words, never an empty string.",
  "- Nothing has happened yet. Votes, claims, payments, picks, bets, spins and moves start empty unless a person's own message says it (\"i'm in\", \"i already venmo'd\" mark that person).",
  "- A part the chat does not give stays empty (\"\", [] or 0). Only when the tool needs options and the chat named none, propose a few plain ones and copy each, exactly as written, into suggested. Never propose people, amounts or dates. Name each proposed thing in 3 or 4 words.",
  "- Leave out descriptive extras (rules, notes, subtitles, distances, ratings, prices, quotes) unless the chat says them. Never write a house rule of your own.",
  "- Plain words, sentence case, no exclamation marks. A title is the chat's own words for the choice.",
];

export function compactFillSystem(): string {
  return [
    "You fill one ready-made group-chat tool (a Mini) from one chat. Reply with params_json (the whole params object as a JSON string: the keys and types of the params type, and only values its types allow) and suggested.",
    ...FILL_RULES,
    GROUNDING_RULE,
    "",
    "Example 1. Params type: { title: string; items: { label: string; by: string }[] }. Chat: \"Ana: sushi or tacos? / Bo: tacos / Cy: or the noodle place\". Ask: \"pick for us\". Reply: {\"title\":\"Sushi, tacos or noodles\",\"items\":[{\"label\":\"Sushi\",\"by\":\"Ana\"},{\"label\":\"Tacos\",\"by\":\"Ana\"},{\"label\":\"Noodle place\",\"by\":\"Cy\"}]}, suggested [].",
    "Example 2. Params type: { title: string; slots: string[]; yes: string[] }. Chat: \"Dee: sat 3 or sun 11? / Eli: sun 11 works / Fay: i can't sat\". Reply: {\"title\":\"Sat 3 or sun 11\",\"slots\":[\"Sat 3pm\",\"Sun 11am\"],\"yes\":[\"Eli\"]}, suggested [].",
  ].join("\n");
}

const chatLines = (req: Pick<GenerateRequest, "chat">, n = 30) => req.chat.messages.slice(-n).map((m) => `${m.from}: ${m.text}`).join("\n");

export function compactFillUser(req: Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">, id: string, repair?: { params: Record<string, unknown>; errors: string[] }): string {
  const type = paramsType(id);
  const base = `Tool: ${id}. ${oneLine(metaOf(id).summary, 200)}\n${type ? `Params type (the doc comments say what each field holds; their quoted examples belong to another group):\n${type}\n\nEmpty shape:\n${JSON.stringify(shapeOf(labExample(id) ?? {}))}` : `Skeleton:\n${skeleton(id)}`}\n\nChat: ${req.chat.title ?? ""}\nMembers: ${req.members.map((m) => m.name).join(", ")}\nRecent chat:\n${chatLines(req)}\n\nThe ask: "${req.ask}"`;
  if (!repair) return base;
  return `${base}\n\nYour last fill was:\n${JSON.stringify(repair.params)}\n\nIt was turned down for these reasons. Fix every one (take the part out, or use what the chat says) and reply with the whole fill again:\n${repair.errors.map((e) => `- ${e}`).join("\n")}`;
}
