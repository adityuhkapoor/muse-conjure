// Seeds tools that friends already made on pages (catalyst 3, "someone already made it"): Maya's
// rides on the Juniper Hale event, her boba ranking on her own post, and Will's price check on the
// grey sectional. Each is the same scenario a viewer would get from the pack, built through the
// same /premade loader, in the room keyed by its page. Runs once (a `seeded-catalysts` marker).

import { CHAT_MEMBERS, EVENT, PEOPLE, seedEvents } from "../../apps/shell/src/store/fake-data.ts";
import { CAST_IDS } from "../../apps/shell/src/store/cast.ts";
import { eventContext, groupContext, listingContext, reelContext, storyContext } from "../../apps/shell/src/muse/context.ts";
import { scenario } from "../../apps/shell/src/muse/pack.ts";
import { BDAY21 } from "../../apps/shell/src/muse/seed.ts";
import type { PageContext } from "../../apps/shell/src/muse/types.ts";
import { ME } from "../../apps/shell/src/store/types.ts";
import { viewerId } from "../../apps/shell/src/lib/media.ts";
import { GROUPS, LISTINGS, REELS, STRANGERS } from "../../apps/shell/src/surfaces/data.ts";
import { chatIdForKey, chatRoom, INDEX_ROOM, SEED_USER, toolRoom, type ChatAction } from "../../apps/shell/src/live/chat-reducer.ts";
import { build, toolSource } from "./premade.ts";
import { miniName } from "@muse/protocol";
import { RoomClient } from "./proto.ts";
import { feedTools } from "./feed-tools.ts";
import { BACKING, backing } from "../../apps/shell/src/surfaces/backing.ts";
import { piece, piece as getPiece } from "@muse/library";
import { compileApp } from "@muse/sandbox/compile";
import { seedReader } from "./reader-seed.ts"; // reader

const CLIENT = "seed-catalysts-v3";
const EVERYONE = [...CAST_IDS];
const FIRST: Record<string, string> = Object.fromEntries([...PEOPLE, ...STRANGERS].map((p) => [p.id, p.first]));
// contexts name the viewer "me" (the store's name for whoever views); here that is the default viewer
const nameOf = (id: string) => FIRST[id === ME ? viewerId() : id] ?? id;

/** The room behind a page (same as apps/shell/src/muse/catalyst.svelte.ts pageKey). */
const pageKey = (c: PageContext) => (c.object.kind === "group" ? `surface:group:${c.object.id}` : `surface:page:${c.object.kind}:${c.object.id}`);

type Made = {
  ctx: PageContext;
  scenario: string;
  by: string;
  /** fixed tool id (the first ones keep theirs, so a reseed is a no-op for them) */
  id?: string;
  /** this one of the scenario's tools instead of the first available */
  tool?: string;
  tweak?: (p: Record<string, unknown>) => Record<string, unknown>;
  summary: string;
  /** first moves in the tool, each from its own user (wire ids or cast ids) */
  acts?: { user: string; action: unknown }[];
  /** activity lines from friends who used it ("Maya joined day 12"), so the page shows "N used it" */
  used?: { by: string; line: string }[];
};

