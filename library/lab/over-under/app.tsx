import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  haptic,
  mix,
  running,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// A friend sportsbook for tonight: each prop is a little card (a face, a joke, a sparkline, Over/Under
// or Yes/No with the points a 100 pt pick wins). Tapping a side puts 100 pts down, the line moves and
// the price flashes, the pick slides into your bet slip, you lock it, and later anyone calls what
// happened and the slip pays out. Points only.

type PropParam = {
  /** Who it is about: "Lily" */
  who: string;
  /** "Lily's arrival time" */
  title: string;
  /** The joke under the title: "Texted \"omw\" at 8:41. She was in the shower." */
  context: string;
  /** "line" is over/under a number or time, "call" is yes/no */
  kind: "line" | "call";
  /** The line: "9:15 PM", "12.5" (ignored for "call") */
  line: string;
  /** Short name for the ticker and slip: "Lily 9:15" */
  short: string;
  /** How likely side 0 (Over or Yes) is, in thousandths, 120 to 880 */
  lean: number;
  /** Earlier values of lean, up to 11 */
  trend: number[];
};
type Params = {
  title: string;
  /** The occasion: "Ana's bday" */
  sub: string;
  /** 1 to 3 props */
  props: PropParam[];
  /** Earlier bets for the ticker: who, which prop, side 0 or 1, points */
  book: { who: string; prop: number; side: 0 | 1; pts: number }[];
};

// @params
const P: Params = {
  title: "The girlies book", sub: "Ana's bday",
  props: [
    { who: "Lily", title: "Lily's arrival time", context: "Texted \"omw\" at 8:41. She was in the shower.", kind: "line", line: "9:15 PM", short: "Lily 9:15",
      lean: 720, trend: [500, 520, 510, 550, 540, 570, 580, 650, 632, 720, 685] },
    { who: "Ana", title: "Ana says \"literally\"", context: "It's her bday. She's already emotional.", kind: "line", line: "12.5", short: "Ana lit 12.5",
      lean: 710, trend: [550, 580, 600, 590, 620, 610, 640, 675, 640, 675, 728] },
    { who: "Maya", title: "Maya's \"just one drink\"", context: "Historically: never one. Never.", kind: "line", line: "3.5", short: "Maya 3.5",
      lean: 763, trend: [620, 660, 650, 680, 700, 690, 710, 763, 798, 728] },
  ],
  book: [ { who: "Sam", prop: 1, side: 1, pts: 100 }, { who: "Jess", prop: 2, side: 0, pts: 50 },
    { who: "Priya", prop: 0, side: 0, pts: 200 }, { who: "Zoe", prop: 1, side: 0, pts: 100 }, { who: "Lily", prop: 2, side: 0, pts: 150 },
    { who: "Ana", prop: 0, side: 1, pts: 50 }, { who: "Maya", prop: 1, side: 1, pts: 100 }, { who: "Priya", prop: 2, side: 0, pts: 100 },
    { who: "Zoe", prop: 0, side: 0, pts: 250 }, { who: "Lily", prop: 1, side: 0, pts: 100 }, { who: "Ana", prop: 2, side: 1, pts: 200 },
    { who: "Maya", prop: 0, side: 1, pts: 100 }, { who: "Priya", prop: 1, side: 0, pts: 150 }, { who: "Zoe", prop: 2, side: 0, pts: 100 },
    { who: "Ana", prop: 0, side: 0, pts: 100 }, { who: "Zoe", prop: 1, side: 1, pts: 50 } ],
};
// @end params

type Prop = {
  who: string;
  title: string;
  context: string;
  kind: "line" | "call";
  line: string;
  short: string;
  hist: number[];
  result: number;
  calledAt: number;
  flash: number;
  flashSide: number;
};
type Pick = { user: string; prop: number; side: number; pays: number; at: number };
type Tape = { user: string | null; name: string; prop: number; side: number; pts: number };
type State = { title: string; sub: string; props: Prop[]; picks: Pick[]; locked: string[]; tape: Tape[] };
type Action = { t: "pick"; prop: number; side: number } | { t: "lock" } | { t: "call"; prop: number; side: number };
type Local = { calling: boolean; toast: number };

