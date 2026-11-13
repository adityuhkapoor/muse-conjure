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
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Campus guessr: five photos the group shared this semester, redrawn as little polaroids. Drop a pin
// on the campus map where you think each was taken; the reveal draws a line from every pin to the
// spot and scores by distance. The friend who took the photo always wins that round.

type Scene = "pond" | "library" | "pizza" | "dock" | "hill" | "tree" | "coffee" | "lot";
type Kind = "building" | "lake" | "hill" | "green" | "lot" | "shop";
type Params = {
  /** Card title: "Campus guessr" */
  title: string;
  /** Where: "Eastfield" */
  campus: string;
  /** Map landmarks: name, kind (building, lake, hill, green, lot, shop), centre in thousandths of the map; keep x under 330 and y under 450 clear (the photo sits there). */
  places: { name: string; kind: Kind; x: number; y: number }[];
  /** The rounds: who took it, the drawn scene (pond, library, pizza, dock, hill, tree, coffee, lot), where (thousandths), and the caption revealed after. */
  rounds: { by: string; scene: Scene; x: number; y: number; caption: string }[];
  /** Pins already dropped: who, round number from 1, where. */
  guesses: { name: string; round: number; x: number; y: number }[];
};

// @params
const P: Params = {
  title: "Campus guessr",
  campus: "Eastfield",
  places: [
    { name: "Fenwick", kind: "building", x: 430, y: 190 },
    { name: "the Quad", kind: "green", x: 540, y: 460 },
    { name: "Larkin", kind: "building", x: 720, y: 250 },
    { name: "Hollis", kind: "building", x: 330, y: 620 },
    { name: "Lake Wren", kind: "lake", x: 160, y: 820 },
    { name: "Miller Hill", kind: "hill", x: 880, y: 760 },
    { name: "Lot C", kind: "lot", x: 860, y: 470 },
    { name: "Rook's", kind: "shop", x: 620, y: 860 },
  ],
  rounds: [
    { by: "Maya", scene: "pond", x: 230, y: 760, caption: "the bench by the pond, 7am, nobody else awake" },
    { by: "Calvin", scene: "library", x: 410, y: 175, caption: "Fenwick 4th floor, alarm number six" },
    { by: "Arun", scene: "pizza", x: 630, y: 850, caption: "Rook's at 1:40am. worth it" },
    { by: "Will", scene: "hill", x: 900, y: 730, caption: "top of Miller Hill, the Sube made it" },
    { by: "Tsai Lin", scene: "tree", x: 540, y: 400, caption: "the Quad's big oak, aux-free zone" },
  ],
  guesses: [
    { name: "Aditya", round: 1, x: 300, y: 690 },
    { name: "Will", round: 1, x: 180, y: 820 },
    { name: "Tsai Lin", round: 1, x: 420, y: 760 },
    { name: "Maya", round: 2, x: 470, y: 260 },
    { name: "Arun", round: 2, x: 700, y: 260 },
  ],
};
// @end params

type Place = { name: string; kind: Kind; x: number; y: number };
type Round = { by: string; byName: string; scene: Scene; x: number; y: number; caption: string };
type Guess = { who: string; name: string; round: number; x: number; y: number; pts: number; at: number };
type State = { title: string; campus: string; places: Place[]; rounds: Round[]; guesses: Guess[] };
type Action = { t: "guess"; round: number; x: number; y: number };
type Local = { round: number; px: number; py: number; toast: number };

const SCENES: Scene[] = ["pond", "library", "pizza", "dock", "hill", "tree", "coffee", "lot"];
const KINDS: Kind[] = ["building", "lake", "hill", "green", "lot", "shop"];
const METERS = 1400; // the map is this many metres across
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okNum = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const metersOff = (r: Round, x: number, y: number) => Math.round((Math.sqrt((r.x - x) ** 2 + (r.y - y) ** 2) * METERS) / 1000);
const points = (m: number) => Math.max(0, 1000 - m * 2);

