/**
 * The owner's rule: no plain library piece anywhere a person can reach on the surfaces. Every
 * scenario tool (src/muse/pack.ts with rich-lab.ts and rich.ts), every surface moment
 * (src/surfaces/moments.ts) and every tool behind a surface (src/surfaces/backing.ts, the Gaming
 * tiles) must be a lab tool: `library/lab/<id>` with app.tsx, meta.json and example.ts, and no
 * piece of the same id in `library/pieces` (the loader would take the piece first). Called by
 * check.ts (through check-catalysts.ts) and by services/demo/check-pack.ts. Must-fail fixture:
 * `plainTools` on a pack with a `piece:` entry reports it (see `labOnlyFixture`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACK } from "../src/muse/pack.ts";
import type { Scenario } from "../src/muse/types.ts";
import { MOMENTS } from "../src/surfaces/moments.ts";
import { BACKING } from "../src/surfaces/backing.ts";
import { GAMES } from "../src/surfaces/data.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const isLab = (id: string) => ["app.tsx", "meta.json", "example.ts"].every((f) => existsSync(join(ROOT, "library/lab", id, f))) && !existsSync(join(ROOT, "library/pieces", id));

/** Every place a plain tool could reach a person, as "where: what" lines; empty when there is none. */
export function plainTools(o: { pack?: Scenario[] } = {}): string[] {
  const out: string[] = [];
  for (const s of o.pack ?? PACK) {
    if (!s.tools.length) out.push(`scenario ${s.id}: no tool at all (remove it from the product)`);
    for (const t of s.tools) {
      const [kind, id] = t.tool.split(":") as [string, string];
      if (kind !== "lab") out.push(`scenario ${s.id}: ${t.tool} is not a lab tool`);
      else if (!isLab(id)) out.push(`scenario ${s.id}: ${t.tool} has no lab folder (app.tsx, meta.json, example.ts)`);
    }
  }
  for (const [name, m] of Object.entries(MOMENTS)) if (!isLab(m.piece)) out.push(`moment ${name}: ${m.piece} is not a lab tool`);
  for (const b of BACKING) for (const t of b.tools) if (!isLab(t.piece)) out.push(`surface tool ${t.id}: ${t.piece} is not a lab tool`);
  for (const g of GAMES) if (!isLab(g.piece)) out.push(`game ${g.id}: ${g.piece} is not a lab tool`);
  return out;
}

/** The fixture: a pack with one plain piece must be reported. True when the check catches it. */
export function labOnlyFixture(): boolean {
  const bad: Scenario = { ...PACK[0]!, id: "fixture-plain", tools: [{ tool: "piece:poll", params: () => ({}) }] };
  return plainTools({ pack: [bad] }).some((x) => x.includes("fixture-plain"));
}

if (import.meta.main) {
  const bad = plainTools();
  for (const x of bad) console.log(`FAIL ${x}`);
  const caught = labOnlyFixture();
  if (!caught) console.log("FAIL the lab-only fixture was not caught");
  console.log(bad.length || !caught ? "lab only: failing" : "lab only: every surface tool is a lab tool");
  process.exit(bad.length || !caught ? 1 : 0);
}
