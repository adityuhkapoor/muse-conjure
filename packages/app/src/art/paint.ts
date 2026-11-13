// Shared pieces of the art kit: the theme in force, color mixing, seeded randomness, the
// illustration palette (every value derived from theme tokens), and a scene: an SVG picture with
// HTML overlays (avatars, chips, buttons) placed by fractions of its box. Overlays stay HTML so the
// gate's contrast, hit-area and overlap checks keep working on them.

import type { Member } from "@muse/protocol";
import { h, type Child } from "../h.ts";
import { ctx } from "../ctx.ts";
import { rng } from "../rng.ts";
import { makeTheme, type Theme } from "../theme.ts";
import { Avatar } from "../components.ts";
import type { Rng } from "../types.ts";

let fallback: Theme | undefined;
/** The theme in force (the frame sets it before each render). */
export const theme = (): Theme => ctx.theme ?? (fallback ??= makeTheme());
/** Usable width inside the card (its 12 px padding taken off). */
export const innerWidth = () => theme().width - 2 * theme().space.card;

const rgb = (c: string): number[] => {
  if (c[0] === "#") {
    const n = parseInt(c.slice(1, 7), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/[\d.]+/g) ?? [];
  return [0, 1, 2].map((i) => Number(m[i] ?? 0));
};

/** `a` moved toward `b` by `t` (0 to 1), as rgb(). Both are theme colors. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(",")})`;
}

const lum = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** WCAG contrast ratio of two colors. */
export const contrast = (a: string, b: string) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Text color for a fill: the theme's onPrimary or its darkest ink, whichever reads better. */
export function readable(bg: string, t: Theme = theme()): string {
  const dark = t.mode === "dark" ? t.color.card : t.color.text;
  return contrast(t.color.onPrimary, bg) >= contrast(dark, bg) ? t.color.onPrimary : dark;
}

/** `fg` nudged toward the theme's text color until it reads at 4.5:1 on `bg`. */
export function ink(fg: string, bg: string, t: Theme = theme()): string {
  let out = fg;
  for (let k = 0.1; contrast(out, bg) < 4.5 && k <= 1; k += 0.1) out = mix(fg, t.color.text, k);
  return out;
}

/** A stable uint32 for a string or number: the same subject always draws the same way. */
export function seedOf(s: string | number): number {
  if (typeof s === "number") return s >>> 0;
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x1000193);
  return (x ^ (x >>> 13)) >>> 0;
}
export const rand = (s: string | number): Rng => rng(seedOf(s));

export type Pal = Record<
  "tile" | "plate" | "paper" | "rim" | "ink" | "soft" | "red" | "yellow" | "green" | "blue" | "orange" | "purple" | "leaf" | "brown" | "crust" | "cream" | "dark" | "shade" | "sky" | "grass" | "wall" | "card" | "primary" | "on",
  string
>;
const pals = /* @__PURE__ */ new WeakMap<Theme, Pal>();

/** Illustration colors for a theme: Facebook's reaction hues, shaded toward the theme's ink or paper. */
export function pal(t: Theme = theme()): Pal {
  let p = pals.get(t);
  if (p) return p;
  const c = t.color, dk = t.mode === "dark";
  const black = dk ? c.wash : c.text, white = dk ? c.text : c.card;
  p = {
    tile: c.input,
    plate: dk ? c.secondaryButton : c.card,
    paper: dk ? mix(c.text, c.card, 0.12) : c.card,
    rim: c.divider,
    ink: c.text,
    soft: c.secondaryText,
    red: c.series4,
    yellow: c.series2,
    green: c.series3,
    blue: c.series1,
    orange: c.series5,
    purple: c.series6,
    leaf: mix(c.series3, black, 0.35),
    brown: mix(c.series5, black, 0.5),
    crust: mix(c.series2, c.series5, 0.45),
    cream: mix(c.series2, white, 0.7),
    dark: mix(c.series6, black, 0.78),
    shade: mix(c.input, black, dk ? 0.4 : 0.12),
    sky: mix(c.series1, white, dk ? 0.45 : 0.8),
    grass: mix(c.series3, white, dk ? 0.15 : 0.55),
    wall: mix(c.series5, white, dk ? 0.5 : 0.82),
    card: c.card,
    primary: c.primary,
    on: c.onPrimary,
  };
  pals.set(t, p);
  return p;
}

// ---- SVG shorthands (numbers are user units of the picture's viewBox) ----

type A = Record<string, unknown>;
export const circle = (cx: number, cy: number, r: number, fill: string, a?: A) => h("circle", { cx: r2(cx), cy: r2(cy), r: r2(r), fill, ...a });
export const rect = (x: number, y: number, w: number, hh: number, rx: number, fill: string, a?: A) => h("rect", { x: r2(x), y: r2(y), width: r2(w), height: r2(hh), rx, fill, ...a });
export const path = (d: string, fill: string, a?: A) => h("path", { d, fill, ...a });
export const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, a?: A) => h("ellipse", { cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), fill, ...a });
export const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w = 2, a?: A) =>
  h("line", { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), stroke, "stroke-width": w, "stroke-linecap": "round", ...a });