function made(): Made[] {
  const sectional = LISTINGS.find((l) => l.id === "l-sectional")!;
  return [
    { ctx: listingContext(sectional, { saved: [sectional], isSaved: true, nameOf }), scenario: "mp-price-check", id: "t-cat-mp-price-check", by: "priya", summary: "Will asked · rate it" },
    { ctx: listingContext(LISTINGS.find((l) => l.id === "l-loveseat")!, { saved: [], isSaved: true, nameOf }), scenario: "mp-room-fit", by: "dev", summary: "Aditya is placing it" },
    { ctx: groupContext(GROUPS.find((g) => g.id === "sublets")!, { draft: "", nameOf }), scenario: "group-sublet-finder", by: "lena", summary: "7 places · save or skip" },
    // The Muse story in the tray (surfaces/data.ts s-muse): the live face drop, friends already dropping.
    {
      ctx: storyContext({ id: "s-muse", by: "muse", caption: "", tone: 1 }, { nameOf }),
      scenario: "story-face-drop",
      id: "t-cat-story-face-drop",
      by: "muse",
      summary: "Tap to drop a face",
      acts: [
        { user: "maya", action: { t: "drop", x: 300, y: 420 } },
        { user: "priya", action: { t: "drop", x: 640, y: 380 } },
        { user: "theo", action: { t: "drop", x: 480, y: 300 } },
        { user: "maya", action: { t: "boop", id: 0 } },
      ],
    },
    // The first reel on Reels: Will's ranking of the week's reels from apt 4b, live on the reel.
    {
      ctx: reelContext(REELS[0]!, { nameOf, chatId: "apt4b", chatName: "apt 4b", members: [...CHAT_MEMBERS.apt4b!], reelsInChat: REELS.map((r) => ({ id: r.id, caption: r.caption })) }),
      scenario: "reel-rank",
      id: "t-cat-reel-rank",
      by: "priya",
      summary: "4 reels · watch party Fri",
      used: [
        { by: "priya", line: `${nameOf("priya")} ranked the week's reels` },
        { by: "maya", line: `${nameOf("maya")} laughed at the dumplings` },
        { by: "dev", line: `${nameOf("dev")} is in for the watch party` },
      ],
    },
    // The green velvet loveseat's owners so far, on its listing.
    {
      ctx: listingContext(LISTINGS.find((l) => l.id === "l-loveseat")!, { saved: [], isSaved: true, nameOf }),
      scenario: "mp-lineage",
      id: "t-cat-mp-lineage",
      by: "jonah",
      summary: "4 owners since 2020",
      used: [
        { by: "jonah", line: `${nameOf("jonah")} added the den years` },
        { by: "maya", line: `${nameOf("maya")} added movie night HQ` },
      ],
    },
    // The party the viewer's apartment hosts (store/fake-data.ts partyEvent): Maya's door list.
    {
      ctx: eventContext(seedEvents().find((e) => e.id === BDAY21.id)!, { rsvp: "going", now: EVENT.start, nameOf }),
      scenario: "event-host",
      id: "t-cat-event-host",
      by: "maya",
      summary: "23 going · door list",
      used: [
        { by: "maya", line: `${nameOf("maya")} is on the door` },
        { by: "dev", line: `${nameOf("dev")} is going` },
        { by: "theo", line: `${nameOf("theo")} set plus ones to 1 each` },
      ],
    },
  ];
}

/** Each user's first moves in a tool, from a client of their own (a user can act more than once). */
async function firstMoves(ws: string, toolId: string, acts: { user: string; action: unknown }[], clients: RoomClient[]) {
  for (const user of [...new Set(acts.map((a) => a.user))]) {
    const rc = await new RoomClient(ws, toolRoom(toolId), `${CLIENT}-${user}`, user).join();
    clients.push(rc);
    await rc.sendAll(acts.filter((a) => a.user === user).map((a) => a.action));
  }
}

