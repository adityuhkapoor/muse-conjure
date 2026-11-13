// Drawn covers: a soft two-stop gradient with a few translucent circles and, where it helps, one
// simple line icon of the thing (the taste lab's tool frames and event covers). Things for sale get
// a flat tile with the icon in colour instead (Marketplace style). Deterministic from the seed.
import { COVER, TILE, WHITE, hash } from "./art-palette";

export type CoverKind = "scene" | "story" | "reel" | "group" | "event" | "game" | "tile";

/** Line icons on a 24 box, stroked. */
const ICON: Record<string, string> = {
  mountain: "M2 20L9 8l4 7 3-4 6 9z",
  sunset: "M3 17h18M7 21h10M12 4v2M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4M7 17a5 5 0 0 1 10 0",
  sunrise: "M3 18h18M12 3v3M5 8l1.5 1.5M19 8l-1.5 1.5M7 18a5 5 0 0 1 10 0M9 21h6",
  plate: "M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM3 4v5a1.5 1.5 0 0 0 3 0V4M4.5 10.5V20M21 4c-1.5 0-2.5 2-2.5 5v3H21v8",
  dumbbell: "M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12",
  ball: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8",
  cup: "M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2M14 3v2",
  books: "M4 4h4.5v16H4zM8.5 4H13v16H8.5zM14.5 5.2l4-1 3.5 15-4 1z",
  plant: "M12 21v-9M12 12C12 7.5 8.5 5 4 5c0 4.5 3.5 7 8 7zM12 15c0-4 3-6.5 8-6.5 0 4-3.5 6.5-8 6.5zM7 21h10",
  house: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0z",
  couch: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2",
  book: "M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 23H19v-5M9 7h6",
  bowl: "M3 11h18a9 9 0 0 1-18 0zM8 21h8M9 8c0-2 2-2 2-4M14 8c0-2 2-2 2-4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  leaf: "M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8",
  rain: "M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6a4.5 4.5 0 0 1 0 9zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
  car: "M3 16v-4l2.5-5h13l2.5 5v4zM3 12h18M5 16v3h3v-3M16 16v3h3v-3",
  campus: "M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M9 11.5h.01M15 11.5h.01",
  pan: "M3 12h13a6.5 6.5 0 0 1-13 0zM16 12h5M7 3.5c0 2 2 2 2 4M11 3.5c0 2 2 2 2 4",
  truck: "M2 16V6h12v10zM14 9h4l3 3.5V16h-7M5 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  fridge: "M6 3h12v18H6zM6 10h12M9 6v2M9 13v3",
  lamp: "M8 3h8l3 7H5zM12 10v10M8 21h8",
  bike: "M2 16.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M15 16.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M5.5 16.5l4-7h6l3 7M9.5 9.5L8 6H6M12 16.5l3.5-7",
  desk: "M3 9h18M5 9v11M19 9v11M13 9v6h6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6",
};

/** What each seeded picture becomes: icon and gradient. Ids are the old assets/manifest.json ids. */
const SCENES: Record<string, { icon?: string; pal?: number; kind?: CoverKind }> = {
  "post-1": { icon: "mountain", pal: 4 },
  "post-2": { icon: "sunset", pal: 5 },
  "post-3": { icon: "plate", pal: 6 },
  "post-4": { icon: "dumbbell", pal: 3 },
  "post-5": { icon: "ball", pal: 0 },
  "post-6": { icon: "cup", pal: 1 },
  "post-7": { icon: "books", pal: 2 },
  "post-8": { icon: "plant", pal: 4 },
  "p-maya-2": { icon: "mountain", pal: 0 },
  "p-dev-3": { icon: "sunrise", pal: 6, kind: "story" },
  "p-theo-3": { icon: "bowl", pal: 8, kind: "story" },
  "story-1": { pal: 5, kind: "story" },
  "story-2": { pal: 8, kind: "story" },
  "story-3": { pal: 4, kind: "story" },
  "story-4": { pal: 2, kind: "story" },
  "reel-food": { icon: "bowl", pal: 6, kind: "reel" },
  "reel-hike": { icon: "mountain", pal: 0, kind: "reel" },
  "reel-cooking": { icon: "pan", pal: 5, kind: "reel" },
  "reel-campus": { icon: "campus", pal: 2, kind: "reel" },
  "reel-night-out": { icon: "truck", pal: 7, kind: "reel" },
  "reel-road-trip": { icon: "car", pal: 1, kind: "reel" },
  "cover-sublet-group": { icon: "house", pal: 1, kind: "group" },
  "cover-club": { icon: "mountain", pal: 0, kind: "group" },
  "event-juniper-cover": { icon: "music", pal: 7, kind: "event" },
  "dish-halal-cart": { icon: "bowl", pal: 6, kind: "game" },
  "place-quad": { icon: "trophy", pal: 2, kind: "game" },
  "place-apt-living": { icon: "film", pal: 3, kind: "game" },
};

