// Illustrated thumbnails that stand in for photos: dishes and drinks, places, everyday objects.
// Each is a few flat shapes on a 48-unit square, colors from the theme's palette, details (toppings,
// awning color, scoop flavors) picked by a seed, so the same subject always draws the same way.

import { h, type Child } from "../h.ts";
import type { Rng } from "../types.ts";
import { circle as C, ellipse as E, line as L, pal, path as P, rand, rect as R, svg, theme, type Pal } from "./paint.ts";

export type ThumbKind =
  | "pizza" | "burger" | "ramen" | "sushi" | "taco" | "salad" | "pasta" | "cake" | "icecream" | "coffee" | "boba" | "cocktail" | "bread" | "curry" | "donut"
  | "storefront" | "house" | "venue" | "park" | "campus"
  | "couch" | "ticket" | "car" | "gift" | "suitcase" | "book";

type Draw = (p: Pal, r: Rng) => Child;
const pick = <T,>(r: Rng, xs: T[]) => r.pick(xs);
/** Points scattered in a disc, for toppings. */
const scatter = (r: Rng, n: number, cx: number, cy: number, rad: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 6.283 + r.next() * 0.9, d = rad * (0.35 + 0.65 * Math.sqrt(r.next()));
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d] as const;
  });
const plate = (p: Pal) => [C(24, 25, 21, p.shade), C(24, 24, 21, p.plate), C(24, 24, 16.5, p.plate, { stroke: p.rim, "stroke-width": 0.8 })];
const sky = (p: Pal, ground: string) => [R(0, 0, 48, 48, 0, p.sky), R(0, 38, 48, 10, 0, ground)];
const loud = (p: Pal) => [p.red, p.blue, p.green, p.orange, p.purple, p.yellow];

