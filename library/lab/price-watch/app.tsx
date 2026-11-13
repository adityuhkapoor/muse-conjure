import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
} from "@muse/app";

// Price watch: a listing that keeps dropping. The price tag hangs on a nail with the old prices
// crossed out; beside it a price ruler where friends stick pins at what they'd pay. Drag your pin;
// when the seller drops into anyone's pin, the highest pin gets the first message.

type Params = {
  /** What it is */
  item: string;
  /** How long it has been listed: "listed 3 weeks" */
  listed: string;
  /** Prices so far in cents, oldest first; the last one is the price now */
  prices: number[];
  /** Pins friends already set: who, the price in cents, and a short line */
  pins: { who: string; cents: number; said?: string }[];
};

// @params
const P: Params = {
  item: "Standing desk",
  listed: "listed 3 weeks",
  prices: [20000, 17000, 14000],
  pins: [
    { who: "Maya", cents: 11000, said: "it's a standing desk. i would stand." },
    { who: "Calvin", cents: 12500, said: "need it for alarm number 8" },
    { who: "Will", cents: 9000, said: "lowball szn" },
  ],
};
// @end params

type Pin = { user: string; name: string; cents: number; at: number; said: string };
type State = { item: string; listed: string; prices: number[]; dropAt: number; pins: Pin[]; first: { user: string; cents: number; at: number } | null };
type Action = { t: "pin"; cents: number } | { t: "unpin" } | { t: "drop"; cents: number };
type Local = { cents: number; drag: boolean; toast: number; msg: string };

