// bun e2e-demo/shots.ts [outDir]: headless screenshots of the live demo at phone size, light and
// dark: the building state, a real tool mounted on both phones after an action, the inbox with a
// live row, and the Event chat with its tool. Uses the replay model and a temp database.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startStack } from "../services/demo/stack.ts";
import { phone, send, thread, toolFrame, until } from "./lib.ts";

const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), "muse-shots-"));
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "muse-shots-db-"));
// A slow factory so the building state can be photographed.
const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], build: process.env.E2E_NO_BUILD !== "1", factoryEnv: { MUSE_DELAY_MS: "2500" }, log: () => {} });
const url = `http://127.0.0.1:${stack.gateway.port}/`;
const browser = await chromium.launch({ headless: true });
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(450);
  await p.screenshot({ path: join(out, name + ".png") });
  console.log(join(out, name + ".png"));
};

try {
  for (const theme of ["light", "dark"] as const) {
    const chat = theme === "light" ? "senior" : "apt4b";
    const A = await phone(browser, url, "noa", `&chat=${chat}`, theme);
    const B = await phone(browser, url, "maya", "", theme);
    await send(A.page, "muse pick for us");
    await until(A.page, `!!document.querySelector('.page.push.shown [data-muse-card][aria-busy="true"]')`);
    await shot(A.page, `${theme}-1-building`);
    await until(A.page, `!!document.querySelector('.page.push.shown [data-muse-card][data-live="ready"]')`, 30_000);
    // B: the inbox with the live row, before opening it.
    await until(B.page, `[...document.querySelectorAll('.inbox [data-live-tool]')].length > 0`, 10_000).catch(() => {});
    await shot(B.page, `${theme}-3-inbox-live-row`);
    await B.page.locator("button.row", { hasText: theme === "light" ? "senior week" : "apt 4b" }).first().click();
    await B.page.waitForSelector(".page.push.shown .thread [data-live='ready']");
    const toolId = (await thread(A.page).locator("[data-muse-card]").last().getAttribute("data-tool-id"))!;
    const fa = await toolFrame(A.page, toolId);
    await fa.getByRole("button", { name: "Spin" }).click();
    await A.page.waitForTimeout(3400);
    await shot(A.page, `${theme}-2-tool-after-tap-A`);
    await shot(B.page, `${theme}-2-tool-after-tap-B`);
    // The Event chat with its tool.
    await A.page.goto(`${url}?as=noa&safe=1&theme=${theme}&event=juniper`);
    if (!(await A.page.locator(".moment").count())) await A.page.getByRole("button", { name: "Interested" }).click();
    await A.page.getByRole("button", { name: "Go together" }).click();
    await until(A.page, `!!document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] [data-live="ready"]')`, 20_000);
    await shot(A.page, `${theme}-4-event-chat-tool`);
    await A.ctx.close();
    await B.ctx.close();
  }

  // Desktop: the senior week tool in the thread panel (capped at 588), light.
  {
    const ctx = await browser.newContext({ viewport: { width: 1512, height: 860 }, colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${url}?as=maya&chat=senior`);
    await page.waitForSelector(".panel [data-muse-card][data-live='ready']", { timeout: 20_000 });
    await shot(page, "desktop-light-tool");
    await ctx.close();
  }
  // The empty state: a wheel made from search, in a chat that names no places.
  {
    const P = await phone(browser, url, "noa", "", "light");
    await P.page.getByRole("button", { name: "Ask Meta AI or search" }).click();
    await P.page.waitForTimeout(700);
    await P.page.getByRole("button", { name: /Pick for us/ }).click();
    await P.page.getByRole("dialog").getByRole("button", { name: /the boys/ }).click();
    await until(P.page, `[...document.querySelectorAll('.page.push.shown [data-muse-card][data-live="ready"]')].length > 0`, 20_000);
    await P.page.waitForTimeout(800);
    await thread(P.page).locator("[data-muse-card]").last().evaluate((el) => {
      const list = el.closest(".list")!;
      list.scrollTo({ top: list.scrollTop + el.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 16, behavior: "instant" });
    });
    await shot(P.page, "light-5-empty-wheel");
    await P.ctx.close();
  }
  // The frame port blocked: tools load from the main port.
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light" });
    await ctx.route(`http://127.0.0.1:${stack.gateway.framePort}/**`, (r) => r.abort("blockedbyclient"));
    const page = await ctx.newPage();
    await page.goto(`${url}?as=jonah&safe=1&chat=senior`);
    await page.waitForSelector(".page.push.shown [data-muse-card][data-live='ready']", { timeout: 20_000 });
    await shot(page, "light-6-frame-port-blocked");
    await ctx.close();
  }
  // Facebook surfaces, live: Home with its friend's tool post, the climbing club's pinned sign-up,
  // and Marketplace's "Decide with roommates" landing a shortlist in apt 4b (light and dark).
  for (const theme of ["light", "dark"] as const) {
    const A = await phone(browser, url, "noa", "", theme);
    await A.page.goto(`${url}?as=noa&safe=1&theme=${theme}&app=facebook`);
    await A.page.waitForSelector('[data-post="p-den"]');
    await A.page.locator('[data-post="p-den"]').scrollIntoViewIfNeeded();
    await until(A.page, `!!document.querySelector('[data-surface-tool="t-s-den-draft"] [data-live="ready"]')`, 20_000);
    await shot(A.page, `${theme}-7-home-tool-post`);
    await A.page.goto(`${url}?as=noa&safe=1&theme=${theme}&app=facebook&fb=group:climb`);
    await until(A.page, `!!document.querySelector('[data-surface-tool="t-s-gear-signup"] [data-live="ready"]')`, 20_000);
    await A.page.locator('[data-surface-tool="t-s-gear-signup"]').scrollIntoViewIfNeeded();
    await shot(A.page, `${theme}-8-group-pinned`);
    await A.page.goto(`${url}?as=noa&safe=1&theme=${theme}&app=facebook&fb=marketplace`);
    await A.page.waitForSelector(".mp .grid");
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
    await shot(A.page, `${theme}-9-listing-decide`);
    await A.page.locator('.page.push.shown [data-muse-option][data-scenario="mp-decide"]').click();
    await A.page.getByRole("dialog").getByRole("button", { name: /apt 4b/ }).click();
    await until(A.page, `[...document.querySelectorAll('.page.push.shown .thread [data-muse-card]')].at(-1)?.dataset.live === "ready"`, 30_000);
    await shot(A.page, `${theme}-10-shortlist-landed`);
    await A.ctx.close();
  }
} finally {
  await browser.close();
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`screenshots in ${out}`);
