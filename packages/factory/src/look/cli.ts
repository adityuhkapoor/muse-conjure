// bun run look <app.tsx> [--members "Maya,Leo,Ana"] [--out dir] [--gate] [--scenes rest,played]
// Headless pictures of one tool at 393 px, light and dark, in four scenes, plus strip.png with all
// of them on one sheet. With --gate, runs the full gate first and prints its result.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { closeShoot, SCENE_LABEL, sheet, shoot, type Scene } from "./shoot.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && /\.tsx?$/.test(a));
if (!file) {
  console.error("usage: bun run look <app.tsx> [--members a,b,c] [--out dir] [--gate]");
  process.exit(2);
}
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const source = readFileSync(file, "utf8");
const names = (opt("members") ?? "Maya,Leo,Ana,Sam").split(",").map((s) => s.trim()).filter(Boolean);
const members = names.map((name, i) => ({ id: `u${i + 1}`, name }));
const out = opt("out") ?? join(dirname(file), "shots");
const scenes = (opt("scenes")?.split(",") as Scene[] | undefined) ?? undefined;
mkdirSync(out, { recursive: true });

if (args.includes("--gate")) {
  const { verify, shutdown } = await import("@muse/verify");
  const r = await verify(source);
  const f = r.failures[0];
  console.log(`gate: ${r.ok ? "pass" : "FAIL"} · stage ${r.stage} · mutation ${r.mutation?.score ?? "-"}${f ? ` · ${f.rule}: ${f.message.slice(0, 300)}` : ""}`);
  if (r.warnings.length) console.log(`warnings: ${r.warnings.map((w) => w.rule).join(", ")}`);
  await shutdown();
}

const shots = await shoot(source, { members, ...(scenes ? { scenes } : {}) });
for (const s of shots) {
  if (s.png.length) writeFileSync(join(out, `${s.scene}-${s.mode}.png`), s.png);
  console.log(`${s.scene} ${s.mode}: ${s.height} px${s.errors.length ? ` · errors: ${s.errors.join("; ").slice(0, 200)}` : ""}${s.summary ? ` · summary "${s.summary}"` : ""}`);
}
const strip = await sheet(
  shots.map((s) => ({ title: `${SCENE_LABEL[s.scene]} · ${s.mode}`, sub: `${s.height} px`, png: s.png })),
  { columns: 4, heading: basename(file) },
);
writeFileSync(join(out, "strip.png"), strip);
console.log(`wrote ${join(out, "strip.png")}`);
await closeShoot();
