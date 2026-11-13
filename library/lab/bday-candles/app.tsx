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

// Birthday candles: Maya's story on her 21st is a cake with 21 candles. Every friend who stops by
// lights one with a one-line wish that floats up over the cake. At midnight Maya swipes across the
// cake, the flames go out and the smoke curls into "21 wishes from 18 people".

type Params = {
  /** Whose birthday and whose story: "Maya" */
  author: string;
  /** How old: the cake gets this many candles, 1 to 40 */
  age: number;
  /** How long ago the story went up: "11h" */
  ago: string;
  /** Big text on the story: "21 today" */
  caption: string;
  /** Wishes already made, in order; a name may appear more than once */
  wishes: { who: string; wish: string }[];
};

// @params
const P: Params = {
  author: "Maya",
  age: 21,
  ago: "11h",
  caption: "21 today",
  wishes: [
    { who: "Tsai Lin", wish: "more sunsets on Miller Hill" },
    { who: "Priya", wish: "a year of color-coded wins" },
    { who: "Calvin", wish: "may you never need seven alarms" },
    { who: "Jordan", wish: "front row at every show" },
    { who: "Arun", wish: "next year's cake comes out of my rice cooker" },
    { who: "Sam", wish: "happy 21st maya" },
    { who: "Will", wish: "arun please do not make the cake in the rice cooker" },
    { who: "Nia", wish: "the good booth at Rook's, forever" },
    { who: "Ben", wish: "tío's tacos on me" },
    { who: "Tsai Lin", wish: "and the aux, just this once" },
    { who: "Leah", wish: "sleep past 9 at least once" },
    { who: "Omar", wish: "lake wren in june" },
  ],
};
// @end params

type Wish = { id: string; who: string; name: string; text: string; candle: number; at: number };
type State = {
  author: string;
  authorId: string | null;
  age: number;
  ago: string;
  caption: string;
  wishes: Wish[];
  blown: { by: string; at: number } | null;
};
type Action = { t: "light"; candle: number; text: string } | { t: "blow" };
type Local = { draft: string; cheers: number };

const PANEL = 556;
const PER_PERSON = 3;
const DEFAULT_WISH = "happy birthday";
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const findMember = (ctx: Ctx, name: string): Member | undefined => (name ? ctx.members.find((m) => m.id === name || sameName(m.name, name)) : undefined);
const lit = (s: State, i: number) => s.wishes.some((w) => w.candle === i);
const mineCount = (s: State, u: string) => s.wishes.filter((w) => w.who === u).length;

function canBlow(s: State, ctx: Ctx, user: string): boolean {
  if (s.blown || s.wishes.length === 0) return false;
  const host = s.authorId && inChat(ctx, s.authorId) ? s.authorId : null;
  return host ? user === host : s.wishes.length >= s.age;
}

function initState(ctx: Ctx): State {
  const age = Number.isInteger(P.age) ? Math.min(40, Math.max(1, P.age)) : 21;
  const author = clean(P.author, 20);
  const authorId = findMember(ctx, author)?.id ?? null;
  const wishes: Wish[] = [];
  const raw = Array.isArray(P.wishes) ? P.wishes : [];
  const order = candleOrder(age);
  for (const w of raw) {
    if (wishes.length >= age) break;
    const name = clean(w?.who, 20);
    const text = clean(w?.wish, 60);
    if (!name || !text) continue;
    const m = findMember(ctx, name);
    const who = m ? m.id : `o:${name}`;
    if (wishes.filter((x) => x.who === who).length >= PER_PERSON) continue;
    wishes.push({ id: `c${order[wishes.length]}`, who, name: m ? m.name : name, text, candle: order[wishes.length]!, at: 0 });
  }
  return { author, authorId, age, ago: clean(P.ago, 6), caption: clean(P.caption, 24), wishes, blown: null };
}

/** The order candles get lit when nobody picks one: middle out, front row first. */
function candleOrder(n: number): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  return all.sort((a, b) => {
    const pa = place(a, n, 300);
    const pb = place(b, n, 300);
    return Math.abs(pa.x - 150) - Math.abs(pb.x - 150) || pb.y - pa.y || a - b;
  });
}

