import { defineApp, Avatar, Button, CardHeader, SystemLine, clock, rng } from "@muse/app";

// Chore spinner. One weighted random spin picks who mops the kitchen floor.
// Fewer chores so far means more chances, but anyone can come up.

const C = {
  title: "Who mops the kitchen floor?",
  task: "Mop the kitchen floor",
  due: "Thursday",
  // Chore totals since Sept 1, matched to chat members by lowercase name.
  totals: { ines: 8, ana: 5, kev: 5, luis: 3, marcus: 2 } as Record<string, number>,
};

type State = {
  task: string;
  due: string;
  totals: Record<string, number>;
  picked: string | null;
  spinAt: number;
  spins: number;
  accepted: boolean;
};
type Action = { t: "spin" } | { t: "accept" } | { t: "reset" };
type Local = Record<string, never>;

const SPIN_MS = 3000;
const COOLDOWN = 4000;
const MAX_SPINS = 99;

type Who = { members: { id: string }[] };
const inChat = (ctx: Who, id: string) => ctx.members.some((m) => m.id === id);

/** Weight is (highest total + 1) minus own total, over people in the chat who have a count. */
function weightsOf(totals: Record<string, number>, ctx: Who): { ids: string[]; ws: number[] } {
  const ids = Object.keys(totals)
    .filter((id) => inChat(ctx, id))
    .sort();
  const max = ids.length ? Math.max(...ids.map((id) => totals[id] ?? 0)) : 0;
  return { ids, ws: ids.map((id) => max + 1 - (totals[id] ?? 0)) };
}

function pickWho(totals: Record<string, number>, seed: number, ctx: Who): string | null {
  const { ids, ws } = weightsOf(totals, ctx);
  if (ids.length === 0) return null;
  const sum = ws.reduce((a, b) => a + b, 0);
  const r = rng(seed).next() * sum;
  let acc = 0;
  for (let i = 0; i < ids.length; i++) {
    acc += ws[i]!;
    if (r < acc) return ids[i]!;
  }
  return ids[ids.length - 1]!;
}

const sameTotals = (a: Record<string, number>, b: Record<string, number>, skip?: string) => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k === skip || a[k] === b[k]);
};

