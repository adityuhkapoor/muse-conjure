/**
 * bun run check:phone: how the shell behaves like an installed app, in headless Chromium (Pixel 7 profile) and
 * headless WebKit (iPhone 15 Pro profile). Each check is also run against a sabotaged page and must fail there
 * (`--no-self-test` skips that). `--shots <dir>` writes phone screenshots with simulated insets, light and dark.
 * Nothing opens a window; the server is closed on exit.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, webkit, type BrowserContext, type BrowserType, type Page } from "playwright";
import { buildApp, serve } from "./lib.ts";

const shotsDir = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1]! : null;
const selfTest = !process.argv.includes("--no-self-test");
const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : "");
const only = arg("--only"); // substring of a check name
const engine = arg("--engine"); // chromium or webkit
const axeSrc = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

await buildApp();
const server = await serve();
const failures: string[] = [];
let ran = 0;

type Profile = { name: string; type: BrowserType; device: string };
const PROFILES: Profile[] = [
  { name: "chromium/Pixel 7", type: chromium, device: "Pixel 7" },
  { name: "webkit/iPhone 15 Pro", type: webkit, device: "iPhone 15 Pro" },
];

type Opts = { theme?: "light" | "dark"; standalone?: boolean; query?: string };
type Prep = (p: Page) => Promise<void>;

async function open(p: Profile, browser: Awaited<ReturnType<BrowserType["launch"]>>, o: Opts = {}): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({ ...devices[p.device], colorScheme: o.theme ?? "light" });
  if (o.standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(`[${p.name}] page error: ${e.message}`));
  await page.goto(`${server.url}?safe=1&theme=${o.theme ?? "light"}${o.query ?? ""}`);
  await page.waitForSelector("button.row", { timeout: 8000 }).catch(async () => {
    await page.reload(); // a loaded machine sometimes loses the first load
    await page.waitForSelector("button.row");
  });
  await page.waitForTimeout(200);
  return [ctx, page];
}
const openRow = async (page: Page, name: string) => {
  await page.locator("button.row", { hasText: name }).first().click();
  await page.waitForTimeout(700);
};
const css = (page: Page, text: string) => page.addStyleTag({ content: text });

// ---------------------------------------------------------------------------------------------------------
// Checks: return a list of problems. `sabotage` makes the same check fail, proving it can.
type Check = { name: string; opts?: Opts; selfOpts?: Opts; run: (page: Page, p: Profile) => Promise<string[]>; sabotage: Prep };

const checks: Check[] = [
  {
    name: "manifest, icons and meta tags",
    async run(page) {
      const bad: string[] = [];
      const m = await page.evaluate(async () => {
        const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
        if (!href) return null;
        const res = await fetch(href);
        return { type: res.headers.get("content-type"), json: await res.json(), base: href };
      });
      if (!m) return ["no manifest link"];
      const j = m.json as Record<string, any>;
      if (j.name !== "Messenger prototype") bad.push(`name is ${j.name}`);
      if (j.display !== "standalone") bad.push(`display is ${j.display}`);
      if (j.orientation !== "portrait") bad.push(`orientation is ${j.orientation}`);
      for (const k of ["theme_color", "background_color", "start_url", "scope", "id", "short_name"]) if (!j[k]) bad.push(`missing ${k}`);
      if (!j.color_scheme_dark?.theme_color || !j.color_scheme_dark?.background_color) bad.push("no dark colors");
      const icons = (j.icons ?? []) as { src: string; sizes: string; purpose?: string; type: string }[];
      for (const need of [{ s: "192x192", p: "any" }, { s: "512x512", p: "any" }, { s: "192x192", p: "maskable" }, { s: "512x512", p: "maskable" }]) {
        if (!icons.some((i) => i.sizes === need.s && (i.purpose ?? "any") === need.p)) bad.push(`missing ${need.p} icon ${need.s}`);
      }
      if (/meta|facebook/i.test(JSON.stringify(j.name) + JSON.stringify(j.short_name))) bad.push("name mentions a brand");
      for (const i of icons) {
        const r = await page.evaluate(
          async ([src, base]) => {
            const res = await fetch(new URL(src!, base!));
            if (!res.ok) return { ok: false, w: 0, h: 0, type: "" };
            const type = res.headers.get("content-type") ?? "";
            if (!type.startsWith("image/png")) return { ok: true, w: -1, h: -1, type };
            const bmp = await createImageBitmap(await res.blob());
            return { ok: true, w: bmp.width, h: bmp.height, type };
          },
          [i.src, m.base],
        );
        if (!r.ok) bad.push(`icon ${i.src} not served`);
        else if (r.w > 0 && `${r.w}x${r.h}` !== i.sizes) bad.push(`icon ${i.src} is ${r.w}x${r.h}, manifest says ${i.sizes}`);
        else if (r.type === "text/html") bad.push(`icon ${i.src} served as html`);
      }
      if (!/manifest/.test(m.type ?? "") && !/json/.test(m.type ?? "")) bad.push(`manifest content type ${m.type}`);
      const meta = await page.evaluate(() => ({
        vp: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
        capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
        status: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content"),
        touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
        light: document.querySelector('meta[name="theme-color"][media*="light"]')?.getAttribute("content"),
        dark: document.querySelector('meta[name="theme-color"][media*="dark"]')?.getAttribute("content"),
        launch: document.querySelectorAll('link[rel="apple-touch-startup-image"]').length,
      }));
      if (!/viewport-fit=cover/.test(meta.vp)) bad.push("viewport-fit=cover missing");
      if (/maximum-scale|user-scalable/.test(meta.vp)) bad.push("viewport blocks the system zoom setting");
      if (meta.capable !== "yes") bad.push("apple-mobile-web-app-capable missing");
      if (!meta.status) bad.push("status bar style missing");
      if (!meta.touch) bad.push("apple touch icon missing");
      if (!meta.light || !meta.dark) bad.push("theme-color for light or dark missing");
      if (meta.launch < 10) bad.push(`only ${meta.launch} launch images`);
      return bad;
    },
    // The manifest comes back as a page that is not json.
    sabotage: async (page) => {
      await page.route("**/manifest.webmanifest", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Messenger prototype", display: "browser", icons: [] }) }));
    },
  },
  {
    name: "standalone mode",
    opts: { standalone: true },
    async run(page, p) {
      const bad: string[] = [];
      const s = await page.evaluate(() => ({ phone: document.documentElement.dataset.phone, standalone: document.documentElement.dataset.standalone, sel: getComputedStyle(document.body).userSelect, bg: getComputedStyle(document.documentElement).backgroundColor }));
      if (s.phone !== "1") bad.push("html[data-phone] not set");
      if (s.standalone !== "1") bad.push("html[data-standalone] not set in standalone");
      if (s.sel !== "none") bad.push(`body user-select is ${s.sel}`);
      if (s.bg !== "rgb(255, 255, 255)") bad.push(`launch background is ${s.bg}`);
      await openRow(page, "apt 4b");
      if (p.name.startsWith("webkit") && (await page.locator(".edge").count()) !== 1) bad.push("edge swipe zone missing when installed on iOS");
      return bad;
    },
    sabotage: async (page) => {
      await page.evaluate(() => {
        delete document.documentElement.dataset.standalone;
        document.querySelector(".edge")?.remove();
      });
    },
  },
  {
    name: "iOS browser tab leaves the browser's back swipe alone",
    async run(page, p) {
      if (!p.name.startsWith("webkit")) return [];
      await openRow(page, "apt 4b");
      return (await page.locator(".edge").count()) === 0 ? [] : ["edge zone present in a Safari tab"];
    },
    sabotage: async () => {},
    selfOpts: { standalone: true }, // installed on iOS the zone is there, so the same check must complain
  },
  {
    name: "no document scroll on any screen",
    async run(page) {
      const bad: string[] = [];
      const probe = async (label: string) => {
        const r = await page.evaluate(() => {
          window.scrollTo(0, 120);
          document.scrollingElement!.scrollTop = 120;
          const de = document.documentElement;
          return { top: Math.max(window.scrollY, de.scrollTop, document.body.scrollTop), over: de.scrollHeight - innerHeight, vv: visualViewport!.offsetTop, w: de.scrollWidth - innerWidth };
        });
        if (r.top !== 0 || r.over > 0 || r.vv !== 0 || r.w > 0) bad.push(`${label}: scrolls (top ${r.top}, over ${r.over}, vv ${r.vv}, wide ${r.w})`);
      };
      await probe("inbox");
      await openRow(page, "apt 4b");
      await probe("thread");
      await page.getByRole("button", { name: "2 tools in this chat" }).click().catch(() => {});
      await page.waitForTimeout(400);
      await probe("sheet");
      await page.keyboard.press("Escape");
      await page.goBack();
      await page.waitForTimeout(600);
      await page.goto(page.url().split("?")[0] + "?safe=1&screen=search");
      await page.waitForTimeout(400);
      await probe("search");
      await page.goto(page.url().split("?")[0] + "?safe=1&event=juniper");
      await page.waitForTimeout(400);
      await probe("event");
      return bad;
    },
    sabotage: async (page) => {
      await css(page, "html,body{overflow:auto!important;height:auto!important} #app{position:static!important;height:3000px!important}");
    },
  },
  {
    name: "composer sits on the keyboard",
    async run(page) {
      const bad: string[] = [];
      await openRow(page, "apt 4b");
      const H = await page.evaluate(() => innerHeight);
      await page.getByRole("textbox", { name: "Message" }).focus();
      const state = (kb: number, top: number) =>
        page.evaluate(
          async ([kb, top]) => {
            const vv = visualViewport!;
            Object.defineProperty(vv, "height", { configurable: true, get: () => innerHeight - kb! });
            Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top! });
            vv.dispatchEvent(new Event("resize"));
            if (top) vv.dispatchEvent(new Event("scroll"));
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const c = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .dock')!.getBoundingClientRect();
            const list = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!;
            return { bottom: c.bottom, top: c.top, gap: list.scrollHeight - list.scrollTop - list.clientHeight, vvBottom: vv.height + vv.offsetTop, kb: document.documentElement.dataset.kb };
          },
          [kb, top] as [number, number],
        );
      const list0 = await page.evaluate(() => { const l = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!; l.scrollTop = l.scrollHeight; return 0; });
      void list0;
      const a = await state(300, 0);
      if (a.kb !== "1") bad.push("keyboard not detected");
      if (Math.abs(a.bottom - a.vvBottom) > 1) bad.push(`composer bottom ${a.bottom} vs keyboard top ${a.vvBottom} (gap ${Math.round(a.vvBottom - a.bottom)})`);
      if (a.gap > 2) bad.push(`list not pinned to bottom, ${Math.round(a.gap)} from it`);
      const b = await state(300, 40); // iOS pans the visual viewport
      if (Math.abs(b.bottom - b.vvBottom) > 1) bad.push(`panned: composer bottom ${b.bottom} vs ${b.vvBottom}`);
      const c = await state(0, 0);
      if (c.kb) bad.push("keyboard state not cleared");
      if (Math.abs(c.bottom - H) > 1) bad.push(`after closing, composer bottom ${c.bottom} vs ${H}`);
      return bad;
    },
    sabotage: async (page) => {
      await css(page, 'html[data-kb="1"] #app{inset:0!important;height:auto!important;transform:none!important}');
    },
  },
  {
    name: "safe-area padding on every screen and sheet",
    async run(page) {
      const bad: string[] = [];
      const scan = (label: string) =>
        page.evaluate((label) => {
          const H = innerHeight;
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("button, h1, h2, input, textarea, [role=tab], a[href]")) {
            if (el.closest(".proto, [inert], .turn, .toast") || el.hasAttribute("inert")) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            // Rows inside a scrolling list pass under the insets on purpose; sheets do not scroll that far.
            let inList = false;
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
              const oy = getComputedStyle(n).overflowY;
              if ((oy === "auto" || oy === "scroll") && !n.matches(".panel")) inList = true;
            }
            if (inList) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.opacity === "0") continue;
            if (r.top < 59 && r.bottom > 0) out.push(`${label}: <${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 16)}> top ${Math.round(r.top)} inside the 59 point top inset`);
            if (r.bottom > H - 34 && r.top < H) out.push(`${label}: <${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 16)}> bottom ${Math.round(r.bottom)} inside the 34 point bottom inset`);
          }
          return out.slice(0, 3);
        }, label);
      bad.push(...(await scan("inbox")));
      await openRow(page, "apt 4b");
      bad.push(...(await scan("thread")));
      await page.getByRole("button", { name: "2 tools in this chat" }).click();
      await page.waitForTimeout(500);
      bad.push(...(await scan("sheet")));
      await page.keyboard.press("Escape");
      await page.goto(page.url().split("?")[0] + "?safe=1&screen=search");
      await page.waitForTimeout(500);
      bad.push(...(await scan("search")));
      await page.goto(page.url().split("?")[0] + "?safe=1&event=juniper");
      await page.waitForTimeout(500);
      bad.push(...(await scan("event")));
      return bad;
    },
    sabotage: async (page) => {
      await css(page, "html{--safe-top:0px!important;--safe-bottom:0px!important}");
    },
  },
  {
    name: "swipe back completes, cancels, and ignores vertical drags",
    opts: { standalone: true },
    async run(page) {
      const bad: string[] = [];
      const left = () => page.evaluate(() => { const l = [...document.querySelectorAll<HTMLElement>(".push")].at(-1); return l ? Math.round(l.getBoundingClientRect().left) : Infinity; });
      const drag = async (to: number, end: "up" | "cancel", dy = 0) => {
        await page.mouse.move(4, 400);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(4 + ((to - 4) * i) / 8, 400 + (dy * i) / 8);
        await page.waitForTimeout(80);
        const mid = await left();
        if (end === "up") await page.mouse.up();
        else await page.evaluate(() => document.querySelector(".edge")!.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));
        return mid;
      };
      await openRow(page, "apt 4b");
      const mid = await drag(150, "cancel");
      if (Math.abs(mid - 146) > 12) bad.push(`page is at ${mid} while the finger is at 150 (should follow)`);
      await page.mouse.up().catch(() => {});
      await page.waitForTimeout(700);
      if ((await left()) !== 0) bad.push(`cancelled swipe did not settle back (left ${await left()})`);
      await drag(30, "up", 300); // mostly vertical: ignored
      await page.waitForTimeout(700);
      if ((await left()) !== 0) bad.push("a vertical drag from the edge went back");
      await drag(300, "up");
      await page.waitForTimeout(900);
      if ((await left()) !== Infinity) bad.push("swipe past a third did not go back");
      return bad;
    },
    // A cancelled touch that is handled like a release past the threshold would go back; make the edge do that.
    sabotage: async (page) => {
      await css(page, ".edge{pointer-events:none!important}");
    },
  },
  {
    name: "long-press opens reactions with no text selection",
    async run(page, p) {
      const bad: string[] = [];
      await openRow(page, "apt 4b");
      await page.evaluate(() => { (window as any).__buzz = 0; navigator.vibrate = () => (((window as any).__buzz += 1), true); });
      const r = await page.evaluate(async () => {
        const b = document.querySelector<HTMLElement>(".page:not([inert]) .bubble")!;
        const box = b.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: x, clientY: y }));
        await new Promise((s) => setTimeout(s, 600));
        const menu = !!document.querySelector("[data-reaction-menu]");
        b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: x, clientY: y }));
        const sel = getSelection()?.toString() ?? "";
        const st = getComputedStyle(b);
        const callout = (st as any).webkitTouchCallout ?? st.getPropertyValue("-webkit-touch-callout");
        return { menu, sel, us: st.userSelect || st.getPropertyValue("-webkit-user-select"), callout, buzz: (window as any).__buzz as number };
      });
      if (!r.menu) bad.push("reaction menu did not open after 600 ms");
      if (r.sel) bad.push(`text got selected: "${r.sel}"`);
      if (r.us !== "none") bad.push(`bubble user-select is ${r.us}`);
      const android = p.name.startsWith("chromium");
      if (android && r.buzz !== 1) bad.push(`vibrate called ${r.buzz} times on Android`);
      if (!android && r.buzz !== 0) bad.push("vibrate called on iPhone");
      return bad;
    },
    sabotage: async (page) => {
      await css(page, "*{user-select:text!important;-webkit-user-select:text!important}");
    },
  },
  {
    name: "pressed state on tappable things",
    async run(page) {
      const bad: string[] = [];
      const r = await page.evaluate(async () => {
        const row = document.querySelector<HTMLElement>("button.row")!;
        const before = getComputedStyle(row).boxShadow;
        row.setAttribute("data-force", "1");
        return { before, hasRule: [...document.styleSheets].some((s) => [...s.cssRules].some((c) => c.cssText.includes(":active") && c.cssText.includes("box-shadow") && c.cssText.includes("inset"))) };
      });
      if (!r.hasRule) bad.push("no pressed rule in the stylesheet");
      const box = await page.locator("button.row").first().boundingBox();
      await page.mouse.move(box!.x + 40, box!.y + 20);
      await page.mouse.down();
      await page.waitForTimeout(160);
      const pressed = await page.evaluate(() => getComputedStyle(document.querySelector("button.row:active")!).boxShadow);
      await page.mouse.up();
      if (!/inset/.test(pressed) || pressed === "none") bad.push(`pressed row has box-shadow ${pressed}`);
      return bad;
    },
    sabotage: async (page) => {
      await css(page, "button.row:active{box-shadow:none!important}");
    },
  },
  {
    name: "scroll-to-bottom button appears for new messages while scrolled up",
    async run(page) {
      const bad: string[] = [];
      await page.setViewportSize({ width: 393, height: 520 }); // short screen so the list has room to scroll up
      await openRow(page, "senior week");
      await page.evaluate(() => { document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!.scrollTop = 0; });
      await page.waitForTimeout(200);
      const has = (await page.locator(".jump").count()) > 0;
      if (has) bad.push("button shown with nothing new");
      // Asking Muse by name makes a message from someone else about half a second later; scroll up before it lands.
      const box = page.getByRole("textbox", { name: "Message" });
      await box.fill("muse pick for us");
      await box.press("Enter");
      await page.waitForTimeout(120);
      await page.evaluate(() => { document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!.scrollTop = 0; });
      await page.waitForTimeout(1200);
      if ((await page.locator(".jump").count()) !== 1) bad.push("no jump button after a message arrived while scrolled up");
      else {
        await page.locator(".jump").click();
        await page.waitForTimeout(800);
        const gap = await page.evaluate(() => { const l = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!; return l.scrollHeight - l.scrollTop - l.clientHeight; });
        if (gap > 4) bad.push(`jump left the list ${gap} from the bottom`);
        if ((await page.locator(".jump").count()) !== 0) bad.push("button stays after jumping");
      }
      return bad;
    },
    sabotage: async (page) => {
      await css(page, ".jump{display:none!important}");
    },
  },
  {
    name: "Add to Home Screen hint: tab only, once",
    async run(page, p) {
      const bad: string[] = [];
      await page.waitForTimeout(6600);
      if ((await page.locator("aside.toast").count()) !== 1) bad.push("hint not shown in a browser tab");
      await page.getByRole("button", { name: "Close" }).click();
      await page.reload();
      await page.waitForSelector("button.row");
      await page.waitForTimeout(6600);
      if ((await page.locator("aside.toast").count()) !== 0) bad.push("hint came back after being closed");
      const [ctx, installed] = await open(p, page.context().browser()!, { standalone: true });
      await installed.waitForTimeout(6600);
      if ((await installed.locator("aside.toast").count()) !== 0) bad.push("hint shown when already installed");
      await ctx.close();
      return bad;
    },
    sabotage: async (page) => {
      await page.evaluate(() => localStorage.clear());
      await page.addInitScript(() => localStorage.clear());
    },
  },
  {
    name: "reload restores the open chat and scroll position",
    async run(page) {
      const bad: string[] = [];
      await openRow(page, "senior week");
      const want = await page.evaluate(() => { const l = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list')!; l.scrollTop = Math.max(0, l.scrollHeight - l.clientHeight - 200); return l.scrollHeight - l.scrollTop - l.clientHeight; });
      await page.waitForTimeout(200);
      await page.evaluate(() => dispatchEvent(new Event("pagehide")));
      await page.goto(page.url().split("?")[0] + "?safe=1");
      await page.waitForSelector(".thread", { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(900);
      const got = await page.evaluate(() => { const l = document.querySelector<HTMLElement>('[data-route="chat"]:not([inert]) .list'); return l ? l.scrollHeight - l.scrollTop - l.clientHeight : -1; });
      if (got < 0) bad.push("chat not reopened");
      else if (Math.abs(got - want) > 6) bad.push(`scroll is ${got} from the bottom, was ${want}`);
      return bad;
    },
    sabotage: async (page) => {
      await page.addInitScript(() => sessionStorage.clear());
      await page.evaluate(() => sessionStorage.clear());
      await page.route("**/*", (r) => r.continue());
      await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "phone.session") return; return o.call(this, k, v); }; });
    },
  },
  {
    name: "landscape on a phone shows a message",
    async run(page) {
      const bad: string[] = [];
      await page.setViewportSize({ width: 852, height: 393 });
      await page.waitForTimeout(200);
      const shown = await page.evaluate(() => { const t = document.querySelector<HTMLElement>(".turn"); return !!t && getComputedStyle(t).display !== "none" && t.getBoundingClientRect().width > 800; });
      if (!shown) bad.push("no message in landscape");
      return bad;
    },
    sabotage: async (page) => {
      await css(page, ".turn{display:none!important}");
    },
  },
];

