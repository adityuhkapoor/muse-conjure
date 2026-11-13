import { defineApp, Button, Canvas, CardHeader, Facepile, fitText, haptic, mix, pal, running, type Ctx, type DrawFrame, type Theme } from "@muse/app";

// Dining tonight: "is hollis good tonight or should i walk to Larkin". Tonight's menu drawn as a
// cafeteria tray, a dish in each compartment. Members thumb dishes as they eat; each dish glows
// by how good tonight's batch is, and the best one wears what people are saying about it. The
// verdict at the bottom answers the question: stay, or walk.

type Kind = "curry" | "pizza" | "salad" | "noodles" | "soup" | "dessert" | "burger" | "tacos";
type Params = {
  /** The hall: "Hollis" */
  hall: string;
  /** The other option if it's bad: "Larkin" */
  other: string;
  /** Under the title: "Hollis Hall eaters · dinner till 8:30" */
  sub: string;
  /** Tonight's dishes: name, a picture, thumbs so far from the group, and what someone said */
  dishes: { name: string; kind: Kind; up: number; down: number; said?: string; by?: string }[];
};

// @params
const P: Params = {
  hall: "Hollis",
  other: "Larkin",
  sub: "Hollis Hall eaters · dinner till 8:30",
  dishes: [
    { name: "Chickpea curry", kind: "curry", up: 23, down: 2, said: "the curry is back and it's great", by: "Tsai Lin" },
    { name: "Pepperoni", kind: "pizza", up: 9, down: 7, said: "cold in the middle again", by: "Calvin" },
    { name: "Salad bar", kind: "salad", up: 6, down: 1 },
    { name: "Lo mein", kind: "noodles", up: 4, down: 9, said: "arun's rice cooker could never", by: "Will" },
    { name: "Tomato soup", kind: "soup", up: 11, down: 2 },
    { name: "Brownies", kind: "dessert", up: 15, down: 0, said: "took four. no regrets", by: "Maya" },
  ],
};
// @end params

type Dish = { name: string; kind: Kind; up: number; down: number; said: string; by: string };
type Vote = { who: string; d: number; v: number; at: number };
type State = { hall: string; other: string; sub: string; dishes: Dish[]; votes: Vote[] };
type Action = { t: "vote"; d: number; v: number };
type Local = { sel: number };

const KINDS: Kind[] = ["curry", "pizza", "salad", "noodles", "soup", "dessert", "burger", "tacos"];
const CH = 212;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const ups = (s: State, d: number) => s.dishes[d]!.up + s.votes.filter((x) => x.d === d && x.v === 1).length;
const downs = (s: State, d: number) => s.dishes[d]!.down + s.votes.filter((x) => x.d === d && x.v === -1).length;
/** 0 to 1: how good tonight's batch is, from the thumbs. */
const glow = (s: State, d: number) => {
  const u = ups(s, d);
  const n = u + downs(s, d);
  return n === 0 ? 0 : u / n;
};
const best = (s: State) => s.dishes.map((_, i) => i).sort((a, b) => ups(s, b) - downs(s, b) - (ups(s, a) - downs(s, a)) || a - b)[0] ?? 0;
const verdict = (s: State) => {
  const u = s.dishes.reduce((n, _, i) => n + ups(s, i), 0);
  const d = s.dishes.reduce((n, _, i) => n + downs(s, i), 0);
  return { u, d, good: u + d > 0 && u >= d * 2 };
};

function initState(_ctx: Ctx): State {
  const dishes: Dish[] = [];
  for (const x of Array.isArray(P.dishes) ? P.dishes : []) {
    const name = clean(x?.name, 20);
    if (!name || dishes.length >= 8) continue;
    dishes.push({ name, kind: KINDS.includes(x.kind) ? x.kind : "curry", up: isInt(x.up, 0, 9999) ? x.up : 0, down: isInt(x.down, 0, 9999) ? x.down : 0, said: clean(x.said, 60), by: clean(x.by, 20) });
  }
  if (!dishes.length) dishes.push({ name: "Tonight's special", kind: "curry", up: 0, down: 0, said: "", by: "" });
  return { hall: clean(P.hall, 20) || "the dining hall", other: clean(P.other, 20), sub: clean(P.sub, 60), dishes, votes: [] };
}