/** Icon for a thing for sale, from its id ("listing-couch", "listing-futon"). */
const THING: [RegExp, string][] = [
  [/couch|sofa|loveseat|futon|sectional/, "couch"],
  [/book/, "book"],
  [/fridge/, "fridge"],
  [/lamp/, "lamp"],
  [/bike/, "bike"],
  [/desk|table/, "desk"],
];

function kindOf(id: string): CoverKind {
  const s = SCENES[id];
  if (s?.kind) return s.kind;
  if (id.startsWith("listing-")) return "tile";
  if (id.startsWith("story-")) return "story";
  if (id.startsWith("reel-")) return "reel";
  if (id.startsWith("cover-")) return "group";
  if (id.startsWith("event-")) return "event";
  return "scene";
}

/** Box per kind, so the circles stay round when the picture is cropped to its slot. */
const BOX: Record<CoverKind, [number, number]> = { scene: [100, 100], story: [90, 160], reel: [90, 160], group: [160, 90], event: [160, 90], game: [160, 90], tile: [100, 100] };

/** The cover as SVG markup. `kind` overrides what the seed implies (Gaming draws game tiles). */
export function coverSvg(seed: string, kind?: CoverKind): string {
  const k = kind ?? kindOf(seed);
  const s = SCENES[seed] ?? {};
  const h = hash(seed);
  const [w, ht] = BOX[k];
  const m = Math.min(w, ht);
  // stories carry a caption in the middle, so they get no icon
  const icon = k === "story" ? undefined : (s.icon ?? THING.find(([re]) => re.test(seed))?.[1] ?? "sparkle");
  const size = m * (k === "reel" ? 0.22 : k === "scene" ? 0.24 : 0.3);
  const iconAt = (size: number, color: string, sw: number, op = 1) =>
    icon ? `<g transform="translate(${(w - size) / 2} ${(ht - size) / 2}) scale(${size / 24})"><path d="${ICON[icon]}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}"/></g>` : "";
  if (k === "tile") {
    const [bg, fg] = TILE[s.pal ?? h % TILE.length]!;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="xMidYMid slice"><rect width="${w}" height="${ht}" fill="${bg}"/>${iconAt(m * 0.42, fg, 1.6)}</svg>`;
  }
  const [a, b] = COVER[s.pal ?? h % COVER.length]!;
  // three soft circles, placed from the hash: one big low corner, one mid, one small
  const r = (i: number) => ((h >>> (i * 4)) & 15) / 15;
  const circles = [
    [w * (0.1 + 0.2 * r(0)), ht * (0.85 + 0.1 * r(1)), m * 0.55, 0.14],
    [w * (0.75 + 0.2 * r(2)), ht * (0.15 + 0.15 * r(3)), m * 0.38, 0.16],
    [w * (0.55 + 0.2 * r(4)), ht * (0.7 + 0.15 * r(5)), m * 0.16, 0.2],
  ]
    .map(([x, y, rr, o]) => `<circle cx="${x!.toFixed(1)}" cy="${y!.toFixed(1)}" r="${rr!.toFixed(1)}" fill="${WHITE}" fill-opacity="${o}"/>`)
    .join("");
  const disc = icon ? `<circle cx="${w / 2}" cy="${ht / 2}" r="${(size * 0.95).toFixed(1)}" fill="${WHITE}" fill-opacity="0.16"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${ht}" fill="url(#g)"/>${circles}${disc}${iconAt(size, WHITE, 1.7, 0.95)}</svg>`;
}

const cache = new Map<string, string>();
/** Data URL of a drawn cover. */
export function coverUrl(seed: string, kind?: CoverKind): string {
  const key = `${seed}|${kind ?? ""}`;
  let u = cache.get(key);
  if (!u) {
    u = "data:image/svg+xml," + encodeURIComponent(coverSvg(seed, kind));
    cache.set(key, u);
  }
  return u;
}
