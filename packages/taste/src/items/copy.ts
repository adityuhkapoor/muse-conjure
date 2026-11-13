// Copy lines: the same meaning written several ways. The first plain line of each meaning is the
// real string from library/ or packages/app/examples (or the shell and factory); the rest are
// variations along known axes. Each line's features are computed from its text, so the model
// generalises to strings it has never seen.

import { copyFeatures, type Feats, type Role } from "../features.ts";
import { broken } from "../break.ts";

export type CopyItem = {
  id: string;
  kind: "copy";
  /** The "same meaning" group. */
  group: string;
  role: Role;
  text: string;
  /** How this line was made, for tests and for reading the data later. */
  design: { style: "plain" | "long" | "short" | "punchy" | "hedged" | "first" | "ai" | "pct"; exclaim: boolean; emoji: boolean; title: boolean };
  x: Feats;
};

type Meaning = {
  id: string;
  role: Role;
  emoji: string;
  plain: string;
  short?: string;
  long?: string;
  punchy?: string[];
  hedged?: string;
  first?: string;
  ai?: string;
  pct?: string;
};

// prettier-ignore
export const MEANINGS: Meaning[] = [
  // Buttons
  { id: "btn-spin", role: "button", emoji: "🎡", plain: "Spin", long: "Spin the wheel", punchy: ["Spin it", "Let's spin"], hedged: "Maybe spin", first: "I'll spin", ai: "Let fate decide" },
  { id: "btn-vote", role: "button", emoji: "🗳️", plain: "Vote", long: "Cast your vote", punchy: ["Vote now"], hedged: "Maybe vote", ai: "Make your voice heard" },
  { id: "btn-add-option", role: "button", emoji: "➕", plain: "Add option", short: "Add", long: "Add another option", punchy: ["Throw one in"], ai: "Add your idea to the mix" },
  { id: "btn-mark-paid", role: "button", emoji: "💸", plain: "Mark paid", short: "Paid", long: "Mark as paid back", punchy: ["Pay up"], first: "I paid", ai: "Close the loop" },
  { id: "btn-going", role: "button", emoji: "🙌", plain: "Going", long: "I'll be there for sure", punchy: ["Count me in", "Let's go"], hedged: "Probably going", first: "I'm in", ai: "Lock it in" },
  { id: "btn-undo", role: "button", emoji: "↩️", plain: "Undo", long: "Undo the last change", punchy: ["Whoops, undo"], hedged: "Maybe undo" },
  { id: "btn-claim", role: "button", emoji: "🙋", plain: "Take", short: "Claim", long: "Claim this item", punchy: ["Dibs"], first: "I'll bring it", ai: "Make it yours" },
  { id: "btn-next-round", role: "button", emoji: "🏆", plain: "Next round", short: "Next", long: "Start the next round", punchy: ["Bring it on"], ai: "Onward to the next round" },
  { id: "btn-pick-time", role: "button", emoji: "📅", plain: "Pick", long: "Pick this time for everyone", punchy: ["Lock it"], first: "I'll take this one", ai: "Make it official" },
  // Card titles
  { id: "title-eat", role: "title", emoji: "🍜", plain: "Where should we eat?", short: "Dinner", long: "Where should we eat tonight after the show?", punchy: ["Food fight: where are we eating?"], hedged: "Maybe somewhere to eat?", first: "Help me pick where we eat", ai: "Let's find the perfect spot to eat" },
  { id: "title-chores", role: "title", emoji: "🧹", plain: "Chores this week", short: "Chores", long: "Who is doing which chore at the apartment this week", punchy: ["Chore wars"], hedged: "Chores this week, roughly", ai: "Your weekly chore journey" },
  { id: "title-whos-in", role: "title", emoji: "🎤", plain: "Who's in", long: "Who's in for SZA at the Kia Forum on Saturday", punchy: ["Roll call"], first: "Are we going?", ai: "Rally the squad for an epic night" },
  { id: "title-bill", role: "title", emoji: "🧾", plain: "Bill split", short: "Split", long: "Dinner at Nopa · split the bill between everyone", punchy: ["Pay up, everyone"], ai: "Split the bill seamlessly" },
  { id: "title-hang", role: "title", emoji: "🗓️", plain: "When can everyone hang?", short: "Pick a time", long: "When can everyone hang this week after work?", punchy: ["Find the magic hour"], ai: "Let's find a time that works for everyone" },
  { id: "title-bring", role: "title", emoji: "🥗", plain: "What's everyone bringing?", short: "Bring list", long: "What's everyone bringing to the potluck on Sunday?", punchy: ["Potluck squad, assemble"], ai: "Your ultimate potluck planner" },
  // Summaries (chat preview lines)
  { id: "sum-poll", role: "summary", emoji: "🍜", plain: "Thai Basil leads with 3 votes", short: "Thai Basil leads", long: "Thai Basil leads with 3 votes · 5 people voted so far", punchy: ["Thai Basil is crushing it"], hedged: "Thai Basil seems to be leading", first: "I counted 3 votes for Thai Basil", ai: "Thai Basil is emerging as the clear favorite", pct: "Thai Basil leads with 60%" },
  { id: "sum-lock", role: "summary", emoji: "🎤", plain: "SZA on Saturday: 3 of 4 in", long: "SZA on Saturday: 3 of 4 in · 1 more needed to lock the plan", punchy: ["SZA on Saturday: almost there"], hedged: "SZA on Saturday: probably on", ai: "The squad is nearly ready for SZA", pct: "SZA on Saturday: 75% in" },
  { id: "sum-chores", role: "summary", emoji: "🧹", plain: "Dishes: Maya. 3 of 4 spun.", short: "Dishes: Maya", long: "Dishes go to Maya this week. 3 of 4 chores have an owner.", punchy: ["Maya's on dishes"], first: "I picked Maya for dishes", ai: "Maya has been chosen for dishes", pct: "Dishes: Maya. 75% assigned." },
  { id: "sum-owes", role: "summary", emoji: "💸", plain: "Leo owes Maya $24", long: "Leo owes Maya $24 for dinner at Nopa on Friday night", punchy: ["Leo, pay Maya back"], hedged: "Leo might owe Maya $24", ai: "Leo has an outstanding balance of $24" },
  { id: "sum-claims", role: "summary", emoji: "🥗", plain: "4 of 6 items claimed", short: "2 left", long: "4 of 6 items claimed · napkins and drinks are still open", punchy: ["Almost all claimed"], ai: "Great progress on the list", pct: "67% of items claimed" },
  // System lines
  { id: "sys-spun", role: "system", emoji: "🎡", plain: "Maya spun the wheel", long: "Maya spun the wheel to pick who does dishes", punchy: ["Maya gave it a spin"], ai: "Maya let the wheel decide" },
  { id: "sys-locked", role: "system", emoji: "🔒", plain: "Locked · the plan is on", short: "Locked", long: "Locked · 4 going, so the plan is on for Saturday", punchy: ["It's happening"], hedged: "Looks like the plan is on", ai: "The plan is officially locked in" },
  { id: "sys-added", role: "system", emoji: "🍜", plain: "Theo added Ramen", long: "Theo added Ramen to the poll for dinner tonight", punchy: ["Theo threw in Ramen"], ai: "Theo suggested a new option to the mix: Ramen" },
  { id: "sys-waiting", role: "system", emoji: "⏳", plain: "Waiting on Dani, Sam", long: "Waiting on Dani and Sam to answer before it locks", punchy: ["Dani, Sam, you're up"], hedged: "Still maybe waiting on Dani and Sam", ai: "Just waiting on a couple more friends" },
  // Empty states
  { id: "empty-votes", role: "empty", emoji: "🗳️", plain: "No votes yet", long: "No votes yet. Tap an option to vote for it.", punchy: ["Be the first to vote"], hedged: "Seems like no votes yet", first: "I'm waiting for votes", ai: "Your vote could be the first step" },
  { id: "empty-going", role: "empty", emoji: "🦗", plain: "No one yet", long: "No one has said they're going yet", punchy: ["Crickets so far"], ai: "Waiting for the first brave soul" },
  { id: "empty-claims", role: "empty", emoji: "🧺", plain: "Nothing claimed yet", long: "Nothing claimed yet. Tap an item to say you'll bring it.", punchy: ["Up for grabs"], ai: "Everything is waiting for a hero" },
  // Muse is building
  { id: "building", role: "building", emoji: "🛠️", plain: "Muse is building…", short: "Building…", long: "Muse is building a poll for this chat…", punchy: ["Cooking something up"], hedged: "Muse is trying to build this…", first: "I'm building this now…", ai: "Muse is crafting something magical…" },
  { id: "ready", role: "building", emoji: "✅", plain: "Poll ready", long: "Muse made a poll for this chat", punchy: ["Your poll is live"], first: "I made you a poll", ai: "Your poll is ready to go" },
  // Errors
  { id: "err-build", role: "error", emoji: "😕", plain: "Muse couldn't build that. Try again", short: "Couldn't build that", long: "Muse couldn't build that. Try asking a different way in the chat.", punchy: ["Uh oh, that didn't work"], hedged: "Something may have gone wrong", first: "I couldn't build that. Try again", ai: "Oops, something went wrong on our end" },
  { id: "err-save", role: "error", emoji: "📶", plain: "Couldn't save. Check your connection", short: "Not saved", long: "Couldn't save your answer. Check your connection and try again.", punchy: ["Whoops, lost connection"], hedged: "This might not have saved", ai: "We hit a snag saving your changes" },
  // Toasts
  { id: "toast-added", role: "toast", emoji: "👍", plain: "Option added", short: "Added", long: "Option added to the poll for everyone", punchy: ["Nice pick"], first: "I added your option", ai: "Your option has been added successfully" },
];