function initState(ctx: Ctx): State {
  const who = (name: string) => {
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return m ? m.id : `~${name}`;
  };
  const places: Place[] = [];
  for (const p of Array.isArray(P.places) ? P.places : []) {
    if (places.length >= 10 || !KINDS.includes(p?.kind) || !okNum(p.x) || !okNum(p.y)) continue;
    places.push({ name: clean(p.name, 16), kind: p.kind, x: p.x, y: p.y });
  }
  const rounds: Round[] = [];
  for (const r of Array.isArray(P.rounds) ? P.rounds : []) {
    const name = clean(r?.by, 20);
    if (!name || rounds.length >= 5 || !SCENES.includes(r.scene) || !okNum(r.x) || !okNum(r.y)) continue;
    rounds.push({ by: who(name), byName: name, scene: r.scene, x: r.x, y: r.y, caption: clean(r.caption, 60) });
  }
  const guesses: Guess[] = [];
  for (const g of Array.isArray(P.guesses) ? P.guesses : []) {
    const name = clean(g?.name, 20);
    const k = typeof g?.round === "number" ? Math.round(g.round) - 1 : -1;
    const r = rounds[k];
    if (!name || !r || !okNum(g.x) || !okNum(g.y)) continue;
    const id = who(name);
    if (id === r.by || guesses.some((q) => q.who === id && q.round === k)) continue;
    guesses.push({ who: id, name, round: k, x: g.x, y: g.y, pts: points(metersOff(r, g.x, g.y)), at: 0 });
  }
  return { title: clean(P.title, 40) || "Campus guessr", campus: clean(P.campus, 24), places, rounds, guesses };
}

/** Total per person: guesses, plus 1000 for each round they took (they always win it). */
function totals(s: State): { who: string; name: string; pts: number }[] {
  const t = new Map<string, { who: string; name: string; pts: number }>();
  const add = (who: string, name: string, pts: number) => {
    const e = t.get(who) ?? { who, name, pts: 0 };
    e.pts += pts;
    t.set(who, e);
  };
  for (const g of s.guesses) add(g.who, g.name, g.pts);
  s.rounds.forEach((r, k) => {
    if (s.guesses.some((g) => g.round === k)) add(r.by, r.byName, 1000);
  });
  return [...t.values()].sort((a, b) => b.pts - a.pts);
}

