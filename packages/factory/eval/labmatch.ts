// Lab match: 12 tools from the earlier taste lab, each rebuilt from only what its original author
// had (the brief, the lab's deck card, the conventions and Meta design rules, the app API and its
// drawing kit), so the result can be compared with the lab original. Never the port's source or
// its spec. Made-up people only.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Member, Surface } from "../src/types.ts";
import type { EvalAsk } from "./asks.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const MUSE = join(ROOT, "muse");

const m = (...names: string[]): Member[] => names.map((name) => ({ id: `m_${name.toLowerCase().replace(/[^a-z]/g, "")}`, name }));

type Spec = { id: string; surface: Surface; members: Member[]; ask: string; title: string };

/** Surfaces are the deck's; people are made up and match the names the briefs use. */
const SPECS: Spec[] = [
  { id: "slot-machine", surface: "chat", members: m("Chris", "Maya", "Dev", "Jess", "Sam"), ask: "muse pick for us", title: "🍕" },
  { id: "potluck", surface: "chat", members: m("Mom", "Uncle T", "Aunt Rosa", "Mia", "Grandpa Joe", "Leo"), ask: "muse who's bringing what for thanksgiving", title: "fam 🏠" },
  { id: "settle-up", surface: "chat", members: m("Priya", "Sam", "Leo", "Kev", "Ana", "Mo"), ask: "ok who owes who", title: "nashville crew" },
  { id: "host-board", surface: "event", members: m("Maya", "Leo", "Ana", "Theo", "Jess"), ask: "muse help me host this", title: "Apt 4B Halloween" },
  { id: "setlist-bingo", surface: "event", members: m("Priya", "Jess", "Lily", "Sam", "Nora", "Dev", "Omar"), ask: "muse make setlist bingo for the show", title: "Khruangbin" },
  { id: "flyer-wall", surface: "group", members: m("Lucia", "Marco", "Ana", "Theo", "Priya", "Sam"), ask: "muse make a flyer for the corkboard", title: "Cal Salsa Club" },
  { id: "signup-board", surface: "group", members: m("Kim", "Leo", "Ana", "Sam", "Theo", "Maya"), ask: "muse make a sign up for move-in shifts", title: "Unit 2 Move-In Volunteers" },
  { id: "face-drop", surface: "story", members: m("Kev", "Bryan", "Marcus", "Dev", "Priya"), ask: "muse drop everyone's faces in", title: "Kev's story" },
  { id: "trip-story", surface: "story", members: m("Priya", "Sam", "Leo", "Ana", "Kev"), ask: "muse make a story of the nashville trip", title: "Priya's story" },
  { id: "friend-trivia-pub", surface: "gaming", members: m("Leo", "Ana", "Sam", "Theo", "Maya"), ask: "muse make trivia about us", title: "How well do you know Unit 7?" },
  { id: "daily-puzzle", surface: "gaming", members: m("Leo", "Ana", "Sam", "Theo"), ask: "muse make a daily puzzle from our chat", title: "Chatdle" },
  { id: "room-fit", surface: "marketplace", members: m("Mia", "Jess", "Leo", "Ana"), ask: "will this fit in our room", title: "IKEA KALLAX shelf" },
];

type Card = { id: string; app?: string; surface?: string; chat?: string; desc?: string; say?: string; ctx?: Record<string, string>; thread?: [string, string][] };

function deckCard(id: string): Card | null {
  for (const f of ["deck.json", "deck-round2.json", "deck-round3.json"]) {
    const p = join(MUSE, "lab", f);
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, "utf8")) as { cards?: Card[] };
    const c = (d.cards ?? []).find((c) => c.id === id || c.app === id);
    if (c) return c;
  }
  return null;
}

