/** bun run shots: build, serve on a random port, write PNGs of every screen and state into a temp dir. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { DESKTOP, PHONE, buildApp, launch, reportSizes, serve } from "./lib.ts";
import { surfaceShots } from "./shots-surfaces.ts"; // surfaces

const out = mkdtempSync(join(tmpdir(), "shell-shots-"));
const written: string[] = [];

await buildApp();
reportSizes();
const server = await serve();
const browser = await launch();
console.log(`browser: ${browser.browserType().name()} ${browser.version()} (headless)`);

const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);
async function shot(page: Page, name: string) {
  const path = join(out, `${name}.png`);
  await page.screenshot({ path });
  written.push(path);
}

async function phone(theme: "light" | "dark"): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${server.url}?safe=1&theme=${theme}`);
  await settle(page, 400);
  return [ctx, page];
}
async function desktop(theme: "light" | "dark", query = ""): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${server.url}?theme=${theme}${query}`);
  await settle(page, 500);
  return [ctx, page];
}
const row = (page: Page, name: RegExp) => page.getByRole("button", { name }).first();

for (const theme of ["light", "dark"] as const) {
  // ---- phone ----
  let [ctx, page] = await phone(theme);
  await shot(page, `phone-inbox-${theme}`);
  await row(page, /apt 4b/).click();
  await settle(page, 900);
  await shot(page, `phone-thread-${theme}`);
  if (theme === "light") {
    // pinned bar with two tools opens a sheet
    await page.getByRole("button", { name: "2 tools in this chat" }).click();
    await settle(page, 500);
    await shot(page, `phone-pinned-sheet-${theme}`);
    await page.keyboard.press("Escape");
    await settle(page, 300);
    // send a message and keep the list pinned
    await page.getByRole("textbox", { name: "Message" }).fill("ok spinning now");
    await settle(page, 200);
    await shot(page, `phone-typing-${theme}`);
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await settle(page, 1000);
    await shot(page, `phone-sent-${theme}`);
    // reaction bar via right-click on a bubble
    await page.getByRole("textbox", { name: "Message" }).blur();
    await page.locator(".bubble.text", { hasText: "allegedly" }).click({ button: "right" });
    await settle(page, 600);
    await shot(page, `phone-reactions-${theme}`);
  }
  await ctx.close();

  // a row that needs me opens the thread at its tool; event link bubble
  [ctx, page] = await phone(theme);
  await row(page, /the boys/).click();
  await settle(page, 900);
  await shot(page, `phone-thread-tool-${theme}`);
  await ctx.close();

  // suggestion chip in the stuck chat
  [ctx, page] = await phone(theme);
  await row(page, /senior week/).click();
  await settle(page, 900);
  await shot(page, `phone-suggestion-${theme}`);
  if (theme === "light") {
    await page.getByRole("button", { name: "Pick for us" }).click();
    await settle(page, 700);
    await shot(page, `phone-building-${theme}`);
    await settle(page, 1500);
    await shot(page, `phone-card-landed-${theme}`);
  }
  await ctx.close();

  // search
  [ctx, page] = await phone(theme);
  await page.getByRole("button", { name: "Ask Meta AI or search" }).click();
  await settle(page, 900);
  await shot(page, `phone-search-${theme}`);
  if (theme === "light") {
    await page.getByRole("button", { name: /Pick for us/ }).click();
    await settle(page, 500);
    await shot(page, `phone-make-pick-${theme}`);
    await page.getByRole("dialog").getByRole("button", { name: /apt 4b/ }).click();
    await settle(page, 500);
    await shot(page, `phone-make-building-${theme}`);
  }
  await ctx.close();

  // notes: a friend's shared tool
  if (theme === "light") {
    [ctx, page] = await phone(theme);
    await page.getByRole("button", { name: /Arun, note/ }).click();
    await settle(page, 500);
    await shot(page, `phone-note-sheet-${theme}`);
    await ctx.close();

    // asking by name
    [ctx, page] = await phone(theme);
    await row(page, /the boys/).click();
    await settle(page, 900);
    await page.getByRole("textbox", { name: "Message" }).fill("@Muse make a bracket for late night food");
    await settle(page, 200);
    await shot(page, `phone-mention-${theme}`);
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await settle(page, 1300);
    await shot(page, `phone-mention-building-${theme}`);
    await ctx.close();
  }

  // event page
  [ctx, page] = await phone(theme);
  await page.goto(`${server.url}?safe=1&theme=${theme}&event=juniper`);
  await settle(page, 700);
  await shot(page, `phone-event-${theme}`);
  await page.getByRole("button", { name: "Interested" }).click();
  await settle(page, 900);
  await shot(page, `phone-event-interested-${theme}`);
  if (theme === "light") {
    await page.getByRole("button", { name: "Go together" }).click();
    await settle(page, 1000);
    await shot(page, `phone-event-chat-${theme}`);
  }
  await ctx.close();

  // ---- desktop ----
  [ctx, page] = await desktop(theme);
  await shot(page, `desktop-inbox-${theme}`);
  await page.goto(`${server.url}?theme=${theme}&chat=boys`);
  await settle(page, 600);
  await shot(page, `desktop-thread-${theme}`);
  if (theme === "light") {
    await page.goto(`${server.url}?theme=${theme}&chat=senior`);
    await settle(page, 600);
    await shot(page, `desktop-suggestion-${theme}`);
    await page.goto(`${server.url}?theme=${theme}&chat=apt4b`);
    await settle(page, 600);
    await page.getByRole("textbox", { name: "Message" }).fill("ok fine spin it again");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await settle(page, 900);
    await shot(page, `desktop-sent-${theme}`);
    const target = page.locator(".bubble.text", { hasText: "allegedly" });
    await target.hover();
    await shot(page, `desktop-hover-${theme}`);
    await target.click({ button: "right" });
    await settle(page, 600);
    await shot(page, `desktop-reactions-${theme}`);
  }
  await ctx.close();

  // The desktop top bar has no Events slot: the event opens from its link bubble or ?event=.
  [ctx, page] = await desktop(theme, "&event=juniper");
  await settle(page, 700);
  await shot(page, `desktop-event-${theme}`);
  await page.getByRole("button", { name: "Interested" }).click();
  await settle(page, 900);
  await shot(page, `desktop-event-interested-${theme}`);
  await ctx.close();
}

// surfaces: the Facebook app
await surfaceShots(browser, server.url, shot);

await browser.close();
await server.close();
console.log(`\nscreenshots (${written.length}) in ${out}`);
for (const p of written) console.log(p);