/** A little drawn photo of the scene, inside (0,0)-(w,h). */
function photo(g: CanvasRenderingContext2D, t: Theme, scene: Scene, w: number, h: number) {
  const c = t.color;
  const pl = pal(t);
  const sky = mix(pl.sky, c.card, 0.1);
  const box = (x: number, y: number, ww: number, hh: number, col: string, r = 0) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x, y, ww, hh, r);
    g.fill();
  };
  const blob = (x: number, y: number, rx: number, ry: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  box(0, 0, w, h, sky);
  if (scene === "pond" || scene === "dock") {
    box(0, h * 0.45, w, h * 0.55, mix(pl.blue, c.card, 0.25));
    blob(w * 0.8, h * 0.2, 8, 8, pl.yellow);
    if (scene === "pond") {
      box(0, h * 0.72, w, h * 0.28, pl.grass);
      box(w * 0.18, h * 0.62, w * 0.5, 5, pl.brown, 2);
      box(w * 0.2, h * 0.67, 3, 10, pl.brown);
      box(w * 0.62, h * 0.67, 3, 10, pl.brown);
      box(w * 0.18, h * 0.54, w * 0.5, 4, pl.brown, 2);
      blob(w * 0.78, h * 0.52, 6, 4, pl.paper);
      blob(w * 0.83, h * 0.48, 3, 3, pl.paper);
      box(w * 0.85, h * 0.47, 4, 2, pl.orange);
    } else {
      blob(w * 0.25, h * 0.3, 18, 6, pl.orange);
      for (let k = 0; k < 4; k++) box(w * 0.4 + k * 6, h * 0.5 + k * 9, w * 0.5, 6, pl.crust, 1);
    }
  } else if (scene === "library") {
    box(0, 0, w, h, pl.wall);
    box(w * 0.55, h * 0.12, w * 0.38, h * 0.42, sky, 2);
    box(w * 0.73, h * 0.12, 2, h * 0.42, pl.paper);
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 6; k++) box(w * 0.06 + k * 7, h * 0.14 + row * 18, 5, 14, [pl.red, pl.blue, pl.green, pl.orange, pl.purple, pl.yellow][(k + row) % 6]!, 1);
    box(0, h * 0.75, w, h * 0.25, pl.brown);
    box(w * 0.3, h * 0.66, w * 0.24, 8, pl.paper, 1);
    blob(w * 0.75, h * 0.7, 6, 7, pl.red);
  } else if (scene === "pizza") {
    box(0, 0, w, h, mix(pl.red, c.card, 0.75));
    box(0, h * 0.62, w, h * 0.38, pl.brown);
    g.fillStyle = pl.crust;
    g.beginPath();
    g.moveTo(w * 0.2, h * 0.72);
    g.lineTo(w * 0.85, h * 0.6);
    g.lineTo(w * 0.78, h * 0.85);
    g.closePath();
    g.fill();
    g.fillStyle = pl.yellow;
    g.beginPath();
    g.moveTo(w * 0.27, h * 0.72);
    g.lineTo(w * 0.8, h * 0.63);
    g.lineTo(w * 0.75, h * 0.8);
    g.closePath();
    g.fill();
    blob(w * 0.55, h * 0.7, 3, 3, pl.red);
    blob(w * 0.68, h * 0.7, 3, 3, pl.red);
    box(w * 0.1, h * 0.12, w * 0.5, h * 0.2, pl.dark, 3);
    blob(w * 0.8, h * 0.2, 7, 7, pl.yellow);
  } else if (scene === "hill") {
    blob(w * 0.75, h * 0.25, 9, 9, pl.yellow);
    g.fillStyle = mix(pl.green, c.card, 0.15);
    g.beginPath();
    g.moveTo(0, h);
    g.quadraticCurveTo(w * 0.45, h * 0.15, w, h * 0.7);
    g.lineTo(w, h);
    g.fill();
    box(w * 0.42, h * 0.32, 18, 9, pl.green, 3);
    blob(w * 0.45, h * 0.42, 3, 3, pl.dark);
    blob(w * 0.56, h * 0.42, 3, 3, pl.dark);
    box(w * 0.44, h * 0.29, 12, 2, pl.dark);
  } else if (scene === "tree") {
    box(0, h * 0.68, w, h * 0.32, pl.grass);
    box(w * 0.46, h * 0.4, 8, h * 0.32, pl.brown, 2);
    blob(w * 0.5, h * 0.32, 26, 20, mix(pl.green, pl.leaf, 0.3));
    blob(w * 0.36, h * 0.38, 14, 12, pl.green);
    blob(w * 0.64, h * 0.4, 14, 12, pl.green);
    box(w * 0.05, h * 0.78, w * 0.9, 4, pl.paper, 2);
  } else if (scene === "coffee") {
    box(0, h * 0.6, w, h * 0.4, pl.brown);
    box(w * 0.36, h * 0.38, w * 0.28, h * 0.3, pl.paper, 4);
    box(w * 0.36, h * 0.38, w * 0.28, 5, pl.crust, 2);
    g.strokeStyle = pl.soft;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.45, h * 0.32);
    g.quadraticCurveTo(w * 0.4, h * 0.22, w * 0.47, h * 0.12);
    g.moveTo(w * 0.55, h * 0.32);
    g.quadraticCurveTo(w * 0.5, h * 0.22, w * 0.57, h * 0.12);
    g.stroke();
  } else {
    box(0, h * 0.4, w, h * 0.6, mix(pl.soft, c.card, 0.4));
    for (let k = 0; k < 4; k++) box(w * 0.08 + k * w * 0.23, h * 0.55, w * 0.16, h * 0.28, [pl.red, pl.green, pl.blue, pl.yellow][k]!, 3);
  }
}