// axe on the phone states, both themes
async function axeAll(p: Profile, browser: Awaited<ReturnType<BrowserType["launch"]>>, theme: "light" | "dark", sabotage = false): Promise<string[]> {
  const bad: string[] = [];
  const [ctx, page] = await open(p, browser, { theme });
  const run = async (label: string) => {
    if (sabotage) await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<button></button>"));
    await page.addScriptTag({ path: axeSrc });
    const v = await page.evaluate(async () => {
      // @ts-expect-error injected
      const r = await window.axe.run(document, { resultTypes: ["violations"] });
      return r.violations.map((x: any) => ({ id: x.id, nodes: x.nodes.filter((n: any) => !(x.id === "color-contrast" && String(n.any[0]?.data?.fgColor).toLowerCase() === "#ffffff" && String(n.any[0]?.data?.bgColor).toLowerCase() === "#006fff")).map((n: any) => n.target.join(" ")) }));
    });
    for (const x of v) if (x.nodes.length) bad.push(`axe ${theme} ${label}: ${x.id} ${x.nodes.slice(0, 2).join(" | ")}`);
  };
  await run("inbox");
  await openRow(page, "apt 4b");
  await run("thread");
  await page.getByRole("button", { name: "2 tools in this chat" }).click();
  await page.waitForTimeout(400);
  await run("sheet");
  await page.keyboard.press("Escape");
  await page.goto(page.url().split("?")[0] + `?safe=1&theme=${theme}&screen=search`);
  await page.waitForTimeout(400);
  await run("search");
  await page.goto(page.url().split("?")[0] + `?safe=1&theme=${theme}&phone=1`);
  await page.waitForTimeout(6800);
  await run("inbox with the home screen hint");
  await ctx.close();
  return bad;
}

