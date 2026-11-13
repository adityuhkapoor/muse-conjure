// The wheel draws long labels inside their slices, and with fewer than two options it is a short
// card with no blank wheel area. `WHEEL_SOURCE=<file>` runs the same checks against another
// version of the piece (used once to see them fail on the version before the fix).

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fill, piece } from "../../index.ts";
import { blankShare, drawOnce, sliceLabelProblems } from "./render-check.ts";

const FILE = process.env.WHEEL_SOURCE ?? join(import.meta.dir, "piece.tsx");
const app = (await import(FILE)).default;
const MEMBERS = [{ id: "noa", name: "Noa" }, { id: "maya", name: "Maya" }, { id: "dev", name: "Dev" }];
const opt = (label: string, i: number) => ({ id: `p${i}`, label, out: false, by: null });
const state = (labels: string[]) => ({ title: "Where are we eating?", noRepeat: false, options: labels.map(opt), spins: [] });

const CASES: string[][] = [
  ["Thai Basil", "Sushi Ko", "Taco truck on College Ave"],
  ["Taco truck on College Avenue", "Sushi Ko"],
  ["Thai Basil", "Sushi Ko", "Taco truck", "Pizza", "Dumpling House on 5th", "Ramen", "Burgers", "Pho", "Tapas bar downtown", "Falafel"],
  ["A really long place name here", "Another long one over there", "Third long name for the list"],
];

for (const labels of CASES) {
  test(`labels stay inside their slices: ${labels.length} options`, () => {
    for (const width of [296, 400, 476]) {
      const g = drawOnce(app, state(labels), MEMBERS, width, 220);
      expect(g).not.toBeNull();
      expect(sliceLabelProblems(g!, labels)).toEqual([]);
    }
  });
}

test("short labels are drawn whole", () => {
  const g = drawOnce(app, state(["Thai Basil", "Sushi Ko", "Pizza"]), MEMBERS, 340, 220)!;
  expect(g.texts.map((t) => t.text)).toEqual(["Thai Basil", "Sushi Ko", "Pizza"]);
});

test("fewer than two options: no wheel", () => {
  expect(drawOnce(app, state([]), MEMBERS)).toBeNull();
  expect(drawOnce(app, state(["Sushi Ko"]), MEMBERS)).toBeNull();
});

// Another version's @params block is written by hand: replace its first `options: [...]`.
const source = (options: string[]) =>
  process.env.WHEEL_SOURCE
    ? readFileSync(FILE, "utf8").replace(/options: \[[^\]]*\]/, `options: ${JSON.stringify(options)}`)
    : fill(piece("wheel")!, { title: "Where are we eating?", options, noRepeat: false });

test("at rest, no blank band taller than 32 px: no options, and three", async () => {
  const empty = await blankShare(source([]), MEMBERS);
  const full = await blankShare(source(["Thai Basil", "Sushi Ko", "Taco truck on College Ave"]), MEMBERS);
  console.log(`wheel at rest: empty ${empty.height} px, blank ${empty.share.toFixed(2)}, tallest blank ${empty.band} px; three options ${full.height} px, blank ${full.share.toFixed(2)}, tallest blank ${full.band} px`);
  expect(empty.band).toBeLessThanOrEqual(32);
  expect(empty.height).toBeLessThanOrEqual(200);
  expect(full.band).toBeLessThanOrEqual(32);
}, 60_000);
