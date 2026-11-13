// Offline: grounding of money amounts in a first fill.
import { expect, test } from "bun:test";
import { groundOf, problems, strip } from "../src/ground.ts";

const chat = [
  { from: "Maya", text: "rent is $4,200 for the four of us" },
  { from: "Noa", text: "the couch was $120 btw" },
  { from: "Jonah", text: "i should pay more for the bathroom" },
  { from: "Maya", text: "parking is 300 a month" },
];
const members = ["Maya", "Noa", "Jonah", "Sam"].map((name) => ({ id: name.toLowerCase(), name }));
const g = groundOf({ ask: "split the rent between the four of us", chat: { messages: chat }, members } as never);
const amountsIn = (p: Record<string, unknown>) => problems("rent-split", p, g).filter((x) => /amount/.test(x.why)).map((x) => x.path.join("."));

test("an amount is a chat number or an equal split of one, from a message about the same item", () => {
  expect(amountsIn({ rentCents: 420000, parkingCents: 30000 })).toEqual([]);
  expect(amountsIn({ rentCents: 420000, bathCents: 12000 })).toEqual(["bathCents"]); // $120 is the couch
  expect(amountsIn({ rentCents: 420000, parkingCents: 4500 })).toEqual(["parkingCents"]); // a figure nobody wrote
});

test("a stated intent without an amount stays at 0", () => {
  expect(amountsIn({ rentCents: 420000, bathCents: 0 })).toEqual([]);
  const fill = { rentCents: 420000, bathCents: 12000 };
  expect(strip(fill, problems("rent-split", fill, g))).toEqual({ rentCents: 420000, bathCents: 0 });
});
