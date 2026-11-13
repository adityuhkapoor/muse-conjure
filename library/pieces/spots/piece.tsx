import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, running, spring, springs } from "@muse/app";

// Open spots: a plan with a few open spots. People ask for one; a host accepts or declines each
// ask; accepted people fill the spots. A spot never holds two people, and the count never goes
// past the spots on offer. Someone who leaves the chat frees their spot.

type Params = {
  /** Card title, the plan: "Tahoe cabin weekend" */
  title: string;
  /** One plain line with where, when and cost from the chat: "Fri Jan 17 - Sun 19 · $85 each". Empty if none. */
  detail: string;
  /** Open spots on offer, 1 to 10. */
  spots: number;
  /** Names of the people running the plan, exactly as in the members list. Empty: whoever is first in the chat. */
  hosts: string[];
};

// @params
const P: Params = {
  title: "Tahoe cabin weekend",
  detail: "Fri Jan 17 - Sun 19 · $85 each",
  spots: 3,
  hosts: ["Priya"],
};
// @end params

/** waiting: asked, no answer yet. in: a host accepted (holds a spot). declined: a host said no. */
type Ask = { user: string; status: "waiting" | "in" | "declined"; by: string | null; at: number };
type State = { title: string; detail: string; spots: number; hosts: string[]; asks: Ask[] };
type Action = { t: "ask" } | { t: "withdraw" } | { t: "accept"; user: string } | { t: "decline"; user: string };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const MAX_SPOTS = 10;
const FILL_MS = 900;
const pop = spring(springs.iosBouncy);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
// Check helpers (invariants, transitions, view).
const taken = (s: State) => s.asks.filter((a) => a.status === "in").length;
const askOf = (s: State, u: string) => s.asks.find((a) => a.user === u);
const others = (p: State, n: State, u: string) => {
  const rest = (x: State) => JSON.stringify(x.asks.filter((a) => a.user !== u));
  return rest(p) === rest(n);
};

// Reducer helpers.
function answer(s: State, host: string, who: unknown, to: "in" | "declined", time: number): State {
  if (!s.hosts.includes(host) || typeof who !== "string") return s;
  const a = s.asks.find((x) => x.user === who);
  if (!a || a.status !== "waiting") return s;
  if (to === "in" && s.asks.filter((x) => x.status === "in").length >= s.spots) return s;
  return { ...s, asks: s.asks.map((x) => (x.user === who ? { ...x, status: to, by: host, at: time } : x)) };
}

function hostsFor(ctx: Ctx, names: readonly string[]): string[] {
  const want = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const ids = (ctx.members as { id: string; name?: string }[]).filter((m) => want.includes((m.name ?? "").toLowerCase()) || want.includes(m.id)).map((m) => m.id);
  return ids.length ? ids : ctx.members.slice(0, 1).map((m) => m.id);
}

