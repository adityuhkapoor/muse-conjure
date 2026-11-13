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
  running,
  clock,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Van pack: a two-minute packing game for move-out day. The back of the van, doors open, a grid of
// cargo space. Everyone gets the same stuff in the same order; slide each thing over a column, turn
// it, drop it, and it falls in. Whatever doesn't fit stays on the curb. Most space filled drives.

type Shape = "box" | "bigbox" | "couch" | "mattress" | "lamp" | "tv" | "desk" | "chair";
type Params = {
  /** Card title */
  title: string;
  /** Whose move: "412 Pine move-out" */
  move: string;
  /** 4 to 12 things, in the order they come out of the apartment */
  stuff: { name: string; shape: Shape }[];
  /** Earlier runs: who, how many cells they filled, and a line */
  runs: { who: string; filled: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Pack the van",
  move: "412 Pine move-out · one trip",
  stuff: [
    { name: "Couch", shape: "couch" },
    { name: "Mattress", shape: "mattress" },
    { name: "Desk", shape: "desk" },
    { name: "Book boxes", shape: "bigbox" },
    { name: "TV", shape: "tv" },
    { name: "Desk chair", shape: "chair" },
    { name: "Floor lamp", shape: "lamp" },
    { name: "Rice cooker", shape: "box" },
    { name: "Kitchen box", shape: "bigbox" },
    { name: "Shoe box", shape: "box" },
  ],
  runs: [
    { who: "Will", filled: 24, said: "the sube could do this in two trips. three. ok four" },
    { who: "Maya", filled: 27, said: "i made a spreadsheet first" },
  ],
};
// @end params

const COLS = 7, ROWS = 5;
const SHAPES: Record<Shape, number[][]> = {
  box: [[0, 0]],
  bigbox: [[0, 0], [1, 0], [0, 1], [1, 1]],
  couch: [[0, 0], [1, 0], [2, 0]],
  mattress: [[0, 0], [0, 1], [0, 2]],
  lamp: [[0, 0], [0, 1]],
  tv: [[0, 0], [1, 0]],
  desk: [[0, 0], [1, 0], [2, 0], [0, 1]],
  chair: [[0, 0], [1, 0], [0, 1]],
};
const SHAPE_NAMES = Object.keys(SHAPES) as Shape[];
type Thing = { name: string; shape: Shape };
type Run = { user: string; name: string; filled: number; best: number; moves: number[][]; said: string; at: number };
type State = { title: string; move: string; stuff: Thing[]; runs: Run[] };
type Action = { t: "run"; moves: number[][] };
type Local = { moves: number[][]; col: number; rot: number; dropAt: number; toast: number };

/** Server-aligned now; the clock only ticks while read, so narrow it down with running(). */
function freshNow(): number {
  let lo = clock.value - 1;
  let hi = lo + 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (running(mid, 1) === null) lo = mid;
    else hi = mid;
  }
  return hi;
}
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** A shape turned `rot` quarter turns, moved so its lowest-left cell is at 0,0. y counts up from the floor. */
function cellsOf(shape: Shape, rot: number): number[][] {
  let cs = SHAPES[shape].map((c) => [c[0]!, c[1]!]);
  for (let r = 0; r < rot % 4; r++) cs = cs.map(([x, y]) => [y!, -x!]);
  const mx = Math.min(...cs.map((c) => c[0]!)), my = Math.min(...cs.map((c) => c[1]!));
  return cs.map(([x, y]) => [x! - mx, y! - my]);
}
/** Where a thing lands when dropped at column `col`: it falls from the top until it rests. null if it can't go in. */
function land(grid: number[][], shape: Shape, rot: number, col: number): number[][] | null {
  const cs = cellsOf(shape, rot);
  const w = Math.max(...cs.map((c) => c[0]!)) + 1, h = Math.max(...cs.map((c) => c[1]!)) + 1;
  if (col < 0 || col + w > COLS) return null;
  const free = (y: number) => cs.every(([x, yy]) => y + yy! < ROWS && grid[y + yy!]![col + x!] === -1);
  let y = ROWS - h;
  if (y < 0 || !free(y)) return null;
  while (y > 0 && free(y - 1)) y--;
  return cs.map(([x, yy]) => [col + x!, y + yy!]);
}
/** Plays the moves: [col, rot] per thing, col -1 leaves it on the curb. */
function play(stuff: Thing[], moves: number[][]): { grid: number[][]; filled: number; curb: number[]; ok: boolean } {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => -1));
  const curb: number[] = [];
  let ok = true;
  moves.forEach((mv, i) => {
    const t = stuff[i];
    if (!t) return void (ok = false);
    if (mv[0] === -1) return void curb.push(i);
    const at = land(grid, t.shape, mv[1]!, mv[0]!);
    if (!at) return void (ok = false);
    for (const [x, y] of at) grid[y!]![x!] = i;
  });
  return { grid, filled: grid.flat().filter((v) => v >= 0).length, curb, ok };
}
const goodMoves = (s: State, v: unknown): v is number[][] =>
  Array.isArray(v) && v.length === s.stuff.length && v.every((m) => Array.isArray(m) && m.length === 2 && isInt(m[0], -1, COLS - 1) && isInt(m[1], 0, 3));

