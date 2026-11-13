// bun run test:broken: run every test against a deliberately broken model (TASTE_BREAK=1) and
// check each one fails. The break: exclamation marks are not detected, labels are flipped, the
// Laplace variance is shrunk 100x, active selection picks the least informative item, and swipes
// are not written. A test that still passes here is not testing anything.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "taste-broken-"));
const out = join(dir, "junit.xml");
const p = Bun.spawnSync(["bun", "test", "--reporter=junit", `--reporter-outfile=${out}`, ...process.argv.slice(2)], { cwd: join(import.meta.dir, ".."), env: { ...process.env, TASTE_BREAK: "1" }, stdout: "ignore", stderr: "ignore" });
const xml = readFileSync(out, "utf8");
rmSync(dir, { recursive: true, force: true });
const cases = [...xml.matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => ({ name: m[1]!, failed: /<failure|<error/.test(m[3] ?? "") }));
for (const c of cases) console.log(`${c.failed ? "fails (good)" : "PASSES (bad) "}  ${c.name}`);
const still = cases.filter((c) => !c.failed);
console.log(`\n${cases.length - still.length} of ${cases.length} tests fail on the broken model (exit ${p.exitCode})`);
process.exit(still.length || !cases.length ? 1 : 0);
