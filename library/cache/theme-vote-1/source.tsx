import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";

// Theme poll. Everyone votes once, the top option gets locked, and votes stop.

const P = {
  title: "What should the theme be?",
  when: "Rhea's birthday is the 22nd",
  rule: "Most votes wins · no takebacks",
  options: ["2000s Prom", "Disney Villains", "Y2K Pop Star"],
};

type Option = { id: string; label: string; voters: string[] };
type State = { title: string; options: Option[]; lockedId: string | null; lockedBy: string | null };
type Action = { t: "vote"; option: string } | { t: "lock" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const voterCount = (s: State) => new Set(s.options.flatMap((o) => o.voters)).size;
const votedFor = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const optionsOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const maxVotes = (s: State) => s.options.reduce((m, o) => Math.max(m, o.voters.length), 0);
const countOf = (s: State, id: string | null) => s.options.find((o) => o.id === id)?.voters.length ?? -1;

const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && without(o.voters, user) === without(n.options[i]!.voters, user));

function vote(s: State, user: string, id: unknown): State {
  if (typeof id !== "string") return s;
  const target = s.options.find((o) => o.id === id);
  if (!target) return s;
  const had = target.voters.includes(user);
  return {
    ...s,
    options: s.options.map((o) => {
      if (o.id === target.id) return { ...o, voters: had ? o.voters.filter((v) => v !== user) : [...o.voters, user] };
      return o.voters.includes(user) ? { ...o, voters: o.voters.filter((v) => v !== user) } : o;
    }),
  };
}

function lock(s: State, user: string): State {
  const top = maxVotes(s);
  if (top === 0) return s;
  const winner = s.options.find((o) => o.voters.length === top);
  if (!winner) return s;
  return { ...s, lockedId: winner.id, lockedBy: user };
}

export default defineApp<State, Action, Local>({
  name: "Theme poll",
  summary: (s) => {
    const won = s.options.find((o) => o.id === s.lockedId);
    if (won) return `${s.title} Locked: ${won.label}.`;
    const n = voterCount(s);
    return n === 0 ? `${s.title} No votes yet.` : `${s.title} ${n} voted.`;
  },

  init: () => ({
    title: P.title,
    options: P.options.map((label, i) => ({ id: `p${i}`, label, voters: [] })),
    lockedId: null,
    lockedBy: null,
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (state.lockedId !== null) return state;
    if (action.t === "vote") return vote(state, meta.user, action.option);
    if (action.t === "lock") return lock(state, meta.user);
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
    return { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) };
  },

  invariants: {
    "no one appears twice in an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => s.options.flatMap((o) => o.voters).length === voterCount(s),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "options have unique ids and labels": (s) =>
      s.options.length === P.options.length &&
      new Set(s.options.map((o) => o.id)).size === s.options.length &&
      new Set(s.options.map((o) => o.label)).size === s.options.length &&
      s.options.every((o) => o.label.length > 0),
    "a locked theme is an existing option and has a locker": (s) =>
      (s.lockedId === null && s.lockedBy === null) || (s.lockedId !== null && s.lockedBy !== null && s.options.some((o) => o.id === s.lockedId)),
  },

  transitions: {
    "a vote puts the actor on that option or takes them off, and no one else changes": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (othersSame(p, n, m.user) &&
        (votedFor(p, a.option, m.user) ? optionsOf(n, m.user).length === 0 : optionsOf(n, m.user).join() === String(a.option))),
    "nothing is voted once the theme is locked": (p, n, a) => a.t !== "vote" || p.lockedId === null || p === n,
    "a lock picks the earliest option with the most votes and records the actor": (p, n, a, m) =>
      a.t !== "lock" ||
      p === n ||
      (p.lockedId === null &&
        n.lockedId !== null &&
        n.lockedBy === m.user &&
        countOf(p, n.lockedId) === maxVotes(p) &&
        maxVotes(p) > 0 &&
        p.options.find((o) => o.voters.length === maxVotes(p))?.id === n.lockedId &&
        JSON.stringify(p.options) === JSON.stringify(n.options)),
    "once locked, the theme never changes": (p, n) => p.lockedId === null || (n.lockedId === p.lockedId && n.lockedBy === p.lockedBy),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "option ids and labels never change": (p, n) =>
      p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label),
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "lock" };
    return { t: "vote", option: r.next() < 0.05 ? "zz" : r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = voterCount(state);
    const won = state.options.find((o) => o.id === state.lockedId);
    const lockerName = state.lockedBy === null ? "" : state.lockedBy === me ? "you" : (members.find((m) => m.id === state.lockedBy)?.name ?? "someone");
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={won ? `Locked · ${won.label}` : `${P.when} · ${n} of ${members.length} voted`}
        />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              count={o.voters.length}
              total={Math.max(1, n)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => {
                if (!won) dispatch({ t: "vote", option: o.id });
              }}
            />
          ))}
        </div>
        {won ? (
          <div style={{ marginTop: 8 }}>
            <h2>{won.label}</h2>
            <small>Locked by {lockerName}</small>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            <small style={{ flex: 1 }}>{P.rule}</small>
            <Button kind="primary" disabled={n === 0} onClick={() => dispatch({ t: "lock" })}>
              Lock
            </Button>
          </div>
        )}
      </div>
    );
  },
});
