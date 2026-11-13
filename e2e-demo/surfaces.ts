// Cross-surface flows, two people, against the live stack: a Muse moment on a Facebook surface
// lands a tool in a chat through the live store, the second person in that chat sees it, and a
// tap in one syncs to the other. Called from run.ts.

import type { Browser, Page } from "playwright";
import { card, frameText, PHONE, thread, toolFrame, until, type Report } from "./lib.ts";

async function open(browser: Browser, url: string, as: string, query: string, wait: string) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${as}] page error: ${e.message}`));
  await page.goto(`${url}?as=${as}&safe=1${query}`);
  await page.waitForSelector(wait, { timeout: 15_000 });
  return { ctx, page };
}

const ready = (id: string) => `!!document.querySelector('.page.push.shown [data-muse-card][data-tool-id="${id}"][data-live="ready"]')`;
/** The pushed page has finished opening (no transition running), as a person would see it before tapping. */
const settled = async (p: Page) => {
  await until(p, `[...document.querySelectorAll(".page.push.shown")].every((el) => !el.getAnimations().length)`, 5000);
  await p.waitForTimeout(100);
};
/** A card more than `n` is in the open thread and the last one is ready: the new tool, not an older one. */
const newReady = (n: number) => `[...document.querySelectorAll('.page.push.shown .thread [data-muse-card]')].length > ${n} && [...document.querySelectorAll('.page.push.shown .thread [data-muse-card]')].at(-1).dataset.live === "ready"`;
const cardCount = (p: Page) => p.locator(".page.push.shown .thread [data-muse-card]").count();

/** Taps a button in A's frame and waits until B's frame of the same tool shows something new. */
async function tapSyncs(a: Page, b: Page, toolId: string, button: RegExp) {
  for (const p of [a, b])
    await card(p, toolId).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const fa = await toolFrame(a, toolId);
  const fb = await toolFrame(b, toolId);
  const before = await frameText(fb);
  const t = Date.now();
  await fa.getByRole("button", { name: button }).first().click();
  await fb.waitForFunction((x) => (document.querySelector(".m-root")?.textContent ?? "") !== x, before, { timeout: 8000 });
  return { ms: Date.now() - t, text: await frameText(fb) };
}

export async function surfaceFlows(r: Report, browser: Browser, url: string) {
  // 1. Home: a friend's tool post, "Use for my group", lands in senior week for everyone in it.
  await r.step("Home: a friend's chore wheel post is a live preview; Use for my group lands it in a chat both see", async () => {
    const A = await open(browser, url, "noa", "&app=facebook", '[data-post="p-den"]');
    const B = await open(browser, url, "maya", "&chat=senior", ".page.push .thread");
    try {
      await A.page.locator('[data-post="p-den"]').scrollIntoViewIfNeeded();
      await until(A.page, `!!document.querySelector('[data-surface-tool="t-s-den-draft"] [data-live="ready"]')`, 15_000);
      // chore-wheel draws its slices on a canvas: the chores are in the canvas label, not in the text
      const den = await toolFrameIn(A.page, "t-s-den-draft");
      const labels = (await den.evaluate(() => [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).join(" "))) as string;
      const preview = `${await frameText(den)} ${labels}`;
      if (!/Dishes/.test(preview)) throw new Error(`the preview shows "${preview}"`);
      await A.page.locator('[data-post="p-den"]').getByRole("button", { name: "Use for my group" }).click(); // other posts carry tools of their own
      await A.page.getByRole("dialog").getByRole("button", { name: /senior week/ }).click();
      await until(A.page, `!!document.querySelector('.page.push.shown .thread[aria-label="Chat with senior week"]')`, 5000);
      // senior week already has a wheel: wait for the new card, not the last one there
      await until(A.page, `!!document.querySelector('.page.push.shown .thread [data-muse-card][aria-label="Chore wheel"][data-live="ready"]')`, 20_000);
      const toolId = (await A.page.locator('.page.push.shown .thread [data-muse-card][aria-label="Chore wheel"]').last().getAttribute("data-tool-id"))!;
      await until(B.page, ready(toolId), 15_000);
      const text = await frameText(await toolFrame(A.page, toolId));
      if (!/Dishes/.test(text)) throw new Error(`the new wheel shows "${text}"`);
      // Chore wheel (lab): whoever has not spun spins; the other sees it.
      const fa = await toolFrame(A.page, toolId);
      const onA = (await fa.getByRole("button", { name: /^Spin/ }).count()) > 0 && (await fa.getByRole("button", { name: /^Spin/ }).first().isEnabled());
      const s = onA ? await tapSyncs(A.page, B.page, toolId, /^Spin/) : await tapSyncs(B.page, A.page, toolId, /^Spin/);
      return `preview "${preview.slice(0, 40)}"; Maya saw the tap in ${s.ms} ms`;
    } finally {
      await A.ctx.close();
      await B.ctx.close();
    }
  });

  // 2. Reels: share a reel to a chat, "Add to our to-try list" makes the list; a second reel adds to it.
  await r.step("Reels: a shared reel's Add to our to-try list makes a list both see; a second reel adds to it", async () => {
    const A = await open(browser, url, "noa", "&app=facebook&fb=reels", '[data-reel="r-dumplings"]');
    const B = await open(browser, url, "maya", "&chat=apt4b", ".page.push .thread");
    try {
      const share = async (reelId: string) => {
        await A.page.locator(`[data-reel="${reelId}"]`).scrollIntoViewIfNeeded();
        await A.page.locator(`[data-reel="${reelId}"]`).getByRole("button", { name: "Share" }).click();
        await A.page.getByRole("button", { name: "Send to apt 4b" }).click();
        await A.page.getByRole("status").getByRole("button", { name: "View" }).click();
        await until(A.page, `!!document.querySelector('.page.push.shown .thread[aria-label="Chat with apt 4b"]')`, 5000);
        await settled(A.page);
      };
      await share("r-dumplings");
      const before = await cardCount(A.page);
      await A.page.locator('.page.push.shown [data-muse-option][data-scenario="reel-to-try"]').last().click();
      await until(A.page, newReady(before), 20_000);
      const toolId = (await card(A.page).getAttribute("data-tool-id"))!;
      const first = await frameText(await toolFrame(A.page, toolId));
      if (!/Golden Fold/.test(first) || !/Dumpling Alley/.test(first)) throw new Error(`the list shows "${first}"`);
      await until(B.page, ready(toolId), 15_000);
      const s = await tapSyncs(B.page, A.page, toolId, /Golden Fold/);
      // A second reel to the same chat adds to the same list.
      await A.page.goBack();
      await A.page.waitForTimeout(600);
      const cards = await thread(B.page).locator("[data-muse-card]").count();
      await share("r-tacos");
      await A.page.locator('.page.push.shown [data-muse-option][data-scenario="reel-to-try"]').last().click();
      const fb = await toolFrame(B.page, toolId);
      await fb.waitForFunction(() => /El Primo truck/.test(document.querySelector(".m-root")?.textContent ?? ""), null, { timeout: 10_000 });
      if ((await thread(B.page).locator("[data-muse-card]").count()) !== cards) throw new Error("a second list was made");
      return `"${first.slice(0, 50)}"; Tsai Lin saw Maya's vote in ${s.ms} ms; the second reel added to the same list`;
    } finally {
      await A.ctx.close();
      await B.ctx.close();
    }
  });

  // 3. Marketplace: save two couches, "Decide with roommates" puts them in a shortlist in apt 4b.
  await r.step("Marketplace: a second saved couch offers Decide with roommates; Maya gets a needs-you row and her save syncs", async () => {
    const A = await open(browser, url, "noa", "&app=facebook&fb=marketplace", ".mp .grid");
    let B: Awaited<ReturnType<typeof open>> | undefined;
    try {
      for (const name of [/Grey sectional couch/, /Green velvet loveseat/]) {
        await A.page.getByRole("button", { name }).first().click();
        await A.page.waitForSelector('.page.push.shown section[aria-label="Listing"]');
        await A.page.waitForTimeout(450);
        await A.page.locator(".page.push.shown").getByRole("button", { name: "Save" }).click();
        if (/sectional/.test(String(name))) {
          await A.page.locator(".page.push.shown").getByRole("button", { name: "Back" }).click();
          await A.page.waitForTimeout(500);
        }
      }
      await settled(A.page);
      await A.page.locator('.page.push.shown [data-muse-option][data-scenario="mp-decide"]').click(); // a big saved couch also offers Will it fit
      await A.page.getByRole("dialog").getByRole("button", { name: /apt 4b/ }).click();
      await until(A.page, `!!document.querySelector('.page.push.shown .thread[aria-label="Chat with apt 4b"]')`, 5000);
      await until(A.page, `!!document.querySelector('.page.push.shown .thread [data-muse-card][aria-label="Which couch?"][data-live="ready"]')`, 20_000);
      const toolId = (await A.page.locator('.page.push.shown .thread [data-muse-card][aria-label="Which couch?"]').last().getAttribute("data-tool-id"))!;
      const text = await frameText(await toolFrame(A.page, toolId));
      // The group buy (lab): both saved couches, with the roommates' votes already in.
      if (!/sectional/i.test(text) || !/loveseat/i.test(text)) throw new Error(`the group buy shows "${text}"`);
      B = await open(browser, url, "maya", "", ".inbox");
      await until(B.page, `!!document.querySelector('.inbox [data-needs-you="${toolId}"]')`, 10_000);
      await B.page.locator(`.inbox [data-needs-you="${toolId}"]`).click();
      await until(B.page, ready(toolId), 15_000);
      const s = await tapSyncs(B.page, A.page, toolId, /^Vote$/);
      return `"${text.slice(0, 60)}"; Tsai Lin saw Maya's vote in ${s.ms} ms`;
    } finally {
      await A.ctx.close();
      await B?.ctx.close();
    }
  });
}

/** A surface tool's frame (a post or a group), not in a thread. */
async function toolFrameIn(p: Page, toolId: string) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const f = p.locator(`[data-surface-tool="${toolId}"] iframe`);
    let fr = (await f.count()) ? await (await f.first().elementHandle())!.contentFrame() : null;
    // WebKit: frames sit in a positioned layer over their slot, not inside it
    const box = fr ? null : await p.locator(`[data-surface-tool="${toolId}"] [data-muse-card]`).first().boundingBox();
    if (box)
      for (const x of p.frames()) {
        if (x === p.mainFrame()) continue;
        const r = await (await x.frameElement()).boundingBox();
        if (r && r.height > 2 && Math.abs(r.x - box.x) < 4 && r.y >= box.y - 4 && r.y < box.y + box.height) fr = x;
      }
    if (fr) {
      await fr.waitForSelector(".m-root > *", { timeout: 5000 });
      return fr;
    }
    if (Date.now() > deadline) throw new Error(`no frame for ${toolId}`);
    await p.waitForTimeout(100);
  }
}