export const r2 = (n: number) => Math.round(n * 10) / 10;

/** An SVG of `w` x `ht` user units. With a label it is an image with that name; without, decoration. */
export function svg(w: number, ht: number, label: string | null, kids: Child, style?: A) {
  return h(
    "svg",
    { viewBox: `0 0 ${w} ${ht}`, width: "100%", height: "100%", ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" }), style: { display: "block", ...style } },
    kids,
  );
}

// ---- Scenes and placement ----

/** Absolute position for an overlay, centered on (x, y) given as fractions (0 to 1) of the scene. */
export const at = (x: number, y: number, extra?: A): A => ({
  position: "absolute",
  left: `${r2(x * 100)}%`,
  top: `${r2(y * 100)}%`,
  transform: "translate(-50%,-50%)",
  ...extra,
});

const SPRING = "cubic-bezier(.34,1.56,.64,1)";
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Pop an element in with a small spring when it first appears. */
export const pop = (el: Element) => {
  if (!still()) (el as HTMLElement).animate?.([{ scale: "0.2", opacity: 0 }, { scale: "1", opacity: 1 }], { duration: 420, easing: SPRING });
};

/**
 * A picture `height` px tall: `art` is SVG content in a viewBox as wide as the card's inside
 * (`innerWidth()`), `children` are overlays placed with `at()` or <Placed>. `label` names the
 * picture for screen readers; say what it shows in words ("3 of 8 seats in 104 taken").
 */
export function Scene(p: { height: number; label: string; art?: Child; children?: Child; bg?: string; radius?: number }) {
  const t = theme();
  return h(
    "div",
    { style: { position: "relative", minWidth: 0, height: p.height, borderRadius: p.radius ?? t.radius.card, background: p.bg, overflow: p.bg ? "hidden" : undefined } },
    h("div", { style: { position: "absolute", inset: 0 } }, svg(innerWidth(), p.height, p.label, p.art ?? null)),
    p.children,
  );
}

/**
 * A person placed into a picture at fractions (x, y): it springs in, and moves with a spring when
 * x or y change (`move={false}` when the caller animates x and y itself). The viewer (`me`) gets a primary ring. `badge` sits on the lower right ("+2", a check).
 */
export function Placed(p: { user: string | Member; x: number; y: number; size?: number; me?: string; badge?: Child; dim?: boolean; move?: boolean }) {
  const s = p.size ?? 24, t = theme();
  const id = typeof p.user === "string" ? p.user : p.user.id;
  const ring = id === p.me ? `0 0 0 2px ${t.color.card},0 0 0 4px ${t.color.primary}` : `0 0 0 2px ${t.color.card}`;
  return h(
    "span",
    {
      ref: pop,
      style: at(p.x, p.y, { display: "flex", pointerEvents: "none", borderRadius: "50%", boxShadow: ring, filter: p.dim ? "grayscale(1)" : undefined, transition: p.move === false ? undefined : `left .5s ${SPRING},top .5s ${SPRING}` }),
    },
    h(Avatar, { user: p.user, size: s }),
    p.badge != null && h("span", { style: { position: "absolute", right: -5, bottom: -4 } }, p.badge),
  );
}

/** Split a crowd: the first `max` to show and how many more there are (for a "+N" chip). */
export function crowd<T>(users: readonly T[], max: number): { shown: T[]; extra: number } {
  const n = users.length > max ? Math.max(0, max - 1) : max;
  return { shown: users.slice(0, n), extra: users.length - Math.min(users.length, n) };
}

/** A "+N" chip, the size of an avatar. */
export function More(p: { n: number; size?: number }) {
  const s = p.size ?? 24, t = theme();
  return h(
    "span",
    {
      "aria-label": `${p.n} more`,
      style: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: s, height: s, padding: "0 4px", borderRadius: 99, background: t.color.secondaryButton, color: t.color.secondaryButtonText, fontSize: 12, fontWeight: 600, lineHeight: 1 },
    },
    `+${p.n}`,
  );
}

/** A small label chip with its own background, so contrast is real wherever it sits. */
export function Chip(p: { children?: Child; tone?: "neutral" | "primary" | "positive" | "negative" | "card"; maxWidth?: number; style?: A }) {
  const c = theme().color;
  const bg = { neutral: c.secondaryButton, primary: c.primary, positive: c.positive, negative: c.negative, card: c.card }[p.tone ?? "neutral"];
  const fg = p.tone === "card" ? c.text : p.tone && p.tone !== "neutral" ? readable(bg) : c.secondaryButtonText;
  return h(
    "span",
    { style: { display: "inline-block", maxWidth: p.maxWidth, padding: "2px 7px", borderRadius: 99, background: bg, color: fg, fontSize: 12, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...p.style } },
    p.children,
  );
}
