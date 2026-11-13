import { defineApp, Button, CardHeader, Facepile } from "@muse/app";

// Free time grid. Everyone taps the hours tonight they are free; the card shows the hour with
// the most people free. People also pick Movie or Mario Kart.

const C = {
  title: "When is everyone free tonight?",
  slots: [
    { id: "h18", label: "6pm" },
    { id: "h19", label: "7pm" },
    { id: "h20", label: "8pm" },
    { id: "h21", label: "9pm" },
    { id: "h22", label: "10pm" },
    { id: "h23", label: "11pm" },
  ],
  activities: [
    { id: "movie", label: "Movie" },
    { id: "mario", label: "Mario Kart" },
  ],
  note: "Movie at 7:30 was mentioned · Mario Kart is in Ana's dorm",
};

type Slot = { id: string; label: string; free: string[] };
type Activity = { id: string; label: string; voters: string[] };
type State = { slots: Slot[]; activities: Activity[] };
type Action = { t: "toggle"; slot: string } | { t: "vote"; activity: string } | { t: "clear" };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const without = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
const best = (s: State): Slot | null => {
  let b: Slot | null = null;
  for (const sl of s.slots) if (sl.free.length > (b ? b.free.length : 0)) b = sl;
  return b;
};
const markedCount = (s: State, u: string) => s.slots.filter((sl) => sl.free.includes(u)).length;
const bestText = (s: State, total: number) => {
  const b = best(s);
  return b ? `${b.label} · ${b.free.length} of ${total} free` : "Nobody marked yet";
};
const fixed = (s: State) => JSON.stringify([s.slots.map((x) => [x.id, x.label]), s.activities.map((x) => [x.id, x.label])]);

