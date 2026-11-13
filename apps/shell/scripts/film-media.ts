/**
 * Headless filmstrips of Stories and Reels (430 x 932, dark) into library/lab/_shots/_motion-media/ (git-ignored):
 * a story at 0, 1.5, 3 and 5.2 s, a story card mid-swipe to the next person, and a reel page change in three frames.
 * Usage: bun scripts/film-media.ts [outDir]
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { buildApp, serve } from "./lib.ts";

const out = resolve(process.argv[2] ?? join(import.meta.dirname, "../../../library/lab/_shots/_motion-media"));
mkdirSync(out, { recursive: true });
if (!process.argv.includes("--no-build")) await buildApp();
const server = await serve();
const browser = await chromium.launch();

async function page(query: string) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(`${server.url}?safe=1&theme=dark${query}`);
  return { ctx, p };
}
async function strip(name: string, shots: { png: Buffer; label: string }[]) {
  const ctx = await browser.newContext({ viewport: { width: shots.length * 306, height: 700 } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;display:flex;gap:6px;background:#777">${shots.map((s) => `<div style="font:13px sans-serif;color:#fff"><img width="300" src="data:image/png;base64,${s.png.toString("base64")}"/><br>${s.label}</div>`).join("")}</body>`);
  const path = join(out, `${name}.png`);
  await p.screenshot({ path });
  await ctx.close();
  console.log(path);
}

{
  const { ctx, p } = await page("&app=facebook&fb=story:s-maya");
  await p.waitForSelector(".story .kb");
  // time zero is when the bar starts, not when the page started loading
  await p.evaluate(() => (document as any).getAnimations({ subtree: true }).forEach((a: Animation) => (a.currentTime = 0)));
  const shots: { png: Buffer; label: string }[] = [];
  const t0 = Date.now();
  for (const t of [0, 1500, 3000, 5200]) {
    await p.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
    const seg = await p.locator(".story").getAttribute("data-seg");
    shots.push({ png: await p.screenshot(), label: `${(t / 1000).toFixed(1)} s, segment ${Number(seg) + 1} of 3` });
  }
  await strip("story-bars", shots);
  await ctx.close();
}
{
  const { ctx, p } = await page("&app=facebook&fb=story:s-maya");
  await p.waitForSelector(".story .kb");
  const cdp = await ctx.newCDPSession(p);
  const send = (type: string, x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] } as never);
  const shots: { png: Buffer; label: string }[] = [{ png: await p.screenshot(), label: "at rest" }];
  await send("touchStart", 380, 450);
  for (let i = 1; i <= 6; i++) { await send("touchMove", 380 - i * 35, 450); await p.waitForTimeout(16); }
  shots.push({ png: await p.screenshot(), label: "finger down, dragging (bars stopped)" });
  await send("touchMove", 60, 450);
  await send("touchEnd");
  await p.waitForTimeout(380);
  shots.push({ png: await p.screenshot(), label: "sliding to the next person" });
  await p.waitForTimeout(900);
  shots.push({ png: await p.screenshot(), label: "next person" });
  await strip("story-swipe", shots);
  await ctx.close();
}
{
  const { ctx, p } = await page("&app=facebook&fb=reels");
  await p.waitForSelector(".reel[data-live]");
  await p.waitForTimeout(800);
  await p.addStyleTag({ content: ".list{scroll-snap-type:none!important}" });
  const shots: { png: Buffer; label: string }[] = [];
  for (const f of [0, 0.45, 1]) {
    await p.evaluate((f) => { const l = document.querySelector(".list")!; l.scrollTop = f * l.clientHeight; }, f);
    await p.waitForTimeout(250);
    shots.push({ png: await p.screenshot(), label: `page change ${Math.round(f * 100)} percent` });
  }
  await strip("reel-page", shots);
  await ctx.close();
}
await browser.close();
await server.close();
void (0 as unknown as Browser);
