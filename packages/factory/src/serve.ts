// bun run serve: POST /generate streams progress as server-sent events and ends with the app;
// GET /health. Local prototype: no auth, binds to localhost unless HOST says otherwise.
//
// The demo shell calls this through its gateway. A request can name:
// - `piece` and `params`: fill that library piece directly (no model call), gate, compile.
// - `model`: "auto" (default), "replay" or "muse[:model]".
//   auto = the configured live model (MUSE_MODEL, default Muse), whose route
//   prefers reusing a library piece, then a recorded replay if the live model fails.
// - `chatId`: at most one build per chat at a time (409 otherwise).
// Gate runs are queued so two builds never run the gate at once. `done` carries the compiled
// module (`code`) as well as the source: compiling uses a native transform the browser lacks.

import { verify, warm, type Report } from "@muse/verify";
import { compileApp } from "@muse/sandbox/compile";
import { fill, piece as getPiece } from "@muse/library";
import { appName, generate, MODEL_DOWN } from "./generate.ts";
import { logMiss } from "./misses.ts";
import { labChoices } from "./lab.ts";
import { makeModel, DEFAULT_MODEL } from "./models/index.ts";
import { postResponse } from "./post-serve.ts"; // posts on Home
import { change, CHANGE_DOWN, type ChangeRequest, type LogEntry } from "./change.ts";
import { routerModelFor } from "./router.ts";
import type { GenerateRequest, GenerateResult, Member, ModelClient, ProgressEvent, ReplyCode, Surface } from "./types.ts";

const SURFACES: Surface[] = ["chat", "event", "group", "feed", "marketplace", "gaming", "story"];

export type ServeRequest = GenerateRequest & { chatId?: string; model?: string; piece?: string; params?: Record<string, unknown>; /** lab ids of the chat's Minis in its last 30 messages */ recentPieces?: string[] };

export function parseRequest(body: unknown): ServeRequest | string {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return "body must be a JSON object";
  if (typeof b.ask !== "string" || !b.ask.trim()) return "ask must be a non-empty string";
  const members = b.members;
  if (!Array.isArray(members) || !members.length || !members.every((m: Member) => m && typeof m.id === "string" && typeof m.name === "string"))
    return "members must be a non-empty list of { id, name }";
  const surface = (b.surface ?? "chat") as Surface;
  if (!SURFACES.includes(surface)) return `surface must be one of ${SURFACES.join(", ")}`;
  const chat = (b.chat ?? { messages: [] }) as GenerateRequest["chat"];
  if (!chat || !Array.isArray(chat.messages)) return "chat must be { title?, messages: [{ from, text }] }";
  if (b.piece !== undefined && (typeof b.piece !== "string" || !getPiece(b.piece))) return `piece "${String(b.piece)}" is not in the library`;
  if (b.params !== undefined && (typeof b.params !== "object" || b.params === null || Array.isArray(b.params))) return "params must be an object";
  if (b.model !== undefined && typeof b.model !== "string") return "model must be a string";
  if (b.chatId !== undefined && typeof b.chatId !== "string") return "chatId must be a string";
  const messages = chat.messages
    .filter((m) => m && typeof m.text === "string")
    .slice(-40)
    .map((m) => ({ from: String(m.from ?? ""), text: m.text.slice(0, 500) }));
  return {
    ask: b.ask.slice(0, 500),
    members: members.slice(0, 50).map((m: Member) => ({ id: m.id, name: m.name })),
    surface,
    chat: { ...(chat.title ? { title: String(chat.title) } : {}), messages },
    ...(typeof b.chatId === "string" ? { chatId: b.chatId } : {}),
    ...(typeof b.model === "string" ? { model: b.model } : {}),
    ...(typeof b.piece === "string" ? { piece: b.piece } : {}),
    ...(b.params ? { params: b.params as Record<string, unknown> } : {}),
    ...(Array.isArray(b.recentPieces) ? { recentPieces: (b.recentPieces as unknown[]).filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,60}$/.test(x)).slice(0, 30) } : {}),
  };
}

