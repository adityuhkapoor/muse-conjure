// A small world for tests: the in-memory Sequencer as the server, a fake clock, the stuck
// "senior week" chat, and a presenter who behaves like the shell (here heartbeats, messages,
// Muse's tool landing).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sequencer } from "../../../packages/sync/src/sequencer.ts";
import { createReplica, type SyncReplica } from "../../../packages/sync/src/index.ts";
import { chatReducer, chatRoom, INDEX_ROOM, indexReducer, toolRoom, type ChatState } from "../../../apps/shell/src/live/chat-reducer.ts";
import { compileApp } from "../../../packages/sandbox/src/compile.ts";
import { PIECES_DIR } from "../../../library/index.ts";
import { FakeClock } from "../src/clock.ts";
import { Director, type CastOptions } from "../src/director.ts";
import { memoryNet } from "../src/net.ts";

export const wheelCode = (opts = `["Thai Basil", "Sushi Ko", "Taco truck"]`) =>
  compileApp(readFileSync(join(PIECES_DIR, "wheel/piece.tsx"), "utf8").replace(/options: \[[^\]]*\]/, `options: ${opts}`)).code;
export const pieceCode = (id: string) => compileApp(readFileSync(join(PIECES_DIR, id, "piece.tsx"), "utf8")).code;

const SENIOR = ["noa", "maya", "dev", "jonah", "priya", "theo"];

export async function world(o: Partial<CastOptions> = {}, members = SENIOR) {
  const clock = new FakeClock();
  const seq = new Sequencer({ now: () => clock.now(), seed: 42 });
  const net = memoryNet(seq);
  // Seed the chat as the seeder does.
  const seedSock = net("seed");
  const idx = createReplica(indexReducer, seedSock.transport(INDEX_ROOM), { room: INDEX_ROOM, user: "@seed", client: "seed-v1", now: () => clock.now() });
  const chat = createReplica(chatReducer, seedSock.transport(chatRoom("senior")), { room: chatRoom("senior"), user: "@seed", client: "seed-v1", now: () => clock.now() });
  await clock.advance(10);
  idx.dispatch({ t: "chat", id: "senior" });
  chat.dispatch({ t: "create", name: "senior week", kind: "group", members });
  const lines: [string, string][] = [["maya", "where are we eating tonight"], ["dev", "thai basil or sushi ko"], ["priya", "or the taco truck on college ave, open til 11"], ["maya", "ok so which one"], ["dev", "idk u pick"], ["priya", "no u pick"]];
  lines.forEach(([as, text], i) => chat.dispatch({ t: "msg", id: `senior-m${i}`, text, as, at: clock.now() - 60_000 }));
  await clock.advance(10);

  const director = new Director({ net, clock, seed: 7, runId: "test", ...o });
  director.start();
  await clock.advance(50);

  return { clock, seq, net, director, presenter: presenter(net, clock, "noa") };
}

export function presenter(net: ReturnType<typeof memoryNet>, clock: FakeClock, me: string) {
  const sock = net(`phone-${me}`);
  const index = createReplica(indexReducer, sock.transport(INDEX_ROOM), { room: INDEX_ROOM, user: me, client: `c-${me}-phone`, now: () => clock.now() });
  const chats = new Map<string, SyncReplica<ChatState>>();
  const tools = new Map<string, SyncReplica<unknown>>();
  let beat: number | null = null;
  let n = 0;
  const room = (id: string) => {
    if (!chats.has(id)) chats.set(id, createReplica(chatReducer, sock.transport(chatRoom(id)), { room: chatRoom(id), user: me, client: `c-${me}-${id}`, now: () => clock.now() }));
    return chats.get(id)!;
  };
  return {
    index,
    room,
    /** start the shell's `here` heartbeat */
    arrive() {
      // As the shell: the first heartbeat once the directory is live, then every 3 s.
      const tick = () => {
        if (!index.live) return void (beat = clock.set(tick, 20));
        index.eph("here", 1);
        beat = clock.set(tick, 3000);
      };
      tick();
    },
    leave() {
      if (beat !== null) clock.clear(beat);
    },
    say(chat: string, text: string) {
      room(chat).dispatch({ t: "msg", id: `p-${me}-${++n}`, text });
    },
    /** what the shell does when Muse's build lands */
    tool(chat: string, id: string, code: string, members: string[]) {
      room(chat).dispatch({ t: "tool", id, name: "Where are we eating?", summary: "", code, by: me });
      const sockT = sock.transport(toolRoom(id));
      const r = createReplica({ init: () => 0, reduce: (s: number) => s + 1 }, sockT, { room: toolRoom(id), user: me, client: `f-${me}-${id}`, now: () => clock.now() });
      tools.set(id, r);
      r.dispatch({ t: "@members", members: members.map((m) => ({ id: m, name: m[0]!.toUpperCase() + m.slice(1) })) });
    },
  };
}

/** Every entry in a room written by a cast client. */
export const castEntries = (seq: Sequencer, room: string) => seq.log(room).filter((e) => e.client.startsWith("cast-"));
