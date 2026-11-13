import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Facepile,
  Toast,
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

// Trip quiz: the Monday after the Lake Wren weekend, a story quiz made from the trip's photos (drawn
// here). Five questions, four answers each, green and red like the quiz sticker. Your score lands
// next to everyone else's, and the friends who got all five wear the paddle.

type Scene = "paddleboard" | "grill" | "car" | "campfire" | "tent" | "dock";
type Params = {
  /** Whose story: "Maya" */
  author: string;
  /** The trip: "Lake Wren weekend" */
  trip: string;
  /** How long ago: "1d" */
  ago: string;
  /** Up to 6 questions; options are friends' names or short answers; answer is the 0-based right one */
  questions: { scene: Scene; q: string; options: string[]; answer: number }[];
  /** Friends who already played, with their picks per question in order */
  played: { who: string; picks: number[] }[];
};

// @params
const P: Params = {
  author: "Maya",
  trip: "Lake Wren weekend",
  ago: "1d",
  questions: [
    { scene: "paddleboard", q: "who fell off the paddleboard first?", options: ["Will", "Calvin", "Arun", "Tsai Lin"], answer: 1 },
    { scene: "grill", q: "what did Arun cook on the grill?", options: ["Burgers", "Corn", "Rice, in the rice cooker", "Pineapple"], answer: 2 },
    { scene: "car", q: "whose car got stuck in the mud?", options: ["Maya", "Will", "Aditya", "Arun"], answer: 1 },
    { scene: "campfire", q: "who burned every single marshmallow?", options: ["Tsai Lin", "Calvin", "Maya", "Aditya"], answer: 0 },
    { scene: "tent", q: "who brought a color-coded packing list?", options: ["Arun", "Will", "Maya", "Calvin"], answer: 2 },
  ],
  played: [
    { who: "Will", picks: [1, 2, 1, 0, 2] },
    { who: "Tsai Lin", picks: [1, 2, 1, 0, 2] },
    { who: "Calvin", picks: [0, 2, 1, 2, 2] },
    { who: "Arun", picks: [1, 0, 1, 0, 2] },
  ],
};
// @end params

type Q = { scene: Scene; q: string; options: string[]; answer: number };
type State = { author: string; trip: string; ago: string; questions: Q[]; picks: Record<string, number[]>; done: Record<string, number> };
type Action = { t: "answer"; q: number; pick: number };
type Local = { fb: number; cheers: number };

