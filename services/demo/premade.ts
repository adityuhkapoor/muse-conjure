// POST /premade: the catalysts' fast path (apps/shell/src/muse). The shell sends a scenario's tool
// choices in order of preference, each already filled from the page; this picks the first one
// that is available, compiles it, and answers in the same event stream as the factory's
// /generate, after a short building beat. No model call.
//
// Available means: `lab:<id>` has app.tsx, meta.json and example.ts in library/lab and, when
// scripts/labport/out/RESULTS.txt exists, its latest gate line says ok; `piece:<id>` is a library
// piece; `cache:<id>` has source.tsx in library/cache. Every scenario's chosen tool is put
// through the whole gate by `bun services/demo/check-pack.ts`.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fill, piece as getPiece } from "@muse/library";
import { compileApp } from "@muse/sandbox/compile";
import { leaks, overShape } from "../../packages/factory/src/leak.ts";
import { sseStream } from "./sse.ts";

const ROOT = resolve(import.meta.dir, "../..");
const LAB = join(ROOT, "library", "lab");
const CACHE = join(ROOT, "library", "cache");
const RESULTS = join(ROOT, "scripts", "labport", "out", "RESULTS.txt");

/** The building card shows for at least this long, so a pre-made tool does not flash in. */
export const BEAT_MS = 900;

export type Choice = { tool: string; params: Record<string, unknown> };

function labResults(): Set<string> | null {
  if (!existsSync(RESULTS)) return null;
  const ok = new Set<string>();
  for (const line of readFileSync(RESULTS, "utf8").split("\n")) {
    const m = /^\S+\s+(\S+)\s+(?:exit=\S+\s+\S+\s+)?gate=\[(.*)\]/.exec(line.trim()); // both runner formats
    if (!m) continue;
    if (m[2]!.startsWith("ok")) ok.add(m[1]!);
    else ok.delete(m[1]!);
  }
  return ok;
}

export function available(tool: string): boolean {
  const [kind, id] = tool.split(":") as [string, string];
  if (!id || /[^a-z0-9-]/.test(id)) return false;
  if (kind === "piece") return !!getPiece(id);
  if (kind === "cache") return existsSync(join(CACHE, id, "source.tsx"));
  if (kind === "lab") {
    const dir = join(LAB, id);
    if (!["app.tsx", "meta.json", "example.ts"].every((f) => existsSync(join(dir, f)))) return false;
    const ok = labResults();
    return ok ? ok.has(id) : true;
  }
  return false;
}

const START = "// @params\n";
const END = "// @end params";

/**
 * A lab tool with its params block replaced: the given params over the example's empty shape.
 * The example is a shape reference only; a key the params leave out arrives empty, never with
 * another group's content. Seeded pages pass every key themselves (check with services/demo/check-pack.ts).
 * Example content left in the given params themselves is reported, not hidden.
 */
async function labSource(id: string, params: Record<string, unknown>, context = ""): Promise<string> {
  const src = readFileSync(join(LAB, id, "app.tsx"), "utf8");
  const example = ((await import(join(LAB, id, "example.ts"))) as { default: Record<string, unknown> }).default;
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error(`lab ${id} has no // @params block`);
  const shape = JSON.parse(JSON.stringify(example)) as Record<string, unknown>;
  const missing = Object.keys(shape).filter((k) => !(k in params));
  if (missing.length) console.log(`premade: ${id} has no ${missing.join(", ")} from the page; left empty`);
  if (context) {
    const leaked = leaks(id, params, context);
    if (leaked.length) console.warn(`premade: ${id} keeps the example's ${leaked.slice(0, 3).join(", ")}`);
  }
  return `${src.slice(0, a + START.length)}const P: Params = ${JSON.stringify(overShape(shape, params), null, 2)};\n${src.slice(b)}`;
}

const contextOf = (chat?: { title?: string; messages: { from: string; text: string }[] }, members?: { id: string; name: string }[]) =>
  [chat?.title ?? "", ...(chat?.messages ?? []).map((m) => `${m.from}: ${m.text}`), ...(members ?? []).map((m) => m.name)].join("\n");