export async function seedCatalysts(ws: string, log: (s: string) => void = console.log): Promise<"seeded" | "already"> {
  seedReader(log); // reader: stored answers for every seeded page (reader-seed.ts), on every start
  const index = await new RoomClient(ws, INDEX_ROOM, CLIENT, SEED_USER).join();
  if (index.entries.some((e) => (e.action as { t?: string })?.t === "seeded-catalysts-4")) {
    index.close();
    return "already";
  }
  const clients: RoomClient[] = [index];
  const list = made();
  const at = Date.now() - 5 * 60 * 60_000;
  // A group keeps the chat seed-surfaces made for it (surfaces/backing.ts); other pages get one per key.
  const chats = list.map((m) => ({ key: pageKey(m.ctx), id: backing(pageKey(m.ctx))?.id ?? chatIdForKey(pageKey(m.ctx)), m }));
  const listed = chats.filter((c) => !backing(c.key));
  await index.sendAll(listed.map((c) => ({ t: "chat", id: c.id, key: c.key })));
  for (const { id, key, m } of chats) {
    const sc = scenario(m.scenario)!;
    const choices = sc.tools.filter((t) => !m.tool || t.tool === m.tool).map((t) => ({ tool: t.tool, params: (m.tweak ?? ((p) => p))(t.params(m.ctx)) }));
    const b = await build(choices);
    const toolId = m.id ?? `t-cat-${m.scenario}-${m.ctx.object.id}`;
    // one client per tool: several tools can share a page's chat
    const room = await new RoomClient(ws, chatRoom(id), `${CLIENT}-${toolId}`, SEED_USER).join();
    clients.push(room);
    await room.sendAll([
      ...(backing(key) ? [] : [{ t: "create", name: m.ctx.title.slice(0, 60), kind: "group", members: EVERYONE, key } as ChatAction]),
      { t: "tool", id: toolId, name: miniName(b.source, sc.title(m.ctx)), summary: m.summary, code: b.code, by: m.by, at } as ChatAction,
    ]);
    const sys = await new RoomClient(ws, toolRoom(toolId), CLIENT, SEED_USER).join();
    clients.push(sys);
    await sys.sendAll([{ t: "@members", members: EVERYONE.map((u) => ({ id: u, name: FIRST[u] ?? u })) }]);
    await firstMoves(ws, toolId, m.acts ?? [], clients);
    if (m.used?.length) {
      const lines = await new RoomClient(ws, chatRoom(id), `${CLIENT}-${toolId}-used`, SEED_USER).join();
      clients.push(lines);
      await lines.sendAll(m.used.map((u, i) => ({ t: "tool-summary", id: toolId, text: m.summary, by: u.by, at: at + (i + 1) * 7 * 60_000, line: u.line }) as ChatAction));
    }
    log(`  ${m.scenario}: ${b.tool} on ${key}`);
  }
  // Home feed tools (feed-tools.ts): each in its room, the room's members the cast plus the extras in it,
  // then everyone's first moves from their own users.
  const feedList = feedTools(nameOf);
  const extrasOf = (key: string) => [...new Set(feedList.filter((t) => t.room === key).flatMap((t) => t.members ?? []))];
  const fresh = [...new Set(feedList.map((t) => t.room))].filter((k) => !backing(k) && !chats.some((c) => c.key === k));
  const feedIndex = await new RoomClient(ws, INDEX_ROOM, `${CLIENT}-feed`, SEED_USER).join();
  clients.push(feedIndex);
  await feedIndex.sendAll(fresh.map((key) => ({ t: "chat", id: chatIdForKey(key), key })));
  const created = new Set<string>();
  for (const t of feedList) {
    const id = backing(t.room)?.id ?? chatIdForKey(t.room);
    const members = [...EVERYONE, ...extrasOf(t.room)];
    const room = await new RoomClient(ws, chatRoom(id), `${CLIENT}-${t.id}`, SEED_USER).join();
    clients.push(room);
    const feedSrc = await toolSource(t.lab, t.params);
    const create = fresh.includes(t.room) && !created.has(t.room);
    created.add(t.room);
    await room.sendAll([
      ...(create ? [{ t: "create", name: t.name.slice(0, 60), kind: "group", members, key: t.room } as ChatAction] : []),
      { t: "tool", id: t.id, name: miniName(feedSrc, t.name), summary: t.summary, code: compileApp(feedSrc).code, by: t.by, at } as ChatAction,
    ]);
    const sys = await new RoomClient(ws, toolRoom(t.id), `${CLIENT}-${t.id}-sys`, SEED_USER).join();
    clients.push(sys);
    if (!sys.entries.length) {
      await sys.sendAll([{ t: "@members", members: members.map((u) => ({ id: u, name: FIRST[u] ?? u })) }]);
      await firstMoves(ws, t.id, t.acts ?? [], clients);
    }
    log(`  feed: lab:${t.lab} on ${t.room}`);
  }
  // Surface tools that moved to a lab port after a database was seeded (seed-surfaces runs once): add the
  // new ones to their chats. On a fresh database seed-surfaces already made them and these are no-ops.
  for (const b of BACKING) {
    for (const t of b.tools) {
      if (!piece(t.piece) || getPiece(t.piece)?.file.includes("/pieces/")) continue;
      const room = await new RoomClient(ws, chatRoom(b.id), `${CLIENT}-${t.id}`, SEED_USER).join();
      clients.push(room);
      const backSrc = await toolSource(t.piece, t.params);
      await room.sendAll([{ t: "tool", id: t.id, name: miniName(backSrc, t.name), summary: t.summary, code: compileApp(backSrc).code, by: "muse", at } as ChatAction]);
      const sys = await new RoomClient(ws, toolRoom(t.id), `${CLIENT}-${t.id}`, SEED_USER).join();
      clients.push(sys);
      if (!sys.entries.length) {
        await sys.sendAll([{ t: "@members", members: b.members.map((u) => ({ id: u, name: FIRST[u] ?? u })) }]);
        await firstMoves(ws, t.id, t.acts, clients);
      }
    }
  }
  index.act(listed.length + 1, { t: "seeded-catalysts-4" });
  await index.until(() => !!index.mine(listed.length + 1));
  for (const c of clients) c.close();
  log(`seeded ${list.length + feedList.length} tools already on pages`);
  return "seeded";
}
