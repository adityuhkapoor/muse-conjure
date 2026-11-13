import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, rng, running, spring, springs, tween } from "@muse/app";

// Veto: every option starts in. Each person gets a few vetoes; a veto strikes an option out with
// the vetoer's face on it. The last option standing wins. When everyone in the chat has used their
// vetoes (or someone taps Decide) and several are still in, the server's seed picks one of them.

type Params = {
  /** Card title: "Where are we eating?" */
  title: string;
  /** Options from the chat, 2 to 6, short: "Tacos El Gordo", "Shake Shack". */
  options: string[];
  /** Vetoes each person gets, 1 to 3. Usually 1. */
  vetoesEach: number;
  /** One plain line shown with the winner, from the chat: "Table for 6 at 7:30". Empty if none. */
  detail: string;
};

// @params
const P: Params = {
  title: "Where are we eating?",
  options: ["Tacos El Gordo", "Shake Shack", "Ramen Nagi", "Souvla", "Zachary's"],
  vetoesEach: 1,
  detail: "",
};
// @end params

type Option = { id: string; label: string; by: string | null; at: number };
/** how: "last" when vetoes left one standing, "seed" when the server's seed picked among the rest. */
type Winner = { id: string; how: "last" | "seed"; at: number };
type State = { title: string; detail: string; each: number; options: Option[]; winner: Winner | null };
type Action = { t: "veto"; option: string } | { t: "undo"; option: string } | { t: "decide" } | { t: "reset" };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const MAX_OPTIONS = 6;
const STRIKE_MS = 450;
const strike = tween({ duration: STRIKE_MS, easing: "move" });
const stamp = spring(springs.iosBouncy);
const glow = tween({ duration: 700, easing: "enter" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
// Check helpers (used by invariants, transitions and the view).
const standing = (s: State) => s.options.filter((o) => o.by === null);
const usedBy = (s: State, u: string) => s.options.filter((o) => o.by === u).length;
const same = (a: Option, b: Option | undefined) => !!b && a.id === b.id && a.label === b.label && a.by === b.by && a.at === b.at;

// Reducer helpers.
function vetoOne(s: State, user: string, id: unknown, time: number, seed: number, ids: string[]): State {
  if (s.winner) return s;
  const o = s.options.find((x) => x.id === id);
  if (!o || o.by !== null) return s;
  if (s.options.filter((x) => x.by === user).length >= s.each) return s;
  const options = s.options.map((x) => (x.id === o.id ? { ...x, by: user, at: time } : x));
  const left = options.filter((x) => x.by === null);
  if (left.length === 1) return { ...s, options, winner: { id: left[0]!.id, how: "last", at: time } };
  const everyoneOut = ids.every((u) => options.filter((x) => x.by === u).length >= s.each);
  if (everyoneOut) return { ...s, options, winner: { id: rng(seed).pick(left).id, how: "seed", at: time } };
  return { ...s, options };
}

function undoOne(s: State, user: string, id: unknown): State {
  if (s.winner) return s;
  const o = s.options.find((x) => x.id === id);
  if (!o || o.by !== user) return s;
  return { ...s, options: s.options.map((x) => (x.id === o.id ? { ...x, by: null, at: 0 } : x)) };
}

function decide(s: State, time: number, seed: number): State {
  const left = s.options.filter((x) => x.by === null);
  if (s.winner || left.length < 2) return s;
  return { ...s, winner: { id: rng(seed).pick(left).id, how: "seed", at: time } };
}

export default defineApp<State, Action, Local>({
  name: "Veto",
  summary: (s) => {
    const w = s.winner && s.options.find((o) => o.id === s.winner!.id);
    if (w) return `${s.title} ${w.label}${s.detail ? ` · ${s.detail}` : ""}`;
    return `${s.title} ${standing(s).length} of ${s.options.length} still in.`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const raw of P.options) {
      const label = raw.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      options.push({ id: `o${options.length}`, label, by: null, at: 0 });
    }
    const safe = options.length >= 2 ? options : [{ id: "o0", label: "Option A", by: null, at: 0 }, { id: "o1", label: "Option B", by: null, at: 0 }];
    const each = Math.max(1, Math.min(3, Math.floor(P.vetoesEach) || 1));
    return { title: P.title.trim().slice(0, 60) || "Veto", detail: P.detail.trim().slice(0, 60), each, options: safe, winner: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "veto") return vetoOne(state, meta.user, action.option, meta.time, meta.seed, ctx.members.map((m) => m.id));
    if (action.t === "undo") return undoOne(state, meta.user, action.option);
    if (action.t === "decide") return decide(state, meta.time, meta.seed);
    if (action.t === "reset") {
      if (!state.winner) return state;
      return { ...state, winner: null, options: state.options.map((o) => ({ ...o, by: null, at: 0 })) };
    }
    return state;
  },

  // Someone left: their vetoes are lifted and those options are back in. A decided winner stays.
  onMembers: (state, ctx) => {
    const gone = state.options.map((o) => o.by).filter((b): b is string => b !== null).filter((b) => !inChat(ctx, b));
    if (!gone.length) return state;
    return { ...state, options: state.options.map((o) => (gone.includes(o.by ?? "") ? { ...o, by: null, at: 0 } : o)) };
  },

  invariants: {
    "nobody uses more vetoes than they get": (s, ctx) => ctx.members.every((m) => usedBy(s, m.id) <= s.each) && s.each >= 1 && s.each <= 3,
    "vetoers are in the chat": (s, ctx) => s.options.every((o) => o.by === null || inChat(ctx, o.by)),
    "at least one option is still in": (s) => standing(s).length >= 1,
    "only struck options carry a strike time": (s) => s.options.every((o) => (o.by === null) === (o.at === 0)),
    "the winner was never vetoed": (s) => s.winner === null || s.options.some((o) => o.id === s.winner!.id && o.by === null),
    "one option left means it won": (s) => standing(s).length !== 1 || s.winner?.id === standing(s)[0]!.id,
    "the seed only picks among two or more": (s) => s.winner?.how !== "seed" || standing(s).length >= 2,
    "options are unique and there are 2 to 6": (s) => s.options.length >= 2 && s.options.length <= MAX_OPTIONS && new Set(s.options.map((o) => o.id)).size === s.options.length,
  },

  transitions: {
    "a veto strikes one standing option for the actor": (p, n, a, m, ctx) => {
      if (a.t !== "veto" || p === n) return true;
      const i = p.options.findIndex((o) => o.id === a.option);
      if (i < 0 || p.winner || p.options[i]!.by !== null || usedBy(p, m.user) >= p.each) return false;
      if (n.options[i]?.by !== m.user || n.options[i]!.at !== m.time) return false;
      if (!p.options.every((o, j) => j === i || same(o, n.options[j]))) return false;
      const left = standing(n);
      if (left.length === 1) return n.winner?.id === left[0]!.id && n.winner.how === "last" && n.winner.at === m.time;
      const out = ctx.members.every((x) => usedBy(n, x.id) >= n.each);
      return out ? n.winner?.how === "seed" && n.winner.id === rng(m.seed).pick(left).id && n.winner.at === m.time : n.winner === null;
    },
    "an undo lifts only the actor's own veto, before a winner": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const i = p.options.findIndex((o) => o.id === a.option);
      return i >= 0 && !p.winner && p.options[i]!.by === m.user && n.options[i]?.by === null && n.winner === null && p.options.every((o, j) => j === i || same(o, n.options[j]));
    },
    "decide lets the seed pick one of those still in": (p, n, a, m) => {
      if (a.t !== "decide" || p === n) return true;
      const left = standing(p);
      return !p.winner && left.length >= 2 && n.winner?.how === "seed" && n.winner.id === rng(m.seed).pick(left).id && n.winner.at === m.time && p.options.every((o, j) => same(o, n.options[j]));
    },
    "a reset brings every option back, after a winner": (p, n, a) =>
      a.t !== "reset" || p === n || (p.winner !== null && n.winner === null && n.options.length === p.options.length && n.options.every((o, j) => o.by === null && o.label === p.options[j]!.label)),
    "a winner stays until a reset": (p, n, a) => a.t === "reset" || p.winner === null || n.winner?.id === p.winner.id,
    "the setup never changes": (p, n) => p.title === n.title && p.detail === n.detail && p.each === n.each,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.winner) return r.next() < 0.5 ? { t: "reset" } : { t: "veto", option: r.pick(s.options).id };
    const mine = s.options.filter((o) => o.by === user);
    if (mine.length && r.next() < 0.2) return { t: "undo", option: r.pick(mine).id };
    if (r.next() < 0.08) return { t: "decide" };
    return { t: "veto", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    // Strikes are plain facts and show at once; who wins can come from the seed, so the winner is
    // shown from `confirmed`, with a neutral line while my own action is unconfirmed.
    const deciding = pending && state.winner !== null && confirmed.winner?.at !== state.winner.at;
    const winner = deciding ? null : confirmed.winner;
    const rows = winner ? confirmed.options : state.options;
    const left = standing(state);
    const mine = Math.max(0, state.each - usedBy(state, me));
    const holders = members.filter((m) => usedBy(state, m.id) < state.each).map((m) => m.id);
    const vetoesLeft = members.reduce((n, m) => n + Math.max(0, state.each - usedBy(state, m.id)), 0);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const won = winner ? confirmed.options.find((o) => o.id === winner.id) : null;
    const g = winner ? (running(winner.at, 700) ?? 700) : 0;
    const lit = winner ? glow(g) : 0;
    const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "es"}`;

    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={winner ? (winner.how === "last" ? "Last one standing" : `Picked from the last ${standing(confirmed).length}`) : `${left.length} still in · ${mine ? `you have ${plural(mine, "veto")}` : "your vetoes are used"}`}
        />
        <div style={{ display: "grid" }}>
          {rows.map((o) => {
            const isWin = !!winner && o.id === winner.id;
            const out = o.by !== null;
            const t = out ? (running(o.at, STRIKE_MS) ?? STRIKE_MS) : 0;
            const k = out ? strike(t) : 0;
            const pop = out ? 0.5 + 0.5 * stamp(t) : 1;
            return (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 44,
                  padding: "0 8px",
                  borderRadius: theme.radius.button,
                  background: isWin ? theme.color.selected : "transparent",
                  boxShadow: isWin ? `inset 0 0 0 ${Math.round(2 * lit)}px ${theme.color.primary}` : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
                  <span style={{ position: "relative", minWidth: 0, maxWidth: "100%", fontWeight: isWin ? 600 : 400, color: out || (winner && !isWin) ? theme.color.secondaryText : theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.label}
                    {out ? (
                      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 10, height: 2, width: `${Math.round(k * 100)}%`, background: theme.color.negative, borderRadius: 1 }} />
                    ) : null}
                  </span>
                </div>
                {out ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                    <small>{o.by === me ? "You" : nameOf(o.by!)}</small>
                    <span style={{ display: "inline-flex", transform: `scale(${pop.toFixed(3)})` }}>
                      <Avatar user={o.by!} size={24} />
                    </span>
                    {o.by === me && !winner && !deciding ? (
                      <Button kind="secondary" onClick={() => dispatch({ t: "undo", option: o.id })}>
                        Undo
                      </Button>
                    ) : null}
                  </div>
                ) : isWin ? (
                  <small style={{ fontWeight: 600, color: theme.color.link, flex: "none" }}>Winner</small>
                ) : !winner && mine > 0 ? (
                  <Button kind="deemphasized" disabled={mine === 0 || deciding} onClick={() => dispatch({ t: "veto", option: o.id })}>
                    Veto
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 24, marginTop: 4 }}>
          {deciding ? (
            <SystemLine>Deciding…</SystemLine>
          ) : won ? (
            <SystemLine actor={won.label}>{confirmed.detail ? `it is · ${confirmed.detail}` : "it is"}</SystemLine>
          ) : (
            <SystemLine>{left.length === 2 ? "One more veto decides it" : "The last one standing wins"}</SystemLine>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minHeight: 44 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            {winner ? null : holders.length ? <Facepile users={holders} max={4} size={20} /> : null}
            <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{winner ? `${state.options.length - standing(confirmed).length} vetoed` : `${plural(vetoesLeft, "veto")} left`}</small>
          </div>
          {winner ? (
            <Button onClick={() => dispatch({ t: "reset" })}>Again</Button>
          ) : (
            <Button disabled={left.length < 2 || deciding} onClick={() => dispatch({ t: "decide" })}>
              Decide
            </Button>
          )}
        </div>
      </div>
    );
  },
});
