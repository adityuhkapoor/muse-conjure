// Posting from Home with a tool from Muse, two phones, live (apps/shell/src/muse/compose.ts):
// Tsai Lin opens Create post, taps the "ranking the dining halls" example, sees Muse's row with a live
// preview, attaches it and posts; Maya, on Home, sees the post at the top with the live lab tool;
// Maya's tap reaches Tsai Lin within 500 ms; the made-up friends like the post and act in its tool.
//
// Called from run.ts (the cast is started here for this check if the stack has none).
// `bun e2e-demo/compose.ts` runs only this on ports 4690 and 4691 (`E2E_NO_BUILD=1` skips builds);
// `--shots` also writes headless screenshots (393x852, light and dark, and the desktop dialog) to
// library/lab/_shots/_compose/.

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Frame, Page } from "playwright";
import { startCast } from "../services/cast/index.ts";
import { startPosts } from "../services/demo/posts.ts";
import { RoomClient } from "../services/demo/proto.ts";
import type { Stack } from "../services/demo/stack.ts";
import { PHONE, Report } from "./lib.ts";

const TAP_BOUND_MS = 500;
const CAST = ["dev", "jonah", "priya", "theo"];
export const SHOTS = resolve(import.meta.dir, "../library/lab/_shots/_compose");

async function open(browser: Browser, url: string, as: string, theme: "light" | "dark", viewport = PHONE) {
  const phone = viewport === PHONE;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(phone ? { isMobile: true, hasTouch: true } : {}), colorScheme: theme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${as}] page error: ${e.message}`));
  await page.goto(`${url}?as=${as}${phone ? "&safe=1" : ""}&app=facebook&theme=${theme}`);
  await page.waitForSelector("[data-compose-open]", { timeout: 15_000 });
  return { ctx, page };
}

/** The frame inside an element (Chrome moves it into the slot). */
async function frameIn(p: Page, selector: string, ms = 20_000): Promise<Frame> {
  const deadline = Date.now() + ms;
  for (;;) {
    const f = p.locator(`${selector} iframe`);
    if (await f.count()) {
      const fr = await (await f.first().elementHandle())!.contentFrame();
      if (fr) {
        await fr.waitForSelector(".m-root > *", { timeout: Math.max(1000, deadline - Date.now()) });
        return fr;
      }
    }
    if (Date.now() > deadline) throw new Error(`no frame in ${selector}`);
    await p.waitForTimeout(150);
  }
}

/** Drafts no pattern knows (owner's tests), the words that do not count as the post's, and example content that must never show. */
const UNUSUAL = ["yo whats up just having fun in South America eating tostadas!", "finally got my wisdom teeth out, send soup recs", "anyone want my extra ticket to the game saturday"];
const STOP = ["whats", "just", "having", "finally", "send", "anyone", "want", "extra", "with", "that", "this"];
const BLOCK = ["Greek", "dining halls", "Leo's", "Nashville", "Tacos El Gordo"];

/** Closes the Ask Muse sheet: Escape, else a tap above it. */
async function closeSheet(p: Page) {
  const sheet = p.locator("[data-ask-muse]");
  await p.keyboard.press("Escape");
  if (await sheet.waitFor({ state: "detached", timeout: 1500 }).then(() => true, () => false)) return;
  await p.mouse.click(200, 60);
  await sheet.waitFor({ state: "detached", timeout: 3000 });
}

/** Waits until the Ask Muse sheet has the model's answer, or knows there is none ("off"). */
async function settled(p: Page, ms = 30_000): Promise<string> {
  const sheet = p.locator(".page.push.shown [data-ask-muse], [data-create-post=dialog] [data-ask-muse]").last();
  await sheet.waitFor({ timeout: 5000 });
  const deadline = Date.now() + ms;
  for (;;) {
    const phase = (await sheet.getAttribute("data-ask-phase")) ?? "";
    if (phase === "off" || phase === "done") return phase;
    if (phase === "filling" && (await sheet.locator('[data-ask-card][data-source="model"]').count())) return phase;
    if (Date.now() > deadline) return phase;
    await p.waitForTimeout(250);
  }
}

const text = async (f: Frame) => ((await f.evaluate(() => document.querySelector(".m-root")?.textContent ?? "")) as string).replace(/\s+/g, " ").trim();

export async function composeFlow(r: Report, browser: Browser, url: string, stack: Pick<Stack, "serverPort" | "cast">, o: { theme?: "light" | "dark"; shots?: boolean; tag?: string } = {}) {
  const theme = o.theme ?? "light";
  const tag = o.tag ?? "";
  const ws = `ws://127.0.0.1:${stack.serverPort}/ws`;
  // The friends: the stack's cast if it has one, else one for this check (lively, so it fits in 30 s).
  const own = stack.cast ? null : startCast({ ws, speed: "lively", hosts: ["127.0.0.1"], seed: 7 });
  const director = stack.cast?.director ?? own!.director;
  const posts = own ? startPosts({ ws, cast: () => director }) : null;
  if (o.shots) mkdirSync(SHOTS, { recursive: true });
  const shot = async (p: Page, name: string) => {
    if (!o.shots) return;
    await p.waitForTimeout(350);
    await p.screenshot({ path: join(SHOTS, `${name}-${theme}.png`) });
  };
  const A = await open(browser, url, "noa", theme);
  const B = await open(browser, url, "maya", theme);
  const top = (p: Page) => p.locator(".page.push.shown").last();
  let postId = "";
  let toolId = "";
  try {
    await r.step(`${tag}Create post opens from Home with three examples to try`, async () => {
      await A.page.locator("[data-compose-open]").click();
      await top(A.page).locator('[data-create-post="page"]').waitFor({ timeout: 5000 });
      const post = top(A.page).locator("[data-compose-post]");
      if (!(await post.isDisabled())) throw new Error("Post is enabled with no text");
      const chips = await top(A.page).locator("[data-compose-example]").allInnerTexts();
      if (chips.length !== 3) throw new Error(`examples: ${JSON.stringify(chips)}`);
      await A.page.waitForTimeout(400);
      await shot(A.page, "1-empty");
      return chips.join(", ");
    });

    await r.step(`${tag}an example fills the post and Muse offers a lab tool with a live preview`, async () => {
      const t0 = Date.now();
      await top(A.page).locator('[data-compose-example="ranking the dining halls"]').click();
      const row = top(A.page).locator("[data-compose-suggest]");
      await row.waitFor({ timeout: 5000 });
      const ms = Date.now() - t0;
      const tool = (await row.getAttribute("data-tool")) ?? "";
      if (!tool.startsWith("lab:")) throw new Error(`offered ${tool}`);
      await top(A.page).locator("[data-compose-suggest] [data-compose-preview][data-ready]").waitFor({ timeout: 15_000 });
      const f = await frameIn(A.page, ".page.push.shown [data-compose-suggest] [data-compose-preview]");
      const shows = await text(f);
      if (!/Crossroads/.test(shows)) throw new Error(`the preview shows "${shows.slice(0, 80)}"`);
      const label = (await row.locator(".lab").innerText()).trim();
      if (!(await top(A.page).locator("[data-compose-plain]").count()) || !(await top(A.page).locator("[data-compose-ask-muse]").count())) throw new Error("no Post and Ask Muse at the bottom");
      await shot(A.page, "2-suggest");
      return `${label} (${tool}) in ${ms} ms`;
    });

    await r.step(`${tag}Ask Muse shows what it read and live tools to choose from`, async () => {
      await top(A.page).locator("[data-compose-ask-muse]").click();
      const sheet = top(A.page).locator("[data-ask-muse]");
      await sheet.waitFor({ timeout: 3000 });
      const read = (await sheet.locator("[data-ask-read]").innerText()).trim();
      if (!/^Read /.test(read)) throw new Error(`read "${read}"`);
      const cards = await sheet.locator("[data-ask-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-card")));
      if (cards.length < 2 || cards.some((c) => !c?.startsWith("lab:"))) throw new Error(`cards ${JSON.stringify(cards)}`);
      await sheet.locator("[data-ask-card] [data-compose-preview][data-ready]").first().waitFor({ timeout: 15_000 });
      await A.page.waitForTimeout(800);
      await shot(A.page, "3-ask-muse");
      return `${read}; ${cards.join(", ")}; ${(await sheet.locator("[data-ask-use]").innerText()).trim()}`;
    });

    await r.step(`${tag}Use attaches the tool under the draft, and Post posts it`, async () => {
      // With a live model its own picks may come first; this check follows the ranking the post spells out.
      const pat = top(A.page).locator('[data-ask-card][data-source="pattern"][data-ask-card="lab:feed-tier-list"]').first();
      if (await pat.count()) await pat.click();
      await top(A.page).locator("[data-ask-use]").click();
      await top(A.page).locator("[data-compose-attached] [data-compose-preview][data-ready]").waitFor({ timeout: 15_000 });
      if (await top(A.page).locator("[data-compose-suggest]").count()) throw new Error("the row is still there");
      await A.page.waitForTimeout(400);
      await shot(A.page, "4-attached");
      await top(A.page).locator("[data-compose-plain]").click();
      await A.page.waitForSelector("[data-home-post]", { timeout: 5000 });
      postId = (await A.page.locator("[data-home-post]").first().getAttribute("data-post")) ?? "";
      return postId;
    });

    await r.step(`${tag}Maya sees the post at the top of Home with the live lab tool`, async () => {
      const t0 = Date.now();
      await B.page.waitForSelector(`[data-home-post][data-post="${postId}"] [data-surface-tool]`, { timeout: 15_000 });
      const first = await B.page.evaluate(() => document.querySelector("article.post")?.getAttribute("data-post"));
      if (first !== postId) throw new Error(`the first post on Home is ${first}`);
      toolId = (await B.page.locator(`[data-post="${postId}"] [data-surface-tool]`).getAttribute("data-surface-tool")) ?? "";
      const fb = await frameIn(B.page, `[data-post="${postId}"] [data-surface-tool]`);
      const shows = await text(fb);
      if (!/Rank the dining halls/.test(shows) || !/Crossroads/.test(shows)) throw new Error(`Maya sees "${shows.slice(0, 80)}"`);
      const credit = await B.page.locator(`[data-post="${postId}"] .credit`).innerText();
      if (!/Made with Muse · on this post/.test(credit.replace(/\s+/g, " "))) throw new Error(`credit "${credit}"`);
      if (!(await B.page.locator(`[data-post="${postId}"] button`, { hasText: "Use for my group" }).count())) throw new Error("no Use for my group");
      return `${Date.now() - t0} ms after posting; tool ${toolId}`;
    });

    await r.step(`${tag}Maya's tap in the tool reaches Tsai Lin within ${TAP_BOUND_MS} ms`, async () => {
      // In the middle of the screen, clear of the floating tab bar (a tap there would hit a tab).
      for (const p of [A.page, B.page]) await p.locator(`[data-post="${postId}"] [data-surface-tool]`).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await A.page.waitForTimeout(400);
      const fa = await frameIn(A.page, `[data-post="${postId}"] [data-surface-tool]`);
      const fb = await frameIn(B.page, `[data-post="${postId}"] [data-surface-tool]`);
      // A ranking counts for everyone once it is posted ("38 ranked"): Maya ranks all six, then her Post tap is timed.
      for (const [i, name] of ["Crossroads", "Cafe 3", "Foothill", "Clark Kerr", "GBC Late Night", "Pat Brown's"].entries()) {
        await fb.locator(`[aria-label="${name} in ${"SABCDA"[i]}"]`).click();
        await fb.waitForFunction((n) => (document.querySelector(".m-root")?.textContent ?? "").includes(`${n} of 6 ranked`), i + 1, { timeout: 3000 });
      }
      const count = () => Number(/(\d+) ranked/.exec(document.querySelector(".m-root")?.textContent ?? "")?.[1] ?? 0);
      const before = (await fa.evaluate(`(${count})()`)) as number;
      await fa.evaluate(`(() => { const c = ${count}; const b = ${before}; window.__changed = 0; const loop = () => { if (c() > b) window.__changed = Date.now(); else requestAnimationFrame(loop); }; loop(); })()`);
      await fb.evaluate(() => document.addEventListener("pointerdown", () => ((window as any).__tap = Date.now()), { once: true, capture: true }));
      await fb.getByRole("button", { name: "Post ranking" }).click({ timeout: 5000 });
      const changed = (await (await fa.waitForFunction(() => (window as any).__changed || false, null, { timeout: 5000, polling: 16 })).jsonValue()) as number;
      const tap = (await fb.evaluate(() => (window as any).__tap)) as number;
      if (!tap) throw new Error("no tap recorded");
      r.time("compose: tap Maya to Tsai Lin", changed - tap);
      if (changed - tap > TAP_BOUND_MS) throw new Error(`took ${changed - tap} ms`);
      return `${changed - tap} ms`;
    });

    await r.step(`${tag}within 30 s the friends like the post and act in its tool`, async () => {
      const room = await new RoomClient(ws, `a:${toolId}`, `e2e-compose-${Date.now()}`, "@watch").join();
      const t0 = Date.now();
      try {
        await room.until(() => room.entries.some((e) => CAST.includes(e.user) && !String((e.action as { t?: string })?.t ?? "").startsWith("@")), 30_000);
        await A.page.waitForSelector(`[data-post="${postId}"] [data-post-likes]`, { timeout: Math.max(1000, 30_000 - (Date.now() - t0)) });
      } finally {
        room.close();
      }
      const acted = [...new Set(room.entries.filter((e) => CAST.includes(e.user) && !String((e.action as { t?: string })?.t ?? "").startsWith("@")).map((e) => e.user))];
      const likes = await A.page.locator(`[data-post="${postId}"] .likes`).innerText();
      // Let a second friend come in for the picture.
      if (o.shots) await A.page.waitForTimeout(9000);
      await A.page.locator(`[data-post="${postId}"]`).scrollIntoViewIfNeeded();
      await A.page.evaluate((id) => document.querySelector(`[data-post="${id}"]`)?.scrollIntoView({ block: "start" }), postId);
      await shot(A.page, "5-posted");
      return `${acted.join(", ")} acted in ${Math.round((Date.now() - t0) / 1000)} s; likes: ${likes.trim()}`;
    });

    await r.step(`${tag}Ask Muse reads unusual posts: content from the post, never another context's`, async () => {
      const out: string[] = [];
      for (const [i, d] of UNUSUAL.entries()) {
        await B.page.locator("[data-compose-open]").click();
        await top(B.page).locator("[data-compose-text]").fill(d);
        await top(B.page).locator("[data-compose-ask-muse]").click();
        const phase = await settled(B.page, 90_000);
        const cards = top(B.page).locator("[data-ask-card]");
        if (phase === "off") {
          // Recorded answers only: the patterns path, and the offer to make something new when they have nothing.
          const n = await cards.count();
          const sources = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-source")));
          if (sources.some((x) => x !== "pattern")) throw new Error(`replay showed ${JSON.stringify(sources)}`);
          if (!n && !(await top(B.page).locator("[data-ask-make-new]").count())) throw new Error(`no cards and no Make something new for "${d}"`);
          out.push(`"${d.slice(0, 20)}": ${n ? `${n} from the patterns` : "Make something new"}`);
        } else {
          const model = top(B.page).locator('[data-ask-card][data-source="model"]');
          await model.first().waitFor({ timeout: 60_000 });
          await top(B.page).locator('[data-ask-card][data-source="model"] [data-compose-preview][data-ready]').first().waitFor({ timeout: 20_000 }).catch(() => {});
          const words = d.toLowerCase().match(/[a-z]{4,}/g)!.filter((w) => !STOP.includes(w));
          let good = 0;
          const seen: string[] = [];
          for (let k = 0; k < (await model.count()); k++) {
            const c = model.nth(k);
            const title = (await c.getAttribute("data-title")) ?? "";
            const fr = await c.locator("iframe").count() ? await (await c.locator("iframe").first().elementHandle())!.contentFrame() : null;
            const body = `${title} ${(await c.innerText()).replace(/\s+/g, " ")} ${fr ? await text(fr).catch(() => "") : ""}`;
            const bad = BLOCK.filter((b) => body.toLowerCase().includes(b.toLowerCase()));
            if (bad.length) throw new Error(`"${title}" shows ${bad.join(", ")}`);
            if (words.some((w) => body.toLowerCase().includes(w))) good++;
            seen.push(`${(await c.getAttribute("data-ask-card"))?.slice(4)} "${title}"`);
          }
          if (!good) throw new Error(`no card uses the post's words (${seen.join(", ")})`);
          out.push(`"${d.slice(0, 20)}": ${seen.join(", ")}`);
        }
        await B.page.waitForTimeout(600);
        if (o.shots) await B.page.screenshot({ path: join(SHOTS, `8-ask-${i + 1}-${theme}.png`) });
        await closeSheet(B.page);
        await top(B.page).locator("[data-compose-text]").fill("");
        await B.page.goBack();
        await B.page.waitForTimeout(600);
      }
      return out.join("; ");
    });

    await r.step(`${tag}a post with no tool posts normally`, async () => {
      await B.page.locator("[data-compose-open]").click();
      await top(B.page).locator("[data-compose-text]").fill("long day, early night");
      await B.page.waitForTimeout(700);
      if (await top(B.page).locator("[data-compose-suggest]").count()) throw new Error("Muse offered something for a plain post");
      // Ask Muse never shows a tool filled with someone else's example; on recorded answers only, it offers to make something new.
      await top(B.page).locator("[data-compose-ask-muse]").click();
      const phase = await settled(B.page);
      const general = await top(B.page).locator("[data-ask-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-ask-card")));
      if (phase === "off" && (general.length || !(await top(B.page).locator("[data-ask-make-new]").count()))) throw new Error(`replay: cards ${JSON.stringify(general)}, no Make something new`);
      await closeSheet(B.page);
      await top(B.page).locator("[data-compose-plain]").click();
      if (await B.page.locator("[data-compose-ask]").count()) throw new Error("asked at Post");
      await A.page.waitForFunction(() => [...document.querySelectorAll("[data-home-post]")].some((e) => e.textContent?.includes("long day, early night")), null, { timeout: 8000 });
      const id = await A.page.evaluate(() => [...document.querySelectorAll("[data-home-post]")].find((e) => e.textContent?.includes("long day, early night"))?.getAttribute("data-post"));
      if (await A.page.locator(`[data-post="${id}"] [data-surface-tool]`).count()) throw new Error("it has a tool");
      return phase === "off" ? "Ask Muse offered Make something new" : `Ask Muse offered ${general.join(", ") || "Make something new"}`;
    });

    await r.step(`${tag}tapping Post with a strong match and nothing attached asks once`, async () => {
      await B.page.locator("[data-compose-open]").click();
      await top(B.page).locator('[data-compose-example="selling everything before i move out"]').click();
      await top(B.page).locator("[data-compose-suggest]").waitFor({ timeout: 5000 });
      await top(B.page).locator("[data-compose-post]").click();
      const ask = B.page.locator("[data-compose-ask]");
      await ask.waitFor({ timeout: 3000 });
      const title = (await ask.locator("h2").innerText()).trim();
      if (title !== "Post with a move-out sale?") throw new Error(`asked "${title}"`);
      await ask.getByRole("button", { name: "Post without" }).click();
      await B.page.waitForFunction(() => [...document.querySelectorAll("[data-home-post]")].some((e) => e.textContent?.includes("selling everything")), null, { timeout: 8000 });
      return title;
    });
  } finally {
    await A.ctx.close();
    await B.ctx.close();
    posts?.stop();
    own?.stop();
  }
}

