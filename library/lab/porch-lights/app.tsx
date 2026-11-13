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
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Friday, 6:12pm, "anyone doing anything": the friends' windows at dusk, side by side. Tap yours to
// turn your light on (up for something) or leave it off (staying in, no guilt). The street lamp
// brightens with every light; at three, Muse offers the cheapest thing those three wanted this week.

type Params = {
  /** Card title: "Porch lights" */
  title: string;
  /** Under the title: "Fri 6:12pm · light on = up for something" */
  sub: string;
  /** Time the plan would start: "7:30" */
  when: string;
  /** How many lights it takes for Muse to offer a plan (2 to 6). */
  need: number;
  /** 2 to 8 windows. place groups windows into buildings. said: their line in the chat. want: something they said they wanted this week, cost in cents. */
  windows: { name: string; place: string; on: boolean; said: string; want: string; cost: number; cat: boolean }[];
};

// @params
const P: Params = {
  title: "Porch lights",
  sub: "Fri 6:12pm · light on = up for something",
  when: "7:30",
  need: 3,
  windows: [
    { name: "Aditya", place: "412 Pine", on: false, said: "lowkey tired but lowkey not", want: "Late hour at Kettle & Crumb", cost: 500, cat: false },
    { name: "Calvin", place: "412 Pine", on: false, said: "in bed by 9, alarm one is 5:50", want: "A slice at Rook's", cost: 400, cat: true },
    { name: "Arun", place: "412 Pine", on: false, said: "rice cooker risotto night, no regrets", want: "", cost: 0, cat: false },
    { name: "Will", place: "412 Pine", on: true, said: "anyone doing anything", want: "Two games at Midtown Lanes", cost: 900, cat: false },
    { name: "Tsai Lin", place: "Across the hall", on: true, said: "i'm up. i pick the music", want: "Dumplings at Golden Lantern", cost: 1100, cat: false },
    { name: "Maya", place: "Across the hall", on: false, said: "", want: "Taco Tuesday at Tío's (on a Friday)", cost: 600, cat: false },
  ],
};
// @end params

type Win = { who: string; name: string; place: string; on: boolean; said: string; want: string; cost: number; cat: boolean; at: number };
type Plan = { who: string; want: string; cost: number; by: string; at: number };
type State = { title: string; sub: string; when: string; need: number; wins: Win[]; plan: Plan | null; flips: number };
type Action = { t: "light" } | { t: "lock" } | { t: "unlock" };
type Local = { pick: string; burst: number };

const MAX = 8;
const FLICK = 700;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const lit = (s: State) => s.wins.filter((w) => w.on);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const memberOf = (w: Win): Member => ({ id: w.who, name: w.name });
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/** The cheapest thing a lit window wanted (first on ties); null when fewer than `need` are lit. */
function offerOf(s: State): Win | null {
  const on = lit(s);
  if (on.length < s.need) return null;
  let best: Win | null = null;
  for (const w of on) if (w.want && (best === null || w.cost < best.cost)) best = w;
  return best;
}

const planHolds = (s: State) => !!s.plan && lit(s).length >= s.need && s.wins.some((w) => w.who === s.plan!.who && w.on && w.want === s.plan!.want);

function initState(ctx: Ctx): State {
  const wins: Win[] = [];
  const used = new Set<string>();
  for (const raw of P.windows) {
    if (wins.length >= MAX) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => !used.has(x.id) && x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (wins.some((w) => w.who === who)) continue;
    if (m) used.add(m.id);
    const cost = Number.isInteger(raw.cost) ? Math.min(100000, Math.max(0, raw.cost)) : 0;
    wins.push({ who, name, place: clean(raw.place, 20), on: !!raw.on, said: clean(raw.said, 60), want: clean(raw.want, 40), cost, cat: !!raw.cat, at: 0 });
  }
  for (const m of ctx.members) {
    if (wins.length >= MAX) break;
    if (used.has(m.id) || wins.some((w) => w.who === m.id)) continue;
    wins.push({ who: m.id, name: clean(m.name, 20) || "Friend", place: wins[wins.length - 1]?.place ?? "", on: false, said: "", want: "", cost: 0, cat: false, at: 0 });
  }
  const need = Number.isInteger(P.need) ? Math.min(6, Math.max(2, P.need)) : 3;
  return { title: clean(P.title, 40) || "Porch lights", sub: clean(P.sub, 60), when: clean(P.when, 10), need, wins, plan: null, flips: 0 };
}