const START = 1000;
const STAKE = 100;
const STEP = 35;
const LO = 120;
const HI = 880;
const slide = tween({ duration: 350, easing: [0.34, 1.56, 0.64, 1] });
const tint = tween({ duration: 400, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const clamp = (n: number) => Math.min(HI, Math.max(LO, n));
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const lean = (p: Prop) => p.hist[p.hist.length - 1] ?? 500;
const chance = (p: Prop, side: number) => (side === 0 ? lean(p) : 1000 - lean(p));
const pays = (pm: number) => Math.max(5, Math.round((20 * (1000 - pm)) / pm) * 5);
const sides = (kind: string) => (kind === "call" ? ["Yes", "No"] : ["Over", "Under"]);
const balance = (s: State, u: string) =>
  s.picks.reduce((b, k) => (k.user !== u ? b : b - STAKE + (s.props[k.prop]?.result === k.side ? STAKE + k.pays : 0)), START);
const finished = (s: State) => s.props.every((p) => p.result !== -1);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sideOk = (v: unknown) => v === 0 || v === 1;
const propOk = (s: State, v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < s.props.length;
const delta = (side: number, mode: "add" | "switch" | "remove") => {
  const sign = side === 0 ? 1 : -1;
  return mode === "switch" ? 2 * STEP * sign : mode === "remove" ? -STEP * sign : STEP * sign;
};

function initState(): State {
  const props: Prop[] = [];
  for (const raw of P.props) {
    if (props.length >= 3) break;
    const title = clean(raw.title, 40);
    if (!title) continue;
    const l = Number.isFinite(raw.lean) ? clamp(Math.round(raw.lean)) : 500;
    const trend = (Array.isArray(raw.trend) ? raw.trend : []).filter((v) => Number.isFinite(v)).map((v) => clamp(Math.round(v))).slice(-11);
    props.push({
      who: clean(raw.who, 20),
      title,
      context: clean(raw.context, 70),
      kind: raw.kind === "call" ? "call" : "line",
      line: clean(raw.line, 10),
      short: clean(raw.short, 16) || title.slice(0, 16),
      hist: [...trend, l],
      result: -1,
      calledAt: 0,
      flash: 0,
      flashSide: 0,
    });
  }
  if (!props.length) props.push({ who: "", title: "Over or under", context: "Add a line from the chat to bet on.", kind: "line", line: "?", short: "The line", hist: [500], result: -1, calledAt: 0, flash: 0, flashSide: 0 });
  const tape: Tape[] = [];
  for (const b of P.book) {
    if (!Number.isInteger(b.prop) || b.prop < 0 || b.prop >= props.length || !sideOk(b.side) || !Number.isInteger(b.pts) || b.pts < 1 || b.pts > 1000) continue;
    tape.push({ user: null, name: clean(b.who, 16), prop: b.prop, side: b.side, pts: b.pts });
  }
  return { title: clean(P.title, 40) || "The book", sub: clean(P.sub, 30), props, picks: [], locked: [], tape: tape.slice(-20) };
}

const nameFor = (members: readonly Member[], id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
const wordFor = (s: State, t: Tape) => (sides(s.props[t.prop]?.kind ?? "line")[t.side] ?? "over").toLowerCase();

function leader(s: State, members: readonly Member[]) {
  let best: { id: string; name: string; net: number } | null = null;
  for (const m of members) {
    const net = balance(s, m.id) - START;
    if (best === null || net > best.net) best = { id: m.id, name: m.name, net };
  }
  return best;
}

function drawTicker(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, members: readonly Member[]) {
  const t = f.theme;
  const c = t.color;
  const W = f.width;
  g.beginPath();
  g.roundRect(0, 0, W, 20, 10);
  g.fillStyle = c.wash;
  g.fill();
  g.beginPath();
  g.arc(12, 10, 3.5, 0, 2 * Math.PI);
  g.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(f.now / 250));
  g.fillStyle = c.negative;
  g.fill();
  g.globalAlpha = 1;
  g.save();
  g.beginPath();
  g.rect(22, 0, W - 30, 20);
  g.clip();
  const line =
    s.tape
      .slice(-6)
      .reverse()
      .map((e) => `${e.user === me ? "You" : e.user ? nameFor(members, e.user) : e.name} ${e.pts} on ${wordFor(s, e)} · ${s.props[e.prop]?.short ?? ""}`)
      .join("   ·   ") + "   ·   ";
  g.font = `400 13px ${t.type.family}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = c.text;
  const lw = Math.max(60, g.measureText(line).width);
  if (s.tape.length) {
    const x0 = 22 - ((f.now * 0.038) % lw);
    for (let k = 0; k < 3; k++) g.fillText(line, x0 + k * lw, 10.5);
  } else {
    g.fillStyle = c.secondaryText;
    g.fillText("No bets yet", 22, 10.5);
  }
  g.restore();
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Over/under book",
  summary: (s, ctx) => {
    const called = s.props.filter((p) => p.result !== -1).length;
    if (finished(s)) {
      const l = leader(s, ctx.members);
      return l && l.net > 0 ? `${s.title}: all called · ${l.name} up ${l.net}` : `${s.title}: all called · the house won`;
    }
    if (called > 0) return `${s.title}: ${called} of ${s.props.length} called`;
    if (s.picks.length) return `${s.title}: ${s.picks.length} picks from ${new Set(s.picks.map((p) => p.user)).size} people`;
    return `${s.title}: ${s.props.length} props, no picks yet`;
  },

  init: () => initState(),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "pick") {
      if (!propOk(s, a.prop) || !sideOk(a.side)) return s;
      const pr = s.props[a.prop]!;
      if (pr.result !== -1 || s.locked.includes(u)) return s;
      const at = s.picks.findIndex((k) => k.user === u && k.prop === a.prop);
      const old = at >= 0 ? s.picks[at]! : null;
      let picks: Pick[];
      let d: number;
      let bet = true;
      if (old && old.side === a.side) {
        picks = s.picks.filter((_, i) => i !== at);
        d = delta(a.side, "remove");
        bet = false;
      } else if (old) {
        picks = s.picks.map((k, i) => (i === at ? { user: u, prop: a.prop, side: a.side, pays: pays(chance(pr, a.side)), at: meta.time } : k));
        d = delta(a.side, "switch");
      } else {
        picks = [...s.picks, { user: u, prop: a.prop, side: a.side, pays: pays(chance(pr, a.side)), at: meta.time }];
        d = delta(a.side, "add");
      }
      const props = s.props.map((p, i) => (i === a.prop ? { ...p, hist: [...p.hist, clamp(lean(p) + d)].slice(-12), flash: meta.time, flashSide: d > 0 ? 0 : 1 } : p));
      const name = ctx.members.find((m) => m.id === u)?.name ?? "";
      const tape = bet ? [...s.tape, { user: u, name, prop: a.prop, side: a.side, pts: STAKE }].slice(-20) : s.tape;
      return { ...s, props, picks, tape };
    }
    if (a.t === "lock") {
      if (s.locked.includes(u) || !s.picks.some((k) => k.user === u)) return s;
      return { ...s, locked: [...s.locked, u] };
    }
    if (a.t === "call") {
      if (!propOk(s, a.prop) || !sideOk(a.side)) return s;
      if (s.props[a.prop]!.result !== -1) return s;
      return { ...s, props: s.props.map((p, i) => (i === a.prop ? { ...p, result: a.side, calledAt: meta.time } : p)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !inChat(ctx, u);
    if (!s.picks.some((k) => gone(k.user)) && !s.locked.some(gone) && !s.tape.some((e) => e.user !== null && gone(e.user))) return s;
    return {
      ...s,
      picks: s.picks.filter((k) => !gone(k.user)),
      locked: s.locked.filter((u) => !gone(u)),
      tape: s.tape.map((e) => (e.user !== null && gone(e.user) ? { ...e, user: null } : e)),
    };
  },

  invariants: {
    "one pick per person per prop": (s) => new Set(s.picks.map((p) => p.user + "|" + p.prop)).size === s.picks.length,
    "picks are on real props at a fair price": (s) =>
      s.picks.every((k) => Number.isInteger(k.prop) && k.prop >= 0 && k.prop < s.props.length && (k.side === 0 || k.side === 1) && k.pays % 5 === 0 && k.pays >= 15 && k.pays <= 735),
    "pickers and lockers are in the chat": (s, ctx) =>
      s.picks.every((k) => ctx.members.some((m) => m.id === k.user)) && s.locked.every((u) => ctx.members.some((m) => m.id === u)) && new Set(s.locked).size === s.locked.length,
    "a locked slip has picks": (s) => s.locked.every((u) => s.picks.some((k) => k.user === u)),
    "lines stay on the board": (s) => s.props.every((p) => p.hist.length >= 1 && p.hist.length <= 12 && p.hist.every((v) => Number.isInteger(v) && v >= 120 && v <= 880)),
    "a result exists exactly when called": (s) => s.props.every((p) => (p.result === -1) === (p.calledAt === 0)),
    "nobody goes below zero": (s, ctx) => ctx.members.every((m) => s.picks.reduce((b, k) => (k.user !== m.id ? b : b - 100 + (s.props[k.prop]?.result === k.side ? 100 + k.pays : 0)), 1000) >= 1000 - 100 * s.props.length),
    "tape is short": (s) => s.tape.length <= 20,
  },

  transitions: {
    "a pick moves only the picker's pick on that prop": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const keep = (s: State) => s.picks.filter((k) => !(k.user === m.user && k.prop === a.prop));
      return same(keep(p), keep(n));
    },
    "nobody bets on a called prop or a locked slip": (p, n, a, m) => a.t !== "pick" || p === n || (p.props[a.prop]!.result === -1 && !p.locked.includes(m.user)),
    "the line moves the way the pick says": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const old = p.picks.find((k) => k.user === m.user && k.prop === a.prop);
      const sign = a.side === 0 ? 1 : -1;
      const d = old === undefined ? STEP * sign : old.side === a.side ? -STEP * sign : 2 * STEP * sign;
      const was = p.props[a.prop]!.hist[p.props[a.prop]!.hist.length - 1]!;
      const now = n.props[a.prop]!.hist[n.props[a.prop]!.hist.length - 1]!;
      return now === Math.min(880, Math.max(120, was + d));
    },
    "a pick is priced before it moves the line": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const old = p.picks.find((k) => k.user === m.user && k.prop === a.prop);
      if (old && old.side === a.side) return !n.picks.some((k) => k.user === m.user && k.prop === a.prop);
      const mine = n.picks.find((k) => k.user === m.user && k.prop === a.prop);
      const pr = p.props[a.prop]!;
      const pm = a.side === 0 ? pr.hist[pr.hist.length - 1]! : 1000 - pr.hist[pr.hist.length - 1]!;
      return !!mine && mine.pays === Math.max(5, Math.round((20 * (1000 - pm)) / pm) * 5) && mine.at === m.time;
    },
    "locking adds only the locker": (p, n, a, m) =>
      a.t !== "lock" || p === n || (n.locked.length === p.locked.length + 1 && n.locked[n.locked.length - 1] === m.user && same(n.picks, p.picks)),
    "locked slips never change": (p, n, _a, _m, ctx) => p.locked.every((u) => !ctx.members.some((x) => x.id === u) || same(p.picks.filter((k) => k.user === u), n.picks.filter((k) => k.user === u))),
    "a call sets one result, once": (p, n, a, m) =>
      a.t !== "call" ||
      p === n ||
      (p.props[a.prop]!.result === -1 &&
        n.props[a.prop]!.result === a.side &&
        n.props[a.prop]!.calledAt === m.time &&
        same(n.picks, p.picks) &&
        same(n.props.filter((_, i) => i !== a.prop), p.props.filter((_, i) => i !== a.prop))),
    "results never change once called": (p, n) => p.props.every((pr, i) => pr.result === -1 || n.props[i]?.result === pr.result),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const open = s.props.map((p, i) => (p.result === -1 ? i : -1)).filter((i) => i >= 0);
    if (!open.length) return { t: "pick", prop: 0, side: r.int(2) };
    if (s.locked.includes(user)) return r.next() < 0.5 ? { t: "call", prop: r.pick(open), side: r.int(2) } : { t: "lock" };
    const k = r.next();
    if (k < 0.7) return { t: "pick", prop: r.pick(open), side: r.int(2) };
    if (k < 0.85) return { t: "lock" };
    return { t: "call", prop: r.pick(open), side: r.int(2) };
  },

  local: { calling: false, toast: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const bw = Math.min(132, Math.max(96, Math.floor((W - 132) / 2)));
    const narrow = theme.width < 360;
    const done = finished(state);
    const mine = state.picks.filter((k) => k.user === me);
    const lockedMe = state.locked.includes(me);
    const anyCall = state.props.some((p) => p.kind === "call");
    const open = state.props.some((p) => p.result === -1);
    const bal = balance(state, me);
    const calling = local.calling && open;
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const faceOf = (who: string) => members.find((m) => m.id === who || m.name.toLowerCase() === who.toLowerCase());

    const card = (p: Prop, i: number) => {
      const cp = confirmed.props[i] ?? p;
      const face = p.who ? faceOf(p.who) : undefined;
      const names = sides(p.kind);
      const myPick = mine.find((k) => k.prop === i);
      const calledP = p.result !== -1;
      const tintK = calledP ? tint(running(p.calledAt, 400) ?? 400) : 0;
      const e = running(cp.flash, 1000);
      const kf = e === null ? 1 : e / 1000;
      const spark = p.hist.slice(-12);
      const pts = spark
        .map((v, k) => `${(spark.length > 1 ? (62 * k) / (spark.length - 1) : 61).toFixed(1)},${(20 - 20 * Math.min(1, Math.max(0, (v - 350) / 550))).toFixed(1)}`)
        .join(" ");
      const end = pts.split(" ").pop()!.split(",");
      const mid = lean(p) >= 600 ? "Likely" : lean(p) <= 400 ? "Long shot" : "Toss-up";

      const side = (sd: number) => {
        const price = pays(chance(p, sd));
        const picked = myPick?.side === sd;
        const hit = calledP && p.result === sd;
        const miss = calledP && p.result !== sd;
        const flashing = !picked && !calledP && e !== null;
        const up = cp.flashSide === sd;
        const fill = picked && !calledP;
        const priceColor = fill ? c.onPrimary : flashing ? mix(up ? c.negative : c.positive, c.text, kf) : miss ? c.secondaryText : c.text;
        let bg = fill ? c.primary : c.card;
        if (hit) bg = mix(c.card, c.positive, 0.22 * tintK);
        if (miss) bg = mix(c.card, c.wash, 0.6 * tintK);
        const ink = fill ? c.onPrimary : miss ? c.secondaryText : c.text;
        const label = `${names[sd]}${p.kind === "line" && p.line ? " " + p.line : ""}${p.kind === "call" ? ", " + p.title : ""}, wins ${price}`;
        const act = calling && !calledP ? () => { dispatch({ t: "call", prop: i, side: sd }); setLocal({ calling: false }); } : !calledP && !lockedMe ? () => dispatch({ t: "pick", prop: i, side: sd }) : null;
        return (
          <button
            key={sd}
            type="button"
            aria-pressed={picked}
            aria-label={label}
            {...(act ? { onClick: act } : {})}
            style={{
              position: "absolute",
              top: 40,
              [sd === 0 ? "left" : "right"]: 8,
              width: bw,
              height: 44,
              padding: "7px 0",
              border: "none",
              background: "none",
              font: "inherit",
              cursor: act ? "pointer" : "default",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 30,
                boxSizing: "border-box",
                gap: 4,
                padding: narrow ? "0 7px" : "0 10px",
                borderRadius: 8,
                background: bg,
                color: ink,
                border: calling && !calledP ? `1.5px dashed ${c.primary}` : "none",
                boxShadow: calledP && picked ? `inset 0 0 0 2px ${c.primary}` : "none",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: narrow ? 13 : 14, fontWeight: 600 }}>{names[sd]}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: calledP || narrow ? 13 : 15, fontWeight: 600, color: calling && !calledP ? ink : priceColor }}>
                {flashing ? (
                  <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true" style={{ opacity: 1 - kf }}>
                    <path d={up ? "M0 6 4 0 8 6Z" : "M0 0 8 0 4 6Z"} fill={priceColor} />
                  </svg>
                ) : null}
                {calledP ? (hit ? "Hit" : "Miss") : calling ? "" : `+${price}`}
              </span>
            </span>
          </button>
        );
      };

      return (
        <div key={i} style={{ position: "relative", height: 84, marginTop: i === 0 ? 0 : 6, background: c.wash, borderRadius: 12 }}>
          {face ? (
            <span style={{ position: "absolute", left: 10, top: 8, display: "flex" }}>
              <Avatar user={face} size={20} />
            </span>
          ) : p.who ? (
            <span
              aria-hidden="true"
              style={{ position: "absolute", left: 10, top: 8, width: 20, height: 20, borderRadius: 10, background: userColor(p.who, theme), color: c.onPrimary, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {p.who[0]!.toUpperCase()}
            </span>
          ) : null}
          <div style={{ position: "absolute", left: p.who ? 36 : 10, top: 8, right: 84, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{p.title}</div>
          <svg width="62" height="20" viewBox="0 0 62 20" role="img" aria-label={`${p.title} trend`} style={{ position: "absolute", right: 12, top: 8, overflow: "visible" }}>
            <polyline points={pts} fill="none" stroke={c.positive} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
            <circle cx={end[0]} cy={end[1]} r="3" fill={c.positive} />
          </svg>
          <div style={{ position: "absolute", left: 10, right: 10, top: 29, fontSize: 13, lineHeight: "16px", color: calling && !calledP ? c.link : c.secondaryText, fontWeight: calling && !calledP ? 600 : 400, ...ell }}>
            {calling && !calledP ? "Tap what happened" : p.context}
          </div>
          <div style={{ position: "absolute", left: 8 + bw, right: 8 + bw, top: 47, height: 30, textAlign: "center", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, fontSize: 11, lineHeight: "13px", color: c.secondaryText }}>{calledP ? "Called" : p.kind === "call" ? "Yes or no" : "O/U"}</div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 13, fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.text, ...ell }}>{p.kind === "call" ? mid : p.line}</div>
          </div>
          {side(0)}
          {side(1)}
        </div>
      );
    };

    const rowFor = (k: Pick, n: number) => {
      const pr = state.props[k.prop]!;
      const e = running(k.at, 350);
      const q = e === null ? 1 : slide(e);
      const called = pr.result !== -1;
      const won = called && pr.result === k.side;
      return (
        <div
          key={`${k.prop}-${n}`}
          style={{ display: "flex", justifyContent: "space-between", height: 18, fontSize: 13, lineHeight: "18px", gap: 8, transform: `translateX(${40 * (1 - q)}px)`, opacity: Math.min(1, q) }}
        >
          <span style={{ color: c.text, minWidth: 0, ...ell }}>{`${pr.short} · ${sides(pr.kind)[k.side]!.toLowerCase()}`}</span>
          <span style={{ flex: "none", color: called && !won ? c.secondaryText : mix(c.positive, c.text, 0.3) }}>{called ? (won ? `Won ${k.pays}` : `Lost ${STAKE}`) : `+${k.pays}`}</span>
        </div>
      );
    };

    let slip;
    if (done) {
      const l = leader(state, members);
      const text = state.picks.length === 0 ? "Nobody bet on this one" : l && l.net > 0 ? `${l.name} cleaned up · +${l.net}` : "The house won tonight";
      slip = (
        <div style={{ marginTop: 6, height: 44, borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", gap: 10, padding: "0 10px" }}>
          {l && l.net > 0 && state.picks.length ? <Avatar user={l.id} size={24} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: c.text, ...ell }}>{text}</span>
          <span style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>{`You: ${bal}`}</span>
        </div>
      );
    } else if (mine.length) {
      const live = mine.filter((k) => state.props[k.prop]!.result === -1);
      const risk = STAKE * live.length;
      const back = live.reduce((a, k) => a + STAKE + k.pays, 0);
      slip = (
        <div style={{ marginTop: 6, borderRadius: 12, background: c.wash, padding: "0 10px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, borderBottom: `1px solid ${c.divider}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.text, ...ell }}>{`Bet slip · ${mine.length} ${mine.length === 1 ? "pick" : "picks"}`}</div>
              <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ell }}>{`Risk ${risk} · returns ${back}`}</div>
            </div>
            {open ? (
              <Button kind="deemphasized" onClick={() => setLocal({ calling: !local.calling })}>
                {calling ? "Cancel" : "Call it"}
              </Button>
            ) : null}
            {lockedMe ? (
              <Button kind="secondary" disabled>
                Locked
              </Button>
            ) : (
              <Button
                kind="primary"
                onClick={() => {
                  haptic("success");
                  setLocal({ toast: local.toast + 1 });
                  dispatch({ t: "lock" });
                }}
              >
                Lock it
              </Button>
            )}
          </div>
          <div style={{ paddingTop: 6 }}>{mine.map(rowFor)}</div>
        </div>
      );
    } else {
      slip = (
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{anyCall ? "Tap a side · 100 pts a pick" : "Tap over or under · 100 pts a pick"}</span>
          {open ? (
            <Button kind="deemphasized" onClick={() => setLocal({ calling: !local.calling })}>
              {calling ? "Cancel" : "Call it"}
            </Button>
          ) : null}
        </div>
      );
    }

    const sub = done ? `you ended on ${bal} pts` : `${bal} pts to play`;
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub ? `${state.sub} · ${sub}` : sub} />
        {state.props.map(card)}
        <div style={{ marginTop: 6 }}>
          <Canvas height={20} label="Latest bets" draw={(g, f) => drawTicker(g, f, confirmed, me, members)} />
        </div>
        {slip}
        {local.toast > 0 && lockedMe ? <Toast key={local.toast}>You're in. Good luck.</Toast> : null}
      </div>
    );
  },
});
