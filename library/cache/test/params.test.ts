// refill and parameter extraction on a small synthetic tool, so the rules are checked without the cache.

import { describe, expect, test } from "bun:test";
import { candidateOptions, extractParams, leaks, refillSource } from "../params.ts";

const members = [
  { id: "a", name: "Maya" },
  { id: "b", name: "Leo" },
  { id: "c", name: "Ana" },
];
const chat = {
  title: "apt",
  messages: [
    { from: "Maya", text: "thai basil or sushi ko or the pizza place" },
    { from: "Leo", text: "maya picked thai basil last time" },
    { from: "Ana", text: "muse pick for us" },
  ],
};

const SOURCE = `import { defineApp } from "@muse/app";
// Where Maya and Leo go
const DATA = {
  title: "Where should we eat?",
  options: [{ label: "Thai Basil", note: "the usual" }, { label: "Sushi Ko", note: "" }, { label: "Pizza place", note: "" }],
  lastPick: "Maya",
};
export default defineApp({ name: "Poll", view: () => <p>Vote, {DATA.title} Leo</p> });
`;

describe("params", () => {
  const p = extractParams(SOURCE, chat, members, "dinner-poll");
  test("finds names and options that came from the chat, not UI strings", () => {
    expect(p.names.sort()).toEqual(["Leo", "Maya"]);
    expect(p.options).toEqual(["Thai Basil", "Sushi Ko", "Pizza place"]);
    expect(p.options).not.toContain("Where should we eat?");
  });

  test("a line holding a name and an option makes the tool fact-bound", () => {
    expect(extractParams(`const d = [{ quote: "thai basil" },\n{ who: "Maya" }];\nexport default defineApp({});`, chat, members).factBound).toBe(false);
    expect(extractParams(`const d = [{ quote: "thai basil", who: "Maya" }];\nexport default defineApp({});`, chat, members).factBound).toBe(true);
  });

  const other = {
    title: "crew",
    messages: [
      { from: "Zed", text: "tacos or ramen or dumplings" },
      { from: "Quinn", text: "muse decide" },
    ],
  };
  const cast = [
    { id: "z", name: "Zed" },
    { id: "q", name: "Quinn" },
    { id: "r", name: "Rae" },
  ];

  test("refill swaps names and options and leaves nothing of the old chat", () => {
    const r = refillSource(SOURCE, p, other, cast, "muse decide");
    expect(leaks(r.source, ["Maya", "Leo"])).toEqual([]);
    expect(r.source).toContain("Zed");
    expect(r.source).toContain("Quinn");
    expect(r.source).not.toContain("Thai Basil");
    expect(r.source).toMatch(/Tacos|Ramen|Dumplings/);
    expect(r.source).toContain("Where should we eat?");
  });

  test("an option it cannot fill becomes a neutral label, never an old one", () => {
    const r = refillSource(SOURCE, p, { messages: [{ from: "Zed", text: "ok lol" }] }, cast, "");
    expect(r.unfilled).toBe(3);
    expect(r.source).toContain("Option 1");
    expect(r.source).not.toMatch(/Thai Basil|Sushi Ko|Pizza place/);
  });

  test("a new member named like an old option or an old member is not replaced twice", () => {
    const r = refillSource(SOURCE, p, other, [{ id: "z", name: "Leo" }, { id: "q", name: "Maya" }], "");
    expect(r.source).toContain("Leo");
    expect(r.source.match(/Maya/g)!.length).toBeGreaterThan(0);
  });

  test("candidateOptions reads short lists and skips chatter", () => {
    const c = candidateOptions(other, "muse decide");
    expect(c.slice(0, 3).sort()).toEqual(["dumplings", "ramen", "tacos"]);
  });
});
