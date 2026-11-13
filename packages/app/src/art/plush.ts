// Plush food characters for a Canvas: 18 dishes plus a "mystery" plush whose shape and color come
// from a seed (a place's name), each with a face that can squeeze, gasp or get dizzy. Drawn in unit
// coordinates (r = 1, origin at the bottom center) from SVG path strings, colors from the theme.

import type { Theme } from "../theme.ts";
import { mix, seedOf, theme } from "./paint.ts";

export type PlushKind =
  | "dumpling" | "taco" | "burrito" | "ramen" | "pizza" | "burger" | "sandwich" | "sushi" | "onigiri" | "noodles"
  | "curry" | "chicken" | "salad" | "bagel" | "icecream" | "boba" | "fries" | "hotdog" | "mystery";
export type PlushMood = "happy" | "squeeze" | "oops" | "dizzy" | "meh";

export const PLUSH_KINDS: readonly PlushKind[] = ["dumpling", "taco", "burrito", "ramen", "pizza", "burger", "sandwich", "sushi", "onigiri", "noodles", "curry", "chicken", "salad", "bagel", "icecream", "boba", "fries", "hotdog", "mystery"];
const ALIAS: Record<string, PlushKind> = { slice: "pizza", cup: "boba", sub: "sandwich", hoagie: "sandwich", pastry: "bagel", donut: "bagel", rice: "curry", bowl: "curry", wings: "chicken", "hot dog": "hotdog", "ice cream": "icecream", tea: "boba", pho: "noodles" };
const GUESS: [RegExp, PlushKind][] = [
  [/pizz|slice/, "pizza"], [/taco|taqueri/, "taco"], [/burrito|chipotle/, "burrito"], [/ramen/, "ramen"], [/dumpling|dim sum|\bbao\b|gyoza|momo/, "dumpling"],
  [/burger|shack/, "burger"], [/cheesesteak|hoagie|\bsub\b|sandwich|\bdeli\b|banh mi/, "sandwich"], [/sushi|omakase|nigiri/, "sushi"], [/onigiri/, "onigiri"],
  [/\bpho\b|noodle|lo mein|pad thai|udon|\bwok\b/, "noodles"], [/curry|biryani|\bthai\b|indian|\brice\b/, "curry"], [/chicken|\bwings?\b/, "chicken"], [/salad|greens|poke/, "salad"],
  [/bagel|bakery|\bcaf[eé]\b|croissant|pastr|donut/, "bagel"], [/ice cream|gelato|froyo|creamery|scoop/, "icecream"], [/boba|bubble tea|\btea\b/, "boba"],
  [/fries|frites/, "fries"], [/hot ?dog/, "hotdog"],
];
/** The plush for a place: its kind if it is one (or a known alias), else a guess from the words, else "mystery". */
export function plushKind(kind: string, label = ""): PlushKind {
  const k = String(kind ?? "").trim().toLowerCase();
  if ((PLUSH_KINDS as readonly string[]).includes(k)) return k as PlushKind;
  if (ALIAS[k]) return ALIAS[k]!;
  const l = `${label} ${k}`.toLowerCase();
  for (const [re, p] of GUESS) if (re.test(l)) return p;
  return "mystery";
}

const TAU = Math.PI * 2;
type Pal = Record<"ink" | "white" | "red" | "yellow" | "green" | "blue" | "orange" | "purple" | "cream" | "bread" | "crust" | "brown" | "pink" | "blush" | "rice" | "metal" | "metalDk" | "paper", string>;
const pals = /* @__PURE__ */ new WeakMap<Theme, Pal>();
function palette(t: Theme): Pal {
  let p = pals.get(t);
  if (p) return p;
  const c = t.color, dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text, white = c.onPrimary;
  p = {
    ink, white, red: c.series4, yellow: c.series2, green: c.series3, blue: c.series1, orange: c.series5, purple: c.series6,
    cream: mix(c.series2, white, 0.74), bread: mix(c.series2, c.series5, 0.42), crust: mix(mix(c.series2, c.series5, 0.6), ink, 0.12),
    brown: mix(c.series5, ink, 0.5), pink: mix(c.series4, white, 0.52), blush: mix(c.series4, white, 0.35), rice: mix(white, c.series2, 0.06),
    metal: mix(white, ink, 0.16), metalDk: mix(white, ink, 0.42), paper: dk ? mix(white, c.card, 0.06) : white,
  };
  pals.set(t, p);
  return p;
}

