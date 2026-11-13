// Bad fixture: a divider is wider than the app and runs past its edge.
// Expect: stage render, rule outside-app.
import { defineApp, Button, CardHeader, Facepile, OptionRow, SystemLine } from "@muse/app";

// A group poll. Anyone in the chat can vote (one vote each, changeable), add an option, or remove
// an option they added while it has no votes. The person who started it can close and reopen it;
// while closed, votes are frozen.

type Option = { id: string; label: string; by: string };
type State = {
  question: string;
  owner: string;
  people: string[];
  options: Option[];
  votes: Record<string, string>;
  closed: boolean;
  final: Record<string, string> | null;
  finalOptions: string[] | null;
  nextId: number;
};
type Action =
  | { t: "vote"; option: string }
  | { t: "unvote" }
  | { t: "add"; label: string }
  | { t: "remove"; option: string }
  | { t: "close" }
  | { t: "reopen" };

const MAX_OPTIONS = 6;
const MAX_LABEL = 40;
const IDEAS = ["Sushi", "Ramen", "Tacos", "Pho", "  ", "sushi", "Dumplings", "A very long name for a place that keeps going on"];

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const isObj = (a: unknown): a is Record<string, unknown> => typeof a === "object" && a !== null && !Array.isArray(a);
const hasOption = (s: State, id: string) => s.options.some((o) => o.id === id);
const votesFor = (s: State, id: string) => Object.keys(s.votes).filter((u) => s.votes[u] === id).sort();
const sameVotes = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};
const withoutKey = (r: Record<string, string>, key: string) => {
  const out: Record<string, string> = {};
  for (const k of Object.keys(r).sort()) if (k !== key) out[k] = r[k]!;
  return out;
};

function leader(s: State): { option: Option; count: number } | null {
  let best: { option: Option; count: number } | null = null;
  for (const o of s.options) {
    const count = votesFor(s, o.id).length;
    if (count > 0 && (!best || count > best.count)) best = { option: o, count };
  }
  return best;
}

function vote(s: State, user: string, option: unknown): State {
  if (s.closed || typeof option !== "string" || !hasOption(s, option)) return s;
  if (!s.people.includes(user) || s.votes[user] === option) return s;
  return { ...s, votes: { ...s.votes, [user]: option } };
}

function unvote(s: State, user: string): State {
  if (s.closed || !(user in s.votes)) return s;
  return { ...s, votes: withoutKey(s.votes, user) };
}

function add(s: State, user: string, raw: unknown): State {
  if (s.closed || typeof raw !== "string" || !s.people.includes(user)) return s;
  const label = clean(raw);
  if (label.length === 0 || label.length > MAX_LABEL) return s;
  if (s.options.length >= MAX_OPTIONS) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  const option = { id: `o${s.nextId}`, label, by: user };
  return { ...s, options: [...s.options, option], nextId: s.nextId + 1 };
}

function remove(s: State, user: string, id: unknown): State {
  if (s.closed || typeof id !== "string") return s;
  const o = s.options.find((x) => x.id === id);
  if (!o || (o.by !== user && s.owner !== user)) return s;
  if (votesFor(s, id).length > 0) return s;
  return { ...s, options: s.options.filter((x) => x.id !== id) };
}

function close(s: State, user: string): State {
  if (s.closed || user !== s.owner) return s;
  return { ...s, closed: true, final: { ...s.votes }, finalOptions: s.options.map((o) => o.id) };
}

function reopen(s: State, user: string): State {
  if (!s.closed || user !== s.owner) return s;
  return { ...s, closed: false, final: null, finalOptions: null };
}

