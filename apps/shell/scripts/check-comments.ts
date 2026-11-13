/**
 * Checks for the comments view (src/surfaces/comments*.ts, components/Comments.svelte), called from
 * check.ts: the thread opens from the count (phone sheet, desktop inline), the count on a post is its thread's size,
 * long threads show 6 to 10 and "View more comments", a
 * comment you write shows at once and moves the count, replies expand, a like toggles, axe on the
 * open sheet in both themes. Fake store, headless.
 */
import type { Browser, Page } from "playwright";
import { DESKTOP, PHONE } from "./lib.ts";

type Ctx = {
  browser: Browser;
  url: string;
  axe: (p: Page, label: string) => Promise<void>;
  expect: (cond: boolean, msg: string) => boolean;
  ok: (msg: string) => void;
  step: (name: string) => void;
  failures: string[];
};

export async function commentChecks(c: Ctx) {
  const { browser, url, axe, expect, ok, step, failures } = c;
  async function open(theme: "light" | "dark", desk = false) {
    const ctx = await browser.newContext(desk ? { viewport: DESKTOP, colorScheme: theme } : { viewport: PHONE, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`comments page error: ${e.message}`));
    await page.goto(`${url}?as=tsai&theme=${theme}${desk ? "" : "&safe=1"}&app=facebook`);
    await page.waitForSelector("[data-post]");
    return { ctx, page };
  }
  const btn = (p: Page, post: string) => p.locator(`[data-post="${post}"] button[aria-label^="Comment"]`).first();
  const sheet = (p: Page) => p.getByRole("dialog", { name: "Comments" });
  const label = async (p: Page, post: string) => (await btn(p, post).getAttribute("aria-label")) ?? "";

  step("comments: the count on each post is its thread size");
  {
    const { ctx, page } = await open("light");
    const rows = await page.evaluate(() => {
      const w = window as unknown as { __museComments: { size(id: string): number } };
      return [...document.querySelectorAll("[data-post]")].map((e) => {
        const id = e.getAttribute("data-post")!;
        const n = Number(/Comment, (\d+)/.exec(e.querySelector('button[aria-label^="Comment"]')?.getAttribute("aria-label") ?? "")?.[1]);
        return { id, n, size: w.__museComments.size(id) };
      });
    });
    // the number on the post is the size of the thread behind it, for every post, with no exceptions
    const bad = rows.filter((r) => r.n !== r.size);
    expect(!bad.length, `the count on the post is not its thread's size: ${JSON.stringify(bad)}`);
    if (!bad.length) ok(`comments: ${rows.length} posts, every count is its thread's size`);
    await ctx.close();
  }

  step("comments: phone sheet, write, replies, like");
  for (const theme of ["light", "dark"] as const) {
    const { ctx, page } = await open(theme);
    await btn(page, "p-den").click();
    await sheet(page).waitFor({ timeout: 3000 });
    await page.waitForTimeout(500);
    await axe(page, `comments sheet (phone ${theme})`);
    const view = sheet(page).locator("[data-view-replies]").first();
    const hidden = await sheet(page).locator("[data-comment]").count();
    await view.click();
    const shown = await sheet(page).locator("[data-comment]").count();
    expect(shown === hidden + 1, `replies did not expand: ${hidden} then ${shown}`);
    const send = sheet(page).locator(".send");
    expect(await send.isDisabled(), "send is on with no text");
    await sheet(page).locator("input.in").fill("who has the plants this week");
    expect(!(await send.isDisabled()), "send stays off with text");
    await send.click();
    const mine = sheet(page).locator("[data-comment]", { hasText: "who has the plants this week" });
    expect((await mine.count()) === 1, "the new comment is not there at once");
    expect((await label(page, "p-den")) === "Comment, 5", `count is "${await label(page, "p-den")}", expected 5`);
    await mine.getByRole("button", { name: "Like" }).click();
    expect((await mine.locator('[data-comment-likes="1"]').count()) === 1, "like did not show");
    await mine.getByRole("button", { name: "Like" }).click();
    expect((await mine.locator("[data-comment-likes]").count()) === 0, "second tap did not take the like back");
    await sheet(page).getByRole("button", { name: "Reply" }).first().click();
    expect((await sheet(page).locator("[data-replying]").count()) === 1, "Reply shows no replying line");
    await page.keyboard.press("Escape");
    await sheet(page).waitFor({ state: "detached", timeout: 3000 });
    await ctx.close();
  }
  ok("comments: sheet opens, replies expand, comment shows at once and moves the count, like toggles");

  step("comments: long thread and desktop inline");
  {
    const { ctx, page } = await open("light");
    await btn(page, "p-boba").click();
    await sheet(page).waitFor({ timeout: 3000 });
    const n = await sheet(page).locator(".thread > li").count();
    expect(n >= 6 && n <= 10 && (await sheet(page).locator("[data-view-more]").count()) === 1, `long thread shows ${n} and a View more button`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open("light", true);
    await btn(page, "p-den").click();
    const inline = page.locator('[data-post="p-den"] [data-comments]');
    await inline.waitFor({ timeout: 3000 });
    expect((await page.getByRole("dialog", { name: "Comments" }).count()) === 0, "desktop opened a sheet");
    await axe(page, "comments inline (desktop)");
    expect((await inline.locator("input.in").count()) === 1, "no composer under the thread");
    await ctx.close();
  }
  ok("comments: a long thread shows 6 to 10 and View more; desktop opens inline under the post");
}
