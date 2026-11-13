import { defineApp, Avatar, Button, CardHeader, clock, rng } from "@muse/app";

// Reaction game. Start a round, wait for the screen to change color, then tap. Tapping before the
// flip is a fail. Times show once the round is over, with a running best for each person.

const G = {
  title: "Who's fastest?",
  rules: "Wait for the color to change, then tap. Tapping early is a fail.",
  minWait: 1500,
  spread: 3500,
  timeout: 6000,
  maxRows: 6,
};

type State = {
  round: number;
  goAt: number | null;
  startedAt: number;
  results: Record<string, number>;
  best: Record<string, number>;
};
type Action = { t: "start" } | { t: "tap" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const hasResult = (s: State, id: string) => s.results[id] !== undefined;
const live = (s: State, members: { id: string }[], time: number) =>
  s.goAt !== null && !members.every((m) => hasResult(s, m.id)) && time < s.goAt + G.timeout;
const only = (r: Record<string, number>, ctx: { members: { id: string }[] }) => {
  const o: Record<string, number> = {};
  for (const k of Object.keys(r)) if (inChat(ctx, k)) o[k] = r[k]!;
  return o;
};
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

export default defineApp<State, Action, Local>({
  name: "Reaction game",

  summary: (s, ctx) => {
    if (s.round === 0) return `${G.title} No rounds yet.`;
    let topId = "";
    let topMs = -1;
    for (const k of Object.keys(s.best)) {
      const v = s.best[k]!;
      if (inChat(ctx, k) && (topMs < 0 || v < topMs)) {
        topMs = v;
        topId = k;
      }
    }
    const name = ctx.members.find((m) => m.id === topId)?.name;
    return name ? `Round ${s.round} · ${name} fastest at ${topMs} ms` : `Round ${s.round} · no valid times yet`;
  },

  init: () => ({ round: 0, goAt: null, startedAt: 0, results: {}, best: {} }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "start") {
      if (live(s, ctx.members, m.time)) return s;
      return {
        round: s.round + 1,
        goAt: m.time + G.minWait + rng(m.seed).int(G.spread),
        startedAt: m.time,
        results: {},
        best: s.best,
      };
    }
    if (a.t === "tap") {
      if (s.goAt === null || hasResult(s, m.user) || m.time > s.goAt + G.timeout) return s;
      if (m.time < s.goAt) return { ...s, results: { ...s.results, [m.user]: -1 } };
      const ms = m.time - s.goAt;
      const prev = s.best[m.user];
      return {
        ...s,
        results: { ...s.results, [m.user]: ms },
        best: prev !== undefined && prev <= ms ? s.best : { ...s.best, [m.user]: ms },
      };
    }
    return s;
  },

  // Someone left: their times go with them. Someone joined: they can tap in the next round.
  onMembers: (s, ctx) => {
    const ok = (r: Record<string, number>) => Object.keys(r).every((k) => inChat(ctx, k));
    if (ok(s.results) && ok(s.best)) return s;
    return { ...s, results: only(s.results, ctx), best: only(s.best, ctx) };
  },

  invariants: {
    "results and bests belong to people in the chat": (s, ctx) =>
      Object.keys(s.results).every((k) => inChat(ctx, k)) && Object.keys(s.best).every((k) => inChat(ctx, k)),
    "a result is a false start or a whole number of ms, a best is a whole number of ms": (s) =>
      Object.values(s.results).every((v) => v === -1 || (Number.isInteger(v) && v >= 0)) &&
      Object.values(s.best).every((v) => Number.isInteger(v) && v >= 0),
    "a valid result is never faster than the person's best": (s) =>
      Object.keys(s.results).every((k) => {
        const r = s.results[k]!;
        const b = s.best[k];
        return r < 0 || (b !== undefined && b <= r);
      }),
    "no flip time means round zero and no results": (s) =>
      s.goAt !== null || (s.round === 0 && Object.keys(s.results).length === 0),
    "the flip comes 1500 to 4999 ms after the start": (s) =>
      s.goAt === null || (s.round >= 1 && s.goAt >= s.startedAt + G.minWait && s.goAt < s.startedAt + G.minWait + G.spread),
  },

  transitions: {
    "a start adds a round, clears results and sets the flip from the seed": (p, n, a, m) =>
      a.t !== "start" ||
      p === n ||
      (n.round === p.round + 1 &&
        Object.keys(n.results).length === 0 &&
        n.startedAt === m.time &&
        n.goAt === m.time + G.minWait + rng(m.seed).int(G.spread) &&
        same(n.best, p.best)),
    "a start is accepted only when no live round remains": (p, n, a, m, ctx) =>
      a.t !== "start" || p === n || !live(p, ctx.members, m.time),
    "a tap adds one result for the tapper: -1 if early, else the lag after the flip": (p, n, a, m) => {
      if (a.t !== "tap" || p === n) return true;
      if (p.goAt === null) return false;
      const want = m.time < p.goAt ? -1 : m.time - p.goAt;
      const before = Object.keys(p.results);
      return (
        p.results[m.user] === undefined &&
        n.results[m.user] === want &&
        Object.keys(n.results).length === before.length + 1 &&
        before.every((k) => n.results[k] === p.results[k]) &&
        n.goAt === p.goAt &&
        n.round === p.round
      );
    },
    "a tap only lowers the tapper's best, and a false start leaves best alone": (p, n, a, m) => {
      if (a.t !== "tap" || p === n) return true;
      const others =
        Object.keys(n.best).every((k) => k === m.user || n.best[k] === p.best[k]) &&
        Object.keys(p.best).every((k) => k === m.user || n.best[k] === p.best[k]);
      const r = n.results[m.user];
      const pb = p.best[m.user];
      const nb = n.best[m.user];
      if (r === undefined) return false;
      if (r < 0) return others && pb === nb;
      return others && nb !== undefined && nb === (pb === undefined ? r : Math.min(pb, r));
    },
    "a tap after the round timed out changes nothing": (p, n, a, m) =>
      a.t !== "tap" || p.goAt === null || m.time <= p.goAt + G.timeout || p === n,
    "a result never changes once set": (p, n, a) =>
      a.t !== "tap" || Object.keys(p.results).every((k) => n.results[k] === p.results[k]),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => (s.goAt === null || r.next() < 0.3 ? { t: "start" } : { t: "tap" }),

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const c = confirmed;
    const now = clock.value;
    const starting = pending && state.round !== c.round;
    const tappedCount = members.filter((m) => c.results[m.id] !== undefined).length;
    const allDone = members.every((m) => c.results[m.id] !== undefined);
    const over = c.goAt === null || allDone || now >= c.goAt + G.timeout;
    const phase = starting
      ? "starting"
      : c.goAt === null
        ? "idle"
        : over
          ? "over"
          : now < c.goAt
            ? "wait"
            : "go";

    const mine = c.results[me];
    const sending = pending && state.results[me] !== undefined && mine === undefined;
    const canTap = (phase === "wait" || phase === "go") && state.results[me] === undefined;

    let min = -1;
    for (const m of members) {
      const r = c.results[m.id];
      if (r !== undefined && r >= 0 && (min < 0 || r < min)) min = r;
    }
    const winners = members.filter((m) => min >= 0 && c.results[m.id] === min);

    let head = "";
    let sub = "";
    if (phase === "starting") {
      head = "Getting ready";
    } else if (phase === "idle") {
      head = "Press start";
      sub = G.rules;
    } else if (phase === "wait") {
      if (sending) head = "Sending";
      else if (mine === -1) {
        head = "Too early";
        sub = "You are out this round";
      } else {
        head = "Wait for it";
        sub = "Tap when the color changes";
      }
    } else if (phase === "go") {
      if (sending) head = "Sending";
      else if (mine !== undefined && mine >= 0) {
        head = `${mine} ms`;
        sub = "Waiting for the others";
      } else head = "Tap now";
    } else {
      head = winners.length ? `${winners.map((w) => (w.id === me ? "You" : w.name)).join(", ")} · ${min} ms` : "No valid taps";
      sub = `Round ${c.round} is over`;
    }

    const go = phase === "go" && !sending && !(mine !== undefined);
    const panelStyle = {
      minHeight: 96,
      borderRadius: theme.radius.card,
      padding: 12,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center" as const,
      gap: 4,
      userSelect: "none" as const,
      background: go ? theme.color.primary : theme.color.wash,
      color: go ? theme.color.onPrimary : theme.color.text,
    };

    const rows = [...members]
      .sort((a, b) => {
        const x = c.best[a.id];
        const y = c.best[b.id];
        if (x === undefined && y === undefined) return a.name < b.name ? -1 : 1;
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        return x - y || (a.name < b.name ? -1 : 1);
      })
      .slice(0, G.maxRows);

    const cellFor = (id: string) => {
      const r = c.results[id];
      if (c.goAt === null) return "";
      if (r === undefined) return over ? "No tap" : "Waiting";
      if (!over && id !== me) return "Tapped";
      return r < 0 ? "Too early" : `${r} ms`;
    };

    const panelBody = (
      <>
        <h2 style={{ margin: 0, color: go ? theme.color.onPrimary : theme.color.text }}>{head}</h2>
        {sub ? <div style={{ fontSize: theme.type.meta, color: go ? theme.color.onPrimary : theme.color.text }}>{sub}</div> : null}
      </>
    );

    return (
      <div>
        <CardHeader
          title={G.title}
          subtitle={c.round === 0 ? "No rounds yet" : `Round ${c.round} · ${tappedCount} of ${members.length} tapped`}
        />
        {canTap ? (
          <div role="button" tabIndex={0} aria-label="Tap when the screen changes" style={panelStyle} onPointerDown={() => dispatch({ t: "tap" })}>
            {panelBody}
          </div>
        ) : (
          <div style={panelStyle}>{panelBody}</div>
        )}
        <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
          {rows.map((m) => {
            const isMe = m.id === me;
            const b = c.best[m.id];
            const r = c.results[m.id];
            const win = over && r !== undefined && r >= 0 && r === min;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 40,
                  padding: "2px 8px",
                  borderRadius: theme.radius.button,
                  ...(isMe ? { background: theme.color.selected } : {}),
                }}
              >
                <Avatar user={m} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isMe ? "You" : m.name}</div>
                  <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b !== undefined ? `Best ${b} ms` : "No best yet"}
                  </small>
                </div>
                {win ? (
                  <div
                    style={{
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      padding: "2px 8px",
                      borderRadius: theme.radius.pill,
                      background: theme.color.wash,
                      color: theme.color.text,
                    }}
                  >
                    {`${r} ms`}
                  </div>
                ) : (
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{cellFor(m.id)}</div>
                )}
              </div>
            );
          })}
          {members.length > G.maxRows ? <small>{`+${members.length - G.maxRows} more`}</small> : null}
        </div>
        <div style={{ minHeight: 44, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {phase === "idle" || phase === "over" ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "start" })}>
              {c.round === 0 ? "Start round" : "Next round"}
            </Button>
          ) : phase === "starting" ? (
            <small>Getting ready</small>
          ) : (
            <small>{`${tappedCount} of ${members.length} tapped`}</small>
          )}
        </div>
      </div>
    );
  },
});
