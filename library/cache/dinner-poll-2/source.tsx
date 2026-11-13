import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";

// Food vote for the exit. Single choice: one vote per person. Anyone can add a place.

const C = {
  title: "Where should we eat?",
  options: ["Rosie's", "Wegmans", "Culver's"],
  note: "Be in Buffalo by 6 · It's 2:15 now",
};

type Option = { id: string; label: string; voters: string[] };
type State = { note: string; options: Option[] };
type Action = { t: "vote"; option: string } | { t: "add"; label: string };
type Local = { draft: string };

const MAX_OPTIONS = 6;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const allVotes = (s: State) => s.options.flatMap((o) => o.voters);
const voterCount = (s: State) => new Set(allVotes(s)).size;
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

function add(s: State, user: string, raw: unknown, seq: number): State {
  if (typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.options.length >= MAX_OPTIONS) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  const added: Option = { id: `o${seq}`, label, voters: [] };
  return vote({ ...s, options: [...s.options, added] }, user, added.id);
}

const leaders = (s: State) => {
  const max = Math.max(0, ...s.options.map((o) => o.voters.length));
  return { max, top: max > 0 ? s.options.filter((o) => o.voters.length === max) : [] };
};

export default defineApp<State, Action, Local>({
  name: "Food vote",
  summary: (s) => {
    const { max, top } = leaders(s);
    if (!top.length) return `${C.title} No votes yet.`;
    if (top.length === 1) return `${C.title} ${top[0]!.label} leads with ${max}. ${voterCount(s)} voted.`;
    return `${C.title} Tied at ${max}: ${top.map((o) => o.label).join(", ")}.`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const raw of C.options) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      options.push({ id: `p${options.length}`, label, voters: [] });
    }
    return { note: C.note, options };
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
    "no one appears twice in an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "each person has at most one vote": (s) => allVotes(s).length === voterCount(s),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "ids and labels are unique": (s) =>
      new Set(s.options.map((o) => o.id)).size === s.options.length && new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length,
    "at most 6 options, each 1 to 40 characters": (s) =>
      s.options.length <= MAX_OPTIONS && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
  },

  transitions: {
    "a vote flips the actor on that option and touches no one else": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user)),
    "a vote that lands leaves the actor on that option only": (p, n, a, m) =>
      a.t !== "vote" || p === n || !votedFor(n, a.option, m.user) || optionsOf(n, m.user).join() === String(a.option),
    "an add appends one option last with the actor as its only voter": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      if (typeof a.label !== "string") return false;
      const last = n.options.at(-1);
      return n.options.length === p.options.length + 1 && !!last && last.label === clean(a.label) && last.id === `o${m.seq}` && last.voters.length === 1 && last.voters[0] === m.user;
    },
    "an add leaves everyone else's votes as they were": (p, n, a, m) =>
      a.t !== "add" || p === n || p.options.every((o, i) => without(o.voters, m.user) === without(n.options[i]!.voters, m.user) && o.id === n.options[i]!.id),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the note never changes": (p, n) => p.note === n.note,
  },

  arbitrary: (s, _user, r) => {
    if (s.options.length === 0 || r.next() < 0.2) return { t: "add", label: r.pick(["Sushi bar", "Tim Hortons", "  diner  ", "", "Wendy's", s.options[0]?.label ?? "Pizza"]) };
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const n = voterCount(state);
    const { max, top } = leaders(state);
    const canAdd = clean(local.draft).length > 0;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    const lead =
      top.length === 0
        ? "No votes yet · tap a place"
        : top.length === 1
          ? `${top[0]!.label} leads · ${max} ${max === 1 ? "vote" : "votes"}`
          : `Tie · ${top.map((o) => o.label).join(", ")} · ${max} each`;
    return (
      <div>
        <CardHeader title={C.title} subtitle={`${n} of ${members.length} voted`} />
        <small style={{ display: "block", color: theme.color.secondaryText, marginBottom: 6 }}>{state.note}</small>
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
        <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: theme.radius.button, background: top.length ? theme.color.selected : theme.color.input, fontWeight: 600, fontSize: theme.type.meta }}>
          {lead}
        </div>
        {state.options.length < MAX_OPTIONS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add a place" aria-label="Add a place" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
      </div>
    );
  },
});
