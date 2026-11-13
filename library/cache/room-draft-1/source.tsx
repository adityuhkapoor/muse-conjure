import { defineApp, Avatar, Button, CardHeader, SystemLine, clock, rng, running } from "@muse/app";

// Pick order: one shuffle, final. The first pick gets the master room.

const CHAT = {
  title: "Who picks rooms first?",
  rooms: [
    "Master (king, own bathroom, hot tub)",
    "Queen room",
    "Twin room (two twins, 2 people share)",
    "Loft (pullout couch)",
  ],
  note: "First pick gets master · order is final, no trading",
};

type State = { order: string[] | null; at: number; by: string; rooms: string[]; picks: (string | null)[] };
type Action = { t: "shuffle" } | { t: "pick"; room: number } | { t: "release"; room: number };
type Local = Record<string, never>;

const REVEAL_MS = 2000;
const ROOMS_KEY = CHAT.rooms.join("|");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const shortName = (r: string) => r.split(" (")[0] ?? r;
/** The first person in the order who has no room yet. */
const turnOf = (s: State): string | null => (s.order === null ? null : (s.order.find((id) => !s.picks.includes(id)) ?? null));
const othersSame = (p: State, n: State, room: number) => p.picks.length === n.picks.length && p.picks.every((x, i) => i === room || n.picks[i] === x);

