// Frames that make content look like the object it is: a ticket or pass with a tear line, a
// receipt with a torn edge, a playing card, bingo cells. Real CSS backgrounds, so the gate's
// contrast check reads the true colors behind the text.

import { h, type Child } from "../h.ts";
import { Avatar } from "../components.ts";
import { crowd, mix, path, theme } from "./paint.ts";

/** A ticket or pass: main part, a dashed tear line with notches, and a stub. `locked` tints it. */
export function Ticket(p: { children?: Child; stub?: Child; locked?: boolean; label?: string }) {
  const t = theme(), c = t.color, bg = p.locked ? c.selected : c.input;
  const notch = (side: "top" | "bottom") => h("i", { style: { position: "absolute", [side]: -8, left: -8, width: 16, height: 16, borderRadius: "50%", background: c.card } });
  return h(
    "div",
    { role: p.label ? "group" : undefined, "aria-label": p.label, style: { display: "flex", minWidth: 0, borderRadius: t.radius.card, background: bg, boxShadow: p.locked ? `inset 0 0 0 1.5px ${c.primary}` : undefined, overflow: "hidden" } },
    h("div", { style: { flex: 1, minWidth: 0, padding: 12 } }, p.children),
    p.stub != null &&
      h(
        "div",
        { style: { position: "relative", flex: "none", minWidth: 76, padding: "12px 10px", borderLeft: `2px dashed ${c.divider}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, textAlign: "center" } },
        notch("top"),
        notch("bottom"),
        p.stub,
      ),
  );
}

/** A receipt: lines of label and amount, a total, and a torn bottom edge. Amounts are strings you format. */
export function Receipt(p: { title?: Child; lines: [Child, string][]; total?: [Child, string] }) {
  const t = theme(), c = t.color;
  const row = (l: Child, a: string, strong: boolean, k: number | string) =>
    h("div", { key: k, style: { display: "flex", gap: 8, fontWeight: strong ? 600 : 400, fontVariantNumeric: "tabular-nums" } }, h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l), h("span", { style: { flex: "none" } }, a));
  const teeth = Array.from({ length: 24 }, (_, i) => `L${i * 10 + 5} 8 L${i * 10 + 10} 0`).join(" ");
  return h(
    "div",
    { style: { minWidth: 0 } },
    h(
      "div",
      { style: { background: c.input, borderRadius: `${t.radius.card}px ${t.radius.card}px 0 0`, padding: "12px 12px 6px", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 4 } },
      p.title != null && h("small", { style: { textAlign: "center", marginBottom: 4 } }, p.title),
      p.lines.map(([l, a], i) => row(l, a, false, i)),
      p.total && h("div", { style: { borderTop: `1px dashed ${c.divider}`, marginTop: 4, paddingTop: 6 } }, row(p.total[0], p.total[1], true, "t")),
    ),
    h("svg", { viewBox: "0 0 240 8", width: "100%", height: 8, preserveAspectRatio: "none", "aria-hidden": "true", style: { display: "block" } }, path(`M0 0 ${teeth} L240 0 Z`, c.input)),
  );
}

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
/** A playing card. `suit` is s, h, d or c; `down` shows the back. */
export function PlayingCard(p: { rank: string; suit: keyof typeof SUITS; down?: boolean; size?: number }) {
  const t = theme(), c = t.color, w = p.size ?? 44, red = p.suit === "h" || p.suit === "d";
  const name = p.down ? "Face-down card" : `${p.rank} of ${{ s: "spades", h: "hearts", d: "diamonds", c: "clubs" }[p.suit]}`;
  return h(
    "span",
    {
      role: "img",
      "aria-label": name,
      style: {
        display: "inline-flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flex: "none",
        width: w,
        height: Math.round(w * 1.4),
        padding: 4,
        borderRadius: 6,
        background: p.down ? c.primary : c.card,
        backgroundImage: p.down ? `repeating-linear-gradient(45deg,${mix(c.primary, c.onPrimary, 0.25)} 0 3px,transparent 3px 7px)` : undefined,
        boxShadow: `inset 0 0 0 1px ${c.divider}`,
        color: red ? c.negative : c.text,
        fontWeight: 700,
        fontSize: Math.round(w * 0.3),
        lineHeight: 1,
      },
    },
    p.down ? null : [h("span", { key: "a" }, p.rank), h("span", { key: "b", style: { alignSelf: "flex-end", fontSize: Math.round(w * 0.42) } }, SUITS[p.suit])],
  );
}

/** A bingo card: cells in a grid; marked cells turn selected with the markers' faces; one may be free. */
export function BingoGrid(p: { cells: { id: string; label: string; marked?: boolean; users?: string[]; free?: boolean }[]; cols?: number; me?: string; onCell?: (id: string) => void }) {
  const t = theme(), c = t.color, cols = p.cols ?? 4;
  return h(
    "div",
    { style: { display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 4, minWidth: 0 } },
    p.cells.map((x) => {
      const on = !!x.marked || !!x.free;
      const mine = !!p.me && !!x.users?.includes(p.me);
      const kids = [
        h("span", { key: "t", style: { fontSize: 12, lineHeight: "15px", fontWeight: on ? 600 : 400, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" } }, x.free ? "Free" : x.label),
        x.users?.length
          ? h("span", { key: "u", "aria-hidden": "true", style: { position: "absolute", top: 3, left: 3, display: "flex" } }, crowd(x.users, 3).shown.map((u, k) => h("span", { key: u, style: { marginLeft: k ? -4 : 0, display: "flex" } }, h(Avatar, { user: u, size: 12 }))))
          : null,
      ];
      const style = {
        position: "relative",
        minHeight: 52,
        padding: "14px 4px 4px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: on ? c.selected : c.input,
        color: on ? c.link : c.text,
        boxShadow: mine ? `inset 0 0 0 1.5px ${c.primary}` : undefined,
      };
      return p.onCell && !x.free
        ? h("button", { key: x.id, type: "button", "aria-pressed": on, "aria-label": `${x.label}${on ? ", marked" : ""}`, onClick: () => p.onCell!(x.id), style }, kids)
        : h("div", { key: x.id, style }, kids);
    }),
  );
}
