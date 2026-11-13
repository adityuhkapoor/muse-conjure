import { defineApp, Avatar, Button, CardHeader, SystemLine, rng, running, spring, springs } from "@muse/app";

// Snake draft: people take turns picking from a board of options (trip plans, chores, rooms).
// Start draws the turn order from the server's seed; the order snakes (1 2 3, 3 2 1, ...).
// Picks land in each person's column. Someone who joins mid-draft enters at the next round; a
// leaver's picks go back on the board.

type Params = {
  /** Card title: "Nashville: who plans what" */
  title: string;
  /** Options on the board, 2 to 10, short: "Ryman tour", "Bathroom". */
  options: string[];
  /** Picks per person, 1 to 6; 0 means keep going until the board is empty. */
  rounds: number;
  /** Names of the people drafting, exactly as in the chat. Empty means everyone in the chat. */
  people: string[];
};

// @params
const P: Params = {
  title: "Nashville: who plans what",
  options: ["Hot chicken at Hattie B's", "Ryman tour", "Broadway honky tonks", "Grand Ole Opry", "Johnny Cash museum", "Pancake Pantry", "Centennial park", "Assembly food hall"],
  rounds: 0,
  people: [],
};
// @end params

type Opt = { id: string; label: string; by: string | null; at: number };
/**
 * order: the draw, null before start. round and idx say whose turn it is: in even rounds
 * order[idx], in odd rounds the order reversed. waiting: joined mid-draft, in from the next round.
 */
type State = { title: string; rounds: number; people: string[]; options: Opt[]; order: string[] | null; round: number; idx: number; waiting: string[]; at: number };
type Action = { t: "start" } | { t: "pick"; option: string } | { t: "join" } | { t: "reset" };
type Local = Record<string, never>;
type Member = { id: string; name: string };
type Ctx = { members: Member[] };

const MAX_OPTIONS = 10;
const fly = spring(springs.ios);
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

// Check helpers (invariants, transitions, view).
const lineupOf = (s: State, ctx: Ctx) => {
  const named = ctx.members.filter((m) => s.people.includes(m.name.trim().toLowerCase()));
  return (named.length >= 2 ? named : ctx.members).map((m) => m.id);
};
const turnOf = (s: State): string | null => (s.order === null ? null : ((s.round % 2 === 0 ? s.order[s.idx] : s.order[s.order.length - 1 - s.idx]) ?? null));
const picksOf = (s: State, u: string) => s.options.filter((o) => o.by === u);
const isDone = (s: State) => s.order !== null && (s.options.every((o) => o.by !== null) || (s.rounds > 0 && s.round >= s.rounds));
/** The turn after one more pick: next seat, or a new round with the waiting list added. */
const nextTurn = (s: State) =>
  s.order !== null && s.idx + 1 >= s.order.length ? { order: [...s.order, ...s.waiting], round: s.round + 1, idx: 0, waiting: [] as string[] } : { order: s.order, round: s.round, idx: s.idx + 1, waiting: s.waiting };

// Reducer helpers.
function start(s: State, time: number, seed: number, ctx: Ctx): State {
  if (s.order !== null) return s;
  const named = ctx.members.filter((m) => s.people.includes(m.name.trim().toLowerCase()));
  const lineup = (named.length >= 2 ? named : ctx.members).map((m) => m.id);
  if (lineup.length < 2) return s;
  return { ...s, order: rng(seed).shuffle(lineup), round: 0, idx: 0, waiting: [], at: time };
}

function pick(s: State, user: string, id: unknown, time: number): State {
  if (s.order === null || isDoneR(s)) return s;
  const who = s.round % 2 === 0 ? s.order[s.idx] : s.order[s.order.length - 1 - s.idx];
  const o = s.options.find((x) => x.id === id);
  if (who !== user || !o || o.by !== null) return s;
  const options = s.options.map((x) => (x.id === o.id ? { ...x, by: user, at: time } : x));
  if (s.idx + 1 < s.order.length) return { ...s, options, idx: s.idx + 1 };
  return { ...s, options, order: [...s.order, ...s.waiting], waiting: [], round: s.round + 1, idx: 0 };
}

