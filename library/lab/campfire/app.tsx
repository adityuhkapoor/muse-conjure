import { defineApp, Avatar, Button, Canvas, CardHeader, Facepile, Toast, clock, haptic, innerWidth, mix, pal, running, rng, seedOf, tween, type Ctx } from "@muse/app";

// Campfire: the club's group fire, burning in the corner of the page. Every log someone tosses
// keeps it going for a few hours and seats their face around it with a line they said; with
// nobody adding, it burns down to embers. Toss a log and it arcs in, the flames flare, sparks go
// up. Tap the fire to poke it.

type Params = {
  /** Card title */
  title: string;
  /** Group name */
  group: string;
  /** Hours one log keeps burning */
  hours: number;
  /** Things to say with a log, as chips */
  lines: string[];
  /** Logs already on: who, how many hours ago, and what they said */
  logs: { name: string; hoursAgo: number; said: string }[];
};

// @params
const P: Params = {
  title: "Campfire",
  group: "Eastfield Outing Club",
  hours: 6,
  lines: ["Long week", "Lake Wren Saturday?", "Missing the trail", "Who has marshmallows"],
  logs: [
    { name: "Will", hoursAgo: 1, said: "drove the sube to lake wren. it smells like smoke now" },
    { name: "Maya", hoursAgo: 2, said: "saturday hike spreadsheet is up, tab 3" },
    { name: "Tsai Lin", hoursAgo: 4, said: "no aux at the fire. acoustic only" },
    { name: "Arun", hoursAgo: 5, said: "rice cooker s'mores. trust me" },
  ],
};
// @end params

type Log = { by: string; said: string; at: number; ago: number };
type State = { title: string; group: string; hours: number; lines: string[]; logs: Log[] };
type Action = { t: "toss"; line: number };
type Local = { line: number; poke: number };

const HOUR = 3_600_000;
const MAX = 40;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const lastBy = (s: State, u: string) => s.logs.filter((l) => l.by === u && l.at > 0).reduce((t, l) => Math.max(t, l.at), 0);
const arc = tween({ duration: 800, easing: "easeInOut" });

function initState(ctx: Ctx): State {
  const hours = isInt(P.hours, 1, 48) ? P.hours : 6;
  const logs: Log[] = [];
  for (const l of Array.isArray(P.logs) ? P.logs : []) {
    const m = ctx.members.find((x) => x.id === l?.name || x.name.toLowerCase() === clean(l?.name, 40).toLowerCase());
    if (!m || logs.length >= MAX) continue;
    logs.push({ by: m.id, said: clean(l.said, 70), at: 0, ago: isInt(l.hoursAgo, 0, hours) ? l.hoursAgo : 0 });
  }
  const lines = (Array.isArray(P.lines) ? P.lines : []).map((x) => clean(x, 28)).filter(Boolean).slice(0, 4);
  return { title: clean(P.title, 40) || "Campfire", group: clean(P.group, 40), hours, lines: lines.length ? lines : ["Just stopping by"], logs };
}

