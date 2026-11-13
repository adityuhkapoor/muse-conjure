// bun e2e-demo/timings.ts [--live "<ask>"] : time from pressing send to the building card and to
// the tool on a phone-sized context through the gateway, for each build path:
//   replay        "muse pick for us" with the replay model
//   library       Event > Go together (a library piece filled by the shell, no model)
//   muse   --live: a fresh ask with the muse model (not part of the automated test)
// Also the tap-to-other-phone latency. Prints a table. Uses a temp database.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startStack } from "../services/demo/stack.ts";
import { median, phone, send, thread, toolFrame, until } from "./lib.ts";

const args = process.argv.slice(2);
const liveAsk = args.includes("--live") ? args[args.indexOf("--live") + 1] : undefined;
const liveChat = args.includes("--chat") ? args[args.indexOf("--chat") + 1]! : "boys";
const rows: [string, string][] = [];
const dir = mkdtempSync(join(tmpdir(), "muse-timings-"));
const stack = await startStack({
  db: join(dir, "demo.sqlite"),
  model: "replay",
  hosts: ["127.0.0.1"],
  build: process.env.E2E_NO_BUILD !== "1",
  log: () => {},
  echo: (l) => /factory: /.test(l) && console.log("  " + l),
});
const url = `http://127.0.0.1:${stack.gateway.port}/`;
const browser = await chromium.launch({ headless: true });

async function ask(chat: string, text: string, model?: string) {
  const A = await phone(browser, url, "noa", `&chat=${chat}`);
  if (model) await A.page.evaluate((m) => ((window as any).__MUSE_LIVE__.model = m), model);
  const sent = Date.now();
  await send(A.page, text);
  const building = await until(A.page, `!!document.querySelector('.page.push.shown [data-muse-card][aria-busy="true"]')`, 5000);
  const last = `[...document.querySelectorAll('.page.push.shown [data-muse-card]')].at(-1)`;
  const ready = await until(A.page, `${last}?.dataset.live === "ready" || [...document.querySelectorAll('.page.push.shown .system')].some(s => s.textContent.includes("couldn't make"))`, 600_000);
  const failed = await A.page.evaluate(`[...document.querySelectorAll('.page.push.shown .system')].some(s => s.textContent.includes("couldn't make"))`);
  const ok = !failed && (await A.page.evaluate(`${last}?.dataset.live`)) === "ready";
  return { A, building: building - sent, ready: ready - sent, ok };
}

try {
  const rep = await ask("senior", "muse pick for us");
  rows.push(["replay: send to building card", `${rep.building} ms`], ["replay: send to tool", `${rep.ready} ms`]);

  // tap latency on the replay tool, B watching
  const B = await phone(browser, url, "maya", "&chat=senior");
  const toolId = (await thread(rep.A.page).locator("[data-muse-card]").last().getAttribute("data-tool-id"))!;
  const fa = await toolFrame(rep.A.page, toolId);
  const fb = await toolFrame(B.page, toolId);
  const taps: number[] = [];
  for (let i = 0; i < 5; i++) {
    await fb.evaluate(() => {
      (window as any).__changed = 0;
      new MutationObserver(() => ((window as any).__changed ||= Date.now())).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await fa.evaluate(() => document.addEventListener("pointerdown", () => ((window as any).__tap = Date.now()), { once: true, capture: true }));
    await fa.getByRole("button", { name: "Spin" }).click();
    const changed = (await (await fb.waitForFunction(() => (window as any).__changed || false, null, { timeout: 5000, polling: 16 })).jsonValue()) as number;
    taps.push(changed - ((await fa.evaluate(() => (window as any).__tap)) as number));
    await rep.A.page.waitForTimeout(3200);
  }
  rows.push(["tap on A to change on B (5 taps)", `${taps.join(", ")} ms, median ${median(taps)}`]);

  // library: Event > Go together
  const E = await phone(browser, url, "noa", "&event=juniper");
  await E.page.getByRole("button", { name: "Interested" }).click();
  const tapped = Date.now();
  await E.page.getByRole("button", { name: "Go together" }).click();
  const b2 = await until(E.page, `!!document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] [data-muse-card][aria-busy="true"]')`, 5000);
  const r2 = await until(E.page, `!!document.querySelector('.thread[aria-label="Chat with Juniper Hale live"] [data-muse-card][data-live="ready"]')`, 20_000);
  rows.push(["library: Go together to building card", `${b2 - tapped} ms`], ["library: Go together to tool", `${r2 - tapped} ms`]);

  if (liveAsk) {
    console.log(`live muse build: "${liveAsk}" in ${liveChat}`);
    const live = await ask(liveChat, liveAsk, "muse");
    rows.push([`muse: send to building card`, `${live.building} ms`], [`muse: send to tool (${live.ok ? "built" : "failed"})`, `${(live.ready / 1000).toFixed(1)} s`]);
    if (live.ok) {
      const id = (await thread(live.A.page).locator("[data-muse-card]").last().getAttribute("data-tool-id"))!;
      const f = await toolFrame(live.A.page, id);
      console.log("  the tool shows:", ((await f.evaluate(() => document.querySelector(".m-root")?.textContent)) ?? "").replace(/\s+/g, " ").slice(0, 300));
      await live.A.page.screenshot({ path: join(tmpdir(), "muse-live-muse.png") });
      console.log("  screenshot:", join(tmpdir(), "muse-live-muse.png"));
    }
  }
} finally {
  await browser.close();
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log("\nphone-sized context (393x852), through the gateway:");
for (const [k, v] of rows) console.log(`  ${k.padEnd(42)} ${v}`);
