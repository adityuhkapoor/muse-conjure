import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, rng, running } from "@muse/app";

const CHAT = {
  title: "Who adds songs first?",
  playlist: "cle or bust",
  rule: "One song each per round",
};

type State = { order: string[]; at: number; shuffles: number; by: string | null; done: string[] };
type Action = { t: "shuffle" } | { t: "added" } | { t: "undo" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const ids = (ctx: { members: { id: string }[] }) => ctx.members.map((m) => m.id);
const unique = (xs: string[]) => new Set(xs).size === xs.length;
const rest = (p: State, n: State) => p.at === n.at && p.shuffles === n.shuffles && p.by === n.by && p.order.join() === n.order.join();
const ordinal = (n: number) => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  const d = n % 10;
  return d === 1 ? `${n}st` : d === 2 ? `${n}nd` : d === 3 ? `${n}rd` : `${n}th`;
};

export default defineApp<State, Action, Local>({
  name: "Turn order",
  summary: (s, ctx) => {
    const first = ctx.members.find((m) => m.id === s.order[0])?.name;
    if (!first) return `${CHAT.title} Not drawn yet.`;
    return `${CHAT.title} ${first} goes first. ${s.done.length} of ${s.order.length} added.`;
  },

  init: () => ({ order: [], at: 0, shuffles: 0, by: null, done: [] }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "shuffle") {
      const all = ids(ctx);
      if (all.length < 2 || state.done.length > 0) return state;
      return { order: rng(meta.seed).shuffle([...all]), at: meta.time, shuffles: state.shuffles + 1, by: meta.user, done: [] };
    }
    if (action.t === "added") {
      if (!state.order.includes(meta.user) || state.done.includes(meta.user)) return state;
      return { ...state, done: [...state.done, meta.user] };
    }
    if (action.t === "undo") {
      if (!state.done.includes(meta.user)) return state;
      return { ...state, done: state.done.filter((u) => u !== meta.user) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const byGone = state.by !== null && !here(state.by);
    if (!byGone && state.order.every(here) && state.done.every(here)) return state;
    return {
      ...state,
      order: state.order.filter(here),
      done: state.done.filter(here),
      by: byGone ? null : state.by,
    };
  },

  invariants: {
    "no one is in the order twice": (s) => unique(s.order),
    "everyone in the order is in the chat": (s, ctx) => s.order.every((u) => inChat(ctx, u)),
    "everyone who added is in the order, once": (s) => unique(s.done) && s.done.every((u) => s.order.includes(u)),
    "the person who drew is in the chat": (s, ctx) => s.by === null || inChat(ctx, s.by),
    "the order is no longer than the chat": (s, ctx) => s.order.length <= ctx.members.length,
    "no draw means no order and no time": (s) => s.shuffles !== 0 || (s.order.length === 0 && s.at === 0 && s.done.length === 0),
  },

  transitions: {
    "a draw orders every member, counts once, and clears who added": (p, n, a, m, ctx) => {
      if (a.t !== "shuffle" || p === n) return true;
      const all = ids(ctx);
      return (
        n.order.length === all.length &&
        all.every((u) => n.order.includes(u)) &&
        n.shuffles === p.shuffles + 1 &&
        n.at === m.time &&
        n.by === m.user &&
        n.done.length === 0
      );
    },
    "a draw follows the seed": (p, n, a, m, ctx) =>
      a.t !== "shuffle" || p === n || m.seed === 0 || n.order.join() === rng(m.seed).shuffle(ids(ctx)).join(),
    "no draw once someone has added a song": (p, n, a) => a.t !== "shuffle" || p === n || p.done.length === 0,
    "added puts only the actor in the added list": (p, n, a, m) =>
      a.t !== "added" ||
      p === n ||
      (p.order.includes(m.user) && !p.done.includes(m.user) && n.done.join() === [...p.done, m.user].join() && rest(p, n)),
    "undo takes only the actor out of the added list": (p, n, a, m) =>
      a.t !== "undo" ||
      p === n ||
      (p.done.includes(m.user) && n.done.join() === p.done.filter((u) => u !== m.user).join() && rest(p, n)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.order.length === 0) return { t: "shuffle" };
    const x = r.next();
    if (x < 0.15) return { t: "shuffle" };
    if (s.done.includes(user)) return x < 0.6 ? { t: "undo" } : { t: "added" };
    return x < 0.85 ? { t: "added" } : { t: "undo" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const drawn = state.order.length > 0;
    const spinning =
      (pending && state.shuffles !== confirmed.shuffles) || (confirmed.at > 0 && running(confirmed.at, 2000) !== null);
    const next = state.order.find((u) => !state.done.includes(u)) ?? null;
    const mine = state.order.indexOf(me);
    const iDone = state.done.includes(me);
    const rows = Math.ceil(state.order.length / 2);

    return (
      <div>
        <CardHeader
          title={CHAT.title}
          subtitle={
            !drawn ? `Not drawn yet · ${CHAT.playlist}` : spinning ? `${CHAT.playlist} · ${CHAT.rule.toLowerCase()}` : `${state.done.length} of ${state.order.length} added · ${CHAT.playlist}`
          }
        />
        {spinning ? (
          <div style={{ display: "grid", gap: 8, justifyItems: "center", padding: "12px 0" }}>
            <Facepile users={members} max={8} size={28} />
            <SystemLine>Spinning</SystemLine>
          </div>
        ) : !drawn ? (
          <div style={{ display: "grid", gap: 8, justifyItems: "center", padding: "12px 0" }}>
            <Facepile users={members} max={8} size={28} />
            <small>{CHAT.rule}</small>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, 32px)`, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 2 }}>
              {state.order.map((u, i) => {
                const added = state.done.includes(u);
                const isNext = u === next;
                return (
                  <div
                    key={u}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      minWidth: 0,
                      padding: "0 6px",
                      borderRadius: theme.radius.button,
                      background: isNext ? theme.color.selected : "transparent",
                      color: added ? theme.color.secondaryText : theme.color.text,
                    }}
                  >
                    <small style={{ width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</small>
                    <Avatar user={u} size={20} />
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isNext ? 600 : 400 }}>{nameOf(u)}</span>
                    {added ? <small aria-label="Added">✓</small> : null}
                  </div>
                );
              })}
            </div>
            <div style={{ minHeight: 24, margin: "8px 0 4px" }}>
              <small>
                {mine >= 0 ? `You are ${ordinal(mine + 1)}` : "You are not in this order"}
                {next ? ` · next up ${nameOf(next)}` : " · everyone added"}
              </small>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          {!drawn ? (
            <Button kind="primary" disabled={members.length < 2} onClick={() => dispatch({ t: "shuffle" })}>
              Draw order
            </Button>
          ) : spinning ? null : (
            <>
              {state.done.length === 0 ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "shuffle" })}>
                  Redraw
                </Button>
              ) : null}
              {iDone ? (
                <Button onClick={() => dispatch({ t: "undo" })}>Undo</Button>
              ) : mine >= 0 ? (
                <Button kind="primary" onClick={() => dispatch({ t: "added" })}>
                  I added
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  },
});
