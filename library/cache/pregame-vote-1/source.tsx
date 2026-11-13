import { defineApp, CardHeader, OptionRow } from "@muse/app";

const CHAT = {
  title: "What are we doing at the pregame?",
  options: ["Beer pong", "CAH", "Throwback playlist", "Kings cup"],
  when: "Sat 9 PM at Noor's",
};

type Option = { id: string; label: string; voters: string[] };
type State = { title: string; options: Option[] };
type Action = { t: "vote"; option: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const voterIds = (s: State) => s.options.flatMap((o) => o.voters);
const voterCount = (s: State) => new Set(voterIds(s)).size;
const votedFor = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const optionsOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && without(o.voters, user) === without(n.options[i]!.voters, user));

function vote(s: State, user: string, id: unknown): State {
  const target = s.options.find((o) => o.id === id);
  if (!target) return s;
  const had = target.voters.includes(user);
  return {
    ...s,
    options: s.options.map((o) => {
      if (o.id === target.id) return { ...o, voters: had ? o.voters.filter((v) => v !== user) : [...o.voters, user] };
      if (!had && o.voters.includes(user)) return { ...o, voters: o.voters.filter((v) => v !== user) };
      return o;
    }),
  };
}

export default defineApp<State, Action, Local>({
  name: "Pregame poll",
  summary: (s) => {
    const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
    const n = voterCount(s);
    if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
    return `${s.title} ${top.label} leads with ${top.voters.length}. ${n} voted.`;
  },

  init: () => ({
    title: CHAT.title,
    options: CHAT.options.map((label, i) => ({ id: `p${i}`, label, voters: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote" && typeof action.option === "string") return vote(state, meta.user, action.option);
    return state;
  },

  onMembers: (state, ctx) =>
    state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))
      ? state
      : { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) },

  invariants: {
    "no one votes twice for an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => voterIds(s).length === voterCount(s),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "four options with unique ids and labels": (s) =>
      s.options.length === CHAT.options.length &&
      new Set(s.options.map((o) => o.id)).size === s.options.length &&
      s.options.every((o, i) => o.label === CHAT.options[i]),
  },

  transitions: {
    "a vote flips the voter's vote on that option and touches no one else": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user)),
    "a new vote leaves the voter on that option only": (p, n, a, m) =>
      a.t !== "vote" || p === n || !votedFor(n, a.option, m.user) || optionsOf(n, m.user).join() === String(a.option),
    "removing a vote leaves the voter on no option": (p, n, a, m) =>
      a.t !== "vote" || p === n || votedFor(n, a.option, m.user) || optionsOf(n, m.user).length === 0,
    "option ids and labels never change": (p, n) =>
      p.title === n.title && p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label),
    "only people in the chat change the poll": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.05) return { t: "vote", option: "none" };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = voterCount(state);
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={n === 0 ? `No votes yet · ${CHAT.when}` : `${n} of ${members.length} voted · ${CHAT.when}`}
        />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              count={o.voters.length}
              total={Math.max(1, members.length)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => dispatch({ t: "vote", option: o.id })}
            />
          ))}
        </div>
      </div>
    );
  },
});
