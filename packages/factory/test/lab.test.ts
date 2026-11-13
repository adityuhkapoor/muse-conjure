import { expect, test } from "bun:test";
import { fill } from "@muse/library";
import { verify } from "@muse/verify";
import { fastLab, labChoices, orOptions, supersede } from "../src/lab.ts";

const members = ["Noa", "Maya", "Dev", "Jonah", "Priya", "Theo"].map((n) => ({ id: n.toLowerCase(), name: n }));
const chat = (texts: string[]) => ({ messages: texts.map((text) => ({ from: "x", text })) });
const SENIOR: [string, string][] = [
  ["Maya", "where are we eating tonight"], ["Dev", "thai basil or sushi ko"], ["Priya", "or the taco truck on college ave, open til 11"],
  ["Theo", "not pier pizza again, im so over it"], ["Maya", "drinks after?"], ["Jonah", "$3 wells at the dive or byob on the deck"],
  ["Priya", "or $2 pbr at lucky's"], ["Jonah", "not $14 cocktails, im broke"], ["Dev", "leave at 9:45 or 10:15"], ["Theo", "or 1am lol"],
  ["Dev", "not 1am, im driving"], ["Maya", "ok so which one"], ["Theo", "idk anything works"], ["Dev", "idk u pick"], ["Priya", "no u pick"],
];
const CAST: [string, string][] = [
  ["Dev", "thai basil or sushi ko or the taco truck"], ["Theo", "not pier pizza again, im so over it"], ["Maya", "drinks after? $3 wells or byob or $2 pbr"],
  ["Dev", "not $14 cocktails, im broke"], ["Theo", "leave at 9:45 or 10:15? not 1am, im driving"], ["Dev", "idk u pick"], ["Theo", "no u pick"],
];
const said = (lines: [string, string][]) => ({ messages: lines.map(([from, text]) => ({ from, text })) });

test("options come from the chat's 'x or y' lines", () => {
  expect(orOptions(said(SENIOR).messages.slice(0, 3))).toEqual(["Thai Basil", "Sushi Ko", "Taco Truck"]);
});

for (const [name, lines] of [["senior week", SENIOR], ["the cast's scene", CAST]] as const) {
  test(`pick for us in ${name}: three reels, three vetoes, as rich as the example`, async () => {
    const f = fastLab({ ask: "muse pick for us", chat: said(lines as [string, string][]), members })!;
    expect(f.lab.id).toBe("slot-machine");
    const p = f.params as { title: string; why: string; reels: { name: string; options: { label: string; vetoed: boolean }[] }[]; rules: { text: string; who: string }[] };
    expect(p.reels.map((r) => r.name)).toEqual(["Where", "Drinks", "Leave at"]);
    expect(p.reels[0]!.options.map((o) => o.label)).toEqual(["Thai Basil", "Sushi Ko", "Taco Truck", "Pier Pizza"]);
    expect(p.reels.map((r) => r.options.filter((o) => o.vetoed).map((o) => o.label))).toEqual([["Pier Pizza"], ["$14 cocktails"], ["1am"]]);
    expect(p.rules).toEqual([
      { text: "pier pizza", who: "Theo's so over it" },
      { text: "$14 cocktails", who: "Dev's broke".replace("Dev", name === "senior week" ? "Jonah" : "Dev") },
      { text: "1am", who: name === "senior week" ? "Dev's driving" : "Theo's driving" },
    ]);
    expect(p.why).toMatch(/^“idk u pick” ×\d · rigged by the chat$/);
    expect((await verify(fill(f.lab, f.params))).ok).toBe(true);
  }, 60_000);
}


test("no options in the chat: no tool from the keyword lane or the supersede table, never an example", () => {
  expect(fastLab({ ask: "muse pick for us", chat: chat(["hi", "what now"]), members })).toBeNull();
  expect(fastLab({ ask: "muse what is the capital of peru", chat: chat(["hi"]), members })).toBeNull();
  expect(supersede("wheel", { title: "Where?", options: [], noRepeat: false }, { ask: "", chat: chat([]), members })).toBeNull();
  expect(labChoices("wheel", { title: "Order", options: ["A", "B"], noRepeat: true }, { ask: "who drives", chat: chat([]), members })).toEqual([]);
});

