import { defineApp, Avatar, Button, CardHeader, rng, running, userColor } from "@muse/app";

// Higher or lower on the house numbers. Everyone guesses whether the next number is higher or
// lower than the one on show. Right adds one to your streak, wrong resets it. First to 5 wins boba.

const CHAT = {
  title: "Higher or lower: house numbers",
  goal: 5,
  items: [
    { label: "Electric this month", cents: 14300 },
    { label: "Electric last month", cents: 9600 },
    { label: "Wifi", cents: 6000 },
    { label: "Water", cents: 3800 },
    { label: "Trader Joe's groceries", cents: 8700 },
    { label: "Costco run in Oct", cents: 21400 },
    { label: "Rent, each", cents: 92500 },
    { label: "Laundromat load now", cents: 450 },
    { label: "Laundromat load in Sept", cents: 375 },
  ],
};

type Dir = "higher" | "lower";
type Result = "right" | "wrong" | "tie";
type Item = { id: string; label: string; cents: number };
type Last = { from: string; to: string; results: Record<string, Result> };
type State = {
  title: string;
  items: Item[];
  goal: number;
  current: string;
  guesses: Record<string, Dir>;
  streaks: Record<string, number>;
  round: number;
  last: Last | null;
  winner: string | null;
  at: number;
};
type Action = { t: "guess"; dir: Dir } | { t: "reveal" } | { t: "again" };
type Local = Record<string, never>;
type Members = { members: { id: string }[] };

const SPIN_MS = 1200;

const inChat = (ctx: Members, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);

function only<T>(o: Record<string, T>, ctx: Members): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v !== undefined && inChat(ctx, k)) out[k] = v;
  }
  return out;
}