const SMALL = new Set(["a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "with", "at", "by"]);
export function titleCase(s: string): string {
  let first = true;
  return s.replace(/[\p{L}'’]+/gu, (w) => {
    const keep = !first && SMALL.has(w.toLowerCase());
    first = false;
    return keep ? w : w[0]!.toUpperCase() + w.slice(1);
  });
}
export function exclaim(s: string): string {
  if (/[?]$/.test(s)) return s;
  return s.replace(/(\.|…)?$/, "!");
}
export function withEmoji(s: string, e: string): string {
  return `${s} ${e}`;
}

/** Every copy line, a few hundred, grouped by meaning. */
export function copyItems(): CopyItem[] {
  const out: CopyItem[] = [];
  const seen = new Set<string>();
  for (const m of MEANINGS) {
    const add = (text: string, style: CopyItem["design"]["style"], d: Partial<Omit<CopyItem["design"], "style">> = {}) => {
      const key = `${m.id}\u0000${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      const n = out.filter((o) => o.group === m.id).length;
      out.push({ id: `copy:${m.id}:${n}`, kind: "copy", group: m.id, role: m.role, text, design: { style, exclaim: false, emoji: false, title: false, ...d, ...(d.exclaim ? { exclaim: text.includes("!") } : {}) }, x: copyFeatures(text, m.role) });
    };
    add(m.plain, "plain");
    if (m.short) add(m.short, "short");
    if (m.long) add(m.long, "long");
    for (const p of m.punchy ?? []) add(p, "punchy");
    if (m.hedged) add(m.hedged, "hedged");
    if (m.first) add(m.first, "first");
    if (m.ai) add(m.ai, "ai");
    if (m.pct) add(m.pct, "pct");
    // Mechanical variations of the real line and of the loud one.
    add(exclaim(m.plain), "plain", { exclaim: true });
    add(withEmoji(m.plain, m.emoji), "plain", { emoji: true });
    add(titleCase(m.plain), "plain", { title: true });
    if (m.long) add(titleCase(m.long), "long", { title: true });
    const loud = m.punchy?.[0];
    if (loud) {
      add(exclaim(loud), "punchy", { exclaim: true });
      add(withEmoji(exclaim(loud), m.emoji), "punchy", { exclaim: true, emoji: true });
    }
    if (m.ai) add(withEmoji(exclaim(m.ai), "✨"), "ai", { exclaim: true, emoji: true });
    if (m.short) add(exclaim(m.short), "short", { exclaim: true });
    if (m.pct) add(titleCase(m.pct), "pct", { title: true });
    if (broken()) out.splice(out.length - 6);
  }
  return out;
}
