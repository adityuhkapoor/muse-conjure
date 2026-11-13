// Headless browser: host and frame on two origins, the in-page Sequencer as the server. Mounts
// each sample, plays other people through the server, checks the DOM, reconnect, members, the
// opt-in clock, the positioned-layer path, and that the frame cannot reach out.
// ENGINE=webkit runs the same file in Playwright's WebKit (headless).
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, Frame, Page } from "playwright";
import { compileApp } from "../src/compile.ts";
import { launch, openHost, startServers, type Servers } from "../scripts/serve.ts";

const ENGINE = (process.env.ENGINE ?? "chromium") as "chromium" | "webkit";
let s: Servers, browser: Browser, page: Page;

beforeAll(async () => {
  s = await startServers();
  browser = await launch(ENGINE);
  page = await openHost(browser, s);
  await page.evaluate(() => (window as any).H.makePool(2));
}, 60_000);
afterAll(async () => {
  await browser?.close();
  s?.stop();
});

type Mounted = { id: number; room: string; t0: number; sized: number; placement: string };
const H = <T>(fn: string, ...args: unknown[]): Promise<T> => page.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const frameOf = async (m: Mounted): Promise<Frame> => (await (await page.$(`iframe[data-h="${m.id}"]`))!.contentFrame())!;
async function mount(name: string, opts: object = {}): Promise<{ m: Mounted; f: Frame }> {
  const m = await H<Mounted>("mount", s.apps[name]!.code, opts);
  expect(m.sized).toBeGreaterThan(0);
  // Wait for the frame to record the members, so other people's actions count.
  await page.waitForFunction((r) => (window as any).H.log(r).some((e: any) => e.action?.t === "@members"), m.room);
  return { m, f: await frameOf(m) };
}
const text = (f: Frame) => f.locator(".m-root").innerText();
const st = (m: Mounted) => H<{ errors: string[]; acts: unknown[]; summaries: string[]; height: string }>("state", m.id);
const log = (m: Mounted) => H<{ seq: number; user: string; action: any }[]>("log", m.room);

test("dinner poll: votes from Theo and Dani, then Maya taps", async () => {
  const { m, f } = await mount("dinner-poll");
  if (ENGINE === "chromium") expect(m.placement).toBe("moved");
  await f.waitForFunction(() => document.body.innerText.includes("Thai Basil"));
  await H("act", m.room, "theo", { t: "vote", option: "thai" });
  await H("act", m.room, "dani", { t: "vote", option: "thai" });
  await H("act", m.room, "dani", { t: "add", label: "Ramen" });
  await f.waitForFunction(() => document.body.innerText.includes("Ramen"));
  const thai = f.locator(".m-opt", { hasText: "Thai Basil" });
  expect(await thai.locator("em").innerText()).toBe("2");
  expect(await thai.getAttribute("aria-pressed")).toBe("false");
  expect(await text(f)).toContain("2 people voted");
  await thai.click();
  await f.waitForFunction(() => document.querySelector(".m-opt")?.getAttribute("aria-pressed") === "true");
  expect(await thai.locator("em").innerText()).toBe("3");
  await page.waitForFunction((r) => (window as any).H.log(r).some((e: any) => e.user === "maya" && e.action.t === "vote"), m.room);
  const l = await log(m);
  // The frame put the members in the log before anything else.
  expect(l[0]!.action.t).toBe("@members");
  expect((await st(m)).errors).toEqual([]);
  expect((await st(m)).summaries.at(-1)).toContain("Thai Basil leads with 3");
  expect(parseInt((await st(m)).height)).toBeLessThanOrEqual(420);
});

test("chore wheel: Theo spun earlier, Dani spins now; the seeded result lands, the clock turns off", async () => {
  const room = "a:wheel-backlog";
  // Theo's spin happened a minute ago, before Maya opened the app.
  await H("act", room, "theo", { t: "@members", members: [{ id: "maya", name: "Maya" }, { id: "theo", name: "Theo" }, { id: "dani", name: "Dani" }, { id: "priya", name: "Priya" }, { id: "sam", name: "Sam" }] }, 60_000);
  await H("act", room, "theo", { t: "spin" }, 60_000);
  const { m, f } = await mount("chore-wheel", { room });
  await f.waitForFunction(() => / got dishes/.test(document.body.innerText));
  expect(await H<number>("ticking")).toBe(0);
  await H("act", room, "dani", { t: "spin" });
  await f.waitForFunction(() => document.body.innerText.includes("Spinning"));
  expect(await H<number>("ticking")).toBe(1);
  await f.waitForFunction(() => document.body.innerText.includes("got trash"), undefined, { timeout: 6000 });
  const t = await text(f);
  expect(t).toContain("2 of 4 assigned");
  expect(t).toMatch(/Dishes · (Maya|Theo|Dani|Priya|Sam)/);
  expect((await st(m)).summaries.at(-1)).toMatch(/^Trash: \w+\. 2 of 4 spun\.$/);
  await page.waitForFunction(() => (window as any).H.ticking() === 0, undefined, { timeout: 2000 });
  const painted = await f.evaluate(() => {
    const c = document.querySelector("canvas")!;
    return c.getContext("2d")!.getImageData(c.width / 2, c.height / 4, 1, 1).data[3];
  });
  expect(painted).toBe(255);
});

