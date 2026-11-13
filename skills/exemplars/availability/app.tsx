import { defineApp, Button, Canvas, CardHeader, Facepile, SystemLine, running, tween, type Theme } from "@muse/app";

// Availability: when can the orgo group study before Friday's final? A heatmap of Mon-Thu by
// two-hour blocks from 4 pm to midnight (the library closes at midnight). Each block is as blue
// as the number of people free then, prefilled from what everyone said in the chat. Tap or drag
// across blocks to paint your own time on or off. The block where the most people are free is
// ringed; anyone can set it as the session, and the grid then fades back around it.

// Everything here comes from the chat. Spans are [day, from hour, to hour], 24 h clock.
const CHAT = {
  title: "Orgo study session",
  before: "final Fri 9am",
  days: ["Mon", "Tue", "Wed", "Thu"],
  slots: [
    { from: 16, label: "4–6" },
    { from: 18, label: "6–8" },
    { from: 20, label: "8–10" },
    { from: 22, label: "10–12" },
  ],
  said: [
    { name: "Tess", spans: [["Mon", 18, 24], ["Wed", 18, 24], ["Thu", 18, 24]] }, // "every night after 6 except tues"
    { name: "Jamal", spans: [["Mon", 18, 24], ["Wed", 18, 24], ["Thu", 20, 24]] }, // "lab mon and wed till 6", "thursday i work 4 to 8"
    { name: "Rafa", spans: [["Tue", 16, 24], ["Thu", 16, 24], ["Mon", 22, 24]] }, // "tues and thurs anytime", "practice till 10"
    { name: "Lena", spans: [["Thu", 20, 24]] }, // "only thursday after 8"
    { name: "Mei", spans: [["Mon", 16, 22], ["Tue", 16, 22], ["Wed", 16, 22], ["Thu", 22, 24]] }, // "mon to wed 4 to 10", "review session till 9"
  ] as { name: string; spans: [string, number, number][] }[],
};

const D = CHAT.days.length, S = CHAT.slots.length, CELLS = D * S; // cell = day * S + slot
type State = { free: string[][]; set: number; setAt: number; setBy: string };
type Action = { t: "mark"; cell: number; free: boolean } | { t: "set"; cell: number } | { t: "clear" };
type Local = { paint: number; last: number }; // paint: -1 idle, 0 erasing, 1 painting
type Ctx = { members: { id: string; name: string }[] };

