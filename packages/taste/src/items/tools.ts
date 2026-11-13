// Whole tools: each library piece and each packages/app example, in variants along the knobs in
// knobs.ts. Server side (reads files). The app mounts each one live through @muse/sandbox and plays
// a short script of other people acting first, so it shows up mid-flow.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_KNOBS, toolKnobFeatures, type Feats, type ToolKnobs } from "../features.ts";
import { rand, hash } from "../rng.ts";
import { shim, uses } from "./knobs.ts";

export type ToolItem = { id: string; kind: "tool"; group: string; piece: string; origin: "library" | "example"; knobs: ToolKnobs; x: Feats };
export type Member = { id: string; name: string };
export type ScriptStep = { user: string; action: unknown };
export type ToolPayload = { name: string; code: string; members: Member[]; me: string; script: ScriptStep[] };

const ROOT = join(import.meta.dir, "../../../..");
export const MEMBERS: Member[] = [
  { id: "maya", name: "Maya" },
  { id: "theo", name: "Theo" },
  { id: "dani", name: "Dani" },
  { id: "priya", name: "Priya" },
  { id: "sam", name: "Sam" },
];
const ME = "maya";

type Source = { piece: string; origin: ToolItem["origin"]; file: string; source: string };

let sourcesCache: Source[] | null = null;
export function toolSources(): Source[] {
  if (sourcesCache) return sourcesCache;
  const out: Source[] = [];
  const lib = join(ROOT, "library/pieces");
  for (const id of readdirSync(lib).sort()) {
    const file = join(lib, id, "piece.tsx");
    try {
      out.push({ piece: id, origin: "library", file, source: readFileSync(file, "utf8") });
    } catch {}
  }
  const ex = join(ROOT, "packages/app/examples");
  for (const f of readdirSync(ex).filter((f) => f.endsWith(".tsx")).sort()) out.push({ piece: f.replace(/\.tsx$/, ""), origin: "example", file: join(ex, f), source: readFileSync(join(ex, f), "utf8") });
  sourcesCache = out;
  return out;
}

const LEVELS: { [K in keyof ToolKnobs]: ToolKnobs[K][] } = {
  density: ["compact", "standard", "spacious"],
  accent: ["minimal", "standard", "full"],
  radius: [4, 8, 16],
  avatar: [20, 24, 32],
  progress: [true, false],
  celebrate: ["none", "color", "burst"],
  motion: ["none", "standard", "springy"],
  mode: ["light", "dark"],
};

/** Balanced variants: across one piece's variants every knob level shows up about equally. Variant 0 is Meta's default. */
export function knobVariants(seed: number, n: number): ToolKnobs[] {
  const r = rand(seed);
  const out: ToolKnobs[] = [{ ...BASE_KNOBS }];
  const perms = Object.fromEntries(Object.keys(LEVELS).map((k) => [k, r.shuffle([...Array(n).keys()])])) as Record<keyof ToolKnobs, number[]>;
  for (let i = 1; i < n; i++) {
    const k = {} as Record<string, unknown>;
    for (const key of Object.keys(LEVELS) as (keyof ToolKnobs)[]) {
      const lv = LEVELS[key] as unknown[];
      k[key] = lv[perms[key][i]! % lv.length];
    }
    out.push(k as ToolKnobs);
  }
  return out;
}

export const VARIANTS_PER_TOOL = 8;

export function toolItems(): ToolItem[] {
  const out: ToolItem[] = [];
  for (const s of toolSources()) {
    const u = uses(s.source);
    knobVariants(hash(s.piece), VARIANTS_PER_TOOL).forEach((knobs, i) => {
      out.push({ id: `tool:${s.piece}:${i}`, kind: "tool", group: `tool:${s.piece}`, piece: s.piece, origin: s.origin, knobs, x: toolKnobFeatures(knobs, s.piece, u) });
    });
  }
  return out;
}

type AppDef = {
  name: string;
  init(ctx: unknown): unknown;
  reduce(s: unknown, a: unknown, meta: unknown, ctx: unknown): unknown;
  arbitrary(s: unknown, user: string, r: unknown, ctx: unknown): unknown;
};

// Same shape as @muse/app's rng, so `arbitrary` gets what it expects.
function appRng(seed: number) {
  const r = rand(seed);
  return { next: r.next, int: r.int, pick: r.pick, shuffle: r.shuffle };
}

/**
 * A few actions by other people that change state, from the app's own `arbitrary`, so the tool
 * mounts in the middle of something. Steps that would end it early are fine; the script is short.
 */
export async function scriptFor(file: string, steps = 4): Promise<{ name: string; script: ScriptStep[] }> {
  const def = (await import(file)).default as AppDef;
  const ctx = { room: "a:taste", members: MEMBERS };
  let s = def.init(ctx);
  const r = appRng(hash(file));
  const others = MEMBERS.filter((m) => m.id !== ME).map((m) => m.id);
  const script: ScriptStep[] = [];
  for (let i = 0, tries = 0; script.length < steps && tries < 40; tries++, i++) {
    const user = others[i % others.length]!;
    let a: unknown;
    try {
      a = def.arbitrary(s, user, r, ctx);
    } catch {
      continue;
    }
    if (!a || typeof a !== "object" || String((a as { t?: unknown }).t ?? "").startsWith("@")) continue;
    let next: unknown;
    try {
      next = def.reduce(s, a, { seq: i + 2, user, time: 1_700_000_000_000 + i * 1000, seed: r.int(2 ** 32) }, ctx);
    } catch {
      continue;
    }
    if (JSON.stringify(next) === JSON.stringify(s)) continue;
    // Keep it in progress: skip actions that close, reset or finish the whole thing.
    if (/^(close|reset|finish|pick|unpick)$/.test(String((a as { t: string }).t))) continue;
    s = next;
    script.push({ user, action: a });
  }
  return { name: def.name, script };
}

/** Compile, script and wrap one tool variant for the app. `compile` is @muse/sandbox's compileApp. */
export async function toolPayload(item: ToolItem, compile: (src: string, file?: string) => { code: string }): Promise<ToolPayload> {
  const s = toolSources().find((x) => x.piece === item.piece);
  if (!s) throw new Error(`no source for ${item.piece}`);
  const { name, script } = await scriptFor(s.file);
  return { name, code: compile(shim(s.source, item.knobs), `${item.piece}.tsx`).code, members: MEMBERS, me: ME, script };
}
