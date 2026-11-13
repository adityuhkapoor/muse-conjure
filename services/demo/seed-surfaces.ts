// Seeds the chats behind the Facebook surfaces (apps/shell/src/surfaces/backing.ts): a friend's
// chore wheel shown as a post, Arun's bracket post, the sublet group, the climbing club's pinned
// tools. Each tool is a real library piece with a few first moves from friends. Also Will's
// to-try list from a reel in his chat with Tsai Lin, which waits on Tsai Lin. Runs after seed.ts, once
// (a `seeded-surfaces` marker in `t:index`), so an existing database gets it too.

import { compileApp } from "@muse/sandbox/compile";
import { sourceOf, toolSource } from "./premade.ts";
import { BACKING } from "../../apps/shell/src/surfaces/backing.ts";
import { PRIYA_TRY, REELS } from "../../apps/shell/src/surfaces/data.ts";
import { chatRoom, INDEX_ROOM, SEED_USER, toolRoom, type ChatAction } from "../../apps/shell/src/live/chat-reducer.ts";
import { RoomClient } from "./proto.ts";

const CLIENT = "seed-surfaces-v1";
const wire = (id: string) => (id === "me" ? "noa" : id);
const FIRST: Record<string, string> = { noa: "Tsai Lin", maya: "Maya", dev: "Aditya", jonah: "Calvin", priya: "Will", theo: "Arun" };

async function code(id: string, params: Record<string, unknown>): Promise<string> {
  // library/pieces or a ported lab tool (library/lab, through its own params block)
  return compileApp(await toolSource(id, params)).code;
}

/** Members first, then each first move as its own user. Returns the last entry's user and time. */
async function toolLog(ws: string, toolId: string, members: string[], acts: { user: string; action: unknown }[], clients: RoomClient[]) {
  const sys = await new RoomClient(ws, toolRoom(toolId), CLIENT, SEED_USER).join();
  clients.push(sys);
  await sys.sendAll([{ t: "@members", members: members.map((m) => ({ id: m, name: FIRST[m] ?? m })) }]);
  let last: { user: string; time: number } | null = null;
  for (const a of acts) {
    const rc = await new RoomClient(ws, toolRoom(toolId), `${CLIENT}-${a.user}`, wire(a.user)).join();
    clients.push(rc);
    // a user can act more than once: send all of theirs from one client
    const mineActs = acts.filter((x) => x.user === a.user);
    if (rc.entries.some((e) => e.client === `${CLIENT}-${a.user}`)) continue;
    const es = await rc.sendAll(mineActs.map((x) => x.action));
    const e = es.at(-1);
    if (e && (!last || e.time >= last.time)) last = { user: e.user, time: e.time };
  }
  return last;
}

export async function seedSurfaces(ws: string, log: (s: string) => void = console.log): Promise<"seeded" | "already"> {
  const index = await new RoomClient(ws, INDEX_ROOM, CLIENT, SEED_USER).join();
  if (index.entries.some((e) => (e.action as { t?: string })?.t === "seeded-surfaces")) {
    index.close();
    return "already";
  }
  const clients: RoomClient[] = [index];
  const t0 = Date.now() - 6 * 60 * 60_000;
  await index.sendAll(BACKING.map((b) => ({ t: "chat", id: b.id, key: b.key })));

  for (const b of BACKING) {
    const members = b.members.map(wire);
    const actions: ChatAction[] = [{ t: "create", name: b.name, kind: "group", members, key: b.key }];
    for (const t of b.tools) actions.push({ t: "tool", id: t.id, name: t.name, summary: t.summary, code: await code(t.piece, t.params), by: "muse", at: t0 } as ChatAction);
    const room = await new RoomClient(ws, chatRoom(b.id), CLIENT, SEED_USER).join();
    clients.push(room);
    await room.sendAll(actions);
    const sums: ChatAction[] = [];
    for (const t of b.tools) {
      const last = await toolLog(ws, t.id, members, t.acts, clients);
      if (last) sums.push({ t: "tool-summary", id: t.id, text: t.summary, by: last.user, at: last.time });
    }
    if (sums.length) {
      sums.forEach((a, i) => room.act(actions.length + 1 + i, a));
      await room.until(() => sums.every((_, i) => room.mine(actions.length + 1 + i)));
    }
  }

  // Will's to-try list in his chat with Tsai Lin: a shared reel, then the list, waiting on Tsai Lin.
  const r = REELS[0]!;
  const at = Date.now() - 11 * 60 * 60_000;
  const priya = await new RoomClient(ws, chatRoom("priya"), `${CLIENT}-dm`, SEED_USER).join();
  clients.push(priya);
  await priya.sendAll([
    { t: "msg", id: "sx-reel", kind: "link", as: "priya", at, link: { site: `Reel · ${r.handle}`, title: r.caption, description: "Reels", shared: { kind: "reel", id: r.id } } },
    { t: "msg", id: "sx-wait", as: "priya", at: at + 60_000, text: "we need to go to all 3" },
    { t: "msg", id: "src-reels-tt-sx-reel", kind: "system", at: at + 120_000, text: "**Will** added 3 places to **To try**" },
    { t: "tool", id: "t-sx-try", name: "To try", summary: TRY_SUMMARY, code: compileApp(await sourceOf({ tool: "lab:reel-to-try", params: priyaTry(r) })).code, by: "priya", at: at + 120_000 },
  ]);
  // as rich as the lab example: one spot they went to with ratings, one they want, and Will adds the reel's
  const last = await toolLog(ws, "t-sx-try", ["noa", "priya"], [{ user: "priya", action: { t: "add" } }], clients);
  if (last) {
    priya.act(5, { t: "tool-summary", id: "t-sx-try", text: TRY_SUMMARY, by: last.user, at: last.time });
    await priya.until(() => !!priya.mine(5));
  }

  index.act(BACKING.length + 1, { t: "seeded-surfaces" });
  await index.until(() => !!index.mine(BACKING.length + 1));
  for (const c of clients) c.close();
  log(`seeded ${BACKING.length} surface chats and Will's to-try list`);
  return "seeded";
}

const TRY_SUMMARY = "To try: 3 spots · Golden Fold just added";

/** Will's to-try list (lab:reel-to-try): the dumpling reel he shared, a spot the two went to, one he wants. */
export function priyaTry(r: (typeof REELS)[number]): Record<string, unknown> {
  const [first, second, third] = PRIYA_TRY as [string, string, string];
  return {
    reel: { from: "Will", note: "we need to go to all 3", account: r.handle, caption: r.caption, likes: `${Math.round(r.likes / 1000)}K`, place: first, area: "Chinatown" },
    spots: [
      { name: second, area: "Chinatown", tried: "Oct 3", ratings: [{ by: "Will", stars: 4 }, { by: "Maya", stars: 5 }], want: [] },
      { name: third, area: "Sunset", tried: "", ratings: [], want: ["Will", "Aditya"] },
    ],
    compact: true, // lands in a chat: 420 px, not the reel's 600
  };
}
