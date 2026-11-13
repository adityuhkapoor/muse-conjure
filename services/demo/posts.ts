// Posting from Facebook Home (apps/shell/src/muse/compose.ts and compose-live.svelte.ts).
//
// The feed is one synced room, `t:feed-home`, folded by the shell's chat reducer: a post is a
// `msg`, a like is a `react`. A post's tool lives in the chat keyed `surface:page:post:<post id>`,
// built through /premade like every other catalyst, so everyone on Home sees the same live tool.
//
// The gateway answers three small requests for the composer:
//   GET  /compose/tools  the lab tools that are available now (same rule as premade.ts)
//   POST /compose/build  a filled lab tool compiled for the live preview (no building beat)
//   POST /compose/route  the model's reading of the post (the factory's /post/route, streamed)
//   POST /compose/new    something new for a post, built into the post's chat (progress streamed)
//
// `startPosts` is the cast's part (started with the cast): the made-up friends like a new post
// within about 20 s, and the post's tool chat is opened to the cast even with two real phones on
// Home (a post is public), so they act in the tool the way they do in chats.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createReplica, sharedSocket } from "../../packages/sync/src/index.ts";
import { available, build, type Choice } from "./premade.ts";
import { miniName } from "@muse/protocol";
import { chatIdForKey, chatReducer, chatRoom, INDEX_ROOM, indexReducer, SEED_USER, type ChatState } from "../../apps/shell/src/live/chat-reducer.ts";

const LAB = join(resolve(import.meta.dir, "../.."), "library", "lab");

export const FEED_ROOM = "t:feed-home";
export const postKey = (postId: string) => `surface:page:post:${postId}`;

/** Lab tools available now, with their own names. Read on every request: tools land while the demo runs. */
export function labTools(): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const id of readdirSync(LAB)) {
    if (id.startsWith("_") || !available(`lab:${id}`)) continue;
    let name = id;
    try {
      name = (JSON.parse(readFileSync(join(LAB, id, "meta.json"), "utf8")) as { name?: string }).name ?? id;
    } catch {}
    out.push({ id, name });
  }
  return out;
}

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-cache" } });

/** Lab choices only: a library piece is never offered from the composer. */
const labOnly = (choices: unknown): Choice[] => (Array.isArray(choices) ? choices : []).filter((c): c is Choice => typeof c?.tool === "string" && c.tool.startsWith("lab:") && typeof c.params === "object" && c.params !== null);

export async function composeResponse(req: Request, factory: string): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/compose/tools" && req.method === "GET") return json({ tools: labTools() });
  if (url.pathname === "/compose/build" && req.method === "POST") {
    try {
      const body = (await req.json()) as { choices?: unknown };
      const choices = labOnly(body.choices);
      if (!choices.length) return json({ error: "no lab tool to build" }, 400);
      const b = await build(choices);
      return json({ tool: b.tool, code: b.code });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }
  // The model's reading of the post: the factory's post router, streamed through.
  if (url.pathname === "/compose/route" && req.method === "POST") {
    try {
      const r = await fetch(factory + "/post/route", { method: "POST", headers: { "content-type": "application/json" }, body: await req.text(), signal: req.signal });
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-cache" } });
    } catch {
      return json({ available: false });
    }
  }
  // Something new for this post: built on the server into the post's own chat, so it lands for
  // everyone even if the phone that asked has gone. This answers with the build's progress.
  if (url.pathname === "/compose/new" && req.method === "POST") {
    let body: NewBody;
    try {
      body = (await req.json()) as NewBody;
    } catch {
      return json({ error: "body is not JSON" }, 400);
    }
    if (!/^p-[a-z0-9]{4,20}$/.test(String(body.postId ?? "")) || !String(body.text ?? "").trim()) return json({ error: "postId and text are required" }, 400);
    const job = jobs.get(body.postId) ?? startJob(body, factory);
    return job.stream();
  }
  return json({ error: "not found" }, 404);
}

type NewBody = { postId: string; text: string; me: string; friends: string[]; viewer: string; members: string[] };

/** The server half of the demo's sync (set by startPosts): where to build new tools for posts. */
let wsUrl: string | null = null;

type Job = { stage: string; done: boolean; error: string | null; subs: Set<(event: string, data: unknown) => void>; stream(): Response };
const jobs = new Map<string, Job>();

