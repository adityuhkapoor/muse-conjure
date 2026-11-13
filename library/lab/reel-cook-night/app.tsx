import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  Changed,
  Facepile,
  Locked,
  Toast,
  clock,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  spring,
  springs,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// Cook night from a reel: a recipe reel becomes a cook night. Friends claim the ingredients, vote a
// night, and once every ingredient is claimed anyone can lock it.

type Params = {
  reel: { from: string; note: string; account: string; title: string; plays: string };
  host: string;
  time: string;
  serves: number;
  costCents: number;
  items: { label: string; by: string }[];
  nights: { day: string; date: string; votes: string[] }[];
};

// @params
const P: Params = {
  reel: { from: "Dani", note: "We're making this", account: "cookwithjun", title: "15-min gochujang pasta", plays: "2.1M plays" },
  host: "Dani", time: "7pm", serves: 6, costCents: 4200,
  items: [
    { label: "Rigatoni", by: "Dani" }, { label: "Gochujang", by: "Dani" }, { label: "Heavy cream", by: "Theo" },
    { label: "Parmesan", by: "" }, { label: "Garlic", by: "Ana" }, { label: "Butter", by: "" },
    { label: "Scallions", by: "Ana" }, { label: "Red wine", by: "Marcus" }, { label: "Mochi", by: "" },
  ],
  nights: [
    { day: "Thu", date: "Nov 19", votes: ["Marcus"] },
    { day: "Fri", date: "Nov 20", votes: ["Dani", "Theo", "Ana"] },
    { day: "Sun", date: "Nov 22", votes: [] },
  ],
};
// @end params

type Item = { id: string; label: string; by: string | null; at: number };
type Night = { id: string; day: string; date: string; votes: string[] };
type State = {
  reel: Params["reel"];
  host: string;
  time: string;
  serves: number;
  costCents: number;
  items: Item[];
  nights: Night[];
  locked: { night: string; by: string; at: number } | null;
};
type Action = { t: "claim"; item: string } | { t: "vote"; night: string } | { t: "lock" };

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const winnerOf = (nights: Night[]): Night | null => {
  let best: Night | null = null;
  for (const n of nights) if (n.votes.length > 0 && (best === null || n.votes.length > best.votes.length)) best = n;
  return best;
};
const FULL_DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const it = (s: State, id: string) => s.items.find((x) => x.id === id);
const nt = (s: State, id: string) => s.nights.find((x) => x.id === id);
const votesWithout = (s: State, u: string) => JSON.stringify(s.nights.map((n) => [n.id, n.votes.filter((v) => v !== u)]));

