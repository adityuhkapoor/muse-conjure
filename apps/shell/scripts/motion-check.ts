/**
 * bun run check:motion: the phone look moves like iOS (headless Chromium, Pixel 7 profile, and WebKit for the
 * transition records). Checks that a push is a slide of the incoming page over a parallax, dimmed page with no
 * opacity-only animation, that push and pop use the --m-* token values, that the edge swipe follows the finger
 * and the page beneath follows in parallax, that sheets dismiss by drag, and that frames during a push stay
 * under budget at 4x CPU throttling. Each check is also run on the old behaviour (the 200 ms Android fade) and
 * must fail there. `--film <dir>` writes filmstrip PNGs of a push and a sheet, before and after.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, webkit, type Page, type BrowserType } from "playwright";
import { buildApp, serve } from "./lib.ts";

const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : "");
const filmDir = arg("--film");
await buildApp();
const server = await serve();
const failures: string[] = [];
const fail = (m: string) => failures.push(m);

/** What the shell did before: a 200 ms near-linear fade with a 24 px slide, the page underneath still. Verbatim from the old App.svelte. */
const OLD_FADE = `
.page.push { opacity: var(--p) !important; transform: translateX(calc((1 - var(--p)) * 24px)) !important; transition: opacity 200ms cubic-bezier(0.24,0.56,0.86,0.56), transform 200ms cubic-bezier(0.24,0.56,0.86,0.56), visibility 0s linear 200ms !important; }
.page.push.shown { transition: opacity 200ms cubic-bezier(0.24,0.56,0.86,0.56), transform 200ms cubic-bezier(0.24,0.56,0.86,0.56) !important; }
.page.inbox { transform: none !important; transition: none !important; }
.page::after, .push::before { display: none !important; }`;

type Eng = { name: string; type: BrowserType; device: string };
const ENGINES: Eng[] = [
  { name: "chromium", type: chromium, device: "Pixel 7" },
  { name: "webkit", type: webkit, device: "iPhone 15 Pro" },
];

async function fresh(e: Eng, browser: Awaited<ReturnType<BrowserType["launch"]>>, theme: "light" | "dark" = "light", extraCss = "") {
  const ctx = await browser.newContext({ ...devices[e.device], colorScheme: theme });
  await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const page = await ctx.newPage();
  page.on("pageerror", (x) => fail(`[${e.name}] page error: ${x.message}`));
  await page.goto(`${server.url}?safe=1&theme=${theme}`);
  await page.waitForSelector("button.row");
  if (extraCss) await page.addStyleTag({ content: extraCss });
  await page.waitForTimeout(300);
  return { ctx, page };
}

/** The measured iPhone numbers the tokens must hold (the design notes), in ms. */
const EXPECT = { push: 600, pop: 460, send: 250, menuIn: 330, menuOut: 200 };

/** A token's duration and easing as the browser resolves them, normalised through a probe element. */
const tokens = (page: Page, name = "push") =>
  page.evaluate((name) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.transitionTimingFunction = `var(--m-${name}-ease)`;
    probe.style.transitionDuration = `var(--m-${name}-dur)`;
    const cs = getComputedStyle(probe);
    const out = { ease: cs.transitionTimingFunction, dur: cs.transitionDuration, under: getComputedStyle(document.documentElement).getPropertyValue("--m-under-dim").trim() };
    probe.remove();
    return out;
  }, name);

