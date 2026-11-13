/**
 * bun run perf:phone: first paint, time to interactive and the inbox-to-thread transition under 4x CPU
 * throttling, in headless Chromium with the Android profile. Prints a table; `--json` for machines.
 * Needs a built dist (it builds one if there is none). Headless only; the server is closed on exit.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { devices, chromium } from "playwright";
import { buildApp, dist, reportSizes, serve } from "./lib.ts";

if (!existsSync(join(dist, "index.html"))) await buildApp();
const sizes = reportSizes();
const server = await serve();
const browser = await chromium.launch({ headless: true });
const RUNS = 5;

type Run = { fcp: number; tti: number; frames: number[]; transitionMs: number };

async function once(): Promise<Run> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "light" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = Date.now();
  await page.goto(`${server.url}?safe=1`, { waitUntil: "commit" });
  // Interactive: a chat row exists and the main thread has been quiet for 200 ms.
  await page.waitForSelector("button.row", { state: "attached" });
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let last = performance.now();
        const po = new PerformanceObserver((l) => l.getEntries().forEach(() => (last = performance.now())));
        try {
          po.observe({ type: "longtask", buffered: true });
        } catch {}
        const tick = () => (performance.now() - last > 200 ? done() : setTimeout(tick, 50));
        tick();
      }),
  );
  const tti = Date.now() - t0;
  const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1);
  await page.waitForTimeout(300);
  // Transition: tap a row, record every animation frame for 700 ms.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    let prev = performance.now();
    const loop = () => {
      const n = performance.now();
      w.__frames.push(n - prev);
      prev = n;
      if (w.__frames.length < 400) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.locator("button.row", { hasText: "apt 4b" }).first().tap();
  await page.waitForTimeout(900);
  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice());
  // The transition frames are the ones inside the first 450 ms after the tap; the recorder started before it.
  const cut: number[] = [];
  let sum = 0;
  for (const f of frames) {
    sum += f;
    if (sum > 450 + 100) break;
    cut.push(f);
  }
  await ctx.close();
  return { fcp, tti, frames: cut, transitionMs: sum };
}

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
const med = (a: number[]) => pct(a, 0.5);
const runs: Run[] = [];
for (let i = 0; i < RUNS; i++) runs.push(await once());
const all = runs.flatMap((r) => r.frames.slice(3)); // skip the page-load tail at the start of the window
const result = {
  runs: RUNS,
  fcpMs: Math.round(med(runs.map((r) => r.fcp))),
  ttiMs: Math.round(med(runs.map((r) => r.tti))),
  frameP50: +pct(all, 0.5).toFixed(1),
  frameP95: +pct(all, 0.95).toFixed(1),
  frameMax: +Math.max(...all).toFixed(1),
  slowFrames: all.filter((f) => f > 20).length,
  frames: all.length,
  jsKb: +(sizes.js / 1024).toFixed(1),
  cssKb: +(sizes.css / 1024).toFixed(1),
  jsGzKb: +(sizes.jsGz / 1024).toFixed(1),
  cssGzKb: +(sizes.cssGz / 1024).toFixed(1),
};
console.log(process.argv.includes("--json") ? JSON.stringify(result) : result);
await browser.close();
await server.close();