export default defineApp<State, Action, Local>({
  name: "Chore spinner",
  summary: (s, ctx) => {
    const who = s.picked ? ctx.members.find((m) => m.id === s.picked)?.name : undefined;
    if (!who) return `${C.title} No spin yet.`;
    return s.accepted ? `${C.title} ${who} took it.` : `${C.title} ${who} got it.`;
  },

  init: (ctx) => {
    const known = Object.values(C.totals);
    const avg = known.length ? Math.floor(known.reduce((a, b) => a + b, 0) / known.length) : 0;
    const totals: Record<string, number> = {};
    for (const m of ctx.members) {
      const v = C.totals[m.name.toLowerCase()];
      totals[m.id] = typeof v === "number" ? v : avg;
    }
    return { task: C.task, due: C.due, totals, picked: null, spinAt: 0, spins: 0, accepted: false };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "spin") {
      if (state.accepted || state.spins >= MAX_SPINS) return state;
      if (state.spinAt > 0 && meta.time - state.spinAt < COOLDOWN) return state;
      const who = pickWho(state.totals, meta.seed, ctx);
      if (who === null) return state;
      return { ...state, picked: who, spinAt: meta.time, spins: state.spins + 1, accepted: false };
    }
    if (action.t === "accept") {
      if (state.picked === null || state.accepted || state.picked !== meta.user) return state;
      const cur = state.totals[meta.user] ?? 0;
      return { ...state, accepted: true, totals: { ...state.totals, [meta.user]: cur + 1 } };
    }
    if (action.t === "reset") {
      if (state.picked === null) return state;
      return { ...state, picked: null, spinAt: 0, accepted: false };
    }
    return state;
  },

  // Someone left: their count goes and so does their pick. Someone joined: they start at the lowest count.
  onMembers: (state, ctx) => {
    const keys = Object.keys(state.totals);
    const pickedOk = state.picked === null || inChat(ctx, state.picked);
    if (keys.every((k) => inChat(ctx, k)) && ctx.members.every((m) => typeof state.totals[m.id] === "number") && pickedOk) return state;
    const kept = keys.filter((k) => inChat(ctx, k)).map((k) => state.totals[k] ?? 0);
    const min = kept.length ? Math.min(...kept) : 0;
    const totals: Record<string, number> = {};
    for (const m of ctx.members) {
      const v = state.totals[m.id];
      totals[m.id] = typeof v === "number" ? v : min;
    }
    return pickedOk ? { ...state, totals } : { ...state, totals, picked: null, spinAt: 0, accepted: false };
  },

  invariants: {
    "every count belongs to someone in the chat and is a whole number from 0": (s, ctx) =>
      Object.keys(s.totals).every((k) => inChat(ctx, k) && Number.isInteger(s.totals[k]) && (s.totals[k] ?? -1) >= 0),
    "everyone in the chat has a count": (s, ctx) => ctx.members.every((m) => typeof s.totals[m.id] === "number"),
    "the pick is nobody or someone in the chat": (s, ctx) => s.picked === null || (inChat(ctx, s.picked) && typeof s.totals[s.picked] === "number"),
    "a taken chore has a pick": (s) => !s.accepted || s.picked !== null,
    "no pick means no spin time and nothing taken": (s) => s.picked !== null || (s.spinAt === 0 && !s.accepted),
    "spins is a whole number from 0 to 99": (s) => Number.isInteger(s.spins) && s.spins >= 0 && s.spins <= MAX_SPINS,
  },

  transitions: {
    "a spin picks who the seed gives, by the old counts, and changes no count": (p, n, a, m, ctx) =>
      a.t !== "spin" ||
      p === n ||
      (n.picked === pickWho(p.totals, m.seed, ctx) && n.spinAt === m.time && n.spins === p.spins + 1 && !n.accepted && sameTotals(p.totals, n.totals)),
    "a spin is refused once the chore is taken": (p, n, a) => a.t !== "spin" || p === n || !p.accepted,
    "a spin never starts within 4 seconds of the last one": (p, n, a, m) => a.t !== "spin" || p === n || p.spinAt === 0 || m.time - p.spinAt >= COOLDOWN,
    "accept is the picked person raising only their own count by 1": (p, n, a, m) =>
      a.t !== "accept" ||
      p === n ||
      (p.picked !== null &&
        m.user === p.picked &&
        !p.accepted &&
        n.accepted &&
        n.picked === p.picked &&
        n.totals[p.picked] === (p.totals[p.picked] ?? 0) + 1 &&
        sameTotals(p.totals, n.totals, p.picked)),
    "a reset clears only the pick, the spin time and taken": (p, n, a) =>
      a.t !== "reset" || p === n || (n.picked === null && n.spinAt === 0 && !n.accepted && n.spins === p.spins && sameTotals(p.totals, n.totals)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the task and due day never change": (p, n) => p.task === n.task && p.due === n.due,
  },

  arbitrary: (s, user, r) => {
    if (s.picked === user && !s.accepted && r.next() < 0.7) return { t: "accept" };
    const x = r.next();
    if (x < 0.6) return { t: "spin" };
    if (x < 0.8) return { t: "reset" };
    return { t: "accept" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    // Who was picked comes from the server's seed: read it from `confirmed`, and stay neutral
    // while my own spin is unconfirmed or the highlight is still cycling.
    const live = pending || confirmed.picked !== null;
    const now = live ? clock.value : 0;
    const waiting = pending && state.spins !== confirmed.spins;
    const turning = confirmed.picked !== null && now - confirmed.spinAt < SPIN_MS;
    const cool = confirmed.picked !== null && now - confirmed.spinAt < COOLDOWN;
    const spinning = waiting || turning;
    const result = spinning ? null : state.picked;
    const accepted = result !== null && state.accepted;

    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const rows = members
      .filter((m) => typeof state.totals[m.id] === "number")
      .sort((a, b) => (state.totals[a.id]! - state.totals[b.id]!) || (a.id < b.id ? -1 : 1));
    const max = rows.length ? Math.max(...rows.map((m) => state.totals[m.id]!)) : 0;
    const cycle = rows.length ? Math.floor(now / 150) % rows.length : 0;

    const subtitle = spinning ? `Due ${state.due} · Spinning` : result ? `Due ${state.due} · ${nameOf(result)} got it` : `Due ${state.due}`;

    return (
      <div>
        <CardHeader title={C.title} subtitle={subtitle} />
        <div style={{ display: "grid", gap: 2 }}>
          {rows.map((m, i) => {
            const c = state.totals[m.id]!;
            const w = max + 1 - c;
            const hl = spinning ? i === cycle : result === m.id;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 36,
                  padding: "0 8px",
                  borderRadius: theme.radius.button,
                  ...(hl ? { background: theme.color.selected } : {}),
                }}
              >
                <Avatar user={m} size={24} />
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.color.text }}>{m.name}</div>
                <small style={{ whiteSpace: "nowrap", color: theme.color.secondaryText }}>
                  {c} {c === 1 ? "chore" : "chores"} · {w} {w === 1 ? "chance" : "chances"}
                </small>
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 24, margin: "8px 0" }}>
          {spinning ? (
            <SystemLine>Spinning</SystemLine>
          ) : result && accepted ? (
            <SystemLine>{`Done · ${nameOf(result)} now at ${state.totals[result] ?? 0}`}</SystemLine>
          ) : result ? (
            <SystemLine actor={nameOf(result)}>mops the floor</SystemLine>
          ) : (
            <SystemLine>Fewer chores means more chances</SystemLine>
          )}
        </div>
        {accepted ? null : result === null ? (
          <Button kind="primary" wide disabled={spinning || rows.length === 0} onClick={() => dispatch({ t: "spin" })}>
            Spin
          </Button>
        ) : result === me ? (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, display: "flex" }}>
              <Button kind="primary" wide onClick={() => dispatch({ t: "accept" })}>
                Accept
              </Button>
            </div>
          </div>
        ) : (
          <Button wide disabled={cool} onClick={() => dispatch({ t: "spin" })}>
            Spin again
          </Button>
        )}
      </div>
    );
  },
});
