import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";

// Each person ranks up to 3 places. First choice 3 points, second 2, third 1.

const CHAT = {
  title: "Rank your top 3 for spring break",
  places: ["Miami", "Austin", "Nashville", "Asheville", "San Diego"],
};

type Option = { id: string; label: string };
type Rank = { user: string; picks: string[] };
type State = { title: string; options: Option[]; ranks: Rank[] };
type Action = { t: "pick"; option: string } | { t: "unpick"; option: string } | { t: "clear" };
type Local = Record<string, never>;

const MAX_PICKS = 3;
const ORDINAL = ["1st", "2nd", "3rd"];
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const mine = (s: State, user: string): string[] => s.ranks.find((r) => r.user === user)?.picks ?? [];
const pointsFor = (s: State, id: string) =>
  s.ranks.reduce((n, r) => n + r.picks.reduce((k, p, i) => (p === id ? k + (MAX_PICKS - i) : k), 0), 0);
const othersJson = (s: State, user: string) => JSON.stringify(s.ranks.filter((r) => r.user !== user));
const othersSame = (p: State, n: State, user: string) => othersJson(p, user) === othersJson(n, user);
const totalPoints = (s: State) => s.options.reduce((n, o) => n + pointsFor(s, o.id), 0);
const expectedPoints = (s: State) => s.ranks.reduce((n, r) => n + [0, 3, 5, 6][Math.min(r.picks.length, 3)]!, 0);

export default defineApp<State, Action, Local>({
  name: "Top 3 ranking",
  summary: (s) => {
    const sorted = [...s.options].sort((a, b) => pointsFor(s, b.id) - pointsFor(s, a.id));
    const top = sorted[0];
    if (!top || pointsFor(s, top.id) === 0) return `${s.title} No rankings yet.`;
    return `${s.title} ${top.label} leads with ${pointsFor(s, top.id)} points. ${s.ranks.length} ranked.`;
  },

  init: () => ({
    title: CHAT.title,
    options: CHAT.places.map((label, i) => ({ id: `p${i}`, label })),
    ranks: [],
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "pick") {
      const id = action.option;
      if (typeof id !== "string" || !state.options.some((o) => o.id === id)) return state;
      const cur = mine(state, meta.user);
      if (cur.includes(id) || cur.length >= MAX_PICKS) return state;
      const has = state.ranks.some((r) => r.user === meta.user);
      return {
        ...state,
        ranks: has
          ? state.ranks.map((r) => (r.user === meta.user ? { ...r, picks: [...r.picks, id] } : r))
          : [...state.ranks, { user: meta.user, picks: [id] }],
      };
    }
    if (action.t === "unpick") {
      const id = action.option;
      if (typeof id !== "string" || !mine(state, meta.user).includes(id)) return state;
      return {
        ...state,
        ranks: state.ranks
          .map((r) => (r.user === meta.user ? { ...r, picks: r.picks.filter((p) => p !== id) } : r))
          .filter((r) => r.picks.length > 0),
      };
    }
    if (action.t === "clear") {
      if (!state.ranks.some((r) => r.user === meta.user)) return state;
      return { ...state, ranks: state.ranks.filter((r) => r.user !== meta.user) };
    }
    return state;
  },

  onMembers: (state, ctx) =>
    state.ranks.every((r) => inChat(ctx, r.user)) ? state : { ...state, ranks: state.ranks.filter((r) => inChat(ctx, r.user)) },

  invariants: {
    "each person has at most one entry": (s) => new Set(s.ranks.map((r) => r.user)).size === s.ranks.length,
    "every entry has 1 to 3 picks with no repeats": (s) =>
      s.ranks.every((r) => r.picks.length >= 1 && r.picks.length <= MAX_PICKS && new Set(r.picks).size === r.picks.length),
    "every pick is a known place": (s) => s.ranks.every((r) => r.picks.every((p) => s.options.some((o) => o.id === p))),
    "everyone who ranked is in the chat": (s, ctx) => s.ranks.every((r) => inChat(ctx, r.user)),
    "points add up to 3, 2, 1 per pick": (s) => totalPoints(s) === expectedPoints(s),
    "no place has more than 3 points per person": (s) => s.options.every((o) => pointsFor(s, o.id) <= MAX_PICKS * s.ranks.length),
  },

  transitions: {
    "a pick adds the place to the end of the actor's picks and changes no one else": (p, n, a, m) =>
      a.t !== "pick" || p === n || (mine(n, m.user).join() === [...mine(p, m.user), a.option].join() && othersSame(p, n, m.user)),
    "an unpick removes the place, keeps the order of the rest, and changes no one else": (p, n, a, m) =>
      a.t !== "unpick" || p === n || (mine(n, m.user).join() === mine(p, m.user).filter((x) => x !== a.option).join() && mine(p, m.user).includes(a.option) && othersSame(p, n, m.user)),
    "a clear removes only the actor's entry": (p, n, a, m) =>
      a.t !== "clear" || p === n || (mine(p, m.user).length > 0 && mine(n, m.user).length === 0 && othersSame(p, n, m.user)),
    "the title and places never change": (p, n) => p.title === n.title && JSON.stringify(p.options) === JSON.stringify(n.options),
    "only people in the chat change the ranking": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const cur = mine(s, user);
    const x = r.next();
    if (x < 0.05) return { t: "pick", option: "zz" };
    if (cur.length > 0 && x < 0.15) return { t: "clear" };
    if (cur.length > 0 && x < 0.35) return { t: "unpick", option: r.pick(cur) };
    return { t: "pick", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const my = mine(state, me);
    const ranked = state.ranks.filter((r) => members.some((m) => m.id === r.user)).length;
    const sorted = [...state.options].sort((a, b) => pointsFor(state, b.id) - pointsFor(state, a.id));
    const next = ORDINAL[my.length];
    const hint = next ? `Tap your ${next} choice · 3, 2, 1 points` : "Tap a pick to remove it · 3, 2, 1 points";
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={`${my.length === MAX_PICKS ? "Your top 3 is in · " : ""}${ranked} of ${members.length} ranked`}
        />
        <div style={{ display: "grid", gap: 2 }}>
          {sorted.map((o) => {
            const idx = my.indexOf(o.id);
            return (
              <OptionRow
                key={o.id}
                label={idx >= 0 ? `${o.label} · your ${ORDINAL[idx]}` : o.label}
                count={pointsFor(state, o.id)}
                total={Math.max(1, MAX_PICKS * state.ranks.length)}
                voters={state.ranks.filter((r) => r.picks.includes(o.id)).map((r) => r.user)}
                selected={idx >= 0}
                onClick={() => {
                  if (idx >= 0) dispatch({ t: "unpick", option: o.id });
                  else if (my.length < MAX_PICKS) dispatch({ t: "pick", option: o.id });
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <small style={{ flex: 1 }}>{hint}</small>
          <Button kind="deemphasized" disabled={my.length === 0} onClick={() => dispatch({ t: "clear" })}>
            Clear
          </Button>
        </div>
      </div>
    );
  },
});
