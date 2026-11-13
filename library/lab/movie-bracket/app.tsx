import {
  defineApp,
  Burst,
  Button,
  CardHeader,
  Facepile,
  Progress,
  circle,
  ellipse,
  line,
  mix,
  pal,
  path,
  rect,
  rng,
  running,
  seedOf,
  tween,
  type Ctx,
  type Theme,
} from "@muse/app";

// Movie night bracket: the movies people mentioned are seeded into a bracket. The chat votes each
// matchup like a poll (a majority closes it, a tie flips a coin) and the champion becomes the plan.

type Params = {
  when: string;
  where: string;
  movies: { title: string; by: string; quote: string }[];
  picks: { name: string; side: number }[];
};

// @params
const P: Params = {
  when: "Fri 9 PM",
  where: "Theo's projector",
  movies: [
    { title: "Dune: Part Two", by: "Theo", quote: "needs the big screen" },
    { title: "Paddington 2", by: "Dani", quote: "a perfect film, fight me" },
    { title: "Past Lives", by: "Theo", quote: "bring tissues" },
    { title: "Shrek 2", by: "Marcus", quote: "holding out for a hero" },
    { title: "Interstellar", by: "Theo", quote: "the docking scene" },
    { title: "Mean Girls", by: "Dani", quote: "it's october 3rd energy" },
    { title: "Spider-Verse", by: "Marcus", quote: "the animation tho" },
    { title: "The Notebook", by: "Dani", quote: "ironically. mostly." },
  ],
  picks: [
    { name: "Marcus", side: 0 },
    { name: "Theo", side: 0 },
    { name: "Dani", side: 1 },
  ],
};
// @end params

type Movie = { id: string; title: string; by: string; quote: string };
/** winner: index into movies, null while open. at: meta.time it closed, 0 while open. tie: closed by a coin flip. */
type Match = { votes: { user: string; side: 0 | 1 }[]; winner: number | null; at: number; tie: boolean };
/** matches: size - 1 entries once started (size 4 or 8), [] while movies < 4. going: who's in for the champion. */
type State = { when: string; where: string; movies: Movie[]; matches: Match[]; going: string[] };
type Action = { t: "vote"; side: 0 | 1 } | { t: "close" } | { t: "add"; title: string } | { t: "in" };
type Local = { draft: string };

const REVEAL_MS = 1600;
const MAX_MOVIES = 8;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/!/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");

const size = (s: State) => (s.movies.length >= 8 ? 8 : s.movies.length >= 4 ? 4 : 0);
const cur = (s: State) => s.matches.findIndex((m) => m.winner === null);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const blank = (): Match => ({ votes: [], winner: null, at: 0, tie: false });
const fresh = (n: number): Match[] => Array.from({ length: n === 0 ? 0 : n - 1 }, blank);

/** The two movie indexes in match k, or null while an earlier match is still open. */
function entrants(s: State, k: number): [number, number] | null {
  const h = Math.floor(size(s) / 2);
  if (h === 0 || k < 0 || k >= s.matches.length) return null;
  if (k < h) return [2 * k, 2 * k + 1];
  const a = s.matches[2 * (k - h)]?.winner ?? null;
  const b = s.matches[2 * (k - h) + 1]?.winner ?? null;
  return a == null || b == null ? null : [a, b];
}
const count = (m: Match, side: number) => m.votes.filter((v) => v.side === side).length;

/** Close match k with the larger side; equal sides flip a coin. */
function closeMatch(s: State, k: number, seed: number, time: number): State {
  const e = entrants(s, k);
  if (!e) return s;
  const m = s.matches[k]!;
  const c0 = count(m, 0);
  const c1 = count(m, 1);
  const tie = c0 === c1;
  const side = tie ? rng(seed).int(2) : c0 > c1 ? 0 : 1;
  const done: Match = { ...m, winner: e[side]!, at: time, tie };
  return { ...s, matches: s.matches.map((x, i) => (i === k ? done : x)) };
}

// ---- Poster art ----

