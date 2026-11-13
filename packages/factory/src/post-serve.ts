// HTTP for posts on Home (post.ts), behind the factory service:
//   POST /post/route  { text, me, friends, photo?, fill? }  SSE: picks, filled / unfilled, done
//                     (or { available: false } when the service runs on recorded answers only)
//   POST /post/build  { text, me, friends, photo? }         SSE: stage events, then done { code } or error
// Models: Muse (Ember picks, contributor Spark fills and builds); MUSE_POST_ROUTER and MUSE_POST_FILL
// name either one exactly. MUSE_POST_MODEL=off turns the composer off.

import { buildForPost, routePost, type PostInput } from "./post.ts";
import { MUSE_DEFAULT } from "./models/index.ts";
import type { ModelClient } from "./types.ts";

type Ctx = { default: string; live: string; model: (config: string) => ModelClient };

function configs(c: Ctx): { router: string; filler: string } | null {
  if (c.default === "replay" && !process.env.MUSE_POST_MODEL) return null;
  const fam = process.env.MUSE_POST_MODEL ?? "muse";
  if (fam === "replay" || fam === "off") return null;
  return {
    router: process.env.MUSE_POST_ROUTER ?? "muse:muse-ember-1.0",
    filler: process.env.MUSE_POST_FILL ?? `muse:${MUSE_DEFAULT}`,
  };
}

function input(b: Record<string, unknown>): PostInput | null {
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 1000) : "";
  if (!text) return null;
  return {
    text,
    me: typeof b.me === "string" ? b.me.slice(0, 40) : "Me",
    friends: Array.isArray(b.friends) ? b.friends.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
    ...(typeof b.photo === "string" && b.photo ? { photo: b.photo.slice(0, 200) } : {}),
  };
}

function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => {
        try {
          ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      try {
        await run(send);
      } catch (e) {
        send("error", { message: (e as Error).message.slice(0, 300) });
      }
      try {
        ctl.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

export async function postResponse(req: Request, c: Ctx): Promise<Response> {
  const path = new URL(req.url).pathname;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  const p = input(body);
  if (!p) return Response.json({ error: "text is required" }, { status: 400 });
  const cfg = configs(c);
  if (!cfg) return Response.json({ available: false });
  if (path === "/post/route") {
    const fill = Math.max(1, Math.min(3, Number(body.fill) || 3));
    return sse((send) => routePost(p, { router: c.model(cfg.router), filler: c.model(cfg.filler) }, (e) => send(e.t, e), { fill }));
  }
  if (path === "/post/build") {
    return sse(async (send) => {
      const t0 = performance.now();
      const r = await buildForPost(p, { main: c.model(cfg.filler), fast: c.model(cfg.router) }, (stage) => send("stage", { stage, seconds: Math.round((performance.now() - t0) / 1000) }));
      send("done", r);
      console.log(`factory: built a new tool for a post in ${Math.round((performance.now() - t0) / 1000)} s`);
    });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
