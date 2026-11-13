// "Tell Muse what to change": the gateway side. The shell posts { chatId, toolId?, ask, explicit,
// as }; this reads the chat and the tool's room from the sync server, asks the factory's POST
// /change (docs/CONTRACTS.md section 6), and writes the result into the chat for everyone:
// `tool-changing` while it works, then `tool-update` on the same message (and, when state started
// over or ids moved, the old room's actions replayed into a fresh room first), and one line from Muse.
//
// Each tool's source is kept per message in the demo's data dir (`<data>/tools/<id>.json`), written
// when a build lands (the /generate and /premade taps below) and after each change. Lab tools in
// library/lab are never written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chatReducer, chatRoom, roomOfTool, SEED_USER, toolRoom, type ChatAction, type ChatState, type WireMsg } from "../../apps/shell/src/live/chat-reducer.ts";
import { RoomClient } from "./proto.ts";
import { firstName, seededSource } from "./seed.ts";

export type ToolRecord = { source: string; piece: string | null; name: string; /** the message's tool.rev this source is for */ rev?: number };

const rid = (p: string) => p + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const safeId = (id: string) => /^[A-Za-z0-9_.~-]{1,80}$/.test(id);

export function recordPath(dataDir: string, toolId: string) {
  return join(dataDir, "tools", `${toolId}.json`);
}

export function writeRecord(dataDir: string, toolId: string, r: ToolRecord) {
  if (!safeId(toolId)) return;
  mkdirSync(join(dataDir, "tools"), { recursive: true });
  writeFileSync(recordPath(dataDir, toolId), JSON.stringify(r));
}

/** The tool's source at this rev; a seeded tool whose record is from another database starts from its seed. */
async function readRecord(dataDir: string, toolId: string, rev: number): Promise<ToolRecord | null> {
  if (!safeId(toolId)) return null;
  const f = recordPath(dataDir, toolId);
  const seeded = await seededSource(toolId);
  if (existsSync(f)) {
    try {
      const r = JSON.parse(readFileSync(f, "utf8")) as ToolRecord;
      if ((r.rev ?? 0) === rev || !seeded) return r;
    } catch {}
  }
  return seeded;
}

/**
 * Tap a build's event stream (read only): when it ends with `done` carrying a source, keep that
 * source for the tool. The caller passes the response on unchanged.
 */
export async function tapBuild(stream: ReadableStream<Uint8Array>, dataDir: string, toolId: string, fallbackName: string) {
  let buf = "";
  const dec = new TextDecoder();
  try {
    for await (const chunk of stream) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!/^event: done$/m.test(block)) continue;
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!data) continue;
        const d = JSON.parse(data) as { source?: string; piece?: string | null; name?: string };
        if (typeof d.source === "string" && d.source) writeRecord(dataDir, toolId, { source: d.source, piece: typeof d.piece === "string" ? d.piece.replace(/^lab:/, "") : null, name: d.name || fallbackName });
      }
    }
  } catch {
    // a dropped stream: nothing to keep
  }
}

/**
 * Tap a build's event stream for a redirect: when the factory says the build would post the same
 * Mini as the chat's most recent one (`reply` with code "change"), the ask is a change to that Mini.
 */
export async function tapRedirect(stream: ReadableStream<Uint8Array>, onChange: (piece: string) => void) {
  let buf = "";
  const dec = new TextDecoder();
  try {
    for await (const chunk of stream) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!/^event: reply$/m.test(block)) continue;
        const d = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}") as { code?: string; piece?: string };
        if (d.code === "change" && typeof d.piece === "string") onChange(d.piece);
      }
    }
  } catch {}
}

/** The chat's finished Minis in its last 30 messages, newest first per lab tool: lab id -> message id. */
export async function recentMinis(chatId: string, o: { ws: string; dataDir: string }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const chat = foldChat(await readRoom(o.ws, chatRoom(chatId)));
    for (const m of chat.messages.slice(-30).reverse()) {
      if (m.kind !== "muse" || !m.tool?.code || m.tool.building) continue;
      const rec = await readRecord(o.dataDir, m.tool.id, m.tool.rev ?? 0);
      const piece = rec?.piece?.replace(/^lab:/, "");
      if (piece && !out[piece]) out[piece] = m.tool.id;
    }
  } catch {}
  return out;
}

/** Change a chat's Mini in place as if the person had pointed at it (the redirect above). */
export function changeInPlace(r: { chatId: string; toolId: string; ask: string; as: string; model?: string }, o: { factory: string; ws: string; dataDir: string }) {
  void runChange({ ...r, explicit: true, tz: 0 }, o, () => {}).catch((e) => console.warn(`change: ${(e as Error).message}`));
}