const nums = (e: string) => (e.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
/** Engines print the same easing with different rounding: compare the numbers, not the text. */
const sameEase = (a: string, b: string) => nums(a).length === nums(b).length && nums(a).every((n, i) => Math.abs(n - nums(b)[i]!) < 0.011) && a.startsWith(b.slice(0, 5));
const norm = (e: string) => e.slice(0, 60);
type Rec = { props: string[]; target: string; pseudo: string; dur: number; ease: string };
/** Taps a row and records every transition or animation running a moment later. */
async function recordPush(page: Page, row: string): Promise<Rec[]> {
  await page.locator("button.row", { hasText: row }).first().click();
  await page.waitForFunction(() => (document as any).getAnimations({ subtree: true }).some((a: Animation) => (a as CSSTransition).transitionProperty === "transform"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(60);
  return page.evaluate(() =>
    ((document as any).getAnimations({ subtree: true }) as CSSTransition[])
      .filter((a) => a.effect instanceof KeyframeEffect && (a.effect.target as Element | null)?.closest?.(".stack"))
      .map((a) => {
        const eff = a.effect as KeyframeEffect;
        const t = eff.getTiming();
        const el = eff.target as Element;
        return { props: [a.transitionProperty ?? (a as any).animationName ?? "?"], target: `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`, pseudo: eff.pseudoElement ?? "", dur: Number(t.duration), ease: String(t.easing) };
      }),
  );
}

async function pushChecks(e: Eng, page: Page, label: string, expectGood: boolean): Promise<string[]> {
  const bad: string[] = [];
  const tok = await tokens(page);
  const recs = await recordPush(page, "apt 4b");
  const tr = recs.filter((r) => r.props[0] === "transform");
  const incoming = tr.find((r) => r.target.includes("push"));
  const under = tr.find((r) => r.target.includes("inbox"));
  if (!incoming) bad.push("the incoming page has no transform animation");
  else {
    if (Math.abs(incoming.dur - parseFloat(tok.dur) * 1000) > 1) bad.push(`push lasts ${incoming.dur} ms, token says ${tok.dur}`);
    if (!sameEase(incoming.ease, tok.ease)) bad.push(`push easing is ${norm(incoming.ease)}, token says ${norm(tok.ease)}`);
  }
  if (!under) bad.push("the page underneath does not move (no parallax)");
  // No opacity-only animation: anything animating opacity must be on a pseudo-element layer (dim, edge shadow) beside the slide, never a page or its content.
  for (const r of recs) if (r.props[0] === "opacity" && !r.pseudo) bad.push(`${r.target} animates opacity on its own`);
  const opacityOnly = recs.filter((r) => r.props[0] === "opacity");
  if (opacityOnly.length && !tr.length) bad.push("the screen change is a fade");
  // End state: beneath moved -30 percent and dimmed.
  await page.waitForTimeout(700);
  const end = await page.evaluate(() => {
    const W = innerWidth;
    const m = new DOMMatrix(getComputedStyle(document.querySelector(".inbox")!).transform);
    const dim = parseFloat(getComputedStyle(document.querySelector(".inbox")!, "::after").opacity);
    const top = new DOMMatrix(getComputedStyle(document.querySelector(".push")!).transform);
    return { under: m.m41 / W, dim, top: top.m41 };
  });
  if (Math.abs(end.under + 0.3) > 0.01) bad.push(`page beneath ends at ${end.under.toFixed(2)} of the width, expected -0.30`);
  if (Math.abs(end.dim - parseFloat(tok.under)) > 0.01) bad.push(`page beneath dims to ${end.dim.toFixed(2)}, expected ${tok.under}`);
  if (Math.abs(end.top) > 0.5) bad.push("top page not at rest");
  // Pop is the push in reverse with its own measured timing, and it ends off screen.
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => (document as any).getAnimations({ subtree: true }).some((a: Animation) => (a as CSSTransition).transitionProperty === "transform" && (a.effect as KeyframeEffect).target?.classList?.contains("push")), null, { timeout: 3000 }).catch(() => bad.push("pop does not slide the page out"));
  const pop = await page.evaluate(() => {
    const a = ((document as any).getAnimations({ subtree: true }) as CSSTransition[]).find((x) => x.transitionProperty === "transform" && (x.effect as KeyframeEffect).target?.classList?.contains("push"));
    return a ? { dur: Number(a.effect!.getTiming().duration), ease: String(a.effect!.getTiming().easing) } : null;
  });
  const popTok = await tokens(page, "pop");
  if (pop && (Math.abs(pop.dur - parseFloat(popTok.dur) * 1000) > 1 || !sameEase(pop.ease, popTok.ease))) bad.push(`pop lasts ${pop.dur} ms with another easing than the pop token (${popTok.dur})`);
  for (const [k, ms] of Object.entries({ push: EXPECT.push, pop: EXPECT.pop, send: EXPECT.send, "menu-in": EXPECT.menuIn, "menu-out": EXPECT.menuOut })) {
    const t = await tokens(page, k);
    if (Math.abs(parseFloat(t.dur) * 1000 - ms) > 1) bad.push(`token ${k} is ${t.dur}, the measured value is ${ms} ms`);
  }
  void label;
  void expectGood;
  return bad;
}

async function frameTimes(e: Eng, page: Page): Promise<{ p50: number; p95: number; max: number; frames: number; tapToMotion: number } | null> {
  if (e.name !== "chromium") return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const r = await page.evaluate(
    () =>
      new Promise<{ deltas: number[]; tapToMotion: number }>((done) => {
        const deltas: number[] = [];
        let started = 0;
        let prev = 0;
        const t0 = performance.now();
        let tapAt = 0;
        const frame = (now: number) => {
          if (started) {
            if (prev) deltas.push(now - prev);
            prev = now;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        document.addEventListener("transitionrun", (ev) => {
          if ((ev.target as Element).classList.contains("push") && !started) {
            started = performance.now();
            tapAt = started - t0;
          }
        });
        document.addEventListener("transitionend", (ev) => {
          if ((ev.target as Element).classList.contains("push") && (ev as TransitionEvent).propertyName === "transform") done({ deltas, tapToMotion: tapAt });
        });
        (document.querySelector("button.row") as HTMLElement).click();
      }),
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const s = [...r.deltas].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
  return { p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +Math.max(...s).toFixed(1), frames: s.length, tapToMotion: Math.round(r.tapToMotion) };
}

async function dragChecks(e: Eng, page: Page): Promise<string[]> {
  const bad: string[] = [];
  const read = () =>
    page.evaluate(() => {
      const W = innerWidth;
      const top = [...document.querySelectorAll<HTMLElement>(".push")].at(-1);
      return { top: top ? new DOMMatrix(getComputedStyle(top).transform).m41 / W : null, under: new DOMMatrix(getComputedStyle(document.querySelector(".inbox")!).transform).m41 / W };
    });
  await page.locator("button.row", { hasText: "apt 4b" }).first().click();
  await page.waitForTimeout(800);
  const W = await page.evaluate(() => innerWidth);
  const FRAC = 0.4;
  // Complete: drag past the distance threshold slowly, hold, release.
  await page.mouse.move(4, 500);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(4 + (i * FRAC * W) / 10, 500);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(100);
  const mid = await read();
  if (!mid.top || Math.abs(mid.top - FRAC) > 0.03) bad.push(`top page at ${mid.top?.toFixed(2)} of the width while the finger is at ${FRAC}`);
  if (Math.abs(mid.under - -0.3 * (1 - FRAC)) > 0.03) bad.push(`page beneath at ${mid.under.toFixed(2)}, expected parallax ${(-0.3 * (1 - FRAC)).toFixed(2)}`);
  await page.mouse.up(); // 0.4 of the way and slow: past the 0.35 distance, so this one completes
  await page.waitForTimeout(1400);
  if ((await read()).top !== null) bad.push("release past the distance threshold did not go back");
  await page.locator("button.row", { hasText: "apt 4b" }).first().click();
  await page.waitForTimeout(800);
  await page.mouse.move(4, 500);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(4 + i * 0.03 * W, 500);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(250); // hold still: no velocity
  await page.mouse.up();
  await page.waitForTimeout(900);
  const after = await read();
  if (after.top === null || Math.abs(after.top) > 0.005) bad.push("a short slow swipe did not spring back");
  // Velocity: a short fast flick completes.
  await page.mouse.move(4, 500);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(4 + i * 0.07 * W, 500); // about 0.2 of the width in a few ms
  await page.mouse.up();
  await page.waitForTimeout(1400);
  if ((await read()).top !== null) bad.push("a fast flick did not go back");
  void e;
  return bad;
}

async function sheetChecks(page: Page): Promise<string[]> {
  const bad: string[] = [];
  await page.locator("button.row", { hasText: "apt 4b" }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "2 tools in this chat" }).click();
  await page.waitForTimeout(800);
  const panel = page.getByRole("dialog");
  const box = (await panel.boundingBox())!;
  const dragDown = async (dy: number, steps = 8, wait = 16) => {
    const x = box.x + box.width / 2;
    const y = box.y + 14;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, y + (dy * i) / steps);
      await page.waitForTimeout(wait);
    }
  };
  // Small, slow drag: follows the finger, then springs back.
  await dragDown(40, 8, 40);
  await page.waitForTimeout(150);
  const during = (await panel.boundingBox())!.y - box.y;
  if (Math.abs(during - 40) > 6) bad.push(`sheet is ${during.toFixed(0)} px down while the finger is 40 px down`);
  await page.mouse.up();
  await page.waitForTimeout(900);
  if (!(await panel.count()) || Math.abs((await panel.boundingBox())!.y - box.y) > 1) bad.push("a short drag did not spring the sheet back");
  // Upward drag rubber-bands: moves less than the finger.
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(x, box.y + 14 - 100, { steps: 6 });
  await page.waitForTimeout(60);
  const up = box.y - (await panel.boundingBox())!.y;
  await page.mouse.up();
  await page.waitForTimeout(900);
  if (!(up > 5 && up < 70)) bad.push(`upward drag of 100 moved the sheet ${up.toFixed(0)} (should resist)`);
  // Long drag: dismisses.
  await dragDown(220, 8, 40);
  await page.mouse.up();
  await page.waitForTimeout(900);
  if (await page.getByRole("dialog").count()) bad.push("dragging a sheet down past a third did not dismiss it");
  // A fast flick dismisses too.
  await page.getByRole("button", { name: "2 tools in this chat" }).click();
  await page.waitForTimeout(800);
  await dragDown(60, 4, 6);
  await page.mouse.up();
  await page.waitForTimeout(900);
  if (await page.getByRole("dialog").count()) bad.push("a fast flick down did not dismiss the sheet");
  return bad;
}


/** Send and the long-press menu: the animations that run use the send, menu-in and menu-out tokens. */
async function bubbleChecks(page: Page): Promise<string[]> {
  const bad: string[] = [];
  await page.locator("button.row", { hasText: "senior week" }).first().click();
  await page.waitForTimeout(1000);
  const running = (name: string) =>
    page.evaluate((name) => {
      const a = ((document as any).getAnimations({ subtree: true }) as CSSAnimation[]).find((x) => x.animationName === name);
      return a ? { dur: Number(a.effect!.getTiming().duration), ease: String(a.effect!.getTiming().easing), prop: (a.effect as KeyframeEffect).getKeyframes().map((k) => Object.keys(k).filter((n) => !["offset", "easing", "composite", "computedOffset"].includes(n))).flat() } : null;
    }, name);
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill("on my way");
  await box.press("Enter");
  await page.waitForTimeout(40);
  const send = await running("m-pop-out");
  if (!send) bad.push("a sent bubble does not animate in");
  else {
    if (send.dur !== EXPECT.send) bad.push(`send lasts ${send.dur} ms, measured ${EXPECT.send}`);
    if (send.prop.includes("opacity")) bad.push("a sent bubble fades in");
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => {
    const b = document.querySelector<HTMLElement>(".page:not([inert]) .bubble")!;
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: r.left + 10, clientY: r.top + 10 }));
    await new Promise((x) => setTimeout(x, 560));
  });
  const menu = await running("m-bar-in");
  if (!menu) bad.push("the reaction bar does not spring out");
  else if (menu.dur !== EXPECT.menuIn) bad.push(`menu in lasts ${menu.dur} ms, measured ${EXPECT.menuIn}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector<HTMLElement>("[data-reaction-menu]")!.click());
  await page.waitForTimeout(40);
  const out = await running("m-bar-out");
  if (!out) bad.push("the reaction bar does not animate out");
  else if (out.dur !== EXPECT.menuOut) bad.push(`menu out lasts ${out.dur} ms, measured ${EXPECT.menuOut}`);
  return bad;
}


/** A fast tap on a Muse option while the page is still sliding in (about 50 ms after it starts) must work: the card is made and finishes. */
async function tapDuringPush(page: Page): Promise<string[]> {
  const bad: string[] = [];
  await page.locator("button.row", { hasText: "senior week" }).first().click();
  await page.waitForSelector(".page.push [data-chat], .page.push .thread", { state: "attached" });
  const before = await page.locator(".page.push [data-muse-card]").count();
  await page.waitForTimeout(50);
  const tapped = await page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>(".page.push .chip .go, .page.push [data-muse-option]");
    chip?.click();
    return !!chip;
  });
  if (!tapped) return ["no Muse option in the thread to tap"];
  await page.waitForTimeout(3200);
  const now = await page.locator(".page.push.shown [data-muse-card]").count();
  const building = await page.locator(".page.push.shown [data-muse-card] .spin, .page.push.shown :text('Muse is conjuring')").count();
  if (now !== before + 1) bad.push(`a tap 50 ms into the push made ${now - before} cards, expected 1`);
  if (building) bad.push("the card is still building after 3 s");
  if (!(await page.locator(".page.push.shown").count())) bad.push("the page never settled as shown");
  return bad;
}

/** A filmstrip: the animations are paused at fixed times and each frame is screenshotted. */
async function film(e: Eng, browser: Awaited<ReturnType<BrowserType["launch"]>>, name: string, css: string, what: "push" | "sheet") {
  const { ctx, page } = await fresh(e, browser, "light", css);
  const times = what === "push" ? [0, 60, 120, 180, 260, 400] : [0, 60, 120, 200, 300, 450];
  const shots: Buffer[] = [];
  if (what === "push") await page.locator("button.row", { hasText: "apt 4b" }).first().click();
  else {
    await page.locator("button.row", { hasText: "apt 4b" }).first().click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "2 tools in this chat" }).click();
  }
  await page.waitForFunction(() => (document as any).getAnimations({ subtree: true }).length > 0, null, { timeout: 3000 }).catch(() => {});
  for (const t of times) {
    await page.evaluate((t) => ((document as any).getAnimations({ subtree: true }) as Animation[]).filter((a) => a.timeline === document.timeline).forEach((a) => { a.pause(); a.currentTime = t; }), t);
    await page.waitForTimeout(60);
    shots.push(await page.screenshot());
  }
  await ctx.close();
  const html = `<body style="margin:0;display:flex;gap:6px;background:#888">${shots.map((b, i) => `<div style="font:12px sans-serif;color:#fff"><img width="196" src="data:image/png;base64,${b.toString("base64")}"/><br>${times[i]} ms</div>`).join("")}</body>`;
  const c2 = await browser.newContext({ viewport: { width: 6 * 202, height: 470 } });
  const p2 = await c2.newPage();
  await p2.setContent(html);
  const out = join(filmDir, `${name}.png`);
  await p2.screenshot({ path: out });
  await c2.close();
  return out;
}

/**
 * Stories and Reels: frame times at 4x CPU while a reel pages (three smooth scrolls with the slow move, the
 * loop line and the disc running) and while a story slides to the next person (the card turns like a cube,
 * the bars and the zoom running). No frame over 34 ms; only transform and opacity animate.
 */
async function mediaFrames(e: Eng, browser: Awaited<ReturnType<BrowserType["launch"]>>): Promise<void> {
  if (e.name !== "chromium") return;
  const run = async (query: string, wait: string, act: string) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("pageerror", (x) => fail(`[${e.name}] page error: ${x.message}`));
    await page.goto(`${server.url}?safe=1&theme=dark${query}`);
    await page.waitForSelector(wait);
    await page.waitForTimeout(600);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const r = await page.evaluate(
      (act) =>
        new Promise<{ deltas: number[]; props: string[] }>((done) => {
          const deltas: number[] = [];
          const props = new Set<string>();
          let prev = 0;
          let stop = false;
          const frame = (now: number) => {
            if (prev) deltas.push(now - prev);
            prev = now;
            if (deltas.length % 25 === 3) for (const a of (document as any).getAnimations({ subtree: true }) as Animation[]) for (const k of (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) props.add(p);
            if (!stop) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          new Function("done", `return (async () => { ${act} })()`)(() => {}).then(() => {
            stop = true;
            setTimeout(() => done({ deltas, props: [...props] }), 50);
          });
        }),
      act,
    );
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await ctx.close();
    const s = [...r.deltas].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
    return { frames: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +Math.max(...s).toFixed(1), props: r.props };
  };
  const sleep = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));`;
  const cases: [string, string, string, string][] = [
    ["a reel paging", "&app=facebook&fb=reels", ".reel[data-live]", `${sleep} const l = document.querySelector(".list"); const H = l.clientHeight; for (const k of [1, 2, 3]) { l.scrollTo({ top: k * H, behavior: "smooth" }); await sleep(900); }`],
    ["a story sliding to the next person", "&app=facebook&fb=story:s-maya", ".story .kb", `${sleep} const b = document.querySelector(".half.right"); for (let k = 0; k < 4; k++) { b.click(); await sleep(k < 2 ? 300 : 1000); }`],
  ];
  for (const [label, query, wait, act] of cases) {
    const f = await run(query, wait, act);
    console.log(`   frames, ${label}, 4x CPU [${e.name}]: ${f.frames} frames, p50 ${f.p50} ms, p95 ${f.p95} ms, max ${f.max} ms; animating ${f.props.sort().join(", ")}`);
    if (f.max > 34) fail(`[${e.name}] ${label}: worst frame ${f.max} ms is over 34 ms`);
    const bad = f.props.filter((p) => !["transform", "opacity"].includes(p));
    if (bad.length) fail(`[${e.name}] ${label}: animates ${bad.join(", ")}, only transform and opacity may move`);
  }
}