const draw: Record<ThumbKind, Draw> = {
  pizza: (p, r) => [
    C(24, 25, 20, p.shade),
    C(24, 24, 20, p.crust),
    C(24, 24, 16.5, p.cream),
    C(24, 24, 15.5, p.yellow, { opacity: 0.55 }),
    ...[0, 1, 2].map((i) => L(24, 24, 24 + 20 * Math.cos(i * 2.094 + 0.5), 24 + 20 * Math.sin(i * 2.094 + 0.5), p.crust, 1)),
    ...scatter(r, 6, 24, 24, 12).map(([x, y]) => C(x, y, 2.8, p.red)),
    ...scatter(r, 3, 24, 24, 11).map(([x, y]) => E(x, y, 2.2, 1.2, p.leaf, { transform: `rotate(${r.int(180)} ${x} ${y})` })),
  ],
  burger: (p, r) => [
    E(24, 41, 16, 3, p.shade),
    P("M8 22 Q8 8 24 8 Q40 8 40 22 Z", p.crust),
    ...scatter(r, 5, 24, 14, 8).map(([x, y]) => E(x, Math.min(y, 18), 1.2, 0.7, p.cream)),
    P("M6 24 q3 -3 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 v3 H6 Z", p.green),
    R(7, 26, 34, 6, 3, p.brown),
    P("M9 31 H39 L33 36 Z", p.yellow),
    R(8, 32, 32, 7, 3.5, p.crust),
  ],
  ramen: (p, r) => [
    C(24, 25, 21, p.shade),
    C(24, 24, 21, p.dark),
    C(24, 24, 17, p.red, { opacity: 0.85 }),
    C(24, 24, 15.5, p.crust),
    ...[5, 8, 11].map((k) => P(`M${24 - k} 27 q${k} -${k * 0.7} ${2 * k} 0`, "none", { stroke: p.cream, "stroke-width": 1.4 })),
    C(17, 18, 4.5, p.paper),
    C(17, 18, 2.2, p.yellow),
    C(31, 26, 4.6, p.red, { opacity: 0.7 }),
    C(31, 26, 3, p.wall),
    R(26, 12, 4, 10, 1, p.leaf),
    ...scatter(r, 6, 22, 30, 7).map(([x, y]) => C(x, y, 1, p.green)),
  ],
  sushi: (p, r) => {
    const fill = pick(r, [p.orange, p.red, p.green]);
    return [E(24, 30, 21, 13, p.shade), E(24, 29, 21, 13, p.plate), ...[[14, 26], [26, 22], [34, 32]].map(([x, y]) => [C(x!, y!, 7.5, p.dark), C(x!, y!, 5.8, p.cream), C(x!, y!, 2.6, r.next() < 0.7 ? fill : p.orange)])];
  },
  taco: (p, r) => [
    E(24, 40, 18, 3, p.shade),
    ...scatter(r, 7, 24, 23, 9).map(([x, y], i) => C(x, Math.min(y, 24), 3, [p.green, p.red, p.brown][i % 3]!)),
    P("M6 37 A18 18 0 0 1 42 37 Z", p.yellow),
    P("M10 37 A14 14 0 0 1 38 37", "none", { stroke: p.crust, "stroke-width": 1.4 }),
  ],
  salad: (p, r) => [
    ...plate(p),
    ...scatter(r, 9, 24, 24, 12).map(([x, y], i) => E(x, y, 5, 3, i % 2 ? p.green : p.leaf, { transform: `rotate(${r.int(180)} ${x} ${y})` })),
    ...scatter(r, 4, 24, 24, 10).map(([x, y]) => C(x, y, 2.4, p.red)),
    C(28, 21, 2.4, p.yellow),
  ],
  pasta: (p, r) => [
    ...plate(p),
    ...[12, 9.5, 7, 4.5].map((k, i) => C(24 + (i % 2), 24 - (i % 2), k, "none", { stroke: p.cream, "stroke-width": 2.4 })),
    C(24, 23, 5, p.red),
    ...scatter(r, 3, 24, 23, 6).map(([x, y]) => E(x, y, 2, 1.1, p.leaf)),
  ],
  cake: (p, r) => {
    const top = pick(r, [p.red, p.purple, p.blue, p.orange]);
    return [E(24, 41, 17, 3, p.shade), R(8, 20, 32, 20, 4, p.cream), R(8, 28, 32, 3, 0, top, { opacity: 0.5 }), P("M8 24 Q8 17 24 17 Q40 17 40 24 v2 q-4 3 -8 0 t-8 0 t-8 0 t-8 0 Z", top), R(23, 8, 2, 9, 1, p.wall), E(24, 6.5, 1.5, 2.4, p.yellow)];
  },
  icecream: (p, r) => {
    const s = [p.cream, p.wall, p.green, p.brown, p.red];
    return [P("M15 22 L24 45 L33 22 Z", p.crust), L(18, 26, 28, 36, p.brown, 0.8), L(30, 26, 22, 38, p.brown, 0.8), C(24, 20, 9.5, pick(r, s)), C(24, 11, 7.5, pick(r, s)), C(24, 4.5, 2.2, p.red)];
  },
  coffee: (p, r) => [
    C(24, 25, 21, p.shade),
    C(24, 24, 21, p.plate),
    C(24, 24, 14, p.cream),
    C(24, 24, 11, p.brown),
    r.next() < 0.5 ? P("M24 29 C16 23 20 17 24 21 C28 17 32 23 24 29 Z", p.cream) : E(24, 24, 3, 6, p.cream),
    R(36, 21, 9, 6, 3, p.cream),
  ],
  boba: (p, r) => [
    E(24, 45, 10, 2, p.shade),
    P("M13 14 H35 L32 45 H16 Z", p.wall),
    P("M13.5 18 H34.5 L32 45 H16 Z", mix2(p, r)),
    ...[[18, 41], [22, 42], [26, 41], [30, 42], [20, 37], [28, 37], [24, 38]].map(([x, y]) => C(x!, y!, 1.9, p.dark)),
    R(11, 11, 26, 4, 2, p.paper),
    R(25, 1, 3, 13, 1.5, pick(r, [p.red, p.purple, p.blue]), { transform: "rotate(14 26 8)" }),
  ],
  cocktail: (p, r) => [
    E(24, 45, 9, 2, p.shade),
    P("M8 12 H40 L24 30 Z", pick(r, [p.red, p.orange, p.blue, p.purple]), { opacity: 0.85 }),
    P("M8 12 H40 L24 30 Z", "none", { stroke: p.rim, "stroke-width": 1.2 }),
    R(23, 30, 2, 12, 1, p.rim),
    R(16, 42, 16, 2.5, 1.2, p.rim),
    C(36, 12, 5, p.green),
    C(36, 12, 3.6, p.grass),
  ],
  bread: (p, r) => [E(24, 38, 19, 4, p.shade), E(24, 26, 19, 12, p.crust), E(24, 24, 17, 9, p.yellow, { opacity: 0.35 }), ...[0, 1, 2].map((i) => L(14 + i * 8, 20 + (r.next() * 2 - 1), 20 + i * 8, 28, p.cream, 1.6))],
  curry: (p, r) => [
    C(24, 25, 21, p.shade),
    C(24, 24, 21, p.plate),
    C(24, 24, 17, p.orange),
    C(24, 24, 15, p.yellow, { opacity: 0.4 }),
    E(18, 19, 8, 6, p.cream),
    ...scatter(r, 5, 29, 28, 6).map(([x, y]) => C(x, y, 2.4, p.brown)),
    ...scatter(r, 4, 24, 26, 10).map(([x, y]) => C(x, y, 1, p.green)),
  ],
  donut: (p, r) => {
    const icing = pick(r, [p.red, p.purple, p.brown, p.blue]);
    return [C(24, 25, 19, p.shade), C(24, 24, 19, p.crust), P("M24 7 a17 17 0 1 1 -0.1 0 Z", icing, { opacity: 0.9 }), ...scatter(r, 10, 24, 24, 15).filter(([x, y]) => Math.hypot(x - 24, y - 24) > 8).map(([x, y], i) => R(x, y, 3, 1.2, 0.6, loud(p)[i % 6]!, { transform: `rotate(${r.int(180)} ${x} ${y})` })), C(24, 24, 6.5, p.tile)];
  },
  storefront: (p, r) => {
    const a = pick(r, [p.red, p.green, p.blue, p.orange, p.purple]);
    return [
      ...sky(p, p.shade),
      R(6, 12, 36, 28, 2, p.wall),
      R(6, 8, 36, 6, 1, a),
      ...[0, 1, 2, 3, 4, 5].map((i) => P(`M${6 + i * 6} 14 h6 v5 a3 3 0 0 1 -6 0 Z`, i % 2 ? p.paper : a)),
      R(10, 25, 14, 11, 1, p.sky, { stroke: p.rim, "stroke-width": 1 }),
      R(28, 24, 9, 16, 1, p.brown),
    ];
  },
  house: (p, r) => {
    const roof = pick(r, [p.red, p.blue, p.brown, p.green]);
    return [...sky(p, p.grass), R(31, 9, 5, 9, 1, p.brown), R(10, 22, 28, 18, 1, p.wall), P("M6 23 L24 9 L42 23 Z", roof), R(21, 29, 7, 11, 1, p.brown), R(13, 26, 6, 6, 1, p.sky, { stroke: p.rim, "stroke-width": 1 }), R(31, 26, 5, 6, 1, p.sky, { stroke: p.rim, "stroke-width": 1 })];
  },
  venue: (p, r) => {
    const a = pick(r, [p.red, p.purple, p.blue]);
    return [
      R(0, 0, 48, 48, 0, p.dark),
      ...Array.from({ length: 6 }, (_, i) => C(4 + r.int(40), 3 + r.int(10), 0.7, p.cream)),
      P("M5 40 V20 Q24 6 43 20 V40 Z", a),
      R(10, 20, 28, 8, 2, p.cream),
      ...Array.from({ length: 7 }, (_, i) => C(12 + i * 4, 31, 1.1, p.yellow)),
      R(19, 33, 10, 7, 1, p.dark),
      R(0, 40, 48, 8, 0, p.shade),
    ];
  },
  park: (p, r) => [
    ...sky(p, p.grass),
    P("M20 48 Q26 40 22 38 Q18 36 30 38", "none", { stroke: p.cream, "stroke-width": 4 }),
    ...[[12, 22, 9], [33, 18, 11]].flatMap(([x, y, k]) => [R(x! - 1.5, y!, 3, 18, 1, p.brown), C(x!, y!, k!, r.next() < 0.5 ? p.green : p.leaf)]),
    R(36, 36, 9, 2, 1, p.brown),
    C(8, 7, 4, p.yellow),
  ],
  campus: (p, r) => [
    ...sky(p, p.grass),
    P("M6 17 L24 7 L42 17 Z", p.cream),
    R(8, 17, 32, 3, 0, p.wall),
    ...[11, 18, 25, 32].map((x) => R(x, 20, 4, 15, 0, p.paper)),
    R(6, 35, 36, 3, 0, p.cream),
    C(24, 13, 2.2, pick(r, [p.blue, p.red, p.green]), { stroke: p.rim, "stroke-width": 0.6 }),
  ],
  couch: (p, r) => {
    const c = pick(r, [p.blue, p.green, p.orange, p.purple, p.red]);
    return [E(24, 41, 20, 2.5, p.shade), R(7, 14, 34, 16, 5, c), R(4, 22, 9, 15, 4, c), R(35, 22, 9, 15, 4, c), R(12, 25, 24, 9, 3, c, { opacity: 0.75 }), L(24, 26, 24, 33, p.dark, 0.8), R(6, 37, 3, 4, 1, p.brown), R(39, 37, 3, 4, 1, p.brown)];
  },
  ticket: (p, r) => {
    const c = pick(r, [p.blue, p.red, p.purple, p.orange]);
    return [P("M4 13 H44 V20 A4 4 0 0 0 44 28 V35 H4 V28 A4 4 0 0 0 4 20 Z", c, { transform: "rotate(-8 24 24)" }), L(33, 13, 33, 35, p.on, 1.2, { "stroke-dasharray": "2 2", transform: "rotate(-8 24 24)" }), R(9, 19, 18, 3, 1.5, p.on, { transform: "rotate(-8 24 24)", opacity: 0.9 }), R(9, 25, 12, 3, 1.5, p.on, { transform: "rotate(-8 24 24)", opacity: 0.6 })];
  },
  car: (p, r) => {
    const c = pick(r, [p.red, p.blue, p.green, p.yellow, p.purple]);
    return [E(24, 38, 21, 2.5, p.shade), P("M4 34 V27 Q5 23 10 22 L15 15 Q16 13 19 13 H31 Q34 13 36 16 L40 22 Q44 23 44 27 V34 Z", c), P("M17 16 H23 V22 H13 Z M26 16 H32 L36 22 H26 Z", p.sky), C(13, 34, 4.5, p.dark), C(13, 34, 1.8, p.rim), C(35, 34, 4.5, p.dark), C(35, 34, 1.8, p.rim), R(40, 26, 4, 2, 1, p.yellow)];
  },
  gift: (p, r) => {
    const c = pick(r, [p.red, p.blue, p.purple, p.green]), b = pick(r, [p.yellow, p.paper]);
    return [E(24, 43, 17, 2.5, p.shade), R(9, 20, 30, 22, 2, c), R(7, 14, 34, 7, 2, c), R(21, 14, 6, 28, 0, b), E(19, 11, 6, 4, b, { transform: "rotate(-20 19 11)" }), E(29, 11, 6, 4, b, { transform: "rotate(20 29 11)" }), C(24, 13, 2.5, b)];
  },
  suitcase: (p, r) => {
    const c = pick(r, [p.orange, p.blue, p.green, p.red, p.purple]);
    return [P("M18 12 V7 H30 V12", "none", { stroke: p.soft, "stroke-width": 2.5 }), R(9, 12, 30, 28, 5, c), R(15, 12, 3, 28, 0, p.dark, { opacity: 0.25 }), R(30, 12, 3, 28, 0, p.dark, { opacity: 0.25 }), C(14, 42, 2.4, p.soft), C(34, 42, 2.4, p.soft)];
  },
  book: (p, r) => {
    const c = pick(r, [p.red, p.blue, p.green, p.purple, p.orange]);
    return [E(25, 43, 15, 2.5, p.shade), R(12, 7, 26, 34, 2, p.plate, { stroke: p.rim, "stroke-width": 1 }), R(10, 6, 25, 34, 2, c), R(10, 6, 4, 34, 1, p.dark, { opacity: 0.3 }), R(18, 13, 13, 3, 1.5, p.on, { opacity: 0.85 }), R(18, 19, 9, 2, 1, p.on, { opacity: 0.6 })];
  },
};
function mix2(p: Pal, r: Rng) {
  return pick(r, [p.crust, p.purple, p.green, p.cream]);
}

