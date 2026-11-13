import { defineApp, Avatar, Burst, Button, Canvas, CardHeader, clock, haptic, mix, pal, running, tween, type Ctx, type DrawFrame } from "@muse/app";

// Doodle dash: one person draws a prompt pulled from the chat in 20 seconds on a little sketchbook
// page while the sand runs; everyone else types guesses that pop up as bubbles over the page. The
// fastest right guess scores 2 and the artist 1. Each finished page goes into the gallery strip.

type Params = {
  /** Card title */
  title: string;
  /** Up to 6 rounds: what to draw, the word that counts as a right guess, and who draws it */
  rounds: { prompt: string; answer: string; drawer: string }[];
  /** Finished pages so far, in order: strokes in thousandths of the page, and who guessed it */
  gallery: { strokes: number[][]; winner?: string }[];
  /** The page being drawn now: strokes so far and guesses already in */
  live: { strokes: number[][]; guesses: { who: string; text: string }[] };
};

// @params
const P: Params = {
  title: "Doodle dash",
  rounds: [
    { prompt: "Arun's rice cooker", answer: "rice cooker", drawer: "Maya" },
    { prompt: "Calvin's seventh alarm", answer: "alarm", drawer: "Arun" },
    { prompt: "the Sube in the snow", answer: "sube", drawer: "Will" },
    { prompt: "Tsai Lin guarding the aux", answer: "aux", drawer: "Calvin" },
    { prompt: "Maya's color-coded spreadsheet", answer: "spreadsheet", drawer: "Aditya" },
    { prompt: "a 25-minute shower", answer: "shower", drawer: "Tsai Lin" },
  ],
  gallery: [
    {
      strokes: [[300,380,300,760,340,820,660,820,700,760,700,380,300,380],[280,380,330,290,670,290,720,380],[470,290,480,240,520,240,530,290],[536,600,532,630,522,655,508,668,492,668,478,655,468,630,464,600,468,570,478,545,492,532,508,532,522,545,532,570,536,600],[440,230,470,160,430,100,460,40],[560,230,590,160,550,100,580,40]],
      winner: "Calvin",
    },
    {
      strokes: [[644,560,635,656,610,740,572,802,525,836,475,836,428,802,390,740,365,656,356,560,365,464,390,380,428,318,475,284,525,284,572,318,610,380,635,464,644,560],[500,560,500,380],[500,560,600,620],[284,260,287,226,297,196,312,177,330,170,348,177,363,196,373,226,376,260],[624,260,627,226,637,196,652,177,670,170,688,177,703,196,713,226,716,260],[380,850,340,920],[620,850,660,920],[140,300,90,240],[860,300,910,240],[120,560,50,560],[880,560,950,560]],
      winner: "Maya",
    },
  ],
  live: {
    strokes: [[180,640,180,540,290,515,370,410,640,410,730,510,820,535,820,640,750,640],[600,640,410,640],[260,640,180,640],[400,500,450,435,610,435,660,500,400,500],[530,435,530,500],[374,645,370,678,359,704,344,718,326,718,311,704,300,678,296,645,300,612,311,586,326,572,344,572,359,586,370,612,374,645],[714,645,710,678,699,704,684,718,666,718,651,704,640,678,636,645,640,612,651,586,666,572,684,572,699,586,710,612,714,645],[390,360,640,360],[420,360,420,405],[610,360,610,405],[370,395,420,375,470,392,520,372,580,390,640,395],[40,760,150,735,260,770,400,740,520,765,660,738,800,768,960,742],[90,160,110,200],[110,160,90,200],[850,180,870,220],[870,180,850,220],[200,300,215,335],[215,300,200,335],[920,400,940,440],[940,400,920,440]],
    guesses: [
      { who: "Calvin", text: "a loaf of bread??" },
      { who: "Maya", text: "fridge on wheels" },
      { who: "Arun", text: "my rice cooker on a trip" },
    ],
  },
};
// @end params

type Round = { prompt: string; answer: string; drawer: string };
type Guess = { u: string; name: string; text: string; at: number; right: boolean };
type Page = { prompt: string; drawer: string; strokes: number[][]; winner: string };
type State = {
  title: string;
  rounds: Round[];
  round: number;
  drawer: string;
  strokes: number[][];
  startAt: number;
  guesses: Guess[];
  gallery: Page[];
  scores: Record<string, number>;
};
type Action = { t: "stroke"; pts: number[] } | { t: "undo" } | { t: "guess"; text: string } | { t: "next" };
type Local = { pts: number[]; draft: string; bursts: number };

