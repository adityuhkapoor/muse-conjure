import { defineApp, Button, CardHeader, OptionRow, SystemLine, rng } from "@muse/app";

// Bracket vote: entries face off in pairs, everyone votes in each match, then anyone closes the
// round once every match has a vote. Winners move on until one is left. Ties go to the seed.

type Params = {
  /** Card title: "Best late night food" */
  title: string;
  /** Entries from the chat, 2 to 8. With an odd count some get a bye. */
  entries: string[];
};

// @params
const P: Params = {
  title: "Best late night food",
  entries: ["Halal cart", "Insomnia cookies", "Taco Bell", "Dollar pizza"],
};
// @end params

type Match = { a: number; b: number | null; va: string[]; vb: string[]; win: number | null };
type State = { title: string; entries: string[]; rounds: Match[][] };
type Action = { t: "vote"; match: number; side: "a" | "b" } | { t: "close" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const current = (s: State): Match[] => s.rounds[s.rounds.length - 1] ?? [];
const champion = (s: State): number | null => {
  const r = current(s);
  return r.length === 1 && r[0]!.win !== null ? r[0]!.win : null;
};
const undecided = (r: Match[]) => r.filter((m) => m.win === null && m.b !== null);

/** Pair entries in order; a lone last entry gets a bye and wins its match at once. */
function pairUp(ids: number[]): Match[] {
  const out: Match[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i]!, b = ids[i + 1] ?? null;
    out.push({ a, b, va: [], vb: [], win: b === null ? a : null });
  }
  return out;
}

function vote(s: State, user: string, match: unknown, side: unknown): State {
  const r = current(s);
  if (champion(s) !== null || typeof match !== "number" || (side !== "a" && side !== "b")) return s;
  const m = r[match];
  if (!m || m.b === null || m.win !== null) return s;
  const mine = side === "a" ? m.va : m.vb;
  const had = mine.includes(user);
  const next: Match = {
    ...m,
    va: side === "a" ? (had ? m.va.filter((u) => u !== user) : [...m.va, user]) : m.va.filter((u) => u !== user),
    vb: side === "b" ? (had ? m.vb.filter((u) => u !== user) : [...m.vb, user]) : m.vb.filter((u) => u !== user),
  };
  const rounds = s.rounds.map((round, i) => (i === s.rounds.length - 1 ? round.map((x, j) => (j === match ? next : x)) : round));
  return { ...s, rounds };
}

function close(s: State, seed: number): State {
  const r = current(s);
  if (champion(s) !== null || r.some((m) => m.win === null && m.va.length + m.vb.length === 0)) return s;
  const coin = rng(seed);
  const decided = r.map((m) => {
    if (m.win !== null || m.b === null) return m;
    if (m.va.length !== m.vb.length) return { ...m, win: m.va.length > m.vb.length ? m.a : m.b };
    return { ...m, win: coin.int(2) === 0 ? m.a : m.b };
  });
  const rounds = [...s.rounds.slice(0, -1), decided];
  if (decided.length > 1) rounds.push(pairUp(decided.map((m) => m.win!)));
  return { ...s, rounds };
}

