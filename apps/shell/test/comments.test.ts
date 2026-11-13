// Comments: the reducer's comment and like actions, and the written threads against their counts.
import { expect, test } from "bun:test";
import { emptyChat, reduceChat } from "../src/live/chat-reducer";
import { SEEDED } from "../src/surfaces/comments";

let seq = 0;
const meta = (user: string, time = 1000) => ({ seq: ++seq, user, time, seed: 1, client: "c", cseq: seq });

test("a comment is added once, with its author and time, and is not a post", () => {
  let s = reduceChat(emptyChat(), { t: "comment", id: "c1", post: "p-den", text: "hi" }, meta("noa", 5000));
  s = reduceChat(s, { t: "comment", id: "c1", post: "p-den", text: "again" }, meta("noa"));
  expect(s.comments).toEqual([{ id: "c1", post: "p-den", from: "noa", text: "hi", at: 5000 }]);
  expect(s.messages).toEqual([]);
  expect(reduceChat(s, { t: "comment", id: "c2", post: "p-den", text: "   " }, meta("noa"))).toBe(s);
});

test("a comment like toggles per person, on a seeded id too", () => {
  let s = reduceChat(emptyChat(), { t: "comment-like", id: "p-den:1" }, meta("noa"));
  s = reduceChat(s, { t: "comment-like", id: "p-den:1" }, meta("maya"));
  expect(s.commentLikes).toEqual({ "p-den:1": ["noa", "maya"] });
  s = reduceChat(s, { t: "comment-like", id: "p-den:1" }, meta("noa"));
  expect(s.commentLikes).toEqual({ "p-den:1": ["maya"] });
  s = reduceChat(s, { t: "comment-like", id: "p-den:1" }, meta("maya"));
  expect(s.commentLikes).toEqual({});
});

test("replies point at a comment above them, one level", () => {
  for (const rows of Object.values(SEEDED)) {
    const tops = new Set(rows.filter((r) => !r.parent).map((r) => r.id));
    for (const r of rows) if (r.parent) expect(tops.has(r.parent)).toBe(true);
  }
});
