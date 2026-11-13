import { defineApp, Avatar, Button, Canvas, CardHeader, Facepile, Locked, Toast, fitText, haptic, mix, pal, running, spring, springs, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Exam range: everyone's finals, posted in pieces across the chat, drawn as two weeks of mountains.
// Each exam is a peak in its owner's color, as tall as they said it was scary (Calvin's orgo final
// is Everest). The valleys are when people can hang. The first day after the last peak, when all
// six are done, is the meadow where the end of finals dinner goes; lock it and it becomes an event.

type Params = {
  /** Card title: "Finals range" */
  title: string;
  /** Under the title: "orgo survivors · finals Dec 8 to 19" */
  sub: string;
  /** The days of finals in order, short: "Mon 8" */
  days: string[];
  /** The dinner once everyone is done: where and when */
  dinner: { place: string; time: string };
  /** Exams already posted: who, the course, which day (index into days), how scared 1 to 5, and what they said */
  exams: { who: string; course: string; day: number; fear: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Finals range",
  sub: "orgo survivors · Dec 8 to 19",
  days: ["Mon 8", "Tue 9", "Wed 10", "Thu 11", "Fri 12", "Sat 13", "Sun 14", "Mon 15", "Tue 16", "Wed 17", "Thu 18", "Fri 19"],
  dinner: { place: "Golden Lantern", time: "7pm" },
  exams: [
    { who: "Calvin", course: "orgo", day: 8, fear: 5, said: "setting all 7 alarms for this one" },
    { who: "Calvin", course: "calc", day: 2, fear: 2 },
    { who: "Maya", course: "stats", day: 1, fear: 2, said: "study plan is color-coded, we're fine" },
    { who: "Maya", course: "econ", day: 7, fear: 3 },
    { who: "Arun", course: "physics", day: 4, fear: 4, said: "rice cooker is making study congee" },
    { who: "Tsai Lin", course: "bio", day: 3, fear: 3, said: "aux is mine during study hall" },
    { who: "Will", course: "history", day: 9, fear: 1, said: "winging it from the sube" },
  ],
};
// @end params

type Exam = { id: string; who: string; name: string; course: string; day: number; fear: number; said: string; at: number };
type Dinner = { day: number; by: string; at: number; going: string[] };
type State = { title: string; sub: string; days: string[]; place: string; time: string; exams: Exam[]; dinner: Dinner | null };
type Action = { t: "add"; day: number } | { t: "fear"; id: string } | { t: "drop"; id: string } | { t: "lock" } | { t: "going" };
type Local = { day: number; toast: number };

const CH = 196;
const BASE = CH - 30;
const RISE = spring({ ...springs.iosBouncy });
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
/** The last day anyone still has an exam, or -1. */
const lastExam = (s: State) => s.exams.reduce((m, e) => Math.max(m, e.day), -1);
/** Where the dinner goes: the locked day, else the day after the last exam (if the range has one). */
const dinnerDay = (s: State) => (s.dinner ? s.dinner.day : lastExam(s) + 1 < s.days.length && s.exams.length ? lastExam(s) + 1 : -1);
const peakH = (fear: number) => 14 + fear * 21;

function initState(ctx: Ctx): State {
  const days = (Array.isArray(P.days) ? P.days : []).map((d) => clean(d, 8)).filter(Boolean).slice(0, 16);
  while (days.length < 5) days.push(`Day ${days.length + 1}`);
  const exams: Exam[] = [];
  for (const x of Array.isArray(P.exams) ? P.exams : []) {
    const name = clean(x?.who, 20);
    if (!name || !isInt(x.day, 0, days.length - 1) || exams.length >= 24) continue;
    const m = ctx.members.find((y) => y.id === name || y.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (exams.some((e) => e.who === who && e.day === x.day)) continue;
    exams.push({ id: `p${exams.length}`, who, name: m ? clean(m.name, 20) || name : name, course: clean(x.course, 12) || "final", day: x.day, fear: isInt(x.fear, 1, 5) ? x.fear : 3, said: clean(x.said, 60), at: 0 });
  }
  return { title: clean(P.title, 40) || "Finals range", sub: clean(P.sub, 60), days, place: clean(P.dinner?.place, 24) || "dinner", time: clean(P.dinner?.time, 10), exams, dinner: null };
}

function drawRange(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, sel: number) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const n = s.days.length;
  const colW = (W - 16) / n;
  const cx = (d: number) => 8 + (d + 0.5) * colW;
  let anim = false;

  // Sky, a low sun, and the ground.
  g.save();
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.clip();
  const sky = g.createLinearGradient(0, 0, 0, BASE);
  sky.addColorStop(0, dk ? mix(pl.blue, c.wash, 0.75) : mix(pl.sky, c.card, 0.2));
  sky.addColorStop(1, dk ? mix(pl.purple, c.wash, 0.7) : mix(pl.cream, c.card, 0.3));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, CH);
  g.beginPath();
  g.arc(30, 28, 13, 0, Math.PI * 2);
  g.fillStyle = dk ? mix(pl.yellow, c.wash, 0.25) : mix(pl.yellow, c.card, 0.35);
  g.fill();

  // Far hills, the same every time.
  g.beginPath();
  g.moveTo(0, BASE);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, BASE - 34 - 12 * Math.sin(x / 41) - 8 * Math.sin(x / 17 + 1));
  g.lineTo(W, BASE);
  g.closePath();
  g.fillStyle = dk ? mix(pl.blue, c.wash, 0.6) : mix(pl.sky, c.secondaryText, 0.18);
  g.fill();

  // Selected day guide.
  if (sel >= 0 && sel < n) {
    g.fillStyle = mix(c.primary, dk ? c.wash : c.card, 0.82);
    g.fillRect(cx(sel) - colW / 2, 0, colW, BASE);
  }

  // Peaks: tallest at the back. Each rises when it lands.
  const order = [...s.exams].sort((a, b) => b.fear - a.fear || a.day - b.day);
  for (const e of order) {
    const run = e.at ? running(e.at, 1100) : null;
    if (run !== null) anim = true;
    const k = run === null ? 1 : RISE(run);
    const h = peakH(e.fear) * Math.max(0, k);
    const x = cx(e.day);
    const half = colW * (0.9 + e.fear * 0.18);
    const col = userColor(e.who, t);
    const body = mix(col, dk ? c.wash : c.card, 0.18);
    g.beginPath();
    g.moveTo(x - half, BASE);
    g.quadraticCurveTo(x - half * 0.45, BASE - h * 0.55, x - 2, BASE - h);
    g.lineTo(x + 2, BASE - h);
    g.quadraticCurveTo(x + half * 0.5, BASE - h * 0.5, x + half, BASE);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    // Shadow side.
    g.beginPath();
    g.moveTo(x + 1, BASE - h);
    g.quadraticCurveTo(x + half * 0.5, BASE - h * 0.5, x + half, BASE);
    g.lineTo(x + half * 0.2, BASE);
    g.closePath();
    g.fillStyle = mix(col, dk ? c.wash : c.text, 0.25);
    g.fill();
    // Snow on the scary ones.
    if (e.fear >= 4 && k > 0.6) {
      const sh = h * (e.fear === 5 ? 0.3 : 0.2);
      g.beginPath();
      g.moveTo(x - 2, BASE - h);
      g.lineTo(x + 2, BASE - h);
      g.lineTo(x + sh * 0.55, BASE - h + sh);
      g.lineTo(x + sh * 0.15, BASE - h + sh * 0.8);
      g.lineTo(x - sh * 0.1, BASE - h + sh);
      g.lineTo(x - sh * 0.5, BASE - h + sh * 0.85);
      g.closePath();
      g.fillStyle = dk ? c.text : c.card;
      g.fill();
    }
  }
  // Flags with the course on each summit, after all the mountains so none hide behind a slope.
  for (const e of order) {
    const run = e.at ? running(e.at, 1100) : null;
    const k = run === null ? 1 : RISE(run);
    if (k < 0.85) continue;
    const x = cx(e.day);
    const top = BASE - peakH(e.fear);
    g.strokeStyle = dk ? c.text : c.text;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, top - 14);
    g.stroke();
    const lab = fitText(e.course, 58, { g, size: 10, min: 9, weight: 700 });
    const lw = Math.min(58, g.measureText(lab.text).width) + 8;
    const left = s.exams.some((o) => o.day === e.day + 1 && o.fear >= e.fear - 1) || x + lw > W - 4;
    const lx = Math.max(4, Math.min(W - 4 - lw, left ? x - lw : x));
    g.beginPath();
    g.roundRect(lx, top - 22, lw, 13, 3);
    g.fillStyle = e.who === me ? c.primary : dk ? c.card : c.card;
    g.fill();
    g.fillStyle = e.who === me ? c.onPrimary : c.text;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(lab.text, lx + 4, top - 15.5);
  }

  // Ground.
  g.fillStyle = dk ? mix(pl.grass, c.wash, 0.55) : pl.grass;
  g.fillRect(0, BASE, W, CH - BASE);
  // Valleys: days nobody has an exam get little trees.
  const busy = new Set(s.exams.map((e) => e.day));
  const dd = dinnerDay(s);
  g.beginPath();
  for (let d = 0; d < n; d++) {
    if (busy.has(d) || d === dd) continue;
    const x = cx(d);
    g.moveTo(x - 5, BASE + 1);
    g.lineTo(x, BASE - 11);
    g.lineTo(x + 5, BASE + 1);
    g.closePath();
  }
  g.fillStyle = dk ? mix(pl.leaf, c.text, 0.25) : pl.leaf;
  g.fill();

  // The dinner: a lantern on a post in the first meadow after everyone is done.
  if (dd >= 0) {
    const x = cx(dd);
    const sway = Math.sin(f.now / 500) * 2;
    anim = true;
    g.setLineDash([2, 3]);
    g.strokeStyle = dk ? c.text : c.secondaryText;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 26);
    g.lineTo(x, BASE - 44);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = dk ? c.text : pl.brown;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, BASE);
    g.lineTo(x, BASE - 40);
    g.lineTo(x + 9, BASE - 40);
    g.stroke();
    g.beginPath();
    g.ellipse(x + 9 + sway * 0.3, BASE - 30, 7, 9, 0, 0, Math.PI * 2);
    g.fillStyle = pl.red;
    g.fill();
    g.globalAlpha = 0.25 + 0.1 * Math.sin(f.now / 300);
    g.beginPath();
    g.arc(x + 9, BASE - 30, 17, 0, Math.PI * 2);
    g.fillStyle = pl.yellow;
    g.fill();
    g.globalAlpha = 1;
    // A little table.
    g.fillStyle = dk ? c.text : pl.brown;
    g.fillRect(x - 12, BASE - 9, 24, 3);
    g.fillRect(x - 10, BASE - 6, 2, 6);
    g.fillRect(x + 8, BASE - 6, 2, 6);
  }

  // Day labels along the bottom.
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let d = 0; d < n; d++) {
    const parts = s.days[d]!.split(" ");
    const strong = d === sel || d === dd;
    g.font = `${strong ? 700 : 500} 9px ${t.type.family}`;
    g.fillStyle = d === dd ? (dk ? c.text : c.text) : dk ? c.text : mix(c.text, pl.grass, 0.15);
    g.fillText(fitText(parts[0] ?? "", colW - 2, { g, size: 9, min: 8, weight: strong ? 700 : 500 }).text, cx(d), BASE + 9);
    g.font = `${strong ? 700 : 500} 10px ${t.type.family}`;
    g.fillText(fitText(parts.slice(1).join(" "), colW - 2, { g, size: 10, min: 8, weight: strong ? 700 : 500 }).text, cx(d), BASE + 21);
  }

  // An empty range invites the first exam: a dashed peak on the selected day.
  if (!s.exams.some((e) => e.who === me) && sel >= 0 && sel < n && dd !== sel) {
    const x = cx(sel);
    g.setLineDash([4, 4]);
    g.strokeStyle = c.primary;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - colW * 1.4, BASE);
    g.quadraticCurveTo(x - colW * 0.6, BASE - 50, x, BASE - 88);
    g.quadraticCurveTo(x + colW * 0.6, BASE - 50, x + colW * 1.4, BASE);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Exam range",
  summary: (s) => {
    const people = new Set(s.exams.map((e) => e.who)).size;
    if (s.dinner) return `End of finals dinner · ${s.days[s.dinner.day]} ${s.time} · ${s.place} · ${s.dinner.going.length} going`;
    if (!s.exams.length) return `${s.title}: nobody's posted an exam yet`;
    const dd = dinnerDay(s);
    return `${s.exams.length} exams from ${people} ${people === 1 ? "person" : "people"} · ${dd >= 0 ? `everyone's done by ${s.days[dd]}` : "finals run to the end"}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "add") {
      if (!isInt(a.day, 0, s.days.length - 1)) return s;
      if (s.exams.some((e) => e.who === u && e.day === a.day) || s.exams.length >= 40) return s;
      if (s.dinner && a.day >= s.dinner.day) return s;
      const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
      return { ...s, exams: [...s.exams, { id: `e${m.seq}`, who: u, name, course: "final", day: a.day, fear: 3, said: "", at: m.time }] };
    }
    if (a.t === "fear" || a.t === "drop") {
      const e = s.exams.find((x) => x.id === a.id);
      if (typeof a.id !== "string" || !e || e.who !== u) return s;
      if (a.t === "drop") return { ...s, exams: s.exams.filter((x) => x.id !== a.id) };
      return { ...s, exams: s.exams.map((x) => (x.id === a.id ? { ...x, fear: (x.fear % 5) + 1, at: m.time } : x)) };
    }
    if (a.t === "lock") {
      const dd = dinnerDay(s);
      if (s.dinner || dd < 0) return s;
      return { ...s, dinner: { day: dd, by: u, at: m.time, going: [u] } };
    }
    if (a.t === "going") {
      if (!s.dinner) return s;
      const g = s.dinner.going;
      return { ...s, dinner: { ...s.dinner, going: g.includes(u) ? g.filter((x) => x !== u) : [...g, u] } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.exams.some((e) => gone(e.who)) && !(s.dinner && s.dinner.going.some(gone))) return s;
    return { ...s, exams: s.exams.filter((e) => !gone(e.who)), dinner: s.dinner ? { ...s.dinner, going: s.dinner.going.filter((u) => !gone(u)) } : null };
  },

  invariants: {
    "exams sit on days of the range": (s) => s.exams.every((e) => isInt(e.day, 0, s.days.length - 1) && isInt(e.fear, 1, 5)),
    "one exam per person per day": (s) => new Set(s.exams.map((e) => `${e.who}@${e.day}`)).size === s.exams.length && new Set(s.exams.map((e) => e.id)).size === s.exams.length,
    "the dinner comes after every exam": (s) => !s.dinner || (s.dinner.day > lastExam(s) && s.dinner.day < s.days.length),
    "live people are in the chat": (s, ctx) => s.exams.every((e) => e.who.startsWith("~") || inChat(ctx, e.who)) && (!s.dinner || s.dinner.going.every((u) => inChat(ctx, u) && !u.startsWith("~"))),
    "nobody is going twice": (s) => !s.dinner || new Set(s.dinner.going).size === s.dinner.going.length,
  },

  transitions: {
    "adding raises only your peak": (p, n, a, m) =>
      a.t !== "add" || p === n || (n.exams.length === p.exams.length + 1 && n.exams.at(-1)!.who === m.user && n.exams.at(-1)!.day === a.day && n.exams.at(-1)!.fear === 3 && n.dinner === p.dinner),
    "only your own peak changes height": (p, n, a, m) => {
      if (a.t !== "fear" || p === n) return true;
      const was = p.exams.find((e) => e.id === a.id);
      const now = n.exams.find((e) => e.id === a.id);
      return !!was && !!now && was.who === m.user && now.fear === (was.fear % 5) + 1 && now.day === was.day && n.exams.length === p.exams.length;
    },
    "dropping removes only your exam": (p, n, a, m) => a.t !== "drop" || p === n || (n.exams.length === p.exams.length - 1 && p.exams.find((e) => e.id === a.id)?.who === m.user && !n.exams.some((e) => e.id === a.id)),
    "the dinner locks once, the day after the last peak": (p, n, a, m) =>
      a.t !== "lock" || p === n || (p.dinner === null && !!n.dinner && n.dinner.day === lastExam(p) + 1 && n.dinner.going.length === 1 && n.dinner.going[0] === m.user && n.exams === p.exams),
    "a locked dinner never moves": (p, n) => !p.dinner || (!!n.dinner && n.dinner.day === p.dinner.day),
    "going toggles only you": (p, n, a, m) => a.t !== "going" || p === n || (!!p.dinner && !!n.dinner && n.dinner.going.includes(m.user) !== p.dinner.going.includes(m.user) && n.dinner.going.filter((u) => u !== m.user).join() === p.dinner.going.filter((u) => u !== m.user).join()),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const mine = s.exams.filter((e) => e.who === u);
    const k = r.next();
    if (s.dinner) return k < 0.7 ? { t: "going" } : { t: "add", day: r.int(s.dinner.day + 1) };
    if (k < 0.45 || !mine.length) return { t: "add", day: r.int(s.days.length) };
    if (k < 0.7) return { t: "fear", id: r.pick(mine).id };
    if (k < 0.82) return { t: "drop", id: r.pick(mine).id };
    return { t: "lock" };
  },

  local: { day: -1, toast: 0 },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const n = s.days.length;
    const mine = s.exams.filter((e) => e.who === me);
    const dd = dinnerDay(s);
    // Default selection: the busiest-looking free day before the dinner, so the first tap is obvious.
    const free = [...Array(n).keys()].filter((d) => !s.exams.some((e) => e.who === me && e.day === d) && (!s.dinner || d < s.dinner.day) && d !== dd);
    const sel = local.day >= 0 && local.day < n ? local.day : (free[Math.min(free.length - 1, Math.floor(free.length * (s.exams.length ? 0.75 : 0.5)))] ?? -1);
    const selMine = mine.find((e) => e.day === sel);
    const W = theme.width - 2 * theme.space.card;
    const colW = (W - 16) / n;
    const people = [...new Map(s.exams.map((e) => [e.who, { id: e.who, name: e.name }])).values()];
    const quote = [...s.exams].filter((e) => e.said).sort((a, b) => b.fear - a.fear)[0];
    const latest = [...s.exams].sort((a, b) => b.at - a.at)[0];
    const label = s.exams.length
      ? `Two weeks as mountains: ${s.exams.map((e) => `${e.name} ${e.course} on ${s.days[e.day]}, scare ${e.fear} of 5`).join("; ")}${dd >= 0 ? `. Everyone's done by ${s.days[dd]}` : ""}`
      : `Two weeks of finals, no exams posted yet`;
    const canAdd = sel >= 0 && !selMine && (!s.dinner || sel < s.dinner.day) && sel !== dd;
    const going = s.dinner?.going.includes(me) ?? false;

    // Faces at the foot of each peak (one per person per day).
    const faces = s.exams.map((e) => {
      const x = 8 + (e.day + 0.5) * colW;
      return (
        <span key={e.id} style={{ position: "absolute", left: x - 9, top: BASE - 22, pointerEvents: "none", display: "flex", borderRadius: 99, boxShadow: e.who === me ? `0 0 0 2px ${c.primary}` : `0 0 0 1.5px ${c.card}` }}>
          <Avatar user={{ id: e.who, name: e.name }} size={18} />
        </span>
      );
    });

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub || `${n} days of finals`} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas
            height={CH}
            label={label}
            draw={(g, f) => drawRange(g, f, s, me, sel)}
            onPointer={(e) => {
              if (e.type !== "up") return;
              const d = Math.floor((e.x - 8) / colW);
              if (d >= 0 && d < n) setLocal({ day: d });
            }}
          />
          {faces}
          {dd >= 0 ? (
            <span style={{ position: "absolute", left: Math.min(W - 92, Math.max(0, 8 + (dd + 0.5) * colW - 46)), top: 6, width: 92, textAlign: "center", fontSize: 11, lineHeight: "13px", fontWeight: 700, color: c.text, background: c.card, borderRadius: 6, padding: "3px 4px", ...ell }}>
              {s.dinner ? "Dinner's on" : "All done"}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {latest && latest.at > 0 ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`${latest.who === me ? "You" : first(latest.name)} · ${latest.course} on ${s.days[latest.day]} · scare ${latest.fear} of 5`}</span>
          ) : quote ? (
            <>
              <Avatar user={{ id: quote.who, name: quote.name }} size={20} />
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{`${first(quote.name)}, ${quote.course}`}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Tap a day, then add your exam. The scarier, the taller.</span>
          )}
        </div>
        {s.dinner ? (
          <div style={{ marginTop: 4 }}>
            <Locked detail={`${s.days[s.dinner.day]}${s.time ? ` · ${s.time}` : ""} · ${s.place}`}>{`End of finals dinner · ${s.dinner.going.length} going`}</Locked>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex" }}>
                <Facepile users={s.dinner.going} max={6} size={22} />
              </span>
              <Button kind={going ? "secondary" : "primary"} onClick={() => { haptic("light"); dispatch({ t: "going" }); }}>
                {going ? "Can't make it" : "I'm going"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, minWidth: 0 }}>
              {people.length ? <Facepile users={people} max={6} size={20} /> : null}
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>
                {s.exams.length ? (dd >= 0 ? `${people.length} posted · all done ${s.days[dd]}` : `${people.length} posted · finals run to the end`) : "Nobody's posted yet"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {selMine ? (
                <>
                  <Button kind="secondary" wide onClick={() => { haptic("light"); dispatch({ t: "fear", id: selMine.id }); }}>
                    {selMine.fear === 5 ? "Less scary" : "Scarier"}
                  </Button>
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "drop", id: selMine.id })}>
                    Remove
                  </Button>
                </>
              ) : (
                <Button kind={mine.length ? "secondary" : "primary"} wide disabled={!canAdd} onClick={() => { haptic("light"); dispatch({ t: "add", day: sel }); }}>
                  {canAdd ? `Add exam ${s.days[sel]}` : "Pick a day"}
                </Button>
              )}
              {mine.length ? (
                <Button kind="primary" wide disabled={dd < 0} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "lock" }); }}>
                  Lock dinner
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>{`Dinner's on the calendar · ${s.place}`}</Toast> : null}
      </div>
    );
  },
});
