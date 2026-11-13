import { defineApp, Button, CardHeader, OptionRow, Toast, type Ctx } from "@muse/app";

type Option = { id: string; label: string; by: string; voters: string[] };
type State = { options: Option[] };
type Action = { t: "vote"; option: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_OPTIONS = 8;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const isMember = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const votedFor = (s: State, option: string, user: string) => s.options.some((o) => o.id === option && o.voters.includes(user));
/** Every vote except `user`'s, as one string. */
const othersVotes = (s: State, user: string) => s.options.map((o) => `${o.id}:${o.voters.filter((v) => v !== user).join(",")}`).join("|");
const people = (s: State) => new Set(s.options.flatMap((o) => o.voters)).size;

export default defineApp<State, Action, Local>({
  name: "Dinner poll",
  summary: (s) => {
    const top = [...s.options].sort((a, b) => b.voters.length - a.voters.length)[0];
    if (!top || top.voters.length === 0) return "Where should we eat? No votes yet.";
    return `Where should we eat? ${top.label} leads with ${top.voters.length}. ${people(s)} voted.`;
  },

  init: () => ({
    options: [
      { id: "thai", label: "Thai Basil", by: "", voters: [] },
      { id: "pizza", label: "Pizza place on 5th", by: "", voters: [] },
      { id: "tacos", label: "Taco truck", by: "", voters: [] },
    ],
  }),

  reduce: (state, action, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return state;
    if (action.t === "vote") {
      if (typeof action.option !== "string" || !state.options.some((o) => o.id === action.option)) return state;
      return {
        options: state.options.map((o) =>
          o.id !== action.option
            ? o
            : { ...o, voters: o.voters.includes(meta.user) ? o.voters.filter((v) => v !== meta.user) : [...o.voters, meta.user] },
        ),
      };
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (label.length === 0 || label.length > MAX_LABEL || state.options.length >= MAX_OPTIONS) return state;
      if (state.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return state;
      return { options: [...state.options, { id: `o${meta.seq}`, label, by: meta.user, voters: [meta.user] }] };
    }
    return state;
  },

  onMembers: (s, ctx) => ({ options: s.options.map((o) => ({ ...o, voters: o.voters.filter((v) => isMember(ctx, v)) })) }),

  invariants: {
    "no one votes twice for an option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => isMember(ctx, v))),
    "option labels are unique": (s) => new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length,
    "option ids are unique": (s) => new Set(s.options.map((o) => o.id)).size === s.options.length,
    "at most 8 options, each 1 to 40 characters": (s) =>
      s.options.length <= MAX_OPTIONS && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
  },

  transitions: {
    "a vote changes only the voter's own vote": (p, n, a, m) => a.t !== "vote" || othersVotes(p, m.user) === othersVotes(n, m.user),
    "a valid vote toggles it": (p, n, a, m, ctx) =>
      a.t !== "vote" || !isMember(ctx, m.user) || !p.options.some((o) => o.id === a.option) || votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user),
    "options are kept in order": (p, n) => p.options.every((o, i) => n.options[i]?.id === o.id && n.options[i]?.label === o.label),
    "an add appends one option with its sender's vote": (p, n, a, m) => {
      if (n.options.length === p.options.length) return true;
      const o = n.options[n.options.length - 1];
      return a.t === "add" && n.options.length === p.options.length + 1 && o !== undefined && o.by === m.user && o.voters.join() === m.user;
    },
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.2) return { t: "add", label: r.pick(["Sushi", "Ramen", "Burgers", "Pho", "  ", "Thai Basil", "Dumplings", "a very long name for a place to eat dinner at"]) };
    const o = s.options.length ? r.pick(s.options) : null;
    return o ? { t: "vote", option: o.id } : null;
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, dispatch, local, setLocal }) => {
    const voted = people(state);
    const canAdd = clean(local.draft).length > 0 && state.options.length < MAX_OPTIONS;
    const add = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };

    return (
      <div>
        <CardHeader title="Where should we eat?" subtitle={voted === 0 ? "No votes yet" : voted === 1 ? "1 person voted" : `${voted} people voted`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              count={o.voters.length}
              total={Math.max(1, voted)}
              voters={o.voters}
              selected={o.voters.includes(me)}
              onClick={() => dispatch({ t: "vote", option: o.id })}
            />
          ))}
        </div>
        {state.options.length < MAX_OPTIONS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={local.draft}
              maxLength={MAX_LABEL}
              placeholder="Add option"
              aria-label="Add option"
              onInput={(e) => setLocal({ draft: e.currentTarget.value })}
            />
            <Button kind="deemphasized" disabled={!canAdd} onClick={add}>
              Add
            </Button>
          </form>
        ) : null}
        {local.toast > 0 ? <Toast key={local.toast}>Option added</Toast> : null}
      </div>
    );
  },
});