function initState(ctx: Ctx): State {
  const stuff: Thing[] = [];
  for (const t of Array.isArray(P.stuff) ? P.stuff : []) {
    const name = clean(t?.name, 18);
    if (name && SHAPE_NAMES.includes(t.shape) && stuff.length < 12) stuff.push({ name, shape: t.shape });
  }
  if (stuff.length < 2) stuff.push({ name: "Box", shape: "box" }, { name: "Couch", shape: "couch" });
  const area = stuff.reduce((n, t) => n + SHAPES[t.shape].length, 0);
  const runs: Run[] = [];
  for (const r of Array.isArray(P.runs) ? P.runs : []) {
    const name = clean(r?.who, 20);
    if (!name || !isInt(r.filled, 0, Math.min(area, COLS * ROWS)) || runs.length >= 8) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    const user = m ? m.id : `o:${name}`;
    if (!runs.some((x) => x.user === user)) runs.push({ user, name, filled: r.filled, best: r.filled, moves: [], said: clean(r.said, 52), at: 0 });
  }
  return { title: clean(P.title, 32) || "Pack the van", move: clean(P.move, 40), stuff, runs };
}

function drawThing(g: CanvasRenderingContext2D, t: Thing, cells: number[][], X: (x: number) => number, Y: (y: number) => number, cs: number, theme: Theme, alpha = 1) {
  const p = pal(theme);
  const c = theme.color;
  const hue: Record<Shape, string> = { box: p.crust, bigbox: p.crust, couch: p.leaf, mattress: mix(p.sky, c.secondaryText, 0.15), lamp: p.yellow, tv: p.dark, desk: p.brown, chair: p.purple };
  const col = hue[t.shape];
  g.globalAlpha = alpha;
  g.fillStyle = col;
  g.beginPath();
  for (const [x, y] of cells) g.roundRect(X(x!) + 1.5, Y(y!) + 1.5, cs - 3, cs - 3, 4);
  g.fill();
  // joins between cells of the same thing
  g.beginPath();
  for (const [x, y] of cells) {
    if (cells.some(([a, b]) => a === x! + 1 && b === y)) g.rect(X(x!) + cs - 3, Y(y!) + 4, 6, cs - 8);
    if (cells.some(([a, b]) => a === x && b === y! + 1)) g.rect(X(x!) + 4, Y(y!) - 3, cs - 8, 6);
  }
  g.fill();
  // a detail per kind
  g.fillStyle = mix(col, c.card, 0.35);
  g.beginPath();
  for (const [x, y] of cells) {
    const cx = X(x!) + cs / 2, cy = Y(y!) + cs / 2;
    if (t.shape === "box" || t.shape === "bigbox") g.rect(cx - 2, Y(y!) + 2, 4, cs - 4);
    else if (t.shape === "couch") g.roundRect(X(x!) + 5, cy - 2, cs - 10, cs / 2 - 4, 3);
    else if (t.shape === "mattress") g.rect(X(x!) + 4, cy - 1, cs - 8, 2);
    else if (t.shape === "tv") g.roundRect(X(x!) + 4, Y(y!) + 4, cs - 8, cs - 10, 2);
    else if (t.shape === "lamp") g.arc(cx, cy, cs * 0.22, 0, Math.PI * 2);
    else if (t.shape === "desk") g.rect(X(x!) + 3, Y(y!) + 4, cs - 6, 3);
    else g.arc(cx, cy, cs * 0.16, 0, Math.PI * 2);
  }
  g.fill();
  g.globalAlpha = 1;
}

