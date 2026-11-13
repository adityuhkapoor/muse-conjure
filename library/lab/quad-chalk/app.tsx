import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Meta,
} from "@muse/app";

// Quad chalk: a stretch of sidewalk on the Quad everyone can draw on with chalk. Each friend's
// chalk is their own color and their doodles carry a little face tag. Pick a stick from the tray,
// drag to draw, let go and it's on the pavement for everyone; undo takes back your last line.
// It rains Thursday, so it's all temporary anyway.

type Params = {
  /** Where: "the Quad" */
  place: string;
  /** "rain Thursday" */
  forecast: string;
  /** What friends already drew; kinds are drawn for you: grid, cooker, note, clocks, car, sun, heart, star */
  doodles: { who: string; kind: string; x: number; y: number }[];
};

// @params
const P: Params = {
  place: "the Quad",
  forecast: "rain Thursday",
  doodles: [
    { who: "Maya", kind: "grid", x: 130, y: 260 },
    { who: "Arun", kind: "cooker", x: 430, y: 250 },
    { who: "Tsai Lin", kind: "note", x: 720, y: 270 },
    { who: "Calvin", kind: "clocks", x: 230, y: 690 },
    { who: "Will", kind: "car", x: 640, y: 700 },
  ],
};
// @end params

type Stroke = { id: number; by: string; w: number; pts: number[]; at: number };
type State = { place: string; forecast: string; strokes: Stroke[]; names: Record<string, string>; tags: { by: string; x: number; y: number }[] };
type Action = { t: "draw"; w: number; pts: number[] } | { t: "undo" };
type Local = { w: number; cur: number[] };

const MAXS = 60;
const MAXP = 160; // numbers per stroke (80 points)
const H = 236;
const WIDTHS = [3, 6, 12];

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okPts = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length >= 4 && v.length <= MAXP && v.length % 2 === 0 && v.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1000);

// ---- the seeded doodles, as chalk lines ----
const q = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
function ring(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 18): number[] {
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push(q(cx + Math.cos(a) * rx), q(cy + Math.sin(a) * ry));
  }
  return out;
}
function doodle(kind: string, x: number, y: number): number[][] {
  switch (kind) {
    case "grid": // the spreadsheet
      return [
        [x - 80, y - 70, x + 80, y - 70, x + 80, y + 70, x - 80, y + 70, x - 80, y - 70],
        [x - 80, y - 25, x + 80, y - 25],
        [x - 80, y + 22, x + 80, y + 22],
        [x - 25, y - 70, x - 25, y + 70],
        [x + 28, y - 70, x + 28, y + 70],
      ].map((s) => s.map(q));
    case "cooker": // the rice cooker
      return [
        ring(x, y + 20, 70, 60, 0, Math.PI),
        [x - 70, y + 20, x - 70, y - 20, x + 70, y - 20, x + 70, y + 20].map(q),
        ring(x, y - 20, 70, 35, Math.PI, Math.PI * 2),
        [x - 12, y - 56, x + 12, y - 56].map(q),
        [x - 20, y - 90, x - 26, y - 120, x - 18, y - 150].map(q),
        [x + 14, y - 90, x + 8, y - 120, x + 16, y - 150].map(q),
      ];
    case "note": // a music note, vetoed
      return [
        ring(x - 30, y + 60, 26, 20),
        [x - 6, y + 58, x - 6, y - 80, x + 50, y - 50].map(q),
        ring(x, y, 95, 110, 0, Math.PI * 2, 22),
        [x - 66, y - 78, x + 66, y + 78].map(q),
      ];
    case "clocks": // seven alarms
      return [0, 1, 2].flatMap((k) => [ring(x - 110 + k * 110, y, 40, 46), [x - 110 + k * 110, y - 26, x - 110 + k * 110, y, x - 92 + k * 110, y + 12].map(q), [x - 140 + k * 110, y - 50, x - 125 + k * 110, y - 62].map(q), [x - 80 + k * 110, y - 50, x - 95 + k * 110, y - 62].map(q)]);
    case "car": // the Sube
      return [
        [x - 120, y + 30, x - 120, y - 10, x - 70, y - 20, x - 40, y - 70, x + 50, y - 70, x + 80, y - 20, x + 120, y - 10, x + 120, y + 30, x - 120, y + 30].map(q),
        ring(x - 65, y + 40, 24, 26),
        ring(x + 65, y + 40, 24, 26),
        [x - 50, y - 100, x + 60, y - 100].map(q),
      ];
    case "sun":
      return [ring(x, y, 60, 66), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [q(x + Math.cos(k * 0.785) * 80), q(y + Math.sin(k * 0.785) * 88), q(x + Math.cos(k * 0.785) * 115), q(y + Math.sin(k * 0.785) * 126)])];
    case "heart":
      return [[x, y + 80, x - 90, y - 10, x - 70, y - 70, x - 20, y - 70, x, y - 30, x + 20, y - 70, x + 70, y - 70, x + 90, y - 10, x, y + 80].map(q)];
    default:
      return [[x, y - 90, x + 26, y - 26, x + 95, y - 26, x + 40, y + 16, x + 60, y + 86, x, y + 44, x - 60, y + 86, x - 40, y + 16, x - 95, y - 26, x - 26, y - 26, x, y - 90].map(q)];
  }
}