export default defineApp<State, Action, Local>({
  name: "Open spots",
  summary: (s) => {
    const waiting = s.asks.filter((a) => a.status === "waiting").length;
    return `${s.title}: ${taken(s)} of ${s.spots} spots filled${waiting ? `, ${waiting} waiting` : ""}.`;
  },

  init: (ctx) => ({
    title: P.title.trim().slice(0, 60) || "Open spots",
    detail: P.detail.trim().slice(0, 80),
    spots: Math.max(1, Math.min(MAX_SPOTS, Math.floor(P.spots) || 1)),
    hosts: hostsFor(ctx, P.hosts),
    asks: [],
  }),

  reduce: (state, action, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return state;
    switch (action.t) {
      case "ask":
        if (state.hosts.includes(u) || state.asks.some((a) => a.user === u)) return state;
        return { ...state, asks: [...state.asks, { user: u, status: "waiting", by: null, at: meta.time }] };
      case "withdraw": {
        const mine = state.asks.find((a) => a.user === u);
        if (!mine || mine.status === "declined") return state;
        return { ...state, asks: state.asks.filter((a) => a.user !== u) };
      }
      case "accept":
        return answer(state, u, action.user, "in", meta.time);
      case "decline":
        return answer(state, u, action.user, "declined", meta.time);
    }
    return state;
  },

  // Someone left: their ask goes and their spot opens. A host who left is replaced by the first
  // person still in the chat (who stops being an asker), so the plan always has someone to answer.
  onMembers: (state, ctx) => {
    let hosts = state.hosts.filter((h) => inChat(ctx, h));
    if (hosts.length === 0 && ctx.members.length > 0) hosts = [ctx.members[0]!.id];
    const asks = state.asks.filter((a) => inChat(ctx, a.user) && !hosts.includes(a.user));
    if (hosts.join() === state.hosts.join() && asks.length === state.asks.length) return state;
    return { ...state, hosts, asks };
  },

  invariants: {
    "accepted people never outnumber the spots": (s) => taken(s) <= s.spots,
    "spots are 1 to 10": (s) => Number.isInteger(s.spots) && s.spots >= 1 && s.spots <= MAX_SPOTS,
    "one ask per person": (s) => new Set(s.asks.map((a) => a.user)).size === s.asks.length,
    "hosts never ask": (s) => s.asks.every((a) => !s.hosts.includes(a.user)),
    "everyone on the plan is in the chat": (s, ctx) => [...s.hosts, ...s.asks.map((a) => a.user)].every((u) => inChat(ctx, u)),
    "there is a host whenever anyone is in the chat": (s, ctx) => ctx.members.length === 0 || s.hosts.length > 0,
    "only answered asks name who answered": (s) => s.asks.every((a) => (a.status === "waiting") === (a.by === null)),
  },

  transitions: {
    "an ask adds the actor, waiting, at the end": (p, n, a, m) =>
      a.t !== "ask" || p === n || (n.asks.length === p.asks.length + 1 && n.asks.at(-1)?.user === m.user && n.asks.at(-1)?.status === "waiting" && !p.hosts.includes(m.user) && !askOf(p, m.user) && others(p, n, m.user)),
    "a withdraw removes only the actor's own ask": (p, n, a, m) =>
      a.t !== "withdraw" || p === n || (!!askOf(p, m.user) && askOf(p, m.user)!.status !== "declined" && !askOf(n, m.user) && n.asks.length === p.asks.length - 1 && others(p, n, m.user)),
    "only a host accepts, into an open spot, and only that ask changes": (p, n, a, m) =>
      a.t !== "accept" || p === n || (p.hosts.includes(m.user) && taken(p) < p.spots && askOf(p, a.user)?.status === "waiting" && askOf(n, a.user)?.status === "in" && askOf(n, a.user)?.by === m.user && taken(n) === taken(p) + 1 && others(p, n, a.user)),
    "only a host declines a waiting ask, and only that ask changes": (p, n, a, m) =>
      a.t !== "decline" || p === n || (p.hosts.includes(m.user) && askOf(p, a.user)?.status === "waiting" && askOf(n, a.user)?.status === "declined" && askOf(n, a.user)?.by === m.user && others(p, n, a.user)),
    "a host's answer to a waiting ask always lands": (p, n, a, m, ctx) =>
      (a.t !== "accept" && a.t !== "decline") || !inChat(ctx, m.user) || !p.hosts.includes(m.user) || askOf(p, a.user)?.status !== "waiting" || (a.t === "accept" && taken(p) >= p.spots) || p !== n,
    "an ask from someone new always lands": (p, n, a, m, ctx) => a.t !== "ask" || !inChat(ctx, m.user) || p.hosts.includes(m.user) || !!askOf(p, m.user) || p !== n,
    "the plan and its hosts never change by an action": (p, n) => p.title === n.title && p.detail === n.detail && p.spots === n.spots && p.hosts.join() === n.hosts.join(),
    "only people in the chat change the plan": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    if (s.hosts.includes(user)) {
      const waiting = s.asks.filter((a) => a.status === "waiting");
      if (waiting.length && r.next() < 0.85) return { t: r.next() < 0.75 ? "accept" : "decline", user: r.pick(waiting).user };
      if (s.asks.length) return { t: r.next() < 0.5 ? "accept" : "decline", user: r.pick(s.asks).user };
      return { t: "accept", user: r.pick(ctx.members)?.id ?? user };
    }
    const mine = askOf(s, user);
    // Now and then someone who is not a host tries to answer: it must change nothing.
    if (s.asks.length && r.next() < 0.1) return { t: r.next() < 0.5 ? "accept" : "decline", user: r.pick(s.asks).user };
    if (mine && r.next() < 0.3) return { t: "withdraw" };
    return { t: "ask" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const isHost = state.hosts.includes(me);
    const ins = state.asks.filter((a) => a.status === "in");
    const waiting = state.asks.filter((a) => a.status === "waiting");
    const mine = askOf(state, me);
    const full = ins.length >= state.spots;
    const open = state.spots - ins.length;
    const hostNames = state.hosts.map((h) => (h === me ? "you" : nameOf(h))).join(" and ");
    // The spot that filled last springs in; the rest sit still.
    const newest = ins.reduce((t, a) => Math.max(t, a.at), 0);
    const size = state.spots > 6 ? 36 : 44;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.detail || `Hosted by ${hostNames}`} />
        <div role="list" aria-label={`${ins.length} of ${state.spots} spots filled`} style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0 8px" }}>
          {Array.from({ length: state.spots }, (_, i) => {
            const a = ins[i];
            const e = a && a.at === newest ? running(a.at, FILL_MS) : null;
            const k = e === null ? 1 : pop(e);
            return (
              <div key={i} role="listitem" aria-label={a ? nameOf(a.user) : "Open spot"} style={{ width: size + 8, display: "grid", justifyItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: size,
                    height: size,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: a ? `0 0 0 2px ${full ? theme.color.positive : theme.color.primary}` : `inset 0 0 0 2px ${theme.color.divider}`,
                    background: a ? theme.color.card : theme.color.input,
                    transition: `box-shadow ${theme.motion.slow}ms`,
                  }}
                >
                  {a ? (
                    <div style={{ transform: `scale(${k})`, display: "flex" }}>
                      <Avatar user={a.user} size={size - 6} />
                    </div>
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: 20, lineHeight: "20px", color: theme.color.secondaryText }}>
                      +
                    </span>
                  )}
                </div>
                <small style={{ maxWidth: size + 8, minHeight: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.color.text }}>{a ? nameOf(a.user) : ""}</small>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: full ? theme.color.positive : theme.color.text }}>
            {full ? `All ${state.spots} spots filled` : ins.length ? `${open} of ${state.spots} open` : `${state.spots} open spot${state.spots === 1 ? "" : "s"}`}
          </span>
          {waiting.length ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Facepile users={waiting.map((a) => a.user)} max={3} size={20} />
              <small>{waiting.length} waiting</small>
            </span>
          ) : null}
        </div>

        {isHost ? (
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {waiting.length === 0 ? <SystemLine>{full ? "Every spot is taken" : "No asks yet. They show up here."}</SystemLine> : null}
            {waiting.slice(0, 3).map((a) => (
              <div key={a.user} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <Avatar user={a.user} size={32} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(a.user)}</div>
                <Button kind="deemphasized" disabled={full} onClick={() => dispatch({ t: "accept", user: a.user })}>
                  Accept
                </Button>
                <Button onClick={() => dispatch({ t: "decline", user: a.user })}>Decline</Button>
              </div>
            ))}
            {waiting.length > 3 ? <small>{`${waiting.length - 3} more waiting`}</small> : null}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {!mine ? (
              <Button kind="primary" wide disabled={full} onClick={() => dispatch({ t: "ask" })}>
                {full ? "Full" : "Request"}
              </Button>
            ) : mine.status === "waiting" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{`Asked · waiting on ${hostNames}`}</span>
                <Button onClick={() => dispatch({ t: "withdraw" })}>Cancel</Button>
              </div>
            ) : mine.status === "in" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{`You're in · ${nameOf(mine.by ?? "")} accepted`}</span>
                <Button onClick={() => dispatch({ t: "withdraw" })}>Leave</Button>
              </div>
            ) : (
              <SystemLine>{`${nameOf(mine.by ?? "")} can't fit you this time`}</SystemLine>
            )}
            {state.detail ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Facepile users={state.hosts} max={3} size={20} />
                <small>{`Hosted by ${hostNames}`}</small>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  },
});
