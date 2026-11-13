import { defineApp, CardHeader, Facepile } from "@muse/app";

// Shift signup for the Friday party. Tap a shift with room to join, tap your own shift to leave.

const P = {
  title: "Party shifts",
  subtitle: "Fri 9 PM · kegs handled",
  shifts: [
    { group: "Door", when: "9-10", need: 2, note: "", names: ["Kev", "Owen"] },
    { group: "Door", when: "10-12", need: 2, note: "", names: [] as string[] },
    { group: "Door", when: "12-close", need: 2, note: "", names: [] as string[] },
    { group: "Music", when: "10-11", need: 1, note: "Throwbacks", names: ["Priya"] },
    { group: "Music", when: "11-12", need: 1, note: "", names: ["Zoe"] },
    { group: "Music", when: "12-1", need: 1, note: "", names: ["Bryan"] },
    { group: "Cleanup", when: "Sat 11 AM", need: 3, note: "Cups and stuff", names: ["Gabe"] },
  ],
};

type Shift = { id: string; group: string; when: string; need: number; note: string; people: string[] };
type State = { title: string; subtitle: string; shifts: Shift[] };
type Action = { t: "join"; shift: string } | { t: "leave"; shift: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const shortCount = (s: State) => s.shifts.filter((x) => x.people.length < x.need).length;
const othersSame = (p: State, n: State, id: string) =>
  p.shifts.length === n.shifts.length && p.shifts.every((x, i) => x.id === id || x.people.join() === n.shifts[i]!.people.join());

function setPeople(s: State, id: string, people: string[]): State {
  return { ...s, shifts: s.shifts.map((x) => (x.id === id ? { ...x, people } : x)) };
}

export default defineApp<State, Action, Local>({
  name: "Shift signup",
  summary: (s) => {
    const n = shortCount(s);
    return n === 0 ? `${s.title}: every shift is filled.` : `${s.title}: ${n} ${n === 1 ? "shift" : "shifts"} still short.`;
  },

  init: (ctx) => ({
    title: P.title,
    subtitle: P.subtitle,
    shifts: P.shifts.map((x, i) => {
      const people: string[] = [];
      for (const name of x.names) {
        const id = ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
        if (id && !people.includes(id) && people.length < x.need) people.push(id);
      }
      return { id: `s${i}`, group: x.group, when: x.when, need: x.need, note: x.note, people };
    }),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "join" && action.t !== "leave") return state;
    if (typeof action.shift !== "string") return state;
    const sh = state.shifts.find((x) => x.id === action.shift);
    if (!sh) return state;
    if (action.t === "join") {
      if (sh.people.length >= sh.need || sh.people.includes(meta.user)) return state;
      return setPeople(state, sh.id, [...sh.people, meta.user]);
    }
    if (!sh.people.includes(meta.user)) return state;
    return setPeople(state, sh.id, sh.people.filter((u) => u !== meta.user));
  },

  onMembers: (state, ctx) => {
    if (state.shifts.every((x) => x.people.every((u) => inChat(ctx, u)))) return state;
    return { ...state, shifts: state.shifts.map((x) => ({ ...x, people: x.people.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "no shift has more people than it needs": (s) => s.shifts.every((x) => x.people.length <= x.need),
    "no one is on a shift twice": (s) => s.shifts.every((x) => new Set(x.people).size === x.people.length),
    "everyone on a shift is in the chat": (s, ctx) => s.shifts.every((x) => x.people.every((u) => inChat(ctx, u))),
    "the seven shifts keep their ids and needs": (s) =>
      s.shifts.length === P.shifts.length &&
      s.shifts.every((x, i) => x.id === `s${i}` && x.need === P.shifts[i]!.need && x.when === P.shifts[i]!.when && x.group === P.shifts[i]!.group),
  },

  transitions: {
    "a join adds the actor to that open shift and changes no other shift": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const id = a.shift;
      const b = p.shifts.find((x) => x.id === id);
      const f = n.shifts.find((x) => x.id === id);
      return !!b && !!f && b.people.length < b.need && !b.people.includes(m.user) && f.people.join() === [...b.people, m.user].join() && othersSame(p, n, id);
    },
    "a leave removes the actor from that shift and changes no other shift": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const id = a.shift;
      const b = p.shifts.find((x) => x.id === id);
      const f = n.shifts.find((x) => x.id === id);
      return !!b && !!f && b.people.includes(m.user) && f.people.join() === b.people.filter((u) => u !== m.user).join() && othersSame(p, n, id);
    },
    "only people in the chat change a shift": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "times, needs and notes never change": (p, n) =>
      p.title === n.title &&
      p.subtitle === n.subtitle &&
      p.shifts.length === n.shifts.length &&
      p.shifts.every((x, i) => {
        const y = n.shifts[i]!;
        return x.id === y.id && x.group === y.group && x.when === y.when && x.need === y.need && x.note === y.note;
      }),
  },

  arbitrary: (s, user, r) => {
    const sh = r.pick(s.shifts);
    if (sh.people.includes(user) && r.next() < 0.3) return { t: "leave", shift: sh.id };
    return { t: "join", shift: sh.id };
  },

  local: {},

  view: ({ state, me, dispatch, theme }) => {
    const n = shortCount(state);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.subtitle} · ${n} short`} />
        <div style={{ display: "grid", gap: 4 }}>
          {state.shifts.map((x) => {
            const mine = x.people.includes(me);
            const open = x.need - x.people.length;
            const status = open === 0 ? "Full" : `${open} open`;
            const sub = [x.note, status].filter((t) => t).join(" · ");
            return (
              <button
                key={x.id}
                aria-label={`${x.group} ${x.when}, ${status}${mine ? ", you are on it" : ""}`}
                onClick={() => {
                  if (mine) dispatch({ t: "leave", shift: x.id });
                  else if (open > 0) dispatch({ t: "join", shift: x.id });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  padding: "2px 10px",
                  border: "none",
                  textAlign: "left",
                  borderRadius: theme.radius.button,
                  background: mine ? theme.color.selected : theme.color.input,
                  color: theme.color.text,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${x.group} · ${x.when}`}</div>
                  <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</small>
                </div>
                <Facepile users={x.people} max={3} size={20} />
              </button>
            );
          })}
        </div>
      </div>
    );
  },
});