function drawStreet(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, pick: string) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const dk = t.mode === "dark";
  const light = dk ? c.text : c.card;
  const W = f.width;
  const H = f.height;
  const n = s.wins.length;
  const on = lit(s).length;
  let anim = false;

  // Dusk sky.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mix(c.series6, dk ? c.wash : c.text, dk ? 0.55 : 0.35));
  sky.addColorStop(0.55, mix(c.series4, c.series6, 0.55));
  sky.addColorStop(1, mix(c.series5, c.series2, 0.4));
  g.beginPath();
  g.roundRect(0, 0, W, H, 14);
  g.fillStyle = sky;
  g.fill();

  // Stars: one path.
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const x = ((i * 97) % 100) / 100 * W;
    const y = 8 + ((i * 53) % 40);
    g.moveTo(x + 1.2, y);
    g.arc(x, y, i % 3 === 0 ? 1.3 : 0.8, 0, Math.PI * 2);
  }
  g.fillStyle = mix(c.series2, c.card, 0.6);
  g.fill();
  // Moon.
  g.beginPath();
  g.arc(W - 34, 26, 11, 0, Math.PI * 2);
  g.fillStyle = mix(c.series2, c.card, 0.55);
  g.fill();
  g.beginPath();
  g.arc(W - 29, 22, 10, 0, Math.PI * 2);
  g.fillStyle = mix(c.series6, dk ? c.wash : c.text, dk ? 0.55 : 0.35);
  g.fill();

  // Buildings: consecutive windows with the same place.
  const groups: { place: string; from: number; to: number }[] = [];
  s.wins.forEach((w, i) => {
    const last = groups[groups.length - 1];
    if (last && last.place === w.place) last.to = i;
    else groups.push({ place: w.place, from: i, to: i });
  });
  const ground = H - 26;
  const gap = groups.length > 1 ? 34 : 0;
  const pad = 10;
  const slot = (W - 2 * pad - gap * (groups.length - 1)) / Math.max(1, n);
  const ww = Math.min(46, slot - 10);
  const wh = Math.min(62, ww * 1.32);
  const top = ground - wh - 44;
  const xs: number[] = [];
  let x0 = pad;
  const lampXs: number[] = [];
  groups.forEach((gr, gi) => {
    const cnt = gr.to - gr.from + 1;
    const bw = cnt * slot;
    const roof = top - 22 - (gi % 2) * 10;
    g.beginPath();
    g.roundRect(x0, roof, bw, ground - roof, [8, 8, 0, 0]);
    g.fillStyle = gi % 2 === 0 ? mix(c.series5, dk ? c.wash : c.text, 0.55) : mix(c.series4, dk ? c.wash : c.text, 0.6);
    g.fill();
    // Roof line and sign.
    g.beginPath();
    g.rect(x0 - 3, roof, bw + 6, 5);
    g.fillStyle = mix(c.series5, dk ? c.wash : c.text, 0.75);
    g.fill();
    const sign = fitText(gr.place, bw - 16, { g, size: 11, min: 8, weight: 600 });
    g.font = sign.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = dk ? mix(c.series2, c.text, 0.5) : mix(c.series2, c.card, 0.85);
    g.fillText(sign.text, x0 + bw / 2, roof + 14);
    for (let i = gr.from; i <= gr.to; i++) xs[i] = x0 + (i - gr.from) * slot + slot / 2;
    x0 += bw;
    if (gi < groups.length - 1) lampXs.push(x0 + gap / 2);
    x0 += gap;
  });
  if (!lampXs.length) lampXs.push(W - 18);

  // Sidewalk.
  g.beginPath();
  g.rect(0, ground, W, H - ground);
  g.fillStyle = dk ? mix(c.wash, c.card, 0.3) : mix(c.secondaryText, c.text, 0.45);
  g.fill();
  g.beginPath();
  g.rect(0, ground, W, 3);
  g.fillStyle = mix(c.secondaryText, c.card, 0.3);
  g.fill();

  // Street lamp: brighter with every light on.
  const glowTo = Math.min(1, on / Math.max(1, s.need));
  for (const lx of lampXs) {
    const ly = top - 4;
    g.fillStyle = mix(c.series2, c.card, 0.35);
    for (let k = 3; k >= 1; k--) {
      g.globalAlpha = (0.08 + 0.16 * glowTo) * (4 - k) / 3;
      g.beginPath();
      g.arc(lx, ly, (10 + 26 * glowTo) * k * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    // Pool of light on the sidewalk.
    g.beginPath();
    g.ellipse(lx, ground + 6, 10 + 22 * glowTo, 5, 0, 0, Math.PI * 2);
    g.fillStyle = mix(c.series2, c.card, 0.4);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.rect(lx - 1.5, ly, 3, ground - ly);
    g.fillStyle = mix(c.text, c.secondaryText, 0.3);
    if (dk) g.fillStyle = mix(c.wash, c.secondaryText, 0.4);
    g.fill();
    g.beginPath();
    g.roundRect(lx - 7, ly - 10, 14, 11, [6, 6, 2, 2]);
    g.fillStyle = mix(c.series2, c.card, 0.25 * (1 - glowTo));
    g.fill();
  }

  // Windows.
  s.wins.forEach((w, i) => {
    const cx = xs[i]!;
    const x = cx - ww / 2;
    const y = top;
    const e = w.at ? running(w.at, FLICK) : null;
    if (e !== null) anim = true;
    // Flicker while switching: settle toward the new state.
    let bright = w.on ? 1 : 0;
    if (e !== null) {
      const k = e / FLICK;
      const blink = Math.sin(k * 26) > 0.2 ? 1 : 0.35;
      bright = w.on ? Math.min(1, k * 1.4) * blink : (1 - k) * blink;
    }
    const mine = w.who === me;
    const focus = w.who === pick;

    if (bright > 0.05) {
      g.globalAlpha = 0.45 * bright;
      g.beginPath();
      g.ellipse(cx, y + wh / 2, ww * 0.95, wh * 0.85, 0, 0, Math.PI * 2);
      g.fillStyle = mix(c.series2, c.card, 0.2);
      g.fill();
      g.globalAlpha = 1;
    }
    // Frame and glass.
    g.beginPath();
    g.roundRect(x - 3, y - 3, ww + 6, wh + 6, 6);
    g.fillStyle = mine || focus ? light : mix(light, c.secondaryText, 0.35);
    g.fill();
    g.beginPath();
    g.roundRect(x, y, ww, wh, 4);
    g.fillStyle = mix(mix(c.series1, dk ? c.wash : c.text, 0.72), mix(c.series2, c.card, 0.25), bright);
    g.fill();

    // Who is inside: a lit window shows them; a dark one shows the curtain and a sleepy face.
    const hx = cx;
    const hy = y + wh * 0.5;
    const r = Math.max(9, Math.min(11, ww * 0.24));
    if (bright > 0.4) {
      g.beginPath();
      g.ellipse(hx, y + wh - 2, r * 1.6, r * 1.1, 0, Math.PI, 0);
      g.fillStyle = mix(userColor(memberOf(w), t), dk ? c.wash : c.text, 0.25);
      g.fill();
      g.beginPath();
      g.arc(hx, hy, r, 0, Math.PI * 2);
      g.fillStyle = userColor(memberOf(w), t);
      g.fill();
      // A face: two eyes and a smile.
      g.beginPath();
      g.arc(hx - r * 0.35, hy - r * 0.1, 1.4, 0, Math.PI * 2);
      g.arc(hx + r * 0.35, hy - r * 0.1, 1.4, 0, Math.PI * 2);
      g.fillStyle = mix(c.text, userColor(memberOf(w), t), 0.15);
      if (dk) g.fillStyle = c.wash;
      g.fill();
      g.beginPath();
      g.arc(hx, hy + r * 0.15, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = 1.5;
      g.strokeStyle = g.fillStyle;
      g.stroke();
      // A waving hand.
      const wave = Math.sin(f.now / 260 + i * 1.7) * 0.25;
      anim = true;
      g.save();
      g.translate(hx + r * 1.25, y + wh - 4);
      g.rotate(0.35 + wave);
      g.beginPath();
      g.roundRect(-2, -r * 1.7, 4, r * 1.7, 2);
      g.arc(0, -r * 1.8, 3.2, 0, Math.PI * 2);
      g.fillStyle = userColor(memberOf(w), t);
      g.fill();
      g.restore();
    } else {
      // Curtains, drawn half.
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + ww * 0.32, y + wh * 0.5, x + ww * 0.18, y + wh);
      g.lineTo(x, y + wh);
      g.closePath();
      g.moveTo(x + ww, y);
      g.quadraticCurveTo(x + ww * 0.68, y + wh * 0.5, x + ww * 0.82, y + wh);
      g.lineTo(x + ww, y + wh);
      g.closePath();
      g.fillStyle = mix(c.series6, dk ? c.wash : c.text, 0.55);
      g.fill();
      // Moon glint.
      g.beginPath();
      g.moveTo(x + ww * 0.42, y + 6);
      g.lineTo(x + ww * 0.58, y + 6 + ww * 0.16);
      g.lineWidth = 2;
      g.strokeStyle = mix(c.series1, c.card, 0.5);
      g.stroke();
    }
    // Mullion.
    g.beginPath();
    g.rect(cx - 1, y, 2, wh);
    g.rect(x, y + wh * 0.38, ww, 2);
    g.fillStyle = mine || focus ? light : mix(light, c.secondaryText, 0.35);
    g.fill();

    // Sill, and Calvin's cat on it.
    g.beginPath();
    g.roundRect(x - 6, y + wh + 2, ww + 12, 5, 2);
    g.fillStyle = mix(c.card, c.secondaryText, 0.25);
    g.fill();
    if (w.cat) {
      const kx = x + ww - 8;
      const ky = y + wh + 2;
      const tail = Math.sin(f.now / 380 + i) * 3;
      anim = true;
      g.beginPath();
      g.ellipse(kx, ky - 7, 7, 7, 0, Math.PI, 0);
      g.rect(kx - 7, ky - 7, 14, 7);
      g.arc(kx - 4, ky - 15, 5, 0, Math.PI * 2);
      g.moveTo(kx - 8.5, ky - 17);
      g.lineTo(kx - 7.5, ky - 23);
      g.lineTo(kx - 4.5, ky - 19);
      g.moveTo(kx - 3.5, ky - 19.5);
      g.lineTo(kx - 0.5, ky - 23);
      g.lineTo(kx + 0.5, ky - 17);
      g.fillStyle = dk ? c.wash : c.text;
      g.fill();
      g.beginPath();
      g.moveTo(kx + 6, ky - 2);
      g.quadraticCurveTo(kx + 14, ky + 2, kx + 12 + tail, ky + 12);
      g.lineWidth = 2.5;
      g.lineCap = "round";
      g.strokeStyle = dk ? c.wash : c.text;
      g.stroke();
      g.beginPath();
      g.arc(kx - 6, ky - 15.5, 1, 0, Math.PI * 2);
      g.arc(kx - 2.2, ky - 15.5, 1, 0, Math.PI * 2);
      g.fillStyle = mix(c.series2, c.card, 0.2);
      g.fill();
    }

    // Name plate.
    const label = fitText(mine ? "You" : w.name, slot - 4, { g, size: 12, min: 10, weight: mine ? 700 : 600 });
    g.font = label.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const ly = ground + 14;
    if (mine) {
      const tw = g.measureText(label.text).width + 14;
      g.beginPath();
      g.roundRect(cx - tw / 2, ly - 9, tw, 18, 9);
      g.fillStyle = c.primary;
      g.fill();
      g.fillStyle = c.onPrimary;
    } else g.fillStyle = dk ? c.text : c.card;
    g.fillText(label.text, cx, ly);
    if (mine && !w.on && e === null) {
      // A dashed ring around your dark window says "tap here".
      g.setLineDash([4, 3]);
      g.beginPath();
      g.roundRect(x - 7, y - 7, ww + 14, wh + 14, 8);
      g.lineWidth = 2;
      g.strokeStyle = light;
      g.stroke();
      g.setLineDash([]);
    }
  });
  void p;
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Porch lights",
  summary: (s) => {
    const on = lit(s);
    if (s.plan) return `${s.plan.want} · ${s.when ? `${s.when} · ` : ""}${on.length} lights on`;
    const o = offerOf(s);
    if (o) return `${on.length} lights on · Muse found ${o.want}`;
    return `${s.title}: ${on.length} of ${s.wins.length} lights on`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const i = s.wins.findIndex((w) => w.who === m.user);
    if (a.t === "light") {
      if (i < 0) return s;
      const wins = s.wins.map((w, k) => (k === i ? { ...w, on: !w.on, at: m.time } : w));
      const next = { ...s, wins, flips: s.flips + 1 };
      // A plan stays only while enough lights are on.
      if (next.plan && !planHolds(next)) return { ...next, plan: null };
      return next;
    }
    if (a.t === "lock") {
      if (s.plan || i < 0 || !s.wins[i]!.on) return s;
      const o = offerOf(s);
      if (!o) return s;
      return { ...s, plan: { who: o.who, want: o.want, cost: o.cost, by: m.user, at: m.time } };
    }
    if (a.t === "unlock") {
      if (!s.plan || s.plan.by !== m.user) return s;
      return { ...s, plan: null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let wins = s.wins.map((w) => (seeded(w.who) || inChat(ctx, w.who) ? w : { ...w, who: `~${w.name}` }));
    // Departed people keep their window under their name; name clashes are dropped.
    wins = wins.filter((w, i) => wins.findIndex((x) => x.who === w.who) === i);
    for (const m of ctx.members) {
      if (wins.length >= MAX || wins.some((w) => w.who === m.id)) continue;
      const k = wins.findIndex((w) => seeded(w.who) && w.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0) wins = wins.map((w, j) => (j === k ? { ...w, who: m.id } : w));
      else wins = [...wins, { who: m.id, name: clean(m.name, 20) || "Friend", place: wins[wins.length - 1]?.place ?? "", on: false, said: "", want: "", cost: 0, cat: false, at: 0 }];
    }
    const next = { ...s, wins };
    const plan = next.plan && planHolds(next) && (seeded(next.plan.by) || inChat(ctx, next.plan.by)) ? next.plan : null;
    return { ...next, plan };
  },

  invariants: {
    "2 to 8 windows, one per person": (s) => s.wins.length >= 1 && s.wins.length <= MAX && new Set(s.wins.map((w) => w.who)).size === s.wins.length,
    "live windows belong to people in the chat": (s, ctx) => s.wins.every((w) => seeded(w.who) || inChat(ctx, w.who)),
    "a plan only with enough lights on": (s) => s.plan === null || lit(s).length >= s.need,
    "the plan is something a lit window wanted": (s) => s.plan === null || s.wins.some((w) => w.who === s.plan!.who && w.on && w.want === s.plan!.want),
    "costs are whole cents": (s) => s.wins.every((w) => Number.isInteger(w.cost) && w.cost >= 0) && (s.plan === null || Number.isInteger(s.plan.cost)),
    "flips count up": (s) => Number.isInteger(s.flips) && s.flips >= 0,
  },

  transitions: {
    "a switch flips only the sender's light": (p, n, a, m) => {
      if (a.t !== "light" || p === n) return true;
      const changed = n.wins.filter((w, i) => w.on !== p.wins[i]?.on);
      return changed.length === 1 && changed[0]!.who === m.user && changed[0]!.at === m.time && n.flips === p.flips + 1;
    },
    "only a switch changes lights": (p, n, a) => a.t === "light" || n.wins.every((w, i) => w.on === p.wins[i]?.on),
    "a lock takes the cheapest lit want": (p, n, a, m) => {
      if (a.t !== "lock" || p === n) return true;
      const o = offerOf(p);
      return !!o && !!n.plan && n.plan.who === o.who && n.plan.cost === o.cost && n.plan.by === m.user && p.plan === null && p.wins.some((w) => w.who === m.user && w.on);
    },
    "a switch keeps a plan that still holds": (p, n, a) => a.t !== "light" || p.plan === null || n.plan !== null || !planHolds({ ...n, plan: p.plan }),
    "unknown actions change nothing": (p, n, a) => a.t === "light" || a.t === "lock" || a.t === "unlock" || JSON.stringify(p) === JSON.stringify(n),
    "only the locker unlocks": (p, n, a, m) => a.t !== "unlock" || p === n || (p.plan !== null && p.plan.by === m.user && n.plan === null),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.wins.find((w) => w.who === user);
    if (s.plan && s.plan.by === user && r.next() < 0.2) return { t: "unlock" };
    if (mine?.on && offerOf(s) && !s.plan && r.next() < 0.5) return { t: "lock" };
    return { t: "light" };
  },

  local: { pick: "", burst: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const mine = s.wins.find((w) => w.who === me);
    const on = lit(s);
    const offer = offerOf(s);
    const plan = confirmed.plan;
    const latest = [...s.wins].filter((w) => w.said).pop();
    const shown = s.wins.find((w) => w.who === local.pick) ?? (mine && mine.said ? mine : null) ?? s.wins.find((w) => w.on && w.said) ?? latest;
    const label = `${on.length} of ${s.wins.length} lights on: ${s.wins.map((w) => `${w.name} ${w.on ? "on" : "off"}`).join(", ")}`;
    const toggle = () => {
      haptic("light");
      dispatch({ t: "light" });
    };
    const tap = (e: { type: string; x: number; y: number }, width: number) => {
      if (e.type !== "up") return;
      const n = s.wins.length;
      const i = Math.max(0, Math.min(n - 1, Math.floor((e.x / Math.max(1, width)) * n)));
      const w = s.wins[i];
      if (!w) return;
      if (w.who === me) toggle();
      else setLocal({ pick: w.who });
    };
    const needMore = Math.max(0, s.need - on.length);

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={198} label={label} draw={(g, f) => drawStreet(g, f, s, me, local.pick)} onPointer={(e) => tap(e, theme.width - 2 * theme.space.card)} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 6, minWidth: 0 }}>
          {shown && shown.said ? (
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.text, minWidth: 0, ...ell }}>
              <b>{firstName(shown.name)}</b>
              <span style={{ color: c.secondaryText }}>{` · “${shown.said}”`}</span>
            </span>
          ) : (
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText, ...ell }}>Tap a window to see what they said</span>
          )}
        </div>

        {plan ? (
          <div style={{ position: "relative" }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="💡" />
              </div>
            ) : null}
            <Locked detail={`${s.when ? `${s.when} · ` : ""}${money(plan.cost)} each · ${on.length} lights on`}>{plan.want}</Locked>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
              <Facepile users={on.map(memberOf)} max={5} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{mine?.on ? "You're in. Porch light stays on." : "Light on to come along"}</span>
              {mine ? (
                <Button kind="secondary" onClick={toggle}>
                  {mine.on ? "Light off" : "Light on"}
                </Button>
              ) : null}
            </div>
            {local.burst > 0 ? <Toast key={local.burst}>On the calendar for {s.when || "tonight"}</Toast> : null}
          </div>
        ) : offer ? (
          <div>
            <div style={{ borderRadius: theme.radius.card, background: c.input, padding: "10px 12px", minWidth: 0 }}>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`${on.length} lights on · cheapest thing you wanted this week`}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, minWidth: 0 }}>
                <span style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text, flex: 1, minWidth: 0, ...ell }}>{offer.want}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.text, flex: "none" }}>{money(offer.cost)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, marginTop: 2, ...ell }}>{`${firstName(offer.name)}'s idea · ${s.when || "tonight"}`}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <Button kind="secondary" wide disabled={!mine} onClick={toggle}>
                {mine?.on ? "Light off" : "Light on"}
              </Button>
              <Button
                kind="primary"
                wide
                disabled={!mine?.on}
                onClick={() => {
                  haptic("success");
                  setLocal({ burst: local.burst + 1 });
                  dispatch({ t: "lock" });
                }}
              >
                Lock it
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 28, minWidth: 0 }}>
              {on.length ? <Facepile users={on.map(memberOf)} max={4} size={20} /> : null}
              <span style={{ fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>
                {`${on.length} of ${s.wins.length} on · ${needMore} more and Muse finds a plan`}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Button kind={mine?.on ? "secondary" : "primary"} wide disabled={!mine} onClick={toggle}>
                {mine?.on ? "Light off" : "Turn my light on"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
});
