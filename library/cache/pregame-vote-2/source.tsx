import { defineApp, Button, CardHeader, Facepile, rng } from "@muse/app";

const C = {
  title: "Which pregame activity?",
  games: ["Mario Kart", "Flip cup", "Uno", "Charades"],
};

type Side = "a" | "b";
type Match = { id: string; a: string | null; b: string | null; votes: Record<string, Side>; winner: string | null };
type State = { title: string; games: string[]; matches: Match[]; champion: string | null };
type Action = { t: "vote"; match: string; side: Side } | { t: "close"; match: string } | { t: "reset" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const byId = (s: State, id: unknown) => s.matches.find((m) => m.id === id);
const isOpen = (m: Match) => m.a !== null && m.b !== null && m.winner === null;
const count = (m: Match, side: Side) => Object.values(m.votes).filter((v) => v === side).length;
const build = (g: string[]): Match[] => [
  { id: "m0", a: g[0] ?? "", b: g[1] ?? "", votes: {}, winner: null },
  { id: "m1", a: g[2] ?? "", b: g[3] ?? "", votes: {}, winner: null },
  { id: "final", a: null, b: null, votes: {}, winner: null },
];
const pristine = (s: State) => s.matches.every((m) => m.winner === null && Object.keys(m.votes).length === 0);
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const restOf = (v: Record<string, Side>, user: string) => JSON.stringify(Object.entries(v).filter(([u]) => u !== user).sort());

function vote(s: State, user: string, id: unknown, side: unknown): State {
  if (typeof id !== "string" || (side !== "a" && side !== "b")) return s;
  const m = byId(s, id);
  if (!m || !isOpen(m) || m.votes[user] === side) return s;
  return { ...s, matches: s.matches.map((x) => (x.id === m.id ? { ...x, votes: { ...x.votes, [user]: side } } : x)) };
}

function close(s: State, id: unknown, seed: number): State {
  if (typeof id !== "string") return s;
  const m = byId(s, id);
  if (!m) return s;
  const { a, b } = m;
  if (a === null || b === null || m.winner !== null) return s;
  const ca = count(m, "a");
  const cb = count(m, "b");
  if (ca + cb === 0) return s;
  const winner: string = ca > cb ? a : cb > ca ? b : rng(seed).pick([a, b]);
  return {
    ...s,
    champion: m.id === "final" ? winner : s.champion,
    matches: s.matches.map((x) =>
      x.id === m.id ? { ...x, winner } : x.id === "final" && m.id === "m0" ? { ...x, a: winner } : x.id === "final" && m.id === "m1" ? { ...x, b: winner } : x,
    ),
  };
}

export default defineApp<State, Action, Local>({
  name: "Game bracket",
  summary: (s) => (s.champion !== null ? `${s.title} ${s.champion} wins.` : `${s.title} ${s.matches.filter((m) => m.winner !== null).length} of 3 matches decided.`),

  init: () => {
    const games = C.games.map((g) => g.trim().slice(0, 30)).slice(0, 4);
    return { title: C.title, games, matches: build(games), champion: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.match, action.side);
    if (action.t === "close") return close(state, action.match, meta.seed);
    if (action.t === "reset") return pristine(state) ? state : { ...state, matches: build(state.games), champion: null };
    return state;
  },

  onMembers: (s, ctx) => {
    const stale = (m: Match) => m.winner === null && Object.keys(m.votes).some((u) => !inChat(ctx, u));
    if (!s.matches.some(stale)) return s;
    return {
      ...s,
      matches: s.matches.map((m) => (stale(m) ? { ...m, votes: Object.fromEntries(Object.entries(m.votes).filter(([u]) => inChat(ctx, u))) } : m)),
    };
  },

  invariants: {
    "four games, and round 1 pairs them in order": (s) => {
      const [m0, m1, f] = s.matches;
      return (
        s.games.length === 4 && s.matches.length === 3 && !!m0 && !!m1 && !!f && m0.id === "m0" && m1.id === "m1" && f.id === "final" &&
        m0.a === s.games[0] && m0.b === s.games[1] && m1.a === s.games[2] && m1.b === s.games[3]
      );
    },
    "voters in undecided matches are in the chat": (s, ctx) => s.matches.every((m) => m.winner !== null || Object.keys(m.votes).every((u) => inChat(ctx, u))),
    "a winner is one of its two sides and did not trail": (s) =>
      s.matches.every((m) => m.winner === null || (m.winner === m.a && count(m, "a") >= count(m, "b")) || (m.winner === m.b && count(m, "b") >= count(m, "a"))),
    "the final holds the winners of round 1 and is decided only when both are known": (s) => {
      const m0 = s.matches[0], m1 = s.matches[1], f = s.matches[2];
      if (!m0 || !m1 || !f) return false;
      return f.a === m0.winner && f.b === m1.winner && (f.winner === null || (f.a !== null && f.b !== null));
    },
    "the champion is the final's winner": (s) => s.champion === (s.matches[2]?.winner ?? null),
    "votes are a or b, and only on matches with both sides": (s) =>
      s.matches.every((m) => Object.values(m.votes).every((v) => v === "a" || v === "b") && (m.a !== null && m.b !== null ? true : Object.keys(m.votes).length === 0)),
  },

  transitions: {
    "a vote changes only the actor's own vote in that match": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const x = byId(p, a.match);
      const y = byId(n, a.match);
      if (!x || !y) return false;
      return (
        y.votes[m.user] === a.side && restOf(x.votes, m.user) === restOf(y.votes, m.user) && x.winner === y.winner && x.a === y.a && x.b === y.b &&
        p.matches.every((z, i) => z.id === a.match || same(z, n.matches[i])) && p.champion === n.champion
      );
    },
    "a close decides that match by more votes, or by the seed on a tie": (p, n, a, m) => {
      if (a.t !== "close" || p === n) return true;
      const x = byId(p, a.match);
      const y = byId(n, a.match);
      if (!x || !y || x.winner !== null) return false;
      const ca = count(x, "a");
      const cb = count(x, "b");
      const want = ca > cb ? x.a : cb > ca ? x.b : rng(m.seed).pick([x.a, x.b]);
      return y.winner === want && same(y.votes, x.votes);
    },
    "a close fills only the matching slot of the final, or sets the champion": (p, n, a) => {
      if (a.t !== "close" || p === n) return true;
      const x = byId(p, a.match);
      const y = byId(n, a.match);
      if (!x || !y) return false;
      const fp = p.matches[2]!;
      const fn = n.matches[2]!;
      const slot = a.match === "m0" ? fn.a === y.winner && fn.b === fp.b : a.match === "m1" ? fn.b === y.winner && fn.a === fp.a : n.champion === y.winner;
      const finalRest = a.match === "final" || (same(fn.votes, fp.votes) && fn.winner === fp.winner && n.champion === p.champion);
      return slot && finalRest && p.matches.every((z, i) => z.id === a.match || z.id === "final" || same(z, n.matches[i]));
    },
    "a decided match keeps its winner and votes until reset": (p, n, a) =>
      a.t === "reset" || p.matches.every((x) => {
        if (x.winner === null) return true;
        const y = byId(n, x.id);
        return !!y && y.winner === x.winner && same(y.votes, x.votes);
      }),
    "reset clears every vote, winner and champion and keeps the games": (p, n, a) =>
      a.t !== "reset" || p === n || (n.champion === null && n.matches.every((z) => z.winner === null && Object.keys(z.votes).length === 0) && n.games.join() === p.games.join()),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (s.champion !== null) return r.next() < 0.5 ? { t: "reset" } : { t: "vote", match: "final", side: "a" };
    const open = s.matches.filter(isOpen);
    if (!open.length) return { t: "reset" };
    const x = r.next();
    const m = r.pick(open);
    if (x < 0.05) return { t: "reset" };
    if (x < 0.3) return { t: "close", match: m.id };
    return { t: "vote", match: m.id, side: r.next() < 0.5 ? "a" : "b" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const key = (x: State) => x.matches.map((m) => m.winner ?? "").join("|");
    const closing = pending && key(state) !== key(confirmed);
    const s = closing ? confirmed : state;
    const m0 = s.matches[0]!;
    const m1 = s.matches[1]!;
    const f = s.matches[2]!;
    const round1 = m0.winner === null || m1.winner === null;
    const live = round1 ? [m0, m1] : [f];
    const voted = members.filter((x) => live.some((m) => m.votes[x.id] !== undefined)).length;
    const open = s.matches.filter(isOpen);
    const target = open.find((m) => count(m, "a") + count(m, "b") > 0) ?? open[0];
    const tVotes = target ? count(target, "a") + count(target, "b") : 0;

    const placeholder = (k: string) => (
      <div key={k} style={{ minHeight: 44, display: "flex", alignItems: "center", padding: "4px 8px", border: `1px dashed ${theme.color.divider}`, color: theme.color.secondaryText, fontSize: theme.type.meta }}>
        Round 1 winner
      </div>
    );

    const row = (m: Match, side: Side) => {
      const label = side === "a" ? m.a : m.b;
      if (label === null) return placeholder(m.id + side);
      const voters = Object.keys(m.votes).filter((u) => m.votes[u] === side && members.some((x) => x.id === u));
      const won = m.winner !== null && label === m.winner;
      const lost = m.winner !== null && !won;
      const mine = m.votes[me] === side;
      return (
        <button
          key={m.id + side}
          aria-label={`${label}, ${voters.length} votes`}
          onClick={() => {
            if (isOpen(m)) dispatch({ t: "vote", match: m.id, side });
          }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 44, width: "100%", padding: "4px 8px",
            border: "none", borderRadius: 0, textAlign: "left", fontSize: theme.type.meta, fontWeight: 600,
            background: won ? theme.color.primary : mine ? theme.color.selected : theme.color.input,
            color: won ? theme.color.onPrimary : lost ? theme.color.secondaryText : theme.color.text,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{label}</span>
          {voters.length ? <Facepile users={voters} max={2} size={16} /> : null}
        </button>
      );
    };

    const card = (m: Match) => (
      <div style={{ display: "grid", gap: 2, borderRadius: theme.radius.button, overflow: "hidden" }}>
        {row(m, "a")}
        {row(m, "b")}
      </div>
    );

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.champion !== null ? `${s.champion} wins` : `${round1 ? "Round 1" : "Final"} · ${voted} of ${members.length} voted`} />
        <div role="group" aria-label="Bracket: two round 1 matches feed the final" style={{ display: "grid", gridTemplateColumns: "1fr 14px 1fr", alignItems: "stretch" }}>
          <div style={{ display: "grid", gap: 12 }}>
            {card(m0)}
            {card(m1)}
          </div>
          <div style={{ margin: "45px 0", borderTop: `2px solid ${theme.color.divider}`, borderBottom: `2px solid ${theme.color.divider}`, borderRight: `2px solid ${theme.color.divider}` }} />
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%" }}>{card(f)}</div>
          </div>
        </div>
        {s.champion !== null ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <h2>{s.champion}</h2>
              <small>Picked for the pregame</small>
            </div>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
              Reset
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <small>{closing ? "Deciding" : target ? `${target.a} vs ${target.b} · ${tVotes} ${tVotes === 1 ? "vote" : "votes"}` : "Tap a game to vote"}</small>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button
                kind="primary"
                disabled={closing || !target || tVotes === 0}
                onClick={() => {
                  if (target && tVotes > 0) dispatch({ t: "close", match: target.id });
                }}
              >
                Close match
              </Button>
              {!pristine(s) ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  },
});
