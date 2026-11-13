// Posts on Home (apps/shell/src/muse/compose.ts, services/demo/posts.ts): a person writes a post
// and asks Muse. Two steps, each its own model call, streamed so the composer shows them as they
// land:
//   1. pick: a fast model reads the whole lab catalog (router.ts's cards) and the post, and picks
//      up to 3 tools that would give the post's friends something to do, or says nothing fits.
//   2. fill: for each pick, a model writes the tool's whole parameter object for this post and
//      this person. The example is shown for its shape only; none of its content may come back
//      (checked here: a string equal to one of the example's is a leak and drops the pick).
//      Options the model made up are listed as `suggested`, so the author can change them.
// And a third, slow one when nothing fits: `buildForPost` runs the compose pipeline (design, code,
// gate) for this post.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_DIR } from "@muse/library";
import { compileApp } from "@muse/sandbox/compile";
import { hashOf } from "./cache.ts";
import { compose, type ComposeEvent } from "./compose.ts";
import { labExample } from "./lab.ts";
import { GROUNDING_RULE, groundQuotes } from "./leak.ts";
import { catalog, catalogText } from "./router.ts";
import type { ModelClient } from "./types.ts";

export type PostInput = {
  text: string;
  /** the viewer's first name */
  me: string;
  /** the viewer's friends' first names */
  friends: string[];
  /** alt text of an attached photo, if any */
  photo?: string;
};

export type PostPick = { id: string; name: string; reason: string };
export type PostFilled = { id: string; name: string; title: string; read: string; params: Record<string, unknown>; suggested: string[] };
export type PostEvent =
  | { t: "picks"; picks: PostPick[]; nothingFits: boolean; reply: string; ms: number }
  | { t: "filled"; candidate: PostFilled; ms: number }
  | { t: "unfilled"; id: string; why: string }
  | { t: "done"; ms: number };

const PICK_SCHEMA = {
  type: "object",
  properties: {
    nothing_fits: { type: "boolean" },
    reply: { type: "string" },
    picks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"], additionalProperties: false } },
  },
  required: ["nothing_fits", "reply", "picks"],
  additionalProperties: false,
};

const FILL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    read: { type: "string" },
    params_json: { type: "string" },
    suggested: { type: "array", items: { type: "string" } },
  },
  required: ["title", "read", "params_json", "suggested"],
  additionalProperties: false,
};

function pickSystem(): string {
  return [
    "Someone is writing a post on Facebook Home. Their friends will see it in the feed. You choose ready-made tools from a catalog to attach to the post, so friends have something to do with it: vote, guess, rank, join, chip in, recommend, play.",
    "Read the post as a friend would: where they are, what they are doing, what they asked, what would be fun to answer. Pick up to 3 tool ids from the catalog, best first, each with a one-line reason of at most 12 words that names what in the post it uses (it is shown on a small card).",
    "Give the author real choices: the 3 picks should do different things (for example a vote on something in the post, a guessing game for friends, a recap or map of a trip, a list friends add recommendations to), not three versions of one idea.",
    "Good picks use what the post is about, so friends answer about it: a vote or bracket over things in the post or things like them, a guessing game about where, what or who, a trip story or recap, a list friends add recommendations to, a challenge, a sign-up or claim list. Avoid tools that ignore the post's content (random pickers, face toys, generic bets).",
    "Pick tools whose content can be written for this post. A tool made for a chat or an event can still fit a post when friends can play it from the feed.",
    "Set nothing_fits to true, with no picks, only when no tool in the catalog could be filled for this post in a way its friends would enjoy.",
    "reply: when nothing fits, one plain sentence to the author, in sentence case with no exclamation mark, saying what the post is and that nothing ready-made suits it, so Muse can make something new (for example \"A broken chain is a fix, not a game, so nothing ready-made fits.\"). Empty when you picked tools.",
    "",
    "Catalog:",
    catalogText(),
  ].join("\n");
}

const postLines = (p: PostInput) => `Author: ${p.me}\nFriends: ${p.friends.join(", ")}\nThe post: "${p.text}"${p.photo ? `\nPhoto with the post: ${p.photo}` : ""}`;