function isDoneR(s: State) {
  return s.options.every((o) => o.by !== null) || (s.rounds > 0 && s.round >= s.rounds);
}

function join(s: State, user: string): State {
  if (s.order === null || s.order.includes(user) || s.waiting.includes(user) || isDoneR(s)) return s;
  return { ...s, waiting: [...s.waiting, user] };
}

export default defineApp<State, Action, Local>({
  name: "Draft",
  summary: (s, ctx) => {
    const name = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const taken = s.options.filter((o) => o.by !== null).length;
    if (s.order === null) return `${s.title} Not started. ${s.options.length} options.`;
    if (isDone(s)) return `${s.title} Done. ${taken} picks.`;
    return `${s.title} ${taken} of ${s.options.length} picked. ${name(turnOf(s))} is up.`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Opt[] = [];
    for (const raw of P.options) {
      const label = raw.trim().replace(/\s+/g, " ").slice(0, 32);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      options.push({ id: `o${options.length}`, label, by: null, at: 0 });
    }
    const safe = options.length >= 2 ? options : [{ id: "o0", label: "Option A", by: null, at: 0 }, { id: "o1", label: "Option B", by: null, at: 0 }];
    const rounds = Math.max(0, Math.min(6, Math.floor(P.rounds) || 0));
    const people = [...new Set(P.people.map((n) => n.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
    return { title: P.title.trim().slice(0, 60) || "Draft", rounds, people, options: safe, order: null, round: 0, idx: 0, waiting: [], at: 0 };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "start") return start(state, meta.time, meta.seed, ctx);
    if (action.t === "pick") return pick(state, meta.user, action.option, meta.time);
    if (action.t === "join") return join(state, meta.user);
    if (action.t === "reset") {
      if (state.order === null || !isDoneR(state)) return state;
      return { ...state, order: null, round: 0, idx: 0, waiting: [], at: 0, options: state.options.map((o) => ({ ...o, by: null, at: 0 })) };
    }
    return state;
  },

  // Someone left: their picks go back on the board and they leave the order. If it was their
  // turn, the next person is up. Before the start the lineup is simply the chat.
  onMembers: (state, ctx) => {
    if (state.order === null) return state;
    const gone = [...state.order, ...state.waiting].filter((u) => !inChat(ctx, u));
    if (!gone.length) return state;
    const options = state.options.map((o) => (o.by !== null && gone.includes(o.by) ? { ...o, by: null, at: 0 } : o));
    const dir = state.round % 2 === 0 ? state.order : [...state.order].reverse();
    const before = dir.slice(0, state.idx).filter((u) => gone.includes(u)).length;
    const order = state.order.filter((u) => !gone.includes(u));
    const waiting = state.waiting.filter((u) => !gone.includes(u));
    if (order.length === 0) return { ...state, options: options.map((o) => ({ ...o, by: null, at: 0 })), order: null, round: 0, idx: 0, waiting: [], at: 0 };
    const idx = state.idx - before;
    if (idx < order.length) return { ...state, options, order, waiting, idx };
    return { ...state, options, order: [...order, ...waiting], waiting: [], round: state.round + 1, idx: 0 };
  },

  invariants: {
    "picks belong to people in the order": (s) => s.options.every((o) => o.by === null || (s.order !== null && s.order.includes(o.by))),
    "no picks before the start": (s) => s.order !== null || (s.options.every((o) => o.by === null) && s.waiting.length === 0 && s.round === 0 && s.idx === 0),
    "everyone drafting is in the chat, once": (s, ctx) => {
      const all = [...(s.order ?? []), ...s.waiting];
      return all.every((u) => inChat(ctx, u)) && new Set(all).size === all.length;
    },
    "the turn points at someone in the order": (s) => s.order === null || (s.idx >= 0 && s.idx < s.order.length),
    "nobody picks more than the rounds allow": (s) => s.order === null || s.order.every((u) => picksOf(s, u).length <= s.round + 1 && (s.rounds === 0 || picksOf(s, u).length <= s.rounds)),
    "whoever is up has not picked yet this round": (s) => s.order === null || picksOf(s, turnOf(s) ?? "").length <= s.round,
    "a pick has a time and only picks do": (s) => s.options.every((o) => (o.by === null) === (o.at === 0)),
  },

  transitions: {
    "start draws the order from the seed": (p, n, a, m, ctx) => {
      if (a.t !== "start" || p === n) return true;
      const lineup = lineupOf(p, ctx);
      return p.order === null && lineup.length >= 2 && n.order !== null && n.order.join() === rng(m.seed).shuffle(lineup).join() && n.round === 0 && n.idx === 0 && n.at === m.time;
    },
    "only the person up picks, one free option, and the turn moves on": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const i = p.options.findIndex((o) => o.id === a.option);
      if (i < 0 || isDone(p) || turnOf(p) !== m.user || p.options[i]!.by !== null) return false;
      if (n.options[i]!.by !== m.user || n.options[i]!.at !== m.time) return false;
      if (!p.options.every((o, j) => j === i || JSON.stringify(o) === JSON.stringify(n.options[j]))) return false;
      const t = nextTurn(p);
      return n.round === t.round && n.idx === t.idx && n.order?.join() === t.order?.join() && n.waiting.join() === t.waiting.join();
    },
    "joining mid-draft adds the actor to the next round": (p, n, a, m) =>
      a.t !== "join" || p === n || (p.order !== null && !isDone(p) && !p.order.includes(m.user) && !p.waiting.includes(m.user) && n.waiting.join() === [...p.waiting, m.user].join() && n.order?.join() === p.order.join()),
    "a valid pick or join always takes effect": (p, n, a, m, ctx) => {
      if (p.order === null || isDone(p) || !inChat(ctx, m.user)) return true;
      if (a.t === "pick") return turnOf(p) !== m.user || !p.options.some((o) => o.id === a.option && o.by === null) || p !== n;
      if (a.t === "join") return p.order.includes(m.user) || p.waiting.includes(m.user) || n.waiting.includes(m.user);
      return true;
    },
    "a reset clears the board, only after the draft is done": (p, n, a) => a.t !== "reset" || p === n || (isDone(p) && n.order === null && n.options.every((o) => o.by === null)),
    "the board's options never change": (p, n) => p.title === n.title && p.options.map((o) => o.label).join("|") === n.options.map((o) => o.label).join("|"),
    "only people in the chat change the draft": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.order === null) return { t: "start" };
    if (isDone(s)) return r.next() < 0.6 ? { t: "reset" } : { t: "pick", option: r.pick(s.options).id };
    if (!s.order.includes(user) && !s.waiting.includes(user) && r.next() < 0.7) return { t: "join" };
    const free = s.options.filter((o) => o.by === null);
    return { t: "pick", option: r.pick(free.length && r.next() < 0.9 ? free : s.options).id };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    // The order comes from the server's seed: it is shown from `confirmed`, and while my own
    // start is unconfirmed the card says so instead of showing the local guess.
    const drawing = pending && confirmed.order === null && state.order !== null;
    const s = drawing ? confirmed : state;
    const nameOf = (id: string | null) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const up = turnOf(s);
    const done = isDone(s);
    const myTurn = up === me && !done && !drawing;
    const lineup = s.order ?? lineupOf(s, { members });
    const dir = s.order && s.round % 2 === 1 ? [...lineup].reverse() : lineup;
    const free = s.options.filter((o) => o.by === null);
    const taken = s.options.length - free.length;
    const total = s.rounds > 0 && s.order ? Math.min(s.options.length, s.rounds * s.order.length) : s.options.length;
    // Board labels are cut by hand to the cell: the gate measures text hidden by an ellipsis too.
    const fit = Math.max(6, Math.floor(((theme.width - 30) / 2 - 24) / 8));
    const cut = (t: string) => (t.length > fit ? `${t.slice(0, fit - 1).trimEnd()}…` : t);
    const lastAt = Math.max(s.at, ...s.options.map((o) => o.at));
    const enter = s.order ? (running(confirmed.at, 600) ?? 600) : 600;

    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={s.order === null ? `${s.options.length} options · snake order` : done ? `Done · ${taken} picks` : `Round ${s.round + 1}${s.rounds ? ` of ${s.rounds}` : ""} · ${taken} of ${total} picked`}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          {dir.map((u, i) => {
            const mine = picksOf(s, u);
            const isUp = u === up && !done;
            const k = isUp ? 0.8 + 0.2 * fly(running(lastAt, 700) ?? 700) : 1;
            return (
              <div key={u} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, padding: 3, overflow: "hidden", textAlign: "center", opacity: s.order ? fly(Math.max(0, enter - i * 60)) : 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignSelf: "center",
                    padding: 2,
                    borderRadius: 99,
                    boxShadow: isUp ? `0 0 0 2px ${theme.color.primary}` : "none",
                    transform: `scale(${(isUp ? 1.08 : 1) * k})`,
                  }}
                >
                  <Avatar user={u} size={28} />
                </div>
                <small style={{ maxWidth: "100%", fontWeight: isUp ? 600 : 400, color: isUp ? theme.color.link : theme.color.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nameOf(u)}
                </small>
                {mine.map((o) => {
                  const t = running(o.at, 420);
                  const y = t === null ? 0 : (1 - fly(t)) * 28;
                  return (
                    <div
                      key={o.id}
                      title={o.label}
                      style={{
                        maxWidth: "100%",
                        padding: "2px 3px",
                        borderRadius: 6,
                        background: theme.color.selected,
                        color: theme.color.text,
                        fontSize: 12,
                        lineHeight: "15px",
                        overflowWrap: "break-word",
                        transform: `translateY(${y.toFixed(1)}px)`,
                      }}
                    >
                      {o.label}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 24, margin: "8px 0 4px" }}>
          {drawing ? (
            <SystemLine>Drawing the order…</SystemLine>
          ) : s.order === null ? (
            <SystemLine>Start draws the order at random</SystemLine>
          ) : done ? (
            <SystemLine>Every pick is in</SystemLine>
          ) : myTurn ? (
            <SystemLine actor="Your pick">· tap one below</SystemLine>
          ) : (
            <SystemLine actor={nameOf(up)}>is picking</SystemLine>
          )}
        </div>
        {done ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
            {free.map((o) =>
              myTurn ? (
                <Button key={o.id} kind="deemphasized" wide onClick={() => dispatch({ t: "pick", option: o.id })}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{cut(o.label)}</span>
                </Button>
              ) : (
                <span
                  key={o.id}
                  style={{ display: "block", height: 36, lineHeight: "36px", minWidth: 0, padding: "0 10px", borderRadius: theme.radius.button, background: theme.color.input, color: theme.color.text, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {cut(o.label)}
                </span>
              ),
            )}
          </div>
        )}
        {s.order === null ? (
          <div style={{ marginTop: 12 }}>
            <Button kind="primary" wide disabled={lineup.length < 2 || drawing} onClick={() => dispatch({ t: "start" })}>
              Start
            </Button>
          </div>
        ) : done ? (
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => dispatch({ t: "reset" })}>Restart</Button>
          </div>
        ) : !s.order.includes(me) ? (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <small style={{ flex: 1 }}>{s.waiting.includes(me) ? `You're in from round ${s.round + 2}` : "Not in this draft yet"}</small>
            {s.waiting.includes(me) ? null : <Button onClick={() => dispatch({ t: "join" })}>Join</Button>}
          </div>
        ) : null}
      </div>
    );
  },
});
