// One origin for phones: serves the built shell, proxies /ws to the Rust server and /generate to
// the factory, and serves the sandbox frame document from a second port (a different origin, as
// packages/sandbox requires). Binds to loopback and private addresses only, never 0.0.0.0.
//
// The same frame document is also served from the main port at FRAME_PATH, for browsers that
// cannot reach the second port (an embedded browser that blocks it). The shell tries the second
// port first and falls back to this path; the frame keeps sandbox="allow-scripts" without
// allow-same-origin, so its origin is opaque either way, and it carries the same CSP.

import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { networkInterfaces } from "node:os";
import type { Server, ServerWebSocket } from "bun";
import { CSP, frameHtml } from "@muse/sandbox";
import { linkKind, linkPage } from "./links.ts";
import { splitBody } from "./sse.ts";
import { premadeResponse } from "./premade.ts"; // catalysts
import { configureReader, readerResponse } from "./reader.ts"; // reader: model-first reading of pages
import { composeResponse } from "./posts.ts"; // compose: posting from Home
import { changeInPlace, changeResponse, recentMinis, tapBuild, tapRedirect } from "./change.ts"; // change: change a tool by talking

export const SHELL_DIST = join(import.meta.dir, "../../apps/shell/dist");
/** assets/img (object photos) and assets/people (the three team members), served at /media/ (assets/ADOPT.md). /assets/ is the shell build. */
export const MEDIA = join(import.meta.dir, "../../assets");
/** The frame document on the main port (the fallback). */
export const FRAME_PATH = "/__frame/frame.html";

export type GatewayOptions = {
  port: number;
  framePort: number;
  /** ws://127.0.0.1:<port>/ws of the Rust server */
  upstreamWs: string;
  /** http://127.0.0.1:<port> of the factory service */
  factory: string;
  hosts: string[];
  /** model the shell asks for; undefined = the factory's default */
  model?: string;
  /** catalysts: timed suggestions on for every viewer (bun run demo --unprompted) */
  unprompted?: boolean;
  /** change: where each tool's source is kept (`<dataDir>/tools`); default the repo's data/ */
  dataDir?: string;
};

const DEFAULT_DATA = join(import.meta.dir, "../../data");

export type Gateway = { port: number; framePort: number; hosts: string[]; stop(): void; sockets(): number };

