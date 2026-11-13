import { defineApp, Avatar, Button, Canvas, CardHeader, clock, fitText, haptic, mix, pal, rng, running, tween, type Ctx, type DrawFrame } from "@muse/app";

// Word bomb: a drawn bomb with a lit fuse sits on one face in a ring, carrying three letters. The
// holder types a word with those letters before the fuse burns down and the bomb flies to the next
// face. Words on the group's list score double. Miss the fuse and it pops: a heart gone. Last one
// with hearts wins. Fuse lengths come from the server's seed, so everyone sees the same bomb.

type Params = {
  /** Card title */
  title: string;
  /** Letter chunks the bomb carries, in capitals: "ENE", "OL" */
  chunks: string[];
  /** Words that score double, e.g. the class's vocabulary */
  bonus: string[];
  /** Hearts each, 1 to 5 */
  hearts: number;
  /** Turns so far, in order: who held the bomb and the word they played, or popped: true */
  turns: { who: string; word?: string; popped?: boolean }[];
  /** Tries that didn't count, with who tried them: Tsai Lin's "gene" */
  tries: { who: string; word: string }[];
};

// @params
const P: Params = {
  title: "Word bomb",
  chunks: ["ENE", "OL", "AMI", "YNE", "ATE", "OX", "HYD", "ANE"],
  bonus: ["benzene", "ethanol", "alkene", "toluene", "amine", "alkyne", "hydroxyl", "propane", "methane", "phenol"],
  hearts: 3,
  turns: [
    { who: "Calvin", word: "serene" },
    { who: "Arun", word: "toluene" },
    { who: "Tsai Lin", word: "gene" },
    { who: "Will", popped: true },
    { who: "Maya", word: "scene" },
  ],
  tries: [{ who: "Tsai Lin", word: "gene" }],
};
// @end params

type Play = { u: string; word: string; chunk: string; pts: number };
type State = {
  title: string;
  chunks: string[];
  bonus: string[];
  max: number;
  order: string[];
  hearts: Record<string, number>;
  points: Record<string, number>;
  holder: string;
  from: string;
  chunk: string;
  fuseAt: number;
  fuseMs: number;
  passAt: number;
  plays: Play[];
  pops: string[];
  tries: { u: string; word: string; at: number }[];
};
type Action = { t: "word"; text: string } | { t: "light" } | { t: "boom" } | { t: "again" };
type Local = { draft: string };

const H = 206;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const word = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const alive = (s: State) => s.order.filter((u) => (s.hearts[u] ?? 0) > 0);
const over = (s: State) => s.order.length >= 2 && alive(s).length <= 1;
const lit = (s: State) => s.fuseAt > 0;
const burnt = (s: State, t: number) => lit(s) && t >= s.fuseAt + s.fuseMs;
const fly = tween({ duration: 520, easing: "move" });
const playable = (s: State, w: string) => w.length > s.chunk.length && w.includes(s.chunk.toLowerCase()) && !s.plays.some((p) => p.word === w);

function nextAfter(s: State, u: string, hearts: Record<string, number>): string {
  const i = s.order.indexOf(u);
  for (let k = 1; k <= s.order.length; k++) {
    const v = s.order[(i + k + s.order.length) % s.order.length]!;
    if ((hearts[v] ?? 0) > 0 && v !== u) return v;
  }
  return "";
}
const pickChunk = (s: State, seed: number) => rng(seed).pick(s.chunks.length > 1 ? s.chunks.filter((c) => c !== s.chunk) : s.chunks);
const fuseFor = (seed: number) => 8000 + rng(seed ^ 0x9e37).int(7000);

