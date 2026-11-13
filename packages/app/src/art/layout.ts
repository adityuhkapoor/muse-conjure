// Layout helpers that keep a rich card inside the chat's height budget: a two-column summary, a
// section that is collapsed at rest and opens on tap, and a horizontal strip that snaps.

import { h, type Child } from "../h.ts";
import { ink, theme } from "./paint.ts";

/** Wash panel: the big fact on the left (title, detail, a colored note), a picture or action on the right. */
export function Summary(p: { title: Child; detail?: Child; note?: Child; tone?: "positive" | "negative" | "secondary"; aside?: Child }) {
  const t = theme(), c = t.color;
  const tone = p.tone === "negative" ? c.negative : p.tone === "positive" ? c.positive : c.secondaryText;
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 12, minWidth: 0, padding: "10px 12px", borderRadius: t.radius.card, background: c.input } },
    h(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      h("div", { style: { fontSize: t.type.headline, lineHeight: "24px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.title),
      p.detail != null && h("div", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.detail),
      p.note != null && h("small", { style: { display: "block", color: ink(tone, c.input), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.note),
    ),
    p.aside != null && h("div", { style: { flex: "none", display: "flex", alignItems: "center" } }, p.aside),
  );
}

/** A section that shows its title and a one-line summary at rest and its children when open. Keep `open` in local. */
export function Expand(p: { title: Child; summary?: Child; open: boolean; onToggle: () => void; children?: Child }) {
  const t = theme(), c = t.color;
  return h(
    "div",
    { style: { minWidth: 0 } },
    h(
      "button",
      { type: "button", "aria-expanded": p.open, onClick: p.onToggle, style: { display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, textAlign: "left" } },
      h("span", { style: { flex: 1, minWidth: 0 } }, h("b", { style: { display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.title), !p.open && p.summary != null && h("small", { style: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.summary)),
      h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": "true", fill: "none", stroke: c.secondaryText, "stroke-width": 1.8, "stroke-linecap": "round", style: { transform: p.open ? "rotate(180deg)" : undefined, transition: "transform .2s" } }, h("path", { d: "M2.5 4.5 6 8l3.5-3.5" })),
    ),
    p.open ? h("div", { style: { paddingBottom: 4 } }, p.children) : null,
  );
}

/** A horizontal strip that scrolls and snaps item by item. Give items a fixed width; text in them should end in an ellipsis. */
export function Strip(p: { label: string; children?: Child; gap?: number }) {
  return h(
    "div",
    { role: "group", "aria-label": p.label, tabIndex: 0, style: { display: "flex", gap: p.gap ?? 8, minWidth: 0, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 -12px", padding: "0 12px", scrollPaddingLeft: 12 } },
    p.children,
  );
}
