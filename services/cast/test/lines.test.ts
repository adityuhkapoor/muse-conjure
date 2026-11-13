import { describe, expect, test } from "bun:test";
import { BANK, candidates, intent, line, voiceOk } from "../src/lines.ts";
import { PERSONAS } from "../src/personas.ts";
import { mulberry } from "../src/rand.ts";
import { clean } from "../src/model.ts";
import { progress, resultOf } from "../src/choose.ts";

const facts = { pick: "Sushi Ko", idea: "Ramen", done: "3", total: "4", you: "Tsai Lin", item: "Ice" };

describe("lines", () => {
  test("every bank line, as every friend, passes the voice rules", () => {
    for (const sit of Object.keys(BANK) as (keyof typeof BANK)[])
      for (const p of Object.values(PERSONAS))
        for (let i = 0; i < 20; i++) {
          const s = line(sit, p, facts, mulberry(i));
          if (candidates(sit, p.id, facts).length) expect(s && voiceOk(s) ? "ok" : `${sit} ${p.id}: ${s}`).toBe("ok");
        }
  });
  test("the voice rules catch assistant talk", () => {
    for (const bad of ["Certainly! Here's a plan", "happy to help", "muse pick for us", "Great question", "ok!"]) expect(voiceOk(bad)).toBe(false);
    for (const good of ["sushi ko it is", "idk u pick", "lmao"]) expect(voiceOk(good)).toBe(true);
  });
  test("a model reply is cut to the voice or dropped", () => {
    expect(clean('"Sounds good!"')).toBe("sounds good");
    expect(clean("Certainly, I can help with that.")).toBeNull();
    expect(clean("x ".repeat(80))!.length).toBeLessThanOrEqual(60);
  });
  test("an ask to Muse gets no chatter", () => expect(intent("muse pick for us", false)).toBeNull());
  test("tool facts come from the summary", () => {
    expect(resultOf("Where are we eating? Maya spun the wheel: Sushi Ko.")).toBe("Sushi Ko");
    expect(progress("Juniper: 3 of 4 in.")).toEqual({ done: 3, total: 4, finished: false });
    expect(progress("Juniper: locked. 4 going.").finished).toBe(true);
    expect(progress("Chores Maya spun the wheel: Aditya got Dishes. 1 of 4 assigned.").finished).toBe(false);
  });
});

describe("repeats", () => {
  test("a line and its one-typo twin count as the same line", async () => {
    const { near1 } = await import("../src/director.ts");
    expect(near1("finally", "finally")).toBe(true);
    expect(near1("finally", "finslly")).toBe(true);
    expect(near1("ok perfect", "oh nice")).toBe(false);
  });
});