/** One at a time, in arrival order. */
export class Queue {
  #tail: Promise<unknown> = Promise.resolve();
  #waiting = 0;
  get waiting() {
    return this.#waiting;
  }
  run<T>(fn: () => Promise<T>, onWait?: () => void): Promise<T> {
    if (this.#waiting > 0 && onWait) onWait();
    this.#waiting++;
    const next = this.#tail.then(fn, fn);
    this.#tail = next.catch(() => {}).finally(() => this.#waiting--);
    return next;
  }
}

type Replied = { reply: string; code: ReplyCode; exit: string; chip?: { id: string; name: string }; /** code "change": the lab Mini to change */ piece?: string; model: string };
type Done = { logModel?: string; suggested?: string[]; source: string; code: string; name: string; summary: string; path: string; piece: string | null; attempts: number; timings: Record<string, number>; model: string };

export type ServerOptions = {
  port?: number;
  hostname?: string;
  /** Fixed model for every request (tests). Otherwise chosen per request. */
  model?: ModelClient;
  /** The live model behind "auto". Default MUSE_MODEL or Muse. */
  liveModel?: string;
  /** Default for requests that do not name a model. Default MUSE_DEFAULT ?? "auto". */
  defaultModel?: string;
  gate?: (source: string) => Promise<Report>;
  /** Test hook: wait this long before building (to kill the service mid-build). */
  delayMs?: number;
  /** Overall limit for one build or change. Default 90 s. */
  deadlineMs?: number;
};

/** The longest a build or a change may take in all: one honest line instead of a hang. */
export const DEADLINE_MS = 90_000;
export const TOO_SLOW = "That took too long. Try again in a moment";
/** Two asks in one chat at once: the second gets this, never silence. */
export const BUSY = "Two asks at once. Try that again in a moment";
/** A build that failed for a reason of its own (the Mini did not pass its checks, or the model broke). */
export const BUILD_FAILED = "Muse couldn't make that one work. Try again, or say it another way";
/** The silent retry of a failed live build only when this much time has passed at most. */
const RETRY_WITHIN_MS = 35_000;
const late = Symbol("late");
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof late> {
  let timer: ReturnType<typeof setTimeout>;
  p.catch(() => {}); // a call that outlives its deadline may still fail later; nobody is waiting
  return Promise.race([p, new Promise<typeof late>((r) => (timer = setTimeout(() => r(late), ms)))]).finally(() => clearTimeout(timer));
}

export function makeServer(opts: ServerOptions = {}) {
  const queue = new Queue();
  const busy = new Set<string>();
  const models = new Map<string, ModelClient>();
  const live = opts.liveModel ?? process.env.MUSE_MODEL ?? DEFAULT_MODEL;
  const fallbackDefault = opts.defaultModel ?? process.env.MUSE_DEFAULT ?? "auto";
  const delayMs = opts.delayMs ?? Number(process.env.MUSE_DELAY_MS ?? 0);
  const model = (config: string) => {
    let m = models.get(config);
    if (!m) models.set(config, (m = makeModel(config)));
    return m;
  };
  const baseGate = opts.gate ?? ((s: string) => verify(s));
  // A fill of an approved library tool is checked for its params shape and a render only; new and edited code gets the whole gate.
  const baseLightGate = opts.gate ?? ((s: string) => verify(s, { skip: ["determinism", "invariants", "mutation"] }));

  async function build(req: ServeRequest, emit: (e: ProgressEvent | { t: "queued" }) => void): Promise<Done | Replied> {
    const gate = (s: string) => queue.run(() => baseGate(s), () => emit({ t: "queued" }));
    const libraryGate = (s: string) => queue.run(() => baseLightGate(s), () => emit({ t: "queued" }));
    const neutral = (id: string) => (id === "replay" || id === "library" ? "library" : "muse");
    const finish = (source: string, r: Pick<GenerateResult, "attempts" | "timings" | "name" | "summary"> & { path: string; piece: string | null; model: string }): Done => {
      const c = compileApp(source);
      return { source, code: c.code, name: r.name ?? appName(source), summary: r.summary ?? "", path: r.path, piece: r.piece, attempts: r.attempts, timings: { ...r.timings, compile: Math.round(c.ms) / 1000 }, model: neutral(r.model) };
    };

    // 1. Library reuse straight from the shell's request: no model.
    // A lab tool named with nothing to fill it is filled for this chat below (never from its example).
    const emptyLab = !!req.piece && getPiece(req.piece)?.file.includes("/lab/") && !Object.keys(req.params ?? {}).length;
    if (req.piece && !emptyLab) {
      // The shell names a piece; the lab tool that supersedes it is what people get, filled from the
      // params and the chat (never its example). The plain piece is never shown. When none can be
      // filled, the ask goes to the model like any other ask.
      const asked = getPiece(req.piece)!;
      const t0 = performance.now();
      emit({ t: "understanding" });
      // The shell named a lab tool itself (a surface moment): that one, with the params given.
      const direct = asked.file.includes("/lab/") ? [{ lab: asked, params: req.params ?? {} }] : [];
      let why = `no lab tool for ${asked.id}`;
      for (const lab of [...direct, ...labChoices(asked.id, req.params ?? {}, req)]) {
        emit({ t: "routed", path: "reuse", piece: lab.lab.id, why: `${lab.lab.name} in place of ${asked.id}` });
        const source = fill(lab.lab, lab.params);
        emit({ t: "checking", candidate: 0, attempt: 0 });
        const report = await libraryGate(source);
        if (!report.ok) {
          why = `lab ${lab.lab.id} failed the gate: ${report.stage} ${report.failures[0]?.rule ?? ""}`;
          console.warn(`factory: ${why}`);
          continue;
        }
        const name = appName(source);
        emit({ t: "ready", name, summary: req.ask });
        return finish(source, { attempts: 0, timings: { total: Math.round(performance.now() - t0) / 1000 }, name, summary: req.ask, path: "reuse", piece: lab.lab.id, model: "library" });
      }
      // nothing the shell named can be filled from this chat: ask like any other ask (a grounded fill, or a plain reply)
      console.warn(`factory: ${why}; asking the model instead`);
    }

    // 2. A model: fixed (tests), named, or auto (live, then replay).
    // auto: the live model, once more silently when it failed early, then the recorded replays
    const chain = opts.model ? [opts.model] : (req.model ?? fallbackDefault) === "auto" ? [model(live), model(live), model("replay")] : [model(req.model ?? fallbackDefault)];
    const t0 = performance.now();
    let lastError = "no model";
    let liveFailed = false;
    for (const [i, m] of chain.entries()) {
      // the silent retry only when there is time left for it
      if (i > 0 && m === chain[i - 1] && performance.now() - t0 > RETRY_WITHIN_MS) continue;
      let r: GenerateResult;
      try {
        r = await generate(req, m, { onEvent: emit, gate, libraryGate, ...(emptyLab ? { onlyPick: req.piece! } : {}), ...(req.recentPieces?.length && !req.piece ? { recentPieces: req.recentPieces } : {}) });
      } catch (e) {
        lastError = (e as Error).message;
        if (m.id !== "replay") liveFailed = true;
        console.warn(`factory: ${m.id} threw (${lastError.slice(0, 200)})`);
        continue;
      }
      if (r.ok) return { ...finish(r.source, { ...r, path: r.from.path, piece: r.from.piece, model: m.id }), ...(r.suggested?.length ? { suggested: r.suggested } : {}), logModel: m.id };
      // a live model that failed, then nothing recorded: the model is the reason, not a missing key
      if (r.reply && liveFailed && r.code === "needs_model") return { reply: MODEL_DOWN, code: "failed", exit: `live model failed: ${lastError.slice(0, 120)}`, model: m.id };
      // no tool on purpose: Muse says one line instead (never a consolation tool, never the next model)
      if (r.reply) return { reply: r.reply, code: r.code ?? "answer", exit: r.exit ?? "", ...(r.chip ? { chip: r.chip } : {}), ...(r.code === "change" && r.from.piece ? { piece: r.from.piece } : {}), model: m.id };
      lastError = r.error ?? "failed";
      if (m.id !== "replay") liveFailed = true;
      if (chain.length > 1) console.warn(`factory: ${m.id} failed (${lastError.slice(0, 200)}), trying the next model`);
    }
    throw new Error(lastError);
  }

  /** POST /change: change a tool already in a chat (change.ts). Same models and gate queue as /generate. */
  async function changeResponse(request: Request): Promise<Response> {
    let b: Record<string, unknown>;
    try {
      b = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "body is not JSON" }, { status: 400 });
    }
    const tool = b.tool as ChangeRequest["tool"] | undefined;
    if (typeof b.ask !== "string" || !b.ask.trim() || !tool || typeof tool.source !== "string" || !Array.isArray(b.members)) return Response.json({ error: "need ask, members and tool { name, source, piece }" }, { status: 400 });
    const chat = (b.chat ?? { messages: [] }) as ChangeRequest["chat"];
    const req: ChangeRequest = {
      ask: b.ask.slice(0, 500),
      chat: { ...(chat.title ? { title: String(chat.title) } : {}), messages: (Array.isArray(chat.messages) ? chat.messages : []).slice(-40).map((m) => ({ from: String(m.from ?? ""), text: String(m.text ?? "").slice(0, 500) })) },
      members: (b.members as Member[]).slice(0, 50).map((m) => ({ id: String(m.id), name: String(m.name) })),
      explicit: b.explicit === true,
      tool: { name: String(tool.name ?? "Tool"), source: tool.source, piece: typeof tool.piece === "string" ? tool.piece : null },
      log: Array.isArray(b.log) ? (b.log as LogEntry[]).slice(-2000) : [],
      ...(typeof b.tz === "number" && Number.isFinite(b.tz) ? { tz: Math.max(-840, Math.min(840, Math.round(b.tz))) } : {}),
    };
    const cfg = typeof b.model === "string" ? b.model : fallbackDefault;
    const main = opts.model ?? (cfg === "replay" ? null : model(cfg === "auto" ? live : cfg));
    const fast = opts.model ?? (main ? routerModelFor(main) : null);
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        const send = (event: string, data: unknown) => {
          try {
            ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };
        try {
          const gate = (s: string) => queue.run(() => baseGate(s));
          const libraryGate = (s: string) => queue.run(() => baseLightGate(s));
          const r = await within(change(req, { fast, main, gate, libraryGate, onEvent: (e) => send("progress", e) }), opts.deadlineMs ?? DEADLINE_MS);
          if (r === late) {
            send("reply", { text: TOO_SLOW, code: "too_slow", ms: opts.deadlineMs ?? DEADLINE_MS });
            console.warn(`factory: change for "${req.ask.slice(0, 60)}" passed its deadline`);
            logMiss({ chat: req.chat.title ?? "", ask: req.ask, code: "too_slow", exit: "change deadline", text: TOO_SLOW });
          } else if (r.t === "done") {
            const c = compileApp(r.source);
            send("done", { ...r, code: c.code });
            console.log(`factory: changed "${req.tool.name}" (${r.tier}, room ${r.room}) for "${req.ask.slice(0, 60)}" in ${r.ms} ms`);
          } else if (r.t === "reply") {
            send("reply", { text: r.text, code: r.code ?? "failed", ms: r.ms });
            console.log(`factory: change replied to "${req.ask.slice(0, 60)}" (${r.code ?? "failed"}): ${r.text}`);
            logMiss({ chat: req.chat.title ?? "", ask: req.ask, code: r.code ?? "failed", exit: `change of ${req.tool.piece ?? req.tool.name}`, text: r.text, candidates: req.tool.piece ? [req.tool.piece] : [] });
          } else send("new", { ms: r.ms });
        } catch (e) {
          console.warn(`factory: change failed "${req.ask.slice(0, 60)}": ${(e as Error).message.slice(0, 300)}`);
          send("error", { message: CHANGE_DOWN, code: "failed", detail: "the change did not finish" });
          logMiss({ chat: req.chat.title ?? "", ask: req.ask, code: "failed", exit: `change threw: ${(e as Error).message.slice(0, 120)}` });
        }
        try {
          ctl.close();
        } catch {} // the client left
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  }

