// bun eval/routing.ts [--router muse:muse-ember-1.0] [--only keyword,tfidf,router]: routing accuracy on
// eval/routing-asks.ts for the keyword lane, the TF-IDF lookup (library/cache/lookup.ts, its cached
// tool ids mapped to the lab tool they came from) and the model router (picks only, no fill).
// Top-1 and top-3 on asks that have a right tool; "nothing fits" accuracy on the ones that do not;
// median latency. Writes eval/out/routing.json.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { find, THRESHOLD } from "../../../library/cache/lookup.ts";
import { fastLabs } from "../src/lab.ts";
import { catalog, route } from "../src/router.ts";
import { makeModel } from "../src/models/index.ts";
import type { GenerateRequest } from "../src/types.ts";
import { ROUTING_ASKS, type RoutingAsk } from "./routing-asks.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = new Set((arg("only") ?? "keyword,tfidf,router").split(","));
const routerCfg = arg("router") ?? "muse:muse-ember-1.0";
const members = ["Maya", "Aditya", "Calvin", "Will", "Arun"].map((name) => ({ id: name.toLowerCase(), name }));
const labIds = new Set(catalog().map((c) => c.id));

const reqOf = (a: RoutingAsk): GenerateRequest => ({
  ask: a.ask,
  surface: a.surface ?? "chat",
  members,
  chat: { title: "the group", messages: (a.chat ?? []).map((text, i) => ({ from: members[i % members.length]!.name, text })) },
});

type Answer = { ids: string[]; none: boolean; ms: number };
type Method = (a: RoutingAsk) => Promise<Answer>;

const keyword: Method = async (a) => {
  const t = performance.now();
  const ids = [...new Set(fastLabs(reqOf(a)).map((f) => f.lab.id))].slice(0, 3);
  return { ids, none: ids.length === 0, ms: performance.now() - t };
};

const tfidf: Method = async (a) => {
  const t = performance.now();
  const r = reqOf(a);
  const c = find(r.ask, r.chat, r.members, { limit: 6 });
  const ids = [...new Set(c.map((x) => x.id.replace(/-\d+$/, "")).filter((id) => labIds.has(id)))].slice(0, 3);
  const none = !c[0] || c[0].confidence < THRESHOLD || ids.length === 0;
  // ids regardless of the threshold (its own calibration says "nothing" for most); none from the threshold
  return { ids, none, ms: performance.now() - t };
};

const model = only.has("router") ? makeModel(routerCfg) : null;
const router: Method = async (a) => {
  const d = await route(reqOf(a), model!, { fill: false });
  return { ids: d.picks.map((p) => p.id), none: d.nothingFits || d.picks.length === 0, ms: d.ms };
};

async function run(name: string, m: Method, parallel: number) {
  const out: (Answer & { ask: string; ok: string[] })[] = new Array(ROUTING_ASKS.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (;;) {
        const i = next++;
        if (i >= ROUTING_ASKS.length) return;
        const a = ROUTING_ASKS[i]!;
        out[i] = { ...(await m(a)), ask: a.ask, ok: a.ok };
      }
    }),
  );
  const has = out.filter((x) => x.ok.length);
  const no = out.filter((x) => !x.ok.length);
  const top1 = has.filter((x) => x.ids[0] && x.ok.includes(x.ids[0])).length;
  const top3 = has.filter((x) => x.ids.slice(0, 3).some((id) => x.ok.includes(id))).length;
  const none = no.filter((x) => x.none).length;
  const ms = out.map((x) => x.ms).sort((p, q) => p - q);
  const median = Math.round(ms[Math.floor(ms.length / 2)] ?? 0);
  return { name, top1: `${top1} of ${has.length}`, top3: `${top3} of ${has.length}`, nothingFits: `${none} of ${no.length}`, medianMs: median, rows: out };
}

const results = [];
if (only.has("keyword")) results.push(await run("keyword lane", keyword, 1));
if (only.has("tfidf")) results.push(await run("TF-IDF lookup", tfidf, 1));
if (only.has("router")) results.push(await run(`router (${routerCfg})`, router, Number(arg("parallel") ?? 4)));

console.log(`\n${ROUTING_ASKS.length} asks, ${ROUTING_ASKS.filter((a) => a.ok.length).length} with a right tool, ${ROUTING_ASKS.filter((a) => !a.ok.length).length} where nothing fits\n`);
console.log("| method | top-1 | top-3 | nothing fits | median ms |\n| --- | --- | --- | --- | --- |");
for (const r of results) console.log(`| ${r.name} | ${r.top1} | ${r.top3} | ${r.nothingFits} | ${r.medianMs} |`);
for (const r of results) {
  const misses = r.rows.filter((x) => (x.ok.length ? !(x.ids[0] && x.ok.includes(x.ids[0])) : !x.none));
  console.log(`\n${r.name} misses (${misses.length}):`);
  for (const x of misses.slice(0, 40)) console.log(`  "${x.ask}" -> ${x.ids.join(", ") || "nothing"} (want ${x.ok.join("|") || "nothing"})`);
}
const dir = join(import.meta.dir, "out");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "routing.json"), JSON.stringify(results, null, 1));
process.exit(0);
