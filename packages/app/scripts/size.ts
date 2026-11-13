// Runtime size: the core exports of @muse/app, bundled and minified for the browser, against an
// 8 KB min+gzip budget. The art kit is tree-shakable, so each art export is listed with what it
// adds on top of the core when a bundle imports it (the shared art helpers are counted once, in
// the first line). `--all` also prints the whole runtime with every art piece in it.
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as all from "../src/index.ts";
import * as art from "../src/art/index.ts";

const index = join(import.meta.dir, "../src/index.ts");
const dir = mkdtempSync(join(tmpdir(), "muse-size-"));
async function gz(names: string[]): Promise<number> {
  const entry = join(dir, `e${names.length}-${names[names.length - 1] ?? "x"}.ts`);
  writeFileSync(entry, `export { ${names.join(", ")} } from ${JSON.stringify(index)};\n`);
  const r = await Bun.build({ entrypoints: [entry], format: "esm", minify: true, target: "browser" });
  if (!r.success) throw new AggregateError(r.logs);
  return gzipSync(await r.outputs[0]!.text(), { level: 9 }).length;
}
const kb = (n: number) => `${(n / 1024).toFixed(2)} KB`;
const artNames = Object.keys(art);
const core = Object.keys(all).filter((k) => !artNames.includes(k));
const base = await gz(core);
console.log(`@muse/app core runtime: ${kb(base)} min+gzip (budget 8 KB)`);
const helpers = (await gz([...core, "Scene"])) - base;
console.log(`art kit, shared helpers (Scene, Placed, Chip, mix, pal): +${kb(helpers)}`);
for (const n of artNames.filter((n) => n !== "Scene" && typeof (art as Record<string, unknown>)[n] === "function" && /^[A-Z]/.test(n))) {
  const d = (await gz([...core, "Scene", n])) - base - helpers;
  console.log(`  ${n.padEnd(14)} +${kb(Math.max(0, d))}`);
}
if (process.argv.includes("--all")) console.log(`everything: ${kb(await gz(Object.keys(all)))} min+gzip`);
if (base > 8 * 1024) process.exit(1);
