// Offline checks for compose(): the cheap design-card checks, grounding, the image
// input, and one scripted run end to end through the real gate. Each check has a case it must fail.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { checkCard, compose, groundReading, grounded, type Card, type Reading } from "../src/compose.ts";
import type { CompleteRequest, ModelClient } from "../src/types.ts";

beforeAll(() => warm());
afterAll(() => shutdown());

const ask = ASKS.find((a) => a.id === "where-eating")!;

const goodCard = (): Card => ({
  name: "Dinner pick",
  title: "Where are we eating?",
  visual_idea: "three place tiles with drawn thumbnails and faces",
  why_this_shape: "places are things you picture",
  picture: "two by two tiles with Thumb, name, note",
  interaction: "tap a tile",
  satisfying_moment: "the winner tile turns primary",
  at_rest: "votes so far",
  empty_state: "tiles with no faces",
  overloaded_state: "faces cap at three",
  content: [{ label: "Thai Basil", detail: "", cents: 0, from: "thai basil?? or sushi ko" }],
  state: [],
  actions: [],
  invariants: [],
  transitions: [],
  random: "",
  labels: { buttons: ["Vote", "Pick"], status: ["3 of 5 voted"], empty: "Tap where you'd go", summary: "Dinner · Thai Basil leads with 2 votes", other: [] },
});

test("a clean card has no issues", () => {
  expect(checkCard(goodCard(), ask, [])).toEqual([]);
});

test("copy rules catch hype, Title Case and long buttons on the card", () => {
  const c = goodCard();
  c.labels.buttons = ["Lock It In!", "Add your option now"];
  const issues = checkCard(c, ask, []);
  expect(issues.some((i) => i.includes("labels.buttons[0]") && i.includes("no-exclamation"))).toBe(true);
  expect(issues.some((i) => i.includes("labels.buttons[1]") && i.includes("button-words"))).toBe(true);
});

test("content that does not quote the chat is flagged", () => {
  const c = goodCard();
  c.content.push({ label: "Olive Garden", detail: "", cents: 0, from: "olive garden has a deal on tuesdays" });
  expect(checkCard(c, ask, []).some((i) => i.includes("Olive Garden"))).toBe(true);
});

test("a visual idea close to a recent tool is flagged", () => {
  const c = goodCard();
  expect(checkCard(c, ask, ["three place tiles with drawn thumbnails and faces two by two tiles with Thumb"]).some((i) => i.startsWith("visual_idea"))).toBe(true);
  expect(checkCard(c, ask, ["a receipt with faces on each line"]).some((i) => i.startsWith("visual_idea"))).toBe(false);
});

test("grounding keeps quotes and drops invented items and people", () => {
  expect(grounded("the taco truck on college ave is open til 11", ask)).toBe(true);
  expect(grounded("taco truck on college ave", ask)).toBe(true);
  expect(grounded("the new burger place downtown", ask)).toBe(false);
  const r: Reading = {
    job: "pick dinner",
    shape: "choose",
    tone: "",
    stake: "",
    people: [{ name: "Jess", role: "", from: "" }, { name: "Zed", role: "", from: "" }],
    items: [
      { label: "Sushi Ko", detail: "", cents: 0, from: "thai basil?? or sushi ko" },
      { label: "Burger Barn", detail: "", cents: 0, from: "burger barn is the move" },
    ],
    facts: [],
    missing: [],
    keywords: [],
  };
  const dropped = groundReading(r, ask);
  expect(r.items.map((i) => i.label)).toEqual(["Sushi Ko"]);
  expect(r.people.map((p) => p.name)).toEqual(["Jess"]);
  expect(dropped).toEqual(['item "Burger Barn"', 'person "Zed"']);
});

/** Answers by label; the build returns the poll example from API.md. */
function scripted(): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const api = readFileSync(join(import.meta.dir, "..", "..", "app", "API.md"), "utf8");
  const poll = /## Example\n\n```tsx\n([\s\S]*?)```/.exec(api)![1]!;
  const tool = `import { defineApp, OptionRow, CardHeader } from "@muse/app";\n${poll}`;
  return {
    id: "scripted",
    calls,
    async complete(req: CompleteRequest) {
      calls.push(req.label ?? "");
      if (req.label === "understand")
        return JSON.stringify({ job: "pick dinner", shape: "choose", tone: "hungry", stake: "", people: [], items: [{ label: "Thai Basil", detail: "", cents: 0, from: "thai basil?? or sushi ko" }], facts: [], missing: [], keywords: ["dinner"] });
      if (req.label === "route") return JSON.stringify({ path: "build", id: "", why: "new", change: "" });
      if (req.label === "design" || req.label === "revise") return JSON.stringify(goodCard());
      return "```tsx\n" + tool + "```";
    },
  };
}

test("compose runs end to end with a scripted model and reports its steps", async () => {
  const m = scripted();
  const steps: string[] = [];
  const r = await compose(ask, m, { speed: "fast", look: false, onEvent: (e) => e.t === "step" && steps.push(e.label) });
  expect(r.ok).toBe(true);
  expect(m.calls.slice(0, 3)).toEqual(["understand", "route", "design"]);
  expect(m.calls).toContain("build");
  expect(steps[0]).toBe("Reading the chat");
  expect(steps.at(-1)).toBe("Choosing");
  expect(r.extra.card?.visual_idea).toContain("tiles");
  expect(r.extra.taste?.uncertainty).toBeGreaterThanOrEqual(0);
}, 120_000);

test("lab ports count only when their latest gate result is ok", async () => {
  const { parseLabResults } = await import("../src/kb.ts");
  const ok = parseLabResults(["13:01 concert exit=0 812s gate=[ok score 0.92]", "13:02 lobby exit=0 900s gate=[FAIL:too-tall score 0.8]", "13:03 pizza gate=[ok score 1]", "13:04 lobby2 gate=[ok score 0.7]", "13:09 pizza exit=0 300s gate=[FAIL:contrast score null]", "13:10 runner finished"].join("\n"));
  expect([...ok]).toEqual(["concert", "lobby2"]);
});

test("edits apply exactly, then with whitespace ignored, and refuse what they cannot place", async () => {
  const { applyEdits } = await import("../src/edits.ts");
  const src = "const a = 1;\n  const b = 2;\nconst c = 3;\n";
  const block = (s: string, r: string) => `<<<<<<< SEARCH\n${s}\n=======\n${r}\n>>>>>>> REPLACE`;
  expect(applyEdits(src, block("const a = 1;", "const a = 10;"))).toBe("const a = 10;\n  const b = 2;\nconst c = 3;\n");
  expect(applyEdits(src, block("    const b = 2;\nconst c = 3;", "const b = 20;"))).toBe("const a = 1;\nconst b = 20;\n");
  expect(applyEdits(src, block("const d = 4;", "x"))).toBeNull();
  expect(applyEdits("x\nx\n", block("x", "y"))).toBeNull();
  expect(applyEdits(src, "no blocks here")).toBeNull();
});
