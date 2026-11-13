import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  fitText,
  haptic,
  mix,
  rng,
  running,
  seedOf,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// A chore wheel another group made, shown in the feed as a live preview. "Make ours" sweeps a
// shimmer across it and rebuilds it with your group's names; switch groups to remix again, then
// send it to that chat.

type Group = { name: string; short: string; badge: string; members: string[]; note: string };
type Params = {
  /** 2 to 6 chore names */
  chores: string[];
  /** First the group that made it, then up to 3 groups of yours. */
  groups: Group[];
  /** Remixes so far from outside the chat. */
  base: number;
  /** Up to 3 names shown in the proof row. */
  remixers: string[];
};

// @params
const P: Params = {
  chores: ["Dishes", "Trash", "Bathroom", "Vacuum"],
  groups: [
    { name: "Apt 4B", short: "Original", badge: "4B", members: ["Marcus", "Dani", "Max", "Jules"], note: "Marcus, Dani +2 spin it weekly" },
    { name: "The Ridge House", short: "Ridge House", badge: "RH", members: ["Maya", "Jordan", "Priya", "Leo", "Sam"], note: "Your house · 5 people" },
    { name: "Unit 12 suite", short: "Unit 12", badge: "12", members: ["Ava", "Kai", "Zoe"], note: "Your suite · 3 people" },
  ],
  base: 1200,
  remixers: ["Maya", "Ava", "Leo"],
};
// @end params

type Mine = { g: number; prev: number; at: number; rot: number; spunAt: number; from: number; to: number; sentAt: number };
type State = { chores: string[]; groups: Group[]; base: number; remixers: string[]; mine: Record<string, Mine> };
type Action = { t: "use"; g: number } | { t: "spin" } | { t: "send" };
type Local = { burst: number };