const RING_MS = 600;
const ring = tween({ duration: RING_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isCell = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0 && c < CELLS;
const label = (cell: number) => `${CHAT.days[Math.floor(cell / S)]} ${CHAT.slots[cell % S]!.label}`;

// ---- Check helpers ----
const most = (s: State) => Math.max(0, ...s.free.map((c) => c.length));
const bestCells = (s: State) => (most(s) > 0 ? s.free.map((c, i) => (c.length === most(s) ? i : -1)).filter((i) => i >= 0) : []);
const minus = (s: State, u: string) => JSON.stringify(s.free.map((c) => c.filter((v) => v !== u)));

function reduceAvail(s: State, a: Record<string, unknown>, user: string, time: number): State {
  if (a.t === "mark") {
    if (!isCell(a.cell) || typeof a.free !== "boolean") return s;
    const cell = a.cell, on = s.free[cell]!.includes(user);
    if (on === a.free) return s;
    return { ...s, free: s.free.map((c, i) => (i !== cell ? c : a.free ? [...c, user] : c.filter((v) => v !== user))) };
  }
  if (a.t === "set") {
    if (!isCell(a.cell) || s.set === a.cell) return s;
    const top = Math.max(0, ...s.free.map((c) => c.length));
    if (top === 0 || s.free[a.cell]!.length !== top) return s;
    return { ...s, set: a.cell, setAt: time, setBy: user };
  }
  if (a.t === "clear") {
    if (s.set < 0) return s;
    return { ...s, set: -1, setAt: 0, setBy: "" };
  }
  return s;
}

/** Cell geometry for a canvas of this width: a label column on the left, a day row on top. */
function grid(width: number) {
  const left = 44, top = 22, gap = 4, h = 44;
  const w = (width - left - gap * (D - 1)) / D;
  return { left, top, gap, h, w, at: (cell: number) => ({ x: left + Math.floor(cell / S) * (w + gap), y: top + (cell % S) * (h + gap) }) };
}
const CANVAS_H = 22 + S * 44 + (S - 1) * 4;

export default defineApp<State, Action, Local>({
  name: "Availability",
  summary: (s, ctx) =>
    s.set >= 0 ? `${CHAT.title}: ${label(s.set)} · ${s.free[s.set]!.length} free` : most(s) ? `${CHAT.title} · best so far ${label(bestCells(s)[0]!)} · ${most(s)} of ${ctx.members.length} free` : `${CHAT.title} · nobody has marked a time`,

  // What people said is matched by name; init reruns with the member list until the first tap.
  init: (ctx) => {
    const free: string[][] = Array.from({ length: CELLS }, () => []);
    for (const p of CHAT.said) {
      const id = ctx.members.find((m) => m.name.trim().toLowerCase() === p.name.toLowerCase())?.id;
      if (!id) continue;
      for (const [day, from, to] of p.spans) {
        const d = CHAT.days.indexOf(day);
        CHAT.slots.forEach((sl, k) => {
          const cell = d * S + k;
          if (d >= 0 && sl.from >= from && sl.from + 2 <= to && !free[cell]!.includes(id)) free[cell]!.push(id);
        });
      }
    }
    return { free, set: -1, setAt: 0, setBy: "" };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceAvail(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  // Someone left: their time comes off the grid; a set time stays, without their name.
  onMembers: (state, ctx) => {
    const stale = state.free.some((c) => c.some((v) => !inChat(ctx, v)));
    const byGone = state.setBy !== "" && !inChat(ctx, state.setBy);
    if (!stale && !byGone) return state;
    return { ...state, free: stale ? state.free.map((c) => c.filter((v) => inChat(ctx, v))) : state.free, setBy: byGone ? "" : state.setBy };
  },

  invariants: {
    "the grid is 4 days by 4 blocks": (s) => s.free.length === CELLS,
    "nobody is marked twice in a block": (s) => s.free.every((c) => new Set(c).size === c.length),
    "everyone marked free is in the chat": (s, ctx) => s.free.every((c) => c.every((v) => inChat(ctx, v))),
    "a set time is a real block with a time and a person": (s) => (s.set === -1 ? s.setAt === 0 && s.setBy === "" : isCell(s.set) && s.setAt > 0),
    "the person who set it is in the chat": (s, ctx) => s.setBy === "" || inChat(ctx, s.setBy) || ctx.members.length === 0,
  },

  transitions: {
    "a mark changes only the actor, only in that block, to what they asked": (p, n, a, m) =>
      a.t !== "mark" || p === n || (isCell(a.cell) && n.free[a.cell]!.includes(m.user) === a.free && p.free[a.cell]!.includes(m.user) !== a.free && minus(p, m.user) === minus(n, m.user) && p.free.every((c, i) => i === a.cell || c.includes(m.user) === n.free[i]!.includes(m.user)) && n.set === p.set),
    "a mark that changes something is never refused": (p, n, a, m, ctx) => a.t !== "mark" || !inChat(ctx, m.user) || !isCell(a.cell) || typeof a.free !== "boolean" || p.free[a.cell]!.includes(m.user) === a.free || p !== n,
    "a time can only be set on a block where the most people are free": (p, n, a, m) =>
      a.t !== "set" || p === n || (bestCells(p).includes(a.cell) && n.set === a.cell && n.setAt === m.time && n.setBy === m.user && JSON.stringify(p.free) === JSON.stringify(n.free)),
    "setting the best block always works": (p, n, a, m, ctx) => a.t !== "set" || !inChat(ctx, m.user) || !bestCells(p).includes(a.cell) || p.set === a.cell || n.set === a.cell,
    "clear empties the set time and nothing else": (p, n, a) => a.t !== "clear" || p === n || (p.set >= 0 && n.set === -1 && JSON.stringify(p.free) === JSON.stringify(n.free)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.set >= 0 && k < 0.1) return { t: "clear" };
    if (k < 0.18) {
      const b = bestCells(s);
      return { t: "set", cell: b.length && r.next() < 0.8 ? r.pick(b) : r.int(CELLS) };
    }
    const cell = r.int(CELLS);
    return { t: "mark", cell, free: r.next() < 0.75 ? !s.free[cell]!.includes(user) : s.free[cell]!.includes(user) };
  },

  local: { paint: -1, last: -1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const total = Math.max(1, members.length);
    const best = bestCells(state);
    const top = most(state);
    const set = state.set;
    const unmarked = members.filter((m) => !state.free.some((cell) => cell.includes(m.id)));
    const focus = set >= 0 ? set : best[0] ?? -1;
    const focusFree = focus >= 0 ? state.free[focus]! : [];
    const missing = focus >= 0 ? members.filter((m) => !focusFree.includes(m.id)) : [];
    const nameOf = (id: string) => (id === me ? "you" : (members.find((m) => m.id === id)?.name ?? "someone"));
    const lead = set >= 0 ? state.setAt : 0;

    const cellAt = (x: number, y: number, width: number) => {
      const g = grid(width);
      const d = Math.floor((x - g.left) / (g.w + g.gap)), k = Math.floor((y - g.top) / (g.h + g.gap));
      return x >= g.left && y >= g.top && d >= 0 && d < D && k >= 0 && k < S ? d * S + k : -1;
    };
    let width = 0;

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: Theme }) => {
      width = f.width;
      const G = grid(f.width);
      g.font = `600 13px ${theme.type.family}`;
      g.textBaseline = "middle";
      g.textAlign = "center";
      CHAT.days.forEach((d, i) => {
        g.fillStyle = c.secondaryText;
        g.fillText(d, G.left + i * (G.w + G.gap) + G.w / 2, 10);
      });
      g.textAlign = "right";
      CHAT.slots.forEach((sl, k) => {
        g.fillStyle = c.secondaryText;
        g.fillText(sl.label, G.left - 8, G.top + k * (G.h + G.gap) + G.h / 2);
      });
      const round = (x: number, y: number, w: number, h: number, r: number) => {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
      };
      for (let cell = 0; cell < CELLS; cell++) {
        const { x, y } = G.at(cell);
        const n = state.free[cell]!.length;
        const alpha = n === 0 ? 0 : 0.15 + (0.85 * n) / total;
        const dim = set >= 0 && cell !== set ? 0.4 : 1;
        g.globalAlpha = dim;
        round(x, y, G.w, G.h, 8);
        g.fillStyle = c.input;
        g.fill();
        g.globalAlpha = alpha * dim;
        g.fillStyle = c.primary;
        g.fill();
        g.globalAlpha = dim;
        const shown = alpha * dim;
        const strong = cell === set || (theme.mode === "light" ? shown >= 0.9 : shown >= 0.5);
        const ink = strong ? c.onPrimary : c.text;
        if (cell === set) {
          g.globalAlpha = 1;
          g.fillStyle = c.primary;
          g.fill();
        }
        g.globalAlpha = 1;
        g.textAlign = "center";
        g.fillStyle = ink;
        g.font = `${n === top && top > 0 ? 700 : 600} 15px ${theme.type.family}`;
        if (n) g.fillText(String(n), x + G.w / 2, y + G.h / 2 + 1);
        // my own free time: a small dot in the corner
        if (state.free[cell]!.includes(me)) {
          g.beginPath();
          g.arc(x + 9, y + 9, 3.5, 0, Math.PI * 2);
          g.fillStyle = ink;
          g.fill();
        }
        g.globalAlpha = 1;
      }
      // the overlap: ring the best block (or the set one), with a ripple when it is set
      const target = set >= 0 ? set : best.length === 1 ? best[0]! : -1;
      if (target >= 0) {
        const { x, y } = G.at(target);
        const e = set >= 0 ? running(lead, RING_MS) : null;
        const k = e === null ? 0 : ring(e);
        round(x - 3, y - 3, G.w + 6, G.h + 6, 11);
        g.strokeStyle = c.primary;
        g.lineWidth = 1.5;
        g.stroke();
        if (e !== null) {
          g.globalAlpha = 1 - k;
          round(x - 3 - 8 * k, y - 3 - 8 * k, G.w + 6 + 16 * k, G.h + 6 + 16 * k, 11 + 8 * k);
          g.stroke();
          g.globalAlpha = 1;
        }
        return e !== null;
      }
      return false;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type === "up") {
        if (local.paint !== -1) setLocal({ paint: -1, last: -1 });
        return;
      }
      const cell = cellAt(e.x, e.y, width);
      if (cell < 0) return;
      if (e.type === "down") {
        const on = !state.free[cell]!.includes(me);
        dispatch({ t: "mark", cell, free: on });
        setLocal({ paint: on ? 1 : 0, last: cell });
      } else if (local.paint !== -1 && cell !== local.last) {
        dispatch({ t: "mark", cell, free: local.paint === 1 });
        setLocal({ last: cell });
      }
    };

    const mineCount = state.free.filter((cell) => cell.includes(me)).length;
    return (
      <div>
        <CardHeader
          title={CHAT.title}
          subtitle={set >= 0 ? `${label(set)} pm${state.setBy ? ` · set by ${nameOf(state.setBy)}` : ""}` : `Before the ${CHAT.before} · ${mineCount ? `you're free in ${mineCount} blocks` : "tap or drag your free time"}`}
        />
        <Canvas height={CANVAS_H} draw={draw} onPointer={onPointer} label={`Who is free when: ${CHAT.days.length} days by ${CHAT.slots.length} blocks${top ? `, best ${label(best[0]!)} with ${top}` : ""}`} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, minHeight: 44, paddingTop: 8, borderTop: `1px solid ${c.divider}` }}>
          {focusFree.length ? <Facepile users={focusFree} max={4} size={24} /> : null}
          <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {focus < 0 ? "Nobody has marked a time" : `${label(focus)} pm · ${focusFree.length === members.length ? `all ${members.length}` : `${focusFree.length} of ${members.length}`} free`}
            </span>
            <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {set >= 0
                ? missing.length ? `Can't make it: ${missing.slice(0, 3).map((m) => nameOf(m.id)).join(", ")}${missing.length > 3 ? ` +${missing.length - 3}` : ""}` : "Everyone can make it"
                : best.length > 1
                  ? `${best.length} blocks tie at ${top}`
                  : unmarked.length
                    ? `Not marked yet: ${unmarked.slice(0, 3).map((m) => nameOf(m.id)).join(", ")}${unmarked.length > 3 ? ` +${unmarked.length - 3}` : ""}`
                    : "Most people free"}
            </small>
          </div>
          {set >= 0 ? (
            <Button onClick={() => dispatch({ t: "clear" })}>Change</Button>
          ) : (
            <Button kind="primary" disabled={focus < 0} onClick={() => dispatch({ t: "set", cell: focus })}>
              Set
            </Button>
          )}
        </div>
        {set >= 0 && state.free[set]!.length < top ? <SystemLine>{`${label(best[0]!)} now has more people free`}</SystemLine> : null}
      </div>
    );
  },
});
