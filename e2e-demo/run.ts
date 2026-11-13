// bun run e2e:demo: the whole demo, end to end, in headless Chrome. Two friends on phone-sized
// contexts against the real stack (Rust server, factory service with the replay model, gateway)
// on random ports with a temp database. Prints each check and the measured timings; exits 1 if
// any check failed.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { startStack } from "../services/demo/stack.ts";
import { card, frameText, median, phone, PHONE, reach, Report, send, thread, toolFrame, until, type Phone } from "./lib.ts";
import { surfaceFlows } from "./surfaces.ts"; // surfaces
import { catalystFlows } from "./catalysts.ts"; // catalysts

/** Tap on one phone to change on the other, through the gateway. Measured and printed; fails above this. */
const TAP_BOUND_MS = 500;
const MESSAGE_BOUND_MS = 1000;

const r = new Report();
const dir = mkdtempSync(join(tmpdir(), "muse-e2e-"));
const t0 = performance.now();
console.log("starting the stack (replay model, temp database)");
const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], build: process.env.E2E_NO_BUILD !== "1", log: (l) => console.log("  " + l) });
const url = `http://127.0.0.1:${stack.gateway.port}/`;
console.log(`stack up in ${((performance.now() - t0) / 1000).toFixed(1)} s at ${url}`);
const engine = process.env.ENGINE === "webkit" ? webkit : chromium;
console.log(`browser: headless ${process.env.ENGINE === "webkit" ? "WebKit (frames in the positioned layer)" : "Chrome"}`);
const browser = await engine.launch({ headless: true });

