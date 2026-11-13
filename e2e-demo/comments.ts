// Comments on Home posts, two phones, live (apps/shell/src/surfaces/comments-live.svelte.ts):
// A opens a post's comments, writes one and a reply; B, on Home with the thread closed, sees the
// count change, then the comment, within a second; B likes it and A sees the pill. Also: the sheet
// closes on a drag down, and the written thread has as many comments as the post says.
//
// Called from run.ts. `bun e2e-demo/comments.ts` runs only this on ports 4710 and 4711
// (`E2E_NO_BUILD=1` skips builds); `--shots` also writes headless screenshots to
// library/lab/_shots/_comments/ (430x932 dark and light, sheet on a tool post and on an ordinary
// post; desktop 1512x900 inline).

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "playwright";
import type { Stack } from "../services/demo/stack.ts";
import { Report, until } from "./lib.ts";

const SYNC_BOUND_MS = 1000;
export const SHOTS = resolve(import.meta.dir, "../library/lab/_shots/_comments");
const PHONE_SHOT = { width: 430, height: 932 };
const DESK_SHOT = { width: 1512, height: 900 };

async function open(browser: Browser, url: string, as: string, theme: "light" | "dark", viewport = { width: 393, height: 852 }) {
  const phone = viewport.width < 1100;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(phone ? { isMobile: true, hasTouch: true } : {}), colorScheme: theme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${as}] page error: ${e.message}`));
  await page.goto(`${url}?as=${as}${phone ? "&safe=1" : ""}&app=facebook&theme=${theme}`);
  await page.waitForSelector("[data-post]", { timeout: 15_000 });
  // the comments room is joined once the first post has mounted
  await page.waitForFunction(() => (window as unknown as { __museComments?: { connected: boolean } }).__museComments?.connected === true, null, { timeout: 15_000 });
  return { ctx, page };
}

const commentBtn = (p: Page, post: string) => p.locator(`[data-post="${post}"] button[aria-label^="Comment"]`).first();
const sheet = (p: Page) => p.getByRole("dialog", { name: "Comments" });
const rowsOf = (p: Page, post: string) => p.locator(`[data-comments="${post}"] [data-comment]`);

async function expandAll(p: Page, post: string) {
  for (;;) {
    const b = p.locator(`[data-comments="${post}"] [data-view-replies]`).first();
    if (!(await b.count())) return;
    await b.click();
  }
}

export async function commentsFlow(r: Report, browser: Browser, url: string, o: { theme?: "light" | "dark"; shots?: boolean } = {}) {
  const theme = o.theme ?? "light";
  const A = await open(browser, url, "noa", theme);
  const B = await open(browser, url, "maya", theme);
  const POST = "p-den";
  const text = `who has the plants this week ${Date.now() % 100000}`;
  try {
    await r.step("the Comment action opens a sheet with the thread, and a 4-comment post has 4", async () => {
      await commentBtn(A.page, POST).click();
      await sheet(A.page).waitFor({ timeout: 3000 });
      await expandAll(A.page, POST);
      const n = await rowsOf(A.page, POST).count();
      if (n !== 4) throw new Error(`${n} comments on a post that says 4`);
      const input = await sheet(A.page).locator('input[placeholder="Write a comment…"]').count();
      if (!input) throw new Error("no composer");
      if (!(await sheet(A.page).locator(".send").isDisabled())) throw new Error("send is on with no text");
      return "4 of 4";
    });

    await r.step("a comment A writes shows at once, bumps the count, and is on B within a second", async () => {
      const box = sheet(A.page).locator("input.in");
      await box.fill(text);
      if (await sheet(A.page).locator(".send").isDisabled()) throw new Error("send stays off with text");
      const sent = await A.page.evaluate(() => Date.now());
      await box.press("Enter");
      const here = await until(A.page, `[...document.querySelectorAll('[data-comments="${POST}"] [data-comment] .tx')].some((e) => e.textContent.includes(${JSON.stringify(text)}))`, 3000);
      r.time("comment shows on A", here - sent);
      if (here - sent > 300) throw new Error(`took ${here - sent} ms to show on the writer's phone`);
      const countA = await commentBtn(A.page, POST).getAttribute("aria-label");
      if (countA !== "Comment, 5") throw new Error(`A's count is "${countA}"`);
      const seen = await until(B.page, `document.querySelector('[data-post="${POST}"] button[aria-label="Comment, 5"]')`, 4000);
      r.time("comment count A to B", seen - sent);
      if (seen - sent > SYNC_BOUND_MS) throw new Error(`count took ${seen - sent} ms on B`);
      return `${here - sent} ms here, ${seen - sent} ms on B`;
    });

    await r.step("B opens the thread and sees A's comment; B's like shows on A", async () => {
      await commentBtn(B.page, POST).click();
      await sheet(B.page).waitFor({ timeout: 3000 });
      const row = sheet(B.page).locator("[data-comment]", { hasText: text });
      await row.waitFor({ timeout: 3000 });
      // the clock starts in the tap itself, so Playwright's own waiting is not counted
      const t0 = await row.getByRole("button", { name: "Like" }).evaluate((el: HTMLElement) => {
        const t = Date.now();
        el.click();
        return t;
      });
      const seen = await until(A.page, `[...document.querySelectorAll('[data-comments="${POST}"] [data-comment]')].some((e) => e.textContent.includes(${JSON.stringify(text)}) && e.querySelector('[data-comment-likes="1"]'))`, 4000);
      r.time("comment like B to A", seen - t0);
      if (seen - t0 > SYNC_BOUND_MS) throw new Error(`like took ${seen - t0} ms`);
      // toggling again takes it back
      await row.getByRole("button", { name: "Like" }).click();
      await until(A.page, `![...document.querySelectorAll('[data-comments="${POST}"] [data-comment]')].some((e) => e.textContent.includes(${JSON.stringify(text)}) && e.querySelector('[data-comment-likes]'))`, 4000);
      return `${seen - t0} ms`;
    });

    await r.step("a reply goes under its comment, and the other phone's count follows", async () => {
      await sheet(B.page).getByRole("button", { name: "Reply" }).first().click();
      if (!(await sheet(B.page).locator("[data-replying]").count())) throw new Error("no replying line");
      const reply = `on it ${Date.now() % 100000}`;
      const t0 = await B.page.evaluate(() => Date.now());
      await sheet(B.page).locator("input.in").fill(reply);
      await sheet(B.page).locator("input.in").press("Enter");
      const seen = await until(A.page, `document.querySelector('[data-post="${POST}"] button[aria-label="Comment, 6"]')`, 4000);
      if (seen - t0 > SYNC_BOUND_MS) throw new Error(`took ${seen - t0} ms`);
      await expandAll(A.page, POST);
      const n = await rowsOf(A.page, POST).count();
      if (n !== 6) throw new Error(`${n} rows on A, expected 6`);
      return `${seen - t0} ms`;
    });

    await r.step("dragging the sheet down closes it", async () => {
      const h = await sheet(B.page).locator(".handle").boundingBox();
      if (!h) throw new Error("no handle");
      await B.page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await B.page.mouse.down();
      await B.page.mouse.move(h.x + h.width / 2, h.y + 200, { steps: 6 });
      await B.page.mouse.move(h.x + h.width / 2, h.y + 500, { steps: 6 });
      await B.page.mouse.up();
      await sheet(B.page).waitFor({ state: "detached", timeout: 3000 });
    });

    await r.step("a post with many comments shows 6 to 10 and View more comments", async () => {
      await commentBtn(B.page, "p-boba").click();
      await sheet(B.page).waitFor({ timeout: 3000 });
      const shown = await sheet(B.page).locator("[data-comments] .thread > li").count();
      const more = await sheet(B.page).locator("[data-view-more]").count();
      if (shown < 6 || shown > 10 || !more) throw new Error(`${shown} shown, view more: ${more}`);
      await sheet(B.page).locator("[data-view-more]").click();
      const after = await sheet(B.page).locator("[data-comments] .thread > li").count();
      if (after <= shown) throw new Error("View more did nothing");
      return `${shown} then ${after}`;
    });

    if (o.shots) await takeShots(browser, url, theme);
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
}