function initState(ctx: Ctx): State {
  const chunks = (Array.isArray(P.chunks) ? P.chunks : []).map((c) => word(clean(c, 4)).toUpperCase()).filter((c) => c.length >= 2).slice(0, 12);
  if (!chunks.length) chunks.push("ING", "ER", "ON");
  const bonus = (Array.isArray(P.bonus) ? P.bonus : []).map((b) => word(clean(b, 24))).filter(Boolean).slice(0, 40);
  const max = Number.isInteger(P.hearts) ? Math.max(1, Math.min(5, P.hearts)) : 3;
  const order = ctx.members.map((m) => m.id);
  const hearts: Record<string, number> = {};
  const points: Record<string, number> = {};
  for (const u of order) {
    hearts[u] = max;
    points[u] = 0;
  }
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n);
  };
  const plays: Play[] = [];
  const pops: string[] = [];
  let last = "";
  for (const t of Array.isArray(P.turns) ? P.turns : []) {
    const m = find(t?.who);
    if (!m) continue;
    if (t.popped) {
      if ((hearts[m.id] ?? 0) > 1) {
        hearts[m.id] = hearts[m.id]! - 1;
        pops.push(m.id);
        last = m.id;
      }
      continue;
    }
    const w = word(clean(t.word, 24));
    const chunk = chunks.find((c) => w.length > c.length && w.includes(c.toLowerCase()));
    if (!chunk || plays.some((p) => p.word === w)) continue;
    const pts = bonus.includes(w) ? 2 : 1;
    plays.push({ u: m.id, word: w, chunk, pts });
    points[m.id] = (points[m.id] ?? 0) + pts;
    last = m.id;
  }
  const base: State = { title: clean(P.title, 40) || "Word bomb", chunks, bonus, max, order, hearts, points, holder: "", from: "", chunk: chunks[0]!, fuseAt: 0, fuseMs: 0, passAt: 0, plays: plays.slice(-30), pops: pops.slice(-10), tries: [] };
  const holder = order.length ? (last ? nextAfter(base, last, hearts) : order[0]!) : "";
  const tries = (Array.isArray(P.tries) ? P.tries : []).map((t) => ({ m: find(t?.who), w: word(clean(t?.word, 24)) })).filter((t) => t.m && t.w).map((t) => ({ u: t.m!.id, word: t.w, at: 0 })).slice(-3);
  return { ...base, holder, from: last, tries };
}

function pass(s: State, hearts: Record<string, number>, meta: { time: number; seed: number }): State {
  const n = { ...s, hearts };
  const holder = nextAfter(n, s.holder, hearts);
  return { ...n, holder, from: s.holder, chunk: pickChunk(s, meta.seed), fuseAt: holder ? meta.time : 0, fuseMs: holder ? fuseFor(meta.seed) : 0, passAt: meta.time };
}

