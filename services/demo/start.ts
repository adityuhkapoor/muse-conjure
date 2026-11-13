// bun run demo: builds what is needed, starts the Rust server, the factory service and the
// gateway, seeds the chats once, and prints where phones can open it. Ctrl-C stops everything.
//
//   bun run demo [--model auto|replay|muse[:model]] [--port 4380] [--db ./data/demo.sqlite] [--fresh] [--no-build] [--unprompted]

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, startStack } from "./stack.ts";
import { privateHosts } from "./gateway.ts";
import { SEED_VERSION } from "./seed.ts";
import { MUSE_KEY_HELP, museKeyAvailable } from "../../packages/factory/src/models/muse.ts";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const port = Number(opt("port", "4380"));
let model = opt("model", process.env.MUSE_DEFAULT ?? "auto");
// Muse is the live model. Without a key the demo still starts, on the recorded answers only.
if ((model === "auto" || model.startsWith("muse")) && !museKeyAvailable()) {
  console.log(MUSE_KEY_HELP);
  model = "replay";
}
const db = resolve(ROOT, opt("db", "data/demo.sqlite"));
const PIDS = join(ROOT, "data/demo.pids");

// A database seeded with an older version of the fake chats would mix old and new messages: start
// it over (the fake chats are the only thing in it worth keeping, and they are seeded again).
const stamp = db + ".seed";
const stale = existsSync(db) && (!existsSync(stamp) || readFileSync(stamp, "utf8").trim() !== SEED_VERSION);
if (stale && !args.includes("--fresh")) console.log("The fake chats changed since this database was made: starting a new one.");
if (args.includes("--fresh") || stale) for (const f of [db, db + "-wal", db + "-shm"]) if (existsSync(f)) rmSync(f);
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(stamp, SEED_VERSION + "\n");

/** Tailscale's IPv4, if Tailscale is installed and up. Only read, never changed. */
async function tailscaleIp(): Promise<string | null> {
  for (const bin of ["tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) {
    try {
      const p = Bun.spawn([bin, "ip", "-4"], { stdout: "pipe", stderr: "ignore" });
      const t = setTimeout(() => p.kill(), 3000);
      const out = (await new Response(p.stdout).text()).trim().split("\n")[0] ?? "";
      clearTimeout(t);
      if ((await p.exited) === 0 && /^\d+\.\d+\.\d+\.\d+$/.test(out)) return out;
    } catch {}
  }
  return null;
}

const t0 = performance.now();
const hosts = privateHosts();
const ts = await tailscaleIp();
if (ts && !hosts.includes(ts)) hosts.push(ts);
const echo = (l: string) => /factory: |error|panic/i.test(l) && console.log(l);
// CAST HOOK (services/cast): the made-up friends play along; on by default, `--no-cast` turns it off.
// `--cast-seed n`, `--cast-speed calm|normal|lively`, `--cast-crowd`, `--cast-model <muse model>`.
const castOn = !args.includes("--no-cast");
const cast = castOn
  ? {
      port: port + 2,
      seed: Number(opt("cast-seed", "1")),
      speed: opt("cast-speed", "normal") as "calm" | "normal" | "lively",
      crowd: args.includes("--cast-crowd"),
      model: args.includes("--cast-model") ? opt("cast-model", "muse-ember-1.0") : null,
      logFile: join(ROOT, "data/cast.log"),
      log: (l: string) => /step-back|back in the cast|scene|reset|stop|error|broken/.test(l) && console.log(l),
    }
  : false;
const stack = await startStack({ port, framePort: port + 1, db, model, hosts, build: !args.includes("--no-build"), echo, cast, unprompted: args.includes("--unprompted") }); // catalysts: --unprompted
writeFileSync(PIDS, JSON.stringify({ pids: [process.pid, ...stack.pids()], ports: [stack.gateway.port, stack.gateway.framePort, stack.serverPort, stack.factoryPort, ...(stack.cast ? [stack.cast.control.port] : [])] }));

const lan = hosts.filter((h) => h !== "127.0.0.1" && h !== ts && !h.startsWith("100."));
const vpn = hosts.filter((h) => h !== ts && h.startsWith("100."));
/** The two fixed-layout links under a base URL. */
const both = (base: string) => `    Mobile   ${base}m/\n    Desktop  ${base}d/`;
console.log(`
Muse Conjure (prototype). Ready in ${((performance.now() - t0) / 1000).toFixed(1)} s.

  This Mac   ${stack.url}
${both(stack.url)}
${lan.map((h) => `  Wi-Fi/LAN  http://${h}:${stack.gateway.port}/\n${both(`http://${h}:${stack.gateway.port}/`)}`).join("\n") || "  Wi-Fi/LAN  (no private address found)"}${vpn.map((h) => `\n  VPN        http://${h}:${stack.gateway.port}/\n${both(`http://${h}:${stack.gateway.port}/`)}`).join("")}
  Tailscale  ${ts ? `http://${ts}:${stack.gateway.port}/\n${both(`http://${ts}:${stack.gateway.port}/`)}` : "(not running)"}

  Add ?as=maya (noa, maya, priya, or aditya, calvin, arun, tsai, will for dev, jonah, theo, noa, priya) to pick who you are; without it you get a picker.
  Builds: ${model === "auto" ? "library first, then Muse (Ember picks, Spark fills and builds), then the recorded replays" : model === "replay" ? "recorded answers only" : model}. Database: ${db}
  Cast: ${stack.cast ? `friends play along; controls at ${stack.cast.control.urls.map((u) => u.replace("127.0.0.1", "localhost")).join(", ")}` : "off (--no-cast)"}
  Listening on loopback and private addresses only. Ctrl-C stops everything.
`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("stopping");
  await stack.stop();
  rmSync(PIDS, { force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