export const THUMB_KINDS = /* @__PURE__ */ Object.keys(draw) as ThumbKind[];

const WORDS: [ThumbKind, RegExp][] = [
  ["ramen", /ramen|pho|noodle|udon|soba|tonkotsu/],
  ["sushi", /sushi|omakase|poke|izakaya/],
  ["pizza", /pizz|slice/],
  ["burger", /burger|shake shack|in-n-out|diner/],
  ["taco", /taco|taqueria|burrito|mexican|sisig|cantina/],
  ["boba", /boba|bubble tea|tea house/],
  ["coffee", /coffee|cafe|café|espresso|latte|roaster/],
  ["cocktail", /bar\b|cocktail|drinks|lounge|wine|brew|pub/],
  ["icecream", /ice cream|gelato|creamery|froyo|soft serve/],
  ["donut", /donut|doughnut/],
  ["cake", /cake|dessert|pastry|patisserie|sweet/],
  ["bread", /bread|bakery|bagel|tartine|boulangerie/],
  ["curry", /curry|thai|indian|masala|biryani/],
  ["salad", /salad|bowl|vegan|green/],
  ["pasta", /pasta|italian|trattoria|spaghetti/],
  ["park", /park|hike|trail|beach|garden|picnic/],
  ["venue", /venue|concert|show|club|theat|arena|comedy|karaoke/],
  ["campus", /campus|school|library|museum|hall\b|college/],
  ["house", /house|home|apartment|apt|cabin|airbnb|sublet/],
  ["storefront", /store|shop|market|mall|thrift/],
];

