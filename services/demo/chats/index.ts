// The seeded Messenger histories: three weeks per chat (FEED_SPEC section F), one file each, plus
// the chats that have no Muse tools. `historyChats` swaps them in for the short lists in the fake
// store's seed chats and adds the new chats, so the live inbox looks lived in.

import type { Chat, Message } from "../../../apps/shell/src/store/types.ts";
import { messages as apt4b } from "./apt4b.ts";
import { messages as boys } from "./boys.ts";
import { messages as dmAditya } from "./dm-aditya.ts";
import { messages as dmArun } from "./dm-arun.ts";
import { messages as dmCalvin } from "./dm-calvin.ts";
import { messages as dmDevCalvin } from "./dm-dev-calvin.ts";
import { messages as dmDevArun } from "./dm-dev-arun.ts";
import { messages as dmDevWill } from "./dm-dev-will.ts";
import { messages as dmHana } from "./dm-hana.ts";
import { messages as econ140 } from "./econ140.ts";
import { messages as latenight } from "./latenight.ts";
import { messages as linFamily } from "./lin-family.ts";
import { messages as maya } from "./maya.ts";
import { messages as priya } from "./priya.ts";
import { messages as senior } from "./senior.ts";

/** The six main chats keep their ids and members; only the messages change. */
const MAIN: Record<string, Message[]> = { apt4b, boys, maya, senior, priya };

/** Chats the fake store does not have: tool-free one-to-ones and groups, and Arun's group. */
const EXTRA: Omit<Chat, "unread" | "typing" | "seenBy" | "activeNow">[] = [
  { id: "latenight", name: "late night", kind: "group", members: ["theo", "jonah", "dev"], messages: latenight },
  // from Tsai Lin's seat
  { id: "dm-calvin", name: "Calvin Karthik", kind: "dm", members: ["me", "jonah"], messages: dmCalvin },
  { id: "dm-arun", name: "Arun Vaithianathan", kind: "dm", members: ["me", "theo"], messages: dmArun },
  { id: "dm-aditya", name: "Aditya Kapoor", kind: "dm", members: ["me", "dev"], messages: dmAditya },
  { id: "dm-hana", name: "Hana Ito", kind: "dm", members: ["me", "hana"], messages: dmHana },
  { id: "econ140", name: "econ 140 final", kind: "group", members: ["me", "tess", "zoe", "kev", "ava", "omar"], messages: econ140 },
  { id: "lin-family", name: "lin family", kind: "group", members: ["me", "lin-mom", "lin-dad", "lin-eric"], messages: linFamily },
  // from Aditya's seat (the spec's one-to-ones are written from Tsai Lin's; Tsai Lin is dm-aditya)
  { id: "dm-dev-calvin", name: "Calvin Karthik", kind: "dm", members: ["dev", "jonah"], messages: dmDevCalvin },
  { id: "dm-dev-arun", name: "Arun Vaithianathan", kind: "dm", members: ["dev", "theo"], messages: dmDevArun },
  { id: "dm-dev-will", name: "Will Li", kind: "dm", members: ["dev", "priya"], messages: dmDevWill },
];

/** Who has not read the end of the chat (wire ids): the unread dots. Everyone else has. */
export const UNREAD: Record<string, string[]> = {
  boys: ["noa"],
  senior: ["noa"],
  "dm-hana": ["noa"],
  econ140: ["noa"],
  "dm-dev-calvin": ["dev"],
  "dm-dev-arun": ["dev"],
};

export function historyChats(base: Chat[]): Chat[] {
  const main = base.map((c) => ({ ...c, messages: MAIN[c.id] ?? c.messages }));
  const extra = EXTRA.map((c) => ({ ...c, unread: false, typing: [], seenBy: [], activeNow: false }));
  return [...main, ...extra];
}
