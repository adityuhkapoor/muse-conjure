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
  tween,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Lease divvy: the lease ends and the things you bought together need homes. They sit on the
// kitchen table with the roommates around it; tap a thing and bid. The keeper pays everyone else
// their share of the bid. Divvy it and each thing slides across the table to its new owner.

type Kind = "tv" | "couch" | "airfryer" | "cooker" | "lamp" | "rug" | "plant" | "speaker" | "box";
type Params = {
  /** The apartment */
  place: string;
  /** When the lease ends */
  ends: string;
  /** 2 to 6 roommates who chipped in */
  roommates: string[];
  /** 1 to 6 shared things */
  items: { name: string; kind: Kind }[];
  /** Bids so far: item index, who, cents, and a line */
  bids: { item: number; who: string; cents: number; said?: string }[];
};

// @params
const P: Params = {
  place: "412 Pine",
  ends: "lease ends May 31",
  roommates: ["Aditya", "Calvin", "Arun", "Will"],
  items: [
    { name: "TV", kind: "tv" },
    { name: "Couch", kind: "couch" },
    { name: "Air fryer", kind: "airfryer" },
    { name: "Rice cooker", kind: "cooker" },
  ],
  bids: [
    { item: 0, who: "Calvin", cents: 12000 },
    { item: 1, who: "Will", cents: 6000, said: "the sube can fit it if we take the seats out" },
    { item: 3, who: "Will", cents: 4000 },
    { item: 3, who: "Arun", cents: 4100, said: "+$1. always +$1." },
  ],
};
// @end params

const KINDS: Kind[] = ["tv", "couch", "airfryer", "cooker", "lamp", "rug", "plant", "speaker", "box"];
type Bid = { user: string; cents: number; at: number; said: string };
type Item = { name: string; kind: Kind; bids: Bid[] };
type State = { place: string; ends: string; mates: { id: string; name: string }[]; items: Item[]; settledAt: number };
type Action = { t: "bid"; item: number; cents: number } | { t: "settle" };
type Local = { sel: number; add: number; toast: number; msg: string };

const H = 214;
const SLIDE = 900;
const slide = tween({ duration: SLIDE, easing: "standard" });
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const topBid = (it: Item) => it.bids.reduce<Bid | null>((b, x) => (!b || x.cents > b.cents ? x : b), null);
const isMate = (s: State, u: string) => s.mates.some((m) => m.id === u);

/** What each roommate pays (negative) or gets (positive) once every thing goes to its top bidder. */
function balances(s: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of s.mates) out[m.id] = 0;
  const n = s.mates.length;
  for (const it of s.items) {
    const b = topBid(it);
    if (!b) continue;
    const share = Math.floor(b.cents / n);
    let extra = b.cents - share * n;
    for (const m of s.mates) {
      if (m.id === b.user) continue;
      const cut = share + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      out[m.id] = (out[m.id] ?? 0) + cut;
      out[b.user] = (out[b.user] ?? 0) - cut;
    }
  }
  return out;
}
/** Fewest payments that settle the balances. */
function payments(s: State): { from: string; to: string; cents: number }[] {
  const bal = balances(s);
  const pay = Object.entries(bal).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const get = Object.entries(bal).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: { from: string; to: string; cents: number }[] = [];
  let i = 0, j = 0;
  while (i < pay.length && j < get.length) {
    const x = Math.min(pay[i]!.v, get[j]!.v);
    if (x > 0) out.push({ from: pay[i]!.id, to: get[j]!.id, cents: x });
    pay[i]!.v -= x;
    get[j]!.v -= x;
    if (pay[i]!.v === 0) i++;
    if (get[j]!.v === 0) j++;
  }
  return out;
}