export default defineApp<State, Action>({
  name: "Cook night",
  summary: (s) => {
    if (s.locked) {
      const n = nt(s, s.locked.night);
      return `Cook night locked: ${n?.day ?? ""} ${s.time} at ${s.host}'s`;
    }
    const claimed = s.items.filter((x) => x.by !== null).length;
    const lead = winnerOf(s.nights);
    return `Cook night at ${s.host}'s · ${claimed} of ${s.items.length} claimed${lead ? ` · ${lead.day} leads` : ""}`;
  },

  init: (ctx) => {
    const find = (name: string) => {
      const w = name.trim().toLowerCase();
      return w ? (ctx.members.find((m) => m.id === name || (m.name ?? "").toLowerCase() === w)?.id ?? null) : null;
    };
    const items: Item[] = [];
    for (const x of P.items ?? []) {
      const label = str(x?.label, 16);
      if (label && items.length < 9) items.push({ id: `i${items.length}`, label, by: find(typeof x.by === "string" ? x.by : ""), at: 0 });
    }
    if (!items.length) items.push({ id: "i0", label: "Groceries", by: null, at: 0 });
    const seen = new Set<string>();
    const nights: Night[] = [];
    for (const x of P.nights ?? []) {
      const day = str(x?.day, 4);
      if (!day || nights.length >= 3) continue;
      const votes: string[] = [];
      for (const v of x.votes ?? []) {
        const id = typeof v === "string" ? find(v) : null;
        if (id && !seen.has(id)) {
          seen.add(id);
          votes.push(id);
        }
      }
      nights.push({ id: `n${nights.length}`, day, date: str(x.date, 8), votes });
    }
    if (!nights.length) nights.push({ id: "n0", day: "Tonight", date: "", votes: [] });
    const serves = typeof P.serves === "number" && Number.isInteger(P.serves) && P.serves >= 1 && P.serves <= 20 ? P.serves : 4;
    const cost = typeof P.costCents === "number" && Number.isInteger(P.costCents) && P.costCents >= 0 && P.costCents <= 1_000_000 ? P.costCents : 0;
    const r = P.reel ?? ({} as Params["reel"]);
    return {
      reel: { from: str(r.from, 16), note: str(r.note, 30), account: str(r.account, 24), title: str(r.title, 40), plays: str(r.plays, 16) },
      host: str(P.host, 16),
      time: str(P.time, 8),
      serves,
      costCents: cost,
      items,
      nights,
      locked: null,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || s.locked !== null) return s;
    if (a.t === "claim") {
      const x = typeof a.item === "string" ? it(s, a.item) : undefined;
      if (!x) return s;
      if (x.by === null) return { ...s, items: s.items.map((y) => (y.id === x.id ? { ...y, by: m.user, at: m.time } : y)) };
      if (x.by === m.user) return { ...s, items: s.items.map((y) => (y.id === x.id ? { ...y, by: null, at: 0 } : y)) };
      return s;
    }
    if (a.t === "vote") {
      const target = typeof a.night === "string" ? nt(s, a.night) : undefined;
      if (!target) return s;
      const was = target.votes.includes(m.user);
      return {
        ...s,
        nights: s.nights.map((n) => {
          const rest = n.votes.filter((v) => v !== m.user);
          return n.id === target.id && !was ? { ...n, votes: [...rest, m.user] } : rest.length === n.votes.length ? n : { ...n, votes: rest };
        }),
      };
    }
    if (a.t === "lock") {
      const w = winnerOf(s.nights);
      if (!w || !s.items.every((x) => x.by !== null)) return s;
      return { ...s, locked: { night: w.id, by: m.user, at: m.time } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.locked) return s;
    const here = (u: string) => inChat(ctx, u);
    if (s.items.every((x) => x.by === null || here(x.by)) && s.nights.every((n) => n.votes.every(here))) return s;
    return {
      ...s,
      items: s.items.map((x) => (x.by !== null && !here(x.by) ? { ...x, by: null, at: 0 } : x)),
      nights: s.nights.map((n) => ({ ...n, votes: n.votes.filter(here) })),
    };
  },

  invariants: {
    "claims by people here": (s, ctx) => s.locked !== null || s.items.every((x) => x.by === null || inChat(ctx, x.by)),
    "one vote each": (s) => {
      const all = s.nights.flatMap((n) => n.votes);
      return new Set(all).size === all.length;
    },
    "voters are here": (s, ctx) => s.locked !== null || s.nights.every((n) => n.votes.every((v) => inChat(ctx, v))),
    "lock needs everything": (s) => s.locked === null || s.nights.some((n) => n.id === s.locked!.night),
    "item ids unique": (s) => new Set(s.items.map((x) => x.id)).size === s.items.length,
    "night ids unique": (s) => new Set(s.nights.map((n) => n.id)).size === s.nights.length,
    "claim time only on claimed items": (s) => s.items.every((x) => x.by !== null || x.at === 0),
  },

  transitions: {
    "claim takes an open item or frees mine": (p, n, a, m) =>
      a.t !== "claim" || n === p || (it(p, a.item)?.by === null && it(n, a.item)?.by === m.user) || (it(p, a.item)?.by === m.user && it(n, a.item)?.by === null),
    "claim touches one item": (p, n, a) => a.t !== "claim" || n === p || n.items.filter((x, i) => x !== p.items[i]).length === 1,
    "vote moves only me": (p, n, a, m) => a.t !== "vote" || n === p || votesWithout(p, m.user) === votesWithout(n, m.user),
    "I end up on at most one night": (_p, n, a, m) => a.t !== "vote" || n.nights.filter((x) => x.votes.includes(m.user)).length <= 1,
    "vote toggles the chosen night": (p, n, a, m) => a.t !== "vote" || n === p || nt(p, a.night)?.votes.includes(m.user) !== nt(n, a.night)?.votes.includes(m.user),
    "lock needs every item and a vote": (p, n, a, m) => {
      if (a.t !== "lock" || n === p) return true;
      const w = winnerOf(p.nights);
      return p.items.every((x) => x.by !== null) && n.locked?.by === m.user && !!w && n.locked.night === w.id;
    },
    "locked plans stay": (p, n) => p.locked === null || (n.locked === p.locked && n.items === p.items && n.nights === p.nights),
  },

  arbitrary: (s, _u, r) => {
    if (s.locked) return { t: "vote", night: r.pick(s.nights).id };
    if (s.items.every((x) => x.by !== null) && s.nights.some((n) => n.votes.length) && r.next() < 0.4) return { t: "lock" };
    if (r.next() < 0.6) {
      const open = s.items.filter((x) => x.by === null);
      return { t: "claim", item: r.pick(open.length ? open : s.items).id };
    }
    return { t: "vote", night: r.pick(s.nights).id };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const p = pal();
    const W = innerWidth();
    const now = clock.value;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const locked = state.locked;
    const total = state.items.length;
    const claimed = state.items.filter((x) => x.by !== null).length;
    const open = total - claimed;
    const winner = winnerOf(state.nights);
    const ready = open === 0 && winner !== null;
    const tw = Math.floor((W - 16) / 3);
    const lockedNight = locked ? nt(state, locked.night) : undefined;
    const cooks = new Set(state.items.map((x) => x.by).filter((x): x is string => x !== null)).size;
    const eachDollars = Math.round(state.costCents / state.serves / 100);
    const from: Member = members.find((m) => (m.name ?? "").toLowerCase() === state.reel.from.toLowerCase() || m.id === state.reel.from) ?? { id: `r:${state.reel.from}`, name: state.reel.from || "?" };
    const pop = spring(springs.iosBouncy);

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: typeof theme }) => {
      const pl = pal(f.theme);
      const Wc = f.width, Hc = f.height, t = f.now / 1000;
      const bg = g.createLinearGradient(0, 0, 0, Hc);
      bg.addColorStop(0, mix(pl.blue, pl.dark, 0.75));
      bg.addColorStop(1, pl.dark);
      g.fillStyle = bg;
      g.fillRect(0, 0, Wc, Hc);
      g.strokeStyle = pl.dark;
      g.lineWidth = 3;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(k * 70, 0);
        g.lineTo(k * 70 + 40, Hc);
        g.stroke();
      }
      const s = 74, k0 = 1;
      const cx = Wc / 2 + 30, cy = Hc / 2;
      g.fillStyle = pl.dark;
      g.beginPath();
      g.moveTo(cx - 0.9 * s, cy - 8);
      g.lineTo(cx - 2.2 * s, cy - 16);
      g.lineTo(cx - 2.2 * s, cy);
      g.lineTo(cx - 0.9 * s, cy + 8);
      g.closePath();
      g.fill();
      const disc = (r: number, fill: string, x = cx, y = cy) => {
        g.fillStyle = fill;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      disc(s, mix(pl.dark, pl.on, 0.08));
      disc(0.9 * s, mix(pl.dark, pl.on, 0.15));
      disc(0.82 * s, pl.red);
      g.globalAlpha = 0.5;
      disc(0.7 * s, pl.orange, cx - 10, cy - 10);
      g.globalAlpha = 1;
      for (let k = 0; k < 22; k++) {
        const a = k * 2.399 + t * 0.3;
        const r = 0.68 * s * Math.sqrt((k + 0.5) / 22);
        g.save();
        g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.rotate(a * 1.7);
        g.fillStyle = pl.crust;
        g.strokeStyle = pl.brown;
        g.lineWidth = 1;
        g.fillRect(-4 * k0, -9 * k0, 8 * k0, 18 * k0);
        g.strokeRect(-4 * k0, -9 * k0, 8 * k0, 18 * k0);
        g.restore();
      }
      g.globalAlpha = 0.6;
      g.strokeStyle = pl.cream;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, 0.45 * s, t * 1.2, t * 1.2 + 2.2);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = pl.cream;
      for (let k = 0; k < 16; k++) {
        const ph = (t * 0.5 + k * 0.13) % 1;
        g.globalAlpha = 1 - ph * 0.6;
        g.fillRect(cx - 40 + ((k * 37) % 80) + Math.sin(ph * Math.PI * 2 + k) * 4, -4 + ph * (s + 70), 2.5, 5);
      }
      g.globalAlpha = 1;
      for (let k = 0; k < 8; k++) disc(3, pl.green, cx + Math.cos(0.8 * k) * 0.35 * s, cy + Math.sin(0.8 * k) * 0.35 * s);
      g.fillStyle = pl.dark;
      for (let i = 0; i < 20; i++) {
        g.globalAlpha = (i + 1) / 20;
        g.fillRect(0, Hc - 60 + i * 3, Wc, 3);
      }
      g.globalAlpha = 1;
    };

    const icon = (label: string): Child => {
      const l = label.toLowerCase();
      const has = (re: RegExp) => re.test(l);
      let body: Child;
      if (has(/rigatoni|pasta|penne|noodle/)) {
        body = [7, 15, 23].map((x) => <rect key={x} x={x - 3} y={7} width={6} height={15} fill={p.yellow} stroke={p.crust} strokeWidth={1} transform={`rotate(23 ${x} 15)`} />);
      } else if (has(/cream|milk/)) {
        body = (
          <>
            <rect x={8} y={9} width={14} height={18} fill={p.paper} stroke={p.rim} />
            <path d="M8 9 L15 3 L22 9 Z" fill={p.rim} />
            <rect x={8} y={15} width={14} height={4} fill={p.blue} />
          </>
        );
      } else if (has(/parm|cheese/)) {
        body = (
          <>
            <path d="M3 25 L27 25 L20 10 Z" fill={p.yellow} stroke={p.crust} strokeWidth={1.2} />
            <circle cx={14} cy={21} r={1.5} fill={p.crust} />
            <circle cx={20} cy={21} r={1.5} fill={p.crust} />
            <circle cx={19} cy={16} r={1.5} fill={p.crust} />
          </>
        );
      } else if (has(/garlic/)) {
        body = (
          <>
            <circle cx={15} cy={17} r={10} fill={p.cream} />
            <line x1={15} y1={9} x2={15} y2={25} stroke={p.rim} strokeWidth={1.5} />
          </>
        );
      } else if (has(/butter/)) {
        body = <rect x={5} y={14} width={20} height={9} rx={2} fill={p.yellow} />;
      } else if (has(/scallion|onion|basil|herb/)) {
        body = [8, 15, 22].map((x, i) => (
          <g key={x}>
            <line x1={x} y1={4} x2={x - 3 + i * 0} y2={26} stroke={p.green} strokeWidth={3} strokeLinecap="round" />
            <line x1={x - 1} y1={16} x2={x - 3} y2={26} stroke={p.paper} strokeWidth={3} strokeLinecap="round" />
          </g>
        ));
      } else if (has(/wine|beer|soju/)) {
        body = (
          <>
            <rect x={11} y={10} width={8} height={18} rx={2} fill={p.dark} />
            <rect x={13} y={4} width={4} height={7} fill={p.dark} />
            <rect x={11} y={17} width={8} height={5} fill={p.cream} />
          </>
        );
      } else if (has(/mochi|dessert|cake|cookie/)) {
        body = (
          <>
            <circle cx={8} cy={20} r={5} fill={p.wall} />
            <circle cx={14} cy={16} r={5} fill={p.grass} />
            <circle cx={20} cy={20} r={5} fill={p.paper} stroke={p.rim} />
          </>
        );
      } else {
        body = (
          <>
            <rect x={4} y={11} width={22} height={16} rx={4} fill={p.red} />
            <rect x={3} y={6} width={24} height={5} rx={2} fill={p.brown} />
            <circle cx={15} cy={19} r={4} fill={p.yellow} />
          </>
        );
      }
      return (
        <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden="true" style={{ display: "block" }}>
          {body}
        </svg>
      );
    };

    const dayName = winner ? winner.day : "";
    const toastOn = !!locked && running(locked.at, 2400) !== null;
    const sub = [`serves ${state.serves}`, state.costCents > 0 ? `~$${eachDollars} each` : ""].filter(Boolean).join(" · ");

    const nightTile = (n: Night) => {
      const mine = n.votes.includes(me);
      const win = !!locked && locked.night === n.id;
      const style = {
        position: "relative" as const,
        width: tw,
        height: 54,
        boxSizing: "border-box" as const,
        borderRadius: 12,
        background: mine || win ? c.selected : c.card,
        border: `${win ? 1.5 : 1}px solid ${win ? c.positive : mine ? c.primary : c.divider}`,
        padding: 0,
        textAlign: "left" as const,
        font: "inherit",
        color: c.text,
        cursor: locked ? "default" : "pointer",
        flex: "none" as const,
      };
      const inner = (
        <>
          <span style={{ position: "absolute", left: 10, top: 8, fontSize: 15, lineHeight: "18px", color: c.text, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            {n.day}
            {win ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.positive} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l5 5L20 6" />
              </svg>
            ) : null}
          </span>
          <span style={{ position: "absolute", left: 10, top: 29, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{n.date}</span>
          {n.votes.length ? (
            <span style={{ position: "absolute", right: 8, top: 8, display: "flex" }}>
              <Facepile users={n.votes} max={3} size={18} />
            </span>
          ) : null}
          {n.votes.length ? <span style={{ position: "absolute", right: 10, bottom: 8, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{n.votes.length}</span> : null}
        </>
      );
      const label = `${n.day} ${n.date}, ${n.votes.length} ${n.votes.length === 1 ? "vote" : "votes"}`;
      return locked ? (
        <div key={n.id} aria-label={label} style={style}>
          {inner}
        </div>
      ) : (
        <button key={n.id} aria-label={label} aria-pressed={mine} onClick={() => dispatch({ t: "vote", night: n.id })} style={style}>
          {inner}
        </button>
      );
    };

    const tile = (x: Item, i: number) => {
      const mine = x.by === me;
      const free = x.by === null;
      const e = x.at ? running(x.at, 400) : null;
      const bounce = e === null ? 0 : (1 - e / 400) * Math.sin((e / 1000) * 30) * 3;
      const pe = x.at ? running(x.at, 350) : null;
      const popS = pe === null ? 1 : pop(pe);
      const f = fitText(x.label, tw - 14, { size: 13, min: 11 });
      const style = {
        position: "relative" as const,
        width: tw,
        height: 60,
        boxSizing: "border-box" as const,
        borderRadius: 12,
        background: free ? c.card : mine ? c.selected : c.input,
        border: free ? `1px dashed ${c.divider}` : "none",
        padding: 0,
        textAlign: "left" as const,
        font: "inherit",
        color: c.text,
        transform: bounce ? `translateY(${bounce}px)` : undefined,
        flex: "none" as const,
      };
      const pulse = 22 + Math.sin((now / 1000) * 3 + i) * 1.5;
      const inner = (
        <>
          <span style={{ position: "absolute", left: 8, top: 6, display: "flex" }}>{icon(x.label)}</span>
          <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: f.size, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>{f.text}</span>
          {x.by !== null ? (
            <span style={{ position: "absolute", right: 8, top: 6, display: "flex", borderRadius: 12, boxShadow: `0 0 0 2px ${c.card}`, transform: `scale(${popS})` }}>
              <Avatar user={x.by} size={22} />
            </span>
          ) : (
            <span style={{ position: "absolute", right: 8, top: 6, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: pulse, height: pulse, flex: "none", borderRadius: "50%", boxSizing: "border-box", border: `1.5px solid ${c.primary}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1, color: c.link }}>+</span>
            </span>
          )}
        </>
      );
      if (free && !locked) {
        return (
          <button key={x.id} aria-label={`Claim ${x.label}`} onClick={() => dispatch({ t: "claim", item: x.id })} style={{ ...style, cursor: "pointer" }}>
            {inner}
          </button>
        );
      }
      if (mine && !locked) {
        return (
          <button key={x.id} aria-label={`${x.label}, claimed by you`} onClick={() => dispatch({ t: "claim", item: x.id })} style={{ ...style, cursor: "pointer" }}>
            {inner}
          </button>
        );
      }
      return (
        <div key={x.id} aria-label={x.by === null ? x.label : `${x.label}, ${x.by === me ? "you have" : nameOf(x.by) + " has"} it`} style={style}>
          {inner}
        </div>
      );
    };

    return (
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: 168, borderRadius: 12, overflow: "hidden", backgroundColor: p.dark }}>
          <Canvas height={168} label={`Recipe reel: ${state.reel.title}`} draw={draw} />
          <div style={{ position: "absolute", left: 12, top: 12, height: 28, borderRadius: 14, padding: "0 10px 0 4px", background: p.dark, color: p.on, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, maxWidth: W - 24, boxSizing: "border-box" }}>
            <Avatar user={from} size={20} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{`${state.reel.from}: ${state.reel.note}`}</span>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 50, boxSizing: "border-box", padding: "4px 14px", background: p.dark, color: p.on }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.reel.title}</div>
            <div style={{ fontSize: 13, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[state.reel.account, state.reel.plays].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, height: 24, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke={c.primary} strokeWidth="3" style={{ flex: "none" }}>
            <circle cx="8" cy="8" r="6" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "0 1 auto" }}>{`Cook night at ${state.host}'s`}</span>
          <span style={{ marginLeft: "auto", fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", flex: "none" }}>{sub}</span>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>{state.nights.map(nightTile)}</div>

        <div style={{ marginTop: 12, height: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 15, color: c.text }}>Ingredients</span>
          <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{open === 0 ? "All claimed" : `${claimed} of ${total} claimed · tap to claim`}</span>
        </div>

        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: `repeat(3, ${tw}px)`, gap: 8 }}>{state.items.map(tile)}</div>

        <div style={{ marginTop: 12, height: 44, display: "flex", alignItems: "center" }}>
          {locked ? (
            <div style={{ flex: 1, margin: "-4px 0", minWidth: 0 }}>
              <Changed at={locked.at}>
                <Locked detail={`${state.host}'s · ${cooks} cooking`}>{`Locked · ${lockedNight?.day ?? ""} ${state.time}`}</Locked>
              </Changed>
            </div>
          ) : ready ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "lock" });
              }}
            >
              {`Lock ${dayName}`}
            </Button>
          ) : (
            <div style={{ flex: 1, height: 44, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600 }}>
              {open === 0 ? "Pick a night to lock it" : `${open} left to claim`}
            </div>
          )}
        </div>
        {toastOn && locked ? <Toast key={locked.at}>{`It's a plan: ${FULL_DAY[lockedNight?.day ?? ""] ?? lockedNight?.day ?? ""} at ${state.host}'s`}</Toast> : null}
      </div>
    );
  },
});
