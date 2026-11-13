// The whole demo stack as functions: build, start the Rust server, the factory service and the
// gateway, seed, and stop. `start.ts` (bun run demo) and the end-to-end test both use this.

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { buildFrameJs, privateHosts, startGateway, type Gateway } from "./gateway.ts";
import { seed } from "./seed.ts";
// CAST HOOK (services/cast): the made-up friends, started after the seed when `cast` is set.
import { startCast, type Cast, type StartCastOptions } from "../cast/index.ts";
import { rmSync } from "node:fs";
import { seedSurfaces } from "./seed-surfaces.ts"; // surfaces
import { seedCatalysts } from "./seed-catalysts.ts"; // catalysts
import { startPosts } from "./posts.ts"; // compose: friends react to posts from Home

export const ROOT = resolve(import.meta.dir, "../..");
export const SERVER_BIN = join(ROOT, "server/target/release/server");

type Log = (line: string) => void;

async function run(cmd: string[], cwd: string, log: Log, label: string) {
  const t0 = performance.now();
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, FORCE_COLOR: "0" } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`${label} failed (${code}):\n${(err || out).slice(-3000)}`);
  log(`${label} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

export const buildShell = (log: Log = console.log) => run(["bun", "run", "build"], join(ROOT, "apps/shell"), log, "built the shell");
export const buildServer = (log: Log = console.log) => run(["cargo", "build", "--release", "--bin", "server"], join(ROOT, "server"), log, "built the server");

/** A child process whose stdout we watch for a "ready" line. */
export class Child {
  proc: Subprocess<"ignore", "pipe", "pipe">;
  lines: string[] = [];
  /** set when we stop it ourselves, so the supervisor does not bring it back */
  intentional = false;
  #waiters: { re: RegExp; res: (m: RegExpMatchArray) => void }[] = [];
  constructor(readonly name: string, cmd: string[], env: Record<string, string>, cwd: string, echo: Log | null) {
    this.proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const pump = async (stream: ReadableStream<Uint8Array>) => {
      const dec = new TextDecoder();
      let buf = "";
      for await (const chunk of stream) {
        buf += dec.decode(chunk, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          this.lines.push(line);
          if (this.lines.length > 500) this.lines.shift();
          echo?.(`[${name}] ${line}`);
          this.#waiters = this.#waiters.filter((w) => {
            const m = line.match(w.re);
            if (m) w.res(m);
            return !m;
          });
        }
      }
    };
    pump(this.proc.stdout);
    pump(this.proc.stderr);
  }
  waitFor(re: RegExp, ms = 30_000): Promise<RegExpMatchArray> {
    for (const l of this.lines) {
      const m = l.match(re);
      if (m) return Promise.resolve(m);
    }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${this.name} did not print ${re} in ${ms} ms:\n${this.lines.slice(-20).join("\n")}`)), ms);
      this.#waiters.push({ re, res: (m) => (clearTimeout(t), res(m)) });
      this.proc.exited.then((code) => rej(new Error(`${this.name} exited ${code}:\n${this.lines.slice(-20).join("\n")}`)));
    });
  }
  get pid() {
    return this.proc.pid;
  }
  async kill(signal: NodeJS.Signals = "SIGTERM") {
    this.intentional = true;
    if (this.proc.exitCode !== null || this.proc.signalCode) return;
    this.proc.kill(signal);
    const t = setTimeout(() => this.proc.kill("SIGKILL"), 3000);
    await this.proc.exited;
    clearTimeout(t);
  }
}

export async function startRust(o: { port: number; db: string; echo?: Log | null }): Promise<{ child: Child; port: number }> {
  mkdirSync(dirname(o.db), { recursive: true });
  const child = new Child("server", [SERVER_BIN], { PORT: String(o.port), HOST: "127.0.0.1", DB: o.db }, ROOT, o.echo ?? null);
  const m = await child.waitFor(/listening on [^ ]*:(\d+) db/);
  return { child, port: Number(m[1]) };
}

export async function startFactory(o: { port: number; model: string; env?: Record<string, string>; echo?: Log | null }): Promise<{ child: Child; port: number }> {
  const child = new Child(
    "factory",
    ["bun", "src/serve.ts"],
    { PORT: String(o.port), HOST: "127.0.0.1", MUSE_DEFAULT: o.model, ...(o.env ?? {}) }, // MUSE_MISSES: set by startStack (the data dir)
    join(ROOT, "packages/factory"),
    o.echo ?? null,
  );
  const m = await child.waitFor(/factory listening on http:\/\/[^:]+:(\d+)/, 60_000);
  return { child, port: Number(m[1]) };
}

export type StackOptions = {
  /** gateway port; 0 picks one */
  port?: number;
  framePort?: number;
  serverPort?: number;
  factoryPort?: number;
  db: string;
  /** what the factory uses when a request names no model: auto, replay, muse[:model] */
  model?: string;
  /** bind the gateway here; default loopback and private addresses */
  hosts?: string[];
  build?: boolean;
  factoryEnv?: Record<string, string>;
  log?: Log;
  /** echo child output (prefixed) */
  echo?: Log | null;
  /** catalysts: timed suggestions on */
  unprompted?: boolean;
  /** CAST HOOK: start the cast (services/cast) with these options; off when absent */
  cast?: Omit<StartCastOptions, "ws" | "reset" | "appUrl"> | false;
};

export type Stack = {
  url: string;
  urls: string[];
  gateway: Gateway;
  rust: Child;
  factory: Child;
  serverPort: number;
  factoryPort: number;
  restartRust(): Promise<void>;
  killRust(): Promise<void>;
  startRust(): Promise<void>;
  killFactory(): Promise<void>;
  startFactory(env?: Record<string, string>): Promise<void>;
  pids(): number[];
  stop(): Promise<void>;
  /** CAST HOOK: the running cast, if started */
  cast: Cast | null;
};

