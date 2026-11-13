// Every art primitive: renders in light and dark (snapshots), names itself for screen readers,
// keeps every shape inside its box, and draws the same subject the same way every time.
import { expect, test } from "bun:test";
import {
  AvatarBars, BingoGrid, Burst, CalendarStrip, Changed, Chip, Clusters, Expand, Graph, HeatGrid, Locked, MapStrip, Meter, More,
  Placed, PlayingCard, Receipt, Ring, Scene, SeatMap, Sparkline, Stars, Strip, Summary, Thumb, THUMB_KINDS, Ticket, Timeline, thumbKind,
  fitText, textWidth, rng,
} from "../src/index.ts";
import { ctx, makeTheme, render } from "../src/internal.ts";
import { fixedColors, outside, unnamed } from "./art-check.ts";

ctx.members = ["maya", "theo", "dani", "priya", "sam", "leo"].map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) }));
const noop = () => {};
const mount = (v: unknown, mode: "light" | "dark" = "light") => {
  ctx.theme = makeTheme(mode, 393);
  const el = document.createElement("div");
  render(v as never, el);
  return el;
};

const zones = [
  { id: "a", label: "105", seats: ["maya", null, null, null] },
  { id: "b", label: "104", seats: ["theo", "dani", "priya", "sam", null, null] },
  { id: "c", label: "103", seats: [null, null, null, null] },
  { id: "d", label: "204", seats: ["leo", null, null, null, null, null] },
  { id: "e", label: "203", seats: [null, null, null, null] },
];
const SAMPLES: Record<string, () => unknown> = {
  Thumb: () => <Thumb kind="ramen" seed="Marufuku" />,
  Scene: () => <Scene height={80} label="A scene with one person"><Placed user="maya" x={0.5} y={0.5} me="maya" /></Scene>,
  Placed: () => <div style={{ position: "relative", height: 40 }}><Placed user="theo" x={0.2} y={0.5} badge={<More n={2} size={14} />} /></div>,
  More: () => <More n={4} />,
  Chip: () => <Chip tone="primary">$148</Chip>,
  SeatMap: () => <SeatMap zones={zones} me="maya" selected="b" onZone={noop} />,
  SeatMapRows: () => <SeatMap layout="rows" zones={[{ id: "a", label: "Maya's car", seats: ["maya", null, "theo"] }]} me="maya" onSeat={noop} />,
  Graph: () => (
    <Graph nodes={["maya", "theo", "dani", "priya"]} me="maya" label="4 people, 3 debts" threads={[{ from: "theo", to: "maya", label: "$40 gas" }, { from: "dani", to: "priya", label: "$12 tacos" }, { from: "maya", to: "priya", label: "$90 cabin" }]} />
  ),
  GraphClean: () => (
    <Graph nodes={["maya", "theo", "dani", "priya"]} me="maya" label="2 payments" t={1} side={(u) => (u === "priya" ? 1 : -1)} edges={[{ from: "maya", to: "priya", label: "$50" }, { from: "dani", to: "priya", label: "$12", done: true }]} onEdge={noop} />
  ),
  MapStrip: () => <MapStrip label="Route with 3 stops" route me="maya" pins={[{ id: "1", x: 0.1, y: 0.6, user: "maya", label: "Home" }, { id: "2", x: 0.5, y: 0.4, n: 2 }, { id: "3", x: 0.9, y: 0.7, user: "theo" }]} />,
  Clusters: () => <Clusters label="Members by dorm" me="maya" per={20} groups={[{ id: "u1", label: "Unit 1", users: ["maya", "theo"], count: 1300 }, { id: "u2", label: "Unit 2", users: ["dani"], count: 2000 }, { id: "fh", label: "Foothill", users: [], count: 936 }]} />,
  Ring: () => <Ring value={3} max={4} label="3 of 4 in">3/4</Ring>,
  Meter: () => <Meter value={7} max={10} label="Urgency 7 of 10" stops={["Chill", "Soon", "Now"]} />,
  Sparkline: () => <Sparkline values={[176, 179, 172, 161, 154, 148]} label="Price fell from $176 to $148" />,
  Stars: () => <Stars value={4.3} />,
  AvatarBars: () => <AvatarBars me="maya" bars={[{ id: "a", label: "Thai Basil", users: ["maya", "theo", "dani", "priya", "sam", "leo"] }, { id: "b", label: "Tacos", users: [] }]} />,
  Timeline: () => <Timeline now={1} items={[{ id: "a", when: "9:00", title: "Leave campus", users: ["maya"] }, { id: "b", when: "1:30", title: "Lunch in Nashville", detail: "Hattie B's" }, { id: "c", when: "8:00", title: "Opry" }]} />,
  CalendarStrip: () => <CalendarStrip me="maya" selected="f" onDay={noop} days={[{ id: "f", dow: "Fri", date: 13, users: ["maya", "theo"] }, { id: "s", dow: "Sat", date: 14 }, { id: "u", dow: "Sun", date: 15, off: true }]} />,
  HeatGrid: () => <HeatGrid label="Who's free tonight" me="maya" best={2} cols={["6p", "7p", "8p", "9p"]} rows={[{ id: "maya", user: "maya", cells: [0, 1, 1, 1] }, { id: "theo", user: "theo", cells: [1, 1, 1, 0] }]} />,
  Ticket: () => <Ticket label="Boarding pass" stub={<b>1D</b>} locked><b>Campus to Nashville</b></Ticket>,
  Receipt: () => <Receipt title="Tony's on 9th" lines={[["10 wings", "$13.00"], ["Large pie", "$19.40"]]} total={["Total", "$32.40"]} />,
  PlayingCard: () => <div><PlayingCard rank="Q" suit="h" /><PlayingCard rank="A" suit="s" down /></div>,
  BingoGrid: () => <BingoGrid me="maya" onCell={noop} cells={[{ id: "a", label: "Encore", marked: true, users: ["maya"] }, { id: "b", label: "Free", free: true }, { id: "c", label: "Crowd sings along" }, { id: "d", label: "Rules" }]} />,
  Burst: () => <Burst emoji="👍" />,
  Changed: () => <Changed at={0}>Row</Changed>,
  Locked: () => <Locked detail="Fri, Mar 13">Locked · 4 going</Locked>,
  Summary: () => <Summary title="Section 104" detail="$148 each · 6 together" note="Down $28 since Mon" tone="positive" aside={<Sparkline values={[1, 3, 2]} label="Price" />} />,
  Expand: () => <Expand title="Who's bringing what" summary="4 of 7 covered" open={false} onToggle={noop}>Rows</Expand>,
  Strip: () => <Strip label="Listings">{[1, 2, 3].map((i) => <div key={i} style={{ width: 120, flex: "none" }}>{`Place ${i}`}</div>)}</Strip>,
};

