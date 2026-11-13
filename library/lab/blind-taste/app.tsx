import { defineApp, Button, Canvas, CardHeader, Facepile, Toast, fitText, haptic, mix, pal, rng, running, type Ctx, type DrawFrame, type Theme } from "@muse/app";

// Blind taste: "settle it: who has the best pizza in Eastfield". Four numbered boxes, lids closed,
// steam curling out. Everyone tastes and taps the boxes best to worst; medals stick to the lids.
// When the whole chat is in, the lids flip open together and the labels inside say what was in
// each box and how it placed. The frozen one Arun brought usually does better than anyone admits.

type Kind = "pizza" | "coffee" | "dumpling" | "cookie" | "taco" | "fries";
type Params = {
  /** Card title */
  title: string;
  /** The question being settled, as said in the chat */
  sub: string;
  /** What's in the boxes. note is shown once the lids are open */
  items: { label: string; kind: Kind; note?: string }[];
  /** Rankings already in: who, the items best first (indices into items), and what they said */
  ranks: { who: string; order: number[]; said?: string }[];
};

// @params
const P: Params = {
  title: "Blind taste",
  sub: "“settle it: best pizza in Eastfield”",
  items: [
    { label: "Rook's", kind: "pizza" },
    { label: "Sal's", kind: "pizza" },
    { label: "Hollis pizza", kind: "pizza", note: "from the dining hall" },
    { label: "Frozen one", kind: "pizza", note: "Arun's, heated in the rice cooker" },
  ],
  ranks: [
    { who: "Calvin", order: [0, 3, 1, 2], said: "box 3 is clearly rook's. calling it" },
    { who: "Arun", order: [3, 0, 1, 2], said: "box 2 tastes like home" },
    { who: "Tsai Lin", order: [0, 1, 3, 2] },
    { who: "Will", order: [1, 3, 0, 2], said: "they're all good at 1am" },
    { who: "Maya", order: [0, 3, 2, 1], said: "scored them on a 12 point rubric" },
  ],
};
// @end params

type Item = { label: string; kind: Kind; note: string };
type Rank = { who: string; name: string; order: number[]; said: string; at: number };
type State = { title: string; sub: string; items: Item[]; boxes: number[]; ranks: Rank[]; open: number; frozen: number };
type Action = { t: "rank"; order: number[] } | { t: "open" };
type Local = { draft: number[]; toast: number };

const KINDS: Kind[] = ["pizza", "coffee", "dumpling", "cookie", "taco", "fries"];
const CH = 170;
const LID = 54;
const FLIP = 1300;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const isPerm = (o: unknown, n: number): o is number[] => Array.isArray(o) && o.length === n && o.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n) && new Set(o).size === n;
const ORD = ["1st", "2nd", "3rd", "4th", "5th"];
const hash = (t: string) => {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
  return x >>> 0;
};
/** Points: last place 0, each place above one more. */
const points = (s: State) => s.items.map((_, i) => s.ranks.reduce((n, r) => n + (s.items.length - 1 - r.order.indexOf(i)), 0));
const standings = (s: State) => {
  const p = points(s);
  return s.items.map((_, i) => i).sort((a, b) => p[b]! - p[a]! || a - b);
};
const everyone = (s: State, ctx: Ctx) => ctx.members.length > 0 && ctx.members.every((m) => s.ranks.some((r) => r.who === m.id));
const flipOf = (s: State) => (s.open ? (running(s.open, FLIP) ?? FLIP) / FLIP : 0);
const MEDAL = (t: Theme, k: number) => {
  const p = pal(t);
  const col = [p.yellow, mix(t.color.secondaryText, t.color.card, 0.35), p.orange, mix(t.color.secondaryText, t.color.card, 0.6), p.purple][k] ?? p.purple;
  return t.mode === "dark" ? mix(col, t.color.text, 0.45) : col;
};

