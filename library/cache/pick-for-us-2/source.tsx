import { defineApp, CardHeader, OptionRow } from "@muse/app";

const CHAT = {
  title: "What are we watching Friday?",
  note: "Not horror · people come at 8",
  movies: [
    { label: "Challengers", detail: "" },
    { label: "Shrek 2", detail: "" },
    { label: "Past Lives", detail: "" },
    { label: "Knives Out", detail: "2.5 hrs" },
  ],
};

type Option = { id: string; label: string; detail: string; voters: string[] };
type State = { title: string; note: string; options: Option[] };
type Action = { t: "vote"; option: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const picksOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const allVoters = (s: State) => s.options.flatMap((o) => o.voters);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && without(o.voters, user) === without(n.options[i]!.voters, user));
const votes = (n: number) => (n === 1 ? "1 vote" : `${n} votes`);

function standing(s: State): string {
  const max = Math.max(0, ...s.options.map((o) => o.voters.length));
  if (max === 0) return "No votes yet";
  const top = s.options.filter((o) => o.voters.length === max);
  return top.length > 1 ? `Tie · ${votes(max)} each` : `${top[0]!.label} leads · ${votes(max)}`;
}

export default defineApp<State, Action, Local>({
  name: "Movie vote",
  summary: (s) => `${s.title} ${standing(s)}`,

  init: () => ({
    title: CHAT.title,
    note: CHAT.note,
    options: CHAT.movies.map((m, i) => ({ id: `p${i}`, label: m.label, detail: m.detail, voters: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (action.t !== "vote") return state;
    if (!inChat(ctx, meta.user)) return state;
    if (typeof action.option !== "string") return state;
    const target = state.options.find((o) => o.id === action.option);
    if (!target) return state;
    const had = target.voters.includes(meta.user);
    return {
      ...state,
      options: state.options.map((o) => {
        if (o.id === target.id) return { ...o, voters: had ? o.voters.filter((v) => v !== meta.user) : [...o.voters, meta.user] };
        return o.voters.includes(meta.user) ? { ...o, voters: o.voters.filter((v) => v !== meta.user) } : o;
      }),
    };
  },

  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
    return { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) };
  },

  invariants: {
    "no one appears twice in an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => new Set(allVoters(s)).size === allVoters(s).length,
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "option ids are unique": (s) => new Set(s.options.map((o) => o.id)).size === s.options.length,
    "the options are the movies from the chat": (s) =>
      s.options.length === CHAT.movies.length && s.options.every((o, i) => o.label === CHAT.movies[i]!.label && o.detail === CHAT.movies[i]!.detail),
  },

  transitions: {
    "a vote changes only the actor's own vote": (p, n, a, m) => a.t !== "vote" || p === n || othersSame(p, n, m.user),
    "after a vote the actor is on that option, or on none after tapping their pick": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const was = picksOf(p, m.user).includes(a.option);
      const now = picksOf(n, m.user);
      return was ? now.length === 0 : now.length === 1 && now[0] === a.option;
    },
    "a vote never changes ids, labels or order": (p, n) =>
      p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && n.options[i]!.detail === o.detail),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title and note never change": (p, n) => p.title === n.title && p.note === n.note,
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "vote", option: "zz" };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const voted = new Set(allVoters(state).filter((v) => members.some((m) => m.id === v)));
    const waiting = members.filter((m) => !voted.has(m.id));
    const total = Math.max(1, members.length);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${voted.size} of ${members.length} voted`} />
        <small>{state.note}</small>
        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.detail ? `${o.label} · ${o.detail}` : o.label}
              count={o.voters.length}
              total={total}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => dispatch({ t: "vote", option: o.id })}
            />
          ))}
        </div>
        <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
          <div style={{ fontWeight: 600 }}>{standing(state)}</div>
          {waiting.length ? (
            <small>{`Waiting on ${waiting.slice(0, 4).map((m) => (m.id === me ? "you" : m.name)).join(", ")}${waiting.length > 4 ? ` and ${waiting.length - 4} more` : ""}`}</small>
          ) : (
            <small>Everyone has voted</small>
          )}
        </div>
      </div>
    );
  },
});
