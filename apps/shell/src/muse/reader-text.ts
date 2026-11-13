// The page as the reader hears it (services/demo/reader.ts): plain lines the way a person sees the
// object, the viewer and friends by name, and what the viewer just did. Pure, so the shell and
// the seed step (services/demo/reader-seed.ts) build the same request, and the same cache key.

import type { PageContext } from "./types";

const SURFACE: Record<string, string> = { event: "Event", group: "Group", marketplace: "Marketplace listing", feed: "Post", reel: "Reel", story: "Story", gaming: "Gaming", search: "Search", chat: "Group chat" };

/** facts keys that are bookkeeping, not something a person reads on the page */
const SKIP = new Set(["kind", "about", "mine", "daysAway", "onTheDay", "hosting", "subjectIsMe", "savedOfKind", "width", "admin", "shows", "pollEnded", "yearAgo", "posts"]);

const words = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function pageText(c: PageContext & { extra?: string[] }): string {
  const lines = [`${SURFACE[c.surface] ?? c.surface}: ${c.title}`];
  for (const [k, v] of Object.entries(c.facts)) {
    if (SKIP.has(k) || k === "ask" || k === "typing") continue;
    const text = Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "yes" : "") : String(v);
    if (text) lines.push(`${words(k)}: ${text}`.slice(0, 600));
  }
  if (c.facts.hosting === true) lines.push("the viewer is the host");
  if (c.facts.mine === true) lines.push("the viewer posted this");
  if (c.facts.admin === true) lines.push("the viewer is an admin");
  for (const x of c.extra ?? []) lines.push(x.slice(0, 600));
  return lines.join("\n");
}

export type ReaderPerson = { id: string; name: string };

/** The viewer first, then everyone else on the page. */
export function readerPeople(c: PageContext): ReaderPerson[] {
  const ids = ["me", ...c.people.filter((p) => p !== "me")];
  return ids.map((id) => ({ id, name: c.names[id] ?? id }));
}

/** What the viewer did: the context's own list, plus the act, plus what they are typing. */
export function readerDid(c: PageContext, act?: string): string[] {
  const did = [...c.did.filter((d) => d !== "typing"), ...(act ? [act] : [])];
  const typing = typeof c.facts.typing === "string" ? c.facts.typing : "";
  if (typing) did.push(`typing: ${typing}`);
  return did.length ? did : ["opened"];
}

export type ReaderInput = { surface: string; object: { kind: string; id: string }; page: string; did: string[]; people: ReaderPerson[]; ask?: string; unprompted?: boolean };

export function readerInput(c: PageContext & { extra?: string[] }, act?: string, ask?: string, o: { unprompted?: boolean } = {}): ReaderInput {
  return {
    surface: c.surface,
    object: { kind: c.object.kind, id: c.object.id },
    page: pageText(c),
    did: readerDid(c, act),
    people: readerPeople(c),
    ...(ask?.trim() ? { ask: ask.trim() } : {}),
    ...(o.unprompted ? { unprompted: true } : {}),
  };
}
