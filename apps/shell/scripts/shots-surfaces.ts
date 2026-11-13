/** Screenshots of the Facebook surfaces (src/surfaces), called from shots.ts: every new screen on phone light and dark, desktop light. */
import type { Browser, Page } from "playwright";
import { DESKTOP, PHONE } from "./lib.ts";

type Step = (p: Page) => Promise<void>;
const none: Step = async () => {};
const click = (name: string | RegExp, ms = 500): Step => async (p) => {
  await p.getByRole("button", { name }).first().click();
  await p.waitForTimeout(ms);
};
const seq = (...s: Step[]): Step => async (p) => {
  for (const x of s) await x(p);
};
const scroll = (sel: string, y: number): Step => async (p) => {
  await p.evaluate(([s, v]) => document.querySelectorAll<HTMLElement>(s as string).forEach((e) => (e.scrollTop = v as number)), [sel, y] as const);
  await p.waitForTimeout(300);
};
const saveTwo: Step = async (p) => {
  await click(/Grey sectional couch/)(p);
  await p.locator(".page.push.shown").getByRole("button", { name: "Save" }).click();
  await click("Back")(p);
  await click(/Green velvet loveseat/)(p);
  await p.locator(".page.push.shown").getByRole("button", { name: "Save" }).click();
  await p.waitForTimeout(300);
};
const typeSublet: Step = async (p) => {
  await p.getByRole("textbox", { name: "Write something" }).fill("looking for a summer sublet near campus jun-aug");
  await p.waitForTimeout(300);
};
const toTry: Step = seq(click("Share", 300), click("Send to apt 4b", 300), click("View", 900));

const PHONE_SHOTS: [string, string, Step, boolean][] = [
  // name, query, steps, also in dark
  ["fb-home", "&app=facebook", none, true],
  ["fb-home-tool-post", "&app=facebook", scroll(".fb-scroll", 640), true],
  ["fb-home-bracket-post", "&app=facebook", scroll(".fb-scroll", 1640), true],
  ["fb-use-for-group-picker", "&app=facebook", click("Use for my group"), true],
  ["fb-use-for-group-building", "&app=facebook", seq(click("Use for my group"), async (p) => { await p.getByRole("dialog").getByRole("button", { name: /senior week/ }).click(); await p.waitForTimeout(700); }), false],
  ["fb-use-for-group-landed", "&app=facebook", seq(click("Use for my group"), async (p) => { await p.getByRole("dialog").getByRole("button", { name: /senior week/ }).click(); await p.waitForTimeout(2300); }), true],
  ["fb-marketplace", "&app=facebook&fb=marketplace", none, true],
  ["fb-listing-decide", "&app=facebook&fb=marketplace", saveTwo, true],
  ["fb-listing-share-split", "&app=facebook&fb=listing:l-desk", click("Share"), true],
  ["fb-decide-landed", "&app=facebook&fb=marketplace", seq(saveTwo, async (p) => { await p.locator(".page.push.shown [data-muse-option]").click(); await p.waitForTimeout(400); await p.getByRole("dialog").getByRole("button", { name: /apt 4b/ }).click(); await p.waitForTimeout(2300); }), false],
  ["fb-group-sublets-match", "&app=facebook&fb=group:sublets", seq(typeSublet, scroll(".fb-scroll", 330)), true],
  ["fb-group-sublets-finder", "&app=facebook&fb=group:sublets", seq(typeSublet, click(/See 7 that match/, 2400)), true],
  ["fb-group-climb", "&app=facebook&fb=group:climb", scroll(".fb-scroll", 380), true],
  ["fb-reels", "&app=facebook&fb=reels", none, true],
  ["fb-reel-share", "&app=facebook&fb=reels", click("Share"), true],
  ["fb-reel-to-try-option", "&app=facebook&fb=reels", toTry, true],
  ["fb-reel-to-try-landed", "&app=facebook&fb=reels", seq(toTry, async (p) => { await p.locator(".page.push.shown [data-muse-option]").click(); await p.waitForTimeout(2300); }), false],
  ["fb-story-poll", "&app=facebook&fb=story:s-me", none, true],
  ["fb-story-plan-landed", "&app=facebook&fb=story:s-me", click("Make it a plan", 2300), false],
  ["fb-gaming", "&app=facebook&fb=gaming", none, true],
  ["fb-notifications", "&app=facebook&fb=notifications", none, true],
  ["fb-menu", "&app=facebook&fb=menu", none, true],
  ["messenger-inbox-needs-you", "", none, true],
  ["messenger-priya-to-try", "&chat=priya", none, true],
];

const DESK_SHOTS: [string, string, Step][] = [
  ["fb-desk-home", "&app=facebook", none],
  ["fb-desk-home-posts", "&app=facebook", scroll(".main", 560)],
  ["fb-desk-marketplace", "&app=facebook&fb=marketplace", none],
  ["fb-desk-listing", "&app=facebook&fb=listing:l-loveseat", none],
  ["fb-desk-group", "&app=facebook&fb=group:climb", none],
  ["fb-desk-group-sublets-finder", "&app=facebook&fb=group:sublets", seq(typeSublet, click(/See 7 that match/, 2400))],
  ["fb-desk-gaming", "&app=facebook&fb=gaming", none],
  ["fb-desk-reels", "&app=facebook&fb=reels", none],
  ["fb-desk-notifications", "&app=facebook", click(/notifications/)],
  ["fb-desk-messenger-needs-you", "", none],
];

export async function surfaceShots(browser: Browser, url: string, shot: (p: Page, name: string) => Promise<void>) {
  for (const theme of ["light", "dark"] as const) {
    for (const [name, q, step, dark] of PHONE_SHOTS) {
      if (theme === "dark" && !dark) continue;
      const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: theme });
      const page = await ctx.newPage();
      await page.goto(`${url}?safe=1&theme=${theme}${q}`);
      await page.waitForTimeout(450);
      try {
        await step(page);
        await shot(page, `phone-${name}-${theme}`);
      } catch (e) {
        console.log(`shot ${name} ${theme} failed: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }
  for (const [name, q, step] of DESK_SHOTS) {
    const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${url}?theme=light${q}`);
    await page.waitForTimeout(500);
    try {
      await step(page);
      await shot(page, `desktop-${name}-light`);
    } catch (e) {
      console.log(`shot ${name} failed: ${(e as Error).message.split("\n")[0]}`);
    }
    await ctx.close();
  }
}
