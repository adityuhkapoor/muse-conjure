// What the friends say: short lines by situation, in the voice of college friends texting
// (lowercase, clipped, uneven, an occasional typo). Filled with real facts from the tool, never
// invented ones. Few lines on purpose: the tools do the talking. These are friends, not Muse.

import type { Persona } from "./personas.ts";
import type { Rand } from "./rand.ts";

export type Situation =
  | "greet"
  | "laugh"
  | "question"
  | "food"
  | "plan"
  | "yes"
  | "thanks"
  | "other"
  | "dm"
  | "landed"
  | "failed"
  | "spin"
  | "add"
  | "in"
  | "maybe"
  | "vote"
  | "take"
  | "paid"
  | "result"
  | "progress"
  | "done"
  | "nudge";

type Line = string | { t: string; who: string[] };

/** `{pick}` the tool's result, `{idea}` what they added, `{done}`/`{total}` a count, `{you}` the presenter. */
export const BANK: Record<Situation, Line[]> = {
  greet: ["hey", "yo", "heyy", "morning", { t: "sup", who: ["jonah", "theo"] }, { t: "hiii", who: ["maya", "priya"] }],
  laugh: ["lmao", "lol", "😭", "im crying", { t: "bro", who: ["jonah"] }, { t: "stop", who: ["priya", "maya"] }, { t: "lol ok", who: ["dev", "theo"] }],
  question: ["idk", "no idea", "good question", "hmm", "depends", { t: "ask maya", who: ["dev", "jonah", "theo"] }, { t: "wait what", who: ["dev"] }],
  food: ["im down for whatever", "not pizza again", "anything but the dining hall", "i could eat", { t: "taco truck is open late", who: ["priya"] }, { t: "starving fr", who: ["jonah"] }],
  plan: ["im down", "maybe", "depends what time", "yeah prob", { t: "if someone drives", who: ["theo"] }, { t: "ill be there", who: ["maya"] }],
  yes: ["ok", "bet", "ya", "sounds good", { t: "perfect", who: ["maya"] }, { t: "fine", who: ["theo"] }],
  thanks: ["np", "ofc", "anytime", { t: "u owe me", who: ["priya", "jonah"] }],
  other: ["lol", "fair", "real", "true", "wait", { t: "huh", who: ["theo", "dev"] }, { t: "ok but why", who: ["priya"] }],
  dm: ["ya", "ok", "lol", "one sec", "ok sounds good", "wait what", "omw"],
  landed: ["ok perfect", "oh nice", "lol ok", "ooh", "ok this is cute", { t: "finally", who: ["jonah", "theo"] }, { t: "this is so us", who: ["priya"] }, { t: "lets go", who: ["jonah"] }],
  // after a build that failed (never after a landing): one, once
  failed: ["rip", "try again?", "rip lol", "oof", { t: "ugh so close", who: ["jonah", "priya"] }],
  spin: ["spinning", "ok im spinning", "spinning before anyone argues", { t: "fine ill do it", who: ["theo", "dev"] }],
  add: ["adding {idea}", "{idea} has to be on there", "put {idea} on it", { t: "{idea} or riot", who: ["jonah"] }],
  in: ["in", "im in", "count me in", { t: "obviously in", who: ["maya"] }],
  maybe: ["maybe", "prob", "depends on work", "maybe, will know tmrw"],
  vote: ["voted", "done", "ok voted"],
  take: ["i got it", "ill take one", "on it"],
  paid: ["sent", "paid", "venmo'd u"],
  result: ["{pick} it is", "{pick} lets go", "ok {pick}", "ugh fine {pick}", "{pick} works", { t: "{pick}, called it", who: ["priya", "maya"] }, { t: "{pick} lets gooo", who: ["jonah"] }, { t: "fine. {pick}", who: ["theo"] }],
  progress: ["{done} of {total}, who else", "{done} so far", "need more ppl", { t: "come on guys", who: ["maya"] }],
  done: ["done", "ok thats settled", "perfect", "ok good", { t: "finally lol", who: ["priya", "dev"] }],
  nudge: ["so are we doing this", "hello?", "guys", "ok who's doing it", { t: "anyone??", who: ["maya"] }],
};

