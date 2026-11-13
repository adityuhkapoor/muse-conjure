import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Facepile,
  Thumb,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  thumbKind,
  tween,
  type Child,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Story poll plan: a friend's story asks "beach or hike Saturday?" and the sticker is stuck at a tie.
// Your tap decides it: the sticker squishes and grows into the winning plan card.

type Art = "beach" | "hike" | "plain";
type Opt = { label: string; art: Art; title: string; when: string; place: string; rows: [string, string][]; alt: string };

type Params = {
  /** Whose story: "Maya" */
  author: string;
  /** How long ago: "2h" */
  ago: string;
  /** Text over the picture: "sat plans??" */
  caption: string;
  /** The sticker's question: "Beach or hike Saturday?" */
  question: string;
  /** Total votes that decide it (unless tied), 2 to 50. */
  closeAt: number;
  /** Exactly two options, each with the plan it becomes and the names that voted for it. */
  options: (Opt & { voters: string[] })[];
};

// @params
const P: Params = {
  author: "Maya", ago: "2h", caption: "sat plans??", question: "Beach or hike Saturday?", closeAt: 9,
  options: [
    { label: "Beach", art: "beach", title: "Beach day it is", when: "Sat · 1:00 pm", place: "Ocean Beach · fire pit #7",
      rows: [["Getting there", "N-Judah, 40 min · meet 12:15"], ["Bringing", "Leo: speaker · Jess: s'mores"], ["Tides", "Low tide 2:40, sunset 5:01"]],
      alt: "sunset at Ocean Beach after?", voters: ["Maya", "Jess", "Leo", "Nico"] },
    { label: "Hike", art: "hike", title: "Hike it is", when: "Sat · 9:00 am", place: "Mt Tam · Dipsea Trail",
      rows: [["Trail", "6.8 mi · 2,200 ft · 3.5 hrs"], ["Carpool", "Kev's Civic, 4 seats · 8:15"], ["After", "Brunch in Mill Valley"]],
      alt: "short Lands End loop Sun?", voters: ["Sam", "Kev", "Priya", "Ana"] },
  ],
};
// @end params

type Seat = { name: string; id: string | null };
type Side = 0 | 1;
type State = {
  author: string;
  ago: string;
  caption: string;
  question: string;
  closeAt: number;
  options: [Opt, Opt];
  /** Seeded voters who are not in the chat, fixed, in arrival order. */
  outside: { name: string; side: Side }[];
  /** Everyone seeded, per side, in the order the story lists them (members carry their id). */
  roster: [Seat[], Seat[]];
  /** Chat members' votes; at is meta.time (0 when seeded). */
  votes: Record<string, { side: Side; at: number }>;
  /** 0 while open, else max(1, meta.time). */
  closedAt: number;
  /** null exactly while open. */
  winner: Side | null;
  /** Members who put the plan on their calendar. */
  cal: string[];
};
type Action = { t: "vote"; side: number } | { t: "cal" };
type Local = { cheers: number };

const PANEL_H = 556;
const MAX_OUTSIDE = 24;
const MORPH_AT = 1600;
const MORPH_MS = 700;
const END_MS = 2300;
const morph = tween({ duration: MORPH_MS, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const isMember = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const find = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.id.toLowerCase() === k || m.name.trim().toLowerCase() === k) : undefined;
};

function cleanOpt(raw: Partial<Opt> | undefined, fallback: string): Opt {
  const label = clean(raw?.label, 12) || fallback;
  const art: Art = raw?.art === "beach" || raw?.art === "hike" ? raw.art : "plain";
  const rows: [string, string][] = [];
  for (const r of Array.isArray(raw?.rows) ? raw.rows : []) {
    if (rows.length >= 3 || !Array.isArray(r)) continue;
    const a = clean(r[0], 14);
    const b = clean(r[1], 34);
    if (a || b) rows.push([a, b]);
  }
  return { label, art, title: clean(raw?.title, 22) || `${label} it is`, when: clean(raw?.when, 20), place: clean(raw?.place, 32), rows, alt: clean(raw?.alt, 44) };
}

