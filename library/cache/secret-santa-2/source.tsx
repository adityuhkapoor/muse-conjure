import { defineApp, rng, Avatar, Button, CardHeader, Facepile, running } from "@muse/app";

// Secret name draw for the thrift swap. One shuffled loop: everyone buys for the next person,
// so nobody gets themselves. The shared state holds the loop, but each phone only ever
// shows its own receiver.

const CHAT = {
  title: "Thrift swap name draw",
  note: "Saturday the 6th at Felix's · $15 max · thrift store or Goodwill",
};

type State = { note: string; pairs: Record<string, string>; seen: string[]; at: number };
type Action = { t: "draw" } | { t: "seen" };
type Local = { open: boolean };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const loop = (ids: string[], seed: number): Record<string, string> => {
  const order = rng(seed).shuffle([...ids]);
  const out: Record<string, string> = {};
  order.forEach((id, i) => {
    out[id] = order[(i + 1) % order.length]!;
  });
  return out;
};

export default defineApp<State, Action, Local>({
  name: "Name draw",
  summary: (s, ctx) => (s.at === 0 ? "Names not drawn yet" : `${s.seen.length} of ${ctx.members.length} have looked`),

  init: () => ({ note: CHAT.note, pairs: {}, seen: [], at: 0 }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "draw") {
      if (Object.keys(state.pairs).length > 0 || ctx.members.length < 2) return state;
      return { ...state, pairs: loop(ctx.members.map((m) => m.id), meta.seed), seen: [], at: Math.max(1, meta.time) };
    }
    if (action.t === "seen") {
      if (state.at === 0 || !(meta.user in state.pairs) || state.seen.includes(meta.user)) return state;
      return { ...state, seen: [...state.seen, meta.user] };
    }
    return state;
  },

  // Anyone joined or left after the draw: the loop no longer fits the chat, so it can be redrawn.
  onMembers: (state, ctx) => {
    const keys = Object.keys(state.pairs);
    if (keys.length === 0) return state;
    if (keys.length === ctx.members.length && ctx.members.every((m) => keys.includes(m.id))) return state;
    return { ...state, pairs: {}, seen: [], at: 0 };
  },

  invariants: {
    "a draw covers exactly the people in the chat": (s, ctx) => {
      const k = Object.keys(s.pairs);
      return k.length === 0 || (k.length === ctx.members.length && ctx.members.every((m) => k.includes(m.id)));
    },
    "nobody is paired with themselves": (s) => Object.keys(s.pairs).every((g) => s.pairs[g] !== g),
    "each person is picked by exactly one giver": (s) => {
      const k = Object.keys(s.pairs);
      const v = Object.values(s.pairs);
      return new Set(v).size === v.length && v.every((x) => k.includes(x));
    },
    "seen has no repeats and only people who drew": (s) => new Set(s.seen).size === s.seen.length && s.seen.every((u) => u in s.pairs),
    "the draw time is set exactly when there is a draw": (s) => (s.at === 0) === (Object.keys(s.pairs).length === 0),
  },

  transitions: {
    "a draw follows the seeded shuffle, one loop, nobody has looked yet": (p, n, a, m, ctx) => {
      if (a.t !== "draw" || p === n) return true;
      const ids = ctx.members.map((x) => x.id);
      return Object.keys(p.pairs).length === 0 && same(n.pairs, loop(ids, m.seed)) && n.seen.length === 0 && n.at === Math.max(1, m.time);
    },
    "looking adds only the viewer to seen": (p, n, a, m) =>
      a.t !== "seen" || p === n || (n.seen.length === p.seen.length + 1 && n.seen.includes(m.user) && !p.seen.includes(m.user) && same(p.pairs, n.pairs) && p.at === n.at),
    "no action changes a draw once it is made": (p, n, a) => a.t === "draw" || same(p.pairs, n.pairs),
    "the note never changes": (p, n) => p.note === n.note,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (s.at === 0) return { t: "draw" };
    return r.next() < 0.1 ? { t: "draw" } : { t: "seen" };
  },

  local: { open: false },

  view: ({ confirmed, pending, me, members, dispatch, local, setLocal, theme }) => {
    const drawn = confirmed.at > 0;
    const e = drawn ? running(confirmed.at, 1200) : null;
    const spinning = (pending && !drawn) || e !== null;
    const looked = confirmed.seen;
    const waiting = members.filter((m) => drawn && !looked.includes(m.id));
    const shown = members.slice(0, 12);
    const shift = e === null ? 0 : Math.floor(e / 150);
    const mine = confirmed.pairs[me];
    const target = mine ? members.find((m) => m.id === mine) : undefined;
    const subtitle = spinning && !drawn ? "Drawing" : drawn ? `${looked.length} of ${members.length} have looked` : `${members.length} people · nobody sees others' draws`;

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        <div role="img" aria-label={`${members.length} people in the draw`} style={{ position: "relative", height: 140, width: "100%", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: "20%",
              top: "16%",
              width: "60%",
              height: "68%",
              borderRadius: theme.radius.pill,
              background: theme.color.input,
            }}
          />
          {shown.map((m, i) => {
            const k = (i + shift) % shown.length;
            const ang = (k / shown.length) * Math.PI * 2 - Math.PI / 2;
            const dim = drawn && e === null && !looked.includes(m.id);
            const x = 0.5 + 0.38 * Math.cos(ang);
            const y = 0.5 + 0.36 * Math.sin(ang);
            return (
              <div
                key={m.id}
                style={{
                  position: "absolute",
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  opacity: dim ? 0.5 : 1,
                }}
              >
                <Avatar user={m} size={24} />
              </div>
            );
          })}
        </div>
        <small style={{ display: "block", margin: "6px 0" }}>{confirmed.note}</small>

        {!drawn && !spinning ? (
          <Button kind="primary" wide disabled={members.length < 2} onClick={() => dispatch({ t: "draw" })}>
            Draw names
          </Button>
        ) : null}

        {spinning ? <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Drawing</div> : null}

        {drawn && !spinning ? (
          <div style={{ display: "grid", gap: 8 }}>
            {local.open && target ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                <Avatar user={target} size={32} />
                <div>
                  <small>You're buying for</small>
                  <div style={{ fontWeight: 600 }}>{target.name}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <Button kind="deemphasized" onClick={() => setLocal({ open: false })}>
                    Hide
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                kind="secondary"
                wide
                disabled={!mine}
                onClick={() => {
                  setLocal({ open: true });
                  if (!looked.includes(me)) dispatch({ t: "seen" });
                }}
              >
                Show mine
              </Button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {looked.length ? <Facepile users={looked} max={5} size={20} /> : null}
              <small>{waiting.length ? `Not yet: ${waiting.map((m) => (m.id === me ? "you" : m.name)).join(", ")}` : "Everyone has looked"}</small>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
});