export default defineApp<State, Action, Local>({
  name: "Word bomb",
  summary: (s, ctx) => {
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    if (over(s)) return `Word bomb · ${name(alive(s)[0] ?? "")} survived`;
    return `Word bomb · ${s.chunk} · on ${name(s.holder)} · ${alive(s).length} still in`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "again") {
      if (!over(s)) return s;
      const hearts: Record<string, number> = {};
      const points: Record<string, number> = {};
      for (const v of s.order) {
        hearts[v] = s.max;
        points[v] = 0;
      }
      return { ...s, hearts, points, holder: s.order.includes(u) ? u : s.order[0]!, from: "", chunk: pickChunk(s, meta.seed), fuseAt: 0, fuseMs: 0, passAt: meta.time, plays: [], pops: [], tries: [] };
    }
    if (over(s) || !s.holder) return s;
    if (a.t === "light") {
      if (lit(s)) return s;
      return { ...s, fuseAt: meta.time, fuseMs: fuseFor(meta.seed) };
    }
    if (a.t === "boom") {
      if (!burnt(s, meta.time)) return s;
      const hearts = { ...s.hearts, [s.holder]: Math.max(0, (s.hearts[s.holder] ?? 0) - 1) };
      return { ...pass(s, hearts, meta), pops: [...s.pops, s.holder].slice(-10) };
    }
    if (a.t === "word") {
      if (u !== s.holder || burnt(s, meta.time) || typeof a.text !== "string") return s;
      const w = word(clean(a.text, 24));
      if (!w) return s;
      if (!playable(s, w)) return { ...s, tries: [...s.tries, { u, word: w, at: meta.time }].slice(-3) };
      const pts = s.bonus.includes(w) ? 2 : 1;
      const next = pass(s, s.hearts, meta);
      return { ...next, points: { ...s.points, [u]: (s.points[u] ?? 0) + pts }, plays: [...s.plays, { u, word: w, chunk: s.chunk, pts }].slice(-30) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = s.order.filter((u) => inChat(ctx, u));
    const joined = ctx.members.map((m) => m.id).filter((u) => !s.order.includes(u));
    if (here.length === s.order.length && !joined.length) return s;
    const order = [...here, ...joined];
    const hearts: Record<string, number> = {};
    const points: Record<string, number> = {};
    for (const u of order) {
      hearts[u] = s.order.includes(u) ? s.hearts[u] ?? s.max : s.max;
      points[u] = s.points[u] ?? 0;
    }
    const n: State = { ...s, order, hearts, points, plays: s.plays.filter((p) => order.includes(p.u)) };
    const sum = n.plays.reduce((k, p) => k + p.pts, 0);
    const fixed = Object.values(points).reduce((a, b) => a + b, 0) === sum ? points : Object.fromEntries(order.map((u) => [u, n.plays.filter((p) => p.u === u).reduce((k, p) => k + p.pts, 0)]));
    const m: State = { ...n, points: fixed };
    if (order.includes(s.holder) && (hearts[s.holder] ?? 0) > 0) return m;
    const holder = alive(m).length >= 2 || (order.length < 2 && alive(m).length) ? alive(m)[0]! : "";
    return { ...m, holder, from: "", fuseAt: 0, fuseMs: 0 };
  },

  invariants: {
    "hearts stay between none and full": (s) => s.order.every((u) => Number.isInteger(s.hearts[u]) && s.hearts[u]! >= 0 && s.hearts[u]! <= s.max),
    "the bomb sits on someone still in": (s) => s.holder === "" || (s.order.includes(s.holder) && (s.hearts[s.holder] ?? 0) > 0),
    "points add up to the words played": (s) => Object.values(s.points).reduce((a, b) => a + b, 0) === s.plays.reduce((a, p) => a + p.pts, 0) || s.plays.length === 30,
    "every word holds its letters, once": (s) => s.plays.every((p) => p.word.length > p.chunk.length && p.word.includes(p.chunk.toLowerCase()) && (p.pts === 1 || p.pts === 2)) && new Set(s.plays.map((p) => p.word)).size === s.plays.length,
    "double points only for the list": (s) => s.plays.every((p) => (p.pts === 2) === s.bonus.includes(p.word)),
    "a lit fuse burns 8 to 15 s": (s) => (s.fuseAt === 0 ? s.fuseMs === 0 : s.fuseMs >= 8000 && s.fuseMs < 15000),
    "the bomb carries one of the chunks": (s) => s.chunks.includes(s.chunk),
    "players are in the chat": (s, ctx) => s.order.every((u) => inChat(ctx, u)),
    "someone holds the bomb while two are in": (s) => alive(s).length < 2 || s.holder !== "",
  },

  transitions: {
    "after the last pop only a new game moves": (p, n, a) => !over(p) || a.t === "again" || p === n,
    "only the holder plays a word": (p, n, a, m) => a.t !== "word" || p === n || m.user === p.holder,
    "a good word passes the bomb on": (p, n, a, m) => a.t !== "word" || p === n || n.plays.length === p.plays.length ? true : n.holder !== m.user && n.from === m.user && n.chunk !== p.chunk || p.chunks.length < 2,
    "a word scores for its player": (p, n, a, m) => a.t !== "word" || n.plays.length === p.plays.length || (n.points[m.user] ?? 0) === (p.points[m.user] ?? 0) + n.plays[n.plays.length - 1]!.pts,
    "a pop takes one heart from the holder": (p, n, a, m) =>
      a.t !== "boom" || p === n || (burnt(p, m.time) && n.hearts[p.holder] === p.hearts[p.holder]! - 1 && p.order.every((u) => u === p.holder || n.hearts[u] === p.hearts[u])),
    "a bad try changes no hearts": (p, n, a) => a.t !== "word" || JSON.stringify(n.hearts) === JSON.stringify(p.hearts),
    "nothing lands after the fuse burns": (p, n, a, m) => a.t !== "word" || n.plays.length === p.plays.length || !burnt(p, m.time),
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (over(s)) return { t: "again" };
    const k = r.next();
    if (!lit(s) && k < 0.2) return { t: "light" };
    if (k < 0.3) return { t: "boom" };
    const c = s.chunk.toLowerCase();
    if (u !== s.holder) return r.next() < 0.5 ? { t: "boom" } : { t: "light" };
    return { t: "word", text: r.pick([`${c}x${"abcdefghij"[r.int(10)]}${"klmnopqrst"[r.int(10)]}`, `b${c}`, r.pick(s.bonus.length ? s.bonus : ["gene"]), "gene", `${c}s`, `pro${c}`]) };
  },

  local: { draft: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const done = over(state);
    const mine = state.holder === me && !done;
    const fuseLeft = lit(confirmed) ? Math.max(0, confirmed.fuseAt + confirmed.fuseMs - now) : 0;
    const popped = burnt(confirmed, now);
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const cx = W / 2;
    const cy = H / 2 + 4;
    const rx = Math.min(W / 2 - 34, 150);
    const ry = H / 2 - 30;
    const n = Math.max(1, state.order.length);
    const seat = (u: string) => {
      const i = Math.max(0, state.order.indexOf(u));
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
    };
    const lastPlay = state.plays[state.plays.length - 1];
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const t = f.now;
      // table
      g.fillStyle = mix(pl.green, c.card, theme.mode === "dark" ? 0.7 : 0.8);
      g.beginPath();
      g.ellipse(cx, cy, rx - 26, ry - 22, 0, 0, Math.PI * 2);
      g.fill();
      if (!state.holder) return false;
      const to = seat(state.holder);
      const from = confirmed.from && state.order.includes(confirmed.from) ? seat(confirmed.from) : to;
      const e = running(confirmed.passAt, 520);
      const q = e === null ? 1 : fly(e);
      const hx = cx + (to.x - cx) * 0.42;
      const hy = cy + (to.y - cy) * 0.3;
      const fx = cx + (from.x - cx) * 0.42;
      const fy = cy + (from.y - cy) * 0.3;
      const bx = fx + (hx - fx) * q;
      const by = fy + (hy - fy) * q - Math.sin(q * Math.PI) * 40;
      const R = 27;
      if (popped && !done) {
        // the pop
        const k = 1 + 0.05 * Math.sin(t / 60);
        g.fillStyle = pl.orange;
        g.beginPath();
        for (let i = 0; i < 24; i++) {
          const rr = (i % 2 ? 22 : 46) * k;
          const a = (i * Math.PI) / 12;
          g.lineTo(bx + rr * Math.cos(a), by + rr * Math.sin(a));
        }
        g.closePath();
        g.fill();
        g.fillStyle = pl.yellow;
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const rr = i % 2 ? 12 : 28;
          const a = (i * Math.PI) / 8 + 0.2;
          g.lineTo(bx + rr * Math.cos(a), by + rr * Math.sin(a));
        }
        g.closePath();
        g.fill();
        const pf = fitText("POP", 50, { g, size: 16, weight: 800 });
        g.font = pf.font;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = mix(pl.dark, c.text, 0.2);
        g.fillText(pf.text, bx, by + 1);
        return true;
      }
      // fuse: shorter as time runs out
      const frac = lit(confirmed) ? fuseLeft / confirmed.fuseMs : 1;
      const len = 10 + 34 * frac;
      g.strokeStyle = pl.brown;
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      const sx = bx + R * 0.6;
      const sy = by - R * 0.75;
      g.moveTo(sx, sy);
      const ex = sx + len * 0.7;
      const ey = sy - len * 0.7;
      g.quadraticCurveTo(sx + len * 0.6, sy - len * 0.1, ex, ey);
      g.stroke();
      // bomb body
      g.fillStyle = pl.dark;
      g.beginPath();
      g.arc(bx, by, R, 0, Math.PI * 2);
      g.fill();
      if (theme.mode === "dark") {
        g.strokeStyle = mix(c.text, c.card, 0.55);
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.beginPath();
      g.roundRect(sx - 7, sy - 4, 13, 9, 2);
      g.fill();
      g.fillStyle = mix(c.card, pl.dark, 0.35);
      g.beginPath();
      g.ellipse(bx - 11, by - 12, 6, 3.5, -0.7, 0, Math.PI * 2);
      g.fill();
      const lf = fitText(state.chunk, R * 1.6, { g, size: 18, weight: 800 });
      g.font = lf.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = theme.mode === "dark" ? c.text : c.card;
      g.fillText(lf.text, bx, by + 3);
      // sparks
      if (lit(confirmed)) {
        g.fillStyle = pl.yellow;
        g.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = t / 70 + i * 0.9;
          const rr = 3 + ((t / 40 + i * 13) % 9);
          g.moveTo(ex + rr * Math.cos(a), ey + rr * Math.sin(a));
          g.arc(ex + rr * Math.cos(a), ey + rr * Math.sin(a), 1.6, 0, Math.PI * 2);
        }
        g.fill();
        g.fillStyle = pl.orange;
        g.beginPath();
        g.arc(ex, ey, 4 + Math.sin(t / 50), 0, Math.PI * 2);
        g.fill();
      }
      return lit(confirmed) || e !== null;
    };

    const send = () => {
      const w = word(local.draft);
      if (!w) return;
      haptic(playable(state, w) ? "success" : "medium");
      setLocal({ draft: "" });
      dispatch({ t: "word", text: w });
    };

    const latestTry = state.tries[state.tries.length - 1];
    const tryRecent = latestTry && (latestTry.at === 0 || running(latestTry.at, 2500) !== null);
    const line = done
      ? `${nameOf(alive(state)[0] ?? "")} ${alive(state)[0] === me ? "survive" : "survives"} · ${state.plays.length} words`
      : popped
        ? `Popped on ${nameOf(state.holder)} · a heart gone`
        : mine
          ? lit(confirmed)
            ? `${Math.ceil(fuseLeft / 1000)} s · a word with ${state.chunk}`
            : `It's on you · a word with ${state.chunk}`
          : `${nameOf(state.holder)} has it${lit(confirmed) ? ` · ${Math.ceil(fuseLeft / 1000)} s` : ""}`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.max} ${state.max === 1 ? "heart" : "hearts"} each · list words score double`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Bomb with ${state.chunk} on ${nameOf(state.holder)}, ${alive(state).length} still in`} draw={draw} />
          {state.order.map((u) => {
            const p = seat(u);
            const h = state.hearts[u] ?? 0;
            const out = h === 0;
            return (
              <div key={u} style={{ position: "absolute", left: p.x - 24, top: p.y - 22, width: 48, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
                <span style={{ display: "flex", borderRadius: 99, boxShadow: u === state.holder && !done ? `0 0 0 3px ${c.negative}` : u === me ? `0 0 0 2px ${c.primary}` : "none", filter: out ? "grayscale(1)" : "none" }}>
                  <Avatar user={u} size={30} />
                </span>
                <svg width={state.max * 11} height="10" viewBox={`0 0 ${state.max * 11} 10`} aria-label={`${h} of ${state.max} hearts`} role="img" style={{ marginTop: 2 }}>
                  {Array.from({ length: state.max }, (_, i) => (
                    <path key={i} d={`M${i * 11 + 5} 9 L${i * 11 + 1} 5 A2.4 2.4 0 0 1 ${i * 11 + 5} 2.2 A2.4 2.4 0 0 1 ${i * 11 + 9} 5 Z`} fill={i < h ? pl.red : c.divider} />
                  ))}
                </svg>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: popped && !done ? c.negative : c.text, ...ell }}>{line}</div>
        <div style={{ marginTop: 6, display: "flex", gap: 6, height: 22, overflow: "hidden" }}>
          {tryRecent && latestTry && !done ? (
            <div style={{ flex: "0 1 auto", minWidth: 0, padding: "2px 10px", borderRadius: 99, background: c.wash, color: c.text, fontSize: 12, lineHeight: "18px", pointerEvents: "none", ...ell }}>
              <s>{latestTry.word}</s>
              {` · ${nameOf(latestTry.u)}${state.plays.some((p) => p.word === latestTry.word) ? ", already said" : ""}`}
            </div>
          ) : null}
          {lastPlay && !popped ? (
            <div style={{ flex: "0 1 auto", minWidth: 0, padding: "2px 10px", borderRadius: 99, background: lastPlay.pts === 2 ? mix(c.positive, c.card, 0.8) : c.wash, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none", ...ell }}>
              {`${nameOf(lastPlay.u)}: ${lastPlay.word}${lastPlay.pts === 2 ? " · double" : ""}`}
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {done ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
                {Object.entries(state.points).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, p]) => `${nameOf(u)} ${p}`).join(" · ")}
              </span>
              <Button kind="primary" onClick={() => dispatch({ t: "again" })}>
                New game
              </Button>
            </>
          ) : popped ? (
            <>
              <span style={{ flex: 1 }} />
              <Button kind="primary" onClick={() => dispatch({ t: "boom" })}>
                Pass it on
              </Button>
            </>
          ) : mine ? (
            <>
              <input
                aria-label={`A word with ${state.chunk}`}
                placeholder={`A word with ${state.chunk}`}
                value={local.draft}
                maxLength={24}
                style={{ flex: 1, minWidth: 0, height: 44, boxSizing: "border-box" }}
                onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") send();
                }}
              />
              <Button kind="primary" disabled={!word(local.draft)} onClick={send}>
                Throw
              </Button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{`Next up: ${nameOf(nextAfter(state, state.holder, state.hearts))}`}</span>
              {!lit(confirmed) ? (
                <Button kind="primary" onClick={() => dispatch({ t: "light" })}>
                  Light it
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  },
});