function map(g: CanvasRenderingContext2D, t: Theme, s: State, W: number, H: number) {
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const X = (v: number) => (v / 1000) * W;
  const Y = (v: number) => (v / 1000) * H;
  g.fillStyle = dk ? mix(pl.grass, c.card, 0.75) : mix(pl.grass, c.card, 0.55);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  // paths between places
  g.strokeStyle = dk ? mix(c.text, c.card, 0.75) : c.card;
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  const pts = s.places.filter((p) => p.kind !== "lake");
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    g.moveTo(X(a.x), Y(a.y));
    g.quadraticCurveTo(X((a.x + b.x) / 2), Y(a.y), X(b.x), Y(b.y));
  }
  g.stroke();
  for (const p of s.places) {
    const x = X(p.x);
    const y = Y(p.y);
    g.beginPath();
    if (p.kind === "lake") {
      g.ellipse(x, y, X(150), Y(130), -0.3, 0, Math.PI * 2);
      g.fillStyle = mix(pl.blue, c.card, dk ? 0.45 : 0.35);
      g.fill();
    } else if (p.kind === "hill") {
      g.strokeStyle = mix(pl.leaf, c.card, 0.3);
      g.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.ellipse(x, y, X(40 * k), Y(30 * k), 0.2, 0, Math.PI * 2);
        g.stroke();
      }
    } else if (p.kind === "green") {
      g.roundRect(x - X(110), y - Y(90), X(220), Y(180), 8);
      g.fillStyle = mix(pl.green, c.card, dk ? 0.3 : 0.15);
      g.fill();
      g.beginPath();
      g.arc(x - X(50), y - Y(30), 6, 0, Math.PI * 2);
      g.arc(x + X(60), y + Y(35), 7, 0, Math.PI * 2);
      g.fillStyle = pl.leaf;
      g.fill();
    } else if (p.kind === "lot") {
      g.roundRect(x - X(70), y - Y(60), X(140), Y(120), 4);
      g.fillStyle = mix(c.secondaryText, c.card, 0.4);
      g.fill();
    } else {
      g.roundRect(x - X(65), y - Y(55), X(130), Y(110), 5);
      g.fillStyle = p.kind === "shop" ? mix(pl.red, c.card, 0.3) : mix(pl.wall, pl.brown, dk ? 0.5 : 0.25);
      g.fill();
    }
  }
  // labels
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const p of s.places) {
    if (!p.name) continue;
    const f = fitText(p.name, 84, { g, size: 11, min: 10, weight: 600 });
    g.font = f.font;
    const y = Y(p.y) + (p.kind === "lake" || p.kind === "hill" || p.kind === "green" ? 0 : Y(55) + 8);
    g.fillStyle = dk ? c.card : c.card;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.roundRect(X(p.x) - f.width / 2 - 4, y - 7, f.width + 8, 14, 7);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = c.text;
    g.fillText(f.text, X(p.x), y + 0.5);
  }
}

const H = 236;