type Pen = ReturnType<typeof pen>;
function pen(g: CanvasRenderingContext2D) {
  const fill = (d: string | Path2D, f: string) => {
    g.fillStyle = f;
    g.fill(typeof d === "string" ? new Path2D(d) : d, "evenodd");
  };
  return {
    fill,
    line(d: string, f: string, w: number) {
      g.strokeStyle = f;
      g.lineWidth = w;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke(new Path2D(d));
    },
    c(x: number, y: number, r: number, f: string) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fillStyle = f;
      g.fill();
    },
    e(x: number, y: number, rx: number, ry: number, f: string, a = 0) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, a, 0, TAU);
      g.fillStyle = f;
      g.fill();
    },
    rr(x: number, y: number, w: number, h: number, rad: number, f: string) {
      g.beginPath();
      g.roundRect(x, y, w, h, rad);
      g.fillStyle = f;
      g.fill();
    },
    /** A plush body: fill, then a soft shade at the bottom and a highlight near the top, clipped to it. */
    body(d: string, f: string, P: Pal, top = -1.6) {
      const p = new Path2D(d);
      fill(p, f);
      g.save();
      g.clip(p, "evenodd");
      g.globalAlpha = 0.13;
      g.fillStyle = P.ink;
      g.beginPath();
      g.ellipse(0, 0.25, 2.2, 0.62, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 0.3;
      g.fillStyle = P.white;
      g.beginPath();
      g.ellipse(-0.42, top + 0.28, 0.42, 0.17, -0.45, 0, TAU);
      g.fill();
      g.restore();
    },
  };
}

function face(d: Pen, P: Pal, x: number, y: number, s: number, mood: PlushMood) {
  const ex = 0.3 * s, er = 0.085 * s, w = 0.075 * s;
  d.e(x - ex - 0.13 * s, y + 0.16 * s, 0.11 * s, 0.065 * s, P.blush);
  d.e(x + ex + 0.13 * s, y + 0.16 * s, 0.11 * s, 0.065 * s, P.blush);
  if (mood === "squeeze") {
    for (const k of [-1, 1]) d.line(`M${x + k * (ex + er)} ${y - er}L${x + k * (ex - er)} ${y}L${x + k * (ex + er)} ${y + er}`, P.ink, w);
    d.line(`M${x - 0.1 * s} ${y + 0.16 * s}l${0.07 * s} ${-0.04 * s}l${0.06 * s} ${0.04 * s}l${0.07 * s} ${-0.04 * s}`, P.ink, w * 0.8);
    return;
  }
  if (mood === "dizzy") {
    for (const k of [-1, 1]) d.line(`M${x + k * ex - er} ${y + er * 0.4}q${er} ${-er * 1.6} ${er * 2} 0`, P.ink, w);
  } else {
    const big = mood === "oops" ? 1.35 : 1;
    for (const k of [-1, 1]) {
      d.c(x + k * ex, y, er * big, P.ink);
      d.c(x + k * ex - er * 0.3, y - er * 0.35, er * 0.38 * big, P.white);
    }
  }
  if (mood === "oops") d.e(x, y + 0.2 * s, 0.07 * s, 0.09 * s, P.ink);
  else if (mood === "meh") d.line(`M${x - 0.09 * s} ${y + 0.17 * s}h${0.18 * s}`, P.ink, w);
  else d.line(`M${x - 0.11 * s} ${y + 0.12 * s}q${0.11 * s} ${0.13 * s} ${0.22 * s} 0`, P.ink, w);
}

const STAR = (() => {
  let s = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? 0.55 : 1.12;
    s += `${i ? "L" : "M"}${(Math.cos(a) * q).toFixed(3)} ${(Math.sin(a) * q - 1).toFixed(3)}`;
  }
  return s + "Z";
})();

