import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Rock skip: a two-minute game at Lake Wren. The lake from the side, a flat stone on the shore.
// Pull the stone back and let go: how hard and how flat you throw decide the skips, and the lake
// adds a little wobble of its own. Everyone's best stone stays out on the water as a buoy with
// their face on it.

type Params = {
  /** Where: "Lake Wren" */
  lake: string;
  /** Throws already made: skips 0 to 15, and a line */
  throws: { who: string; skips: number; note?: string }[];
};

// @params
const P: Params = {
  lake: "Lake Wren",
  throws: [
    { who: "Maya", skips: 11, note: "18 degrees. it's in the spreadsheet" },
    { who: "Will", skips: 9, note: "the Sube taught me physics" },
    { who: "Tsai Lin", skips: 7 },
    { who: "Arun", skips: 6, note: "flat like a rice cooker lid" },
    { who: "Calvin", skips: 2, note: "my arm was still asleep" },
  ],
};
// @end params

type Throw = { who: string; name: string; skips: number; dist: number; at: number; note: string };
type State = { lake: string; throws: Throw[]; tries: Record<string, number> };
type Action = { t: "skip"; power: number; angle: number };
type Local = { ax: number; ay: number; aiming: boolean; toast: number };

const H = 216;
const WATER = 120;
const STONE = { x: 46, y: 168 };
const MAX_THROWS = 30;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const okInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** The throw: power 0-100 and angle 0-60 degrees; flat (about 18) and hard skips most. */
function physics(power: number, angle: number, seed: number): { skips: number; dist: number } {
  const flat = Math.max(0, 1 - Math.abs(angle - 18) / 30);
  const wobble = rng(seed).int(3) - 1;
  const skips = Math.max(0, Math.min(15, Math.round((power / 100) * 13 * flat) + (power > 10 ? wobble : 0)));
  const dist = Math.max(0, Math.min(1000, Math.round(power * 6 * (0.4 + 0.6 * flat)) + skips * 25));
  return { skips, dist };
}
const distFor = (skips: number) => Math.min(1000, 120 + skips * 62);
const best = (s: State) => {
  const m = new Map<string, Throw>();
  for (const t of s.throws) {
    const b = m.get(t.who);
    if (!b || t.skips > b.skips || (t.skips === b.skips && t.dist > b.dist)) m.set(t.who, t);
  }
  return [...m.values()].sort((a, b) => b.skips - a.skips || b.dist - a.dist || a.at - b.at);
};

function initState(ctx: Ctx): State {
  const throws: Throw[] = [];
  const tries: Record<string, number> = {};
  for (const t of Array.isArray(P.throws) ? P.throws : []) {
    const name = clean(t?.who, 20);
    if (!name || !okInt(t.skips, 0, 15) || throws.length >= 12) continue;
    const m = findMember(ctx, name);
    const who = m ? m.id : `o:${name}`;
    if (throws.some((x) => x.who === who)) continue;
    throws.push({ who, name: m ? m.name : name, skips: t.skips, dist: distFor(t.skips), at: 0, note: clean(t.note, 50) });
    tries[who] = 1;
  }
  return { lake: clean(P.lake, 24) || "the lake", throws, tries };
}

function hops(t: Throw, w: number) {
  // Touch points along the water: each hop shorter than the last, ending at the throw's distance.
  const end = 70 + ((w - 100) * t.dist) / 1000;
  const pts: number[] = [];
  const n = t.skips;
  let total = 0;
  for (let i = 0; i <= n; i++) total += Math.pow(0.82, i);
  let x = 70;
  for (let i = 0; i <= n; i++) {
    x += ((end - 70) * Math.pow(0.82, i)) / total;
    pts.push(x);
  }
  return pts;
}

function buoyRows(tops: Throw[], w: number) {
  const out = tops.map((t) => ({ t, x: hops(t, w).at(-1)!, row: 0 })).sort((a, b) => a.x - b.x);
  out.forEach((q, i) => {
    if (i > 0 && Math.abs(q.x - out[i - 1]!.x) < 26 && out[i - 1]!.row === 0) q.row = 1;
  });
  return out;
}

