import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  clock,
  fitText,
  haptic,
  textWidth,
  tween,
  userColor,
  type Child,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// "Who you know here": the crowd going to an event as a slowly turning night sky. You are in the
// middle, your friends are bright stars, the people they know are wired to them, strangers are dust.
// Tap a friend to light up their cluster, then ask them to introduce you.

type Params = {
  /** Card title: "Who you know here" */
  title: string;
  /** How the event is called in copy: "the show" */
  show: string;
  /** People going, 1 to 5000. */
  total: number;
  /** Who each friend knows there (names, not in the chat). */
  knows: { name: string; people: string[] }[];
  /** Intros already asked: from asks via to introduce them. */
  asks: { from: string; via: string }[];
};

// @params
const P: Params = {
  title: "Who you know here",
  show: "the show",
  total: 84,
  knows: [
    { name: "Maya", people: ["Lena", "Omar", "Bea", "Chris", "Hana", "Rob"] },
    { name: "Theo", people: ["Ivy", "Raj", "Tom", "Uma"] },
    { name: "Jonah", people: ["Lia", "Ben", "Zoe", "Max", "Eli"] },
    { name: "Dev", people: ["Ray", "Gus"] },
    { name: "Priya", people: ["Ada"] },
    { name: "Noa", people: ["Sam", "Ana", "Leo"] },
  ],
  asks: [{ from: "Dev", via: "Jonah" }],
};
// @end params

type Ask = { id: string; from: string; via: string; at: number; ok: boolean };
type State = {
  title: string;
  show: string;
  total: number;
  /** Lowercased friend name -> people they know there (not in the chat). */
  knows: Record<string, string[]>;
  /** Intro requests: `from` asks `via` to introduce them. */
  asks: Ask[];
};
type Action = { t: "hi"; via: string } | { t: "ok"; ask: string };
type Local = { sel: string; selAt: number };

const MAX_ASKS = 60;
const MAX_FRIENDS = 12;
const SKY_H = 254;
const CAPTION_H = 84;
const DRAWN = 6;
const pop = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const byIdOrName = (ctx: Ctx, key: unknown): Member | undefined => {
  if (typeof key !== "string") return undefined;
  const k = key.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === key || m.id.toLowerCase() === k || m.name.trim().toLowerCase() === k) : undefined;
};

function initState(ctx: Ctx): State {
  const knows: Record<string, string[]> = {};
  for (const raw of (Array.isArray(P.knows) ? P.knows : []).slice(0, 12)) {
    const key = clean(raw?.name, 40).toLowerCase();
    if (!key || knows[key]) continue;
    const seen = new Set<string>();
    const people: string[] = [];
    for (const n of Array.isArray(raw.people) ? raw.people : []) {
      const name = clean(n, 16);
      if (!name || seen.has(name) || people.length >= 12) continue;
      seen.add(name);
      people.push(name);
    }
    knows[key] = people;
  }
  const asks: Ask[] = [];
  for (const raw of Array.isArray(P.asks) ? P.asks : []) {
    const from = byIdOrName(ctx, raw?.from);
    const via = byIdOrName(ctx, raw?.via);
    if (!from || !via || from.id === via.id) continue;
    if (asks.some((k) => k.from === from.id && k.via === via.id)) continue;
    asks.push({ id: `s${asks.length}`, from: from.id, via: via.id, at: 0, ok: false });
  }
  const total = Number.isInteger(P.total) ? Math.min(5000, Math.max(1, P.total)) : 84;
  return { title: clean(P.title, 30) || "Who you know here", show: clean(P.show, 20) || "the show", total, knows, asks };
}

const knowsOf = (s: State, m: Member): string[] => s.knows[m.name.trim().toLowerCase()] ?? s.knows[m.id] ?? [];

type Sky = { friends: Member[]; known: number; connector: Member | null; dust: number; going: number };
function skyOf(s: State, members: readonly Member[], me: string): Sky {
  const friends = members.filter((m) => m.id !== me).slice(0, MAX_FRIENDS);
  const union = new Set<string>();
  let connector: Member | null = null;
  let best = 0;
  for (const f of friends) {
    const people = knowsOf(s, f);
    for (const p of people) union.add(p);
    if (people.length > best) {
      best = people.length;
      connector = f;
    }
  }
  const known = friends.length + union.size;
  const going = Math.max(s.total, members.length);
  return { friends, known, connector, dust: Math.min(140, Math.max(0, going - known - 1)), going };
}

