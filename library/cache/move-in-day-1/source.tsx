import { defineApp, CardHeader, OptionRow } from "@muse/app";

const P = {
  title: "Moving day Saturday",
  notes: ["U-Haul 10ft · pickup 9am · Ravi drives", "Boxes · Dani 6, Tess 15"],
  spots: [
    { label: "Loading 9-12", cap: 6 },
    { label: "Truck driver", cap: 1 },
    { label: "Couch, before 1", cap: 2 },
    { label: "Kitchen packing", cap: 1 },
    { label: "Pizza pickup 1pm", cap: 1 },
    { label: "Unloading 1-4", cap: 6 },
  ],
};

type Spot = { id: string; label: string; cap: number; people: string[] };
type State = { title: string; notes: string[]; spots: Spot[] };
type Action = { t: "join"; spot: string } | { t: "leave"; spot: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const spotOf = (s: State, id: unknown) => s.spots.find((x) => x.id === id);
const filled = (s: State) => s.spots.reduce((n, x) => n + x.people.length, 0);
const othersSame = (p: State, n: State, id: unknown) =>
  p.spots.length === n.spots.length && p.spots.every((x, i) => x.id === id || JSON.stringify(x) === JSON.stringify(n.spots[i]));

export default defineApp<State, Action, Local>({
  name: "Moving day signup",
  summary: (s) => `${s.title} ${filled(s)} of ${s.spots.reduce((n, x) => n + x.cap, 0)} spots filled.`,

  init: () => ({
    title: P.title,
    notes: P.notes,
    spots: P.spots.map((x, i) => ({ id: `s${i}`, label: x.label, cap: x.cap, people: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "join" && action.t !== "leave") return state;
    if (typeof action.spot !== "string") return state;
    const sp = spotOf(state, action.spot);
    if (!sp) return state;
    const on = sp.people.includes(meta.user);
    if (action.t === "join") {
      if (on || sp.people.length >= sp.cap) return state;
      return { ...state, spots: state.spots.map((x) => (x.id === sp.id ? { ...x, people: [...x.people, meta.user] } : x)) };
    }
    if (!on) return state;
    return { ...state, spots: state.spots.map((x) => (x.id === sp.id ? { ...x, people: x.people.filter((u) => u !== meta.user) } : x)) };
  },

  onMembers: (state, ctx) => {
    if (state.spots.every((x) => x.people.every((u) => inChat(ctx, u)))) return state;
    return { ...state, spots: state.spots.map((x) => ({ ...x, people: x.people.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "no spot has more people than its cap": (s) => s.spots.every((x) => x.people.length <= x.cap),
    "no one is listed twice on a spot": (s) => s.spots.every((x) => new Set(x.people).size === x.people.length),
    "everyone on a spot is in the chat": (s, ctx) => s.spots.every((x) => x.people.every((u) => inChat(ctx, u))),
    "spot ids are unique and caps are 1 to 8": (s) =>
      new Set(s.spots.map((x) => x.id)).size === s.spots.length && s.spots.every((x) => Number.isInteger(x.cap) && x.cap >= 1 && x.cap <= 8),
    "the spots and their caps match the plan": (s) =>
      s.spots.length === P.spots.length && s.spots.every((x, i) => x.cap === P.spots[i]!.cap && x.label === P.spots[i]!.label),
  },

  transitions: {
    "a join adds the actor last on a spot that had room and changes nothing else": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const before = spotOf(p, a.spot);
      const after = spotOf(n, a.spot);
      return (
        !!before && !!after && before.people.length < before.cap && !before.people.includes(m.user) &&
        after.people.join() === [...before.people, m.user].join() && othersSame(p, n, a.spot)
      );
    },
    "a leave removes only the actor from that spot": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const before = spotOf(p, a.spot);
      const after = spotOf(n, a.spot);
      return (
        !!before && !!after && before.people.includes(m.user) &&
        after.people.join() === before.people.filter((u) => u !== m.user).join() && othersSame(p, n, a.spot)
      );
    },
    "labels, caps, title and notes never change": (p, n) =>
      p.title === n.title && JSON.stringify(p.notes) === JSON.stringify(n.notes) &&
      p.spots.length === n.spots.length && p.spots.every((x, i) => x.id === n.spots[i]!.id && x.label === n.spots[i]!.label && x.cap === n.spots[i]!.cap),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const sp = r.pick(s.spots);
    if (sp.people.includes(user) && r.next() < 0.4) return { t: "leave", spot: sp.id };
    return { t: "join", spot: sp.id };
  },

  local: {},

  view: ({ state, me, dispatch }) => {
    const total = state.spots.reduce((n, x) => n + x.cap, 0);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${filled(state)} of ${total} spots filled`} />
        <div style={{ display: "grid", gap: 2, margin: "4px 0 6px" }}>
          {state.notes.map((n, i) => (
            <small key={i}>{n}</small>
          ))}
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {state.spots.map((x) => {
            const on = x.people.includes(me);
            const full = x.people.length >= x.cap;
            return (
              <OptionRow
                key={x.id}
                label={full && !on ? `${x.label} · full` : x.label}
                count={x.people.length}
                total={x.cap}
                voters={x.people}
                selected={on}
                onClick={() => {
                  if (on) dispatch({ t: "leave", spot: x.id });
                  else if (!full) dispatch({ t: "join", spot: x.id });
                }}
              />
            );
          })}
        </div>
      </div>
    );
  },
});
