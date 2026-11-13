import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  rng,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Calvin sets seven alarms. A 15-second game: his seven clocks ring in a pattern the whole chat
// shares; snooze each one before he wakes up. Everyone's best run sits on the board.

type Params = {
  /** Card title: "Seven alarms" */
  title: string;
  /** Under the title: "keep Calvin asleep · 15 seconds" */
  sub: string;
  /** The sleeper's name. */
  sleeper: string;
  /** What the sleeper said. */
  said: string;
  /** Runs friends already posted: name, snoozed (out of the rings), line. */
  board: { name: string; snoozed: number; said: string }[];
};

// @params
const P: Params = {
  title: "Seven alarms",
  sub: "keep Calvin asleep · 15 seconds",
  sleeper: "Calvin",
  said: "5:50 is not a suggestion",
  board: [
    { name: "Tsai Lin", snoozed: 12, said: "changed his alarm tone to whale sounds" },
    { name: "Will", snoozed: 10, said: "he woke up. not my fault" },
    { name: "Arun", snoozed: 9, said: "rice cooker beep threw me off" },
    { name: "Aditya", snoozed: 7, said: "lowkey slept through it too" },
  ],
};
// @end params

type Ring = { id: number; clock: number; at: number };
type Run = { at: number; seed: number };
type Post = { who: string; name: string; snoozed: number; woke: boolean; said: string; at: number };
type State = { title: string; sub: string; sleeper: string; said: string; runs: Record<string, Run>; board: Post[]; plays: number };
type Action = { t: "start" } | { t: "done"; hits: number[] };
type Local = { hits: number[]; run: number; toast: number };

const TAU = Math.PI * 2;
const CH = 216;
const DUR = 15000;
const RINGS = 14;
const LIVE = 1500;
const WAKE = 4;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
/** The ring pattern for a run: the same on every phone, from the run's seed. */
function rings(seed: number): Ring[] {
  const r = rng(seed);
  const out: Ring[] = [];
  let t = 600;
  let last = -1;
  for (let i = 0; i < RINGS; i++) {
    let k = r.int(7);
    if (k === last) k = (k + 1 + r.int(6)) % 7;
    out.push({ id: i, clock: k, at: t });
    last = k;
    t += Math.round(1150 - i * 45 + r.int(200));
  }
  return out;
}
const best = (s: State) => [...s.board].sort((a, b) => b.snoozed - a.snoozed || a.at - b.at);
const postOf = (s: State, who: string) => s.board.find((p) => p.who === who);
const memberOf = (p: Post): Member => ({ id: p.who, name: p.name });

// Seven clocks around the bed, as fractions of the picture.
const SPOTS = [
  [0.08, 0.26],
  [0.26, 0.1],
  [0.74, 0.1],
  [0.92, 0.26],
  [0.92, 0.66],
  [0.08, 0.66],
  [0.62, 0.42],
] as const;

function initState(ctx: Ctx): State {
  const board: Post[] = [];
  for (const b of P.board) {
    if (board.length >= 12) break;
    const name = clean(b.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (board.some((p) => p.who === who)) continue;
    const snoozed = Number.isInteger(b.snoozed) ? Math.min(RINGS, Math.max(0, b.snoozed)) : 0;
    board.push({ who, name, snoozed, woke: RINGS - snoozed >= WAKE, said: clean(b.said, 50), at: 0 });
  }
  return { title: clean(P.title, 40) || "Seven alarms", sub: clean(P.sub, 60), sleeper: clean(P.sleeper, 20) || "Calvin", said: clean(P.said, 50), runs: {}, board, plays: 0 };
}

function alarmClock(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, ringing: number, snoozed: boolean, now: number) {
  const c = t.color;
  const ink = t.mode === "dark" ? c.wash : c.text;
  const shake = ringing > 0 ? Math.sin(now / 22) * 0.25 : 0;
  g.save();
  g.translate(x, y);
  g.rotate(shake);
  // Bells.
  g.beginPath();
  g.arc(-9, -13, 6, Math.PI, 0);
  g.arc(9, -13, 6, Math.PI, 0);
  g.fillStyle = ringing > 0 ? c.negative : mix(c.secondaryText, c.card, 0.2);
  g.fill();
  // Feet.
  g.beginPath();
  g.moveTo(-8, 11);
  g.lineTo(-12, 17);
  g.moveTo(8, 11);
  g.lineTo(12, 17);
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.strokeStyle = ink;
  g.stroke();
  // Body and face.
  g.beginPath();
  g.arc(0, 0, 14, 0, TAU);
  g.fillStyle = ringing > 0 ? c.negative : snoozed ? c.positive : mix(c.series1, c.card, 0.2);
  g.fill();
  g.beginPath();
  g.arc(0, 0, 10.5, 0, TAU);
  g.fillStyle = c.card;
  g.fill();
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -7);
  g.moveTo(0, 0);
  g.lineTo(5, 2);
  g.lineWidth = 1.8;
  g.strokeStyle = ink;
  g.stroke();
  g.restore();
  if (ringing > 0) {
    // Ring lines.
    g.beginPath();
    for (const k of [-1, 1]) {
      g.moveTo(x + k * 18, y - 10);
      g.lineTo(x + k * 24, y - 15);
      g.moveTo(x + k * 19, y);
      g.lineTo(x + k * 26, y);
    }
    g.lineWidth = 2;
    g.strokeStyle = c.negative;
    g.stroke();
  }
}

