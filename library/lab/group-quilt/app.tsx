import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// A quilt for the group, one square each. Friends have already stitched theirs; yours is a dashed
// patch. Tap it to try patterns, pick a thread, and stitch it in: a needle runs the seam. When
// every square is in, the quilt gets its label sewn into the corner.

type Pattern = "stripes" | "dots" | "zigzag" | "checks" | "stars" | "hearts" | "waves" | "rice";
type Params = {
  /** Card title: "The six, a quilt" */
  title: string;
  /** Under the title: "one square each · fall '26" */
  sub: string;
  /** Label sewn in when it's done: "the six · fall '26" */
  label: string;
  /** Squares. Already stitched ones have a pattern, a color (0 to 5) and a line; open ones have pattern "". */
  squares: { name: string; pattern: Pattern | ""; color: number; said: string }[];
};

// @params
const P: Params = {
  title: "The six, a quilt",
  sub: "one square each · fall '26",
  label: "the six · fall '26",
  squares: [
    { name: "Calvin", pattern: "checks", color: 0, said: "plaid like my alarm clock pajamas" },
    { name: "Arun", pattern: "rice", color: 4, said: "it's rice. obviously it's rice" },
    { name: "Tsai Lin", pattern: "zigzag", color: 5, said: "sound waves. my aux, my square" },
    { name: "Will", pattern: "stars", color: 1, said: "night drives in the Sube" },
    { name: "Aditya", pattern: "", color: 2, said: "" },
    { name: "Maya", pattern: "", color: 3, said: "" },
  ],
};
// @end params

type Square = { who: string; name: string; pattern: Pattern | ""; color: number; said: string; at: number };
type State = { title: string; sub: string; label: string; squares: Square[]; doneAt: number };
type Action = { t: "stitch"; pattern: Pattern; color: number } | { t: "unpick" };
type Local = { pattern: number; color: number; burst: number };

const PATTERNS: Pattern[] = ["stripes", "dots", "zigzag", "checks", "stars", "hearts", "waves", "rice"];
const NAMES: Record<Pattern, string> = { stripes: "Stripes", dots: "Dots", zigzag: "Zigzag", checks: "Checks", stars: "Stars", hearts: "Hearts", waves: "Waves", rice: "Rice" };
const TAU = Math.PI * 2;
const SEW = 1100;
const MAX = 9;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const sewn = (s: State) => s.squares.filter((q) => q.pattern !== "");
const complete = (s: State) => s.squares.length > 0 && s.squares.every((q) => q.pattern !== "");
const memberOf = (q: Square): Member => ({ id: q.who, name: q.name });
const hue = (t: Theme, i: number) => [t.color.series1, t.color.series2, t.color.series3, t.color.series4, t.color.series5, t.color.series6][((i % 6) + 6) % 6]!;

function initState(ctx: Ctx): State {
  const squares: Square[] = [];
  for (const raw of P.squares) {
    if (squares.length >= MAX) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (squares.some((q) => q.who === who)) continue;
    const pattern = PATTERNS.includes(raw.pattern as Pattern) ? (raw.pattern as Pattern) : "";
    squares.push({ who, name, pattern, color: Number.isInteger(raw.color) ? ((raw.color % 6) + 6) % 6 : 0, said: pattern ? clean(raw.said, 50) : "", at: 0 });
  }
  for (const m of ctx.members) {
    if (squares.length >= MAX || squares.some((q) => q.who === m.id)) continue;
    squares.push({ who: m.id, name: clean(m.name, 20) || "Friend", pattern: "", color: squares.length % 6, said: "", at: 0 });
  }
  // A quilt that arrives finished has nothing to do: leave the last square open.
  if (complete({ squares } as State) && squares.length) squares[squares.length - 1] = { ...squares[squares.length - 1]!, pattern: "", said: "" };
  return { title: clean(P.title, 40) || "Group quilt", sub: clean(P.sub, 60), label: clean(P.label, 30), squares, doneAt: 0 };
}

