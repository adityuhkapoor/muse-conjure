// Which parts of a generated tool came from its chat, and how to swap them for another chat's.
// No model is called here: names come from the member list, options from the chat text by a few
// transparent patterns. When a slot cannot be filled it becomes a neutral label ("Option 3"), never
// a leftover from the original chat.

import type { ChatSample, Member, Params } from "./types.ts";

const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;

const UI_WORDS = new Set([
  "yes", "no", "maybe", "vote", "votes", "add", "done", "next", "back", "reset", "go", "new", "start", "close", "open", "in", "out", "going", "pick", "skip", "undo", "join", "leave", "claim", "winner",
  "light", "dark", "chat", "event", "group", "primary", "secondary", "button", "state", "action", "title", "name", "items", "item", "total", "paid", "owes", "round", "turn", "score", "scores",
]);

export const norm = (s: string) => s.toLowerCase().replace(/[$’'`]/g, "").replace(/[^a-z0-9.:\s]/g, " ").replace(/\s+/g, " ").trim();
export const unescapeLit = (s: string) => {
  try {
    return JSON.parse(`"${s.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`) as string;
  } catch {
    return s;
  }
};
export const escapeLit = (s: string) => JSON.stringify(s).slice(1, -1);

/** The part of the module before the app definition: where the chat's content sits. */
export function dataRegion(source: string): { start: number; end: number } {
  const m = /\bdefineApp\s*[<(]/.exec(source);
  return { start: 0, end: m ? m.index : Math.min(source.length, 2500) };
}

const FACT_KINDS = new Set([
  "who-said-it", "group-trivia", "two-truths", "guess-who", "most-likely-to", "over-under", "prediction-market", "lore-bingo", "chat-wrapped", "trip-timeline", "who-paid-chart",
  "attendance-board", "plans-so-far", "poll-results-chart", "expense-breakdown", "event-calendar", "game-leaderboard", "semester-recap", "rides-map", "settle-up", "trip-tab", "split-even", "split-by-item", "rent-split", "ticket-split",
]);

const SLOT_KEYS = /^(label|name|text|option|item|place|choice|chore|task|movie|song|spot|activity|venue|title|prompt|word|answer|quote|q|item)$/i;
const BLANK_KEYS = /^(note|notes|detail|details|desc|description|subtitle|sub|hint|caption|why|comment|blurb|tag)$/i;

export function extractParams(source: string, chat: ChatSample, members: Member[], kind = ""): Params & { factBound: boolean } {
  const names = members.map((m) => m.name).filter((n) => new RegExp(`\\b${esc(n)}\\b`, "i").test(source));
  const text = norm(chat.messages.map((m) => m.text).join(" \n "));
  const chatDigits = new Set(text.match(/\d+(?::\d+|\.\d+)?/g) ?? []);
  const { end } = dataRegion(source);
  const region = source.slice(0, end);
  const options: string[] = [];
  const blanks: string[] = [];
  const nameSet = new Set(members.map((m) => norm(m.name)));
  let bound = FACT_KINDS.has(kind);
  for (const m of region.matchAll(LITERAL)) {
    const raw = unescapeLit(m[1] ?? m[2] ?? "");
    const n = norm(raw);
    if (n.length < 3 || n.length > 80 || /[{}]|\$\{/.test(raw)) continue;
    if (UI_WORDS.has(n) || nameSet.has(n)) continue;
    if (!/[a-z0-9]{3}/.test(n)) continue;
    const before = region.slice(Math.max(0, m.index! - 40), m.index!);
    const key = /(\w+)\s*:\s*$/.exec(before)?.[1] ?? "";
    const element = /[\[,]\s*$/.test(before) && !key;
    const inChat = text.includes(n);
    const digits = (n.match(/\d+(?::\d+|\.\d+)?/g) ?? []).some((d) => d.length >= 2 && chatDigits.has(d));
    if (inChat && (SLOT_KEYS.test(key) || element)) {
      if (!options.includes(raw)) options.push(raw);
    } else if (inChat || digits) {
      if (BLANK_KEYS.test(key)) {
        if (!blanks.includes(raw)) blanks.push(raw);
      } else bound = true;
    }
  }
  // Numbers copied from the chat (amounts, counts) in the data region.
  const chatNums = new Set<number>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const v = Number(m[0]);
    if (v >= 6 && v !== 100 && v !== 1000) chatNums.add(v);
  }
  const numbers: number[] = [];
  for (const m of region.matchAll(/(?<![\w."'])(\d+(?:\.\d+)?)(?![\w"'])/g)) {
    const v = Number(m[1]);
    if (chatNums.has(v) || chatNums.has(v / 100)) numbers.push(v);
  }
  if (numbers.length) bound = true;
  // A line that holds a chat option and a member's name states a fact about that person.
  for (const ln of region.split("\n")) if (names.some((n) => new RegExp(`\\b${esc(n)}\\b`, "i").test(ln)) && options.some((o) => ln.includes(o))) bound = true;
  return { names, options, blanks, numbers: [...new Set(numbers)], factBound: bound };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FILLER_WORDS = new Set(["i", "we", "u", "you", "its", "it", "thats", "that", "lol", "lmao", "ok", "okay", "yeah", "ya", "yes", "no", "idk", "what", "where", "how", "can", "should", "maybe", "honestly", "im", "ill", "whos", "who", "is", "are", "do", "did", "just", "so", "but", "the", "a", "an", "to", "for", "muse", "ngl", "fr", "like", "not", "me", "my", "our", "wait", "if", "then", "or", "and", "also", "ig", "tbh", "literally", "about", "pls", "please", "make", "get", "let", "lets", "try", "go", "going", "want", "wanna", "down", "vote", "pick", "order", "do", "have", "has", "was", "were", "be", "been", "they", "he", "she", "this", "these", "those", "there", "here", "all", "any", "some", "very", "too", "really", "dont", "cant", "wont", "didnt", "isnt", "ive", "youre", "were", "ur", "tn", "rn", "one", "wed", "at", "on", "in", "of", "with", "from", "by", "up", "out", "over", "yes", "nah", "bet", "sure", "prob", "probably", "either", "both", "neither", "think", "guys", "everyone", "anyone", "someone", "ask", "bot", "poll", "list", "bracket", "split", "wheel"]);
const VERBY = new Set(["is", "are", "was", "were", "have", "has", "do", "does", "dont", "cant", "wont", "im", "ive", "not", "we", "u", "you", "i", "it", "that", "this", "they", "he", "she", "be", "been", "should", "would", "could", "will", "need", "needs", "want", "wanna", "think"]);

/** Candidate options in a chat: short phrases from "x or y", comma lists and slash lists, most list-like first. */
export function candidateOptions(chat: ChatSample, ask: string, limit = 12): string[] {
  const msgs = chat.messages.slice(-16).map((m) => m.text);
  const scored = new Map<string, { score: number; order: number }>();
  let order = 0;
  const add = (phrase: string, w: number) => {
    let words = phrase.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$\s.:-]/g, " ").split(/\s+/).filter(Boolean);
    while (words.length && FILLER_WORDS.has(words[0]!)) words.shift();
    while (words.length && FILLER_WORDS.has(words[words.length - 1]!)) words.pop();
    if (!words.length || words.length > 3 || words.some((x) => VERBY.has(x))) return;
    const p = words.join(" ").replace(/[.:-]+$/g, "");
    if (p.length < 3 || p.length > 28 || /^\d+$/.test(p) || /muse/.test(p)) return;
    const cur = scored.get(p);
    if (cur) cur.score += w;
    else scored.set(p, { score: w, order: order++ });
  };
  for (const text of [...msgs, ask]) {
    const parts = text.split(/\s+or\s+|,|\/|\s+vs\.?\s+|\s+&\s+|\s+\+\s+|\?|!|\.\s|\s+and\s+|\s+then\s+/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) for (const p of parts) add(p, 2);
    else add(text, 0.5);
  }
  return [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .map(([k]) => k)
    .slice(0, limit);
}

const style = (original: string, s: string) => {
  const titled = /^[A-Z]/.test(original) && original.split(/\s+/).length > 1 && original.split(/\s+/).every((w) => /^[A-Z0-9$]/.test(w));
  if (titled) return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (/^[A-Z]/.test(original)) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
};

export type Refilled = { source: string; unfilled: number; filled: number; names: Record<string, string> };

/** Swap an entry's names and options for the current chat's. */
export function refillSource(source: string, params: Params, chat: ChatSample, members: Member[], ask = ""): Refilled {
  const marks: string[] = [];
  const mark = (v: string) => `\u0001${marks.push(v) - 1}\u0001`;
  // 1. Options: whole string literals in the data region.
  const { end } = dataRegion(source);
  const cands = candidateOptions(chat, ask).filter((c) => !members.some((m) => norm(m.name) === norm(c)));
  const blanks = new Set((params.blanks ?? []).map(norm));
  const originals = new Map(params.options.map((o) => [norm(o), o]));
  const slotOf = new Map<string, string>();
  let used = 0;
  let unfilled = 0;
  const pick = (raw: string) => {
    const k = norm(raw);
    let v = slotOf.get(k);
    if (v === undefined) {
      const c = cands[used++];
      if (c) v = style(raw, c);
      else (unfilled++, (v = `Option ${slotOf.size + 1}`));
      slotOf.set(k, v);
    }
    return v;
  };
  let out = source.slice(0, end).replace(LITERAL, (whole, d: string | undefined, s: string | undefined) => {
    const raw = unescapeLit(d ?? s ?? "");
    if (blanks.has(norm(raw))) return whole[0]! + whole[0]!;
    if (!originals.has(norm(raw))) return whole;
    const q = whole[0]!;
    return `${q}${mark(escapeLit(pick(raw)).replace(q === "'" ? /'/g : /(?!)/g, "\\'"))}${q}`;
  }) + source.slice(end);
  // 2. Names: every mention, with the original's casing. Members map by position, wrapping.
  const mapping: Record<string, string> = {};
  const target = members.length ? members : [{ id: "", name: "Someone" }];
  params.names.forEach((n, i) => {
    const to = target[i % target.length]!.name;
    mapping[n] = to;
    out = out.replace(new RegExp(`\\b${esc(n)}\\b`, "gi"), (hit) => mark(hit === hit.toLowerCase() && hit !== hit.toUpperCase() ? to.toLowerCase() : hit === hit.toUpperCase() && hit.length > 2 ? to.toUpperCase() : to));
  });
  out = out.replace(/\u0001(\d+)\u0001/g, (_, i: string) => marks[Number(i)]!);
  return { source: out, unfilled, filled: slotOf.size - unfilled, names: mapping };
}

/** Names from a list that still appear in the source (whole words, any case). */
export function leaks(source: string, names: string[]): string[] {
  return names.filter((n) => new RegExp(`\\b${esc(n)}\\b`, "i").test(source));
}