function initState(ctx: Ctx): State {
  const given = Array.isArray(P.options) ? P.options : [];
  const options: [Opt, Opt] = [cleanOpt(given[0], "Yes"), cleanOpt(given[1], "No")];
  const outside: State["outside"] = [];
  const roster: [Seat[], Seat[]] = [[], []];
  const votes: State["votes"] = {};
  for (const side of [0, 1] as const) {
    const names = Array.isArray(given[side]?.voters) ? given[side]!.voters : [];
    for (const raw of names.slice(0, 16)) {
      const name = clean(raw, 20);
      if (!name) continue;
      const m = find(ctx, name);
      if (m) {
        if (votes[m.id]) continue;
        votes[m.id] = { side, at: 0 };
        roster[side].push({ name: m.name, id: m.id });
      } else if (outside.length < MAX_OUTSIDE) {
        outside.push({ name, side });
        roster[side].push({ name, id: null });
      }
    }
  }
  const closeAt = Number.isInteger(P.closeAt) ? Math.min(50, Math.max(2, P.closeAt)) : 9;
  return {
    author: clean(P.author, 16),
    ago: clean(P.ago, 6),
    caption: clean(P.caption, 24),
    question: clean(P.question, 40) || "This or that?",
    closeAt,
    options,
    outside,
    roster,
    votes,
    closedAt: 0,
    winner: null,
    cal: [],
  };
}

const count = (s: State, k: Side) => s.outside.filter((o) => o.side === k).length + Object.values(s.votes).filter((v) => v.side === k).length;
const decided = (s: State, ctx: Ctx) => {
  const a = count(s, 0);
  const b = count(s, 1);
  const allIn = ctx.members.length > 0 && ctx.members.every((m) => !!s.votes[m.id]);
  return a !== b && (a + b >= s.closeAt || allIn);
};

/** Who is on a side, in arrival order: the seeded roster, then members who voted later. */
function voters(s: State, k: Side, members: readonly Member[]): Member[] {
  const out: Member[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, avatar?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name, ...(avatar ? { avatar } : {}) });
  };
  for (const r of s.roster[k]) {
    if (r.id === null) add(`o:${r.name}`, r.name);
    else if (s.votes[r.id]?.side === k) {
      const m = members.find((x) => x.id === r.id);
      add(r.id, m?.name ?? r.name, m?.avatar);
    }
  }
  const later = Object.entries(s.votes)
    .filter(([, v]) => v.side === k && v.at > 0)
    .sort((x, y) => x[1].at - y[1].at);
  for (const [id] of later) {
    const m = members.find((x) => x.id === id);
    if (m) add(id, m.name, m.avatar);
  }
  return out;
}

const goingOf = (s: State, members: readonly Member[]): Member[] => {
  if (s.winner === null) return [];
  const out = voters(s, s.winner, members);
  for (const id of s.cal) {
    const m = members.find((x) => x.id === id);
    if (m && !out.some((x) => x.id === id)) out.push(m);
  }
  return out;
};

