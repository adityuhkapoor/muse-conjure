/**
 * Checks for the catalysts (src/muse), called from check.ts: axe on every new state (phone light
 * and dark, desktop light), no horizontal overflow at 320/393/430, and an interaction test per
 * catalyst per surface (you ask, Muse suggests, someone already made it). Fake store, headless.
 * The paths each request took are read from `window.__musePaths`. Must-fail fixture: the unprompted
 * check is run once against `?unprompted=1` and has to fail there.
 */
import type { Browser, Page } from "playwright";
import { DESKTOP, PHONE } from "./lib.ts";
import { labOnlyFixture, plainTools } from "./lab-only.ts";

type Ctx = {
  browser: Browser;
  url: string;
  axe: (p: Page, label: string) => Promise<void>;
  overflow: (p: Page, label: string, width: number) => Promise<void>;
  expect: (cond: boolean, msg: string) => boolean;
  ok: (msg: string) => void;
  step: (name: string) => void;
  failures: string[];
};

type Setup = (p: Page) => Promise<void>;
type Path = { path: string; scenario: string | null; tool: string | null; land: string };

export async function catalystChecks(c: Ctx) {
  const { browser, url, axe, overflow, expect, ok, step, failures } = c;

  // No plain library piece on the surfaces: every scenario, moment and surface tool is a lab tool.
  step("catalysts: lab tools only");
  for (const x of plainTools()) failures.push(`catalysts: ${x}`);
  expect(labOnlyFixture(), "catalysts: the lab-only check did not catch a plain piece in its fixture");

  /** The checks sit in Tsai Lin's seat unless a query names another viewer. */
  const seat = (query: string) => (/[?&]as=/.test(query) ? "" : "&as=tsai");
  async function open(query: string, theme: "light" | "dark" = "light", width = PHONE.width, desk = false) {
    const ctx = await browser.newContext(desk ? { viewport: DESKTOP, colorScheme: theme } : { viewport: { width, height: PHONE.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`catalysts page error: ${e.message}`));
    await page.goto(`${url}?theme=${theme}${desk ? "" : "&safe=1"}${seat(query)}${query}`);
    await page.waitForTimeout(400);
    return { ctx, page };
  }
  const top = (p: Page) => p.locator(".page.push.shown").last();
  const wait = (p: Page, ms = 400) => p.waitForTimeout(ms);
  const paths = (p: Page) => p.evaluate(() => (window as unknown as { __musePaths: Path[] }).__musePaths) as Promise<Path[]>;
  const ask = async (p: Page, text: string) => {
    const f = p.locator("[data-muse-ask] input").first();
    await f.fill(text);
    await f.press("Enter");
    await wait(p, 300);
  };
  const offer = (p: Page, scenario: string) => p.locator(`[data-muse-option][data-scenario="${scenario}"]`).first();
  const going = async (p: Page) => {
    await p.getByRole("button", { name: "Going" }).first().click();
    await wait(p, 500);
  };
  const like = async (p: Page, post: string) => {
    await p.locator(`[data-post="${post}"]`).getByRole("button", { name: /^Like/ }).click();
    await wait(p, 300);
  };
  const shareNoodles = async (p: Page) => {
    await p.locator('[data-reel="r-noodles"]').scrollIntoViewIfNeeded();
    await p.locator('[data-reel="r-noodles"]').getByRole("button", { name: /^Share/ }).click();
    await wait(p, 400);
  };
  const scrollTo = (sel: string) => async (p: Page) => {
    await p.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: "center" }));
    await wait(p, 200);
  };

  // ---------------------------------------------------------------- axe
  step("catalysts: axe-core");
  const phoneStates: [string, string, Setup][] = [
    ["event, going: offers, Muse field, tools on the event", "&event=juniper", going],
    ["event you host: potluck offers", "&event=potluck", async () => {}],
    ["listing saved: offers and Will's price check", "&app=facebook&fb=listing:l-sectional", async (p) => { await p.getByRole("button", { name: "Save" }).first().click(); await scrollTo("[data-muse-ask]")(p); }],
    ["listing share sheet offer", "&app=facebook&fb=listing:l-desk", async (p) => { await p.getByRole("button", { name: "Share" }).first().click(); await wait(p); }],
    ["group sublets, typing", "&app=facebook&fb=group:sublets", async (p) => { await p.getByRole("textbox", { name: "Write something" }).fill("any june sublets under 1400"); await scrollTo(".composer")(p); }],
    ["group climbing club, admin offers", "&app=facebook&fb=group:climb", scrollTo("[data-muse-suggest]")],
    ["home, liked a moving post", "&app=facebook", async (p) => { await like(p, "p-move"); await scrollTo('[data-post="p-move"]')(p); }],
    ["home, Maya's ranking on her post", "&app=facebook", scrollTo('[data-post="p-boba"] [data-page-tools]')],
    ["home, timed card", "&app=facebook&unprompted=1", scrollTo("[data-unprompted]")],
    ["reel share sheet, recipe", "&app=facebook&fb=reels", shareNoodles],
    ["story, trip a year ago", "&app=facebook&fb=story:s-trip", async () => {}],
    ["story, own poll ended", "&as=aditya&app=facebook&fb=story:s-dev-poll", async () => {}],
    ["gaming, offers and Muse field", "&app=facebook&fb=gaming", async () => {}],
    ["search, Ask Muse row", "&app=facebook", async (p) => { await p.getByRole("button", { name: "Search" }).first().click(); await wait(p); await p.getByRole("searchbox", { name: "Search" }).fill("plan a beach day"); await wait(p, 200); }],
    ["notifications, timed rows", "&app=facebook&fb=notifications&unprompted=1", async () => {}],
    ["presenter options", "&app=facebook", async (p) => { await p.getByRole("button", { name: "Presenter options" }).click(); await wait(p); }],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [label, q, setup] of phoneStates) {
      const { ctx, page } = await open(q, theme);
      try {
        await setup(page);
        await axe(page, `catalysts phone ${label} ${theme}`);
      } catch (e) {
        failures.push(`catalysts axe setup ${label} ${theme}: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }
  const deskStates: [string, string, Setup][] = [
    ["event, going", "&event=juniper", going],
    ["listing saved", "&app=facebook&fb=listing:l-sectional", async (p) => { await p.getByRole("button", { name: "Save" }).first().click(); await wait(p); }],
    ["group climbing club", "&app=facebook&fb=group:climb", async () => {}],
    ["home, liked a moving post", "&app=facebook", async (p) => like(p, "p-move")],
    ["gaming", "&app=facebook&fb=gaming", async () => {}],
  ];
  for (const [label, q, setup] of deskStates) {
    const { ctx, page } = await open(q, "light", 0, true);
    try {
      await setup(page);
      await axe(page, `catalysts desktop ${label} light`);
    } catch (e) {
      failures.push(`catalysts axe setup desktop ${label}: ${(e as Error).message.split("\n")[0]}`);
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- overflow
  step("catalysts: no horizontal overflow");
  const flowStates: [string, string, Setup][] = [phoneStates[0]!, phoneStates[1]!, phoneStates[2]!, phoneStates[4]!, phoneStates[5]!, phoneStates[6]!, phoneStates[8]!, phoneStates[9]!, phoneStates[10]!, phoneStates[12]!];
  for (const width of [320, 393, 430]) {
    for (const [label, q, setup] of flowStates) {
      const { ctx, page } = await open(q, "light", width);
      try {
        await setup(page);
        await overflow(page, `catalysts ${label}`, width);
      } catch (e) {
        failures.push(`catalysts overflow setup ${label} @${width}: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- interactions
  step("catalysts: interactions");
  const n0 = failures.length;
  const run = async (name: string, q: string, fn: (p: Page) => Promise<void>) => {
    const { ctx, page } = await open(q);
    try {
      await fn(page);
    } catch (e) {
      failures.push(`catalysts ${name}: ${(e as Error).message.split("\n")[0]}`);
    }
    await ctx.close();
  };
  const toolOn = (p: Page, key: string, name: string) => p.locator(`[data-page-tools="${key}"]`).getByText(name, { exact: false }).count();

  // Events
  await run("event ask", "&event=juniper", async (p) => {
    await ask(p, "which song do they open with");
    const last = (await paths(p)).at(-1);
    expect(last?.path === "premade" && last.scenario === "event-setlist" && last.land === "page", `event ask took ${JSON.stringify(last)}`);
    await wait(p, 1900);
    expect((await toolOn(p, "surface:page:event:juniper", "Setlist bingo")) > 0, "event ask: the tool is not on the event page");
  });
  await run("event suggestion", "&event=juniper", async (p) => {
    expect((await p.locator("[data-muse-option]").count()) === 0, "event: offers show before Interested or Going");
    await going(p);
    expect((await offer(p, "event-go-together").count()) === 1 && (await offer(p, "event-tickets").count()) === 1, "event: Going does not offer Go together and Sit together");
    await offer(p, "event-tickets").click();
    await wait(p, 700);
    expect((await top(p).locator('.thread[aria-label="Chat with Juniper Hale live"]').count()) === 1, "event: Sit together did not open the event's chat");
  });
  await run("event already made", "&event=juniper", async (p) => {
    const credit = await p.locator('[data-page-tools="surface:page:event:juniper"] .by').first().innerText();
    expect(/Maya made this/.test(credit), `event: Maya's rides credit reads "${credit}"`);
    await ask(p, "who's driving");
    expect((await paths(p)).at(-1)?.path === "existing", "event: asking for rides made a second copy instead of showing Maya's");
    await p.locator('[data-page-tools="surface:page:event:juniper"]').getByRole("button", { name: "Use for my group" }).first().click();
    await wait(p);
    expect((await p.getByRole("dialog").count()) === 1, "event: Use for my group did not ask which chat");
  });
  await run("event host", "&event=potluck", async (p) => {
    expect((await offer(p, "event-bring-list").count()) === 1 && (await offer(p, "event-open-spots").count()) === 1, "potluck: the host is not offered a bring list and open spots");
    await offer(p, "event-bring-list").click();
    await wait(p, 1900);
    expect((await toolOn(p, "surface:page:event:potluck", "What's everyone bringing?")) > 0, "potluck: the bring list is not on the page");
  });

  // Marketplace
  await run("listing suggestion", "&app=facebook&fb=listing:l-sectional", async (p) => {
    expect((await p.locator("[data-muse-option]").count()) === 0, "listing: offers show before Save");
    await p.getByRole("button", { name: "Save" }).first().click();
    await wait(p);
    expect((await offer(p, "mp-room-fit").count()) === 1, "listing: Save does not offer Will it fit in 4B");
    expect((await offer(p, "mp-price-check").count()) === 0, "listing: price check offered although Will already made one");
    await offer(p, "mp-room-fit").click();
    await wait(p, 1900);
    const last = (await paths(p)).at(-1);
    expect(last?.scenario === "mp-room-fit" && last.tool === "lab:room-fit", `listing: Will it fit took ${JSON.stringify(last)}`);
    expect((await toolOn(p, "surface:page:listing:l-sectional", "Will it fit in 4B?")) > 0, "listing: Will it fit is not on the listing");
  });
  await run("listing ask and already made", "&app=facebook&fb=listing:l-sectional", async (p) => {
    expect(/Will made this/.test(await p.locator('[data-page-tools="surface:page:listing:l-sectional"] .by').first().innerText()), "listing: Will's price check is not credited");
    await ask(p, "split the cost with my roommates");
    await wait(p);
    const last = (await paths(p)).at(-1);
    expect(last?.scenario === "mp-split" && (await p.getByRole("dialog").count()) === 1, `listing ask: ${JSON.stringify(last)}, or no chat picker`);
  });

  // Groups
  await run("group suggestion", "&app=facebook&fb=group:sublets", async (p) => {
    await p.getByRole("textbox", { name: "Write something" }).fill("any june sublets under 1400");
    await wait(p, 200);
    await offer(p, "group-sublet-finder").click();
    await wait(p, 1900);
    expect((await p.getByText("Pinned · from 7 posts in this group").count()) === 1, "group: the finder is not pinned");
  });
  await run("group ask falls through", "&app=facebook&fb=group:climb", async (p) => {
    expect((await offer(p, "group-welcome").count()) === 1, "climbing club: the admin is not offered a welcome for new members");
    await ask(p, "make us a chore wheel for the gear room");
    const last = (await paths(p)).at(-1);
    expect(last?.path === "factory" && last.land === "page", `group: an unmatched ask took ${JSON.stringify(last)}`);
  });

  // Home
  await run("feed suggestion", "&app=facebook", async (p) => {
    expect((await p.locator('[data-post="p-move"] [data-muse-option]').count()) === 0, "feed: an offer shows on a post before any like");
    await like(p, "p-move");
    await p.locator('[data-post="p-move"] [data-muse-option]').first().click();
    await wait(p, 1900);
    expect((await toolOn(p, "surface:page:post:p-move", "Help Aditya move")) > 0, "feed: Help Aditya move is not on the post");
    expect(/Maya made this/.test(await p.locator('[data-post="p-boba"] .by').first().innerText()), "feed: Maya's ranking is not credited on her post");
  });
  await run("feed birthday skips the subject", "&app=facebook", async (p) => {
    await like(p, "p-bday");
    expect((await p.locator('[data-post="p-bday"] [data-muse-option]').count()) === 1, "feed: liking the birthday post offers nothing");
  });
  await run("search ask", "&app=facebook", async (p) => {
    await p.getByRole("button", { name: "Search" }).first().click();
    await wait(p);
    await p.getByRole("searchbox", { name: "Search" }).fill("plan a beach day for the boys");
    await p.getByRole("searchbox", { name: "Search" }).press("Enter");
    await wait(p);
    expect((await paths(p)).at(-1)?.path === "factory" && (await p.getByRole("dialog").count()) === 1, "search: Ask Muse did not go to the factory with a chat picker");
  });

  // Reels
  await run("reel suggestion", "&app=facebook&fb=reels", async (p) => {
    await shareNoodles(p);
    await offer(p, "reel-cook-night").click();
    await wait(p);
    await p.getByRole("dialog").getByRole("button", { name: /apt 4b/ }).click();
    await wait(p, 900);
    expect((await top(p).locator('.thread[aria-label="Chat with apt 4b"]').count()) === 1, "reels: the cook night did not open apt 4b");
    expect((await paths(p)).at(-1)?.scenario === "reel-cook-night", "reels: the recipe reel did not offer a cook night");
  });
  await run("reel in thread", "&app=facebook&fb=reels", async (p) => {
    await shareNoodles(p);
    await p.getByRole("button", { name: "Send to apt 4b" }).click();
    await p.getByRole("status").getByRole("button", { name: "View" }).click();
    await wait(p, 700);
    expect((await top(p).locator('[data-muse-option][data-scenario="reel-cook-night"]').count()) === 1, "reels: no cook night offer under the shared recipe reel");
  });

  // Stories
  await run("story suggestion and ask", "&app=facebook&fb=story:s-trip", async (p) => {
    expect((await offer(p, "story-again").count()) === 1 && (await offer(p, "story-recap").count()) === 1, "stories: a trip a year ago does not offer Do it again and Recap");
    await ask(p, "make a recap of the trip");
    expect((await paths(p)).at(-1)?.scenario === "story-recap", "stories: the ask did not match the recap");
  });

  // Gaming
  await run("gaming suggestion and ask", "&app=facebook&fb=gaming", async (p) => {
    expect((await toolOn(p, "surface:page:gaming:gaming", "Apt 4b trivia")) > 0, "gaming: the trivia Maya made for the group is not on the page");
    expect((await offer(p, "game-challenge").count()) === 1, "gaming: no offer to answer Arun's score");
    await ask(p, "make us a game about tacos");
    expect((await paths(p)).at(-1)?.path === "factory", "gaming: make us a game did not go to the factory");
  });

  // Dismissed stays dismissed on that page
  await run("dismiss", "&app=facebook&fb=group:climb", async (p) => {
    await p.locator("li", { has: offer(p, "group-welcome") }).getByRole("button", { name: "Not now" }).click();
    await wait(p);
    await p.reload();
    await wait(p, 500);
    expect((await offer(p, "group-welcome").count()) === 0, "dismissed: the welcome came back after a reload");
  });

  // Unprompted: off by default; on shows a card and rows; the check fails against the on state
  const unprompted = async (q: string) => {
    const { ctx, page } = await open(`&app=facebook${q}`);
    const n = await page.locator("[data-unprompted]").count();
    await ctx.close();
    return n;
  };
  const off = await unprompted("");
  expect(off === 0, `unprompted: ${off} timed offers with the switch off`);
  const fixture = await unprompted("&unprompted=1");
  expect(fixture > 0, "unprompted fixture: ?unprompted=1 shows nothing, so the off check proves nothing");
  await run("presenter switch", "&app=facebook", async (p) => {
    await p.getByRole("button", { name: "Presenter options" }).click();
    await wait(p);
    await p.getByRole("switch", { name: /Timed suggestions/ }).check();
    await p.keyboard.press("Escape");
    await wait(p);
    expect((await p.locator("[data-unprompted]").count()) > 0, "presenter: switching timed suggestions on shows nothing");
  });

  if (failures.length === n0) ok("catalysts: ask, suggest and already made on Events, Marketplace, Groups, Home, Reels, Stories and Gaming; factory fallback; dismiss sticks; unprompted off by default (on shows it), presenter switch");
}
