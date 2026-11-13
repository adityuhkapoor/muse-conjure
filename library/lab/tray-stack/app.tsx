import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Tray stack: Hollis Dining Hall food swings over your tray; tap to drop it. The stack leans as it
// grows off-centre, and when the weight above any piece hangs past its edge, it all comes down.
// Height is the score. The friend board is the ruler on the right: faces at the height they reached.
// The food order comes from the run's server seed, and the score is recomputed from your drops, so
// everyone's tower is real.

type Kind = "waffle" | "mac" | "cereal" | "jello" | "pancake" | "rice" | "toast" | "donut";
type Params = {
  /** Card title: "Tray stack" */
  title: string;
  /** Under the title: "Hollis Dining Hall · tap to drop" */
  sub: string;
  /** The menu board on the wall, a few words: "Hollis · Sunday brunch" */
  menu: string;
  /** Foods on the line today: a name and a drawn kind (waffle, mac, cereal, jello, pancake, rice, toast, donut). */
  foods: { name: string; kind: Kind }[];
  /** Friends' best stacks: name, items, a line. */
  board: { name: string; best: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Tray stack",
  sub: "Hollis Dining Hall · tap to drop",
  menu: "Hollis · Sunday brunch",
  foods: [
    { name: "waffle", kind: "waffle" },
    { name: "mac scoop", kind: "mac" },
    { name: "cereal cups", kind: "cereal" },
    { name: "the jello", kind: "jello" },
    { name: "pancakes", kind: "pancake" },
    { name: "rice bowl", kind: "rice" },
  ],
  board: [
    { name: "Arun", best: 23, said: "the rice bowl is load-bearing" },
    { name: "Maya", best: 17, said: "" },
    { name: "Will", best: 12, said: "" },
    { name: "Calvin", best: 9, said: "the jello betrayed me" },
  ],
};
// @end params

type Food = { name: string; kind: Kind };
type Run = { at: number; seed: number };
type Post = { who: string; name: string; best: number; said: string; at: number; plays: number };
type State = { title: string; sub: string; menu: string; foods: Food[]; runs: Record<string, Run>; board: Post[]; plays: number };
type Action = { t: "start" } | { t: "done"; drops: number[] };
type Local = { run: number; drops: number[]; at: number[]; toast: number };

const KINDS: Kind[] = ["waffle", "mac", "cereal", "jello", "pancake", "rice", "toast", "donut"];
const SIZE: Record<Kind, [number, number]> = {
  waffle: [62, 13],
  mac: [46, 22],
  cereal: [32, 34],
  jello: [40, 28],
  pancake: [70, 11],
  rice: [46, 24],
  toast: [52, 14],
  donut: [44, 18],
};
const TRAY = 150;
const MAXD = 60;
const GRIP = 14; // friction: weight may hang this far past an edge before it tips
const SPAN = 300; // drops land within ±SPAN/2 of the tray's middle
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;

/** The food line for a run: the same on every phone. */
function line(s: State, seed: number, n: number): Food[] {
  const r = rng(seed);
  const pool = s.foods.length ? s.foods : [{ name: "waffle", kind: "waffle" as Kind }];
  const out: Food[] = [];
  for (let i = 0; i < n; i++) out.push(pool[r.int(pool.length)]!);
  return out;
}
const okDrop = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && Math.abs(d) <= SPAN / 2;

/**
 * Stack the drops. Each piece must overlap the one below, and at every level the weight above
 * must sit over that piece. Returns how many stand and where the stack failed, if it did.
 */
function settle(foods: Food[], drops: number[]): { stood: number; fell: number; com: number } {
  const xs: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i < drops.length && i < foods.length; i++) {
    const [w] = SIZE[foods[i]!.kind];
    const x = drops[i]!;
    const bx = i ? xs[i - 1]! : 0;
    const bw = i ? ws[i - 1]! : TRAY;
    if (Math.abs(x - bx) * 2 >= w + bw) return { stood: i, fell: i, com: x };
    xs.push(x);
    ws.push(w);
    // weight above each level must sit over it (the tray counts as level -1)
    let mass = 0;
    let moment = 0;
    for (let k = i; k >= 0; k--) {
      const wk = ws[k]!;
      mass += wk;
      moment += wk * xs[k]!;
      const com = moment / mass;
      const sx = k ? xs[k - 1]! : 0;
      const sw = k ? ws[k - 1]! : TRAY;
      if (Math.abs(com - sx) * 2 > sw + GRIP) return { stood: i, fell: k, com };
    }
  }
  let mass = 0;
  let moment = 0;
  for (let k = 0; k < xs.length; k++) {
    mass += ws[k]!;
    moment += ws[k]! * xs[k]!;
  }
  return { stood: xs.length, fell: -1, com: mass ? moment / mass : 0 };
}