/** Read one room's whole log (as the seed user, on a socket of its own). */
async function readRoom(ws: string, room: string) {
  const c = await new RoomClient(ws, room, rid("chg-r-"), SEED_USER).join();
  c.close();
  return c.entries;
}

function foldChat(entries: { action: unknown; seq: number; user: string; time: number; seed: number }[]): ChatState {
  let s = chatReducer.init({ room: "", members: [] });
  for (const e of entries) s = chatReducer.reduce(s, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed });
  return s;
}

/** Writes into one chat room as the seed user (so Muse's lines can say `as: "muse"`). */
class ChatWriter {
  #c: RoomClient | null = null;
  #cseq = 0;
  constructor(readonly ws: string, readonly room: string) {}
  async send(a: ChatAction) {
    this.#c ??= await new RoomClient(this.ws, this.room, rid("chg-w-"), SEED_USER).join();
    const n = ++this.#cseq;
    this.#c.act(n, a);
    await this.#c.until(() => !!this.#c!.mine(n), 15_000);
  }
  close() {
    this.#c?.close();
  }
}

/** Post the old room's actions into a fresh room, in order, each as the person who made it. */
async function replayInto(ws: string, room: string, replay: { user: string; action: unknown }[]) {
  const clients = new Map<string, { c: RoomClient; n: number }>();
  try {
    for (const e of replay) {
      const user = String((e.action as { t?: string })?.t ?? "").startsWith("@") ? SEED_USER : e.user;
      let k = clients.get(user);
      if (!k) {
        k = { c: await new RoomClient(ws, room, rid("chg-p-"), user).join(), n: 0 };
        clients.set(user, k);
      }
      const n = ++k.n;
      k.c.act(n, e.action);
      const kk = k;
      await kk.c.until(() => !!kk.c.mine(n), 15_000);
    }
  } finally {
    for (const k of clients.values()) k.c.close();
  }
}

type Body = { chatId?: unknown; toolId?: unknown; ask?: unknown; explicit?: unknown; as?: unknown; model?: unknown; tz?: unknown };
type Outcome = { t: "new" } | { t: "changing"; toolId: string } | { t: "error"; message: string };

const busy = new Set<string>();

/** The most recent finished tool in the last 30 messages, if any. */
function latestTool(st: ChatState): WireMsg | undefined {
  return st.messages.slice(-30).reverse().find((m) => m.kind === "muse" && m.tool?.code && !m.tool.building);
}

/**
 * POST /change from the shell. Answers as soon as it is known whether this is about the tool
 * (`changing`) or not (`new`: the shell builds a new tool); the change itself goes on and lands in
 * the chat for everyone.
 */
export async function changeResponse(req: Request, o: { factory: string; ws: string; dataDir: string; model?: string }): Promise<Response> {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ t: "error", message: "body is not JSON" }, { status: 400 });
  }
  if (typeof b.chatId !== "string" || typeof b.ask !== "string" || !b.ask.trim() || typeof b.as !== "string") return Response.json({ t: "error", message: "need chatId, ask and as" }, { status: 400 });
  const outcome = await new Promise<Outcome>((answer) => {
    runChange({ chatId: b.chatId as string, toolId: typeof b.toolId === "string" ? b.toolId : null, ask: (b.ask as string).slice(0, 500), explicit: b.explicit === true, as: b.as as string, model: typeof b.model === "string" ? b.model : o.model, tz: typeof b.tz === "number" && Number.isFinite(b.tz) ? Math.round(b.tz) : 0 }, o, answer).catch((e) => {
      console.warn(`change: ${(e as Error).message}`);
      answer({ t: "error", message: (e as Error).message });
    });
  });
  return Response.json(outcome);
}