for (const e of ENGINES.filter((x) => !arg("--engine") || x.name === arg("--engine"))) {
  const browser = await e.type.launch();
  // 1. push and pop: must pass on the new behaviour, and fail on the old fade.
  {
    const { ctx, page } = await fresh(e, browser);
    const bad = await pushChecks(e, page, "new", true);
    await ctx.close();
    if (bad.length) bad.forEach((b) => fail(`[${e.name}] push/pop: ${b}`));
    else console.log(`ok [${e.name}] push and pop: slide over a parallax page, token duration and easing, no fade-only animation`);
    const old = await fresh(e, browser, "light", OLD_FADE);
    const oldBad = await pushChecks(e, old.page, "old", false);
    await old.ctx.close();
    if (!oldBad.length) fail(`[${e.name}] self-test: push checks still pass on the old 200 ms fade`);
    else console.log(`   self-test: the old fade fails (${oldBad.slice(0, 2).join("; ").slice(0, 150)})`);
  }
  // 2. the interactive back and the sheet drag
  {
    const { ctx, page } = await fresh(e, browser);
    const bad = await dragChecks(e, page);
    await ctx.close();
    if (bad.length) bad.forEach((b) => fail(`[${e.name}] swipe back: ${b}`));
    else console.log(`ok [${e.name}] swipe back follows the finger with parallax, completes by distance or flick, cancels with a spring`);
    // seen failing: with the edge zone removed nothing follows
    const sab = await fresh(e, browser, "light", ".edge{display:none!important}");
    const sbad = await dragChecks(e, sab.page).catch((x) => [`threw ${String(x).slice(0, 40)}`]);
    await sab.ctx.close();
    if (!sbad.length) fail(`[${e.name}] self-test: swipe checks pass without an edge zone`);
    else console.log(`   self-test: no edge zone fails (${sbad[0]!.slice(0, 80)})`);
  }
  {
    const { ctx, page } = await fresh(e, browser);
    const bad = await sheetChecks(page);
    await ctx.close();
    if (bad.length) bad.forEach((b) => fail(`[${e.name}] sheet: ${b}`));
    else console.log(`ok [${e.name}] sheet follows the finger, rubber-bands upward, dismisses by distance or flick, springs back`);
    const sab = await fresh(e, browser, "light", "[data-sheet] > .panel{touch-action:auto!important;pointer-events:auto!important} .handle{pointer-events:none!important}");
    await sab.page.evaluate(() => document.addEventListener("pointerdown", (ev) => ev.stopImmediatePropagation(), true));
    const sbad = await sheetChecks(sab.page).catch((x) => [`threw ${String(x).slice(0, 40)}`]);
    await sab.ctx.close();
    if (!sbad.length) fail(`[${e.name}] self-test: sheet checks pass with dragging disabled`);
    else console.log(`   self-test: dragging disabled fails (${sbad[0]!.slice(0, 80)})`);
  }
  {
    const { ctx, page } = await fresh(e, browser);
    const bad = await bubbleChecks(page);
    await ctx.close();
    if (bad.length) bad.forEach((b) => fail(`[${e.name}] bubbles: ${b}`));
    else console.log(`ok [${e.name}] send ${EXPECT.send} ms with no fade, menu in ${EXPECT.menuIn} ms, menu out ${EXPECT.menuOut} ms`);
    const sab = await fresh(e, browser, "light", "[data-reaction-menu] .bar{animation-duration:700ms!important} .row.out .stack.fresh{animation-duration:900ms!important}");
    const sbad = await bubbleChecks(sab.page).catch((x) => [`threw ${String(x).slice(0, 40)}`]);
    await sab.ctx.close();
    if (!sbad.length) fail(`[${e.name}] self-test: bubble checks pass with the wrong durations`);
    else console.log(`   self-test: wrong durations fail (${sbad[0]!.slice(0, 80)})`);
  }
  {
    const { ctx, page } = await fresh(e, browser);
    const bad = await tapDuringPush(page);
    await ctx.close();
    if (bad.length) bad.forEach((b) => fail(`[${e.name}] tap during push: ${b}`));
    else console.log(`ok [${e.name}] a Muse option tapped 50 ms into the push makes its card, which finishes`);
    const sab = await fresh(e, browser, "light");
    await sab.page.evaluate(() => { HTMLElement.prototype.click = () => {}; }); // the tap is lost
    const sbad = await tapDuringPush(sab.page).catch((x) => [`threw ${String(x).slice(0, 40)}`]);
    await sab.ctx.close();
    if (!sbad.length) fail(`[${e.name}] self-test: the tap check passes when the tap is lost`);
    else console.log(`   self-test: a lost tap fails (${sbad[0]!.slice(0, 60)})`);
  }
  // 3. frames during a push at 4x throttle
  {
    const { ctx, page } = await fresh(e, browser);
    const f = await frameTimes(e, page);
    await ctx.close();
    if (f) {
      console.log(`   frames during a push at 4x CPU [${e.name}]: ${f.frames} frames, p50 ${f.p50} ms, p95 ${f.p95} ms, max ${f.max} ms; tap to first motion ${f.tapToMotion} ms`);
      if (f.p95 > 20) fail(`[${e.name}] frames during a push: p95 ${f.p95} ms is over the 20 ms budget`);
      if (f.max > 40) fail(`[${e.name}] frames during a push: worst frame ${f.max} ms is over 40 ms`);
    }
  }
  await mediaFrames(e, browser); // stories and reels
  if (filmDir && e.name === "chromium") {
    mkdirSync(filmDir, { recursive: true });
    for (const [n, css, w] of [["push-before", OLD_FADE, "push"], ["push-after", "", "push"], ["sheet-after", "", "sheet"]] as const) console.log("film", await film(e, browser, n, css, w));
  }
  await browser.close();
}

await server.close();
void writeFileSync;
if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nmotion checks passed");