function drawDish(g: CanvasRenderingContext2D, k: Kind, x: number, y: number, r: number, t: Theme) {
  const p = pal(t);
  const c = t.color;
  const bowl = (fill: string) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = c.card;
    g.fill();
    g.beginPath();
    g.arc(x, y, r * 0.8, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  const dots = (col: string, n: number, rr: number, spread: number, seed: number) => {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.4;
      const d = spread * (0.3 + ((i * 37) % 10) / 14);
      g.moveTo(x + Math.cos(a) * d + rr, y + Math.sin(a) * d);
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2);
    }
    g.fillStyle = col;
    g.fill();
  };
  if (k === "curry") {
    bowl(p.orange);
    g.beginPath();
    g.ellipse(x - r * 0.25, y - r * 0.1, r * 0.38, r * 0.3, -0.3, 0, Math.PI * 2);
    g.fillStyle = c.card;
    g.fill();
    dots(p.cream, 6, r * 0.08, r * 0.55, 1);
    dots(p.green, 3, r * 0.06, r * 0.5, 3);
  } else if (k === "soup") {
    bowl(mix(p.red, p.orange, 0.3));
    g.beginPath();
    g.arc(x + r * 0.15, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
    g.strokeStyle = mix(p.cream, c.card, 0.3);
    g.lineWidth = 2;
    g.stroke();
    dots(p.cream, 4, r * 0.09, r * 0.45, 2);
  } else if (k === "salad") {
    bowl(p.leaf);
    dots(p.green, 7, r * 0.2, r * 0.45, 0.5);
    dots(p.red, 3, r * 0.1, r * 0.4, 2);
  } else if (k === "noodles") {
    bowl(p.cream);
    g.strokeStyle = mix(p.crust, p.yellow, 0.4);
    g.lineWidth = 2;
    g.beginPath();
    for (let i = -2; i <= 2; i++) {
      g.moveTo(x - r * 0.6, y + i * r * 0.18);
      g.bezierCurveTo(x - r * 0.2, y + i * r * 0.18 - 5, x + r * 0.2, y + i * r * 0.18 + 5, x + r * 0.6, y + i * r * 0.18);
    }
    g.stroke();
    dots(p.green, 3, r * 0.08, r * 0.4, 1);
  } else if (k === "pizza") {
    g.beginPath();
    g.moveTo(x - r * 0.75, y - r * 0.55);
    g.lineTo(x + r * 0.75, y - r * 0.55);
    g.lineTo(x, y + r * 0.85);
    g.closePath();
    g.fillStyle = mix(p.yellow, p.cream, 0.3);
    g.fill();
    g.beginPath();
    g.roundRect(x - r * 0.8, y - r * 0.72, r * 1.6, r * 0.24, 4);
    g.fillStyle = p.crust;
    g.fill();
    dots(p.red, 4, r * 0.12, r * 0.3, 1.2);
  } else if (k === "dessert") {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.roundRect(x - r * 0.75 + (i % 2) * r * 0.55, y - r * 0.6 + i * r * 0.38, r * 0.85, r * 0.6, 3);
      g.fillStyle = mix(p.brown, c.text, 0.1);
      g.fill();
      g.fillStyle = mix(p.brown, c.card, 0.3);
      g.fillRect(x - r * 0.7 + (i % 2) * r * 0.55, y - r * 0.56 + i * r * 0.38, r * 0.75, 2);
    }
  } else if (k === "burger") {
    g.beginPath();
    g.arc(x, y, r * 0.7, Math.PI, 0);
    g.fillStyle = p.crust;
    g.fill();
    g.fillStyle = p.green;
    g.fillRect(x - r * 0.75, y, r * 1.5, r * 0.12);
    g.fillStyle = p.brown;
    g.fillRect(x - r * 0.7, y + r * 0.12, r * 1.4, r * 0.25);
    g.beginPath();
    g.roundRect(x - r * 0.7, y + r * 0.37, r * 1.4, r * 0.25, 4);
    g.fillStyle = p.crust;
    g.fill();
  } else {
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.arc(x + i * r * 0.62, y + r * 0.35, r * 0.6, Math.PI, 0);
      g.fillStyle = p.crust;
      g.fill();
      g.beginPath();
      g.arc(x + i * r * 0.62, y + r * 0.35, r * 0.42, Math.PI, 0);
      g.fillStyle = p.green;
      g.fill();
    }
  }
}

function cells(n: number, W: number) {
  const cols = Math.min(4, Math.ceil(n / 2));
  const rows = Math.ceil(n / cols);
  const pad = 14;
  const gap = 8;
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const chh = (CH - pad * 2 - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const k = i % cols;
    // Center a short last row.
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const shift = ((cols - inRow) * (cw + gap)) / 2;
    return { x: pad + shift + k * (cw + gap), y: pad + r * (chh + gap), w: cw, h: chh };
  });
}