/** Each kind draws its body and returns where its face goes: [x, y, scale]. */
const ART: Record<PlushKind, (d: Pen, P: Pal, seed: number) => [number, number, number]> = {
  dumpling: (d, P) => {
    d.body("M-1.25 0C-1.35-.7-.85-1.35 0-1.38C.85-1.35 1.35-.7 1.25 0Q0 .12-1.25 0Z", P.cream, P, -1.3);
    d.line("M-.5-1.3q.06.18 0 .32M-.17-1.37q.05.2 0 .36M.17-1.37q-.05.2 0 .36M.5-1.3q-.06.18 0 .32", P.crust, 0.07);
    return [0, -0.62, 1];
  },
  taco: (d, P) => {
    d.e(0, -1.3, 1.08, 0.22, P.green);
    d.c(-0.55, -1.42, 0.24, P.green);
    d.c(0.05, -1.5, 0.26, mix(P.green, P.white, 0.2));
    d.c(0.6, -1.4, 0.24, P.green);
    d.c(-0.25, -1.36, 0.15, P.red);
    d.c(0.35, -1.38, 0.14, P.red);
    d.body("M-1.15-1.3C-1.15-.45-.65 0 0 0S1.15-.45 1.15-1.3C.7-1.05-.7-1.05-1.15-1.3Z", P.bread, P, -1.1);
    return [0, -0.58, 0.95];
  },
  burrito: (d, P) => {
    d.body("M-.82-1.15C-.82-2.05.82-2.05.82-1.15V-.3Q.82 0 .5 0H-.5Q-.82 0-.82-.3Z", P.cream, P, -1.8);
    d.e(0, -1.78, 0.5, 0.16, P.green);
    d.c(-0.15, -1.82, 0.08, P.red);
    d.c(0.2, -1.8, 0.07, P.brown);
    d.fill("M-.86-.72L-.6-.86-.35-.7-.1-.86.15-.7.4-.86.62-.7.86-.84V-.3Q.86.04.5.04H-.5Q-.86.04-.86-.3Z", P.metal);
    d.line("M-.5-.45l.15.12M.15-.5l.15.14M-.15-.25l.12.1", P.metalDk, 0.05);
    return [0, -1.22, 0.85];
  },
  ramen: (d, P) => {
    d.line("M-.25-2.05L.3-1.05M.05-2.15L.55-1.05", P.brown, 0.09);
    d.e(0, -1.08, 1.2, 0.3, mix(P.orange, P.yellow, 0.45));
    d.line("M-.9-1.1q.15-.14.3 0t.3 0 .3 0M-.65-.98q.15-.12.3 0t.3 0", P.cream, 0.07);
    d.e(0.5, -1.12, 0.26, 0.14, P.white);
    d.c(0.5, -1.12, 0.1, P.yellow);
    d.rr(-0.25, -1.55, 0.36, 0.45, 0.05, mix(P.green, P.ink, 0.55));
    d.body("M-1.25-1.08Q-1.15 0 0 0T1.25-1.08Z", P.red, P, -0.95);
    d.line("M-1.05-.62Q0-.45 1.05-.62", mix(P.red, P.white, 0.45), 0.07);
    return [0, -0.42, 0.9];
  },
  pizza: (d, P) => {
    d.body("M0-2.05Q.15-2.05 1.02-.42L-1.02-.42Q-.15-2.05 0-2.05Z", mix(P.yellow, P.white, 0.25), P, -1.75);
    d.c(-0.38, -0.82, 0.17, P.red);
    d.c(0.36, -0.95, 0.15, P.red);
    d.c(0.02, -1.55, 0.14, P.red);
    d.body("M-1.18-.45Q-1.2-.62-1-.62H1Q1.2-.62 1.18-.45L1.12-.12Q1.1 0 .9 0H-.9Q-1.1 0-1.12-.12Z", P.bread, P, -0.6);
    return [0, -1.12, 0.78];
  },
  burger: (d, P) => {
    d.body("M-1.1-.45Q-1.1 0-.7 0H.7Q1.1 0 1.1-.45Z", P.bread, P, -0.4);
    d.rr(-1.17, -0.8, 2.34, 0.38, 0.19, P.brown);
    d.fill("M-1.05-.85H1.05L.75-.55.55-.75.25-.48 0-.75-.4-.5-.7-.72Z", P.yellow);
    d.line("M-1.12-.9q.19-.12.37 0t.37 0 .37 0 .37 0 .37 0 .37 0", P.green, 0.16);
    d.body("M-1.18-.95C-1.18-1.75-.65-2.05 0-2.05S1.18-1.75 1.18-.95Z", P.bread, P, -1.9);
    for (const [x, y] of [[-0.55, -1.6], [0, -1.82], [0.5, -1.62], [-0.2, -1.5], [0.82, -1.3]]) d.e(x!, y!, 0.08, 0.045, P.cream, 0.4);
    return [0, -1.28, 0.82];
  },
  sandwich: (d, P) => {
    d.body("M-1.32-.5Q-1.32 0-.8 0H.8Q1.32 0 1.32-.5L1.25-.62H-1.25Z", P.bread, P, -0.5);
    d.line("M-1.28-.7q.16-.12.32 0t.32 0 .32 0 .32 0 .32 0 .32 0 .32 0 .32 0", P.brown, 0.2);
    d.fill("M-1.2-.82H1.2L1.05-.55.88-.7.62-.5.4-.72.1-.52-.2-.72-.48-.5-.75-.7-1-.52Z", P.yellow);
    d.c(-0.6, -0.78, 0.09, P.green);
    d.c(0.55, -0.8, 0.08, P.green);
    d.body("M-1.3-.82C-1.3-1.62-.7-1.68 0-1.68S1.3-1.62 1.3-.82Z", P.bread, P, -1.55);
    d.line("M-.6-1.38l.18-.1M-.05-1.45l.18-.1M.5-1.38l.18-.1", P.crust, 0.07);
    return [0, -1.12, 0.8];
  },
  sushi: (d, P) => {
    d.body("M-1.1-.45Q-1.1-.95-.6-.95H.6Q1.1-.95 1.1-.45V-.2Q1.1 0 .85 0H-.85Q-1.1 0-1.1-.2Z", P.rice, P, -0.85);
    d.body("M-1.22-.85C-1.1-1.5-.3-1.62.4-1.5S1.3-1.15 1.22-.82C.6-1.02-.6-1.02-1.22-.85Z", mix(P.orange, P.pink, 0.35), P, -1.42);
    d.line("M-.7-1.05l.25-.42M-.2-1.08l.25-.45M.3-1.08l.25-.4", mix(P.orange, P.white, 0.55), 0.08);
    return [0, -0.48, 0.8];
  },
  onigiri: (d, P) => {
    d.body("M0-2Q.32-2 1.1-.5Q1.3 0 .75 0H-.75Q-1.3 0-1.1-.5Q-.32-2 0-2Z", P.rice, P, -1.7);
    d.rr(-0.42, -0.62, 0.84, 0.62, 0.06, mix(P.green, P.ink, 0.65));
    return [0, -1.05, 0.85];
  },
  noodles: (d, P) => {
    d.line("M-.5-1.5q-.1-.4.15-.55t0-.45M0-1.5q.1-.35-.1-.6t.05-.4M.42-1.5q-.12-.35.12-.55", P.yellow, 0.1);
    d.line("M.15-1.5L.55-2.3M.35-1.5L.82-2.2", P.brown, 0.08);
    d.line("M-.85-1.55Q0-2.35.85-1.55", P.metalDk, 0.05);
    d.body("M-1.05-1.55H1.05L.78-.12Q.76 0 .62 0H-.62Q-.76 0-.78-.12Z", P.paper, P, -1.4);
    d.fill("M-1.05-1.55L-.75-1.3.75-1.3 1.05-1.55Z", mix(P.paper, P.ink, 0.1));
    d.line("M-.9-.42Q0-.3.9-.42", P.red, 0.1);
    return [0, -0.88, 0.85];
  },
  curry: (d, P) => {
    d.e(-0.35, -1.06, 0.75, 0.48, P.rice);
    d.e(0.45, -1.02, 0.78, 0.3, P.orange);
    d.c(0.25, -1.06, 0.1, P.green);
    d.c(0.7, -1.02, 0.08, P.green);
    d.c(0.45, -1.15, 0.09, P.bread);
    d.body("M-1.25-1.02Q-1.2 0 0 0T1.25-1.02Z", mix(P.blue, P.white, 0.55), P, -0.9);
    d.line("M-1.02-.6Q0-.42 1.02-.6", mix(P.blue, P.white, 0.25), 0.08);
    return [0, -0.42, 0.9];
  },
  chicken: (d, P) => {
    d.line("M.45-1.55L.85-2.1", P.rice, 0.24);
    d.c(0.8, -2.25, 0.14, P.rice);
    d.c(1.0, -2.1, 0.14, P.rice);
    d.body("M-1.1-.75C-1.25-1.6-.4-2.05.35-1.8S1.25-1 1-.42C.8 0 .2.02-.3 0S-1.02-.3-1.1-.75Z", mix(P.orange, P.yellow, 0.35), P, -1.65);
    for (const [x, y] of [[-0.75, -1.35], [-0.2, -1.7], [0.6, -1.45], [-0.95, -0.6], [0.85, -0.65]]) d.c(x!, y!, 0.13, mix(P.orange, P.brown, 0.2));
    return [-0.05, -0.85, 0.9];
  },
  salad: (d, P) => {
    for (const [x, y, r] of [[-0.75, -1.15, 0.38], [-0.25, -1.4, 0.42], [0.3, -1.38, 0.4], [0.78, -1.12, 0.36]]) d.c(x!, y!, r!, P.green);
    d.c(-0.45, -1.3, 0.3, mix(P.green, P.white, 0.25));
    d.c(0.55, -1.35, 0.26, mix(P.green, P.yellow, 0.3));
    d.c(-0.05, -1.25, 0.16, P.red);
    d.c(0.42, -1.12, 0.12, P.red);
    d.line("M-.75-1.12l.22-.12M.1-1.45l.2-.05", P.orange, 0.08);
    d.body("M-1.25-1.02Q-1.2 0 0 0T1.25-1.02Z", mix(P.bread, P.white, 0.25), P, -0.9);
    return [0, -0.45, 0.9];
  },
  bagel: (d, P) => {
    d.body("M-1.15-1C-1.15-1.65-.6-2.02 0-2.02S1.15-1.65 1.15-1 .6 0 0 0-1.15-.35-1.15-1ZM-.32-1.18A.32.26 0 1 0 .32-1.18.32.26 0 1 0-.32-1.18Z", P.bread, P, -1.85);
    d.line("M-.32-1.12A.32.26 0 0 0 .32-1.12", mix(P.bread, P.ink, 0.3), 0.07);
    for (const [x, y] of [[-0.6, -1.6], [-0.2, -1.85], [0.3, -1.82], [0.7, -1.55], [-0.85, -1.2], [0.85, -1.15]]) d.e(x!, y!, 0.08, 0.045, P.cream, 0.6);
    return [0, -0.48, 0.78];
  },
  icecream: (d, P) => {
    d.body("M-.72-1.05H.72L.08-.04Q0 .05-.08-.04Z", P.bread, P, -0.95);
    d.line("M-.45-1L.05-.3M0-1L.3-.6M-.15-.6L.35-1M-.4-.85L-.1-1", P.crust, 0.05);
    d.body("M-.85-1C-1.05-1.5-.7-2.1 0-2.1S1.05-1.5.85-1Q.6-.85.4-1.02.15-.85-.1-1-.45-.85-.85-1Z", P.pink, P, -1.95);
    d.c(0.12, -2.2, 0.15, P.red);
    return [0, -1.45, 0.78];
  },
  boba: (d, P) => {
    d.line("M.15-1.85L.4-2.45", P.purple, 0.16);
    d.body("M-.85-1.72H.85L.68-.12Q.66 0 .52 0H-.52Q-.66 0-.68-.12Z", mix(P.orange, P.white, 0.6), P, -1.6);
    for (const [x, y] of [[-0.35, -0.22], [0, -0.2], [0.35, -0.22], [-0.18, -0.42], [0.18, -0.42]]) d.c(x!, y!, 0.12, mix(P.brown, P.ink, 0.4));
    d.rr(-0.95, -1.88, 1.9, 0.2, 0.1, P.paper);
    return [0, -1.05, 0.82];
  },
  fries: (d, P) => {
    for (const [x, a, h] of [[-0.6, -0.25, 0.95], [-0.32, -0.1, 1.1], [-0.05, 0.05, 1.18], [0.25, 0.12, 1.05], [0.52, 0.28, 0.95], [-0.15, -0.3, 0.85], [0.4, -0.05, 0.9]] as const) {
      d.line(`M${x} -1.1L${x + a * h} ${-1.1 - h * 0.9}`, P.yellow, 0.2);
    }
    d.body("M-1-1.3Q0-.95 1-1.3L.76-.12Q.74 0 .6 0H-.6Q-.74 0-.76-.12Z", P.red, P, -1.15);
    return [0, -0.58, 0.85];
  },
  hotdog: (d, P) => {
    d.body("M-1.3-.62C-1.3-1.02-1.05-1.02-.8-1.02H.8C1.05-1.02 1.3-1.02 1.3-.62Z", P.bread, P, -1);
    d.rr(-1.45, -1.3, 2.9, 0.52, 0.26, mix(P.red, P.brown, 0.45));
    d.line("M-1.1-1.04l.2-.12.2.12.2-.12.2.12.2-.12.2.12.2-.12.2.12.2-.12.2.12", P.yellow, 0.08);
    d.body("M-1.25-.75H1.25Q1.3 0 .75 0H-.75Q-1.3 0-1.25-.75Z", mix(P.bread, P.white, 0.2), P, -0.7);
    return [0, -0.38, 0.72];
  },
  mystery: (d, P, seed) => {
    const hues = [P.blue, P.yellow, P.green, P.red, P.orange, P.purple];
    const a = seed % 6, b = (a + 1 + ((seed >>> 3) % 4)) % 6;
    const col = mix(mix(hues[a]!, hues[b]!, 0.15 + ((seed >>> 6) % 5) * 0.1), P.white, 0.18 + ((seed >>> 9) % 3) * 0.1);
    const shape = (seed >>> 12) % 3;
    if (shape === 1) d.body(STAR, col, P, -1.7);
    else if (shape === 2) d.body("M-.85-1.6Q-.85-2.05 0-2.05T.85-1.6V-.35Q.85 0 .45 0H-.45Q-.85 0-.85-.35Z", col, P, -1.85);
    else d.body("M-1.15-.85C-1.15-1.6-.6-1.95 0-1.95S1.15-1.6 1.15-.85.7 0 0 0-1.15-.2-1.15-.85Z", col, P, -1.8);
    const bx = shape === 1 ? 0 : 0.55, by = shape === 1 ? -0.42 : -0.42;
    d.c(bx, by, 0.27, P.white);
    d.line(`M${bx - 0.09} ${by - 0.15}v.3M${bx - 0.13} ${by - 0.15}v.1M${bx - 0.05} ${by - 0.15}v.1M${bx + 0.09} ${by - 0.16}q.06.1 0 .2v.1`, P.ink, 0.04);
    if (shape !== 1) for (const [x, y] of [[-0.6, -1.5], [0.7, -1.25], [-0.2, -1.75]]) d.c(x!, y!, 0.06, mix(col, P.white, 0.5));
    return shape === 1 ? [0, -1.05, 0.62] : [-0.15, -1.05, 0.85];
  },
};

/** Options: `seed` picks the look of a mystery plush (use the place's name), `sx`/`sy` squash and stretch from the bottom, `tilt` in radians, `mood` the face. */
export type PlushLook = { seed?: string; sx?: number; sy?: number; tilt?: number; mood?: PlushMood };

/**
 * A plush food character on a Canvas, sitting on (x, y) with radius `r` (about 2r tall, 2.4r wide).
 * Every color comes from the theme; faces stay dark in both modes.
 */
export function drawPlush(g: CanvasRenderingContext2D, kind: PlushKind, x: number, y: number, r: number, o: PlushLook = {}): void {
  const P = palette(theme());
  g.save();
  g.translate(x, y);
  g.rotate(o.tilt ?? 0);
  g.scale(r * (o.sx ?? 1), r * (o.sy ?? 1));
  const d = pen(g);
  const [fx, fy, fs] = (ART[kind] ?? ART.mystery)(d, P, seedOf(o.seed ?? kind));
  face(d, P, fx, fy, fs, o.mood ?? "happy");
  g.restore();
}