export default defineApp<State, Action, Local>({
  name: "Bracket",
  summary: (s) => {
    const c = champion(s);
    return c !== null ? `${s.title}: ${s.entries[c]} wins.` : `${s.title}: round ${s.rounds.length}, ${current(s).filter((m) => m.win === null).length} matches open.`;
  },

  init: () => {
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const raw of P.entries) {
      const e = raw.trim().replace(/\s+/g, " ").slice(0, 30);
      if (e && !seen.has(e.toLowerCase()) && entries.length < 8) (seen.add(e.toLowerCase()), entries.push(e));
    }
    while (entries.length < 2) entries.push(entries.length ? "Something else" : "Option A");
    return { title: P.title.trim().slice(0, 60) || "Bracket", entries, rounds: [pairUp(entries.map((_, i) => i))] };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.match, action.side);
    if (action.t === "close") return close(state, meta.seed);
    return state;
  },

  // Someone left: their votes in matches still open go. Decided matches keep their record.
  onMembers: (state, ctx) => {
    const open = (m: Match) => m.win === null && [...m.va, ...m.vb].some((u) => !inChat(ctx, u));
    if (!state.rounds.some((r) => r.some(open))) return state;
    return { ...state, rounds: state.rounds.map((r) => r.map((m) => (open(m) ? { ...m, va: m.va.filter((u) => inChat(ctx, u)), vb: m.vb.filter((u) => inChat(ctx, u)) } : m))) };
  },

  invariants: {
    "no one votes for both sides or twice": (s) => s.rounds.every((r) => r.every((m) => new Set([...m.va, ...m.vb]).size === m.va.length + m.vb.length)),
    "winners come from their match and beat or tied the other side": (s) =>
      s.rounds.every((r) =>
        r.every((m) => m.win === null || (m.b === null ? m.win === m.a : (m.win === m.a && m.va.length >= m.vb.length) || (m.win === m.b && m.vb.length >= m.va.length))),
      ),
    "each round is the winners of the last": (s) =>
      s.rounds.every((r, i) => {
        if (i === 0) return r.length === Math.ceil(s.entries.length / 2);
        const prev = s.rounds[i - 1]!;
        const ids = r.flatMap((m) => (m.b === null ? [m.a] : [m.a, m.b]));
        return prev.every((m) => m.win !== null) && ids.join(",") === prev.map((m) => m.win).join(",");
      }),
    "only the newest round is open": (s) => s.rounds.slice(0, -1).every((r) => r.every((m) => m.win !== null)),
    "voters in open matches are in the chat": (s, ctx) => s.rounds.every((r) => r.every((m) => m.win !== null || [...m.va, ...m.vb].every((u) => inChat(ctx, u)))),
  },

  transitions: {
    "a vote moves the actor in that one match and no one else": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = current(p)[a.match];
      const after = current(n)[a.match];
      if (!before || !after || p.rounds.length !== n.rounds.length || before.win !== null) return false;
      const rest = (x: Match) => `${x.va.filter((u) => u !== m.user)}|${x.vb.filter((u) => u !== m.user)}`;
      const was = before.va.includes(m.user) ? "a" : before.vb.includes(m.user) ? "b" : "";
      const now = after.va.includes(m.user) ? "a" : after.vb.includes(m.user) ? "b" : "";
      return rest(before) === rest(after) && now === (was === a.side ? "" : a.side) && current(p).every((x, j) => j === a.match || JSON.stringify(x) === JSON.stringify(current(n)[j]));
    },
    "a close decides every open match and only when each has a vote": (p, n, a) => {
      if (a.t !== "close" || p === n) return true;
      const r = n.rounds[p.rounds.length - 1]!;
      return undecided(current(p)).every((x) => x.va.length + x.vb.length > 0) && r.every((x) => x.win !== null) && r.every((x, j) => x.va.join() === current(p)[j]!.va.join());
    },
    "a close moves the bracket on: a new round, or a champion": (p, n, a) => a.t !== "close" || p === n || (current(p).length === 1 ? champion(n) !== null : n.rounds.length === p.rounds.length + 1),
    "only people in the chat change the bracket": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const open = current(s)
      .map((m, i) => (m.win === null ? i : -1))
      .filter((i) => i >= 0);
    if (!open.length || r.next() < 0.2) return { t: "close" };
    return { t: "vote", match: r.pick(open), side: r.next() < 0.5 ? "a" : "b" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, dispatch, theme }) => {
    // Ties are settled by the server's seed. While my own close is unconfirmed, show the round
    // as the server has it, with a neutral line, rather than a winner I guessed with seed 0.
    const closing = pending && (state.rounds.length !== confirmed.rounds.length || champion(state) !== champion(confirmed));
    const s = closing ? confirmed : state;
    const round = current(s);
    const c = champion(s);
    const ready = round.every((m) => m.win !== null || m.va.length + m.vb.length > 0);
    const name = (i: number | null) => (i === null ? "Bye" : (s.entries[i] ?? ""));
    const stage = round.length === 1 ? "Final" : round.length === 2 ? "Semifinals" : `Round ${s.rounds.length}`;
    return (
      <div>
        <CardHeader title={s.title} subtitle={c !== null ? "Bracket done" : stage} />
        {c !== null ? (
          <div style={{ padding: "16px 0", textAlign: "center" }}>
            <h2>{name(c)}</h2>
            <small>Won the bracket</small>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {round.map((m, i) => {
              const total = Math.max(1, m.va.length + m.vb.length);
              if (m.b === null) return <SystemLine key={i}>{`${name(m.a)} gets a bye`}</SystemLine>;
              // Four or more matches would not fit the height budget with full rows: use side-by-side cells.
              if (round.length > 2)
                return (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    {(["a", "b"] as const).map((side) => {
                      const votes = side === "a" ? m.va : m.vb;
                      return (
                        <button
                          key={side}
                          onClick={() => dispatch({ t: "vote", match: i, side })}
                          style={{ flex: 1, minWidth: 0, minHeight: 48, padding: "4px 10px", borderRadius: theme.radius.button, textAlign: "left", background: votes.includes(me) ? theme.color.selected : theme.color.input, color: theme.color.text, overflowWrap: "anywhere" }}
                        >
                          <div style={{ fontWeight: 600 }}>{name(side === "a" ? m.a : m.b)}</div>
                          <small>{votes.length === 1 ? "1 vote" : `${votes.length} votes`}</small>
                        </button>
                      );
                    })}
                  </div>
                );
              return (
                <div key={i} style={{ display: "grid", gap: 2 }}>
                  <OptionRow label={name(m.a)} count={m.va.length} total={total} voters={m.va} selected={m.va.includes(me)} onClick={() => dispatch({ t: "vote", match: i, side: "a" })} />
                  <OptionRow label={name(m.b)} count={m.vb.length} total={total} voters={m.vb} selected={m.vb.includes(me)} onClick={() => dispatch({ t: "vote", match: i, side: "b" })} />
                </div>
              );
            })}
          </div>
        )}
        {c === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <small style={{ flex: 1 }}>{closing ? "Counting votes" : ready ? "Every match has a vote" : "Each match needs a vote"}</small>
            <Button kind="primary" disabled={!ready || closing} onClick={() => dispatch({ t: "close" })}>
              {round.length === 1 ? "Finish" : "Next round"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
});
