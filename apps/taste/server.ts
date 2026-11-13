// The taste app's server: builds the app, serves it, picks what to show next, and appends every
// judgment to data/taste/swipes.jsonl the moment it arrives. Retrains after every 10 judgments.
//
// Binds to 127.0.0.1 and to this machine's private addresses only (LAN and Tailscale), never
// 0.0.0.0, and refuses requests from any public address. No tunnel.
//
//   bun run taste                 build, start, print URLs
//   TASTE_PORT=5180               port (default 5180)
//   TASTE_SCREENS=off             leave shell screens out of the stack
//   TASTE_DIR=/path               where swipes.jsonl and model.json live (default data/taste)

import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { compileApp } from "@muse/sandbox/compile";
import {
  appendLine,
  dataDir,
  ensureDir,
  Fitted,
  keyOf,
  newHistory,
  noteDone,
  noteShown,
  pairKey,
  readLines,
  saveModel,
  selectNext,
  summarize,
  train,
  effective,
  type Candidate,
  type History,
  type Judgment,
  type Line,
  type Model,
  rand,
} from "@muse/taste";
import { buildStack, featuresOf, type CopyItem, type Item, type ToolItem } from "@muse/taste/items";
import { toolPayload, type ToolPayload } from "@muse/taste/tools";

const DIST = join(import.meta.dir, "dist");
const RETRAIN_EVERY = 10;

export type ServerOpts = { port?: number; dir?: string; screens?: boolean; build?: boolean; /** Bind 127.0.0.1 only (tests). */ localOnly?: boolean; quiet?: boolean };

/** What the app gets for one thing to judge. Features stay on the server. */
export type Shown =
  | { key: string; mode: "single"; kind: "copy"; id: string; text: string; role: string }
  | { key: string; mode: "pair"; kind: "copy"; a: { id: string; text: string; role: string }; b: { id: string; text: string; role: string } }
  | ({ key: string; mode: "single"; kind: "tool"; id: string; knobs: ToolItem["knobs"] } & ToolPayload)
  | { key: string; mode: "single"; kind: "motion"; id: string; transition: string; curve: unknown; preset: string }
  | { key: string; mode: "single"; kind: "screen"; id: string; url: string; alt: string };

// ---------------------------------------------------------------------------------------------
// Addresses

const isPrivateV4 = (a: string) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a);
const isTailscale = (a: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a);
/** Loopback, RFC 1918, Tailscale (100.64/10, fd7a:115c:a1e0::/48), IPv6 link-local and unique local. */
export function isPrivate(addr: string): boolean {
  const a = addr.replace(/^::ffff:/, "");
  if (a === "::1" || a === "localhost") return true;
  if (/^[\d.]+$/.test(a)) return isPrivateV4(a);
  return /^(fe80:|fc|fd)/i.test(a);
}
function privateAddresses(): { address: string; tailscale: boolean }[] {
  const out: { address: string; tailscale: boolean }[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? []) if (n.family === "IPv4" && !n.internal && isPrivateV4(n.address)) out.push({ address: n.address, tailscale: isTailscale(n.address) });
  return out;
}

// ---------------------------------------------------------------------------------------------

export async function buildApp(): Promise<void> {
  const { build } = await import("vite");
  await build({ root: import.meta.dir, logLevel: "warn" });
}

