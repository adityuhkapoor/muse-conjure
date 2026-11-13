// bun services/demo/check-pack.ts [--all] [--only=id,id]: every scenario in the catalysts' pack
// (apps/shell/src/muse/pack.ts), filled from its seeded page, through the tool the loader would
// pick right now, through the whole gate, and then mounted the way the shell mounts it
// (mount-check.ts: the shipped frame runtime, the cast with their faces, each viewer and a post's
// author, phone and desktop widths). Prints the choice per scenario (lab or piece) and exits 1 if
// any fails. `--all` also gates each scenario's other available choices (the fallbacks). The
// must-fail fixtures (--self-test): params that break a piece, and a lab tool that throws as it opens.

import { CHAT_MEMBERS, EVENT, PEOPLE, seedEvents } from "../../apps/shell/src/store/fake-data.ts";
import { eventContext, gamingContext, groupContext, listingContext, postContext, reelContext, storyContext } from "../../apps/shell/src/muse/context.ts";
import { PACK } from "../../apps/shell/src/muse/pack.ts";
import { BDAY21, FEED_POSTS, POTLUCK, RECIPE_REEL, TRIP } from "../../apps/shell/src/muse/seed.ts";
import type { PageContext, Scenario } from "../../apps/shell/src/muse/types.ts";
import { ME } from "../../apps/shell/src/store/types.ts";
import { viewerId } from "../../apps/shell/src/lib/media.ts";
import { GROUPS, LISTINGS, REELS, STORIES, STRANGERS } from "../../apps/shell/src/surfaces/data.ts";
import { CAST_IDS } from "../../apps/shell/src/store/cast.ts";
import { available, sourceOf, type Choice } from "./premade.ts";
import { closeMountCheck, mountCheck } from "./mount-check.ts";
import { plainTools } from "../../apps/shell/scripts/lab-only.ts";
import { compileApp } from "@muse/sandbox/compile";

const args = process.argv.slice(2);
const all = args.includes("--all");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const NAMES: Record<string, string> = Object.fromEntries([...PEOPLE, ...STRANGERS].map((p) => [p.id, p.first]));
// contexts name the viewer "me" (the store's name for whoever views); here that is the default viewer
const nameOf = (id: string) => NAMES[id === ME ? viewerId() : id] ?? id;

/** The cast as the shell sends them to a tool: wire ids and first names. */
const CAST = CAST_IDS.map((id) => ({ id, name: nameOf(id) }));
/** A post's author, as a viewer: the author is offered the tool for their own post. */
const authorOf = (c: PageContext) => (c.object.kind === "post" ? [FEED_POSTS.find((p) => p.id === c.object.id)?.by ?? viewerId()] : []);

/** The seeded page each scenario is made from. */
export function pageFor(s: Scenario): PageContext {
  const ev = { ...EVENT, friends: ["maya", "theo", "priya"] };
  const potluck = { ...POTLUCK, start: EVENT.start + 86_400_000, friends: POTLUCK.friends };
  const sectional = LISTINGS.find((l) => l.id === "l-sectional")!;
  const loveseat = LISTINGS.find((l) => l.id === "l-loveseat")!;
  const post = (kind: string) => FEED_POSTS.find((p) => p.kind === kind)!;
  const reel = (id: string) => [...REELS, RECIPE_REEL].find((r) => r.id === id)!;
  const shared = { chatId: "apt4b", chatName: "apt 4b", members: [...CHAT_MEMBERS.apt4b!], reelsInChat: REELS.map((r) => ({ id: r.id, caption: r.caption })), nameOf };
  switch (s.surface) {
    case "event":
      if (s.id === "event-host") return eventContext(seedEvents().find((e) => e.id === BDAY21.id)!, { rsvp: "going", now: EVENT.start, nameOf });
      return s.id === "event-bring-list" || s.id === "event-open-spots" ? eventContext(potluck, { rsvp: "going", now: EVENT.start, nameOf }) : eventContext(ev, { rsvp: "going", now: EVENT.start - 86_400_000, nameOf });
    case "group": {
      const g = GROUPS.find((x) => x.id === (s.id === "group-sublet-finder" || s.id === "group-roommates" ? "sublets" : "climb"))!;
      return { ...groupContext(g, { draft: "", nameOf }), facts: { ...groupContext(g, { draft: "", nameOf }).facts, ask: "find me a june sublet under 1400" } };
    }
    case "marketplace":
      if (s.id === "mp-lineage") return listingContext(loveseat, { saved: [loveseat], isSaved: true, nameOf });
      return listingContext(sectional, { saved: [sectional, loveseat], isSaved: true, nameOf });
    case "feed":
      return postContext(post({ "feed-ranking": "ranking", "feed-birthday": "birthday", "feed-move": "move", "feed-challenge": "challenge", "feed-plan": "plan" }[s.id] ?? "ranking"), { liked: true, nameOf });
    case "reel":
      return reelContext(reel({ "reel-cook-night": "r-noodles", "reel-hike": "r-hike" }[s.id] ?? "r-dumplings"), shared);
    case "story": {
      // the plan is made by the poll's author (Aditya), from his own story
      const st = s.id === "story-plan" ? STORIES.find((x) => x.poll)! : { id: TRIP.storyId, by: TRIP.by, caption: TRIP.caption, tone: 1 as const };
      return storyContext(st, { nameOf, viewer: st.by });
    }
    default:
      return gamingContext({ nameOf, chats: [{ id: "apt4b", name: "apt 4b", members: CHAT_MEMBERS.apt4b! }] });
  }
}

