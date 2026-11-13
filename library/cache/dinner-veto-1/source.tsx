import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine } from "@muse/app";

const CHAT = {
  title: "Where should we eat?",
  places: ["Joe's Pizza", "Pho 79", "Chengdu Taste", "Shake Shack", "Taco Bell Cantina"],
};

type Option = { id: string; label: string; vetoedBy: string | null };
type State = { options: Option[] };
type Action = { t: "veto"; option: string } | { t: "undo"; option: string };
type Local = Record<string, never>;
type CtxLike = { members: { id: string }[] };

const inChat = (ctx: CtxLike, id: string) => ctx.members.some((m) => m.id === id);
const openCount = (s: State) => s.options.filter((o) => o.vetoedBy === null).length;
const hasVeto = (s: State, u: string) => s.options.some((o) => o.vetoedBy === u);
const sameExcept = (p: State, n: State, i: number) =>
  p.options.length === n.options.length &&
  p.options.every((o, j) => j === i || (n.options[j]!.id === o.id && n.options[j]!.label === o.label && n.options[j]!.vetoedBy === o.vetoedBy));

export default defineApp<State, Action, Local>({
  name: "Veto round",
  summary: (s) => {
    const left = s.options.filter((o) => o.vetoedBy === null);
    if (left.length === 1) return `${CHAT.title} ${left[0]!.label} wins.`;
    return `${CHAT.title} ${s.options.length - left.length} of ${s.options.length} places struck.`;
  },

  init: () => ({
    options: CHAT.places.map((label, i) => ({ id: `p${i}`, label, vetoedBy: null })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (openCount(state) < 2) return state;
    if (action.t === "veto") {
      if (typeof action.option !== "string") return state;
      const o = state.options.find((x) => x.id === action.option);
      if (!o || o.vetoedBy !== null || hasVeto(state, meta.user)) return state;
      return { options: state.options.map((x) => (x.id === o.id ? { ...x, vetoedBy: meta.user } : x)) };
    }
    if (action.t === "undo") {
      if (typeof action.option !== "string") return state;
      const o = state.options.find((x) => x.id === action.option);
      if (!o || o.vetoedBy !== meta.user) return state;
      return { options: state.options.map((x) => (x.id === o.id ? { ...x, vetoedBy: null } : x)) };
    }
    return state;
  },

  // Someone left: their veto is lifted and the place is back in.
  onMembers: (state, ctx) => {
    if (state.options.every((o) => o.vetoedBy === null || inChat(ctx, o.vetoedBy))) return state;
    return { options: state.options.map((o) => (o.vetoedBy !== null && !inChat(ctx, o.vetoedBy) ? { ...o, vetoedBy: null } : o)) };
  },

  invariants: {
    "nobody has more than one veto": (s) => {
      const by = s.options.map((o) => o.vetoedBy).filter((v) => v !== null);
      return new Set(by).size === by.length;
    },
    "everyone who vetoed is in the chat": (s, ctx) => s.options.every((o) => o.vetoedBy === null || inChat(ctx, o.vetoedBy)),
    "at least one place is never struck": (s) => openCount(s) >= 1,
    "the five places and their ids never change": (s) =>
      s.options.length === CHAT.places.length &&
      s.options.every((o, i) => o.label === CHAT.places[i] && o.id === `p${i}`),
  },

  transitions: {
    "a veto strikes one open place for the actor and changes no other": (p, n, a, m) => {
      if (a.t !== "veto" || p === n) return true;
      const i = p.options.findIndex((o) => o.id === a.option);
      return i >= 0 && p.options[i]!.vetoedBy === null && !hasVeto(p, m.user) && n.options[i]?.vetoedBy === m.user && sameExcept(p, n, i);
    },
    "a veto never happens when one place is left and never strikes the last open one": (p, n, a) =>
      a.t !== "veto" || p === n || (openCount(p) >= 2 && openCount(n) >= 1),
    "an undo clears the actor's own veto and changes no other place": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const i = p.options.findIndex((o) => o.id === a.option);
      return i >= 0 && p.options[i]!.vetoedBy === m.user && n.options[i]?.vetoedBy === null && openCount(p) >= 2 && sameExcept(p, n, i);
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "a veto or undo never changes labels or ids": (p, n) =>
      p.options.length === n.options.length && p.options.every((o, i) => n.options[i]!.id === o.id && n.options[i]!.label === o.label),
  },

  arbitrary: (s, user, r) => {
    const mine = s.options.filter((o) => o.vetoedBy === user);
    if (mine.length && r.next() < 0.3) return { t: "undo", option: r.pick(mine).id };
    const open = s.options.filter((o) => o.vetoedBy === null);
    if (open.length && r.next() < 0.9) return { t: "veto", option: r.pick(open).id };
    return { t: "veto", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const left = state.options.filter((o) => o.vetoedBy === null);
    const struck = state.options.length - left.length;
    const winner = left.length === 1 ? left[0]! : null;
    const iVetoed = hasVeto(state, me);
    const waiting = members.filter((m) => !hasVeto(state, m.id)).map((m) => m.id);

    return (
      <div>
        <CardHeader
          title={CHAT.title}
          subtitle={winner ? `${winner.label} wins` : `${struck} of ${state.options.length} places struck`}
        />
        {winner ? (
          <div style={{ marginBottom: 8 }}>
            <small>Winner</small>
            <h2 style={{ margin: 0 }}>{winner.label}</h2>
          </div>
        ) : null}
        <div style={{ display: "grid" }}>
          {state.options.map((o) => {
            const out = o.vetoedBy !== null;
            const isWin = winner !== null && winner.id === o.id;
            return (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  padding: "0 8px",
                  borderRadius: theme.radius.button,
                  background: isWin ? theme.color.selected : "transparent",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: out ? theme.color.secondaryText : theme.color.text,
                    textDecoration: out ? "line-through" : "none",
                    fontWeight: isWin ? 600 : 400,
                  }}
                >
                  {o.label}
                </div>
                {out ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                    <Avatar user={o.vetoedBy!} size={24} />
                    {o.vetoedBy === me && !winner ? (
                      <Button kind="secondary" onClick={() => dispatch({ t: "undo", option: o.id })}>
                        Undo
                      </Button>
                    ) : null}
                  </div>
                ) : !winner && !iVetoed ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "veto", option: o.id })}>
                    Veto
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, marginTop: 4 }}>
          {winner ? (
            <SystemLine>Last place standing</SystemLine>
          ) : (
            <>
              {waiting.length ? <Facepile users={waiting} max={4} size={20} /> : null}
              <small style={{ flex: 1, minWidth: 0 }}>
                {waiting.length === 0
                  ? "Everyone has vetoed"
                  : `${waiting.length} ${waiting.length === 1 ? "person hasn't" : "people haven't"} vetoed yet`}
              </small>
            </>
          )}
        </div>
      </div>
    );
  },
});