function initState(ctx: Ctx): State {
  const foods: Food[] = [];
  for (const f of Array.isArray(P.foods) ? P.foods : []) {
    if (foods.length >= 8) break;
    const kind = KINDS.includes(f?.kind) ? f.kind : null;
    if (!kind) continue;
    foods.push({ name: clean(f.name, 18) || kind, kind });
  }
  const board: Post[] = [];
  for (const b of Array.isArray(P.board) ? P.board : []) {
    const name = clean(b?.name, 20);
    if (!name || board.length >= 12) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (board.some((p) => p.who === who)) continue;
    const best = typeof b.best === "number" && Number.isFinite(b.best) ? Math.max(0, Math.min(MAXD, Math.round(b.best))) : 0;
    board.push({ who, name, best, said: clean(b.said, 48), at: 0, plays: 1 });
  }
  return { title: clean(P.title, 40) || "Tray stack", sub: clean(P.sub, 60), menu: clean(P.menu, 32), foods: foods.length ? foods : [{ name: "waffle", kind: "waffle" }], runs: {}, board, plays: 0 };
}

/** One food, drawn from the side, centred on (x, y) with its base at y. */
function food(g: CanvasRenderingContext2D, t: Theme, kind: Kind, x: number, y: number, wob: number) {
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const [w, h] = SIZE[kind];
  const L = x - w / 2;
  const T = y - h;
  const fill = (col: string) => {
    g.fillStyle = col;
    g.fill();
  };
  g.beginPath();
  if (kind === "waffle" || kind === "toast") {
    g.roundRect(L, T, w, h, kind === "toast" ? 5 : 3);
    fill(kind === "toast" ? mix(pl.crust, pl.cream, 0.35) : pl.crust);
    g.beginPath();
    if (kind === "waffle") {
      for (let k = L + 8; k < L + w - 4; k += 9) g.rect(k, T + 3, 4, h - 6);
    } else g.roundRect(L + 3, T + 3, w - 6, h - 6, 3);
    fill(kind === "waffle" ? mix(pl.crust, pl.brown, 0.4) : pl.cream);
  } else if (kind === "pancake") {
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.roundRect(L + k, T + k * 3.6, w - 2 * k, 4.2, 2.1);
      fill(k % 2 ? pl.crust : mix(pl.crust, pl.cream, 0.4));
    }
    g.beginPath();
    g.roundRect(x - 7, T - 3, 14, 4, 1);
    fill(pl.yellow);
  } else if (kind === "mac" || kind === "rice") {
    // bowl, then the scoop on top
    g.moveTo(L + 2, y - h * 0.55);
    g.lineTo(L + w - 2, y - h * 0.55);
    g.quadraticCurveTo(L + w - 4, y, x, y);
    g.quadraticCurveTo(L + 4, y, L + 2, y - h * 0.55);
    fill(kind === "rice" ? pl.red : pl.blue);
    g.beginPath();
    g.ellipse(x, y - h * 0.55, w / 2 - 5, h * 0.42, 0, Math.PI, 0);
    fill(kind === "rice" ? (dk ? c.text : pl.paper) : pl.yellow);
    if (kind === "rice") {
      g.beginPath();
      g.rect(x + 4, T - 6, 2, h * 0.5);
      g.rect(x + 9, T - 4, 2, h * 0.45);
      fill(pl.brown);
    }
  } else if (kind === "cereal") {
    for (let k = 0; k < 3; k++) {
      const cy = y - k * 11;
      g.beginPath();
      g.moveTo(x - w / 2 + 2, cy - 11);
      g.lineTo(x + w / 2 - 2, cy - 11);
      g.lineTo(x + w / 2 - 5, cy);
      g.lineTo(x - w / 2 + 5, cy);
      g.closePath();
      fill([pl.orange, pl.purple, pl.green][k]!);
      g.beginPath();
      g.rect(x - w / 2 + 5, cy - 7, w - 10, 3);
      fill(pl.paper);
    }
  } else if (kind === "jello") {
    const s = Math.sin(wob) * 3;
    g.moveTo(L + 2, y);
    g.lineTo(L + w - 2, y);
    g.lineTo(L + w - 5 + s, T + 3);
    g.quadraticCurveTo(x + s, T - 3, L + 5 + s, T + 3);
    g.closePath();
    fill(mix(pl.green, c.card, dk ? 0.1 : 0.15));
    g.beginPath();
    g.ellipse(L + 11 + s, T + 9, 3, 5, 0.3, 0, Math.PI * 2);
    fill(mix(pl.green, c.card, 0.6));
  } else if (kind === "donut") {
    g.ellipse(x, y - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    fill(pl.crust);
    g.beginPath();
    g.ellipse(x, y - h / 2 - 2, w / 2 - 3, h / 2 - 3, 0, 0, Math.PI * 2);
    fill(pl.red);
    g.beginPath();
    g.ellipse(x, y - h / 2 - 1, 6, 3, 0, 0, Math.PI * 2);
    fill(mix(pl.crust, pl.brown, 0.5));
  }
}

