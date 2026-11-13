// Readers: turn a page and what the person just did into ranked situations. One list of rules
// for every surface; adding an offer is adding a rule here and a scenario in pack.ts. Nothing is
// offered for just looking: each rule waits for something the person did (Interested, a second
// save, typing, a like, a share), except where the page itself is the moment (a poll that ended,
// a trip a year ago, the Gaming tab, an admin's own group).

import { CHAT_FACTS, FRIEND_SCORE, LISTING_FACTS } from "./seed";
import { scenario, subletMatches } from "./pack";
import type { PageContext, Rule, Situation } from "./types";

const did = (c: PageContext, x: string) => c.did.includes(x);
const f = (c: PageContext, k: string) => c.facts[k];
const list = (c: PageContext, k: string) => (Array.isArray(c.facts[k]) ? (c.facts[k] as string[]) : []);
const names = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const rsvp = (c: PageContext) => did(c, "interested") || did(c, "going");
const friendsOf = (c: PageContext) => c.people.filter((p) => p !== "me");

export const RULES: Rule[] = [
  // ---------------------------------------------------------------- Events
  {
    scenario: "event-go-together",
    surface: "event",
    when: (c) => rsvp(c) && f(c, "kind") === "concert" && friendsOf(c).length > 0,
    score: () => 0.9,
    label: () => "Go together",
    detail: (c) => `With ${names(list(c, "friends"))}`,
    why: "you said you're interested and friends are too",
  },
  {
    scenario: "event-tickets",
    surface: "event",
    when: (c) => did(c, "going") && list(c, "tickets").length > 0,
    score: () => 0.85,
    label: () => "Sit together",
    detail: (c) => `Split ${c.people.length} tickets · from ${list(c, "tickets")[0]?.split(" ").at(-1)}`,
    why: "you're going and it has seated tiers",
  },
  {
    scenario: "event-carpool",
    surface: "event",
    when: (c) => rsvp(c) && f(c, "kind") === "concert" && Number(f(c, "daysAway")) <= 7,
    score: (c) => (Number(f(c, "daysAway")) <= 1 ? 0.95 : 0.7),
    label: () => "Who's driving?",
    detail: (c) => [f(c, "fromCampus"), "parking $12"].filter(Boolean).join(" · "),
    why: "it's this week and it's off campus",
  },
  {
    scenario: "event-meet-before",
    surface: "event",
    when: (c) => did(c, "going") && list(c, "nearby").length > 0,
    score: () => 0.6,
    label: () => "Where to meet before",
    detail: (c) => `${list(c, "nearby").length} places near ${f(c, "venue")}`,
    why: "you're going and there are places nearby",
  },
  {
    scenario: "event-setlist",
    surface: "event",
    when: (c) => f(c, "onTheDay") === true && f(c, "kind") === "concert",
    score: () => 0.98,
    label: () => "Guess the opener",
    detail: () => "It's tonight",
    why: "the show is today",
  },
  {
    scenario: "event-bring-list",
    surface: "event",
    when: (c) => f(c, "kind") === "potluck" && (rsvp(c) || f(c, "hosting") === true),
    score: () => 0.92,
    label: () => "Who brings what",
    detail: (c) => `${Math.min(6, list(c, "bring").length)} dishes and things to cover`,
    faces: friendsOf,
    why: "it's a potluck",
  },
  {
    scenario: "event-open-spots",
    surface: "event",
    when: (c) => f(c, "hosting") === true,
    score: () => 0.75,
    label: () => "Open 3 spots",
    detail: () => "Friends of friends can ask",
    why: "you're the host",
  },
  {
    scenario: "event-host",
    surface: "event",
    when: (c) => f(c, "hosting") === true && f(c, "kind") === "party",
    score: () => 0.95,
    label: () => "Make the door list",
    detail: (c) => `${f(c, "going")} going · plus ones and maybes`,
    why: "you're hosting a party",
  },
  {
    scenario: "event-who-knows",
    surface: "event",
    when: (c) => rsvp(c) && f(c, "kind") === "concert",
    score: () => 0.65,
    label: () => "Who do I know here",
    detail: (c) => `${f(c, "going")} going · through your friends`,
    why: "you said you're going and friends know people there",
  },
  {
    scenario: "event-after",
    surface: "event",
    when: (c) => did(c, "going") && f(c, "kind") === "concert" && Number(f(c, "daysAway")) <= 1,
    score: () => 0.55,
    label: () => "After the show?",
    detail: () => "3 places nearby · vote",
    why: "you're going and it ends late",
  },

  // ---------------------------------------------------------------- Groups
  {
    scenario: "group-sublet-finder",
    surface: "group",
    when: (c) => f(c, "kind") === "sublets" && did(c, "typing") && /\b(sublet|subletting|summer|lease|room|br|studio|jun|june|aug)\b/i.test(String(f(c, "typing") ?? "")) && String(f(c, "typing") ?? "").length > 8,
    score: () => 0.95,
    label: (c) => `See ${subletMatches(String(f(c, "typing") ?? "")).length} that match`,
    detail: () => "Posts in this group like yours",
    why: "your post repeats ones already here",
  },
  {
    scenario: "group-roommates",
    surface: "group",
    when: (c) => f(c, "kind") === "sublets" && did(c, "typing") && /\broommate/i.test(String(f(c, "typing") ?? "")),
    score: () => 0.9,
    label: () => "See 3 looking for roommates",
    detail: () => "Posts in this group",
    why: "you're writing about roommates",
  },
  {
    scenario: "group-best-of",
    surface: "group",
    when: (c) => f(c, "kind") === "club" && did(c, "typing") && /\b(shoe|shoes|gear|buy)\b/i.test(String(f(c, "typing") ?? "")),
    score: () => 0.95,
    label: () => "See the 4 answers",
    detail: () => "Asked 6 times in this group",
    why: "your question was asked before",
  },
  {
    scenario: "group-welcome",
    surface: "group",
    when: (c) => f(c, "admin") === true && list(c, "newMembers").length > 0,
    score: () => 0.7,
    label: (c) => `Welcome ${names(list(c, "newMembers"))}`,
    detail: () => "Club basics as cards, pinned",
    why: "you're an admin and people joined this week",
  },
  {
    scenario: "group-dues",
    surface: "group",
    when: (c) => f(c, "admin") === true && !!f(c, "dues"),
    score: () => 0.6,
    label: () => "Collect spring dues",
    detail: (c) => String(f(c, "dues")).replace(/^Spring dues /, ""),
    why: "you're an admin and dues are open",
  },

  // ---------------------------------------------------------------- Marketplace
  {
    scenario: "mp-decide",
    surface: "marketplace",
    when: (c) => did(c, "saved-another"),
    score: () => 0.9,
    label: () => "Decide with roommates",
    detail: (c) => `${Number(f(c, "savedOfKind"))} ${String(f(c, "kind"))}s saved`,
    why: "you saved a second one of these",
  },
  {
    scenario: "mp-room-fit",
    surface: "marketplace",
    when: (c) => did(c, "saved") && Number(f(c, "width")) >= 40,
    score: () => 0.8,
    label: () => "Will it fit in 4B?",
    detail: (c) => `It's ${f(c, "width")} in wide`,
    why: "you saved something big",
  },
  {
    scenario: "mp-price-check",
    surface: "marketplace",
    when: (c) => {
      const comps = LISTING_FACTS[c.object.id]?.comps ?? [];
      const mid = [...comps].sort((a, b) => a - b)[Math.floor(comps.length / 2)] ?? 0;
      return did(c, "saved") && Number(f(c, "price")) > mid;
    },
    score: () => 0.7,
    label: (c) => `Is $${f(c, "price")} fair?`,
    detail: (c) => `${list(c, "soldNearby").length} similar sold nearby`,
    why: "it's above what similar things sold for",
  },
  {
    scenario: "mp-pickup",
    surface: "marketplace",
    when: (c) => did(c, "saved") && /by sunday|this week|today/i.test(String(f(c, "pickup") ?? "")),
    score: () => 0.5,
    label: () => "Plan the pickup",
    detail: (c) => `Seller says it ${String(f(c, "pickup"))}`,
    why: "the seller has a deadline",
  },
  {
    scenario: "mp-lineage",
    surface: "marketplace",
    when: (c) => did(c, "saved") && /velvet/i.test(c.title),
    score: () => 0.55,
    label: () => "See who owned it",
    detail: () => "4 owners since 2020",
    why: "friends of friends owned this one",
  },
  {
    scenario: "mp-split",
    surface: "marketplace",
    when: (c) => did(c, "share") && !did(c, "saved-another"),
    score: () => 0.6,
    label: () => "Split it",
    detail: (c) => `$${f(c, "price")} across a chat`,
    why: "you're sharing a single listing",
  },

  // ---------------------------------------------------------------- Home feed
  { scenario: "feed-ranking", surface: "feed", when: (c) => did(c, "liked") && f(c, "about") === "ranking", score: () => 0.9, label: () => "Add your ranking", detail: (c) => `${list(c, "items").length} places, head to head`, why: "you liked a friend's ranking" },
  {
    scenario: "feed-birthday",
    surface: "feed",
    when: (c) => did(c, "liked") && f(c, "about") === "birthday" && f(c, "subjectIsMe") !== true && c.names.me !== f(c, "subject"),
    score: () => 0.9,
    label: () => "Sign the card",
    detail: (c) => `Plan ${f(c, "subject")}'s 21st with 3 friends`,
    why: "you liked a birthday post",
  },
  { scenario: "feed-move", surface: "feed", when: (c) => did(c, "liked") && f(c, "about") === "move", score: () => 0.85, label: (c) => `Help ${f(c, "by")} move`, detail: (c) => `${list(c, "items").length} jobs on ${f(c, "when")}`, why: "you liked a moving post" },
  { scenario: "feed-challenge", surface: "feed", when: (c) => did(c, "liked") && f(c, "about") === "challenge", score: () => 0.85, label: () => "Join the challenge", detail: () => "One check-in a day", why: "you liked a challenge" },
  { scenario: "feed-plan", surface: "feed", when: (c) => did(c, "liked") && f(c, "about") === "plan", score: () => 0.85, label: () => "Ask to join", detail: (c) => (f(c, "spots") ? `${f(c, "spots")} spots left` : "Plans with room this weekend"), why: "you liked a plan with open spots" },

  // ---------------------------------------------------------------- Reels
  { scenario: "reel-to-try", surface: "reel", when: (c) => f(c, "shows") === "restaurants", score: () => 0.9, label: () => "Add to our to-try list", detail: (c) => names(list(c, "places")), why: "the reel shows restaurants" },
  { scenario: "reel-cook-night", surface: "reel", when: (c) => f(c, "shows") === "recipe", score: () => 0.9, label: () => "Make it a cook night", detail: (c) => `${list(c, "ingredients").length} things to bring`, why: "the reel is a recipe" },
  { scenario: "reel-hike", surface: "reel", when: (c) => f(c, "shows") === "hike", score: () => 0.9, label: () => "Plan this hike", detail: (c) => `${f(c, "trail")} · pick a day`, why: "the reel is a hike" },
  { scenario: "reel-rank", surface: "reel", when: (c) => did(c, "shared") && list(c, "reelsInChat").length >= 3, score: () => 0.6, label: (c) => `Rank this week's ${list(c, "reelsInChat").length} reels`, detail: () => "Head to head in the chat", why: "this chat shared several reels this week" },

  // ---------------------------------------------------------------- Stories
  { scenario: "story-plan", surface: "story", when: (c) => f(c, "pollEnded") === true && f(c, "mine") === true, score: () => 0.95, label: () => "Make it a plan", detail: (c) => `${f(c, "votes")} voted ${f(c, "winner")}`, faces: friendsOf, why: "your poll ended" },
  { scenario: "story-again", surface: "story", when: (c) => f(c, "yearAgo") === true, score: () => 0.85, label: () => "Do it again", detail: (c) => `Same ${list(c, "with").length} people`, faces: friendsOf, why: "a trip from a year ago" },
  { scenario: "story-recap", surface: "story", when: (c) => f(c, "yearAgo") === true, score: () => 0.7, label: () => "Recap the trip", detail: (c) => `${list(c, "tripFacts").length} facts from it`, why: "a trip from a year ago" },

  // ---------------------------------------------------------------- Gaming
  { scenario: "game-trivia", surface: "gaming", when: () => (CHAT_FACTS.apt4b ?? []).length > 0, score: () => 0.8, label: () => "Trivia from apt 4b", detail: () => `${(CHAT_FACTS.apt4b ?? []).length} questions from your chat`, why: "your chat has facts to ask about" },
  { scenario: "game-challenge", surface: "gaming", when: () => true, score: () => 0.75, label: (c) => `Challenge ${c.names[FRIEND_SCORE.by] ?? "Arun"} back`, detail: () => `${FRIEND_SCORE.game} in ${FRIEND_SCORE.score}`, faces: () => [FRIEND_SCORE.by], why: "a friend posted a score" },
];

/** Situations for a page, ranked, at most `max`, without dismissed ones or tools already on the page. */
export function read(c: PageContext, o: { dismissed?: string[]; made?: string[]; max?: number } = {}): Situation[] {
  const out: Situation[] = [];
  for (const r of RULES) {
    if (r.surface !== c.surface) continue;
    let ok = false;
    try {
      ok = r.when(c);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    const s = scenario(r.scenario);
    if (!s) continue;
    if (o.made?.includes(s.title(c))) continue;
    const id = `${c.object.kind}:${c.object.id}:${r.scenario}`;
    if (o.dismissed?.includes(id)) continue;
    out.push({ id, scenario: r.scenario, label: r.label(c), detail: r.detail(c), faces: r.faces?.(c) ?? [], score: r.score(c), why: r.why });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.max ?? 2);
}
