import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Chip,
  Locked,
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

// "can someone just decide" for the third time. Don't pick the place, pick the person: a hot
// potato hops around the circle, faster and faster, and pops on whoever decides. They get 60
// seconds and their pick is final. The potato knows who hasn't decided in a while.

type Params = {
  /** Card title: "Decider potato" */
  title: string;
  /** Under the title: "“can someone just decide” ×3" */
  sub: string;
  /** How long the decider gets, in seconds (15 to 300). */
  seconds: number;
  /** The circle. decided: times they were the decider this semester. would: what they'd pick if it lands on them and they're not here. said: their line. */
  people: { name: string; decided: number; would: string; said: string }[];
  /** Places floated in the chat, offered to the decider as one-tap picks. */
  ideas: string[];
};

// @params
const P: Params = {
  title: "Decider potato",
  sub: "“can someone just decide” ×3",
  seconds: 60,
  people: [
    { name: "Calvin", decided: 4, would: "Rook's, but quietly", said: "i've decided the last 4 times" },
    { name: "Will", decided: 3, would: "Midtown Lanes, the Sube can take 5", said: "not it" },
    { name: "Tsai Lin", decided: 2, would: "Golden Lantern", said: "i'll decide if i get aux" },
    { name: "Aditya", decided: 1, would: "Kettle & Crumb", said: "lowkey anywhere" },
    { name: "Arun", decided: 0, would: "Golden Lantern (he's said it all week)", said: "my rice cooker could make all of these" },
    { name: "Maya", decided: 2, would: "Tío's", said: "" },
  ],
  ideas: ["Golden Lantern", "Tío's", "Rook's", "Midtown Lanes"],
};
// @end params

type Seat = { who: string; name: string; decided: number; would: string; said: string };
type Toss = { at: number; path: string[]; by: string };
type State = {
  title: string;
  sub: string;
  ms: number;
  seats: Seat[];
  ideas: string[];
  toss: Toss | null;
  tosses: number;
  decider: string | null;
  pick: { text: string; at: number; auto: boolean } | null;
};
type Action = { t: "toss" } | { t: "pick"; text: string };
type Local = { draft: string; burst: number };

const TAU = Math.PI * 2;
const CANVAS_H = 240;
const HOPS = 14;
const hopMs = (k: number) => Math.round(420 - (300 * k) / (HOPS - 1));
const ANIM = Array.from({ length: HOPS }, (_, k) => hopMs(k)).reduce((a, b) => a + b, 0);
const POP = 900;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const memberOf = (s: Seat): Member => ({ id: s.who, name: s.name });
/** Fewer times decided, more weight: the potato knows. */
const weights = (s: State) => {
  const top = Math.max(0, ...s.seats.map((x) => x.decided));
  return s.seats.map((x) => 1 + 2 * (top - x.decided));
};
function pathFor(s: State, seed: number, start: number) {
  const r = rng(seed);
  const w = weights(s);
  let x = r.int(w.reduce((a, b) => a + b, 0));
  let end = 0;
  for (let i = 0; i < w.length; i++) {
    if (x < w[i]!) {
      end = i;
      break;
    }
    x -= w[i]!;
  }
  const n = s.seats.length;
  const path: number[] = [];
  let at = start;
  for (let k = 0; k < HOPS - 1; k++) {
    if (n < 2) break;
    const last = k === HOPS - 2;
    // Step to anyone else; the last step before the end avoids the end too.
    const options = s.seats.map((_, i) => i).filter((i) => i !== at && (!last || i !== end || n < 3));
    at = options[r.int(options.length)] ?? (at + 1) % n;
    path.push(at);
  }
  while (path.length < HOPS - 1) path.push(0);
  path.push(end);
  return path.map((i) => s.seats[i]!.who);
}
const deadline = (s: State) => (s.toss ? s.toss.at + ANIM + POP + s.ms : 0);
const timedOut = (s: State, now: number) => s.decider !== null && s.pick === null && now > deadline(s);