const DRAW_MS = 20000;
const PAGE_H = 178;
const MAX_STROKES = 24;
const MAX_PTS = 64;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okStroke = (p: unknown): p is number[] =>
  Array.isArray(p) && p.length >= 4 && p.length <= MAX_PTS && p.length % 2 === 0 && p.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 999);
const solved = (s: State) => s.guesses.some((g) => g.right);
const finished = (s: State) => s.round >= s.rounds.length;
const timeUp = (s: State, now: number) => s.startAt !== 0 && now >= s.startAt + DRAW_MS;
const pop = tween({ duration: 320, easing: [0.34, 1.56, 0.64, 1] });

function find(ctx: Ctx, who: unknown) {
  const n = clean(who, 40).toLowerCase();
  return n ? ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n) : undefined;
}
function drawerFor(rounds: Round[], r: number, ctx: Ctx): string {
  const named = rounds[r] ? find(ctx, rounds[r]!.drawer) : undefined;
  if (named) return named.id;
  return ctx.members.length ? ctx.members[r % ctx.members.length]!.id : "";
}

function initState(ctx: Ctx): State {
  const rounds: Round[] = [];
  for (const r of Array.isArray(P.rounds) ? P.rounds : []) {
    const prompt = clean(r?.prompt, 40);
    const answer = clean(r?.answer, 24);
    if (prompt && norm(answer) && rounds.length < 6) rounds.push({ prompt, answer, drawer: clean(r.drawer, 24) });
  }
  if (!rounds.length) rounds.push({ prompt: "a cat in a hat", answer: "cat", drawer: "" });
  const scores: Record<string, number> = {};
  const gallery: Page[] = [];
  for (const g of Array.isArray(P.gallery) ? P.gallery : []) {
    if (gallery.length >= rounds.length - 1) break;
    const i = gallery.length;
    const strokes = (Array.isArray(g?.strokes) ? g.strokes : []).filter(okStroke).slice(0, MAX_STROKES);
    const drawer = drawerFor(rounds, i, ctx);
    const w = find(ctx, g.winner);
    const winner = w && w.id !== drawer ? w.id : "";
    if (winner) {
      scores[winner] = (scores[winner] ?? 0) + 2;
      if (drawer) scores[drawer] = (scores[drawer] ?? 0) + 1;
    }
    gallery.push({ prompt: rounds[i]!.prompt, drawer, strokes, winner: winner && drawer ? winner : "" });
  }
  // keep scores consistent with winners that have a drawer
  for (const k of Object.keys(scores)) delete scores[k];
  for (const pg of gallery) if (pg.winner) {
    scores[pg.winner] = (scores[pg.winner] ?? 0) + 2;
    scores[pg.drawer] = (scores[pg.drawer] ?? 0) + 1;
  }
  const round = gallery.length;
  const drawer = drawerFor(rounds, round, ctx);
  const live = P.live && typeof P.live === "object" ? P.live : { strokes: [], guesses: [] };
  const strokes = drawer ? (Array.isArray(live.strokes) ? live.strokes : []).filter(okStroke).slice(0, MAX_STROKES) : [];
  const guesses: Guess[] = [];
  for (const g of Array.isArray(live.guesses) ? live.guesses : []) {
    const m = find(ctx, g?.who);
    const text = clean(g?.text, 30);
    if (!m || m.id === drawer || !text || norm(text).includes(norm(rounds[round]?.answer ?? "\u0000")) || guesses.length >= 12) continue;
    guesses.push({ u: m.id, name: m.name, text, at: 0, right: false });
  }
  return { title: clean(P.title, 40) || "Doodle dash", rounds, round, drawer, strokes, startAt: strokes.length ? 1 : 0, guesses, gallery, scores };
}

function advance(s: State, ctx: Ctx): State {
  const winner = s.guesses.find((g) => g.right)?.u ?? "";
  const page: Page = { prompt: s.rounds[s.round]!.prompt, drawer: s.drawer, strokes: s.strokes, winner };
  const round = s.round + 1;
  return { ...s, gallery: [...s.gallery, page], round, drawer: round < s.rounds.length ? drawerFor(s.rounds, round, ctx) : "", strokes: [], startAt: 0, guesses: [] };
}