export async function startServer(o: ServerOpts = {}) {
  const dir = o.dir ?? dataDir();
  ensureDir(dir);
  if (o.build !== false || !existsSync(join(DIST, "index.html"))) await buildApp();

  const stack = buildStack({ screens: o.screens ?? process.env.TASTE_SCREENS !== "off" });
  const byId = new Map<string, Item>(stack.map((i) => [i.id, i]));
  const names = [...new Set(stack.flatMap((i) => Object.keys(featuresOf(i))))];
  let lines: Line[] = readLines(dir);
  let model: Model = train(lines, { names });
  let fit = new Fitted(model);
  let sinceTrain = 0;
  if (lines.length) saveModel(model, dir);
  const history: History = newHistory();
  for (const j of effective(lines)) noteDone(history, j.mode === "pair" && j.a && j.b ? pairKey(j.a, j.b) : j.item);
  const rng = rand((Date.now() & 0xffffffff) >>> 0);
  const issued = new Map<string, Candidate>();
  const tools = new Map<string, Promise<ToolPayload>>();

  const retrain = () => {
    model = train(lines, { names });
    fit = new Fitted(model);
    sinceTrain = 0;
    saveModel(model, dir);
  };

  async function show(c: Candidate): Promise<Shown> {
    const key = keyOf(c);
    issued.set(key, c);
    if (c.mode === "pair") {
      const s = (x: CopyItem) => ({ id: x.id, text: x.text, role: x.role });
      // Which line goes first is random, so position is not a feature he learns to tap.
      const [a, b] = rng.next() < 0.5 ? [c.a, c.b] : [c.b, c.a];
      issued.set(key, { mode: "pair", a, b });
      return { key, mode: "pair", kind: "copy", a: s(a), b: s(b) };
    }
    const it = c.item;
    if (it.kind === "copy") return { key, mode: "single", kind: "copy", id: it.id, text: it.text, role: it.role };
    if (it.kind === "tool") {
      if (!tools.has(it.id)) tools.set(it.id, toolPayload(it, compileApp).catch((e) => (tools.delete(it.id), Promise.reject(e))));
      return { key, mode: "single", kind: "tool", id: it.id, knobs: it.knobs, ...(await tools.get(it.id)!) };
    }
    if (it.kind === "motion") return { key, mode: "single", kind: "motion", id: it.id, transition: it.transition, curve: it.curve, preset: it.preset };
    return { key, mode: "single", kind: "screen", id: it.id, url: `/api/screen/${encodeURIComponent(it.id)}`, alt: `${it.platform === "phone" ? "Phone" : "Desktop"} screen: ${it.view.replace(/-/g, " ")}, ${it.mode} mode` };
  }

  async function next(k: number, exclude: Set<string>): Promise<Shown[]> {
    const out: Shown[] = [];
    for (let i = 0, tries = 0; i < k && tries < 20; tries++) {
      const c = selectNext(fit, stack, history, { rng, exclude });
      if (!c) break;
      exclude.add(keyOf(c));
      try {
        out.push(await show(c));
      } catch (e) {
        // A library piece mid-edit that does not compile: leave it out of this session.
        if (!o.quiet) console.warn(`skipping ${keyOf(c)}: ${(e as Error).message.split("\n")[0]}`);
        noteDone(history, keyOf(c));
        continue;
      }
      noteShown(history, c);
      i++;
    }
    return out;
  }

  function judge(body: { key: string; decision: Judgment["decision"]; ms: number; interacted: boolean; order: number; session: string }): { id: string; n: number; trained: boolean; trainMs?: number } {
    const c = issued.get(body.key);
    if (!c) throw new Error("unknown key");
    const base = { v: 1 as const, type: "judge" as const, id: crypto.randomUUID(), at: new Date().toISOString(), session: String(body.session).slice(0, 64), order: Number(body.order) || 0, ms: Math.max(0, Math.round(Number(body.ms) || 0)), interacted: !!body.interacted };
    let j: Judgment;
    if (c.mode === "pair") {
      if (!["a", "b", "skip"].includes(body.decision)) throw new Error("bad decision");
      j = { ...base, mode: "pair", kind: "copy", item: `${c.a.id}|${c.b.id}`, a: c.a.id, b: c.b.id, group: c.a.group, decision: body.decision, xa: featuresOf(c.a), xb: featuresOf(c.b) };
    } else {
      if (!["like", "dislike", "love", "skip"].includes(body.decision)) throw new Error("bad decision");
      j = { ...base, mode: "single", kind: c.item.kind, item: c.item.id, group: c.item.group, decision: body.decision, x: featuresOf(c.item) };
    }
    appendLine(j, dir);
    lines.push(j);
    noteDone(history, body.key);
    let trained = false;
    if (++sinceTrain >= RETRAIN_EVERY) retrain(), (trained = true);
    return { id: j.id, n: effective(lines).length, trained, ...(trained ? { trainMs: model.ms } : {}) };
  }

  function undo(id: string): { n: number; key: string | null } {
    const j = effective(lines).find((l) => l.id === id);
    if (!j) return { n: effective(lines).length, key: null };
    const u: Line = { v: 1, type: "undo", id: crypto.randomUUID(), target: id, at: new Date().toISOString() };
    appendLine(u, dir);
    lines.push(u);
    const key = j.mode === "pair" && j.a && j.b ? pairKey(j.a, j.b) : j.item;
    history.done.delete(key);
    sinceTrain++;
    return { n: effective(lines).length, key };
  }

  const json = (x: unknown, status = 200) => Response.json(x, { status, headers: { "cache-control": "no-store" } });
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

  async function handle(req: Request, ip: string | undefined): Promise<Response> {
    if (!ip || !isPrivate(ip)) return new Response("Private network only", { status: 403 });
    const u = new URL(req.url);
    const p = u.pathname;
    try {
      if (p === "/api/next" && req.method === "GET") {
        const k = Math.min(5, Math.max(1, Number(u.searchParams.get("k")) || 1));
        const exclude = new Set((u.searchParams.get("exclude") ?? "").split(",").filter(Boolean));
        return json(await next(k, exclude));
      }
      if (p === "/api/judge" && req.method === "POST") return json(judge((await req.json()) as Parameters<typeof judge>[0]));
      if (p === "/api/undo" && req.method === "POST") return json(undo(String(((await req.json()) as { id: string }).id)));
      if (p === "/api/stats") return json({ n: effective(lines).length, trainedAt: model.trainedAt, trainMs: model.ms, stack: countKinds(stack) });
      if (p === "/api/summary") {
        if (sinceTrain) retrain();
        return json(summarize(model));
      }
      if (p.startsWith("/api/screen/")) {
        const it = byId.get(decodeURIComponent(p.slice("/api/screen/".length)));
        if (!it || it.kind !== "screen") return new Response("Not found", { status: 404 });
        return new Response(Bun.file(it.file), { headers: { "content-type": "image/png", "cache-control": "max-age=3600" } });
      }
      if (p.startsWith("/api/")) return json({ error: "not found" }, 404);
      const rel = normalize(p === "/" ? "index.html" : p.slice(1));
      if (rel.startsWith("..")) return new Response("Not found", { status: 404 });
      const file = join(DIST, rel);
      if (existsSync(file) && !file.endsWith("/")) return new Response(readFileSync(file), { headers: { "content-type": types[extname(file)] ?? "application/octet-stream" } });
      return new Response(readFileSync(join(DIST, "index.html")), { headers: { "content-type": types[".html"]! } });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // One listener per private address, so nothing listens on a public interface.
  const addrs = o.localOnly ? [] : privateAddresses();
  const servers: ReturnType<typeof Bun.serve>[] = [];
  const first = Bun.serve({ hostname: "127.0.0.1", port: o.port ?? Number(process.env.TASTE_PORT ?? 5180), fetch: (req, srv) => handle(req, srv.requestIP(req)?.address) });
  servers.push(first);
  const port = first.port;
  const lan: string[] = [], tailnet: string[] = [];
  for (const a of addrs) {
    try {
      servers.push(Bun.serve({ hostname: a.address, port, fetch: (req, srv) => handle(req, srv.requestIP(req)?.address) }));
      (a.tailscale ? tailnet : lan).push(`http://${a.address}:${port}/`);
    } catch (e) {
      if (!o.quiet) console.warn(`could not listen on ${a.address}: ${(e as Error).message}`);
    }
  }
  return {
    port,
    url: `http://localhost:${port}/`,
    lan,
    tailnet,
    dir,
    stack: countKinds(stack),
    stop() {
      for (const s of servers) s.stop(true);
    },
  };
}

function countKinds(stack: Item[]) {
  const c: Record<string, number> = { copy: 0, tool: 0, motion: 0, screen: 0 };
  for (const i of stack) c[i.kind]!++;
  return c;
}

if (import.meta.main) {
  const s = await startServer();
  console.log(`Taste is running. Judgments go to ${join(s.dir, "swipes.jsonl")}`);
  console.log(`Stack: ${s.stack.copy} copy lines, ${s.stack.tool} tools, ${s.stack.motion} motion clips, ${s.stack.screen} screens${s.stack.screen ? "" : " (no shell screenshots found; run bun run shots in apps/shell)"}`);
  console.log(`  Local:     ${s.url}`);
  for (const u of s.lan) console.log(`  LAN:       ${u}`);
  if (!s.lan.length) console.log("  LAN:       no private network address found");
  for (const u of s.tailnet) console.log(`  Tailscale: ${u}`);
  if (!s.tailnet.length) console.log("  Tailscale: not connected");
  const stop = () => (s.stop(), process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