/** A kind for a name or phrase ("Marufuku Ramen" -> "ramen"); `fallback` when nothing matches. */
export function thumbKind(text: string, fallback: ThumbKind = "storefront"): ThumbKind {
  const t = text.toLowerCase();
  return WORDS.find(([, re]) => re.test(t))?.[0] ?? fallback;
}

const NAMES: Partial<Record<ThumbKind, string>> = { icecream: "Ice cream", storefront: "Shop" };

/**
 * A drawn thumbnail in place of a photo. `seed` (the place or item name) fixes the details, so the
 * same subject always looks the same. `label` is the accessible name; pass "" when the name is
 * already written next to it.
 */
export function Thumb(p: { kind: ThumbKind; seed?: string | number; size?: number; label?: string }) {
  const t = theme(), pl = pal(t), s = p.size ?? 44;
  const k = draw[p.kind] ? p.kind : "storefront";
  const label = p.label ?? NAMES[k] ?? k[0]!.toUpperCase() + k.slice(1);
  return h(
    "span",
    { style: { display: "block", flex: "none", width: s, height: s, borderRadius: Math.round(s * 0.22), overflow: "hidden", background: pl.tile } },
    svg(48, 48, label || null, draw[k](pl, rand(`${k}:${p.seed ?? ""}`))),
  );
}