const sameExcept = (a: Record<string, unknown>, b: Record<string, unknown>, user: string) => {
  const ka = Object.keys(a).filter((k) => k !== user);
  const kb = Object.keys(b).filter((k) => k !== user);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

const bestStreak = (s: State) => Object.values(s.streaks).reduce((a, b) => Math.max(a, b), 0);

export default defineApp<State, Action, Local>({
  name: "Higher or lower",
  summary: (s, ctx) => {
    if (s.winner !== null) return `${ctx.members.find((m) => m.id === s.winner)?.name ?? "Someone"} won the boba`;
    return `${s.title}: best streak ${bestStreak(s)} of ${s.goal}`;
  },

  init: () => {
    const items: Item[] = CHAT.items.map((i, n) => ({ id: `n${n}`, label: i.label, cents: i.cents }));
    return {
      title: CHAT.title,
      items,
      goal: CHAT.goal,
      current: items[0]?.id ?? "",
      guesses: {},
      streaks: {},
      round: 0,
      last: null,
      winner: null,
      at: 0,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "guess") {
      if ((a.dir !== "higher" && a.dir !== "lower") || s.winner !== null || s.guesses[m.user] === a.dir) return s;
      return { ...s, guesses: { ...s.guesses, [m.user]: a.dir } };
    }
    if (a.t === "reveal") {
      const who = Object.keys(s.guesses);
      if (s.winner !== null || who.length === 0) return s;
      const cur = s.items.find((i) => i.id === s.current);
      const others = s.items.filter((i) => i.id !== s.current);
      if (!cur || others.length === 0) return s;
      const next = rng(m.seed).pick(others);
      const streaks: Record<string, number> = { ...s.streaks };
      const results: Record<string, Result> = {};
      for (const u of who) {
        const g = s.guesses[u];
        const r: Result = next.cents === cur.cents ? "tie" : next.cents > cur.cents === (g === "higher") ? "right" : "wrong";
        results[u] = r;
        const old = s.streaks[u] ?? 0;
        streaks[u] = r === "right" ? Math.min(s.goal, old + 1) : r === "wrong" ? 0 : old;
      }
      let winner: string | null = null;
      let best = 0;
      for (const u of who) {
        const v = streaks[u] ?? 0;
        if (v >= s.goal && v > best) {
          best = v;
          winner = u;
        }
      }
      return { ...s, current: next.id, guesses: {}, streaks, round: s.round + 1, last: { from: s.current, to: next.id, results }, winner, at: m.time };
    }
    if (a.t === "again") {
      const first = s.items[0];
      if (s.winner === null || !first) return s;
      return { ...s, current: first.id, guesses: {}, streaks: {}, round: 0, last: null, winner: null, at: 0 };
    }
    return s;
  },

  // Someone left: their guess, streak and result go. If the winner left, the game restarts its streaks.
  onMembers: (s, ctx) => {
    const keep = (u: string) => inChat(ctx, u);
    const ok =
      Object.keys(s.guesses).every(keep) &&
      Object.keys(s.streaks).every(keep) &&
      (!s.last || Object.keys(s.last.results).every(keep)) &&
      (s.winner === null || keep(s.winner));
    if (ok) return s;
    const winnerGone = s.winner !== null && !keep(s.winner);
    return {
      ...s,
      guesses: only(s.guesses, ctx),
      streaks: winnerGone ? {} : only(s.streaks, ctx),
      last: s.last ? { ...s.last, results: only(s.last.results, ctx) } : null,
      winner: winnerGone ? null : s.winner,
    };
  },

  invariants: {
    "every streak is a whole number from 0 to the goal": (s) => Object.values(s.streaks).every((v) => Number.isInteger(v) && v >= 0 && v <= s.goal),
    "everyone in guesses, streaks and results is in the chat": (s, ctx) =>
      [...Object.keys(s.guesses), ...Object.keys(s.streaks), ...Object.keys(s.last?.results ?? {})].every((u) => inChat(ctx, u)),
    "the current item exists and item ids are unique": (s) => s.items.some((i) => i.id === s.current) && new Set(s.items.map((i) => i.id)).size === s.items.length,
    "a winner has the goal streak and no open guesses": (s) => s.winner === null || (s.streaks[s.winner] === s.goal && Object.keys(s.guesses).length === 0),
    "with no winner nobody has reached the goal": (s) => s.winner !== null || Object.values(s.streaks).every((v) => v < s.goal),
    "every guess is higher or lower, and the last reveal ends on the current item": (s) =>
      Object.values(s.guesses).every((g) => g === "higher" || g === "lower") && (s.last === null ? s.round === 0 : s.round > 0 && s.last.to === s.current && s.last.from !== s.last.to),
  },

  transitions: {
    "a guess sets the actor's own guess and nothing else": (p, n, a, m) =>
      a.t !== "guess" ||
      p === n ||
      (n.guesses[m.user] === a.dir && sameExcept(p.guesses, n.guesses, m.user) && p.current === n.current && JSON.stringify(p.streaks) === JSON.stringify(n.streaks) && p.round === n.round),
    "a reveal moves to another item chosen by the seed and clears guesses": (p, n, a, m) =>
      a.t !== "reveal" ||
      p === n ||
      (n.current === rng(m.seed).pick(p.items.filter((i) => i.id !== p.current)).id &&
        n.current !== p.current &&
        Object.keys(n.guesses).length === 0 &&
        n.round === p.round + 1 &&
        n.at === m.time &&
        n.last?.from === p.current &&
        n.last.to === n.current),
    "after a reveal right adds one, wrong resets and others keep their streak": (p, n, a) => {
      if (a.t !== "reveal" || p === n) return true;
      const cur = p.items.find((i) => i.id === p.current);
      const nx = n.items.find((i) => i.id === n.current);
      if (!cur || !nx) return false;
      return (
        Object.keys(p.guesses).every((u) => {
          const old = p.streaks[u] ?? 0;
          const want = nx.cents === cur.cents ? old : nx.cents > cur.cents === (p.guesses[u] === "higher") ? old + 1 : 0;
          return n.streaks[u] === want;
        }) && Object.keys(p.streaks).every((u) => u in p.guesses || n.streaks[u] === p.streaks[u])
      );
    },
    "after a win only a new game changes anything": (p, n, a) => p.winner === null || a.t === "again" || p === n,
    "a new game needs a winner and clears every streak": (p, n, a) =>
      a.t !== "again" ||
      p === n ||
      (p.winner !== null && n.winner === null && Object.keys(n.streaks).length === 0 && Object.keys(n.guesses).length === 0 && n.round === 0 && n.last === null && n.current === n.items[0]?.id),
    "only people in the chat change the game": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (s.winner !== null) return r.next() < 0.8 ? { t: "again" } : { t: "guess", dir: "higher" };
    if (Object.keys(s.guesses).length > 0 && r.next() < 0.45) return { t: "reveal" };
    return { t: "guess", dir: r.next() < 0.5 ? "higher" : "lower" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const itemOf = (id: string) => confirmed.items.find((i) => i.id === id);
    const e = running(confirmed.at, SPIN_MS);
    const revealing = state.round !== confirmed.round || e !== null;
    const done = confirmed.winner !== null && !revealing;
    const shown = itemOf(e !== null && confirmed.last ? confirmed.last.from : confirmed.current);
    const guessed = Object.keys(state.guesses).length;
    const mine = state.guesses[me];
    const last = confirmed.last;
    const lf = last ? itemOf(last.from) : undefined;
    const lt = last ? itemOf(last.to) : undefined;
    let recap = "";
    if (!revealing && last && lf && lt) {
      const dir = lt.cents > lf.cents ? "higher" : lt.cents < lf.cents ? "lower" : "same";
      const names = (want: Result) =>
        Object.keys(last.results)
          .filter((u) => last.results[u] === want)
          .map(nameOf)
          .join(", ");
      const right = names("right");
      const wrong = names("wrong");
      recap = `${lf.label} ${money(lf.cents)} to ${lt.label} ${money(lt.cents)} · ${dir}`;
      const who = [right ? `Right: ${right}` : "", wrong ? `Wrong: ${wrong}` : ""].filter(Boolean).join(" · ");
      if (who) recap = `${recap}\n${who}`;
    }
    const winnerMember = members.find((m) => m.id === confirmed.winner);

    return (
      <div>
        <CardHeader
          title={confirmed.title}
          subtitle={done ? "Game over" : `${guessed} of ${members.length} guessed · ${state.goal} in a row wins`}
        />
        <div style={{ background: theme.color.wash, color: theme.color.text, borderRadius: theme.radius.card, padding: 12, display: "grid", gap: 2 }}>
          {done ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {winnerMember ? <Avatar user={winnerMember} size={40} /> : null}
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0 }}>{confirmed.winner === me ? "You win the boba" : `${nameOf(confirmed.winner ?? "")} wins the boba`}</h2>
                <small>{confirmed.goal} in a row</small>
              </div>
            </div>
          ) : (
            <>
              <small>{revealing ? "Spinning" : "Is the next number higher or lower?"}</small>
              <div style={{ fontWeight: 600 }}>{shown ? shown.label : ""}</div>
              <h2 style={{ margin: 0 }}>{shown ? money(shown.cents) : ""}</h2>
            </>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          {done ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "again" })}>
              New game
            </Button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <Button wide kind={mine === "higher" ? "primary" : "secondary"} disabled={revealing} onClick={() => dispatch({ t: "guess", dir: "higher" })}>
                Higher
              </Button>
              <Button wide kind={mine === "lower" ? "primary" : "secondary"} disabled={revealing} onClick={() => dispatch({ t: "guess", dir: "lower" })}>
                Lower
              </Button>
              <Button wide kind="secondary" disabled={revealing || guessed === 0} onClick={() => dispatch({ t: "reveal" })}>
                Reveal
              </Button>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", marginTop: 8 }}>
          {members.map((m) => {
            const n = confirmed.streaks[m.id] ?? 0;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
                <Avatar user={m} size={20} />
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: theme.type.meta, fontWeight: state.guesses[m.id] ? 600 : 400 }}>
                  {m.id === me ? "You" : m.name}
                </div>
                <div role="img" aria-label={`${n} of ${confirmed.goal}`} style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: confirmed.goal }, (_, i) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i < n ? userColor(m, theme) : theme.color.track }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {recap ? (
          <div style={{ marginTop: 8 }}>
            {recap.split("\n").map((line, i) => (
              <small key={i} style={{ display: "block" }}>
                {line}
              </small>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
});