export default defineApp<State, Action, Local>({
  name: "Campfire",
  summary: (s, ctx) => {
    const last = [...s.logs].sort((a, b) => (b.at || -b.ago) - (a.at || -a.ago))[0];
    const who = last ? (ctx.members.find((m) => m.id === last.by)?.name ?? "someone") : "";
    return `${s.group || s.title} fire · ${s.logs.length} ${s.logs.length === 1 ? "log" : "logs"} on${who ? ` · last log from ${who}` : " · waiting for the first log"}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "toss" || !isInt(a.line, 0, s.lines.length - 1)) return s;
    const last = lastBy(s, m.user);
    if (last > 0 && m.time - last < HOUR) return s;
    const logs = [...s.logs, { by: m.user, said: s.lines[a.line]!, at: m.time, ago: 0 }];
    return { ...s, logs: logs.slice(-MAX) };
  },

  onMembers: (s, ctx) => (s.logs.every((l) => inChat(ctx, l.by)) ? s : { ...s, logs: s.logs.filter((l) => inChat(ctx, l.by)) }),

  invariants: {
    "logs are from the chat": (s, ctx) => s.logs.every((l) => inChat(ctx, l.by)),
    "at most 40 logs kept": (s) => s.logs.length <= MAX,
    "one log an hour per person": (s) => {
      const by: { [u: string]: number[] } = {};
      for (const l of s.logs) if (l.at > 0) (by[l.by] ??= []).push(l.at);
      return Object.values(by).every((ts) => ts.every((t, i) => i === 0 || t - ts[i - 1]! >= HOUR));
    },
    "lines are what people can say": (s) => s.logs.every((l) => l.at === 0 || s.lines.includes(l.said)),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a toss adds one log by the actor, now": (p, n, a, m) => {
      if (p === n) return true;
      const l = n.logs[n.logs.length - 1];
      return !!l && l.by === m.user && l.at === m.time && l.said === p.lines[a.line] && (n.logs.length === p.logs.length + 1 || n.logs.length === MAX);
    },
    "a rested hand can always toss": (p, n, a, m, ctx) => p !== n || !(inChat(ctx, m.user) && isInt(a.line, 0, p.lines.length - 1) && (lastBy(p, m.user) === 0 || m.time - lastBy(p, m.user) >= HOUR)),
    "old logs never change": (p, n) => n.logs.length < MAX ? p.logs.every((l, i) => l === n.logs[i]) : true,
  },

  arbitrary: (s, _u, r) => ({ t: "toss", line: r.int(s.lines.length) }),

  local: { line: 0, poke: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = 210;
    const span = state.hours * HOUR;
    const live = state.logs.some((l) => l.at > 0);
    const now = live ? clock.value : 0;
    const ageOf = (l: Log) => (l.at > 0 ? Math.max(0, now - l.at) : l.ago * HOUR);
    const burning = state.logs.filter((l) => ageOf(l) < span);
    const warmth = burning.reduce((t, l) => t + (1 - ageOf(l) / span), 0);
    const flame = Math.max(0.18, Math.min(1.35, 0.2 + warmth * 0.32));
    const mine = lastBy(state, me);
    const wait = mine > 0 ? Math.max(0, mine + HOUR - now) : 0;
    const cx = W / 2, cy = H * 0.72;
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? "Someone"));

    // Who sits at the fire: the latest log per person still burning, around an ellipse.
    const seated: Log[] = [];
    for (const l of [...burning].sort((a, b) => ageOf(a) - ageOf(b))) if (!seated.some((x) => x.by === l.by)) seated.push(l);
    const SPOTS: [number, number][] = [[-0.34, 0], [0.34, 0], [-0.2, -24], [0.2, -24], [-0.27, 32], [0.27, 32]];
    const seatPos = (k: number, _n: number): [number, number] => [cx + SPOTS[k % 6]![0] * W, cy + SPOTS[k % 6]![1]];
    const order = seated.slice(0, 6);

    const myLog = [...confirmed.logs].reverse().find((l) => l.by === me && l.at > 0);
    const tossE = myLog ? running(myLog.at, 800) : null;
    const flareE = myLog ? running(myLog.at + 700, 1400) : null;
    const pokeE = local.poke > 0 ? running(local.poke, 900) : null;
    const flare = (flareE === null ? 0 : Math.sin((flareE / 1400) * Math.PI) * 0.35) + (pokeE === null ? 0 : Math.sin((pokeE / 900) * Math.PI) * 0.2);

    const stars = (() => {
      const r = rng(seedOf("campfire-stars"));
      return Array.from({ length: 46 }, () => [r.next(), r.next() * 0.55, r.next()] as const);
    })();
    const trees = (() => {
      const r = rng(seedOf("campfire-trees"));
      return Array.from({ length: 11 }, (_v, i) => [i / 10 + (r.next() - 0.5) * 0.06, 0.45 + r.next() * 0.25, 0.08 + r.next() * 0.05] as const);
    })();

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const w = f.width, h = f.height, t = f.now / 1000;
      const night = mix(p.dark, p.blue, 0.18);
      g.fillStyle = night;
      g.beginPath();
      g.roundRect(0, 0, w, h, 12);
      g.fill();
      // stars, twinkling in two batches
      for (const k of [0, 1]) {
        const path = new Path2D();
        stars.forEach(([x, y, z], i) => {
          if (i % 2 !== k) return;
          path.moveTo(x * w + 1.2, y * h);
          path.arc(x * w, y * h, 0.6 + z, 0, Math.PI * 2);
        });
        g.globalAlpha = 0.45 + 0.35 * Math.sin(t * 1.3 + k * 2);
        g.fillStyle = p.cream;
        g.fill(path);
      }
      g.globalAlpha = 1;
      // moon
      g.fillStyle = p.cream;
      g.beginPath();
      g.arc(w * 0.84, h * 0.17, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = night;
      g.beginPath();
      g.arc(w * 0.84 + 6, h * 0.17 - 3, 11, 0, Math.PI * 2);
      g.fill();
      // trees
      const tp = new Path2D();
      for (const [x, y, s] of trees) {
        const bx = x * w, by = y * h + 26, tw = s * w;
        tp.moveTo(bx, by - tw * 2.2);
        tp.lineTo(bx + tw * 0.6, by);
        tp.lineTo(bx - tw * 0.6, by);
        tp.closePath();
      }
      g.fillStyle = mix(night, p.leaf, 0.35);
      g.fill(tp);
      // ground and glow
      g.fillStyle = mix(night, p.brown, 0.35);
      g.fillRect(0, h * 0.66, w, h * 0.34);
      const glow = Math.min(1, flame + flare);
      const grad = g.createRadialGradient(cx, cy, 4, cx, cy, 70 + 60 * glow);
      grad.addColorStop(0, p.orange);
      grad.addColorStop(1, night);
      g.globalAlpha = 0.25 + 0.3 * glow;
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      // stones
      const sp = new Path2D();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.05 + (i / 8) * Math.PI * 0.9;
        const sx = cx + Math.cos(a) * 40, sy = cy + 10 + Math.sin(a) * 7;
        sp.moveTo(sx + 8, sy);
        sp.ellipse(sx, sy, 8, 5, 0, 0, Math.PI * 2);
      }
      g.fillStyle = mix(p.soft, night, 0.35);
      g.fill(sp);
      // logs
      g.fillStyle = p.brown;
      g.save();
      g.translate(cx, cy + 4);
      g.rotate(0.28);
      g.beginPath();
      g.roundRect(-30, -5, 60, 10, 5);
      g.fill();
      g.rotate(-0.56);
      g.beginPath();
      g.roundRect(-30, -5, 60, 10, 5);
      g.fill();
      g.restore();
      // flames: three layers
      const fh = 70 * (flame + flare);
      const layers: [string, number, number][] = [[p.red, 1, 26], [p.orange, 0.72, 19], [p.yellow, 0.45, 12]];
      for (const [col, k, wd] of layers) {
        const hh = fh * k;
        const sway = Math.sin(t * 7 + k * 3) * 4 * k + Math.sin(t * 3.1) * 2;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(cx - wd, cy);
        g.quadraticCurveTo(cx - wd * 1.1, cy - hh * 0.5, cx + sway, cy - hh - Math.sin(t * 9 + k) * 4);
        g.quadraticCurveTo(cx + wd * 1.1, cy - hh * 0.5, cx + wd, cy);
        g.closePath();
        g.fill();
      }
      // sparks
      const sk = new Path2D();
      const nSparks = Math.round(4 + 10 * (flame + flare));
      for (let i = 0; i < nSparks; i++) {
        const ph = (t * 0.6 + i * 0.137) % 1;
        const x = cx + Math.sin(i * 12.9 + t * 2) * 14 * ph + (i % 3 - 1) * 6;
        const y = cy - 20 - ph * (60 + 50 * flame);
        sk.moveTo(x + 1.4, y);
        sk.arc(x, y, 1.4 * (1 - ph) + 0.4, 0, Math.PI * 2);
      }
      g.fillStyle = p.yellow;
      g.fill(sk);
      // a tossed log flying in
      if (tossE !== null) {
        const q = arc(tossE);
        const x = w - 30 + (cx - (w - 30)) * q;
        const y = h - 10 + (cy - (h - 10)) * q - Math.sin(q * Math.PI) * 80;
        g.save();
        g.translate(x, y);
        g.rotate(q * 6);
        g.fillStyle = p.brown;
        g.beginPath();
        g.roundRect(-16, -5, 32, 10, 5);
        g.fill();
        g.restore();
      }
      return true;
    };

    const faces = order.map((l, k) => {
      const [x, y] = seatPos(k, order.length);
      const warm = 1 - ageOf(l) / span;
      return (
        <span key={`s${l.by}`} style={{ position: "absolute", left: x - 13, top: y - 13, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${mix(p.orange, p.dark, 1 - warm)}`, pointerEvents: "none" }}>
          <Avatar user={l.by} size={26} />
        </span>
      );
    });
    const latest = seated[0];
    const bubble = latest ? (
      <div style={{ position: "absolute", left: 10, right: 10, top: 10, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}>
        <span style={{ maxWidth: W * 0.7, padding: "4px 10px", borderRadius: 12, background: mix(p.dark, p.cream, 0.12), color: p.cream, fontSize: 12, lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {`${nameOf(latest.by)}: "${latest.said}"`}
        </span>
      </div>
    ) : null;
    const state1 = warmth >= 2 ? "Roaring" : warmth >= 1 ? "Going strong" : warmth > 0.2 ? "Burning low" : "Down to embers";
    const canToss = wait <= 0;
    const lineIx = Math.min(local.line, state.lines.length - 1);

    return (
      <div>
        <CardHeader title={state.title} subtitle={[state.group, state1.toLowerCase()].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Campfire, ${state1.toLowerCase()}, ${burning.length} ${burning.length === 1 ? "log" : "logs"} burning`} draw={draw}
            onPointer={(e) => { if (e.type === "down") { setLocal({ poke: clock.value }); haptic("light"); } }} />
          {faces}
          {bubble}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
          <button type="button" aria-label={`Say with your log: ${state.lines[lineIx]}. Tap for another line`} onClick={() => { setLocal({ line: (lineIx + 1) % state.lines.length }); haptic("light"); }}
            style={{ flex: 1, minWidth: 0, height: 44, padding: "0 12px", border: 0, borderRadius: 22, background: c.secondaryButton, color: c.secondaryButtonText, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", font: "inherit" }}>
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M13 6.5A5 5 0 1 0 13.4 9" fill="none" stroke={c.secondaryButtonText} stroke-width={1.8} stroke-linecap="round" />
              <path d="M13.8 2.6v4h-4" fill="none" stroke={c.secondaryButtonText} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${state.lines[lineIx]}"`}</span>
          </button>
          <div style={{ flexShrink: 0 }}>
            <Button kind="primary" disabled={!canToss} onClick={() => { dispatch({ t: "toss", line: lineIx }); haptic("success"); }}>{seated.length ? "Toss a log" : "Start it"}</Button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {seated.length ? <Facepile users={seated.map((l) => l.by)} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {canToss ? (seated.length ? `${seated.length} around the fire · ${burning.length} logs burning` : "Nobody's here yet · start the fire") : `Your log is on · next one in ${Math.ceil(wait / 60000)} min`}
          </span>
        </div>
        {myLog && running(myLog.at, 2400) !== null ? <Toast key={myLog.at}>Log's on · the fire's good for a while</Toast> : null}
      </div>
    );
  },
});