function fillSystem(): string {
  return [
    "You fill the parameters of a ready-made tool attached to one Facebook post. Reply with:",
    "- params_json: the whole parameter object as a JSON string, every key the example has, the same shape and types.",
    "- title: the tool's title as it should read on this post, short, sentence case.",
    "- read: one short line on what you used from the post, starting lowercase (for example \"the tostadas and South America in your post\").",
    "- suggested: every option, item or line you made up that is not in the post, exactly as written in params_json, so the author can change them.",
    "Rules:",
    "- The example belongs to someone else. Reuse none of its names, places, titles, items, quotes or numbers. Keep only its shape. Every string is written fresh for this post.",
    "- Take what the post says first. Where the post does not say, make up sensible content that fits this post (and list it in suggested).",
    "- The author is the host, seller or poster wherever the tool has one. Other people are the author's friends, by the names given; never other names for friends.",
    "- Nobody has used the tool yet: who voted, joined, paid, signed, claimed or posted starts empty, and counts from people outside the friends start at 0, unless the post says otherwise.",
    "- Plain words, sentence case, no exclamation marks.",
    `- ${GROUNDING_RULE} Here the context is the post, the photo description and the names given.`,
  ].join("\n");
}

function fillUser(p: PostInput, id: string, reason: string): string {
  const meta = readFileSync(join(LAB_DIR, id, "meta.json"), "utf8");
  return `Tool: ${id}\nWhy it was picked: ${reason}\nmeta.json:\n${meta}\n\nexample params (shape only, someone else's content):\n${JSON.stringify(labExample(id))}\n\n${postLines(p)}`;
}

const parse = <T>(text: string): T => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;

/** Every string in a value. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

/** The example's content strings: not words meta.json names (enums, kinds), not the post's own people. */
function exampleContent(id: string, allowed: string[]): Set<string> {
  const meta = readFileSync(join(LAB_DIR, id, "meta.json"), "utf8").toLowerCase();
  const ok = new Set(allowed.map((n) => n.toLowerCase()));
  const named = (s: string) => {
    const at = meta.indexOf(s);
    if (at < 0) return false;
    const before = meta[at - 1] ?? " ";
    const after = meta[at + s.length] ?? " ";
    return !/[a-z]/.test(before) && !/[a-z]/.test(after);
  };
  return new Set(
    strings(labExample(id))
      .map((s) => s.trim())
      .filter((s) => (s.length >= 6 || /[ ']/.test(s) || (/^[A-Z]/.test(s) && s.length >= 3)) && !/^[\d\s.:,%$-]+$/.test(s))
      .map((s) => s.toLowerCase())
      .filter((s) => !ok.has(s) && !named(s)),
  );
}

/** Keys the model left out: numbers and booleans from the example; strings and lists start empty. */
function complete(params: Record<string, unknown>, example: Record<string, unknown> | null): Record<string, unknown> {
  const out = { ...params };
  const empty = (v: unknown): unknown => (typeof v === "string" ? "" : Array.isArray(v) ? [] : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, empty(x)])) : v);
  for (const [k, v] of Object.entries(example ?? {})) if (!(k in out)) out[k] = empty(v);
  return out;
}

/** Leaked example strings in a filled object, if any. */
export function leaks(id: string, params: Record<string, unknown>, allowed: string[] = []): string[] {
  const ex = exampleContent(id, allowed);
  return [...new Set(strings(params).filter((s) => ex.has(s.trim().toLowerCase())))];
}

const picksCache = new Map<string, { picks: PostPick[]; nothingFits: boolean; reply: string }>();
const fillCache = new Map<string, PostFilled | { why: string }>();