const H = 236;
const TRAY_Y = H - 30;

export default defineApp<State, Action, Local>({
  name: "Tray stack",
  summary: (s) => {
    const top = [...s.board].sort((a, b) => b.best - a.best)[0];
    return top ? `${s.title}: ${first(top.name)} leads with ${top.best} · ${s.board.length} played` : `${s.title}: nobody has stacked yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "start") {
      return { ...s, runs: { ...s.runs, [m.user]: { at: m.time, seed: m.seed } }, plays: s.plays + 1 };
    }
    if (a.t === "done") {
      const run = s.runs[m.user];
      if (!run || !Array.isArray(a.drops) || a.drops.length > MAXD || !a.drops.every(okDrop)) return s;
      const score = settle(line(s, run.seed, a.drops.length), a.drops).stood;
      const runs = { ...s.runs };
      delete runs[m.user];
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      const old = s.board.find((p) => p.who === m.user);
      const post: Post = old ? (score > old.best ? { ...old, name, best: score, at: m.time, plays: old.plays + 1 } : { ...old, plays: old.plays + 1 }) : { who: m.user, name, best: score, said: "", at: m.time, plays: 1 };
      return { ...s, runs, board: old ? s.board.map((p) => (p.who === m.user ? post : p)) : [...s.board, post].slice(-12) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const runs: Record<string, Run> = {};
    for (const u of Object.keys(s.runs)) if (inChat(ctx, u)) runs[u] = s.runs[u]!;
    return { ...s, runs };
  },

  invariants: {
    "bests are whole and in range": (s) => s.board.every((p) => Number.isInteger(p.best) && p.best >= 0 && p.best <= MAXD),
    "one row per person": (s) => new Set(s.board.map((p) => p.who)).size === s.board.length,
    "runs belong to people in the chat": (s, ctx) => Object.keys(s.runs).every((u) => inChat(ctx, u)),
    "plays add up": (s) => Number.isInteger(s.plays) && s.plays >= Object.keys(s.runs).length,
  },

  transitions: {
    "a start opens your run with the seed": (p, n, a, m) => a.t !== "start" || p === n || (n.runs[m.user]?.at === m.time && n.runs[m.user]?.seed === m.seed && n.plays === p.plays + 1),
    "a run posts once and closes": (p, n, a, m) => a.t !== "done" || p === n || (!!p.runs[m.user] && !n.runs[m.user] && n.board.some((x) => x.who === m.user)),
    "the score is the stack that stood": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const run = p.runs[m.user]!;
      const got = settle(line(p, run.seed, a.drops.length), a.drops).stood;
      const was = p.board.find((x) => x.who === m.user)?.best ?? -1;
      return n.board.find((x) => x.who === m.user)?.best === Math.max(got, was);
    },
    "a post counts a play": (p, n, a, m) => a.t !== "done" || p === n || (n.board.find((x) => x.who === m.user)?.plays ?? 0) === (p.board.find((x) => x.who === m.user)?.plays ?? 0) + 1,
    "a post touches only your row": (p, n, a, m) => a.t !== "done" || p === n || n.board.filter((x) => x.who !== m.user).every((x) => p.board.some((y) => y.who === x.who && y.best === x.best)),
    "unknown actions change nothing": (p, n, a) => a.t === "start" || a.t === "done" || p === n,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.runs[user] && r.next() < 0.8) {
      const drops: number[] = [];
      const n = 1 + r.int(14);
      for (let i = 0; i < n; i++) drops.push(r.int(61) - 30);
      return { t: "done", drops };
    }
    return { t: "start" };
  },

  local: { run: 0, drops: [], at: [], toast: 0 },

  view: ({ state: s, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const run = confirmed.runs[me] ?? null;
    const drops = run && local.run === run.at ? local.drops : [];
    const foods = run ? line(confirmed, run.seed, drops.length + 4) : [];
    const res = run ? settle(foods, drops) : { stood: 0, fell: -1, com: 0 };
    const over = run !== null && (res.fell >= 0 || drops.length >= MAXD);
    const playing = run !== null && !over;
    const board = [...s.board].sort((a, b) => b.best - a.best || a.at - b.at);
    const mine = s.board.find((p) => p.who === me) ?? null;
    const nameOf = (p: Post) => members.find((m) => m.id === p.who)?.name ?? p.name;
    const member = (p: Post): Member => ({ id: p.who, name: nameOf(p) });
    const cx = (W - 40) / 2;
    const period = (n: number) => Math.max(1300, 3000 - n * 70);
    const swing = (now: number, n: number) => {
      const t0 = n ? (local.at[n - 1] ?? run?.at ?? 0) : (run?.at ?? 0);
      const ph = (((now - t0) / period(n)) % 1 + 1) % 1;
      const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
      return Math.round(tri * (TRAY / 2 - 5));
    };
    const lastAt = local.at[local.at.length - 1] ?? 0;
    const railTop = 38;
    const railMax = Math.max(24, ...board.map((p) => p.best), res.stood);
    const railY = (n: number) => TRAY_Y - (n / railMax) * (TRAY_Y - railTop);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const now = f.now;
      // the hall: wall, menu board, table
      g.fillStyle = dk ? mix(pl.wall, c.card, 0.82) : pl.wall;
      g.beginPath();
      g.roundRect(0, 0, W, H, 12);
      g.fill();
      g.fillStyle = dk ? mix(pl.wall, c.card, 0.72) : mix(pl.wall, pl.brown, 0.18);
      for (let x = 14; x < W; x += 28) g.fillRect(x, 0, 1, TRAY_Y - 6);
      if (!run) {
        g.fillStyle = dk ? pl.dark : mix(pl.dark, c.card, 0.1);
        g.beginPath();
        g.roundRect(10, 10, 150, 24, 4);
        g.fill();
        const mt = fitText(s.menu || s.title, 138, { g, size: 11, min: 10, weight: 600 });
        g.font = mt.font;
        g.fillStyle = dk ? c.text : c.card;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText(mt.text, 16, 22.5);
      }
      let top = 0;
      for (let i = 0; i < res.stood; i++) top += SIZE[foods[i]!.kind][1];
      const lift = Math.max(0, top + 110 - TRAY_Y);
      g.fillStyle = dk ? mix(pl.brown, c.card, 0.3) : pl.brown;
      if (lift < H - TRAY_Y) g.fillRect(0, TRAY_Y + 4 + lift, W - 36, H - TRAY_Y - 4);
      // the line: today's food on the counter under the sneeze guard (before you start)
      if (!run) {
        const shelfY = 92;
        g.fillStyle = dk ? mix(c.secondaryText, c.card, 0.4) : mix(pl.shade, c.card, 0.2);
        g.fillRect(8, shelfY, W - 52, 6);
        g.fillStyle = mix(pl.sky, c.card, dk ? 0.6 : 0.3);
        g.beginPath();
        g.roundRect(8, 44, W - 52, 4, 2);
        g.fill();
        const n = s.foods.length;
        const slot = (W - 60) / Math.max(1, n);
        s.foods.forEach((fd, i) => food(g, theme, fd.kind, 12 + slot * (i + 0.5), shelfY, now / 300 + i));
      }

      // camera: once the tower passes the top, pan up
      const lean = playing || !run ? Math.max(-0.09, Math.min(0.09, (res.com / (TRAY / 2)) * 0.07)) + Math.sin(now / 500) * Math.min(0.012, res.stood * 0.001) : 0;
      g.save();
      g.translate(cx, TRAY_Y + lift);
      g.rotate(lean);
      // tray
      g.fillStyle = dk ? c.secondaryText : mix(pl.orange, pl.brown, 0.25);
      g.beginPath();
      g.roundRect(-TRAY / 2 - 4, -2, TRAY + 8, 8, 3);
      g.fill();
      g.fillStyle = mix(pl.orange, c.card, 0.25);
      g.beginPath();
      g.roundRect(-TRAY / 2, -5, TRAY, 6, 2);
      g.fill();
      let y = -5;
      const fallT = over && res.fell >= 0 ? Math.min(1, (now - lastAt) / 900) : 0;
      for (let i = 0; i < Math.min(drops.length, foods.length); i++) {
        const k = foods[i]!.kind;
        const failing = over && res.fell >= 0 && i >= res.fell;
        const side = res.com >= (i ? drops[i - 1]! : 0) ? 1 : -1;
        if (failing) {
          g.save();
          g.translate(drops[i]! + side * fallT * 70, y + fallT * fallT * 180);
          g.rotate(side * fallT * 1.4);
          food(g, theme, k, 0, 0, now / 90);
          g.restore();
        } else food(g, theme, k, drops[i]!, y, now / 120 + i);
        y -= SIZE[k][1];
      }
      // empty tray at rest: a dashed outline of the first piece
      if (!run) {
        g.strokeStyle = mix(c.secondaryText, pl.wall, 0.2);
        g.setLineDash([4, 3]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(-31, -18, 62, 13, 3);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();

      // the swinging piece, held by a serving scoop
      if (playing) {
        const next = foods[drops.length]!;
        const sx = cx + swing(now, drops.length);
        const sy = Math.max(48, TRAY_Y + lift - top - 70);
        g.strokeStyle = c.secondaryText;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, 0);
        g.lineTo(sx, sy - SIZE[next.kind][1] - 4);
        g.stroke();
        food(g, theme, next.kind, sx, sy, now / 80);
        g.strokeStyle = c.primary;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.moveTo(sx, sy + 3);
        g.lineTo(sx, Math.min(TRAY_Y, TRAY_Y + lift - top - 6));
        g.stroke();
        g.setLineDash([]);
      }

      // the ruler: friends at the height they reached
      g.fillStyle = dk ? mix(c.wash, c.card, 0.2) : c.card;
      g.beginPath();
      g.roundRect(W - 30, railTop - 10, 22, TRAY_Y - railTop + 20, 11);
      g.fill();
      g.fillStyle = c.divider;
      for (let n = 0; n <= railMax; n += 5) g.fillRect(W - 24, railY(n), 10, 1);
      if (run) {
        g.fillStyle = c.primary;
        g.beginPath();
        g.roundRect(W - 25, railY(res.stood) - 2, 12, 4, 2);
        g.fill();
      }
      return playing || (over && now - lastAt < 1000);
    };

    const onPointer = (e: { type: string }) => {
      if (e.type !== "down" || !run || !playing) return;
      const now = clock.peek();
      const x = swing(now, drops.length);
      haptic("light");
      setLocal({ run: run.at, drops: [...drops, x], at: [...(local.run === run.at ? local.at : []), now] });
    };

    const said = board.find((p) => p.said);
    const leader = board[0];
    const label = run
      ? `Tray with ${res.stood} items stacked${over ? ", it fell" : ""}`
      : `Empty tray at ${s.menu || s.title}. Board: ${board.map((p) => `${p.name} ${p.best}`).join(", ") || "nobody yet"}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={label} drag={playing} draw={draw} onPointer={onPointer} />
          {board.slice(0, 6).map((p, i) => (
            <div key={p.who} style={{ position: "absolute", left: W - 30 - (i % 2) * 14, top: railY(p.best) - 10, display: "flex", pointerEvents: "none", zIndex: 6 - i }}>
              <Avatar user={member(p)} size={20} />
            </div>
          ))}
          {run ? (
            <div style={{ position: "absolute", left: 8, top: 44, padding: "2px 10px", borderRadius: 12, background: c.card, color: c.text, fontSize: 20, fontWeight: 700, lineHeight: "26px", pointerEvents: "none" }}>{String(res.stood)}</div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 20, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
          {playing
            ? `Tap anywhere to drop · ${foods[drops.length]?.name ?? "food"}, then ${foods[drops.length + 1]?.name ?? ""}`
            : over
              ? `${res.stood} stacked · ${res.fell === res.stood ? "slid off" : "it tipped"} at ${foods[res.stood]?.name ?? "the top"}`
              : leader
                ? `${board.slice(0, 3).map((p) => `${first(nameOf(p))} ${p.best}`).join(" · ")}${said ? ` · ${first(nameOf(said))}: “${said.said}”` : ""}`
                : "Nobody has stacked yet · first tower sets the bar"}
        </div>
        <div style={{ marginTop: 8 }}>
          {over ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "done", drops });
                setLocal({ toast: local.toast + 1 });
              }}
            >
              {`Post ${res.stood}`}
            </Button>
          ) : playing ? (
            <Button kind="secondary" wide onClick={() => setLocal({ run: run.at, drops: [...drops, SPAN / 2], at: [...local.at, clock.peek()] })}>
              Give up
            </Button>
          ) : (
            <Button
              kind="primary"
              wide
              disabled={pending}
              onClick={() => {
                haptic("medium");
                dispatch({ t: "start" });
              }}
            >
              {pending ? "Grabbing a tray" : mine ? `Beat your ${mine.best}` : leader ? `Beat ${first(nameOf(leader))}'s ${leader.best}` : "Grab a tray"}
            </Button>
          )}
        </div>
        {local.toast > 0 && !run && mine ? <Toast key={local.toast}>{`${mine.best} is your best`}</Toast> : null}
      </div>
    );
  },
});