for (const [name, make] of Object.entries(SAMPLES)) {
  test(`${name} renders in light and dark, named and inside its box`, () => {
    for (const mode of ["light", "dark"] as const) {
      const el = mount(make(), mode);
      expect(el.innerHTML).toMatchSnapshot();
      expect(unnamed(el)).toEqual([]);
      expect(outside(el)).toEqual([]);
    }
  });
}

test("light and dark differ wherever the primitive paints with theme colors", () => {
  for (const name of ["Thumb", "SeatMap", "Graph", "Ring", "HeatGrid", "Ticket", "Summary"]) expect(mount(SAMPLES[name]!(), "light").innerHTML).not.toBe(mount(SAMPLES[name]!(), "dark").innerHTML);
});

test("every thumb kind draws inside its tile, named, the same way for the same seed", () => {
  for (const kind of THUMB_KINDS)
    for (const mode of ["light", "dark"] as const) {
      const a = mount(<Thumb kind={kind} seed="Tartine" />, mode);
      expect(outside(a, 3)).toEqual([]);
      expect(unnamed(a)).toEqual([]);
      expect(a.innerHTML).toBe(mount(<Thumb kind={kind} seed="Tartine" />, mode).innerHTML);
    }
  // Seeds change the details for the kinds that have them.
  const varies = THUMB_KINDS.filter((k) => ["a", "b", "c", "d", "e"].map((s) => mount(<Thumb kind={k} seed={s} />).innerHTML).some((h, _, all) => h !== all[0]));
  expect(varies.length).toBeGreaterThanOrEqual(20);
});

