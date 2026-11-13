// Tool options and kits in the chat reducer: anyone in the chat deletes a tool (it becomes one line);
// only whoever started a game ends it (it starts over in a fresh room); a kit is stored bounded and
// only with http(s) links; a deleted Bring List frees its kit to make one again.
import { expect, test } from "bun:test";
import { emptyChat, reduceChat, roomOfTool, type ChatState } from "../src/live/chat-reducer";

let seq = 0;
const meta = (user: string, time = 1000) => ({ seq: ++seq, user, time, seed: 1, client: "c", cseq: seq });
function chat(): ChatState {
  let s = reduceChat(emptyChat(), { t: "create", name: "camping", kind: "group", members: ["noa", "maya"] }, meta("noa"));
  s = reduceChat(s, { t: "tool", id: "t1", name: "Trivia night", summary: "", code: "x", by: "noa", piece: "lab:trivia-night" }, meta("noa"));
  return s;
}

test("anyone in the chat deletes a tool; a stranger cannot", () => {
  const s = chat();
  expect(reduceChat(s, { t: "tool-remove", id: "t1", name: "Zed" }, meta("zed"))).toBe(s);
  const after = reduceChat(s, { t: "tool-remove", id: "t1", name: "Maya" }, meta("maya"));
  expect(after.messages.find((m) => m.id === "t1")).toMatchObject({ kind: "system", text: "**Maya** removed Trivia night" });
  expect(after.tools.t1).toBeUndefined();
});

test("only the starter ends a game; it starts over in a fresh room", () => {
  const s = chat();
  expect(reduceChat(s, { t: "tool-restart", id: "t1" }, meta("maya"))).toBe(s);
  const after = reduceChat(s, { t: "tool-restart", id: "t1", name: "Noa" }, meta("noa", 5000));
  const tool = after.messages.find((m) => m.id === "t1")!.tool!;
  expect(tool.rev).toBe(1);
  expect(roomOfTool(tool)).toBe("a:t1~1");
  expect(tool.piece).toBe("lab:trivia-night");
  expect(after.messages.at(-1)?.text).toBe("**Noa** ended Trivia night. Anyone can play again");
  // again: another fresh room
  expect(roomOfTool(reduceChat(after, { t: "tool-restart", id: "t1" }, meta("noa")).messages.find((m) => m.id === "t1")!.tool!)).toBe("a:t1~2");
});

test("a kit is stored bounded, with http(s) links only, and fills its pending card once", () => {
  let s = reduceChat(chat(), { t: "kit-pending", id: "k1", ask: "muse we want to go camping, what do we need" }, meta("noa"));
  const kit = {
    title: "Lake camping",
    people: 4,
    total: 160,
    each: 40,
    items: [
      { need: "tent", qty: 1, why: "sleeps 4", listing: "l-tent", online: null, unit: 120, cost: 120, covered: null },
      { need: "chalk", qty: 1, why: "", listing: null, online: { store: "REI", title: "Chalk", price: 40, url: "javascript:alert(1)", image: null }, unit: 40, cost: 40, covered: null },
    ],
  };
  s = reduceChat(s, { t: "kit", id: "k1", kit }, meta("noa"));
  const k = s.messages.find((m) => m.id === "k1")!.kit!;
  expect(k.items[0]!.listing).toBe("l-tent");
  expect(k.items[1]!.online).toBeNull(); // a non-http link is dropped
  expect(reduceChat(s, { t: "kit", id: "k1", kit: { ...kit, title: "Other" } }, meta("noa"))).toBe(s);
});

test("deleting the Bring List a kit made lets the kit make it again", () => {
  let s = reduceChat(chat(), { t: "kit-pending", id: "k1", ask: "muse what do we need for the camping trip" }, meta("noa"));
  s = reduceChat(s, { t: "kit", id: "k1", kit: { title: "Camping", people: 2, total: 0, each: 0, items: [] } }, meta("noa"));
  s = reduceChat(s, { t: "tool", id: "t2", name: "Camping: who brings what", summary: "", code: "x", by: "noa", piece: "claims" }, meta("noa"));
  s = reduceChat(s, { t: "kit-link", id: "k1", claims: "t2" }, meta("noa"));
  expect(s.messages.find((m) => m.id === "k1")!.kit!.claims).toBe("t2");
  s = reduceChat(s, { t: "tool-remove", id: "t2" }, meta("maya"));
  expect(s.messages.find((m) => m.id === "k1")!.kit!.claims).toBeUndefined();
});
