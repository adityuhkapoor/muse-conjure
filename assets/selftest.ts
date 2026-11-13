// Self-test for the asset folder. `bun assets/selftest.ts` fails on a missing file, an over-budget image, an
// unreadable placeholder, a mapping that points nowhere, a team member without a photo or an avatar size, or a
// photo of anyone else (made-up people are drawn by the shell), or a photo with no row in CREDITS.md.
// It also runs the fixtures in fixtures/: each one must fail with the problem it is named for.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir;
/** The only people with photos: the five team members, with their permission. Everyone else is drawn by the shell. */
export const CAST = ["aditya", "calvin", "arun", "tsai", "will"];
export const AVATAR_PX = [96, 256];
export const BUDGET = { avatarBytes: 14_000, imageBytes: 190_000, wideBytes: 240_000, totalBytes: 12_000_000, placeholderBytes: 700 };

export function check(m: any, root = HERE): string[] {
  const bad: string[] = [];
  let total = 0;
  for (const [id, a] of Object.entries<any>(m.assets ?? {})) {
    if (!a.alt || a.alt.length < 8) bad.push(`alt: ${id} has no alt text`);
    if (!/^data:image\/webp;base64,/.test(a.placeholder ?? "") || a.placeholder.length > BUDGET.placeholderBytes * 1.4) bad.push(`placeholder: ${id} missing or too large`);
    if (!/^#[0-9a-f]{6}$/.test(a.color ?? "")) bad.push(`color: ${id}`);
    for (const s of a.sizes ?? []) {
      const f = join(root, s.path);
      if (!existsSync(f)) { bad.push(`missing: ${s.path}`); continue; }
      const bytes = Math.max(statSync(f).size, s.bytes ?? 0);
      total += bytes;
      const limit = s.use === "avatar" ? BUDGET.avatarBytes : s.w > 1000 ? BUDGET.wideBytes : BUDGET.imageBytes;
      if (bytes > limit) bad.push(`over budget: ${s.path} is ${bytes} bytes, limit ${limit}`);
    }
  }
  for (const [id, a] of Object.entries<any>(m.assets ?? {})) {
    if ((a.kind === "portrait" || a.kind === "candid") && !CAST.includes(a.owner)) bad.push(`person photo: ${id} shows someone who is not on the team`);
  }
  for (const c of CAST) {
    const av = m.map?.people?.[c]?.avatar;
    const e = av && m.assets?.[av];
    if (!e) { bad.push(`portrait: ${c} has no portrait`); continue; }
    for (const px of AVATAR_PX) if (!e.sizes.some((s: any) => s.use === "avatar" && s.w === px)) bad.push(`avatar size: ${c} lacks ${px}px`);
  }
  const ids = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(ids) : []);
  for (const [group, entries] of Object.entries<any>(m.map ?? {})) {
    for (const [k, v] of Object.entries(entries)) {
      const refs = group === "people" ? ids({ a: (v as any).avatar, p: (v as any).photos, q: (v as any).posts }) : group === "posts" ? ids((v as any).asset) : ids(v);
      for (const r of refs) if (!m.assets?.[r]) bad.push(`map: ${group}.${k} points at unknown asset ${r}`);
    }
  }
  // every shipped photo is credited (source, page, photographer, licence) in CREDITS.md
  const credits = existsSync(join(root, "CREDITS.md")) ? readFileSync(join(root, "CREDITS.md"), "utf8") : "";
  const credited = new Set([...credits.matchAll(/^\| ([a-z0-9-]+) \|/gm)].map((x) => x[1]));
  for (const [id, a] of Object.entries<any>(m.assets ?? {})) if (a.kind === "photo" && !credited.has(id)) bad.push(`credit: ${id} has no row in CREDITS.md`);
  if (total > BUDGET.totalBytes) bad.push(`over budget: total ${total} bytes, limit ${BUDGET.totalBytes}`);
  return bad;
}

if (import.meta.main) {
  const real = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
  const problems = check(real);
  let failed = problems.length > 0;
  problems.forEach((p) => console.log("FAIL", p));
  // Fixtures: fixtures/<expected-prefix>--<name>.json must produce a problem starting with that prefix.
  for (const f of readdirSync(join(HERE, "fixtures")).filter((n) => n.endsWith(".json"))) {
    const want = f.split("--")[0]!;
    const got = check(JSON.parse(readFileSync(join(HERE, "fixtures", f), "utf8")));
    const ok = got.some((p) => p.startsWith(want));
    console.log(ok ? "ok  " : "FAIL", `fixture ${f} ${ok ? "fails as intended" : "passed but must fail: " + got.join("; ")}`);
    if (!ok) failed = true;
  }
  const total = Object.values<any>(real.assets).reduce((n, a) => n + a.sizes.reduce((k: number, s: any) => k + s.bytes, 0), 0);
  console.log(`${Object.keys(real.assets).length} assets, ${(total / 1e6).toFixed(2)} MB`);
  if (failed) process.exit(1);
  console.log("assets self-test passed");
}
