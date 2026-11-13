/**
 * bun run check: type-check, token lint (with its must-fail fixture), axe-core on every screen,
 * a no-horizontal-overflow assertion at 320, 393 and 430 px, interaction tests for every flow, and
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { DESKTOP, PHONE, buildApp, launch, reportSizes, root, serve } from "./lib.ts";

import { surfaceChecks } from "./check-surfaces.ts"; // surfaces
import { catalystChecks } from "./check-catalysts.ts"; // catalysts
import { commentChecks } from "./check-comments.ts"; // comments

const failures: string[] = [];
const step = (name: string) => console.log(`\n== ${name}`);
const ok = (msg: string) => console.log(`ok: ${msg}`);
const expect = (cond: boolean, msg: string) => {
  if (!cond) failures.push(msg);
  return cond;
};

function run(name: string, cmd: string, args: string[]) {
  step(name);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) failures.push(name);
}

run("type-check (tsc 7)", join(root, "node_modules/.bin/tsc"), ["--noEmit", "-p", "tsconfig.json"]);
run("type-check svelte (svelte-check, tsgo)", join(root, "node_modules/.bin/svelte-check"), ["--tsgo", "--tsconfig", "./tsconfig.json", "--threshold", "warning"]);
run("token lint self-test (fixture must fail)", process.execPath, [join(root, "scripts/lint-tokens.ts"), "--self-test"]);
run("token lint", process.execPath, [join(root, "scripts/lint-tokens.ts")]);
run("feed numbers self-test (broken fixtures must fail)", process.execPath, [join(root, "scripts/feed-numbers.ts"), "--self-test"]);
run("feed numbers (counts and comment ages recomputed from the lists)", process.execPath, [join(root, "scripts/feed-numbers.ts")]);
run("unit tests (chat reducer: activity lines)", process.execPath, ["test", join(root, "test")]);

if (failures.length === 0) {
  step("build");
  await buildApp();
  reportSizes();
  const server = await serve();
  const browser = await launch();
  const axeSrc = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

  // ------------------------------------------------------------------ helpers
  type Theme = "light" | "dark";
  async function phoneCtx(theme: Theme = "light", width = PHONE.width): Promise<[BrowserContext, Page]> {
    const ctx = await browser.newContext({ viewport: { width, height: PHONE.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
    await page.goto(`${server.url}?safe=1&theme=${theme}`);
    await page.waitForTimeout(250);
    return [ctx, page];
  }
  async function deskCtx(theme: Theme = "light", query = ""): Promise<[BrowserContext, Page]> {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
    await page.goto(`${server.url}?theme=${theme}${query}`);
    await page.waitForTimeout(350);
    return [ctx, page];
  }
  const openRow = async (page: Page, name: string) => {
    await page.locator("button.row", { hasText: name }).first().click();
    await page.waitForTimeout(750);
  };
  const thread = (page: Page, name: string) => page.locator(`.thread[aria-label="Chat with ${name}"]`);
  const msgBox = (page: Page) => page.getByRole("textbox", { name: "Message" });

  /** Left edge of the newest pushed page, or Infinity when none is left (popped). */
  const pushLeft = (page: Page) =>
    page.evaluate(() => {
      const all = [...document.querySelectorAll<HTMLElement>(".push")];
      const last = all.at(-1);
      return last ? Math.round(last.getBoundingClientRect().left) : Infinity;
    });

  /** Is the tool's card in the visible part of the list, under the header and pinned bar? */
  const cardVisible = (page: Page, toolId: string) =>
    page.evaluate((id) => {
      const list = document.querySelector<HTMLElement>(".page:not([inert]) .list, .panel .list");
      const card = list?.querySelector<HTMLElement>(`[data-tool-id="${id}"]`);
      const top = list?.parentElement?.querySelector<HTMLElement>(".top");
      if (!list || !card || !top) return false;
      const c = card.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const barBottom = top.getBoundingClientRect().bottom;
      const visible = Math.min(c.bottom, l.bottom) - Math.max(c.top, barBottom);
      return visible > 120;
    }, toolId);

  // axe: contrast failures caused by real measured values are exempted one pairing at a time, each
  // naming its source. Outgoing bubbles are now gradients (axe reports those as needing review, not
  // as failures), so no pairing needs an exemption today; the list stays so a future one is explicit.
  //   (none)
  const EXEMPT_PAIRS: { fg: string; bg: string }[] = [];

  async function axeViolations(page: Page) {
    await page.addScriptTag({ path: axeSrc });
    return await page.evaluate(
      async (pairs) => {
        // @ts-expect-error injected global
        const r = await window.axe.run(document, { resultTypes: ["violations"] });
        return r.violations
          .map((v: any) => {
            const nodes = v.nodes.filter((n: any) => {
              if (v.id !== "color-contrast") return true;
              const d = n.any[0]?.data;
              return !(d && pairs.some((p: { fg: string; bg: string }) => String(d.fgColor).toLowerCase() === p.fg && String(d.bgColor).toLowerCase() === p.bg));
            });
            return { id: v.id, impact: v.impact, help: v.help, nodes: nodes.slice(0, 3).map((n: any) => n.target.join(" ") + " :: " + (n.any[0]?.message ?? n.failureSummary ?? "")), count: nodes.length };
          })
          .filter((v: any) => v.count > 0);
      },
      EXEMPT_PAIRS,
    );
  }
  async function axe(page: Page, label: string) {
    const res = await axeViolations(page);
    if (res.length) {
      for (const v of res) failures.push(`axe ${label}: ${v.id} (${v.impact}) ${v.help}\n      ${v.nodes.join("\n      ")}`);
    } else console.log(`axe ok: ${label}`);
  }

  async function overflowList(page: Page, width: number): Promise<string[]> {
    return await page.evaluate((w) => {
      const out: string[] = [];
      const de = document.documentElement;
      if (de.scrollWidth > w) out.push(`documentElement.scrollWidth ${de.scrollWidth} > ${w}`);
      // visible screen root: the page that is not translated away
      const roots = [...document.querySelectorAll<HTMLElement>(".page")].filter((el) => !el.hasAttribute("inert"));
      const scope = roots.length ? roots : [document.body];
      for (const r of scope) {
        for (const el of r.querySelectorAll<HTMLElement>("*")) {
          if (el.closest(".sr-only, .notes, svg, defs, [data-hscroll]")) continue; // surfaces: [data-hscroll] marks sideways scrollers (stories, chips)
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.right > w + 0.5 || b.left < -0.5) out.push(`${el.tagName}.${String(el.className).split(" ")[0]} right ${b.right.toFixed(1)} left ${b.left.toFixed(1)}`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0 && !/^(SPAN|A|P|H\d)$/.test(el.tagName)) {
            out.push(`${el.tagName}.${String(el.className).split(" ")[0]} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
          }
        }
      }
      return out.slice(0, 6);
    }, width);
  }
  async function overflow(page: Page, label: string, width: number) {
    const bad = await overflowList(page, width);
    if (bad.length) failures.push(`overflow ${label} @${width}px: ${bad.join("; ")}`);
    else console.log(`no overflow: ${label} @${width}px`);
  }

  /** Note bubbles must not touch each other or a neighbour's avatar. Returns the first collision. */
  const noteCollisions = (page: Page) =>
    page.evaluate(() => {
      const notes = [...document.querySelectorAll<HTMLElement>(".notes .note")];
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const out: string[] = [];
      notes.forEach((n, i) => {
        const bub = n.querySelector(".bubble")!.getBoundingClientRect();
        notes.forEach((m, j) => {
          if (i === j) return;
          if (hit(bub, m.querySelector(".bubble")!.getBoundingClientRect())) out.push(`bubble ${i} touches bubble ${j}`);
          if (hit(bub, m.querySelector(".who")!.getBoundingClientRect())) out.push(`bubble ${i} touches avatar ${j}`);
        });
      });
      return out;
    });

  /** Largest per-channel difference between two PNGs, decoded in the page. */
  const pixelDiff = (page: Page, a: Buffer, b: Buffer) =>
    page.evaluate(
      async ([x, y]) => {
        const load = async (s: string) => {
          const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g = c.getContext("2d")!;
          g.drawImage(bmp, 0, 0);
          return g.getImageData(0, 0, bmp.width, bmp.height).data;
        };
        const [da, db] = [await load(x!), await load(y!)];
        let max = 0;
        for (let i = 0; i < da.length; i++) max = Math.max(max, Math.abs(da[i]! - db[i]!));
        return max;
      },
      [a.toString("base64"), b.toString("base64")] as const,
    );

  // ------------------------------------------------------------------ axe on every screen
  step("axe-core");
  type Setup = (p: Page) => Promise<void>;
  const phoneStates: [string, Setup][] = [
    ["inbox", async () => {}],
    ["note sheet", async (p) => { await p.getByRole("button", { name: /Arun, note/ }).click(); await p.waitForTimeout(400); }],
    ["search", async (p) => { await p.getByRole("button", { name: "Ask Meta AI or search" }).click(); await p.waitForTimeout(700); }],
    ["make sheet (chat picker)", async (p) => {
      await p.getByRole("button", { name: "Ask Meta AI or search" }).click();
      await p.waitForTimeout(700);
      await p.getByRole("button", { name: /Pick for us/ }).click();
      await p.waitForTimeout(400);
    }],
    ["thread apt 4b (pinned bar, activity)", async (p) => { await openRow(p, "apt 4b"); }],
    ["pinned sheet", async (p) => { await openRow(p, "apt 4b"); await p.getByRole("button", { name: "2 Minis in this chat" }).click(); await p.waitForTimeout(400); }],
    ["thread the boys (event link, tool)", async (p) => { await openRow(p, "the boys"); }],
    ["thread senior week (suggestion chip)", async (p) => { await openRow(p, "senior week"); }],
    ["building card", async (p) => { await openRow(p, "senior week"); await p.locator(".chip .go").click(); await p.waitForTimeout(500); }],
    ["mention in composer", async (p) => { await openRow(p, "the boys"); await msgBox(p).fill("@Muse make a bracket"); await p.waitForTimeout(200); }],
    ["event", async (p) => { await p.goto(`${server.url}?safe=1&event=juniper&theme=${await p.evaluate(() => document.documentElement.dataset.theme)}`); await p.waitForTimeout(600); }],
    ["event, interested", async (p) => {
      await p.goto(`${server.url}?safe=1&event=juniper&theme=${await p.evaluate(() => document.documentElement.dataset.theme)}`);
      await p.waitForTimeout(500);
      await p.getByRole("button", { name: "Interested" }).click();
      await p.waitForTimeout(800);
    }],
    ["event chat (who's in card)", async (p) => {
      await p.goto(`${server.url}?safe=1&event=juniper&theme=${await p.evaluate(() => document.documentElement.dataset.theme)}`);
      await p.waitForTimeout(500);
      await p.getByRole("button", { name: "Interested" }).click();
      await p.getByRole("button", { name: "Go together" }).click();
      await p.waitForTimeout(800);
    }],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [label, setup] of phoneStates) {
      const [ctx, p] = await phoneCtx(theme);
      await setup(p);
      await axe(p, `phone ${label} ${theme}`);
      await ctx.close();
    }
    // reaction menu (existing)
    {
      const [ctx, p] = await phoneCtx(theme);
      await openRow(p, "apt 4b");
      await p.locator(".bubble.text", { hasText: "allegedly" }).click({ button: "right" });
      await p.waitForTimeout(500);
      await axe(p, `phone reaction menu ${theme}`);
      await ctx.close();
    }
    const deskStates: [string, string, Setup][] = [
      ["thread apt 4b", "&chat=apt4b", async () => {}],
      ["thread the boys (pinned bar)", "&chat=boys", async () => {}],
      ["thread senior week (chip)", "&chat=senior", async () => {}],
      ["event", "&event=juniper", async () => {}],
      ["event, interested", "&event=juniper", async (p) => { await p.getByRole("button", { name: "Interested" }).click(); await p.waitForTimeout(700); }],
    ];
    for (const [label, q, setup] of deskStates) {
      const [ctx, d] = await deskCtx(theme, q);
      await setup(d);
      await axe(d, `desktop ${label} ${theme}`);
      await ctx.close();
    }
  }

  // Exemptions must stay narrow: an unlisted low-contrast pair (white on a light blue) is flagged.
  {
    const [ctx, p] = await phoneCtx("light");
    await p.evaluate(() => {
      const d = document.createElement("p");
      d.id = "axe-selftest";
      d.textContent = "low contrast sample";
      d.style.cssText = "position:fixed;top:300px;left:20px;z-index:99;background:#4d9aff;color:#ffffff;padding:8px";
      document.body.append(d);
    });
    const found = (await axeViolations(p)).some((v: any) => v.id === "color-contrast" && v.nodes.some((n: string) => n.includes("axe-selftest")));
    if (found) ok("axe self-test: white on a light blue is flagged");
    else failures.push("axe self-test: a low-contrast pair was not flagged");
    await ctx.close();
  }

  // theme follows prefers-color-scheme when no ?theme= is given
  for (const scheme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({ viewport: PHONE, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(server.url);
    const t = await p.evaluate(() => document.documentElement.dataset.theme);
    if (t !== scheme) failures.push(`prefers-color-scheme ${scheme} gave data-theme=${t}`);
    else console.log(`prefers-color-scheme ${scheme}: ok`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ overflow at three widths
  step("overflow");
  for (const width of [320, 393, 430]) {
    const screens: [string, Setup][] = [
      ["inbox", async () => {}],
      ["thread apt 4b", async (p) => { await openRow(p, "apt 4b"); }],
      ["thread the boys", async (p) => { await openRow(p, "the boys"); }],
      ["thread senior week", async (p) => { await openRow(p, "senior week"); }],
      ["search", async (p) => { await p.getByRole("button", { name: "Ask Meta AI or search" }).click(); await p.waitForTimeout(700); }],
      ["event", async (p) => { await p.goto(`${server.url}?safe=1&event=juniper`); await p.waitForTimeout(600); }],
      ["event, interested", async (p) => { await p.goto(`${server.url}?safe=1&event=juniper`); await p.waitForTimeout(500); await p.getByRole("button", { name: "Interested" }).click(); await p.waitForTimeout(800); }],
    ];
    for (const [label, setup] of screens) {
      const [ctx, p] = await phoneCtx("light", width);
      await setup(p);
      await overflow(p, label, width);
      await ctx.close();
    }
    // notes: each one is a column, bubbles never touch
    const [ctx, p] = await phoneCtx("light", width);
    const bad = await noteCollisions(p);
    if (bad.length) failures.push(`notes @${width}px: ${bad.slice(0, 3).join("; ")}`);
    else console.log(`notes do not collide @${width}px`);
    await ctx.close();
  }

  // A check never seen failing proves nothing: force an overflow and a note collision, require both caught.
  {
    const [ctx, p] = await phoneCtx("light", 320);
    await p.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;top:0;left:0;width:500px;height:10px";
      document.querySelector(".inbox")!.append(d);
    });
    const bad = await overflowList(p, 320);
    if (!bad.length) failures.push("overflow self-test: injected 500px element was not detected");
    else console.log("overflow self-test ok: injected overflow was detected");
    await p.evaluate(() => {
      for (const b of document.querySelectorAll<HTMLElement>(".notes .bubble")) b.style.cssText = "width:180px;max-width:none";
    });
    if (!(await noteCollisions(p)).length) failures.push("notes self-test: oversize bubbles were not detected as colliding");
    else console.log("notes self-test ok: oversize bubbles were detected");
    await ctx.close();
  }

  // ------------------------------------------------------------------ interactions
  step("interactions");

  // -- the original thread behaviour
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "apt 4b");
    const pushed = await pushLeft(p);
    if (pushed !== 0) failures.push(`push transition did not settle at 0 (left=${pushed})`);
    const before = await p.locator(".bubble").count();
    await msgBox(p).fill("test message");
    await msgBox(p).press("Enter");
    await p.waitForTimeout(900);
    const after = await p.locator(".bubble").count();
    const gap = await p.evaluate(() => { const l = document.querySelector<HTMLElement>(".page.push .list")!; return l.scrollHeight - l.clientHeight - l.scrollTop; });
    expect(after === before + 1, `send: bubbles ${before} -> ${after}`);
    expect(gap <= 2, `send: list not pinned to bottom (gap ${gap}px)`);
    const target = p.locator(".bubble.text", { hasText: "thats not even mine" });
    await target.dblclick();
    expect((await p.locator("[data-id] .pill", { hasText: "❤️" }).count()) > 0, "double-tap did not add a heart");
    await target.click({ button: "right" });
    await p.getByRole("button", { name: /Remove ❤️/ }).click();
    await p.waitForTimeout(200);
    expect((await p.locator('.row:has-text("thats not even mine") .pill').count()) === 0, "tapping my reaction did not remove it");
    await p.goBack();
    await p.waitForTimeout(700);
    expect((await pushLeft(p)) >= 300, "back did not pop the thread");
    await openRow(p, "the boys");
    await p.mouse.move(6, 400);
    await p.mouse.down();
    await p.mouse.move(120, 400, { steps: 4 });
    await p.mouse.move(280, 400, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(700);
    expect((await pushLeft(p)) >= 300, "edge swipe did not pop the thread");
    ok("push, send and pin, heart, reaction toggle, back, edge swipe");
    await ctx.close();
  }

  // -- Part 1: header is frosted, bubble blue is the measured one, group avatar shows both faces
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "apt 4b");
    // Outgoing bubbles are windows onto one gradient: fixed to the screen on a phone (the thread
    // page), carried by the scroller on desktop. Each bubble's background must sit at minus its own
    // place in that gradient, and stay there as the list scrolls: in Chrome's mode, in Safari's
    // layer mode (the list starts under the bar) and on desktop.
    const misplacedIn = (pg: Page) =>
      pg.evaluate(() => {
        const list = document.querySelector<HTMLElement>(".page.push.shown .list, .panel .list")!;
        const page = list.closest<HTMLElement>(".thread")!;
        const desk = document.documentElement.dataset.layout === "desktop";
        const px = (n: string) => parseFloat(list.style.getPropertyValue(n));
        const H = px("--scroll-h"), G = px("--grad-h"), o = px("--grad-off");
        const lt = list.getBoundingClientRect().top;
        const out: string[] = [];
        if (Math.abs(H - list.clientHeight) > 1) out.push(`--scroll-h ${H} vs list ${list.clientHeight}`);
        const wantG = desk ? list.clientHeight : page.clientHeight;
        const wantO = desk ? 0 : lt - page.getBoundingClientRect().top;
        if (Math.abs(G - wantG) > 1 || Math.abs(o - wantO) > 1) out.push(`gradient ${G} at ${o}, want ${wantG} at ${wantO}`);
        let n = 0;
        for (const b of list.querySelectorAll<HTMLElement>(".row.out .bubble.text:not(.emoji)")) {
          const r = b.getBoundingClientRect();
          if (r.bottom < lt || r.top > lt + list.clientHeight) continue;
          n++;
          const st = getComputedStyle(b);
          // Computed as px, or as calc(P% +- Xpx) where 100% is (bubble height - gradient height).
          const v = st.backgroundPositionY.replace(/\s+/g, "");
          const pc = v.match(/^calc\((-?[\d.]+)%([+-])([\d.]+)px\)$/);
          const xp = v.match(/^calc\((-?[\d.]+)px([+-])([\d.]+)%\)$/);
          const sign = (s: string) => (s === "-" ? -1 : 1);
          const y = /^-?[\d.]+px$/.test(v)
            ? parseFloat(v)
            : /^-?[\d.]+%$/.test(v)
              ? (parseFloat(v) / 100) * (r.height - G)
              : pc
              ? (parseFloat(pc[1]!) / 100) * (r.height - G) + sign(pc[2]!) * parseFloat(pc[3]!)
              : xp
                ? parseFloat(xp[1]!) + sign(xp[2]!) * (parseFloat(xp[3]!) / 100) * (r.height - G)
                : NaN;
          if (!/linear-gradient/.test(st.backgroundImage)) out.push(`"${b.textContent}" has no gradient`);
          else if (!(Math.abs(y + (r.top - lt) + o) <= 1.5)) out.push(`"${b.textContent?.slice(0, 20)}" gradient at ${y.toFixed(1)} (${v}), bubble at ${(r.top - lt + o).toFixed(1)}`);
        }
        if (!n) out.push("no outgoing bubble on screen");
        return out;
      });
    const misplaced = () => misplacedIn(p);
    const atRest = await misplaced();
    await p.evaluate(() => (document.querySelector<HTMLElement>(".page.push .list")!.scrollTop -= 60));
    await p.waitForTimeout(150);
    const scrolled = await misplaced();
    expect(!atRest.length && !scrolled.length, `outgoing gradient not fixed to the screen: ${[...atRest, ...scrolled].join("; ")}`);
    // Safari's layer mode, and desktop.
    const more: string[] = [];
    {
      const [c2, p2] = await phoneCtx("light");
      await p2.evaluate(() => (document.documentElement.dataset.frames = "layer"));
      await openRow(p2, "apt 4b");
      more.push(...(await misplacedIn(p2)).map((e) => `layer: ${e}`));
      await p2.evaluate(() => (document.querySelector<HTMLElement>(".page.push .list")!.scrollTop -= 60));
      await p2.waitForTimeout(150);
      more.push(...(await misplacedIn(p2)).map((e) => `layer, scrolled: ${e}`));
      await c2.close();
      const [c3, p3] = await deskCtx("light", "&chat=apt4b");
      more.push(...(await misplacedIn(p3)).map((e) => `desktop: ${e}`));
      await p3.evaluate(() => (document.querySelector<HTMLElement>(".panel .list")!.scrollTop -= 60));
      await p3.waitForTimeout(150);
      more.push(...(await misplacedIn(p3)).map((e) => `desktop, scrolled: ${e}`));
      await c3.close();
    }
    expect(!more.length, `outgoing gradient misplaced: ${more.join("; ")}`);
    // ...and the check can fail: a bubble whose gradient does not follow the scroll is caught.
    await p.addStyleTag({ content: ".row.out .bubble.text { animation: none !important; background-position: 0 0 !important }" });
    await p.waitForTimeout(50);
    expect((await misplaced()).length > 0, "gradient self-test: a bubble painting its own gradient was not caught");
    if (!atRest.length && !scrolled.length && !more.length) ok("outgoing bubbles show the screen's gradient at their own place (phone, layer mode, desktop), also after scrolling");
    await p.addStyleTag({ content: ".row.out .bubble.text { animation: revert !important; background-position: revert !important }" });
    await p.evaluate(() => (document.querySelector<HTMLElement>(".page.push .list")!.scrollTop = 1e6));
    await p.waitForTimeout(150);
    const glass = await p.evaluate(() => {
      const top = document.querySelector(".thread .top")!;
      const back = getComputedStyle(top, "::before");
      const bg = getComputedStyle(top).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return { alpha: bg[3] ?? 1, blur: back.backdropFilter };
    });
    expect(glass.alpha >= 0.9 && /blur/.test(glass.blur), `header glass alpha ${glass.alpha}, backdrop ${glass.blur}`);
    // Pixel test: scroll message text under the header and compare the header with the list hidden.
    await p.evaluate(() => { document.querySelector<HTMLElement>(".page.push .list")!.scrollTop = 150; });
    await p.waitForTimeout(100);
    const clip = await p.evaluate(() => { const r = document.querySelector(".thread .top")!.getBoundingClientRect(); return { x: 0, y: 0, width: r.width, height: r.bottom }; });
    const withText = await p.screenshot({ clip });
    await p.addStyleTag({ content: ".page.push .list { visibility: hidden !important }" });
    const without = await p.screenshot({ clip });
    const diff = await pixelDiff(p, withText, without);
    expect(diff <= 12, `text shows through the header (max channel difference ${diff}/255)`);
    if (diff <= 12) ok(`header is frosted: content under it differs by at most ${diff}/255 from an empty header`);
    // the pixel test is only meaningful if it can fail: a transparent header must differ a lot
    await p.addStyleTag({ content: ".page.push .list { visibility: visible !important } .thread .top { background: transparent !important } .thread .top::before { display: none !important }" });
    const bare = await p.screenshot({ clip });
    const diffBare = await pixelDiff(p, bare, without);
    expect(diffBare > 40, "frosted-header pixel test cannot detect a transparent header");
    await ctx.close();

    // both faces of the group avatar are visible at every size: the front ring never covers the back initials
    const sizes: [string, Page][] = [];
    const [c2, p2] = await phoneCtx("light");
    sizes.push(["phone row", p2]);
    const rows = await p2.evaluate(() => [...document.querySelectorAll<HTMLElement>(".group")].map((g) => {
      const box = g.getBoundingClientRect();
      const [a, b] = [...g.querySelectorAll<HTMLElement>(".avatar")].map((x) => x.getBoundingClientRect());
      const ini = g.querySelector(".back .initials, .back .face")!;
      // a photo face: the middle 40 percent is the face that must show; initials: their glyph box
      const ib = ini.getBoundingClientRect();
      const init = ini.classList.contains("face") ? new DOMRect(ib.left + ib.width * 0.3, ib.top + ib.height * 0.3, ib.width * 0.4, ib.height * 0.4) : ib;
      const bc = { x: b!.left + b!.width / 2, y: b!.top + b!.height / 2, r: b!.width / 2 };
      const corners = [[init.left, init.top], [init.right, init.top], [init.left, init.bottom], [init.right, init.bottom]];
      const covered = corners.some(([x, y]) => Math.hypot(x! - bc.x, y! - bc.y) < bc.r + 2);
      const inside = [a!, b!].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5);
      return { size: Math.round(box.width), covered, inside };
    }));
    expect(rows.length > 0 && rows.every((r) => !r.covered && r.inside), `group avatar clips a face in the inbox: ${JSON.stringify(rows)}`);
    await p2.locator("button.row", { hasText: "apt 4b" }).click();
    await p2.waitForTimeout(700);
    const head = await p2.evaluate(() => {
      const g = document.querySelector<HTMLElement>(".thread .group")!;
      const box = g.getBoundingClientRect();
      const [a, b] = [...g.querySelectorAll<HTMLElement>(".avatar")].map((x) => x.getBoundingClientRect());
      const ini = g.querySelector(".back .initials, .back .face")!;
      // a photo face: the middle 40 percent is the face that must show; initials: their glyph box
      const ib = ini.getBoundingClientRect();
      const init = ini.classList.contains("face") ? new DOMRect(ib.left + ib.width * 0.3, ib.top + ib.height * 0.3, ib.width * 0.4, ib.height * 0.4) : ib;
      const bc = { x: b!.left + b!.width / 2, y: b!.top + b!.height / 2, r: b!.width / 2 };
      const corners = [[init.left, init.top], [init.right, init.top], [init.left, init.bottom], [init.right, init.bottom]];
      const covered = corners.some(([x, y]) => Math.hypot(x! - bc.x, y! - bc.y) < bc.r + 2);
      const inside = [a!, b!].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5);
      return { size: Math.round(box.width), covered, inside };
    });
    expect(!head.covered && head.inside, `group avatar clips a face in the thread header: ${JSON.stringify(head)}`);
    await c2.close();
    const [c3, d3] = await deskCtx("light", "&chat=apt4b");
    const dk = await d3.evaluate(() => [...document.querySelectorAll<HTMLElement>(".group")].map((g) => {
      const box = g.getBoundingClientRect();
      const [a, b] = [...g.querySelectorAll<HTMLElement>(".avatar")].map((x) => x.getBoundingClientRect());
      const ini = g.querySelector(".back .initials, .back .face")!;
      // a photo face: the middle 40 percent is the face that must show; initials: their glyph box
      const ib = ini.getBoundingClientRect();
      const init = ini.classList.contains("face") ? new DOMRect(ib.left + ib.width * 0.3, ib.top + ib.height * 0.3, ib.width * 0.4, ib.height * 0.4) : ib;
      const bc = { x: b!.left + b!.width / 2, y: b!.top + b!.height / 2, r: b!.width / 2 };
      const corners = [[init.left, init.top], [init.right, init.top], [init.left, init.bottom], [init.right, init.bottom]];
      const covered = corners.some(([x, y]) => Math.hypot(x! - bc.x, y! - bc.y) < bc.r + 2);
      const inside = [a!, b!].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5);
      return { size: Math.round(box.width), covered, inside };
    }));
    expect(dk.length > 0 && dk.every((r) => !r.covered && r.inside), `group avatar clips a face on desktop: ${JSON.stringify(dk)}`);
    if (!failures.some((f) => f.startsWith("group avatar"))) ok(`group avatar keeps both faces at sizes ${[...new Set([...rows, head, ...dk].map((r) => r.size))].join(", ")}`);
    await c3.close();
  }

  // -- Header height: the bar is --header-h (45) under the safe area, nothing more, with and without
  // ?safe=1, with no pinned bar, with one stepped aside, in Chrome's mode and in Safari's layer mode.
  {
    const headerProblems = async (page: Page, want: number, label: string) =>
      page.evaluate(
        ({ want, label }) => {
          const th = [...document.querySelectorAll<HTMLElement>(".thread")].find((t) => t.getBoundingClientRect().width > 0 && !t.closest("[inert]"))!;
          const top = th.querySelector<HTMLElement>(".top")!.getBoundingClientRect();
          const out: string[] = [];
          if (Math.abs(top.height - want) > 0.5) out.push(`${label}: header block is ${top.height.toFixed(1)} px, expected ${want}`);
          return out;
        },
        { want, label },
      );
    const bad: string[] = [];
    for (const [safe, top] of [["?safe=1", 59], ["?", 0]] as const) {
      const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      await p.goto(`${server.url}${safe}&chat=maya`);
      await p.waitForTimeout(600);
      bad.push(...(await headerProblems(p, top + 45, `Maya Chen ${safe}`)));
      // messages start right under it at the top of the list
      const gap = await p.evaluate(() => {
        const list = document.querySelector<HTMLElement>(".page.push .list")!;
        list.scrollTop = 0;
        const first = list.querySelector<HTMLElement>(".stamp, .row")!.getBoundingClientRect().top;
        return first - document.querySelector<HTMLElement>(".page.push .top")!.getBoundingClientRect().bottom;
      });
      if (gap < 0 || gap > 16) bad.push(`Maya Chen ${safe}: first message ${gap.toFixed(1)} px below the header`);
      await p.goto(`${server.url}${safe}&chat=boys`);
      await p.waitForTimeout(900);
      bad.push(...(await headerProblems(p, top + 45, `the boys, card on screen ${safe}`)));
      // Safari's layer mode: the list starts under the bar
      await p.evaluate(() => (document.documentElement.dataset.frames = "layer"));
      await p.goto(`${server.url}${safe}&chat=maya`);
      await p.evaluate(() => (document.documentElement.dataset.frames = "layer"));
      await p.waitForTimeout(300);
      const lm = await p.evaluate(() => {
        const list = document.querySelector<HTMLElement>(".page.push .list")!;
        return list.getBoundingClientRect().top - document.querySelector<HTMLElement>(".page.push .top")!.getBoundingClientRect().bottom;
      });
      if (Math.abs(lm) > 0.5) bad.push(`layer mode ${safe}: list starts ${lm.toFixed(1)} px from the header`);
      await ctx.close();
    }
    const [dc, d] = await deskCtx("light", "&chat=boys");
    await d.waitForTimeout(500);
    bad.push(...(await headerProblems(d, 64, "desktop the boys, card on screen")));
    await dc.close();
    for (const b of bad) failures.push(`header: ${b}`);
    if (!bad.length) ok("thread header is exactly the bar: 104 with ?safe=1, 45 without, 64 on desktop; messages start under it");
    // the check can fail: the old header kept a stepped-aside pinned bar's 44 px
    const [c2, p2] = await phoneCtx("light");
    await p2.goto(`${server.url}?safe=1&chat=boys`);
    await p2.waitForTimeout(900);
    await p2.addStyleTag({ content: ".pin.away { height: var(--pin-h) !important }" });
    expect((await headerProblems(p2, 104, "self-test")).length > 0, "header self-test: a 44 px blank band was not caught");
    await c2.close();
  }

  // -- Chat themes: the icons follow the chat's theme colour, not a fixed blue
  {
    const [ctx, p] = await phoneCtx("light");
    const colours = async (chat: string) => {
      await p.goto(`${server.url}?safe=1&chat=${chat}`);
      await p.waitForTimeout(500);
      return p.evaluate(() => ({ head: getComputedStyle(document.querySelector(".page.push .back")!).color, composer: getComputedStyle(document.querySelector(".page.push .composer .end")!).color }));
    };
    const apt = await colours("apt4b");
    const senior = await colours("senior");
    expect(apt.head !== senior.head && apt.composer !== senior.composer, `header and composer icons do not follow the theme: ${JSON.stringify({ apt, senior })}`);
    expect(apt.head !== apt.composer, `header and composer icons should take the gradient at their own place: ${JSON.stringify(apt)}`);
    if (!failures.some((f) => f.includes("follow the theme") || f.includes("own place"))) ok(`icons follow the chat theme (apt 4b ${apt.head} / ${apt.composer}, senior week ${senior.head} / ${senior.composer})`);
    await ctx.close();
  }

  // -- Inbox filter chips: All, Unread and Groups filter the chats
  {
    const [ctx, p] = await phoneCtx("light");
    const rows = () => p.evaluate(() => [...document.querySelectorAll<HTMLElement>(".inbox button.row")].map((r) => ({ unread: r.classList.contains("unread"), group: !!r.querySelector(".group") })));
    const all = await rows();
    await p.getByRole("button", { name: "Unread", exact: true }).click();
    const unread = await rows();
    await p.getByRole("button", { name: "Groups", exact: true }).click();
    const groups = await rows();
    await p.getByRole("button", { name: "All", exact: true }).click();
    const back = await rows();
    expect(unread.length > 0 && unread.length < all.length && unread.every((r) => r.unread), `Unread shows ${JSON.stringify(unread)}`);
    expect(groups.length > 0 && groups.length < all.length && groups.every((r) => r.group), `Groups shows ${JSON.stringify(groups)}`);
    expect(back.length === all.length, "All does not bring every chat back");
    const dot = await p.evaluate(() => { const d = document.querySelector(".inbox .udot")!.getBoundingClientRect(); return [Math.round(d.left), Math.round(d.width)]; });
    expect(dot[0] === 8 && dot[1] === 8, `unread dot at x ${dot[0]}, ${dot[1]} wide; measured 8 wide at x 8`);
    if (!failures.some((f) => /Unread shows|Groups shows|All does not|unread dot/.test(f))) ok(`filter chips: all ${all.length}, unread ${unread.length}, groups ${groups.length}; unread dot 8 at x 8`);
    await ctx.close();
  }

  // -- A tool card is capped at the widest bubble (588), not the panel: desktop, and a 1000 px
  // window (phone layout below 1100), where the owner saw a 900 px card.
  {
    const cardW = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-muse-card]")].filter((c) => !c.closest("[inert]")).map((c) => c.getBoundingClientRect().width).filter((w) => w > 0));
    const [ctx, d] = await deskCtx("light", "&chat=boys");
    const desk = await cardW(d);
    await ctx.close();
    const wide = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const w = await wide.newPage();
    await w.goto(`${server.url}?chat=boys`);
    await w.waitForTimeout(600);
    const mid = await cardW(w);
    const tooWide = (ws: number[]) => !ws.length || ws.some((x) => x > 588.5);
    expect(!tooWide(desk) && !tooWide(mid), `tool cards wider than 588: desktop ${desk}, 1000 px window ${mid}`);
    // the check can fail: a card as wide as the panel is caught
    await w.addStyleTag({ content: ".row.muse .stack { width: 900px !important; max-width: none !important }" });
    expect(tooWide(await cardW(w)), "card width self-test: a 900 px card was not caught");
    if (!tooWide(desk) && !tooWide(mid)) ok(`tool cards at most 588 wide (desktop ${desk.map(Math.round)}, 1000 px window ${mid.map(Math.round)})`);
    await wide.close();
  }

  // -- 1. live inbox rows, tap opens at the tool
  {
    const [ctx, p] = await phoneCtx("light");
    const text = async (name: string) => (await p.locator("button.row", { hasText: name }).first().locator(".sub").innerText()).replace(/\s+/g, " ");
    const apt = await text("apt 4b");
    const boys = await text("the boys");
    const maya = await text("Maya Chen");
    expect(/Chore wheel · your turn/.test(apt), `inbox row apt 4b shows "${apt}"`);
    expect(/Juniper Fri · 3 of 4 in/.test(boys), `inbox row the boys shows "${boys}"`);
    expect(!/·\s*(your turn|\d of \d in)/.test(maya), `inbox row Maya Chen should be a normal preview, shows "${maya}"`);
    expect((await p.locator("button.row", { hasText: "apt 4b" }).locator(".mark svg").count()) === 1, "live row has no Muse mark");
    await openRow(p, "the boys");
    expect(await cardVisible(p, "t-juniper"), "tapping the live row did not open the thread at the tool");
    if (!failures.some((f) => f.includes("inbox row") || f.includes("live row") || f.includes("at the tool"))) ok("live inbox rows show tool state and open at the tool");
    await ctx.close();
  }

  // -- 2. pinned bar
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "the boys");
    await p.evaluate(() => { document.querySelector<HTMLElement>(".page.push .list")!.scrollTop = 0; });
    await p.waitForTimeout(150);
    expect(!(await cardVisible(p, "t-juniper")), "setup: card should be out of view after scrolling to top");
    await p.getByRole("button", { name: /Juniper Fri · 3 of 4 in/ }).first().click();
    await p.waitForTimeout(900);
    expect(await cardVisible(p, "t-juniper"), "pinned bar tap did not scroll to the card");
    expect((await p.locator(".pin.away").count()) === 1, "pinned bar still shown while its only tool's card is on screen");
    expect((await p.locator(".pin .count").count()) === 0, "single-tool pinned bar should not show a count");
    await p.goBack();
    await p.waitForTimeout(600);
    await openRow(p, "apt 4b");
    await p.evaluate(() => { document.querySelector<HTMLElement>(".page.push .list")!.scrollTop = 0; });
    const count = ((await p.locator(".pin .count").textContent()) ?? "").trim();
    expect(count.startsWith("2"), `pinned bar count is "${count}", expected 2`);
    await p.getByRole("button", { name: "2 Minis in this chat" }).click();
    await p.waitForTimeout(400);
    const items = await p.getByRole("dialog", { name: "Minis in this chat" }).locator("button.tool-row").count();
    expect(items === 2, `tools sheet lists ${items} tools, expected 2`);
    await p.getByRole("dialog").getByRole("button", { name: /Groceries split/ }).click();
    await p.waitForTimeout(900);
    expect((await p.getByRole("dialog").count()) === 0, "tools sheet did not close");
    expect(await cardVisible(p, "t-groceries"), "picking a tool in the sheet did not scroll to its card");
    await p.evaluate(() => { document.querySelector<HTMLElement>(".page.push .list")!.scrollTop = 0; });
    await p.keyboard.press("Escape");
    ok("pinned bar: single tool scrolls, two tools show a count and a sheet");
    await ctx.close();
  }

  // -- 3. activity line
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "apt 4b");
    const line = p.locator("button.activity");
    expect((await line.innerText()) === "Maya spun the wheel", "activity line text is not \"Maya spun the wheel\"");
    await line.click();
    await p.waitForTimeout(300);
    expect((await p.locator('.row.flash[data-tool-id="t-wheel"]').count()) === 1, "tapping the activity line did not jump to the card");
    if (!failures.some((f) => f.includes("activity"))) ok("activity line is tappable and jumps to the card");
    await ctx.close();
  }

  // -- 4. notes: a friend's tool
  {
    const [ctx, p] = await phoneCtx("light");
    await p.getByRole("button", { name: /Arun, note/ }).click();
    await p.waitForTimeout(400);
    const dlg = p.getByRole("dialog", { name: "Late-night food tier list" });
    expect((await dlg.count()) === 1, "note sheet did not open");
    expect((await dlg.locator("[data-muse-card]").count()) === 1, "note sheet has no preview card");
    expect((await dlg.getByRole("button", { name: "Join" }).count()) === 1, "note sheet has no Join button");
    await dlg.getByRole("button", { name: "Use for my group" }).click();
    await p.waitForTimeout(300);
    await p.getByRole("dialog", { name: "Choose a chat" }).getByRole("button", { name: /senior week/ }).click();
    await p.waitForTimeout(400);
    const building = await p.getByRole("dialog", { name: "Muse is conjuring" }).count();
    expect(building === 1, "no \"Muse is conjuring\" state after choosing a chat");
    await p.waitForTimeout(2300);
    expect((await thread(p, "senior week").count()) > 0, "did not land in the chosen chat");
    expect((await pushLeft(p)) === 0, "chat did not settle on screen after the flow");
    expect((await p.locator('[data-muse-card][aria-label="Late-night food tier list"]').count()) === 1, "placeholder card did not land in the chat");
    expect((await p.getByRole("dialog").count()) === 0, "sheet still open after landing");
    await ctx.close();

    const [c2, p2] = await phoneCtx("light");
    await p2.getByRole("button", { name: /Arun, note/ }).click();
    await p2.waitForTimeout(400);
    await p2.getByRole("dialog").getByRole("button", { name: "Join" }).click();
    await p2.waitForTimeout(900);
    expect((await thread(p2, "late night").count()) > 0 && (await p2.locator('[data-muse-card][aria-label="Late-night food tier list"]').count()) === 1, "Join did not land in the tool's chat with the card");
    if (!failures.some((f) => /note sheet|building|chat|sheet still|Join/.test(f))) ok("notes: tool note opens a sheet; Join and Use for my group both land in a chat with the card");
    await c2.close();
  }

  // -- 5. suggestion chip
  {
    const [ctx, p] = await phoneCtx("light");
    for (const name of ["apt 4b", "the boys"]) {
      await openRow(p, name);
      expect((await p.locator(".chip .go").count()) === 0, `suggestion chip appears in ${name}, which is not stuck`);
      await p.goBack();
      await p.waitForTimeout(600);
    }
    await openRow(p, "senior week");
    expect((await p.locator(".chip .go").count()) === 1, "suggestion chip missing in the stuck chat");
    await p.getByRole("button", { name: "Dismiss suggestion" }).click();
    await p.waitForTimeout(200);
    expect((await p.locator(".chip .go").count()) === 0, "dismissed chip is still there");
    await p.goBack();
    await p.waitForTimeout(600);
    await openRow(p, "senior week");
    expect((await p.locator(".chip .go").count()) === 0, "dismissed chip came back");
    await ctx.close();

    const [c2, p2] = await phoneCtx("light");
    await openRow(p2, "senior week");
    const n0 = await p2.locator(".row[data-id]").count();
    await p2.locator(".chip .go").click();
    // measure the bubble above and the card: the card must keep its size and place when the real one replaces it
    const place = () =>
      p2.evaluate(() => {
        const prev = [...document.querySelectorAll<HTMLElement>(".page.push .bubble.text")].find((b) => b.textContent!.includes("no u pick"))!;
        const c = document.querySelector<HTMLElement>("[data-muse-card]");
        return c ? { h: c.getBoundingClientRect().height, gap: Math.round(c.getBoundingClientRect().top - prev.getBoundingClientRect().top), prevTop: Math.round(prev.getBoundingClientRect().top), busy: c.getAttribute("aria-busy") === "true", title: c.getAttribute("aria-label"), from: c.closest(".row")?.querySelector(".sender")?.textContent } : null;
      });
    await p2.waitForTimeout(1100);
    const during = await place();
    expect(!!during && during.busy, "chip did not show the building state");
    await p2.waitForTimeout(1500);
    const final = await place();
    expect(!!final && !final.busy && final.title === "Pick for us" && final.from === "Muse", `tool card did not land as a message from Muse (${JSON.stringify(final)})`);
    if (during && final) expect(Math.abs(during.h - final.h) < 0.5 && during.gap === final.gap && Math.abs(during.prevTop - final.prevTop) <= 1, `building state and final card differ (${JSON.stringify(during)} vs ${JSON.stringify(final)}): the layout jumped`);
    expect((await p2.locator(".row[data-id]").count()) === n0 + 1, "building then card should be one message, not two");
    expect((await p2.locator(".chip .go").count()) === 0, "chip still shown after taking it");
    if (!failures.some((f) => /chip|building state|tool card did not land|one message/.test(f))) ok("suggestion chip: only in the stuck chat, dismiss sticks, building state is the same size as the card");
    await c2.close();
  }

  // -- 6. asking by name
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "the boys");
    await msgBox(p).fill("hey muse");
    expect((await p.locator(".mirror .mention").count()) === 0, "mention highlighted mid-sentence");
    await msgBox(p).fill("Muse pick a place for dinner");
    expect((await p.locator(".mirror .mention").innerText()) === "Muse", "leading muse is not highlighted");
    await msgBox(p).fill("@Muse split the groceries");
    expect((await p.locator(".mirror .mention").innerText()) === "@Muse", "leading @Muse is not highlighted");
    await msgBox(p).press("Enter");
    await p.waitForTimeout(250);
    expect((await p.locator(".row.out .mention", { hasText: "@Muse" }).count()) === 1, "sent mention is not highlighted in the bubble");
    await p.waitForTimeout(700);
    expect((await p.locator('[data-muse-card][aria-busy="true"]').count()) === 1, "mention did not show the building state");
    await p.waitForTimeout(2100);
    expect((await p.locator('[data-muse-card][aria-label="Bill split"]').count()) === 1, "mention did not end in a card (expected Bill split)");
    if (!failures.some((f) => /mention/.test(f))) ok("asking by name: highlight, building state, card");
    await ctx.close();
  }

  // -- 7. search
  {
    const [ctx, p] = await phoneCtx("light");
    await p.getByRole("button", { name: "Ask Meta AI or search" }).click();
    await p.waitForTimeout(700);
    const heads = await p.locator(".search h2.sec").allInnerTexts();
    expect(heads.join("|") === "Minis in your chats|Make something", `search sections are ${JSON.stringify(heads)}`);
    const rows = await p.locator(".search .scroll ul").evaluateAll((uls) => uls.map((u) => u.querySelectorAll("li").length));
    expect(rows[0] === 4 && rows[1] === 3, `search rows are ${JSON.stringify(rows)}, expected 4 tools and 3 suggestions`); // surfaces: Will's to-try list is the 4th tool
    await p.getByRole("button", { name: /Juniper Fri · 3 of 4 in/ }).click();
    await p.waitForTimeout(800);
    expect((await thread(p, "the boys").count()) > 0 && (await cardVisible(p, "t-juniper")), "search result did not open the chat at the tool");
    if (!failures.some((f) => f.includes("search"))) ok("search: two sections, tool rows navigate");
    await ctx.close();
  }

  // -- Part 3: event page
  {
    const [ctx, p] = await phoneCtx("light");
    await openRow(p, "the boys");
    await p.locator(".bubble.link.event").click();
    await p.waitForTimeout(800);
    expect((await p.locator('section[aria-label="Event"]').count()) === 1, "link preview did not open the event page");
    const date = (await p.locator(".date").textContent()) ?? "";
    expect(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ at \d+:\d\d [AP]M$/.test(date), `event date line is "${date}"`);
    expect((await p.locator(".counts").innerText()) === "1.4K interested · 84 going", "event counts line is wrong");
    expect((await p.locator(".moment").count()) === 0, "Muse moment shown before tapping Interested");
    await p.getByRole("button", { name: "Interested" }).click();
    await p.waitForTimeout(800);
    expect((await p.locator(".moment .who").innerText()) === "Maya, Arun and Will are interested too", "Muse moment text is wrong");
    expect((await p.locator(".moment .pile .avatar").count()) === 3, "Muse moment facepile should show 3 faces");
    expect((await p.locator(".counts").innerText()) === "1.4K interested · 84 going", "counts should still read 1.4K after +1");
    await p.getByRole("button", { name: "Go together" }).click();
    await p.waitForTimeout(900);
    expect((await thread(p, "Juniper Hale live").count()) > 0, "Go together did not open the new chat");
    // catalysts: Go together builds through the pack, with the same building card as any ask; wait for the card itself
    await p.waitForFunction(() => document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] .row[data-id] .title')?.textContent === "Who's in", undefined, { timeout: 15_000 }).catch(() => {});
    const first = await p.evaluate(() => {
      const r = document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] .row[data-id]');
      return { muse: r?.classList.contains("muse"), title: r?.querySelector(".title")?.textContent, sender: r?.querySelector(".sender")?.textContent };
    });
    expect(first.muse === true && first.title === "Who's in" && first.sender === "Muse", `first message is not the who's in card from Muse (${JSON.stringify(first)})`);
    const members = await p.evaluate(() => document.querySelector(".thread .names .status")?.textContent);
    expect(!!members, "new chat header is empty");
    // back returns to the event, and a second Go together reuses the chat
    await p.goBack();
    await p.waitForTimeout(700);
    expect((await p.locator('section[aria-label="Event"]').count()) === 1 && (await pushLeft(p)) === 0, "back from the new chat did not return to the event");
    await p.getByRole("button", { name: "Go together" }).click();
    await p.waitForTimeout(800);
    await p.goBack();
    await p.goBack();
    await p.waitForTimeout(800);
    expect((await p.locator("button.row", { hasText: "Juniper Hale live" }).count()) === 1, "Go together twice made two chats");
    if (!failures.some((f) => /event|Muse moment|Go together|who's in card/.test(f))) ok("event: link bubble opens it, Interested reveals the moment, Go together makes the chat with the who's in card");
    await ctx.close();

    // desktop: no Events slot in the top bar; the link bubble opens the event, then Go together
    const [c2, d] = await deskCtx("light", "&chat=boys");
    expect((await d.getByRole("button", { name: "Events" }).count()) === 0, "desktop top bar still has an Events slot");
    await d.locator(".bubble.link.event").click();
    await d.waitForTimeout(600);
    expect((await d.locator('section[aria-label="Event"]').count()) === 1, "desktop link preview did not open the event");
    expect((await d.locator(".tile").count()) === 1 && (await d.locator(".cover").count()) === 1, "desktop event is missing the date tile or cover");
    await d.getByRole("button", { name: "Going" }).click();
    await d.waitForTimeout(700);
    expect((await d.locator(".moment .who").count()) === 1, "desktop event: Muse moment did not appear after Going");
    await d.getByRole("button", { name: "Go together" }).click();
    await d.waitForTimeout(800);
    expect((await d.locator('.panel .thread[aria-label="Chat with Juniper Hale live"]').count()) === 1, "desktop Go together did not open the new chat");
    // link bubble on desktop
    await d.goto(`${server.url}?chat=boys`);
    await d.waitForTimeout(500);
    await d.locator(".bubble.link.event").click();
    await d.waitForTimeout(500);
    expect((await d.locator('section[aria-label="Event"]').count()) === 1, "desktop link preview did not open the event");
    await d.getByRole("button", { name: "Messenger" }).click();
    await d.waitForTimeout(400);
    expect((await d.locator(".panes").count()) === 1, "Messenger button did not return from the event");
    if (!failures.some((f) => f.startsWith("desktop"))) ok("desktop: no Events slot, link entry, Go together");
    await c2.close();
  }

  // -- desktop: pinned bar, suggestion
  {
    const [ctx, d] = await deskCtx("light", "&chat=boys");
    expect((await d.locator(".pin").count()) === 1, "desktop thread has no pinned bar");
    await d.evaluate(() => { document.querySelector<HTMLElement>(".panel .list")!.scrollTop = 0; });
    await d.waitForTimeout(200);
    await d.locator(".pin").click();
    await d.waitForTimeout(500);
    expect((await d.locator('.row.flash[data-tool-id="t-juniper"]').count()) === 1, "desktop pinned bar did not jump to the card");
    await d.goto(`${server.url}?chat=senior`);
    await d.waitForTimeout(500);
    await d.locator(".chip .go").click();
    await d.waitForTimeout(2300);
    expect((await d.locator('[data-muse-card][aria-label="Pick for us"]').count()) === 1, "desktop suggestion did not end in a card");
    await ctx.close();
  }

  // -- Typeface: Muse Sans on the phone looks, loaded before the first render (no layout shift);
  // the system stack on desktop.
  {
    const font = async (theme: Theme, desk: boolean, lateMs = 0) => {
      const ctx = await browser.newContext(desk ? { viewport: DESKTOP, colorScheme: theme } : { viewport: PHONE, isMobile: true, hasTouch: true, colorScheme: theme });
      const p = await ctx.newPage();
      if (lateMs) await p.route("**/*.woff2", async (r) => { await new Promise((ok) => setTimeout(ok, lateMs)); await r.continue(); });
      // Layout shifts from the very start, and whether the face was there at the first row's paint.
      await p.addInitScript(() => {
        const w = window as unknown as { __cls: number; __fontAtFirstRow: boolean | null };
        w.__cls = 0;
        w.__fontAtFirstRow = null;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        new MutationObserver((_, mo) => {
          if (!document.querySelector("button.row")) return;
          w.__fontAtFirstRow = document.fonts.check('17px "Muse Sans"');
          mo.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await p.goto(`${server.url}?safe=1&theme=${theme}`);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => ({
        family: getComputedStyle(document.querySelector("button.row")!).fontFamily,
        cls: (window as unknown as { __cls: number }).__cls,
        early: (window as unknown as { __fontAtFirstRow: boolean | null }).__fontAtFirstRow,
      }));
      await ctx.close();
      return r;
    };
    const ph = await font("light", false);
    const dk = await font("dark", true);
    const okPhone = expect(/^"?Muse Sans/.test(ph.family) && ph.early === true, `phone text should be Muse Sans, loaded before the first row: ${JSON.stringify(ph)}`);
    const noShift = expect(ph.cls === 0, `layout moved while the font loaded on the phone inbox (CLS ${ph.cls})`);
    const okDesk = expect(/^system-ui/.test(dk.family), `desktop text should keep the system stack: ${dk.family}`);
    // ...and the check can fail: a font that arrives after the first render is caught.
    const late = await font("light", false, 1500);
    expect(late.early === false || late.cls > 0, `font self-test: a late font was not caught ${JSON.stringify(late)}`);
    if (okPhone && noShift && okDesk) ok(`type: Muse Sans on the phone, there before the first row, no layout shift; system stack on desktop (a font that arrives late is caught)`);
  }

  // -- surfaces: the Facebook app (scripts/check-surfaces.ts)
  await surfaceChecks({ browser: browser as Browser, url: server.url, axe, overflow, expect, ok, step, failures });
  // -- catalysts (scripts/check-catalysts.ts)
  await catalystChecks({ browser: browser as Browser, url: server.url, axe, overflow, expect, ok, step, failures });
  await commentChecks({ browser: browser as Browser, url: server.url, axe, expect, ok, step, failures }); // comments

  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\ncheck FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\ncheck passed");
