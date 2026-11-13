// bun e2e-demo/cast/run.ts: the cast against the real stack (Rust server, factory with the
// replay model, gateway) in headless Chrome. One presenter phone, alone, asks Muse in the stuck
// chat; the friends type, play the tool to a pick and react. Then a second real phone shows up
// as one of the friends, who must step back within a second; then pause holds everything.
// Prints each check and the timings; exits 1 on any failure. `E2E_NO_BUILD=1` skips the builds.
// `CAST_SABOTAGE=no-step-back` (or pause) runs with that guard off, to see the test fail.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startStack } from "../../services/demo/stack.ts";
import { phone, Report, send, thread, until, type Phone } from "../lib.ts";

/** From asking Muse to friends typing, two of them acting, the pick and a reaction. */
const STORY_BOUND_MS = 60_000;
const STEP_BACK_BOUND_MS = 1000;

const r = new Report();
const dir = mkdtempSync(join(tmpdir(), "muse-cast-"));
const t0 = performance.now();
const sabotage = process.env.CAST_SABOTAGE ? [process.env.CAST_SABOTAGE] : [];
console.log(`starting the stack with the cast (replay model, temp database${sabotage.length ? `, sabotage ${sabotage}` : ""})`);
const stack = await startStack({
  db: join(dir, "demo.sqlite"),
  model: "replay",
  hosts: ["127.0.0.1"],
  build: process.env.E2E_NO_BUILD !== "1",
  log: (l) => console.log("  " + l),
  cast: { seed: 1, logFile: join(dir, "cast.log"), extra: { sabotage }, log: (l) => process.env.CAST_VERBOSE && console.log("  " + l) },
});
const cast = stack.cast!.director;
const url = `http://127.0.0.1:${stack.gateway.port}/`;
console.log(`stack up in ${((performance.now() - t0) / 1000).toFixed(1)} s at ${url}, controls ${stack.cast!.url}`);
const browser = await chromium.launch({ headless: true });
const transcript: string[] = [];
const sentIn = (room: string, after = 0) => cast.sent.filter(([, , rm]) => rm === room).filter(([ms]) => ms >= after);

let A!: Phone, B: Phone | undefined;
try {
  A = await phone(browser, url, "noa", "&chat=senior");
  const pageClock = () => A.page.evaluate(() => Date.now());

  await r.step("alone in the stuck chat: friends type, two act on the tool, it is picked, a reaction lands", async () => {
    const sent = await pageClock();
    const base = cast.sent.length;
    await send(A.page, "muse pick for us");
    const typing = until(A.page, `!!document.querySelector('.page.push.shown .thread .typing-row')`, STORY_BOUND_MS);
    const ready = await until(A.page, `!!document.querySelector('.page.push.shown [data-muse-card][data-live="ready"]')`, 30_000);
    const toolId = (await thread(A.page).locator("[data-muse-card]").last().getAttribute("data-tool-id")) ?? "";
    const picked = until(A.page, `[...document.querySelectorAll('.page.push.shown .thread')].some(t => /spun the wheel/.test(t.textContent))`, STORY_BOUND_MS);
    const reacted = until(A.page, `[...document.querySelectorAll('.page.push.shown .thread .row')].some(r => r.querySelector('.pill'))`, STORY_BOUND_MS);
    const [ty, pk, re] = await Promise.all([typing, picked, reacted]);
    const actors = new Set(sentIn(`a:${toolId}`).filter(([, , , a]) => !String((a as { t: string }).t).startsWith("@")).map(([, who]) => who));
    if (actors.size < 2) throw new Error(`only ${actors.size} friend acted on the tool`);
    r.time("ask to tool ready", ready - sent);
    r.time("ask to friend typing", ty - sent);
    r.time("ask to wheel picked", pk - sent);
    r.time("ask to first reaction", re - sent);
    // Wait for the friends' last word on it.
    await A.page.waitForTimeout(10_000);
    const start = cast.sent[base]?.[0] ?? 0;
    for (const [ms, who, room, a] of cast.sent.slice(base)) {
      const x = a as { t: string; text?: string; emoji?: string };
      if (x.t === "read" || x.t === "tool-summary" || x.t.startsWith("@")) continue;
      transcript.push(`${((ms - start) / 1000).toFixed(1).padStart(5)} s  ${who.padEnd(6)} ${room.startsWith("a:") ? "tool " + JSON.stringify(x) : x.t === "react" ? "reacted " + x.emoji : `"${x.text}"`}`);
    }
    return `typing ${ty - sent} ms, picked ${pk - sent} ms, reaction ${re - sent} ms, ${actors.size} on the tool (${[...actors].join(", ")})`;
  });

  await r.step("a real phone arriving as a friend makes the cast step back within a second", async () => {
    const who = "maya";
    if (cast.mode(who) !== "cast") throw new Error(`${who} is ${cast.mode(who)} before her phone arrives`);
    const opened = Date.now();
    B = await phone(browser, url, who, "&chat=senior");
    await B.page.waitForFunction(() => !!(window as unknown as { __museLive?: unknown }).__museLive, null, { timeout: 10_000 });
    const liveAt = Date.now();
    let stepped = 0;
    while (Date.now() - liveAt < 5000) {
      if (cast.mode(who) === "real") {
        stepped = Date.now();
        break;
      }
      await Bun.sleep(20);
    }
    if (!stepped) throw new Error(`${who} is still played by the cast 5 s after her phone arrived`);
    r.time("phone live to step back", stepped - liveAt);
    r.time("page open to step back", stepped - opened);
    // Send something so the friends have a reason to answer, then check nothing went out as her.
    const after = cast.sent.at(-1)?.[0] ?? 0;
    await send(A.page, "where is everyone lol");
    await A.page.waitForTimeout(8000);
    const asHer = cast.sent.filter(([ms, w]) => w === who && ms > after);
    if (asHer.length) throw new Error(`the cast acted as ${who} ${asHer.length} times after her phone arrived`);
    if (stepped - liveAt > STEP_BACK_BOUND_MS) throw new Error(`took ${stepped - liveAt} ms`);
    return `${stepped - liveAt} ms after her phone was live`;
  });

  await r.step("pause holds everything until resume", async () => {
    await B?.ctx.close();
    B = undefined;
    // In Tsai Lin's DM with Will, where Will answers when the cast is playing.
    await A.page.goto(`${url}?as=noa&safe=1&chat=priya`);
    await A.page.waitForSelector(".page.push .thread", { timeout: 15_000 });
    cast.pause();
    const n = cast.sent.length;
    await send(A.page, "hey are you up");
    await A.page.waitForTimeout(12_000);
    if (cast.sent.length !== n) throw new Error(`${cast.sent.length - n} actions while paused`);
    cast.resume();
    const t = Date.now();
    while (cast.sent.length === n && Date.now() - t < 25_000) await Bun.sleep(100);
    if (cast.sent.length === n) throw new Error("nothing happened after resume either");
    return `nothing in 12 s while paused, then ${Date.now() - t} ms to the first action after resume`;
  });
} finally {
  await browser.close();
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}

console.log("\ntranscript (stuck chat, from the first friend action):");
for (const l of transcript) console.log("  " + l);
console.log("\ntimings (ms):");
for (const [k, v] of Object.entries(r.timings)) console.log(`  ${k.padEnd(28)} ${v.join(", ")}`);
const failed = r.failed;
console.log(failed.length ? `\n${failed.length} failed` : `\nall ${r.checks.length} passed`);
process.exit(failed.length ? 1 : 0);
