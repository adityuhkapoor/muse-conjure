import { defineApp, Button, Chip, CardHeader, Avatar, Burst, haptic, userColor } from "@muse/app";

type Params = {
  /** App name shown for the mini-app. */
  appName: string;
  /** Card title shown in the header. */
  title: string;
  /** Name of the activity, used in the summary and the table's accessibility label. */
  activity: string;
  /** Label for the running multi-series tally, shown before the series score (e.g. "Tonight: 2–1"). */
  seriesLabel: string;
  /** First names of team one's players (0 to 2), matched against chat members by first name. */
  teamA: string[];
  /** First names of team two's players (0 to 2), matched against chat members by first name. */
  teamB: string[];
  /** Number of game wins needed to take a series. */
  target: number;
};

// @params
const P: Params = {
  appName: "Pong score",
  title: "Beer pong · rematch tonight",
  activity: "Beer pong",
  seriesLabel: "Tonight",
  teamA: ["Kev", "Bryan"],
  teamB: ["Dev", "Marcus"],
  target: 3,
};
// @end params

type Team = "A" | "B";
type Game = { team: Team; by: string };
type State = { teamA: string[]; teamB: string[]; target: number; games: Game[]; series: { a: number; b: number }[] };
type Action = { t: "win"; team: Team } | { t: "undo" } | { t: "rematch" };
type Local = { bursts: number; side: string };
type Cx = { members: { id: string; name: string }[] };

const MAX_SERIES = 12;
const MAX_TEAM = 2;
const inChat = (ctx: Cx, id: string) => ctx.members.some((m) => m.id === id);
const sc = (s: State, t: Team) => s.games.filter((g) => g.team === t).length;
const isDone = (s: State) => sc(s, "A") >= s.target || sc(s, "B") >= s.target;
const onTeam = (s: State, u: string) => s.teamA.includes(u) || s.teamB.includes(u);
const first = (name: string) => name.trim().split(" ")[0] ?? name;
const teamLabel = (ids: string[], members: { id: string; name: string }[], fallback: string) => {
  const names = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is { id: string; name: string } => !!m).map((m) => first(m.name));
  return names.length ? names.join(" & ") : fallback;
};
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

