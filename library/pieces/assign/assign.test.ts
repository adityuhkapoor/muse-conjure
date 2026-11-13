// The chore wheel draws long names inside their slices, and with no tasks it is a short card with
// no wheel. `ASSIGN_SOURCE=<file>` runs the same checks against another version of the piece.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { fill, piece } from "../../index.ts";
import { blankShare, drawOnce, sliceLabelProblems } from "../wheel/render-check.ts";

const FILE = process.env.ASSIGN_SOURCE ?? join(import.meta.dir, "piece.tsx");
const app = (await import(FILE)).default;
const people = (names: string[]) => names.map((name, i) => ({ id: `u${i}`, name }));
const state = (tasks: string[]) => ({ title: "Chores this week", tasks: tasks.map((label) => ({ label, owner: null, by: null })), spin: null });

const CASES: string[][] = [
  ["Noa", "Maya", "Dev"],
  ["Alexandria-Rose", "Bartholomew James", "Maya"],
  ["Christopher", "Maximiliano", "Anastasia", "Jonah", "Priya", "Theo", "Guinevere", "Dev"],
  ["Mary-Elizabeth Fontaine", "Dev"],
];

for (const names of CASES) {
  test(`names stay inside their slices: ${names.length} people`, () => {
    for (const width of [296, 400, 476]) {
      const g = drawOnce(app, state(["Dishes", "Trash"]), people(names), width, 200);
      expect(g).not.toBeNull();
      expect(sliceLabelProblems(g!, names)).toEqual([]);
    }
  });
}

test("no tasks: no wheel", () => {
  expect(drawOnce(app, state([]), people(["Noa", "Maya"]))).toBeNull();
});

test("at rest, no blank band taller than 32 px: no tasks, and four", async () => {
  const members = people(["Noa", "Maya", "Dev"]);
  const empty = await blankShare(fill(piece("assign")!, { title: "Chores this week", tasks: [] }), members);
  const full = await blankShare(fill(piece("assign")!, { title: "Chores this week", tasks: ["Dishes", "Trash", "Bathroom", "Vacuuming"] }), members);
  console.log(`chore wheel at rest: empty ${empty.height} px, tallest blank ${empty.band} px; four tasks ${full.height} px, tallest blank ${full.band} px`);
  expect(empty.band).toBeLessThanOrEqual(32);
  expect(empty.height).toBeLessThanOrEqual(200);
  expect(full.band).toBeLessThanOrEqual(32);
}, 60_000);