export default defineApp<State, Action>({
  name: "Dinner poll",

  summary: (s) => {
    const top = leader(s);
    const voters = Object.keys(s.votes).length;
    if (!top) return `${s.question} No votes yet.`;
    const verb = s.closed ? "won" : "leads";
    return `${s.question} ${top.option.label} ${verb} with ${top.count}. ${voters} voted.`;
  },

  init: (ctx) => ({
    question: "Where should we eat?",
    owner: ctx.members[0]?.id ?? "",
    people: ctx.members.map((m) => m.id),
    options: [
      { id: "o1", label: "Thai basil", by: ctx.members[0]?.id ?? "" },
      { id: "o2", label: "Pizza on 5th", by: ctx.members[0]?.id ?? "" },
    ],
    votes: {},
    closed: false,
    final: null,
    finalOptions: null,
    nextId: 3,
  }),

  reduce: (state, action, meta) => {
    const a: unknown = action;
    if (!isObj(a)) return state;
    switch (a.t) {
      case "vote":
        return vote(state, meta.user, a.option);
      case "unvote":
        return unvote(state, meta.user);
      case "add":
        return add(state, meta.user, a.label);
      case "remove":
        return remove(state, meta.user, a.option);
      case "close":
        return close(state, meta.user);
      case "reopen":
        return reopen(state, meta.user);
      default:
        return state;
    }
  },

  // People who left lose their votes and the options they added; a new owner takes over.
  onMembers: (s, ctx) => {
    const ids = ctx.members.map((m) => m.id);
    const options = s.options.filter((o) => ids.includes(o.by));
    const votes: Record<string, string> = {};
    for (const u of Object.keys(s.votes).sort()) if (ids.includes(u) && options.some((o) => o.id === s.votes[u])) votes[u] = s.votes[u]!;
    const owner = ids.includes(s.owner) ? s.owner : (ids[0] ?? "");
    return { ...s, people: ids, owner, options, votes, final: s.closed ? votes : null, finalOptions: s.closed ? options.map((o) => o.id) : null };
  },

  invariants: {
    "every vote points at an option": (s) => Object.keys(s.votes).every((u) => hasOption(s, s.votes[u]!)),
    "only people in the chat vote": (s, ctx) => Object.keys(s.votes).every((u) => ctx.members.some((m) => m.id === u)),
    "at most 6 options": (s) => s.options.length <= MAX_OPTIONS,
    "option ids are unique and issued in order": (s) =>
      new Set(s.options.map((o) => o.id)).size === s.options.length &&
      s.options.every((o) => Number(o.id.slice(1)) < s.nextId) &&
      s.options.every((o, i) => i === 0 || Number(o.id.slice(1)) > Number(s.options[i - 1]!.id.slice(1))),
    "labels are unique, trimmed, 1 to 40 characters": (s) =>
      new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length &&
      s.options.every((o) => o.label === clean(o.label) && o.label.length >= 1 && o.label.length <= MAX_LABEL),
    "votes are frozen while closed": (s) => (s.closed ? s.final !== null && sameVotes(s.votes, s.final) : s.final === null),
    "options are frozen while closed": (s) =>
      s.closed
        ? s.finalOptions !== null && s.finalOptions.join() === s.options.map((o) => o.id).join()
        : s.finalOptions === null,
    "options come from people in the chat": (s, ctx) => s.options.every((o) => ctx.members.some((m) => m.id === o.by)),
    "the owner is in the chat": (s, ctx) => ctx.members.some((m) => m.id === s.owner),
  },

  arbitrary: (s, user, r) => {
    const roll = r.int(100);
    if (roll < 50 && s.options.length) return { t: "vote", option: r.pick(s.options).id };
    if (roll < 58) return { t: "unvote" };
    if (roll < 75) return { t: "add", label: r.pick(IDEAS) };
    if (roll < 85 && s.options.length) return { t: "remove", option: r.pick(s.options).id };
    if (roll < 93) return { t: "close" };
    return { t: "reopen" };
  },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const voters = Object.keys(state.votes).sort();
    const mine = state.votes[me];
    const draft = typeof local.draft === "string" ? local.draft : "";
    const canAdd = !state.closed && clean(draft).length > 0 && state.options.length < MAX_OPTIONS;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };

    return (
      <div>
        <CardHeader
          title={state.question}
          subtitle={voters.length === 1 ? "1 vote" : `${voters.length} votes`}
        />
        <div style={{ width: 640, height: 12, margin: "4px 0", borderRadius: 6, background: theme.color.divider }} />
        {state.closed ? (
          <SystemLine actor={nameOf(state.owner)}>closed the poll</SystemLine>
        ) : null}
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => {
            const who = votesFor(state, o.id);
            return (
              <OptionRow
                key={o.id}
                label={o.label}
                count={who.length}
                total={Math.max(1, voters.length)}
                voters={who}
                selected={mine === o.id}
                onClick={() => dispatch(mine === o.id ? { t: "unvote" } : { t: "vote", option: o.id })}
              />
            );
          })}
        </div>
        {voters.length > 0 ? <Facepile users={voters} max={5} /> : null}
        {!state.closed && state.options.length < MAX_OPTIONS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              maxLength={MAX_LABEL}
              placeholder="Add an option"
              aria-label="Add an option"
              onInput={(e) => setLocal({ draft: e.currentTarget.value })}
            />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {me === state.owner ? (
          <div style={{ marginTop: 8 }}>
            {state.closed ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "reopen" })}>
                Reopen
              </Button>
            ) : (
              <Button kind="secondary" onClick={() => dispatch({ t: "close" })}>
                Close poll
              </Button>
            )}
          </div>
        ) : null}
      </div>
    );
  },
});