/** Phrases that would make a friend sound like an assistant. The test holds every bank line to this. */
export const BANNED = /\b(certainly|absolutely|great question|happy to|let me know|feel free|i'd be|assist|as an ai|here'?s|i can help|of course|sure thing|hope this|delighted|wonderful|amazing choice)\b/i;
export const MAX_LINE = 60;

export type Facts = Partial<Record<"pick" | "idea" | "done" | "total" | "you" | "item", string>>;

/** Lines for this person in this situation whose blanks the facts can fill. */
export function candidates(sit: Situation, who: string, facts: Facts): string[] {
  const out: string[] = [];
  for (const l of BANK[sit]) {
    const t = typeof l === "string" ? l : l.who.includes(who) ? l.t : null;
    if (!t) continue;
    const blanks = [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as keyof Facts);
    if (blanks.every((b) => facts[b])) out.push(t);
  }
  return out;
}

const NEAR: Record<string, string> = { a: "s", s: "a", e: "w", r: "e", t: "r", i: "o", o: "i", n: "m", m: "n", h: "j", l: "k", u: "y", d: "s", g: "f", k: "l", p: "o", y: "t", c: "v", w: "e" };

/** One line in this person's voice, blanks filled. Null when nothing fits. */
export function line(sit: Situation, p: Persona, facts: Facts, r: Rand): string | null {
  const list = candidates(sit, p.id, facts);
  if (!list.length) return null;
  const raw = r.pick(list);
  // The person's own words get the voice; filled facts (a place, a count) stay as the tool has them, lowercased.
  const parts = raw.split(/(\{\w+\})/);
  let typoDone = !r.chance(p.typo);
  const out = parts
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) return (facts[m[1] as keyof Facts] ?? "").toLowerCase();
      let s = part.toLowerCase();
      if (r.chance(0.5)) s = s.replace(/'/g, "");
      if (!typoDone) {
        const words = s.split(" ");
        const i = words.findIndex((w) => w.length >= 4 && /^[a-z]+$/.test(w));
        if (i >= 0) {
          const w = words[i]!;
          const j = 1 + r.int(w.length - 2);
          const c = NEAR[w[j]!];
          if (c) {
            words[i] = w.slice(0, j) + c + w.slice(j + 1);
            typoDone = true;
          }
        }
        s = words.join(" ");
      }
      return s;
    })
    .join("");
  return clip(out);
}

/** The voice rules every line must pass, from the bank or from a model. */
export function voiceOk(s: string): boolean {
  if (!s || s.length > MAX_LINE) return false;
  if (s !== s.toLowerCase()) return false;
  if (/!/.test(s) || BANNED.test(s)) return false;
  if (/^\s*@?muse\b/i.test(s)) return false;
  return true;
}

export function clip(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= MAX_LINE ? t : t.slice(0, MAX_LINE).replace(/\s+\S*$/, "");
}

/** What a presenter's message is, for picking a reply. Null: say nothing (an ask to Muse). */
export function intent(text: string, dm: boolean): Situation | null {
  const t = text.trim().toLowerCase();
  if (/^@?muse\b/.test(t)) return null;
  if (/(lol|lmao|haha|😂|💀|😭)/.test(t)) return "laugh";
  if (/^(hi|hey|yo|hello|morning|sup|hii+)\b/.test(t)) return "greet";
  if (/\b(thanks|thank you|thx|ty)\b/.test(t)) return "thanks";
  if (/\b(eat|food|dinner|lunch|hungry|breakfast)\b/.test(t)) return "food";
  if (/\?$|^(where|what|when|who|how|why|which|are|is|do|does|can|should|wanna|did)\b/.test(t)) return "question";
  if (/\b(tonight|tomorrow|tmrw|friday|saturday|weekend|later)\b/.test(t)) return "plan";
  if (/^(ok|okay|k|sure|yes|yeah|ya|bet|fine|deal|cool)\b/.test(t)) return "yes";
  return dm ? "dm" : "other";
}
