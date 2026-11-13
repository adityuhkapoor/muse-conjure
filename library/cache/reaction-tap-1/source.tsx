import { defineApp, Avatar, Button, CardHeader, clock, rng } from "@muse/app";

const CHAT = {
  title: "Dani vs Rohan: reflex test",
  duel: ["Dani", "Rohan"],
  rounds: 3,
  waitMin: 2000,
  waitSpread: 3000,
  finishAfter: 4000,
};

type Result = { user: string; ms: number | null };
type Round = { id: string; goAt: number; done: boolean; results: Result[] };
type State = { duel: string[]; rounds: Round[]; over: boolean };
type Action = { t: "start" } | { t: "tap"; round: string } | { t: "finish"; round: string } | { t: "reset" };
type Local = Record<string, never>;

const ROUNDS = CHAT.rounds;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const lastOf = (s: State): Round | undefined => s.rounds[s.rounds.length - 1];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function replaceLast(s: State, round: Round): State {
  const rounds = [...s.rounds.slice(0, -1), round];
  return { ...s, rounds, over: s.over || (round.done && rounds.length === ROUNDS) };
}

/** The single fastest valid time in a round among these people, or null on no time or a tie. */
function fastest(r: Round, ids: string[]): { user: string; ms: number } | null {
  const c = r.results.flatMap((x) => (x.ms !== null && ids.includes(x.user) ? [{ user: x.user, ms: x.ms }] : []));
  if (!c.length) return null;
  const min = Math.min(...c.map((x) => x.ms));
  const w = c.filter((x) => x.ms === min);
  return w.length === 1 ? w[0]! : null;
}

function ranked(s: State, ids: string[]) {
  return ids
    .map((id) => {
      const times = s.rounds.flatMap((r) => r.results.flatMap((x) => (x.user === id && x.ms !== null ? [x.ms] : [])));
      return { id, wins: s.rounds.filter((r) => fastest(r, ids)?.user === id).length, best: times.length ? Math.min(...times) : null };
    })
    .sort((a, b) => b.wins - a.wins || (a.best ?? 1e12) - (b.best ?? 1e12));
}

function winnerOf(s: State, ids: string[]): string | null {
  const r = ranked(s, ids);
  const top = r[0];
  if (!top || (top.wins === 0 && top.best === null)) return null;
  const next = r[1];
  if (next && next.wins === top.wins && next.best === top.best) return null;
  return top.id;
}

function verdict(s: State, ids: string[]) {
  const duel = s.duel.length === 2;
  const w = winnerOf(s, duel ? s.duel : ids);
  const l = w !== null && duel ? (s.duel.find((x) => x !== w) ?? null) : null;
  return { w, l, duel };
}

