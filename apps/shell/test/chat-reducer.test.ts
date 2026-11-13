// The activity log a tool keeps in its chat: one line per action, the same person's burst of taps
// collapses into one line, and the summary catching up on an action never adds a line.
import { expect, test } from "bun:test";
import { ACTIVITY_WINDOW_MS, emptyChat, reduceChat, type ChatState } from "../src/live/chat-reducer";

let seq = 0;
const meta = (user: string, time = 1000) => ({ seq: ++seq, user, time, seed: 1, client: "c", cseq: seq });
function chatWithTool(): ChatState {
  let s = reduceChat(emptyChat(), { t: "create", name: "senior week", kind: "group", members: ["noa", "maya"] }, meta("noa"));
  s = reduceChat(s, { t: "tool", id: "t1", name: "Where are we eating?", summary: "", code: "x", by: "noa" }, meta("noa", 1000));
  return s;
}
const sum = (s: ChatState, by: string, at: number, text: string) => reduceChat(s, { t: "tool-summary", id: "t1", text, by, at }, meta(by, at));
const log = (s: ChatState) => (s.tools.t1?.log ?? []).map((e) => `${e.by}@${e.at}: ${e.text}`);

test("making the tool is not an activity line", () => {
  expect(log(chatWithTool())).toEqual([]);
});

test("each person's action adds a line with the summary after it", () => {
  let s = chatWithTool();
  s = sum(s, "noa", 5000, "Noa spun the wheel: Sushi Ko.");
  s = sum(s, "maya", 9000, "Maya spun the wheel: Thai Basil.");
  expect(log(s)).toEqual(["noa@5000: Noa spun the wheel: Sushi Ko.", "maya@9000: Maya spun the wheel: Thai Basil."]);
});

test("the same person again within the window replaces their line; later it adds one", () => {
  let s = chatWithTool();
  s = sum(s, "noa", 5000, "Noa spun the wheel: Sushi Ko.");
  s = sum(s, "noa", 9000, "Noa spun the wheel: Pizza.");
  expect(log(s)).toEqual(["noa@9000: Noa spun the wheel: Pizza."]);
  s = sum(s, "noa", 9000 + ACTIVITY_WINDOW_MS, "Noa spun the wheel: Ramen.");
  expect(log(s).length).toBe(2);
});

test("a repeated or catching-up summary for the same action adds nothing", () => {
  let s = chatWithTool();
  s = sum(s, "noa", 5000, "Spinning");
  s = sum(s, "noa", 5000, "Noa spun the wheel: Sushi Ko.");
  s = sum(s, "noa", 5000, "Noa spun the wheel: Sushi Ko.");
  expect(log(s)).toEqual(["noa@5000: Noa spun the wheel: Sushi Ko."]);
});

test("a seeded line wins over the summary, also when the app's summary for that action arrives later", () => {
  let s = reduceChat(chatWithTool(), { t: "tool-summary", id: "t1", text: "your turn", by: "maya", at: 4000, line: "Maya spun the wheel" }, meta("maya", 4000));
  expect(log(s)).toEqual(["maya@4000: Maya spun the wheel"]);
  s = sum(s, "maya", 4000, "Chore wheel Maya spun the wheel: Aditya got Dishes. 1 of 4 assigned.");
  expect(log(s)).toEqual(["maya@4000: Maya spun the wheel"]);
});