const TAU = 2 * Math.PI;
const SWEEP = 1100;
const SPIN = 3200;
const FLY = 700;
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz";
const DEFAULT_CHORES = ["Dishes", "Trash", "Bathroom", "Vacuum"];
const NONE: Mine = { g: 0, prev: 0, at: 0, rot: 0, spunAt: 0, from: 0, to: 0, sentAt: 0 };
const sweepEase = tween({ duration: SWEEP, easing: "easeInOut" });
const spinEase = tween({ duration: SPIN, easing: [0.33, 1, 0.68, 1] });
const flyEase = tween({ duration: FLY, easing: "standard" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const cur = (s: State, u: string): Mine => s.mine[u] ?? NONE;
const under = (to: number, n: number) => Math.floor(((((-to) % TAU) + TAU) % TAU) / (TAU / n)) % n;
const tone = (g: Group, name: string, people: readonly string[]) => people[(Math.max(0, g.members.indexOf(name)) + seedOf(g.name)) % Math.max(1, people.length)] ?? "";
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const outBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const compact = (n: number) => {
  const v = Math.max(0, Math.round(n));
  if (v < 1000) return String(v);
  if (v < 9950) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (v < 999500) return `${Math.round(v / 1000)}K`;
  return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nameOfId = (id: string, members: readonly Member[]) => (id.startsWith("o:") ? id.slice(2) : members.find((m) => m.id === id)?.name ?? id);
const asMember = (id: string, members: readonly Member[]): Member => members.find((m) => m.id === id) ?? { id, name: nameOfId(id, members) };

function cleanGroup(raw: unknown): Group | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = clean(r.name, 24);
  if (!name) return null;
  const seen = new Set<string>();
  const members: string[] = [];
  for (const m of Array.isArray(r.members) ? r.members : []) {
    const n = clean(m, 16);
    if (!n || seen.has(n.toLowerCase()) || members.length >= 12) continue;
    seen.add(n.toLowerCase());
    members.push(n);
  }
  return { name, short: clean(r.short, 14) || name.slice(0, 14), badge: clean(r.badge, 3).toUpperCase(), members, note: clean(r.note, 40) };
}

function initState(ctx: Ctx): State {
  const chores: string[] = [];
  for (const c of Array.isArray(P.chores) ? P.chores : []) {
    const n = clean(c, 14);
    if (n && chores.length < 6) chores.push(n);
  }
  const list = chores.length >= 2 ? chores : DEFAULT_CHORES;
  const groups: Group[] = [];
  for (const g of Array.isArray(P.groups) ? P.groups : []) {
    const k = cleanGroup(g);
    if (k && groups.length < 4) groups.push(k);
  }
  if (!groups.length) {
    groups.push({ name: "This chat", short: "This chat", badge: "", members: ctx.members.slice(0, 12).map((m) => clean(m.name, 16) || "?"), note: `${ctx.members.length} people` });
  }
  const remixers: string[] = [];
  for (const r of Array.isArray(P.remixers) ? P.remixers : []) {
    const n = clean(r, 16);
    if (!n || remixers.length >= 3) continue;
    const m = ctx.members.find((x) => x.id === n || x.name.toLowerCase() === n.toLowerCase());
    const id = m ? m.id : `o:${n}`;
    if (!remixers.includes(id)) remixers.push(id);
  }
  const base = Number.isInteger(P.base) && P.base >= 0 && P.base <= 1e7 ? P.base : 0;
  return { chores: list, groups, base, remixers, mine: {} };
}

// The rota: who takes chore i, and the line under it.
const who = (g: Group, i: number, rot: number) => (g.members.length ? g.members[(i + rot) % g.members.length]! : "");
function footLine(g: Group, chores: number, rot: number): string {
  const n = g.members.length;
  if (n === 0) return "";
  if (n > chores) {
    const k = n - chores;
    const a = g.members[(chores + rot) % n]!;
    if (k === 1) return `${a} gets the week off`;
    if (k === 2) return `${a} and ${g.members[(chores + 1 + rot) % n]!} get the week off`;
    return `${a} and ${k - 1} others get the week off`;
  }
  if (n < chores) return `${g.members[rot % n]!} doubles up · rotates`;
  return "Rotates every Sunday";
}

type Panel = {
  chores: string[];
  cur: Group;
  prev: Group;
  first: Group;
  idOf: (name: string) => string;
  at: number;
  angleCur: number;
  anglePrev: number;
  /** Spin (confirmed only): wheel angle from, to, start time; waiting = the spin is not confirmed yet. */
  from: number;
  to: number;
  spunAt: number;
  waiting: boolean;
  rot: number;
  rotFrom: number;
  hasRemixed: boolean;
};

const wheelR = (pw: number) => (pw + 2 >= 360 ? 72 : 56);

function glyphText(text: string, k: number, tick: number): string {
  let out = "";
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i]!;
    if (ch === " " || i < k * len) out += ch;
    else out += GLYPHS[(i * 7 + tick * 13 + ch.charCodeAt(0)) % GLYPHS.length];
  }
  return out;
}