export default defineApp<State, Action, Local>({
  name: "Campus guessr",
  summary: (s) => {
    const t = totals(s)[0];
    return t ? `${s.title}: ${first(t.name)} leads with ${t.pts} · ${s.guesses.length} pins dropped` : `${s.title}: ${s.rounds.length} photos, no pins yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "guess") return s;
    const k = typeof a.round === "number" && Number.isInteger(a.round) ? a.round : -1;
    const r = s.rounds[k];
    if (!r || r.by === m.user || !okNum(a.x) || !okNum(a.y)) return s;
    if (s.guesses.some((g) => g.who === m.user && g.round === k)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    return { ...s, guesses: [...s.guesses, { who: m.user, name, round: k, x: a.x, y: a.y, pts: points(metersOff(r, a.x, a.y)), at: m.time }].slice(-60) };
  },

  invariants: {
    "points come from the distance": (s) => s.guesses.every((g) => !!s.rounds[g.round] && g.pts === points(metersOff(s.rounds[g.round]!, g.x, g.y))),
    "one pin per person per round": (s) => new Set(s.guesses.map((g) => `${g.who}|${g.round}`)).size === s.guesses.length,
    "you can't guess your own photo": (s) => s.guesses.every((g) => s.rounds[g.round]?.by !== g.who),
    "pins are on the map": (s) => s.guesses.every((g) => okNum(g.x) && okNum(g.y)),
  },

  transitions: {
    "a guess adds exactly your pin": (p, n, a, m) => {
      if (a.t !== "guess" || p === n) return true;
      const last = n.guesses[n.guesses.length - 1];
      return !!last && last.who === m.user && last.round === a.round && last.x === a.x && last.y === a.y && last.at === m.time;
    },
    "pins never move": (p, n) => p.guesses.every((g) => !n.guesses.some((q) => q.who === g.who && q.round === g.round) || n.guesses.some((q) => q.who === g.who && q.round === g.round && q.x === g.x && q.y === g.y && q.pts === g.pts)),
    "a guess grows the pins by one": (p, n, a) => a.t !== "guess" || p === n || n.guesses.length === Math.min(60, p.guesses.length + 1),
    "your guess carries your name": (p, n, _a, m, ctx) => p === n || n.guesses[n.guesses.length - 1]?.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend"),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const open = s.rounds.map((_, k) => k).filter((k) => s.rounds[k]!.by !== user && !s.guesses.some((g) => g.who === user && g.round === k));
    const k = open.length ? r.pick(open) : r.int(Math.max(1, s.rounds.length));
    return { t: "guess", round: k, x: r.int(1001), y: r.int(1001) };
  },

  local: { round: -1, px: -1, py: -1, toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const W = theme.width - 2 * theme.space.card;
    const nameOf = (id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
    const mineIn = (k: number) => s.guesses.find((g) => g.who === me && g.round === k);
    const todo = s.rounds.findIndex((r, k) => r.by !== me && !mineIn(k));
    const k = local.round >= 0 && local.round < s.rounds.length ? local.round : todo >= 0 ? todo : Math.max(0, s.rounds.length - 1);
    const r = s.rounds[k];
    if (!r) return <div><CardHeader title={s.title} subtitle="No photos yet" /></div>;
    const mine = mineIn(k);
    const own = r.by === me;
    const revealed = !!mine || own;
    const pins = s.guesses.filter((g) => g.round === k);
    const pinned = local.px >= 0 && !revealed;
    const tot = totals(s);
    const fx = (v: number) => (v / 1000) * W;
    const fy = (v: number) => (v / 1000) * H;
    const PW = 96;
    const PH = 104;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      map(g, theme, s, W, H);
      if (revealed) {
        // lines from every pin to the spot, then the spot
        g.lineWidth = 2;
        g.setLineDash([4, 4]);
        for (const q of pins) {
          g.strokeStyle = userColor(q.who, theme);
          g.beginPath();
          g.moveTo(fx(q.x), fy(q.y));
          g.lineTo(fx(r.x), fy(r.y));
          g.stroke();
        }
        g.setLineDash([]);
        const pulse = 1 + 0.12 * Math.sin(f.now / 250);
        g.fillStyle = pl.yellow;
        g.strokeStyle = c.text;
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = (i % 2 ? 5 : 11) * pulse;
          g.lineTo(fx(r.x) + Math.cos(a) * rr, fy(r.y) + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
      if (pinned) {
        g.fillStyle = c.primary;
        g.beginPath();
        g.arc(fx(local.px), fy(local.py) - 14, 8, 0, Math.PI * 2);
        g.moveTo(fx(local.px) - 6, fy(local.py) - 10);
        g.lineTo(fx(local.px), fy(local.py));
        g.lineTo(fx(local.px) + 6, fy(local.py) - 10);
        g.fill();
        g.fillStyle = c.onPrimary;
        g.beginPath();
        g.arc(fx(local.px), fy(local.py) - 14, 3, 0, Math.PI * 2);
        g.fill();
      }
      // the polaroid, tilted, in the corner
      g.save();
      g.translate(8, 8);
      g.rotate(-0.05);
      g.fillStyle = c.text;
      g.globalAlpha = 0.18;
      g.fillRect(2, 3, PW, PH);
      g.globalAlpha = 1;
      g.fillStyle = pl.paper;
      g.fillRect(0, 0, PW, PH);
      g.save();
      g.translate(6, 6);
      g.beginPath();
      g.rect(0, 0, PW - 12, PH - 30);
      g.clip();
      photo(g, theme, r.scene, PW - 12, PH - 30);
      g.restore();
      const cap = fitText(`${k + 1} of ${s.rounds.length} · ${first(nameOf(r.by, r.byName))}`, PW - 12, { g, size: 11, min: 10, weight: 600 });
      g.font = cap.font;
      g.fillStyle = theme.mode === "dark" ? c.card : c.text;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(cap.text, PW / 2, PH - 12);
      g.restore();
      return revealed;
    };

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "down" || revealed) return;
      if (e.x < PW + 14 && e.y < PH + 14) return;
      haptic("light");
      setLocal({ round: k, px: Math.max(0, Math.min(1000, Math.round((e.x / W) * 1000))), py: Math.max(0, Math.min(1000, Math.round((e.y / H) * 1000))) });
    };

    const best = [...pins].sort((a, b) => b.pts - a.pts)[0];
    const myM = mine ? metersOff(r, mine.x, mine.y) : 0;
    const label = `Map of ${s.campus || "campus"} with photo ${k + 1} of ${s.rounds.length}, taken by ${nameOf(r.by, r.byName)}. ${pins.length} pins.${revealed ? ` It was ${r.caption}.` : ""}`;
    const nextRound = s.rounds.findIndex((rr, kk) => kk !== k && rr.by !== me && !mineIn(kk));

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.campus ? `${s.campus} · ` : ""}where was this taken?`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={label} draw={draw} onPointer={onPointer} />
          {(revealed ? pins : []).map((q) => (
            <div key={q.who} style={{ position: "absolute", left: fx(q.x) - 10, top: fy(q.y) - 10, display: "flex", pointerEvents: "none" }}>
              <Avatar user={{ id: q.who, name: nameOf(q.who, q.name) } as Member} size={20} />
            </div>
          ))}
          {!revealed && !pinned ? (
            <div style={{ position: "absolute", right: 8, top: 8, padding: "2px 10px", borderRadius: 12, background: c.card, color: c.text, fontSize: 13, fontWeight: 600, lineHeight: "20px", pointerEvents: "none" }}>
              Tap the map
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 20, fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ell }}>
          {own
            ? `Your photo · you win this round · “${r.caption}”`
            : mine
              ? `${myM} m off · ${mine.pts} pts · “${r.caption}”`
              : pins.length
                ? `${pins.length} pinned so far · ${first(nameOf(r.by, r.byName))} took it and wins this round`
                : `Nobody's pinned this one yet · ${first(nameOf(r.by, r.byName))} took it`}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 4, overflow: "hidden" }}>
            {tot.slice(0, theme.width < 360 ? 2 : 3).map((t) => (
              <span key={t.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 3, padding: "0 7px 0 2px", height: 26, borderRadius: 13, background: t.who === me ? c.selected : c.wash, fontSize: 12, fontWeight: 600, color: c.text }}>
                <Avatar user={{ id: t.who, name: nameOf(t.who, t.name) } as Member} size={22} />
                {String(t.pts)}
              </span>
            ))}
          </div>
          {revealed ? (
            nextRound >= 0 ? (
              <Button kind="primary" onClick={() => setLocal({ round: nextRound, px: -1, py: -1 })}>
                Next photo
              </Button>
            ) : (
              <Button kind="secondary" onClick={() => setLocal({ round: (k + 1) % s.rounds.length, px: -1, py: -1 })}>
                {`Photo ${((k + 1) % s.rounds.length) + 1}`}
              </Button>
            )
          ) : (
            <Button
              kind="primary"
              disabled={!pinned}
              onClick={() => {
                haptic("success");
                dispatch({ t: "guess", round: k, x: local.px, y: local.py });
                setLocal({ round: k, px: -1, py: -1, toast: local.toast + 1 });
              }}
            >
              Lock my pin
            </Button>
          )}
        </div>
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`${myM} m off · ${mine.pts} pts`}</Toast> : null}
      </div>
    );
  },
});