  return Bun.serve({
    port: opts.port ?? Number(process.env.PORT ?? 8788),
    hostname: opts.hostname ?? process.env.HOST ?? "127.0.0.1",
    idleTimeout: 255,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health")
        return Response.json({ ok: true, model: (opts.model?.id ?? (fallbackDefault === "auto" ? live : fallbackDefault)) === "replay" ? "replay" : "auto", queued: queue.waiting, building: busy.size });
      if (request.method === "POST" && url.pathname.startsWith("/post/")) return postResponse(request, { default: fallbackDefault, live, model }); // posts on Home: pick, fill, build
      if (request.method === "POST" && url.pathname === "/change") return changeResponse(request);
      if (request.method !== "POST" || url.pathname !== "/generate") return new Response("not found", { status: 404 });
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "body is not JSON" }, { status: 400 });
      }
      const req = parseRequest(body);
      if (typeof req === "string") return Response.json({ error: req }, { status: 400 });
      if (req.chatId && busy.has(req.chatId)) {
        logMiss({ chat: req.chatId, ask: req.ask, code: "busy", exit: "409: another ask in this chat is still running" });
        return Response.json({ error: BUSY, code: "busy" }, { status: 409 });
      }
      if (req.chatId) busy.add(req.chatId);

      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(ctl) {
          const send = (event: string, data: unknown) => {
            try {
              ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {}
          };
          const t0 = performance.now();
          try {
            if (delayMs) await Bun.sleep(delayMs);
            const r = await within(build(req, (e) => send("progress", e)), opts.deadlineMs ?? DEADLINE_MS);
            const chat = req.chatId ?? req.chat.title ?? "";
            if (r === late) {
              send("reply", { text: TOO_SLOW, code: "too_slow", ms: Math.round(performance.now() - t0) });
              console.warn(`factory: build of "${req.ask.slice(0, 60)}" passed its deadline`);
              logMiss({ chat, ask: req.ask, code: "too_slow", exit: "deadline", text: TOO_SLOW });
            } else if ("reply" in r) {
              send("reply", { text: r.reply, code: r.code, ...(r.chip ? { chip: r.chip } : {}), ...(r.piece ? { piece: r.piece } : {}), ms: Math.round(performance.now() - t0) });
              console.log(`factory: replied to "${req.ask.slice(0, 60)}" (${r.model}, ${r.code}): ${r.reply}`);
              logMiss({ chat, ask: req.ask, code: r.code, exit: r.exit, text: r.reply });
            } else {
              const { logModel, ...pub } = r;
              send("done", { ...pub, ms: Math.round(performance.now() - t0) });
              console.log(`factory: built "${r.name}" (${r.path}${r.piece ? ` ${r.piece}` : ""}, ${logModel ?? r.model}) in ${Math.round(performance.now() - t0)} ms`);
            }
          } catch (e) {
            const why = (e as Error).message.slice(0, 300);
            console.warn(`factory: failed "${req.ask.slice(0, 60)}": ${why}`);
            // the model broke, or the Mini did not pass its checks after the silent retry: say which
            const broke = /Muse -?\d+:|timed out|connect/i.test(why) || !/gate|candidate passed/i.test(why);
            const text = broke ? MODEL_DOWN : BUILD_FAILED;
            send("error", { message: text, code: "failed", detail: broke ? "the model call failed" : "the Mini did not pass its checks" });
            logMiss({ chat: req.chatId ?? req.chat.title ?? "", ask: req.ask, code: "failed", exit: why.slice(0, 160), text });
          } finally {
            if (req.chatId) busy.delete(req.chatId);
          }
          try {
            ctl.close();
          } catch {} // the client left
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    },
  });
}

if (import.meta.main) {
  // The gate's worker threads keep the process alive; leave promptly when asked to.
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(sig, () => process.exit(0));
  // A phone leaving mid-build must never end the service: log the error with its stack and keep serving.
  process.on("unhandledRejection", (e) => console.error(`factory: unhandled rejection: ${(e as Error)?.stack ?? e}`));
  process.on("uncaughtException", (e) => console.error(`factory: uncaught exception: ${(e as Error)?.stack ?? e}`));
  await warm();
  const s = makeServer();
  console.log(`factory listening on http://${s.hostname}:${s.port} (default ${process.env.MUSE_DEFAULT ?? "auto"}, live model ${process.env.MUSE_MODEL ?? DEFAULT_MODEL})`);
}
