// bun src/judge.ts --out <name> [--judge muse:muse-spark-1.3] [--concurrency 3]
//
// Scores every tool under eval/out/<name>/ with one fixed judge, so before and after are graded the
// same way: the judge sees the chat, the ask and the tool's pictures (393 px, at rest and after
// taps) and scores the critic's rubric 1 to 5. Also per tool: the owner's taste model on its copy
// and look (with uncertainty), and sameness: how close its building blocks are to the nearest other
// tool from the same config (0 alike, 1 different). Writes eval/out/<name>/scores.json.
// Judge replies are cached on disk by request hash.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { askSet, loadRows, type BenchRow } from "./bench.ts";
import { CachedClient } from "./cache.ts";
import { CRITERIA, CRITIC_SCHEMA, meanScore, tasteOf, type Critique } from "./compose.ts";
import { closeShoot, sheet } from "./look/shoot.ts";
import { MuseClient } from "./models/muse.ts";
import { chatContext } from "./prompts.ts";
import { skill } from "./kb.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};

export type Scored = BenchRow & { judge: Critique | null; critic: number | null; taste: ReturnType<typeof tasteOf> | null; distinct: number | null };

/** The building blocks a tool is made of: what it imports from @muse/app and a few layout habits. */
export function blocks(source: string): Set<string> {
  const out = new Set<string>();
  const imp = /import\s*\{([^}]*)\}\s*from\s*"@muse\/app"/.exec(source)?.[1] ?? "";
  for (const n of imp.split(",").map((s) => s.trim().replace(/^type\s+/, ""))) if (n && !/^(defineApp|h|Fragment|rng|type)$/.test(n)) out.add(n);
  for (const [k, re] of [["svg", /<svg\b/], ["grid", /gridTemplate/], ["canvas-draw", /\bdraw=/], ["rows-map", /\.map\(\([^)]*\)\s*=>\s*\(?\s*<OptionRow/], ["absolute", /position:\s*"absolute"/], ["transform", /transform:/]] as const)
    if (re.test(source)) out.add(k);
  return out;
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / Math.max(1, new Set([...a, ...b]).size);
};

export function loadScores(name: string): Scored[] {
  const f = join(import.meta.dir, "..", "eval", "out", name, "scores.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Scored[]) : [];
}

if (import.meta.main) {
  const name = arg("out", "baseline");
  const dir = join(import.meta.dir, "..", "eval", "out", name);
  const judgeModel = arg("judge", "muse:muse-spark-1.3");
  const judge = new CachedClient(new MuseClient({ model: judgeModel.split(":")[1] ?? "muse-spark-1.3", timeoutMs: 300_000 }));
  const rows = loadRows(name);
  const out: Scored[] = rows.map((r) => ({ ...r, judge: null, critic: null, taste: null, distinct: null }));
  const sources = new Map<string, string>();
  for (const r of out) {
    const f = join(dir, r.config, `${r.ask}.tsx`);
    if (existsSync(f)) sources.set(`${r.config}/${r.ask}`, readFileSync(f, "utf8"));
  }
  // Sameness inside each config.
  for (const r of out) {
    const s = sources.get(`${r.config}/${r.ask}`);
    if (!s || !r.ok) continue;
    const mine = blocks(s);
    const others = out.filter((o) => o.config === r.config && o.ask !== r.ask && o.ok && sources.has(`${o.config}/${o.ask}`));
    const closest = Math.max(0, ...others.map((o) => jaccard(mine, blocks(sources.get(`${o.config}/${o.ask}`)!))));
    r.distinct = Math.round((1 - closest) * 100) / 100;
    r.taste = tasteOf(s);
  }
  const skillText = skill("meta-visual-language").slice(0, 3500);
  let next = 0;
  const conc = Math.min(3, Number(arg("concurrency", "3")));
  const work = async () => {
    while (next < out.length) {
      const r = out[next++]!;
      if (!r.ok || !r.shots.length) continue;
      const a = askSet().find((x) => x.id === r.ask)!;
      const pngs = r.shots.map((f) => new Uint8Array(readFileSync(join(dir, r.config, f))));
      const png = await sheet(
        r.shots.map((f, i) => ({ title: f.includes(".rest.") ? "At rest" : "After taps", png: pngs[i]! })),
        { columns: 2 },
      );
      const prompt = [
        "You judge a small live tool that Muse built inside Messenger or Facebook for a group chat. The image shows it at 393 px wide, at rest (nobody has tapped yet) and after a few people tapped.",
        "The moment it was made for:",
        chatContext(a),
        "Meta's visual language, in short:",
        skillText,
        `Score each criterion from 1 (poor) to 5 (excellent), comparing against the best small tools you can imagine for this exact moment:
- made_for_moment: uses this chat's names, options and facts; would feel wrong in another chat.
- visual_idea: the picture fits the moment and carries the job; rows only where rows are right.
- hierarchy: one clear focal point, state readable at a glance, one primary action.
- density: fits the card without crowding or emptiness; nothing clipped or overlapping.
- empty_state: the at-rest picture already looks like the tool and says how to start.
- copy_voice: plain, sentence case, short buttons, no hype, no jokes on anyone's behalf.
- meta_native: flat, one accent, calm, looks like a feature Meta shipped.
Then up to 3 fixes (scene, where, problem, fix) and a one-sentence verdict. JSON only.`,
      ].join("\n\n");
      try {
        const reply = await judge.complete({
          system: "You are a strict, fair product design judge. JSON only.",
          messages: [{ role: "user", content: prompt }],
          images: [`data:image/png;base64,${Buffer.from(png).toString("base64")}`],
          json: { name: "critique", schema: CRITIC_SCHEMA },
          effort: "low",
          label: "judge",
        });
        const j = JSON.parse(reply) as Critique;
        r.judge = j;
        r.critic = meanScore(j);
        console.error(`${r.config} ${r.ask}: ${r.critic} ${CRITERIA.map((c) => j.scores[c]).join(" ")}`);
      } catch (e) {
        console.error(`judge failed for ${r.config} ${r.ask}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: conc }, work));
  writeFileSync(join(dir, "scores.json"), JSON.stringify(out, null, 1));
  console.error(`wrote ${join(dir, "scores.json")} · judge hits ${judge.hits}, misses ${judge.misses}`);
  await closeShoot();
}
