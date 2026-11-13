// bun run measure: compile time, cold mount, warm mount, entry -> paint, frame script size.
// Host and frame are served from two localhost origins; the browser runs headless
// (ENGINE=chromium, the default, is chrome-headless-shell; ENGINE=webkit is Playwright's WebKit).
// "commit" = the DOM is updated inside the frame. "paint" = the frame's next requestAnimationFrame
// after that commit. Mount times start when the host calls pool.mount and include the welcome
// round trip to the in-page server.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { compileApp } from "../src/compile.ts";
import { exampleNames, launch, openHost, startServers } from "./serve.ts";

const N = Number(process.env.N ?? 30);
const ENGINE = (process.env.ENGINE ?? "chromium") as "chromium" | "webkit";
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const fmt = (xs: number[]) => `${q(xs, 0.5).toFixed(2).padStart(7)} ${q(xs, 0.95).toFixed(2).padStart(7)}`;
type M = { id: number; room: string; t0: number; sized: number; placement: string };
const H = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const paint = (f: Frame) => f.evaluate(() => (globalThis as any).__musePaint as { n: number; at: number; commit: number } | undefined);

async function mountOnce(page: Page, code: string, mode: "light" | "dark" = "light") {
  const m = await H<M>(page, "mount", code, { mode });
  const f = (await (await page.$(`iframe[data-h="${m.id}"]`))!.contentFrame())!;
  await f.waitForFunction(() => (globalThis as any).__musePaint?.n >= 1);
  const p = (await paint(f))!;
  const st = await H<{ errors: string[] }>(page, "state", m.id);
  if (st.errors.length) throw new Error(st.errors.join("; "));
  return { m, ms: p.at - m.t0, commit: p.commit - m.t0, frame: f };
}

// One action from someone else that changes visible state.
const actFor = (name: string, i: number) =>
  name === "dinner-poll" ? { t: "vote", option: "thai" } : name === "chore-wheel" ? { t: i % 2 ? "reset" : "spin" } : { t: "toggle", user: "theo" };
const actor = (name: string) => (name === "bill-split" ? "maya" : "theo");

const s = await startServers();
const browser = await launch(ENGINE);
const sizes = await (await fetch(s.host + "sizes.json")).json();
const rows: string[] = [];
const shots = join(tmpdir(), "muse-shots");
mkdirSync(shots, { recursive: true });
let mode = "";
try {
  const page = await openHost(browser, s);
  for (const name of exampleNames) {
    const code = s.apps[name]!.code;
    const compile: number[] = [];
    for (let i = 0; i < N; i++) compile.push(compileApp(s.apps[name]!.source).ms);

    const cold: number[] = [];
    await H(page, "makePool", 0);
    for (let i = 0; i < N; i++) cold.push((await mountOnce(page, code)).ms);

    const warm: number[] = [];
    const warmCommit: number[] = [];
    const entryCommit: number[] = [];
    const entry: number[] = [];
    mode = await H<string>(page, "makePool", 1);
    for (let i = 0; i < N; i++) {
      await H(page, "poolReady");
      const r = await mountOnce(page, code);
      warm.push(r.ms);
      warmCommit.push(r.commit);
      await page.waitForFunction((room) => (window as any).H.log(room).some((e: any) => e.action?.t === "@members"), r.m.room);
      await r.frame.waitForTimeout(30);
      const before = (await paint(r.frame))!.n;
      const at = await H<number>(page, "act", r.m.room, actor(name), actFor(name, 0));
      await r.frame.waitForFunction((n) => (globalThis as any).__musePaint.n > n, before);
      const p = (await paint(r.frame))!;
      entry.push(p.at - at);
      entryCommit.push(p.commit - at);
    }
    rows.push(`${name.padEnd(12)} ${fmt(compile)}  ${fmt(cold)}  ${fmt(warmCommit)}  ${fmt(warm)}  ${fmt(entryCommit)}  ${fmt(entry)}`);

    for (const m of ["light", "dark"] as const) {
      await H(page, "poolReady");
      await mountOnce(page, code, m);
      await page.waitForTimeout(400);
      await page.locator("#slot").screenshot({ path: join(shots, `${ENGINE}-${name}-${m}.png`) });
    }
  }
} finally {
  await browser.close();
  s.stop();
}

console.log(`\n${N} iterations, ms, p50 / p95. ${ENGINE} headless, host and frame on different origins, warm path: ${mode}.\n`);
console.log(`${"".padEnd(12)} ${"".padStart(15)}  ${"cold mount".padStart(15)}  ${"warm mount".padStart(32)}  ${"entry".padStart(32)}`);
console.log(`${"app".padEnd(12)} ${"compile".padStart(15)}  ${"paint".padStart(15)}  ${"commit".padStart(15)}  ${"paint".padStart(15)}  ${"commit".padStart(15)}  ${"paint".padStart(15)}`);
for (const r of rows) console.log(r);
const kb = (n: number) => (n / 1024).toFixed(2) + " KB";
console.log(`\n@muse/app runtime: ${kb(sizes.runtime.min)} min, ${kb(sizes.runtime.gzip)} min+gzip`);
console.log(`frame script (runtime + replica + bridge): ${kb(sizes.frame.min)} min, ${kb(sizes.frame.gzip)} min+gzip`);
console.log(`host bundle (pool + inlined frame document): ${kb(sizes.host.min)} min, ${kb(sizes.host.gzip)} min+gzip`);
console.log(`\nscreenshots: ${shots}`);