function initState(ctx: Ctx): State {
  const strokes: Stroke[] = [];
  const names: Record<string, string> = {};
  const tags: { by: string; x: number; y: number }[] = [];
  for (const d of Array.isArray(P.doodles) ? P.doodles : []) {
    const name = clean(d?.who, 20);
    if (!name || typeof d.x !== "number" || typeof d.y !== "number") continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const by = m ? m.id : name;
    names[by] = m ? clean(m.name, 20) || name : name;
    for (const pts of doodle(clean(d.kind, 10), d.x, d.y)) if (okPts(pts) && strokes.length < MAXS - 10) strokes.push({ id: -1 - strokes.length, by, w: 0, pts, at: 0 });
    tags.push({ by, x: q(d.x), y: q(d.y + 150 > 1000 ? d.y - 160 : d.y + 130) });
  }
  return { place: clean(P.place, 24) || "the sidewalk", forecast: clean(P.forecast, 24), strokes, names, tags };
}

function reduceChalk(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "draw") {
    if (!okPts(a.pts) || (a.w !== 0 && a.w !== 1 && a.w !== 2)) return s;
    const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
    const strokes = [...s.strokes, { id: meta.seq, by: u, w: a.w as number, pts: a.pts as number[], at: meta.time }];
    // The oldest line washes away when the pavement is full.
    return { ...s, strokes: strokes.length > MAXS ? strokes.slice(strokes.length - MAXS) : strokes, names: s.names[u] === name ? s.names : { ...s.names, [u]: name } };
  }
  if (a.t === "undo") {
    let i = -1;
    for (let k = s.strokes.length - 1; k >= 0; k--) if (s.strokes[k]!.by === u) { i = k; break; }
    if (i < 0) return s;
    return { ...s, strokes: s.strokes.filter((_, k) => k !== i) };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Quad chalk",
  summary: (s) => {
    const who = new Set(s.strokes.map((x) => x.by));
    return `Chalk on ${s.place}: ${s.strokes.length} lines from ${who.size} ${who.size === 1 ? "person" : "people"}${s.forecast ? ` · ${s.forecast}` : ""}`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceChalk(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "every line is on the pavement": (s) => s.strokes.every((x) => okPts(x.pts) && (x.w === 0 || x.w === 1 || x.w === 2)),
    "the pavement holds 60 lines": (s) => s.strokes.length <= MAXS,
    "lines are in the order drawn": (s) => s.strokes.every((x, i) => i === 0 || x.id > s.strokes[i - 1]!.id || x.id < 0),
    "every artist has a name": (s) => s.strokes.every((x) => typeof s.names[x.by] === "string" && s.names[x.by]!.length > 0),
  },

  transitions: {
    "drawing adds exactly your line": (p, n, a, m) =>
      a.t !== "draw" || p === n || (n.strokes.at(-1)!.by === m.user && n.strokes.at(-1)!.at === m.time && n.strokes.at(-1)!.w === a.w && JSON.stringify(n.strokes.at(-1)!.pts) === JSON.stringify(a.pts) && n.strokes.length === Math.min(MAXS, p.strokes.length + 1)),
    "undo takes back only your latest line": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const gone = p.strokes.filter((x) => !n.strokes.some((y) => y.id === x.id));
      const mine = p.strokes.filter((x) => x.by === m.user);
      return gone.length === 1 && gone[0]!.id === mine[mine.length - 1]!.id && n.strokes.length === p.strokes.length - 1;
    },
    "names follow the chat": (p, n, a, m, ctx) => a.t !== "draw" || p === n || n.names[m.user] === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend"),
    "unknown actions change nothing": (p, n, a) => a.t === "draw" || a.t === "undo" || p === n,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => {
    if (r.next() < 0.25) return { t: "undo" };
    const n = 2 + r.int(6);
    const pts: number[] = [];
    let x = r.int(1001);
    let y = r.int(1001);
    for (let k = 0; k < n; k++) {
      pts.push(x, y);
      x = Math.max(0, Math.min(1000, x + r.int(201) - 100));
      y = Math.max(0, Math.min(1000, y + r.int(201) - 100));
    }
    return { t: "draw", w: r.int(3), pts };
  },

  local: { w: 1, cur: [] },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? state.names[id] ?? "Someone";
    const lastMine = [...state.strokes].reverse().find((x) => x.by === me);
    const newest = state.strokes[state.strokes.length - 1];

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      const X = (v: number) => (v / 1000) * w;
      const Y = (v: number) => (v / 1000) * H;
      // pavement slabs
      g.fillStyle = dark ? mix(c.wash, c.text, 0.1) : mix(c.secondaryText, c.card, 0.62);
      g.fillRect(0, 0, w, H);
      g.strokeStyle = dark ? mix(c.wash, c.text, 0.2) : mix(c.secondaryText, c.card, 0.45);
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 1; k < 4; k++) {
        g.moveTo((w * k) / 4, 0);
        g.lineTo((w * k) / 4, H);
      }
      g.moveTo(0, H / 2);
      g.lineTo(w, H / 2);
      g.stroke();
      // grass edges
      g.fillStyle = dark ? mix(pl.green, c.wash, 0.5) : pl.grass;
      g.fillRect(0, 0, w, 6);
      g.fillRect(0, H - 6, w, 6);
      const line = (pts: number[], color: string, width: number, alpha: number) => {
        g.globalAlpha = alpha;
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.beginPath();
        g.moveTo(X(pts[0]!), Y(pts[1]!));
        for (let k = 2; k < pts.length; k += 2) g.lineTo(X(pts[k]!), Y(pts[k + 1]!));
        g.stroke();
      };
      // chalk: a soft wide pass, then a grainy dashed pass on top
      for (const s of state.strokes) {
        const col = userColor(s.by, f.theme);
        const fresh = s.at > 0 ? running(s.at, 500) : null;
        line(s.pts, col, WIDTHS[s.w]! + 2, 0.35);
        g.setLineDash([2, 1.5]);
        line(s.pts, mix(col, c.card, dark ? 0.1 : 0.15), WIDTHS[s.w]!, fresh === null ? 0.95 : 0.4 + 0.55 * (fresh / 500));
        g.setLineDash([]);
      }
      if (local.cur.length >= 4) {
        const col = userColor(me, f.theme);
        line(local.cur, col, WIDTHS[local.w]! + 2, 0.35);
        line(local.cur, col, WIDTHS[local.w]!, 0.9);
      }
      g.globalAlpha = 1;
      return state.strokes.some((s) => s.at > 0 && running(s.at, 500) !== null);
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      const x = Math.max(0, Math.min(1000, Math.round((e.x / W) * 1000)));
      const y = Math.max(0, Math.min(1000, Math.round((e.y / H) * 1000)));
      if (e.type === "down") setLocal({ cur: [x, y] });
      else if (e.type === "move") {
        const cur = local.cur;
        if (!cur.length || cur.length >= MAXP) return;
        const dx = x - cur[cur.length - 2]!;
        const dy = y - cur[cur.length - 1]!;
        if (dx * dx + dy * dy < 400) return;
        setLocal({ cur: [...cur, x, y] });
      } else {
        const cur = local.cur.length === 2 ? [...local.cur, Math.min(1000, local.cur[0]! + 8), local.cur[1]!] : local.cur;
        if (cur.length >= 4) {
          dispatch({ t: "draw", w: local.w, pts: cur });
          haptic("light");
        }
        setLocal({ cur: [] });
      }
    };

    const tags = state.tags
      .filter((t) => state.strokes.some((s) => s.by === t.by))
      .map((t) => (
        <div key={t.by} style={{ position: "absolute", left: Math.max(0, Math.min(W - 22, (t.x / 1000) * W - 11)), top: Math.max(0, Math.min(H - 22, (t.y / 1000) * H - 11)), display: "flex", pointerEvents: "none" }}>
          <Avatar user={{ id: t.by, name: nameOf(t.by) }} size={20} />
        </div>
      ));
    const myColor = userColor(me, theme);
    const sticks = WIDTHS.map((wd, i) => (
      <button
        key={`k${i}`}
        type="button"
        aria-pressed={local.w === i}
        aria-label={["Thin chalk", "Regular chalk", "Fat chalk"][i]}
        onClick={() => setLocal({ w: i })}
        style={{ position: "relative", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: local.w === i ? c.selected : "transparent" }}
      >
        <span style={{ width: 28, height: 6 + wd, borderRadius: 4, background: myColor, transform: `rotate(-20deg)`, boxShadow: `inset 0 -2px 0 ${mix(myColor, c.text, 0.25)}` }} />
      </button>
    ));

    return (
      <div>
        <CardHeader title={`Chalk on ${state.place}`} subtitle={`${new Set(state.strokes.map((x) => x.by)).size} people drew${state.forecast ? ` · ${state.forecast}, so draw fast` : ""}`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden" }}>
          <Canvas height={H} drag label={`Sidewalk with ${state.strokes.length} chalk lines by ${new Set(state.strokes.map((x) => x.by)).size} people`} draw={draw} onPointer={onPointer} />
          {tags}
        </div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {newest && newest.at > 0 ? `${newest.by === me ? "You" : nameOf(newest.by)} just drew · ${state.strokes.length} lines` : "Drag on the pavement to draw · your chalk is your color"}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 4 }}>
          {sticks}
          <span style={{ flex: 1 }} />
          <Button kind="secondary" disabled={!lastMine} onClick={() => dispatch({ t: "undo" })}>
            Undo
          </Button>
        </div>
      </div>
    );
  },
});
