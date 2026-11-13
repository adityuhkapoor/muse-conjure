// bun run demo:stop: kills whatever a previous `bun run demo` left running.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./stack.ts";

const PIDS = join(ROOT, "data/demo.pids");
let killed = 0;
if (existsSync(PIDS)) {
  const { pids } = JSON.parse(readFileSync(PIDS, "utf8")) as { pids: number[] };
  for (const pid of pids.reverse()) {
    try {
      process.kill(pid, "SIGTERM");
      killed++;
    } catch {}
  }
  await Bun.sleep(500);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  rmSync(PIDS, { force: true });
}
// Children of a crashed run that lost their pid file: our server binary and the factory service,
// orphaned (parent is launchd) and running from this repo. Live runs by anyone else are left alone.
for (const pattern of [join(ROOT, "server/target/release/server"), "packages/factory.*src/serve.ts|bun src/serve.ts"]) {
  const p = Bun.spawnSync(["pgrep", "-f", pattern]);
  for (const pid of new TextDecoder().decode(p.stdout).split("\n").filter(Boolean).map(Number)) {
    const cwd = Bun.spawnSync(["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"]).stdout.toString();
    const ppid = Number(Bun.spawnSync(["ps", "-o", "ppid=", "-p", String(pid)]).stdout.toString().trim());
    if (!cwd.includes(ROOT) || ppid !== 1) continue;
    try {
      process.kill(pid, "SIGTERM");
      killed++;
      setTimeout(() => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }, 1500);
    } catch {}
  }
}
await Bun.sleep(1600);
console.log(killed ? `stopped ${killed} process${killed === 1 ? "" : "es"}` : "nothing was running");
