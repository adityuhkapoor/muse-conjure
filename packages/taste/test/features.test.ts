import { expect, test } from "bun:test";
import { copyFeatures, isTitleCase } from "../src/features.ts";
import { copyItems, MEANINGS } from "../src/items/copy.ts";

const on = (text: string, role?: Parameters<typeof copyFeatures>[1]) => Object.keys(copyFeatures(text, role)).sort();

test("features of known strings", () => {
  expect(on("Spin", "button")).toEqual(["copy.button.one_word", "copy.role=button", "copy.short"]);
  expect(on("Lock it in!")).toEqual(["copy.exclaim", "copy.punchy", "copy.short"]);
  expect(on("Thai Basil leads with 3 votes")).toEqual(["copy.count"]);
  expect(on("Thai Basil leads with 60%")).toEqual(["copy.percent"]);
  expect(on("Muse is building…")).toEqual(["copy.ellipsis", "copy.short"]);
  expect(on("Let's find the perfect spot to eat ✨")).toEqual(["copy.ai_phrase", "copy.emoji", "copy.punchy"]);
  expect(on("Locked · the plan is on")).toEqual(["copy.sep_dot"]);
  expect(on("Maybe somewhere to eat?")).toEqual(["copy.hedge", "copy.question"]);
  expect(on("I couldn't build that. Try again")).toEqual(["copy.first_person"]);
  expect(on("Make Your Voice Heard", "button")).toEqual(["copy.ai_phrase", "copy.button.three_plus", "copy.role=button", "copy.title_case"]);
  expect(on("Seamless — and effortless")).toContain("copy.em_dash");
  expect(on("Who is doing which chore at the apartment this week")).toEqual(["copy.long"]);
});

test("title case ignores proper nouns in a sentence-case line", () => {
  expect(isTitleCase("SZA on Saturday: 3 of 4 in")).toBe(false);
  expect(isTitleCase("Leo owes Maya $24")).toBe(false);
  expect(isTitleCase("Waiting on Dani, Sam")).toBe(false);
  expect(isTitleCase("Where Should We Eat?")).toBe(true);
  expect(isTitleCase("Chores This Week")).toBe(true);
});

test("generated lines carry the features their design says", () => {
  const items = copyItems();
  expect(items.length).toBeGreaterThan(300);
  expect(new Set(items.map((i) => i.group)).size).toBe(MEANINGS.length);
  for (const i of items) {
    if (i.design.exclaim) expect(i.x["copy.exclaim"]).toBe(1);
    if (i.design.emoji) expect(i.x["copy.emoji"]).toBe(1);
    if (i.design.title) {
      // Title Case is detectable when it capitalized at least 2 words that were lower case.
      const m = MEANINGS.find((x) => x.id === i.group)!;
      const original = i.design.style === "long" ? m.long! : i.design.style === "pct" ? m.pct! : m.plain;
      const raised = original.split(/\s+/).slice(1).filter((w) => /^[a-z]/.test(w) && !/^(a|an|the|of|to|for|in|on|and|or|with|at|by)$/.test(w)).length;
      if (raised >= 2) expect([i.text, i.x["copy.title_case"]]).toEqual([i.text, 1]);
    }
    if (i.design.style === "pct") expect(i.x["copy.percent"]).toBe(1);
  }
  // The first line of every group is the real one, in Meta's voice.
  for (const m of MEANINGS) {
    const x = copyFeatures(m.plain);
    expect([m.plain, x["copy.exclaim"] ?? 0, x["copy.emoji"] ?? 0, x["copy.title_case"] ?? 0]).toEqual([m.plain, 0, 0, 0]);
  }
});