function poster(title: string, w: number, h: number, t: Theme, radius: number) {
  const p = pal(t);
  const motif = seedOf(title) % 8;
  const A = [p.orange, p.blue, p.purple, p.leaf, p.dark, mix(p.red, p.paper, 0.5), p.red, p.sky][motif]!;
  const B = [p.brown, p.sky, p.dark, p.green, p.dark, p.red, p.blue, p.dark][motif]!;
  const art: unknown[] = [rect(0, 0, 44, 29, 0, A), rect(0, 29, 44, 29, 0, B), rect(0, 22, 44, 14, 0, mix(A, B, 0.5))];
  if (motif === 0) {
    art.push(
      circle(30, 18, 9, p.cream),
      path("M0 32 Q11 27 22 32 T44 32 V58 H0 Z", p.orange),
      path("M0 40 Q11 35 22 40 T44 40 V58 H0 Z", p.brown),
      path("M0 48 Q11 43 22 48 T44 48 V58 H0 Z", p.dark),
    );
  } else if (motif === 1) {
    art.push(
      circle(13, 30, 3.5, p.brown),
      circle(31, 30, 3.5, p.brown),
      circle(22, 36, 10, p.brown),
      circle(22, 40, 4, p.cream),
      rect(14.5, 22, 15, 7, 3, p.red),
      rect(10, 28.5, 24, 2.5, 1, p.red),
    );
  } else if (motif === 2) {
    art.push(
      circle(22, 12, 6, p.cream, { opacity: 0.8 }),
      circle(13, 34, 3, p.dark),
      circle(31, 34, 3, p.dark),
      path("M8 37 H18 L19 52 H7 Z", p.dark),
      path("M26 37 H36 L37 52 H25 Z", p.dark),
    );
  } else if (motif === 3) {
    art.push(
      path("M10.5 28 L3 22 L12 22 Z", p.green),
      path("M33.5 28 L41 22 L32 22 Z", p.green),
      circle(22, 32, 12, p.green),
      circle(17.5, 29, 2, p.paper),
      circle(26.5, 29, 2, p.paper),
    );
  } else if (motif === 4) {
    for (const [x, y] of [[6, 8], [14, 18], [36, 10], [40, 22], [9, 44], [38, 48]] as const) art.push(circle(x, y, 0.8, p.paper));
    art.push(
      path("M4 29 a18 4.5 0 1 0 36 0 a18 4.5 0 1 0 -36 0", "none", { stroke: p.orange, "stroke-width": 3 }),
      circle(22, 29, 9, p.yellow),
      circle(22, 29, 7.5, p.dark),
    );
  } else if (motif === 5) {
    art.push(rect(11, 17, 22, 28, 2, p.paper), rect(11, 17, 3, 28, 0, p.red), circle(20, 29, 3, p.red), circle(26, 29, 3, p.red), path("M17.2 30.6 L28.8 30.6 L23 37 Z", p.red));
  } else if (motif === 6) {
    art.push(path("M0 0 H18 L0 18 Z", p.red));
    const hub = [24, 27] as const;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      art.push(line(hub[0], hub[1], +(hub[0] + Math.cos(a) * 30).toFixed(2), +(hub[1] + Math.sin(a) * 30).toFixed(2), mix(p.paper, A, 0.4), 0.8));
    }
    for (const r of [6, 12, 18, 24]) {
      const pts = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return `${(hub[0] + Math.cos(a) * r).toFixed(2)} ${(hub[1] + Math.sin(a) * r).toFixed(2)}`;
      });
      art.push(path(`M${pts.join(" L")} Z`, "none", { stroke: p.paper, "stroke-width": 0.8, "stroke-opacity": 0.6 }));
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const x = 2 + i * 3;
      const y = (i * 11) % 30;
      art.push(path(`M${x} ${y} L${x - 2} ${y + 6}`, "none", { stroke: p.paper, "stroke-width": 0.8, "stroke-opacity": 0.45 }));
    }
    art.push(rect(0, 38, 44, 20, 0, p.shade), path("M10 38 L34 38 L29 45 L15 45 Z", p.dark));
  }
  return (
    <svg viewBox="0 0 44 58" width={w} height={h} aria-hidden="true" style={{ display: "block", borderRadius: radius, flex: "none" }}>
      {art as never}
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Movie night bracket",
  summary: (s) => {
    const n = size(s);
    if (n === 0) return `Movie night: ${s.movies.length} of 4 movies`;
    const k = cur(s);
    if (k < 0) {
      const w = s.matches[s.matches.length - 1]!.winner!;
      return `Movie night: ${s.movies[w]!.title} won · ${s.going.length} in`;
    }
    const e = entrants(s, k)!;
    return `Movie night: match ${k + 1} of ${n - 1}, ${s.movies[e[0]]!.title} vs ${s.movies[e[1]]!.title}`;
  },

  init: (ctx) => {
    const movies: Movie[] = [];
    for (const m of P.movies) {
      const title = clean(m.title, 40);
      if (title && movies.length < MAX_MOVIES) movies.push({ id: `m${movies.length}`, title, by: clean(m.by, 20), quote: clean(m.quote, 48) });
    }
    const s: State = { when: clean(P.when, 24), where: clean(P.where, 40), movies, matches: [], going: [] };
    const n = size(s);
    const matches = fresh(n);
    if (n > 0) {
      const seen = new Set<string>();
      const votes: Match["votes"] = [];
      for (const pick of P.picks) {
        const want = pick.name.trim().toLowerCase();
        const mem = ctx.members.find((m) => m.id === pick.name || m.name.toLowerCase() === want);
        if (!mem || seen.has(mem.id) || (pick.side !== 0 && pick.side !== 1)) continue;
        seen.add(mem.id);
        votes.push({ user: mem.id, side: pick.side });
      }
      matches[0] = { ...matches[0]!, votes };
    }
    return { ...s, matches };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const M = ctx.members.length;
    const n = size(s);
    const k = cur(s);
    if (a.t === "vote") {
      if (n === 0 || k < 0 || (a.side !== 0 && a.side !== 1)) return s;
      const m = s.matches[k]!;
      const had = m.votes.find((v) => v.user === meta.user);
      const votes = had && had.side === a.side ? m.votes.filter((v) => v.user !== meta.user) : [...m.votes.filter((v) => v.user !== meta.user), { user: meta.user, side: a.side }];
      const next: State = { ...s, matches: s.matches.map((x, i) => (i === k ? { ...x, votes } : x)) };
      const nm = next.matches[k]!;
      const c0 = count(nm, 0);
      const c1 = count(nm, 1);
      if (c0 * 2 > M || c1 * 2 > M) return closeMatch(next, k, meta.seed, meta.time);
      if (ctx.members.every((x) => votes.some((v) => v.user === x.id)) && c0 === c1) return closeMatch(next, k, meta.seed, meta.time);
      return next;
    }
    if (a.t === "close") {
      if (k < 0 || s.matches[k]!.votes.length === 0) return s;
      return closeMatch(s, k, meta.seed, meta.time);
    }
    if (a.t === "add") {
      if (typeof a.title !== "string") return s;
      const title = a.title.trim();
      if (title.length < 1 || title.length > 40 || s.movies.length >= MAX_MOVIES) return s;
      if (s.matches.some((m) => m.votes.length > 0 || m.winner !== null)) return s;
      if (s.movies.some((m) => m.title.toLowerCase() === title.toLowerCase())) return s;
      const me = ctx.members.find((m) => m.id === meta.user);
      const movies = [...s.movies, { id: `m${meta.seq}`, title, by: clean(me?.name ?? "", 20), quote: "" }];
      return { ...s, movies, matches: fresh(size({ ...s, movies })) };
    }
    if (a.t === "in") {
      if (n === 0 || k >= 0) return s;
      return { ...s, going: s.going.includes(meta.user) ? s.going.filter((u) => u !== meta.user) : [...s.going, meta.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const k = cur(s);
    const openVotes = k >= 0 ? s.matches[k]!.votes : [];
    if (openVotes.every((v) => here(v.user)) && s.going.every(here)) return s;
    return {
      ...s,
      matches: s.matches.map((m, i) => (i === k ? { ...m, votes: m.votes.filter((v) => here(v.user)) } : m)),
      going: s.going.filter(here),
    };
  },

  invariants: {
    "the bracket has one match per pairing": (s) => s.matches.length === (size(s) === 0 ? 0 : size(s) - 1),
    "winners come from their own matchup": (s) =>
      s.matches.every((m, k) => {
        if (m.winner === null) return true;
        const e = entrants(s, k);
        return !!e && (m.winner === e[0] || m.winner === e[1]);
      }),
    "rounds close in order": (s) => {
      const c = cur(s);
      return s.matches.every((m, i) => (c < 0 ? m.winner !== null : (i < c) === (m.winner !== null)));
    },
    "one vote per person per match": (s) => s.matches.every((m) => new Set(m.votes.map((v) => v.user)).size === m.votes.length && m.votes.every((v) => v.side === 0 || v.side === 1)),
    "closed exactly when timed": (s) => s.matches.every((m) => (m.winner === null) === (m.at === 0) && (!m.tie || m.winner !== null)),
    "a tie flip only on a real tie": (s) => s.matches.every((m) => !m.tie || count(m, 0) === count(m, 1)),
    "a closed match went to the side with more votes": (s) =>
      s.matches.every((m, k) => {
        if (m.winner === null || m.tie) return true;
        const e = entrants(s, k);
        if (!e) return false;
        const side = m.winner === e[0] ? 0 : 1;
        return count(m, side) > count(m, 1 - side);
      }),
    "only finishers say they're in": (s) => (s.going.length === 0 || cur(s) === -1) && new Set(s.going).size === s.going.length,
    "open votes are from the chat": (s, ctx) => {
      const k = cur(s);
      return k < 0 || s.matches[k]!.votes.every((v) => inChat(ctx, v.user));
    },
  },

  transitions: {
    "a vote changes only the actor's vote in the open match": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const k = cur(p);
      if (k < 0) return false;
      const rest = (x: State) => JSON.stringify([x.when, x.where, x.movies, x.going, x.matches.filter((_, i) => i !== k)]);
      const others = (x: State) => JSON.stringify(x.matches[k]!.votes.filter((v) => v.user !== m.user));
      const was = p.matches[k]!.votes.find((v) => v.user === m.user)?.side;
      const now = n.matches[k]!.votes.find((v) => v.user === m.user)?.side;
      return rest(p) === rest(n) && others(p) === others(n) && now === (was === a.side ? undefined : a.side);
    },
    "a vote that makes a majority closes the match": (p, n, a, _m, ctx) => {
      if (a.t !== "vote" || p === n) return true;
      const k = cur(p);
      return k < 0 || !(count(n.matches[k]!, a.side) > ctx.members.length / 2) || n.matches[k]!.winner !== null;
    },
    "closing stamps the time": (p, n, _a, m) => p.matches.every((x, k) => x.winner !== null || n.matches[k]!.winner === null || n.matches[k]!.at === m.time),
    "closed matches never change": (p, n) => p.matches.every((x, k) => x.winner === null || JSON.stringify(x) === JSON.stringify(n.matches[k])),
    "adding only before any vote": (p, n, a) => a.t !== "add" || p === n || (p.matches.every((x) => x.votes.length === 0 && x.winner === null) && n.movies.length === p.movies.length + 1),
    "in toggles only the actor": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const diff = [...p.going.filter((u) => !n.going.includes(u)), ...n.going.filter((u) => !p.going.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
  },

  arbitrary: (s, _u, r) => {
    const n = size(s);
    if (n === 0) return { t: "add", title: `${r.pick(["Barbie", "Up", "Heat", "Coco", "Alien"])} ${r.int(99)}` };
    const k = cur(s);
    if (k < 0) return { t: "in" };
    const x = r.next();
    if (x < 0.75) return { t: "vote", side: r.int(2) as 0 | 1 };
    if (x < 0.9) return { t: "close" };
    return { t: "add", title: `Heat ${r.int(99)}` };
  },

  local: { draft: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const M = Math.max(1, members.length);
    const n = size(state);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    void nameOf;
    const cn = size(confirmed);
    const cc = cur(confirmed);
    const lastClosed = cn === 0 ? -1 : cc < 0 ? confirmed.matches.length - 1 : cc - 1;
    const reveal = lastClosed >= 0 && running(confirmed.matches[lastClosed]!.at, REVEAL_MS) !== null;
    const shown = reveal ? lastClosed : cc;
    const done = cn > 0 && cc < 0 && !reveal;
    const going = confirmed.going.length;

    const add = () => {
      const t = local.draft.trim();
      if (!t) return;
      dispatch({ t: "add", title: t });
      setLocal({ draft: "" });
    };

    const subtitle = n === 0 ? (state.movies.length === 0 ? "Add 4 movies to start" : `${4 - state.movies.length} more to start`) : done ? `Champion picked · ${going} in` : `Match ${shown + 1} of ${cn - 1} · from this week's chat`;
    const header = <CardHeader title="Movie night bracket" subtitle={subtitle} />;

    // ---- Empty: fewer than four movies ----
    if (n === 0) {
      return (
        <div>
          {header}
          <div style={{ marginTop: 6 }}>
            {state.movies.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, height: 44 }}>
                {poster(m.title, 28, 36, theme, 4)}
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
              </div>
            ))}
          </div>
          <form
            style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input value={local.draft} placeholder="Add a movie" aria-label="Add a movie" maxLength={40} onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="primary" disabled={!local.draft.trim()} onClick={add}>
              Add
            </Button>
          </form>
        </div>
      );
    }

    const tabs = cn === 8 ? ["Quarterfinals", "Semifinals", "Final"] : ["Semifinals", "Final"];
    const h = cn / 2;
    const round = done ? tabs.length - 1 : shown < h ? 0 : shown < h + h / 2 ? 1 : tabs.length - 1;
    const tabRow = (
      <div style={{ display: "flex", gap: 18, height: 30, alignItems: "flex-end", borderBottom: `1px solid ${c.divider}`, marginTop: 4 }}>
        {tabs.map((t, i) => (
          <span
            key={t}
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: "20px",
              padding: "0 0 4px",
              marginBottom: -1,
              color: i === round ? c.link : c.secondaryText,
              borderBottom: `2px solid ${i === round ? c.primary : "transparent"}`,
            }}
          >
            {t}
          </span>
        ))}
      </div>
    );

    const moved = confirmed.matches.filter((m) => m.winner !== null).map((m) => confirmed.movies[m.winner!]!.title.slice(0, 14));
    const footer = (
      <small style={{ display: "block", height: 26, lineHeight: "26px", fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {done ? (/fri/i.test(confirmed.when) ? "Bracket's done · see you Friday" : "Bracket's done") : moved.length === 0 ? "Majority wins · ties flip a coin" : `Moved on: ${moved.slice(-2).join(" · ")}`}
      </small>
    );

    // ---- Champion ----
    if (done) {
      const lastAt = confirmed.matches[confirmed.matches.length - 1]!.at;
      const champ = confirmed.movies[confirmed.matches[confirmed.matches.length - 1]!.winner!]!;
      const imIn = confirmed.going.includes(me);
      return (
        <div>
          {header}
          {tabRow}
          <div style={{ display: "flex", gap: 12, padding: "12px 0 0", alignItems: "stretch" }}>
            {poster(champ.title, 88, 116, theme, 8)}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.negative }}>{confirmed.when}</span>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: "24px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{champ.title}</span>
              <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{confirmed.where}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                {going > 0 ? <Facepile users={confirmed.going} size={20} max={3} /> : null}
                <span style={{ fontSize: 13, color: c.secondaryText }}>{`${going} in`}</span>
              </div>
              <div style={{ marginTop: "auto" }}>
                <Button kind={imIn ? "deemphasized" : "primary"} onClick={() => dispatch({ t: "in" })}>
                  {imIn ? "Going" : "I'm in"}
                </Button>
              </div>
            </div>
          </div>
          {running(lastAt, 2400) !== null ? <Burst key={lastAt} emoji="🍿" /> : null}
          {footer}
        </div>
      );
    }

    // ---- Matchup ----
    const e = entrants(confirmed, shown)!;
    const open = reveal ? confirmed.matches[shown]! : (state.matches[shown] ?? confirmed.matches[shown]!);
    const myVote = open.votes.find((v) => v.user === me)?.side;
    const rev = reveal ? confirmed.matches[shown]! : null;
    const winSide = rev ? (rev.winner === e[0] ? 0 : 1) : -1;
    const el = rev ? running(rev.at, REVEAL_MS) : null;
    const lose = tween({ duration: 400, easing: "decelerate" })(Math.min(1, (el ?? 0) / 400));
    const prevAt = shown > 0 ? confirmed.matches[shown - 1]!.at : 0;
    const ein = !reveal && prevAt ? running(prevAt + REVEAL_MS, 450) : null;
    const slide = ein === null ? 1 : tween({ duration: 450, easing: "decelerate" })(ein / 450);
    const faces = theme.width < 360 ? 2 : 3;

    const row = (side: 0 | 1) => {
      const mv = confirmed.movies[e[side]]!;
      const voters = open.votes.filter((v) => v.side === side).map((v) => v.user);
      const won = winSide === side;
      const lost = rev !== null && !won;
      const mine = myVote === side;
      const long = mv.title.length > 11;
      const outvoted = won && myVote !== undefined && myVote !== side;
      const result = won ? (rev!.tie ? "Moves on · coin flip" : myVote !== undefined && myVote !== winSide ? "Moves on · you got outvoted" : "Moves on") : null;
      void outvoted;
      return (
        <button
          key={mv.id}
          aria-pressed={mine}
          aria-label={`Vote ${mv.title}, ${voters.length} ${voters.length === 1 ? "vote" : "votes"}`}
          disabled={rev !== null}
          onClick={() => dispatch({ t: "vote", side })}
          style={{
            display: "grid",
            gridTemplateColumns: "28px 44px 1fr",
            alignItems: "center",
            width: "100%",
            height: 70,
            marginBottom: 4,
            padding: 0,
            border: "none",
            borderRadius: 10,
            font: "inherit",
            color: c.text,
            textAlign: "left",
            cursor: rev ? "default" : "pointer",
            background: won ? c.selected : "transparent",
            transition: "background 200ms",
            opacity: lost ? 1 - 0.5 * lose : 1,
            transform: lost ? `translateY(${6 * lose}px)` : ein !== null ? `translateX(${(side === 0 ? -40 : 40) * (1 - slide)}px)` : undefined,
          }}
        >
          <span style={{ width: 18, height: 18, marginLeft: 5, borderRadius: 9, boxSizing: "border-box", display: "grid", placeItems: "center", background: mine ? c.primary : "transparent", border: mine ? "none" : `1.5px solid ${c.divider}` }}>
            {mine ? (
              <svg width={10} height={10} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                {path("M2.5 6.2 L5 8.7 L9.5 3.5", "none", { stroke: c.onPrimary, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" })}
              </svg>
            ) : null}
          </span>
          <span style={{ marginLeft: 4 }}>{poster(mv.title, 44, 58, theme, 4)}</span>
          <span style={{ position: "relative", display: "block", height: 70, marginLeft: 12, marginRight: 8 }}>
            <span style={long ? { position: "absolute", left: 0, right: 84, top: 3, fontSize: 14, fontWeight: 600, lineHeight: "17px", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", overflowWrap: "anywhere" } : { position: "absolute", left: 0, right: 84, top: 10, fontSize: 15, fontWeight: 600, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mv.title}</span>
            <span style={{ position: "absolute", right: 0, top: 10, height: 20, display: "flex", alignItems: "center", gap: 8 }}>
              {voters.length > 0 ? <Facepile users={voters} size={20} max={faces} /> : null}
              <span style={{ fontSize: 13, fontWeight: 600, color: c.secondaryText, minWidth: 8, textAlign: "right" }}>{voters.length}</span>
            </span>
            <span style={{ position: "absolute", left: 0, right: 0, top: long ? 38 : 31, fontSize: 13, lineHeight: "16px", color: result ? c.link : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {result ?? (mv.quote ? `${mv.by}: “${mv.quote}”` : `${mv.by}'s pick`)}
            </span>
            <span style={{ position: "absolute", left: 0, right: 0, top: long ? 58 : 51 }}>
              <Progress value={voters.length} max={M} />
            </span>
          </span>
        </button>
      );
    };

    return (
      <div>
        {header}
        {tabRow}
        <div style={{ marginTop: 6 }}>{[row(0), row(1)]}</div>
        {reveal ? (
          <div role="status" style={{ height: 44, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600, background: c.secondaryButton, color: c.secondaryButtonText }}>
            Counting votes
          </div>
        ) : open.votes.length > 0 ? (
          <Button kind="secondary" wide onClick={() => dispatch({ t: "close" })}>
            Close match
          </Button>
        ) : null}
        {footer}
      </div>
    );
  },
});