test("each wired piece maps to its lab tool", () => {
  const ctx = (ask: string) => ({ ask, chat: chat(["where are we eating"]), members });
  expect(supersede("veto", { title: "Dinner", options: ["Sushi Ko", "Thai Basil", "Taco truck"], vetoesEach: 1, detail: "" }, ctx("everyone veto one"))?.lab.id).toBe("dinner-veto");
  expect(supersede("settle", { title: "Trip", ious: [{ paidBy: "Dev", label: "House", cents: 1200, forWho: [] }] }, ctx("who owes"))?.lab.id).toBe("settle-up");
  expect(supersede("assign", { title: "Chores", tasks: ["Dishes", "Trash"] }, ctx("chores"))?.lab.id).toBe("chore-draft");
  const rate = supersede("rate", { title: "Is $120 fair for the green velvet loveseat?", detail: "4 similar sold for $80 to $150 near Temescal" }, ctx("is it fair"));
  expect(rate?.lab.id).toBe("price-check");
  expect(rate?.params.askCents).toBe(12000);
  expect(supersede("rate", { title: "Is $120 fair for the loveseat?", detail: "" }, ctx("is it fair"))).toBeNull();
});

test("list, claims, bracket, poll and split fill their lab tools from the chat, and pass the gate", async () => {
  const ctx = { ask: "muse", chat: said([["Maya", "we need oat milk asap"], ["Arun", "and eggs"], ["Calvin", "dune or paddington 2"]]), members };
  const cases: [string, Record<string, unknown>, string][] = [
    ["list", { title: "Apt 4B", items: [{ label: "Oat milk", urgent: true }, { label: "Eggs", urgent: false }] }, "grocery"],
    ["claims", { title: "Potluck", items: [{ label: "Chips", need: 1 }, { label: "Drinks", need: 1 }, { label: "Salad", need: 1 }], perPerson: 1, allowAdd: true, checkable: false }, "bring-list"],
    ["bracket", { title: "Movie night", entries: ["Dune", "Paddington 2", "Past Lives", "Shrek 2"] }, "movie-bracket"],
    ["poll", { title: "After the show?", options: ["Tacos", "Karaoke", "Home"], multi: false, allowAdd: true }, "after-vote"],
    ["split", { title: "Smokey's", payer: "Maya", mode: "items", totalCents: 5000, items: [{ label: "Brisket", cents: 2400 }, { label: "Wings", cents: 1800 }] }, "tab-claim"],
  ];
  for (const [piece, p, lab] of cases) {
    const l = labChoices(piece, p, ctx)[0]!;
    expect(l.lab.id).toBe(lab);
    const r = await verify(fill(l.lab, l.params));
    if (!r.ok) throw new Error(`${piece} -> ${lab}: ${r.stage} ${r.failures[0]?.rule} ${r.failures[0]?.message}`);
  }
  expect((labChoices("list", { title: "x", items: [{ label: "Oat milk", urgent: true }, { label: "Eggs", urgent: false }] }, ctx)[0]!.params.items as { who: string }[])[0]!.who).toBe("Maya");
}, 120_000);

test("the keyword lane answers only what the chat fills by itself", () => {
  const ctx = (ask: string) => ({ ask, chat: said(SENIOR), members });
  expect(fastLab(ctx("muse pick for us"))?.lab.id).toBe("slot-machine");
  for (const ask of ["muse split the groceries", "muse who's in for friday", "muse assign chores", "muse what time works", "muse rank the dining halls"]) expect(`${ask} -> ${fastLab(ctx(ask))?.lab.id ?? "none"}`).toBe(`${ask} -> none`);
});