test("the same subject draws the same picture (golden)", () => {
  expect(mount(<Thumb kind="pizza" seed="Tony's on 9th" size={48} />).innerHTML).toMatchSnapshot();
});

test("thumbKind guesses from names", () => {
  expect(thumbKind("Marufuku Ramen")).toBe("ramen");
  expect(thumbKind("Boba Guys")).toBe("boba");
  expect(thumbKind("Dolores Park")).toBe("park");
  expect(thumbKind("Zzz", "gift")).toBe("gift");
});

test("a decorative thumb (label '') is hidden from screen readers", () => {
  expect(mount(<Thumb kind="cake" label="" />).querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
});

test("SeatMap marks the viewer with the primary ring and taps a zone", () => {
  let got = "";
  const el = mount(<SeatMap zones={zones} me="maya" onZone={(id) => (got = id)} />);
  const btn = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")!.startsWith("104"))!;
  btn.click();
  expect(got).toBe("b");
  expect(el.innerHTML).toContain(makeTheme("light").color.primary);
});

test("Graph only offers taps on the arrows it is told to", () => {
  const el = mount(<Graph nodes={["maya", "theo", "dani"]} me="maya" label="x" t={1} side={(u) => (u === "dani" ? 1 : -1)} edges={[{ from: "maya", to: "dani", label: "$5" }, { from: "theo", to: "dani", label: "$9" }]} onEdge={noop} tappable={(e) => e.from === "maya"} />);
  expect(el.querySelectorAll("button").length).toBe(1);
});

// ---- The checks above must fail on broken pictures. ----

test("broken: a shape past the viewBox is caught", () => {
  const el = mount(<svg viewBox="0 0 48 48" role="img" aria-label="x"><circle cx={46} cy={24} r={8} fill="red" /></svg>);
  expect(outside(el).length).toBe(1);
  const rotated = mount(<svg viewBox="0 0 48 48" aria-hidden="true"><rect x={0} y={0} width={48} height={48} transform="rotate(30 24 24)" /></svg>);
  expect(outside(rotated).length).toBe(1);
  const path = mount(<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 10 l40 0" /></svg>);
  expect(outside(path).length).toBe(1);
});

test("broken: an overlay placed outside its scene is caught", () => {
  const el = mount(<Scene height={40} label="x"><span style={{ position: "absolute", left: "120%", top: "50%" }}>A</span></Scene>);
  expect(outside(el)).toEqual(["overlay left 120% is outside its scene"]);
});

test("broken: an unnamed picture or control is caught", () => {
  expect(unnamed(mount(<svg viewBox="0 0 4 4"><circle cx={2} cy={2} r={1} /></svg>)).length).toBeGreaterThan(0);
  expect(unnamed(mount(<div><button type="button" /></div>))).toContain("a button has no name");
});

test("broken: a thumb that ignores its seed's stability is caught", () => {
  // An unstable thumb (a new seed on every render) fails the same-seed check used above.
  let n = 0;
  const Unstable = () => <Thumb kind="donut" seed={n++} />;
  const renders = Array.from({ length: 6 }, () => mount(<Unstable />).innerHTML);
  expect(renders.some((h) => h !== renders[0])).toBe(true);
});

// ---- Theme tokens only, every width, stable, fitted text ----

/** A theme whose every color is random (hex), so a derived color never equals a literal. */
const randomTheme = (mode: "light" | "dark", width: number, seed: number) => {
  const r = rng(seed), hex = () => "#" + Array.from({ length: 3 }, () => (16 + r.int(224)).toString(16).padStart(2, "0")).join("");
  const t = makeTheme(mode, width);
  for (const k of Object.keys(t.color) as (keyof typeof t.color)[]) t.color[k] = hex();
  return { ...t, people: Array.from({ length: 12 }, hex) };
};
const mountWith = (v: unknown, theme: ReturnType<typeof makeTheme>) => {
  ctx.theme = theme;
  const el = document.createElement("div");
  render(v as never, el);
  return el;
};

test("every primitive paints only with theme colors and stays in its box, at every width", () => {
  for (const [name, make] of Object.entries(SAMPLES))
    for (const mode of ["light", "dark"] as const)
      for (const w of [320, 393, 500]) {
        const a = mountWith(make(), randomTheme(mode, w, 1)).innerHTML, b = mountWith(make(), randomTheme(mode, w, 2)).innerHTML;
        expect({ name, mode, w, fixed: fixedColors(a, b) }).toEqual({ name, mode, w, fixed: [] });
        const el = mountWith(make(), makeTheme(mode, w));
        expect({ name, w, outside: outside(el) }).toEqual({ name, w, outside: [] });
      }
});

test("every primitive draws the same markup twice (seeded, no hidden state)", () => {
  for (const [name, make] of Object.entries(SAMPLES)) expect({ name, same: mount(make()).innerHTML === mount(make()).innerHTML }).toEqual({ name, same: true });
  const map = (seed: string) => mount(<MapStrip label="x" seed={seed} pins={[]} />).innerHTML;
  expect(map("Nashville")).toBe(map("Nashville"));
  expect(map("Nashville")).not.toBe(map("Austin"));
  const dots = (id: string) => mount(<Clusters label="x" groups={[{ id, label: "A", users: [], count: 40 }]} />).innerHTML;
  expect(dots("u1")).toBe(dots("u1"));
  expect(dots("u1")).not.toBe(dots("u2"));
});

test("overloaded data stays inside its box: 12 people, long labels, many columns", () => {
  const twelve = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const before = ctx.members;
  ctx.members = twelve.map((id) => ({ id, name: `Person with a long name ${id}` }));
  const long = "A very long name for a place that keeps going on and on";
  const loaded: Record<string, () => unknown> = {
    SeatMapRows: () => <SeatMap layout="rows" me="p0" onSeat={noop} zones={[{ id: "a", label: long, seats: [...twelve, null, null] }, { id: "b", label: "Van", seats: Array(16).fill(null) }]} />,
    SeatMapArena: () => <SeatMap me="p0" onZone={noop} zones={Array.from({ length: 8 }, (_, i) => ({ id: `z${i}`, label: `${long} ${i}`, seats: i ? [null, null] : twelve }))} />,
    Graph: () => <Graph nodes={twelve} me="p0" label="x" threads={twelve.map((u, i) => ({ from: u, to: twelve[(i + 5) % 12]!, label: `$${i}00 ${long}` }))} />,
    GraphClean: () => <Graph nodes={twelve} me="p0" label="x" t={1} side={(u) => (Number(u.slice(1)) % 3) - 1} edges={twelve.slice(1).map((u) => ({ from: u, to: "p0", label: `$1${u}` }))} onEdge={noop} />,
    MapStrip: () => <MapStrip label="x" route me="p0" pins={twelve.map((u, i) => ({ id: u, x: i / 11, y: (i % 3) / 2, user: u, label: long }))} />,
    Clusters: () => <Clusters label="x" me="p0" groups={Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, label: long, users: twelve, count: 5000 }))} />,
    Ring: () => <Ring value={11} max={12} label="x" size={44}>11 of 12 people</Ring>,
    Sparkline: () => <Sparkline values={Array.from({ length: 60 }, (_, i) => (i * 37) % 11)} label="x" />,
    Stars: () => <Stars value={9} of={5} />,
    HeatGrid: () => <HeatGrid label="x" cols={Array.from({ length: 24 }, (_, i) => `${i}:00`)} rows={twelve.map((u) => ({ id: u, user: u, cells: Array(24).fill(1) }))} />,
  };
  for (const [name, make] of Object.entries(loaded))
    for (const w of [320, 500]) {
      const el = mountWith(make(), makeTheme("light", w));
      expect({ name, w, outside: outside(el), unnamed: unnamed(el) }).toEqual({ name, w, outside: [], unnamed: [] });
    }
  ctx.members = before;
});