function initState(ctx: Ctx): State {
  const mates: { id: string; name: string }[] = [];
  for (const r of Array.isArray(P.roommates) ? P.roommates : []) {
    const name = clean(r, 20);
    if (!name || mates.length >= 6) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    const id = m ? m.id : `o:${name}`;
    if (!mates.some((x) => x.id === id)) mates.push({ id, name });
  }
  if (mates.filter((x) => !x.id.startsWith("o:")).length < 2 && ctx.members.length >= 2) {
    mates.length = 0;
    for (const m of ctx.members.slice(0, 6)) mates.push({ id: m.id, name: clean(m.name, 20) || "Roommate" });
  }
  const items: Item[] = [];
  for (const it of Array.isArray(P.items) ? P.items : []) {
    const name = clean(it?.name, 18);
    if (name && items.length < 6) items.push({ name, kind: KINDS.includes(it.kind) ? it.kind : "box", bids: [] });
  }
  if (!items.length) items.push({ name: "TV", kind: "tv", bids: [] });
  for (const b of Array.isArray(P.bids) ? P.bids : []) {
    const it = items[b?.item as number];
    const who = clean(b?.who, 20);
    const mate = mates.find((m) => m.name.toLowerCase() === who.toLowerCase());
    if (!it || !mate || !Number.isInteger(b.cents) || b.cents < 100 || b.cents > 500_000) continue;
    const t = topBid(it);
    if (t && b.cents <= t.cents) continue;
    it.bids = [...it.bids.filter((x) => x.user !== mate.id), { user: mate.id, cents: b.cents, at: 0, said: clean(b.said, 48) }];
  }
  return { place: clean(P.place, 24) || "the apartment", ends: clean(P.ends, 28), mates, items, settledAt: 0 };
}

