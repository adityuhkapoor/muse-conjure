import { defineApp, Avatar, Button, CardHeader, SystemLine, Toast, rng, running } from "@muse/app";

// Snake draft: the order is drawn at random when someone starts, then people pick movies
// in snake order (1 to n, then n to 1) until everyone has their picks.

const CHAT = {
  title: "Movie night draft",
  place: "Saturday at Noor's place",
  picksEach: 2,
  movies: [
    "Spiderverse",
    "Mean Girls",
    "Knives Out",
    "Step Brothers",
    "Whiplash",
    "Scott Pilgrim",
    "Parasite",
    "Shrek 2",
    "Interstellar",
    "Coco",
    "Barbie",
    "Dune 2",
    "Superbad",
    "The Notebook",
    "Tangled",
  ],
};

type Movie = { id: string; label: string };
type Pick = { id: string; movie: string; by: string };
type State = {
  phase: "setup" | "drafting" | "done";
  pool: Movie[];
  order: string[];
  picks: Pick[];
  at: number;
  perPerson: number;
};
type Action = { t: "add"; label: string } | { t: "start" } | { t: "pick"; movie: string };
type Local = { tab: "pool" | "picks"; page: number; draft: string; toast: number };

const MAX_MOVIES = 16;
const MAX_LABEL = 40;
const PAGE = 8;

const clean = (t: string) => t.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const cut = (t: string, k: number) => (t.length > k ? `${t.slice(0, k - 1).trimEnd()}…` : t);

/** Who picks at pick number i: even rounds go forward, odd rounds go back. */
const drafterAt = (order: string[], i: number): string | null => {
  const n = order.length;
  if (n === 0 || i < 0) return null;
  const slot = i % n;
  return order[Math.floor(i / n) % 2 === 0 ? slot : n - 1 - slot] ?? null;
};
const turnOf = (s: State): string | null => (s.phase === "drafting" ? drafterAt(s.order, s.picks.length) : null);
const countOf = (s: State, u: string) => s.picks.filter((p) => p.by === u).length;

