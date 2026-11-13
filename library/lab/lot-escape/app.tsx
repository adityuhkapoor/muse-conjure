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
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Lot escape: Lot C at 5:01pm, and the Sube is boxed in. Slide the parked cars along their lanes
// until the Sube can drive out the gate. Fewest moves wins; par is the true minimum. Three lots from
// the chat, each with the friends' best under it.

type Params = {
  /** Card title: "Get the Sube out" */
  title: string;
  /** The car you're freeing: "the Sube" */
  hero: string;
  /** Lots, 6 rows of 6 each: "." empty, "X" the hero (on row 3, facing the gate on the right), letters for other cars. */
  levels: { name: string; rows: string[]; cars?: Record<string, string> }[];
  /** Friends' best solves: lot number (1-based), moves, a line. */
  board: { name: string; level: number; moves: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Get the Sube out",
  hero: "the Sube",
  levels: [
    { name: "Lot C, 5:01pm", rows: ["..A...", "..A.BB", "XXA..C", "..DD.C", "...EEC", "......"], cars: { A: "Calvin's Civic", C: "campus shuttle" } },
    { name: "after the game", rows: ["..ABBB", "..A..C", "XXA..C", "DEEF.C", "D..F..", "GGHH.."], cars: { B: "tailgate truck", C: "band bus" } },
    { name: "move-in day", rows: ["GFFJ..", "G..JD.", "XXE.D.", "..EAAA", "CCC.II", "BBHH.."], cars: { A: "U-Haul", C: "Maya's mom's van" } },
  ],
  board: [
    { name: "Will", level: 1, moves: 4, said: "i park here every day. it's muscle memory" },
    { name: "Calvin", level: 1, moves: 9, said: "my civic is not the problem" },
    { name: "Maya", level: 2, moves: 8 },
    { name: "Arun", level: 2, moves: 11 },
  ],
};
// @end params

type Car = { id: string; x: number; y: number; len: number; h: boolean; label: string };
type Level = { name: string; cars: Car[]; par: number };
type Best = { who: string; name: string; level: number; moves: number; said: string; at: number };
type State = { title: string; hero: string; levels: Level[]; board: Best[] };
type Move = [number, number];
type Action = { t: "solve"; level: number; moves: Move[] };
type Local = { level: number; moves: Move[]; drag: number; from: number; off: number; toast: number; at: number };

const N = 6;
const EXIT_Y = 2;
const MAXM = 80;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const chan = (c: string) => {
  if (c.startsWith("#")) {
    const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g) ?? [];
  return [0, 1, 2].map((i) => Number(m[i] ?? 0));
};
const lum = (c: string) => {
  const [r, g, b] = chan(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** Text color for a fill: whichever of two theme colors reads better on it. */
const onFill = (bg: string, a: string, b: string) => (ratio(a, bg) >= ratio(b, bg) ? a : b);

function parse(rows: unknown, labels: Record<string, string> | undefined, hero: string): Car[] | null {
  if (!Array.isArray(rows) || rows.length !== N) return null;
  const m = new Map<string, Car>();
  for (let y = 0; y < N; y++) {
    const r = rows[y];
    if (typeof r !== "string" || r.length !== N) return null;
    for (let x = 0; x < N; x++) {
      const ch = r[x]!;
      if (ch === ".") continue;
      const c = m.get(ch);
      if (!c) m.set(ch, { id: ch, x, y, len: 1, h: true, label: ch === "X" ? hero : clean(labels?.[ch], 20) });
      else {
        c.len++;
        c.h = c.y === y;
      }
    }
  }
  const cars = [...m.values()];
  const X = cars.find((c) => c.id === "X");
  if (!X || !X.h || X.y !== EXIT_Y || X.len !== 2) return null;
  // every car must be a straight 2 or 3 long run
  for (const c of cars) {
    if (c.len < 2 || c.len > 3) return null;
    for (let k = 0; k < c.len; k++) if (rows[c.h ? c.y : c.y + k]?.[c.h ? c.x + k : c.x] !== c.id) return null;
  }
  return [X, ...cars.filter((c) => c !== X)];
}
const occupied = (cars: Car[], skip: number) => {
  const o = new Set<number>();
  cars.forEach((c, i) => {
    if (i !== skip) for (let k = 0; k < c.len; k++) o.add(c.h ? c.y * N + c.x + k : (c.y + k) * N + c.x);
  });
  return o;
};
/** How far car i can slide: [most negative, most positive]. */
function room(cars: Car[], i: number): [number, number] {
  const c = cars[i]!;
  const o = occupied(cars, i);
  let lo = 0;
  let hi = 0;
  const pos = c.h ? c.x : c.y;
  const at = (p: number) => (c.h ? c.y * N + p : p * N + c.x);
  while (pos + lo - 1 >= 0 && !o.has(at(pos + lo - 1))) lo--;
  while (pos + c.len + hi < N && !o.has(at(pos + c.len + hi))) hi++;
  return [lo, hi];
}
function apply(cars: Car[], moves: Move[]): Car[] | null {
  let cs = cars;
  for (const mv of moves) {
    if (!Array.isArray(mv) || mv.length !== 2) return null;
    const [i, d] = mv;
    if (typeof i !== "number" || typeof d !== "number" || !Number.isInteger(i) || !Number.isInteger(d) || !cs[i] || d === 0) return null;
    const [lo, hi] = room(cs, i);
    if (d < lo || d > hi) return null;
    cs = cs.map((c, j) => (j !== i ? c : c.h ? { ...c, x: c.x + d } : { ...c, y: c.y + d }));
  }
  return cs;
}
const out = (cars: Car[]) => cars[0]!.x + cars[0]!.len === N;
/** The shortest way out, by breadth-first search (remembered per layout: it never changes). */
const pathMemo = new Map<string, Move[]>();
function shortest(cars: Car[]): Move[] {
  const id = cars.map((c) => `${c.x}${c.y}${c.len}${c.h ? 1 : 0}`).join("|");
  const hit = pathMemo.get(id);
  if (hit) return hit;
  const key = (cs: Car[]) => cs.map((c) => (c.h ? c.x : c.y)).join(",");
  const prev = new Map<string, [string, Move] | null>([[key(cars), null]]);
  let q = [cars];
  let found = "";
  for (let d = 0; d < 40 && q.length && !found; d++) {
    const nq: Car[][] = [];
    for (const cs of q) {
      const k0 = key(cs);
      if (out(cs)) {
        found = k0;
        break;
      }
      for (let i = 0; i < cs.length; i++) {
        const [lo, hi] = room(cs, i);
        for (let st = lo; st <= hi; st++) {
          if (!st) continue;
          const n = cs.map((c, j) => (j !== i ? c : c.h ? { ...c, x: c.x + st } : { ...c, y: c.y + st }));
          const k = key(n);
          if (!prev.has(k)) {
            prev.set(k, [k0, [i, st]]);
            nq.push(n);
          }
        }
      }
    }
    q = nq;
    if (prev.size > 60000) break;
  }
  const path: Move[] = [];
  for (let k = found, p = prev.get(k); found && p; k = p[0], p = prev.get(k)) path.unshift(p[1]);
  pathMemo.set(id, path);
  return path;
}
const par = (cars: Car[]) => shortest(cars).length;
const validMoves = (s: State, level: number, moves: unknown): moves is Move[] => {
  const l = s.levels[level];
  if (!l || !Array.isArray(moves) || moves.length < 1 || moves.length > MAXM) return false;
  const end = apply(l.cars, moves as Move[]);
  return !!end && out(end);
};

function initState(ctx: Ctx): State {
  const hero = clean(P.hero, 16) || "the car";
  const levels: Level[] = [];
  for (const l of Array.isArray(P.levels) ? P.levels : []) {
    if (levels.length >= 3) break;
    const cars = parse(l?.rows, l?.cars, hero);
    if (!cars) continue;
    const p = par(cars);
    if (!p) continue;
    levels.push({ name: clean(l.name, 24) || `Lot ${levels.length + 1}`, cars, par: p });
  }
  if (!levels.length) {
    const cars = parse(["..A...", "..A.BB", "XXA..C", "..DD.C", "...EEC", "......"], {}, hero)!;
    levels.push({ name: "the lot", cars, par: par(cars) });
  }
  const board: Best[] = [];
  for (const b of Array.isArray(P.board) ? P.board : []) {
    const name = clean(b?.name, 20);
    const level = typeof b?.level === "number" ? Math.round(b.level) - 1 : -1;
    const lv = levels[level];
    if (!name || !lv || typeof b.moves !== "number" || board.length >= 18) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (board.some((x) => x.who === who && x.level === level)) continue;
    board.push({ who, name, level, moves: Math.max(lv.par, Math.min(MAXM, Math.round(b.moves))), said: clean(b.said, 60), at: 0 });
  }
  return { title: clean(P.title, 40) || "Lot escape", hero, levels, board };
}

function topCar(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, w: number, h: number, body: string, hero: boolean, horiz: boolean, big: boolean, plain: boolean) {
  const c = t.color;
  g.fillStyle = mix(body, c.text, 0.25);
  g.beginPath();
  g.roundRect(x + 1, y + 2, w - 2, h - 2, 7);
  g.fill();
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(x, y, w - 2, h - 3, 7);
  g.fill();
  if (plain) return;
  // windshield and rear window
  g.fillStyle = mix(body, c.card, 0.62);
  g.beginPath();
  if (horiz) {
    const L = w - 2;
    g.roundRect(x + L * (big ? 0.72 : 0.6), y + 5, L * (big ? 0.12 : 0.16), h - 13, 3);
    if (!big) g.roundRect(x + L * 0.14, y + 5, L * 0.12, h - 13, 3);
  } else {
    const L = h - 3;
    g.roundRect(x + 5, y + L * (big ? 0.72 : 0.6), w - 12, L * (big ? 0.12 : 0.16), 3);
    if (!big) g.roundRect(x + 5, y + L * 0.14, w - 12, L * 0.12, 3);
  }
  g.fill();
  if (hero) {
    // roof rack
    g.strokeStyle = mix(body, c.text, 0.55);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + w * 0.3, y + 4);
    g.lineTo(x + w * 0.3, y + h - 7);
    g.moveTo(x + w * 0.45, y + 4);
    g.lineTo(x + w * 0.45, y + h - 7);
    g.stroke();
  }
}

export default defineApp<State, Action, Local>({
  name: "Lot escape",
  summary: (s) => {
    const n = new Set(s.board.map((b) => b.who)).size;
    return `${s.title}: ${s.levels.length} lots · ${n} ${n === 1 ? "friend" : "friends"} got out`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "solve") return s;
    const level = typeof a.level === "number" && Number.isInteger(a.level) ? a.level : -1;
    if (!validMoves(s, level, a.moves)) return s;
    const moves = a.moves.length;
    const old = s.board.find((b) => b.who === m.user && b.level === level);
    if (old && old.moves <= moves) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    const row: Best = { who: m.user, name, level, moves, said: "", at: m.time };
    return { ...s, board: old ? s.board.map((b) => (b === old ? row : b)) : [...s.board, row].slice(-18) };
  },

  invariants: {
    "nobody beats par": (s) => s.board.every((b) => !!s.levels[b.level] && b.moves >= s.levels[b.level]!.par && b.moves <= MAXM),
    "one best per person per lot": (s) => new Set(s.board.map((b) => `${b.who}|${b.level}`)).size === s.board.length,
    "every lot has a way out": (s) => s.levels.every((l) => l.par > 0 && l.cars[0]!.y === EXIT_Y),
  },

  transitions: {
    "a solve must drive out": (p, n, a) => a.t !== "solve" || p === n || validMoves(p, a.level, a.moves),
    "a best only gets better": (p, n) => p.board.every((b) => (n.board.find((x) => x.who === b.who && x.level === b.level)?.moves ?? Infinity) <= b.moves),
    "your row records your moves": (p, n, a, m) => {
      if (a.t !== "solve" || p === n) return true;
      const r = n.board.find((b) => b.who === m.user && b.level === a.level);
      return !!r && r.moves === a.moves.length && r.at === m.time;
    },
    "others' rows stay put": (p, n, _a, m) => n.board.filter((b) => b.who !== m.user).every((b) => p.board.some((x) => x.who === b.who && x.level === b.level && x.moves === b.moves)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    // a real way out, padded with there-and-back moves so it lands just under your best
    const open = s.levels.map((_, i) => i).filter((i) => (s.board.find((b) => b.who === user && b.level === i)?.moves ?? MAXM + 1) > s.levels[i]!.par);
    const level = open.length && r.next() < 0.9 ? r.pick(open) : r.int(s.levels.length);
    const lv = s.levels[level]!;
    const best = s.board.find((b) => b.who === user && b.level === level)?.moves ?? MAXM + 1;
    const want = Math.max(lv.par, Math.min(MAXM, best - 1 - r.int(4)));
    const moves: Move[] = [];
    for (let k = lv.par; k + 2 <= want; k += 2) {
      const i = r.int(lv.cars.length);
      const [lo, hi] = room(lv.cars, i);
      const d = hi > 0 ? hi : lo;
      if (!d) break;
      moves.push([i, d], [i, -d]);
    }
    return { t: "solve", level, moves: [...moves, ...shortest(lv.cars)] };
  },

  local: { level: 0, moves: [], drag: -1, from: 0, off: 0, toast: 0, at: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const side = Math.min(234, W - 128);
    const cell = Math.floor((side - 12) / N);
    const B = cell * N + 12;
    const li = Math.min(local.level, s.levels.length - 1);
    const lv = s.levels[li]!;
    const cars = apply(lv.cars, local.moves) ?? lv.cars;
    const done = out(cars);
    const exitAnim = done ? running(local.at, 900) : null;
    const nameOf = (b: Best) => members.find((m) => m.id === b.who)?.name ?? b.name;
    const here = s.board.filter((b) => b.level === li).sort((a, b) => a.moves - b.moves || a.at - b.at);
    const mine = here.find((b) => b.who === me);
    const colors = [pl.red, pl.blue, pl.orange, pl.purple, pl.yellow, mix(pl.blue, pl.purple, 0.5), pl.brown, mix(pl.red, pl.orange, 0.5)];
    const said = here.find((b) => b.said);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // the lot
      g.fillStyle = dk ? mix(c.wash, c.text, 0.14) : mix(c.secondaryText, c.card, 0.42);
      g.beginPath();
      g.roundRect(0, 0, B, B, 10);
      g.fill();
      g.strokeStyle = dk ? mix(c.text, c.wash, 0.6) : c.card;
      g.lineWidth = 1;
      g.setLineDash([4, 5]);
      g.beginPath();
      for (let k = 1; k < N; k++) {
        g.moveTo(6 + k * cell, 6);
        g.lineTo(6 + k * cell, B - 6);
        g.moveTo(6, 6 + k * cell);
        g.lineTo(B - 6, 6 + k * cell);
      }
      g.stroke();
      g.setLineDash([]);
      // the gate: a gap in the right edge with a boom
      const gy = 6 + EXIT_Y * cell;
      g.fillStyle = c.card;
      g.fillRect(B - 6, gy, 6, cell);
      const lift = done ? Math.min(1, (f.now - local.at) / 300) : 0;
      g.save();
      g.translate(B - 3, gy + 2);
      g.rotate(-lift * 1.3);
      g.fillStyle = c.negative;
      g.fillRect(-2, 0, 4, cell - 4);
      g.fillStyle = c.card;
      for (let k = 0; k < cell - 4; k += 8) g.fillRect(-2, k, 4, 4);
      g.restore();
      // exit arrows painted on the gate lane
      g.fillStyle = mix(pl.yellow, dk ? c.wash : c.card, 0.15);
      for (let k = 0; k < 2; k++) {
        const ax = B - 14 - k * 12;
        g.beginPath();
        g.moveTo(ax - 5, gy + cell / 2 - 7);
        g.lineTo(ax + 2, gy + cell / 2);
        g.lineTo(ax - 5, gy + cell / 2 + 7);
        g.lineTo(ax - 8, gy + cell / 2 + 7);
        g.lineTo(ax - 1, gy + cell / 2);
        g.lineTo(ax - 8, gy + cell / 2 - 7);
        g.closePath();
        g.fill();
      }
      // cars
      cars.forEach((car, i) => {
        let x = 6 + car.x * cell;
        let y = 6 + car.y * cell;
        if (i === local.drag) {
          if (car.h) x += local.off;
          else y += local.off;
        }
        if (i === 0 && exitAnim !== null) x += Math.pow(exitAnim / 900, 2) * (W - x);
        const w = car.h ? car.len * cell : cell;
        const h = car.h ? cell : car.len * cell;
        const body = i === 0 ? pl.green : colors[(car.id.charCodeAt(0) * 7) % colors.length]!;
        const labeled = i > 0 && !!car.label && car.len * cell > 56;
        topCar(g, theme, x + 3, y + 3, w - 6, h - 6, body, i === 0, car.h, car.len === 3, labeled);
        if (labeled) {
          const fit = fitText(i === 0 ? car.label : car.label, (car.h ? w : h) - 18, { g, size: 11, min: 10, weight: 600 });
          g.save();
          g.translate(x + w / 2, y + h / 2);
          if (!car.h) g.rotate(-Math.PI / 2);
          g.font = fit.font;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = onFill(body, c.text, c.card);
          g.fillText(fit.text, 0, 0);
          g.restore();
        }
      });
      return exitAnim !== null || local.drag >= 0;
    };

    const hit = (x: number, y: number) => cars.findIndex((car) => {
      const cx = Math.floor((x - 6) / cell);
      const cy = Math.floor((y - 6) / cell);
      return car.h ? cy === car.y && cx >= car.x && cx < car.x + car.len : cx === car.x && cy >= car.y && cy < car.y + car.len;
    });
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (done) return;
      if (e.type === "down") {
        const i = hit(e.x, e.y);
        if (i >= 0) setLocal({ drag: i, from: cars[i]!.h ? e.x : e.y, off: 0 });
        return;
      }
      if (local.drag < 0) return;
      const car = cars[local.drag]!;
      const [lo, hi] = room(cars, local.drag);
      const raw = (car.h ? e.x : e.y) - local.from;
      const off = Math.max(lo * cell, Math.min(hi * cell, raw));
      if (e.type === "move") return setLocal({ off });
      const d = Math.round(off / cell);
      if (d === 0) return setLocal({ drag: -1, off: 0 });
      haptic("light");
      const moves: Move[] = [...local.moves, [local.drag, d]];
      const end = apply(lv.cars, moves);
      setLocal({ drag: -1, off: 0, moves, at: end && out(end) ? clock.peek() : local.at });
    };

    const label = `${lv.name}: ${cars.length - 1} cars around ${s.hero}, ${local.moves.length} moves, par ${lv.par}${done ? ", out" : ""}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${lv.name} · slide cars to clear the gate`} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ width: B, flex: "none" }}>
            <Canvas height={B} drag label={label} draw={draw} onPointer={onPointer} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {s.levels.map((l, i) => {
              const best = s.board.filter((b) => b.level === i).sort((a, b) => a.moves - b.moves)[0];
              const on = i === li;
              return (
                <button
                  key={`l${i}`}
                  type="button"
                  aria-label={`Lot ${i + 1}: ${l.name}, par ${l.par}`}
                  onClick={() => setLocal({ level: i, moves: [], drag: -1, off: 0, at: 0 })}
                  style={{ minHeight: 44, padding: "4px 8px", borderRadius: 8, textAlign: "left", background: on ? c.selected : c.wash, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}
                >
                  <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, ...ell }}>{`${i + 1} · ${l.name}`}</span>
                  <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    {`par ${l.par}`}
                    {best ? <Avatar user={{ id: best.who, name: nameOf(best) }} size={14} /> : null}
                    {best ? <span style={ell}>{String(best.moves)}</span> : null}
                  </span>
                </button>
              );
            })}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {here.slice(0, 4).map((b) => (
                <span key={b.who} style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 6px 0 2px", height: 22, borderRadius: 11, background: b.who === me ? c.selected : c.wash, fontSize: 12, fontWeight: 600, color: c.text }}>
                  <Avatar user={{ id: b.who, name: nameOf(b) } as Member} size={18} />
                  {String(b.moves)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
          {done
            ? local.moves.length === lv.par
              ? `Out in ${local.moves.length} · that's par`
              : `Out in ${local.moves.length} · par is ${lv.par}`
            : local.moves.length
              ? `${local.moves.length} ${local.moves.length === 1 ? "move" : "moves"} · par ${lv.par}`
              : said
                ? `${first(nameOf(said))}: “${said.said}”`
                : here.length
                  ? `${here.length} got out of this one · par ${lv.par}`
                  : `Nobody's out yet · drag a car along its lane`}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{mine ? `Your best here: ${mine.moves}` : here[0] ? `${first(nameOf(here[0]))} leads with ${here[0].moves}` : ""}</span>
          {local.moves.length ? (
            <Button kind="secondary" onClick={() => setLocal({ moves: [], drag: -1, off: 0, at: 0 })}>
              Reset
            </Button>
          ) : null}
          {done ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic("success");
                dispatch({ t: "solve", level: li, moves: local.moves });
                setLocal({ toast: local.toast + 1, moves: [], at: 0 });
              }}
            >
              {`Post ${local.moves.length} moves`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`${mine.moves} moves on the board`}</Toast> : null}
      </div>
    );
  },
});