function reduce(s: State, a: Action, meta: { user: string; time: number }, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u) || finished(s)) return s;
  if (a.t === "stroke") {
    if (u !== s.drawer || solved(s) || timeUp(s, meta.time) || !okStroke(a.pts) || s.strokes.length >= MAX_STROKES) return s;
    return { ...s, strokes: [...s.strokes, [...a.pts]], startAt: s.startAt || meta.time };
  }
  if (a.t === "undo") {
    if (u !== s.drawer || solved(s) || !s.strokes.length) return s;
    return { ...s, strokes: s.strokes.slice(0, -1) };
  }
  if (a.t === "guess") {
    const text = clean(a.text, 30);
    if (u === s.drawer || !s.drawer || solved(s) || !text) return s;
    const right = norm(text).includes(norm(s.rounds[s.round]!.answer));
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    const guesses = [...s.guesses, { u, name, text, at: meta.time, right }].slice(-12);
    const scores = right ? { ...s.scores, [u]: (s.scores[u] ?? 0) + 2, [s.drawer]: (s.scores[s.drawer] ?? 0) + 1 } : s.scores;
    return { ...s, guesses, scores };
  }
  if (a.t === "next") {
    if (!solved(s) && !timeUp(s, meta.time) && u !== s.drawer) return s;
    return advance(s, ctx);
  }
  return s;
}

function onMembers(s: State, ctx: Ctx): State {
  if (finished(s) || solved(s) || !ctx.members.length || (s.drawer && inChat(ctx, s.drawer))) return s;
  const drawer = drawerFor(s.rounds, s.round, ctx);
  if (drawer === s.drawer) return s;
  return { ...s, drawer, strokes: [], startAt: 0, guesses: s.guesses.filter((g) => g.u !== drawer) };
}

function ink(g: CanvasRenderingContext2D, strokes: number[][], w: number, h: number) {
  const p = new Path2D();
  for (const st of strokes) {
    p.moveTo((st[0]! / 1000) * w, (st[1]! / 1000) * h);
    for (let i = 2; i < st.length; i += 2) p.lineTo((st[i]! / 1000) * w, (st[i + 1]! / 1000) * h);
  }
  g.stroke(p);
}

const sumScores = (s: State) => Object.values(s.scores).reduce((a, b) => a + b, 0);
const solvedRounds = (s: State) => s.gallery.filter((p) => p.winner).length + (solved(s) ? 1 : 0);