test("fitText shrinks to the floor, then ends in an ellipsis, and never exceeds the room", () => {
  // A fake Canvas context: every character is 0.6 em wide.
  const g = { font: "", measureText(s: string) { return { width: [...s].length * 0.6 * parseFloat(this.font.split(" ")[1]!) }; } };
  expect(fitText("Tacos", 100, { g, size: 15 })).toMatchObject({ text: "Tacos", size: 15 });
  const shrunk = fitText("Taco truck", 70, { g, size: 15 });
  expect(shrunk.text).toBe("Taco truck");
  expect(shrunk.size).toBeLessThan(15);
  expect(shrunk.size).toBeGreaterThanOrEqual(10);
  const cut = fitText("Taco truck on College Ave", 80, { g, size: 15 });
  expect(cut.size).toBe(10);
  expect(cut.text.endsWith("…")).toBe(true);
  expect(g.measureText(cut.text).width).toBeLessThanOrEqual(80);
  expect(g.font).toBe(cut.font);
  for (const room of [0, 3, 8, 20, 45, 130])
    for (const s of ["", "x", "Pho", "A very long name for a place", "日本語のラベル"]) {
      const f = fitText(s, room, { g, size: 15 });
      expect(f.width).toBeLessThanOrEqual(room);
      expect(f.size).toBeGreaterThanOrEqual(10);
      const e = fitText(s, room, { size: 15 });
      expect(e.width).toBeLessThanOrEqual(room);
    }
  // The estimate is generous: wider than a typical system font's lowercase run.
  expect(textWidth("pizza on fifth", 15)).toBeGreaterThanOrEqual(14 * 0.5 * 15);
});

