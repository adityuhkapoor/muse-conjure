// Page context: what Muse may read on each surface, as one compact object. The reader ranks
// offers from it, the pack fills tools from it, the matcher reads its title, and the factory gets
// it as structured lines in the chat sample (see `toWire`). Pure functions: the shell, the demo
// seed and the checks all call them.

import { ME, type EventInfo, type PersonId } from "../store/types";
import { castWithViewerFirst } from "../store/cast";
import { viewerId } from "../lib/media";
import { pollResult, type Group, type Listing, type Reel, type Story } from "../surfaces/data";
import { EVENT_FACTS, GROUP_FACTS, LISTING_FACTS, REEL_FACTS, ROOM_4B, TRIP, type FeedPost } from "./seed";
import type { CatSurface, ContextWire, FactorySurface, PageContext } from "./types";

/** First name for an id ("me" is the viewer). */
export type NameOf = (id: string) => string;

/** Every context reads for one viewer (a wire id); by default the one holding the phone. */
type Seat = { viewer?: string };

const FACTORY: Record<CatSurface, FactorySurface> = { event: "event", group: "group", marketplace: "marketplace", feed: "feed", reel: "feed", story: "story", gaming: "gaming", search: "feed" };

const DAY = 24 * 60 * 60_000;

export function fmtWhen(start: number): string {
  const d = new Date(start);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const h = d.getHours();
  return `${day}, ${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

const names = (ids: string[], nameOf: NameOf) => Object.fromEntries(ids.map((id) => [id, nameOf(id)]));

// ---------------------------------------------------------------- Events

export function eventContext(ev: EventInfo, o: { rsvp: "interested" | "going" | null; now: number; nameOf: NameOf; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const f = EVENT_FACTS[ev.id] ?? { kind: "concert" as const };
  const daysAway = Math.max(0, Math.round((ev.start - o.now) / DAY));
  const viewer = o.viewer ?? viewerId();
  const friends = ev.friends.filter((x) => x !== ME && x !== viewer);
  const people = [ME, ...friends];
  return {
    surface: "event",
    object: { kind: "event", id: ev.id },
    title: ev.title,
    facts: {
      kind: f.kind,
      when: fmtWhen(ev.start),
      venue: ev.venue,
      address: ev.address,
      interested: ev.interested,
      going: ev.going,
      friends: friends.map(o.nameOf),
      daysAway,
      onTheDay: daysAway === 0,
      host: ev.host,
      hosting: !!f.hostedBy && f.hostedBy === viewer,
      ...(o.rsvp ? { rsvp: o.rsvp } : {}),
      ...(f.tiers ? { tickets: f.tiers.map((t) => `${t.name} $${t.priceCents / 100}`) } : {}),
      ...(f.nearby ? { nearby: f.nearby } : {}),
      ...(f.bring ? { bring: f.bring } : {}),
      ...(f.fromCampus ? { fromCampus: f.fromCampus } : {}),
    },
    people,
    did: [...(o.rsvp ? [o.rsvp] : []), ...(o.did ?? [])],
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Groups

export function groupContext(g: Group, o: { draft: string; nameOf: NameOf; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const f = GROUP_FACTS[g.id];
  const viewer = o.viewer ?? viewerId();
  const people = castWithViewerFirst(viewer);
  return {
    surface: "group",
    object: { kind: "group", id: g.id },
    title: g.name,
    facts: {
      kind: f?.kind ?? "club",
      members: g.members,
      posts: g.posts.length,
      admin: !!f?.admins.includes(viewer),
      ...(f?.repeated ? { asked: `${f.repeated.question} (asked ${f.repeated.times} times)` } : {}),
      ...(f?.newMembers ? { newMembers: f.newMembers.map(o.nameOf) } : {}),
      ...(f?.dues ? { dues: `${f.dues.label} $${f.dues.cents / 100}, ${f.dues.paid} of ${f.dues.of} paid` } : {}),
      ...(o.draft.trim() ? { typing: o.draft.trim().slice(0, 120) } : {}),
      recentPosts: g.posts.slice(0, 7).map((p) => p.text.slice(0, 80)),
    },
    people,
    did: [...(o.draft.trim() ? ["typing"] : []), ...(o.did ?? [])],
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Marketplace

export function listingContext(l: Listing, o: { saved: Listing[]; isSaved: boolean; nameOf: NameOf; did?: string[]; /** the people the viewer would decide with (wire ids); Apt 4B's members by default */ with?: readonly string[] } & Seat): PageContext & { names: Record<string, string> } {
  const f = LISTING_FACTS[l.id];
  const viewer = o.viewer ?? viewerId();
  const people = [ME, ...(o.with ?? ROOM_4B.members).filter((x) => x !== viewer && x !== ME)];
  const sameKind = o.saved.filter((x) => x.kind === l.kind);
  return {
    surface: "marketplace",
    object: { kind: "listing", id: l.id },
    title: l.title,
    facts: {
      price: l.price,
      kind: l.kind,
      condition: l.condition,
      where: l.where,
      seller: o.nameOf(l.seller),
      description: l.description,
      ...(f ? { size: `${f.w} x ${f.d} in`, width: f.w, soldNearby: f.comps.map((c) => `$${c}`), pickup: f.pickup } : {}),
      savedOfKind: sameKind.length,
      savedTitles: sameKind.map((x) => `${x.title} $${x.price}`),
      room: `${ROOM_4B.name}: ${ROOM_4B.walls.map((w) => `${w.name} ${w.inches} in`).join(", ")}`,
    },
    people,
    did: [...(o.isSaved ? ["saved"] : []), ...(sameKind.length >= 2 ? ["saved-another"] : []), ...(o.did ?? [])],
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Home feed

export function postContext(p: FeedPost, o: { liked: boolean; nameOf: NameOf; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const viewer = o.viewer ?? viewerId();
  const people = castWithViewerFirst(viewer);
  return {
    surface: "feed",
    object: { kind: "post", id: p.id },
    title: `${o.nameOf(p.by)}'s post`,
    facts: {
      about: p.kind,
      by: o.nameOf(p.by),
      text: p.text,
      ...(p.items ? { items: p.items } : {}),
      ...(p.subject ? { subject: o.nameOf(p.subject), subjectIsMe: p.subject === viewer } : {}),
      ...(p.when ? { when: p.when } : {}),
      ...(p.spots ? { spots: p.spots } : {}),
      mine: p.by === viewer,
    },
    people,
    did: [...(o.liked ? ["liked"] : []), ...(o.did ?? [])],
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Reels

export function reelContext(r: Reel, o: { chatId?: string; chatName?: string; members?: string[]; reelsInChat?: { id: string; caption: string }[]; nameOf: NameOf; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const f = REEL_FACTS[r.id];
  const viewer = o.viewer ?? viewerId();
  const people = [ME, ...(o.members ?? []).filter((x) => x !== viewer && x !== ME)];
  return {
    surface: "reel",
    object: { kind: "reel", id: r.id },
    title: r.caption,
    facts: {
      handle: r.handle,
      caption: r.caption,
      shows: f?.kind ?? "video",
      ...(f?.kind === "restaurants" ? { places: f.places } : {}),
      ...(f?.kind === "hike" ? { trail: f.trail, miles: f.miles } : {}),
      ...(f?.kind === "recipe" ? { dish: f.dish, ingredients: f.ingredients } : {}),
      ...(o.chatName ? { sharedTo: o.chatName } : {}),
      ...(o.reelsInChat ? { reelsInChat: o.reelsInChat.map((x) => x.caption.slice(0, 40)) } : {}),
    },
    people,
    did: [...(o.chatId ? ["shared"] : []), ...(o.did ?? [])],
    ...(o.chatId ? { chatId: o.chatId } : {}),
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Stories

export function storyContext(s: Story, o: { nameOf: NameOf; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const trip = s.id === TRIP.storyId ? TRIP : null;
  const viewer = o.viewer ?? viewerId();
  const poll = s.poll ? pollResult(s.poll) : null;
  // the viewer once, as "me", then everyone else the story is about (its author, the voters, the trip)
  const about = trip ? trip.people : poll ? [s.by, ...poll.voters] : [s.by];
  const people = [ME, ...new Set(about.filter((x) => x !== viewer && x !== ME && x !== "muse"))];
  return {
    surface: "story",
    object: { kind: "story", id: s.id },
    title: s.caption || (poll ? poll.question : "Story"),
    facts: {
      by: o.nameOf(s.by),
      mine: s.by === viewer,
      // votes: the winner's count as the poll shows it (named voters and the rest)
      ...(poll ? { poll: poll.question, winner: poll.winner, voted: poll.voters.filter((x) => x !== viewer).map(o.nameOf), votes: poll.votes, pollEnded: poll.ended, place: poll.place, when: poll.when } : {}),
      ...(trip ? { trip: trip.name, yearAgo: true, with: trip.people.filter((x) => x !== viewer).map(o.nameOf), tripFacts: trip.facts.map((x) => `${x.label}: ${x.value} (${x.line})`) } : {}),
    },
    people,
    did: o.did ?? [],
    names: names(people, o.nameOf),
  };
}

// ---------------------------------------------------------------- Gaming, search

export function gamingContext(o: { nameOf: NameOf; chats: { id: string; name: string; members: readonly string[] }[]; did?: string[] } & Seat): PageContext & { names: Record<string, string> } {
  const people = castWithViewerFirst(o.viewer ?? viewerId());
  return {
    surface: "gaming",
    object: { kind: "gaming", id: "gaming" },
    title: "Gaming",
    facts: { chats: o.chats.map((c) => `${c.name} (${c.members.length})`), friendScore: "Arun: daily puzzle in 3 guesses" },
    people,
    did: o.did ?? [],
    names: names(people, o.nameOf),
  };
}

export function searchContext(o: { nameOf: NameOf; from: "facebook" | "messenger" } & Seat): PageContext & { names: Record<string, string> } {
  const people = castWithViewerFirst(o.viewer ?? viewerId());
  return { surface: "search", object: { kind: "search", id: o.from }, title: "Search", facts: { from: o.from }, people, did: [], names: names(people, o.nameOf) };
}

// ---------------------------------------------------------------- to the factory

/**
 * The page as the factory hears it. The factory's request has `ask`, `chat`, `members` and
 * `surface`; the page goes into `chat` as structured lines from "Facebook" (one fact a line,
 * `key: value`), titled with the page's name, so the factory's reading can quote them.
 */
export function toWire(c: PageContext & { names?: Record<string, string> }): ContextWire {
  const lines: { from: string; text: string }[] = [{ from: "Facebook", text: `${label(c.surface)}: ${c.title}` }];
  for (const [k, v] of Object.entries(c.facts)) {
    const text = Array.isArray(v) ? v.join("; ") : String(v);
    if (text) lines.push({ from: "Facebook", text: `${k}: ${text}`.slice(0, 480) });
  }
  if (c.did.length) lines.push({ from: "Facebook", text: `just did: ${c.did.join(", ")}` });
  const people = c.people.map((id) => ({ id, name: c.names?.[id] ?? id }));
  return { surface: FACTORY[c.surface], title: c.title, lines: lines.slice(0, 20), people };
}

export const factorySurface = (s: CatSurface) => FACTORY[s];

function label(s: CatSurface): string {
  return { event: "Event page", group: "Group", marketplace: "Marketplace listing", feed: "Post in the feed", reel: "Reel", story: "Story", gaming: "Gaming", search: "Search" }[s];
}