function fabric(g: CanvasRenderingContext2D, t: Theme, p: Pattern, col: number, x: number, y: number, w: number, h: number) {
  const c = t.color;
  const base = mix(hue(t, col), c.card, 0.62);
  const ink = hue(t, col);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.beginPath();
  if (p === "stripes") {
    for (let k = -h; k < w; k += 12) {
      g.moveTo(x + k, y + h);
      g.lineTo(x + k + h, y);
    }
    g.lineWidth = 5;
    g.strokeStyle = ink;
    g.stroke();
  } else if (p === "dots") {
    for (let yy = y + 8; yy < y + h; yy += 13) for (let xx = x + 8 + (((yy - y) / 13) % 2) * 6; xx < x + w; xx += 13) (g.moveTo(xx + 3, yy), g.arc(xx, yy, 3, 0, TAU));
    g.fillStyle = ink;
    g.fill();
  } else if (p === "zigzag") {
    for (let yy = y + 6; yy < y + h + 6; yy += 12) {
      g.moveTo(x, yy);
      for (let xx = x; xx <= x + w + 8; xx += 8) g.lineTo(xx, yy + ((xx - x) / 8) % 2 * 6 - 3);
    }
    g.lineWidth = 2.5;
    g.strokeStyle = ink;
    g.stroke();
  } else if (p === "checks") {
    for (let yy = y; yy < y + h; yy += 10) for (let xx = x + (((yy - y) / 10) % 2) * 10; xx < x + w; xx += 20) g.rect(xx, yy, 10, 10);
    g.fillStyle = ink;
    g.fill();
    g.beginPath();
    for (let xx = x + 5; xx < x + w; xx += 20) (g.moveTo(xx, y), g.lineTo(xx, y + h));
    g.lineWidth = 1;
    g.strokeStyle = c.card;
    g.stroke();
  } else if (p === "stars") {
    for (let yy = y + 10; yy < y + h; yy += 18)
      for (let xx = x + 10 + (((yy - y) / 18) % 2) * 9; xx < x + w; xx += 18) {
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const r = k % 2 ? 2.4 : 5.5;
          if (k === 0) g.moveTo(xx + Math.cos(a) * r, yy + Math.sin(a) * r);
          else g.lineTo(xx + Math.cos(a) * r, yy + Math.sin(a) * r);
        }
        g.closePath();
      }
    g.fillStyle = ink;
    g.fill();
  } else if (p === "hearts") {
    for (let yy = y + 10; yy < y + h; yy += 17)
      for (let xx = x + 9 + (((yy - y) / 17) % 2) * 8; xx < x + w; xx += 17) {
        g.moveTo(xx, yy + 5);
        g.bezierCurveTo(xx - 7, yy, xx - 4, yy - 6, xx, yy - 2);
        g.bezierCurveTo(xx + 4, yy - 6, xx + 7, yy, xx, yy + 5);
      }
    g.fillStyle = ink;
    g.fill();
  } else if (p === "waves") {
    for (let yy = y + 6; yy < y + h + 6; yy += 10) {
      g.moveTo(x, yy);
      for (let xx = x; xx <= x + w; xx += 4) g.lineTo(xx, yy + Math.sin((xx - x) / 5) * 3);
    }
    g.lineWidth = 2.5;
    g.strokeStyle = ink;
    g.stroke();
  } else {
    // Rice: little grains at angles.
    for (let k = 0; k < Math.floor((w * h) / 110); k++) {
      const gx = x + (((k * 37) % 97) / 97) * w;
      const gy = y + (((k * 61) % 89) / 89) * h;
      const a = (k * 1.3) % Math.PI;
      g.moveTo(gx + Math.cos(a) * 3.5, gy + Math.sin(a) * 3.5);
      g.ellipse(gx, gy, 3.5, 1.6, a, 0, TAU);
    }
    g.fillStyle = mix(c.card, ink, 0.15);
    g.fill();
  }
  g.restore();
}