const PANEL = 556;
const PHOTO_H = 220;
const SCENES: Scene[] = ["paddleboard", "grill", "car", "campfire", "tent", "dock"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const scoreOf = (s: State, picks: number[]) => picks.reduce((n, p, i) => n + (s.questions[i]?.answer === p ? 1 : 0), 0);

function initState(ctx: Ctx): State {
  const questions: Q[] = [];
  for (const q of Array.isArray(P.questions) ? P.questions : []) {
    if (questions.length >= 6) break;
    const text = clean(q?.q, 60);
    const options = (Array.isArray(q?.options) ? q.options : []).map((o) => clean(o, 28)).filter(Boolean).slice(0, 4);
    if (!text || options.length < 2) continue;
    const answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length ? q.answer : 0;
    questions.push({ scene: SCENES.includes(q.scene) ? q.scene : "dock", q: text, options, answer });
  }
  const s: State = { author: clean(P.author, 20), trip: clean(P.trip, 28) || "The trip", ago: clean(P.ago, 6), questions, picks: {}, done: {} };
  for (const pl of Array.isArray(P.played) ? P.played : []) {
    const m = findMember(ctx, clean(pl?.who, 20));
    if (!m || s.picks[m.id]) continue;
    const picks: number[] = [];
    for (const v of Array.isArray(pl.picks) ? pl.picks : []) {
      const q = questions[picks.length];
      if (!q || !Number.isInteger(v) || v < 0 || v >= q.options.length) break;
      picks.push(v);
    }
    if (!picks.length) continue;
    s.picks[m.id] = picks;
    if (picks.length === questions.length) s.done[m.id] = 0;
  }
  return s;
}

// ---- The trip's photos, drawn ------------------------------------------------------------------

type Pal = ReturnType<typeof pal>;
function person(g: CanvasRenderingContext2D, x: number, y: number, s: number, shirt: string, skin: string, pose: "stand" | "fall" | "sit") {
  g.fillStyle = shirt;
  g.beginPath();
  if (pose === "fall") {
    g.save();
    g.translate(x, y);
    g.rotate(-1.1);
    g.roundRect(-6 * s, -14 * s, 12 * s, 18 * s, 4 * s);
    g.restore();
  } else g.roundRect(x - 6 * s, y - 14 * s, 12 * s, pose === "sit" ? 12 * s : 18 * s, 4 * s);
  g.fill();
  g.fillStyle = skin;
  g.beginPath();
  const hx = pose === "fall" ? x - 16 * s : x;
  const hy = pose === "fall" ? y - 4 * s : y - 20 * s;
  g.arc(hx, hy, 6 * s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = skin;
  g.lineWidth = 3 * s;
  g.lineCap = "round";
  g.beginPath();
  if (pose === "fall") {
    g.moveTo(x + 6 * s, y - 6 * s);
    g.lineTo(x + 16 * s, y - 18 * s);
    g.moveTo(x + 4 * s, y);
    g.lineTo(x + 18 * s, y - 8 * s);
    g.moveTo(x - 6 * s, y - 10 * s);
    g.lineTo(x - 14 * s, y - 20 * s);
  } else {
    g.moveTo(x - 6 * s, y - 10 * s);
    g.lineTo(x - 11 * s, y - 2 * s);
    g.moveTo(x + 6 * s, y - 10 * s);
    g.lineTo(x + 11 * s, y - 2 * s);
    if (pose === "stand") {
      g.moveTo(x - 3 * s, y + 4 * s);
      g.lineTo(x - 4 * s, y + 14 * s);
      g.moveTo(x + 3 * s, y + 4 * s);
      g.lineTo(x + 4 * s, y + 14 * s);
    }
  }
  g.stroke();
}

function drawPhoto(g: CanvasRenderingContext2D, f: DrawFrame, scene: Scene, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = 280;
  const full = f.height;
  const t = f.now / 1000;
  const skin = mix(p.orange, p.cream, 0.6);
  const night = scene === "campfire" || scene === "tent";
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (night) {
    sky.addColorStop(0, mix(p.dark, p.blue, 0.15));
    sky.addColorStop(1, mix(p.purple, p.dark, 0.5));
  } else if (scene === "dock") {
    sky.addColorStop(0, mix(p.orange, p.yellow, 0.3));
    sky.addColorStop(1, mix(p.red, p.purple, 0.4));
  } else {
    sky.addColorStop(0, mix(p.blue, p.sky, 0.4));
    sky.addColorStop(1, p.sky);
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  if (night) {
    g.fillStyle = p.cream;
    g.beginPath();
    for (let k = 0; k < 30; k++) {
      const x = (k * 71.3) % w;
      const y = (k * 37.7) % (h * 0.5);
      const r = 0.8 + ((k * 13) % 3) * 0.5 + 0.4 * Math.sin(t * 2 + k);
      g.moveTo(x + r, y);
      g.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2);
    }
    g.fill();
    g.beginPath();
    g.arc(w * 0.82, h * 0.18, 14, 0, Math.PI * 2);
    g.fill();
  }
  // Far hills.
  g.fillStyle = night ? mix(p.dark, p.leaf, 0.25) : mix(p.leaf, p.sky, 0.35);
  g.beginPath();
  g.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 10) g.lineTo(x, h * 0.5 - 18 * Math.sin(x / 70) - 10 * Math.sin(x / 23 + 1));
  g.lineTo(w, h * 0.62);
  g.fill();
  const water = scene === "paddleboard" || scene === "dock";
  if (water) {
    g.fillStyle = scene === "dock" ? mix(p.purple, p.blue, 0.4) : mix(p.blue, p.sky, 0.25);
    g.fillRect(0, h * 0.55, w, full);
    g.strokeStyle = p.paper;
    g.globalAlpha = 0.45;
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 12; k++) {
      const x = ((k * 83) % w) + 6 * Math.sin(t + k);
      const y = h * 0.6 + ((k * 29) % (h * 0.36));
      g.moveTo(x, y);
      g.lineTo(x + 18, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  } else {
    g.fillStyle = night ? mix(p.dark, p.leaf, 0.4) : scene === "car" ? mix(p.brown, p.crust, 0.3) : p.grass;
    g.fillRect(0, h * 0.55, w, full);
  }
  // Pines along the shore.
  g.fillStyle = night ? mix(p.dark, p.leaf, 0.5) : p.leaf;
  g.beginPath();
  for (let k = 0; k < 9; k++) {
    const x = (k + 0.3) * (w / 8.5);
    if (scene !== "dock" && Math.abs(x - w / 2) < w * 0.22) continue;
    const y = h * 0.58;
    g.moveTo(x - 9, y);
    g.lineTo(x, y - 34 - (k % 3) * 6);
    g.lineTo(x + 9, y);
  }
  g.fill();

  const cx = w / 2;
  const base = h * 0.8;
  if (scene === "paddleboard") {
    g.fillStyle = p.yellow;
    g.beginPath();
    g.ellipse(cx - 30, base, 54, 7, -0.08, 0, Math.PI * 2);
    g.ellipse(cx + 90, base - 30, 40, 5, 0, 0, Math.PI * 2);
    g.fill();
    person(g, cx + 90, base - 50, 1, p.green, skin, "stand");
    const bob = 3 * Math.sin(t * 3);
    person(g, cx - 4, base - 18 + bob, 1.1, p.red, skin, "fall");
    g.fillStyle = p.paper;
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI;
      const r = 20 + 6 * Math.sin(t * 4 + k);
      g.moveTo(cx - 20 + r * Math.cos(a) + 3, base - 4 + r * Math.sin(a));
      g.arc(cx - 20 + r * Math.cos(a), base - 4 + r * Math.sin(a), 3, 0, Math.PI * 2);
    }
    g.fill();
  } else if (scene === "grill") {
    g.strokeStyle = p.ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 24, base - 6);
    g.lineTo(cx - 34, base + 22);
    g.moveTo(cx + 24, base - 6);
    g.lineTo(cx + 34, base + 22);
    g.moveTo(cx, base);
    g.lineTo(cx, base + 22);
    g.stroke();
    g.fillStyle = p.ink;
    g.beginPath();
    g.arc(cx, base - 30, 40, 0, Math.PI);
    g.fill();
    // The rice cooker, sitting on the grate.
    g.fillStyle = p.paper;
    g.beginPath();
    g.roundRect(cx - 20, base - 62, 40, 30, 8);
    g.fill();
    g.fillStyle = mix(p.paper, p.shade, 0.4);
    g.beginPath();
    g.ellipse(cx, base - 62, 21, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.red;
    g.beginPath();
    g.arc(cx + 10, base - 44, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.paper;
    g.globalAlpha = 0.7;
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const x0 = cx - 10 + k * 10;
      const ph = (t * 0.8 + k * 0.3) % 1;
      g.moveTo(x0, base - 70 - ph * 30);
      g.quadraticCurveTo(x0 - 8, base - 80 - ph * 30, x0, base - 92 - ph * 30);
    }
    g.stroke();
    g.globalAlpha = 1;
    person(g, cx + 80, base, 1.1, p.purple, skin, "stand");
  } else if (scene === "car") {
    g.fillStyle = mix(p.brown, p.dark, 0.2);
    g.beginPath();
    g.ellipse(cx, base + 14, 100, 16, 0, 0, Math.PI * 2);
    g.fill();
    const rock = 1.5 * Math.sin(t * 6);
    g.save();
    g.translate(cx, base);
    g.rotate((rock * Math.PI) / 180);
    g.fillStyle = p.green;
    g.beginPath();
    g.roundRect(-70, -34, 140, 30, 8);
    g.roundRect(-52, -58, 92, 30, 10);
    g.fill();
    g.fillStyle = p.sky;
    g.beginPath();
    g.roundRect(-44, -52, 36, 20, 4);
    g.roundRect(-2, -52, 34, 20, 4);
    g.fill();
    g.strokeStyle = p.ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-46, -62);
    g.lineTo(34, -62);
    g.stroke();
    g.fillStyle = p.ink;
    g.beginPath();
    g.arc(-40, 0, 14, 0, Math.PI * 2);
    g.arc(42, 2, 14, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = mix(p.brown, p.dark, 0.1);
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const ph = (t * 1.6 + k / 6) % 1;
      const x = cx + 40 + 10 + ph * 50;
      const y = base + 4 - Math.sin(ph * Math.PI) * 30;
      g.moveTo(x + 4, y);
      g.arc(x, y, 4, 0, Math.PI * 2);
    }
    g.fill();
  } else if (scene === "campfire") {
    g.fillStyle = p.brown;
    g.beginPath();
    g.save();
    g.translate(cx, base + 6);
    g.rotate(0.3);
    g.roundRect(-30, -5, 60, 10, 5);
    g.rotate(-0.6);
    g.roundRect(-30, -5, 60, 10, 5);
    g.restore();
    g.fill();
    for (const [col, k] of [[p.orange, 1], [p.yellow, 0.6]] as const) {
      g.fillStyle = col;
      g.beginPath();
      for (let j = -1; j <= 1; j++) {
        const fh = (34 + 8 * Math.sin(t * 7 + j * 2)) * k;
        g.moveTo(cx + j * 12 - 12 * k, base);
        g.quadraticCurveTo(cx + j * 12, base - fh * 1.4, cx + j * 12 + 12 * k, base);
      }
      g.fill();
    }
    g.strokeStyle = p.brown;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 90, base - 10);
    g.lineTo(cx - 20, base - 44);
    g.moveTo(cx + 90, base - 14);
    g.lineTo(cx + 24, base - 50);
    g.stroke();
    g.fillStyle = p.ink;
    g.beginPath();
    g.ellipse(cx - 18, base - 45, 7, 5, -0.4, 0, Math.PI * 2);
    g.ellipse(cx + 22, base - 51, 7, 5, 0.4, 0, Math.PI * 2);
    g.fill();
    person(g, cx - 104, base + 4, 1.1, p.blue, skin, "sit");
    person(g, cx + 104, base + 2, 1.1, p.red, skin, "sit");
  } else if (scene === "tent") {
    g.fillStyle = p.orange;
    g.beginPath();
    g.moveTo(cx - 70, base + 10);
    g.lineTo(cx, base - 60);
    g.lineTo(cx + 70, base + 10);
    g.closePath();
    g.fill();
    const glow = 0.6 + 0.2 * Math.sin(t * 3);
    g.fillStyle = mix(p.yellow, p.cream, glow);
    g.beginPath();
    g.moveTo(cx - 20, base + 10);
    g.lineTo(cx, base - 30);
    g.lineTo(cx + 20, base + 10);
    g.closePath();
    g.fill();
    // A clipboard by the door with coloured lines.
    g.fillStyle = p.paper;
    g.beginPath();
    g.roundRect(cx + 86, base - 30, 30, 40, 3);
    g.fill();
    const lines = [p.red, p.blue, p.green, p.yellow, p.purple];
    lines.forEach((col, k) => {
      g.fillStyle = col;
      g.fillRect(cx + 91, base - 24 + k * 7, 20, 3);
    });
  } else {
    g.fillStyle = p.brown;
    g.fillRect(cx - 20, base - 16, w, 10);
    g.beginPath();
    for (let k = 0; k < 6; k++) g.rect(cx - 10 + k * 40, base - 8, 5, 30);
    g.fill();
    person(g, cx + 40, base - 20, 1, p.blue, skin, "sit");
    person(g, cx + 64, base - 20, 1, p.red, skin, "sit");
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Trip quiz",
  summary: (s) => {
    const n = Object.keys(s.done).length;
    const perfect = Object.keys(s.done).filter((id) => scoreOf(s, s.picks[id] ?? []) === s.questions.length).length;
    return `${s.trip} quiz: ${n} finished · ${perfect} got ${s.questions.length} of ${s.questions.length}`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "answer" || !inChat(ctx, meta.user)) return s;
    const mine = s.picks[meta.user] ?? [];
    const q = s.questions[mine.length];
    if (!q || a.q !== mine.length || typeof a.pick !== "number" || !Number.isInteger(a.pick) || a.pick < 0 || a.pick >= q.options.length) return s;
    const picks = [...mine, a.pick];
    const next: State = { ...s, picks: { ...s.picks, [meta.user]: picks } };
    return picks.length === s.questions.length ? { ...next, done: { ...s.done, [meta.user]: meta.time } } : next;
  },

  onMembers: (s, ctx) => {
    const ok = (id: string) => inChat(ctx, id);
    if (Object.keys(s.picks).every(ok)) return s;
    const picks: Record<string, number[]> = {};
    for (const id of Object.keys(s.picks)) if (ok(id)) picks[id] = s.picks[id]!;
    const done: Record<string, number> = {};
    for (const id of Object.keys(s.done)) if (ok(id)) done[id] = s.done[id]!;
    return { ...s, picks, done };
  },

  invariants: {
    "picks are real options, in order": (s) => Object.values(s.picks).every((ps) => ps.length <= s.questions.length && ps.every((v, i) => Number.isInteger(v) && v >= 0 && v < s.questions[i]!.options.length)),
    "done exactly when every question is answered": (s) =>
      Object.keys(s.done).every((id) => (s.picks[id]?.length ?? 0) === s.questions.length) && Object.keys(s.picks).every((id) => (s.picks[id]!.length === s.questions.length) === id in s.done),
    "players are in the chat": (s, ctx) => Object.keys(s.picks).every((id) => inChat(ctx, id)) && Object.keys(s.done).every((id) => inChat(ctx, id)),
    "answers point at an option": (s) => s.questions.every((q) => q.answer >= 0 && q.answer < q.options.length && q.options.length >= 2),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "an answer appends exactly my pick": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const was = p.picks[m.user] ?? [];
      const now = n.picks[m.user] ?? [];
      if (a.q !== was.length || now.length !== was.length + 1 || now[now.length - 1] !== a.pick || !was.every((v, i) => now[i] === v)) return false;
      const ids = new Set([...Object.keys(p.picks), ...Object.keys(n.picks)]);
      for (const id of ids) if (id !== m.user && p.picks[id] !== n.picks[id]) return false;
      return true;
    },
    "finishing stamps the time once": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const fin = (n.picks[m.user]?.length ?? 0) === n.questions.length;
      const others = (d: Record<string, number>) => JSON.stringify(Object.entries(d).filter(([k]) => k !== m.user).sort());
      return (fin ? n.done[m.user] === m.time : !(m.user in n.done)) && others(p.done) === others(n.done);
    },
    "nobody answers twice": (p, n, a, m) => a.t !== "answer" || p === n || !(m.user in p.done),
    "the quiz never changes": (p, n) => p.questions === n.questions && p.trip === n.trip,
  },

  arbitrary: (s, u, r) => {
    const k = s.picks[u]?.length ?? 0;
    const q = s.questions[k];
    if (!q) return { t: "answer", q: r.int(Math.max(1, s.questions.length)), pick: r.int(4) };
    return { t: "answer", q: r.next() < 0.9 ? k : k + 1, pick: r.int(q.options.length) };
  },

  local: { fb: -1, cheers: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const N = state.questions.length;
    const mine = state.picks[me] ?? [];
    const fb = local.fb >= 0 && local.fb < mine.length ? local.fb : -1;
    const qi = fb >= 0 ? fb : mine.length;
    const finished = N > 0 && mine.length >= N && fb < 0;
    const q = state.questions[Math.min(qi, N - 1)];
    const myScore = scoreOf(state, mine);
    const author = members.find((m) => m.name.trim().toLowerCase() === state.author.toLowerCase()) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const mem = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: "?" };
    const finishers = Object.keys(state.done).filter((id) => members.some((m) => m.id === id));
    const perfect = finishers.filter((id) => scoreOf(state, state.picks[id]!) === N);
    const ranked = [...finishers].sort((a, b) => scoreOf(state, state.picks[b]!) - scoreOf(state, state.picks[a]!) || state.done[a]! - state.done[b]!);
    const answeredHere = Object.keys(state.picks).filter((id) => id !== me && (state.picks[id]!.length > qi) && members.some((m) => m.id === id));
    const gotHere = answeredHere.filter((id) => state.picks[id]![qi] === q?.answer);
    const lastDone = state.done[me];
    const justDone = !!lastDone && running(lastDone, 2600) !== null;

    const pick = (i: number) => {
      if (!q || fb >= 0 || mine.length >= N) return;
      haptic(i === q.answer ? "success" : "medium");
      dispatch({ t: "answer", q: qi, pick: i });
      setLocal({ fb: qi, cheers: mine.length + 1 === N ? local.cheers + 1 : local.cheers });
    };

    const segW = (W - 16 - 4 * Math.max(0, N - 1)) / Math.max(1, N);
    const option = (label: string, i: number) => {
      const face = findMember({ room: "", members }, label);
      const chosen = fb >= 0 && mine[qi] === i;
      const right = fb >= 0 && q!.answer === i;
      const bg = right ? c.positive : chosen ? c.negative : c.wash;
      const fg = right || chosen ? c.onPrimary : c.text;
      const fit = fitText(label, (W - 60) / 2 - (face ? 40 : 16), { size: 15, weight: 600, min: 11 });
      return (
        <button
          key={i}
          type="button"
          aria-label={label}
          onClick={() => pick(i)}
          style={{ height: 48, padding: face ? "0 10px 0 6px" : "0 12px", border: 0, borderRadius: 24, background: bg, color: fg, display: "flex", alignItems: "center", gap: 8, cursor: fb >= 0 ? "default" : "pointer", font: "inherit", minWidth: 0, transition: "background 200ms", animation: chosen && !right ? "tqShake 400ms ease-in-out" : right && fb >= 0 ? "tqPop 400ms cubic-bezier(.34,1.56,.64,1)" : undefined }}
        >
          {face ? (
            <span style={{ display: "flex", flex: "none", borderRadius: 18, boxShadow: `0 0 0 2px ${c.card}` }}>
              <Avatar user={face} size={34} />
            </span>
          ) : null}
          <span style={{ fontSize: fit.size, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{fit.text}</span>
          {right || chosen ? <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, flex: "none" }}>{right ? "✓" : "✕"}</span> : null}
        </button>
      );
    };

    return (
      <div>
        <style>{"@keyframes tqShake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}@keyframes tqPop{0%{transform:scale(.9)}100%{transform:scale(1)}}@keyframes tqUp{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: mix(p.blue, p.dark, 0.6), color: p.on }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: PANEL }}>
            <Canvas height={PANEL} label={finished ? `${state.trip} photo` : `Photo from ${state.trip}: ${q?.q ?? ""}`} draw={(g, f) => drawPhoto(g, f, finished ? "dock" : q?.scene ?? "dock", theme)} />
          </div>
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, display: "flex", gap: 4 }}>
            {state.questions.map((_, i) => (
              <div key={i} style={{ width: segW, height: 3, borderRadius: 2, background: i < mine.length ? (state.picks[me]![i] === state.questions[i]!.answer ? c.positive : c.negative) : i === qi ? p.on : mix(p.on, p.dark, 0.55) }} />
            ))}
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={author} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none", textShadow: `0 1px 2px ${p.dark}` }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 1px 2px ${p.dark}` }}>{`${state.trip} · ${state.ago}`}</span>
          </div>

          {finished ? (
            <div style={{ position: "absolute", left: 16, right: 16, top: 248, bottom: 16, borderRadius: 18, background: c.card, color: c.text, padding: "16px 16px 12px", boxSizing: "border-box", animation: justDone ? "tqUp 500ms ease-out both" : undefined, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 13, color: c.secondaryText }}>Your score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 44, lineHeight: "52px", fontWeight: 800 }}>{`${myScore} of ${N}`}</span>
                <span style={{ fontSize: 15, color: c.secondaryText }}>{myScore === N ? "you were there" : myScore >= N - 1 ? "so close" : "were you on this trip"}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {ranked.slice(0, 4).map((id) => {
                  const sc = scoreOf(state, state.picks[id]!);
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, height: 28 }}>
                      <Avatar user={mem(id)} size={24} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: id === me ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{id === me ? "You" : mem(id).name}</span>
                      <span style={{ display: "flex", gap: 3 }}>
                        {state.questions.map((qq, i) => (
                          <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: state.picks[id]![i] === qq.answer ? c.positive : c.negative }} />
                        ))}
                      </span>
                      <span style={{ width: 22, textAlign: "right", fontSize: 15, fontWeight: 700 }}>{sc}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.secondaryText }}>
                {perfect.length ? <Facepile users={perfect.map(mem).slice(0, 4)} max={4} size={20} /> : null}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{perfect.length ? `${perfect.length} got all ${N}` : `Nobody got all ${N} yet`}</span>
              </div>
            </div>
          ) : q ? (
            <div style={{ position: "absolute", left: 16, right: 16, top: 248, bottom: 16, borderRadius: 18, background: c.card, color: c.text, padding: "14px 14px 12px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{`Question ${qi + 1} of ${N}`}</div>
              <div style={{ fontSize: 19, lineHeight: "24px", fontWeight: 700, marginTop: 2, minHeight: 48 }}>{q.q}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>{q.options.map(option)}</div>
              <div style={{ marginTop: "auto", height: 44, display: "flex", alignItems: "center", gap: 8 }}>
                {fb >= 0 ? (
                  <>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: mine[qi] === q.answer ? c.positive : c.negative, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {mine[qi] === q.answer ? `Right · ${gotHere.length} others got it` : `It was ${q.options[q.answer]}`}
                    </span>
                    <Button kind="primary" onClick={() => setLocal({ fb: -1 })}>
                      {qi + 1 >= N ? "See scores" : "Next"}
                    </Button>
                  </>
                ) : (
                  <>
                    {answeredHere.length ? <Facepile users={answeredHere.map(mem).slice(0, 4)} max={4} size={22} /> : null}
                    <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{answeredHere.length ? `${answeredHere.length} answered this one` : "Be the first to answer"}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ position: "absolute", left: 16, right: 16, top: 248, borderRadius: 18, background: c.card, color: c.text, padding: 16, fontSize: 15 }}>No questions yet</div>
          )}
          {justDone && local.cheers > 0 ? (
            <div style={{ position: "absolute", left: "50%", top: 270, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji={myScore === N ? "🏆" : "👏"} />
            </div>
          ) : null}
        </div>
        {justDone && local.cheers > 0 ? <Toast key={local.cheers}>{`You got ${myScore} of ${N}`}</Toast> : null}
      </div>
    );
  },
});