function startJob(b: NewBody, factory: string): Job {
  const subs = new Set<(event: string, data: unknown) => void>();
  const job: Job = {
    stage: "Reading your post",
    done: false,
    error: null,
    subs,
    stream() {
      const enc = new TextEncoder();
      let off = () => {};
      const body = new ReadableStream({
        start(ctl) {
          const send = (event: string, data: unknown) => {
            try {
              ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
              if (event === "done" || event === "error") ctl.close();
            } catch {}
          };
          send("stage", { stage: job.stage });
          if (job.done) return send(job.error ? "error" : "done", job.error ? { message: job.error } : {});
          subs.add(send);
          off = () => subs.delete(send);
        },
        cancel() {
          off();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    },
  };
  jobs.set(b.postId, job);
  const tell = (event: string, data: unknown) => subs.forEach((f) => f(event, data));
  void (async () => {
    if (!wsUrl) {
      job.done = true;
      job.error = "the demo's sync server is not attached";
      return tell("error", { message: job.error });
    }
    const socket = sharedSocket(wsUrl, { backoff: (n) => Math.min(3000, 150 * 2 ** n) });
    const key = postKey(b.postId);
    const chatId = chatIdForKey(key);
    const client = `post-new-${b.postId}`;
    const index = createReplica(indexReducer, socket.transport(INDEX_ROOM), { room: INDEX_ROOM, user: SEED_USER, client: client + "-i" });
    const chat = createReplica<ChatState>(chatReducer, socket.transport(chatRoom(chatId)), { room: chatRoom(chatId), user: SEED_USER, client: client + "-c" });
    const toolId = `t-new-${b.postId.slice(2)}`;
    index.dispatch({ t: "chat", id: chatId, key });
    chat.dispatch({ t: "create", name: `${b.me}'s post`.slice(0, 60), kind: "group", members: b.members, key });
    chat.dispatch({ t: "tool-pending", id: toolId, title: "Something for this post", ask: b.text.slice(0, 400) });
    const beat = () => chat.eph("building", { id: toolId, stage: job.stage });
    const heart = setInterval(beat, 3000);
    beat();
    try {
      const r = await fetch(factory + "/post/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: b.text, me: b.me, friends: b.friends }) });
      const ct = r.headers.get("content-type") ?? "";
      if (!r.ok || !r.body || !ct.includes("event-stream")) throw new Error("Muse can't make new Minis right now");
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let built: { code: string; name: string } | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? "{}") as { stage?: string; code?: string; name?: string; source?: string; message?: string };
          if (event === "stage" && data.stage) {
            job.stage = data.stage;
            beat();
            tell("stage", { stage: data.stage });
          } else if (event === "done" && data.code) built = { code: data.code, name: miniName(data.source ?? "", data.name ?? "Something for this post") };
          else if (event === "error") throw new Error(data.message ?? "the build failed");
        }
      }
      if (!built) throw new Error("the build ended without a tool");
      chat.dispatch({ t: "tool", id: toolId, name: built.name.slice(0, 80), summary: "", code: built.code, by: b.viewer });
      job.stage = "Ready";
      job.done = true;
      tell("done", { toolId });
    } catch (e) {
      chat.dispatch({ t: "tool-failed", id: toolId });
      job.done = true;
      job.error = (e as Error).message.slice(0, 200);
      tell("error", { message: job.error });
    } finally {
      clearInterval(heart);
      setTimeout(() => {
        index.close();
        chat.close();
        socket.close();
      }, 5000);
    }
  })();
  return job;
}

// ---------------------------------------------------------------- the friends react

/** What posts.ts needs from the cast's director (services/cast). */
export type CastView = { readonly people: string[]; readonly paused: boolean; readonly stopped: boolean; mode(user: string): string; allowCrowd(chat: string): void };

const LIKE_AT = [[3500, 7000], [8500, 13000], [14000, 19000]] as const;

/** A small stable hash, so the same post gets the same likers on every run. */
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

export function startPosts(o: { ws: string; cast: () => CastView | null; log?: (line: string) => void }): { stop(): void } {
  wsUrl = o.ws;
  const socket = sharedSocket(o.ws, { backoff: (n) => Math.min(3000, 150 * 2 ** n) });
  const replica = createReplica<ChatState>(chatReducer, socket.transport(FEED_ROOM), { room: FEED_ROOM, user: SEED_USER, client: `posts-${Date.now().toString(36)}` });
  const seen = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let primed = false;
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  // The posts already there when this starts are history: nobody reacts to them again.
  const prime = setInterval(() => {
    if (!replica.live) return;
    clearInterval(prime);
    for (const m of replica.confirmed.messages) seen.add(m.id);
    primed = true;
  }, 100);
  replica.subscribe((s) => {
    if (!primed) return;
    for (const m of s.messages) {
      if (seen.has(m.id) || m.kind !== "text") continue;
      seen.add(m.id);
      onPost(m.id, m.from);
    }
  });

  function onPost(id: string, from: string) {
    const cast = o.cast();
    if (!cast) return;
    // A post is public: the friends may use its tool with any number of real people on Home.
    cast.allowCrowd(chatIdForKey(postKey(id)));
    const h = hash(id);
    const order = cast.people.filter((p) => p !== from && cast.mode(p) === "cast").sort((a, b) => hash(a + id) - hash(b + id));
    const count = 2 + (h % 2);
    let n = 0;
    for (const who of order) {
      if (n >= count) break;
      const [lo, hi] = LIKE_AT[n]!;
      const at = lo + (hash(who + id) % (hi - lo));
      n++;
      later(at, () => {
        const c = o.cast();
        if (!c || c.paused || c.stopped || c.mode(who) !== "cast") return;
        replica.dispatch({ t: "react", msg: id, emoji: "👍", once: true, as: who });
        o.log?.(`cast: ${who} liked post ${id}`);
      });
    }
  }

  return {
    stop() {
      clearInterval(prime);
      for (const t of timers) clearTimeout(t);
      replica.close();
      socket.close();
    },
  };
}
