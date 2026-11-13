// bun e2e-demo/asks.ts: common chat asks, sent to the demo's /generate the way the shell sends them
// (senior week's messages and members, replay model, no recorded answer for most of them). Each
// must end in a lab tool (library/lab) within 8 s: never silence, never a plain piece.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startStack } from "../services/demo/stack.ts";
import { PEOPLE, seedChats } from "../apps/shell/src/store/fake-data.ts";

const BOUND_MS = 8000;
const ASKS = [
  // the six that went quiet
  "muse split the groceries",
  "muse who's in for friday",
  "muse assign chores",
  "muse settle the veto on dinner",
  "muse make a bracket",
  "muse plan the trip",
  // and more
  "muse pick for us",
  "muse who owes who",
  "muse rank the dining halls",
  "muse who's driving",
  "muse road trip bingo",
  "muse what time works for everyone",
  "muse what should everyone bring",
  "muse gym streaks",
];

const LAB = resolve(import.meta.dir, "../library/lab");
const dir = mkdtempSync(join(tmpdir(), "muse-asks-"));
const stack = await startStack({ db: join(dir, "demo.sqlite"), model: "replay", hosts: ["127.0.0.1"], build: false, log: () => {} });
const url = `http://127.0.0.1:${stack.gateway.port}/generate`;
const chat = seedChats().find((c) => c.id === "senior")!;
const people = new Map(PEOPLE.map((p) => [p.id, p.first]));
const name = (id: string) => people.get(id) ?? id;
const body = (ask: string, i: number) => ({
  ask,
  chat: { title: chat.name, messages: chat.messages.filter((m) => m.kind === "text").map((m) => ({ from: name(m.from), text: m.text ?? "" })) },
  members: chat.members.map((m) => ({ id: m === "me" ? "noa" : m, name: name(m) })),
  surface: "chat",
  chatId: `asks-${i}`,
  model: "replay",
});

let bad = 0;
try {
  for (const [i, ask] of ASKS.entries()) {
    const t0 = performance.now();
    let tool = "";
    let error = "";
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(ask, i)), signal: AbortSignal.timeout(BOUND_MS) });
      const text = await res.text();
      const done = /event: done\ndata: (.*)\n/.exec(text)?.[1];
      const err = /event: error\ndata: (.*)\n/.exec(text)?.[1];
      if (done) tool = String((JSON.parse(done) as { piece?: string }).piece ?? "");
      else error = err ? String((JSON.parse(err) as { detail?: string }).detail ?? "error") : `status ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    }
    const ms = Math.round(performance.now() - t0);
    const lab = !!tool && existsSync(join(LAB, tool, "app.tsx"));
    const ok = lab && ms <= BOUND_MS;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${ask.padEnd(36)} ${String(ms).padStart(5)} ms  ${tool ? (lab ? `lab:${tool}` : `not a lab tool: ${tool}`) : error.slice(0, 120)}`);
  }
} finally {
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${ASKS.length - bad} of ${ASKS.length} asks ended in a lab tool within ${BOUND_MS} ms`);
process.exit(bad ? 1 : 0);
