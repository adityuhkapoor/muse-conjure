// `frameUrls`: when the first frame URL is blocked (an embedded browser that refuses a second
// port answers net::ERR_BLOCKED_BY_CLIENT), the pool loads the same frame document from the next
// URL, here on the host page's own origin. That frame must still be as shut in as any other: the
// same probes as the bridge test (no fetch, import, parent, cookies, storage, sockets or top
// navigation). ENGINE=webkit runs it in Playwright's WebKit.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { CSP, frameHtml } from "../src/frame-html.ts";
import { launch } from "../scripts/serve.ts";

const ENGINE = (process.env.ENGINE ?? "chromium") as "chromium" | "webkit";
let browser: Browser;
let host: ReturnType<typeof Bun.serve>;
let blocked: ReturnType<typeof Bun.serve>;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sandbox-fallback-"));
  const entry = join(dir, "entry.ts");
  writeFileSync(entry, `import { createPool } from ${JSON.stringify(join(import.meta.dir, "../src/host.ts"))};\n(window as any).createPool = createPool;\n`);
  const r = await Bun.build({ entrypoints: [entry], format: "esm", target: "browser" });
  if (!r.success) throw new AggregateError(r.logs);
  const js = (await r.outputs[0]!.text()).replace(/<\/(script)/gi, "<\\/$1");
  const frame = frameHtml();
  host = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/frame/frame.html") return new Response(frame, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP } });
      if (u.pathname === "/secret.json") return Response.json({ secret: 1 });
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Host</title></head><body><div id="slot" style="width:390px"></div><script type="module">${js}\nwindow.ready=true;</script></body></html>`, {
        headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "sid=host-only; Path=/" },
      });
    },
  });
  // The "second port": it would answer, but the browser is told to block it.
  blocked = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(frame, { headers: { "content-type": "text/html; charset=utf-8" } }) });
  browser = await launch(ENGINE);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  host?.stop(true);
  blocked?.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

async function openPage(): Promise<Page> {
  const page = await browser.newPage();
  await page.route(`http://127.0.0.1:${blocked.port}/**`, (r) => r.abort("blockedbyclient"));
  await page.goto(`http://127.0.0.1:${host.port}/`);
  await page.waitForFunction(() => (window as any).ready === true);
  return page;
}

const urls = () => [`http://127.0.0.1:${blocked.port}/frame.html`, `http://127.0.0.1:${host.port}/frame/frame.html`];

test("a blocked first URL falls back to the next one within the time given, and says so once", async () => {
  const page = await openPage();
  const r = await page.evaluate(async (list) => {
    const said: string[] = [];
    const before = history.length;
    const t0 = performance.now();
    const pool = (window as any).createPool({ size: 2, frameUrls: list, fallbackMs: 1500, onFallback: (u: string) => said.push(u) });
    await pool.ready();
    const ms = performance.now() - t0;
    // A mounted app's size reaches the host through the same port a direct frame would use.
    const el = document.getElementById("slot")!.appendChild(document.createElement("div"));
    const code = "export default { name: 'X', summary: () => 'x', init: () => ({}), reduce: (s) => s, invariants: {}, arbitrary: () => null, view: () => 'hello' };";
    const theme = { mode: "light", width: 390, surface: "chat", color: {}, radius: {}, space: {}, type: {}, motion: {} };
    const h = pool.mount(el, { code, room: "a:x", me: "maya", theme });
    const sized = await new Promise<boolean>((res) => {
      h.onSize(() => res(true));
      h.onError(() => res(true));
      setTimeout(() => res(false), 4000);
    });
    const srcs = [...document.querySelectorAll("iframe")].map((f) => [f.dataset.url ?? f.getAttribute("src"), f.getAttribute("sandbox")]);
    return { ms, said, srcs, sized, added: history.length - before };
  }, urls());
  expect(r.sized).toBe(true);
  // falling back never adds to the tab's history (the app's back would go back inside a frame)
  expect(r.added).toBe(0);
  expect(r.said).toEqual([urls()[1]!]);
  expect(r.ms).toBeLessThan(4000);
  expect(r.srcs.slice(0, 2)).toEqual([
    [urls()[1]!, "allow-scripts"],
    [urls()[1]!, "allow-scripts"],
  ]);
  await page.close();
}, 30_000);

test("with a reachable first URL nothing falls back", async () => {
  const page = await openPage();
  const said = await page.evaluate(async (good) => {
    const said: string[] = [];
    const pool = (window as any).createPool({ size: 1, frameUrls: [good, "http://127.0.0.1:1/never.html"], onFallback: (u: string) => said.push(u) });
    await pool.ready();
    return said;
  }, urls()[1]!);
  expect(said).toEqual([]);
  await page.close();
}, 30_000);

test("the fallback frame, served from the host's own origin, cannot reach out", async () => {
  const page = await openPage();
  await page.evaluate(async (list) => {
    const pool = (window as any).createPool({ size: 1, frameUrls: list, fallbackMs: 800 });
    await pool.ready();
  }, urls());
  const frame = page.frames().find((f) => f.url().endsWith("/frame/frame.html"))!;
  expect(frame).toBeTruthy();
  const r = await frame.evaluate(async (origin) => {
    const out: Record<string, string> = {};
    const settle = (p: Promise<unknown>, k: string) => p.then(() => (out[k] = "allowed"), () => (out[k] = "blocked"));
    await Promise.all([
      settle(fetch(origin + "/secret.json"), "fetch"),
      settle(import(origin + "/secret.json" as string), "import"),
      new Promise<void>((res) => {
        try {
          const ws = new WebSocket("ws://127.0.0.1:1");
          ws.onopen = () => ((out.ws = "allowed"), res());
          ws.onerror = () => ((out.ws = "blocked"), res());
        } catch {
          out.ws = "blocked";
          res();
        }
      }),
    ]);
    try { out.parent = String((parent as any).document.title); } catch { out.parent = "blocked"; }
    try { out.cookie = "readable:" + document.cookie; } catch { out.cookie = "blocked"; }
    try { localStorage.setItem("x", "1"); out.storage = "allowed"; } catch { out.storage = "blocked"; }
    try { (top as any).location.href = "about:blank"; out.navigate = "allowed"; } catch { out.navigate = "blocked"; }
    out.origin = String(self.origin);
    return out;
  }, `http://127.0.0.1:${host.port}`);
  expect(r).toEqual({ fetch: "blocked", import: "blocked", ws: "blocked", parent: "blocked", cookie: "blocked", storage: "blocked", navigate: "blocked", origin: "null" });
  // and the host cannot read into it either
  expect(await page.evaluate(() => { try { return String(document.querySelector("iframe")!.contentWindow!.document); } catch { return "blocked"; } })).toBe("blocked");
  await page.close();
}, 30_000);