export default defineApp<State, Action, Local>({
  name: "Doodle dash",
  summary: (s, ctx) => {
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    if (finished(s)) {
      const top = Object.entries(s.scores).sort((a, b) => b[1] - a[1])[0];
      return top ? `Doodle dash done · ${name(top[0])} wins with ${top[1]}` : "Doodle dash done";
    }
    return `Doodle dash · round ${s.round + 1} of ${s.rounds.length} · ${s.drawer ? name(s.drawer) + " is drawing" : "waiting for players"}`;
  },
  init: initState,
  reduce: (s, a, m, ctx) => reduce(s, a, m, ctx),
  onMembers,

  invariants: {
    "the round is the next page": (s) => s.round === s.gallery.length && s.round <= s.rounds.length,
    "strokes are on the page": (s) => s.strokes.length <= MAX_STROKES && s.strokes.every(okStroke) && s.gallery.every((p) => p.strokes.every(okStroke)),
    "at most one right guess per page": (s) => s.guesses.filter((g) => g.right).length <= 1,
    "the artist never guesses": (s) => s.guesses.every((g) => g.u !== s.drawer) && s.gallery.every((p) => p.winner !== p.drawer || p.winner === ""),
    "points are 3 per solved page": (s) => sumScores(s) === 3 * solvedRounds(s) && Object.values(s.scores).every((n) => Number.isInteger(n) && n > 0),
    "a right guess matches the answer": (s) => finished(s) || s.guesses.every((g) => g.right === norm(g.text).includes(norm(s.rounds[s.round]!.answer))),
    "nobody draws after the game": (s) => !finished(s) || (s.strokes.length === 0 && s.drawer === ""),
    "the artist is in the chat": (s, ctx) => finished(s) || solved(s) || ctx.members.length === 0 || inChat(ctx, s.drawer),
    "guesses stay short": (s) => s.guesses.length <= 12 && s.guesses.every((g) => g.text.length > 0 && g.text.length <= 30),
  },

  transitions: {
    "undo takes back the last line": (p, n, a) => a.t !== "undo" || p === n || (!solved(p) && JSON.stringify(n.strokes) === JSON.stringify(p.strokes.slice(0, -1))),
    "only the artist draws": (p, n, a, m) => (a.t !== "stroke" && a.t !== "undo") || p === n || m.user === p.drawer,
    "a stroke adds one line": (p, n, a) => a.t !== "stroke" || p === n || (n.strokes.length === p.strokes.length + 1 && n.guesses.length === p.guesses.length),
    "the sand runs 20 s from the first line": (p, n, a, m) => a.t !== "stroke" || p === n || (p.startAt === 0 ? n.startAt === m.time : n.startAt === p.startAt && m.time < p.startAt + DRAW_MS),
    "a guess adds the guesser's bubble": (p, n, a, m) => a.t !== "guess" || p === n || (n.guesses[n.guesses.length - 1]!.u === m.user && m.user !== p.drawer && !solved(p)),
    "a right guess pays 2 and the artist 1": (p, n, a, m) =>
      a.t !== "guess" || p === n || (solved(n) ? (n.scores[m.user] ?? 0) === (p.scores[m.user] ?? 0) + 2 && (n.scores[p.drawer] ?? 0) === (p.scores[p.drawer] ?? 0) + 1 : sumScores(n) === sumScores(p)),
    "next waits for a right guess, time, or the artist": (p, n, a, m) => a.t !== "next" || p === n || solved(p) || timeUp(p, m.time) || m.user === p.drawer,
    "a finished page keeps its lines": (p, n, a) => a.t !== "next" || p === n || JSON.stringify(n.gallery[n.gallery.length - 1]!.strokes) === JSON.stringify(p.strokes),
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (finished(s)) return { t: "guess", text: "late" };
    if (r.next() < 0.08) return r.pick([{ t: "undo" }, { t: "next" }, { t: "stroke", pts: [r.int(1000), r.int(1000), r.int(1000), r.int(1000)] }] as Action[]);
    if (u === s.drawer) {
      const k = r.next();
      if (k < 0.7) return { t: "stroke", pts: Array.from({ length: 2 * (2 + r.int(6)) }, () => r.int(1000)) };
      if (k < 0.8) return { t: "undo" };
      return { t: "next" };
    }
    const k = r.next();
    if (k < 0.75) return { t: "guess", text: r.next() < 0.35 ? `the ${s.rounds[s.round]!.answer}` : r.pick(["bread", "a boat", "fridge", "cloud", "a hat"]) };
    return { t: "next" };
  },

  local: { pts: [], draft: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const done = finished(state);
    const iDraw = state.drawer === me && !done;
    const got = solved(state);
    const up = timeUp(state, now);
    const left = state.startAt === 0 ? DRAW_MS : Math.max(0, state.startAt + DRAW_MS - now);
    const canDraw = iDraw && !got && !up && state.strokes.length < MAX_STROKES;
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const round = state.rounds[state.round];
    const right = state.guesses.find((g) => g.right);
    const showPrompt = iDraw || got || (up && !state.drawer);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // sketchbook page
      g.fillStyle = theme.mode === "dark" ? mix(c.text, c.card, 0.9) : mix(pl.yellow, c.card, 0.88);
      g.beginPath();
      g.roundRect(0, 0, w, PAGE_H, 10);
      g.fill();
      g.strokeStyle = mix(pl.blue, c.card, 0.75);
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 34; y < PAGE_H; y += 26) {
        g.moveTo(10, y);
        g.lineTo(w - 10, y);
      }
      g.stroke();
      // tape
      g.fillStyle = mix(pl.purple, c.card, 0.55);
      g.save();
      g.translate(w / 2, 4);
      g.rotate(-0.04);
      g.fillRect(-28, -6, 56, 14);
      g.restore();
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = 3;
      g.strokeStyle = c.text;
      ink(g, state.strokes, w, PAGE_H);
      if (local.pts.length >= 4) {
        g.strokeStyle = c.primary;
        ink(g, [local.pts], w, PAGE_H);
      }
      // hourglass, top right
      const hx = w - 26;
      const k = state.startAt === 0 ? 0 : Math.min(1, (now - state.startAt) / DRAW_MS);
      g.fillStyle = pl.brown;
      g.fillRect(hx - 11, 8, 22, 3);
      g.fillRect(hx - 11, 45, 22, 3);
      g.strokeStyle = mix(pl.brown, c.card, 0.3);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(hx - 9, 11);
      g.lineTo(hx + 9, 11);
      g.lineTo(hx + 1.5, 28);
      g.lineTo(hx + 9, 45);
      g.lineTo(hx - 9, 45);
      g.lineTo(hx - 1.5, 28);
      g.closePath();
      g.stroke();
      g.fillStyle = pl.orange;
      const top = 1 - k;
      if (top > 0.02) {
        const y0 = 11 + 17 * (1 - top);
        const hw = 7.5 * top;
        g.beginPath();
        g.moveTo(hx - hw, y0);
        g.lineTo(hx + hw, y0);
        g.lineTo(hx, 27);
        g.closePath();
        g.fill();
      }
      if (k > 0.02) {
        g.beginPath();
        g.moveTo(hx - 8 * Math.sqrt(k), 45);
        g.lineTo(hx + 8 * Math.sqrt(k), 45);
        g.lineTo(hx, 45 - 14 * Math.sqrt(k));
        g.closePath();
        g.fill();
        if (k < 1) g.fillRect(hx - 0.7, 28, 1.4, 17 - 14 * Math.sqrt(k));
      }
      return state.startAt !== 0 && k < 1;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (!canDraw) return;
      const x = Math.max(0, Math.min(999, Math.round((e.x / W) * 1000)));
      const y = Math.max(0, Math.min(999, Math.round((e.y / PAGE_H) * 1000)));
      if (e.type === "down") setLocal({ pts: [x, y] });
      else if (e.type === "move" && local.pts.length) {
        const lx = local.pts[local.pts.length - 2]!;
        const ly = local.pts[local.pts.length - 1]!;
        if (Math.abs(x - lx) + Math.abs(y - ly) > 14 && local.pts.length < MAX_PTS) setLocal({ pts: [...local.pts, x, y] });
      } else if (e.type === "up") {
        const pts = local.pts.length === 2 ? [...local.pts, Math.min(999, local.pts[0]! + 6), local.pts[1]!] : local.pts;
        setLocal({ pts: [] });
        if (pts.length >= 4) dispatch({ t: "stroke", pts });
      }
    };

    const send = () => {
      const text = local.draft.trim();
      if (!text) return;
      const ok = round ? norm(text).includes(norm(round.answer)) : false;
      haptic(ok ? "success" : "light");
      setLocal({ draft: "", bursts: ok ? local.bursts + 1 : local.bursts });
      dispatch({ t: "guess", text });
    };

    const bubbles = state.guesses.slice(-2);
    const thumbs = state.gallery.slice(-4);
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const ranked = Object.entries(state.scores).filter(([u]) => members.some((m) => m.id === u)).sort((a, b) => b[1] - a[1]);

    if (done) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`The gallery · ${state.gallery.length} masterpieces`} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {state.gallery.slice(0, 6).map((pg, i) => (
              <div key={i} style={{ background: c.wash, borderRadius: 10, padding: 6, transform: `rotate(${i % 2 ? 1.2 : -1.2}deg)` }}>
                <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="56" role="img" aria-label={pg.prompt}>
                  {pg.strokes.map((st, k) => (
                    <polyline key={k} points={st.join(" ")} fill="none" stroke={c.text} stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
                  ))}
                </svg>
                <div style={{ fontSize: 12, lineHeight: "16px", color: c.text, ...ell }}>{pg.prompt}</div>
                <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`by ${nameOf(pg.drawer)}${pg.winner ? ` · ${nameOf(pg.winner)} got it` : ""}`}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            {ranked[0] ? <Avatar user={ranked[0][0]} size={28} /> : null}
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.text, ...ell }}>{ranked[0] ? `${nameOf(ranked[0][0])} ${ranked[0][0] === me ? "win" : "wins"} with ${ranked[0][1]}` : "Nobody guessed a thing"}</span>
          </div>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={`Round ${state.round + 1} of ${state.rounds.length} · ${state.drawer ? `${nameOf(state.drawer)} ${iDraw ? "draw" : "is drawing"}` : "waiting for an artist"}`} />
        <div style={{ position: "relative", height: PAGE_H }}>
          <Canvas height={PAGE_H} drag={canDraw} label={`Drawing with ${state.strokes.length} lines, ${state.guesses.length} guesses`} draw={draw} onPointer={onPointer} />
          {showPrompt && round ? (
            <div style={{ position: "absolute", left: 8, top: 8, maxWidth: W - 70, padding: "2px 10px", borderRadius: 99, background: c.card, color: c.text, fontSize: 13, lineHeight: "20px", fontWeight: 600, pointerEvents: "none", ...ell }}>
              {iDraw && !got ? `Draw: ${round.prompt}` : round.prompt}
            </div>
          ) : null}
          {state.strokes.length === 0 && !got ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 78, textAlign: "center", fontSize: 15, lineHeight: "20px", color: c.secondaryText, pointerEvents: "none" }}>
              {iDraw ? "Draw here · 20 seconds from your first line" : `Waiting for ${nameOf(state.drawer)}'s first line`}
            </div>
          ) : null}
          <div style={{ position: "absolute", right: 0, bottom: -34, left: 0, height: 28, display: "flex", flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 6, overflow: "hidden", pointerEvents: "none" }}>
            {bubbles.map((b, i) => {
              const e = running(b.at, 320);
              const q = e === null ? 1 : pop(e);
              return (
                <div key={`${b.u}-${b.at}-${i}`} style={{ display: "flex", alignItems: "center", gap: 4, transform: `scale(${q})`, transformOrigin: "left center", flex: "none", maxWidth: "70%" }}>
                  <Avatar user={b.u} size={22} />
                  <span style={{ padding: "2px 10px", borderRadius: 14, background: b.right ? c.positive : c.card, color: b.right ? c.onPrimary : c.text, fontSize: 13, lineHeight: "20px", fontWeight: b.right ? 600 : 400, boxShadow: `0 0 0 1px ${c.divider}`, ...ell }}>{b.text}</span>
                </div>
              );
            })}
          </div>
          {got && right ? (
            <div style={{ position: "absolute", left: 14, top: 112, padding: "4px 12px", border: `3px solid ${c.positive}`, borderRadius: 8, color: c.text, background: c.card, fontSize: 17, lineHeight: "22px", fontWeight: 700, transform: "rotate(-8deg)", pointerEvents: "none" }}>
              {`${nameOf(right.u)} got it · +2`}
            </div>
          ) : null}
          {local.bursts > 0 && got ? <Burst key={local.bursts} emoji="🎨" /> : null}
        </div>
        <div style={{ marginTop: 42, display: "flex", alignItems: "center", gap: 6, height: 48 }}>
          {thumbs.map((pg, i) => (
            <div key={i} style={{ position: "relative", flex: "none", width: 64, height: 44, borderRadius: 6, background: c.wash, transform: `rotate(${i % 2 ? 2 : -2}deg)` }}>
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="64" height="36" role="img" aria-label={`${pg.prompt}, by ${nameOf(pg.drawer)}`} style={{ position: "absolute", top: 4, left: 0 }}>
                {pg.strokes.map((st, k) => (
                  <polyline key={k} points={st.join(" ")} fill="none" stroke={c.text} stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
                ))}
              </svg>
              <span style={{ position: "absolute", right: -6, bottom: -6, display: "flex" }}>
                <Avatar user={pg.drawer} size={18} />
              </span>
            </div>
          ))}
          {thumbs.length ? null : <div aria-hidden="true" style={{ flex: "none", width: 64, height: 44, borderRadius: 6, border: `1.5px dashed ${c.secondaryText}`, boxSizing: "border-box" }} />}
          <div style={{ flex: 1, minWidth: 0, marginLeft: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
            <div style={ell}>{thumbs.length ? `${state.gallery.length} in the gallery` : "The gallery starts here"}</div>
            <div style={{ ...ell, color: c.text }}>{ranked.length ? ranked.slice(0, 3).map(([u, n]) => `${nameOf(u)} ${n}`).join(" · ") : "No points yet"}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {iDraw && !got ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: c.text, ...ell }}>
                {state.startAt === 0 ? "Your turn to draw" : up ? "Time's up · they can still guess" : `${Math.ceil(left / 1000)} s left`}
              </span>
              {state.strokes.length && !up ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "undo" })}>
                  Undo
                </Button>
              ) : null}
              <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
                {up ? "Next round" : "Skip"}
              </Button>
            </>
          ) : got || (up && state.guesses.length >= 6) ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: c.text, ...ell }}>{got ? `It was ${round?.prompt ?? ""}` : "Nobody got it"}</span>
              <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
                Next round
              </Button>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", gap: 8, minWidth: 0 }}>
              <input
                aria-label="Your guess"
                placeholder={up ? "Time's up · last guesses" : "Type a guess"}
                value={local.draft}
                maxLength={30}
                style={{ flex: 1, minWidth: 0, height: 44, boxSizing: "border-box" }}
                onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") send();
                }}
              />
              <Button kind="primary" disabled={!state.drawer || !local.draft.trim()} onClick={send}>
                Guess
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  },
});