async function shots(p: Profile, browser: Awaited<ReturnType<BrowserType["launch"]>>, dir: string) {
  mkdirSync(dir, { recursive: true });
  const tag = p.name.split("/")[0];
  for (const theme of ["light", "dark"] as const) {
    const [ctx, page] = await open(p, browser, { theme, standalone: true });
    await page.screenshot({ path: join(dir, `${tag}-inbox-${theme}.png`) });
    await openRow(page, "apt 4b");
    await page.screenshot({ path: join(dir, `${tag}-thread-${theme}.png`) });
    await page.getByRole("button", { name: "2 tools in this chat" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(dir, `${tag}-sheet-${theme}.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Message" }).focus();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => innerHeight - 300 });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(dir, `${tag}-keyboard-${theme}.png`) });
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------------------
for (const p of PROFILES) {
  if (engine && !p.name.startsWith(engine)) continue;
  const browser = await p.type.launch();
  for (const c of checks) {
    if (only && !c.name.includes(only)) continue;
    if (c.name.startsWith("iOS browser tab") && !p.name.startsWith("webkit")) continue;
    const [ctx, page] = await open(p, browser, c.opts);
    const bad = await c.run(page, p);
    await ctx.close();
    ran++;
    if (bad.length) failures.push(...bad.map((b) => `[${p.name}] ${c.name}: ${b}`));
    else console.log(`ok [${p.name}] ${c.name}`);

    if (selfTest && !(c.name.startsWith("iOS browser tab") && !p.name.startsWith("webkit"))) {
      const [ctx2, page2] = await open(p, browser, c.selfOpts ?? c.opts);
      await c.sabotage(page2);
      const sabotaged = await c.run(page2, p).catch((e) => [`threw: ${e}`]);
      await ctx2.close();
      if (!sabotaged.length) failures.push(`[${p.name}] self-test: "${c.name}" still passes when sabotaged`);
      else console.log(`   self-test: "${c.name}" fails when sabotaged (${sabotaged[0]!.slice(0, 70)})`);
    }
  }
  for (const theme of only ? [] : (["light", "dark"] as const)) {
    const bad = await axeAll(p, browser, theme);
    ran++;
    if (bad.length) failures.push(...bad.map((b) => `[${p.name}] ${b}`));
    else console.log(`ok [${p.name}] axe clean, ${theme}`);
  }
  if (selfTest && !only) {
    const sab = await axeAll(p, browser, "light", true);
    if (!sab.length) failures.push(`[${p.name}] self-test: axe did not flag an unlabelled button`);
    else console.log(`   self-test: axe flags an unlabelled button (${sab[0]!.slice(0, 60)})`);
  }
  if (shotsDir) await shots(p, browser, shotsDir);
  await browser.close();
}

await server.close();
if (shotsDir) console.log(`screenshots in ${shotsDir}`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nphone checks passed (${ran} checks, two engines)`);