test("broken: a picture with a literal color is caught", () => {
  const Bad = () => <svg viewBox="0 0 4 4" role="img" aria-label="x"><circle cx={2} cy={2} r={1} fill="#ff0000" /><rect x={0} y={0} width={1} height={1} fill="white" /></svg>;
  const a = mountWith(<Bad />, randomTheme("light", 393, 1)).innerHTML, b = mountWith(<Bad />, randomTheme("light", 393, 2)).innerHTML;
  expect(fixedColors(a, b).sort()).toEqual(["#ff0000", "white"]);
});

test("broken: a label cut by character count instead of measured is caught by the room check", () => {
  const g = { font: "400 15px x", measureText: (s: string) => ({ width: [...s].length * 9 }) };
  const naive = (s: string, room: number) => (g.measureText(s).width <= room ? s : s.slice(0, Math.floor(room / 8)) + "…");
  expect(g.measureText(naive("Taco truck on College Ave", 80)).width).toBeGreaterThan(80);
  expect(fitText("Taco truck on College Ave", 80, { g, size: 15 }).width).toBeLessThanOrEqual(80);
});

test("a bundle that imports no art piece carries none of them", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "muse-art-"));
  const entry = join(dir, "core.ts");
  const from = JSON.stringify(join(import.meta.dir, "../src/index.ts"));
  const bundle = async (names: string) => {
    writeFileSync(entry, `export { ${names} } from ${from};\n`);
    return (await Bun.build({ entrypoints: [entry], format: "esm", minify: true, target: "browser" })).outputs[0]!.text();
  };
  const core = await bundle("defineApp, Button, OptionRow, CardHeader, Canvas, rng, userColor, tween");
  for (const marker of ["tonkotsu", "Seat map", "Overlap", "Face-down card", "M12 2l2.9"]) expect({ marker, found: core.includes(marker) }).toEqual({ marker, found: false });
  // The check sees art when it is there.
  expect(await bundle("SeatMap")).toContain("Seat map");
});
