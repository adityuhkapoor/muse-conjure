// bun e2e-demo/seeded.ts: every seeded Messenger chat opened headless as one of its members; each
// tool card must reach ready (frame mounted) within 10 s, scrolled into view one by one. Prints
// one line per card and the frame's first words. Exit 1 if any card stays loading.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startStack } from "../services/demo/stack.ts";
import { seedChats } from "../apps/shell/src/store/fake-data.ts";
import { frameText, phone, thread, toolFrame } from "./lib.ts";

const dir = mkdtempSync(join(tmpdir(), "muse-seeded-"));
const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], build: process.env.E2E_NO_BUILD !== "1", log: () => {} });
const url = `http://127.0.0.1:${stack.gateway.port}/`;
const browser = await chromium.launch({ headless: true });
let bad = 0;
try {
  const chats = [...seedChats().map((c) => ({ id: c.id, as: c.members.includes("me") ? "noa" : c.members[0]! })), { id: "latenight", as: "theo" }];
  for (const c of chats) {
    const P = await phone(browser, url, c.as, `&chat=${c.id}`);
    await P.page.waitForTimeout(1500);
    const ids = await thread(P.page).locator("[data-muse-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tool-id") ?? ""));
    if (!ids.length) console.log(`--   ${c.id}: no tool cards`);
    for (const id of ids) {
      const el = thread(P.page).locator(`[data-muse-card][data-tool-id="${id}"]`);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const t0 = Date.now();
      let ok = true;
      let text = "";
      try {
        await P.page.waitForFunction((tid) => document.querySelector(`.page.push.shown [data-muse-card][data-tool-id="${tid}"]`)?.getAttribute("data-live") === "ready", id, { timeout: 10_000 });
        text = (await frameText(await toolFrame(P.page, id))).slice(0, 70);
      } catch (e) {
        ok = false;
        text = `${(await el.getAttribute("data-live")) ?? "no data-live"} · ${(e as Error).message.split("\n")[0]}`;
      }
      if (!ok) bad++;
      console.log(`${ok ? "ok  " : "FAIL"} ${c.id.padEnd(10)} ${id.padEnd(14)} ${Date.now() - t0} ms  ${text}`);
    }
    await P.ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
