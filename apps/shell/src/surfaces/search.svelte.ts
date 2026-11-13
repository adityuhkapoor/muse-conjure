// Facebook's own search: people, groups, posts, events, Marketplace listings and Minis, matched
// on what the shell already holds. The query is shared so the desktop top bar and the phone
// screen drive the same results.

import { store } from "../store";
import { EXTRA_PEOPLE } from "../store/extras";
import { PEOPLE } from "../store/fake-data";
import type { Person } from "../store/types";
import { FEED, GROUPS, isModule, LISTINGS, STRANGERS, money, type Post } from "./data";
import { fmtEventDate } from "../store/fake-data";
import { say, isMe, person } from "./say";

export const fbSearch = $state({ q: "" });

export type Hit =
  | { kind: "person"; key: string; id: string; title: string; sub: string }
  | { kind: "group"; key: string; id: string; title: string; sub: string }
  | { kind: "post"; key: string; id: string; group?: string; title: string; sub: string }
  | { kind: "event"; key: string; id: string; title: string; sub: string }
  | { kind: "listing"; key: string; id: string; title: string; sub: string }
  | { kind: "mini"; key: string; id: string; chat: string; title: string; sub: string };

export type Section = { name: "People" | "Groups" | "Posts" | "Events" | "Marketplace" | "Minis"; hits: Hit[] };

const PER_SECTION = 5;
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const words = (q: string) => norm(q).split(/[^a-z0-9$']+/).filter(Boolean);
/** Every word of the query is somewhere in the text. */
const matches = (text: string, ws: string[]) => {
  const t = norm(text);
  return ws.every((w) => t.includes(w));
};
const snip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Everyone the shell knows by name, once, the viewer left out. */
function everyone(): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of [...PEOPLE, ...EXTRA_PEOPLE, ...STRANGERS]) {
    const q = person(p.id) ?? p;
    if (seen.has(q.id) || isMe(p.id) || p.id === "muse") continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

const homePosts = () => FEED.filter((x): x is Post => !isModule(x));

export function search(q: string): Section[] {
  const ws = words(q);
  if (!ws.length) return [];
  const sections: Section[] = [];
  const add = (name: Section["name"], hits: Hit[]) => hits.length && sections.push({ name, hits: hits.slice(0, PER_SECTION) });

  add("People", everyone().filter((p) => matches(`${p.name} ${p.first}`, ws)).map((p) => ({ kind: "person", key: `p-${p.id}`, id: p.id, title: p.name, sub: "Person" })));

  add("Groups", GROUPS.filter((g) => matches(g.name, ws)).map((g) => ({ kind: "group", key: `g-${g.id}`, id: g.id, title: g.name, sub: `${g.privacy} · ${g.members.toLocaleString("en-US")} members` })));

  const posts: Hit[] = [];
  for (const p of homePosts()) {
    const text = say(p.text) + ("headline" in p ? ` ${say(p.headline)}` : "");
    if (text.trim() && matches(text, ws)) posts.push({ kind: "post", key: `h-${p.id}`, id: p.id, ...(p.group ? { group: p.group } : {}), title: snip(say(p.text) || say("headline" in p ? p.headline : "")), sub: `${person(p.by)?.name ?? p.by}${p.group ? ` in ${GROUPS.find((g) => g.id === p.group)?.name ?? "a group"}` : ""}` });
  }
  for (const g of GROUPS) for (const p of g.posts) if (matches(say(p.text), ws)) posts.push({ kind: "post", key: `gp-${p.id}`, id: p.id, group: g.id, title: snip(say(p.text)), sub: `${person(p.by)?.name ?? p.by} in ${g.name}` });
  add("Posts", posts);

  add("Events", store.events.filter((e) => matches(`${e.title} ${e.venue} ${e.description}`, ws)).map((e) => ({ kind: "event", key: `e-${e.id}`, id: e.id, title: e.title, sub: `${fmtEventDate(e.start)} · ${e.venue}` })));

  add("Marketplace", LISTINGS.filter((l) => matches(`${l.title} ${l.kind} ${l.kinds} ${l.where} ${l.description}`, ws)).map((l) => ({ kind: "listing", key: `l-${l.id}`, id: l.id, title: `${money(l.price)} · ${l.title}`, sub: l.where })));

  add("Minis", store.tools.filter((t) => matches(`${t.name} ${t.summary}`, ws)).map((t) => ({ kind: "mini", key: `m-${t.id}`, id: t.id, chat: t.chat, title: t.name, sub: `${t.summary}${store.chat(t.chat) ? ` · ${store.chat(t.chat)!.name}` : ""}` })));

  return sections;
}

/** What to show before anything is typed: words people tend to look for, and places to go. */
export const SUGGESTED_SEARCHES = ["sublet", "juniper hale", "couch", "chore"];

export function suggestedGroups() {
  return GROUPS.slice(0, 3);
}
export function suggestedListings() {
  return LISTINGS.slice(0, 3);
}
export function suggestedEvents() {
  return store.events.slice(0, 2);
}
