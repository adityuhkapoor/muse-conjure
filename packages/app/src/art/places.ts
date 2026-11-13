// Pictures of where people are: a map strip with pins and a route, and dot clusters (members by
// group). Streets, water and dot scatter come from a seed, so a picture never changes between renders.

import { h, type Child } from "../h.ts";
import { userColor } from "../theme.ts";
import { Chip, More, Placed, Scene, at, circle, crowd, ellipse, innerWidth, line, mix, pal, path, r2, rand, readable, rect, theme } from "./paint.ts";
import { textWidth } from "./text.ts";

export type Pin = { id: string; x: number; y: number; label?: string; user?: string; n?: number };

/**
 * A simple map: blocks, a river, a park, then pins at (x, y) as fractions of the strip. A pin shows
 * a person (`user`), a number (`n`) or a dot, with an optional label chip. `route` joins the pins
 * in order with a dashed line.
 */
export function MapStrip(p: { pins: Pin[]; label: string; me?: string; route?: boolean; height?: number; seed?: string | number }) {
  const t = theme(), c = t.color, pl = pal(t), W = innerWidth(), H = p.height ?? 150, r = rand(p.seed ?? "map");
  const land = mix(c.input, c.card, 0.2);
  const art: Child[] = [rect(0, 0, W, H, 0, land)];
  const wy = H * (0.25 + r.next() * 0.5);
  art.push(path(`M0 ${r2(wy)} C${r2(W * 0.3)} ${r2(wy - 24)} ${r2(W * 0.6)} ${r2(wy + 24)} ${W} ${r2(wy - 8)}`, "none", { stroke: pl.sky, "stroke-width": 16 }));
  for (let x = 18 + r.int(20); x < W; x += 46 + r.int(24)) art.push(line(x, 0, x + r.int(30) - 15, H, c.card, 4));
  for (let y = 20 + r.int(20); y < H; y += 40 + r.int(20)) art.push(line(0, y, W, y + r.int(20) - 10, c.card, 3));
  art.push(circle(W * (0.15 + r.next() * 0.7), H * (0.2 + r.next() * 0.6), 18 + r.int(10), pl.grass, { opacity: 0.8 }));
  const xy = (q: Pin) => [Math.max(14, Math.min(W - 14, q.x * W)), Math.max(30, Math.min(H - 8, q.y * H))] as const;
  if (p.route && p.pins.length > 1) art.push(path(p.pins.map((q, i) => `${i ? "L" : "M"}${r2(xy(q)[0])} ${r2(xy(q)[1] - 14)}`).join(" "), "none", { stroke: c.primary, "stroke-width": 3, "stroke-dasharray": "2 6", "stroke-linecap": "round" }));
  const over: Child[] = [];
  const labels: { x0: number; x1: number; y0: number; y1: number }[] = [];
  p.pins.forEach((q, i) => {
    const [x, y] = xy(q), mine = q.user === p.me, col = q.user ? (mine ? c.primary : userColor(q.user, t)) : c.primary;
    art.push(path(`M${r2(x)} ${r2(y)} l-7 -11 a10 10 0 1 1 14 0 Z`, col, { stroke: c.card, "stroke-width": 1.5 }));
    const head = (y - 18) / H;
    if (q.user) over.push(h(Placed, { key: q.user + i, user: q.user, x: x / W, y: head, size: 18, me: p.me }));
    else over.push(h("span", { key: "n" + i, style: at(x / W, head, { color: readable(col), fontSize: 11, fontWeight: 700, lineHeight: 1 }) }, q.n != null ? String(q.n) : ""));
    // The label slides from left-aligned at the left edge to right-aligned at the right one, so it
    // never leaves the strip whatever its width. A label that would cover an earlier one is left out.
    const lw = Math.min(110, W - 8, textWidth(q.label ?? "", 12, 600) + 14), ly = Math.min(H - 10, y + 10);
    const box = { x0: x - lw * (x / W), x1: x - lw * (x / W) + lw, y0: ly - 10, y1: ly + 10 };
    const free = !labels.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1);
    if (q.label && free) labels.push(box);
    if (q.label && free) over.push(h("span", { key: "l" + i, style: at(x / W, Math.min(H - 10, y + 10) / H, { display: "flex", transform: `translate(-${r2((x / W) * 100)}%,-50%)` }) }, h(Chip, { tone: "card", maxWidth: Math.min(110, W - 8) }, q.label)));
  });
  return h(Scene, { height: H, label: p.label, art }, over);
}

/**
 * Members by group as clusters of dots (one dot per `per` people when `count` is large), each
 * cluster labeled, the chat's own people placed in theirs. Up to 6 groups.
 */
export function Clusters(p: { groups: { id: string; label: string; users: string[]; count?: number }[]; me?: string; label: string; height?: number; per?: number }) {
  const t = theme(), c = t.color, W = innerWidth(), H = p.height ?? 190;
  const g = p.groups.slice(0, 6), cols = g.length <= 2 ? g.length : g.length <= 4 ? 2 : 3, rows = Math.ceil(g.length / Math.max(1, cols));
  const art: Child[] = [];
  const over: Child[] = [];
  const hues = [c.series1, c.series3, c.series4, c.series5, c.series6, c.series2];
  g.forEach((grp, i) => {
    const cx = (W / cols) * ((i % cols) + 0.5), cy = (H / rows) * (Math.floor(i / cols) + 0.5) + 8;
    const rad = Math.min(W / cols, H / rows) * 0.36, r = rand(grp.id);
    const dots = Math.min(70, Math.max(grp.users.length, Math.round((grp.count ?? grp.users.length) / (p.per ?? 1))));
    // A soft disc under each crowd, so a small group still reads as a place.
    art.push(ellipse(cx, cy, rad + 6, (rad + 6) * 0.8, mix(hues[i % 6]!, c.input, 0.82)));
    for (let k = 0; k < dots; k++) {
      const a = r.next() * 6.283, d = rad * Math.sqrt(r.next());
      art.push(circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 2.2, hues[i % 6]!, { opacity: 0.35 + r.next() * 0.5 }));
    }
    over.push(h("span", { key: "l" + grp.id, style: at(cx / W, Math.max(10, cy - rad * 0.8 - 12) / H, { display: "flex" }) }, h(Chip, { tone: "card", maxWidth: W / cols - 8 }, `${grp.label} · ${grp.count ?? grp.users.length}`)));
    const { shown, extra } = crowd(grp.users, 4);
    shown.forEach((u, k) => {
      const a = k * 2.4 + 0.6, d = rad * 0.45;
      over.push(h(Placed, { key: u, user: u, x: (cx + Math.cos(a) * d) / W, y: (cy + Math.sin(a) * d * 0.8) / H, size: 20, me: p.me }));
    });
    if (extra) over.push(h("span", { key: "m" + grp.id, style: at((cx + rad * 0.6) / W, (cy + rad * 0.6) / H, { display: "flex" }) }, h(More, { n: extra, size: 20 })));
  });
  return h(Scene, { height: H, label: p.label, art, bg: c.input }, over);
}