/** Pick (cached by post), then fill up to `fill` picks in parallel (cached by post and tool), streaming each. */
export async function routePost(p: PostInput, models: { router: ModelClient; filler: ModelClient }, emit: (e: PostEvent) => void, o: { fill?: number } = {}): Promise<void> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const key = hashOf({ text: p.text.trim(), me: p.me, friends: p.friends, photo: p.photo ?? "", r: models.router.id });
  let decided = picksCache.get(key);
  if (!decided) {
    const known = new Map(catalog().map((c) => [c.id, c.name]));
    const r = parse<{ nothing_fits: boolean; reply?: string; picks: { id: string; reason: string }[] }>(
      await models.router.complete({ label: "post-route", system: pickSystem(), messages: [{ role: "user", content: postLines(p) }], json: { name: "post_route", schema: PICK_SCHEMA }, effort: "low" }),
    );
    const picks = (r.picks ?? []).filter((x) => known.has(x.id)).slice(0, 3).map((x) => ({ id: x.id, name: known.get(x.id)!, reason: String(x.reason ?? "").slice(0, 140) }));
    decided = { picks, nothingFits: !picks.length, reply: picks.length ? "" : String(r.reply ?? "").replace(/!+/g, ".").slice(0, 160) };
    picksCache.set(key, decided);
  }
  emit({ t: "picks", ...decided, ms: ms() });
  await Promise.all(
    decided.picks.slice(0, o.fill ?? 3).map(async (pick) => {
      const fk = `${key}:${pick.id}:${models.filler.id}`;
      let f = fillCache.get(fk);
      if (!f) {
        try {
          const raw = parse<{ title: string; read: string; params_json: string; suggested: string[] }>(
            await models.filler.complete({ label: "post-fill", system: fillSystem(), messages: [{ role: "user", content: fillUser(p, pick.id, pick.reason) }], json: { name: "post_fill", schema: FILL_SCHEMA }, effort: "low" }),
          );
          const obj = JSON.parse(raw.params_json) as unknown;
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("params_json is not an object");
          const params = groundQuotes(complete(obj as Record<string, unknown>, labExample(pick.id)), [p.text, p.photo ?? "", p.me, ...p.friends].join("\n")).params;
          const leaked = leaks(pick.id, params, [p.me, ...p.me.split(" "), ...p.friends]);
          if (leaked.length) throw new Error(`kept the example's ${leaked.slice(0, 3).map((s) => `"${s}"`).join(", ")}`);
          const inParams = new Set(strings(params));
          f = { id: pick.id, name: pick.name, title: String(raw.title ?? pick.name).slice(0, 80), read: String(raw.read ?? "").slice(0, 120), params, suggested: (raw.suggested ?? []).filter((s) => inParams.has(s) && s.length <= 28 && s !== p.me && !p.friends.includes(s)).slice(0, 12) };
        } catch (e) {
          f = { why: (e as Error).message.slice(0, 200) };
        }
        fillCache.set(fk, f);
      }
      if ("why" in f) emit({ t: "unfilled", id: pick.id, why: f.why });
      else emit({ t: "filled", candidate: f, ms: ms() });
    }),
  );
  emit({ t: "done", ms: ms() });
}

/** Honest progress for a new build, in the composer's words. */
export function buildStage(e: ComposeEvent): string | null {
  switch (e.t) {
    case "understanding":
      return "Reading your post";
    case "routed":
    case "designed":
      return "Planning it";
    case "drafting":
      return "Drawing it";
    case "checking":
    case "repairing":
    case "critic":
      return "Checking it";
    case "ready":
      return "Ready";
    default:
      return null;
  }
}

/** A new tool for this post through the compose pipeline (fast speed). */
export async function buildForPost(p: PostInput, models: { main: ModelClient; fast: ModelClient }, onStage: (stage: string) => void): Promise<{ code: string; name: string; summary: string }> {
  const members = [p.me, ...p.friends].map((name) => ({ id: name.toLowerCase().replace(/\W+/g, ""), name }));
  const req = {
    ask: `make something for friends to use on this post: ${p.text}`,
    chat: { title: "Post on Facebook Home", messages: [{ from: p.me, text: p.text }, ...(p.photo ? [{ from: "Facebook", text: `photo: ${p.photo}` }] : [])] },
    members,
    surface: "feed" as const,
  };
  let last = "";
  const r = await compose(req, models.main, {
    speed: "fast",
    fast: models.fast,
    onEvent: (e) => {
      const s = buildStage(e);
      if (s && s !== last) onStage((last = s));
    },
  });
  if (!r.ok || !r.source) throw new Error(r.error ?? "the new tool did not pass the gate");
  return { code: compileApp(r.source).code, name: (r as { name?: string }).name ?? "Something for this post", summary: "" };
}