test("bill split: Theo pays, Dani leaves the bill, shares still add up", async () => {
  const { m, f } = await mount("bill-split");
  await f.waitForFunction(() => document.body.innerText.includes("$184.50"));
  await H("act", m.room, "theo", { t: "paid", user: "theo" });
  await H("act", m.room, "dani", { t: "toggle", user: "dani" });
  await f.waitForFunction(() => document.body.innerText.includes("$46.13"));
  const t = await text(f);
  expect(t).toContain("$46.13 of $138.37 back · 1 paid");
  expect((t.match(/\$46\.1[23]/g) ?? []).length).toBe(5); // four shares and the progress line
  expect((await st(m)).errors).toEqual([]);
});

test("members change through the log; the app follows", async () => {
  const { m, f } = await mount("dinner-poll");
  await f.waitForFunction(() => document.body.innerText.includes("Thai Basil"));
  await H("act", m.room, "sam", { t: "vote", option: "thai" });
  await f.waitForFunction(() => document.querySelector(".m-opt em")?.textContent === "1");
  await H("setMembers", m.id, [{ id: "maya", name: "Maya" }, { id: "theo", name: "Theo" }]);
  // Sam left: their vote goes, through an @members entry in the log.
  await f.waitForFunction(() => document.querySelector(".m-opt em")?.textContent === "0");
  const l = await log(m);
  expect(l.filter((e) => e.action.t === "@members").length).toBe(2);
});

test("reconnect: a tap while the socket is down lands once after it comes back", async () => {
  const { m, f } = await mount("dinner-poll");
  await f.waitForFunction(() => document.body.innerText.includes("Taco truck"));
  await H("cut", m.id);
  await f.locator(".m-opt", { hasText: "Taco truck" }).click();
  await f.waitForFunction(() => [...document.querySelectorAll(".m-opt")].some((o) => o.getAttribute("aria-pressed") === "true"));
  expect((await log(m)).some((e) => e.user === "maya" && e.action.t === "vote")).toBe(false);
  await H("restore", m.id);
  await page.waitForFunction((r) => (window as any).H.log(r).some((e: any) => e.user === "maya" && e.action.t === "vote"), m.room);
  await new Promise((r) => setTimeout(r, 100));
  expect((await log(m)).filter((e) => e.user === "maya" && e.action.t === "vote").length).toBe(1);
});

test("theme switch restyles without remount", async () => {
  const { m, f } = await mount("dinner-poll");
  const bg = () => f.evaluate(() => getComputedStyle(document.querySelector(".m-root")!).backgroundColor);
  expect(await bg()).toBe("rgb(255, 255, 255)");
  await H("setTheme", m.id, "dark");
  await f.waitForFunction(() => getComputedStyle(document.querySelector(".m-root")!).backgroundColor !== "rgb(255, 255, 255)");
  expect(await bg()).toBe("rgb(37, 39, 40)"); // @muse/app dark card, #252728 (measured)
});

test("without moveBefore, warm frames stay in a layer laid over the slot and follow scrolling", async () => {
  expect(await H<string>("makePool", 2, { layer: true })).toBe("layer");
  await page.evaluate(() => {
    const sc = document.createElement("div");
    sc.id = "scroller";
    sc.style.cssText = "height:300px;overflow:auto;width:390px";
    sc.innerHTML = `<div style="height:200px"></div><div id="inner"></div><div style="height:800px"></div>`;
    document.body.prepend(sc);
  });
  const t0 = Date.now();
  const m = await H<Mounted>("mount", s.apps["dinner-poll"]!.code, { into: "inner" });
  const warmMs = m.sized - m.t0;
  expect(m.placement).toBe("layer");
  expect(m.sized).toBeGreaterThan(0);
  const f = await frameOf(m);
  await f.waitForFunction(() => document.body.innerText.includes("Thai Basil"));
  const rects = () =>
    page.evaluate(() => {
      const ph = document.querySelector("#inner > div > div")!.getBoundingClientRect();
      const fr = document.querySelector("#inner")!.ownerDocument.querySelectorAll("iframe");
      const live = [...fr].find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x.parentElement!).visibility === "visible")!;
      const r = live.getBoundingClientRect();
      return { ph: [Math.round(ph.left), Math.round(ph.top), Math.round(ph.height)], fr: [Math.round(r.left), Math.round(r.top), Math.round(r.height)], clip: live.parentElement!.style.clipPath };
    });
  await page.waitForTimeout(50);
  let r = await rects();
  expect(r.fr).toEqual(r.ph);
  await page.evaluate(() => (document.getElementById("scroller")!.scrollTop = 150));
  await page.waitForTimeout(50);
  r = await rects();
  expect(r.fr).toEqual(r.ph);
  // Clipped to the scroller: the frame runs past its bottom edge.
  expect(r.clip).toMatch(/^inset\(0px 0px [1-9]\d*px( 0px)?\)$/);
  // Taps reach the frame where it is drawn.
  await f.locator(".m-opt", { hasText: "Taco truck" }).click();
  await page.waitForFunction((room) => (window as any).H.log(room).some((e: any) => e.user === "maya" && e.action.t === "vote"), m.room);
  console.log(`[${ENGINE}] layer path: warm mount to first size ${warmMs.toFixed(1)} ms (test step ${Date.now() - t0} ms)`);
  await page.evaluate(() => document.getElementById("scroller")!.remove());
  await H("destroyAll");
  await H("makePool", 2);
});

