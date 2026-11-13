import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  More,
  Progress,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Child,
} from "@muse/app";

// A birthday post becomes one card the friends sign by hand around a drawn cake, plus a gift pot
// that fills toward one present. When the pot fills, the lid pops.

type Params = {
  /** The birthday person's name */
  who: string;
  /** The card's greeting as the group wrote it */
  heading: string;
  /** 1 to 3 digits on the cake, e.g. "22" */
  candles: string;
  /** When it goes to them, e.g. "at 8pm" */
  when: string;
  /** Notes signed already, in order */
  notes: { by: string; text: string }[];
  /** 3 note suggestions to tap */
  lines: string[];
  /** The present: name, goal in cents and who orders it */
  gift: { name: string; goalCents: number; buyer: string };
  /** Money already in, in cents */
  pot: { by: string; cents: number }[];
  /** 2 chip-in amounts in cents */
  amounts: number[];
};

// @params
const P: Params = {
  who: "Priya",
  heading: "Happy 22nd, Priya!",
  candles: "22",
  when: "at 8pm",
  notes: [
    { by: "Maya", text: "22 & thriving!!" },
    { by: "Leo", text: "u still owe me boba" },
    { by: "Ava", text: "best roomie ever" },
    { by: "Dev", text: "HBD from chem lab" },
    { by: "Zoe", text: "karaoke tonight!!" },
    { by: "Kai", text: "happy bday legend" },
  ],
  lines: ["happy 22nd!! love u", "dinner's on me fri", "u never age, rude"],
  gift: { name: "Polaroid Go + film", goalCents: 15000, buyer: "Maya" },
  pot: [
    { by: "Maya", cents: 2500 },
    { by: "Ava", cents: 2000 },
    { by: "Leo", cents: 2000 },
    { by: "Kai", cents: 1500 },
    { by: "Dev", cents: 1000 },
  ],
  amounts: [1000, 2000],
};
// @end params

type Note = { by: string; user: string | null; text: string; at: number };
type Chip = { by: string; user: string | null; cents: number; at: number };
type State = {
  who: string;
  whoUser: string | null;
  heading: string;
  candles: string;
  when: string;
  lines: string[];
  notes: Note[];
  gift: string;
  goal: number;
  buyer: string;
  chips: Chip[];
  amounts: number[];
  fundedAt: number;
};
type Action = { t: "sign"; text: string } | { t: "chip"; cents: number };
type Local = Record<string, never>;

