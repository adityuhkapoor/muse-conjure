// Presenter controls at /cast on the cast's own port: pause, who is in the cast, speed, next
// beat, scenes, stop all, reset. Bound to loopback and private addresses only, and every request
// from anywhere else is refused as well.

import type { Server } from "bun";
import type { Director } from "./director.ts";
import type { Speed } from "./personas.ts";
import { PAGE } from "./page.ts";

const isPrivate = (ip: string) => {
  const v4 = ip.replace(/^::ffff:/, "");
  if (v4 === "127.0.0.1" || ip === "::1") return true;
  const [a, b] = v4.split(".").map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a === 127;
};

export type Control = { port: number; urls: string[]; stop(): void };

export function startControl(d: () => Director, o: { port: number; hosts: string[] }): Control {
  const servers: Server<undefined>[] = [];
  let port = o.port;
  const fetch = async (req: Request, server: Server<undefined>): Promise<Response> => {
    const ip = server.requestIP(req)?.address ?? "";
    if (!isPrivate(ip)) return new Response("not here", { status: 403 });
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/cast" || url.pathname === "/cast/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    if (url.pathname === "/cast/state") return Response.json(d().status(), { headers: { "cache-control": "no-cache" } });
    if (url.pathname === "/cast/do" && req.method === "POST") {
      let body: { do?: string; value?: unknown; id?: string };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return Response.json({ error: "bad json" }, { status: 400 });
      }
      const dir = d();
      try {
        const out = await run(dir, body);
        return Response.json({ ok: true, ...(out ?? {}), state: dir.status() });
      } catch (e) {
        return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 400 });
      }
    }
    return new Response("not found", { status: 404 });
  };
  for (const hostname of o.hosts) {
    const s = Bun.serve({ hostname, port, fetch });
    port = s.port!;
    servers.push(s);
  }
  return { port, urls: o.hosts.map((h) => `http://${h}:${port}/cast`), stop: () => servers.forEach((s) => s.stop(true)) };
}

async function run(d: Director, b: { do?: string; value?: unknown; id?: string }): Promise<Record<string, unknown> | void> {
  switch (b.do) {
    case "pause":
      return d.pause();
    case "resume":
      return d.resume();
    case "toggle":
      return d.paused ? d.resume() : d.pause();
    case "stop":
      return d.stopAll();
    case "start":
      return d.startAgain();
    case "next":
      return d.nextBeat();
    case "speed":
      if (b.value !== "calm" && b.value !== "normal" && b.value !== "lively") throw new Error("speed is calm, normal or lively");
      return d.setSpeed(b.value as Speed);
    case "person":
      return d.setPerson(String(b.id), b.value !== false);
    case "crowd":
      d.crowd = b.value === true;
      return;
    case "scene":
      return { scene: d.runScene(String(b.id)) };
    case "reset":
      await d.reset();
      return;
  }
  throw new Error(`unknown control ${b.do}`);
}
