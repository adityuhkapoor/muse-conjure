import { defineApp, Button, CardHeader, Facepile } from "@muse/app";

const CHAT = {
  title: "Who's playing on Sunday?",
  cap: 6,
  minWomen: 2,
  games: [
    { label: "Nov 16", note: "" },
    { label: "Nov 23", note: "Mia has a 4pm thing" },
    { label: "Dec 7", note: "" },
  ],
};

type Game = { id: string; label: string; note: string; players: string[] };
type State = { cap: number; minWomen: number; games: Game[] };
type Action = { t: "join"; game: string } | { t: "leave"; game: string };
type Local = Record<string, never>;
type CtxLike = { members: { id: string }[] };

const inChat = (ctx: CtxLike, id: string) => ctx.members.some((m) => m.id === id);
const gameOf = (s: State, id: unknown) => s.games.find((g) => g.id === id);
const restOf = (s: State, id: unknown) => s.games.filter((g) => g.id !== id).map((g) => JSON.stringify(g)).join("|");
const fixedOf = (s: State) => JSON.stringify([s.cap, s.minWomen, s.games.map((g) => [g.id, g.label, g.note])]);

function join(s: State, user: string, id: unknown): State {
  if (typeof id !== "string") return s;
  const g = gameOf(s, id);
  if (!g || g.players.includes(user) || g.players.length >= s.cap) return s;
  return { ...s, games: s.games.map((x) => (x.id === g.id ? { ...x, players: [...x.players, user] } : x)) };
}

function leave(s: State, user: string, id: unknown): State {
  if (typeof id !== "string") return s;
  const g = gameOf(s, id);
  if (!g || !g.players.includes(user)) return s;
  return { ...s, games: s.games.map((x) => (x.id === g.id ? { ...x, players: x.players.filter((p) => p !== user) } : x)) };
}

export default defineApp<State, Action, Local>({
  name: "Game sign up",
  summary: (s) => `${CHAT.title} ${s.games.map((g) => `${g.label} ${g.players.length} of ${s.cap}`).join(" · ")}`,

  init: () => ({
    cap: CHAT.cap,
    minWomen: CHAT.minWomen,
    games: CHAT.games.map((g, i) => ({ id: `g${i}`, label: g.label, note: g.note, players: [] })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "join") return join(state, meta.user, action.game);
    if (action.t === "leave") return leave(state, meta.user, action.game);
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.games.every((g) => g.players.every((p) => inChat(ctx, p)))) return state;
    return { ...state, games: state.games.map((g) => (g.players.every((p) => inChat(ctx, p)) ? g : { ...g, players: g.players.filter((p) => inChat(ctx, p)) })) };
  },

  invariants: {
    "no game has more players than the cap": (s) => s.games.every((g) => g.players.length <= s.cap),
    "no one is listed twice in a game": (s) => s.games.every((g) => new Set(g.players).size === g.players.length),
    "everyone listed is in the chat": (s, ctx) => s.games.every((g) => g.players.every((p) => inChat(ctx, p))),
    "there are exactly 3 games with unique ids and the cap is 6": (s) => s.games.length === 3 && new Set(s.games.map((g) => g.id)).size === 3 && s.cap === 6,
  },

  transitions: {
    "a join adds only the actor to the end of that game": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const b = gameOf(p, a.game);
      const c = gameOf(n, a.game);
      return !!b && !!c && c.players.join() === [...b.players, m.user].join() && restOf(p, a.game) === restOf(n, a.game);
    },
    "a leave removes only the actor and keeps the order of the rest": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const b = gameOf(p, a.game);
      const c = gameOf(n, a.game);
      return !!b && !!c && b.players.includes(m.user) && c.players.join() === b.players.filter((u) => u !== m.user).join() && restOf(p, a.game) === restOf(n, a.game);
    },
    "a join never pushes a game over the cap": (p, n, a) => {
      if (a.t !== "join" || p === n) return true;
      const b = gameOf(p, a.game);
      return !!b && b.players.length < p.cap && n.games.every((g) => g.players.length <= n.cap);
    },
    "a join that fits always lands": (p, n, a, m, ctx) => {
      if (a.t !== "join" || !inChat(ctx, m.user)) return true;
      const b = gameOf(p, a.game);
      if (!b || b.players.includes(m.user) || b.players.length >= p.cap) return true;
      return !!gameOf(n, a.game)?.players.includes(m.user);
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the games, notes and cap never change": (p, n) => fixedOf(p) === fixedOf(n),
  },

  arbitrary: (s, user, r) => {
    const g = r.pick(s.games);
    if (g.players.includes(user) && r.next() < 0.35) return { t: "leave", game: g.id };
    return { t: "join", game: g.id };
  },

  local: {},

  view: ({ state, me, dispatch, theme }) => {
    const mine = state.games.filter((g) => g.players.includes(me)).length;
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={mine === 0 ? "You're not signed up yet" : `You're in ${mine} of ${state.games.length} games`} />
        <div>
          {state.games.map((g) => {
            const isIn = g.players.includes(me);
            const full = g.players.length >= state.cap;
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 56, padding: "6px 0", borderBottom: `1px solid ${theme.color.divider}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {g.label} <small>· {g.players.length} of {state.cap}</small>
                  </div>
                  {g.note ? <small style={{ display: "block" }}>{g.note}</small> : null}
                  <div style={{ marginTop: 4, minHeight: 20 }}>
                    {g.players.length ? <Facepile users={g.players} max={6} size={20} /> : <small>No one yet</small>}
                  </div>
                </div>
                <div style={{ width: 76, flex: "none", display: "flex", justifyContent: "flex-end" }}>
                  {isIn ? (
                    <Button kind="deemphasized" onClick={() => dispatch({ t: "leave", game: g.id })}>
                      Leave
                    </Button>
                  ) : full ? (
                    <Button kind="deemphasized" disabled>
                      Full
                    </Button>
                  ) : (
                    <Button kind="secondary" onClick={() => dispatch({ t: "join", game: g.id })}>
                      Join
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <small style={{ display: "block", marginTop: 8 }}>At least {state.minWomen} girls on court each game</small>
      </div>
    );
  },
});
