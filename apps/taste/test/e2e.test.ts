// End to end, headless Chrome: load the app, judge 12 items with the keyboard and the pointer,
// undo once, and check swipes.jsonl and model.json. Phone and desktop sizes, axe-core clean, no
// horizontal overflow. Uses a throwaway data dir; his swipes are never touched.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startServer } from "../server.ts";

let s: Awaited<ReturnType<typeof startServer>>;
let browser: Browser;
const dir = mkdtempSync(join(tmpdir(), "taste-e2e-"));
const AXE = readFileSync(join(import.meta.dir, "../node_modules/axe-core/axe.min.js"), "utf8");

beforeAll(async () => {
  s = await startServer({ port: 0, dir, localOnly: true, quiet: true });
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  s?.stop();
  rmSync(dir, { recursive: true, force: true });
});

const lines = () => (existsSync(join(dir, "swipes.jsonl")) ? readFileSync(join(dir, "swipes.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

async function axe(page: Page) {
  await page.waitForTimeout(400); // let the card finish arriving (it fades in)
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await (window as any).axe.run(document, { resultTypes: ["violations"] })).violations.map((v: any) => `${v.id}: ${v.nodes.map((n: any) => n.target.join(" ")).join(", ")}`));
  if (r.length) console.log(r.join("\n"));
  expect(r).toEqual([]);
}
async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(o.sw).toBeLessThanOrEqual(o.w);
}
const counter = (page: Page) => page.locator("button.count").innerText();

for (const [name, viewport, mobile] of [["phone", { width: 375, height: 812 }, true], ["desktop", { width: 1280, height: 800 }, false]] as const) {
  test(`${name}: judge 12 items by keyboard and pointer, undo once, swipes and model are written`, async () => {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const before = lines().length;
    const modelBefore = existsSync(join(dir, "model.json")) ? statSync(join(dir, "model.json")).mtimeMs : 0;
    await page.goto(s.url);
    const card = page.locator("article.card");
    await card.waitFor();
    await noOverflow(page);
    await axe(page);

    let interactedOnce = false;
    for (let i = 0; i < 12; i++) {
      await card.waitFor();
      const key = await card.getAttribute("data-kind");
      const itemKey = await card.getAttribute("data-key");
      const n0 = Number(await counter(page));
      if (key === "tool" && !interactedOnce) {
        // Tap inside the live tool first.
        const f = page.frameLocator('iframe[title="Live tool"]');
        await f.locator("button:not([disabled])").first().click({ timeout: 8000 });
        interactedOnce = true;
        await page.waitForTimeout(300);
      }
      if (i % 2 === 0) {
        await page.keyboard.press(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"][(i / 2) % 4]!);
      } else if (key === "pair") {
        await page.locator("button.choice").nth(i % 4 === 1 ? 0 : 1).click();
      } else {
        // Drag the card by its caption, 140 px to the right or left.
        const box = (await card.locator(".cap").boundingBox())!;
        const x = box.x + 20, y = box.y + box.height / 2, dx = i % 4 === 1 ? 140 : -140;
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let k = 1; k <= 6; k++) await page.mouse.move(x + (dx * k) / 6, y, { steps: 2 });
        await page.mouse.up();
      }
      await page.waitForFunction((n) => Number(document.querySelector("button.count")?.textContent) === n + 1, n0, { timeout: 8000 });
      // The next card is in place (the judged one has left).
      await page.waitForFunction((k) => { const c = document.querySelectorAll("article.card"); return c.length === 1 && c[0]!.getAttribute("data-key") !== k; }, itemKey, { timeout: 8000 });
    }
    await noOverflow(page);
    await axe(page);

    // Undo the last one: the count drops and the item comes back.
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction((n) => Number(document.querySelector("button.count")?.textContent) === n - 1, Number(await counter(page)), { timeout: 8000 });
    const got = lines().slice(before);
    const judged = got.filter((l) => l.type === "judge");
    const undone = got.filter((l) => l.type === "undo");
    expect(judged.length).toBe(12);
    expect(undone.length).toBe(1);
    expect(undone[0].target).toBe(judged[11].id);
    for (const j of judged) {
      expect(["like", "dislike", "love", "skip", "a", "b"]).toContain(j.decision);
      expect(j.ms).toBeGreaterThan(0);
      expect(typeof j.interacted).toBe("boolean");
      expect(j.order).toBeGreaterThan(0);
    }
    expect(new Set(judged.map((j) => j.decision)).size).toBeGreaterThanOrEqual(3);
    if (interactedOnce) expect(judged.some((j) => j.kind === "tool" && j.interacted)).toBe(true);
    // Retrained after 10 judgments.
    expect(existsSync(join(dir, "model.json"))).toBe(true);
    expect(statSync(join(dir, "model.json")).mtimeMs).toBeGreaterThan(modelBefore);
    const model = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
    expect(model.n.judgments).toBeGreaterThanOrEqual(10);
    expect(model.ms).toBeLessThan(100);

    // The summary view.
    await page.locator("button.count").click();
    await page.getByRole("heading", { name: "What you like" }).waitFor();
    await noOverflow(page);
    await axe(page);
    if (errors.length) console.log("page errors:", errors);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120_000);
}