export default defineApp<State, Action, Local>({
  name: "Free time grid",
  summary: (s, ctx) => `${C.title} ${bestText(s, ctx.members.length)}`,

  init: () => ({
    slots: C.slots.map((x) => ({ id: x.id, label: x.label, free: [] })),
    activities: C.activities.map((x) => ({ id: x.id, label: x.label, voters: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const u = meta.user;
    if (action.t === "toggle") {
      if (typeof action.slot !== "string") return state;
      const target = state.slots.find((x) => x.id === action.slot);
      if (!target) return state;
      return {
        ...state,
        slots: state.slots.map((x) =>
          x.id !== target.id ? x : { ...x, free: x.free.includes(u) ? x.free.filter((v) => v !== u) : [...x.free, u] },
        ),
      };
    }
    if (action.t === "vote") {
      if (typeof action.activity !== "string") return state;
      const target = state.activities.find((x) => x.id === action.activity);
      if (!target) return state;
      const had = target.voters.includes(u);
      return {
        ...state,
        activities: state.activities.map((x) => {
          const rest = x.voters.filter((v) => v !== u);
          return x.id === target.id && !had ? { ...x, voters: [...rest, u] } : { ...x, voters: rest };
        }),
      };
    }
    if (action.t === "clear") {
      if (markedCount(state, u) === 0) return state;
      return { ...state, slots: state.slots.map((x) => ({ ...x, free: x.free.filter((v) => v !== u) })) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const ok = state.slots.every((x) => x.free.every((v) => inChat(ctx, v))) && state.activities.every((x) => x.voters.every((v) => inChat(ctx, v)));
    if (ok) return state;
    return {
      slots: state.slots.map((x) => ({ ...x, free: x.free.filter((v) => inChat(ctx, v)) })),
      activities: state.activities.map((x) => ({ ...x, voters: x.voters.filter((v) => inChat(ctx, v)) })),
    };
  },

  invariants: {
    "no one is listed twice in an hour or an activity": (s) =>
      s.slots.every((x) => new Set(x.free).size === x.free.length) && s.activities.every((x) => new Set(x.voters).size === x.voters.length),
    "everyone listed is in the chat": (s, ctx) =>
      s.slots.every((x) => x.free.every((v) => inChat(ctx, v))) && s.activities.every((x) => x.voters.every((v) => inChat(ctx, v))),
    "each person votes for at most one activity": (s) => {
      const all = s.activities.flatMap((x) => x.voters);
      return all.length === new Set(all).size;
    },
    "the six hours and two activities keep their ids and labels": (s) =>
      s.slots.length === C.slots.length &&
      s.activities.length === C.activities.length &&
      s.slots.every((x, i) => x.id === C.slots[i]!.id && x.label === C.slots[i]!.label) &&
      s.activities.every((x, i) => x.id === C.activities[i]!.id && x.label === C.activities[i]!.label),
  },

  transitions: {
    "a toggle flips only the actor in that hour and changes nothing else": (p, n, a, m) =>
      a.t !== "toggle" ||
      p === n ||
      (p.slots.some((x) => x.id === a.slot) &&
        p.slots.length === n.slots.length &&
        p.slots.every((sl, i) => {
          const nx = n.slots[i]!;
          return sl.id === a.slot
            ? sl.free.includes(m.user) !== nx.free.includes(m.user) && without(sl.free, m.user) === without(nx.free, m.user)
            : sl.free.join() === nx.free.join();
        }) &&
        JSON.stringify(p.activities) === JSON.stringify(n.activities)),
    "a vote leaves the actor on that activity only, or off all, and moves no one else": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const had = p.activities.some((x) => x.id === a.activity && x.voters.includes(m.user));
      const after = n.activities.filter((x) => x.voters.includes(m.user)).map((x) => x.id).join();
      return (
        p.activities.length === n.activities.length &&
        p.activities.every((x, i) => without(x.voters, m.user) === without(n.activities[i]!.voters, m.user)) &&
        after === (had ? "" : String(a.activity)) &&
        JSON.stringify(p.slots) === JSON.stringify(n.slots)
      );
    },
    "a clear removes the actor from every hour and changes no one else": (p, n, a, m) =>
      a.t !== "clear" ||
      p === n ||
      (p.slots.some((x) => x.free.includes(m.user)) &&
        n.slots.every((x) => !x.free.includes(m.user)) &&
        p.slots.every((x, i) => without(x.free, m.user) === n.slots[i]!.free.join()) &&
        JSON.stringify(p.activities) === JSON.stringify(n.activities)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "hour and activity labels and ids never change": (p, n) => fixed(p) === fixed(n),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.6) return { t: "toggle", slot: r.pick(s.slots).id };
    if (k < 0.85) return { t: "vote", activity: r.pick(s.activities).id };
    if (k < 0.93) return { t: "clear" };
    return { t: "toggle", slot: "h99" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const total = members.length;
    const b = best(state);
    const mine = markedCount(state, me);
    return (
      <div>
        <CardHeader title={C.title} subtitle={bestText(state, total)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {state.slots.map((sl) => {
            const on = sl.free.includes(me);
            const top = b !== null && b.id === sl.id;
            return (
              <button
                key={sl.id}
                type="button"
                aria-pressed={on}
                aria-label={`${sl.label}, ${sl.free.length} free${on ? ", you are free" : ""}`}
                onClick={() => dispatch({ t: "toggle", slot: sl.id })}
                style={{
                  minHeight: 56,
                  border: "none",
                  borderRadius: theme.radius.button,
                  background: on ? theme.color.selected : theme.color.input,
                  color: theme.color.text,
                  boxShadow: top ? `inset 0 0 0 2px ${theme.color.primary}` : "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                }}
              >
                <span style={{ fontWeight: 600 }}>{sl.label}</span>
                <small>{`${sl.free.length} free`}</small>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4 }}>
          {b ? <Facepile users={b.free} max={5} size={24} /> : null}
          <small style={{ flex: 1, minWidth: 0 }}>{b ? `Free at ${b.label}` : "Tap the hours you are free"}</small>
          {mine > 0 ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "clear" })}>
              Clear
            </Button>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {state.activities.map((ac) => (
            <Button key={ac.id} wide kind={ac.voters.includes(me) ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "vote", activity: ac.id })}>
              {`${ac.label} · ${ac.voters.length}`}
            </Button>
          ))}
        </div>
        <small style={{ display: "block", marginTop: 6 }}>{C.note}</small>
      </div>
    );
  },
});
