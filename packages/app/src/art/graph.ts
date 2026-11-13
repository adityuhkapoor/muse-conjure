// Node-and-arrow graph of people: IOUs, draft picks, bracket rounds. At t = 0 the people sit on a
// ring with curved `threads` between them (the tangle); as t goes to 1 they move to their `side`
// and straight `edges` grow in (the clean result). The caller drives t from shared state, for
// example `tween(...)(running(state.at, 1400) ?? 1400)`, so every phone animates the same way.

import { h, type Child } from "../h.ts";
import { memberOf } from "../ctx.ts";
import { userColor } from "../theme.ts";
import { Chip, Placed, Scene, at, innerWidth, path, r2, theme } from "./paint.ts";
import { textWidth } from "./text.ts";

export type Thread = { from: string; to: string; label?: string };
export type Edge = { from: string; to: string; label?: string; done?: boolean };
type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const chipBox = (x: number, y: number, text: string): Box => {
  const w = textWidth(text, 12, 600) + 16;
  return { x0: x - w / 2, y0: y - 10, x1: x + w / 2, y1: y + 10 };
};
const arrow = (x: number, y: number, ux: number, uy: number, s: number) =>
  `M${r2(x)} ${r2(y)} L${r2(x - ux * s - uy * s * 0.55)} ${r2(y - uy * s + ux * s * 0.55)} L${r2(x - ux * s + uy * s * 0.55)} ${r2(y - uy * s - ux * s * 0.55)} Z`;