export function choicesFor(s: Scenario, c: PageContext): Choice[] {
  return s.tools.map((t) => ({ tool: t.tool, params: t.params(c) }));
}

if (import.meta.main) {
  const { verify, warm, shutdown } = await import("@muse/verify");
  await warm();
  const selfTest = args.includes("--self-test");
  const rows: string[] = [];
  let failed = 0;
  const gate = async (label: string, source: string, story = false) => {
    // A story frame may be 600 tall (CONTRACTS section 3); the gate measures for a chat (420), so too-tall only warns there.
    const r = await verify(source, { artifacts: false, stageTimeoutMs: 12_000, ...(story ? { rules: { "too-tall": "warn" as const } } : {}) }); // other gates may share the machine
    const f = r.failures[0];
    return { ok: r.ok, line: `${label}: ${r.ok ? "ok" : `FAIL ${r.stage} ${f?.rule ?? ""} ${(f?.message ?? "").slice(0, 160)}`}${r.mutation ? ` (mutation ${r.mutation.score.toFixed(2)})` : ""}` };
  };
  if (selfTest) {
    const s = PACK.find((x) => x.id === "event-go-together")!;
    const bad = await sourceOf({ tool: "piece:lock", params: { title: "", detail: "", need: 0 } }).then((src) => src.replace("defineApp", "defineApp // broken\nconst x: number = 'no';\n"));
    const r = await gate(`self-test ${s.id} broken`, bad);
    console.log(r.line);
    // The mount check's fixture: a lab tool that throws as it opens must fail it.
    const throws = (await sourceOf({ tool: "lab:move-in-day", params: {} })).replace("init: (ctx) => {", "init: (ctx) => {\n    if (ctx) throw new Error(\"broken on mount\");");
    const m = await mountCheck(throws, { members: CAST, viewers: ["noa"] });
    console.log(`self-test mount: ${m.ok ? "ok (should have failed)" : `FAIL ${m.detail}`}`);
    await closeMountCheck();
    await shutdown();
    process.exit(r.ok || m.ok ? 1 : 0);
  }
  // The owner's rule: lab tools only, on every scenario, moment and surface tool (apps/shell/scripts/lab-only.ts).
  for (const x of plainTools()) {
    rows.push(`FAIL ${x}`);
    failed++;
    console.log(rows.at(-1));
  }
  for (const s of PACK) {
    if (only && !only.includes(s.id)) continue;
    const c = pageFor(s);
    const choices = choicesFor(s, c).filter((x) => available(x.tool));
    // Every lab choice builds with the params it is given, not only the one picked now.
    for (const ch of choicesFor(s, c).filter((x) => x.tool.startsWith("lab:"))) {
      try {
        compileApp(await sourceOf(ch));
      } catch (e) {
        rows.push(`${s.id} -> ${ch.tool}: FAIL build ${(e as Error).message.slice(0, 160)}`);
        failed++;
        console.log(rows.at(-1));
      }
    }
    if (!choices.length) {
      rows.push(`${s.id}: FAIL no available tool (${s.tools.map((t) => t.tool).join(", ")})`);
      failed++;
      console.log(rows.at(-1));
      continue;
    }
    for (const [i, ch] of (all ? choices : choices.slice(0, 1)).entries()) {
      try {
        // Story and reel tools are drawn for a 9:16 frame (up to 600 tall, CONTRACTS section 3).
        if (!i && ch.tool.startsWith("piece:")) {
          rows.push(`${s.id}: FAIL resolves to a plain ${ch.tool} (no lab tool listed or passing)`);
          failed++;
          console.log(rows.at(-1));
        }
        const src = await sourceOf(ch);
        const r = await gate(`${s.id} -> ${ch.tool}${i ? " (fallback)" : ""}`, src, s.surface === "story" || s.surface === "reel");
        rows.push(r.line);
        if (!r.ok) failed++;
        // Then mounted as the shell mounts it: its frame runtime, the cast as members, each viewer (the post's author too).
        if (r.ok) {
          const m = await mountCheck(src, { members: CAST, viewers: [...new Set(["noa", "dev", ...authorOf(c)])] });
          if (!m.ok) {
            rows.push(`${s.id} -> ${ch.tool}: FAIL mount ${m.detail}`);
            failed++;
          }
        }
      } catch (e) {
        rows.push(`${s.id} -> ${ch.tool}: FAIL ${(e as Error).message.slice(0, 200)}`);
        failed++;
      }
      console.log(rows.at(-1));
    }
  }
  await closeMountCheck();
  await shutdown();
  console.log(`\n${PACK.length} scenarios, ${failed} failing`);
  process.exit(failed ? 1 : 0);
}