export default defineApp<State, Action, Local>({
  name: "Van pack",
  summary: (s) => {
    const best = [...s.runs].sort((a, b) => b.best - a.best)[0];
    return best ? `${s.title}: ${best.name} filled ${best.best} of ${COLS * ROWS} · ${s.runs.length} packed` : `${s.title}: ${s.stuff.length} things, one van, nobody has packed yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "run" || !goodMoves(s, a.moves)) return s;
    const r = play(s.stuff, a.moves);
    if (!r.ok) return s;
    const old = s.runs.find((x) => x.user === m.user);
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    const run: Run = { user: m.user, name, filled: r.filled, best: Math.max(old ? old.best : 0, r.filled), moves: a.moves.map((x) => [x[0]!, x[1]!]), said: "", at: m.time };
    return { ...s, runs: [...s.runs.filter((x) => x.user !== m.user), run].slice(-10) };
  },

  invariants: {
    "a played run scores what it packed": (s) => s.runs.every((r) => r.at === 0 || (r.moves.length === s.stuff.length && play(s.stuff, r.moves).ok && play(s.stuff, r.moves).filled === r.filled)),
    "one run each": (s) => new Set(s.runs.map((r) => r.user)).size === s.runs.length && s.runs.length <= 10,
    "nobody packs more than the van holds": (s) => s.runs.every((r) => isInt(r.filled, 0, COLS * ROWS) && r.best >= r.filled && r.best <= COLS * ROWS),
    "packed space is the size of what went in": (s) =>
      s.runs.every((r) => r.at === 0 || r.filled === r.moves.reduce((n, mv, i) => n + (mv[0] === -1 ? 0 : SHAPES[s.stuff[i]!.shape].length), 0)),
  },

  transitions: {
    "your best never gets worse": (p, n, a, m) => a.t !== "run" || (n.runs.find((r) => r.user === m.user)?.best ?? -1) >= (p.runs.find((r) => r.user === m.user)?.best ?? -1),
    "your best is your best try": (p, n, a, m) => {
      if (a.t !== "run" || p === n) return true;
      const r = n.runs.find((x) => x.user === m.user)!;
      return r.best === Math.max(p.runs.find((x) => x.user === m.user)?.best ?? 0, r.filled) && JSON.stringify(r.moves) === JSON.stringify(a.moves);
    },
    "a run only changes yours": (p, n, _a, m) => n.runs.filter((r) => r.user !== m.user).every((r) => p.runs.some((q) => q.user === r.user && q.filled === r.filled && q.best === r.best && q.at === r.at)),
    "a new best is stamped": (p, n, a, m) => a.t !== "run" || p === n || n.runs.find((r) => r.user === m.user)?.at === m.time,
    "the stuff never changes": (p, n) => n.stuff === p.stuff,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    // a plausible run: drop each thing in a random column, skipping what doesn't fit
    const moves: number[][] = [];
    const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => -1));
    s.stuff.forEach((t, i) => {
      const rot = r.int(4);
      const col = r.int(COLS);
      const at = land(grid, t.shape, rot, col);
      if (!at) return void moves.push([-1, 0]);
      for (const [x, y] of at) grid[y!]![x!] = i;
      moves.push([col, rot]);
    });
    return { t: "run", moves };
  },

  local: { moves: [], col: 2, rot: 0, dropAt: 0, toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 224;
    const cs = Math.min(30, Math.floor((W * 0.6) / COLS));
    const gw = cs * COLS, gh = cs * ROWS;
    const gx = (W - gw) / 2, gy = H - gh - 14;
    const X = (x: number) => gx + x * cs;
    const Y = (y: number) => gy + (ROWS - 1 - y) * cs;
    const k = local.moves.length;
    const done = k >= s.stuff.length;
    const sim = play(s.stuff, local.moves);
    const cur = done ? null : s.stuff[k]!;
    const curCells = cur ? cellsOf(cur.shape, local.rot) : [];
    const cw = curCells.length ? Math.max(...curCells.map((q) => q[0]!)) + 1 : 1;
    const col = Math.max(0, Math.min(COLS - cw, local.col));
    const ghost = cur ? land(sim.grid, cur.shape, local.rot, col) : null;
    const mine = s.runs.find((r) => r.user === me) ?? null;
    const ranked = [...s.runs].sort((a, b) => b.best - a.best || a.at - b.at);
    const nameOf = (r: Run) => (r.user === me ? "You" : members.find((x) => x.id === r.user)?.name ?? r.name);
    const dropK = local.dropAt ? running(local.dropAt, 260) : null;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // the street behind
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.roundRect(0, 0, w, H, 12);
      g.fill();
      // the van body and open doors
      const body = dark ? mix(c.text, c.wash, 0.55) : c.card;
      const trim = dark ? mix(c.text, c.wash, 0.35) : mix(c.secondaryText, c.card, 0.55);
      g.fillStyle = trim;
      g.beginPath();
      g.roundRect(gx - 14, gy - 16, gw + 28, gh + 26, 10);
      g.fill();
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(gx - 40, gy - 10, 24, gh + 14, [6, 2, 2, 6]);
      g.roundRect(gx + gw + 16, gy - 10, 24, gh + 14, [2, 6, 6, 2]);
      g.fill();
      g.fillStyle = trim;
      g.beginPath();
      g.roundRect(gx - 34, gy + gh / 2 - 3, 6, 18, 3);
      g.roundRect(gx + gw + 28, gy + gh / 2 - 3, 6, 18, 3);
      g.fill();
      // cargo floor and grid
      g.fillStyle = dark ? mix(c.wash, c.text, 0.05) : mix(c.secondaryText, c.card, 0.82);
      g.fillRect(gx, gy, gw, gh);
      g.strokeStyle = dark ? mix(c.wash, c.text, 0.14) : mix(c.secondaryText, c.card, 0.65);
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < COLS; x++) {
        g.moveTo(X(x), gy);
        g.lineTo(X(x), gy + gh);
      }
      for (let y = 1; y < ROWS; y++) {
        g.moveTo(gx, gy + y * cs);
        g.lineTo(gx + gw, gy + y * cs);
      }
      g.stroke();
      // bumper and tail lights
      g.fillStyle = trim;
      g.fillRect(gx - 20, gy + gh + 4, gw + 40, 8);
      g.fillStyle = p.red;
      g.beginPath();
      g.roundRect(gx - 12, gy - 12, 8, 14, 3);
      g.roundRect(gx + gw + 4, gy - 12, 8, 14, 3);
      g.fill();
      // what's packed
      s.stuff.forEach((t, i) => {
        const cells: number[][] = [];
        sim.grid.forEach((row, y) => row.forEach((v, x) => v === i && cells.push([x, y])));
        if (cells.length) drawThing(g, t, cells, X, Y, cs, theme);
      });
      // where the current thing will land, and the thing itself above the van
      if (cur) {
        if (ghost) {
          g.setLineDash([4, 3]);
          g.strokeStyle = c.primary;
          g.lineWidth = 2;
          g.beginPath();
          for (const [x, y] of ghost) g.roundRect(X(x!) + 2, Y(y!) + 2, cs - 4, cs - 4, 4);
          g.stroke();
          g.setLineDash([]);
        }
        const lift = gy - 14 - (Math.max(...curCells.map((q) => q[1]!)) + 1) * cs * 0.62;
        const hover = curCells.map(([x, y]) => [col + x!, y!]);
        const sc = 0.62;
        drawThing(g, cur, hover, (x) => X(col) + (x - col) * cs * sc, (y) => lift + (Math.max(...curCells.map((q) => q[1]!)) - y) * cs * sc, cs * sc, theme, dropK !== null ? 1 - dropK / 260 : 1);
      }
      // the curb: what didn't fit
      const curbN = sim.curb.length;
      if (curbN) {
        g.textAlign = "left";
        g.textBaseline = "middle";
        const l = fitText(`${curbN} on the curb`, gx - 46, { g, size: 11, weight: 600, min: 10, family: theme.type.family });
        g.font = l.font;
        g.fillStyle = c.secondaryText;
        if (gx - 46 > 30) g.fillText(l.text, 6, H - 12);
      }
      return dropK !== null;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (done || e.type === "up") return;
      const cc = Math.floor((e.x - gx) / cs);
      if (e.type === "down" || e.type === "move") setLocal({ col: Math.max(0, Math.min(COLS - cw, cc - Math.floor(cw / 2))) });
    };
    const drop = () => {
      if (!cur) return;
      const mv = ghost ? [col, local.rot % 4] : [-1, 0];
      const moves = [...local.moves, mv];
      setLocal({ moves, rot: 0, dropAt: freshNow() });
      haptic(ghost ? "light" : "medium");
      if (moves.length >= s.stuff.length) {
        dispatch({ t: "run", moves });
        setLocal({ moves, rot: 0, toast: local.toast + 1 });
      }
    };

    const quote = ranked.find((r) => r.said);
    const best = ranked[0];

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.move ? `${s.move} · ` : ""}${s.stuff.length} things`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`Van with ${sim.filled} of ${COLS * ROWS} spaces packed; ${cur ? `next: ${cur.name}` : "all packed"}`} draw={draw} onPointer={onPointer} />
          {cur ? (
            <div style={{ position: "absolute", left: 8, top: 8, maxWidth: gx - 46 > 60 ? gx - 46 : W - 16, padding: "1px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
              {`${k + 1} of ${s.stuff.length} · ${cur.name}`}
            </div>
          ) : (
            <div style={{ position: "absolute", left: 0, right: 0, top: 12, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ padding: "2px 10px", borderRadius: 12, background: c.card, color: c.text, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{`${sim.filled} of ${COLS * ROWS} packed`}</span>
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {ranked.length ? (
            ranked.slice(0, theme.width < 360 ? 3 : 4).map((r, i) => (
              <div key={r.user} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 4px", borderRadius: 15, background: r.user === me ? c.selected : c.wash, fontSize: 13, whiteSpace: "nowrap" }}>
                <Avatar user={r.user.startsWith("o:") ? { id: r.user, name: r.name } : r.user} size={22} />
                <span style={{ fontWeight: 700, color: c.text }}>{r.best}</span>
                {i === 0 ? <span style={{ color: c.secondaryText }}>drives</span> : null}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, lineHeight: "30px", color: c.secondaryText }}>Nobody has packed yet · most space filled drives</div>
          )}
        </div>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {done && mine ? `You packed ${mine.filled}${best && best.user === me ? " · you drive" : best ? ` · ${nameOf(best)} still drives with ${best.best}` : ""}` : quote ? `${nameOf(quote)}: “${quote.said}”` : "Slide over a column, turn it, drop it"}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {done ? `${sim.curb.length} left on the curb` : ghost ? `${sim.filled} packed so far` : "Won't fit there · curb it or turn it"}
          </span>
          {done ? (
            <Button kind="secondary" onClick={() => setLocal({ moves: [], rot: 0, col: 2 })}>
              Repack
            </Button>
          ) : (
            <>
              <Button kind="secondary" onClick={() => setLocal({ rot: (local.rot + 1) % 4 })}>
                Turn
              </Button>
              <Button kind="primary" onClick={drop}>
                {ghost ? "Drop" : "Curb it"}
              </Button>
            </>
          )}
        </div>
        {local.toast > 0 && mine && done ? <Toast key={local.toast}>{`${mine.filled} of ${COLS * ROWS} packed`}</Toast> : null}
      </div>
    );
  },
});
