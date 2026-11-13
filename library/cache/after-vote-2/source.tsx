import { defineApp, CardHeader, OptionRow } from "@muse/app";

const C = {
  title: "Where do we go after trivia?",
  note: "Trivia ends around 10:30",
  options: [
    { label: "Slice Brothers", note: "Pizza · open late" },
    { label: "Pixel Palace", note: "Arcade, skee ball · closes midnight on Thursdays" },
    { label: "Boba Haus", note: "Bubble tea · quick and cheap" },
  ],
};

type Option = { id: string; label: string; note: string; voters: string[] };
type State = { title: string; note: string; options: Option[] };
type Action = { t: "vote"; option: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const onOption = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const allVoters = (s: State) => s.options.flatMap((o) => o.voters);
const voterCount = (s: State) => new Set(allVoters(s)).size;
const mine = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && without(o.voters, user) === without(n.options[i]!.voters, user));

function leaderLine(s: State): string {
  const top = Math.max(0, ...s.options.map((o) => o.voters.length));
  if (top === 0) return "No votes yet";
  const leaders = s.options.filter((o) => o.voters.length === top);
  const votes = top === 1 ? "1 vote" : `${top} votes`;
  if (leaders.length > 1) return `Tied at ${votes}`;
  return `${leaders[0]!.label} leads with ${votes}`;
}

export default defineApp<State, Action, Local>({
  name: "After-trivia vote",
  summary: (s) => `${s.title} ${leaderLine(s)}. ${voterCount(s)} voted.`,

  init: () => ({
    title: C.title,
    note: C.note,
    options: C.options.map((o, i) => ({ id: `p${i}`, label: o.label, note: o.note, voters: [] })),
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
        if (!had && o.voters.includes(meta.user)) return { ...o, voters: o.voters.filter((v) => v !== meta.user) };
        return o;
      }),
    };
  },

  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
    return { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) };
  },

  invariants: {
    "no one appears twice on a place": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => allVoters(s).length === voterCount(s),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "there are three places with unique ids and labels": (s) =>
      s.options.length === 3 &&
      new Set(s.options.map((o) => o.id)).size === 3 &&
      s.options.every((o) => o.label.length > 0),
  },

  transitions: {
    "a vote flips the actor on that place and touches no one else": (p, n, a, m) =>
      a.t !== "vote" || p === n || (onOption(p, a.option, m.user) !== onOption(n, a.option, m.user) && othersSame(p, n, m.user)),
    "a vote that adds the actor leaves them on that place only": (p, n, a, m) =>
      a.t !== "vote" || p === n || !onOption(n, a.option, m.user) || mine(n, m.user).join() === String(a.option),
    "a vote that removes the actor leaves them on no place": (p, n, a, m) =>
      a.t !== "vote" || p === n || onOption(n, a.option, m.user) || mine(n, m.user).length === 0,
    "places never change": (p, n) =>
      p.title === n.title &&
      p.note === n.note &&
      p.options.length === n.options.length &&
      p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && n.options[i]!.note === o.note),
    "only people in the chat change the vote": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "vote", option: "zz" };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = voterCount(state);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${n} of ${members.length} voted`} />
        <small>{state.note}</small>
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
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
              <small style={{ display: "block", paddingLeft: 12 }}>{o.note}</small>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <small>{leaderLine(state)}</small>
        </div>
      </div>
    );
  },
});
