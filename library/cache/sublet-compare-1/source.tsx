import { defineApp, Button, CardHeader, Facepile, SystemLine } from "@muse/app";

// House vote. Everyone gives each house 0 to 3 points on each thing the group cares about.
// The card adds the points up and shows which house leads. The host locks the result.

const C = {
  title: "Which house should we rent?",
  houses: [
    { id: "h0", name: "Maple St", note: "dishwasher, busy road", price: 285000 },
    { id: "h1", name: "Walnut Apts", note: "laundry, quiet, near library", price: 340000 },
    { id: "h2", name: "Above the bagel place", note: "kitchen, parking, 20 min walk", price: 260000 },
  ],
  criteria: [
    { id: "price", label: "Price" },
    { id: "laundry", label: "Laundry" },
    { id: "distance", label: "Distance" },
    { id: "kitchen", label: "Kitchen" },
    { id: "quiet", label: "Quiet" },
    { id: "parking", label: "Parking (optional)" },
  ],
};

type House = { id: string; name: string; note: string; price: number };
type Crit = { id: string; label: string };
type Scores = Record<string, Record<string, Record<string, number>>>;
type State = { houses: House[]; criteria: Crit[]; scores: Scores; skipParking: string[]; closed: boolean; host: string };
type Action =
  | { t: "rate"; criterion: string; house: string; points: number }
  | { t: "toggleParking" }
  | { t: "close" }
  | { t: "reopen" };
type Local = { crit: number };
type Ctx = { members: { id: string }[] };

const MAX_POINTS = 3;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const getScore = (s: State, u: string, c: string, h: string): number | undefined => s.scores[u]?.[c]?.[h];

type Entry = { u: string; c: string; h: string; v: number };
const entries = (s: State): Entry[] =>
  Object.keys(s.scores).flatMap((u) =>
    Object.keys(s.scores[u]!).flatMap((c) => Object.keys(s.scores[u]![c]!).map((h) => ({ u, c, h, v: s.scores[u]![c]![h]! }))),
  );
const flat = (s: State, keep: (e: Entry) => boolean) =>
  entries(s)
    .filter(keep)
    .map((e) => `${e.u}|${e.c}|${e.h}=${e.v}`)
    .sort()
    .join(";");

const hasScore = (s: State, u: string) => entries(s).some((e) => e.u === u);
const raters = (s: State) => new Set(entries(s).map((e) => e.u)).size;

function standing(s: State) {
  const totals = s.houses.map((h) => entries(s).filter((e) => e.h === h.id).reduce((n, e) => n + e.v, 0));
  const max = Math.max(0, ...totals);
  const leaders = max > 0 ? s.houses.filter((_, i) => totals[i] === max) : [];
  return { totals, leaders };
}