export default defineApp<State, Action, Local>({
  name: "Snake draft",

  summary: (s, ctx) => {
    if (s.phase === "setup") return `${CHAT.title} Not started. ${s.pool.length} movies in the pool.`;
    if (s.phase === "done") return `${CHAT.title} Done. ${s.picks.length} picks.`;
    const up = turnOf(s);
    const name = ctx.members.find((m) => m.id === up)?.name ?? "Someone";
    return `${CHAT.title} ${s.picks.length} of ${s.order.length * s.perPerson} picked. ${name} is up.`;
  },

  init: () => {
    const seen = new Set<string>();
    const pool: Movie[] = [];
    for (const raw of CHAT.movies) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || pool.length >= MAX_MOVIES) continue;
      seen.add(label.toLowerCase());
      pool.push({ id: `m${pool.length}`, label });
    }
    return { phase: "setup", pool, order: [], picks: [], at: 0, perPerson: Math.max(1, Math.floor(CHAT.picksEach) || 1) };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "add") {
      if (s.phase !== "setup" || typeof a.label !== "string") return s;
      const label = clean(a.label);
      if (!label || label.length > MAX_LABEL || s.pool.length >= MAX_MOVIES) return s;
      if (s.pool.some((x) => x.label.toLowerCase() === label.toLowerCase())) return s;
      return { ...s, pool: [...s.pool, { id: `a${m.seq}`, label }] };
    }
    if (a.t === "start") {
      if (s.phase !== "setup" || s.pool.length === 0 || ctx.members.length < 2) return s;
      return { ...s, phase: "drafting", order: rng(m.seed).shuffle(ctx.members.map((x) => x.id)), at: m.time };
    }
    if (a.t === "pick") {
      if (s.phase !== "drafting" || typeof a.movie !== "string") return s;
      const mv = s.pool.find((x) => x.id === a.movie);
      if (!mv || drafterAt(s.order, s.picks.length) !== m.user) return s;
      const pool = s.pool.filter((x) => x.id !== mv.id);
      const picks = [...s.picks, { id: mv.id, movie: mv.label, by: m.user }];
      const done = pool.length === 0 || picks.length >= s.order.length * s.perPerson;
      return { ...s, pool, picks, phase: done ? "done" : "drafting" };
    }
    return s;
  },

  // Someone in the draft left: the order changes, so the draft goes back to setup and
  // every picked movie returns to the pool.
  onMembers: (s, ctx) => {
    if (s.phase === "setup" || s.order.every((u) => inChat(ctx, u))) return s;
    return {
      ...s,
      phase: "setup",
      order: [],
      at: 0,
      picks: [],
      pool: [...s.pool, ...s.picks.map((p) => ({ id: p.id, label: p.movie }))],
    };
  },

  invariants: {
    "each movie appears once across the pool and the picks": (s) => {
      const labels = [...s.pool.map((x) => x.label.toLowerCase()), ...s.picks.map((x) => x.movie.toLowerCase())];
      const ids = [...s.pool.map((x) => x.id), ...s.picks.map((x) => x.id)];
      return new Set(labels).size === labels.length && new Set(ids).size === ids.length;
    },
    "at most 16 movies, each 1 to 40 characters": (s) =>
      s.pool.length + s.picks.length <= MAX_MOVIES &&
      s.pool.every((x) => x.label.length > 0 && x.label.length <= MAX_LABEL) &&
      s.picks.every((x) => x.movie.length > 0 && x.movie.length <= MAX_LABEL),
    "the order has each person once, all in the chat, and is empty only in setup": (s, ctx) =>
      new Set(s.order).size === s.order.length && s.order.every((u) => inChat(ctx, u)) && (s.phase === "setup") === (s.order.length === 0),
    "nobody has more picks than allowed and pickers are in the order": (s) =>
      s.order.every((u) => countOf(s, u) <= s.perPerson) && s.picks.every((p) => s.order.includes(p.by)),
    "picks follow the snake order": (s) => s.picks.every((p, i) => p.by === drafterAt(s.order, i)),
    "the phase matches the picks": (s) =>
      s.phase === "setup"
        ? s.picks.length === 0
        : s.phase === "drafting"
          ? s.pool.length > 0 && s.picks.length < s.order.length * s.perPerson
          : s.pool.length === 0 || s.picks.length >= s.order.length * s.perPerson,
  },

  transitions: {
    "a pick moves one movie from the pool to the end of the picks, for the actor": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const last = n.picks.at(-1);
      return (
        !!last &&
        last.by === m.user &&
        last.id === a.movie &&
        last.movie === p.pool.find((x) => x.id === a.movie)?.label &&
        n.picks.length === p.picks.length + 1 &&
        n.pool.length === p.pool.length - 1 &&
        !n.pool.some((x) => x.id === a.movie) &&
        JSON.stringify(n.picks.slice(0, -1)) === JSON.stringify(p.picks) &&
        n.order.join() === p.order.join()
      );
    },
    "only the person whose turn it is picks": (p, n, a, m) =>
      a.t !== "pick" || p === n || (p.phase === "drafting" && drafterAt(p.order, p.picks.length) === m.user),
    "start only happens from setup and draws the order from the seed": (p, n, a, m, ctx) =>
      a.t !== "start" ||
      p === n ||
      (p.phase === "setup" &&
        n.phase === "drafting" &&
        n.picks.length === 0 &&
        n.at === m.time &&
        n.pool.length === p.pool.length &&
        n.order.join() === rng(m.seed).shuffle(ctx.members.map((x) => x.id)).join()),
    "an add appends one movie in setup and leaves the order and picks alone": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.pool.at(-1);
      return (
        p.phase === "setup" &&
        typeof a.label === "string" &&
        !!last &&
        last.id === `a${m.seq}` &&
        last.label === clean(a.label) &&
        n.pool.length === p.pool.length + 1 &&
        n.picks.length === 0 &&
        n.order.length === 0
      );
    },
    "picks each never changes": (p, n) => p.perPerson === n.perPerson,
    "only people in the chat change the draft": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.phase === "setup") {
      return r.next() < 0.3
        ? { t: "add", label: r.pick(["Up", "Alien", "  heat ", "", "Moana", s.pool[0]?.label ?? "Coco"]) }
        : { t: "start" };
    }
    if (s.phase === "drafting" && s.pool.length > 0) {
      if (turnOf(s) === user || r.next() < 0.3) return { t: "pick", movie: r.pick(s.pool).id };
      return r.next() < 0.5 ? { t: "start" } : null;
    }
    return { t: "add", label: "Heat" };
  },

  local: { tab: "pool", page: 0, draft: "", toast: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    // The order comes from the server's seed: while my own start is unconfirmed, and during
    // the short draw, the card says so instead of showing the local guess.
    const pendingStart = pending && state.phase !== "setup" && confirmed.phase === "setup";
    const animating = confirmed.phase !== "setup" && running(confirmed.at, 2000) !== null;
    const drawing = pendingStart || animating;
    const s = pendingStart ? confirmed : state;

    const nameOf = (id: string | null) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const up = turnOf(s);
    const myTurn = up === me && !drawing;
    const total = s.order.length * s.perPerson;
    const fitBtn = Math.max(6, Math.floor(((theme.width - 30) / 2 - 24) / 8));
    const fitCell = Math.max(8, Math.floor(((theme.width - 30) / 2 - 12) / 7));

    const title = s.phase === "done" ? "Draft done" : CHAT.title;
    const subtitle =
      s.phase === "setup"
        ? drawing
          ? "Drawing order"
          : `${s.pool.length} movies · ${members.length} people · ${s.perPerson} each`
        : s.phase === "done"
          ? `${CHAT.place} · ${s.picks.length} picks`
          : drawing
            ? "Drawing order"
            : `${myTurn ? "Your pick" : `Waiting for ${nameOf(up)}`} · ${s.picks.length} of ${total} picked`;

    const grid = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
        {s.order.map((u) => {
          const mine = s.picks.filter((p) => p.by === u);
          const isUp = u === up && !drawing;
          return (
            <div
              key={u}
              style={{
                minWidth: 0,
                padding: "4px 6px",
                borderRadius: theme.radius.button,
                background: theme.color.input,
                color: theme.color.text,
                boxShadow: isUp ? `inset 0 0 0 2px ${theme.color.primary}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
                <Avatar user={u} size={20} />
                <small style={{ minWidth: 0, fontWeight: 600, color: theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(u)}</small>
              </div>
              {Array.from({ length: s.perPerson }, (_, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: "16px", height: 16, whiteSpace: "nowrap", overflow: "hidden" }}>
                  {mine[i] ? cut(mine[i]!.movie, fitCell) : "–"}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );

    // Done: everyone's final picks.
    if (s.phase === "done" && !drawing) {
      return (
        <div>
          <CardHeader title={title} subtitle={subtitle} />
          {grid}
        </div>
      );
    }

    // Setup: the pool, add a movie, start.
    if (s.phase === "setup") {
      const need = members.length * s.perPerson;
      const canAdd = clean(local.draft).length > 0 && s.pool.length < MAX_MOVIES;
      const submit = () => {
        if (!canAdd) return;
        dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
        setLocal({ draft: "", toast: local.toast + 1 });
      };
      return (
        <div>
          <CardHeader title={title} subtitle={subtitle} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {s.pool.map((x) => (
              <span
                key={x.id}
                style={{ maxWidth: "100%", padding: "4px 8px", borderRadius: theme.radius.pill, background: theme.color.input, color: theme.color.text, fontSize: 13, lineHeight: "18px", overflowWrap: "anywhere" }}
              >
                {x.label}
              </span>
            ))}
          </div>
          {s.pool.length < need ? (
            <div style={{ marginTop: 6 }}>
              <small>{`${need - s.pool.length} more ${need - s.pool.length === 1 ? "movie" : "movies"} fills every pick`}</small>
            </div>
          ) : null}
          {s.pool.length < MAX_MOVIES ? (
            <form
              style={{ display: "flex", gap: 8, marginTop: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add movie" aria-label="Add movie" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
              <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
                Add
              </Button>
            </form>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <Button kind="primary" wide disabled={members.length < 2 || s.pool.length === 0 || drawing} onClick={() => dispatch({ t: "start" })}>
              Start draft
            </Button>
          </div>
          {local.toast ? <Toast key={local.toast}>Movie added</Toast> : null}
        </div>
      );
    }

    // Drafting.
    const showPicks = local.tab === "picks" && !drawing;
    const pages = Math.max(1, Math.ceil(s.pool.length / PAGE));
    const page = Math.min(local.page, pages - 1);
    const shown = s.pool.slice(page * PAGE, page * PAGE + PAGE);

    return (
      <div>
        <CardHeader title={title} subtitle={subtitle} />
        {showPicks ? (
          grid
        ) : (
          <div>
            {drawing ? (
              <div style={{ minHeight: 32 }}>
                <SystemLine>Drawing order</SystemLine>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {s.order.map((u) => (
                  <div key={u} style={{ display: "flex", padding: 2, borderRadius: theme.radius.pill, boxShadow: u === up ? `0 0 0 2px ${theme.color.primary}` : "none" }}>
                    <Avatar user={u} size={24} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
              {shown.map((x) =>
                myTurn ? (
                  <Button key={x.id} kind="deemphasized" wide onClick={() => dispatch({ t: "pick", movie: x.id })}>
                    {cut(x.label, fitBtn)}
                  </Button>
                ) : (
                  <span
                    key={x.id}
                    style={{ display: "block", height: 36, lineHeight: "36px", minWidth: 0, padding: "0 10px", borderRadius: theme.radius.button, background: theme.color.input, color: theme.color.text, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}
                  >
                    {cut(x.label, fitBtn)}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
        {drawing ? null : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            <small>{!s.order.includes(me) ? "Not in this draft" : showPicks ? `${s.pool.length} left` : pages > 1 ? `Page ${page + 1} of ${pages}` : `${s.pool.length} left`}</small>
            <div style={{ display: "flex", gap: 8 }}>
              {!showPicks && pages > 1 ? (
                <Button kind="deemphasized" onClick={() => setLocal({ page: (page + 1) % pages })}>
                  More
                </Button>
              ) : null}
              <Button kind="secondary" onClick={() => setLocal({ tab: showPicks ? "pool" : "picks" })}>
                {showPicks ? "Pool" : "Picks"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
});