/** The source for a choice. */
export async function sourceOf(c: Choice, chat?: { title?: string; messages: { from: string; text: string }[] }, members?: { id: string; name: string }[]): Promise<string> {
  const [kind, id] = c.tool.split(":") as [string, string];
  if (kind === "piece") return fill(getPiece(id)!, { ...getPiece(id)!.defaults, ...c.params });
  if (kind === "lab") return labSource(id, c.params, chat || members ? contextOf(chat, members) : "");
  const { refill } = await import("../../library/cache/lookup.ts");
  return refill(id, chat ?? { messages: [] }, members ?? []);
}

/** The first available choice. */
export function pick(choices: Choice[]): Choice | null {
  return choices.find((c) => typeof c?.tool === "string" && available(c.tool)) ?? null;
}

const compiled = new Map<string, string>();

export async function build(choices: Choice[], chat?: { title?: string; messages: { from: string; text: string }[] }, members?: { id: string; name: string }[]): Promise<{ tool: string; code: string; source: string }> {
  const c = pick(choices);
  if (!c) throw new Error(`none of ${choices.map((x) => x.tool).join(", ")} is available`);
  const source = await sourceOf(c, chat, members);
  const key = new Bun.CryptoHasher("sha256").update(source).digest("hex");
  let code = compiled.get(key);
  if (!code) {
    code = compileApp(source).code;
    compiled.set(key, code);
  }
  return { tool: c.tool, code, source };
}

/** The gateway's handler: same events as /generate (progress, then done or error). */
export async function premadeResponse(req: Request): Promise<Response> {
  let body: { ask?: string; title?: string; premade?: { scenario?: string; choices?: Choice[]; refill?: { idea?: string } }; chat?: { title?: string; messages: { from: string; text: string }[] }; members?: { id: string; name: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  const choices = Array.isArray(body.premade?.choices) ? body.premade!.choices : [];
  const scenario = String(body.premade?.scenario ?? "");
  const stream = sseStream(async ({ send, signal }) => {
    const t0 = performance.now();
    try {
      send("progress", { t: "understanding" });
      let use = choices;
      let name = "";
      const first = pick(choices);
      if (body.premade?.refill && first?.tool.startsWith("lab:")) {
        // "Use for my group": the same tool and idea, refilled from this chat by the reader
        const { refillForChat } = await import("./reader.ts");
        const r = await refillForChat({ tool: first.tool, idea: String(body.premade.refill.idea ?? body.title ?? ""), chat: body.chat ?? { messages: [] }, members: body.members ?? [] });
        if ("params" in r) {
          use = [{ tool: first.tool, params: r.params }];
          // the tool is named for this chat's question, not the page it came from
          if (typeof r.params.title === "string" && r.params.title.trim()) name = r.params.title.trim().slice(0, 80);
        }
        else if (r.error === "the reader is off") console.warn(`premade: no model for the refill of ${first.tool}; using the page's own fill`);
        else {
          // never start a chat's tool with another page's votes and names: the empty skeleton is honest
          console.warn(`premade: refill for ${first.tool} failed (${r.error}); starting it empty`);
          use = [{ tool: first.tool, params: {} }];
        }
      }
      if (signal.aborted) return;
      const b = await build(use, body.chat, body.members);
      if (signal.aborted) return;
      send("progress", { t: "routed", path: "premade", piece: b.tool, why: `scenario ${scenario}` });
      send("progress", { t: "ready", name, summary: "" });
      const wait = BEAT_MS - (performance.now() - t0);
      if (wait > 0) await Bun.sleep(wait);
      if (signal.aborted) return;
      send("done", { name, summary: "", code: b.code, source: b.source, path: "premade", piece: b.tool, scenario, ms: Math.round(performance.now() - t0) });
      console.log(`premade: ${scenario} with ${b.tool} in ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      console.warn(`premade: failed ${scenario}: ${(e as Error).message}`);
      send("error", { message: "Muse couldn't build this one", detail: (e as Error).message });
    }
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

/** A surface tool's source by its library id (surfaces/backing.ts): a lab tool through its own
 * `// @params` block with the example under the given params (the library's fill keeps only what
 * meta.json describes, which loses nested params), else the library piece filled. */
export async function toolSource(id: string, params: Record<string, unknown>): Promise<string> {
  if (existsSync(join(LAB, id, "app.tsx")) && !getPiece(id)?.file.includes("/pieces/")) return labSource(id, params);
  const p = getPiece(id);
  if (!p) throw new Error(`no piece or lab tool "${id}"`);
  return fill({ ...p, defaults: {} }, params);
}