export async function startStack(o: StackOptions): Promise<Stack> {
  const log = o.log ?? console.log;
  if (o.build !== false) await Promise.all([buildShell(log), buildServer(log)]);
  const model = o.model ?? "auto";
  // asks that ended without a Mini, next to the database (packages/factory/src/misses.ts)
  o = { ...o, factoryEnv: { MUSE_MISSES: join(dirname(o.db), "misses.jsonl"), ...(o.factoryEnv ?? {}) } };
  let stopping = false;
  let rust = await startRust({ port: o.serverPort ?? 0, db: o.db, echo: o.echo ?? null });
  const bringUpRust = async () => {
    rust = await startRust({ port: rust.port, db: o.db, echo: o.echo ?? null });
    supervise("sync server", rust.child, bringUpRust);
  };
  supervise("sync server", rust.child, bringUpRust);
  let factory: { child: Child; port: number } | null = null;
  let factoryEnv: Record<string, string> | undefined = o.factoryEnv;
  /** A child that exits on its own comes back on the same port after a short backoff, with one log line. */
  function supervise(name: string, child: Child, restart: () => Promise<void>, tries = 0): void {
    void child.proc.exited.then(async (code) => {
      if (stopping || child.intentional) return;
      const wait = Math.min(5000, 300 * 2 ** tries);
      log(`${name} exited (${code}); restarting in ${wait} ms`);
      await Bun.sleep(wait);
      if (stopping) return;
      try {
        await restart();
      } catch (e) {
        log(`${name} did not restart: ${(e as Error).message.split("\n")[0]}`);
        if (!stopping) supervise(name, child, restart, tries + 1);
      }
    });
  }
  const bringUpFactory = async () => {
    factory = await startFactory({ port: factory!.port, model, ...(factoryEnv ? { env: factoryEnv } : {}), echo: o.echo ?? null });
    supervise("factory", factory.child, bringUpFactory);
  };
  let gateway: Gateway;
  let hosts: string[];
  try {
    factory = await startFactory({ port: o.factoryPort ?? 0, model, ...(o.factoryEnv ? { env: o.factoryEnv } : {}), echo: o.echo ?? null });
    supervise("factory", factory.child, bringUpFactory);
    const result = await seed(`ws://127.0.0.1:${rust.port}/ws`, log);
    if (result === "already") log("chats already seeded");
    await seedSurfaces(`ws://127.0.0.1:${rust.port}/ws`, log); // surfaces: chats behind posts and groups
    await seedCatalysts(`ws://127.0.0.1:${rust.port}/ws`, log); // catalysts: tools already on pages
    hosts = o.hosts ?? privateHosts();
    const frameJs = await buildFrameJs();
    gateway = startGateway({ frameJs, port: o.port ?? 0, framePort: o.framePort ?? 0, upstreamWs: `ws://127.0.0.1:${rust.port}/ws`, factory: `http://127.0.0.1:${factory.port}`, hosts, dataDir: dirname(o.db), ...(o.unprompted ? { unprompted: true } : {}) }); // catalysts: unprompted
  } catch (e) {
    // Never leave children behind when the start fails half way.
    await Promise.all([rust.child.kill("SIGKILL"), factory?.child.kill("SIGKILL")]);
    throw e;
  }
  const serverPort = rust.port;
  const factoryPort = factory.port;
  let posts: { stop(): void } | null = null; // compose
  const stack: Stack = {
    url: `http://localhost:${gateway.port}/`,
    urls: hosts.map((h) => `http://${h}:${gateway.port}/`),
    gateway,
    get rust() {
      return rust.child;
    },
    get factory() {
      return factory!.child;
    },
    serverPort,
    factoryPort,
    async killRust() {
      await rust.child.kill("SIGKILL");
    },
    async startRust() {
      rust = await startRust({ port: serverPort, db: o.db, echo: o.echo ?? null });
      supervise("sync server", rust.child, bringUpRust);
    },
    async restartRust() {
      await stack.killRust();
      await stack.startRust();
    },
    async killFactory() {
      await factory!.child.kill("SIGKILL");
    },
    async startFactory(env) {
      factoryEnv = { ...(o.factoryEnv ?? {}), ...(env ?? {}) };
      factory = await startFactory({ port: factoryPort, model, env: factoryEnv, echo: o.echo ?? null });
      supervise("factory", factory.child, bringUpFactory);
    },
    pids: () => [rust.child.pid, factory!.child.pid],
    cast: null,
    async stop() {
      stopping = true;
      stack.cast?.stop();
      posts?.stop(); // compose
      gateway.stop();
      await Promise.all([rust.child.kill(), factory!.child.kill()]);
    },
  };
  // CAST HOOK: reset starts the database over and seeds it again; phones see a new epoch.
  if (o.cast) {
    const reset = async () => {
      await stack.killRust();
      for (const f of [o.db, o.db + "-wal", o.db + "-shm"]) rmSync(f, { force: true });
      await stack.startRust();
      await seed(`ws://127.0.0.1:${serverPort}/ws`, log);
      await seedSurfaces(`ws://127.0.0.1:${serverPort}/ws`, log);
      await seedCatalysts(`ws://127.0.0.1:${serverPort}/ws`, log);
    };
    stack.cast = startCast({ ...o.cast, ws: `ws://127.0.0.1:${serverPort}/ws`, hosts: o.cast.hosts ?? hosts, appUrl: stack.url, reset });
  }
  // compose: posts from Home (new tools built into a post's chat; with the cast, friends react)
  posts = startPosts({ ws: `ws://127.0.0.1:${serverPort}/ws`, cast: () => stack.cast?.director ?? null, log });
  return stack;
}