/** Where candle i of n stands on the top tier, for a cake drawn in a box w wide. */
function place(i: number, n: number, w: number): { x: number; y: number; h: number; back: boolean } {
  const rows = n > 11 ? 2 : 1;
  const backN = rows === 2 ? Math.floor(n / 2) : 0;
  const back = i < backN;
  const k = back ? i : i - backN;
  const cnt = back ? backN : n - backN;
  const rx = 0.3 * w;
  const span = back ? 0.74 : 0.88;
  const u = cnt === 1 ? 0 : -1 + (2 * (k + 0.5)) / cnt;
  const x = w / 2 + rx * span * u;
  const curve = Math.sqrt(Math.max(0, 1 - (u * span) ** 2));
  const y = TOP_Y + (back ? -4 - 6 * curve : rows === 2 ? 6 + 6 * curve : 2 + 8 * curve);
  return { x, y, h: back ? 26 : 32, back };
}
const TOP_Y = 300;

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const t = f.now / 1000;
  const blownE = s.blown ? Math.max(0, f.now - s.blown.at) : -1;

  const sky = g.createLinearGradient(0, 0, 0, PANEL);
  sky.addColorStop(0, mix(p.purple, p.red, 0.35));
  sky.addColorStop(0.6, mix(p.purple, p.dark, 0.35));
  sky.addColorStop(1, p.dark);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, PANEL);
  // Fairy lights strung across the top.
  g.strokeStyle = mix(p.on, p.purple, 0.5);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-10, 50);
  g.quadraticCurveTo(w / 2, 74, w + 10, 50);
  g.stroke();
  const bulbs = [p.yellow, p.red, p.blue, p.green, p.orange];
  for (let c = 0; c < bulbs.length; c++) {
    g.fillStyle = bulbs[c]!;
    g.beginPath();
    for (let k = c; k < 14; k += bulbs.length) {
      const u = (k + 0.5) / 14;
      const x = -10 + (w + 20) * u;
      const y = (1 - u) * (1 - u) * 50 + 2 * u * (1 - u) * 74 + u * u * 50 + 5;
      g.globalAlpha = 0.65 + 0.35 * Math.sin(2 * t + k * 1.7);
      g.moveTo(x + 4, y);
      g.arc(x, y, 4, 0, Math.PI * 2);
    }
    g.fill();
  }
  g.globalAlpha = 1;

  // Table and plate.
  g.fillStyle = mix(p.dark, p.purple, 0.22);
  g.fillRect(0, 446, w, PANEL - 446);
  g.fillStyle = mix(p.on, p.purple, 0.15);
  g.beginPath();
  g.ellipse(w / 2, 442, 0.46 * w, 18, 0, 0, Math.PI * 2);
  g.fill();

  // Bottom tier.
  const cx = w / 2;
  const tier = (top: number, bot: number, rx: number, ry: number, body: string, frost: string, drips: number) => {
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(cx, bot, rx, ry, 0, 0, Math.PI);
    g.lineTo(cx - rx, top);
    g.ellipse(cx, top, rx, ry, 0, Math.PI, 0, true);
    g.closePath();
    g.fill();
    g.fillStyle = frost;
    g.beginPath();
    g.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let k = 0; k < drips; k++) {
      const u = -1 + (2 * (k + 0.5)) / drips;
      const x = cx + rx * u;
      const y0 = top + ry * Math.sqrt(1 - u * u);
      const len = 8 + 9 * ((k * 7) % 3);
      g.moveTo(x - 7, y0 - 2);
      g.lineTo(x - 7, y0 + len - 5);
      g.arc(x, y0 + len - 5, 7, Math.PI, 0, true);
      g.lineTo(x + 7, y0 - 2);
    }
    g.fill();
  };
  tier(362, 432, 0.4 * w, 20, mix(p.red, p.on, 0.35), p.cream, 9);
  tier(TOP_Y, 362, 0.3 * w, 16, mix(p.purple, p.on, 0.45), mix(p.on, p.yellow, 0.12), 7);
  // Sprinkles on the bottom tier.
  const spr = [p.blue, p.yellow, p.green, p.orange];
  for (let c = 0; c < spr.length; c++) {
    g.strokeStyle = spr[c]!;
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    for (let k = c; k < 28; k += spr.length) {
      const x = cx - 0.36 * w + ((k * 53) % 100) * 0.0072 * w;
      const y = 396 + ((k * 31) % 26);
      const a = k * 1.3;
      g.moveTo(x, y);
      g.lineTo(x + 5 * Math.cos(a), y + 5 * Math.sin(a));
    }
    g.stroke();
  }

  // Candles: stripes by colour, then wicks, then flames (one fill per colour).
  const n = s.age;
  const spots = Array.from({ length: n }, (_, i) => place(i, n, w));
  const stripe = [p.blue, p.yellow, p.green, p.red, p.orange];
  for (let c = 0; c < stripe.length; c++) {
    g.fillStyle = stripe[c]!;
    g.beginPath();
    spots.forEach((q, i) => {
      if (i % stripe.length !== c) return;
      g.rect(q.x - 3, q.y - q.h, 6, q.h);
    });
    g.fill();
  }
  g.fillStyle = mix(p.on, p.dark, 0.05);
  g.globalAlpha = 0.55;
  g.beginPath();
  spots.forEach((q) => {
    for (let k = 0; k < 3; k++) {
      const y = q.y - q.h + 4 + k * (q.h / 3);
      g.moveTo(q.x - 3, y + 3);
      g.lineTo(q.x + 3, y);
      g.lineTo(q.x + 3, y + 2);
      g.lineTo(q.x - 3, y + 5);
    }
  });
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = p.dark;
  g.lineWidth = 1.5;
  g.beginPath();
  spots.forEach((q) => {
    g.moveTo(q.x, q.y - q.h);
    g.lineTo(q.x + 0.5, q.y - q.h - 5);
  });
  g.stroke();

  const flames = spots.map((q, i) => ({ q, i, on: lit(s, i) }));
  const out = blownE >= 0 ? Math.min(1, blownE / 350) : 0;
  if (out < 1) {
    const flame = (scale: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      for (const { q, i, on } of flames) {
        if (!on) continue;
        const fl = 1 + 0.12 * Math.sin(9 * t + i * 2.3) - 0.9 * out;
        if (fl <= 0.05) continue;
        const bx = q.x;
        const by = q.y - q.h - 4;
        const hh = 15 * scale * fl;
        const sway = 1.6 * Math.sin(5 * t + i);
        g.moveTo(bx, by);
        g.bezierCurveTo(bx - 6 * scale, by - 2, bx - 4 * scale + sway, by - hh * 0.7, bx + sway, by - hh);
        g.bezierCurveTo(bx + 4 * scale + sway, by - hh * 0.7, bx + 6 * scale, by - 2, bx, by);
      }
      g.fill();
    };
    flame(1, p.orange);
    flame(0.62, p.yellow);
    flame(0.3, p.cream);
  }
  // Unlit wicks you can tap: a dashed ring.
  if (!s.blown) {
    g.strokeStyle = mix(p.on, p.purple, 0.25);
    g.lineWidth = 1;
    g.setLineDash([2, 3]);
    g.beginPath();
    for (const { q, on } of flames) if (!on) {
      g.moveTo(q.x + 7, q.y - q.h - 11);
      g.arc(q.x, q.y - q.h - 11, 7, 0, Math.PI * 2);
    }
    g.stroke();
    g.setLineDash([]);
  }
  // Smoke after the blow: one curl per candle, drifting up and together.
  if (blownE >= 0) {
    const k = Math.min(1, blownE / 3200);
    g.strokeStyle = mix(p.on, p.purple, 0.2);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.globalAlpha = 0.55 * (1 - 0.6 * k);
    g.beginPath();
    for (const { q, i, on } of flames) {
      if (!on) continue;
      const x0 = q.x;
      const y0 = q.y - q.h - 6;
      const tx = w / 2 + (q.x - w / 2) * 0.35;
      const ty = 168;
      g.moveTo(x0, y0);
      for (let j = 1; j <= 14; j++) {
        const u = (j / 14) * Math.min(1, 0.25 + k);
        const x = x0 + (tx - x0) * u + 9 * Math.sin(u * 9 + i + t * 1.4) * (1 - u * 0.5);
        const y = y0 + (ty - y0) * u;
        g.lineTo(x, y);
      }
    }
    g.stroke();
    g.globalAlpha = 1;
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Birthday candles",
  summary: (s) => {
    const who = s.author || "Their";
    const people = new Set(s.wishes.map((w) => w.who)).size;
    if (s.blown) return `${who}'s ${s.age}: ${s.wishes.length} wishes from ${people} ${people === 1 ? "person" : "people"}`;
    return `${who}'s cake: ${s.wishes.length} of ${s.age} candles lit`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || s.blown) return s;
    if (a.t === "light") {
      const i = a.candle;
      if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= s.age || lit(s, i)) return s;
      if (mineCount(s, meta.user) >= PER_PERSON) return s;
      const text = clean(a.text, 60) || DEFAULT_WISH;
      const name = ctx.members.find((m) => m.id === meta.user)?.name ?? "Friend";
      return { ...s, wishes: [...s.wishes, { id: `c${i}`, who: meta.user, name, text, candle: i, at: meta.time }] };
    }
    if (a.t === "blow") {
      if (!canBlow(s, ctx, meta.user)) return s;
      return { ...s, blown: { by: meta.user, at: Math.max(1, meta.time) } };
    }
    return s;
  },

  invariants: {
    "one wish per candle, all on the cake": (s) => new Set(s.wishes.map((w) => w.candle)).size === s.wishes.length && s.wishes.every((w) => Number.isInteger(w.candle) && w.candle >= 0 && w.candle < s.age),
    "no more wishes than candles": (s) => s.wishes.length <= s.age && s.age >= 1 && s.age <= 40,
    "at most three each": (s) => s.wishes.every((w) => s.wishes.filter((x) => x.who === w.who).length <= PER_PERSON),
    "wishes say something": (s) => s.wishes.every((w) => w.text.length > 0 && w.text.length <= 60 && w.at >= 0),
    "blown out only after a wish": (s) => s.blown === null || (s.wishes.length > 0 && s.blown.at > 0),
    "wish ids are unique": (s) => new Set(s.wishes.map((w) => w.id)).size === s.wishes.length,
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "nothing changes once blown out": (p, n) => p.blown === null || p === n,
    "a light adds exactly my wish on that candle": (p, n, a, m) => {
      if (a.t !== "light" || p === n) return true;
      if (n.wishes.length !== p.wishes.length + 1 || n.blown !== p.blown) return false;
      if (!p.wishes.every((w, i) => n.wishes[i] === w)) return false;
      const w = n.wishes[n.wishes.length - 1]!;
      const want = (typeof a.text === "string" ? a.text.trim().replace(/\s+/g, " ").slice(0, 60) : "") || "happy birthday";
      return w.who === m.user && w.candle === a.candle && w.at === m.time && w.text === want && w.id === `c${a.candle}` && !p.wishes.some((x) => x.candle === a.candle);
    },
    "a light needs a free hand": (p, n, a, m) => a.t !== "light" || p === n || p.wishes.filter((w) => w.who === m.user).length < 3,
    "blowing out keeps every wish": (p, n, a, m, ctx) => {
      if (a.t !== "blow" || p === n) return true;
      const host = p.authorId && ctx.members.some((x) => x.id === p.authorId) ? p.authorId : null;
      const allowed = host ? m.user === host : p.wishes.length >= p.age;
      return allowed && p.wishes.length > 0 && n.wishes === p.wishes && n.blown?.by === m.user && n.blown.at === Math.max(1, m.time);
    },
    "the cake never changes": (p, n) => p.age === n.age && p.author === n.author && p.authorId === n.authorId && p.caption === n.caption,
  },

  arbitrary: (s, _u, r) => {
    if (r.next() < 0.12) return { t: "blow" };
    const free = Array.from({ length: s.age }, (_, i) => i).filter((i) => !lit(s, i));
    const words = ["more sunsets", "", "the good booth at Rook's", "  sleep in  ", "lake day"];
    return { t: "light", candle: free.length ? r.pick(free) : r.int(s.age), text: r.pick(words) };
  },

  local: { draft: "", cheers: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const people = new Set(state.wishes.map((w) => w.who)).size;
    const isHost = state.authorId === me && members.some((m) => m.id === me);
    const myN = mineCount(state, me);
    const blowable = canBlow(state, { room: "", members }, me);
    const free = candleOrder(state.age).filter((i) => !lit(state, i));
    const authorFace: Member = members.find((m) => m.id === state.authorId) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const face = (w: Wish): Member => members.find((m) => m.id === w.who) ?? { id: w.who, name: w.name };

    const light = (i: number) => {
      if (state.blown || lit(state, i) || myN >= PER_PERSON) return;
      haptic("light");
      dispatch({ t: "light", candle: i, text: local.draft });
      setLocal({ draft: "", cheers: local.cheers + 1 });
    };
    const blow = () => {
      if (!blowable) return;
      haptic("success");
      dispatch({ t: "blow" });
    };

    // Swipe across the cake to blow (the birthday person only); a tap lights the nearest candle.
    let swipe: { x: number; y: number } | null = null;
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type === "down") {
        swipe = { x: e.x, y: e.y };
        return;
      }
      if (e.type === "move") {
        if (isHost && swipe && Math.abs(e.x - swipe.x) > 90 && e.y > 200 && e.y < 460) {
          swipe = null;
          blow();
        }
        return;
      }
      if (!swipe) return;
      const moved = Math.hypot(e.x - swipe.x, e.y - swipe.y);
      swipe = null;
      if (moved > 12) return;
      let best = -1;
      let bd = 26;
      for (let i = 0; i < state.age; i++) {
        const q = place(i, state.age, W);
        const d = Math.hypot(e.x - q.x, e.y - (q.y - q.h - 8));
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) light(best);
    };

    // The three newest wishes float over the cake, each tied to its flame by a thin thread.
    const rank = (w: Wish) => (w.at > 0 ? 2 : members.some((m) => m.id === w.who) ? 1 : 0);
    const recent = [...state.wishes].sort((a, b) => rank(b) - rank(a) || b.at - a.at || state.wishes.indexOf(b) - state.wishes.indexOf(a)).slice(0, 3);
    const slots = [
      { left: 14, top: 124 },
      { left: Math.round(W * 0.3), top: 166 },
      { left: 22, top: 208 },
    ];
    const bubbleW = Math.round(W * 0.66);
    const blownE = state.blown ? running(state.blown.at, 4200) : null;
    const showHeadline = !!state.blown && (blownE === null || blownE > 1500);

    const caption = fitText(state.caption, W - 40, { size: 34, weight: 800, min: 18 });
    const headline = `${state.wishes.length} ${state.wishes.length === 1 ? "wish" : "wishes"} from ${people} ${people === 1 ? "person" : "people"}`;
    const head = fitText(headline, W - 48, { size: 26, weight: 800, min: 16 });
    const wishers = [...new Set(state.wishes.map((w) => w.who))].map((id) => {
      const w = state.wishes.find((x) => x.who === id)!;
      return face(w);
    });

    const myNew = state.wishes.find((w) => w.who === me && w.at > 0 && running(w.at, 1600) !== null);
    const hint = state.blown
      ? `${state.author || "They"} blew them out`
      : isHost
        ? blowable
          ? "Swipe across the cake to blow them out"
          : "Your candles are waiting for wishes"
        : state.wishes.length === 0
          ? `Be the first to light a candle for ${state.author || "them"}`
          : myN >= PER_PERSON
            ? "You lit three. Saving the rest for others."
            : "Tap a candle to light it with your wish";

    return (
      <div>
        <style>{"@keyframes bdcFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes bdcRise{from{transform:translateY(120px) scale(.6);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@keyframes bdcIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", backgroundColor: p.dark, color: p.on }}>
          <Canvas
            height={PANEL}
            drag={isHost}
            label={`Birthday cake with ${state.age} candles, ${state.wishes.length} lit${state.blown ? ", blown out" : ""}`}
            draw={(g, f) => drawScene(g, f, confirmed.blown ? { ...state, blown: confirmed.blown } : state, me, theme)}
            onPointer={onPointer}
          />
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55), pointerEvents: "none" }}>
            <div style={{ width: "58%", height: 3, borderRadius: 2, background: p.on }} />
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={authorFace} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.ago}</span>
            <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden="true" fill={p.on} style={{ flex: "none" }}>
              <circle cx="2" cy="2" r="2" />
              <circle cx="9" cy="2" r="2" />
              <circle cx="16" cy="2" r="2" />
            </svg>
          </div>
          {state.caption ? (
            <div style={{ position: "absolute", left: 20, right: 20, top: 70, textAlign: "center", fontSize: caption.size, fontWeight: 800, lineHeight: "44px", color: p.on, whiteSpace: "nowrap", transform: "rotate(-3deg)", pointerEvents: "none" }}>{caption.text}</div>
          ) : null}

          {!state.blown ? (
            <svg width={W} height={PANEL} viewBox={`0 0 ${W} ${PANEL}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
              {recent.map((w, k) => {
                const q = place(w.candle, state.age, W);
                const s = slots[k]!;
                const bx = s.left + 24;
                const by = s.top + 34;
                const fx = q.x;
                const fy = q.y - q.h - 20;
                return <path key={w.id} d={`M${bx} ${by} C ${bx} ${by + 40}, ${fx} ${fy - 40}, ${fx} ${fy}`} fill="none" stroke={p.on} stroke-width="1" stroke-dasharray="2 4" opacity="0.6" />;
              })}
            </svg>
          ) : null}
          {!state.blown
            ? recent.map((w, k) => {
                const s = slots[k]!;
                const fresh = w.at > 0 && running(w.at, 900) !== null;
                return (
                  <div
                    key={w.id}
                    style={{
                      position: "absolute",
                      left: s.left,
                      top: s.top,
                      maxWidth: bubbleW,
                      height: 34,
                      padding: "0 12px 0 4px",
                      borderRadius: 17,
                      background: mix(p.dark, p.purple, 0.25),
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      boxSizing: "border-box",
                      pointerEvents: "none",
                      animation: fresh ? "bdcRise 900ms cubic-bezier(.2,.8,.2,1) both" : `bdcFloat ${3 + k}s ease-in-out infinite`,
                    }}
                  >
                    <span style={{ flex: "none", display: "flex", borderRadius: 13, boxShadow: `0 0 0 1.5px ${p.on}` }}>
                      <Avatar user={face(w)} size={26} />
                    </span>
                    <span style={{ fontSize: 13, lineHeight: "18px", color: p.on, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${w.text}"`}</span>
                  </div>
                );
              })
            : null}
          {!state.blown && state.wishes.length === 0 ? (
            <div style={{ position: "absolute", left: 14, top: 124, maxWidth: bubbleW, height: 34, padding: "0 14px", borderRadius: 17, border: `1.5px dashed ${p.on}`, display: "flex", alignItems: "center", boxSizing: "border-box", fontSize: 13, color: p.on, whiteSpace: "nowrap", pointerEvents: "none", animation: "bdcFloat 3s ease-in-out infinite" }}>
              Your wish floats up here
            </div>
          ) : null}
          {showHeadline ? (
            <div style={{ position: "absolute", left: 16, right: 16, top: 128, textAlign: "center", pointerEvents: "none", animation: "bdcIn 900ms ease-out both" }}>
              <div style={{ fontSize: head.size, fontWeight: 800, lineHeight: "32px", color: p.on, whiteSpace: "nowrap" }}>{head.text}</div>
              <div style={{ marginTop: 6, fontSize: 14, lineHeight: "20px", color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {state.wishes.length ? `last one: "${[...state.wishes].sort((a, b) => b.at - a.at || state.wishes.indexOf(b) - state.wishes.indexOf(a))[0]!.text}"` : ""}
              </div>
            </div>
          ) : null}

          <div style={{ position: "absolute", left: 14, right: 14, top: 456, height: 24, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            {wishers.length ? <Facepile users={wishers.slice(0, 4)} max={4} size={22} /> : null}
            <span style={{ fontSize: 13, lineHeight: "18px", color: p.on, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {`${state.wishes.length} of ${state.age} lit · ${people} ${people === 1 ? "person" : "people"}`}
            </span>
          </div>
          <div style={{ position: "absolute", left: 14, right: 14, top: 484, fontSize: 13, lineHeight: "18px", color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{hint}</div>

          <div style={{ position: "absolute", left: 12, right: 12, top: 506, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            {state.blown ? (
              <div style={{ flex: 1, height: 40, borderRadius: 20, border: `1px solid ${p.on}`, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 14, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {`Happy birthday, ${state.author || "friend"}`}
              </div>
            ) : isHost ? (
              <Button kind="primary" wide disabled={!blowable} onClick={blow}>
                Blow them out
              </Button>
            ) : (
              <>
                <input
                  aria-label="Your wish"
                  placeholder={myN >= PER_PERSON ? "Three wishes made" : "Your wish…"}
                  maxLength={60}
                  value={local.draft}
                  disabled={myN >= PER_PERSON}
                  onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
                  style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 20, border: `1px solid ${p.on}`, background: mix(p.dark, p.purple, 0.15), color: p.on, padding: "0 14px", fontSize: 14, boxSizing: "border-box" }}
                />
                <Button kind="primary" disabled={!free.length || myN >= PER_PERSON} onClick={() => free.length && light(free[0]!)}>
                  Light one
                </Button>
              </>
            )}
          </div>
          {myNew ? (
            <div style={{ position: "absolute", left: "50%", top: 250, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji="🕯️" />
            </div>
          ) : null}
        </div>
        {local.cheers > 0 && myNew ? <Toast key={local.cheers}>{`Candle lit for ${state.author || "them"}`}</Toast> : null}
      </div>
    );
  },
});
