import { defineApp, CardHeader, OptionRow } from "@muse/app";

const CHAT = {
  title: "Chores this week",
  chores: [
    { label: "Dishes", cap: 1 },
    { label: "Trash + recycling", cap: 1 },
    { label: "Bathroom", cap: 2 },
    { label: "Sweep", cap: 1 },
    { label: "Wipe counters", cap: 1 },
    { label: "Water plants", cap: 1 },
    { label: "Litter box (Mochi)", cap: 1 },
  ],
};

type Chore = { id: string; label: string; cap: number; people: string[] };
type State = { title: string; chores: Chore[] };
type Action = { t: "claim"; chore: string } | { t: "drop"; chore: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const countOf = (s: State, u: string) => s.chores.filter((c) => c.people.includes(u)).length;
const find = (s: State, id: unknown) => s.chores.find((c) => c.id === id);
const without = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
/** Every chore other than `id` has the same people, ignoring the actor. */
const othersSame = (p: State, n: State, id: unknown, u: string) =>
  p.chores.length === n.chores.length &&
  p.chores.every((c, i) => c.id === id || without(c.people, u) === without(n.chores[i]!.people, u));

export default defineApp<State, Action, Local>({
  name: "Chore picker",
  summary: (s, ctx) => {
    const placed = ctx.members.filter((m) => countOf(s, m.id) > 0).length;
    return `${s.title} ${placed} of ${ctx.members.length} have a chore.`;
  },

  init: () => ({
    title: CHAT.title,
    chores: CHAT.chores.map((c, i) => ({ id: `c${i}`, label: c.label, cap: c.cap, people: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const user = meta.user;
    if (action.t === "claim") {
      const target = find(state, action.chore);
      if (!target || target.people.includes(user) || target.people.length >= target.cap) return state;
      return {
        ...state,
        chores: state.chores.map((c) =>
          c.id === target.id ? { ...c, people: [...c.people, user] } : c.people.includes(user) ? { ...c, people: c.people.filter((x) => x !== user) } : c,
        ),
      };
    }
    if (action.t === "drop") {
      const target = find(state, action.chore);
      if (!target || !target.people.includes(user)) return state;
      return { ...state, chores: state.chores.map((c) => (c.id === target.id ? { ...c, people: c.people.filter((x) => x !== user) } : c)) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.chores.every((c) => c.people.every((u) => inChat(ctx, u)))) return state;
    return { ...state, chores: state.chores.map((c) => (c.people.every((u) => inChat(ctx, u)) ? c : { ...c, people: c.people.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "no chore has more people than its cap": (s) => s.chores.every((c) => c.people.length <= c.cap),
    "each person is on at most one chore": (s, ctx) => ctx.members.every((m) => countOf(s, m.id) <= 1),
    "nobody is listed twice on a chore": (s) => s.chores.every((c) => new Set(c.people).size === c.people.length),
    "everyone on a chore is in the chat": (s, ctx) => s.chores.every((c) => c.people.every((u) => inChat(ctx, u))),
    "the seven chores and their caps never change": (s) =>
      s.chores.length === CHAT.chores.length &&
      s.chores.every((c, i) => c.id === `c${i}` && c.label === CHAT.chores[i]!.label && c.cap === CHAT.chores[i]!.cap),
  },

  transitions: {
    "a claim puts the actor on that chore, off any other, and moves no one else": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const after = find(n, a.chore);
      return !!after && after.people.includes(m.user) && countOf(n, m.user) === 1 && othersSame(p, n, a.chore, m.user);
    },
    "a claim only succeeds on a chore with room": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = find(p, a.chore);
      return !!before && !before.people.includes(m.user) && before.people.length < before.cap;
    },
    "a drop removes only the actor from that chore": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const before = find(p, a.chore);
      const after = find(n, a.chore);
      return !!before && !!after && before.people.includes(m.user) && !after.people.includes(m.user) && countOf(n, m.user) === 0 && othersSame(p, n, a.chore, m.user) && without(before.people, m.user) === after.people.join();
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "labels and caps never change in a step": (p, n) =>
      p.chores.length === n.chores.length && p.chores.every((c, i) => c.label === n.chores[i]!.label && c.cap === n.chores[i]!.cap && c.id === n.chores[i]!.id),
  },

  arbitrary: (s, user, r) => {
    const mine = s.chores.find((c) => c.people.includes(user));
    const k = r.next();
    if (k < 0.08) return { t: "claim", chore: "zz" };
    if (mine && k < 0.25) return { t: "drop", chore: mine.id };
    return { t: "claim", chore: r.pick(s.chores).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const placed = members.filter((m) => countOf(state, m.id) > 0).length;
    const everyone = members.length > 0 && placed === members.length;
    return (
      <div>
        <CardHeader title={state.title} subtitle={everyone ? "Everyone has a chore" : `${placed} of ${members.length} have a chore`} />
        <div style={{ display: "grid", gap: 0 }}>
          {state.chores.map((c) => (
            <OptionRow
              key={c.id}
              label={c.cap > 1 ? `${c.label} · ${c.cap} people` : c.label}
              count={c.people.length}
              total={c.cap}
              voters={c.people}
              selected={c.people.includes(me)}
              onClick={() => dispatch(c.people.includes(me) ? { t: "drop", chore: c.id } : { t: "claim", chore: c.id })}
            />
          ))}
        </div>
      </div>
    );
  },
});