export function Graph(p: {
  nodes: string[];
  me: string;
  label: string;
  threads?: Thread[];
  edges?: Edge[];
  t?: number;
  side?: ((id: string) => number) | undefined;
  onEdge?: (i: number) => void;
  /** Which arrows take a tap (default: every arrow not done). */
  tappable?: (e: Edge, i: number) => boolean;
  edgeName?: (e: Edge, i: number) => string;
  height?: number;
}) {
  const th = theme(), c = th.color, W = innerWidth(), H = p.height ?? 210;
  const t = Math.max(0, Math.min(1, p.t ?? 0)), n = Math.max(1, p.nodes.length);
  const big = n <= 8, size = big ? 30 : 24, rad = size / 2 + 3, named = n <= 8;
  // Ring positions, then side positions (left column, right column, middle).
  const ring = new Map<string, Pt>();
  p.nodes.forEach((u, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    ring.set(u, { x: W / 2 + (W / 2 - 30) * Math.cos(a), y: H / 2 - 6 + (H / 2 - 26) * Math.sin(a) });
  });
  const sideOf = new Map<string, Pt>();
  if (p.side) {
    const cols: Record<number, string[]> = { [-1]: [], 0: [], 1: [] };
    for (const u of p.nodes) cols[Math.sign(p.side(u))]!.push(u);
    // Order the left column by where its arrows land on the right, so arrows cross less.
    const rank = (u: string) => {
      const to = (p.edges ?? []).filter((e) => e.from === u || e.to === u).map((e) => cols[1]!.indexOf(e.from === u ? e.to : e.from)).filter((i) => i >= 0);
      return to.length ? to.reduce((a, b) => a + b, 0) / to.length : 99;
    };
    cols[-1] = cols[-1]!.map((u, i) => ({ u, r: rank(u), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.u);
    for (const k of [-1, 0, 1]) {
      const list = cols[k]!, m = list.length;
      list.forEach((u, i) => {
        const y = m === 1 ? H / 2 - 6 : 22 + ((H - 58) * i) / (m - 1);
        const zig = m > 5 ? (i % 2 ? 14 : -14) * Math.sign(k) : 0;
        sideOf.set(u, k === 0 ? { x: W / 2 + (i - (m - 1) / 2) * 34, y: H - 22 } : { x: (k < 0 ? 0.26 : 0.74) * W + zig, y });
      });
    }
  }
  const pos = (u: string): Pt => {
    const a = ring.get(u) ?? { x: W / 2, y: H / 2 }, b = sideOf.get(u) ?? a;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const taken: Box[] = p.nodes.map((u) => {
    const q = pos(u);
    const k = p.side && t > 0.5 ? Math.sign(p.side(u)) : 0;
    return k ? { x0: k < 0 ? 0 : q.x - rad, y0: q.y - rad, x1: k < 0 ? q.x + rad : W, y1: q.y + rad } : { x0: q.x - rad, y0: q.y - rad, x1: q.x + rad, y1: q.y + rad + (named ? 16 : 0) };
  });
  // A label takes its chip's room, or 44 x 44 when it is also the arrow's tap target.
  const place = (x: number, y: number, text: string, tap = false) => {
    const c0 = chipBox(x, y, text), b = tap ? { x0: Math.min(c0.x0, x - 22), y0: Math.min(c0.y0, y - 22), x1: Math.max(c0.x1, x + 22), y1: Math.max(c0.y1, y + 22) } : c0;
    if (b.x0 < 0 || b.x1 > W || b.y0 < 0 || b.y1 > H || taken.some((o) => hit(o, b))) return false;
    taken.push(b);
    return true;
  };

  const art: Child[] = [];
  const over: Child[] = [];
  // The tangle fades as the clean arrows come in.
  if (t < 1)
    (p.threads ?? []).forEach((e, k) => {
      const a = pos(e.from), b = pos(e.to);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const bend = (((k * 7) % 5) - 2) * 14 + 22;
      const mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
      const col = userColor(e.to, th);
      const ex = b.x - ux * rad, ey = b.y - uy * rad;
      const op = r2((n > 8 ? 0.55 : 0.85) * (1 - t));
      art.push(path(`M${r2(a.x + ux * rad)} ${r2(a.y + uy * rad)} Q${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`, "none", { stroke: col, "stroke-width": 2, opacity: op, "stroke-linecap": "round" }));
      const vx = ex - mx, vy = ey - my, vl = Math.hypot(vx, vy) || 1;
      art.push(path(arrow(ex, ey, vx / vl, vy / vl, 7), col, { opacity: op }));
      const lx = (a.x + 2 * mx + b.x) / 4, ly = (a.y + 2 * my + b.y) / 4;
      if (e.label && t < 0.05 && place(lx, ly, e.label))
        over.push(h("span", { key: "t" + k, style: at(lx / W, ly / H, { display: "flex" }) }, h(Chip, { tone: "card", style: { boxShadow: `inset 0 0 0 1.5px ${col}` } }, e.label)));
    });
  // Clean arrows grow from payer to payee, one after another.
  const edges = p.edges ?? [];
  edges.forEach((e, k) => {
    const grow = edges.length ? Math.max(0, Math.min(1, t * (edges.length + 1) - k * 0.6)) : 0;
    if (grow <= 0) return;
    const a = pos(e.from), b = pos(e.to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const sx = a.x + ux * rad, sy = a.y + uy * rad, ex = sx + (len - 2 * rad) * grow * ux, ey = sy + (len - 2 * rad) * grow * uy;
    const mine = e.from === p.me || e.to === p.me;
    const col = e.done ? c.positive : mine ? c.primary : c.secondaryText;
    art.push(path(`M${r2(sx)} ${r2(sy)} L${r2(ex)} ${r2(ey)}`, "none", { stroke: col, "stroke-width": mine ? 3.5 : 2.5, "stroke-linecap": "round", ...(e.done ? { "stroke-dasharray": "5 6" } : {}) }));
    art.push(path(arrow(ex + ux * 2, ey + uy * 2, ux, uy, 9), col));
    if (!e.label || grow < 1) return;
    const spots = [0.5, 0.38, 0.62, 0.28, 0.72];
    const tap = !!p.onEdge && !e.done && (p.tappable?.(e, k) ?? true);
    const f = spots.find((s) => place(sx + (ex - sx) * s, sy + (ey - sy) * s, e.label!, tap));
    if (f === undefined) return;
    const lx = sx + (ex - sx) * f, ly = sy + (ey - sy) * f;
    const chip = h(Chip, { tone: e.done ? "positive" : mine ? "primary" : "card", style: e.done || mine ? undefined : { boxShadow: `inset 0 0 0 1.5px ${c.divider}` } }, e.done ? `✓ ${e.label}` : e.label);
    over.push(
      p.onEdge && !e.done && (p.tappable?.(e, k) ?? true)
        ? h("button", { key: "e" + k, type: "button", "aria-label": p.edgeName?.(e, k) ?? e.label, onClick: () => p.onEdge!(k), style: at(lx / W, ly / H, { minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }) }, chip)
        : h("span", { key: "e" + k, style: at(lx / W, ly / H, { display: "flex" }) }, chip),
    );
  });
  const people = p.nodes.map((u) => {
    const q = pos(u);
    return h(Placed, { key: u, user: u, x: q.x / W, y: q.y / H, size, me: p.me, move: t <= 0 || t >= 1 });
  });
  // In columns, names sit outside the column (left of the left one, right of the right one).
  const beside = (u: string, q: Pt) => {
    const k = p.side && t > 0.5 ? Math.sign(p.side(u)) : 0;
    if (!k) return null;
    const edge = k < 0 ? q.x - size / 2 - 4 : q.x + size / 2 + 4;
    return {
      position: "absolute", top: `${r2(((q.y - 7) / H) * 100)}%`, maxWidth: k < 0 ? edge : W - edge,
      ...(k < 0 ? { right: `${r2(((W - edge) / W) * 100)}%`, textAlign: "right" } : { left: `${r2((edge / W) * 100)}%` }),
      fontSize: 12, lineHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 3px", borderRadius: 4, background: c.card,
      color: u === p.me ? c.link : c.secondaryText, fontWeight: u === p.me ? 600 : 400,
    };
  };
  const names = named
    ? p.nodes.map((u) => {
        const q = pos(u);
        return h(
          "span",
          { key: "n" + u, style: beside(u, q) ?? at(q.x / W, (q.y + size / 2 + 10) / H, { fontSize: 12, lineHeight: "14px", whiteSpace: "nowrap", padding: "0 3px", borderRadius: 4, background: c.card, color: u === p.me ? c.link : c.secondaryText, fontWeight: u === p.me ? 600 : 400 }) },
          u === p.me ? "You" : memberOf(u).name,
        );
      })
    : [];
  return h(Scene, { height: H, label: p.label, art }, over, names, people);
}