export default defineApp<State, Action, Local>({
  name: P.appName,
  summary: (s, ctx) =>
    `${P.activity} · ${teamLabel(s.teamA, ctx.members, "Team one")} ${sc(s, "A")}, ${teamLabel(s.teamB, ctx.members, "Team two")} ${sc(s, "B")}, first to ${s.target}`,

  init: (ctx) => {
    const idOf = (n: string) => ctx.members.find((m) => first(m.name).toLowerCase() === n.toLowerCase())?.id ?? null;
    const namesA = P.teamA.slice(0, MAX_TEAM);
    const namesB = P.teamB.slice(0, MAX_TEAM);
    const a = namesA.map(idOf);
    const b = namesB.map(idOf);
    const all = [...a, ...b].filter((x): x is string => x !== null);
    const total = namesA.length + namesB.length;
    if (all.length === total && new Set(all).size === total) {
      return { teamA: all.slice(0, namesA.length), teamB: all.slice(namesA.length), target: P.target, games: [], series: [] };
    }
    const ids = ctx.members.map((m) => m.id);
    return {
      teamA: ids.slice(0, namesA.length),
      teamB: ids.slice(namesA.length, namesA.length + namesB.length),
      target: P.target,
      games: [],
      series: [],
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (!s.teamA.includes(m.user) && !s.teamB.includes(m.user)) return s;
    const sa = s.games.filter((g) => g.team === "A").length;
    const sb = s.games.filter((g) => g.team === "B").length;
    const done = sa >= s.target || sb >= s.target;
    if (a.t === "win") {
      if ((a.team !== "A" && a.team !== "B") || done) return s;
      return { ...s, games: [...s.games, { team: a.team, by: m.user }] };
    }
    if (a.t === "undo") {
      if (s.games.length === 0) return s;
      return { ...s, games: s.games.slice(0, -1) };
    }
    if (a.t === "rematch") {
      if (!done) return s;
      return { ...s, games: [], series: [...s.series, { a: sa, b: sb }].slice(-MAX_SERIES) };
    }
    return s;
  },

  invariants: {
    "the target is always the configured one": (s) => s.target === P.target,
    "no team has more wins than the target": (s) => sc(s, "A") <= s.target && sc(s, "B") <= s.target,
    "at most one team has reached the target": (s) => !(sc(s, "A") >= s.target && sc(s, "B") >= s.target),
    "every game is for team A or B and was logged by a player": (s) => s.games.every((g) => (g.team === "A" || g.team === "B") && onTeam(s, g.by)),
    "the two teams share no one": (s) => s.teamA.every((u) => !s.teamB.includes(u)) && s.teamA.length <= MAX_TEAM && s.teamB.length <= MAX_TEAM,
    "each finished series has one side at the target and the other below": (s) =>
      s.series.length <= MAX_SERIES && s.series.every((r) => (r.a === s.target && r.b < s.target && r.b >= 0) || (r.b === s.target && r.a < s.target && r.a >= 0)),
  },

  transitions: {
    "a win adds one game for the chosen team by the actor": (p, n, a, m) =>
      a.t !== "win" ||
      p === n ||
      (n.games.length === p.games.length + 1 &&
        same(n.games.slice(0, -1), p.games) &&
        n.games.at(-1)?.team === a.team &&
        n.games.at(-1)?.by === m.user &&
        sc(n, a.team) === sc(p, a.team) + 1),
    "a win is never refused while a player has games left": (p, n, a, m, ctx) =>
      a.t !== "win" || !inChat(ctx, m.user) || !onTeam(p, m.user) || (a.team !== "A" && a.team !== "B") || isDone(p) || p !== n,
    "a finished series takes no more wins": (p, n, a) => a.t !== "win" || !isDone(p) || p === n,
    "an undo removes only the last game": (p, n, a) =>
      a.t !== "undo" || p === n || (n.games.length === p.games.length - 1 && same(p.games.slice(0, -1), n.games) && same(p.series, n.series)),
    "an undo is never refused when there is a game to remove": (p, n, a, m, ctx) =>
      a.t !== "undo" || !inChat(ctx, m.user) || !onTeam(p, m.user) || p.games.length === 0 || p !== n,
    "a rematch records the final score and clears the games": (p, n, a) =>
      a.t !== "rematch" ||
      p === n ||
      (isDone(p) &&
        n.games.length === 0 &&
        n.series.at(-1)?.a === sc(p, "A") &&
        n.series.at(-1)?.b === sc(p, "B") &&
        n.series.length === Math.min(MAX_SERIES, p.series.length + 1)),
    "teams and target never change in a step": (p, n) => same([p.teamA, p.teamB, p.target], [n.teamA, n.teamB, n.target]),
    "only players in the chat change anything": (p, n, a, m, ctx) => p === n || (inChat(ctx, m.user) && onTeam(p, m.user)),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    const sides: Team[] = ["A", "B"];
    if (isDone(s)) return k < 0.6 ? { t: "rematch" } : k < 0.85 ? { t: "undo" } : { t: "win", team: r.pick(sides) };
    if (k < 0.7) return { t: "win", team: r.pick(sides) };
    if (k < 0.88) return { t: "undo" };
    return { t: "rematch" };
  },

  local: { bursts: 0, side: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const sa = sc(state, "A");
    const sb = sc(state, "B");
    const done = isDone(state);
    const canPlay = onTeam(state, me);
    const labelA = teamLabel(state.teamA, members, "Team one");
    const labelB = teamLabel(state.teamB, members, "Team two");
    const winner: Team | null = done ? (sa >= state.target ? "A" : "B") : null;
    const myTeam: Team | null = state.teamA.includes(me) ? "A" : state.teamB.includes(me) ? "B" : null;
    const labelOf = (t: Team) => (t === "A" ? labelA : labelB);

    let status: string;
    if (winner) {
      const w = winner === "A" ? sa : sb;
      const l = winner === "A" ? sb : sa;
      status = `${labelOf(winner)} win ${w}–${l}${myTeam === winner ? " · you're on the winning side" : ""}`;
    } else if (state.games.length === 0) {
      status = "Tap a side when it wins a game";
    } else if (sa === sb) {
      status = sa === state.target - 1 ? `${sa}–${sb} · next game decides it` : `${sa}–${sb} · level`;
    } else {
      const lead: Team = sa > sb ? "A" : "B";
      const hi = Math.max(sa, sb);
      const lo = Math.min(sa, sb);
      const rem = state.target - hi;
      status = `${labelOf(lead)} lead ${hi}–${lo} · ${rem === 1 ? "one more takes it" : `${rem} more to win`}`;
    }

    const wa = state.series.filter((r) => r.a > r.b).length;
    const wb = state.series.filter((r) => r.b > r.a).length;
    const lastGames = state.games.map((g, i) => ({ g, i })).slice(-3);

    const tap = (team: Team) => {
      if (!canPlay || done) return;
      haptic("light");
      setLocal({ bursts: local.bursts + 1, side: team });
      dispatch({ t: "win", team });
    };

    const face = (id: string | undefined, k: string, lift: boolean) => {
      const mem = id ? members.find((m) => m.id === id) : undefined;
      const own = !!mem && mem.id === me;
      return (
        <span key={k} style={{ width: 68, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transform: lift ? "translateY(-4px)" : "none", transition: "transform 200ms" }}>
          {mem ? (
            <span style={{ display: "inline-flex", borderRadius: 999, boxShadow: own ? `0 0 0 2px ${c.primary}` : "none" }}>
              <Avatar user={mem} size={36} />
            </span>
          ) : (
            <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, boxSizing: "border-box", border: `1px dashed ${c.track}` }} />
          )}
          <small style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: own ? c.link : c.secondaryText, fontWeight: own ? 600 : 400 }}>
            {mem ? (own ? "You" : first(mem.name)) : "\u00a0"}
          </small>
        </span>
      );
    };

    const colorFor = (id: string) => {
      const mem = members.find((m) => m.id === id);
      return mem ? userColor(mem, theme) : c.secondaryText;
    };

    const half = (team: Team) => {
      const ids = team === "A" ? state.teamA : state.teamB;
      const score = team === "A" ? sa : sb;
      const other = team === "A" ? sb : sa;
      const won = winner === team;
      const lost = winner !== null && winner !== team;
      const fill = ids[0] ? colorFor(ids[0]) : c.secondaryText;
      return (
        <div style={{ position: "relative", flex: 1, minWidth: 0, borderLeft: team === "B" ? `1px solid ${c.divider}` : "none" }}>
          <button
            type="button"
            aria-label={`${labelOf(team)}, ${score} of ${state.target} games. Tap to log a game win`}
            onClick={() => tap(team)}
            style={{ width: "100%", height: "100%", minHeight: 44, padding: "8px 4px", border: "none", background: "transparent", color: "inherit", font: "inherit", cursor: canPlay && !done ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}
          >
            <span style={{ height: 24, display: "flex", alignItems: "center" }}>
              {won ? <Chip tone="positive">Won</Chip> : myTeam === team ? <small>Your team</small> : <small>{"\u00a0"}</small>}
            </span>
            <span style={{ display: "flex", gap: 6, opacity: lost ? 0.45 : 1, transition: "opacity 200ms" }}>
              {Array.from({ length: state.target }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{ width: 28, height: 28, boxSizing: "border-box", borderRadius: 14, border: `1px solid ${c.track}`, background: i < score ? fill : "transparent", transform: i < score ? "scale(1)" : "scale(0.92)", transition: "transform 200ms, background 200ms" }}
                />
              ))}
            </span>
            <span style={{ position: "relative", fontSize: 20, fontWeight: 600, lineHeight: "28px" }}>
              {score}
              {score > other ? <span aria-hidden="true" style={{ position: "absolute", left: "100%", marginLeft: 6, top: "50%", marginTop: -5, width: 10, height: 10, borderRadius: 5, background: c.secondaryText }} /> : null}
            </span>
            <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              {face(ids[0], "f0", won)}
              {face(ids[1], "f1", won)}
            </span>
          </button>
          {local.bursts > 0 && local.side === team ? (
            <span style={{ position: "absolute", left: "50%", bottom: 90, pointerEvents: "none" }}>
              <Burst key={local.bursts} />
            </span>
          ) : null}
        </div>
      );
    };

    return (
      <div>
        <CardHeader title={P.title} subtitle={`${labelA} ${sa} · ${labelB} ${sb} · first to ${state.target}`} />
        <div role="group" aria-label={`${P.activity} table. ${labelA} ${sa}, ${labelB} ${sb}`} style={{ display: "flex", height: 190, borderRadius: theme.radius.card, background: c.wash, overflow: "hidden" }}>
          {half("A")}
          {half("B")}
        </div>
        <div style={{ minHeight: 36, display: "flex", alignItems: "center", fontWeight: 600 }}>{status}</div>
        {lastGames.length ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, overflow: "hidden" }}>
            {lastGames.map(({ g, i }) => (
              <Chip key={i} maxWidth={92}>{`Game ${i + 1} · ${labelOf(g.team)}`}</Chip>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <small style={{ flex: 1, minWidth: 0 }}>{state.series.length ? `${P.seriesLabel}: ${wa}–${wb}` : `First to ${state.target}`}</small>
          <Button disabled={!canPlay || state.games.length === 0} onClick={() => dispatch({ t: "undo" })}>
            Undo
          </Button>
          {done ? (
            <Button disabled={!canPlay} onClick={() => dispatch({ t: "rematch" })}>
              Rematch
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
