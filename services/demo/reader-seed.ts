// Seeded pages read instantly: the reader's answer for every seeded page object (each post, event,
// group, listing, reel and story, in the states a viewer reaches by default: opened, liked, saved,
// interested, going), built from the same contexts the shell builds (apps/shell/src/muse), stored
// in reader-answers.json. The gateway's reader answers these without a model, so the first paint
// works with --model replay.
//
//   bun services/demo/reader-seed.ts [--force]   read every seeded page with the live models and store it
//
// seed-catalysts.ts calls `seedReader` at seed time: the stored answers are loaded, and pages
// without one (a seed that changed) are read in the background when a model is available.

import { eventContext, groupContext, listingContext, postContext, reelContext, storyContext } from "../../apps/shell/src/muse/context.ts";
import { readerInput } from "../../apps/shell/src/muse/reader-text.ts";
import { FEED_POSTS } from "../../apps/shell/src/muse/seed.ts";
import type { PageContext } from "../../apps/shell/src/muse/types.ts";
import { ME } from "../../apps/shell/src/store/types.ts";
import { viewerId } from "../../apps/shell/src/lib/media.ts";
import { PEOPLE, seedEvents } from "../../apps/shell/src/store/fake-data.ts";
import { GROUPS, LISTINGS, REELS, STORIES, STRANGERS } from "../../apps/shell/src/surfaces/data.ts";
import { loadSeedAnswers, readerConfigs, readKey, readPage, saveSeedAnswers, storedKeys, storedOf, type ReadInput } from "./reader.ts";

const FIRST: Record<string, string> = Object.fromEntries([...PEOPLE, ...STRANGERS].map((p) => [p.id, p.first]));
// contexts name the viewer "me" (the store's name for whoever views); here that is the default viewer
const nameOf = (id: string) => FIRST[id === ME ? viewerId() : id] ?? id;

/** Every seeded page object in the states the shell reads it in. */
export function seededContexts(now = Date.now()): PageContext[] {
  const out: PageContext[] = [];
  for (const p of FEED_POSTS) for (const liked of [false, true]) out.push(postContext(p, { liked, nameOf }));
  for (const ev of seedEvents()) for (const rsvp of [null, "interested", "going"] as const) out.push(eventContext(ev, { rsvp, now, nameOf, viewer: "noa" }));
  for (const g of GROUPS) out.push(groupContext(g, { draft: "", nameOf }));
  for (const l of LISTINGS) {
    out.push(listingContext(l, { saved: [], isSaved: false, nameOf }));
    out.push(listingContext(l, { saved: [l], isSaved: true, nameOf }));
  }
  for (const r of REELS) out.push(reelContext(r, { nameOf }));
  for (const s of STORIES) {
    out.push(storyContext(s, { nameOf }));
  }
  return out;
}

export const seededInputs = (now = Date.now()): ReadInput[] => seededContexts(now).map((c) => readerInput(c) as ReadInput);

/** Read the seeded pages that have no stored answer (all with `force`) and store them. */
export async function precomputeReader(o: { force?: boolean; parallel?: number; log?: (s: string) => void } = {}): Promise<{ read: number; stored: number }> {
  const log = o.log ?? console.log;
  loadSeedAnswers();
  const have = storedKeys();
  const todo = seededInputs().filter((i) => o.force || !have.has(readKey(i)));
  let next = 0;
  const fresh: Record<string, ReturnType<typeof storedOf>> = {};
  await Promise.all(
    Array.from({ length: o.parallel ?? 5 }, async () => {
      for (;;) {
        const i = todo[next++];
        if (!i) return;
        const a = await readPage(i, { fresh: true });
        if (a.source !== "live") continue;
        fresh[a.key] = storedOf(i, a);
        log(`reader: ${i.object.kind}:${i.object.id} [${i.did.join(", ")}] -> ${a.offers.map((x) => `${x.tool} "${x.label}"`).join(", ") || "nothing"}`);
      }
    }),
  );
  if (Object.keys(fresh).length) saveSeedAnswers(fresh);
  return { read: Object.keys(fresh).length, stored: storedKeys().size };
}

/** The seed step: stored answers in, missing ones read in the background when a model is there. */
export function seedReader(log: (s: string) => void = console.log): void {
  const n = loadSeedAnswers();
  const have = storedKeys();
  const missing = seededInputs().filter((i) => !have.has(readKey(i))).length;
  log(`reader: ${n} stored answers for seeded pages, ${missing} to read${missing && !readerConfigs() ? " (no model: the rules answer them)" : ""}`);
  if (missing && readerConfigs()) void precomputeReader({ log: () => {} }).then((x) => log(`reader: read ${x.read} seeded pages`), () => {});
}

if (import.meta.main) {
  const t0 = performance.now();
  const x = await precomputeReader({ force: process.argv.includes("--force") });
  console.log(`read ${x.read} seeded pages in ${Math.round((performance.now() - t0) / 1000)} s; ${x.stored} stored`);
  process.exit(0);
}