function drawRoom(g: CanvasRenderingContext2D, f: DrawFrame, s: State, run: Run | null, hits: number[]) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const e = run ? f.now - run.at : -1;
  const live = run !== null && e >= 0 && e < DUR + 400;
  const rs = run ? rings(run.seed) : [];
  const missed = rs.filter((r) => e > r.at + LIVE && !hits.includes(r.id)).length;
  const awake = missed >= WAKE;

  // Room: wall, floor, window with a dawn sky.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = mix(c.series6, c.card, dk ? 0.78 : 0.88);
  g.fill();
  g.beginPath();
  g.rect(0, CH - 46, W, 46);
  g.fillStyle = mix(c.series5, c.card, dk ? 0.6 : 0.7);
  g.fill();
  g.beginPath();
  g.roundRect(W / 2 - 34, 22, 68, 46, 4);
  g.fillStyle = mix(c.series2, c.series4, 0.3);
  g.fill();
  g.beginPath();
  g.rect(W / 2 - 1, 22, 2, 46);
  g.rect(W / 2 - 34, 44, 68, 2);
  g.fillStyle = c.card;
  g.fill();

  // Bed with the sleeper.
  const bx = W / 2;
  const by = CH - 52;
  g.beginPath();
  g.roundRect(bx - 92, by - 8, 184, 36, 8);
  g.fillStyle = mix(c.series5, ink, 0.62);
  g.fill();
  g.beginPath();
  g.roundRect(bx - 84, by - 22, 168, 30, 12);
  g.fillStyle = mix(c.series1, c.card, 0.35);
  g.fill();
  g.beginPath();
  g.ellipse(bx - 62, by - 22, 22, 9, 0, 0, TAU);
  g.fillStyle = c.card;
  g.fill();
  const hx = bx - 60;
  const hy = by - 30;
  const jolt = awake ? Math.sin(f.now / 40) * 1.5 : 0;
  g.beginPath();
  g.arc(hx, hy + jolt, 14, 0, TAU);
  g.fillStyle = userColor(`~${s.sleeper}`, t);
  g.fill();
  g.beginPath();
  if (awake) {
    g.arc(hx - 4.5, hy - 2 + jolt, 2.4, 0, TAU);
    g.moveTo(hx + 6.9, hy - 2 + jolt);
    g.arc(hx + 4.5, hy - 2 + jolt, 2.4, 0, TAU);
    g.fillStyle = ink;
    g.fill();
    g.beginPath();
    g.ellipse(hx, hy + 6 + jolt, 3, 2.5, 0, 0, TAU);
    g.fill();
  } else {
    g.moveTo(hx - 7, hy - 2);
    g.quadraticCurveTo(hx - 4.5, hy, hx - 2, hy - 2);
    g.moveTo(hx + 2, hy - 2);
    g.quadraticCurveTo(hx + 4.5, hy, hx + 7, hy - 2);
    g.lineWidth = 1.5;
    g.strokeStyle = ink;
    g.stroke();
    // Drifting z's.
    g.font = `700 12px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    for (let k = 0; k < 3; k++) {
      const u = ((f.now / 1400 + k / 3) % 1);
      g.globalAlpha = 1;
      g.fillText("z", hx + 14 + u * 22, hy - 16 - u * 26 - k * 2);
    }
  }
  const nm = fitText(s.sleeper, 80, { g, size: 12, min: 10, weight: 700 });
  g.font = nm.font;
  g.textAlign = "center";
  g.fillStyle = dk ? c.text : c.card;
  g.fillText(nm.text, bx + 30, by + 19);

  // Clocks.
  SPOTS.forEach(([fx, fy], k) => {
    const x = fx * W;
    const y = fy * CH + 18;
    if (fy < 0.5) {
      g.beginPath();
      g.roundRect(x - 24, y + 17, 48, 4, 2);
      g.fillStyle = mix(c.series5, ink, 0.35);
      g.fill();
    }
    const now = rs.filter((r) => r.clock === k && e >= r.at && e < r.at + LIVE && !hits.includes(r.id));
    const snoozed = rs.some((r) => r.clock === k && hits.includes(r.id) && e < r.at + LIVE + 500);
    alarmClock(g, t, x, y, now.length, snoozed, f.now);
  });

  // Timer and wake meter along the top.
  if (live) {
    const left = Math.max(0, DUR - e);
    g.beginPath();
    g.roundRect(10, 8, W - 20, 6, 3);
    g.fillStyle = mix(c.secondaryText, c.card, 0.6);
    g.fill();
    g.beginPath();
    g.roundRect(10, 8, ((W - 20) * left) / DUR, 6, 3);
    g.fillStyle = c.primary;
    g.fill();
  }
  return live || !run;
}

export default defineApp<State, Action, Local>({
  name: "Seven alarms",
  summary: (s) => {
    const top = best(s)[0];
    return top ? `${s.title}: ${firstName(top.name)} leads, ${top.snoozed} of ${RINGS} snoozed · ${s.board.length} played` : `${s.title}: nobody's played yet`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "start") {
      const r = s.runs[m.user];
      if (r && m.time < r.at + DUR) return s;
      return { ...s, runs: { ...s.runs, [m.user]: { at: m.time, seed: m.seed } }, plays: s.plays + 1 };
    }
    if (a.t === "done") {
      const r = s.runs[m.user];
      if (!r || !Array.isArray(a.hits) || a.hits.length > RINGS) return s;
      const ids = new Set<number>();
      for (const h of a.hits) if (typeof h === "number" && Number.isInteger(h) && h >= 0 && h < RINGS) ids.add(h);
      const snoozed = ids.size;
      const runs = { ...s.runs };
      delete runs[m.user];
      const name = ctx.members.find((x) => x.id === m.user)?.name ?? "Friend";
      const prev = postOf(s, m.user);
      const post: Post = { who: m.user, name, snoozed, woke: RINGS - snoozed >= WAKE, said: "", at: m.time };
      const board = prev ? s.board.map((p) => (p.who === m.user ? (snoozed > p.snoozed ? post : p) : p)) : [...s.board, post].slice(-16);
      return { ...s, runs, board };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const runs: Record<string, Run> = {};
    for (const u of Object.keys(s.runs)) if (inChat(ctx, u)) runs[u] = s.runs[u]!;
    const board = s.board.map((p) => (seeded(p.who) || inChat(ctx, p.who) ? p : { ...p, who: `~${p.name}` })).filter((p, i, xs) => xs.findIndex((x) => x.who === p.who) === i);
    return { ...s, runs, board };
  },

  invariants: {
    "scores fit the rings": (s) => s.board.every((p) => Number.isInteger(p.snoozed) && p.snoozed >= 0 && p.snoozed <= RINGS),
    "he wakes when four or more ring out": (s) => s.board.every((p) => p.woke === RINGS - p.snoozed >= WAKE),
    "one row per person": (s) => new Set(s.board.map((p) => p.who)).size === s.board.length,
    "runs belong to people in the chat": (s, ctx) => Object.keys(s.runs).every((u) => inChat(ctx, u)),
    "plays count up": (s) => Number.isInteger(s.plays) && s.plays >= Object.keys(s.runs).length,
  },

  transitions: {
    "a start opens the sender's run with the seed": (p, n, a, m) => a.t !== "start" || p === n || (n.runs[m.user]?.at === m.time && n.runs[m.user]?.seed === m.seed && n.plays === p.plays + 1),
    "no restart mid-run": (p, n, a, m) => a.t !== "start" || p === n || !p.runs[m.user] || m.time >= p.runs[m.user]!.at + DUR,
    "a run posts once and closes": (p, n, a, m) => a.t !== "done" || p === n || (!!p.runs[m.user] && !n.runs[m.user] && !!postOf(n, m.user)),
    "a best only gets better": (p, n) => p.board.every((x) => (postOf(n, x.who)?.snoozed ?? x.snoozed) >= x.snoozed || !n.board.some((y) => y.name === x.name)),
    "a post counts distinct snoozes": (p, n, a, m) => {
      if (a.t !== "done" || p === n || !Array.isArray(a.hits)) return true;
      const k = new Set(a.hits.filter((h) => typeof h === "number" && Number.isInteger(h) && h >= 0 && h < RINGS)).size;
      return (postOf(n, m.user)?.snoozed ?? -1) === Math.max(k, postOf(p, m.user)?.snoozed ?? 0);
    },
    "unknown actions change nothing": (p, n, a) => a.t === "start" || a.t === "done" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.runs[user] && r.next() < 0.8) {
      const hits: number[] = [];
      for (let i = 0; i < RINGS; i++) if (r.next() < 0.7) hits.push(i);
      return { t: "done", hits };
    }
    return { t: "start" };
  },

  local: { hits: [], run: 0, toast: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const run = s.runs[me] ?? null;
    const W = theme.width - 2 * theme.space.card;
    const now = run ? clock.value : 0;
    const e = run ? now - run.at : -1;
    const playing = run !== null && e < DUR;
    const over = run !== null && e >= DUR;
    const hits = run && local.run === run.at ? local.hits : [];
    const starting = pending && !run;
    const top = best(s);
    const mine = postOf(s, me);
    const label = `Bedroom with ${s.sleeper} asleep and seven alarm clocks. Board: ${top.map((p) => `${p.name} ${p.snoozed}`).join(", ")}`;
    const onPointer = (ev: { type: string; x: number; y: number }) => {
      if (ev.type !== "down" || !run || !playing) return;
      const rs = rings(run.seed);
      const k = SPOTS.findIndex(([fx, fy]) => Math.hypot(ev.x - fx * W, ev.y - (fy * CH + 18)) < 30);
      if (k < 0) return;
      const r = rs.find((x) => x.clock === k && e >= x.at && e < x.at + LIVE && !hits.includes(x.id));
      if (!r) return;
      haptic("light");
      setLocal({ hits: [...hits, r.id], run: run.at });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} drag={playing} draw={(g, f) => drawRoom(g, f, s, run && e < DUR + 400 ? run : null, hits)} onPointer={onPointer} />
        {playing ? (
          <div style={{ height: 88, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, color: c.text }}>{`Tap the ringing ones · ${hits.length} snoozed`}</div>
        ) : over ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 36, display: "flex", alignItems: "center", fontSize: 15, color: c.text, ...ell }}>
              {RINGS - hits.length >= WAKE ? `${firstName(s.sleeper)} is up. ${hits.length} of ${RINGS} snoozed.` : `Still asleep. ${hits.length} of ${RINGS} snoozed.`}
            </div>
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                setLocal({ toast: local.toast + 1 });
                dispatch({ t: "done", hits });
              }}
            >
              Post my score
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, minWidth: 0 }}>
              <Facepile users={top.slice(0, 4).map(memberOf)} max={4} size={20} />
              <span style={{ fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>{top.slice(0, 3).map((p) => `${p.name} ${p.snoozed}`).join(" · ")}</span>
            </div>
            {top[0]?.said ? (
              <div style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText, marginBottom: 8, ...ell }}>{`${top[0].name} · “${top[0].said}”`}</div>
            ) : null}
            <Button
              kind="primary"
              wide
              disabled={starting}
              onClick={() => {
                haptic("medium");
                dispatch({ t: "start" });
              }}
            >
              {mine ? `Beat your ${mine.snoozed}` : "Keep him asleep"}
            </Button>
          </div>
        )}
        {local.toast > 0 && !run ? <Toast key={local.toast}>{mine ? `${mine.snoozed} of ${RINGS} on the board` : "Posted"}</Toast> : null}
      </div>
    );
  },
});
