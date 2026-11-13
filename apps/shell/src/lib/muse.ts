import type { Message, ToolTemplate } from "../store/types";

/** Leading "muse" or "@Muse" at the start of a message addresses Muse. */
const MENTION = /^(\s*)(@?muse)\b/i;

export const isMention = (text: string) => MENTION.test(text);

/** Splits a leading mention off a message: `{ lead: "Muse", rest: " pick a place" }`. */
export function splitMention(text: string): { lead: string; rest: string } | null {
  const m = MENTION.exec(text);
  if (!m) return null;
  return { lead: text.slice(0, m[0].length), rest: text.slice(m[0].length) };
}

/** Picks a template id for a request. The real factory reads the whole message; this is a keyword stand-in. */
export function inferTemplate(text: string): string {
  const t = text.toLowerCase();
  if (/\b(split|owe|bill|venmo|pay|rent|groceries)\b/.test(t)) return "bill-split";
  if (/\b(chore|dish|dishes|clean|trash|bins?)\b/.test(t)) return "chore-wheel";
  if (/\b(who'?s in|going|concert|show|rsvp|tickets?|coming)\b/.test(t)) return "whos-in";
  if (/\b(bracket|rank|tournament|best)\b/.test(t)) return "bracket";
  if (/\b(pick|choose|decide|eat|food|dinner|lunch|where)\b/.test(t)) return "pick-for-us";
  return "poll";
}

const DEFER = /\b(idk|dunno|i don'?t (know|care)|u pick|you pick|no u|your call|ur call|up to you|whatever|anything)\b/i;
const QUESTION = /\b(where|what|which|when|who)\b.*|\?$/i;

/**
 * Does the end of this chat look stuck: someone asks, then people hand the choice back and forth.
 * Looks only at the last four text messages from the last 30 minutes, and never when Muse already answered.
 */
export function looksStuck(messages: readonly Message[]): boolean {
  const recent = messages.filter((m) => m.kind !== "system" && m.kind !== "activity").slice(-4);
  const last = recent.at(-1);
  if (!last || last.kind !== "text") return false;
  const tail = recent.filter((m) => m.kind === "text" && last.at - m.at <= 30 * 60_000);
  const defers = tail.filter((m) => DEFER.test(m.text ?? "")).length;
  const asked = tail.some((m) => QUESTION.test(m.text ?? "") && !DEFER.test(m.text ?? ""));
  const people = new Set(tail.map((m) => m.from)).size;
  return asked && defers >= 2 && people >= 2;
}

export const TEMPLATES: ToolTemplate[] = [
  { id: "chore-wheel", name: "Chore wheel", blurb: "Spin for who does what", made: "made a chore wheel", summary: () => "spin to start", needsMe: true },
  { id: "whos-in", name: "Who's in", blurb: "Count who's coming", made: "made a who's in", summary: (n) => `0 of ${n} in`, needsMe: true },
  { id: "pick-for-us", name: "Pick for us", blurb: "Settle where to go", made: "made a picker", summary: () => "ready to pick", needsMe: false },
  { id: "bracket", name: "Bracket", blurb: "Settle it with a vote", made: "made a bracket", summary: () => "round 1 · vote", needsMe: true },
  { id: "bill-split", name: "Bill split", blurb: "Split what you owe", made: "made a bill split", summary: () => "add what you paid", needsMe: false },
  { id: "poll", name: "Quick poll", blurb: "Ask the group", made: "made a poll", summary: () => "no votes yet", needsMe: true },
];
export const template = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;

/** How long the "Muse is building" state shows. The real pipeline replaces this with the factory's progress. */
export const BUILD_MS = 1600;

/**
 * What a chat offers for adding a tool: lab tools only, by their real names (library/lab/<id>/meta.json).
 * The id is the lab tool's id. `words` read the last messages to pick the chips above the composer.
 */
export type LabItem = ToolTemplate & { words: RegExp };
const lab = (id: string, name: string, blurb: string, words: RegExp): LabItem => ({ id, name, blurb, made: `made ${name.toLowerCase()}`, summary: () => "ready", needsMe: false, words });
export const LAB_MENU: LabItem[] = [
  lab("slot-machine", "Plan slot machine", "Spin to pick where to go and what to do", /\b(pick|where|eat|food|dinner|lunch|tonight|plan|idk|decide)\b/i),
  lab("squad-lock", "Go with friends", "See who is going and lock it in", /\b(who'?s in|going|concert|show|tickets?|coming|rsvp|in for)\b/i),
  lab("settle-up", "Settle up", "Split what you owe with the fewest payments", /\b(split|owe|bill|venmo|pay|paid|rent|tab|groceries)\b/i),
  lab("chore-wheel", "Chore wheel", "Spin for who does which chore", /\b(chores?|dish|dishes|clean|trash|bins?)\b/i),
  lab("meeting-time", "Weekly meeting", "Find the time most people can make", /\b(when|meet|free|schedule|weekly|available)\b/i),
  lab("tier-list", "Tier list", "Everyone ranks it, then see where you disagree", /\b(rank|best|worst|tier|better)\b/i),
  lab("movie-bracket", "Movie night bracket", "Vote head to head until one is left", /\b(movies?|watch|bracket|tournament|film|show)\b/i),
  lab("over-under", "Over/under book", "Bet points on friends for fun", /\b(bet|wager|odds|over|under)\b/i),
  lab("imposter", "Imposter", "A quick party game on everyone's phone", /\b(bored|game|games|play)\b/i),
  lab("trip-draft", "Trip snake draft", "Take turns picking what to do on a trip", /\b(trip|travel|weekend|flight|airbnb|vacation)\b/i),
];
export const labItem = (id: string) => LAB_MENU.find((t) => t.id === id);
/** Old plain template ids still used by events and notes, mapped to the lab tool a person sees. */
export const LAB_FOR_PLAIN: Record<string, string> = { "pick-for-us": "slot-machine", "whos-in": "squad-lock", "bill-split": "settle-up", "chore-wheel": "chore-wheel", bracket: "movie-bracket", poll: "tier-list" };

/** Two or three tools worth offering after the last few messages, best first. */
export function labChips(messages: readonly Message[]): LabItem[] {
  const recent = messages.filter((m) => m.kind === "text").slice(-6);
  const scored = LAB_MENU.map((t) => ({ t, n: recent.reduce((s, m, i) => s + (t.words.test(m.text ?? "") ? i + 1 : 0), 0) + (t.id === "slot-machine" && looksStuck(messages) ? 100 : 0) }));
  return scored.filter((s) => s.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map((s) => s.t);
}
