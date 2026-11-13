// Seat map: zones (sections, cars, tables) with claimable spots, and the people in them placed onto
// the picture. "arena" fans the zones around a stage in one or two tiers (a venue); "rows" draws each
// zone as a bar of round seats (cars, tables, bunks). Taps land on whole zones in an arena (the
// zone's own shape is the hit area) and on single seats in rows.

import { h, type Child } from "../h.ts";
import { userColor } from "../theme.ts";
import { Chip, More, Placed, Scene, at, circle, crowd, innerWidth, mix, path, pal, r2, rect, theme } from "./paint.ts";

export type Zone = { id: string; label: string; seats: (string | null)[] };

const D = Math.PI / 180;
type Box = { x0: number; y0: number; x1: number; y1: number };

/** Seat map. `selected` outlines a zone; the zone holding `me` fills with the primary color. */
export function SeatMap(p: {
  zones: Zone[];
  me: string;
  layout?: "arena" | "rows";
  stage?: string;
  selected?: string;
  onZone?: (id: string) => void;
  onSeat?: (zone: string, seat: number) => void;
  height?: number;
  label?: string;
}) {
  const t = theme(), c = t.color, pl = pal(t), W = innerWidth();
  const taken = p.zones.reduce((n, z) => n + z.seats.filter((s) => s !== null).length, 0);
  const total = p.zones.reduce((n, z) => n + z.seats.length, 0);
  const label = p.label ?? `Seat map: ${taken} of ${total} seats taken`;
  const mine = (z: Zone) => z.seats.includes(p.me);
  const fill = (z: Zone) => (mine(z) ? c.primary : z.id === p.selected ? c.selected : c.secondaryButton);
  const art: Child[] = [];
  const over: Child[] = [];
  const people: Child[] = [];

  if (p.layout === "rows") {
    const rowH = 44, H = p.height ?? p.zones.length * rowH + 4, lw = Math.min(110, W * 0.32);
    p.zones.forEach((z, i) => {
      // Seats shrink to fit a long row: radius and avatar size follow the spacing.
      const y = 2 + i * rowH, n = z.seats.length, gap = Math.min(44, (W - lw - 12) / Math.max(1, n));
      const sr = Math.max(5, Math.min(11, gap / 2 - 1.5)), av = Math.max(14, Math.min(24, Math.floor(gap - 3)));
      // Seats closer than a finger: the whole row is one control (take the first open seat, or leave yours).
      const crowded = gap < 44, cy = y + rowH / 2, myIdx = z.seats.indexOf(p.me), open = z.seats.indexOf(null);
      art.push(rect(lw - 4, y + 6, W - lw + 2, rowH - 12, 16, fill(z), z.id === p.selected && !mine(z) ? { stroke: c.primary, "stroke-width": 1.5 } : undefined));
      over.push(h("span", { key: "l" + z.id, style: { position: "absolute", left: 0, top: y, height: rowH, width: lw - 10, display: "flex", alignItems: "center", fontSize: t.type.meta, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, z.label));
      if (p.onSeat && crowded && (myIdx >= 0 || open >= 0))
        over.push(
          h("button", {
            key: "r" + z.id,
            type: "button",
            "aria-label": myIdx >= 0 ? `Leave your seat in ${z.label}` : `Take a seat in ${z.label}, ${z.seats.filter((s) => s === null).length} open`,
            onClick: () => p.onSeat!(z.id, myIdx >= 0 ? myIdx : open),
            style: { position: "absolute", left: `${r2(((lw - 4) / W) * 100)}%`, right: 0, top: y, height: rowH, borderRadius: 16 },
          }),
        );
      z.seats.forEach((who, k) => {
        const x = lw + 8 + gap * (k + 0.5);
        if (who === null) art.push(circle(x, cy, sr, "none", { stroke: mine(z) ? pl.on : c.secondaryText, "stroke-width": 1.5, "stroke-dasharray": "3 3" }));
        else people.push(h(Placed, { key: who + ":" + z.id + k, user: who, x: x / W, y: cy / H, size: av, me: p.me }));
        if (p.onSeat && !crowded && (who === null || who === p.me))
          over.push(
            h("button", {
              key: `b${z.id}:${k}`,
              type: "button",
              "aria-label": who === null ? `Take seat ${k + 1} in ${z.label}` : `Leave your seat in ${z.label}`,
              onClick: () => p.onSeat!(z.id, k),
              style: at(Math.max(22, Math.min(W - 22, x)) / W, cy / H, { width: 44, height: 44, borderRadius: "50%" }),
            }),
          );
      });
    });
    return h(Scene, { height: H, label, art, children: [...over, ...people] });
  }

  // Arena: zones on one or two arcs under the stage.
  const H = p.height ?? 196, cy = 16, n = p.zones.length;
  const a0 = 14, a1 = 166;
  const R = Math.min(H - cy - 6, (W / 2 - 4) / Math.cos(a0 * D));
  const tiers = n <= 4 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)];
  const bands = tiers.length === 1 ? [[0.38, 1]] : [[0.3, 0.63], [0.67, 1]];
  const cx = W / 2;
  const pt = (r: number, a: number) => [cx + r * Math.cos(a * D), cy + r * Math.sin(a * D)] as const;
  art.push(path(`M${r2(cx - R * 0.24)} ${cy} A${r2(R * 0.24)} ${r2(R * 0.24)} 0 0 0 ${r2(cx + R * 0.24)} ${cy} Z`, c.input));
  let idx = 0;
  tiers.forEach((k, ti) => {
    const [f0, f1] = bands[ti]!, ri = R * f0!, ro = R * f1!, span = (a1 - a0) / k;
    for (let j = 0; j < k; j++) {
      const z = p.zones[idx++]!;
      const s = a1 - (j + 1) * span + 1.4, e = a1 - j * span - 1.4;
      const [ox, oy] = pt(ro, s), [ex, ey] = pt(ro, e), [ix, iy] = pt(ri, e), [jx, jy] = pt(ri, s);
      const on = mine(z);
      art.push(
        path(`M${r2(ox)} ${r2(oy)} A${r2(ro)} ${r2(ro)} 0 0 1 ${r2(ex)} ${r2(ey)} L${r2(ix)} ${r2(iy)} A${r2(ri)} ${r2(ri)} 0 0 0 ${r2(jx)} ${r2(jy)} Z`, fill(z), {
          "stroke-linejoin": "round",
          ...(z.id === p.selected && !on ? { stroke: c.primary, "stroke-width": 1.5 } : {}),
        }),
      );
      // A texture of seats across the zone (the venue's other seats), lighter where the group sits.
      const dot = on ? mix(c.primary, c.onPrimary, 0.35) : pl.shade;
      for (let rr = ri + 6; rr < ro - 3; rr += 8.5) {
        const step = 9.5 / (rr * D), m = Math.floor((e - s - 2) / step);
        for (let q = 0; q <= m; q++) {
          const [x, y] = pt(rr, s + 1 + (e - s - 2 - m * step) / 2 + q * step);
          art.push(circle(x, y, 1.5, dot));
        }
      }
      // The zone's label and its people, at the zone's middle.
      const mid = (s + e) / 2, rm = (ri + ro) / 2, [mx, my] = pt(rm, mid);
      const holders = z.seats.filter((x): x is string => x !== null);
      const pts = Array.from({ length: 9 }, (_, i) => pt(i < 5 ? ro : ri, i < 5 ? s + ((e - s) * i) / 4 : e - ((e - s) * (i - 5)) / 3));
      const box: Box = { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
      const ly = holders.length ? my - 9 : my;
      const chip = h(Chip, { tone: "card", maxWidth: Math.max(28, Math.min(bw - 6, 84, 1.6 * rm * Math.sin(((e - s) / 2) * D))), style: { background: fill(z), color: on ? c.onPrimary : c.text, padding: "0 4px" } }, z.label);
      const open = z.seats.filter((x) => x === null).length;
      if (p.onZone)
        over.push(
          h(
            "button",
            {
              key: "z" + z.id,
              type: "button",
              "aria-label": `${z.label}, ${open} open${on ? ", you're here" : ""}`,
              "aria-pressed": z.id === p.selected,
              onClick: () => p.onZone!(z.id),
              style: {
                position: "absolute",
                left: `${r2((box.x0 / W) * 100)}%`,
                top: `${r2((box.y0 / H) * 100)}%`,
                width: `${r2((bw / W) * 100)}%`,
                height: `${r2((bh / H) * 100)}%`,
                minWidth: 44,
                minHeight: 44,
                clipPath: `polygon(${pts.map(([x, y]) => `${r2(((x - box.x0) / bw) * 100)}% ${r2(((y - box.y0) / bh) * 100)}%`).join(",")})`,
              },
            },
            h("span", { style: at((mx - box.x0) / bw, (ly - box.y0) / bh, { display: "flex" }) }, chip),
          ),
        );
      else over.push(h("span", { key: "z" + z.id, style: at(mx / W, ly / H, { display: "flex" }) }, chip));
      const { shown, extra } = crowd(holders, 3);
      const wide = 18 + 13 * (shown.length - 1) + (extra ? 30 : 0), x0 = mx - wide / 2 + 9;
      shown.forEach((u, i) => people.push(h(Placed, { key: u, user: u, x: (x0 + i * 13) / W, y: (my + 9) / H, size: 18, me: p.me })));
      if (extra) over.push(h("span", { key: "m" + z.id, style: at((x0 + (shown.length - 1) * 13 + 25) / W, (my + 9) / H, { display: "flex" }) }, h(More, { n: extra, size: 18 })));
    }
  });
  return h(
    Scene,
    { height: H, label, art },
    h("span", { style: at(0.5, cy / H, { display: "flex" }) }, h(Chip, { style: { background: c.text, color: c.card, padding: "2px 14px" } }, p.stage ?? "Stage")),
    over,
    people,
  );
}
