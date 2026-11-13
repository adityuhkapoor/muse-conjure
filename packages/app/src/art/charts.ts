// Small data pictures: ring, meter, sparkline, stars, avatar bars, timeline, calendar strip and
// heat grid. Each names itself for screen readers; numbers next to them stay real text.

import type { Member } from "@muse/protocol";
import { h, type Child } from "../h.ts";
import { Avatar } from "../components.ts";
import { memberOf } from "../ctx.ts";
import { circle, crowd, mix, More, path, r2, svg, theme } from "./paint.ts";
import { fitText } from "./text.ts";

type U = string | Member;
const idOf = (u: U) => (typeof u === "string" ? u : u.id);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Progress ring with whatever you put in the middle (a count, an avatar). */
export function Ring(p: { value: number; max: number; size?: number; label: string; children?: Child; tone?: "primary" | "positive" }) {
  const t = theme(), s = p.size ?? 64, w = Math.max(4, s / 10), r = (s - w) / 2, f = p.max > 0 ? clamp(p.value / p.max) : 0, len = 2 * Math.PI * r;
  return h(
    "div",
    { style: { position: "relative", width: s, height: s, flex: "none" } },
    svg(s, s, p.label, [
      circle(s / 2, s / 2, r, "none", { stroke: t.color.track, "stroke-width": w }),
      circle(s / 2, s / 2, r, "none", { stroke: t.color[p.tone ?? "primary"], "stroke-width": w, "stroke-linecap": "round", "stroke-dasharray": `${r2(len * f)} ${r2(len)}`, transform: `rotate(-90 ${s / 2} ${s / 2})` }),
    ]),
    p.children != null && middle(p.children, s - 2 * w - 4),
  );
}

// Strings and numbers in a ring's hole shrink to fit it (down to 10 px), then end in "…".
function middle(kids: Child, room: number) {
  const words = typeof kids === "string" || typeof kids === "number";
  const f = words ? fitText(String(kids), room, { size: Math.min(theme().type.title, Math.round(room / 2)), weight: 600 }) : null;
  return h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, whiteSpace: "nowrap", ...(f ? { fontSize: f.size } : {}) } }, f ? f.text : kids);
}

/** A level on a track with named stops under it ("Chill", "Soon", "Now"); the knob shows `value`. */
export function Meter(p: { value: number; max: number; label: string; stops?: string[] }) {
  const t = theme(), c = t.color, f = p.max > 0 ? clamp(p.value / p.max) : 0;
  return h(
    "div",
    { role: "img", "aria-label": p.label, style: { display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 4, minWidth: 0 } },
    h(
      "div",
      { style: { position: "relative", height: 10, borderRadius: 5, background: c.track } },
      h("div", { style: { width: `${f * 100}%`, height: "100%", borderRadius: 5, background: f > 0.75 ? c.negative : c.primary, transition: "width .4s" } }),
      h("span", { style: { position: "absolute", top: -4, left: `calc((100% - 18px) * ${r2(f)})`, width: 18, height: 18, borderRadius: "50%", background: c.card, boxShadow: `0 0 0 3px ${f > 0.75 ? c.negative : c.primary}`, transition: "left .4s" } }),
    ),
    p.stops?.length ? h("div", { "aria-hidden": "true", style: { display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: "16px", color: c.secondaryText } }, p.stops.map((s, i) => h("span", { key: i }, s))) : null,
  );
}