export default defineApp<State, Action, Local>({
  name: "Reflex test",

  summary: (s, ctx) => {
    const nm = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    if (s.over) {
      const v = verdict(s, ctx.members.map((m) => m.id));
      if (v.w === null) return `${CHAT.title} · tied`;
      return v.l !== null ? `${nm(v.w)} won · ${nm(v.l)} pays for the garlic knots` : `${nm(v.w)} won the reflex test`;
    }
    const last = lastOf(s);
    if (!last) return `${CHAT.title} · best of ${ROUNDS}, no rounds yet`;
    return last.done
      ? `Round ${s.rounds.length} of ${ROUNDS} done`
      : `Round ${s.rounds.length} of ${ROUNDS} · ${last.results.length} of ${ctx.members.length} tapped`;
  },

  init: (ctx) => {
    const found = CHAT.duel.map((n) => ctx.members.find((m) => m.name.toLowerCase() === n.toLowerCase())?.id ?? "");
    const ok = found.length === 2 && found.every((x) => x !== "") && found[0] !== found[1];
    return { duel: ok ? found : [], rounds: [], over: false };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const last = lastOf(state);
    if (action.t === "start") {
      if (state.over || state.rounds.length >= ROUNDS || (last && !last.done)) return state;
      const goAt = meta.time + CHAT.waitMin + rng(meta.seed).int(CHAT.waitSpread);
      return { ...state, rounds: [...state.rounds, { id: "r" + meta.seq, goAt, done: false, results: [] }] };
    }
    if (action.t === "tap") {
      if (typeof action.round !== "string" || !last || last.id !== action.round || last.done) return state;
      if (last.results.some((x) => x.user === meta.user)) return state;
      const ms = meta.time >= last.goAt ? Math.max(0, Math.floor(meta.time - last.goAt)) : null;
      const results = [...last.results, { user: meta.user, ms }];
      const done = ctx.members.every((m) => results.some((x) => x.user === m.id));
      return replaceLast(state, { ...last, results, done });
    }
    if (action.t === "finish") {
      if (typeof action.round !== "string" || !last || last.id !== action.round || last.done) return state;
      if (meta.time < last.goAt + CHAT.finishAfter) return state;
      return replaceLast(state, { ...last, done: true });
    }
    if (action.t === "reset") {
      if (!state.over || state.rounds.length === 0) return state;
      return { ...state, rounds: [], over: false };
    }
    return state;
  },

  onMembers: (s, ctx) => {
    const duel = s.duel.every((id) => inChat(ctx, id)) ? s.duel : [];
    const clean = s.rounds.every((r) => r.results.every((x) => inChat(ctx, x.user)));
    if (duel === s.duel && clean) return s;
    return {
      ...s,
      duel,
      rounds: clean ? s.rounds : s.rounds.map((r) => ({ ...r, results: r.results.filter((x) => inChat(ctx, x.user)) })),
    };
  },

  invariants: {
    "at most 3 rounds and round ids are unique": (s) => s.rounds.length <= ROUNDS && new Set(s.rounds.map((r) => r.id)).size === s.rounds.length,
    "each person has one result per round, null or a whole number of ms": (s) =>
      s.rounds.every(
        (r) =>
          new Set(r.results.map((x) => x.user)).size === r.results.length &&
          r.results.every((x) => x.ms === null || (Number.isInteger(x.ms) && x.ms >= 0)),
      ),
    "everyone with a result is in the chat": (s, ctx) => s.rounds.every((r) => r.results.every((x) => inChat(ctx, x.user))),
    "over is true exactly when there are 3 rounds and all are done": (s) => s.over === (s.rounds.length === ROUNDS && s.rounds.every((r) => r.done)),
    "only the latest round can be open": (s) => s.rounds.slice(0, -1).every((r) => r.done),
    "the duel is empty or two different people in the chat": (s, ctx) =>
      s.duel.length === 0 || (s.duel.length === 2 && s.duel[0] !== s.duel[1] && s.duel.every((id) => inChat(ctx, id))),
  },

  transitions: {
    "a start adds one empty round that turns green at the seeded time": (p, n, a, m) => {
      if (a.t !== "start" || p === n) return true;
      const l = lastOf(n);
      return (
        n.rounds.length === p.rounds.length + 1 &&
        !!l &&
        l.id === "r" + m.seq &&
        !l.done &&
        l.results.length === 0 &&
        l.goAt === m.time + CHAT.waitMin + rng(m.seed).int(CHAT.waitSpread) &&
        same(n.rounds.slice(0, -1), p.rounds)
      );
    },
    "a tap adds the actor's time, null if before green, and nothing else": (p, n, a, m, ctx) => {
      if (a.t !== "tap" || p === n) return true;
      const b = lastOf(p);
      const f = lastOf(n);
      if (!b || !f || n.rounds.length !== p.rounds.length || b.id !== a.round || f.id !== b.id) return false;
      const added = f.results[f.results.length - 1];
      const expected = m.time < b.goAt ? null : Math.max(0, Math.floor(m.time - b.goAt));
      return (
        !b.done &&
        f.results.length === b.results.length + 1 &&
        !!added &&
        added.user === m.user &&
        added.ms === expected &&
        same(f.results.slice(0, -1), b.results) &&
        f.goAt === b.goAt &&
        f.done === ctx.members.every((x) => f.results.some((r) => r.user === x.id)) &&
        same(n.rounds.slice(0, -1), p.rounds.slice(0, -1))
      );
    },
    "a finish only closes the latest round, after the wait, with no new results": (p, n, a, m) => {
      if (a.t !== "finish" || p === n) return true;
      const b = lastOf(p);
      const f = lastOf(n);
      return (
        !!b &&
        !!f &&
        b.id === a.round &&
        !b.done &&
        f.done &&
        m.time >= b.goAt + CHAT.finishAfter &&
        same(f.results, b.results) &&
        n.rounds.length === p.rounds.length &&
        same(n.rounds.slice(0, -1), p.rounds.slice(0, -1))
      );
    },
    "a reset happens only after the match is over and clears every round": (p, n, a) =>
      a.t !== "reset" || p === n || (p.over && n.rounds.length === 0 && !n.over),
    "once a round is done its results never change": (p, n, a) =>
      a.t === "reset" || p.rounds.every((r, i) => !r.done || same(n.rounds[i], r)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const last = lastOf(s);
    if (s.over) return r.next() < 0.8 ? { t: "reset" } : { t: "start" };
    if (!last || last.done) return r.next() < 0.9 ? { t: "start" } : { t: "tap", round: "zzz" };
    const x = r.next();
    if (x < 0.65) return { t: "tap", round: last.id };
    if (x < 0.85) return { t: "finish", round: last.id };
    if (x < 0.92) return { t: "tap", round: "zzz" };
    return { t: "start" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const s = confirmed;
    const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";
    const last = lastOf(s);
    const live = last && !last.done && !s.over ? last : null;
    const mine = live ? live.results.find((x) => x.user === me) : undefined;
    const tapped = live ? live.results.length : 0;
    const now = live ? clock.value : 0;
    const waiting = !!live && now < live.goAt;
    const canFinish = !!live && now >= live.goAt + CHAT.finishAfter && tapped < members.length;
    const saving = pending && !mine && !!lastOf(state)?.results.some((x) => x.user === me);
    const showArea = !s.over && (pending || !!live);
    const v = verdict(s, members.map((m) => m.id));
    const fast = last && last.done ? fastest(last, members.map((m) => m.id)) : null;

    const subtitle = s.over
      ? "Match over"
      : live
        ? `Round ${s.rounds.length} of ${ROUNDS} · ${tapped} of ${members.length} tapped`
        : last
          ? `Round ${s.rounds.length} of ${ROUNDS} done`
          : `Best of ${ROUNDS} · lowest ms wins`;

    const box = (bg: string, fg: string): Record<string, string | number> => ({
      width: "100%",
      minHeight: 96,
      boxSizing: "border-box",
      borderRadius: theme.radius.card,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      color: fg,
      border: "none",
      fontSize: theme.type.headline,
      fontWeight: 700,
    });

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />

        {showArea ? (
          pending ? (
            <div style={box(theme.color.secondaryButton, theme.color.secondaryButtonText)}>{saving ? "Saving time" : "Get ready"}</div>
          ) : live && mine ? (
            <div style={box(theme.color.secondaryButton, theme.color.secondaryButtonText)}>
              <div>{mine.ms === null ? "Too early" : `${mine.ms} ms`}</div>
              <small style={{ color: theme.color.secondaryButtonText }}>{`${tapped} of ${members.length} tapped`}</small>
            </div>
          ) : live ? (
            <button
              aria-label={waiting ? "Wait for green" : "Tap now"}
              style={box(waiting ? theme.color.negative : theme.color.positive, theme.color.onPrimary)}
              onPointerDown={() => dispatch({ t: "tap", round: live.id })}
            >
              {waiting ? "Wait" : "Tap"}
            </button>
          ) : null
        ) : null}

        {live && canFinish && !pending ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <small style={{ flex: 1 }}>{`${members.length - tapped} still to tap`}</small>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "finish", round: live.id })}>
              Finish round
            </Button>
          </div>
        ) : null}

        {s.over ? (
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <h2>{v.w === null ? "Tied" : v.duel ? `${nameOf(v.w)} won the duel` : `${nameOf(v.w)} won`}</h2>
            <small>{v.l !== null ? `${nameOf(v.l)} pays for the garlic knots` : "Most rounds won, then lowest ms"}</small>
            <div style={{ marginTop: 8 }}>
              <Button kind="primary" disabled={pending} onClick={() => dispatch({ t: "reset" })}>
                New match
              </Button>
            </div>
          </div>
        ) : null}

        {!s.over && !showArea ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <small style={{ flex: 1 }}>
              {last
                ? fast
                  ? `${nameOf(fast.user)} was fastest · ${fast.ms} ms`
                  : "No valid times that round"
                : "Wait for green, then tap. Tapping early is out for the round."}
            </small>
            <Button kind="primary" onClick={() => dispatch({ t: "start" })}>
              Start round
            </Button>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {members.slice(0, 6).map((m) => {
            const times = [0, 1, 2]
              .map((i) => {
                const x = s.rounds[i]?.results.find((y) => y.user === m.id);
                return !x ? "–" : x.ms === null ? "early" : String(x.ms);
              })
              .join(" · ");
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
                <Avatar user={m} size={20} />
                <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.color.text }}>
                  {m.name}
                  {s.duel.includes(m.id) ? " · duel" : ""}
                </small>
                <small style={{ whiteSpace: "nowrap" }}>{times}</small>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
