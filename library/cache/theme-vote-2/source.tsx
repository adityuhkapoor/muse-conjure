import { defineApp, CardHeader, OptionRow } from "@muse/app";

// Costume theme poll. One vote each; a cast vote is locked. Most votes leads.

const P = {
  title: "Costume theme for Saturday",
  options: ["Scooby Doo gang", "The Office", "White Lotus", "Mario Kart"],
};

type Option = { id: string; label: string; voters: string[] };
type State = { title: string; options: Option[] };
type Action = { t: "vote"; option: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const allVoters = (s: State) => s.options.flatMap((o) => o.voters);
const hasVoted = (s: State, user: string) => allVoters(s).includes(user);
const optionsOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const total = (s: State) => allVoters(s).length;

const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && without(o.voters, user) === without(n.options[i]!.voters, user));

const leaderLine = (s: State) => {
  const max = Math.max(0, ...s.options.map((o) => o.voters.length));
  if (max === 0) return "No votes yet";
  const top = s.options.filter((o) => o.voters.length === max);
  return top.length > 1 ? "Tied" : `${top[0]!.label} leads with ${max}`;
};

export default defineApp<State, Action, Local>({
  name: "Costume poll",
  summary: (s, ctx) => `${s.title} · ${leaderLine(s)} · ${total(s)} of ${ctx.members.length} voted`,

  init: () => ({
    title: P.title,
    options: P.options.slice(0, 4).map((label, i) => ({ id: `p${i}`, label, voters: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "vote") return state;
    if (typeof action.option !== "string") return state;
    const target = state.options.find((o) => o.id === action.option);
    if (!target) return state;
    if (hasVoted(state, meta.user)) return state;
    return {
      ...state,
      options: state.options.map((o) => (o.id === target.id ? { ...o, voters: [...o.voters, meta.user] } : o)),
    };
  },

  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
    return { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) };
  },

  invariants: {
    "no one appears twice in an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => allVoters(s).length === new Set(allVoters(s)).size,
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "ids are unique, at most 4 options, labels not empty": (s) =>
      s.options.length <= 4 && new Set(s.options.map((o) => o.id)).size === s.options.length && s.options.every((o) => o.label.length > 0),
  },

  transitions: {
    "a vote adds the actor to the named option and no one else changes": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && optionsOf(n, m.user).join() === String(a.option) && optionsOf(p, m.user).length === 0),
    "a cast vote never changes": (p, n, a, m) =>
      a.t !== "vote" || p === n || optionsOf(p, m.user).length === 0,
    "a valid vote adds exactly one vote": (p, n, a) => a.t !== "vote" || p === n || total(n) === total(p) + 1,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "option ids and labels never change": (p, n) =>
      p.title === n.title && p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label),
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "vote", option: "zz" };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = total(state);
    const voted = hasVoted(state, me);
    return (
      <div>
        <CardHeader title={state.title} subtitle={voted ? `${n} of ${members.length} voted` : `${n} of ${members.length} voted · tap to vote`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              count={o.voters.length}
              total={Math.max(1, members.length)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => {
                if (!voted) dispatch({ t: "vote", option: o.id });
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
          <div style={{ fontWeight: 600 }}>{leaderLine(state)}</div>
          <small>{voted ? "Your vote is locked" : "Most votes wins · votes lock"}</small>
        </div>
      </div>
    );
  },
});
