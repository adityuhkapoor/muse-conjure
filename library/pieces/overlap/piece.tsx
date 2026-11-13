import { defineApp, Button, CardHeader, Facepile, SystemLine } from "@muse/app";

// Availability overlap: days by times. Everyone taps the cells that work for them; the best cell
// shows who can make it. Anyone can pick a cell with the most people, which freezes the grid until anyone undoes it.

type Params = {
  /** Card title: "When can everyone hang?" */
  title: string;
  /** Columns: days or dates from the chat, 1 to 7, short ("Fri", "Sat 14"). */
  days: string[];
  /** Rows: times of day, 1 to 5, short ("Lunch", "7 PM"). */
  times: string[];
};

// @params
const P: Params = {
  title: "When can everyone hang?",
  days: ["Fri", "Sat", "Sun"],
  times: ["Afternoon", "Evening"],
};
// @end params

type Pick = { cell: number; by: string };
type State = { title: string; days: string[]; times: string[]; cells: string[][]; pick: Pick | null };
type Action = { t: "toggle"; cell: number } | { t: "pick"; cell: number } | { t: "unpick" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const best = (s: State) => s.cells.reduce((m, c) => Math.max(m, c.length), 0);
const isCell = (s: State, c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0 && c < s.cells.length;
const picked = (s: State) => (s.pick ? (s.cells[s.pick.cell]?.length ?? 0) : 0);

function toggle(s: State, user: string, cell: unknown): State {
  if (s.pick || !isCell(s, cell)) return s;
  const on = !s.cells[cell]!.includes(user);
  return { ...s, cells: s.cells.map((c, i) => (i !== cell ? c : on ? [...c, user] : c.filter((u) => u !== user))) };
}

function pick(s: State, user: string, cell: unknown): State {
  if (s.pick || !isCell(s, cell)) return s;
  const n = s.cells[cell]!.length;
  if (n === 0 || n < best(s)) return s;
  return { ...s, pick: { cell, by: user } };
}

export default defineApp<State, Action, Local>({
  name: "Availability",
  summary: (s) => {
    const label = (c: number) => `${s.days[c % s.days.length]} ${s.times[Math.floor(c / s.days.length)]?.toLowerCase()}`;
    if (s.pick) return `${s.title} Picked ${label(s.pick.cell)}: ${picked(s)} can make it.`;
    const b = best(s);
    return b ? `${s.title} Best so far: ${b} free.` : `${s.title} No one has answered yet.`;
  },

  init: () => {
    const days = P.days.map((d) => d.trim().slice(0, 10)).filter(Boolean).slice(0, 7);
    const times = P.times.map((t) => t.trim().slice(0, 12)).filter(Boolean).slice(0, 5);
    const d = days.length ? days : ["Sat"];
    const t = times.length ? times : ["Evening"];
    return { title: P.title.trim().slice(0, 60) || "When works?", days: d, times: t, cells: Array.from({ length: d.length * t.length }, () => []), pick: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "toggle") return toggle(state, meta.user, action.cell);
    if (action.t === "pick") return pick(state, meta.user, action.cell);
    if (action.t === "unpick") return state.pick ? { ...state, pick: null } : state;
    return state;
  },

  // Someone left: their taps go. If that changes the picked cell, or its picker left, the pick lifts.
  onMembers: (state, ctx) => {
    if (state.cells.every((c) => c.every((u) => inChat(ctx, u))) && (!state.pick || inChat(ctx, state.pick.by))) return state;
    const cells = state.cells.map((c) => c.filter((u) => inChat(ctx, u)));
    const top = cells.reduce((m, c) => Math.max(m, c.length), 0);
    const keep = state.pick !== null && inChat(ctx, state.pick.by) && top > 0 && cells[state.pick.cell]!.length === top;
    return { ...state, cells, pick: keep ? state.pick : null };
  },

  invariants: {
    "no one is in a cell twice": (s) => s.cells.every((c) => new Set(c).size === c.length),
    "the pick has the most people": (s) => s.pick === null || (picked(s) === best(s) && picked(s) > 0),
    "the grid is days by times": (s) => s.cells.length === s.days.length * s.times.length,
    "everyone in the grid is in the chat": (s, ctx) => s.cells.every((c) => c.every((u) => inChat(ctx, u))),
    "the picker is in the chat": (s, ctx) => s.pick === null || inChat(ctx, s.pick.by),
  },

  transitions: {
    "a tap flips the actor in that one cell": (p, n, a, m) => {
      if (a.t !== "toggle" || p === n) return true;
      const here = (x: State) => x.cells[a.cell]?.includes(m.user);
      const rest = (x: State, i: number) => x.cells[i]!.filter((u) => u !== m.user).join();
      return here(p) !== here(n) && p.pick === null && p.cells.every((_, i) => rest(p, i) === rest(n, i)) && p.cells.every((c, i) => i === a.cell || c === n.cells[i] || c.join() === n.cells[i]!.join());
    },
    "a pick names a cell with the most people, once": (p, n, a, m) => a.t !== "pick" || p === n || (p.pick === null && n.pick?.cell === a.cell && n.pick.by === m.user && p.cells[a.cell]!.length === best(p) && best(p) > 0 && n.cells === p.cells),
    "lifting the pick reopens the grid and changes nothing else": (p, n, a) => a.t !== "unpick" || p === n || (p.pick !== null && n.pick === null && n.cells === p.cells),
    "only people in the chat change the grid": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.pick) return k < 0.5 ? { t: "unpick" } : { t: "toggle", cell: r.int(s.cells.length) };
    if (k < 0.15) {
      const b = best(s);
      const top = s.cells.map((c, i) => (c.length === b ? i : -1)).filter((i) => i >= 0);
      return { t: "pick", cell: top.length && r.next() < 0.8 ? r.pick(top) : r.int(s.cells.length) };
    }
    return { t: "toggle", cell: r.int(s.cells.length) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const b = best(state);
    const cols = state.days.length;
    const label = (c: number) => `${state.days[c % cols]} ${state.times[Math.floor(c / cols)]?.toLowerCase()}`;
    const top = state.pick ? state.pick.cell : b > 0 ? state.cells.findIndex((c) => c.length === b) : -1;
    const answered = members.filter((m) => state.cells.some((c) => c.includes(m.id))).length;
    const picker = state.pick ? (members.find((m) => m.id === state.pick!.by)?.name ?? "Someone") : "";
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${answered} of ${members.length} answered`} />
        <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${cols}, 1fr)`, gap: 4, alignItems: "center" }}>
          <span />
          {state.days.map((d) => (
            <small key={d} style={{ textAlign: "center", fontWeight: 600 }}>
              {d}
            </small>
          ))}
          {state.times.map((t, row) => [
            <small key={`t${row}`}>{t}</small>,
            ...state.days.map((_, col) => {
              const i = row * cols + col;
              const c = state.cells[i] ?? [];
              const mine = c.includes(me);
              return (
                <Button key={i} kind={mine ? "primary" : c.length === b && b > 0 ? "deemphasized" : "secondary"} disabled={state.pick !== null} onClick={() => dispatch({ t: "toggle", cell: i })}>
                  {String(c.length)}
                </Button>
              );
            }),
          ])}
        </div>
        {top >= 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, minHeight: 44 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{state.pick ? `Picked: ${label(top)}` : `Best: ${label(top)}`}</div>
              <small>{state.pick ? `Picked by ${picker}` : `${b} of ${members.length} free`}</small>
            </div>
            <Facepile users={state.cells[top] ?? []} max={4} size={24} />
            {state.pick ? (
              <Button onClick={() => dispatch({ t: "unpick" })}>Undo</Button>
            ) : (
              <Button kind="primary" onClick={() => dispatch({ t: "pick", cell: top })}>
                Pick
              </Button>
            )}
          </div>
        ) : (
          <SystemLine>Tap every slot that works for you</SystemLine>
        )}
      </div>
    );
  },
});
