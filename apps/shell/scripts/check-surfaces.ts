/**
 * Checks for the Facebook surfaces (src/surfaces), called from check.ts: axe on every new screen
 * and state (phone light and dark, desktop light), no horizontal overflow at 320/393/430, and an
 * interaction test per Muse flow. Fake store, headless.
 */
import type { Browser, Page } from "playwright";
import { DESKTOP, PHONE } from "./lib.ts";

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

export async function surfaceChecks(c: Ctx) {
  const { browser, url, axe, overflow, expect, ok, step, failures } = c;
  const fails0 = () => failures.length;

  /** The checks sit in Tsai Lin's seat unless a query names another viewer. */
  const seat = (query: string) => (/[?&]as=/.test(query) ? "" : "&as=tsai");
  async function phone(query: string, theme: "light" | "dark" = "light", width = PHONE.width) {
    const ctx = await browser.newContext({ viewport: { width, height: PHONE.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`surfaces page error: ${e.message}`));
    await page.goto(`${url}?safe=1&theme=${theme}${seat(query)}${query}`);
    await page.waitForTimeout(350);
    return { ctx, page };
  }
  async function desk(query: string, theme: "light" | "dark" = "light") {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`surfaces page error: ${e.message}`));
    await page.goto(`${url}?theme=${theme}${seat(query)}${query}`);
    await page.waitForTimeout(400);
    return { ctx, page };
  }
  const btn = (p: Page, name: string | RegExp) => p.getByRole("button", { name }).first();
  const top = (p: Page) => p.locator(".page.push.shown").last();
  const wait = (p: Page, ms = 400) => p.waitForTimeout(ms);
  const pick = async (p: Page, chat: RegExp) => {
    await p.getByRole("dialog").getByRole("button", { name: chat }).click();
    await wait(p, 600);
  };
  const saveTwoCouches = async (p: Page) => {
    for (const n of [/Grey sectional couch/, /Green velvet loveseat/]) {
      await btn(p, n).click();
      await wait(p, 500);
      await top(p).getByRole("button", { name: "Save" }).click();
      await wait(p, 200);
      if (String(n).includes("sectional")) {
        await top(p).getByRole("button", { name: "Back" }).click();
        await wait(p, 500);
      }
    }
  };
  const shareReel = async (p: Page) => {
    await p.locator('[data-reel="r-dumplings"]').getByRole("button", { name: "Share" }).click();
    await wait(p, 300);
  };

  // ---------------------------------------------------------------- axe
  step("surfaces: axe-core");
  const phoneStates: [string, string, Setup][] = [
    ["fb home", "&app=facebook", async () => {}],
    ["fb marketplace", "&app=facebook&fb=marketplace", async () => {}],
    ["fb listing, two saved (Decide with roommates)", "&app=facebook&fb=marketplace", saveTwoCouches],
    ["fb listing share sheet (Split it)", "&app=facebook&fb=listing:l-desk", async (p) => { await btn(p, "Share").click(); await wait(p); }],
    ["fb chat picker", "&app=facebook", async (p) => { await p.locator('[data-post="p-den"]').getByRole("button", { name: "Use for my group" }).click(); await wait(p); }], // catalysts: other posts carry the button too
    ["fb group sublets, matching draft", "&app=facebook&fb=group:sublets", async (p) => { await p.getByRole("textbox", { name: "Write something" }).fill("looking for a summer sublet jun-aug"); await wait(p); }],
    ["fb group sublets, finder pinned", "&app=facebook&fb=group:sublets", async (p) => { await p.getByRole("textbox", { name: "Write something" }).fill("looking for a summer sublet jun-aug"); await btn(p, /See 7 that match/).click(); await wait(p, 2000); }],
    ["fb group climbing club", "&app=facebook&fb=group:climb", async () => {}],
    ["fb reels", "&app=facebook&fb=reels", async () => {}],
    ["fb reel share sheet", "&app=facebook&fb=reels", shareReel],
    ["fb own story poll", "&as=aditya&app=facebook&fb=story:s-dev-poll", async () => {}],
    ["fb friend's story", "&app=facebook&fb=story:s-maya", async () => {}],
    ["fb gaming", "&app=facebook&fb=gaming", async () => {}],
    ["fb notifications", "&app=facebook&fb=notifications", async () => {}],
    ["fb menu", "&app=facebook&fb=menu", async () => {}],
    ["thread with a shared reel (to-try option)", "&app=facebook&fb=reels", async (p) => { await shareReel(p); await btn(p, "Send to apt 4b").click(); await btn(p, "View").click(); await wait(p, 700); }],
    ["thread priya (to-try list from Reels)", "&chat=priya", async () => {}],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [label, q, setup] of phoneStates) {
      const { ctx, page } = await phone(q, theme);
      try {
        await setup(page);
        await axe(page, `phone ${label} ${theme}`);
      } catch (e) {
        failures.push(`surfaces axe setup ${label} ${theme}: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }
  const deskStates: [string, string, Setup][] = [
    ["fb home", "&app=facebook", async () => {}],
    ["fb marketplace", "&app=facebook&fb=marketplace", async () => {}],
    ["fb listing", "&app=facebook&fb=listing:l-sectional", async () => {}],
    ["fb group", "&app=facebook&fb=group:climb", async () => {}],
    ["fb gaming", "&app=facebook&fb=gaming", async () => {}],
    ["fb reels", "&app=facebook&fb=reels", async () => {}],
    ["fb notifications panel", "&app=facebook", async (p) => { await btn(p, /notifications/).click(); await wait(p); }],
    ["messenger with needs-you row", "", async () => {}],
  ];
  for (const [label, q, setup] of deskStates) {
    const { ctx, page } = await desk(q);
    try {
      await setup(page);
      await axe(page, `desktop ${label} light`);
    } catch (e) {
      failures.push(`surfaces axe setup desktop ${label}: ${(e as Error).message.split("\n")[0]}`);
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- overflow
  step("surfaces: overflow");
  const screens: [string, string, Setup][] = [
    ["fb home", "&app=facebook", async () => {}],
    ["fb marketplace", "&app=facebook&fb=marketplace", async () => {}],
    ["fb listing, option", "&app=facebook&fb=marketplace", saveTwoCouches],
    ["fb group sublets, option", "&app=facebook&fb=group:sublets", async (p) => { await p.getByRole("textbox", { name: "Write something" }).fill("summer sublet near campus jun-aug, 2br ok"); await wait(p); }],
    ["fb group climbing club", "&app=facebook&fb=group:climb", async () => {}],
    ["fb reels", "&app=facebook&fb=reels", async () => {}],
    ["fb own story poll", "&as=aditya&app=facebook&fb=story:s-dev-poll", async () => {}],
    ["fb gaming", "&app=facebook&fb=gaming", async () => {}],
    ["fb notifications", "&app=facebook&fb=notifications", async () => {}],
    ["fb menu", "&app=facebook&fb=menu", async () => {}],
    ["thread priya", "&chat=priya", async () => {}],
  ];
  for (const width of [320, 393, 430]) {
    for (const [label, q, setup] of screens) {
      const { ctx, page } = await phone(q, "light", width);
      await setup(page);
      await overflow(page, label, width);
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- interactions
  step("surfaces: interactions");
  const before = fails0();

  // App shell: Messenger is the landing screen; the Facebook button and back.
  {
    const { ctx, page: p } = await phone("");
    expect((await p.locator("div.inbox").count()) === 1, "surfaces: Messenger is no longer the landing screen");
    expect((await p.locator(".inbox [data-needs-you]").count()) === 1, "surfaces: inbox has no needs-you row for Will's to-try list");
    await btn(p, "Facebook").click();
    await wait(p);
    expect((await p.locator('[data-fb-tab="home"] .fbh').count()) === 1, "surfaces: the inbox Facebook button did not open Facebook Home");
    const bar = await p.locator(".tabbar").boundingBox();
    expect(!!bar && Math.round(bar.width) === 366 && Math.round(bar.height) === 52 && Math.round(PHONE.height - (bar.y + bar.height)) === 21, `surfaces: tab bar is not 366 x 52, 21 above the bottom: ${JSON.stringify(bar)}`);
    const labels = await p.locator(".tabbar .tab").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.split(",")[0]));
    expect(labels.join() === "Home,Reels,Friends,Marketplace,Notifications,Profile", `surfaces: tab order is ${labels.join()}`);
    const head = await p.locator(".fbh").boundingBox();
    expect(!!head && Math.round(head.height) === 52 + 59, `surfaces: header is not 52 tall under the safe area: ${head?.height}`);
    const story = await p.locator(".tray .card").nth(1).boundingBox();
    expect(!!story && Math.round(story.width) === 118 && Math.round(story.height) === 211, `surfaces: story card is not 118 x 211: ${JSON.stringify(story)}`);
    await btn(p, /^Messenger/).click();
    await wait(p);
    expect((await p.locator("div.inbox").count()) === 1, "surfaces: the header Messenger button did not return to Messenger");
    // Every dimmed control says why.
    await btn(p, "Facebook").click();
    await wait(p);
    const unmarked = await p.locator('[aria-disabled="true"]:not([title="Not in this prototype"])').count();
    expect(unmarked === 0, `surfaces: ${unmarked} dimmed controls are not marked "Not in this prototype"`);
    await ctx.close();
  }

  // Pictures: every face and every picture slot shows its image (no grey box), loaded, with alt text on
  // pictures that carry meaning. Photos are only of things or of the three team members (a photo paints
  // its blurred placeholder first); every other face and every cover is drawn (an SVG data URL),
  // strangers included. Pushed pages keep the 52 bar with no band under it; Facebook buttons are 36
  // tall, radius 8; phone dark is Meta on Facebook, black in Messenger.
  {
    const pictures = async (p: Page) =>
      p.evaluate(async () => {
        const imgs = [...document.querySelectorAll<HTMLImageElement>("img.face, img.photo-img, img.cover-img")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !i.closest("[inert]"); });
        await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; setTimeout(ok, 4000); }))));
        // any /media/ file that is not a credited real photo (img/photo, assets/CREDITS.md) or a team member's own photo is a photo of a made-up person
        const person = [...document.querySelectorAll<HTMLImageElement>("img")].map((i) => i.currentSrc || i.src).filter((s) => s.includes("/media/") && !/\/media\/(img\/(listing|place|photo)\/|people\/(aditya|calvin|arun|tsai|will)-)/.test(s));
        return {
          n: imgs.length,
          broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.src.split("/").pop()),
          placeholderless: imgs.filter((i) => !i.src.startsWith("data:") && !getComputedStyle(i).backgroundImage.startsWith("url(")).length,
          person: person.map((s) => s.split("/").pop()!.split("?")[0]),
        };
      });
    const bad: string[] = [];
    const want: [string, string, number][] = [
      ["home", "&app=facebook", 8],
      ["marketplace", "&app=facebook&fb=marketplace", 4],
      ["reels", "&app=facebook&fb=reels", 1],
      ["group", "&app=facebook&fb=group:climb", 3],
      ["listing", "&app=facebook&fb=listing:l-sectional", 1],
      ["story", "&app=facebook&fb=story:s-maya", 1],
      ["gaming", "&app=facebook&fb=gaming", 2], // the Muse suggestions above leave one tile on screen
      ["thread apt 4b", "&chat=apt4b", 3],
      ["event", "&event=juniper", 1],
    ];
    for (const [label, q, min] of want) {
      const { ctx, page: p } = await phone(q);
      await wait(p, 300);
      const r = await pictures(p);
      if (r.n < min) bad.push(`${label}: ${r.n} pictures on screen, expected at least ${min}`);
      if (r.broken.length) bad.push(`${label}: did not load ${r.broken.join(", ")}`);
      if (r.placeholderless) bad.push(`${label}: ${r.placeholderless} pictures have no blurred placeholder`);
      if (r.person.length) bad.push(`${label}: photo of a made-up person: ${r.person.join(", ")}`);
      await ctx.close();
    }
    // the check can fail: a missing file is caught
    {
      const { ctx, page: p } = await phone("&app=facebook&fb=marketplace");
      await p.evaluate(() => { const i = document.querySelector<HTMLImageElement>("img.photo-img")!; i.srcset = ""; i.src = "/media/img/nope.webp"; });
      await wait(p, 300);
      expect((await pictures(p)).broken.length > 0, "surfaces: picture self-test: a missing image was not caught");
      // and a generated portrait slipped back in is caught
      await p.evaluate(() => { const i = document.querySelector<HTMLImageElement>("img.face, img.cover-img")!; i.srcset = ""; i.src = "/media/img/portrait/p-maya-112.webp"; });
      expect((await pictures(p)).person.length > 0, "surfaces: picture self-test: a photo of a made-up person was not caught");
      await ctx.close();
    }
    {
      // "me" is the person holding the phone: composer, "Your story" tile and header all show their own profile picture
      const picture = (src: string) => (src.startsWith("data:image/svg") ? "drawn" : (/people\/([a-z]+)-\d+\.webp/.exec(src)?.[1] ?? `other:${src.slice(0, 40)}`));
      for (const id of ["aditya", "calvin", "arun", "tsai", "will", "maya", "dev", "jonah", "theo", "noa", "priya"]) {
        const real = ({ dev: "aditya", jonah: "calvin", theo: "arun", noa: "tsai", priya: "will" } as Record<string, string>)[id] ?? id;
        const want = real === "maya" ? "drawn" : real;
        const f = await phone(`&as=${id}&app=facebook`);
        const src = (loc: ReturnType<typeof f.page.locator>) => loc.first().evaluate((e) => (e as HTMLImageElement).currentSrc || (e as HTMLImageElement).src).catch(() => "");
        const composer = picture(await src(f.page.locator(".fb-card:has([data-compose-open]) .avatar img.face")));
        const tile = picture(await src(f.page.locator(".tray .create .avatar img.face")));
        // "Your story" only for someone who posted one (Tsai Lin has none: the Create story tile alone)
        const own = await f.page.locator('.tray button[aria-label="Your story"]').count();
        if (own !== (real === "tsai" ? 0 : 1)) bad.push(`as=${id}: ${own} "Your story" cards`);
        const mine = own ? picture(await src(f.page.locator('.tray button[aria-label="Your story"] .avatar img.face'))) : want;
        const dup = await f.page.locator(".tray button", { hasText: new RegExp(`^${real === "tsai" ? "Tsai Lin" : real[0]!.toUpperCase() + real.slice(1)}$`) }).count();
        const g = await phone(`&as=${id}`);
        const head = picture(await src(g.page.locator(".notes .note.me .avatar img.face")));
        for (const [where, got] of [["composer", composer], ["Create story tile", tile], ["Your story tile", mine], ["Messenger header", head]] as const) if (got !== want) bad.push(`as=${id}: ${where} avatar is ${got}, expected ${want}`);
        if (dup) bad.push(`as=${id}: the viewer's own story is also in the tray under their name`);
        await f.ctx.close();
        await g.ctx.close();
      }
    }
    {
      // 28 px faces in a thread: Maya and Will drawn, the team's own photos, never initials
      const { ctx, page: p } = await phone("&chat=senior");
      const faces = await p.locator(".page.push.shown .thread img.face").evaluateAll((els) => els.filter((e) => Math.round(e.getBoundingClientRect().width) === 28).map((e) => (e.classList.contains("real") ? "photo" : (e as HTMLImageElement).src.startsWith("data:image/svg") ? "drawn" : "other")));
      if (!faces.includes("drawn") || !faces.includes("photo") || faces.includes("other")) bad.push(`thread: 28 px faces are ${faces.join(",")}; expected drawn faces and team photos only`);
      if (await p.locator(".page.push.shown .thread .avatar .initials").count()) bad.push("thread: a face fell back to initials");
      await ctx.close();
      const m = await phone("&app=facebook&fb=marketplace");
      await btn(m.page, /Grey sectional couch/).click();
      await wait(m.page, 500);
      const seller = await top(m.page).locator(".seller .avatar img.face").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.startsWith("data:image/svg")));
      if (seller.length !== 1 || !seller[0]) bad.push("listing: the made-up seller has no drawn face");
      const bar = await top(m.page).locator("header.bar").boundingBox();
      if (!bar || Math.round(bar.height) !== 52 + 59) bad.push(`listing bar is ${bar?.height}, expected 52 under the safe area`);
      const shadow = await top(m.page).locator("header.bar").evaluate((e) => getComputedStyle(e).boxShadow);
      if (shadow !== "none") bad.push(`listing bar has a divider: ${shadow}`);
      const photoTop = await top(m.page).locator(".photo").first().boundingBox();
      if (!bar || !photoTop || Math.abs(photoTop.y - (bar.y + bar.height)) > 0.5) bad.push(`listing photo starts ${photoTop && bar ? (photoTop.y - bar.y - bar.height).toFixed(1) : "?"} px under the bar`);
      const b = await top(m.page).locator(".actions .btn").first().evaluate((e) => ({ h: e.getBoundingClientRect().height, r: getComputedStyle(e).borderTopLeftRadius }));
      if (Math.round(b.h) !== 36 || b.r !== "8px") bad.push(`listing button is ${b.h} tall, radius ${b.r}; measured 36 and 8`);
      await m.ctx.close();
    }
    {
      const d = await phone("&app=facebook", "dark");
      const fbBg = await d.page.locator(".fbapp").evaluate((e) => getComputedStyle(e).backgroundColor);
      await btn(d.page, /^Messenger/).click();
      await wait(d.page, 500);
      const msBg = await d.page.locator("div.inbox").evaluate((e) => getComputedStyle(e).backgroundColor);
      if (fbBg === "rgb(0, 0, 0)" || msBg !== "rgb(0, 0, 0)") bad.push(`phone dark: Facebook ${fbBg} (Meta palette), Messenger ${msBg} (true black)`);
      await d.ctx.close();
    }
    for (const b of bad) failures.push(`surfaces pictures: ${b}`);
    if (!bad.length) ok("surfaces: pictures on every surface load with a blurred placeholder (a missing one is caught), 28 px faces in a thread, strangers keep initials; pushed bar 52 with no divider or band, buttons 36 r8; phone dark is Meta on Facebook, black in Messenger");
  }

  // Home (a): a friend's tool post, read-only preview, "Use for my group" lands in a chat.
  {
    const { ctx, page: p } = await phone("&app=facebook");
    expect((await p.locator('[data-surface-tool="t-s-den-draft"][inert]').count()) === 1, "surfaces: the friend's tool preview is not read-only");
    await p.locator('[data-post="p-den"]').getByRole("button", { name: "Use for my group" }).click(); // catalysts: other posts carry the button too
    await wait(p);
    await pick(p, /senior week/);
    const t = top(p).locator('.thread[aria-label="Chat with senior week"]');
    expect((await t.count()) === 1, "surfaces: Use for my group did not open the chat");
    expect((await t.locator('[data-muse-card][aria-busy="true"]').count()) === 1, "surfaces: Use for my group showed no building card in the chat");
    await wait(p, 1900);
    expect((await t.locator('[data-muse-card][aria-label="Chore wheel"]').count()) === 1, "surfaces: Use for my group did not land a chore wheel"); // lab chore-wheel
    expect((await t.locator(".system", { hasText: "got this from Calvin's post" }).count()) === 1, "surfaces: no source line for the post");
    await ctx.close();
  }

  // Home (b): the bracket post is a tool you take part in (not read-only), with voters.
  {
    const { ctx, page: p } = await phone("&app=facebook");
    const post = p.locator('[data-post="p-dining"]');
    expect((await post.locator('[data-surface-tool="t-s-dining-tiers"]:not([inert])').count()) === 1, "surfaces: the dining tier list post is not an open tool");
    expect((await post.getByText("Maya, Calvin and Aditya voted").count()) === 1, "surfaces: the bracket post has no voters line");
    await ctx.close();
  }

  // Groups: a matching draft offers the finder instead of posting; pins; a post that became a tool.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=group:sublets");
    const box = p.getByRole("textbox", { name: "Write something" });
    await box.fill("anyone selling a desk");
    await wait(p, 200);
    expect((await p.locator("[data-muse-option]").count()) === 0, "surfaces: a non-matching draft offered the finder");
    await box.fill("looking for a summer sublet jun-aug");
    await wait(p, 200);
    const posts = await p.locator('article[aria-label^="Post by"]').count();
    await btn(p, /See 7 that match/).click();
    await wait(p, 300);
    expect((await p.locator('.pinned [data-muse-card][aria-busy="true"]').count()) === 1, "surfaces: the finder showed no building card");
    await wait(p, 1900);
    expect((await p.locator('.pinned [data-muse-card][aria-label="Sublets that match"]').count()) === 1, "surfaces: the finder did not pin");
    expect((await p.locator('article[aria-label^="Post by"]').count()) === posts, "surfaces: the finder posted the draft");
    await p.goto(`${url}?as=tsai&safe=1&app=facebook&fb=group:climb`);
    await wait(p);
    expect((await p.getByText("Pinned by admins").count()) === 1 && (await p.locator('[data-surface-tool="t-s-gear-signup"]').count()) === 1, "surfaces: the club has no admin-pinned sign-up");
    expect((await p.locator('[data-surface-tool="t-s-meet"]').count()) === 1, "surfaces: the meeting post is not a tool");
    await ctx.close();
  }

  // Marketplace: one save offers nothing; the second of a kind offers Decide with roommates.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=marketplace");
    await btn(p, /Grey sectional couch/).click();
    await wait(p, 500);
    await top(p).getByRole("button", { name: "Save" }).click();
    await wait(p, 200);
    expect((await top(p).locator('[data-muse-option][data-scenario="mp-decide"]').count()) === 0, "surfaces: one saved couch already offered Decide with roommates"); // catalysts: one save may offer Will it fit
    await top(p).getByRole("button", { name: "Back" }).click();
    await wait(p, 500);
    await btn(p, /Green velvet loveseat/).click();
    await wait(p, 500);
    await top(p).getByRole("button", { name: "Save" }).click();
    await wait(p, 200);
    await top(p).locator("[data-muse-option]", { hasText: "Decide with roommates" }).click();
    await wait(p);
    const first = await p.getByRole("dialog").locator(".chat .cn").first().innerText();
    expect(first === "apt 4b", `surfaces: the picker does not offer apt 4b first (${first})`);
    await pick(p, /apt 4b/);
    await wait(p, 1900);
    const t = top(p).locator('.thread[aria-label="Chat with apt 4b"]');
    expect((await t.locator('[data-muse-card][aria-label="Which couch?"]').count()) === 1, "surfaces: Decide with roommates did not land a shortlist in apt 4b");
    expect((await t.locator(".system", { hasText: "shared 2 couches from Marketplace" }).count()) === 1, "surfaces: no source line for the listings");
    await ctx.close();
  }
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=listing:l-desk");
    await btn(p, "Share").click();
    await wait(p);
    await p.getByRole("dialog").locator("[data-muse-option]", { hasText: "Split it" }).click();
    await wait(p);
    await pick(p, /apt 4b/);
    await wait(p, 1900);
    expect((await top(p).locator('[data-muse-card][aria-label="Standing desk split"]').count()) === 1, "surfaces: Split it did not land a split");
    await ctx.close();
  }

  // Reels: share to a chat; the option under the reel makes the list, then adds to it.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=reels");
    await shareReel(p);
    await btn(p, "Send to apt 4b").click();
    await wait(p, 300);
    expect((await p.getByRole("status").filter({ hasText: "Sent to apt 4b" }).count()) === 1, "surfaces: no Sent toast");
    await btn(p, "View").click();
    await wait(p, 700);
    const t = top(p).locator('.thread[aria-label="Chat with apt 4b"]');
    await t.locator("[data-muse-option]", { hasText: "Add to our to-try list" }).click();
    await wait(p, 2000);
    expect((await t.locator('[data-muse-card][aria-label="To try"]').count()) === 1, "surfaces: Add to our to-try list did not make a list");
    expect((await t.locator("[data-muse-option]").count()) === 0, "surfaces: the option stayed after adding");
    await p.goBack();
    await wait(p, 600);
    await p.locator('[data-reel="r-tacos"]').scrollIntoViewIfNeeded(); // the pager mounts only the reels beside the one on screen
    await p.locator('[data-reel="r-tacos"]').getByRole("button", { name: "Share" }).click();
    await btn(p, "Send to apt 4b").click();
    await btn(p, "View").click();
    await wait(p, 700);
    await top(p).locator("[data-muse-option]").click();
    await wait(p, 600);
    const t2 = top(p).locator('.thread[aria-label="Chat with apt 4b"]');
    expect((await t2.locator('[data-muse-card][aria-label="To try"]').count()) === 1, "surfaces: a second reel made a second list");
    expect((await t2.locator(".system", { hasText: "added 2 places to To try" }).count()) === 1, "surfaces: a second reel did not say it added");
    await ctx.close();
  }

  // Stories: your finished poll, Make it a plan, a who's in with the people who voted for the winner.
  {
    const { ctx, page: p } = await phone("&as=aditya&app=facebook&fb=story:s-dev-poll");
    expect((await top(p).locator(".sticker").count()) === 1, "surfaces: your story has no poll");
    await btn(p, "Make it a plan").click();
    await wait(p, 2200);
    const t = top(p).locator('.thread[aria-label="Chat with hike sat"]');
    expect((await t.count()) === 1, "surfaces: Make it a plan did not make the chat");
    expect((await t.locator('[data-muse-card][aria-label="Hike sat"]').count()) === 1, "surfaces: Make it a plan did not land a who's in");
    await p.goto(`${url}?as=tsai&safe=1&app=facebook&fb=story:s-maya`);
    await wait(p);
    expect((await p.getByRole("button", { name: "Make it a plan" }).count()) === 0, "surfaces: a friend's story offers Make it a plan");
    await ctx.close();
  }

  // Stories and Reels move like the real ones: bars that fill and advance, tap zones, hold to pause,
  // swipes, a tool that stops the clock, grey rings once seen; a reel pager that mounts three, pauses and likes.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=story:s-maya", "dark", 430);
    const cdp = await ctx.newCDPSession(p);
    const touch = (type: string, x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] } as never);
    const swipe = async (x0: number, y0: number, x1: number, y1: number) => {
      await touch("touchStart", x0, y0);
      for (let i = 1; i <= 8; i++) {
        await touch("touchMove", x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
        await p.waitForTimeout(16);
      }
      await touch("touchEnd");
    };
    const st = () => p.evaluate(() => { const s = document.querySelector(".story"); return s ? { who: s.getAttribute("aria-label"), seg: Number(s.getAttribute("data-seg")), segs: Number(s.getAttribute("data-segs")), paused: s.getAttribute("data-paused") === "true" } : null; });
    const fill = () => p.evaluate(() => getComputedStyle(document.querySelector(".b.cur .f")!).transform);
    await wait(p, 300);
    let s0 = (await st())!;
    expect(s0.segs === 3 && (await p.locator(".bars .b").count()) === 3, `surfaces: Maya's story has ${s0.segs} segments, expected 3`);
    expect((await p.evaluate(() => getComputedStyle(document.querySelector(".kb")!).animationName)) !== "none", "surfaces: the story picture has no slow move");
    // tap zones
    await p.touchscreen.tap(400, 450);
    await wait(p, 120);
    expect((await st())!.seg === 1, "surfaces: tap on the right did not skip forward");
    await p.touchscreen.tap(30, 450);
    await wait(p, 120);
    expect((await st())!.seg === 0, "surfaces: tap on the left did not go back");
    // hold to pause: the bar stops while the finger is down, and runs again after
    await touch("touchStart", 215, 450);
    await wait(p, 450);
    const held = (await st())!.paused;
    const f1 = await fill();
    await wait(p, 600);
    const f2 = await fill();
    expect(held && f1 === f2, `surfaces: holding did not stop the bar (paused ${held}, ${f1} then ${f2})`);
    await touch("touchEnd");
    await wait(p, 300);
    expect(!(await st())!.paused && (await fill()) !== f2, "surfaces: the bar did not run again after the hold");
    // swipe across: next person, then back; the slide ends with one story mounted
    await swipe(380, 450, 60, 450);
    await wait(p, 900);
    const nextWho = (await st())?.who;
    expect(nextWho === "Aditya's story", `surfaces: swiping left showed ${nextWho}, expected Aditya's story`);
    await swipe(60, 450, 380, 450);
    await wait(p, 900);
    expect((await st())?.who === "Maya's story", "surfaces: swiping right did not come back to Maya");
    expect((await p.locator(".story").count()) === 1 && (await p.locator(".media").count()) === 1, "surfaces: more than one story is mounted");
    // auto-advance: a segment lasts the token length, then the next one starts by itself
    const before = (await st())!;
    await wait(p, 5300);
    const after = (await st())!;
    expect(after.who === before.who && after.seg === before.seg + 1, `surfaces: the bar did not advance by itself (${JSON.stringify(before)} then ${JSON.stringify(after)})`);
    // swipe down closes
    await swipe(215, 300, 215, 720);
    await wait(p, 1200);
    expect((await p.locator(".story").count()) === 0, "surfaces: swiping down did not close the story");
    // a Muse story: working the tool stops the bar; it runs again 3 s after the last touch
    await p.goto(`${url}?as=tsai&safe=1&theme=dark&app=facebook&fb=story:s-muse`);
    await wait(p, 700);
    await p.locator(".story .offers").dispatchEvent("pointerdown");
    await wait(p, 200);
    const m1 = (await st())!.paused;
    const g1 = await fill();
    await wait(p, 1500);
    const m2 = (await st())!.paused && (await fill()) === g1;
    expect(m1 && m2 && (await p.locator(".bars[data-paused='true']").count()) === 1, "surfaces: using the tool did not pause the story bar");
    await wait(p, 2000);
    expect(!(await st())!.paused, "surfaces: the story did not resume 3 s after the last touch on the tool");
    await ctx.close();
  }
  {
    // the tray: a ring is grey once the story was opened, for the rest of the session
    const { ctx, page: p } = await phone("&app=facebook&fb=home");
    const rings = () => p.locator('.tray .ring[data-seen="true"]').count();
    expect((await rings()) === 0, "surfaces: a ring is grey before any story was opened");
    await p.locator('.tray button[aria-label="Maya\'s story"]').click();
    await wait(p, 800);
    await p.locator(".story").getByRole("button", { name: "Close" }).click();
    await wait(p, 900);
    const grey = await p.evaluate(() => { const r = document.querySelector<HTMLElement>('.tray button[aria-label="Maya\'s story"] .ring')!; const o = document.querySelector<HTMLElement>('.tray button[aria-label="Aditya\'s story"] .ring')!; return [r.dataset.seen, getComputedStyle(r).boxShadow, getComputedStyle(o).boxShadow]; });
    expect((await rings()) === 1 && grey[0] === "true" && grey[1] !== grey[2], `surfaces: the ring did not turn grey after viewing (${grey.join(" | ")})`);
    await ctx.close();
  }
  {
    // reduced motion: no drift, the bar still advances at its own length
    const ctx = await browser.newContext({ viewport: { width: 430, height: PHONE.height }, hasTouch: true, isMobile: true, colorScheme: "dark", reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => failures.push(`surfaces page error: ${e.message}`));
    await p.goto(`${url}?as=tsai&safe=1&theme=dark&app=facebook&fb=story:s-maya`);
    await wait(p, 600);
    const r = await p.evaluate(() => ({ kb: getComputedStyle(document.querySelector(".kb")!).animationName, dur: getComputedStyle(document.querySelector(".b.cur .f")!).animationDuration, seg: document.querySelector(".story")!.getAttribute("data-seg") }));
    expect(r.kb === "none" && r.dur === "5s" && r.seg === "0", `surfaces: reduced motion ${JSON.stringify(r)}; expected no drift and a 5 s bar`);
    await ctx.close();
  }
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=reels", "dark", 430);
    const cdp = await ctx.newCDPSession(p);
    const swipe = async (x0: number, y0: number, x1: number, y1: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] } as never);
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8 }] } as never);
        await p.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] } as never);
    };
    const cur = () => p.evaluate(() => Number(document.querySelector(".list")!.getAttribute("data-cur")));
    const live = () => p.locator('.reel[data-live="true"]');
    await wait(p, 500);
    expect((await p.locator(".reel:not(.empty)").count()) <= 3, "surfaces: more than three reels are mounted");
    expect(/^0:\d\d$/.test(await live().locator(".dur").innerText()), "surfaces: the reel shows no 0:12 style length");
    const anim = await p.evaluate(() => [getComputedStyle(document.querySelector('.reel[data-live="true"] .mv')!).animationName, getComputedStyle(document.querySelector('.reel[data-live="true"] .lf')!).animationName, getComputedStyle(document.querySelector('.reel[data-live="true"] .disc')!).animationName]);
    expect(anim.every((a) => a !== "none"), `surfaces: the reel does not move (${anim.join(", ")})`);
    expect((await live().locator(".side .sa").count()) === 4 && (await live().locator(".audio .song").count()) === 1 && (await live().locator(".mute").count()) === 1, "surfaces: a reel lacks its rail, audio line or mute button");
    // caption opens on tap
    const cap = live().locator(".cap");
    await cap.click();
    expect((await cap.getAttribute("aria-expanded")) === "true", "surfaces: a tap on the caption did not open it");
    await cap.click();
    // tap pauses (the move and the line stop), tap again plays
    await p.touchscreen.tap(215, 380);
    await wait(p, 450);
    const ps = await p.evaluate(() => [document.querySelector('.reel[data-live="true"]')!.getAttribute("data-paused"), getComputedStyle(document.querySelector('.reel[data-live="true"] .lf')!).animationPlayState, !!document.querySelector('.reel[data-live="true"] .glyph')]);
    expect(ps[0] === "true" && ps[1] === "paused" && ps[2] === true, `surfaces: a tap did not pause the reel (${ps.join(", ")})`);
    await p.touchscreen.tap(215, 380);
    await wait(p, 450);
    expect((await live().getAttribute("data-paused")) === "false", "surfaces: a second tap did not play the reel again");
    // double tap likes, with a heart, and does not pause
    await p.touchscreen.tap(215, 420);
    await p.waitForTimeout(60);
    await p.touchscreen.tap(215, 420);
    await wait(p, 120);
    expect((await live().locator('.sa[aria-pressed="true"]').count()) === 1 && (await live().locator(".burst").count()) === 1, "surfaces: a double tap did not like with a heart");
    await wait(p, 500);
    expect((await live().getAttribute("data-paused")) === "false", "surfaces: a double tap also paused the reel");
    // a swipe pages, and one that starts on a tool card (a stand-in card here) pages too, even when the card takes the touch itself
    await swipe(215, 700, 215, 300);
    await wait(p, 1100);
    expect((await cur()) === 1, `surfaces: a swipe up did not go to the next reel (at ${await cur()})`);
    for (const lock of [false, true]) {
      await p.evaluate((lock) => {
        document.querySelectorAll(".tools .fake").forEach((n) => n.remove());
        const t = document.querySelector<HTMLElement>('.reel[data-live="true"] .tools')!;
        t.style.display = "flex";
        const d = document.createElement("div");
        d.className = "fake";
        d.setAttribute("data-surface-tool", "");
        d.style.cssText = `height:240px;background:#fff;touch-action:${lock ? "none" : "auto"}`;
        t.append(d);
      }, lock);
      await wait(p, 100);
      const box = (await p.locator('.reel[data-live="true"] .tools .fake').boundingBox())!;
      const from = await cur();
      await swipe(215, box.y + 200, 215, box.y - 40);
      await wait(p, 1100);
      expect((await cur()) === from + 1, `surfaces: a vertical swipe that starts on a tool card ${lock ? "that takes the touch " : ""}did not page (${from} to ${await cur()})`);
    }
    await ctx.close();
  }

  // Gaming: Play with a group lands the game in a chat.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=gaming");
    await btn(p, "Play with a group").click();
    await wait(p);
    await pick(p, /the boys/);
    await wait(p, 1900);
    expect((await top(p).locator('[data-muse-card][aria-label="Late-night food bracket"]').count()) === 1, "surfaces: Play with a group did not land the game");
    await ctx.close();
  }

  // Notifications: the needs-you row opens the chat at the tool.
  {
    const { ctx, page: p } = await phone("&app=facebook&fb=notifications");
    const row = p.locator("[data-needs-you]");
    expect((await row.count()) === 1 && /To try/.test(await row.innerText()) && /From Reels/.test(await row.innerText()), "surfaces: Notifications has no needs-you row from Reels");
    await row.click();
    await wait(p, 700);
    expect((await top(p).locator('.thread[aria-label="Chat with Will Li"]').count()) === 1, "surfaces: the needs-you row did not open the chat");
    await ctx.close();
  }

  // Desktop: the top bar works for Home, Friends, Marketplace, Groups and Gaming.
  {
    const { ctx, page: p } = await desk("");
    expect((await p.locator(".panes").count()) === 1, "surfaces: desktop does not land on Messenger");
    await btn(p, "Facebook").click();
    await wait(p);
    expect((await p.locator('.main [data-post]').count()) > 3, "surfaces: desktop logo did not open Home");
    for (const [slot, sel] of [["Marketplace", ".mp .grid"], ["Groups", 'section[aria-label="Group"]'], ["Gaming", 'section[aria-label="Gaming"]'], ["Friends", "[data-friends]"], ["Reels", 'section[aria-label="Reels"]'], ["Home", ".main [data-post]"]] as const) {
      await p.locator(".bar .center").getByRole("button", { name: slot }).click();
      await wait(p, 300);
      expect((await p.locator(sel).count()) > 0, `surfaces: desktop ${slot} slot did not open its screen`);
      expect((await p.locator(".bar .center").getByRole("button", { name: slot }).getAttribute("aria-current")) === "page", `surfaces: desktop ${slot} slot is not marked current`);
    }
    await btn(p, /notifications/).click();
    await wait(p);
    expect((await p.locator('[role="dialog"][aria-label="Notifications"] [data-needs-you]').count()) === 1, "surfaces: desktop bell panel has no needs-you row");
    await p.keyboard.press("Escape");
    await btn(p, "Messenger").click();
    await wait(p);
    expect((await p.locator(".panes").count()) === 1, "surfaces: desktop Messenger button did not return to Messenger");
    await ctx.close();
  }

  if (fails0() === before) ok("surfaces: shell, Home tool post and bracket, group finder and pins, Decide with roommates, Split it, to-try list, Make it a plan, Play with a group, needs-you rows, desktop top bar");
}