function drawLake(g: CanvasRenderingContext2D, f: DrawFrame, s: State, live: Throw | null, aim: { x: number; y: number } | null, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const t = f.now / 1000;
  const sky = g.createLinearGradient(0, 0, 0, WATER);
  sky.addColorStop(0, mix(p.blue, p.sky, 0.45));
  sky.addColorStop(1, p.sky);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, WATER);
  g.fillStyle = p.cream;
  g.beginPath();
  g.arc(w - 50, 34, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = mix(p.leaf, p.sky, 0.45);
  g.beginPath();
  g.moveTo(0, WATER);
  for (let x = 0; x <= w; x += 10) g.lineTo(x, WATER - 26 - 14 * Math.sin(x / 60) - 6 * Math.sin(x / 17));
  g.lineTo(w, WATER);
  g.fill();
  g.fillStyle = p.leaf;
  g.beginPath();
  for (let k = 0; k < 16; k++) {
    const x = (k + 0.5) * (w / 16);
    g.moveTo(x - 6, WATER);
    g.lineTo(x, WATER - 18 - (k % 3) * 5);
    g.lineTo(x + 6, WATER);
  }
  g.fill();
  const water = g.createLinearGradient(0, WATER, 0, H);
  water.addColorStop(0, mix(p.blue, p.sky, 0.3));
  water.addColorStop(1, mix(p.blue, p.dark, 0.25));
  g.fillStyle = water;
  g.fillRect(0, WATER, w, H - WATER);
  g.strokeStyle = p.paper;
  g.globalAlpha = 0.35;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let k = 0; k < 14; k++) {
    const x = ((k * 61) % w) + 5 * Math.sin(t * 0.8 + k);
    const y = WATER + 10 + ((k * 23) % (H - WATER - 20));
    g.moveTo(x, y);
    g.lineTo(x + 14, y);
  }
  g.stroke();
  g.globalAlpha = 1;
  // The shore with a dock post and the stone.
  g.fillStyle = mix(p.crust, p.brown, 0.3);
  g.beginPath();
  g.moveTo(0, 150);
  g.quadraticCurveTo(60, 146, 86, H);
  g.lineTo(0, H);
  g.fill();
  // Buoys: everyone's best, a float with a little pole up to their face.
  const flying = (b: Throw) => !!live && live.who === b.who && f.now - live.at < 2400;
  const buoys = buoyRows(best(s), w).filter((q) => !flying(q.t));
  g.strokeStyle = p.ink;
  g.lineWidth = 1.5;
  g.beginPath();
  for (const q of buoys) {
    g.moveTo(q.x, WATER + 20 + 2 * Math.sin(t * 2 + q.x));
    g.lineTo(q.x, WATER - 10 - q.row * 26);
  }
  g.stroke();
  g.fillStyle = p.red;
  g.beginPath();
  for (const q of buoys) {
    const y = WATER + 22 + 2 * Math.sin(t * 2 + q.x);
    g.moveTo(q.x + 6, y);
    g.arc(q.x, y, 6, 0, Math.PI * 2);
  }
  g.fill();
  // A throw in flight: the stone arcs between touch points, rings where it touched.
  if (live && f.now - live.at < 2400) {
    const e = Math.max(0, f.now - live.at);
    const pts = hops(live, w);
    const per = 2000 / (pts.length + 1);
    const k = Math.min(pts.length, Math.floor(e / per));
    g.strokeStyle = p.paper;
    g.lineWidth = 1.5;
    for (let i = 0; i < k; i++) {
      const age = (e - (i + 1) * per) / 900;
      if (age > 1) continue;
      g.globalAlpha = 1 - age;
      g.beginPath();
      g.ellipse(pts[i]!, WATER + 30, 6 + 16 * age, 2 + 4 * age, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    if (k < pts.length) {
      const x0 = k === 0 ? STONE.x : pts[k - 1]!;
      const x1 = pts[k]!;
      const u = (e - k * per) / per;
      const hop = (k === 0 ? 40 : 26 * Math.pow(0.8, k)) * Math.sin(Math.PI * u);
      const x = x0 + (x1 - x0) * u;
      const y = (k === 0 ? STONE.y + (WATER + 30 - STONE.y) * u : WATER + 30) - hop;
      g.fillStyle = p.soft;
      g.beginPath();
      g.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    return true;
  }
  // The stone waiting on the shore, or pulled back on its line.
  const sx = aim ? aim.x : STONE.x;
  const sy = aim ? aim.y : STONE.y;
  if (aim) {
    g.strokeStyle = p.paper;
    g.setLineDash([4, 5]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx, sy);
    const dx = STONE.x - sx;
    const dy = STONE.y - sy;
    g.lineTo(STONE.x + dx * 2.2, STONE.y + dy * 2.2);
    g.stroke();
    g.setLineDash([]);
  }
  g.fillStyle = p.soft;
  g.beginPath();
  g.ellipse(sx, sy, 13, 6.5, -0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = mix(p.soft, p.paper, 0.5);
  g.beginPath();
  g.ellipse(sx - 2, sy - 1.5, 5, 2, -0.15, 0, Math.PI * 2);
  g.fill();
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Rock skip",
  summary: (s, ctx) => {
    const b = best(s)[0];
    if (!b) return `Rock skip at ${s.lake}: nobody has thrown yet`;
    const name = ctx.members.find((m) => m.id === b.who)?.name ?? b.name;
    return `Rock skip at ${s.lake}: ${name} leads with ${b.skips} skips · ${best(s).length} threw`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "skip" || !inChat(ctx, meta.user) || !okInt(a.power, 0, 100) || !okInt(a.angle, 0, 60)) return s;
    const { skips, dist } = physics(a.power, a.angle, meta.seed);
    const name = ctx.members.find((m) => m.id === meta.user)?.name ?? "Friend";
    const throws = [...s.throws, { who: meta.user, name, skips, dist, at: meta.time, note: "" }].slice(-MAX_THROWS);
    return { ...s, throws, tries: { ...s.tries, [meta.user]: (s.tries[meta.user] ?? 0) + 1 } };
  },

  invariants: {
    "skips and distance stay on the lake": (s) => s.throws.every((t) => okInt(t.skips, 0, 15) && okInt(t.dist, 0, 1000) && t.at >= 0),
    "the lake keeps the last 30 throws": (s) => s.throws.length <= MAX_THROWS,
    "everyone on the water has thrown": (s) => s.throws.every((t) => (s.tries[t.who] ?? 0) >= 1),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a throw adds exactly mine, decided by power, angle and the lake": (p, n, a, m) => {
      if (a.t !== "skip" || p === n) return true;
      const t = n.throws[n.throws.length - 1];
      if (!t || t.who !== m.user || t.at !== m.time) return false;
      const flat = Math.max(0, 1 - Math.abs(a.angle - 18) / 30);
      const wob = a.power > 10 ? rng(m.seed).int(3) - 1 : 0;
      const sk = Math.max(0, Math.min(15, Math.round((a.power / 100) * 13 * flat) + wob));
      const di = Math.max(0, Math.min(1000, Math.round(a.power * 6 * (0.4 + 0.6 * flat)) + sk * 25));
      return t.skips === sk && t.dist === di;
    },
    "older throws are kept as they were": (p, n, a) => {
      if (a.t !== "skip" || p === n) return true;
      const keep = Math.min(p.throws.length, 29);
      const old = p.throws.slice(p.throws.length - keep);
      return n.throws.length === keep + 1 && old.every((t, i) => n.throws[i] === t);
    },
    "each throw counts once": (p, n, a, m) => a.t !== "skip" || p === n || ((n.tries[m.user] ?? 0) === (p.tries[m.user] ?? 0) + 1 && Object.keys(n.tries).every((k) => k === m.user || n.tries[k] === p.tries[k])),
  },

  arbitrary: (_s, _u, r) => ({ t: "skip", power: r.int(101), angle: r.int(61) }),

  local: { ax: 0, ay: 0, aiming: false, toast: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const tops = best(confirmed);
    const mineBest = tops.find((t) => t.who === me);
    const last = confirmed.throws[confirmed.throws.length - 1] ?? null;
    const myLast = [...confirmed.throws].reverse().find((t) => t.who === me);
    const live = last && last.at > 0 ? last : null;
    const tries = state.tries[me] ?? 0;
    const mem = (t: Throw): Member => members.find((m) => m.id === t.who) ?? { id: t.who, name: t.name };
    const aimOf = (x: number, y: number) => {
      const dx = Math.max(-80, Math.min(0, x - STONE.x));
      const dy = Math.max(-10, Math.min(60, y - STONE.y));
      return { x: STONE.x + dx, y: STONE.y + dy };
    };
    const throwIt = (power: number, angle: number) => {
      haptic("medium");
      dispatch({ t: "skip", power, angle });
      setLocal({ aiming: false, toast: local.toast + 1 });
    };
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type === "down") {
        if (Math.hypot(e.x - STONE.x, e.y - STONE.y) < 60) setLocal({ aiming: true, ax: STONE.x, ay: STONE.y });
      } else if (e.type === "move") {
        if (local.aiming) {
          const q = aimOf(e.x, e.y);
          setLocal({ ax: q.x, ay: q.y });
        }
      } else if (local.aiming) {
        const q = aimOf(e.x, e.y);
        const pull = Math.hypot(q.x - STONE.x, q.y - STONE.y);
        if (pull < 10) return setLocal({ aiming: false });
        const power = Math.min(100, Math.round((pull / 90) * 100));
        const angle = Math.max(0, Math.min(60, Math.round((Math.atan2(q.y - STONE.y, STONE.x - q.x) * 180) / Math.PI)));
        throwIt(power, angle);
      }
    };
    // Buoy faces sit over each best throw.
    const faces = buoyRows(tops, W).filter((q) => !(live && live.who === q.t.who && running(live.at, 2400) !== null));
    const note = tops.find((t) => t.note && members.some((m) => m.id === t.who));
    const status = pending
      ? "Throwing…"
      : myLast && myLast.at > 0
        ? `${myLast.skips} ${myLast.skips === 1 ? "skip" : "skips"}${mineBest && mineBest !== myLast ? ` · your best is ${mineBest.skips}` : myLast === tops[0] ? " · you lead" : ""}`
        : note
          ? `${mem(note).name}: "${note.note}"`
          : "Pull the stone back and let go. Flatter skips more.";

    return (
      <div>
        <CardHeader title={`Skip it at ${state.lake}`} subtitle={`${tops.length} threw · best stone floats a buoy`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden" }}>
          <Canvas
            height={H}
            drag
            label={`${state.lake} with ${tops.length} buoys; best ${tops[0]?.skips ?? 0} skips`}
            draw={(g, f) => drawLake(g, f, confirmed, live, local.aiming ? { x: local.ax, y: local.ay } : null, theme)}
            onPointer={onPointer}
          />
          {faces.map((f) => (
            <div key={f.t.who} style={{ position: "absolute", left: f.x - 12, top: WATER - 34 - f.row * 26, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none", transition: "left 600ms ease-out" }}>
              <span style={{ display: "flex", borderRadius: 13, boxShadow: `0 0 0 2px ${f.t.who === me ? c.primary : c.card}` }}>
                <Avatar user={mem(f.t)} size={24} />
              </span>
            </div>
          ))}
          {!local.aiming && !pending && tries === 0 ? (
            <div style={{ position: "absolute", left: STONE.x + 20, top: STONE.y + 12, padding: "1px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, fontWeight: 600, lineHeight: "18px", whiteSpace: "nowrap", pointerEvents: "none" }}>
              Pull me back
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {tops.slice(0, W < 340 ? 4 : 5).map((t, i) => {
            const label = fitText(`${t.skips}`, 30, { size: 13, weight: 700 });
            return (
              <div key={t.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", borderRadius: 15, background: t.who === me ? c.selected : c.wash, fontSize: 13, lineHeight: "16px", whiteSpace: "nowrap" }}>
                <Avatar user={mem(t)} size={24} />
                <span style={{ fontWeight: 700, color: c.text }}>{label.text}</span>
                {i === 0 ? <span style={{ color: c.secondaryText }}>skips</span> : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
          <Button kind="primary" disabled={pending} onClick={() => throwIt(70, 20)}>
            {tries ? "Throw again" : "Skip one"}
          </Button>
        </div>
        {local.toast > 0 && !pending && myLast && myLast.at > 0 ? <Toast key={local.toast}>{myLast.skips >= (tops[0]?.skips ?? 0) ? `${myLast.skips} skips · new best on the lake` : `${myLast.skips} ${myLast.skips === 1 ? "skip" : "skips"}`}</Toast> : null}
      </div>
    );
  },
});
