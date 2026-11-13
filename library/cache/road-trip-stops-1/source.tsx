import { defineApp, Button, CardHeader, OptionRow, Toast } from "@muse/app";

// Stops poll. Everyone picks up to 3 stops for the drive; anyone can add a stop.

const CHAT = {
  title: "Which stops on the drive?",
  maxStops: 3,
  stops: [
    { label: "Graeter's", note: "ice cream" },
    { label: "Skyline Chili", note: "lunch" },
    { label: "Red River Gorge", note: "1 hr hike" },
    { label: "Berea pottery", note: "30 min" },
  ],
};

type Option = { id: string; label: string; note: string; voters: string[] };
type State = { title: string; maxStops: number; options: Option[] };
type Action = { t: "vote"; option: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_OPTIONS = 6;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const picksOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).length;
const votedFor = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const totalVotes = (s: State) => s.options.reduce((n, o) => n + o.voters.length, 0);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length &&
  p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && n.options[i]!.note === o.note && without(o.voters, user) === without(n.options[i]!.voters, user));

function vote(s: State, user: string, id: unknown): State {
  const target = s.options.find((o) => o.id === id);
  if (!target) return s;
  const had = target.voters.includes(user);
  if (!had && picksOf(s, user) >= s.maxStops) return s;
  return {
    ...s,
    options: s.options.map((o) =>
      o.id !== target.id ? o : { ...o, voters: had ? o.voters.filter((v) => v !== user) : [...o.voters, user] },
    ),
  };
}

function add(s: State, user: string, raw: unknown, seq: number): State {
  if (typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.options.length >= MAX_OPTIONS) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  const mayVote = picksOf(s, user) < s.maxStops;
  const added: Option = { id: `o${seq}`, label, note: "", voters: mayVote ? [user] : [] };
  return { ...s, options: [...s.options, added] };
}

export default defineApp<State, Action, Local>({
  name: "Stops poll",
  summary: (s) => {
    const voters = new Set(s.options.flatMap((o) => o.voters)).size;
    return `${s.title} ${totalVotes(s)} votes · ${voters} voted`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const st of CHAT.stops) {
      const label = clean(st.label).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      options.push({ id: `p${options.length}`, label, note: clean(st.note).slice(0, 30), voters: [] });
    }
    return { title: CHAT.title, maxStops: CHAT.maxStops, options };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.option);
    if (action.t === "add") return add(state, meta.user, action.label, meta.seq);
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.voters.every((v) => inChat(ctx, v)))) return state;
    return { ...state, options: state.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) };
  },

  invariants: {
    "no one votes twice for an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "no one has more picks than the stop limit": (s) => {
      const everyone = new Set(s.options.flatMap((o) => o.voters));
      return [...everyone].every((u) => picksOf(s, u) <= s.maxStops);
    },
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "ids are unique and labels are unique ignoring case": (s) =>
      new Set(s.options.map((o) => o.id)).size === s.options.length && new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length,
    "at most 6 stops, each label 1 to 40 characters": (s) =>
      s.options.length <= MAX_OPTIONS && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
  },

  transitions: {
    "a vote flips only the actor's vote on that stop": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user)),
    "a vote that adds the actor keeps them within the stop limit": (p, n, a, m) =>
      a.t !== "vote" || p === n || !votedFor(n, a.option, m.user) || picksOf(n, m.user) <= n.maxStops,
    "an added stop goes last with the cleaned label and at most the actor's vote": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.options.at(-1);
      return (
        n.options.length === p.options.length + 1 &&
        !!last &&
        last.id === `o${m.seq}` &&
        last.label === clean(a.label) &&
        last.voters.every((v) => v === m.user) &&
        last.voters.length <= 1 &&
        p.options.every((o, i) => n.options[i] === o || (n.options[i]!.id === o.id && n.options[i]!.voters.join() === o.voters.join()))
      );
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "title and stop limit never change": (p, n) => p.title === n.title && p.maxStops === n.maxStops,
  },

  arbitrary: (s, _user, r) => {
    if (s.options.length === 0 || r.next() < 0.2)
      return { t: "add", label: r.pick(["Waffle House", "  Gas   station ", "", "Dinner in Knoxville", "Skyline Chili", "Cumberland Falls"]) };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const mine = picksOf(state, me);
    const full = mine >= state.maxStops;
    const votes = totalVotes(state);
    const canAdd = clean(local.draft).length > 0 && !full;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${votes} ${votes === 1 ? "vote" : "votes"} · pick up to ${state.maxStops}`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.note ? `${o.label} · ${o.note}` : o.label}
              count={o.voters.length}
              total={Math.max(1, members.length)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => dispatch({ t: "vote", option: o.id })}
            />
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <small>{full ? `${mine} of ${state.maxStops} picks used · Remove one to switch` : `${mine} of ${state.maxStops} picks used`}</small>
        </div>
        {state.options.length < MAX_OPTIONS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add a stop" aria-label="Add a stop" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {local.toast ? <Toast key={local.toast}>Stop added</Toast> : null}
      </div>
    );
  },
});