const H = 196;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const now = (s: State) => s.prices[s.prices.length - 1]!;
const top = (s: State) => s.prices[0]!;
const floorOf = (s: State) => Math.max(0, Math.floor((top(s) * 0.35) / 1000) * 1000);
const okCents = (s: State, c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c % 100 === 0 && c >= 100 && c <= top(s);
/** Who gets the first message when the price lands at `cents`: the highest pin at or above it, first pinned on a tie. */
function winner(pins: Pin[], cents: number): Pin | null {
  return [...pins].filter((p) => p.cents >= cents).sort((a, b) => b.cents - a.cents || a.at - b.at)[0] ?? null;
}
/** The next drop if the seller keeps the same pace, to the nearest $5. */
function nextDrop(s: State): number {
  if (s.prices.length < 2) return Math.max(100, Math.round((now(s) * 0.85) / 500) * 500);
  const step = (top(s) - now(s)) / (s.prices.length - 1);
  return Math.max(100, Math.round((now(s) - step) / 500) * 500);
}

function initState(ctx: Ctx): State {
  const prices: number[] = [];
  for (const c of Array.isArray(P.prices) ? P.prices : []) {
    if (prices.length >= 6 || !Number.isInteger(c) || c < 100 || c > 10_000_000 || c % 100 !== 0) continue;
    if (prices.length && c >= prices[prices.length - 1]!) continue;
    prices.push(c);
  }
  if (!prices.length) prices.push(10000);
  const pins: Pin[] = [];
  for (const p of Array.isArray(P.pins) ? P.pins : []) {
    const name = clean(p?.who, 20);
    if (!name || pins.length >= 10 || !Number.isInteger(p.cents) || p.cents % 100 !== 0 || p.cents < 100 || p.cents > prices[0]!) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    const user = m ? m.id : `o:${name}`;
    if (pins.some((q) => q.user === user)) continue;
    pins.push({ user, name, cents: p.cents, at: 0, said: clean(p.said, 44) });
  }
  return { item: clean(P.item, 28) || "This listing", listed: clean(P.listed, 28), prices, dropAt: 0, pins, first: null };
}

export default defineApp<State, Action, Local>({
  name: "Price watch",
  summary: (s, ctx) => {
    if (s.first) return `${s.item} dropped to ${money(now(s))} · ${ctx.members.find((m) => m.id === s.first!.user)?.name ?? s.pins.find((p) => p.user === s.first!.user)?.name ?? "Someone"} messages first`;
    return `${s.item} · ${money(now(s))} now · ${s.pins.length} ${s.pins.length === 1 ? "pin" : "pins"} waiting`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "pin") {
      if (!okCents(s, a.cents) || s.first) return s;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      return { ...s, pins: [...s.pins.filter((p) => p.user !== m.user), { user: m.user, name, cents: a.cents, at: m.time, said: "" }].slice(-12) };
    }
    if (a.t === "unpin") {
      if (s.first || !s.pins.some((p) => p.user === m.user)) return s;
      return { ...s, pins: s.pins.filter((p) => p.user !== m.user) };
    }
    if (a.t === "drop") {
      if (!okCents(s, a.cents) || a.cents >= now(s) || s.prices.length >= 8 || s.first) return s;
      const w = winner(s.pins, a.cents);
      return { ...s, prices: [...s.prices, a.cents], dropAt: m.time, first: w ? { user: w.user, cents: w.cents, at: m.time } : null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const pins = s.pins.filter((p) => p.user.startsWith("o:") || inChat(ctx, p.user));
    if (pins.length === s.pins.length) return s;
    if (!s.first) return { ...s, pins };
    const w = winner(pins, now(s));
    return { ...s, pins, first: w ? { user: w.user, cents: w.cents, at: s.dropAt } : null };
  },

  invariants: {
    "prices only go down": (s) => s.prices.length >= 1 && s.prices.every((c, i) => Number.isInteger(c) && (i === 0 || c < s.prices[i - 1]!)),
    "one pin each, on the ruler": (s) => new Set(s.pins.map((p) => p.user)).size === s.pins.length && s.pins.every((p) => okCents(s, p.cents)),
    "the first message goes to the highest pin at the new price": (s) => {
      if (!s.first) return true;
      const p = s.pins.find((q) => q.user === s.first!.user);
      return !!p && p.cents === s.first.cents && p.cents >= now(s) && s.pins.every((q) => q.cents < now(s) || q.cents <= p.cents);
    },
    "a first message comes with a drop": (s) => s.first === null || (s.first.at === s.dropAt && s.prices.length >= 2),
    "pinned people are in the chat": (s, ctx) => s.pins.every((p) => p.user.startsWith("o:") || inChat(ctx, p.user)),
  },

  transitions: {
    "a pin sets only yours": (p, n, a, m) => {
      if (a.t !== "pin" || p === n) return true;
      const mine = n.pins.find((q) => q.user === m.user);
      return !!mine && mine.cents === a.cents && mine.at === m.time && n.pins.filter((q) => q.user !== m.user).length === p.pins.filter((q) => q.user !== m.user).length;
    },
    "unpin removes only yours": (p, n, a, m) => a.t !== "unpin" || p === n || (!n.pins.some((q) => q.user === m.user) && n.pins.length === p.pins.length - 1),
    "a drop lands the new price": (p, n, a, m) => a.t !== "drop" || p === n || (now(n) === a.cents && n.prices.length === p.prices.length + 1 && n.dropAt === m.time),
    "a drop into a pin picks the winner": (p, n, a) => a.t !== "drop" || p === n || (winner(p.pins, a.cents)?.user ?? null) === (n.first?.user ?? null),
    "once someone has first dibs it stays": (p, n) => p.first === null || n.first === p.first,
    "pins never move the price": (p, n, a) => a.t === "drop" || n.prices === p.prices,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (x < 0.75) return { t: "pin", cents: (1 + r.int(Math.max(1, top(s) / 100))) * 100 };
    if (x < 0.9 && s.pins.some((p) => p.user === user)) return { t: "unpin" };
    return { t: "drop", cents: Math.max(100, now(s) - (1 + r.int(8)) * 500) };
  },

  local: { cents: 0, drag: false, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const mine = s.pins.find((q) => q.user === me) ?? null;
    const proj = nextDrop(s);
    const handle = local.cents || mine?.cents || proj;
    const lo = floorOf(s), hi = top(s);
    const RX = Math.round(W * 0.64);
    const Y0 = 22, Y1 = H - 16;
    const yOf = (cents: number) => Y0 + ((hi - cents) / Math.max(1, hi - lo)) * (Y1 - Y0);
    const centsAt = (y: number) => Math.max(Math.max(100, lo), Math.min(hi, Math.round((hi - ((y - Y0) / (Y1 - Y0)) * (hi - lo)) / 500) * 500));
    const nameOf = (q: Pin) => members.find((x) => x.id === q.user)?.name ?? q.name;
    const dropK = s.dropAt ? running(s.dropAt, 900) : null;
    const tagW = Math.min(150, W * 0.42);
    const fresh = s.first && running(s.first.at, 2600) !== null;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const fam = theme.type.family;
      // the wall
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.roundRect(0, 0, f.width, H, 12);
      g.fill();
      // nail and string
      const nx = 14 + tagW / 2, ny = 14;
      const swing = dropK !== null ? Math.sin(dropK / 90) * 0.16 * (1 - dropK / 900) : Math.sin(f.now / 1400) * 0.02;
      g.fillStyle = mix(c.secondaryText, c.card, 0.2);
      g.beginPath();
      g.arc(nx, ny, 4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(nx, ny);
      g.rotate(swing);
      g.strokeStyle = mix(p.brown, c.card, 0.25);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-12, 26);
      g.moveTo(0, 0);
      g.lineTo(12, 26);
      g.stroke();
      // the tag: a card with a clipped top and a hole
      const tw = tagW, th = H - 46, tx = -tw / 2, ty = 22;
      g.fillStyle = p.cream;
      g.beginPath();
      g.moveTo(tx + 22, ty);
      g.lineTo(tx + tw - 22, ty);
      g.lineTo(tx + tw, ty + 22);
      g.lineTo(tx + tw, ty + th - 8);
      g.quadraticCurveTo(tx + tw, ty + th, tx + tw - 8, ty + th);
      g.lineTo(tx + 8, ty + th);
      g.quadraticCurveTo(tx, ty + th, tx, ty + th - 8);
      g.lineTo(tx, ty + 22);
      g.closePath();
      g.fill();
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.arc(0, ty + 10, 5, 0, Math.PI * 2);
      g.fill();
      const ink = dark ? c.card : c.text;
      const soft = dark ? mix(c.card, p.cream, 0.25) : c.secondaryText;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const nm = fitText(s.item, tw - 16, { g, size: 13, weight: 600, min: 9, family: fam });
      g.font = nm.font;
      g.fillStyle = ink;
      g.fillText(nm.text, 0, ty + 30);
      // old prices, crossed out
      const olds = s.prices.slice(0, -1).slice(-3);
      olds.forEach((cents, i) => {
        const yy = ty + 50 + i * 18;
        const t = fitText(money(cents), tw - 30, { g, size: 14, weight: 500, min: 9, family: fam });
        g.font = t.font;
        g.fillStyle = soft;
        g.fillText(t.text, 0, yy);
        const w = g.measureText(t.text).width;
        g.strokeStyle = p.red;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-w / 2 - 3, yy + 2);
        g.lineTo(w / 2 + 3, yy - 2);
        g.stroke();
      });
      const cur = fitText(money(now(s)), tw - 16, { g, size: 30, weight: 800, min: 14, family: fam });
      g.font = cur.font;
      g.fillStyle = dropK !== null ? p.red : ink;
      g.fillText(cur.text, 0, ty + th - 26);
      g.restore();

      // the ruler
      g.strokeStyle = c.divider;
      g.lineWidth = 6;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(RX, Y0);
      g.lineTo(RX, Y1);
      g.stroke();
      g.lineCap = "butt";
      g.textAlign = "left";
      const step = hi - lo > 15000 ? 5000 : 2000;
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        const y = yOf(v);
        if (!s.first && Math.abs(y - yOf(handle)) < 14) continue;
        g.strokeStyle = c.secondaryText;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(RX + 4, y);
        g.lineTo(RX + 9, y);
        g.stroke();
        const l = fitText(money(v), f.width - RX - 14, { g, size: 10, weight: 400, min: 8, family: fam });
        g.font = l.font;
        g.fillStyle = c.secondaryText;
        g.fillText(l.text, RX + 12, y);
      }
      // where the price has been: a stair down the ruler
      g.strokeStyle = p.red;
      g.lineWidth = 2;
      g.beginPath();
      s.prices.forEach((cents, i) => {
        const y = yOf(cents);
        if (i === 0) g.moveTo(RX - 3, y);
        else g.lineTo(RX - 3, y);
      });
      g.stroke();
      g.fillStyle = p.red;
      g.beginPath();
      for (const cents of s.prices.slice(0, -1)) {
        g.moveTo(RX + 1, yOf(cents));
        g.arc(RX - 3, yOf(cents), 4, 0, Math.PI * 2);
      }
      g.fill();
      // now
      const ny2 = yOf(now(s));
      g.fillStyle = c.text;
      g.beginPath();
      g.roundRect(RX - 10, ny2 - 2, 20, 4, 2);
      g.fill();
      // the next drop at this pace
      if (!s.first && proj < now(s) && proj >= lo) {
        g.setLineDash([3, 3]);
        g.strokeStyle = c.secondaryText;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(RX - 10, yOf(proj));
        g.lineTo(RX + 10, yOf(proj));
        g.stroke();
        g.setLineDash([]);
      }
      // pin sticks
      g.strokeStyle = c.secondaryText;
      g.lineWidth = 1.5;
      g.beginPath();
      for (const q of s.pins) {
        if (q.user === me) continue;
        g.moveTo(RX - 14, yOf(q.cents));
        g.lineTo(RX - 2, yOf(q.cents));
      }
      g.stroke();
      // my handle
      if (!s.first) {
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(RX - 2, yOf(handle));
        g.lineTo(RX + 18, yOf(handle));
        g.stroke();
      }
      return true;
    };

    // faces next to the ruler; stack sideways when prices are close
    const placed: { q: Pin; x: number; y: number }[] = [];
    for (const q of [...s.pins].filter((x) => x.user !== me || s.first).sort((a, b) => b.cents - a.cents)) {
      const y = yOf(q.cents);
      let x = RX - 26;
      while (placed.some((o) => Math.abs(o.y - y) < 20 && Math.abs(o.x - x) < 20)) x -= 20;
      placed.push({ q, x, y });
    }
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (s.first) return;
      if (e.type === "down") {
        if (e.x > RX - 40) setLocal({ drag: true, cents: centsAt(e.y) });
      } else if (e.type === "move") {
        if (local.drag) setLocal({ cents: centsAt(e.y) });
      } else setLocal({ drag: false });
    };

    const firstName = s.first ? (s.first.user === me ? "You" : members.find((x) => x.id === s.first!.user)?.name ?? s.pins.find((q) => q.user === s.first!.user)?.name ?? "Someone") : "";
    const quote = [...s.pins].reverse().find((q) => q.said);
    const unset = !mine || (local.cents && local.cents !== mine.cents);
    const wouldDrop = local.cents > 0 && local.cents < now(s);

    return (
      <div>
        <CardHeader title={`Watching ${s.item.toLowerCase()}`} subtitle={`${money(now(s))} now${s.listed ? ` · ${s.listed}` : ""} · ${s.prices.length - 1} ${s.prices.length === 2 ? "drop" : "drops"}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`${s.item} price tag, ${money(now(s))} now, was ${money(top(s))}; ${s.pins.length} pins`} draw={draw} onPointer={onPointer} />
          {placed.map(({ q, x, y }) => (
            <div key={q.user} style={{ position: "absolute", left: x - 11, top: y - 11, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${s.first?.user === q.user ? p.green : c.card}`, pointerEvents: "none" }}>
              <Avatar user={{ id: q.user, name: nameOf(q) }} size={22} />
            </div>
          ))}
          {!s.first ? (
            <div style={{ position: "absolute", left: RX + 14, top: yOf(handle) - 13, display: "flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 2px", borderRadius: 14, background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, lineHeight: "22px", whiteSpace: "nowrap", pointerEvents: "none" }}>
              <Avatar user={me} size={22} />
              {money(handle)}
            </div>
          ) : null}
          {s.first ? (
            <div style={{ position: "absolute", left: RX - 70, right: 6, top: yOf(now(s)) - 50, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ padding: "2px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", transform: "rotate(-3deg)" }}>{`${firstName} ${s.first.user === me ? "message" : "messages"} first`}</span>
            </div>
          ) : null}
          {fresh ? (
            <div style={{ position: "absolute", left: RX - 60, width: 100, top: yOf(now(s)) - 10, pointerEvents: "none" }}>
              <Burst key={s.first!.at} emoji="📩" />
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote)} at ${money(quote.cents)}: “${quote.said}”` : `At this pace the next drop is about ${money(proj)}`}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: s.first || mine ? c.text : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.first
              ? `Dropped to ${money(now(s))} · ${firstName === "You" ? "your" : `${firstName}'s`} pin was ${money(s.first.cents)}`
              : mine
                ? `Your pin ${money(mine.cents)} · ${winner(s.pins, mine.cents)?.user === me ? "first in line at that price" : "someone's pin is higher"}`
                : s.pins.length
                  ? `${s.pins.length} ${s.pins.length === 1 ? "pin" : "pins"} · drag yours on the ruler`
                  : "Drag your pin to what you'd pay"}
          </span>
          {!s.first && wouldDrop ? (
            <Button kind="secondary" onClick={() => { dispatch({ t: "drop", cents: local.cents }); setLocal({ cents: 0, toast: local.toast + 1, msg: `Logged a drop to ${money(local.cents)}` }); }}>
              Log drop
            </Button>
          ) : null}
          {!s.first && unset ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "pin", cents: handle }); haptic("light"); setLocal({ cents: 0, toast: local.toast + 1, msg: `Pinned at ${money(handle)}` }); }}>
              {`Pin ${money(handle)}`}
            </Button>
          ) : !s.first && mine ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "unpin" })}>
              Unpin
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