/** The desktop dialog with a suggestion, for the screenshot. */
export async function desktopShot(browser: Browser, url: string, theme: "light" | "dark") {
  const D = await open(browser, url, "priya", theme, { width: 1440, height: 900 });
  try {
    await D.page.locator("[data-compose-open]").click();
    await D.page.locator('[data-create-post="dialog"]').waitFor({ timeout: 5000 });
    await D.page.locator('[data-compose-example="selling everything before i move out"]').click();
    await D.page.locator("[data-compose-suggest] [data-compose-preview][data-ready]").waitFor({ timeout: 15_000 });
    await D.page.waitForTimeout(500);
    await D.page.screenshot({ path: join(SHOTS, `6-desktop-dialog-${theme}.png`) });
    await D.page.locator("[data-compose-ask-muse]").click();
    await D.page.locator("[data-ask-card] [data-compose-preview][data-ready]").first().waitFor({ timeout: 15_000 });
    await D.page.waitForTimeout(800);
    await D.page.screenshot({ path: join(SHOTS, `7-desktop-ask-muse-${theme}.png`) });
  } finally {
    await D.ctx.close();
  }
}

if (import.meta.main) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { chromium } = await import("playwright");
  const { startStack } = await import("../services/demo/stack.ts");
  const dir = mkdtempSync(join(tmpdir(), "muse-compose-"));
  const r = new Report();
  const shots = process.argv.includes("--shots");
  // COMPOSE_MODEL=1: the live model (Muse) reads the posts; otherwise recorded answers only.
  const stack = await startStack({ db: join(dir, "demo.sqlite"), model: process.env.COMPOSE_MODEL === "1" ? "auto" : "replay", hosts: ["127.0.0.1"], port: 4690, framePort: 4691, build: process.env.E2E_NO_BUILD !== "1", log: (l) => console.log("  " + l) });
  const url = `http://127.0.0.1:${stack.gateway.port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    await composeFlow(r, browser, url, stack, { theme: "light", shots });
    if (shots) {
      await composeFlow(r, browser, url, stack, { theme: "dark", shots, tag: "dark: " });
      await desktopShot(browser, url, "light");
      await desktopShot(browser, url, "dark");
      console.log(`screenshots in ${SHOTS}`);
    }
  } finally {
    await browser.close();
    await stack.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${r.checks.length - r.failed.length} of ${r.checks.length} compose checks passed`);
  process.exit(r.failed.length ? 1 : 0);
}