/** 10/8, 172.16/12, 192.168/16, and 100.64/10 (Tailscale's CGNAT range). */
export function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Loopback plus every private IPv4 address on this machine. */
export function privateHosts(): string[] {
  const out = new Set(["127.0.0.1"]);
  for (const list of Object.values(networkInterfaces())) for (const i of list ?? []) if (i.family === "IPv4" && !i.internal && isPrivateV4(i.address)) out.add(i.address);
  return [...out];
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

/**
 * Muse Sans for tool frames (design/fonts/README.md, "Apply: generated tools and the sandbox frame").
 * The frame CSP allows `font-src data:` only, so the faces travel inline, as a <style> in the frame
 * document's head, before the runtime sets the theme variables. Only 400, 600 and 700 (the weights
 * the app kit uses; about 72 KB instead of 96). The theme's own `--font` names the system stack, so
 * the family is set here too, as an !important custom property that wins over the inline theme.
 */
export function frameFontStyle(): string {
  const file = join(import.meta.dir, "../../design/fonts/dist/muse-sans.datauri.css");
  if (!existsSync(file)) return "";
  const faces = readFileSync(file, "utf8")
    .split("@font-face")
    .filter((r) => r.trim() && !/font-weight:\s*500/.test(r))
    .map((r) => "@font-face" + r.trim())
    .join("");
  const family = '"Muse Sans", Roboto, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  return `<style>${faces}:root{--font:${family} !important}</style>`;
}

type Data = { up: WebSocket | null; queue: string[]; closed: boolean };

/**
 * The frame runtime, bundled from packages/sandbox's source at start, the same way its own build
 * script does, so the frame always matches the host code the shell was built with (the checked-in
 * frame-js.gen.ts can lag behind while that package changes). Nothing is written into the package.
 */
export async function buildFrameJs(): Promise<string> {
  const r = await Bun.build({ entrypoints: [join(import.meta.dir, "../../packages/sandbox/src/frame.ts")], format: "iife", minify: true, target: "browser" });
  if (!r.success) throw new AggregateError(r.logs, "frame build failed");
  return await r.outputs[0]!.text();
}

export function startGateway(o: GatewayOptions & { frameJs: string }): Gateway {
  if (!existsSync(join(SHELL_DIST, "index.html"))) throw new Error(`no shell build at ${SHELL_DIST}; run vite build in apps/shell`);
  // Changes with every start: the page and its tool frames carry it, so a tab left open across a
  // restart notices (live/config.ts reloadOnRestart, and the frame pool's build check).
  const start = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const frame = frameHtml(o.frameJs, start).replace("</head>", `${frameFontStyle()}</head>`);
  const frameResponse = () => new Response(frame, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": "no-cache" } });
  // The frame document first, so its port is known when the shell page is written.
  const frames: Server<undefined>[] = [];
  let framePort = o.framePort;
  for (const hostname of o.hosts) {
    const s = Bun.serve({
      hostname,
      port: framePort,
      fetch: frameResponse,
    });
    framePort = s.port!;
    frames.push(s);
  }
  const config = { framePort, framePath: FRAME_PATH, start, ...(o.model ? { model: o.model } : {}), ...(o.unprompted ? { unprompted: true } : {}) }; // catalysts: unprompted
  const indexHtml = readFileSync(join(SHELL_DIST, "index.html"), "utf8").replace("<head>", `<head><script>window.__MUSE_LIVE__=${JSON.stringify(config)}</script>`);
  const live = new Set<ServerWebSocket<Data>>();
  /** change: pass a build's stream on, and keep the source it ends with under the body's toolId. */
  const keep = (body: ReadableStream<Uint8Array> | null, reqText: string): ReadableStream<Uint8Array> | null => {
    let toolId = "";
    let title = "";
    try {
      const j = JSON.parse(reqText) as { toolId?: unknown; title?: unknown; ask?: unknown };
      toolId = typeof j.toolId === "string" ? j.toolId : "";
      title = typeof j.title === "string" ? j.title : "";
    } catch {}
    if (!body || !toolId) return body;
    const { client, tap } = splitBody(body);
    void tapBuild(tap, o.dataDir ?? DEFAULT_DATA, toolId, title || "Tool");
    return client;
  };
  // reader: the factory's default model says whether to read live ("replay" reads stored answers only)
  configureReader({
    model: fetch(o.factory + "/health")
      .then((r) => r.json() as Promise<{ model?: string }>)
      .then((h) => (String(h.model ?? "").startsWith("auto") ? "auto" : h.model))
      .catch(() => undefined),
  });

  const shell = (req: Request, server: Server<Data>): Response | Promise<Response> | undefined => {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const ok = server.upgrade(req, { data: { up: null, queue: [], closed: false } });
      return ok ? undefined : new Response("expected a WebSocket", { status: 400 });
    }
    if (url.pathname === "/generate") {
      // change: the body names the tool's message (toolId), so the source that lands is kept for later changes
      return req.text().then(async (text) => {
        // a typed ask in a chat that has a Mini: the factory hears which lab Mini that is, so a build
        // that would post the same one becomes a change to it (never a second copy)
        const dirs = { factory: o.factory, ws: o.upstreamWs, dataDir: o.dataDir ?? DEFAULT_DATA, ...(o.model ? { model: o.model } : {}) };
        let body = text;
        let recent: Record<string, string> = {};
        let j: { chatId?: unknown; piece?: unknown; ask?: unknown; as?: unknown; model?: unknown } = {};
        try {
          j = JSON.parse(text) as typeof j;
          if (typeof j.chatId === "string" && j.piece === undefined) recent = await recentMinis(j.chatId, dirs);
          if (Object.keys(recent).length) body = JSON.stringify({ ...j, recentPieces: Object.keys(recent) });
        } catch {}
        return fetch(o.factory + "/generate", { method: req.method, headers: { "content-type": "application/json" }, body, signal: req.signal })
          .then((r) => {
            let out = r.body;
            if (out && Object.keys(recent).length) {
              const { client, tap } = splitBody(out);
              out = client;
              void tapRedirect(tap, (piece) => recent[piece] && changeInPlace({ chatId: String(j.chatId), toolId: recent[piece]!, ask: String(j.ask ?? ""), as: typeof j.as === "string" ? j.as : "", ...(typeof j.model === "string" ? { model: j.model } : {}) }, dirs));
            }
            return new Response(keep(out, text), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "text/plain", "cache-control": "no-cache" } });
          })
          .catch(() => new Response(JSON.stringify({ error: "Muse can't reach its model right now. Try again in a moment", code: "failed" }), { status: 502, headers: { "content-type": "application/json" } }));
      });
    }
    if (url.pathname === "/premade" && req.method === "POST") {
      // catalysts: pre-made tools from the scenario pack (change: tapped like /generate)
      return req.text().then(async (text) => {
        const r = await premadeResponse(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: text }));
        return new Response(keep(r.body, text), { status: r.status, headers: r.headers });
      });
    }
    if (url.pathname === "/change" && req.method === "POST") return changeResponse(req, { factory: o.factory, ws: o.upstreamWs, dataDir: o.dataDir ?? DEFAULT_DATA, ...(o.model ? { model: o.model } : {}) }); // change: change a tool by talking
    if (url.pathname.startsWith("/reader/") && req.method === "POST") return readerResponse(req); // reader: offers read from the page
    if (url.pathname.startsWith("/compose/")) return composeResponse(req, o.factory); // compose: the composer's tools, preview and pick
    const kind = linkKind(url.pathname);
    if (kind) return new Response(linkPage(kind, url.search), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    // A browser tells the demo log why a tool did not open (the reason is otherwise only in that browser's console).
    if (url.pathname === "/client-log" && req.method === "POST") {
      return req.text().then((t) => {
        console.log(`client: ${t.slice(0, 600).split(/\s+/).join(" ")}`);
        return new Response(null, { status: 204 });
      });
    }
    // `start` changes with every start of the demo: a tab left open across a restart reloads itself (live/config.ts).
    if (url.pathname === "/health") return Response.json({ ok: true, start }, { headers: { "cache-control": "no-store" } });
    if (url.pathname === FRAME_PATH) return frameResponse();
    if (url.pathname.startsWith("/media/")) {
      // Year-long caching is safe: every URL carries ?v=<manifest version>, which changes with any image.
      const file = join(MEDIA, normalize(decodeURIComponent(url.pathname.slice(7))));
      if ((file.startsWith(MEDIA + "/img/") || file.startsWith(MEDIA + "/people/")) && existsSync(file)) {
        return new Response(Bun.file(file), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
      }
      return new Response("not found", { status: 404 });
    }
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(SHELL_DIST, path);
    if (path !== "/" && file.startsWith(SHELL_DIST) && existsSync(file) && !file.endsWith("/")) {
      const ext = file.slice(file.lastIndexOf("."));
      // Hashed build files never change; icons and launch images (not hashed) are cached for a day; the page and manifest are always checked.
      const immutable = path.startsWith("/assets/");
      const artwork = /\.(png|svg|ico)$/.test(path);
      const cache = immutable ? "public, max-age=31536000, immutable" : artwork ? "public, max-age=86400" : "no-cache";
      return new Response(Bun.file(file), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": cache, "x-content-type-options": "nosniff" } });
    }
    return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  };

  const websocket = {
    open(ws: ServerWebSocket<Data>) {
      live.add(ws);
      const up = new WebSocket(o.upstreamWs);
      ws.data.up = up;
      up.onopen = () => {
        for (const m of ws.data.queue.splice(0)) up.send(m);
      };
      up.onmessage = (ev) => {
        if (!ws.data.closed) ws.send(String(ev.data));
      };
      // The server went away: drop the phone too, so it reconnects (and says hello again).
      up.onclose = () => {
        if (!ws.data.closed) ws.close(1012, "upstream closed");
      };
      up.onerror = () => {};
    },
    message(ws: ServerWebSocket<Data>, msg: string | Buffer) {
      const text = typeof msg === "string" ? msg : msg.toString();
      const up = ws.data.up;
      if (up && up.readyState === WebSocket.OPEN) up.send(text);
      else ws.data.queue.push(text);
    },
    close(ws: ServerWebSocket<Data>) {
      live.delete(ws);
      ws.data.closed = true;
      ws.data.up?.close();
    },
  };

  const servers: Server<Data>[] = [];
  let port = o.port;
  for (const hostname of o.hosts) {
    const s = Bun.serve<Data>({ hostname, port, idleTimeout: 255, fetch: shell, websocket });
    port = s.port!;
    servers.push(s);
  }
  return {
    port,
    framePort,
    hosts: o.hosts,
    sockets: () => live.size,
    stop() {
      for (const ws of live) ws.close();
      for (const s of [...servers, ...frames]) s.stop(true);
    },
  };
}