/** The brief paragraph for an id from muse/BRIEFS*.md, with its section heading. */
function briefText(id: string): string {
  for (const f of ["BRIEFS.md", "BRIEFS-R2.md", "BRIEFS-R3.md"]) {
    const lines = readFileSync(join(MUSE, f), "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith(`- **${id}**`));
    if (i < 0) continue;
    const out = [lines[i]!];
    for (let k = i + 1; k < lines.length && lines[k]!.startsWith("  "); k++) out.push(lines[k]!);
    const heading = [...lines.slice(0, i)].reverse().find((l) => l.startsWith("## "));
    return `${heading ? `${heading.replace(/^## /, "")}: ` : ""}${out.join("\n").replace(/\s+/g, " ")}`;
  }
  return "";
}

/** The moment for any lab tool id, as testers and authors had it: the brief if there is one, the deck card otherwise. */
export function labContext(id: string): string {
  const card = deckCard(id);
  const parts = [
    briefText(id) && `Brief: ${briefText(id)}`,
    card?.desc && `What testers were told it is: ${card.desc}`,
    card?.chat && `Where: ${card.surface ?? ""} ${card.chat}`,
    card?.thread?.length ? `Chat: ${card.thread.map(([a, b]) => `${a}: ${b}`).join(" / ")}` : "",
  ].filter(Boolean);
  return parts.join("\n") || id;
}

export type LabTool = EvalAsk & { brief: string; original: { rest: string; after: string } };

export const LAB_TOOLS: LabTool[] = SPECS.map((s) => {
  const card = deckCard(s.id);
  const brief = [
    briefText(s.id) && `Brief: ${briefText(s.id)}`,
    card?.desc && `What testers were told it is: ${card.desc}`,
    card?.ctx && Object.keys(card.ctx).length ? `Where it appears (${card.surface ?? s.surface}): ${Object.entries(card.ctx).filter(([k]) => k !== "art").map(([k, v]) => `${k}: ${v}`).join(" · ")}` : "",
    card?.say && `Muse's line in the thread: "${card.say}"`,
  ]
    .filter(Boolean)
    .join("\n");
  const thread = (card?.thread ?? []).map(([from, text]) => ({ from, text }));
  const messages = thread.length ? [...thread] : [{ from: s.members[0]!.name, text: s.ask }];
  if (thread.length && !thread.some((t) => t.text === s.ask)) messages.push({ from: s.members[0]!.name, text: s.ask });
  return {
    id: s.id,
    expect: "build" as const,
    surface: s.surface,
    members: s.members,
    ask: s.ask,
    chat: { title: s.title, messages },
    brief,
    original: { rest: join(ROOT, "library", "lab", "_shots", s.id, "original-rest.png"), after: join(ROOT, "library", "lab", "_shots", s.id, "original-after.png") },
  };
});

/**
 * The generalization set: round-4 briefs (scripts/labport/BRIEFS-R4.md). No originals exist and
 * nothing was tuned on them. The first brief of each chosen section, with the file's own cast.
 */
const R4_SECTIONS = ["apps16", "apps17", "apps18", "apps19", "apps20", "apps21", "apps24", "apps26"];
const R4_SURFACE: [RegExp, Surface][] = [[/Events/, "event"], [/Marketplace/, "marketplace"], [/Stories|Reels/, "story"], [/Gaming/, "gaming"], [/Groups/, "group"], [/feed/i, "feed"]];
export function r4Tools(): LabTool[] {
  const lines = readFileSync(join(ROOT, "scripts", "labport", "BRIEFS-R4.md"), "utf8").split("\n");
  const cast = m("Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya");
  const out: LabTool[] = [];
  for (const sec of R4_SECTIONS) {
    const h = lines.findIndex((l) => l.startsWith(`## ${sec} `));
    if (h < 0) continue;
    const i = lines.findIndex((l, k) => k > h && l.startsWith("- **"));
    const entry = [lines[i]!];
    for (let k = i + 1; k < lines.length && lines[k]!.startsWith("  "); k++) entry.push(lines[k]!);
    const text = entry.join(" ").replace(/\s+/g, " ");
    const id = /\*\*([^*]+)\*\*/.exec(text)?.[1] ?? sec;
    const chatName = /· "([^"]+)"/.exec(text)?.[1] ?? "the six";
    const surface = R4_SURFACE.find(([re]) => re.test(lines[h]!))?.[1] ?? "chat";
    out.push({
      id, expect: "build", surface, members: cast, ask: "muse", chat: { title: chatName, messages: [{ from: "Maya", text: "muse" }] },
      brief: `Brief: ${lines[h]!.replace(/^## /, "")}: ${text}\nCast: six friends, juniors at Eastfield (a college town): Aditya, Calvin, Arun, Tsai Lin, Will, Maya. Running jokes: Arun's rice cooker, Calvin's seven alarms, Will's 25-minute showers and his Subaru ("the Sube"), Maya's color-coded spreadsheets, Tsai Lin's veto on the aux, Aditya replying "lowkey" to everything.`,
      original: { rest: "", after: "" },
    });
  }
  return out;
}