function drawTray(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, sel: number) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const cs = cells(s.dishes.length, W);
  let anim = false;
  // The tray.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 16);
  g.fillStyle = dk ? mix(pl.orange, c.wash, 0.65) : mix(pl.orange, c.card, 0.55);
  g.fill();
  g.beginPath();
  g.roundRect(5, 5, W - 10, CH - 10, 12);
  g.strokeStyle = dk ? mix(pl.orange, c.wash, 0.45) : mix(pl.orange, c.card, 0.3);
  g.lineWidth = 2;
  g.stroke();
  s.dishes.forEach((d, i) => {
    const b = cs[i]!;
    const q = glow(s, i);
    const n = ups(s, i) + downs(s, i);
    // The compartment.
    g.beginPath();
    g.roundRect(b.x, b.y, b.w, b.h, 10);
    g.fillStyle = dk ? mix(pl.orange, c.wash, 0.75) : mix(pl.orange, c.card, 0.75);
    g.fill();
    if (i === sel) {
      g.lineWidth = 2.5;
      g.strokeStyle = c.primary;
      g.stroke();
    }
    const cx = b.x + b.w / 2;
    const cy = b.y + (b.h - 30) / 2 + 2;
    const r = Math.min(b.w, b.h - 34) * 0.4;
    // Tonight's glow: warm and wide when the batch is good.
    if (n > 0 && q > 0.5) {
      const pulse = 1 + 0.04 * Math.sin(f.now / 400 + i);
      anim = true;
      const gr = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * (1.25 + q * 0.4) * pulse);
      gr.addColorStop(0, mix(pl.yellow, c.card, 0.1));
      gr.addColorStop(1, dk ? mix(pl.orange, c.wash, 0.75) : mix(pl.orange, c.card, 0.75));
      g.globalAlpha = (q - 0.5) * 2;
      g.beginPath();
      g.arc(cx, cy, r * (1.25 + q * 0.4) * pulse, 0, Math.PI * 2);
      g.fillStyle = gr;
      g.fill();
      g.globalAlpha = 1;
    }
    // A sad batch goes a bit grey.
    drawDish(g, d.kind, cx, cy, r, t);
    if (n > 0 && q < 0.5) {
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = dk ? c.wash : c.secondaryText;
      g.fill();
      g.globalAlpha = 1;
    }
    const nm = fitText(d.name, b.w - 8, { g, size: 11, min: 10, weight: 700 });
    g.font = nm.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(nm.text, cx, b.y + b.h - 22);
    const ct = fitText(`${ups(s, i)} up · ${downs(s, i)} down`, b.w - 8, { g, size: 10, min: 10, weight: 500 });
    g.font = ct.font;
    g.fillStyle = dk ? c.text : mix(c.text, c.secondaryText, 0.5);
    g.fillText(ct.text, cx, b.y + b.h - 9);
    // My thumb on the dish, and a little hop when it lands.
    const mine = s.votes.find((v) => v.who === me && v.d === i);
    if (mine) {
      const run = running(mine.at, 700);
      if (run !== null) anim = true;
      const hop = run === null ? 0 : Math.sin((run / 700) * Math.PI) * 14;
      const tx = b.x + b.w - 14;
      const ty = b.y + 14 - hop;
      g.beginPath();
      g.arc(tx, ty, 10, 0, Math.PI * 2);
      g.fillStyle = mine.v > 0 ? c.primary : c.negative;
      g.fill();
      g.save();
      g.translate(tx, ty);
      if (mine.v < 0) g.rotate(Math.PI);
      g.fillStyle = c.onPrimary;
      g.beginPath();
      g.roundRect(-5, -1, 3, 6, 1);
      g.roundRect(-1.5, -2, 6.5, 7, 2);
      g.moveTo(-1, -2);
      g.lineTo(0.5, -6.5);
      g.lineTo(2.5, -6);
      g.lineTo(2, -2);
      g.fill();
      g.restore();
    }
  });
  // What people are saying, stuck on the best dish like a note.
  const top = best(s);
  const said = s.dishes[top]!.said;
  if (said && ups(s, top) > downs(s, top)) {
    const b = cs[top]!;
    const tw = Math.min(W - 24, 230);
    const nx = Math.max(10, Math.min(W - tw - 10, b.x + b.w / 2 - tw / 2));
    const bob = Math.sin(f.now / 700) * 2;
    anim = true;
    const ny = (b.y < CH / 2 ? b.y + 2 : b.y - 18) + bob;
    g.save();
    g.translate(nx + tw / 2, ny + 10);
    g.rotate(-0.025);
    g.beginPath();
    g.roundRect(-tw / 2, -11, tw, 22, 6);
    g.fillStyle = c.card;
    g.fill();
    const q = fitText(`“${said}”`, tw - 12, { g, size: 12, min: 10, weight: 600 });
    g.font = q.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(q.text, 0, 0.5);
    g.restore();
  }
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Dining tonight",
  summary: (s) => {
    const v = verdict(s);
    const b = best(s);
    if (v.u + v.d === 0) return `${s.hall} tonight: no thumbs yet`;
    return `${s.hall} tonight: ${v.good ? "worth it" : s.other ? `maybe walk to ${s.other}` : "mixed"} · best is ${s.dishes[b]!.name.toLowerCase()} (${ups(s, b)} up)`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u) || a.t !== "vote" || !isInt(a.d, 0, s.dishes.length - 1) || !isInt(a.v, -1, 1)) return s;
    const was = s.votes.find((x) => x.who === u && x.d === a.d);
    if ((was?.v ?? 0) === a.v) return s;
    const rest = s.votes.filter((x) => !(x.who === u && x.d === a.d));
    return { ...s, votes: a.v === 0 ? rest : [...rest, { who: u, d: a.d, v: a.v, at: m.time }] };
  },

  onMembers: (s, ctx) => (s.votes.every((v) => inChat(ctx, v.who)) ? s : { ...s, votes: s.votes.filter((v) => inChat(ctx, v.who)) }),

  invariants: {
    "one thumb per person per dish": (s) => new Set(s.votes.map((v) => `${v.who}@${v.d}`)).size === s.votes.length,
    "thumbs are up or down on a real dish": (s) => s.votes.every((v) => (v.v === 1 || v.v === -1) && isInt(v.d, 0, s.dishes.length - 1)),
    "thumbs come from the group": (s, ctx) => s.votes.every((v) => inChat(ctx, v.who)),
  },

  transitions: {
    "a thumb sets only your thumb on that dish": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const mine = n.votes.find((x) => x.who === m.user && x.d === a.d);
      const others = (s: State) => JSON.stringify(s.votes.filter((x) => !(x.who === m.user && x.d === a.d)).sort((x, y) => (x.who + x.d < y.who + y.d ? -1 : 1)));
      return (a.v === 0 ? !mine : mine?.v === a.v && mine.at === m.time) && others(p) === others(n);
    },
    "the menu never changes": (p, n) => JSON.stringify(p.dishes) === JSON.stringify(n.dishes),
    "the same thumb twice changes nothing": (p, n, a, m) => a.t !== "vote" || (p.votes.find((x) => x.who === m.user && x.d === a.d)?.v ?? 0) !== a.v || p === n,
    "only the group votes": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => ({ t: "vote", d: r.int(s.dishes.length), v: r.pick([1, 1, -1, 0]) }),

  local: { sel: -1 },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const cs = cells(s.dishes.length, W);
    const sel = local.sel >= 0 && local.sel < s.dishes.length ? local.sel : best(s);
    const d = s.dishes[sel]!;
    const mine = s.votes.find((x) => x.who === me && x.d === sel);
    const v = verdict(s);
    const voters = [...new Set(s.votes.map((x) => x.who))];
    const label = `Tonight's tray at ${s.hall}: ${s.dishes.map((x, i) => `${x.name}, ${ups(s, i)} up and ${downs(s, i)} down`).join("; ")}`;
    const vote = (val: number) => {
      haptic(val > 0 ? "success" : "light");
      dispatch({ t: "vote", d: sel, v: mine?.v === val ? 0 : val });
    };
    return (
      <div>
        <CardHeader title={`Is ${s.hall} good tonight`} subtitle={s.sub} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas height={CH} label={label} draw={(g, f) => drawTray(g, f, s, me, sel)} />
          {cs.map((b, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${s.dishes[i]!.name}, ${ups(s, i)} up, ${downs(s, i)} down`}
              aria-pressed={i === sel}
              onClick={() => { haptic("light"); setLocal({ sel: i }); }}
              style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 10 }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, marginTop: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{d.name}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{d.said ? `${d.by ? `${d.by.split(" ")[0]}: ` : ""}“${d.said}”` : mine ? "Thanks, that's on the tray" : "Ate it? Give it a thumb"}</div>
          </div>
          <Button kind={mine?.v === -1 ? "primary" : "secondary"} onClick={() => vote(-1)}>
            Not great
          </Button>
          <Button kind={mine?.v === -1 ? "secondary" : "primary"} onClick={() => vote(1)}>
            {mine?.v === 1 ? "Undo" : "Good"}
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, marginTop: 4, minWidth: 0 }}>
          {voters.length ? <Facepile users={voters} max={5} size={20} /> : null}
          <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, minWidth: 0, ...ell }}>
            {v.u + v.d === 0 ? "No thumbs yet tonight" : v.good ? `Worth it tonight · ${v.u} up, ${v.d} down` : `${s.other ? `Maybe walk to ${s.other}` : "Mixed tonight"} · ${v.u} up, ${v.d} down`}
          </span>
        </div>
      </div>
    );
  },
});