function drawItem(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, s: number, t: Theme) {
  const p = pal(t);
  const c = t.color;
  const u = s / 40;
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  switch (kind) {
    case "tv":
      g.fillStyle = p.dark;
      g.beginPath();
      g.roundRect(-20, -14, 40, 24, 3);
      g.fill();
      g.fillStyle = mix(p.blue, p.sky, 0.4);
      g.beginPath();
      g.roundRect(-17, -11, 34, 18, 2);
      g.fill();
      g.fillStyle = p.dark;
      g.fillRect(-6, 10, 12, 3);
      g.fillRect(-12, 13, 24, 3);
      break;
    case "couch":
      g.fillStyle = mix(p.leaf, p.dark, 0.1);
      g.beginPath();
      g.roundRect(-20, -10, 40, 14, 5);
      g.fill();
      g.fillStyle = p.leaf;
      g.beginPath();
      g.roundRect(-22, -2, 8, 14, 3);
      g.roundRect(14, -2, 8, 14, 3);
      g.roundRect(-15, 1, 30, 10, 3);
      g.fill();
      break;
    case "airfryer":
      g.fillStyle = mix(p.dark, c.secondaryText, 0.3);
      g.beginPath();
      g.roundRect(-13, -16, 26, 32, 8);
      g.fill();
      g.fillStyle = mix(p.dark, c.card, 0.15);
      g.beginPath();
      g.roundRect(-10, 0, 20, 12, 3);
      g.fill();
      g.fillStyle = p.orange;
      g.beginPath();
      g.arc(0, -8, 3.5, 0, Math.PI * 2);
      g.fill();
      break;
    case "cooker":
      g.fillStyle = mix(p.cream, c.card, 0.15);
      g.beginPath();
      g.ellipse(0, 3, 17, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.red, c.card, 0.2);
      g.beginPath();
      g.ellipse(0, -7, 15, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.dark;
      g.beginPath();
      g.roundRect(-4, -15, 8, 4, 2);
      g.fill();
      break;
    case "lamp":
      g.fillStyle = p.yellow;
      g.beginPath();
      g.moveTo(-10, -4);
      g.lineTo(10, -4);
      g.lineTo(6, -16);
      g.lineTo(-6, -16);
      g.closePath();
      g.fill();
      g.fillStyle = mix(c.secondaryText, c.card, 0.2);
      g.fillRect(-1.5, -4, 3, 16);
      g.fillRect(-8, 12, 16, 3);
      break;
    case "rug":
      g.fillStyle = mix(p.purple, c.card, 0.3);
      g.beginPath();
      g.roundRect(-20, -12, 40, 24, 3);
      g.fill();
      g.fillStyle = mix(p.yellow, c.card, 0.2);
      g.fillRect(-12, -12, 6, 24);
      g.fillRect(6, -12, 6, 24);
      break;
    case "plant":
      g.fillStyle = p.green;
      g.beginPath();
      g.ellipse(-6, -8, 8, 5, -0.5, 0, Math.PI * 2);
      g.ellipse(6, -10, 8, 5, 0.5, 0, Math.PI * 2);
      g.ellipse(0, -15, 5, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.orange, p.brown, 0.3);
      g.beginPath();
      g.moveTo(-9, -3);
      g.lineTo(9, -3);
      g.lineTo(6, 14);
      g.lineTo(-6, 14);
      g.closePath();
      g.fill();
      break;
    case "speaker":
      g.fillStyle = p.dark;
      g.beginPath();
      g.roundRect(-11, -17, 22, 34, 4);
      g.fill();
      g.fillStyle = mix(p.dark, c.card, 0.35);
      g.beginPath();
      g.arc(0, 5, 7, 0, Math.PI * 2);
      g.arc(0, -9, 4, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      g.fillStyle = p.crust;
      g.fillRect(-16, -12, 32, 26);
      g.fillStyle = mix(p.crust, c.card, 0.4);
      g.fillRect(-4, -12, 8, 26);
  }
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Lease divvy",
  summary: (s) => {
    const bid = s.items.filter((i) => i.bids.length).length;
    return s.settledAt ? `${s.place} stuff divvied · ${payments(s).length} payments settle it` : `${s.place}: ${bid} of ${s.items.length} shared things have a bid`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !isMate(s, m.user) || s.settledAt) return s;
    if (a.t === "bid") {
      const it = s.items[a.item];
      if (typeof a.item !== "number" || !it || !Number.isInteger(a.cents) || a.cents % 100 !== 0 || a.cents > 500_000) return s;
      const t = topBid(it);
      if (a.cents <= (t ? t.cents : 0)) return s;
      const nb = [...it.bids.filter((b) => b.user !== m.user), { user: m.user, cents: a.cents, at: m.time, said: "" }];
      return { ...s, items: s.items.map((x, i) => (i === a.item ? { ...x, bids: nb } : x)) };
    }
    if (a.t === "settle") {
      if (!s.items.every((i) => i.bids.length > 0)) return s;
      return { ...s, settledAt: m.time };
    }
    return s;
  },

  invariants: {
    "one bid per roommate per thing": (s) => s.items.every((i) => new Set(i.bids.map((b) => b.user)).size === i.bids.length),
    "only roommates bid": (s) => s.items.every((i) => i.bids.every((b) => isMate(s, b.user))),
    "bids are whole dollars": (s) => s.items.every((i) => i.bids.every((b) => Number.isInteger(b.cents) && b.cents > 0 && b.cents % 100 === 0)),
    "the money nets to zero": (s) => Object.values(balances(s)).reduce((a, b) => a + b, 0) === 0,
    "every thing has a keeper once divvied": (s) => !s.settledAt || s.items.every((i) => topBid(i) !== null),
    "payments cover every share": (s) => {
      const bal = balances(s);
      const got: Record<string, number> = {};
      for (const p of payments(s)) {
        got[p.from] = (got[p.from] ?? 0) - p.cents;
        got[p.to] = (got[p.to] ?? 0) + p.cents;
      }
      return Object.entries(bal).every(([id, v]) => (got[id] ?? 0) === v);
    },
  },

  transitions: {
    "a bid tops the table": (p, n, a, m) => {
      if (a.t !== "bid" || p === n) return true;
      const t = topBid(n.items[a.item]!);
      return !!t && t.user === m.user && t.cents === a.cents && t.at === m.time && a.cents > (topBid(p.items[a.item]!)?.cents ?? 0);
    },
    "a bid touches one thing": (p, n, a) => a.t !== "bid" || n.items.filter((x, i) => x !== p.items[i]).length <= 1,
    "a bid keeps everyone else's": (p, n, a, m) =>
      a.t !== "bid" || p === n || p.items[a.item]!.bids.filter((b) => b.user !== m.user).every((b) => n.items[a.item]!.bids.some((x) => x.user === b.user && x.cents === b.cents)),
    "divvied is final": (p, n) => !p.settledAt || n === p,
    "divvying keeps the bids": (p, n, a, m) => a.t !== "settle" || p === n || (n.items === p.items && n.settledAt === m.time),
    "only roommates in the chat act": (p, n, _a, m, ctx) => p === n || (inChat(ctx, m.user) && isMate(p, m.user)),
  },

  arbitrary: (s, _u, r) => {
    if (r.next() < 0.08) return { t: "settle" };
    const item = r.int(s.items.length);
    const t = topBid(s.items[item]!);
    return { t: "bid", item, cents: (t ? t.cents : 0) + (1 + r.int(4)) * 500 - (r.next() < 0.1 ? 1000 : 0) };
  },

  local: { sel: -1, add: 0, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const n = s.items.length;
    const nm = s.mates.length;
    const cx = W / 2, cy = H / 2;
    const TW = Math.min(W - 96, 300), TH = 128;
    const cols = n <= 4 ? Math.min(n, 2) : 3;
    const rows = Math.ceil(n / cols);
    const spot = (i: number) => ({ x: cx - TW / 2 + (TW / cols) * ((i % cols) + 0.5), y: cy - TH / 2 + (TH / rows) * (Math.floor(i / cols) + 0.5) - 8 });
    /** Seats around the table: left, top, right, bottom, then the corners. */
    const seat = (k: number) => {
      const ring = [
        { x: cx - TW / 2 - 26, y: cy },
        { x: cx, y: cy - TH / 2 - 22 },
        { x: cx + TW / 2 + 26, y: cy },
        { x: cx, y: cy + TH / 2 + 22 },
        { x: cx - TW / 2 - 26, y: cy - TH / 2 + 10 },
        { x: cx + TW / 2 + 26, y: cy + TH / 2 - 10 },
      ];
      return ring[k % ring.length]!;
    };
    const iAmMate = isMate(s, me);
    const sel = local.sel >= 0 && local.sel < n ? local.sel : 0;
    const selTop = topBid(s.items[sel]!);
    const next = (selTop ? selTop.cents : 0) + 500 + local.add * 500;
    const allBid = s.items.every((i) => i.bids.length > 0);
    const sk = s.settledAt ? running(s.settledAt, SLIDE + 1600) : null;
    const e = s.settledAt ? (sk === null ? 1 : slide(Math.min(sk, SLIDE))) : 0;
    const nameOf = (id: string) => s.mates.find((m) => m.id === id)?.name ?? members.find((x) => x.id === id)?.name ?? "Someone";
    const who = (id: string) => (id.startsWith("o:") ? { id, name: nameOf(id) } : id);
    const pos = (i: number) => {
      const a = spot(i);
      const t = topBid(s.items[i]!);
      if (!s.settledAt || !t) return { ...a, sc: 1 };
      const k = s.mates.findIndex((m) => m.id === t.user);
      const b = seat(Math.max(0, k));
      const stack = s.items.slice(0, i).filter((x) => topBid(x)?.user === t.user).length;
      const off = (stack % 2 ? 1 : -1) * Math.ceil(stack / 2) * 56;
      const side = Math.abs(b.x - cx) > Math.abs(b.y - cy);
      const bx = side ? b.x + (b.x < cx ? 62 : -62) : b.x + off, by = side ? b.y - 8 + off * 0.6 : b.y + (b.y < cy ? 44 : -50);
      return { x: a.x + (bx - a.x) * e, y: a.y + (by - a.y) * e, sc: 1 - 0.2 * e };
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // floor
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.roundRect(0, 0, f.width, H, 12);
      g.fill();
      // chairs at each seat
      g.fillStyle = dark ? mix(p.brown, c.wash, 0.4) : mix(p.brown, c.card, 0.55);
      g.beginPath();
      for (let k = 0; k < nm; k++) {
        const st = seat(k);
        g.moveTo(st.x + 20, st.y);
        g.arc(st.x, st.y, 20, 0, Math.PI * 2);
      }
      g.fill();
      // the table, with grain
      const wood = dark ? mix(p.brown, c.wash, 0.15) : mix(p.brown, c.card, 0.3);
      g.fillStyle = mix(wood, p.dark, 0.25);
      g.beginPath();
      g.roundRect(cx - TW / 2 + 3, cy - TH / 2 + 5, TW, TH, 14);
      g.fill();
      g.fillStyle = wood;
      g.beginPath();
      g.roundRect(cx - TW / 2, cy - TH / 2, TW, TH, 14);
      g.fill();
      g.strokeStyle = mix(wood, p.dark, 0.12);
      g.lineWidth = 1;
      g.beginPath();
      for (let y = cy - TH / 2 + 14; y < cy + TH / 2 - 6; y += 13) {
        g.moveTo(cx - TW / 2 + 12, y);
        g.bezierCurveTo(cx - TW / 6, y + 3, cx + TW / 6, y - 3, cx + TW / 2 - 12, y + 1);
      }
      g.stroke();
      // selected spot
      if (!s.settledAt) {
        const a = spot(sel);
        g.fillStyle = mix(c.card, wood, 0.35);
        g.beginPath();
        g.ellipse(a.x, a.y + 2, 30, 24, 0, 0, Math.PI * 2);
        g.fill();
      }
      // the things
      s.items.forEach((it, i) => {
        const q = pos(i);
        drawItem(g, it.kind, q.x, q.y, 40 * q.sc, theme);
      });
      return sk !== null;
    };

    const chips = s.items.map((it, i) => {
      const q = pos(i);
      const t = topBid(it);
      if (s.settledAt) {
        if (e < 1 || !t) return null;
        return (
          <div key={i} style={{ position: "absolute", left: q.x - 40, width: 80, top: q.y + 14, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ maxWidth: 80, padding: "0 6px", borderRadius: 8, background: c.card, color: c.text, fontSize: 11, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
          </div>
        );
      }
      const label = t ? `${money(t.cents)} · ${nameOf(t.user)}` : "no bids";
      const tw = Math.min(TW / cols - 6, 104);
      return (
        <button
          key={i}
          aria-label={`${it.name}: ${t ? `${nameOf(t.user)} at ${money(t.cents)}` : "no bids yet"}`}
          onClick={() => setLocal({ sel: i, add: 0 })}
          style={{ position: "absolute", left: q.x - tw / 2, top: q.y - 26, width: tw, height: 58, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <span style={{ maxWidth: tw, padding: "0 6px", borderRadius: 8, background: i === sel ? c.primary : c.card, color: i === sel ? c.onPrimary : t ? c.text : c.secondaryText, fontSize: 11, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fitText(label, tw - 12, { size: 11, min: 10, weight: 600 }).text}
          </span>
        </button>
      );
    });
    const seats = s.mates.map((m, k) => {
      const st = seat(k);
      return (
        <div key={m.id} style={{ position: "absolute", left: st.x - 14, top: st.y - 14, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${m.id === me ? c.primary : c.card}`, pointerEvents: "none" }}>
          <Avatar user={who(m.id)} size={28} />
        </div>
      );
    });

    const pays = payments(s);
    const myBal = balances(s)[me] ?? 0;
    const latest = s.items.flatMap((it) => it.bids.map((b) => ({ ...b, item: it.name }))).filter((b) => b.said).slice(-1)[0];
    const bump = (d: number) => setLocal({ add: Math.max(0, local.add + d) });

    return (
      <div>
        <CardHeader title={`Who keeps what · ${s.place}`} subtitle={`${s.ends ? `${s.ends} · ` : ""}${nm} roommates split each bid`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Kitchen table with ${n} shared things and ${nm} roommates; ${s.items.filter((i) => i.bids.length).length} have bids`} draw={draw} />
          {seats}
          {chips}
          {s.settledAt && sk !== null && sk > SLIDE ? (
            <div style={{ position: "absolute", left: cx - 50, width: 100, top: cy - 20, pointerEvents: "none" }}>
              <Burst key={s.settledAt} emoji="📦" />
            </div>
          ) : null}
        </div>
        {s.settledAt ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 62, overflow: "hidden" }}>
            {pays.length ? (
              pays.slice(0, 4).map((q, k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 10px 0 4px", borderRadius: 14, background: q.from === me || q.to === me ? c.selected : c.wash, fontSize: 13, color: c.text, whiteSpace: "nowrap" }}>
                  <Avatar user={who(q.from)} size={20} />
                  <span style={{ color: c.secondaryText }}>pays</span>
                  <Avatar user={who(q.to)} size={20} />
                  <span style={{ fontWeight: 700 }}>{money(q.cents)}</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, lineHeight: "28px", color: c.text }}>Nobody owes anybody</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {latest ? `${nameOf(latest.user)} on the ${latest.item.toLowerCase()}: “${latest.said}”` : `Tap a thing, then bid · the keeper pays the other ${nm - 1} their share`}
          </div>
        )}
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 6 }}>
          {s.settledAt ? (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {iAmMate ? (myBal < 0 ? `Divvied · you pay ${money(-myBal)} in all` : myBal > 0 ? `Divvied · you get ${money(myBal)} in all` : "Divvied · you're even") : `Divvied · ${pays.length} payments`}
            </span>
          ) : iAmMate ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {allBid ? "" : `${s.items[sel]!.name}${selTop ? ` · top ${money(selTop.cents)}` : ""}`}
              </span>
              {(["−", "+"] as const).map((sym, k) => (
                <button key={sym} aria-label={k ? "Raise bid" : "Lower bid"} onClick={() => bump(k ? 1 : -1)} style={{ flex: "none", width: 44, height: 44, margin: "0 -4px", padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 32, height: 32, borderRadius: 16, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 18, fontWeight: 700, lineHeight: "32px", textAlign: "center" }}>{sym}</span>
                </button>
              ))}
              <Button kind={allBid ? "secondary" : "primary"} onClick={() => { dispatch({ t: "bid", item: sel, cents: next }); haptic("light"); setLocal({ add: 0 }); }}>
                {`Bid ${money(next)}`}
              </Button>
              {allBid ? (
                <Button kind="primary" onClick={() => { dispatch({ t: "settle" }); haptic("success"); }}>
                  Divvy it
                </Button>
              ) : null}
            </>
          ) : (
            <span style={{ flex: 1, fontSize: 13, color: c.secondaryText }}>Only the roommates on the lease bid</span>
          )}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
