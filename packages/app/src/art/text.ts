// One way to fit a label into a shape: shrink from its size down to a floor, then cut with "…".
// With a Canvas context it measures exactly (and leaves `g.font` set to the fitted font); without
// one (SVG text, a chip sized before layout) it uses a slightly generous estimate of the system
// font, so an estimated fit never clips.

import { theme } from "./paint.ts";

export type Measurer = { font: string; measureText(text: string): { width: number } };
export type Fit = { text: string; size: number; font: string; width: number };

// Advance widths of the system UI font in em, rounded up: narrow, regular, wide, capital.
const NARROW = /[ijlI.,:;'|!()[\]{}`·\s]/;
const WIDE = /[mwMW@%&]/;
const em = (ch: string) => (NARROW.test(ch) ? 0.3 : WIDE.test(ch) ? 0.9 : ch >= "A" && ch <= "Z" ? 0.7 : ch.charCodeAt(0) > 0x2e7f ? 1.05 : 0.58);

/** Estimated width in px of `text` at `size` px (bold adds 6 in 100). */
export function textWidth(text: string, size: number, weight: number | string = 400): number {
  let w = 0;
  for (const ch of text) w += em(ch);
  return w * size * (Number(weight) >= 600 ? 1.06 : 1);
}

/**
 * Fit `text` into `max` px: try `size` (default the body size), step down to `min` (default 10),
 * then cut at the floor and end with "…". Returns the text to draw, its size and the CSS font.
 * Pass `g` (the Canvas context) to measure exactly; it is left set to the returned font.
 */
export function fitText(text: string, max: number, o: { g?: Measurer; size?: number; min?: number; weight?: number | string; family?: string } = {}): Fit {
  const t = theme(), weight = o.weight ?? 400, family = o.family ?? t.type.family;
  const top = Math.max(1, o.size ?? t.type.body), min = Math.min(top, Math.max(1, o.min ?? 10));
  const font = (s: number) => `${weight} ${s}px ${family}`;
  const width = (s: string, size: number) => {
    if (!o.g) return textWidth(s, size, weight);
    o.g.font = font(size);
    return o.g.measureText(s).width;
  };
  const done = (s: string, size: number): Fit => {
    const w = s ? width(s, size) : 0;
    if (o.g) o.g.font = font(size);
    return { text: s, size, font: font(size), width: w };
  };
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean || !(max > 0)) return done("", min);
  for (let s = top; s > min; s = Math.max(min, s - 1)) if (width(clean, s) <= max) return done(clean, s);
  if (width(clean, min) <= max) return done(clean, min);
  // At the floor: the longest prefix that fits with an ellipsis (binary search on characters).
  const chars = [...clean];
  let lo = 0, hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (width(chars.slice(0, mid).join("").trimEnd() + "…", min) <= max) lo = mid;
    else hi = mid - 1;
  }
  const cut = chars.slice(0, lo).join("").trimEnd();
  return done(cut ? cut + "…" : width("…", min) <= max ? "…" : "", min);
}
