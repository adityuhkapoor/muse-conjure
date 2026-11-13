// bun run shots: headless screenshots of the app (a copy pair, a live tool, a motion clip, a single
// screen, the summary), phone and desktop, light and dark. Uses a throwaway data dir, so his swipes
// are never touched. Prints where the PNGs went.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startServer } from "../server.ts";

const out = mkdtempSync(join(tmpdir(), "taste-shots-"));
const dir = mkdtempSync(join(tmpdir(), "taste-shots-data-"));
const s = await startServer({ port: 0, dir, localOnly: true, quiet: true });
const browser = await chromium.launch({ headless: true });
const written: string[] = [];

async function until(page: Page, kind: string) {
  for (let i = 0; i < 40; i++) {
    const k = await page.locator("article.card").getAttribute("data-kind", { timeout: 10_000 });
    if (k === kind) return true;
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(260);
  }
  return false;
}

try {
  for (const [size, viewport, scale, mobile] of [["phone", { width: 390, height: 844 }, 2, true], ["desktop", { width: 1280, height: 800 }, 1, false]] as const)
    for (const scheme of ["light", "dark"] as const) {
      if (size === "desktop" && scheme === "dark") continue;
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, colorScheme: scheme });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.error("page error:", e.message));
      await page.goto(s.url);
      for (const kind of ["pair", "tool", "motion", "copy", "screen"]) {
        if (!(await until(page, kind))) {
          console.log(`no ${kind} item came up`);
          continue;
        }
        await page.waitForTimeout(kind === "tool" ? 2200 : kind === "motion" ? 700 : 400);
        const p = join(out, `${size}-${scheme}-${kind}.png`);
        await page.screenshot({ path: p });
        written.push(p);
      }
      await page.getByRole("button", { name: /judged/ }).click();
      await page.getByRole("heading", { name: "What you like" }).waitFor();
      await page.waitForTimeout(300);
      const p = join(out, `${size}-${scheme}-summary.png`);
      await page.screenshot({ path: p, fullPage: true });
      written.push(p);
      await ctx.close();
    }
} finally {
  await browser.close();
  s.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(written.join("\n"));
