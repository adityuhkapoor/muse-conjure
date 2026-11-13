// End to end: the real server on a random port with a temp database, 5 clients, each one
// WebSocket carrying two rooms. While they dispatch, sockets are cut at random and the server
// is killed (SIGKILL) and restarted on the same database. Then, per room, every replica must
// hold the same state, equal to a fold of the server's log, with every dispatched action in
// the log exactly once, and the epoch must not have changed.
//
// bun run e2e

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Entry, Reducer, S2C } from "@muse/protocol";
import { createReplica, sharedSocket, type SharedSocket, type SyncReplica } from "../src/index.ts";

const serverDir = join(import.meta.dir, "../../../server");
const ROOMS = ["a:e2e-1", "a:e2e-2"];
const CLIENTS = 5;
const PER_CLIENT = 120;

type State = { sum: number; order: string[]; seats: (string | null)[] };
const reducer: Reducer<State> = {
  init: () => ({ sum: 0, order: [], seats: [null, null, null] }),
  reduce: (s, a, meta) => {
    const act = a as { add: number; tag: string; claim: number };
    const seats = s.seats.slice();
    if (seats[act.claim] === null && !seats.includes(meta.user)) seats[act.claim] = meta.user;
    else if (seats[act.claim] === meta.user) seats[act.claim] = null;
    return { sum: s.sum + act.add, order: [...s.order, act.tag], seats };
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = performance.now();
const ms = () => `${Math.round(performance.now() - t0)} ms`;

function fail(msg: string): never {
  console.error(`e2e failed: ${msg}`);
  process.exit(1);
}

console.log("building server");
const build = Bun.spawnSync(["cargo", "build", "--quiet", "--bin", "server"], { cwd: serverDir, stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) fail("cargo build failed");
const bin = join(serverDir, "target/debug/server");
const dir = mkdtempSync(join(tmpdir(), "sync-e2e-"));
const db = join(dir, "log.sqlite");

async function startServer(port: number) {
  const proc = Bun.spawn([bin], { env: { ...process.env, PORT: String(port), DB: db }, stdout: "pipe", stderr: "inherit" });
  const reader = proc.stdout.getReader();
  let text = "";
  while (!text.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) fail("server exited before listening");
    text += new TextDecoder().decode(value);
  }
  const m = /listening on ([\d.]+):(\d+)/.exec(text);
  if (!m) fail(`unexpected server output: ${text}`);
  return { proc, port: Number(m[2]) };
}

/** Fetch the whole log with a raw socket: hello with have 0, take the welcome. */
async function fetchLog(port: number, room: string): Promise<{ entries: Entry[]; epoch: string }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return new Promise((resolve, reject) => {
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", room, client: `observer-${Date.now()}`, user: "observer", have: 0 }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as S2C;
      if (m.t === "welcome") {
        ws.close();
        resolve({ entries: m.entries, epoch: m.epoch });
      }
    };
    ws.onerror = () => reject(new Error("observer socket failed"));
  });
}

let server = await startServer(0);
const port = server.port;
console.log(`server on port ${port}, db ${db} (${ms()})`);

const sockets: WebSocket[] = [];
class TrackedWebSocket extends WebSocket {
  constructor(url: string | URL) {
    super(url);
    sockets.push(this);
  }
}

const reps: SyncReplica<State>[] = [];
const socks: SharedSocket[] = [];
for (let i = 0; i < CLIENTS; i++) {
  const sock = sharedSocket(`ws://127.0.0.1:${port}/ws`, { WebSocket: TrackedWebSocket, backoff: (n) => Math.min(500, 20 * 2 ** n) });
  socks.push(sock);
  for (const room of ROOMS) reps.push(createReplica(reducer, sock.transport(room), { room, user: `u${i % 3}`, client: `e2e-${i}-${Date.now()}` }));
}
const epoch0 = (await fetchLog(port, ROOMS[0]!)).epoch;

let cuts = 0;
const dispatchers = reps.map(async (r, i) => {
  for (let n = 0; n < PER_CLIENT / ROOMS.length; n++) {
    r.dispatch({ add: (n % 7) - 3, tag: `${i}.${n}`, claim: n % 3 });
    await sleep(Math.random() * 8);
    if (Math.random() < 0.02) {
      const open = sockets.filter((s) => s.readyState === WebSocket.OPEN);
      const victim = open[Math.floor(Math.random() * open.length)];
      if (victim) {
        victim.close();
        cuts++;
      }
    }
  }
});

// Kill the server outright partway through and bring it back on the same database.
await sleep(150);
server.proc.kill("SIGKILL");
await server.proc.exited;
console.log(`server killed (${ms()})`);
await sleep(100);
server = await startServer(port);
console.log(`server restarted (${ms()})`);

await Promise.all(dispatchers);
console.log(`all ${CLIENTS * PER_CLIENT} actions dispatched, ${cuts} sockets cut (${ms()})`);

const deadline = performance.now() + 20_000;
for (;;) {
  const settled = ROOMS.every((room) => {
    const rs = reps.filter((r) => r.room === room);
    return rs.every((r) => r.pending.length === 0 && r.head === rs[0]!.head);
  });
  if (settled) break;
  if (performance.now() > deadline) fail(`not settled: ${reps.map((r) => `${r.room} pending ${r.pending.length} head ${r.head}`).join("; ")}`);
  await sleep(20);
}
let total = 0;
for (const room of ROOMS) {
  const rs = reps.filter((r) => r.room === room);
  // Pending is empty everywhere, so every action is in the log; let in-flight entries land.
  const { entries: log, epoch } = await fetchLog(port, room);
  if (epoch !== epoch0) fail(`epoch changed across a restart on the same database: ${epoch0} -> ${epoch}`);
  const until = performance.now() + 5_000;
  while (rs.some((r) => r.head < log.length) && performance.now() < until) await sleep(20);
  log.forEach((e, i) => e.seq === i + 1 || fail(`${room}: log gap at index ${i}`));
  const keys = new Set(log.map((e) => `${e.client}/${e.cseq}`));
  if (keys.size !== log.length) fail(`${room}: an action is in the log twice`);
  if (log.length !== CLIENTS * (PER_CLIENT / ROOMS.length)) fail(`${room}: log has ${log.length} entries, expected ${CLIENTS * (PER_CLIENT / ROOMS.length)}`);
  for (let i = 1; i < log.length; i++) if (log[i]!.time < log[i - 1]!.time) fail(`${room}: time went back at seq ${i + 1}`);
  const fold = log.reduce(
    (s, e) => reducer.reduce(s, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed }),
    reducer.init({ room, members: [] }),
  );
  for (const r of rs) {
    if (!isDeepStrictEqual(r.state, fold)) fail(`${r.client} state differs from a fold of the log`);
    if (!isDeepStrictEqual(r.confirmed, fold)) fail(`${r.client} confirmed state differs from a fold of the log`);
    if (r.epoch !== epoch0) fail(`${r.client} holds epoch ${r.epoch}`);
  }
  total += log.length;
}
console.log(`settled (${ms()})`);
for (const r of reps) r.close();
for (const s of socks) s.close();
server.proc.kill();
await server.proc.exited;
rmSync(dir, { recursive: true, force: true });
console.log(`e2e passed: ${CLIENTS} sockets, ${reps.length} replicas in ${ROOMS.length} rooms, ${total} entries, ${cuts} socket cuts, 1 server kill, ${ms()}`);
process.exit(0);