const money = (cents: number) => `$${String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const pts = (n: number) => (n === 1 ? "1 point" : `${n} points`);

const withoutParking = (mine: Record<string, Record<string, number>>) => {
  const out: Record<string, Record<string, number>> = {};
  for (const c of Object.keys(mine)) if (c !== "parking") out[c] = mine[c]!;
  return out;
};
const onlyPresent = (sc: Scores, ctx: Ctx) => {
  const out: Scores = {};
  for (const u of Object.keys(sc)) if (inChat(ctx, u)) out[u] = sc[u]!;
  return out;
};

function rate(s: State, user: string, c: unknown, h: unknown, points: unknown): State {
  if (s.closed || typeof c !== "string" || typeof h !== "string" || typeof points !== "number") return s;
  if (!Number.isInteger(points) || points < 0 || points > MAX_POINTS) return s;
  if (!s.criteria.some((x) => x.id === c) || !s.houses.some((x) => x.id === h)) return s;
  if (c === "parking" && s.skipParking.includes(user)) return s;
  if (getScore(s, user, c, h) === points) return s;
  const mine = s.scores[user] ?? {};
  return { ...s, scores: { ...s.scores, [user]: { ...mine, [c]: { ...(mine[c] ?? {}), [h]: points } } } };
}

function toggleParking(s: State, user: string): State {
  if (s.closed) return s;
  if (s.skipParking.includes(user)) return { ...s, skipParking: s.skipParking.filter((x) => x !== user) };
  const mine = s.scores[user];
  return {
    ...s,
    skipParking: [...s.skipParking, user],
    scores: mine ? { ...s.scores, [user]: withoutParking(mine) } : s.scores,
  };
}

export default defineApp<State, Action, Local>({
  name: "House vote",
  summary: (s, ctx) => {
    const { leaders } = standing(s);
    if (s.closed) return `${C.title} Locked · ${leaders.length === 1 ? leaders[0]!.name : "tie"}.`;
    return `${C.title} ${raters(s)} of ${ctx.members.length} rated.`;
  },

  init: (ctx) => ({
    houses: C.houses.map((h) => ({ ...h })),
    criteria: C.criteria.map((c) => ({ ...c })),
    scores: {},
    skipParking: [],
    closed: false,
    host: ctx.members[0]?.id ?? "",
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "rate") return rate(state, meta.user, action.criterion, action.house, action.points);
    if (action.t === "toggleParking") return toggleParking(state, meta.user);
    if (action.t === "close") return meta.user === state.host && !state.closed ? { ...state, closed: true } : state;
    if (action.t === "reopen") return meta.user === state.host && state.closed ? { ...state, closed: false } : state;
    return state;
  },

  // Someone left: their points and parking skip go, and the host role moves to someone still here.
  onMembers: (state, ctx) => {
    const goneScores = Object.keys(state.scores).some((u) => !inChat(ctx, u));
    const goneSkip = state.skipParking.some((u) => !inChat(ctx, u));
    const hostGone = ctx.members.length > 0 && !inChat(ctx, state.host);
    if (!goneScores && !goneSkip && !hostGone) return state;
    return {
      ...state,
      scores: goneScores ? onlyPresent(state.scores, ctx) : state.scores,
      skipParking: goneSkip ? state.skipParking.filter((u) => inChat(ctx, u)) : state.skipParking,
      host: hostGone ? ctx.members[0]!.id : state.host,
    };
  },

  invariants: {
    "every score is a whole number from 0 to 3 on a known house and criterion": (s) =>
      entries(s).every((e) => Number.isInteger(e.v) && e.v >= 0 && e.v <= MAX_POINTS && s.houses.some((h) => h.id === e.h) && s.criteria.some((c) => c.id === e.c)),
    "everyone with a score is in the chat": (s, ctx) => Object.keys(s.scores).every((u) => inChat(ctx, u)),
    "nobody who skips parking has a parking score": (s) => entries(s).every((e) => e.c !== "parking" || !s.skipParking.includes(e.u)),
    "skipping parking is listed once per person, and only for people in the chat": (s, ctx) =>
      new Set(s.skipParking).size === s.skipParking.length && s.skipParking.every((u) => inChat(ctx, u)),
    "the host is in the chat whenever the chat has people": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
    "there are 3 houses and 6 criteria with unique ids": (s) =>
      s.houses.length === 3 && s.criteria.length === 6 && new Set(s.houses.map((h) => h.id)).size === 3 && new Set(s.criteria.map((c) => c.id)).size === 6,
  },

  transitions: {
    "a rate sets the actor's one score and changes nothing else": (p, n, a, m) => {
      if (a.t !== "rate" || p === n) return true;
      const other = (e: Entry) => !(e.u === m.user && e.c === a.criterion && e.h === a.house);
      return (
        getScore(n, m.user, String(a.criterion), String(a.house)) === a.points &&
        flat(p, other) === flat(n, other) &&
        p.skipParking.join() === n.skipParking.join() &&
        p.closed === n.closed
      );
    },
    "only the host closes or reopens: close locks, reopen unlocks": (p, n, a, m) => {
      if (a.t === "close") return p === n || (m.user === p.host && !p.closed && n.closed === true);
      if (a.t === "reopen") return p === n || (m.user === p.host && p.closed && n.closed === false);
      return true;
    },
    "while the result is locked, no score or parking skip changes": (p, _n, a, _m) => (a.t !== "rate" && a.t !== "toggleParking") || !p.closed || p === _n,
    "toggling parking flips the actor's skip and clears only the actor's parking scores": (p, n, a, m) => {
      if (a.t !== "toggleParking" || p === n) return true;
      const keep = (e: Entry) => e.u !== m.user || e.c !== "parking";
      const others = (s: State) => s.skipParking.filter((u) => u !== m.user).join();
      const was = p.skipParking.includes(m.user);
      const now = n.skipParking.includes(m.user);
      return was !== now && others(p) === others(n) && flat(p, keep) === flat(n, keep) && (!now || flat(n, (e) => e.u === m.user && e.c === "parking") === "");
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the houses, criteria and host never change": (p, n) =>
      JSON.stringify(p.houses) === JSON.stringify(n.houses) && JSON.stringify(p.criteria) === JSON.stringify(n.criteria) && p.host === n.host,
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.08) return { t: "close" };
    if (k < 0.16) return { t: "reopen" };
    if (k < 0.26) return { t: "toggleParking" };
    return { t: "rate", criterion: r.pick(s.criteria).id, house: r.pick(s.houses).id, points: r.int(5) };
  },

  local: { crit: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const n = state.criteria.length;
    const idx = ((local.crit % n) + n) % n;
    const crit = state.criteria[idx]!;
    const { totals, leaders } = standing(state);
    const hostName = members.find((m) => m.id === state.host)?.name ?? "The host";
    const isHost = me === state.host;
    const skipped = crit.id === "parking" && state.skipParking.includes(me);
    const raterIds = (hid: string) => members.filter((m) => entries(state).some((e) => e.u === m.id && e.h === hid)).map((m) => m.id);
    const rated = members.filter((m) => hasScore(state, m.id)).length;

    return (
      <div>
        <CardHeader title={C.title} subtitle={state.closed ? "Locked" : `${rated} of ${members.length} rated`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.houses.map((h, i) => {
            const lead = leaders.length === 1 && leaders[0]!.id === h.id;
            const faces = raterIds(h.id);
            return (
              <div key={h.id} style={{ padding: "2px 8px", borderRadius: theme.radius.button, minHeight: 40, ...(lead ? { background: theme.color.selected } : {}) }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  {lead ? <small style={{ color: theme.color.link, fontWeight: 600 }}>Leading</small> : null}
                  <small style={{ whiteSpace: "nowrap" }}>{pts(totals[i]!)}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${money(h.price)} · ${h.note}`}</small>
                  {faces.length ? <Facepile users={faces} max={3} size={20} /> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Button kind="secondary" onClick={() => setLocal({ crit: (idx + n - 1) % n })}>
            Back
          </Button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${crit.label} · ${idx + 1} of ${n}`}</div>
          <Button kind="secondary" onClick={() => setLocal({ crit: (idx + 1) % n })}>
            Next
          </Button>
        </div>

        {skipped ? (
          <div style={{ minHeight: 132, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <small>You skipped parking</small>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {state.houses.map((h) => {
              const mine = getScore(state, me, crit.id, h.id);
              return (
                <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 44px)", alignItems: "center", minHeight: 44 }}>
                  <div style={{ minWidth: 0, paddingRight: 6, lineHeight: "18px" }}>{h.name}</div>
                  {[0, 1, 2, 3].map((v) => {
                    const on = mine === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${h.name} ${pts(v)}`}
                        onClick={() => {
                          if (!state.closed) dispatch({ t: "rate", criterion: crit.id, house: h.id, points: v });
                        }}
                        style={{ height: 44, width: 44, borderRadius: theme.radius.button, fontWeight: 600, background: on ? theme.color.primary : theme.color.secondaryButton, color: on ? theme.color.onPrimary : theme.color.secondaryButtonText }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44 }}>
          {state.closed ? (
            <>
              <SystemLine>{`Locked · ${leaders.length === 1 ? leaders[0]!.name : "tie"}`}</SystemLine>
              {isHost ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "reopen" })}>
                  Reopen
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {crit.id === "parking" ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "toggleParking" })}>
                  {skipped ? "Rate parking" : "Skip parking"}
                </Button>
              ) : null}
              {isHost ? (
                <Button kind="primary" onClick={() => dispatch({ t: "close" })}>
                  Lock result
                </Button>
              ) : crit.id !== "parking" ? (
                <SystemLine>{`${hostName} locks the result`}</SystemLine>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  },
});