function drawQuilt(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, draft: { pattern: Pattern; color: number }) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const W = f.width;
  const n = s.squares.length;
  const cols = 3;
  const rows = Math.ceil(n / cols);
  const pad = 8;
  const size = Math.min((W - 2 * pad) / cols, (f.height - 2 * pad) / rows);
  const x0 = (W - size * cols) / 2;
  const y0 = (f.height - size * rows) / 2;
  let anim = false;

  // Backing fabric with a hem.
  g.beginPath();
  g.roundRect(x0 - 6, y0 - 6, size * cols + 12, size * rows + 12, 10);
  g.fillStyle = mix(c.series5, c.card, dk ? 0.5 : 0.6);
  g.fill();

  s.squares.forEach((q, i) => {
    const x = x0 + (i % cols) * size;
    const y = y0 + Math.floor(i / cols) * size;
    const mine = q.who === me;
    const pat = q.pattern || (mine ? draft.pattern : "");
    if (pat) fabric(g, t, pat, q.pattern ? q.color : draft.color, x + 2, y + 2, size - 4, size - 4);
    else {
      g.beginPath();
      g.rect(x + 2, y + 2, size - 4, size - 4);
      g.fillStyle = c.card;
      g.fill();
    }
    // Seams: stitched squares get running stitches; open ones a dashed outline.
    const e = q.at ? running(q.at, SEW) : null;
    if (e !== null) anim = true;
    const per = 4 * (size - 8);
    const sewnLen = q.pattern ? (e === null ? per : (per * e) / SEW) : 0;
    g.setLineDash(q.pattern ? [5, 4] : [4, 4]);
    g.lineWidth = q.pattern ? 2 : 1.5;
    g.strokeStyle = q.pattern ? (dk ? c.text : c.card) : mine ? c.primary : c.secondaryText;
    g.beginPath();
    if (q.pattern) {
      // Draw only as much seam as has been sewn, around the square.
      const pts = [
        [x + 4, y + 4],
        [x + size - 4, y + 4],
        [x + size - 4, y + size - 4],
        [x + 4, y + size - 4],
        [x + 4, y + 4],
      ];
      let left = sewnLen;
      g.moveTo(pts[0]![0]!, pts[0]![1]!);
      let tip = pts[0]!;
      for (let k = 1; k < pts.length && left > 0; k++) {
        const [ax, ay] = pts[k - 1]!;
        const [bx, by] = pts[k]!;
        const L = Math.hypot(bx! - ax!, by! - ay!);
        const u = Math.min(1, left / L);
        tip = [ax! + (bx! - ax!) * u, ay! + (by! - ay!) * u];
        g.lineTo(tip[0]!, tip[1]!);
        left -= L;
      }
      g.stroke();
      g.setLineDash([]);
      if (e !== null) {
        // The needle at the tip of the seam.
        g.save();
        g.translate(tip[0]!, tip[1]!);
        g.rotate(-0.8);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(16, -2);
        g.lineWidth = 2;
        g.strokeStyle = c.secondaryText;
        g.stroke();
        g.beginPath();
        g.ellipse(14, -1.8, 2, 1, 0, 0, TAU);
        g.strokeStyle = c.card;
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
    } else {
      g.rect(x + 4, y + 4, size - 8, size - 8);
      g.stroke();
      g.setLineDash([]);
    }
    // Name tag.
    const tag = fitText(mine && !q.pattern ? "Your square" : q.name, size - 16, { g, size: 12, min: 10, weight: 600 });
    g.font = tag.font;
    const tw = g.measureText(tag.text).width + 12;
    g.beginPath();
    g.roundRect(x + size / 2 - tw / 2, y + size - 26, tw, 18, 9);
    g.fillStyle = c.card;
    g.fill();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(tag.text, x + size / 2, y + size - 16.5);
    if (!pat) {
      g.font = `400 12px ${t.type.family}`;
      g.fillStyle = c.secondaryText;
      g.fillText("not yet", x + size / 2, y + size / 2 - 4);
    } else if (mine && !q.pattern) {
      const pill = fitText(`${NAMES[pat]} · tap`, size - 12, { g, size: 11, min: 10, weight: 600 });
      g.font = pill.font;
      const pw = g.measureText(pill.text).width + 14;
      g.beginPath();
      g.roundRect(x + size / 2 - pw / 2, y + 9, pw, 18, 9);
      g.fillStyle = c.primary;
      g.fill();
      g.fillStyle = c.onPrimary;
      g.fillText(pill.text, x + size / 2, y + 18.5);
    }
  });

  // The label, sewn in when it's done.
  if (complete(s) && s.label) {
    const e = s.doneAt ? running(s.doneAt + SEW, 600) : null;
    if (e !== null) anim = true;
    const k = e === null ? 1 : e / 600;
    const lab = fitText(s.label, size * 1.6, { g, size: 12, min: 10, weight: 700 });
    g.font = lab.font;
    const lw = g.measureText(lab.text).width + 16;
    const lx = x0 + size * cols - lw - 10;
    const ly = y0 + size * rows - 6 + (1 - k) * 20;
    g.beginPath();
    g.rect(lx, ly - 18, lw, 22);
    g.fillStyle = c.card;
    g.fill();
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    g.strokeStyle = c.negative;
    g.strokeRect(lx + 2, ly - 16, lw - 4, 18);
    g.setLineDash([]);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(lab.text, lx + lw / 2, ly - 7);
  }
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Group quilt",
  summary: (s) => (complete(s) ? `${s.title}: all ${s.squares.length} squares stitched` : `${s.title}: ${sewn(s).length} of ${s.squares.length} squares stitched`),

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const i = s.squares.findIndex((q) => q.who === m.user);
    if (i < 0 || s.doneAt) return s;
    if (a.t === "stitch") {
      if (s.squares[i]!.pattern || !PATTERNS.includes(a.pattern) || !Number.isInteger(a.color) || a.color < 0 || a.color > 5) return s;
      const squares = s.squares.map((q, k) => (k === i ? { ...q, pattern: a.pattern, color: a.color, at: m.time } : q));
      const next = { ...s, squares };
      return complete(next) ? { ...next, doneAt: m.time } : next;
    }
    if (a.t === "unpick") {
      if (!s.squares[i]!.pattern || seeded(s.squares[i]!.who)) return s;
      return { ...s, squares: s.squares.map((q, k) => (k === i ? { ...q, pattern: "" as const, at: 0, said: "" } : q)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let squares = s.squares.map((q) => (seeded(q.who) || inChat(ctx, q.who) ? q : { ...q, who: `~${q.name}` }));
    squares = squares.filter((q, i) => squares.findIndex((x) => x.who === q.who) === i);
    for (const m of ctx.members) {
      if (squares.some((q) => q.who === m.id)) continue;
      const k = squares.findIndex((q) => seeded(q.who) && q.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0) squares = squares.map((q, j) => (j === k ? { ...q, who: m.id } : q));
      else if (squares.length < MAX && !s.doneAt) squares = [...squares, { who: m.id, name: clean(m.name, 20) || "Friend", pattern: "", color: squares.length % 6, said: "", at: 0 }];
    }
    const next = { ...s, squares };
    return { ...next, doneAt: complete(next) ? s.doneAt || 1 : 0 };
  },

  invariants: {
    "everyone in the chat has a square": (s, ctx) => s.doneAt > 0 || s.squares.length >= MAX || ctx.members.every((m) => s.squares.some((q) => q.who === m.id)),
    "a friend who joins takes their own square": (s, ctx) => ctx.members.every((m) => s.squares.some((q) => q.who === m.id) || !s.squares.some((q) => seeded(q.who) && q.name.toLowerCase() === m.name.toLowerCase())),
    "one square per person, up to nine": (s) => s.squares.length >= 1 && s.squares.length <= MAX && new Set(s.squares.map((q) => q.who)).size === s.squares.length,
    "live squares belong to people in the chat": (s, ctx) => s.squares.every((q) => seeded(q.who) || inChat(ctx, q.who)),
    "threads are one of six colors": (s) => s.squares.every((q) => Number.isInteger(q.color) && q.color >= 0 && q.color <= 5),
    "patterns are real or empty": (s) => s.squares.every((q) => q.pattern === "" || PATTERNS.includes(q.pattern)),
    "the label goes in exactly when the quilt is done": (s) => (s.doneAt > 0) === complete(s),
    "a sewing time only on stitched squares": (s) => s.squares.every((q) => q.at === 0 || q.pattern !== ""),
  },

  transitions: {
    "a stitch fills only the sender's square": (p, n, a, m) => {
      if (a.t !== "stitch" || p === n) return true;
      const changed = n.squares.filter((q, k) => JSON.stringify(q) !== JSON.stringify(p.squares[k]));
      return changed.length === 1 && changed[0]!.who === m.user && changed[0]!.pattern === a.pattern && changed[0]!.color === a.color && changed[0]!.at === m.time;
    },
    "unpick empties only the sender's square": (p, n, a, m) => {
      if (a.t !== "unpick" || p === n) return true;
      const changed = n.squares.filter((q, k) => JSON.stringify(q) !== JSON.stringify(p.squares[k]));
      return changed.length === 1 && changed[0]!.who === m.user && changed[0]!.pattern === "";
    },
    "a finished quilt stays finished": (p, n) => p.doneAt === 0 || (n.doneAt === p.doneAt && n.squares.every((q, k) => q.pattern === p.squares[k]?.pattern)),
    "the last stitch sews the label": (p, n, a, m) => a.t !== "stitch" || p.doneAt > 0 || !complete(n) || n.doneAt === m.time,
    "unknown actions change nothing": (p, n, a) => a.t === "stitch" || a.t === "unpick" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.squares.find((q) => q.who === user);
    if (mine?.pattern && r.next() < 0.3) return { t: "unpick" };
    return { t: "stitch", pattern: r.pick(PATTERNS), color: r.int(6) };
  },

  local: { pattern: 0, color: 3, burst: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const mine = s.squares.find((q) => q.who === me);
    const open = !!mine && !mine.pattern && !confirmed.doneAt;
    const draft = { pattern: PATTERNS[local.pattern % PATTERNS.length]!, color: local.color };
    const rows = Math.ceil(s.squares.length / 3);
    const W = theme.width - 2 * theme.space.card;
    const H = Math.min(204, Math.round(((W - 16) / 3) * rows + 16));
    const done = complete(confirmed);
    const latest = [...s.squares].filter((q) => q.said).pop();
    const label = `Quilt: ${s.squares.map((q) => `${q.name} ${q.pattern ? NAMES[q.pattern] : "not stitched yet"}`).join(", ")}`;
    const cycle = () => setLocal({ pattern: (local.pattern + 1) % PATTERNS.length });

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={H} label={label} draw={(g, f) => drawQuilt(g, f, s, me, draft)} onPointer={(e) => e.type === "up" && open && cycle()} />
        {done ? (
          <div style={{ position: "relative", marginTop: 8 }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="🧵" />
              </div>
            ) : null}
            <Locked detail={`${s.squares.length} squares · ${s.label || "finished"}`}>Quilt finished</Locked>
            {local.burst > 0 ? <Toast key={local.burst}>Last square in</Toast> : null}
          </div>
        ) : open ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", minWidth: 0 }}>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={`Thread ${k + 1}${k === local.color ? ", picked" : ""}`}
                    onClick={() => setLocal({ color: k })}
                    style={{ width: 44, height: 44, padding: 0, border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 12, background: [c.series1, c.series2, c.series3, c.series4, c.series5, c.series6][k], boxShadow: k === local.color ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.text}` : "none" }} />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Button
                kind="primary"
                wide
                onClick={() => {
                  haptic("success");
                  if (s.squares.filter((q) => !q.pattern).length === 1) setLocal({ burst: local.burst + 1 });
                  dispatch({ t: "stitch", pattern: draft.pattern, color: draft.color });
                }}
              >
                Stitch it in
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, minWidth: 0 }}>
              <Facepile users={sewn(s).map(memberOf)} max={5} size={20} />
              <span style={{ flex: 1, fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>{`${sewn(s).length} of ${s.squares.length} stitched · waiting on ${s.squares.filter((q) => !q.pattern).map((q) => firstName(q.name)).join(", ")}`}</span>
              {mine?.pattern && !seeded(mine.who) ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "unpick" })}>
                  Unpick
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {latest && !done ? (
          <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, marginTop: 6, ...ell }}>
            <b style={{ color: c.text }}>{latest.name}</b>
            {` · “${latest.said}”`}
          </div>
        ) : null}
      </div>
    );
  },
});