function initState(ctx: Ctx): State {
  const items: Item[] = [];
  for (const x of Array.isArray(P.items) ? P.items : []) {
    const label = clean(x?.label, 18);
    if (!label || items.length >= 5) continue;
    items.push({ label, kind: KINDS.includes(x.kind) ? x.kind : "pizza", note: clean(x.note, 40) });
  }
  while (items.length < 3) items.push({ label: `Option ${items.length + 1}`, kind: "pizza", note: "" });
  // The box numbers hide the order: the same shuffle for the same lineup, every time.
  const boxes = rng(hash(items.map((i) => i.label).join("|"))).shuffle(items.map((_, i) => i));
  const ranks: Rank[] = [];
  for (const r of Array.isArray(P.ranks) ? P.ranks : []) {
    const nm = clean(r?.who, 20);
    if (!nm || !isPerm(r.order, items.length)) continue;
    const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
    const who = m ? m.id : `~${nm}`;
    if (ranks.some((x) => x.who === who)) continue;
    ranks.push({ who, name: m ? clean(m.name, 20) || nm : nm, order: [...r.order], said: clean(r.said, 60), at: 0 });
  }
  return { title: clean(P.title, 40) || "Blind taste", sub: clean(P.sub, 60), items, boxes, ranks, open: 0, frozen: 0 };
}

function drawFood(g: CanvasRenderingContext2D, k: Kind, x: number, y: number, r: number, t: Theme, seed: number) {
  const p = pal(t);
  const c = t.color;
  const R = rng(seed);
  g.save();
  g.translate(x, y);
  if (k === "pizza") {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = p.crust;
    g.fill();
    g.beginPath();
    g.arc(0, 0, r * 0.84, 0, Math.PI * 2);
    g.fillStyle = mix(p.yellow, p.cream, 0.3);
    g.fill();
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = R.next() * Math.PI * 2;
      const d = r * (0.2 + R.next() * 0.5);
      g.moveTo(Math.cos(a) * d + 4, Math.sin(a) * d);
      g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.13, 0, Math.PI * 2);
    }
    g.fillStyle = p.red;
    g.fill();
    g.strokeStyle = mix(p.crust, c.text, 0.25);
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84);
      g.lineTo(-Math.cos(a) * r * 0.84, -Math.sin(a) * r * 0.84);
    }
    g.stroke();
  } else if (k === "coffee") {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = c.card;
    g.fill();
    g.beginPath();
    g.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    g.fillStyle = p.brown;
    g.fill();
    g.beginPath();
    g.arc(-r * 0.1, 0, r * 0.3, 0, Math.PI * 2);
    g.fillStyle = p.cream;
    g.fill();
  } else if (k === "dumpling" || k === "taco") {
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * r * 0.62;
      g.beginPath();
      if (k === "dumpling") g.ellipse(dx, r * 0.1, r * 0.34, r * 0.26, 0, 0, Math.PI * 2);
      else g.arc(dx, r * 0.25, r * 0.36, Math.PI, 0);
      g.fillStyle = k === "dumpling" ? p.cream : p.crust;
      g.fill();
      g.beginPath();
      if (k === "dumpling") {
        g.moveTo(dx - r * 0.2, -r * 0.05);
        g.lineTo(dx + r * 0.2, -r * 0.05);
        g.strokeStyle = mix(p.cream, c.text, 0.3);
        g.stroke();
      } else {
        g.arc(dx, r * 0.25, r * 0.26, Math.PI, 0);
        g.fillStyle = p.green;
        g.fill();
      }
    }
  } else if (k === "cookie") {
    g.beginPath();
    g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    g.fillStyle = p.crust;
    g.fill();
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = R.next() * Math.PI * 2;
      const d = r * 0.5 * R.next();
      g.moveTo(Math.cos(a) * d + 3, Math.sin(a) * d);
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 3, 0, Math.PI * 2);
    }
    g.fillStyle = p.brown;
    g.fill();
  } else {
    g.fillStyle = p.yellow;
    for (let i = 0; i < 9; i++) {
      g.save();
      g.rotate((i - 4) * 0.12);
      g.fillRect(-3 + (i - 4) * 4, -r * 0.7, 5, r * 1.3);
      g.restore();
    }
  }
  g.restore();
}

