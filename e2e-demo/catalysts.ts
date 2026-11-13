// The catalysts on the Facebook surfaces, two people, against the live stack (apps/shell/src/muse):
// an ask on an event page builds a tool on the page that both people there use; a suggestion on a
// Marketplace listing builds from that listing's data; a reel shared to a chat offers a
// suggestion from the reel's content and the tool lands in the chat for the second person; an
// unmatched ask falls through to the factory (recorded-answer model); the unprompted switch shows
// nothing when off. Called from run.ts; `bun e2e-demo/catalysts.ts` runs only these, on ports
// 4680 and 4681 (`E2E_NO_BUILD=1` skips the builds; `BREAK=<check>` breaks one on purpose).

import type { Browser, Frame, Page } from "playwright";
import { frameText, PHONE, Report, until } from "./lib.ts";

const BREAK = process.env.BREAK ?? "";

async function open(browser: Browser, url: string, as: string, query: string, wait: string) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${as}] page error: ${e.message}`));
  await page.goto(`${url}?as=${as}&safe=1${query}`);
  await page.waitForSelector(wait, { timeout: 15_000 });
  return { ctx, page };
}

/** The frame of an on-page tool. */
async function pageFrame(p: Page, toolId: string): Promise<Frame> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const f = p.locator(`[data-surface-tool="${toolId}"] iframe`);
    if (await f.count()) {
      const fr = await (await f.first().elementHandle())!.contentFrame();
      if (fr) {
        await fr.waitForSelector(".m-root > *", { timeout: 8000 });
        return fr;
      }
    }
    if (Date.now() > deadline) throw new Error(`no frame for ${toolId}`);
    await p.waitForTimeout(150);
  }
}

const top = (p: Page) => p.locator(".page.push.shown").last();
const lastPath = async (p: Page, n: number) => {
  await until(p, `window.__musePaths.length > ${n}`, 5000);
  return (await paths(p)).at(-1)!;
};
const paths = (p: Page) => p.evaluate(() => (window as unknown as { __musePaths: { path: string; scenario: string | null; tool: string | null; ask: string }[] }).__musePaths);
/** Tool ids on a page's room, newest last. */
const pageTools = (p: Page, key: string) => p.evaluate((k) => [...document.querySelectorAll(`[data-page-tools="${k}"] [data-surface-tool]`)].map((e) => (e as HTMLElement).dataset.surfaceTool!), key);
/** Frames render once on screen: bring a page tool into view, then wait for it. */
async function seeTool(p: Page, key: string, id: string, ms = 15_000) {
  await until(p, `!!document.querySelector('[data-page-tools="${key}"] [data-surface-tool="${id}"]')`, ms);
  await p.locator(`[data-surface-tool="${id}"]`).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await until(p, readyIn(key, id), ms);
}
const readyIn = (key: string, id: string) => `!!document.querySelector('[data-page-tools="${key}"] [data-surface-tool="${id}"] [data-live="ready"]')`;

/** Taps a button in A's frame; waits until B's frame shows something new. */
async function syncs(fa: Frame, fb: Frame, button: RegExp) {
  const before = await frameText(fb);
  const t = Date.now();
  await fa.getByRole("button", { name: button }).first().click();
  await fb.waitForFunction((x) => (document.querySelector(".m-root")?.textContent ?? "") !== x, before, { timeout: 8000 });
  return Date.now() - t;
}

async function newPageTool(p: Page, key: string, before: string[], ms = 20_000): Promise<string> {
  const deadline = Date.now() + ms;
  for (;;) {
    const ids = await pageTools(p, key);
    const fresh = ids.filter((x) => !before.includes(x));
    for (const id of fresh) {
      await p.locator(`[data-surface-tool="${id}"]`).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      if (await p.evaluate((js) => eval(js), readyIn(key, id))) return id;
    }
    if (Date.now() > deadline) throw new Error(`no new tool on ${key} (had ${ids.join(", ")})`);
    await p.waitForTimeout(150);
  }
}

export async function catalystFlows(r: Report, browser: Browser, url: string) {
  // 0. Every tool that lives on a page opens there: scrolled into view, each reaches ready.
  await r.step("Every inline tool on Home, Events, Marketplace, Groups, Gaming and Stories opens on first view", async () => {
    const pages: [string, string][] = [
      ["Home", "&app=facebook"],
      ["Event", "&event=juniper"],
      ["Listing sectional", "&app=facebook&fb=listing:l-sectional"],
      ["Listing loveseat", "&app=facebook&fb=listing:l-loveseat"],
      ["Listing desk", "&app=facebook&fb=listing:l-desk"],
      ["Group sublets", "&app=facebook&fb=group:sublets"],
      ["Group climbing", "&app=facebook&fb=group:climb"],
      ["Gaming", "&app=facebook&fb=gaming"],
      ["Story", "&app=facebook&fb=story:s-trip"],
    ];
    const seen: string[] = [];
    for (const [name, q] of pages) {
      const A = await open(browser, url, "noa", q, "[data-surface-tool]");
      try {
        await A.page.waitForTimeout(1500);
        const ids = await A.page.evaluate(() => [...document.querySelectorAll("[data-surface-tool]")].filter((e) => (e as HTMLElement).offsetParent !== null || e.getClientRects().length).map((e) => (e as HTMLElement).dataset.surfaceTool!));
        if (!ids.length) throw new Error(`${name}: no tool on the page`);
        for (const id of ids) {
          await A.page.locator(`[data-surface-tool="${id}"]`).first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
          const sel = `[data-surface-tool="${BREAK === "inline" ? "nope" : id}"] [data-live="ready"]`;
          await until(A.page, `!!document.querySelector('${sel}')`, 15_000).catch(() => {
            throw new Error(`${name}: ${id} did not open`);
          });
        }
        seen.push(`${name} ${ids.length}`);
      } finally {
        await A.ctx.close();
      }
    }
    return seen.join(", ");
  });

  // 1. Events: an ask on the event page builds a tool on the page; both people use it.
  await r.step("Events: an ask on the event page builds a page tool both people use and see each other's taps", async () => {
    const key = "surface:page:event:juniper";
    const A = await open(browser, url, "noa", "&event=juniper", ".page.push.shown [data-muse-ask]");
    const B = await open(browser, url, "maya", "&event=juniper", ".page.push.shown [data-muse-ask]");
    try {
      // Catalyst 3 is already there: Maya's rides, credited to her.
      await until(A.page, `!!document.querySelector('[data-page-tools="${key}"] [data-surface-tool] [data-live="ready"]')`, 15_000);
      const credit = await top(A.page).locator(`[data-page-tools="${key}"] .by`).first().innerText();
      if (!/Maya made this/.test(credit)) throw new Error(`the seeded tool says "${credit}"`);
      const before = await pageTools(A.page, key);
      const t0 = Date.now();
      await top(A.page).getByRole("textbox", { name: /Ask Muse/ }).fill(BREAK === "event" ? "zzz qqq" : "which song do they open with");
      await top(A.page).getByRole("textbox", { name: /Ask Muse/ }).press("Enter");
      const id = await newPageTool(A.page, key, before);
      const built = Date.now() - t0;
      const p = (await paths(A.page)).at(-1)!;
      if (p.path !== "premade" || p.scenario !== "event-setlist") throw new Error(`path was ${JSON.stringify(p)}`);
      await seeTool(B.page, key, id);
      const fa = await pageFrame(A.page, id);
      const fb = await pageFrame(B.page, id);
      for (const pg of [A.page, B.page]) await pg.locator(`[data-surface-tool="${id}"]`).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      const text = await frameText(fa);
      if (!/Paper Lanterns/.test(text)) throw new Error(`the tool shows "${text.slice(0, 80)}"`);
      const ms = await syncs(fa, fb, /Paper Lanterns/);
      r.time("event ask to tool on the page (premade)", built);
      return `${p.tool}, built in ${built} ms; Maya saw Tsai Lin's vote in ${ms} ms`;
    } finally {
      await A.ctx.close();
      await B.ctx.close();
    }
  });

  // 2. Marketplace: a suggestion on a listing builds from that listing's own data.
  await r.step("Marketplace: saving the sectional offers Will it fit in 4B; it builds from the listing's size", async () => {
    const key = "surface:page:listing:l-sectional";
    const A = await open(browser, url, "noa", "&app=facebook&fb=listing:l-sectional", ".page.push.shown [data-muse-ask], [data-muse-ask]");
    const B = await open(browser, url, "priya", "&app=facebook&fb=listing:l-sectional", "[data-muse-ask]");
    try {
      await A.page.getByRole("button", { name: "Save" }).first().click();
      const row = A.page.locator(`[data-muse-option][data-scenario="${BREAK === "listing" ? "nope" : "mp-room-fit"}"]`);
      await row.waitFor({ timeout: 5000 });
      const before = await pageTools(A.page, key);
      await row.click();
      const id = await newPageTool(A.page, key, before);
      const fa = await pageFrame(A.page, id);
      const text = await frameText(fa);
      const p = (await paths(A.page)).at(-1)!;
      if (p.path !== "premade") throw new Error(`path was ${p.path}`);
      // From the listing: the room-fit tool names the couch and its price; the fallback names its 92 in width.
      if (!/Grey sectional|92 in|\$180/.test(text)) throw new Error(`the tool does not show the listing: "${text.slice(0, 120)}"`);
      await seeTool(B.page, key, id);
      return `${p.tool}: "${text.slice(0, 60)}"; Will has it on the listing too`;
    } finally {
      await A.ctx.close();
      await B.ctx.close();
    }
  });

  // 3. Reels: share a recipe reel to a chat; the suggestion under it comes from the reel; the tool lands for the second person.
  await r.step("Reels: a recipe reel shared to apt 4b offers a cook night from its ingredients; Maya gets the tool", async () => {
    const A = await open(browser, url, "noa", "&app=facebook&fb=reels", '[data-reel="r-noodles"]');
    const B = await open(browser, url, "maya", "&chat=apt4b", ".page.push .thread");
    try {
      await A.page.locator('[data-reel="r-noodles"]').scrollIntoViewIfNeeded();
      await A.page.locator('[data-reel="r-noodles"]').getByRole("button", { name: "Share" }).click();
      await A.page.getByRole("button", { name: "Send to apt 4b" }).click();
      await A.page.getByRole("status").getByRole("button", { name: "View" }).click();
      await until(A.page, `!!document.querySelector('.page.push.shown .thread[aria-label="Chat with apt 4b"]')`, 5000);
      const opt = top(A.page).locator('[data-muse-option][data-scenario="reel-cook-night"]').last();
      await opt.waitFor({ timeout: 5000 });
      const label = await opt.innerText();
      if (!/cook night/i.test(label) || !(BREAK === "reel" ? /8 things/ : /6 things/).test(label)) throw new Error(`the suggestion says "${label}"`);
      await opt.click();
      const last = `[...document.querySelectorAll('.page.push.shown .thread [data-muse-card]')].at(-1)?.dataset.live === "ready"`;
      await A.page.waitForTimeout(1200);
      await top(A.page).locator(".thread [data-muse-card]").last().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await until(A.page, last, 20_000);
      const toolId = (await top(A.page).locator(".thread [data-muse-card]").last().getAttribute("data-tool-id"))!;
      await until(B.page, `!!document.querySelector('.page.push.shown [data-muse-card][data-tool-id="${toolId}"]')`, 15_000);
      await B.page.locator(`.page.push.shown [data-muse-card][data-tool-id="${toolId}"]`).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await until(B.page, `!!document.querySelector('.page.push.shown [data-muse-card][data-tool-id="${toolId}"][data-live="ready"]')`, 15_000);
      const p = (await paths(A.page)).at(-1)!;
      return `"${label.replace(/\s+/g, " ")}" -> ${p.tool}; Maya has it in apt 4b`;
    } finally {
      await A.ctx.close();
      await B.ctx.close();
    }
  });

  // 4. An ask nothing in the pack matches goes to the factory, with the page's context.
  await r.step("Groups: an unmatched ask falls through to the factory with the group's context", async () => {
    const key = "surface:group:climb";
    const A = await open(browser, url, "noa", "&app=facebook&fb=group:climb", "[data-muse-ask]");
    try {
      const before = await pageTools(A.page, key);
      const n0 = (await paths(A.page)).length;
      const sent: string[] = [];
      A.page.on("request", (q) => {
        if (q.url().endsWith("/generate")) sent.push(q.postData() ?? "");
      });
      await A.page.getByRole("textbox", { name: /Ask Muse/ }).fill(BREAK === "factory" ? "which song do they open with" : "make a chore wheel");
      await A.page.getByRole("textbox", { name: /Ask Muse/ }).press("Enter");
      const p = await lastPath(A.page, n0);
      if (p.path !== "factory") throw new Error(`path was ${p.path} (${p.scenario})`);
      const id = await newPageTool(A.page, key, before, 40_000);
      const body = JSON.parse(sent[0] ?? "{}") as { surface?: string; chat?: { title?: string; messages?: { from: string; text: string }[] } };
      if (body.surface !== "group" || !body.chat?.messages?.some((m) => m.from === "Facebook" && /climbing club/.test(m.text))) throw new Error(`the factory got ${JSON.stringify(body).slice(0, 200)}`);
      return `factory got surface ${body.surface} and ${body.chat!.messages!.filter((m) => m.from === "Facebook").length} context lines; tool ${id} on the group`;
    } finally {
      await A.ctx.close();
    }
  });

  // 5. Timed suggestions are off unless switched on.
  await r.step("Unprompted: off by default shows nothing; ?unprompted=1 shows the timed card and row", async () => {
    const off = await open(browser, url, "noa", "&app=facebook", "[data-post]");
    const on = await open(browser, url, "noa", "&app=facebook&unprompted=1", "[data-post]");
    try {
      const n0 = await off.page.locator("[data-unprompted]").count();
      const n1 = await on.page.locator("[data-unprompted]").count();
      if (BREAK === "unprompted" ? n0 === 0 : n0 !== 0) throw new Error(`off shows ${n0} unprompted cards`);
      if (n1 === 0) throw new Error("on shows no unprompted card");
      return `off: ${n0}, on: ${n1}`;
    } finally {
      await off.ctx.close();
      await on.ctx.close();
    }
  });
}

if (import.meta.main) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { chromium } = await import("playwright");
  const { startStack } = await import("../services/demo/stack.ts");
  const dir = mkdtempSync(join(tmpdir(), "muse-cat-"));
  const r = new Report();
  const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], port: 4680, framePort: 4681, build: process.env.E2E_NO_BUILD !== "1", log: (l) => console.log("  " + l) });
  const browser = await chromium.launch({ headless: true });
  try {
    await catalystFlows(r, browser, `http://127.0.0.1:${stack.gateway.port}/`);
  } finally {
    await browser.close();
    await stack.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${r.checks.length - r.failed.length} of ${r.checks.length} catalyst checks passed`);
  process.exit(r.failed.length ? 1 : 0);
}