async function takeShots(browser: Browser, url: string, theme: "light" | "dark") {
  mkdirSync(SHOTS, { recursive: true });
  // phone: the sheet on a post that carries a Muse tool, and on an ordinary one
  for (const [tag, post] of [["tool", "p-boba"], ["post", "p-maya"]] as const) {
    const P = await open(browser, url, "noa", theme, PHONE_SHOT);
    try {
      await commentBtn(P.page, post).click();
      await sheet(P.page).waitFor({ timeout: 3000 });
      await P.page.waitForTimeout(700);
      await P.page.screenshot({ path: join(SHOTS, `phone-${tag}-${theme}.png`) });
    } finally {
      await P.ctx.close();
    }
  }
  // desktop: the thread under a tool post
  const D = await open(browser, url, "noa", theme, DESK_SHOT);
  try {
    const card = D.page.locator('[data-post="p-boba"]');
    await card.scrollIntoViewIfNeeded();
    await commentBtn(D.page, "p-boba").click();
    await D.page.locator('[data-post="p-boba"] [data-comments]').waitFor({ timeout: 3000 });
    await D.page.locator('[data-post="p-boba"] [data-comments]').scrollIntoViewIfNeeded();
    await card.evaluate((e) => e.scrollIntoView({ block: "start" }));
    await D.page.waitForTimeout(900);
    await D.page.screenshot({ path: join(SHOTS, `desktop-inline-${theme}.png`) });
  } finally {
    await D.ctx.close();
  }
}

if (import.meta.main) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { chromium } = await import("playwright");
  const { startStack } = await import("../services/demo/stack.ts");
  const dir = mkdtempSync(join(tmpdir(), "muse-comments-"));
  const r = new Report();
  const shots = process.argv.includes("--shots");
  const stack: Stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], port: 4710, framePort: 4711, build: process.env.E2E_NO_BUILD !== "1", log: (l) => console.log("  " + l) });
  const url = `http://127.0.0.1:${stack.gateway.port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    await commentsFlow(r, browser, url, { theme: "light", shots });
    if (shots) {
      await takeShots(browser, url, "dark");
      console.log(`screenshots in ${SHOTS}`);
    }
  } finally {
    await browser.close();
    await stack.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${r.checks.length - r.failed.length} of ${r.checks.length} comments checks passed`);
  process.exit(r.failed.length ? 1 : 0);
}
