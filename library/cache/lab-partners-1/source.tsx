import { defineApp, Avatar, Button, CardHeader, Facepile, running } from "@muse/app";

// Secret Santa. One person draws; the pairs are made from the seed. Each person
// reveals and sees only their own match.

const C = {
  title: "Secret Santa 2026",
  budget: "$20 max",
  swap: "Ana's, Dec 12",
  banned: ["Dev", "Dani"],
};

type Pair = { giver: string; getter: string };
type State = { drawn: boolean; pairs: Pair[]; at: number; drawnBy: string; seen: string[] };
type Action = { t: "draw" } | { t: "reveal" } | { t: "redraw" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const MIN_PEOPLE = 3;
const EMPTY: State = { drawn: false, pairs: [], at: 0, drawnBy: "", seen: [] };

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idOf = (ctx: Ctx, name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
const isBanned = (ctx: Ctx, a: string, b: string) => {
  const x = idOf(ctx, C.banned[0]!);
  const y = idOf(ctx, C.banned[1]!);
  return x !== undefined && y !== undefined && ((a === x && b === y) || (a === y && b === x));
};
const sortedKey = (xs: string[]) => [...xs].sort().join("|");

function build(ctx: Ctx, r: ReturnType<typeof rng>): Pair[] | null {
  const ids = ctx.members.map((m) => m.id);
  const n = ids.length;
  if (n < MIN_PEOPLE || new Set(ids).size !== n) return null;
  const ok = (g: string, t: string) => g !== t && !isBanned(ctx, g, t);
  for (let i = 0; i < 50; i++) {
    const t = r.shuffle(ids);
    if (ids.every((g, j) => ok(g, t[j]!))) return ids.map((g, j) => ({ giver: g, getter: t[j]! }));
  }
  const o = r.shuffle(ids);
  for (let k = 1; k < n; k++) {
    if (o.every((g, j) => ok(g, o[(j + k) % n]!))) return o.map((g, j) => ({ giver: g, getter: o[(j + k) % n]! }));
  }
  return null;
}

import { rng } from "@muse/app";

export default defineApp<State, Action, Local>({
  name: "Secret Santa",
  summary: (s) =>
    s.drawn ? `${C.title}: pairs drawn · ${s.seen.length} of ${s.pairs.length} have looked` : `${C.title}: pairs not drawn yet`,

  init: () => EMPTY,

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "draw": {
        if (state.drawn) return state;
        const pairs = build(ctx, rng(meta.seed));
        if (!pairs) return state;
        return { drawn: true, pairs, at: meta.time, drawnBy: meta.user, seen: [] };
      }
      case "reveal": {
        if (!state.drawn || state.seen.includes(meta.user) || !state.pairs.some((p) => p.giver === meta.user)) return state;
        return { ...state, seen: [...state.seen, meta.user] };
      }
      case "redraw": {
        if (!state.drawn || meta.user !== state.drawnBy) return state;
        return EMPTY;
      }
    }
    return state;
  },

  // Someone left: the pairs no longer work, so the draw is cleared and can be made again.
  onMembers: (state, ctx) => {
    if (!state.drawn) return state;
    const ok = state.pairs.every((p) => inChat(ctx, p.giver) && inChat(ctx, p.getter)) && inChat(ctx, state.drawnBy);
    return ok ? state : EMPTY;
  },

  invariants: {
    "before the draw there are no pairs, no looks and no drawer": (s) =>
      s.drawn || (s.pairs.length === 0 && s.seen.length === 0 && s.at === 0 && s.drawnBy === ""),
    "the pairs are a permutation: each person gives once and gets once": (s) =>
      !s.drawn ||
      (s.pairs.length >= MIN_PEOPLE &&
        new Set(s.pairs.map((p) => p.giver)).size === s.pairs.length &&
        new Set(s.pairs.map((p) => p.getter)).size === s.pairs.length &&
        sortedKey(s.pairs.map((p) => p.giver)) === sortedKey(s.pairs.map((p) => p.getter))),
    "nobody gets themselves": (s) => s.pairs.every((p) => p.giver !== p.getter),
    "Dev and Dani never get each other": (s, ctx) => s.pairs.every((p) => !isBanned(ctx, p.giver, p.getter)),
    "everyone in the pairs, the drawer and the lookers are in the chat": (s, ctx) =>
      s.pairs.every((p) => inChat(ctx, p.giver) && inChat(ctx, p.getter)) && s.seen.every((u) => inChat(ctx, u)) && (!s.drawn || inChat(ctx, s.drawnBy)),
    "lookers are unique givers and the drawer is a giver": (s) =>
      new Set(s.seen).size === s.seen.length &&
      s.seen.every((u) => s.pairs.some((p) => p.giver === u)) &&
      (!s.drawn || s.pairs.some((p) => p.giver === s.drawnBy)),
  },

  transitions: {
    "a draw starts from undrawn and records the actor, the time and a pair for everyone": (p, n, a, m, ctx) =>
      a.t !== "draw" ||
      p === n ||
      (!p.drawn && n.drawn && n.drawnBy === m.user && n.at === m.time && n.seen.length === 0 && n.pairs.length === ctx.members.length),
    "a reveal only adds the actor to the lookers": (p, n, a, m) =>
      a.t !== "reveal" ||
      p === n ||
      (p.drawn && !p.seen.includes(m.user) && n.seen.length === p.seen.length + 1 && n.seen.at(-1) === m.user && n.pairs === p.pairs && n.at === p.at && n.drawnBy === p.drawnBy && n.drawn),
    "only the drawer can redraw, and it returns to undrawn": (p, n, a, m) =>
      a.t !== "redraw" ||
      p === n ||
      (m.user === p.drawnBy && p.drawn && !n.drawn && n.pairs.length === 0 && n.seen.length === 0 && n.at === 0 && n.drawnBy === ""),
    "pairs change only by a draw or a redraw": (p, n, a) => p.pairs === n.pairs || a.t === "draw" || a.t === "redraw",
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.drawn) return r.next() < 0.85 ? { t: "draw" } : { t: "reveal" };
    const k = r.next();
    if (k < 0.65) return { t: "reveal" };
    if (k < 0.85) return { t: "redraw" };
    return { t: "draw" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch }) => {
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const waiting = pending && !confirmed.drawn;
    const animating = confirmed.drawn && running(confirmed.at, 1200) !== null;
    const mine = confirmed.pairs.find((p) => p.giver === me);
    const looked = confirmed.seen.includes(me);
    const subtitle = confirmed.drawn
      ? `${confirmed.seen.length} of ${confirmed.pairs.length} have looked · ${C.budget}`
      : `Budget ${C.budget} · swap at ${C.swap}`;

    let body;
    if (waiting || animating) {
      body = (
        <div style={{ minHeight: 64, display: "flex", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>Drawing</span>
        </div>
      );
    } else if (!confirmed.drawn) {
      body = (
        <div style={{ display: "grid", gap: 8 }}>
          <small>Everyone gets one person · nobody gets themselves · {C.banned[0]} and {C.banned[1]} not each other · only you see your match</small>
          <Facepile users={members} max={6} size={28} />
          <Button kind="primary" wide disabled={members.length < MIN_PEOPLE} onClick={() => dispatch({ t: "draw" })}>
            Draw pairs
          </Button>
        </div>
      );
    } else if (!mine) {
      body = <small>You joined after the draw. The person who drew can redraw to include you.</small>;
    } else if (!looked) {
      body = (
        <div style={{ display: "grid", gap: 8 }}>
          <small>Pairs are drawn. Only you will see your match.</small>
          <Button kind="primary" wide onClick={() => dispatch({ t: "reveal" })}>
            Reveal
          </Button>
        </div>
      );
    } else {
      body = (
        <div style={{ display: "grid", gap: 8 }}>
          <small>You give to</small>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
            <Avatar user={mine.getter} size={40} />
            <h2 style={{ margin: 0, minWidth: 0 }}>{nameOf(mine.getter)}</h2>
          </div>
          <small>{C.budget} · swap at {C.swap}</small>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={C.title} subtitle={subtitle} />
        {body}
        {confirmed.drawn && me === confirmed.drawnBy && !animating && !pending ? (
          <div style={{ marginTop: 8 }}>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "redraw" })}>
              Redraw
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
});