const dayOf = (when: string) => when.split(" · ")[0]!.trim();
const dayLong = (d: string) => ({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" })[d] ?? d;

// ---- The Golden Gate at golden hour (one canvas, the whole panel) ------------------------------

function ridge(base: number, amp: number, seed: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    out.push([u * 380, base - amp - amp * (0.5 * Math.sin(7 * u + seed) + 0.3 * Math.sin(13 * u + 2.1 * seed) + 0.12 * Math.sin(29 * u + seed))]);
  }
  return out;
}
const HILLS = ridge(400, 30, 1.3);

function drawBridge(g: CanvasRenderingContext2D, f: DrawFrame): boolean {
  const p = pal(f.theme);
  const t = f.now / 1000;
  const sc = Math.max(f.width / 380, f.height / 580);
  g.save();
  g.translate((f.width - 380 * sc) / 2, (f.height - 580 * sc) / 2);
  g.scale(sc, sc);
  g.globalAlpha = 1;

  const sky = g.createLinearGradient(0, 0, 0, 580);
  sky.addColorStop(0, mix(p.orange, p.yellow, 0.25));
  sky.addColorStop(1, p.purple);
  g.fillStyle = sky;
  g.fillRect(-120, -120, 620, 900);

  // Sun and its glow: stacked discs, so the fade needs no transparent colour stop.
  g.fillStyle = p.cream;
  for (let i = 0; i < 14; i++) {
    g.globalAlpha = 0.045;
    g.beginPath();
    g.arc(260, 330, 160 * (1 - i / 14), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = mix(p.yellow, p.cream, 0.5);
  g.beginPath();
  g.arc(260, 330, 40, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = mix(p.purple, p.dark, 0.45);
  g.beginPath();
  g.moveTo(-120, 700);
  g.lineTo(-120, HILLS[0]![1]);
  for (const [x, y] of HILLS) g.lineTo(x, y);
  g.lineTo(500, HILLS[40]![1]);
  g.lineTo(500, 700);
  g.fill();

  const water = g.createLinearGradient(0, 410, 0, 580);
  water.addColorStop(0, mix(p.purple, p.dark, 0.25));
  water.addColorStop(1, p.dark);
  g.fillStyle = water;
  g.fillRect(-120, 410, 620, 400);

  g.strokeStyle = p.cream;
  g.lineWidth = 2;
  g.globalAlpha = 0.3;
  g.beginPath();
  for (let k = 0; k < 14; k++) {
    const x = ((53 * k) % 300) + 8 * Math.sin(1.4 * t + 7 * k);
    g.moveTo(x, 420 + 12 * k);
    g.lineTo(x + 30, 420 + 12 * k);
  }
  g.stroke();
  g.globalAlpha = 1;

  // The bridge: deck, towers, cables, suspenders.
  g.fillStyle = p.red;
  g.fillRect(-120, 402, 620, 7);
  for (const tx of [90, 310]) {
    g.fillRect(tx - 9, 232, 6, 200);
    g.fillRect(tx + 3, 232, 6, 200);
    for (let k = 0; k < 4; k++) g.fillRect(tx - 9, 242 + 40 * k, 18, 6);
  }
  g.strokeStyle = p.red;
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.beginPath();
  const cable: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const pt: [number, number] = [90 + 220 * u, 234 + 150 * Math.sin(Math.PI * u)];
    cable.push(pt);
    if (i === 0) g.moveTo(pt[0], pt[1]);
    else g.lineTo(pt[0], pt[1]);
  }
  g.stroke();
  for (const [x0, y0, x1, y1] of [[-20, 382, 90, 234], [310, 234, 400, 372]] as const) {
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u + 10 * Math.sin(Math.PI * u);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 1;
  g.globalAlpha = 0.8;
  g.beginPath();
  cable.forEach(([x, y], i) => {
    if (i % 2 === 0) {
      g.moveTo(x, y);
      g.lineTo(x, 402);
    }
  });
  g.stroke();
  g.globalAlpha = 1;

  g.strokeStyle = p.dark;
  g.lineWidth = 1.6;
  g.lineJoin = "round";
  for (let k = 0; k < 3; k++) {
    const gx = ((14 * t + 120 * k) % 420) - 20;
    const gy = 170 + 26 * k + 4 * Math.sin(2 * t + k);
    const fl = 3 * Math.sin(6 * t + k);
    g.beginPath();
    g.moveTo(gx - 7, gy - fl);
    g.lineTo(gx, gy);
    g.lineTo(gx + 7, gy - fl);
    g.stroke();
  }
  g.restore();
  return true;
}

// ---- Small drawings ----------------------------------------------------------------------------

function Umbrella(a: { s: number; cx: number; cy: number; pole: string; canopy: string; wedge: string; sway?: boolean }): Child {
  const { s, cx, cy } = a;
  const top = [cx, cy - 0.6 * s] as const;
  const mid = [top[0], top[1] + 0.35 * s] as const;
  const r = 0.9 * s;
  const arc = (a0: number, a1: number) => `M${mid[0]} ${mid[1]}L${(mid[0] + r * Math.cos(a0)).toFixed(2)} ${(mid[1] + r * Math.sin(a0)).toFixed(2)}A${r} ${r} 0 0 1 ${(mid[0] + r * Math.cos(a1)).toFixed(2)} ${(mid[1] + r * Math.sin(a1)).toFixed(2)}Z`;
  return (
    <g>
      <line x1={top[0]} y1={top[1]} x2={cx} y2={cy + 0.8 * s} stroke={a.pole} stroke-width={Math.max(1.2, 0.08 * s)} />
      <g style={{ animation: a.sway ? "sppSway 4.2s ease-in-out infinite alternate" : "none" }}>
        <path d={arc(Math.PI, 2 * Math.PI)} fill={a.canopy} />
        {[0, 1, 2].map((k) => (
          <path key={k} d={arc(Math.PI + ((k + 0.33) * Math.PI) / 3, Math.PI + ((k + 0.66) * Math.PI) / 3)} fill={a.wedge} />
        ))}
      </g>
    </g>
  );
}

function Peak(a: { s: number; cx: number; cy: number; leaf: string; snow: string; front: string }): Child {
  const { s, cx, cy } = a;
  const pts = (xs: [number, number][]) => xs.map(([x, y]) => `${(cx + x * s).toFixed(2)},${(cy + y * s).toFixed(2)}`).join(" ");
  return (
    <g>
      <polygon points={pts([[-1, 0.7], [-0.1, -0.8], [0.9, 0.7]])} fill={a.leaf} />
      <polygon points={pts([[-0.38, -0.18], [-0.1, -0.8], [0.22, -0.2]])} fill={a.snow} />
      <polygon points={pts([[0.1, 0.7], [0.55, 0.05], [1.1, 0.7]])} fill={a.front} />
    </g>
  );
}

function SideIcon(a: { opt: Opt; theme: Theme }): Child {
  const p = pal(a.theme);
  if (a.opt.art === "beach")
    return (
      <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden="true">
        <Umbrella s={18} cx={18} cy={18} pole={p.brown} canopy={p.blue} wedge={p.on} sway />
      </svg>
    );
  if (a.opt.art === "hike")
    return (
      <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden="true">
        <Peak s={18} cx={18} cy={18} leaf={p.leaf} snow={p.on} front={mix(p.leaf, p.dark, 0.2)} />
      </svg>
    );
  return <Thumb kind={thumbKind(a.opt.label)} seed={a.opt.label} size={36} label="" />;
}

function ridgePath(base: number, amp: number, seed: number, w: number, h: number): string {
  const pts = ridge(base, amp, seed).map(([x, y]) => `${((x / 380) * w).toFixed(1)} ${y.toFixed(1)}`);
  return `M0 ${h}L${pts.join("L")}L${w} ${h}Z`;
}

function Band(a: { opt: Opt; w: number; theme: Theme }): Child {
  const p = pal(a.theme);
  const { opt, w } = a;
  const acc = opt.art === "beach" ? p.yellow : opt.art === "hike" ? p.green : p.blue;
  const base = mix(acc, p.dark, 0.6);
  const narrow = w < 300;
  const tw = narrow ? w - 16 - 80 : w - 140;
  const title = fitText(opt.title, tw, { size: 34, weight: 700, min: 20 });
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: 110, background: base, overflow: "hidden", color: p.on }}>
      <svg width={w} height={110} viewBox={`0 0 ${w} 110`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
        {opt.art === "beach" ? (
          <>
            <rect x={0} y={76} width={w} height={20} fill={mix(p.blue, p.dark, 0.35)} />
            <rect x={0} y={96} width={w} height={14} fill={mix(p.yellow, p.card, 0.55)} />
            <Umbrella s={narrow ? 24 : 30} cx={narrow ? w - 46 : w - 60} cy={narrow ? 82 : 80} pole={p.brown} canopy={p.blue} wedge={p.on} sway />
          </>
        ) : null}
        {opt.art === "hike" ? (
          <>
            <path d={ridgePath(100, 26, 2, w, 110)} fill={mix(base, p.dark, 0.2)} />
            <path d={ridgePath(116, 16, 5, w, 110)} fill={p.leaf} />
            <Peak s={narrow ? 20 : 26} cx={narrow ? w - 46 : w - 60} cy={40} leaf={p.leaf} snow={p.on} front={mix(p.leaf, p.dark, 0.2)} />
          </>
        ) : null}
        <circle cx={w - 22} cy={20} r={10} fill={p.cream} />
      </svg>
      <div style={{ position: "absolute", left: 16, top: 12, fontSize: 13, lineHeight: "20px", color: p.on, whiteSpace: "nowrap" }}>Muse turned the poll into a plan</div>
      <div style={{ position: "absolute", left: 16, top: 52 - 21, width: tw, fontSize: title.size, fontWeight: 700, lineHeight: "42px", color: p.on, whiteSpace: "nowrap" }}>{title.text}</div>
      <div style={{ position: "absolute", left: 16, top: 84 - 11, right: 100, fontSize: 15, lineHeight: "22px", color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opt.when}</div>
    </div>
  );
}

const ring = (card: string) => ({ boxShadow: `0 0 0 1.5px ${card}`, borderRadius: "50%", display: "inline-flex", flex: "none" as const });

export default defineApp<State, Action, Local>({
  name: "Story poll plan",
  summary: (s, ctx) => {
    const who = s.author || "A friend";
    if (s.winner === null) return `${who}'s story poll: ${s.options[0].label} ${count(s, 0)} · ${s.options[1].label} ${count(s, 1)}`;
    const o = s.options[s.winner];
    return `${who}'s story poll: ${o.title}${o.when ? ` · ${o.when}` : ""} · ${goingOf(s, ctx.members).length} going`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!isMember(ctx, meta.user)) return state;
    if (action.t === "vote") {
      const side = action.side;
      if ((side !== 0 && side !== 1) || state.closedAt > 0 || state.votes[meta.user]?.side === side) return state;
      const next: State = { ...state, votes: { ...state.votes, [meta.user]: { side, at: meta.time } } };
      if (!decided(next, ctx)) return next;
      return { ...next, closedAt: Math.max(1, meta.time), winner: count(next, 1) > count(next, 0) ? 1 : 0 };
    }
    if (action.t === "cal") {
      if (state.closedAt === 0) return state;
      return { ...state, cal: state.cal.includes(meta.user) ? state.cal.filter((u) => u !== meta.user) : [...state.cal, meta.user] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const keep = Object.keys(state.votes).filter((id) => isMember(ctx, id));
    if (keep.length === Object.keys(state.votes).length && state.cal.every((u) => isMember(ctx, u))) return state;
    const votes: State["votes"] = {};
    for (const id of keep) votes[id] = state.votes[id]!;
    return { ...state, votes, cal: state.cal.filter((u) => isMember(ctx, u)) };
  },

  invariants: {
    "closed exactly when there is a winner": (s) => (s.closedAt === 0) === (s.winner === null),
    "votes are sides with times": (s) =>
      Object.values(s.votes).every((v) => (v.side === 0 || v.side === 1) && Number.isInteger(v.at) && v.at >= 0) && s.outside.every((o) => o.side === 0 || o.side === 1),
    "voters are in the chat": (s, ctx) => Object.keys(s.votes).every((id) => isMember(ctx, id)),
    "calendar only after closing, once each, all here": (s, ctx) => (s.closedAt > 0 || s.cal.length === 0) && new Set(s.cal).size === s.cal.length && s.cal.every((u) => isMember(ctx, u)),
    "two options, closeAt in range": (s) => s.options.length === 2 && Number.isInteger(s.closeAt) && s.closeAt >= 2 && s.closeAt <= 50,
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || isMember(ctx, m.user),
    "no votes after closing": (p, n, a) => a.t !== "vote" || p.closedAt === 0 || p === n,
    "a vote sets only my vote, now": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const mine = n.votes[m.user];
      if (mine?.side !== a.side || mine.at !== m.time || p.votes[m.user]?.side === a.side) return false;
      return Object.keys(n.votes).every((id) => id === m.user || JSON.stringify(n.votes[id]) === JSON.stringify(p.votes[id])) && Object.keys(p.votes).every((id) => id === m.user || id in n.votes);
    },
    "it closes exactly when decided, on the leader": (p, n, a, m, ctx) => {
      if (a.t !== "vote" || p === n) return true;
      const tally = (s: State, k: number) => s.outside.reduce((x, o) => x + (o.side === k ? 1 : 0), 0) + Object.values(s.votes).reduce((x, v) => x + (v.side === k ? 1 : 0), 0);
      const x = tally(n, 0);
      const y = tally(n, 1);
      const every = ctx.members.length > 0 && ctx.members.every((u) => n.votes[u.id] !== undefined);
      const should = x !== y && (x + y >= n.closeAt || every);
      return should === (n.closedAt === Math.max(1, m.time) && n.winner === (y > x ? 1 : 0));
    },
    "calendar toggles only me, only when closed": (p, n, a, m) => {
      if (a.t !== "cal" || p === n) return true;
      const diff = [...p.cal.filter((u) => !n.cal.includes(u)), ...n.cal.filter((u) => !p.cal.includes(u))];
      return p.closedAt > 0 && diff.length === 1 && diff[0] === m.user;
    },
    "the story never changes": (p, n) =>
      JSON.stringify(p.options) === JSON.stringify(n.options) &&
      JSON.stringify(p.outside) === JSON.stringify(n.outside) &&
      p.question === n.question &&
      p.closeAt === n.closeAt,
  },

  arbitrary: (s, _u, r) => (s.closedAt > 0 ? { t: "cal" } : { t: "vote", side: r.int(2) }),

  local: { cheers: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const sw = Math.min(300, W - 40);
    const hw = (sw - 24) / 2;
    const closed = state.closedAt > 0;
    const winner = state.winner;
    const counts = [count(state, 0), count(state, 1)] as const;
    const total = counts[0] + counts[1];
    const tied = counts[0] === counts[1];
    const myVote = state.votes[me];
    const sides: Side[] = [0, 1];

    const e = closed ? running(state.closedAt, END_MS) : null;
    const mk = !closed ? 0 : e === null ? 1 : e < MORPH_AT ? 0 : morph(Math.min(MORPH_MS, e - MORPH_AT));
    const earlier = closed && e !== null && e < MORPH_AT;
    const myAt = myVote?.at ?? 0;
    const popping = myAt > 0 && running(myAt, 2200) !== null;

    const author = members.find((m) => m.id === state.author || m.name.trim().toLowerCase() === state.author.trim().toLowerCase());
    const authorFace: Member = author ?? { id: state.author || "?", name: state.author || "?" };

    // The box: a sticker, then (once decided) the same card grown into the plan.
    const S = { x: (W - sw) / 2, y: 162, w: sw, h: 232 };
    const Pn = { x: 16, y: 130, w: W - 32, h: 410 };
    const lerp = (a: number, b: number) => a + (b - a) * mk;
    const q = 0.06 * Math.sin(Math.PI * mk);
    const bw = lerp(S.w, Pn.w) * (1 + q);
    const bh = lerp(S.h, Pn.h) * (1 - q);
    const bx = lerp(S.x, Pn.x) + (lerp(S.w, Pn.w) - bw) / 2;
    const by = lerp(S.y, Pn.y) + (lerp(S.h, Pn.h) - bh) / 2;
    const rot = -1.5 * (1 - mk);

    const closer = Object.entries(state.votes).find(([, v]) => v.at === state.closedAt)?.[0];
    const closerName = closer === me ? "Your" : `${members.find((m) => m.id === closer)?.name ?? "Someone"}'s`;
    const brokeTie = winner !== null && Math.abs(counts[0] - counts[1]) === 1;

    let footer: { text: string; weight: number; color: string };
    if (earlier) footer = { text: brokeTie ? `${closerName} vote broke the tie` : "The votes are in", weight: 600, color: c.text };
    else if (tied && total >= state.closeAt - 1) footer = { text: `It's ${counts[0]}-${counts[1]}. You decide.`, weight: 600, color: c.negative };
    else if (tied) footer = { text: `Tied at ${counts[0]} · ${state.closeAt} votes decide it`, weight: 400, color: c.secondaryText };
    else footer = { text: "Votes coming in…", weight: 400, color: c.secondaryText };

    const question = fitText(state.question, sw - 24, { size: 19, weight: 700, min: 13 });
    const caption = fitText(state.caption, W - 40, { size: 32, weight: 700, min: 18 });

    const half = (k: Side) => {
      const opt = state.options[k];
      const mine = myVote?.side === k;
      const faces = voters(state, k, members).slice(-4);
      const row = faces.length ? 20 + 15 * (faces.length - 1) : 0;
      const label = fitText(opt.label, hw - 12, { size: 20, weight: 700, min: 13 });
      const n = counts[k];
      const grow = mine && popping;
      return (
        <button
          key={k}
          aria-label={`${opt.label}, ${n} ${n === 1 ? "vote" : "votes"}`}
          onClick={() => {
            haptic("light");
            dispatch({ t: "vote", side: k });
          }}
          style={{
            position: "absolute",
            left: 12 + k * hw,
            top: 52,
            width: hw,
            height: 134,
            padding: 0,
            border: 0,
            cursor: "pointer",
            font: "inherit",
            background: mine ? mix(c.wash, c.primary, 0.12) : "transparent",
            borderRadius: k === 0 ? "14px 0 0 14px" : "0 14px 14px 0",
          }}
        >
          <span style={{ position: "absolute", left: (hw - 36) / 2, top: 10, width: 36, height: 36, display: "block" }}>
            <SideIcon opt={opt} theme={theme} />
          </span>
          <span style={{ position: "absolute", left: 6, right: 6, top: 61 - 13, textAlign: "center", fontSize: label.size, fontWeight: 700, lineHeight: "26px", color: mine ? c.primary : c.text, whiteSpace: "nowrap" }}>{label.text}</span>
          <span style={{ position: "absolute", left: 0, right: 0, top: 84 - 9, textAlign: "center", fontSize: 13, lineHeight: "18px", color: mine ? c.text : c.secondaryText }}>{`${n} ${n === 1 ? "vote" : "votes"}`}</span>
          <span style={{ position: "absolute", left: (hw - row) / 2, top: 96, width: row, height: 20, display: "block" }}>
            {faces.map((m, i) => {
              const isMe = m.id === me;
              return (
                <span key={m.id} style={{ position: "absolute", left: i * 15, top: 0, ...ring(c.card), animation: isMe && grow ? "sppPop 350ms cubic-bezier(.34,1.56,.64,1) both" : undefined }}>
                  <Avatar user={m} size={20} />
                </span>
              );
            })}
          </span>
          {myVote ? (
            <span style={{ position: "absolute", left: 14, right: 14, top: 120, height: 6, borderRadius: 3, background: c.card, overflow: "hidden", display: "block" }}>
              <span
                style={{
                  display: "block",
                  height: 6,
                  width: `${total ? (n / total) * 100 : 0}%`,
                  borderRadius: 3,
                  background: mine ? c.primary : c.secondaryText,
                  transformOrigin: "left",
                  animation: grow ? "sppGrow 600ms cubic-bezier(0,0,.2,1) both" : undefined,
                }}
              />
            </span>
          ) : null}
        </button>
      );
    };

    const sticker = (
      <div style={{ position: "absolute", left: 0, top: 0, width: sw, height: 232, color: c.text, opacity: closed ? Math.max(0, 1 - 2 * mk) : 1, pointerEvents: closed ? "none" : "auto" }}>
        <div style={{ position: "absolute", left: 12, right: 12, top: 28 - 13, textAlign: "center", fontSize: question.size, fontWeight: 700, lineHeight: "26px", color: c.text, whiteSpace: "nowrap" }}>{question.text}</div>
        <div style={{ position: "absolute", left: 12, top: 52, width: sw - 24, height: 134, borderRadius: 14, background: c.wash }} />
        <div style={{ position: "absolute", left: 12 + hw, top: 66, width: 1, height: 106, background: c.divider }} />
        {sides.map(half)}
        <div style={{ position: "absolute", left: 8, right: 8, top: 210 - 11, textAlign: "center", fontSize: 13, lineHeight: "22px", fontWeight: footer.weight, color: footer.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{footer.text}</div>
      </div>
    );

    // The plan card.
    let plan: Child = null;
    if (winner !== null && mk >= 0.5) {
      const opt = state.options[winner];
      const loser = state.options[winner === 0 ? 1 : 0];
      const loserCount = counts[winner === 0 ? 1 : 0];
      const going = goingOf(state, members);
      const total = going.length;
      const w = Pn.w;
      const rows = opt.rows;
      let y = 152;
      const lines: Child[] = [];
      rows.forEach(([a, b], i) => {
        const colX = w < 300 ? 98 : 120;
        const val = fitText(b, w - 16 - colX, { size: 14, min: 10 });
        const lab = fitText(a, colX - 20, { size: 13, min: 11 });
        lines.push(<div key={`l${i}`} style={{ position: "absolute", left: 16, right: 16, top: y, height: 1, background: c.divider }} />);
        lines.push(
          <div key={`a${i}`} style={{ position: "absolute", left: 16, top: y + 18 - 10, width: colX - 20, fontSize: lab.size, lineHeight: "20px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {a}
          </div>,
        );
        lines.push(
          <div key={`b${i}`} style={{ position: "absolute", left: colX, right: 16, top: y + 18 - 10, fontSize: val.size, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {val.text}
          </div>,
        );
        y += 36;
      });
      lines.push(<div key="gl" style={{ position: "absolute", left: 16, right: 16, top: y, height: 1, background: c.divider }} />);
      const goingTop = y + 24 - 12;
      const chipTop = y + 48;
      const chipText = `${loser.label} crew: ${loser.alt} · ${loserCount} in`;
      const chipPx = (() => {
        let px = 13;
        while (px > 10 && textWidth(chipText, px, 400) > w - 32 - 24) px -= 0.5;
        return px;
      })();
      const actionTop = loser.alt ? chipTop + 46 : chipTop;
      const added = state.cal.includes(me);
      const day = dayOf(opt.when);
      const placeFit = fitText(opt.place, w - 32, { size: 15, min: 12 });
      plan = (
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: 410, color: c.text, opacity: e === null ? 1 : Math.max(0, 2 * mk - 1) }}>
          <Band opt={opt} w={w} theme={theme} />
          {opt.place ? <div style={{ position: "absolute", left: 16, right: 16, top: 134 - 11, fontSize: placeFit.size, lineHeight: "22px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opt.place}</div> : null}
          {lines}
          <div style={{ position: "absolute", left: 16, right: 16, top: goingTop, height: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Facepile users={going} max={5} size={24} />
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.text, whiteSpace: "nowrap" }}>{`${total} going`}</span>
          </div>
          {loser.alt ? (
            <div style={{ position: "absolute", left: 16, right: 16, top: chipTop, height: 34, borderRadius: 8, background: c.wash, display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box" }}>
              <span style={{ fontSize: chipPx, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{chipText}</span>
            </div>
          ) : null}
          <div style={{ position: "absolute", left: 16, right: 16, top: actionTop, height: 40, display: "flex", alignItems: "center" }}>
            {added ? (
              <div style={{ width: "100%", height: 40, borderRadius: 8, background: c.wash, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 0 12px", boxSizing: "border-box", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{`On your calendar · ${day}`}</span>
                <Button kind="deemphasized" onClick={() => dispatch({ t: "cal" })}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                kind="primary"
                wide
                onClick={() => {
                  haptic("success");
                  dispatch({ t: "cal" });
                  setLocal({ cheers: local.cheers + 1 });
                }}
              >
                Add to calendar
              </Button>
            )}
            {added && local.cheers > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.cheers} emoji="👍" />
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    const stoppedAuthor = state.author || "";
    const dayName = winner !== null ? dayLong(dayOf(state.options[winner].when)) : "";
    const toastOn = closed && local.cheers > 0 && state.cal.includes(me);
    const segW = (W - 16 - 8) / 3;

    return (
      <div>
        <style>{"@keyframes sppPop{from{transform:scale(0)}to{transform:scale(1)}}@keyframes sppGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes sppFill{from{width:0}to{width:100%}}@keyframes sppSway{from{transform:translateX(-1px)}to{transform:translateX(1px)}}"}</style>
        <div style={{ position: "relative", height: PANEL_H, borderRadius: 12, overflow: "hidden", backgroundColor: p.dark, color: p.on }}>
          <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: PANEL_H, pointerEvents: "none" }}>
            <Canvas height={PANEL_H} label="Sunset over a red suspension bridge" draw={(g, f) => drawBridge(g, f)} />
          </div>
          <svg width={W} height={90} viewBox={`0 0 ${W} 90`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            <defs>
              <linearGradient id="sppScrim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color={p.dark} stop-opacity="0.55" />
                <stop offset="0.71" stop-color={p.dark} stop-opacity="0.35" />
                <stop offset="1" stop-color={p.dark} stop-opacity="0" />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={W} height={90} fill="url(#sppScrim)" />
          </svg>
          <div style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, display: "flex", gap: 4, pointerEvents: "none" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ position: "relative", width: segW, height: 3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: p.on, opacity: 0.35 }} />
                {i === 0 ? <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", background: p.on }} /> : null}
                {i === 1 ? <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: p.on, animation: "sppFill 8s linear infinite" }} /> : null}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", left: 11, top: 17, width: 30, height: 30, borderRadius: 15, background: p.on, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <Avatar user={authorFace} size={27} />
          </div>
          <div style={{ position: "absolute", left: 48, top: 22, right: 48, height: 20, display: "flex", alignItems: "center", gap: 8, minWidth: 0, pointerEvents: "none" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: p.on, whiteSpace: "nowrap" }}>{stoppedAuthor}</span>
            <span style={{ fontSize: 13, color: p.on, whiteSpace: "nowrap" }}>{state.ago}</span>
          </div>
          <div aria-hidden="true" style={{ position: "absolute", right: 14, top: 20, fontSize: 16, fontWeight: 600, lineHeight: "24px", color: p.on, pointerEvents: "none" }}>
            ···
          </div>
          {state.caption ? (
            <div style={{ position: "absolute", left: 20, right: 20, top: 100 - 22, textAlign: "center", fontSize: caption.size, fontWeight: 700, lineHeight: "44px", color: p.on, whiteSpace: "nowrap", transform: "rotate(-2.3deg)", pointerEvents: "none" }}>{caption.text}</div>
          ) : null}

          <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, borderRadius: 16, background: c.card, overflow: "hidden", transform: `rotate(${rot}deg)`, zIndex: 1 }}>
            {!closed || mk < 0.5 ? sticker : null}
            {plan}
          </div>
        </div>
        {toastOn ? <Toast key={local.cheers}>{`You're in. See you ${dayName}.`}</Toast> : null}
      </div>
    );
  },
});