let A!: Phone, B!: Phone, C: Phone | undefined;
let toolId = "";
try {
  A = await phone(browser, url, "noa", "&chat=senior");
  B = await phone(browser, url, "maya", "&chat=senior");

  // 1. Messages, typing and reactions are live between the two.
  await r.step("a message from A shows on B", async () => {
    const text = `hello from noa ${Date.now() % 100000}`;
    const sent = Date.now();
    await send(A.page, text);
    const seen = await until(B.page, `[...document.querySelectorAll('.page.push.shown .thread .bubble')].some(b => b.textContent.includes(${JSON.stringify(text)}))`, 8000);
    r.time("message A to B", seen - sent);
    if (seen - sent > MESSAGE_BOUND_MS) throw new Error(`took ${seen - sent} ms`);
    return `${seen - sent} ms`;
  });
  await r.step("typing on B shows dots on A", async () => {
    await thread(B.page).locator("textarea").fill("thinking");
    await until(A.page, `!!document.querySelector('.page.push.shown .thread .typing-row')`, 6000);
    await thread(B.page).locator("textarea").fill("");
  });
  await r.step("a reaction from B shows on A", async () => {
    await thread(B.page).locator(".row .bubble", { hasText: "no u pick" }).dblclick();
    await until(A.page, `[...document.querySelectorAll('.page.push.shown .thread .row')].some(r => r.querySelector('.pill') && r.textContent.includes('no u pick'))`, 6000);
  });

  // 2. Ask Muse. Both see the building card, then the tool.
  await r.step("asking Muse shows the building card on both, then the tool", async () => {
    // senior week already has seeded tools: "ready" means a card that was not there before
    const before = await thread(A.page).locator("[data-muse-card]").count();
    const seen = JSON.stringify(await thread(A.page).locator("[data-muse-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tool-id"))));
    const fresh = `[...document.querySelectorAll('.page.push.shown [data-muse-card][data-live="ready"]')].some((e) => !${seen}.includes(e.getAttribute("data-tool-id")))`;
    const sent = Date.now();
    await send(A.page, "muse pick for us");
    // The building card proper: Muse is still working (no tool yet), not a tool loading its frame.
    const building = `!!document.querySelector('.page.push.shown [data-muse-card][aria-busy="true"]:not([data-live])')`;
    const buildA = await until(A.page, building, 5000);
    const buildB = await until(B.page, building, 5000);
    const readyA = await until(A.page, fresh, 30_000);
    const readyB = await until(B.page, fresh, 30_000);
    r.time("send to building card (A)", buildA - sent);
    r.time("send to building card (B)", buildB - sent);
    r.time("send to tool, replay (A)", readyA - sent);
    r.time("send to tool, replay (B)", readyB - sent);
    toolId = (await card(A.page).getAttribute("data-tool-id")) ?? "";
    if (!toolId) throw new Error("the card has no tool id");
    if ((await thread(A.page).locator("[data-muse-card]").count()) !== before + 1) throw new Error(`expected one new card in the chat (${before} before)`);
    // The card is exactly the frame's reported height: no gap, no clipping.
    await A.page.waitForTimeout(600);
    for (const p of [A.page, B.page]) {
      const f = await toolFrame(p, toolId);
      const fh = (await (await f.frameElement()).boundingBox())!.height;
      const ch = (await card(p, toolId).boundingBox())!.height;
      if (Math.abs(fh - ch) > 1.5) throw new Error(`card is ${ch} px tall, its frame ${fh} px`);
    }
    // The frame carries Muse Sans inline (its CSP allows data: fonts only) and uses it.
    const face = await (await toolFrame(A.page, toolId)).evaluate(async () => {
      await document.fonts.ready;
      return { loaded: document.fonts.check('15px "Muse Sans"'), family: getComputedStyle(document.querySelector(".m-root")!).fontFamily };
    });
    if (!face.loaded || !/^"?Muse Sans/.test(face.family)) throw new Error(`tool frame font: ${JSON.stringify(face)}`);
    return `building ${buildA - sent} / ${buildB - sent} ms, tool ${readyA - sent} / ${readyB - sent} ms, frame text in Muse Sans`;
  });

  // 3. Both use the same tool and see each other's taps.
  await r.step(`a tap in the tool on A shows on B within ${TAP_BOUND_MS} ms`, async () => {
    // In view on both phones, as a person would have it (Safari's layer frames are clipped to the list).
    await A.page.waitForTimeout(800); // let the thread's own smooth scroll to the end finish
    for (const p of [A.page, B.page]) await card(p, toolId).evaluate((el) => {
      const list = el.closest(".list")!;
      list.scrollTo({ top: list.scrollTop + el.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 16, behavior: "instant" });
    });
    await A.page.waitForTimeout(300);
    const fa = await toolFrame(A.page, toolId);
    const fb = await toolFrame(B.page, toolId);
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = await frameText(fb);
      await fb.evaluate(() => {
        (window as any).__changed = 0;
        new MutationObserver(() => ((window as any).__changed ||= Date.now())).observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await fa.evaluate(() => document.addEventListener("pointerdown", () => ((window as any).__tap = Date.now()), { once: true, capture: true }));
      await fa.getByRole("button", { name: /^Spin( again)?$/ }).click();
      const changed = (await (await fb.waitForFunction(() => (window as any).__changed || false, null, { timeout: 5000, polling: 16 })).jsonValue()) as number;
      const tap = (await fa.evaluate(() => (window as any).__tap)) as number;
      samples.push(changed - tap);
      r.time("tap A to B through the gateway", changed - tap);
      await fb.waitForFunction((b) => document.querySelector(".m-root")!.textContent !== b, before, { timeout: 5000 });
      await A.page.waitForTimeout(3200); // the reel turns for 2.6 s; the next spin waits for it
    }
    const ta = await frameText(fa);
    const tb = await frameText(fb);
    if (ta !== tb) throw new Error(`A shows "${ta}" and B shows "${tb}"`);
    if (median(samples) > TAP_BOUND_MS) throw new Error(`median ${median(samples)} ms`);
    return `samples ${samples.join(", ")} ms; both show "${ta.slice(0, 60)}"`;
  });

  await r.step("the tool's summary reaches the pinned bar on B", async () => {
    const want = await frameText(await toolFrame(B.page, toolId));
    await B.page.evaluate(() => (document.querySelector(".page.push.shown .thread .list")!.scrollTop = 0));
    await until(B.page, `(document.querySelector('.page.push.shown .thread .pin .pt')?.textContent ?? '').includes('spun: ')`, 6000);
    return (await thread(B.page).locator(".pin .pt").textContent())?.trim() + ` (frame: ${want.slice(0, 40)})`;
  });

  await r.step("activity lines say what happened, one line for a burst of spins", async () => {
    // Tsai Lin spun three times in a row: one line, from the tool's own summary, "You" on her phone.
    const lines = async (p: typeof A.page) => (await thread(p).locator("button.activity").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    await until(B.page, `[...document.querySelectorAll('.page.push.shown .thread button.activity')].some(b => /^Tsai Lin spun: /.test(b.textContent.trim()))`, 6000);
    await until(A.page, `[...document.querySelectorAll('.page.push.shown .thread button.activity')].some(b => /^You spun: /.test(b.textContent.trim()))`, 6000);
    const a = await lines(A.page);
    const b = await lines(B.page);
    if (a.filter((t) => t.startsWith("You ")).length !== 1) throw new Error(`A shows ${JSON.stringify(a)}`);
    if (b.filter((t) => t.startsWith("Tsai Lin ")).length !== 1) throw new Error(`B shows ${JSON.stringify(b)}`);
    if ([...a, ...b].some((t) => / used /.test(t))) throw new Error(`a line still says "used": ${JSON.stringify([...a, ...b])}`);
    return `A: "${a.at(-1)}"; B: "${b.at(-1)}"`;
  });

  // 3b. A browser that blocks the frame port (an embedded browser did: net::ERR_BLOCKED_BY_CLIENT)
  // still gets a working tool, from the main port, and that frame is as shut in as any other.
  await r.step("with the frame port blocked, the tool opens from the main port and stays sandboxed", async () => {
    const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    try {
      await ctx.route(`http://127.0.0.1:${stack.gateway.framePort}/**`, (route) => route.abort("blockedbyclient"));
      const page = await ctx.newPage();
      const notes: string[] = [];
      page.on("console", (m) => /Tool frames:/.test(m.text()) && notes.push(m.text()));
      const t = Date.now();
      await page.goto(`${url}?as=jonah&safe=1&chat=senior`);
      await until(page, `!!document.querySelector('.page.push.shown [data-muse-card][data-tool-id=${JSON.stringify(toolId)}][data-live="ready"]')`, 15_000);
      const ms = Date.now() - t;
      if ((await page.evaluate(() => document.documentElement.dataset.frameFallback)) !== "1") throw new Error("the fallback was not used");
      if (notes.length !== 1) throw new Error(`expected one note about the fallback, got ${notes.length}`);
      // In view above the composer (Safari's layer frames are clipped to the list), as step 3 does,
      // once the card has eased to its frame's height.
      await page.waitForTimeout(800);
      await card(page, toolId).evaluate((el) => {
        const list = el.closest(".list")!;
        list.scrollTo({ top: list.scrollTop + el.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 16, behavior: "instant" });
      });
      await page.waitForTimeout(300);
      const f = await toolFrame(page, toolId);
      if (!f.url().includes("/__frame/frame.html")) throw new Error(`frame came from ${f.url()}`);
      const fa = await toolFrame(A.page, toolId);
      const before = await frameText(fa);
      await A.page.waitForTimeout(3200);
      const spin = f.getByRole("button", { name: /^Spin( again)?$/ });
      const box = await spin.boundingBox();
      const listBox = await card(page, toolId).evaluate((el) => JSON.stringify(el.closest(".list")!.getBoundingClientRect()));
      await spin.click();
      await fa.waitForFunction((b) => document.querySelector(".m-root")!.textContent !== b, before, { timeout: 8000 }).catch(async (e) => {
        throw new Error(`${(e as Error).message.split("\n")[0]}; Calvin's frame: "${(await frameText(f)).slice(0, 80)}"; Spin at ${JSON.stringify(box)}; list ${listBox}`);
      });
      const got = await reach(f, url.replace(/\/$/, ""));
      const want = { fetch: "blocked", import: "blocked", ws: "blocked", parent: "blocked", cookie: "blocked", storage: "blocked", navigate: "blocked", origin: "null" };
      const sorted = (o: Record<string, string>) => JSON.stringify(Object.entries(o).sort());
      if (sorted(got) !== sorted(want)) throw new Error(`the fallback frame reached out: ${JSON.stringify(got)}`);
      return `tool ready ${ms} ms after load; Calvin's spin reached Tsai Lin; probes all blocked`;
    } finally {
      await ctx.close();
    }
  });

  // 4. Reload B: the same state. A late joiner: the same state.
  await r.step("B reloads and the tool shows the same state", async () => {
    const want = await frameText(await toolFrame(A.page, toolId));
    await B.page.reload();
    await B.page.waitForSelector(".page.push .thread");
    const got = await frameText(await toolFrame(B.page, toolId, 15_000));
    if (got !== want) throw new Error(`B shows "${got}", A shows "${want}"`);
  });
  await r.step("a late joiner sees the same state", async () => {
    const want = await frameText(await toolFrame(A.page, toolId));
    C = await phone(browser, url, "dev", "&chat=senior");
    const got = await frameText(await toolFrame(C.page, toolId, 15_000));
    if (got !== want) throw new Error(`C shows "${got}", A shows "${want}"`);
    return `"${got.slice(0, 60)}"`;
  });

  // 5. The Event page: Interested, Go together, a new chat with a who's in tool.
  await r.step("Event: Interested, Go together makes a chat with a who's in tool", async () => {
    await A.page.goto(`${url}?as=noa&safe=1&event=juniper`);
    await A.page.getByRole("button", { name: "Interested" }).click();
    const tapped = Date.now();
    await A.page.getByRole("button", { name: "Go together" }).click();
    await until(A.page, `!!document.querySelector('.thread[aria-label="Chat with Juniper Hale live"]')`, 5000);
    const ready = await until(A.page, `!!document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] [data-muse-card][data-live="ready"]')`, 20_000);
    r.time("Go together to tool, library reuse", ready - tapped);
    const evId = (await thread(A.page).locator("[data-muse-card]").last().getAttribute("data-tool-id"))!;
    const text = await frameText(await toolFrame(A.page, evId));
    // The pre-made who's in (lab squad-lock when it passed the gate, else the lock piece): the event and a count to lock at.
    if (!/Who's in|Go with friends|Juniper Hale live/.test(text)) throw new Error(`the tool shows "${text}"`);
    // Maya was interested too: the chat is in her inbox with the tool.
    await B.page.goto(`${url}?as=maya&safe=1`);
    await until(B.page, `[...document.querySelectorAll('.inbox button.row')].some(r => r.textContent.includes('Juniper Hale live'))`, 8000);
    return `${ready - tapped} ms to the tool; "${text.slice(0, 50)}"`;
  });

  // 6. The factory dies mid-build: the failure line appears for both.
  await r.step("the factory dies mid-build and the failure line appears on both", async () => {
    await stack.killFactory();
    await stack.startFactory({ MUSE_DELAY_MS: "4000" });
    await A.page.goto(`${url}?as=noa&safe=1&chat=boys`);
    await B.page.goto(`${url}?as=maya&safe=1&chat=apt4b`);
    await A.page.waitForSelector(".page.push .thread");
    await send(A.page, "muse pick for us");
    await until(A.page, `!!document.querySelector('.page.push.shown [data-muse-card][aria-busy="true"]')`, 5000);
    await Bun.sleep(800);
    await stack.killFactory();
    const t = Date.now();
    await until(A.page, `[...document.querySelectorAll('.page.push.shown .thread .system')].some(s => s.textContent.includes("Muse couldn't make that. Try again"))`, 8000);
    const shown = Date.now() - t;
    if (await A.page.locator('.page.push.shown [data-muse-card][aria-busy="true"]:not([data-live])').count()) throw new Error("the building card is still there");
    // Aditya is in the boys: he sees it too.
    const D = await phone(browser, url, "dev", "&chat=boys");
    await until(D.page, `[...document.querySelectorAll('.page.push.shown .thread .system')].some(s => s.textContent.includes("Muse couldn't make that. Try again"))`, 8000);
    await D.ctx.close();
    await stack.startFactory();
    return `${shown} ms after the kill`;
  });

  // 7. The Rust server dies and comes back: both recover.
  await r.step("the server restarts and both phones recover", async () => {
    await A.page.goto(`${url}?as=noa&safe=1&chat=senior`);
    await B.page.goto(`${url}?as=maya&safe=1&chat=senior`);
    await toolFrame(A.page, toolId);
    await toolFrame(B.page, toolId);
    await stack.killRust();
    const text = `sent while the server was down ${Date.now() % 100000}`;
    await send(A.page, text);
    await A.page.waitForTimeout(500);
    const down = Date.now();
    await stack.startRust();
    const seen = await until(B.page, `[...document.querySelectorAll('.page.push.shown .thread .bubble')].some(b => b.textContent.includes(${JSON.stringify(text)}))`, 15_000);
    r.time("server back to message on B", seen - down);
    // and the tool still syncs
    const fa = await toolFrame(A.page, toolId);
    const fb = await toolFrame(B.page, toolId);
    const before = await frameText(fb);
    await fa.getByRole("button", { name: /^Spin( again)?$/ }).click();
    await fb.waitForFunction((b) => document.querySelector(".m-root")!.textContent !== b, before, { timeout: 8000 });
    return `message through ${seen - down} ms after the restart; tool taps sync again`;
  });

  // 8. Facebook surfaces: Home, Reels and Marketplace flows land tools in chats both people see.
  await surfaceFlows(r, browser, url);
  await catalystFlows(r, browser, url); // catalysts: ask, suggest, already made, factory fallback, unprompted switch
  await (await import("./compose.ts")).composeFlow(r, browser, url, stack); // compose: post from Home with a tool, two phones
  await (await import("./comments.ts")).commentsFlow(r, browser, url); // comments: thread, write, like, reply, two phones
} catch (e) {
  r.check("the run finished", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close().catch(() => {});
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}

console.log("\ntimings (ms):");
for (const [k, v] of Object.entries(r.timings)) console.log(`  ${k.padEnd(36)} ${v.join(", ")}${v.length > 1 ? `  (median ${median(v)})` : ""}`);
const failed = r.failed;
console.log(`\n${r.checks.length - failed.length} of ${r.checks.length} checks passed in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed.length ? 1 : 0);
