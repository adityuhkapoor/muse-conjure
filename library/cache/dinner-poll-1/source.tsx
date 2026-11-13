import { defineApp, CardHeader, OptionRow } from "@muse/app";

// Single-choice dinner poll. Tap a place to vote; tap it again to take your vote back.

const CHAT = {
  title: "Where should we eat?",
  options: [
    { label: "Dumpling House", note: "40 min wait on Thursdays" },
    { label: "Siam Corner", note: "" },
    { label: "El Patron", note: "$2 taco deal until 8" },
    { label: "Joe's", note: "" },
  ],
  deadline: "Everything gets packed at 7:30",
};

type Option = { id: string; label: string; note: string; voters: string[] };
type State = { title: string; options: Option[] };
type Action = { t: "vote"; option: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const votedFor = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const optionsOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every(
    (o, i) =>
      n.options[i]!.id === o.id &&
      n.options[i]!.label === o.label &&
      n.options[i]!.note === o.note &&
      without(o.voters, user) === without(n.options[i]!.voters, user),
  );
const allVoters = (s: State) => s.options.flatMap((o) => o.voters);

export default defineApp<State, Action, Local>({
  name: "Dinner poll",
  summary: (s) => {
    const n = new Set(allVoters(s)).size;
    const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
    if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
    return `${s.title} ${top.label} leads with ${top.voters.length}. ${n} voted.`;
  },

  init: () => ({
    title: CHAT.title,
    options: CHAT.options.map((o, i) => ({ id: `p${i}`, label: o.label, note: o.note, voters: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "vote" || typeof action.option !== "string") return state;
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
    "each person votes for at most one place": (s) => allVoters(s).length === new Set(allVoters(s)).size,
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "the four places keep their ids and labels": (s) =>
      s.options.length === CHAT.options.length &&
      s.options.every((o, i) => o.id === `p${i}` && o.label === CHAT.options[i]!.label && o.note === CHAT.options[i]!.note),
  },

  transitions: {
    "a vote changes only the actor's own vote": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user)),
    "after a vote the actor is on that place only, or on none if they took it back": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const had = votedFor(p, a.option, m.user);
      const mine = optionsOf(n, m.user);
      return had ? mine.length === 0 : mine.length === 1 && mine[0] === a.option;
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title never changes": (p, n) => p.title === n.title,
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "vote", option: "nope" };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = new Set(allVoters(state)).size;
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={n === 0 ? "No votes yet" : `${n} of ${members.length} voted`}
        />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <div key={o.id}>
              <OptionRow
                label={o.label}
                count={o.voters.length}
                total={Math.max(1, members.length)}
                voters={o.voters}
                selected={o.voters.includes(me)}
                onClick={() => dispatch({ t: "vote", option: o.id })}
              />
              {o.note ? (
                <small style={{ display: "block", padding: "0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.note}</small>
              ) : null}
            </div>
          ))}
        </div>
        <small style={{ display: "block", marginTop: 8 }}>{CHAT.deadline}</small>
      </div>
    );
  },
});