function initState(ctx: Ctx): State {
  const seats: Seat[] = [];
  for (const raw of P.people) {
    if (seats.length >= 8) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (seats.some((x) => x.who === who)) continue;
    const decided = Number.isInteger(raw.decided) ? Math.min(99, Math.max(0, raw.decided)) : 0;
    seats.push({ who, name, decided, would: clean(raw.would, 50), said: clean(raw.said, 60) });
  }
  for (const m of ctx.members) {
    if (seats.length >= 8 || seats.some((x) => x.who === m.id)) continue;
    seats.push({ who: m.id, name: clean(m.name, 20) || "Friend", decided: 0, would: "", said: "" });
  }
  const ideas = P.ideas.map((x) => clean(x, 30)).filter(Boolean).slice(0, 4);
  const ms = Number.isInteger(P.seconds) ? Math.min(300, Math.max(15, P.seconds)) * 1000 : 60000;
  return { title: clean(P.title, 40) || "Decider potato", sub: clean(P.sub, 60), ms, seats, ideas, toss: null, tosses: 0, decider: null, pick: null };
}

function seatXY(s: State, i: number, W: number) {
  const n = s.seats.length;
  const a = -Math.PI / 2 + (i / n) * TAU;
  return { x: W / 2 + Math.cos(a) * Math.min(W / 2 - 44, 150), y: 108 + Math.sin(a) * 80 };
}

function potato(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, r: number, heat: number, now: number) {
  const c = t.color;
  const ink = t.mode === "dark" ? c.wash : c.text;
  // Steam.
  g.beginPath();
  for (let k = -1; k <= 1; k++) {
    const sx = x + k * r * 0.5;
    const ph = now / 140 + k;
    g.moveTo(sx, y - r - 3);
    g.quadraticCurveTo(sx + Math.sin(ph) * 4, y - r - 9, sx, y - r - 15 - heat * 4);
  }
  g.lineWidth = 2;
  g.lineCap = "round";
  g.strokeStyle = mix(c.secondaryText, c.card, 0.3);
  g.stroke();
  g.beginPath();
  g.ellipse(x, y, r * 1.2, r, 0.25, 0, TAU);
  g.fillStyle = mix(mix(c.series5, ink, 0.25), c.series4, heat * 0.6);
  g.fill();
  g.beginPath();
  for (const [sx, sy, sr] of [[-0.95, 0.1, 1.4], [1.0, -0.2, 1.3], [0.75, 0.55, 1.2]] as const) {
    g.moveTo(x + r * sx + sr, y + r * sy);
    g.arc(x + r * sx, y + r * sy, sr, 0, TAU);
  }
  g.fillStyle = mix(c.series5, ink, 0.6);
  g.fill();
  // Nervous face.
  g.beginPath();
  g.arc(x - r * 0.3, y - r * 0.1, 1.7, 0, TAU);
  g.moveTo(x + r * 0.3 + 1.7, y - r * 0.1);
  g.arc(x + r * 0.3, y - r * 0.1, 1.7, 0, TAU);
  g.fillStyle = ink;
  g.fill();
  g.beginPath();
  g.ellipse(x, y + r * 0.38, 2.2, 2.8 + heat, 0, 0, TAU);
  g.fill();
  if (heat > 0.3) {
    g.beginPath();
    g.ellipse(x - r * 1.25, y - r * 0.6, 1.6, 2.6, -0.4, 0, TAU);
    g.ellipse(x + r * 1.3, y - r * 0.7, 1.6, 2.6, 0.4, 0, TAU);
    g.fillStyle = c.series1;
    g.fill();
  }
}