/** A line of values with a soft fill under it and a dot on the latest. */
export function Sparkline(p: { values: number[]; label: string; width?: number; height?: number }) {
  const t = theme(), c = t.color, w = p.width ?? 120, ht = p.height ?? 36, v = p.values.length ? p.values : [0];
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((y, i) => [3 + ((w - 6) * i) / Math.max(1, v.length - 1), 4 + (ht - 8) * (1 - (y - lo) / span)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${r2(x)} ${r2(y)}`).join(" ");
  const [ex, ey] = pts[pts.length - 1]!;
  return h(
    "div",
    { style: { width: w, height: ht, flex: "none" } },
    svg(w, ht, p.label, [path(`${d} L${r2(ex)} ${ht} L3 ${ht} Z`, mix(c.primary, c.card, 0.85)), path(d, "none", { stroke: c.primary, "stroke-width": 2, "stroke-linejoin": "round" }), circle(ex, ey, 3.5, c.primary, { stroke: c.card, "stroke-width": 1.5 })]),
  );
}

const STAR = "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z";
/** Star rating, display only. `value` may be fractional (4.3). */
export function Stars(p: { value: number; of?: number; size?: number; label?: string }) {
  const t = theme(), n = p.of ?? 5, s = p.size ?? 14, v = Math.max(0, Math.min(n, p.value));
  return h(
    "span",
    { style: { display: "inline-flex", gap: 1, flex: "none", width: n * (s + 1), height: s } },
    svg(n * 25, 24, p.label ?? `${Math.round(v * 10) / 10} of ${n} stars`, Array.from({ length: n }, (_, i) => {
      const f = clamp(v - i);
      return h("g", { key: i, transform: `translate(${i * 25} 0)` }, path(STAR, t.color.track), f > 0 && h("svg", { width: r2(24 * f), height: 24, viewBox: `0 0 ${r2(24 * f)} 24` }, path(STAR, t.color.series2)));
    })),
  );
}

/** One row per option: label, then the faces of who picked it inside a bar as long as their count. */
export function AvatarBars(p: { bars: { id: string; label: Child; users: U[]; note?: Child }[]; me?: string; max?: number }) {
  const t = theme(), c = t.color, max = Math.max(1, p.max ?? Math.max(...p.bars.map((b) => b.users.length), 1));
  return h(
    "div",
    { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8, minWidth: 0 } },
    p.bars.map((b) => {
      const mineBar = !!p.me && b.users.some((u) => idOf(u) === p.me);
      const { shown, extra } = crowd(b.users, 5);
      return h(
        "div",
        { key: b.id, style: { display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 4, minWidth: 0 } },
        h("div", { style: { display: "flex", gap: 8, fontSize: t.type.meta, lineHeight: "16px" } }, h("b", { style: { flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, b.label), h("span", { style: { flex: "none", color: c.secondaryText } }, b.note ?? String(b.users.length))),
        h(
          "div",
          { "aria-label": `${b.users.length}: ${b.users.map((u) => memberOf(u).name).join(", ")}`, role: "img", style: { height: 28, borderRadius: 14, background: c.track, overflow: "hidden" } },
          h(
            "div",
            { style: { width: `${Math.max(b.users.length ? 12 : 0, (b.users.length / max) * 100)}%`, minWidth: b.users.length ? 4 + shown.length * 26 + (extra > 0 ? 28 : 0) : 0, maxWidth: "100%", height: "100%", borderRadius: 14, background: mineBar ? c.primary : mix(c.primary, c.card, 0.7), display: "flex", alignItems: "center", gap: 2, padding: "0 2px", transition: "width .4s" } },
            shown.map((u) => h(Avatar, { key: idOf(u), user: u, size: 24 })),
            extra > 0 && h(More, { n: extra, size: 24 }),
          ),
        ),
      );
    }),
  );
}

/** An itinerary: time, a dot on a line, what happens and who. `now` marks the current step. */
export function Timeline(p: { items: { id: string; when: Child; title: Child; detail?: Child; users?: U[] }[]; now?: number }) {
  const t = theme(), c = t.color;
  return h(
    "ol",
    { style: { listStyle: "none", margin: 0, padding: 0, minWidth: 0 } },
    p.items.map((it, i) => {
      const past = p.now != null && i < p.now, cur = p.now === i;
      return h(
        "li",
        { key: it.id, style: { display: "grid", gridTemplateColumns: "52px 16px minmax(0,1fr) auto", gap: 8, minHeight: 40 } },
        h("small", { style: { textAlign: "right", paddingTop: 2, fontWeight: cur ? 600 : 400, color: cur ? c.text : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.when),
        h(
          "span",
          { "aria-hidden": "true", style: { position: "relative", display: "flex", justifyContent: "center" } },
          i < p.items.length - 1 && h("i", { style: { position: "absolute", top: 12, bottom: -4, width: 2, background: past ? c.primary : c.divider } }),
          h("i", { style: { position: "relative", marginTop: 4, width: 12, height: 12, borderRadius: "50%", background: cur || past ? c.primary : c.card, boxShadow: `0 0 0 2px ${cur || past ? c.primary : c.divider}${cur ? `,0 0 0 5px ${c.selected}` : ""}` } }),
        ),
        h("div", { style: { minWidth: 0, paddingBottom: 8 } }, h("div", { style: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.title), it.detail != null && h("small", { style: { display: "block" } }, it.detail)),
        it.users?.length ? h("span", { style: { display: "flex", paddingTop: 2 } }, crowd(it.users, 3).shown.map((u, k) => h("span", { key: idOf(u), style: { marginLeft: k ? -6 : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, display: "flex" } }, h(Avatar, { user: u, size: 20 })))) : h("span", null),
      );
    }),
  );
}

/** A row of days: weekday, date, and dots for who can make it. `selected` turns primary. */
export function CalendarStrip(p: { days: { id: string; dow: string; date: string | number; users?: U[]; off?: boolean }[]; selected?: string; me?: string; onDay?: (id: string) => void }) {
  const t = theme(), c = t.color;
  return h(
    "div",
    { style: { display: "flex", gap: 4, minWidth: 0 } },
    p.days.map((d) => {
      const on = d.id === p.selected, n = d.users?.length ?? 0;
      const kids = [
        h("small", { style: { color: on ? c.onPrimary : c.secondaryText, fontSize: 12 } }, d.dow),
        h("b", { style: { fontSize: t.type.title, lineHeight: "20px", fontWeight: 600 } }, String(d.date)),
        h("span", { "aria-hidden": "true", style: { display: "flex", gap: 2, height: 6 } }, (d.users ?? []).slice(0, 4).map((u) => h("i", { key: idOf(u), style: { width: 6, height: 6, borderRadius: 3, background: on ? c.onPrimary : idOf(u) === p.me ? c.primary : c.secondaryText } }))),
      ];
      const style = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 0", borderRadius: t.radius.input, background: on ? c.primary : d.off ? "transparent" : c.input, color: on ? c.onPrimary : d.off ? c.secondaryText : c.text, position: "relative" };
      const name = `${d.dow} ${d.date}, ${n} can make it`;
      return p.onDay && !d.off
        ? h("button", { key: d.id, type: "button", class: "m-hit", "aria-label": name, "aria-pressed": on, onClick: () => p.onDay!(d.id), style }, kids)
        : h("div", { key: d.id, role: "img", "aria-label": name, style }, kids);
    }),
  );
}

/** Who is free when: one row per person, one cell per column, darker for more (0 to `max`). Display only. */
export function HeatGrid(p: { cols: string[]; rows: { id: string; user?: U; label?: string; cells: number[] }[]; max?: number; me?: string; best?: number; label: string }) {
  const t = theme(), c = t.color, max = p.max ?? 1, n = p.cols.length;
  const totals = p.cols.map((_, i) => p.rows.reduce((a, r) => a + (r.cells[i] ?? 0), 0));
  const top = Math.max(1, ...totals);
  const grid = { display: "grid", gridTemplateColumns: `64px repeat(${n},minmax(0,1fr))`, gap: 2, alignItems: "center" };
  const every = Math.ceil(n / 6);
  return h(
    "div",
    { role: "img", "aria-label": p.label, style: { display: "grid", gap: 3, minWidth: 0 } },
    h("div", { "aria-hidden": "true", style: { ...grid, fontSize: 11, lineHeight: "14px", color: c.secondaryText } }, h("span", null), p.cols.map((l, i) => (i % every ? null : h("span", { key: i, style: { gridColumn: `span ${Math.min(every, n - i)}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l)))),
    p.rows.map((r) =>
      h(
        "div",
        { key: r.id, style: grid },
        h("span", { style: { display: "flex", alignItems: "center", gap: 4, minWidth: 0, fontSize: 12, fontWeight: r.id === p.me ? 600 : 400, color: r.id === p.me ? c.link : c.text } }, r.user && h(Avatar, { user: r.user, size: 18 }), h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.id === p.me ? "You" : (r.label ?? (r.user ? memberOf(r.user).name : "")))),
        p.cols.map((_, i) => h("i", { key: i, style: { height: 20, borderRadius: 4, background: (r.cells[i] ?? 0) > 0 ? mix(c.track, c.primary, 0.3 + 0.7 * clamp((r.cells[i] ?? 0) / max)) : c.input, boxShadow: p.best === i ? `inset 0 0 0 2px ${c.text}` : undefined } })),
      ),
    ),
    h("div", { "aria-hidden": "true", style: { ...grid, alignItems: "end", height: 26 } }, h("small", null, "Overlap"), totals.map((v, i) => h("i", { key: i, style: { height: Math.max(3, (v / top) * 22), borderRadius: 3, background: i === p.best ? c.primary : mix(c.track, c.primary, 0.35) } }))),
  );
}

