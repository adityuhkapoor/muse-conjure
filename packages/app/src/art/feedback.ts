// Meta-style feedback in place of confetti: a short burst of the person's own reaction, a color
// change on the thing that changed, and a plain "locked" state. No stamps, trophies or mascots.

import { h, type Child } from "../h.ts";
import { running } from "../ctx.ts";
import { mix, theme } from "./paint.ts";

const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A few of `emoji` float up from where you put it and fade (about 1 s). Show it with a new `key`
 * after the viewer's own action (keep a counter in `local`); it is decoration, hidden from screen readers.
 */
export function Burst(p: { emoji?: string; count?: number }) {
  const n = p.count ?? 6;
  return h(
    "span",
    { "aria-hidden": "true", style: { position: "relative", display: "block", height: 0, pointerEvents: "none" } },
    Array.from({ length: n }, (_, i) =>
      h(
        "span",
        {
          key: i,
          ref: (el: Element) => {
            const dx = (i - (n - 1) / 2) * 14 + ((i * 37) % 11) - 5;
            const a = (el as HTMLElement).animate?.(
              [
                { transform: "translate(0,0) scale(.6)", opacity: 0 },
                { transform: `translate(${dx * 0.4}px,-24px) scale(1.1)`, opacity: 1, offset: 0.25 },
                { transform: `translate(${dx}px,-${70 + ((i * 23) % 30)}px) scale(.9)`, opacity: 0 },
              ],
              { duration: still() ? 1 : 900 + ((i * 53) % 300), delay: i * 40, easing: "cubic-bezier(.2,0,0,1)", fill: "both" },
            );
            if (!a) (el as HTMLElement).style.opacity = "0";
          },
          style: { position: "absolute", left: "50%", bottom: 0, marginLeft: -10, fontSize: 20, lineHeight: 1, opacity: 0 },
        },
        p.emoji ?? "👍",
      ),
    ),
  );
}

/**
 * Wraps something that just changed: its background starts in the selected tint and fades out
 * over `ms` (default 1200) from `at`, a shared time such as `meta.time` kept in state.
 */
export function Changed(p: { at: number; ms?: number; children?: Child; radius?: number }) {
  const t = theme(), ms = p.ms ?? 1200, e = p.at ? running(p.at, ms) : null;
  return h("div", { style: { borderRadius: p.radius ?? t.radius.input, background: e === null ? undefined : mix(t.color.selected, t.color.card, e / ms) } }, p.children);
}

/** The plan is set: a quiet bar with a lock and a line ("Locked · 4 going"). Put it where the action button was. */
export function Locked(p: { children?: Child; detail?: Child }) {
  const t = theme(), c = t.color;
  return h(
    "div",
    { role: "status", style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, minHeight: 48, padding: "6px 12px", borderRadius: t.radius.card, background: c.selected } },
    h(
      "span",
      { "aria-hidden": "true", style: { flex: "none", width: 28, height: 28, borderRadius: "50%", background: c.primary, display: "flex", alignItems: "center", justifyContent: "center" } },
      h("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": "true", fill: "none", stroke: c.onPrimary, "stroke-width": 1.8, "stroke-linecap": "round" }, h("rect", { x: 2.5, y: 6, width: 9, height: 6.5, rx: 1.5, fill: c.onPrimary, stroke: "none" }), h("path", { d: "M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" })),
    ),
    h("div", { style: { minWidth: 0 } }, h("div", { style: { fontWeight: 600 } }, p.children), p.detail != null && h("small", { style: { display: "block" } }, p.detail)),
  );
}
