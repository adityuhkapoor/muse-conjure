// Helpers for driving the live shell in headless Chrome: phones as browser contexts, the thread
// composer, tool frames (cross-origin, reached through Playwright's frame API), and timing.

import type { Browser, BrowserContext, Frame, Page } from "playwright";

export const PHONE = { width: 393, height: 852 };

export type Phone = { ctx: BrowserContext; page: Page; as: string };

export async function phone(browser: Browser, url: string, as: string, query = "", theme: "light" | "dark" = "light"): Promise<Phone> {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${as}] page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket/.test(m.text()) && console.log(`  [${as}] console: ${m.text()}`));
  await page.goto(`${url}?as=${as}&safe=1${query}`);
  await page.waitForSelector(query.includes("event=") ? 'section[aria-label="Event"]' : query.includes("chat=") ? ".page.push .thread" : ".inbox", { timeout: 15_000 });
  return { ctx, page, as };
}

/** The thread on top of the stack. */
export const thread = (p: Page) => p.locator(".page.push.shown .thread").last();

export async function send(p: Page, text: string) {
  const box = thread(p).locator("textarea");
  await box.fill(text);
  await box.press("Enter");
}

/** Resolves with ms (page clock) when `fn` holds in the page; polls on animation frames. */
export async function until(p: Page, fn: string, ms = 10_000): Promise<number> {
  const h = await p.waitForFunction(`(${fn}) ? Date.now() : false`, null, { timeout: ms, polling: "raf" });
  return (await h.jsonValue()) as number;
}

/** The tool card for a tool message (by its tool id) or the last card in the thread. */
export const card = (p: Page, toolId?: string) => (toolId ? thread(p).locator(`[data-muse-card][data-tool-id="${toolId}"]`) : thread(p).locator("[data-muse-card]").last());

/** The frame of a mounted tool. */
export async function toolFrame(p: Page, toolId: string, ms = 10_000): Promise<Frame> {
  const deadline = Date.now() + ms;
  for (;;) {
    const f = await findFrame(p, toolId);
    if (f) {
      await f.waitForSelector(".m-root > *", { timeout: Math.max(1000, deadline - Date.now()) });
      return f;
    }
    if (Date.now() > deadline) throw new Error(`no frame for tool ${toolId}`);
    await p.waitForTimeout(100);
  }
}

/** In the card (Chrome moves frames into the slot), or laid over it from the layer (Safari). */
async function findFrame(p: Page, toolId: string): Promise<Frame | null> {
  const inCard = card(p, toolId).locator("iframe");
  if (await inCard.count()) return (await (await inCard.first().elementHandle())!.contentFrame()) ?? null;
  const box = await card(p, toolId).boundingBox();
  if (!box) return null;
  for (const f of p.frames()) {
    if (f === p.mainFrame()) continue;
    const r = await (await f.frameElement()).boundingBox();
    if (r && r.height > 2 && Math.abs(r.x - box.x) < 4 && r.y >= box.y - 4 && r.y < box.y + box.height) return f;
  }
  return null;
}

/** Text the app shows (inside its frame), whitespace folded. */
export const frameText = async (f: Frame) => ((await f.evaluate(() => document.querySelector(".m-root")?.textContent ?? "")) as string).replace(/\s+/g, " ").trim();

export type Check = { name: string; ok: boolean; detail?: string };

export class Report {
  checks: Check[] = [];
  timings: Record<string, number[]> = {};
  check(name: string, ok: boolean, detail = "") {
    this.checks.push({ name, ok, detail });
    console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  }
  async step(name: string, fn: () => Promise<string | void>) {
    try {
      const d = await fn();
      this.check(name, true, d ?? "");
    } catch (e) {
      this.check(name, false, (e as Error).message.split("\n")[0]!.slice(0, 300));
    }
  }
  time(name: string, ms: number) {
    (this.timings[name] ??= []).push(Math.round(ms));
  }
  get failed() {
    return this.checks.filter((c) => !c.ok);
  }
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN;
};

/**
 * What a tool frame can reach, with the same probes as packages/sandbox/test: fetch and import of
 * the shell's own origin, a socket, the parent document, cookies, storage and top navigation.
 * Every value should be "blocked", and the origin "null" (opaque).
 */
export async function reach(f: Frame, origin: string): Promise<Record<string, string>> {
  return (await f.evaluate(async (o) => {
    const out: Record<string, string> = {};
    const settle = (p: Promise<unknown>, k: string) => p.then(() => (out[k] = "allowed"), () => (out[k] = "blocked"));
    await Promise.all([
      settle(fetch(o + "/health"), "fetch"),
      settle(import(o + "/health" as string), "import"),
      new Promise<void>((res) => {
        try {
          const ws = new WebSocket(o.replace(/^http/, "ws") + "/ws");
          ws.onopen = () => ((out.ws = "allowed"), res());
          ws.onerror = () => ((out.ws = "blocked"), res());
        } catch {
          out.ws = "blocked";
          res();
        }
      }),
    ]);
    try { out.parent = String((parent as any).document.title); } catch { out.parent = "blocked"; }
    try { out.cookie = "readable:" + document.cookie; } catch { out.cookie = "blocked"; }
    try { localStorage.setItem("x", "1"); out.storage = "allowed"; } catch { out.storage = "blocked"; }
    try { (top as any).location.href = "about:blank"; out.navigate = "allowed"; } catch { out.navigate = "blocked"; }
    out.origin = String(self.origin);
    return out;
  }, origin)) as Record<string, string>;
}
