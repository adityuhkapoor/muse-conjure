/**
 * The seed id rule (docs/CONTRACTS.md): seed data names people by wire id only. "me" is the store's
 * name for the viewer at render time, and "everyone (but the viewer)" comes from src/store/cast.ts,
 * never a literal list. Fails on a "me" in a seed file, and on an array literal with three or more
 * cast ids together with "me" (or ME) anywhere outside the helper. `scripts/fixtures/bad-seed.ts`
 * must fail it. Run alone: `bun scripts/seed-ids.ts`; `bun run check` runs it too.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const repo = join(root, "../..");
const SEED = ["src/surfaces/data.ts", "src/surfaces/comments.ts", "src/surfaces/backing.ts", "src/surfaces/profile-data.ts", "src/muse/seed.ts", "src/store/fake-data.ts"].map((f) => join(root, f));
const CAST = ["dev", "jonah", "theo", "noa", "priya", "maya"];
export const FIXTURE = join(root, "scripts/fixtures/bad-seed.ts");

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|svelte)$/.test(e.name) ? [join(dir, e.name)] : []));
const rel = (f: string) => f.slice(repo.length + 1);

/** The code without comments; a chat line's message text ([id, day, "HH:MM", sender, text]) is what someone said, not an id. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
    .replace(/^(\s*\["[^"]*",\s*-?\d+,\s*"[^"]*",\s*"[^"]*",\s*)"(?:[^"\\]|\\.)*"/gm, '$1""');

/** "me" written into seed data (an id, a member, a reaction). */
export function seedMe(file: string): string[] {
  const src = code(readFileSync(file, "utf8"));
  const hits = [...src.matchAll(/["'`]me["'`]/g)].length + [...src.matchAll(/re: "[^"]*[ ,]me[,;"]/g)].length;
  return hits ? [`${rel(file)}: "me" in seed data (${hits}); write the wire id`] : [];
}

/** An array literal with three or more cast ids and "me": a hand-written "everyone". */
export function castList(file: string): string[] {
  return [...code(readFileSync(file, "utf8")).matchAll(/\[[^[\]]*\]/g)]
    .filter((m) => /["'`]me["'`]|\bME\b/.test(m[0]) && CAST.filter((id) => new RegExp(`["'\`]${id}["'\`]`).test(m[0])).length >= 3)
    .map((m) => `${rel(file)}: a literal cast list with "me": ${m[0].slice(0, 60)}; use othersOf or castWithViewerFirst`);
}

/** Every problem in the repo, and whether the fixture still fails. */
export function seedIds(): { problems: string[]; fixtureFails: boolean; files: number } {
  const demo = walk(join(repo, "services/demo"));
  const shell = walk(join(root, "src")).filter((f) => !f.includes("/lab/") && !f.endsWith("store/cast.ts"));
  const problems = [...[...SEED, ...demo].flatMap(seedMe), ...[...shell, ...demo].flatMap(castList)];
  return { problems, fixtureFails: seedMe(FIXTURE).length > 0 && castList(FIXTURE).length > 0, files: new Set([...SEED, ...demo, ...shell]).size };
}

if (import.meta.main) {
  const r = seedIds();
  for (const p of r.problems) console.log(`fail: ${p}`);
  if (!r.fixtureFails) console.log("fail: the fixture scripts/fixtures/bad-seed.ts passed");
  if (r.problems.length || !r.fixtureFails) process.exit(1);
  console.log(`ok: seed ids in ${r.files} files`);
}