async function runChange(r: { chatId: string; toolId: string | null; ask: string; explicit: boolean; as: string; model?: string | undefined; tz: number }, o: { factory: string; ws: string; dataDir: string }, answer: (x: Outcome) => void) {
  const t0 = performance.now();
  const chat = foldChat(await readRoom(o.ws, chatRoom(r.chatId)));
  const msg = r.toolId ? chat.messages.find((m) => m.tool?.id === r.toolId && m.tool.code) : latestTool(chat);
  if (!msg?.tool) return answer(r.explicit ? { t: "error", message: "no such tool" } : { t: "new" });
  const tool = msg.tool;
  const writer = new ChatWriter(o.ws, chatRoom(r.chatId));
  let marked = false;
  const say = (text: string) => writer.send({ t: "msg", id: rid("m-muse-"), text, as: "muse" } as ChatAction);
  try {
    if (busy.has(tool.id)) {
      if (!r.explicit) return answer({ t: "new" });
      answer({ t: "changing", toolId: tool.id });
      await say("I'm still changing this one. Try again in a moment");
      return;
    }
    const record = await readRecord(o.dataDir, tool.id, tool.rev ?? 0);
    if (!record) {
      if (!r.explicit) return answer({ t: "new" });
      answer({ t: "changing", toolId: tool.id });
      await say("I can't change this one. Ask me for a new one instead");
      return;
    }
    busy.add(tool.id);
    const mark = async () => {
      if (marked) return;
      marked = true;
      await writer.send({ t: "tool-changing", id: tool.id, ask: r.ask, as: r.as });
    };
    if (r.explicit) {
      answer({ t: "changing", toolId: tool.id });
      await mark();
    }
    const appRoom = roomOfTool(tool);
    const log = (await readRoom(o.ws, appRoom)).map((e) => ({ user: e.user, action: e.action }));
    const said = chat.messages
      .filter((m) => (m.kind === "text" || m.kind === "link") && m.from !== "system")
      .map((m) => ({ from: m.from === "muse" ? "Muse" : firstName(m.from), text: m.text ?? m.link?.title ?? "" }))
      .slice(-40);
    const body = { ask: r.ask, explicit: r.explicit, chat: { title: chat.name, messages: said }, members: chat.members.map((m) => ({ id: m, name: firstName(m) })), tool: { name: tool.name, source: record.source, piece: record.piece }, log, tz: r.tz, ...(r.model ? { model: r.model } : {}) };
    const res = await fetch(o.factory + "/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(100_000) }); // the factory's own limit is 90 s
    if (!res.ok || !res.body) throw new Error(`factory said ${res.status}`);
    let end: { event: string; data: Record<string, unknown> } | null = null;
    let buf = "";
    for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!event || data === undefined) continue;
        const d = JSON.parse(data) as Record<string, unknown>;
        if (event === "progress" && d.t === "decided") {
          if (d.tier === "new") continue;
          answer({ t: "changing", toolId: tool.id });
          if (d.tier !== "cant") await mark();
        } else if (event !== "progress") end = { event, data: d };
      }
    }
    if (!end || end.event === "new") {
      if (end) {
        answer({ t: "new" });
        return;
      }
      throw new Error("the factory stream ended early");
    }
    answer({ t: "changing", toolId: tool.id });
    if (end.event === "reply") {
      if (marked) await writer.send({ t: "tool-change-end", id: tool.id });
      await say(String(end.data.text ?? "I couldn't change that one. The Mini is as it was"));
      return;
    }
    if (end.event !== "done") throw new Error(String(end.data.detail ?? end.data.message ?? "change failed"));
    const d = end.data as { tier: string; source: string; code: string; name: string; summary: string; note: string; room: "same" | "new"; replay?: { user: string; action: unknown }[]; piece: string | null };
    let room: string | undefined;
    if (d.room === "new") {
      room = `${toolRoom(tool.id)}~${(tool.rev ?? 0) + 1}`;
      if (d.replay?.length) await replayInto(o.ws, room, d.replay);
    }
    writeRecord(o.dataDir, tool.id, { source: d.source, piece: d.piece, name: d.name, rev: (tool.rev ?? 0) + 1 });
    await writer.send({ t: "tool-update", id: tool.id, name: (d.name || tool.name).slice(0, 80), summary: d.summary ?? "", code: d.code, ...(room ? { room } : {}) });
    await say(d.note || "Changed it");
    console.log(`change: ${tool.id} ${d.tier}${room ? ` in ${room}` : ""} in ${Math.round(performance.now() - t0)} ms: ${d.note}`);
  } catch (e) {
    console.warn(`change: failed for ${tool.id}: ${(e as Error).message.slice(0, 300)}`);
    // a plain typed ask that failed before any change began is a new tool, not a failed change
    if (!r.explicit && !marked) return answer({ t: "new" });
    answer({ t: "changing", toolId: tool.id });
    try {
      await writer.send({ t: "tool-change-end", id: tool.id });
      await say("I couldn't change that one. The Mini is as it was");
    } catch {}
  } finally {
    busy.delete(tool.id);
    writer.close();
  }
}