function drawIcon(g: CanvasRenderingContext2D, kind: number, x: number, y: number, color: string) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineJoin = "round";
  g.lineCap = "round";
  if (kind === 0) {
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(0, 0, 7, 0, TAU);
    g.stroke();
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, 3.5, 0, TAU);
    g.stroke();
  } else if (kind === 1) {
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-5, -4);
    g.lineTo(5, -4);
    g.lineTo(4, 7);
    g.lineTo(-4, 7);
    g.closePath();
    g.moveTo(-7, -6);
    g.lineTo(7, -6);
    g.moveTo(-2, -8);
    g.lineTo(2, -8);
    g.stroke();
  } else if (kind === 2) {
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5, 1);
    g.lineTo(-5, 1);
    g.closePath();
    g.moveTo(5, 2.5);
    g.arc(0, 2.5, 5, 0, TAU);
    g.fill();
  } else {
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(3, -8);
    g.lineTo(-1, 4);
    g.stroke();
    g.beginPath();
    g.moveTo(-6, 3);
    g.lineTo(4, 3);
    g.lineTo(5, 8);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function drawPanel(g: CanvasRenderingContext2D, f: DrawFrame, d: Panel): boolean {
  const t = f.theme;
  const c = t.color;
  const PW = f.width;
  const wr = wheelR(PW);
  const cx = 16 + wr;
  const cy = 70 + wr;
  const lx = 16 + 2 * wr + 22;
  const fam = t.type.family;
  const e = d.at > 0 ? f.now - d.at : -1;
  const sweeping = e >= 0 && e < SWEEP;
  const sx = sweeping ? lerp(-10, PW + 10, sweepEase(e)) : PW + 100;
  const tick = Math.floor((f.now / 1000) * 24);
  const groupAt = (x: number) => (sweeping && x >= sx ? d.prev : d.cur);
  const isNew = (x: number) => sweeping && x < sx;
  const scr = (text: string, x: number, original: string) => (isNew(x) && text === original ? glyphText(text, clamp((sx - x) / 90), tick) : text);

  g.globalAlpha = 1;
  g.textBaseline = "middle";
  g.textAlign = "left";

  // Header strip: badge, title, note. Each picks its group by its own x.
  const bg = groupAt(30);
  g.beginPath();
  g.roundRect(12, 12, 36, 36, 8);
  g.fillStyle = bg === d.first ? mix(c.series4, t.mode === "light" ? c.text : c.wash, 0.3) : c.primary;
  g.fill();
  if (bg.badge) {
    const bf = fitText(bg.badge, 30, { g, size: 16, weight: 700, min: 10, family: fam });
    g.font = bf.font;
    g.fillStyle = c.onPrimary;
    g.textAlign = "center";
    g.fillText(bf.text, 30, 31);
  } else {
    g.strokeStyle = c.onPrimary;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(30, 30, 9, 0, TAU);
    g.stroke();
  }
  g.textAlign = "left";
  const tg = groupAt(98);
  const titleText = scr(`${tg.name} · chore wheel`, 58, `${d.cur.name} · chore wheel`);
  const tf = fitText(titleText, PW - 70, { g, size: 15, weight: 600, min: 11, family: fam });
  g.font = tf.font;
  g.fillStyle = c.text;
  g.fillText(tf.text, 58, 21);
  const noteText = scr(tg.note, 58, d.cur.note);
  const nf = fitText(noteText, PW - 70, { g, size: 13, weight: 400, min: 10, family: fam });
  g.font = nf.font;
  g.fillStyle = c.secondaryText;
  g.fillText(nf.text, 58, 40);

  // Wheel.
  const drawSlices = (grp: Group, angle: number) => {
    const n = grp.members.length;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + angle + (i * TAU) / n;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, wr, a0, a0 + TAU / n);
      g.closePath();
      g.fillStyle = tone(grp, grp.members[i]!, t.people);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = c.card;
      g.stroke();
    }
  };
  const drawRim = () => {
    g.beginPath();
    g.arc(cx, cy, wr + 3, 0, TAU);
    g.fillStyle = c.divider;
    g.fill();
  };
  const angleOfCur = (() => {
    if (d.spunAt > 0 && !d.waiting) {
      const k = f.now - d.spunAt;
      if (k < SPIN) return d.from + (d.to - d.from) * spinEase(Math.max(0, k));
      return d.to;
    }
    if (d.waiting) return d.from + f.now / 300;
    return d.angleCur;
  })();
  const spinning = d.waiting || (d.spunAt > 0 && f.now - d.spunAt < SPIN);

  drawRim();
  if (sweeping && d.prev !== d.cur) {
    drawSlices(d.prev, d.anglePrev);
    g.save();
    g.beginPath();
    g.rect(0, 0, Math.max(0, sx), 232);
    g.clip();
    drawRim();
    drawSlices(d.cur, angleOfCur);
    g.restore();
  } else {
    drawSlices(d.cur, angleOfCur);
  }
  const nCur = d.cur.members.length;
  if (nCur === 0 && !(sweeping && d.prev.members.length > 0)) {
    g.beginPath();
    g.arc(cx, cy, wr, 0, TAU);
    g.fillStyle = c.card;
    g.fill();
    g.setLineDash([5, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = c.divider;
    g.stroke();
    g.setLineDash([]);
  }

  // Slice labels, each from the group at its own x.
  const labels = (grp: Group, angle: number, take: (x: number) => boolean, scrambled: boolean) => {
    const n = grp.members.length;
    for (let i = 0; i < n; i++) {
      const mid = -Math.PI / 2 + angle + ((i + 0.5) * TAU) / n;
      const dx = Math.cos(mid);
      const dy = Math.sin(mid);
      const lrad = wr < 60 ? 0.72 : 0.6;
      const px = cx + lrad * wr * dx;
      const py = cy + lrad * wr * dy;
      if (!take(px)) continue;
      const nm = grp.members[i]!;
      const text = scrambled ? glyphText(nm, clamp((sx - px) / 90), tick) : nm;
      const lf = fitText(text, (wr < 60 ? 0.52 : 0.62) * wr, { g, size: n > 4 ? 12 : 13, weight: 600, min: 10, family: fam });
      g.save();
      g.translate(px, py);
      g.rotate(dx < 0 ? mid + Math.PI : mid);
      g.font = lf.font;
      g.fillStyle = c.onPrimary;
      g.textAlign = "center";
      g.fillText(lf.text, 0, 0);
      g.restore();
    }
  };
  if (sweeping && d.prev !== d.cur) {
    labels(d.prev, d.anglePrev, (x) => x >= sx, false);
    labels(d.cur, angleOfCur, (x) => x < sx, true);
  } else {
    labels(d.cur, angleOfCur, () => true, false);
  }
  g.textAlign = "left";

  // Pointer.
  if (nCur > 0 || sweeping) {
    g.beginPath();
    g.moveTo(cx, cy - wr + 8);
    g.lineTo(cx - 9, cy - wr - 10);
    g.lineTo(cx + 9, cy - wr - 10);
    g.closePath();
    g.fillStyle = c.primary;
    g.fill();
    g.lineWidth = 1.5;
    g.lineJoin = "round";
    g.strokeStyle = c.card;
    g.stroke();
  }
  // Hub.
  g.beginPath();
  g.arc(cx, cy, 20, 0, TAU);
  g.fillStyle = c.card;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = c.divider;
  g.stroke();
  g.font = `600 13px ${fam}`;
  g.fillStyle = c.text;
  g.textAlign = "center";
  g.fillText(spinning ? "…" : "Spin", cx, cy + 0.5);
  if (nCur === 0) {
    g.font = `400 13px ${fam}`;
    g.fillStyle = c.secondaryText;
    g.fillText("No one to spin yet", cx, cy + wr + 14 > 226 ? 224 : cy + wr + 14);
  }
  g.textAlign = "left";

  // Rota.
  g.font = `400 13px ${fam}`;
  g.fillStyle = c.secondaryText;
  g.fillText("This week", lx, 69);
  const k = d.chores.length;
  const pitch = Math.min(32, Math.floor(125 / k));
  const rh = Math.min(28, pitch - 3);
  const rowsRight = PW - 8;
  const whoGroup = groupAt(PW - 50);
  const rotShown = spinning ? d.rotFrom : d.rot;
  for (let i = 0; i < k; i++) {
    const y = 79 + i * pitch;
    g.beginPath();
    g.roundRect(lx - 4, y, rowsRight - (lx - 4), rh, 8);
    g.fillStyle = c.secondaryButton;
    g.fill();
    drawIcon(g, Math.min(i, 3), lx + 10, y + rh / 2, c.secondaryText);
    const cf = fitText(d.chores[i]!, 80, { g, size: 13, weight: 400, min: 10, family: fam });
    g.font = cf.font;
    g.fillStyle = c.text;
    g.textAlign = "left";
    g.fillText(cf.text, lx + 24, y + rh / 2 + 0.5);
    const raw = who(whoGroup, i, whoGroup === d.cur ? rotShown : 0);
    const room = Math.max(24, Math.min(70, PW - 34 - (lx + 24 + g.measureText(cf.text).width + 8)));
    const shownName = scr(raw, PW - 50, who(d.cur, i, rotShown));
    if (shownName) {
      const wf = fitText(shownName, room, { g, size: 13, weight: 400, min: 10, family: fam });
      g.font = wf.font;
      g.fillStyle = c.text;
      g.textAlign = "right";
      g.fillText(wf.text, PW - 34, y + rh / 2 + 0.5);
    }
  }
  g.textAlign = "left";
  const fg = groupAt(lx + 40);
  const rawFoot = footLine(fg, k, fg === d.cur ? rotShown : 0);
  const footText = scr(rawFoot, lx + 40, footLine(d.cur, k, rotShown));
  if (footText) {
    const ff = fitText(footText, PW - 8 - lx, { g, size: 12, weight: 400, min: 10, family: fam });
    g.font = ff.font;
    g.fillStyle = c.secondaryText;
    g.fillText(ff.text, lx, 214);
  }

  // Sweep band.
  if (sweeping) {
    g.fillStyle = c.primary;
    const x0 = sx - 70;
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const a = x0 + ((sx + 17.5 - x0) * i) / steps;
      const b = x0 + ((sx + 17.5 - x0) * (i + 1)) / steps;
      const m = (a + b) / 2;
      g.globalAlpha = m <= sx ? 0.3 * clamp((m - x0) / 70) : 0.3 * clamp(1 - (m - sx) / 17.5);
      g.fillRect(a, 0, b - a, 232);
    }
    g.globalAlpha = 0.9;
    g.fillStyle = c.card;
    g.fillRect(sx - 1, 0, 2, 232);
    g.globalAlpha = 1;
  }
  return sweeping || spinning;
}