export default defineApp<State, Action, Local>({
  name: "Pick order",
  summary: (s, ctx) => {
    if (s.order === null) return `${CHAT.title} Not shuffled yet.`;
    const names = s.order.map((id) => ctx.members.find((m) => m.id === id)?.name ?? "Someone");
    return `Pick order: ${names.join(", ")}.`;
  },

  init: () => ({ order: null, at: 0, by: "", rooms: [...CHAT.rooms], picks: CHAT.rooms.map(() => null) }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "pick") {
      const room = action.room;
      if (state.order === null || typeof room !== "number" || !Number.isInteger(room) || room < 0 || room >= state.picks.length) return state;
      if (state.picks[room] !== null || turnOf(state) !== meta.user) return state;
      return { ...state, picks: state.picks.map((x, i) => (i === room ? meta.user : x)) };
    }
    if (action.t === "release") {
      const room = action.room;
      if (typeof room !== "number" || !Number.isInteger(room) || room < 0 || room >= state.picks.length) return state;
      if (state.picks[room] !== meta.user) return state;
      return { ...state, picks: state.picks.map((x, i) => (i === room ? null : x)) };
    }
    if (action.t !== "shuffle") return state;
    if (state.order !== null) return state;
    const ids = ctx.members.map((m) => m.id);
    if (ids.length === 0) return state;
    return { ...state, order: rng(meta.seed).shuffle([...ids]), at: meta.time, by: meta.user };
  },

  onMembers: (state, ctx) => {
    if (state.order === null) return state;
    if (state.order.every((id) => inChat(ctx, id)) && state.picks.every((x) => x === null || inChat(ctx, x))) return state;
    return {
      ...state,
      order: state.order.filter((id) => inChat(ctx, id)),
      picks: state.picks.map((x) => (x !== null && !inChat(ctx, x) ? null : x)),
    };
  },

  invariants: {
    "no one is in the order twice": (s) => s.order === null || new Set(s.order).size === s.order.length,
    "everyone in the order is in the chat": (s, ctx) => s.order === null || s.order.every((id) => inChat(ctx, id)),
    "before the shuffle there is no time and no shuffler": (s) => s.order !== null || (s.at === 0 && s.by === ""),
    "after the shuffle someone is recorded as the shuffler": (s) => s.order === null || s.by !== "",
    "the four rooms never change": (s) => s.rooms.length === 4 && s.rooms.join("|") === ROOMS_KEY && s.picks.length === 4,
    "no one holds two rooms, and no one holds one before the shuffle": (s) => {
      const held = s.picks.filter((x): x is string => x !== null);
      return new Set(held).size === held.length && (s.order !== null || held.length === 0);
    },
    "room holders are in the chat and in the order": (s, ctx) =>
      s.picks.every((x) => x === null || (inChat(ctx, x) && s.order !== null && s.order.includes(x))),
  },

  transitions: {
    "a shuffle orders exactly the people in the chat as the seed says": (p, n, a, m, ctx) => {
      if (a.t !== "shuffle" || p === n) return true;
      if (p.order !== null || n.order === null) return false;
      const want = rng(m.seed).shuffle(ctx.members.map((x) => x.id));
      return n.order.join("|") === want.join("|");
    },
    "a shuffle records who pressed it and when": (p, n, a, m) =>
      a.t !== "shuffle" || p === n || (n.by === m.user && n.at === m.time),
    "once set, the order is never reshuffled": (p, n) => {
      if (p.order === null) return true;
      if (n.order === null) return false;
      const no = n.order;
      return p.order.filter((id) => no.includes(id)).join("|") === no.join("|") && no.length <= p.order.length;
    },
    "a settled shuffle keeps its shuffler and time": (p, n) => p.order === null || (n.by === p.by && n.at === p.at),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the rooms never change in a step": (p, n) => p.rooms.join("|") === n.rooms.join("|"),
    "a pick gives an open room to the person whose turn it is": (p, n, a, m) =>
      a.t !== "pick" || p === n || (turnOf(p) === m.user && p.picks[a.room] === null && n.picks[a.room] === m.user && othersSame(p, n, a.room)),
    "a release empties the actor's own room and nothing else": (p, n, a, m) =>
      a.t !== "release" || p === n || (p.picks[a.room] === m.user && n.picks[a.room] === null && othersSame(p, n, a.room)),
  },

  arbitrary: (s, user, r) => {
    if (s.order === null) return { t: "shuffle" };
    const mine = s.picks.indexOf(user);
    if (mine >= 0 && r.next() < 0.4) return { t: "release", room: mine };
    if (turnOf(s) === user) {
      const open = s.picks.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0);
      if (open.length) return { t: "pick", room: r.pick(open) };
    }
    if (mine >= 0) return { t: "release", room: mine };
    return { t: "pick", room: r.int(s.picks.length) };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const order = confirmed.order;
    const waiting = pending && order === null && state.order !== null;
    const reveal = order !== null ? running(confirmed.at, REVEAL_MS) : null;
    const spinning = waiting || (order !== null && reveal !== null);
    if (order !== null) void clock.value;
    const done = order !== null && !spinning;
    const late = done ? members.filter((m) => !order.includes(m.id)) : [];
    const turn = turnOf(state);
    const myRoom = state.picks.indexOf(me);

    const subtitle = spinning
      ? "Spinning"
      : done
        ? turn === me
          ? "Your pick"
          : turn !== null
            ? `${nameOf(turn)} picks next`
            : `${order.length} ${order.length === 1 ? "pick" : "picks"} · order is final`
        : "Not shuffled yet";

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        {done ? (
          <div>
            <div style={{ display: "grid", gap: 2 }}>
              {order.map((id, i) => {
                const idx = state.picks.indexOf(id);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
                    <span style={{ width: 20, color: theme.color.secondaryText }}>{i + 1}</span>
                    <Avatar user={id} size={24} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: id === me ? 600 : 400 }}>
                      {nameOf(id)}
                    </span>
                    {idx >= 0 ? <small>{shortName(CHAT.rooms[idx] ?? "")}</small> : null}
                  </div>
                );
              })}
            </div>
            {turn === me || myRoom >= 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {turn === me
                  ? state.picks.map((x, i) =>
                      x === null ? (
                        <Button key={i} kind="secondary" onClick={() => dispatch({ t: "pick", room: i })}>
                          {shortName(CHAT.rooms[i] ?? "")}
                        </Button>
                      ) : null,
                    )
                  : null}
                {myRoom >= 0 ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "release", room: myRoom })}>
                    Release
                  </Button>
                ) : null}
              </div>
            ) : null}
            {late.length ? (
              <small style={{ display: "block", marginTop: 4 }}>{`Joined after: ${late.map((m) => (m.id === me ? "you" : m.name)).join(", ")}`}</small>
            ) : null}
            <small style={{ display: "block", marginTop: 8, color: theme.color.secondaryText }}>{CHAT.note}</small>
            <div style={{ minHeight: 24, marginTop: 4 }}>
              <SystemLine actor={nameOf(state.by) === "You" ? "You" : nameOf(state.by)}>shuffled the order</SystemLine>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gap: 2, marginBottom: 8 }}>
              {CHAT.rooms.map((r, i) => (
                <small key={r} style={{ color: theme.color.secondaryText }}>{`${i + 1}. ${r}`}</small>
              ))}
            </div>
            <small style={{ display: "block", marginBottom: 8 }}>{CHAT.note}</small>
            {spinning ? (
              <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                <SystemLine>Spinning</SystemLine>
              </div>
            ) : (
              <div style={{ display: "flex" }}>
                <Button kind="primary" wide onClick={() => dispatch({ t: "shuffle" })}>
                  Shuffle
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
});