/** A fixed hash in [0, 1): the dust never changes between clients. */
function h01(i: number): number {
  let x = Math.imul(i, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return ((x >>> 0) % 1000) / 1000;
}

type Geo = { c0: { x: number; y: number }; s: number; ky: number; rot: number };
const geo = (w: number, h: number, t: number): Geo => ({
  c0: { x: w / 2, y: h / 2 + 1 },
  s: Math.min(1, (w / 2 - 14) / 154),
  ky: (h / 2 - 12) / 154,
  rot: t * 0.039,
});
const place = (g: Geo, a: number, r: number) => ({ x: g.c0.x + Math.cos(a + g.rot) * r * g.s, y: g.c0.y + Math.sin(a + g.rot) * r * g.ky });
const starAt = (g: Geo, i: number, n: number) => place(g, -Math.PI / 2 + (i * 2 * Math.PI) / n, 80);

type DrawIn = { sky: Sky; knows: (m: Member) => string[]; me: string; sel: string; selAt: number; label: string };

function drawSky(g: CanvasRenderingContext2D, f: DrawFrame, d: DrawIn): boolean {
  const th: Theme = f.theme;
  const c = th.color;
  const w = f.width;
  const H = SKY_H;
  const t = f.now / 1000;
  const geom = geo(w, H, t);
  const { c0 } = geom;
  const n = d.sky.friends.length;
  const family = th.type.family;
  const letter = (ch: string, x: number, y: number, size: number, fill: string, weight = 600) => {
    if (size < 5) return;
    const fit = fitText(ch, size * 1.7, { g, size, weight, min: 5, family });
    g.font = fit.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = fill;
    g.fillText(fit.text, x, y + size * 0.04);
  };

  g.globalAlpha = 1;
  g.beginPath();
  g.roundRect(0, 0, w, H, 12);
  g.fillStyle = c.wash;
  g.fill();
  g.save();
  g.clip();

  // Dust: the strangers, in five twinkle levels so a hundred of them cost five fills.
  const legend = fitText("Dots are people you don't know yet", w - 20, { g, size: 12, min: 10, family });
  const levels = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (let k = 0; k < d.sky.dust; k++) {
    const x = 8 + h01(k * 3 + 1) * (w - 16);
    const y = 8 + h01(k * 5 + 2) * (H - 16);
    if (y > H - 30 && x < legend.width + 18) continue;
    const r = 1.2 + h01(k * 11);
    const tw = Math.sin(t * (1 + 2 * h01(k)) + k) * 0.5 + 0.5;
    const lv = Math.min(4, Math.floor(tw * 5));
    levels[lv]!.moveTo(x + r, y);
    levels[lv]!.arc(x, y, r, 0, Math.PI * 2);
  }
  g.fillStyle = c.secondaryText;
  levels.forEach((p, lv) => {
    g.globalAlpha = 0.34 + 0.34 * (lv / 4);
    g.fill(p);
  });
  g.globalAlpha = 1;

  const anySel = d.sel !== "" && d.sky.friends.some((m) => m.id === d.sel);
  const sel = anySel ? d.sel : "";
  const e = Math.max(0, f.now - d.selAt);
  const grow = pop(Math.min(e, pop.duration));

  // Wires, people, then the friends over them.
  type Placed = { m: Member; fp: { x: number; y: number }; hue: string; lit: boolean; on: boolean; i: number };
  const placed: Placed[] = d.sky.friends.map((m, i) => {
    const hue = userColor(m.id, th);
    return { m, fp: starAt(geom, i, n), hue, lit: sel === "" || sel === m.id, on: sel === m.id, i };
  });
  g.lineCap = "round";
  for (const p of placed) {
    g.globalAlpha = p.lit ? 0.45 : 0.15;
    g.strokeStyle = c.secondaryText;
    g.lineWidth = p.on ? 2 : 1.2;
    g.beginPath();
    g.moveTo(c0.x, c0.y);
    g.lineTo(p.fp.x, p.fp.y);
    g.stroke();
  }
  const faces: { x: number; y: number; name: string; hue: string; r: number }[] = [];
  for (const p of placed) {
    const people = d.knows(p.m);
    const m = Math.min(DRAWN, people.length);
    if (!m) continue;
    const spread = ((2 * Math.PI) / n) * 0.8;
    const fa = -Math.PI / 2 + (p.i * 2 * Math.PI) / n;
    const wires = new Path2D();
    const dots = new Path2D();
    const cores = new Path2D();
    for (let k = 0; k < m; k++) {
      const a = m === 1 ? fa : fa - spread / 2 + (spread * k) / (m - 1);
      const q = place(geom, a, k % 2 === 0 ? 128 : 154);
      wires.moveTo(p.fp.x, p.fp.y);
      wires.lineTo(q.x, q.y);
      if (p.on) faces.push({ x: q.x, y: q.y, name: people[k]!, hue: p.hue, r: 10 * grow });
      else {
        dots.moveTo(q.x + 3.5, q.y);
        dots.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        cores.moveTo(q.x + 1.5, q.y);
        cores.arc(q.x, q.y, 1.5, 0, Math.PI * 2);
      }
    }
    g.strokeStyle = p.hue;
    g.lineWidth = p.on ? 1.6 : 1;
    g.globalAlpha = p.on ? 0.9 : p.lit ? 0.4 : 0.12;
    g.stroke(wires);
    if (!p.on) {
      g.fillStyle = p.hue;
      g.globalAlpha = p.lit ? 0.85 + 0.15 * Math.sin(2 * t + p.i * 7) : 0.3;
      g.fill(dots);
      g.fillStyle = c.secondaryText;
      g.globalAlpha = p.lit ? 0.9 : 0.3;
      g.fill(cores);
    }
  }
  g.globalAlpha = 1;
  for (const q of faces) {
    g.beginPath();
    g.arc(q.x, q.y, q.r + 2, 0, Math.PI * 2);
    g.fillStyle = q.hue;
    g.fill();
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    g.fillStyle = userColor(q.name, th);
    g.fill();
    letter((q.name.trim()[0] ?? "?").toUpperCase(), q.x, q.y, q.r, c.onPrimary);
  }

  for (const p of placed) {
    const { fp, hue, lit, on } = p;
    g.globalAlpha = lit ? 0.3 : 0.1;
    g.fillStyle = hue;
    g.beginPath();
    g.arc(fp.x, fp.y, 18 + (on ? 6 + 2 * Math.sin(3 * t) : 0), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    const initial = (p.m.name.trim()[0] ?? "?").toUpperCase();
    if (lit) {
      g.beginPath();
      g.arc(fp.x, fp.y, 15, 0, Math.PI * 2);
      g.fillStyle = hue;
      g.fill();
      letter(initial, fp.x, fp.y, 13, c.onPrimary);
    } else {
      g.beginPath();
      g.arc(fp.x, fp.y, 13, 0, Math.PI * 2);
      g.fillStyle = c.input;
      g.fill();
      g.globalAlpha = 0.7;
      g.strokeStyle = hue;
      g.lineWidth = 1.5;
      g.stroke();
      g.globalAlpha = 1;
      letter(initial, fp.x, fp.y, 13, c.secondaryText);
    }
    // Count badge: how many people this friend knows here.
    const count = String(d.knows(p.m).length);
    g.beginPath();
    g.arc(fp.x + 13, fp.y - 12, 8, 0, Math.PI * 2);
    g.fillStyle = c.card;
    g.fill();
    letter(count, fp.x + 13, fp.y - 12, 10.5, c.text);
  }

  // You, in the middle.
  const meMember = { id: d.me };
  g.globalAlpha = 0.25;
  g.fillStyle = c.primary;
  g.beginPath();
  g.arc(c0.x, c0.y, 24, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(c0.x, c0.y, 18, 0, Math.PI * 2);
  g.fillStyle = c.primary;
  g.fill();
  g.beginPath();
  g.arc(c0.x, c0.y, 16, 0, Math.PI * 2);
  g.fillStyle = userColor(meMember, th);
  g.fill();
  letter(d.label, c0.x, c0.y, 16, c.onPrimary);

  // Nothing selected: a ring pulses around the friend who knows the most people.
  if (sel === "" && d.sky.connector) {
    const p = placed.find((x) => x.m.id === d.sky.connector!.id);
    if (p) {
      const k = (t * 1.4) % 1;
      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = c.secondaryText;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.fp.x, p.fp.y, 16 + 9 * k, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  g.font = legend.font;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = c.secondaryText;
  g.fillText(legend.text, 10, H - 12);
  g.restore();
  g.globalAlpha = 1;
  return true;
}

const asked = (s: State, from: string, via: string) => s.asks.find((k) => k.from === from && k.via === via);

export default defineApp<State, Action, Local>({
  name: "Who you know here",
  summary: (s) => {
    const accepted = s.asks.filter((k) => k.ok).length;
    if (!s.asks.length) return `${s.title}: ${s.total} going · nobody's asked for an intro yet`;
    return `${s.title}: ${s.total} going · ${s.asks.length} ${s.asks.length === 1 ? "intro" : "intros"} asked${accepted > 0 ? ` · ${accepted} said yes` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "hi") {
      const via = action.via;
      if (typeof via !== "string" || !inChat(ctx, via) || via === meta.user) return state;
      if (asked(state, meta.user, via)) return { ...state, asks: state.asks.filter((k) => !(k.from === meta.user && k.via === via)) };
      if (state.asks.length >= MAX_ASKS) return state;
      return { ...state, asks: [...state.asks, { id: `a${meta.seq}`, from: meta.user, via, at: meta.time, ok: false }] };
    }
    if (action.t === "ok") {
      if (typeof action.ask !== "string") return state;
      const k = state.asks.find((x) => x.id === action.ask);
      if (!k || k.via !== meta.user || k.ok) return state;
      return { ...state, asks: state.asks.map((x) => (x.id === k.id ? { ...x, ok: true } : x)) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.asks.every((k) => inChat(ctx, k.from) && inChat(ctx, k.via))) return state;
    return { ...state, asks: state.asks.filter((k) => inChat(ctx, k.from) && inChat(ctx, k.via)) };
  },

  invariants: {
    "asks are between two different people in the chat": (s, ctx) => s.asks.every((k) => inChat(ctx, k.from) && inChat(ctx, k.via) && k.from !== k.via),
    "one ask per pair": (s) => new Set(s.asks.map((k) => k.from + ">" + k.via)).size === s.asks.length,
    "ask ids are unique": (s) => new Set(s.asks.map((k) => k.id)).size === s.asks.length,
    "asks are bounded": (s) => s.asks.length <= MAX_ASKS && s.asks.every((k) => typeof k.ok === "boolean" && Number.isFinite(k.at)),
    "the crowd is sane": (s) =>
      Number.isInteger(s.total) && s.total >= 1 && s.total <= 5000 && Object.values(s.knows).every((p) => p.length <= 12 && new Set(p).size === p.length),
  },

  transitions: {
    "hi toggles only the sender's ask via that friend": (p, n, a, m) => {
      if (a.t !== "hi" || p === n) return true;
      if (Math.abs(n.asks.length - p.asks.length) !== 1) return false;
      const ids = new Set(p.asks.map((k) => k.id));
      const nids = new Set(n.asks.map((k) => k.id));
      const diff = [...p.asks.filter((k) => !nids.has(k.id)), ...n.asks.filter((k) => !ids.has(k.id))];
      return diff.length === 1 && diff.every((k) => k.from === m.user && k.via === a.via);
    },
    "a new ask is stamped and open": (p, n, a, m) => {
      if (a.t !== "hi" || n.asks.length <= p.asks.length) return true;
      const last = n.asks[n.asks.length - 1]!;
      return last.at === m.time && last.ok === false && last.id === `a${m.seq}`;
    },
    "only the friend asked can say yes, once": (p, n, a, m) => {
      if (a.t !== "ok" || p === n) return true;
      const before = p.asks.find((k) => k.id === a.ask);
      const after = n.asks.find((k) => k.id === a.ask);
      return before?.via === m.user && before.ok === false && after?.ok === true;
    },
    "ok changes one ask and nothing else": (p, n, a) =>
      a.t !== "ok" || p === n || (n.asks.length === p.asks.length && n.asks.filter((k, i) => JSON.stringify(k) !== JSON.stringify(p.asks[i])).length === 1),
    "a yes stays a yes unless the asker cancels": (p, n, a, m) => p.asks.every((k) => !k.ok || n.asks.some((x) => x.id === k.id && x.ok) || (a.t === "hi" && m.user === k.from)),
    "the sky never changes": (p, n) => n.title === p.title && n.total === p.total && JSON.stringify(n.knows) === JSON.stringify(p.knows),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const mine = s.asks.filter((k) => k.via === user && !k.ok);
    if (mine.length && r.next() < 0.5) return { t: "ok", ask: r.pick(mine).id };
    const others = ctx.members.filter((m) => m.id !== user);
    if (!others.length) return { t: "ok", ask: "none" };
    return { t: "hi", via: r.pick(others).id };
  },

  local: { sel: "", selAt: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const sky = skyOf(state, members, me);
    const n = sky.friends.length;
    const meMember = members.find((m) => m.id === me);
    const knowsFn = (m: Member) => knowsOf(state, m);
    const sel = sky.friends.find((m) => m.id === local.sel) ?? null;
    const W = theme.width - 2 * theme.space.card;
    const show = state.show;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const label = (meMember?.name.trim()[0] ?? "Y").toUpperCase();
    const conn = sky.connector;
    const connCount = conn ? knowsFn(conn).length : 0;
    const subtitle = `${sky.going} going · you know ${sky.known}`;
    const canvasLabel = `Sky of ${sky.going} going: you know ${sky.known} through ${n} ${n === 1 ? "friend" : "friends"}${conn ? `, ${conn.name} knows ${connCount}` : ""}`;

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "up") return;
      const t = clock.value / 1000;
      const g = geo(W, SKY_H, t);
      let hit: Member | null = null;
      let best = 20;
      sky.friends.forEach((m, i) => {
        const p = starAt(g, i, n);
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist <= best) {
          best = dist;
          hit = m;
        }
      });
      const found = hit as Member | null;
      if (found) setLocal({ sel: local.sel === found.id ? "" : found.id, selAt: clock.value });
      else setLocal({ sel: "" });
    };

    // The caption below the sky: a picked friend, an intro asked of me, or the rest state.
    const incoming = state.asks.find((k) => k.via === me && !k.ok);
    const text = (size: number, weight: number, color: string, extra: Record<string, string | number> = {}) => ({
      fontSize: size,
      fontWeight: weight,
      color,
      lineHeight: `${Math.round(size * 1.25)}px`,
      whiteSpace: "nowrap" as const,
      overflow: "hidden" as const,
      textOverflow: "ellipsis" as const,
      position: "absolute" as const,
      ...extra,
    });
    // The biggest size at which the text fits its column (never an ellipsis when a smaller size fits).
    const fitPx = (s: string, width: number, size: number, weight: number, min = 12) => {
      let px = size;
      while (px > min && textWidth(s, px, weight) > width) px -= 0.5;
      return px;
    };
    const textW = W - 14 - 98 - 14;
    const fullW = W - 28;

    let caption: Child;
    if (sel) {
      const mine = asked(state, me, sel.id);
      const people = knowsFn(sel);
      const head = `${sel.name} knows ${people.length} going`;
      const names = people.slice(0, DRAWN).join(", ") || "Nobody here yet";
      const line = !mine ? `Ask ${sel.name} to introduce you at ${show}` : mine.ok ? `${sel.name} said yes · group chat at ${show}` : `${sel.name} will make a group chat at ${show}`;
      caption = (
        <>
          <div style={{ position: "absolute", left: 14, top: 14, width: 28, height: 28, borderRadius: 14, boxShadow: `0 0 0 2px ${userColor(sel.id, theme)}` }}>
            <Avatar user={sel} size={28} />
          </div>
          <div style={text(fitPx(head, textW - 22, 15, 600, 13), 600, c.text, { left: 50, top: 10, width: textW - 22 })}>{head}</div>
          <div style={text(fitPx(names, textW - 22, 13, 400, 11), 400, c.secondaryText, { left: 50, top: 32, width: textW - 22 })}>{names}</div>
          <div style={text(13, 400, c.secondaryText, { left: 14, top: 58, width: textW + 36 })}>{line}</div>
          <div style={{ position: "absolute", right: 14, top: mine ? 8 : 14, display: "grid", gap: 2, justifyItems: "end" }}>
            {mine ? <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "16px", color: c.positive }}>Intro sent</span> : null}
            <Button
              kind={mine ? "secondary" : "primary"}
              onClick={() => {
                haptic("light");
                dispatch({ t: "hi", via: sel.id });
              }}
            >
              {mine ? "Cancel" : "Say hi"}
            </Button>
          </div>
        </>
      );
    } else if (incoming) {
      const asker = members.find((m) => m.id === incoming.from);
      const mineHere = asker ? knowsFn(asker) : [];
      const head = `${nameOf(incoming.from)} asked for an intro`;
      const sub = `to your ${mineHere.length} here: ${mineHere.slice(0, DRAWN).join(", ")}`;
      caption = (
        <>
          <div style={{ position: "absolute", left: 14, top: 14, width: 28, height: 28 }}>
            <Avatar user={asker ?? incoming.from} size={28} />
          </div>
          <div style={text(fitPx(head, textW - 22, 15, 600, 13), 600, c.text, { left: 50, top: 10, width: textW - 22 })}>{head}</div>
          <div style={text(fitPx(sub, textW - 22, 13, 400, 11), 400, c.secondaryText, { left: 50, top: 32, width: textW - 22 })}>{mineHere.length ? sub : "to your friends here"}</div>
          <div style={text(13, 400, c.secondaryText, { left: 14, top: 58, width: textW + 36 })}>{`You'll make a group chat at ${show}`}</div>
          <div style={{ position: "absolute", right: 14, top: 14 }}>
            <Button
              kind="primary"
              onClick={() => {
                haptic("light");
                dispatch({ t: "ok", ask: incoming.id });
              }}
            >
              Sure
            </Button>
          </div>
        </>
      );
    } else if (!n) {
      caption = (
        <>
          <div style={text(16, 600, c.text, { left: 14, top: 10, width: fullW })}>Nobody you know is going yet</div>
          <div style={text(13, 400, c.secondaryText, { left: 14, top: 34, width: fullW })}>{`${sky.going} going`}</div>
          <div style={text(13, 400, c.link, { left: 14, top: 56, width: fullW })}>Friends who join show up as stars</div>
        </>
      );
    } else {
      const head = textW >= 240 ? `You know ${sky.known} of ${sky.going} people going` : `You know ${sky.known} of ${sky.going}`;
      const narrow = textW < 240;
      const sub = `through ${n} ${n === 1 ? "friend" : "friends"}${conn ? (narrow ? ` · ${conn.name} (${connCount})` : ` · ${conn.name}'s the connector (${connCount})`) : ""}`;
      caption = (
        <>
          <div style={text(fitPx(head, textW, 16, 600, 13), 600, c.text, { left: 14, top: 10, width: textW })}>{head}</div>
          <div style={text(fitPx(sub, textW, 13, 400, 11), 400, c.secondaryText, { left: 14, top: 34, width: textW })}>{sub}</div>
          <div style={text(13, 400, c.link, { left: 14, top: 58, width: textW })}>{narrow ? "Tap a friend" : "Tap a friend to see who they know"}</div>
          {conn ? (
            <div style={{ position: "absolute", right: 14, top: 14 }}>
              <Button
                kind="primary"
                onClick={() => {
                  haptic("light");
                  dispatch({ t: "hi", via: conn.id });
                }}
              >
                Say hi
              </Button>
            </div>
          ) : null}
        </>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        <div style={{ borderRadius: 12, overflow: "hidden" }}>
          <Canvas
            height={SKY_H}
            label={canvasLabel}
            onPointer={onPointer}
            draw={(g, f) => drawSky(g, f, { sky, knows: knowsFn, me, sel: local.sel, selAt: local.selAt, label })}
          />
        </div>
        <div style={{ position: "relative", marginTop: 8, height: CAPTION_H, borderRadius: 12, background: c.wash }}>{caption}</div>
      </div>
    );
  },
});