export default defineApp<State, Action, Local>({
  name: "Remix a tool",
  summary: (s, ctx) => {
    const here = s.remixers.filter((r) => !r.startsWith("o:")).length;
    const base = `${s.groups[0]?.name ?? "This chat"}'s chore wheel · ${compact(s.base + here)} remixes`;
    const k = Object.values(s.mine).filter((m) => m.g >= 1).length;
    void ctx;
    return k > 0 ? `${base} · ${k} remixed here` : base;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    const c = cur(s, u);
    if (a.t === "use") {
      if (!Number.isInteger(a.g) || a.g < 0 || a.g >= s.groups.length || a.g === c.g) return s;
      const mine = { ...s.mine, [u]: { g: a.g, prev: c.g, at: meta.time, rot: 0, spunAt: 0, from: c.to, to: c.to, sentAt: 0 } };
      const remixers = a.g >= 1 && !s.remixers.includes(u) ? [...s.remixers, u] : s.remixers;
      return { ...s, mine, remixers };
    }
    if (a.t === "spin") {
      const n = s.groups[c.g]!.members.length;
      if (n === 0 || (c.spunAt > 0 && meta.time < c.spunAt + SPIN)) return s;
      const r = rng(meta.seed);
      const rot = r.int(n);
      const theta = (-(rot + 0.2 + 0.6 * r.next()) * TAU) / n;
      const dd = (((theta - c.to) % TAU) + TAU) % TAU;
      return { ...s, mine: { ...s.mine, [u]: { ...c, rot, spunAt: meta.time, from: c.to, to: c.to + 3 * TAU + dd } } };
    }
    if (a.t === "send") {
      if (c.g < 1 || c.sentAt !== 0) return s;
      return { ...s, mine: { ...s.mine, [u]: { ...c, sentAt: meta.time } } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = Object.keys(s.mine).filter((u) => !inChat(ctx, u));
    const staleRemixers = s.remixers.filter((r) => !r.startsWith("o:") && !inChat(ctx, r));
    if (!gone.length && !staleRemixers.length) return s;
    const mine: Record<string, Mine> = {};
    for (const u of Object.keys(s.mine)) if (inChat(ctx, u)) mine[u] = s.mine[u]!;
    return { ...s, mine, remixers: s.remixers.filter((r) => r.startsWith("o:") || inChat(ctx, r)) };
  },

  invariants: {
    "every wheel shows a real group": (s, ctx) =>
      Object.keys(s.mine).every((u) => {
        const m = s.mine[u]!;
        return inChat(ctx, u) && Number.isInteger(m.g) && Number.isInteger(m.prev) && m.g >= 0 && m.prev >= 0 && m.g < s.groups.length && m.prev < s.groups.length;
      }),
    "the rota offset fits the group": (s) =>
      Object.values(s.mine).every((m) => Number.isInteger(m.rot) && m.rot >= 0 && m.rot < Math.max(1, s.groups[m.g]?.members.length ?? 0)),
    "the pointer lands on the rota's first slice": (s) =>
      Object.values(s.mine).every((m) => {
        const n = s.groups[m.g]?.members.length ?? 0;
        return m.spunAt === 0 ? m.rot === 0 : n > 0 && m.rot === under(m.to, n);
      }),
    "a spin goes forward at least three turns": (s) => Object.values(s.mine).every((m) => m.spunAt === 0 || m.to - m.from >= 3 * TAU - 1e-6),
    "only a remix is sent, after it was made": (s) => Object.values(s.mine).every((m) => m.sentAt === 0 || m.g >= 1),
    "remixers are unique, members or outsiders": (s, ctx) =>
      new Set(s.remixers).size === s.remixers.length &&
      s.remixers.every((r) => r.startsWith("o:") || inChat(ctx, r)) &&
      Object.keys(s.mine).every((u) => s.mine[u]!.g < 1 || s.remixers.includes(u)),
    "groups are well formed": (s) =>
      s.groups.length >= 1 &&
      s.groups.length <= 4 &&
      s.groups.every((g) => new Set(g.members).size === g.members.length) &&
      s.chores.length >= 2 &&
      s.chores.length <= 6,
  },

  transitions: {
    "use changes only the actor's wheel and restarts its sweep": (p, n, a, m) => {
      if (a.t !== "use" || p === n) return true;
      const x = n.mine[m.user];
      return (
        !!x &&
        x.g === a.g &&
        x.prev === cur(p, m.user).g &&
        x.at === m.time &&
        x.rot === 0 &&
        x.sentAt === 0 &&
        Object.keys(n.mine).every((u) => u === m.user || same(n.mine[u], p.mine[u])) &&
        Object.keys(p.mine).every((u) => u === m.user || same(n.mine[u], p.mine[u]))
      );
    },
    "the seed decides the spin": (p, n, a, m) => {
      if (a.t !== "spin" || p === n) return true;
      const gn = p.groups[cur(p, m.user).g]?.members.length ?? 0;
      return n.mine[m.user]?.rot === rng(m.seed).int(gn);
    },
    "a spin starts where the wheel stopped, now": (p, n, a, m) =>
      a.t !== "spin" || p === n || (n.mine[m.user]?.from === cur(p, m.user).to && n.mine[m.user]?.spunAt === m.time),
    "no spin while one is running": (p, n, a, m) => {
      if (a.t !== "spin" || p === n) return true;
      const c = cur(p, m.user);
      return !(c.spunAt > 0 && m.time < c.spunAt + SPIN);
    },
    "a remix is sent once": (p, n, a, m) => {
      if (a.t !== "send" || p === n) return true;
      const c = cur(p, m.user);
      return c.g >= 1 && c.sentAt === 0 && n.mine[m.user]?.sentAt === m.time;
    },
    "remixers never shrink by an action": (p, n) => p.remixers.every((x) => n.remixers.includes(x)),
    "the wheel's chores and groups never change": (p, n) => same(p.chores, n.chores) && same(p.groups, n.groups) && p.base === n.base,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.35) return { t: "use", g: r.int(s.groups.length) };
    if (k < 0.75) return { t: "spin" };
    return { t: "send" };
  },

  local: { burst: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const PW = W - 2;
    const wr = wheelR(PW);
    const cx = 16 + wr;
    const cy = 70 + wr;
    const lx = 16 + 2 * wr + 22;
    const cs = cur(state, me);
    const cc = cur(confirmed, me);
    const sp = cc.at === cs.at ? cc : cs;
    const groups = state.groups;
    const grp = groups[cs.g] ?? groups[0]!;
    const prevGrp = groups[cs.prev] ?? grp;
    const first = groups[0]!;
    const n = grp.members.length;
    const waiting = pending && cs.spunAt !== cc.spunAt;
    const spinE = sp.spunAt > 0 ? running(sp.spunAt, SPIN) : null;
    const spinning = waiting || spinE !== null;
    const sweepE = cs.at > 0 ? running(cs.at, SWEEP) : null;
    const sweeping = sweepE !== null;
    const sx = sweeping ? lerp(-10, PW + 10, sweepEase(sweepE)) : PW + 100;
    const remixed = cs.at > 0;
    const sentE = cs.sentAt > 0 ? running(cs.sentAt, FLY) : null;
    const idOf = (name: string) => members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
    const here = state.remixers.filter((r) => !r.startsWith("o:")).length;
    const total = state.base + here;
    const rot = spinning ? (sp.from === 0 ? 0 : under(sp.from, Math.max(1, n))) : sp.rot % Math.max(1, n);
    const label = `Chore wheel for ${grp.name}: ${state.chores.map((ch, i) => `${ch} ${who(grp, i, rot)}`.trim()).join(", ")}`;

    const panel: Panel = {
      chores: state.chores,
      cur: grp,
      prev: prevGrp,
      first,
      idOf,
      at: cs.at,
      angleCur: sp.to,
      anglePrev: cs.from,
      from: sp.from,
      to: sp.to,
      spunAt: sp.spunAt,
      waiting,
      rot,
      rotFrom: sp.from === 0 ? 0 : under(sp.from, Math.max(1, n)),
      hasRemixed: remixed,
    };

    const header = sweeping
      ? { title: "Muse is rebuilding it…", sub: "Your names" }
      : remixed && cs.g >= 1
        ? { title: `Remixed for ${grp.name}`, sub: "Just now" }
        : remixed
          ? { title: `${first.name} made a chore wheel`, sub: "Original" }
          : { title: `${first.name} made a chore wheel`, sub: `${compact(total)} remixes` };

    const names = state.remixers.slice(0, 2).map((r) => nameOfId(r, members));
    const others = Math.max(0, total - names.length);
    const proof = !names.length ? `${compact(total)} remixed this` : others > 0 ? `${names.join(", ")} and ${compact(others)} others remixed this` : `${names.join(" and ")} remixed this`;

    const rotaGroup = sx > PW - 50 ? grp : prevGrp;
    const pop = sweeping ? outBack(clamp((sx - PW + 50) / 50)) : 1;
    const rowCount = state.chores.length;
    const pitch = Math.min(32, Math.floor(125 / rowCount));
    const rh = Math.min(28, pitch - 3);
    const avSize = Math.min(18, rh - 2);
    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const fly = sentE !== null ? flyEase(sentE) : 1;
    const sentGroup = grp;
    const first1 = sentGroup.members[0] ?? "";

    return (
      <div>
        <CardHeader title={header.title} subtitle={header.sub} />
        <div style={{ position: "relative", height: 232, marginTop: 4, borderRadius: 12, border: `1px solid ${c.divider}`, background: c.wash, overflow: "hidden" }}>
          <Canvas
            height={230}
            label={label}
            draw={(g, f) => {
              const live = drawPanel(g, { ...f, height: 232 }, panel);
              return live;
            }}
          />
          {Array.from({ length: rowCount }, (_, i) => {
            const who1 = who(rotaGroup, i, rotaGroup === grp ? rot : 0);
            if (!who1) return null;
            const y = 79 + i * pitch + rh / 2;
            const s = rotaGroup === grp ? pop : 1;
            return (
              <span
                key={i}
                style={{ position: "absolute", left: PW - 20 - avSize / 2, top: y - avSize / 2 - 1, width: avSize, height: avSize, transform: `scale(${s})`, pointerEvents: "none" }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: avSize, height: avSize, borderRadius: avSize, background: tone(rotaGroup, who1, theme.people), color: c.onPrimary, fontSize: Math.round(avSize * 0.5), fontWeight: 600, lineHeight: 1 }}>{(who1[0] ?? "?").toUpperCase()}</span>
              </span>
            );
          })}
          <button
            aria-label="Spin the wheel"
            disabled={n === 0}
            onClick={() => {
              if (!spinning) dispatch({ t: "spin" });
            }}
            style={{ position: "absolute", left: cx - 22, top: cy - 22, width: 44, height: 44, padding: 0, border: 0, borderRadius: 22, background: "transparent", cursor: "pointer" }}
          />
          {local.burst > 0 && !sweeping ? (
            <div style={{ position: "absolute", left: cx, top: cy, width: 0, height: 0, pointerEvents: "none" }}>
              <Burst key={local.burst} emoji="❤️" />
            </div>
          ) : null}
        </div>

        {!remixed ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 20, marginTop: 8, minWidth: 0 }}>
              <Facepile users={state.remixers.slice(0, 3).map((r) => asMember(r, members))} max={3} size={16} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "20px", color: c.secondaryText, ...ellipsis }}>{proof}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              {groups.length > 1 ? (
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    dispatch({ t: "use", g: 1 });
                    haptic("light");
                    setLocal({ burst: local.burst + 1 });
                  }}
                >
                  Use for my group
                </Button>
              ) : (
                <Button kind="primary" wide disabled={n === 0 || spinning} onClick={() => dispatch({ t: "spin" })}>
                  Spin
                </Button>
              )}
            </div>
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>
              {groups.length > 1 ? "Muse swaps in your people. Nothing posts until you send." : "Spin it to see who gets what."}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, height: 44, minWidth: 0 }}>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, width: 46, flex: "none" }}>Remix</span>
              {groups.map((g, i) => {
                const sel = cs.g === i;
                const text = i === 0 ? g.short : theme.width < 360 ? g.short : `${g.short} · ${g.members.length}`;
                return (
                  <button
                    key={i}
                    aria-pressed={sel}
                    onClick={() => {
                      dispatch({ t: "use", g: i });
                      if (i !== cs.g) {
                        haptic("light");
                        setLocal({ burst: local.burst + 1 });
                      }
                    }}
                    style={{ height: 44, padding: 0, border: 0, background: "transparent", minWidth: 0, flex: "0 1 auto", display: "inline-flex", alignItems: "center", cursor: "pointer" }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        maxWidth: 140,
                        height: 28,
                        lineHeight: "28px",
                        padding: "0 11px",
                        borderRadius: 14,
                        fontSize: 13,
                        background: sel ? c.selected : c.secondaryButton,
                        color: c.text,
                        fontWeight: 400,
                        ...ellipsis,
                      }}
                    >
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>
            {cs.g >= 1 && cs.sentAt > 0 ? (
              <div style={{ position: "relative", height: 36, borderRadius: 8, background: c.secondaryButton, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", overflow: "hidden", minWidth: 0 }}>
                {sentE !== null ? (
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                    style={{ position: "absolute", left: lerp(30, W - 30, fly) - 9, top: 9 - 14 * Math.sin(Math.PI * fly), pointerEvents: "none" }}
                  >
                    <path d="M2 9 16 2 11 16 8.5 10.5Z" fill={c.primary} />
                  </svg>
                ) : (
                  <>
                    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke={c.positive} stroke-width={2.5} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                      <path d="M2 7.5 5.5 11 12 3.5" />
                    </svg>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "20px", fontWeight: 600, color: c.text, ...ellipsis }}>
                      {`Sent · ${first1} +${Math.max(0, sentGroup.members.length - 1)} got it`}
                    </span>
                    <Facepile users={sentGroup.members.map((m) => ({ id: idOf(m), name: m }))} max={5} size={16} />
                  </>
                )}
              </div>
            ) : (
              <Button kind="primary" wide disabled={cs.g < 1} onClick={() => dispatch({ t: "send" })}>
                {`Send to ${grp.name}`}
              </Button>
            )}
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText, minHeight: 16 }}>
              {sweeping ? "" : `Made with Muse · remixed from ${first.name}`}
            </div>
          </div>
        )}
      </div>
    );
  },
});