test("the frame cannot fetch, reach the parent, read cookies or storage; rng matches JSC golden values", async () => {
  const src = `
    import { defineApp, signal, rng } from "@muse/app";
    const out = signal<Record<string, string>>({});
    const set = (k: string, v: string) => (out.value = { ...out.value, [k]: v });
    fetch(${JSON.stringify(s.host + "sizes.json")}).then(() => set("fetch", "allowed"), () => set("fetch", "blocked"));
    import(${JSON.stringify(s.host + "host.js")}).then(() => set("import", "allowed"), () => set("import", "blocked"));
    try { set("parent", String((parent as any).document.title)); } catch { set("parent", "blocked"); }
    try { set("cookie", "readable:" + document.cookie); } catch { set("cookie", "blocked"); }
    try { localStorage.setItem("x", "1"); set("storage", "allowed"); } catch { set("storage", "blocked"); }
    try { const ws = new WebSocket("ws://localhost:1"); ws.onopen = () => set("ws", "allowed"); ws.onerror = () => set("ws", "blocked"); } catch { set("ws", "blocked"); }
    try { (top as any).location.href = "about:blank"; set("navigate", "allowed"); } catch { set("navigate", "blocked"); }
    const r = rng(42);
    set("rng", [r.next(), r.next(), r.next()].map((x) => x * 4294967296).join(","));
    export default defineApp<{}, {}>({
      name: "Probe", summary: () => "probe", init: () => ({}), reduce: (s) => s, invariants: {}, arbitrary: () => null,
      view: () => <pre id="r">{JSON.stringify(out.value)}</pre>,
    });`;
  const m = await H<Mounted>("mount", compileApp(src).code);
  const frame = await frameOf(m);
  await frame.waitForFunction(() => Object.keys(JSON.parse(document.getElementById("r")!.textContent!)).length >= 8, undefined, { timeout: 5000 });
  const r = JSON.parse(await frame.locator("#r").innerText());
  expect(r).toEqual({
    fetch: "blocked",
    import: "blocked",
    parent: "blocked",
    cookie: "blocked",
    storage: "blocked",
    ws: "blocked",
    navigate: "blocked",
    rng: "2581720956,1925393290,3661312704",
  });
  expect(
    await page.evaluate(() => {
      try {
        return String((document.querySelector("#slot iframe") as HTMLIFrameElement).contentWindow!.document);
      } catch {
        return "blocked";
      }
    }),
  ).toBe("blocked");
});

test("errors are reported: throw at load, rejected promise, nothing rendered, throwing view", async () => {
  const app = (body: string, view = `<p>ok</p>`) =>
    compileApp(`import { defineApp } from "@muse/app";
      ${body}
      export default defineApp<{}, {}>({ name: "x", summary: () => "x", init: () => ({}), reduce: (s) => s, invariants: {}, arbitrary: () => null, view: () => ${view} });`).code;
  const errorsFor = async (code: string) => {
    const m = await H<Mounted>("mount", code);
    await page.waitForFunction((id) => (window as any).H.state(id).errors.length > 0, m.id, { timeout: 3000 }).catch(() => {});
    return (await st(m)).errors;
  };
  expect((await errorsFor(app(`throw new Error("bad load");`))).join()).toContain("bad load");
  expect((await errorsFor(app(`Promise.reject(new Error("late"));`))).join()).toContain("late");
  expect((await errorsFor(app(``, `null`))).join()).toContain("Rendered nothing after mount");
  expect((await errorsFor(app(``, `(() => { throw new Error("view broke"); })()`))).join()).toContain("view broke");
  // WebKit mutes the message of an error thrown from a timer in a blob module ("Script error.").
  expect((await errorsFor(app(`setTimeout(() => { throw new Error("timer"); }, 0);`))).join()).toMatch(ENGINE === "webkit" ? /timer|Script error/ : /timer/);
}, 40_000);
