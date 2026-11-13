import { defineApp, Button, CardHeader, OptionRow, Toast } from "@muse/app";

// Poll with add-option. Everyone votes; anyone can add an option. Single choice moves your vote,
// multi choice toggles it.

type Params = {
  /** Card title, a plain question: "Where should we eat?" */
  title: string;
  /** Options people already mentioned in the chat, 0 to 8. */
  options: string[];
  /** The labels in `options` that Muse proposed and nobody in the chat said, else empty. */
  suggested: string[];
  /** true: a person can vote for several options. */
  multi: boolean;
  /** true: anyone can add an option. */
  allowAdd: boolean;
};

// @params
const P: Params = {
  title: "Where should we eat?",
  options: ["Thai Basil", "Pizza place on 5th", "Taco truck"],
  suggested: [],
  multi: false,
  allowAdd: true,
};
// @end params

type Option = { id: string; label: string; voters: string[]; suggested?: boolean };
type State = { title: string; multi: boolean; allowAdd: boolean; options: Option[] };
type Action = { t: "vote"; option: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_OPTIONS = 8;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const voterCount = (s: State) => new Set(s.options.flatMap((o) => o.voters)).size;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const votedFor = (s: State, option: unknown, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
const optionsOf = (s: State, user: string) => s.options.filter((o) => o.voters.includes(user)).map((o) => o.id);

const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
/** Same options, and every voter other than `user` unchanged. */
const othersSame = (p: State, n: State, user: string) =>
  p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label && without(o.voters, user) === without(n.options[i]!.voters, user));

function vote(s: State, user: string, id: unknown): State {
  const target = s.options.find((o) => o.id === id);
  if (!target) return s;
  const had = target.voters.includes(user);
  return {
    ...s,
    options: s.options.map((o) => {
      if (o.id === target.id) return { ...o, voters: had ? o.voters.filter((v) => v !== user) : [...o.voters, user] };
      // Single choice: voting here takes your vote off every other option.
      if (!s.multi && !had && o.voters.includes(user)) return { ...o, voters: o.voters.filter((v) => v !== user) };
      return o;
    }),
  };
}

function add(s: State, user: string, raw: unknown, seq: number): State {
  if (!s.allowAdd || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.options.length >= MAX_OPTIONS) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  const added: Option = { id: `o${seq}`, label, voters: [] };
  return vote({ ...s, options: [...s.options, added] }, user, added.id);
}

export default defineApp<State, Action, Local>({
  name: "Poll",
  summary: (s) => {
    const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
    const n = voterCount(s);
    if (!top || top.voters.length === 0) return `${s.title} No votes yet.`;
    return `${s.title} ${top.label} leads with ${top.voters.length}. ${n} voted.`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const raw of P.options) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      const sug = P.suggested.some((x) => clean(x).toLowerCase() === label.toLowerCase());
      options.push(sug ? { id: `p${options.length}`, label, voters: [], suggested: true } : { id: `p${options.length}`, label, voters: [] });
    }
    return { title: clean(P.title).slice(0, 60) || "Poll", multi: P.multi, allowAdd: P.allowAdd || options.length < 2, options };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.option);
    if (action.t === "add") return add(state, meta.user, action.label, meta.seq);
    return state;
  },

  // Someone left: their votes go with them. Someone joined: nothing to do, they can vote at once.
  onMembers: (state, ctx) => ({ ...state, options: state.options.map((o) => (o.voters.every((v) => inChat(ctx, v)) ? o : { ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) }),

  invariants: {
    "no one votes twice for an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "single choice means one vote each": (s) => s.multi || s.options.flatMap((o) => o.voters).length === voterCount(s),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => inChat(ctx, v))),
    "labels are unique, ids are unique": (s) =>
      new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length && new Set(s.options.map((o) => o.id)).size === s.options.length,
    "at most 8 options, each 1 to 40 characters": (s) =>
      s.options.length <= MAX_OPTIONS && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
  },

  transitions: {
    "a vote flips the voter's vote on that option and touches no one else": (p, n, a, m) =>
      a.t !== "vote" || p === n || (othersSame(p, n, m.user) && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user)),
    "multi choice: a vote leaves the voter's other options as they were": (p, n, a, m) =>
      a.t !== "vote" || p === n || !n.multi || optionsOf(p, m.user).filter((o) => o !== a.option).join() === optionsOf(n, m.user).filter((o) => o !== a.option).join(),
    "single choice: a new vote leaves the voter on that option only": (p, n, a, m) =>
      a.t !== "vote" || p === n || n.multi || !votedFor(n, a.option, m.user) || optionsOf(n, m.user).join() === String(a.option),
    "an added option comes last, with the adder's vote": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.options.at(-1);
      return n.options.length === p.options.length + 1 && !!last && last.label === clean(a.label) && last.voters.length === 1 && last.voters[0] === m.user && last.id === `o${m.seq}`;
    },
    "adding is allowed only when the poll lets people add": (p, n, a) => a.t !== "add" || p === n || p.allowAdd,
    "only people in the chat change the poll": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the rules of the poll never change": (p, n) => p.multi === n.multi && p.allowAdd === n.allowAdd && p.title === n.title,
  },

  arbitrary: (s, _user, r) => {
    if (s.allowAdd && (s.options.length === 0 || r.next() < 0.2))
      return { t: "add", label: r.pick(["Sushi", "Ramen", "  burgers ", "Pho", "", "Dumplings", s.options[0]?.label ?? "Tacos"]) };
    return s.options.length ? { t: "vote", option: r.pick(s.options).id } : null;
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, dispatch, local, setLocal }) => {
    const n = voterCount(state);
    const canAdd = state.allowAdd && clean(local.draft).length > 0 && state.options.length < MAX_OPTIONS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={n === 0 ? "No votes yet" : n === 1 ? "1 person voted" : `${n} people voted`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              count={o.voters.length}
              total={Math.max(1, n)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              suggested={o.suggested}
              onClick={() => dispatch({ t: "vote", option: o.id })}
            />
          ))}
        </div>
        {state.allowAdd && state.options.length < MAX_OPTIONS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add option" aria-label="Add option" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {local.toast ? <Toast key={local.toast}>Option added</Toast> : null}
      </div>
    );
  },
});