const MAX_NOTES = 12;
const SHOWN_NOTES = 6;
const NOTE_LEN = 28;
const TYPE_MS = 1100;
const POP_MS = 350;
const FACE_MS = 400;
const COUNT_MS = 400;
const OPEN_MS = 700;
const LIT_MS = 600;
const TOAST_MS = 2400;
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const CARD_H = 180;
const POT_H = 100;
const counter = tween({ duration: COUNT_MS, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const total = (s: State) => s.chips.reduce((n, c) => n + c.cents, 0);
const left = (s: State) => s.goal - total(s);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const matches = (m: Member, by: string) => m.id === by || m.name.trim().toLowerCase() === by.trim().toLowerCase();
const h01 = (x: number) => Math.abs((Math.sin(x * 12.9898) * 43758.547) % 1);
const easeOutBack = (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const noteOf = (s: State, user: string) => s.notes.find((n) => n.user === user);
const key = (x: { user: string | null; by: string }) => x.user ?? x.by;

function initState(ctx: Ctx): State {
  const who = clean(P.who, 20) || "Someone";
  const whoUser = ctx.members.find((m) => matches(m, who))?.id ?? null;
  const goal = int(P.gift?.goalCents, 500, 500000, 15000);
  const notes: Note[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(P.notes) ? P.notes : []) {
    if (notes.length >= MAX_NOTES) break;
    const by = clean(raw?.by, 16);
    const text = clean(raw?.text, NOTE_LEN);
    if (!by || !text) continue;
    const m = ctx.members.find((x) => matches(x, by));
    if (m?.id === whoUser || by.toLowerCase() === who.toLowerCase()) continue;
    const k = m ? m.id : by.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    notes.push({ by, user: m?.id ?? null, text, at: 0 });
  }
  const chips: Chip[] = [];
  let sum = 0;
  for (const raw of Array.isArray(P.pot) ? P.pot : []) {
    const by = clean(raw?.by, 16);
    const room = goal - 1 - sum;
    if (!by || room <= 0 || !(typeof raw?.cents === "number" && Number.isInteger(raw.cents) && raw.cents > 0)) continue;
    const m = ctx.members.find((x) => matches(x, by));
    if (m?.id === whoUser || by.toLowerCase() === who.toLowerCase()) continue;
    const cents = Math.min(raw.cents, room);
    sum += cents;
    chips.push({ by, user: m?.id ?? null, cents, at: 0 });
  }
  const amounts = Array.isArray(P.amounts) && P.amounts.length >= 2 && P.amounts.slice(0, 2).every((a) => int(a, 100, goal, 0) > 0) ? P.amounts.slice(0, 2) : [1000, 2000];
  const lines = (Array.isArray(P.lines) ? P.lines : []).map((l) => clean(l, NOTE_LEN)).filter(Boolean).slice(0, 3);
  return {
    who,
    whoUser,
    heading: clean(P.heading, 32),
    candles: (typeof P.candles === "string" ? P.candles : "").replace(/\D/g, "").slice(0, 3),
    when: clean(P.when, 16),
    lines: lines.length ? lines : ["happy birthday"],
    notes,
    gift: clean(P.gift?.name, 28) || "A present",
    goal,
    buyer: clean(P.gift?.buyer, 16),
    chips,
    amounts,
    fundedAt: 0,
  };
}

type Ink = { text: string; color: string; x: number; y: number };
type Typed = { text: string; color: string; cx: number; y: number; width: number; at: number };

function drawCard(g: CanvasRenderingContext2D, f: DrawFrame, digits: string, lit: number, ox: number, wickY: number, notes: Ink[], colW: number, typed: Typed | null, nib: string) {
  const c = f.theme.color;
  g.textBaseline = "middle";
  g.textAlign = "center";
  for (const n of notes) {
    const fit = fitText(n.text, colW - 4, { g, size: 15, weight: 600, min: 11, family: HAND });
    g.font = fit.font;
    g.fillStyle = n.color;
    g.fillText(fit.text, n.x, n.y);
  }
  if (typed) {
    const fit = fitText(typed.text, typed.width, { g, size: 18, weight: 600, min: 11, family: HAND });
    g.font = fit.font;
    const full = g.measureText(fit.text).width;
    const e = f.now - typed.at;
    const k = typed.at > 0 && e < TYPE_MS ? Math.max(0, e / TYPE_MS) : 1;
    const shown = k >= 1 ? fit.text : fit.text.slice(0, Math.ceil(fit.text.length * k));
    const x0 = typed.cx - full / 2;
    g.textAlign = "left";
    g.fillStyle = typed.color;
    g.fillText(shown, x0, typed.y);
    if (k < 1) {
      const px = x0 + g.measureText(shown).width + 1;
      g.fillStyle = nib;
      g.beginPath();
      g.moveTo(px, typed.y + 8);
      g.lineTo(px + 5, typed.y - 6);
      g.lineTo(px + 10, typed.y - 3);
      g.closePath();
      g.fill();
    }
    g.textAlign = "center";
  }
  const t = f.now / 1000;
  const n = digits.length;
  const cx = f.width / 2;
  const flame: [number, number, number, number][] = [];
  g.fillStyle = c.series2;
  g.globalAlpha = 0.18 + 0.15 * lit;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * 24 + 0.8 * Math.sin(7 * t + i);
    const s = 5.5 * (1 + 0.15 * Math.sin(11 * t + 2 * i)) * (1 + lit * 0.5);
    const y = wickY - 9 - ox;
    flame.push([x, y, s, 1 + 0.1 * Math.sin(9 * t)]);
    g.moveTo(x + 2.2 * s, y);
    g.arc(x, y, 2.2 * s, 0, Math.PI * 2);
  }
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = c.series5;
  g.beginPath();
  for (const [x, y, s, fl] of flame) {
    g.moveTo(x, y - 1.1 * s * fl);
    g.bezierCurveTo(x + 0.15 * s, y - 0.55 * s, x + 0.6 * s, y - 0.35 * s, x + 0.6 * s, y + 0.2 * s);
    g.bezierCurveTo(x + 0.6 * s, y + 0.6 * s, x + 0.3 * s, y + 0.78 * s, x, y + 0.78 * s);
    g.bezierCurveTo(x - 0.3 * s, y + 0.78 * s, x - 0.6 * s, y + 0.6 * s, x - 0.6 * s, y + 0.2 * s);
    g.bezierCurveTo(x - 0.6 * s, y - 0.35 * s, x - 0.15 * s, y - 0.55 * s, x, y - 1.1 * s * fl);
    g.closePath();
  }
  g.fill();
  g.fillStyle = mix(c.series5, c.card, 0.5);
  g.beginPath();
  for (const [x, y, s] of flame) {
    g.moveTo(x + 0.3 * s, y + 0.25 * s);
    g.arc(x, y + 0.25 * s, 0.3 * s, 0, Math.PI * 2);
  }
  g.fill();
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Birthday card and gift pot",
  summary: (s) =>
    s.fundedAt > 0
      ? `${s.who}'s gift is funded · ${s.notes.length} signed · ${s.buyer || "Someone"}'s ordering tonight`
      : `${s.who}'s group card: ${s.notes.length} signed · ${money(total(s))} of ${money(s.goal)} for ${s.gift}`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    const me = ctx.members.find((m) => m.id === meta.user);
    if (!me || meta.user === state.whoUser) return state;
    const name = clean(me.name, 16) || "Friend";
    if (action.t === "sign") {
      if (typeof action.text !== "string") return state;
      const text = action.text.trim().slice(0, NOTE_LEN);
      if (!text || noteOf(state, meta.user)) return state;
      return { ...state, notes: [...state.notes, { by: name, user: meta.user, text, at: meta.time }] };
    }
    if (action.t === "chip") {
      if (state.fundedAt > 0 || typeof action.cents !== "number" || !state.amounts.includes(action.cents)) return state;
      const cents = Math.min(action.cents, left(state));
      if (cents <= 0) return state;
      const chips = [...state.chips, { by: name, user: meta.user, cents, at: meta.time }];
      const full = chips.reduce((n, c) => n + c.cents, 0) === state.goal;
      return { ...state, chips, fundedAt: full ? meta.time : 0 };
    }
    return state;
  },

  invariants: {
    "the pot never passes the goal": (s) => total(s) <= s.goal,
    "funded exactly when full": (s) => (s.fundedAt > 0) === (total(s) === s.goal),
    "one note per person": (s) => {
      const users = s.notes.map((n) => n.user).filter((u): u is string => u !== null);
      return new Set(users).size === users.length;
    },
    "notes are 1 to 28 characters": (s) => s.notes.every((n) => n.text.length >= 1 && n.text.length <= NOTE_LEN),
    "chips are whole positive cents": (s) => s.chips.every((c) => Number.isInteger(c.cents) && c.cents > 0),
    "the birthday person neither signs nor chips": (s) => s.whoUser === null || ![...s.notes, ...s.chips].some((x) => x.user === s.whoUser),
    "a note or chip time is never negative": (s) => s.notes.every((n) => n.at >= 0) && s.chips.every((c) => c.at >= 0),
  },

  transitions: {
    "a signature adds only the signer's note": (p, n, a, m) => {
      if (a.t !== "sign" || p === n) return true;
      const last = n.notes[n.notes.length - 1];
      return n.notes.length === p.notes.length + 1 && !!last && last.user === m.user && last.at === m.time && !p.notes.some((x) => x.user === m.user);
    },
    "a signature is the text sent": (p, n, a) => {
      if (a.t !== "sign" || p === n) return true;
      const last = n.notes[n.notes.length - 1];
      return !!last && typeof a.text === "string" && last.text === a.text.trim().slice(0, NOTE_LEN);
    },
    "a chip adds the actor's amount, cut to what is left": (p, n, a, m) => {
      if (a.t !== "chip" || p === n) return true;
      const last = n.chips[n.chips.length - 1];
      return p.amounts.includes(a.cents) && n.chips.length === p.chips.length + 1 && !!last && last.user === m.user && last.cents === Math.min(a.cents, p.goal - total(p));
    },
    "a chip lands while there is room": (p, n, a, m, ctx) => {
      if (a.t !== "chip" || !inChat(ctx, m.user) || m.user === p.whoUser) return true;
      return p.fundedAt > 0 || !p.amounts.includes(a.cents) || n.chips.length === p.chips.length + 1;
    },
    "the chip that fills it stamps the time": (p, n, a, m) => a.t !== "chip" || p === n || n.fundedAt === (total(n) === n.goal ? m.time : 0),
    "a funded pot takes no more": (p, n) => p.fundedAt === 0 || n.chips.length === p.chips.length,
    "nothing given is taken back": (p, n) =>
      p.notes.length <= n.notes.length &&
      p.chips.length <= n.chips.length &&
      p.notes.every((x, i) => same(x, n.notes[i])) &&
      p.chips.every((x, i) => same(x, n.chips[i])),
    "the card never changes": (p, n) =>
      p.who === n.who && p.whoUser === n.whoUser && p.heading === n.heading && p.candles === n.candles && p.goal === n.goal && p.gift === n.gift && same(p.amounts, n.amounts) && same(p.lines, n.lines),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!noteOf(s, user) && r.next() < 0.5) return { t: "sign", text: r.pick(s.lines) };
    if (r.next() < 1 / 15) return { t: "chip", cents: 777 };
    return { t: "chip", cents: r.pick(s.amounts) };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const person = (by: string, user: string | null): Member => (user ? members.find((m) => m.id === user) : undefined) ?? { id: user ?? `n:${by}`, name: by };
    const funded = state.fundedAt > 0;
    const birthday = state.whoUser !== null && me === state.whoUser;
    const mine = noteOf(state, me);
    const signedNow = !!mine;
    const sum = total(state);
    const toGo = left(state);
    const others = state.notes.filter((n) => n.user !== me);
    const shown = others.slice(-SHOWN_NOTES);
    const hidden = others.length - shown.length;
    const colW = Math.min(104, Math.floor((W - 96) / 2 - 8));
    const cardBg = mix(c.card, c.series2, 0.1);
    const dark = theme.mode === "dark";
    const ink = (col: string, light: number, deep = 0.7) => mix(col, c.text, dark ? deep : light);
    const hues = [c.series4, c.series2, c.series3, c.series1, c.series5, c.series6];
    const n = state.candles.length;
    const cx = W / 2;
    const cy = 98;

    // Time-driven bits, read only while something moves.
    const sinceFunded = funded ? running(state.fundedAt, TOAST_MS) : null;
    const openE = funded ? running(state.fundedAt, OPEN_MS) : null;
    const open = !funded ? 0 : openE === null ? 1 : Math.min(1, openE / OPEN_MS);
    const lit = !funded ? 0 : (() => { const e = running(state.fundedAt, LIT_MS); return e === null ? 1 : easeOutCubic(e / LIT_MS); })();
    const typeE = mine && mine.at > 0 ? running(mine.at, TYPE_MS + POP_MS) : null;
    const t = !signedNow && !birthday ? clock.value / 1000 : funded ? clock.value / 1000 : 0;
    const pulse = 0.5 + 0.5 * Math.sin(4 * t);

    // Card art.
    const art: Child[] = [];
    for (let k = 0; k < 14; k++) {
      const x = 10 + h01(1.3 * k) * (W - 20);
      const y0 = 8 + h01(5.9 * k) * 10;
      art.push(<circle key={`d${k}`} cx={x} cy={k % 2 ? CARD_H - y0 : y0} r={2} fill={hues[k % 6]} fill-opacity={0.7} />);
    }
    art.push(<rect key="plate" x={cx - 60} y={cy + 40 - 4} width={120} height={8} rx={4} fill={c.text} fill-opacity={0.15} />);
    const tier = (id: string, w: number, hgt: number, ty: number, fill: string, drips: number) => {
      const left0 = cx - w / 2;
      const top = ty - hgt / 2;
      const out: Child[] = [<rect key={`${id}f`} x={left0} y={top} width={w} height={hgt} rx={7} fill={fill} />];
      out.push(<rect key={`${id}b`} x={left0} y={top} width={w} height={4} rx={3} fill={c.card} />);
      for (let k = 0; k < drips; k++) {
        const x = left0 + 6 + (k * (w - 12)) / (drips - 1);
        out.push(<rect key={`${id}d${k}`} x={x - 3} y={top} width={6} height={7 + 5 * h01(k + w)} rx={3} fill={c.card} />);
      }
      return { out, left0, top };
    };
    const base = tier("base", 96, 30, cy + 22, mix(c.series4, c.card, 0.55), 8);
    art.push(...base.out);
    for (let k = 0; k < 10; k++) {
      const x = base.left0 + 8 + h01(3.1 * k) * 80;
      const y = base.top + 12 + h01(7.7 * k) * 12;
      art.push(<line key={`s${k}`} x1={x} y1={y} x2={x + 3} y2={y + 1.5} stroke={hues[k % 6]} stroke-width={2} stroke-linecap="round" />);
    }
    art.push(<rect key="baseo" x={base.left0} y={base.top} width={96} height={30} rx={7} fill="none" stroke={c.text} stroke-opacity={0.55} stroke-width={1.5} />);
    const top = tier("top", 70, 22, cy - 2, pal(theme).cream, 5);
    art.push(...top.out);
    art.push(<rect key="topo" x={top.left0} y={top.top} width={70} height={22} rx={7} fill="none" stroke={c.text} stroke-opacity={0.55} stroke-width={1.5} />);
    const wickY = cy - 26 - 15;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 24;
      art.push(<line key={`w${i}`} x1={x} y1={wickY} x2={x} y2={wickY - 4} stroke={c.text} stroke-width={1.5} stroke-linecap="round" />);
    }

    const heading = fitText(state.heading, W - 24, { size: 22, weight: 700, min: 12 });
    const digitHues = [c.series1, c.series5, c.series3];

    const slotXY = (i: number) => ({ x: i < 3 ? 12 : W - 12 - colW, y: 50 + (i % 3) * 42 });
    const inks: Ink[] = shown.map((nt, i) => {
      const p = slotXY(i);
      return { text: nt.text, color: ink(userColor(person(nt.by, nt.user), theme), 0.35), x: p.x + colW / 2, y: p.y + 10 };
    });
    const typed: Typed | null = mine ? { text: mine.text, color: ink(c.primary, 0.25, 0.7), cx, y: 149, width: Math.max(90, W - 2 * (12 + colW) - 4), at: mine.at } : null;
    const slot = (note: Note, i: number) => {
      const x = slotXY(i).x;
      const who = person(note.by, note.user);
      return (
        <div key={`n${i}-${note.by}`} style={{ position: "absolute", left: x, top: slotXY(i).y + 24, width: colW, textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 16 }}>
            <Avatar user={who} size={14} />
            <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: colW - 24 }}>{`— ${note.by}`}</span>
          </div>
        </div>
      );
    };

    // My spot.
    const spotW = Math.max(100, W - 2 * (12 + colW) + 8);
    const boxW = Math.min(150, Math.max(96, W - 2 * (12 + colW) + 16));
    let spot: Child;
    if (birthday) {
      spot = (
        <div style={{ position: "absolute", left: cx - boxW / 2, top: 147, width: boxW, height: 30, borderRadius: 10, border: `1.3px solid ${mix(cardBg, c.primary, 0.5)}`, background: mix(cardBg, c.primary, 0.12), boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: ink(c.primary, 0.45, 0.8) }}>
          {`For you, ${state.when}`}
        </div>
      );
    } else if (!mine) {
      spot = (
        <div style={{ position: "absolute", left: cx - boxW / 2, top: 147, width: boxW, height: 30, borderRadius: 10, border: `1.3px solid ${mix(cardBg, c.primary, 0.5 + 0.4 * pulse)}`, background: mix(cardBg, c.primary, 0.1 + 0.1 * pulse), boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: ink(c.primary, 0.45, 0.8) }}>
          Your spot
        </div>
      );
    } else {
      const pop = typeE === null ? 1 : typeE < TYPE_MS ? 0 : easeOutBack(Math.min(1, (typeE - TYPE_MS) / POP_MS));
      spot = (
        <>
          <div style={{ position: "absolute", left: cx - 34, top: 157, height: 20, display: "flex", alignItems: "center", gap: 6, transform: `scale(${pop})`, transformOrigin: "10px 10px" }}>
            <Avatar user={person(mine.by, mine.user)} size={20} />
            <span style={{ fontSize: 12, color: c.secondaryText, whiteSpace: "nowrap" }}>— you</span>
          </div>
        </>
      );
    }

    // Sign row.
    const pillW = (W - 12) / 3;
    const signers = state.notes.map((x) => person(x.by, x.user));
    const signRow =
      signedNow || birthday ? (
        <div style={{ height: 50, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Facepile users={signers} max={6} size={18} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {`${state.notes.length} signed · goes to ${state.who} ${state.when}${hidden > 0 ? ` · +${hidden}` : ""}`}
          </span>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.positive} stroke-width={2.5} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flex: "none" }}>
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
      ) : (
        <div style={{ height: 50 }}>
          <div style={{ fontSize: 13, lineHeight: "16px", height: 16, color: c.secondaryText }}>Sign the card · pick your line</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 2 }}>
            {state.lines.map((line, i) => {
              const fit = fitText(line, pillW - 16, { size: 13, min: 11 });
              return (
                <button
                  key={i}
                  type="button"
                  class="m-hit"
                  aria-label={line}
                  onClick={() => dispatch({ t: "sign", text: line })}
                  style={{ position: "relative", height: 32, borderRadius: 16, border: "none", padding: "0 8px", background: c.secondaryButton, color: c.text, fontSize: fit.size, whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}
                >
                  {fit.text}
                </button>
              );
            })}
          </div>
        </div>
      );

    // Pot.
    const tx = 74;
    const amounts = state.amounts.map((a) => Math.min(a, Math.max(toGo, 0)));
    const showButtons = !funded && !birthday;
    const btnW = showButtons ? textWidth(`+${money(amounts[0] ?? 0)}`, 15, 600) + textWidth(`+${money(amounts[1] ?? 0)}`, 15, 600) + 2 * 32 + 6 : 0;
    const lastChip = state.chips[state.chips.length - 1];
    const countK = lastChip && lastChip.at > 0 ? running(lastChip.at, COUNT_MS) : null;
    const shownSum = lastChip && countK !== null ? sum - lastChip.cents + lastChip.cents * counter(countK) : sum;
    const contributors: { id: string; by: string; user: string | null; at: number }[] = [];
    for (const ch of state.chips) if (!contributors.some((x) => x.id === key(ch))) contributors.push({ id: key(ch), by: ch.by, user: ch.user, at: ch.at });
    const rightEdge = W - 12;
    const facesRoom = rightEdge - (showButtons ? btnW + 8 : 0) - tx;
    const maxFaces = Math.max(1, Math.min(10, Math.floor(facesRoom / 15) - (contributors.length > 10 ? 2 : 0)));
    const faces = contributors.slice(0, maxFaces);
    const more = contributors.length - faces.length;
    const tagText = lastChip && lastChip.at > 0 && !funded ? `${lastChip.by} +${money(lastChip.cents)}` : "";
    const tagX = tx + faces.length * 15 + (more > 0 ? 24 : 0) + 8;
    const tagFits = tagText !== "" && tagX + textWidth(tagText, 13) <= rightEdge - (showButtons ? btnW + 8 : 0);
    const narrow = W < 340;
    const bottomText = funded
      ? `It's funded · ${state.buyer || "Someone"}'s ordering tonight`
      : contributors.length === 0
        ? `Nobody yet · ${money(toGo)} to go`
        : narrow
          ? `${money(toGo)} to go`
          : `${contributors.length} chipped in · ${money(toGo)} to go`;
    const bottomW = rightEdge - tx - (showButtons ? btnW + 8 : 0);
    const bottomFit = fitText(bottomText, bottomW, { size: 13, weight: funded ? 600 : 400, min: 11 });

    const lid = (() => {
      const lift = easeOutBack(open) * 18;
      const lx = 38 + 6 * open;
      const ly = 35 - lift;
      const deg = (-0.35 * open * 180) / Math.PI;
      return (
        <g transform={`translate(${lx} ${ly}) rotate(${deg})`}>
          <rect x={-27} y={-6} width={54} height={12} rx={2} fill={mix(c.series4, c.card, 0.15)} stroke={c.text} stroke-opacity={0.6} stroke-width={1.5} />
          <rect x={-4.5} y={-6} width={9} height={12} fill={c.series2} />
          <ellipse cx={-7} cy={-9} rx={7} ry={4.5} fill={c.series2} />
          <ellipse cx={7} cy={-9} rx={7} ry={4.5} fill={c.series2} />
          <circle cx={0} cy={-9} r={3.5} fill={mix(c.series2, c.text, 0.25)} />
        </g>
      );
    })();
    const sparks: Child[] = [];
    if (open > 0) {
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.35;
        const d = 20 + 18 * open + 3 * Math.sin(3 * t + k);
        const sx = 38 + Math.cos(a) * d;
        const sy = 39 + Math.sin(a) * d;
        const z = 3.5 * open;
        const q = z * 0.3;
        sparks.push(
          <polygon key={k} points={`${sx},${sy - z} ${sx + q},${sy - q} ${sx + z},${sy} ${sx + q},${sy + q} ${sx},${sy + z} ${sx - q},${sy + q} ${sx - z},${sy} ${sx - q},${sy - q}`} fill={hues[k % 6]} />,
        );
      }
    }

    return (
      <div>
        <CardHeader title={`${state.who}'s group card`} subtitle={`${state.notes.length} signed · pot ${money(sum)}`} />

        <div role="region" aria-label={`Card for ${state.who}: ${state.notes.length} signed`} style={{ position: "relative", height: CARD_H, borderRadius: 12, background: cardBg, overflow: "hidden" }}>
          <svg width={W} height={CARD_H} viewBox={`0 0 ${W} ${CARD_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
          </svg>
          <div style={{ position: "absolute", left: 12, right: 12, top: 8, height: 32, lineHeight: "32px", textAlign: "center", fontSize: heading.size, fontWeight: 700, color: ink(c.primary, 0, 0.6), whiteSpace: "nowrap" }}>{heading.text}</div>
          <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: CARD_H, pointerEvents: "none" }}>
            <Canvas height={CARD_H} label={`Candles, and notes: ${shown.map((x) => `${x.by} wrote ${x.text}`).join(", ")}`} draw={(g, f) => drawCard(g, f, state.candles, lit, 0, wickY, inks, colW, typed, c.text)} />
          </div>
          {state.candles.split("").map((d, i) => (
            <div key={i} style={{ position: "absolute", left: cx + (i - (n - 1) / 2) * 24 - 12, width: 24, top: cy - 26 - 17, height: 34, textAlign: "center", fontSize: 26, fontWeight: 700, lineHeight: "34px", color: ink(digitHues[i % 3]!, 0.25, 0.6) }}>
              {d}
            </div>
          ))}
          {shown.map((nt, i) => slot(nt, i))}
          {spot}
        </div>

        <div style={{ marginTop: 8 }}>{signRow}</div>

        <div style={{ position: "relative", marginTop: 8, height: POT_H, borderRadius: 12, background: c.wash, border: `1px solid ${c.divider}`, boxSizing: "border-box" }}>
          <svg width={76} height={POT_H} viewBox={`0 0 76 ${POT_H}`} role="img" aria-label={`Gift pot, ${money(sum)} of ${money(state.goal)}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={15} y={39} width={46} height={34} rx={5} fill={c.series4} />
            <rect x={33.5} y={39} width={9} height={34} fill={c.series2} />
            <rect x={15} y={39} width={46} height={34} rx={5} fill="none" stroke={c.text} stroke-opacity={0.6} stroke-width={1.5} />
            {lid}
            {sparks}
          </svg>
          {funded && sinceFunded !== null ? (
            <div style={{ position: "absolute", left: 38, top: 40, pointerEvents: "none" }}>
              <Burst key={state.fundedAt} emoji="🎉" />
            </div>
          ) : null}
          <div style={{ position: "absolute", left: tx, top: 6, height: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Gift pot</div>
          <div style={{ position: "absolute", left: tx, right: 12, top: 22, height: 22, display: "flex", alignItems: "center", gap: 8, minWidth: 0, marginRight: 0 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "22px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.gift}</span>
            <span style={{ flex: "none", fontSize: 13, lineHeight: "22px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{`${money(Math.round(shownSum))} of ${money(state.goal)}`}</span>
          </div>
          <div style={{ position: "absolute", left: tx, right: 12, top: 48 }}>
            <Progress value={sum} max={state.goal} />
          </div>
          {faces.map((f, i) => {
            const e = f.at > 0 ? running(f.at, FACE_MS) : null;
            const k = e === null ? 1 : easeOutBack(Math.min(1, e / FACE_MS));
            return (
              <span key={f.id} style={{ position: "absolute", left: tx + i * 15, top: 59, width: 15, height: 15, borderRadius: 999, boxShadow: `0 0 0 1.5px ${c.wash}`, transform: `translateY(${(1 - k) * 10}px) scale(${Math.max(0, k)})`, display: "block" }}>
                <Avatar user={person(f.by, f.user)} size={15} />
              </span>
            );
          })}
          {more > 0 ? (
            <span style={{ position: "absolute", left: tx + faces.length * 15 + 4, top: 59 }}>
              <More n={more} />
            </span>
          ) : null}
          {tagFits ? (
            <span style={{ position: "absolute", left: tagX, top: 59, height: 17, fontSize: 13, lineHeight: "17px", whiteSpace: "nowrap", color: mix(c.positive, c.text, 0.15) }}>{tagText}</span>
          ) : null}
          <div style={{ position: "absolute", left: tx, top: 80, width: bottomW, height: 16, fontSize: bottomFit.size, lineHeight: "16px", fontWeight: funded ? 600 : 400, color: funded ? c.text : c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bottomFit.text}</div>
          {showButtons ? (
            <div style={{ position: "absolute", right: 12, top: 56, display: "flex", gap: 6 }}>
              <Button
                kind="secondary"
                onClick={() => {
                  dispatch({ t: "chip", cents: state.amounts[0]! });
                  if (state.amounts[0]! >= toGo) haptic("success");
                }}
              >
                {`+${money(amounts[0] ?? 0)}`}
              </Button>
              <Button
                kind="primary"
                onClick={() => {
                  dispatch({ t: "chip", cents: state.amounts[1]! });
                  if (state.amounts[1]! >= toGo) haptic("success");
                }}
              >
                {`+${money(amounts[1] ?? 0)}`}
              </Button>
            </div>
          ) : null}
        </div>
        {funded && sinceFunded !== null ? <Toast key={state.fundedAt}>{`${state.who}'s gift is funded`}</Toast> : null}
      </div>
    );
  },
});
