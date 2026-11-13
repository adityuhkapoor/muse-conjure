// The cast's behaviour checks, each a function that returns what went wrong (empty when fine),
// so `cast.test.ts` can require them to pass and `sabotage.test.ts` can require each one to fail
// when the guard it protects is switched off.

import { Sequencer } from "../../../packages/sync/src/sequencer.ts";
import type { CastOptions } from "../src/director.ts";
import { castEntries, pieceCode, presenter, wheelCode, world } from "./world.ts";

const ALL = ["noa", "maya", "dev", "jonah", "priya", "theo"];
const visible = (seq: Sequencer) =>
  ["t:senior", ...[...Array(8).keys()].map((i) => `a:t-${i}`)]
    .flatMap((room) => castEntries(seq, room).map((e) => ({ ...e, room })))
    .filter((e) => {
      const t = (e.action as { t?: string })?.t ?? "";
      return t !== "read" && t !== "tool-summary" && !t.startsWith("@");
    })
    .sort((a, b) => a.time - b.time);

/** Ask Muse in the stuck chat; the friends finish the wheel and react. */
export async function stuckChat(o: Partial<CastOptions> = {}) {
  const w = await world(o);
  w.presenter.arrive();
  await w.clock.advance(1500);
  w.presenter.say("senior", "muse pick for us");
  await w.clock.advance(1200);
  w.presenter.tool("senior", "t-1", wheelCode(), ALL);
  await w.clock.advance(60_000);
  return w;
}

export async function sameSeedSameRun(o: Partial<CastOptions> = {}): Promise<string[]> {
  const run = async (seed: number) => {
    const w = await stuckChat({ seed, ...o });
    const out = JSON.stringify(w.director.sent);
    w.director.close();
    return out;
  };
  const a = await run(7);
  const b = await run(7);
  const c = await run(8);
  const bad: string[] = [];
  if (a !== b) bad.push("the same seed gave two different runs");
  if (a === c) bad.push("a different seed gave the same run");
  if (JSON.parse(a).length < 4) bad.push("the run did almost nothing");
  return bad;
}

export async function playsTheTool(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await stuckChat(o);
  const bad: string[] = [];
  const acts = castEntries(w.seq, "a:t-1").filter((e) => !(e.action as { t: string }).t.startsWith("@"));
  const people = new Set(acts.map((e) => e.user));
  if (people.size < 2) bad.push(`only ${people.size} friend acted on the tool`);
  if (!acts.some((e) => (e.action as { t: string }).t === "spin")) bad.push("nobody spun");
  if (acts.filter((e) => (e.action as { t: string }).t === "spin").length > 1) bad.push("the wheel was spun again after a result");
  if (acts.some((e) => /reset|remove/.test((e.action as { t: string }).t))) bad.push("someone reset or removed");
  const chat = castEntries(w.seq, "t:senior");
  if (!chat.some((e) => (e.action as { t: string }).t === "react")) bad.push("no reaction");
  if (!chat.some((e) => (e.action as { t: string }).t === "msg")) bad.push("nobody said anything");
  if (chat.some((e) => /^\s*@?muse\b/i.test(String((e.action as { text?: string }).text ?? "")))) bad.push("a friend asked Muse");
  for (const room of ["t:senior", "a:t-1"]) if (castEntries(w.seq, room).some((e) => ["tool", "tool-pending", "tool-failed"].includes((e.action as { t: string }).t))) bad.push("the cast made a tool");
  w.director.close();
  return bad;
}

export async function humanTiming(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await stuckChat(o);
  const bad: string[] = [];
  const v = visible(w.seq);
  for (let i = 1; i < v.length; i++) if (v[i]!.time - v[i - 1]!.time < w.director.limits.gapMs) bad.push(`${v[i - 1]!.user} and ${v[i]!.user} acted ${v[i]!.time - v[i - 1]!.time} ms apart`);
  const first = v[0];
  if (first && first.time - (w.seq.log("t:senior").find((e) => (e.action as { t: string }).t === "tool")?.time ?? 0) < 1000) bad.push("someone acted within a second of the tool landing");
  w.director.close();
  return bad;
}