function drawBoxes(g: CanvasRenderingContext2D, f: DrawFrame, s: State, draft: number[], mineOrder: number[] | null) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const n = s.items.length;
  const gap = 10;
  const side = Math.min(78, (W - gap * (n + 1)) / n);
  const total = n * side + (n - 1) * gap;
  const x0 = (W - total) / 2;
  const y0 = LID + 8;
  const k = flipOf(s);
  const opened = k > 0;
  const st = standings(s);
  const pts = points(s);
  let anim = false;

  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = dk ? mix(pl.brown, c.wash, 0.6) : mix(pl.wall, c.card, 0.15);
  g.fill();
  // The counter edge.
  g.fillStyle = dk ? mix(pl.brown, c.wash, 0.4) : mix(pl.crust, c.card, 0.45);
  g.fillRect(0, y0 + side * 0.55, W, CH - y0 - side * 0.55 - 0);

  for (let b = 0; b < n; b++) {
    const item = s.boxes[b]!;
    const x = x0 + b * (side + gap);
    const y = y0;
    const box = mix(pl.cream, pl.crust, 0.35);
    // Box base with the food inside (only seen once the lid lifts).
    g.beginPath();
    g.roundRect(x, y, side, side, 4);
    g.fillStyle = mix(box, c.text, 0.12);
    g.fill();
    if (opened) drawFood(g, s.items[item]!.kind, x + side / 2, y + side / 2, side * 0.38, t, hash(s.items[item]!.label));
    // Steam until it's open.
    if (!opened) {
      anim = true;
      g.strokeStyle = dk ? mix(c.text, c.wash, 0.45) : mix(c.secondaryText, c.card, 0.45);
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      for (const dx of [-12, 0, 12]) {
        const ph = f.now / 500 + b + dx;
        g.moveTo(x + side / 2 + dx, y - 4);
        g.bezierCurveTo(x + side / 2 + dx + 5 * Math.sin(ph), y - 16, x + side / 2 + dx - 5 * Math.sin(ph), y - 26, x + side / 2 + dx + 2 * Math.sin(ph * 1.3), y - 36);
      }
      g.stroke();
      g.lineCap = "butt";
    }
    // The lid swings up from the top edge: closed it covers the box, open it lies above it, inside up.
    const stag = Math.min(1, Math.max(0, k * 1.4 - b * 0.12));
    if (opened && stag < 1) anim = true;
    const ang = stag * Math.PI * 0.75;
    const len = side * Math.cos(ang);
    const top = len >= 0 ? y : y + len;
    const hgt = Math.abs(len);
    g.beginPath();
    g.roundRect(x, top, side, Math.max(1, hgt), 4);
    g.fillStyle = len >= 0 ? box : mix(box, c.card, 0.35);
    g.fill();
    if (len >= 0) {
      // Outside of the lid: a fold line, a grease spot and the box number.
      g.strokeStyle = mix(box, c.text, 0.18);
      g.lineWidth = 1;
      g.strokeRect(x + 5, top + 5, side - 10, Math.max(0, hgt - 10));
      if (hgt > side * 0.6) {
        g.beginPath();
        g.ellipse(x + side * 0.72, top + hgt * 0.3, 6, 4, 0.4, 0, Math.PI * 2);
        g.fillStyle = mix(box, pl.orange, 0.35);
        g.fill();
        g.font = `800 ${Math.round(side * 0.42)}px ${t.type.family}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = c.text;
        if (dk) g.fillStyle = mix(c.wash, c.text, 0.1);
        g.fillText(String(b + 1), x + side / 2, top + hgt * 0.55);
      }
    } else if (hgt > 16) {
      // Inside of the lid: where it placed.
      const place = st.indexOf(item);
      g.beginPath();
      g.arc(x + 15, top + hgt / 2, 12, 0, Math.PI * 2);
      g.fillStyle = MEDAL(t, place);
      g.fill();
      g.font = `700 10px ${t.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      if (dk) g.fillStyle = mix(c.wash, c.text, 0.1);
      g.fillText(ORD[place]!, x + 15, top + hgt / 2);
      const pt = fitText(`${pts[item]} pts`, side - 32, { g, size: 11, min: 10, weight: 600 });
      g.font = pt.font;
      g.textAlign = "left";
      g.fillText(pt.text, x + 30, top + hgt / 2);
    }
    // My medal on the closed lid.
    const mine = mineOrder ? mineOrder.indexOf(item) : draft.indexOf(b);
    if (!opened && mine >= 0) {
      const mx = x + side - 13;
      const my = y + 13;
      g.beginPath();
      g.arc(mx, my, 12, 0, Math.PI * 2);
      g.fillStyle = MEDAL(t, mine);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = c.card;
      g.stroke();
      g.font = `700 10px ${t.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      if (dk) g.fillStyle = mix(c.wash, c.text, 0.1);
      g.fillText(ORD[mine]!, mx, my);
    }
    // Under the box: its number, or what it was.
    const lab = fitText(opened && k > 0.5 ? s.items[item]!.label : `box ${b + 1}`, side + gap - 4, { g, size: 12, min: 10, weight: 700 });
    g.font = lab.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = dk ? c.text : c.text;
    g.fillText(lab.text, x + side / 2, y + side + 12);
  }
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Blind taste",
  summary: (s, ctx) => {
    if (s.open) {
      const st = standings(s);
      return `${s.title}: ${s.items[st[0]!]!.label} wins · ${s.items[st[1]!]!.label} came 2nd`;
    }
    return `${s.title}: ${s.ranks.length} of ${Math.max(ctx.members.length, s.ranks.length)} tasted · lids still closed`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u) || s.open) return s;
    if (a.t === "rank") {
      if (!isPerm(a.order, s.items.length) || s.ranks.some((r) => r.who === u)) return s;
      const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
      const next = { ...s, ranks: [...s.ranks, { who: u, name, order: [...a.order], said: "", at: m.time }] };
      // The last taster in the chat flips the lids for everyone.
      return everyone(next, ctx) && next.ranks.length >= 2 ? { ...next, open: m.time, frozen: next.ranks.length } : next;
    }
    if (a.t === "open") {
      if (s.ranks.length < 2 || !s.ranks.some((r) => r.who === u)) return s;
      return { ...s, open: m.time, frozen: s.ranks.length };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.open) return s;
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.ranks.some((r) => gone(r.who))) return s;
    return { ...s, ranks: s.ranks.filter((r) => !gone(r.who)) };
  },

  invariants: {
    "every ranking orders every box once": (s) => s.ranks.every((r) => isPerm(r.order, s.items.length)),
    "one ranking per person": (s) => new Set(s.ranks.map((r) => r.who)).size === s.ranks.length,
    "the boxes hide each item once": (s) => isPerm(s.boxes, s.items.length),
    "lids open only with two rankings in": (s) => s.open === 0 || s.ranks.length >= 2,
    "points add up": (s) => points(s).reduce((a, b) => a + b, 0) === (s.ranks.length * s.items.length * (s.items.length - 1)) / 2,
    "the tally freezes when the lids open": (s) => (s.open === 0 ? s.frozen === 0 : s.frozen === s.ranks.length),
  },

  transitions: {
    "ranking adds only you, once": (p, n, a, m) => {
      if (a.t !== "rank" || p === n) return true;
      const r = n.ranks.find((x) => x.who === m.user);
      return !p.ranks.some((x) => x.who === m.user) && !!r && r.order.join() === a.order.join() && r.at === m.time && n.ranks.length === p.ranks.length + 1;
    },
    "the last taster opens the lids": (p, n, a, m, ctx) => a.t !== "rank" || p === n || (everyone(n, ctx) && n.ranks.length >= 2) === (n.open === m.time),
    "opening needs a taster and two rankings": (p, n, a, m) => a.t !== "open" || p === n || (p.open === 0 && n.open === m.time && p.ranks.some((r) => r.who === m.user) && p.ranks.length >= 2 && n.ranks === p.ranks),
    "open lids stay open and rankings freeze": (p, n) => p.open === 0 || (n.open === p.open && n.ranks.length === p.ranks.length),
    "the boxes never reshuffle": (p, n) => n.boxes.join() === p.boxes.join(),
    "a taster can always open": (p, n, a, m, ctx) => a.t !== "open" || p.open > 0 || p.ranks.length < 2 || !p.ranks.some((r) => r.who === m.user) || !inChat(ctx, m.user) || p !== n,
    "your name goes on your ranking": (p, n, a, m, ctx) => a.t !== "rank" || p === n || n.ranks.find((r) => r.who === m.user)?.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend"),
    "only people in the chat taste": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (!s.ranks.some((x) => x.who === u) || r.next() < 0.3) return { t: "rank", order: r.shuffle(s.items.map((_, i) => i)) };
    return { t: "open" };
  },

  local: { draft: [], toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const n = s.items.length;
    const gap = 10;
    const side = Math.min(78, (W - gap * (n + 1)) / n);
    const x0 = (W - (n * side + (n - 1) * gap)) / 2;
    const mine = s.ranks.find((r) => r.who === me) ?? null;
    const draft = local.draft.filter((b) => b >= 0 && b < n);
    const opened = s.open > 0;
    const st = standings(s);
    const tasted = s.ranks.map((r) => ({ id: r.who, name: r.name }));
    const total = Math.max(members.length, s.ranks.length);
    const quote = [...s.ranks].filter((r) => r.said).at(-1);
    const latest = [...s.ranks].sort((a, b) => b.at - a.at)[0];
    const label = opened
      ? `Lids open: ${st.map((i, k) => `${ORD[k]} ${s.items[i]!.label}`).join(", ")}`
      : `${n} closed boxes numbered 1 to ${n}; ${s.ranks.length} of ${total} have tasted`;
    const pick = (b: number) => {
      if (mine || opened) return;
      haptic("light");
      setLocal({ draft: draft.includes(b) ? draft.filter((x) => x !== b) : [...draft, b] });
    };
    const lock = () => {
      if (draft.length !== n) return;
      haptic("success");
      setLocal({ toast: local.toast + 1 });
      dispatch({ t: "rank", order: draft.map((b) => s.boxes[b]!) });
    };
    const nextPlace = draft.length < n ? ORD[draft.length] : null;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas height={CH} label={label} draw={(g, f) => drawBoxes(g, f, s, draft, mine ? mine.order : null)} />
          {!mine && !opened
            ? s.boxes.map((_, b) => (
                <button
                  key={b}
                  type="button"
                  aria-label={draft.includes(b) ? `Box ${b + 1}, your ${ORD[draft.indexOf(b)]}. Tap to clear` : `Box ${b + 1} as your ${nextPlace ?? "pick"}`}
                  onClick={() => pick(b)}
                  style={{ position: "absolute", left: x0 + b * (side + gap), top: LID + 8, width: side, height: side, borderRadius: 4 }}
                />
              ))
            : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {opened ? (
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.text, minWidth: 0, ...ell }}>
              <b>{s.items[st[0]!]!.label}</b>
              {` wins · ${s.items[st[1]!]!.label} came 2nd${s.items[st[1]!]!.note ? ` (${s.items[st[1]!]!.note})` : ""}`}
            </span>
          ) : latest && latest.at > 0 ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{latest.who === me ? "Your ranking is in. Lids open when everyone's tasted" : `${first(latest.name)} ranked all ${n}`}</span>
          ) : quote ? (
            <>
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Taste each box, then tap them best to worst</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, minWidth: 0 }}>
          {tasted.length ? <Facepile users={tasted} max={6} size={20} /> : null}
          <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`${s.ranks.length} of ${total} tasted`}</span>
        </div>
        {opened ? null : (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {mine ? (
              <Button kind="secondary" wide disabled={s.ranks.length < 2} onClick={() => { haptic("success"); dispatch({ t: "open" }); }}>
                Open the lids now
              </Button>
            ) : (
              <>
                <Button kind="primary" wide disabled={draft.length !== n} onClick={lock}>
                  {draft.length === n ? "Lock my ranking" : `Tap your ${nextPlace}`}
                </Button>
                {draft.length ? (
                  <Button kind="deemphasized" onClick={() => setLocal({ draft: [] })}>
                    Clear
                  </Button>
                ) : null}
              </>
            )}
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>{opened ? "Lids are open" : "Ranking locked"}</Toast> : null}
      </div>
    );
  },
});