function crown(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x - s, y - s * 0.9);
  g.lineTo(x - s * 0.5, y - s * 0.4);
  g.lineTo(x, y - s * 1.1);
  g.lineTo(x + s * 0.5, y - s * 0.4);
  g.lineTo(x + s, y - s * 0.9);
  g.lineTo(x + s, y);
  g.closePath();
  g.fillStyle = t.color.series2;
  g.fill();
}

function drawCircle(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const n = s.seats.length;
  const tz = s.toss;
  const e = tz ? f.now - tz.at : Infinity;
  let anim = waiting || e < ANIM + POP + 400;

  // A rug for the circle.
  g.beginPath();
  g.ellipse(W / 2, 120, Math.min(W / 2 - 4, 186), 118, 0, 0, TAU);
  g.fillStyle = mix(c.series5, c.card, dk ? 0.8 : 0.88);
  g.fill();
  g.beginPath();
  g.ellipse(W / 2, 120, Math.min(W / 2 - 16, 172), 106, 0, 0, TAU);
  g.setLineDash([6, 6]);
  g.lineWidth = 2;
  g.strokeStyle = mix(c.series5, c.card, dk ? 0.6 : 0.65);
  g.stroke();
  g.setLineDash([]);

  // Where the potato is.
  let holder = -1;
  let px = W / 2;
  let py = 110;
  let heat = 0;
  if (waiting) {
    px = W / 2 + Math.sin(f.now / 90) * 3;
    py = 110 - Math.abs(Math.sin(f.now / 160)) * 10;
  } else if (tz && e < ANIM) {
    let acc = 0;
    let k = 0;
    while (k < HOPS - 1 && acc + hopMs(k) <= e) acc += hopMs(k++);
    const from = k === 0 ? -1 : s.seats.findIndex((x) => x.who === tz.path[k - 1]);
    const to = s.seats.findIndex((x) => x.who === tz.path[k]);
    const u = Math.min(1, (e - acc) / hopMs(k));
    const a = from < 0 ? { x: W / 2, y: 110 } : seatXY(s, from, W);
    const b = seatXY(s, to, W);
    px = a.x + (b.x - a.x) * u;
    py = a.y - 26 + (b.y - a.y) * u - Math.sin(u * Math.PI) * (40 - k * 1.8);
    heat = k / (HOPS - 1);
    holder = u > 0.85 ? to : from;
  } else if (s.decider) holder = s.seats.findIndex((x) => x.who === s.decider);

  // People.
  s.seats.forEach((p, i) => {
    const { x, y } = seatXY(s, i, W);
    const col = userColor(memberOf(p), t);
    const isD = s.decider === p.who && e >= ANIM;
    const flinch = holder === i && e < ANIM ? Math.sin(f.now / 30) * 2 : 0;
    // Body.
    g.beginPath();
    g.ellipse(x + flinch, y + 10, 17, 12, 0, Math.PI, 0);
    g.fillStyle = mix(col, ink, 0.2);
    g.fill();
    g.beginPath();
    g.arc(x + flinch, y - 6, 14, 0, TAU);
    g.fillStyle = col;
    g.fill();
    if (p.who === me) {
      g.lineWidth = 2.5;
      g.strokeStyle = c.primary;
      g.stroke();
    }
    // Face: eek when holding, calm otherwise.
    g.beginPath();
    g.arc(x + flinch - 4.5, y - 8, 1.7, 0, TAU);
    g.moveTo(x + flinch + 6.2, y - 8);
    g.arc(x + flinch + 4.5, y - 8, 1.7, 0, TAU);
    g.fillStyle = ink;
    g.fill();
    g.beginPath();
    if (holder === i && !isD) g.ellipse(x + flinch, y - 1, 3, 3.6, 0, 0, TAU);
    else g.arc(x + flinch, y - 3, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = 1.5;
    g.strokeStyle = ink;
    g.stroke();
    // Name and crown tally.
    const nm = fitText(p.who === me ? "You" : p.name, 70, { g, size: 12, min: 10, weight: 600 });
    g.font = `600 11px ${t.type.family}`;
    const cw = g.measureText(`${p.decided}`).width;
    g.font = nm.font;
    const nw = g.measureText(nm.text).width;
    const lx = x - (nw + 18 + cw) / 2;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(nm.text, lx, y + 24);
    crown(g, t, lx + nw + 9, y + 28, 5);
    g.fillStyle = c.text;
    g.font = `600 11px ${t.type.family}`;
    g.fillText(`${p.decided}`, lx + nw + 16, y + 24);
    if (isD) {
      const drop = Math.min(1, (e - ANIM - 150) / 400);
      if (drop > 0) crown(g, t, x, y - 22 - (1 - drop) * 30, 11);
    }
  });

  // The potato (or what's left of it).
  if (waiting || (tz && e < ANIM)) potato(g, t, px, py, 11, heat, f.now);
  else if (tz && e < ANIM + POP && s.decider) {
    const i = s.seats.findIndex((x) => x.who === s.decider);
    const { x, y } = seatXY(s, i, W);
    const u = (e - ANIM) / POP;
    const R = 16 + u * 22;
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rr = k % 2 ? R * 0.55 : R;
      g.lineTo(x + Math.cos(a) * rr, y - 34 + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = c.series2;
    g.fill();
    g.font = `800 ${Math.round(11 + u * 5)}px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = dk ? c.wash : c.text;
    g.fillText("POP!", x, y - 34);
  } else if (!s.decider) potato(g, t, W / 2, 110, 13, 0.15, f.now), (anim = true);

  // Center: the clock, or the final pick on a little sign.
  if (s.decider && tz && e >= ANIM + POP) {
    const left = deadline(s) - f.now;
    if (s.pick) {
      const txt = fitText(s.pick.text, 130, { g, size: 15, min: 11, weight: 700 });
      g.font = txt.font;
      const tw = Math.max(70, g.measureText(txt.text).width + 24);
      g.beginPath();
      g.rect(W / 2 - 1.5, 110, 3, 26);
      g.fillStyle = mix(c.series5, ink, 0.4);
      g.fill();
      g.beginPath();
      g.roundRect(W / 2 - tw / 2, 90, tw, 30, 6);
      g.fillStyle = c.card;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = c.primary;
      g.stroke();
      g.fillStyle = c.text;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(txt.text, W / 2, 105);
    } else if (left > 0) {
      const u = left / s.ms;
      g.beginPath();
      g.arc(W / 2, 110, 24, 0, TAU);
      g.fillStyle = c.card;
      g.fill();
      g.beginPath();
      g.arc(W / 2, 110, 24, -Math.PI / 2, -Math.PI / 2 + u * TAU);
      g.lineWidth = 5;
      g.strokeStyle = u < 0.25 ? c.negative : c.primary;
      g.stroke();
      g.font = `700 15px ${t.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      g.fillText(`${Math.ceil(left / 1000)}`, W / 2, 111);
      anim = true;
    }
  }
  void n;
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Decider potato",
  summary: (s) => {
    const d = s.seats.find((x) => x.who === s.decider);
    if (s.pick && d) return `${firstName(d.name)} decided: ${s.pick.text}. No appeals.`;
    if (d) return `The potato picked ${firstName(d.name)} to decide`;
    return `${s.title}: nobody's tossed it yet`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "toss") {
      if (s.pick || (s.decider !== null && !timedOut(s, m.time))) return s;
      const start = Math.max(0, s.seats.findIndex((x) => x.who === m.user));
      const path = pathFor(s, m.seed, start);
      const decider = path[path.length - 1]!;
      const d = s.seats.find((x) => x.who === decider)!;
      const seats = s.seats.map((x) => (x.who === decider ? { ...x, decided: x.decided + 1 } : x));
      // Someone not in the chat decides with what they already said.
      const auto = seeded(decider) && d.would ? { text: d.would, at: m.time + ANIM + POP, auto: true } : null;
      return { ...s, seats, toss: { at: m.time, path, by: m.user }, tosses: s.tosses + 1, decider, pick: auto };
    }
    if (a.t === "pick") {
      const text = clean(a.text, 40);
      if (!text || s.pick || s.decider !== m.user || !s.toss || m.time > deadline(s)) return s;
      return { ...s, pick: { text, at: m.time, auto: false } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let seats = s.seats.map((x) => (seeded(x.who) || inChat(ctx, x.who) ? x : { ...x, who: `~${x.name}` }));
    seats = seats.filter((x, i) => seats.findIndex((y) => y.who === x.who) === i);
    for (const m of ctx.members) {
      if (seats.some((x) => x.who === m.id)) continue;
      const k = seats.findIndex((x) => seeded(x.who) && x.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0) seats = seats.map((x, j) => (j === k ? { ...x, who: m.id } : x));
      else if (seats.length < 8) seats = [...seats, { who: m.id, name: clean(m.name, 20) || "Friend", decided: 0, would: "", said: "" }];
    }
    seats = seats.map((x) => ({ who: x.who, name: x.name, decided: x.decided, would: x.would, said: x.said }));
    const ids = new Set(seats.map((x) => x.who));
    const keep = (u: string) => ids.has(u);
    const toss = s.toss && s.toss.path.every(keep) ? s.toss : null;
    const decider = toss && s.decider && keep(s.decider) ? s.decider : null;
    return { ...s, seats, toss: decider ? toss : null, decider, pick: decider ? s.pick : null };
  },

  invariants: {
    "one seat per person": (s) => s.seats.length >= 1 && s.seats.length <= 8 && new Set(s.seats.map((x) => x.who)).size === s.seats.length,
    "live seats are in the chat": (s, ctx) => s.seats.every((x) => seeded(x.who) || inChat(ctx, x.who)),
    "the potato stops on the decider": (s) => (s.toss === null ? s.decider === null : s.toss.path.length === HOPS && s.toss.path[HOPS - 1] === s.decider),
    "it never hops to the same hand twice in a row": (s) => s.toss === null || s.seats.length < 3 || s.toss.path.every((w, i) => i === 0 || w !== s.toss!.path[i - 1]),
    "a pick needs a decider": (s) => s.pick === null || (s.decider !== null && s.pick.text.length > 0),
    "tallies are whole and counted": (s) => s.seats.every((x) => Number.isInteger(x.decided) && x.decided >= 0) && Number.isInteger(s.tosses) && s.tosses >= (s.toss ? 1 : 0),
    "auto picks only for friends who aren't here": (s) => s.pick === null || !s.pick.auto || (s.decider !== null && seeded(s.decider)),
  },

  transitions: {
    "a toss follows the seed and crowns one more time": (p, n, a, m) => {
      if (a.t !== "toss" || p === n) return true;
      const path = pathFor(p, m.seed, Math.max(0, p.seats.findIndex((x) => x.who === m.user)));
      const d = path[path.length - 1]!;
      const before = p.seats.find((x) => x.who === d)?.decided ?? -1;
      const after = n.seats.find((x) => x.who === d)?.decided ?? -2;
      return JSON.stringify(n.toss?.path) === JSON.stringify(path) && n.decider === d && after === before + 1 && n.toss?.at === m.time && n.tosses === p.tosses + 1;
    },
    "no toss over a decider who still has time": (p, n, a, m) => a.t !== "toss" || p === n || (p.pick === null && (p.decider === null || m.time > deadline(p))),
    "only the decider picks, in time, once": (p, n, a, m) => a.t !== "pick" || p === n || (p.decider === m.user && p.pick === null && m.time <= deadline(p) && n.pick?.text === clean(a.text, 40) && n.pick.auto === false),
    "a final pick is final": (p, n) => p.pick === null || (JSON.stringify(n.pick) === JSON.stringify(p.pick) && n.decider === p.decider),
    "tallies only grow on a toss": (p, n, a) => a.t === "toss" || p.seats.every((x, i) => n.seats[i]?.decided === x.decided),
    "unknown actions change nothing": (p, n, a) => a.t === "toss" || a.t === "pick" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.decider === user && !s.pick) return { t: "pick", text: s.ideas.length ? r.pick(s.ideas) : "Tacos" };
    return { t: "toss" };
  },

  local: { draft: "", burst: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const waiting = pending && state.tosses !== confirmed.tosses;
    const e = s.toss ? running(s.toss.at, ANIM + POP) : null;
    const flying = waiting || e !== null;
    const now = s.decider && !s.pick && e === null ? clock.value : 0;
    const d = s.seats.find((x) => x.who === s.decider);
    const mine = s.decider === me;
    const out = d && !s.pick && now > deadline(s);
    const quote = s.seats.find((x) => x.said && x.who !== me && x.decided === Math.max(...s.seats.filter((y) => y.said).map((y) => y.decided)));
    const label = `${s.seats.length} friends in a circle. Times decided: ${s.seats.map((x) => `${x.name} ${x.decided}`).join(", ")}${d ? `. ${d.name} decides` : ""}`;
    const toss = () => {
      haptic("medium");
      dispatch({ t: "toss" });
    };
    const send = (text: string) => {
      if (!clean(text, 40)) return;
      haptic("success");
      setLocal({ draft: "", burst: local.burst + 1 });
      dispatch({ t: "pick", text });
    };

    let bottom;
    if (flying) {
      bottom = <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 15, color: c.text }}>{waiting ? "Hot… hot…" : "Hot… hot… hot…"}</div>;
    } else if (s.pick && d) {
      bottom = (
        <div style={{ position: "relative" }}>
          {local.burst > 0 ? (
            <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
              <Burst key={local.burst} emoji="🥔" />
            </div>
          ) : null}
          <Locked detail={s.pick.auto ? `${firstName(d.name)} isn't here, so Muse used what he said · no appeals` : `${d.who === me ? "You" : firstName(d.name)} decided · no appeals`}>{s.pick.text}</Locked>
          {local.burst > 0 ? <Toast key={local.burst}>Final. Nobody argue.</Toast> : null}
        </div>
      );
    } else if (d && mine && !out) {
      bottom = (
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {s.ideas.map((x) => (
              <button key={x} type="button" onClick={() => send(x)} style={{ border: "none", background: "none", padding: 0, minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>
                <Chip>{x}</Chip>
              </button>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 8 }}
            onSubmit={(ev: Event) => {
              ev.preventDefault();
              send(local.draft);
            }}
          >
            <input value={local.draft} placeholder="Your call" aria-label="Your pick" onInput={(ev: Event) => setLocal({ draft: (ev.currentTarget as HTMLInputElement).value })} style={{ flex: 1, minWidth: 0 }} />
            <Button kind="primary" disabled={!clean(local.draft, 40)} onClick={() => send(local.draft)}>
              Make it final
            </Button>
          </form>
        </div>
      );
    } else if (d && !out) {
      bottom = <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 15, color: c.text, ...ell }}>{`${firstName(d.name)} has the crown. Waiting on the call…`}</div>;
    } else {
      bottom = (
        <div>
          <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>
            {out && d ? `${firstName(d.name)} ran out of time. Toss it again.` : quote ? `${firstName(quote.name)}: “${quote.said}”` : "The potato picks who picks"}
          </div>
          <Button kind="primary" wide onClick={toss}>
            {out ? "Toss again" : "Toss the potato"}
          </Button>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CANVAS_H} label={label} draw={(g, f) => drawCircle(g, f, s, me, waiting)} />
        <div style={{ marginTop: 4 }}>{bottom}</div>
      </div>
    );
  },
});