export async function pauseStops(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await world(o);
  w.presenter.arrive();
  await w.clock.advance(1500);
  w.presenter.say("senior", "muse pick for us");
  await w.clock.advance(1000);
  w.presenter.tool("senior", "t-1", wheelCode(), ALL);
  await w.clock.advance(3000);
  w.director.pause();
  const before = w.seq.log("t:senior").length + w.seq.log("a:t-1").length;
  w.presenter.say("senior", "lol wait");
  await w.clock.advance(60_000);
  const after = castEntries(w.seq, "t:senior").length + castEntries(w.seq, "a:t-1").length;
  const bad: string[] = [];
  const during = w.seq.log("t:senior").length + w.seq.log("a:t-1").length - before - 1;
  if (during !== 0) bad.push(`${during} cast actions while paused`);
  w.director.resume();
  await w.clock.advance(60_000);
  const resumed = castEntries(w.seq, "t:senior").length + castEntries(w.seq, "a:t-1").length;
  if (resumed <= after) bad.push("nothing happened after resume");
  w.director.close();
  return bad;
}

export async function stopAllStops(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await world(o);
  w.presenter.arrive();
  await w.clock.advance(1500);
  w.presenter.tool("senior", "t-1", wheelCode(), ALL);
  await w.clock.advance(3000);
  w.director.stopAll();
  const n = castEntries(w.seq, "t:senior").length + castEntries(w.seq, "a:t-1").length;
  w.presenter.say("senior", "hello?");
  w.director.nextBeat();
  await w.clock.advance(120_000);
  const m = castEntries(w.seq, "t:senior").length + castEntries(w.seq, "a:t-1").length;
  w.director.close();
  return m === n ? [] : [`${m - n} cast actions after stop all`];
}

/** A real phone arriving as Maya stops Maya at once; she comes back a while after it leaves. */
export async function stepsBack(o: Partial<CastOptions> = {}): Promise<string[]> {
  // crowd on, so the others keep playing while Maya's phone is here: only Maya steps back.
  const w = await stuckChat({ resumeMs: 20_000, crowd: true, ...o });
  const bad: string[] = [];
  const mayaPhone = presenter(w.net, w.clock, "maya");
  mayaPhone.arrive();
  await w.clock.advance(100);
  if (w.director.mode("maya") !== "real") bad.push(`maya is ${w.director.mode("maya")} right after her phone arrived`);
  const at = w.clock.now();
  w.presenter.say("senior", "maya where are you");
  w.presenter.tool("senior", "t-2", wheelCode(), ALL);
  await w.clock.advance(30_000);
  const late = [...w.seq.log("t:senior"), ...w.seq.log("a:t-1"), ...w.seq.log("a:t-2")].filter((e) => e.user === "maya" && e.client.startsWith("cast-") && e.time >= at);
  if (late.length) bad.push(`the cast acted as maya ${late.length} times after her phone arrived`);
  const others = castEntries(w.seq, "a:t-2").filter((e) => !(e.action as { t: string }).t.startsWith("@")).length;
  if (!others) bad.push("nobody else played the new tool either");
  mayaPhone.leave();
  await w.clock.advance(60_000);
  if (w.director.mode("maya") !== "cast") bad.push(`maya did not come back (${w.director.mode("maya")})`);
  w.director.close();
  return bad;
}

/** Two real people in one chat: the cast stays out of it unless crowd is on. */
export async function staysOutOfCrowds(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await world({ people: ["maya", "dev", "jonah", "priya", "theo"], ...o });
  const theo = presenter(w.net, w.clock, "theo");
  w.presenter.arrive();
  theo.arrive();
  await w.clock.advance(1500);
  w.presenter.say("senior", "where are we going tonight?");
  w.presenter.tool("senior", "t-1", wheelCode(), ALL);
  await w.clock.advance(60_000);
  const n = castEntries(w.seq, "t:senior").length + castEntries(w.seq, "a:t-1").length;
  w.director.close();
  return n === 0 ? [] : [`${n} cast actions in a chat with two real people`];
}

/** Fast clock: a presenter who never stops typing, for an hour. The limits hold. */
export async function rateLimitsHold(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await world({ speed: "lively", ...o });
  w.presenter.arrive();
  const bad: string[] = [];
  let k = 0;
  const lines = ["lol", "haha ok", "where should we eat?", "hey", "tonight?", "ok", "thanks", "omg", "who is coming friday"];
  for (let minute = 0; minute < Number(process.env.SOAK_MIN ?? 60); minute++) {
    if (process.env.SOAK_TRACE) require("node:fs").appendFileSync(process.env.SOAK_TRACE, `minute ${minute} ${Date.now()}\n`);
    for (let s = 0; s < 60; s += 2) {
      w.presenter.say("senior", lines[k++ % lines.length]!);
      if (k % 300 === 0 && !process.env.SOAK_NOTOOLS) w.presenter.tool("senior", `t-${(k / 300) % 8}`, wheelCode(), ALL);
      await w.clock.advance(2000);
    }
  }
  const lim = w.director.limits;
  const msgs = castEntries(w.seq, "t:senior").filter((e) => (e.action as { t: string }).t === "msg").map((e) => e.time);
  const reacts = castEntries(w.seq, "t:senior").filter((e) => (e.action as { t: string }).t === "react").map((e) => e.time);
  const worst = (ts: number[], ms: number) => Math.max(0, ...ts.map((t) => ts.filter((x) => x >= t && x < t + ms).length));
  if (worst(msgs, lim.burstMs) > lim.msgBurst) bad.push(`${worst(msgs, lim.burstMs)} messages in ${lim.burstMs / 1000} s (limit ${lim.msgBurst})`);
  if (worst(msgs, lim.longMs) > lim.msgLong) bad.push(`${worst(msgs, lim.longMs)} messages in 5 min (limit ${lim.msgLong})`);
  if (worst(reacts, lim.burstMs) > lim.reactBurst) bad.push(`${worst(reacts, lim.burstMs)} reactions in ${lim.burstMs / 1000} s`);
  if (msgs.length < 20) bad.push(`only ${msgs.length} replies in an hour: the soak did not exercise the limits`);
  const v = visible(w.seq);
  for (let i = 1; i < v.length; i++) if (v[i]!.time - v[i - 1]!.time < lim.gapMs) {
    bad.push(`two cast actions ${v[i]!.time - v[i - 1]!.time} ms apart`);
    break;
  }
  w.director.close();
  return bad;
}

/** Tools that fail to load, throw in reduce, or loop in arbitrary cost only themselves. */
export async function badToolsAreContained(o: Partial<CastOptions> = {}): Promise<string[]> {
  const w = await world(o);
  w.presenter.arrive();
  await w.clock.advance(1500);
  const bad: string[] = [];
  const good = pieceCode("lock");
  const loads = `import { defineApp } from "@muse/app"; throw new Error("boom"); export default defineApp({});`;
  const throws = good.replace(/reduce: \(state, action, meta, ctx\) =>/, "reduce: (state, action, meta, ctx) => { throw new Error('reduce boom'); } ,_r: (state, action, meta, ctx) =>");
  const loops = good.replace(/arbitrary: \(_s, _user, r\) =>/, "arbitrary: (_s, _user, r) => { for (;;) {} }, _a: (_s, _user, r) =>");
  if (throws === good || loops === good) bad.push("the broken fixtures did not apply");
  try {
    w.presenter.tool("senior", "t-0", loads, ALL);
    w.presenter.tool("senior", "t-1", throws, ALL);
    w.presenter.tool("senior", "t-2", loops, ALL);
    await w.clock.advance(40_000);
    w.presenter.tool("senior", "t-3", wheelCode(), ALL);
    await w.clock.advance(60_000);
  } catch (e) {
    bad.push(`the service threw: ${String(e).slice(0, 120)}`);
  }
  for (const e of w.net.escaped) bad.push(`escaped the service: ${e.slice(0, 100)}`);
  const played = castEntries(w.seq, "a:t-3").filter((e) => !(e.action as { t: string }).t.startsWith("@")).length;
  if (played < 1) bad.push("a good tool after the bad ones was not played");
  w.director.close();
  return bad;
}
