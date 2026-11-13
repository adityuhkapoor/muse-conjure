import {
  defineApp,
  Avatar,
  Facepile,
  Button,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  tween,
  type Child,
  type Ctx,
  type Meta,
} from "@muse/app";

// Rent mailbox: one roommate fronts the rent to the landlord and everyone pays them back. A curbside
// mailbox with its door open; each roommate's envelope (their share, sized by their room) waits on
// the curb until they mark it sent, then flies into the box. When the last one is in, the door
// shuts and the red flag goes up. Stragglers get one request with one tap.

type Params = {
  /** The apartment: "412 Pine" */
  home: string;
  /** Which rent: "Dec rent" */
  month: string;
  /** When it is due: "the 1st" */
  due: string;
  /** Who fronts it to the landlord */
  fronter: string;
  /** Each roommate's share in cents, with what their room is */
  shares: { who: string; cents: number; room: string }[];
  /** Who has already paid the fronter back */
  sent: string[];
};

// @params
const P: Params = {
  home: "412 Pine",
  month: "Dec rent",
  due: "the 1st",
  fronter: "Arun",
  shares: [
    { who: "Arun", cents: 89000, room: "has the bathroom" },
    { who: "Will", cents: 76000, room: "small room" },
    { who: "Aditya", cents: 82500, room: "front room" },
    { who: "Calvin", cents: 82500, room: "back room" },
  ],
  sent: ["Will"],
};
// @end params

type Mate = { id: string; name: string; member: boolean; cents: number; room: string };
type Sent = { id: string; at: number; by: string };
type State = { home: string; month: string; due: string; fronter: string; mates: Mate[]; sent: Sent[]; askedAt: number; askedBy: string; doneAt: number };
type Action = { t: "send" } | { t: "unsend" } | { t: "mark"; who: string } | { t: "ask" };
type Local = { toast: number };

const MAXM = 6;
const ASK_GAP = 60_000;
const FLY = tween({ duration: 750, easing: [0.3, 0, 0.2, 1] });
const FLAG = spring(springs.iosBouncy);

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+$)/g, ",")}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
const isIn = (s: State, id: string) => id === s.fronter || s.sent.some((x) => x.id === id);
const waiting = (s: State) => s.mates.filter((m) => !isIn(s, m.id));
const total = (s: State) => s.mates.reduce((a, m) => a + m.cents, 0);

function initState(ctx: Ctx): State {
  const mates: Mate[] = [];
  for (const raw of Array.isArray(P.shares) ? P.shares : []) {
    if (mates.length >= MAXM) break;
    const name = clean(raw?.who, 20);
    if (!name || !Number.isInteger(raw.cents) || raw.cents <= 0 || raw.cents > 10_000_000) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (mates.some((x) => x.id === id)) continue;
    mates.push({ id, name: m ? clean(m.name, 20) || name : name, member: !!m, cents: raw.cents, room: clean(raw.room, 20) });
  }
  if (mates.length < 2) {
    for (const m of ctx.members) if (mates.length < 4 && !mates.some((x) => x.id === m.id)) mates.push({ id: m.id, name: clean(m.name, 20) || "Roommate", member: true, cents: 80000, room: "" });
  }
  while (mates.length < 2) mates.push({ id: `Roommate ${mates.length + 1}`, name: `Roommate ${mates.length + 1}`, member: false, cents: 80000, room: "" });
  const fn = clean(P.fronter, 20);
  const fronter = mates.find((m) => same(m.name, fn) || m.id === fn)?.id ?? mates[0]!.id;
  const sent: Sent[] = [];
  for (const w of Array.isArray(P.sent) ? P.sent : []) {
    const m = mates.find((x) => same(x.name, clean(w, 20)));
    if (m && m.id !== fronter && !sent.some((x) => x.id === m.id)) sent.push({ id: m.id, at: 0, by: m.id });
  }
  const s: State = { home: clean(P.home, 24) || "home", month: clean(P.month, 20) || "Rent", due: clean(P.due, 16), fronter, mates, sent, askedAt: 0, askedBy: "", doneAt: 0 };
  return { ...s, doneAt: waiting(s).length === 0 ? 1 : 0 };
}

function withSent(s: State, sent: Sent[], meta: Meta): State {
  const n = { ...s, sent };
  return { ...n, doneAt: waiting(n).length === 0 ? s.doneAt || meta.time : 0 };
}

function reduceRent(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "send") {
    if (!s.mates.some((m) => m.id === u) || isIn(s, u)) return s;
    return withSent(s, [...s.sent, { id: u, at: meta.time, by: u }], meta);
  }
  if (a.t === "unsend") {
    if (!s.sent.some((x) => x.id === u)) return s;
    return withSent(s, s.sent.filter((x) => x.id !== u), meta);
  }
  if (a.t === "mark") {
    const who = a.who;
    if (typeof who !== "string") return s;
    const m = s.mates.find((x) => x.id === who);
    if (!m || m.member || isIn(s, who)) return s;
    return withSent(s, [...s.sent, { id: who, at: meta.time, by: u }], meta);
  }
  if (a.t === "ask") {
    if (waiting(s).every((m) => m.id === u) || meta.time - s.askedAt < ASK_GAP) return s;
    return { ...s, askedAt: meta.time, askedBy: u };
  }
  return s;
}

function Envelope(p: { w: number; h: number; paper: string; edge: string; ink: string; amount: string; font: string; dashed?: boolean }) {
  if (p.dashed)
    return <rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} rx={5} fill="none" stroke={p.edge} stroke-width={1.5} stroke-dasharray="4 3" />;
  return (
    <g>
      <rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} rx={4} fill={p.paper} stroke={p.edge} stroke-width={1.2} />
      <path d={`M ${-p.w / 2 + 2} ${-p.h / 2 + 2} L 0 ${p.h * 0.08} L ${p.w / 2 - 2} ${-p.h / 2 + 2}`} fill="none" stroke={p.edge} stroke-width={1.2} />
      <text x={0} y={p.h / 2 - 7} text-anchor="middle" font-size={Math.min(13, p.h * 0.3)} font-weight={700} fill={p.ink} font-family={p.font}>
        {p.amount}
      </text>
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Rent mailbox",
  summary: (s) => {
    const fr = s.mates.find((m) => m.id === s.fronter)?.name ?? "someone";
    const w = waiting(s);
    if (!w.length) return `${s.month}: all ${s.mates.length} envelopes in, flag's up for ${fr}`;
    return `${s.month}: ${s.mates.length - w.length} of ${s.mates.length} in · waiting on ${w.map((m) => m.name).join(" and ")}`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceRent(s, a as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (s, ctx) => {
    const mates = s.mates.map((m) => (m.member && !inChat(ctx, m.id) && !isIn(s, m.id) ? { ...m, member: false } : m));
    return mates.some((m, i) => m !== s.mates[i]) ? { ...s, mates } : s;
  },

  invariants: {
    "each envelope goes in once": (s) => new Set(s.sent.map((x) => x.id)).size === s.sent.length && s.sent.every((x) => x.id !== s.fronter && s.mates.some((m) => m.id === x.id)),
    "the flag is up exactly when every envelope is in": (s) => (s.doneAt > 0) === (waiting(s).length === 0),
    "shares are whole cents and the fronter is a roommate": (s) =>
      s.mates.every((m) => Number.isInteger(m.cents) && m.cents > 0) && s.mates.some((m) => m.id === s.fronter) && new Set(s.mates.map((m) => m.id)).size === s.mates.length,
    "money in the box matches the envelopes": (s) =>
      s.sent.reduce((a, x) => a + (s.mates.find((m) => m.id === x.id)?.cents ?? 0), 0) + (s.mates.find((m) => m.id === s.fronter)?.cents ?? 0) + waiting(s).reduce((a, m) => a + m.cents, 0) === total(s),
    "members still waiting are in the chat": (s, ctx) => s.mates.every((m) => !m.member || isIn(s, m.id) || inChat(ctx, m.id)),
    "a request names who asked": (s) => (s.askedAt === 0) === (s.askedBy === ""),
  },

  transitions: {
    "sending drops in exactly your envelope": (p, n, a, m) =>
      a.t !== "send" || p === n || (!isIn(p, m.user) && n.sent.length === p.sent.length + 1 && n.sent.at(-1)!.id === m.user && n.sent.at(-1)!.at === m.time),
    "only you take your envelope back": (p, n, a, m) =>
      a.t !== "unsend" || p === n || (p.sent.some((x) => x.id === m.user) && !n.sent.some((x) => x.id === m.user) && n.sent.length === p.sent.length - 1),
    "marking is for roommates outside the chat": (p, n, a) =>
      a.t !== "mark" || p === n || (!(p.mates.find((x) => x.id === a.who)?.member ?? true) && n.sent.some((x) => x.id === a.who) && n.sent.length === p.sent.length + 1),
    "a request waits a minute and moves no money": (p, n, a, m) =>
      a.t !== "ask" || p === n || (m.time - p.askedAt >= ASK_GAP && n.askedAt === m.time && n.askedBy === m.user && n.sent === p.sent),
    "only requests change the request": (p, n, a) => a.t === "ask" || (n.askedAt === p.askedAt && n.askedBy === p.askedBy),
    "the flag goes up once per filling": (p, n) => p.doneAt === 0 || n.doneAt === 0 || n.doneAt === p.doneAt,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.45) return { t: "send" };
    if (k < 0.62) return { t: "unsend" };
    const stand = s.mates.filter((m) => !m.member && !isIn(s, m.id));
    if (k < 0.82 && stand.length) return { t: "mark", who: r.pick(stand).id };
    return { t: "ask" };
  },

  local: { toast: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 200;
    const fr = state.mates.find((m) => m.id === state.fronter)!;
    const wait = waiting(state);
    const mine = state.mates.find((m) => m.id === me);
    const myIn = mine ? isIn(state, me) : false;
    const done = state.doneAt > 0;
    const font = theme.type.family;

    // Mailbox on the left, the curb to the right.
    const bw = Math.min(132, W * 0.37);
    const bx = 8;
    const by = 14;
    const bh = 112;
    const ix = bx + 12;
    const iw = bw - 24;
    const groundY = H - 8;
    const paper = dark ? mix(pl.paper, c.card, 0.15) : pl.paper;
    const edge = dark ? mix(c.secondaryText, c.card, 0.2) : c.divider;
    const envInk = dark ? c.card : c.text;
    const envPaper = dark ? mix(pl.cream, c.text, 0.4) : mix(pl.cream, c.card, 0.35);

    // Fixed waiting spots on the curb, one per roommate (2 columns).
    const cl = bx + bw + 40;
    const cw = W - cl;
    const cols = 2;
    const rows = Math.ceil(state.mates.length / cols);
    const spotW = Math.min(84, cw / cols - 10);
    const spotH = Math.min(52, spotW * 0.62);
    const spot = (i: number) => ({ x: cl + (cw / cols) * (i % cols) + cw / cols / 2, y: 24 + (Math.floor(i / cols) + 0.5) * ((groundY - 34) / rows) });

    // Envelopes already in the box, stacked flat inside.
    const inside = [fr, ...state.sent.map((x) => state.mates.find((m) => m.id === x.id)!).filter(Boolean)];
    const slotH = Math.min(20, (bh - 56) / Math.max(1, state.mates.length));
    const stackPos = (k: number) => ({ x: ix + iw / 2, y: by + bh - 12 - slotH * k - slotH / 2 });

    const art: Child[] = [];
    const over: Child[] = [];
    // ground and post
    art.push(<rect key="ground" x={0} y={groundY} width={W} height={3} rx={1.5} fill={c.divider} />);
    art.push(<rect key="post" x={bx + bw / 2 - 6} y={by + bh} width={12} height={groundY - by - bh} fill={dark ? mix(pl.brown, c.text, 0.2) : pl.brown} />);
    // box body (arched top)
    const body = `M ${bx} ${by + bh} V ${by + 44} A ${bw / 2} 44 0 0 1 ${bx + bw} ${by + 44} V ${by + bh} Z`;
    art.push(<path key="body" d={body} fill={dark ? mix(pl.blue, c.card, 0.25) : pl.blue} />);
    const mouth = `M ${ix} ${by + bh - 6} V ${by + 48} A ${iw / 2} 34 0 0 1 ${ix + iw} ${by + 48} V ${by + bh - 6} Z`;
    art.push(<path key="mouth" d={mouth} fill={dark ? c.wash : mix(c.text, pl.blue, 0.2)} />);
    inside.forEach((m, k) => {
      const q = stackPos(k);
      const ent = state.sent.find((x) => x.id === m.id);
      const e = ent && ent.at > 0 ? running(ent.at, 750) : null;
      if (e !== null) return; // still flying
      art.push(
        <g key={`in${m.id}`} transform={`translate(${q.x} ${q.y}) rotate(${k % 2 ? 1.5 : -1.5})`}>
          <rect x={-iw / 2 + 6} y={-slotH / 2 + 1} width={iw - 12} height={slotH - 2} rx={3} fill={envPaper} stroke={edge} stroke-width={1} />
          <text x={iw / 2 - 12} y={3.5} text-anchor="end" font-size={10} font-weight={700} fill={envInk} font-family={font}>
            {money(m.cents)}
          </text>
        </g>,
      );
      if (!done) over.push(
        <span key={`fi${m.id}`} style={{ position: "absolute", left: ix + 10, top: q.y - 8, display: "flex", pointerEvents: "none" }}>
          <Avatar user={{ id: m.id, name: m.name }} size={16} />
        </span>,
      );
    });
    // the door: hangs open below the mouth until every envelope is in, then swings shut
    const shutK = done ? (state.doneAt > 1 ? Math.min(1, FLAG(running(state.doneAt, 900) ?? 900)) : 1) : 0;
    const shut = shutK;
    if (shut < 1) {
      const dh = 30 * (1 - shut);
      art.push(<path key="door" d={`M ${ix - 2} ${by + bh} L ${ix + iw + 2} ${by + bh} L ${ix + iw + 8} ${by + bh + dh - 6} Q ${ix + iw + 8} ${by + bh + dh} ${ix + iw + 2} ${by + bh + dh} L ${ix - 2} ${by + bh + dh} Q ${ix - 8} ${by + bh + dh} ${ix - 8} ${by + bh + dh - 6} Z`} fill={dark ? mix(pl.blue, c.card, 0.4) : mix(pl.blue, c.text, 0.25)} />);
      art.push(<rect key="dhandle" x={ix + iw / 2 - 9} y={by + bh + dh - 10} width={18} height={4} rx={2} fill={c.card} opacity={0.8} />);
    }
    if (shut > 0) {
      art.push(<path key="shut" d={mouth} fill={dark ? mix(pl.blue, c.text, 0.15) : mix(pl.blue, c.card, 0.2)} opacity={shut} />);
      art.push(<rect key="handle" x={ix + iw / 2 - 10} y={by + 60} width={20} height={6} rx={3} fill={c.card} opacity={shut} />);
    }
    if (done) {
      const st = state.doneAt > 1 ? Math.min(1, FLAG(running(state.doneAt, 900) ?? 900)) : 1;
      const sx = cl + cw / 2;
      const sy = groundY / 2;
      art.push(
        <g key="sticker" transform={`translate(${sx} ${sy}) rotate(-6) scale(${0.6 + 0.4 * st})`} opacity={st}>
          <rect x={-70} y={-22} width={140} height={44} rx={22} fill={dark ? pl.green : mix(pl.green, c.text, 0.3)} />
          <text x={0} y={6} text-anchor="middle" font-size={17} font-weight={700} fill={dark ? c.card : pl.on} font-family={font}>
            Rent's in!
          </text>
        </g>,
      );
      over.push(
        <div key="pile" style={{ position: "absolute", left: cl, width: cw, top: sy + 34, display: "flex", justifyContent: "center", opacity: st }}>
          <Facepile users={state.mates.map((m) => ({ id: m.id, name: m.name }))} max={6} size={24} />
        </div>,
      );
    }
    // house number
    art.push(
      <text key="num" x={bx + bw / 2} y={by + 26} text-anchor="middle" font-size={12} font-weight={700} fill={dark ? c.text : pl.on} font-family={font}>
        {state.home.replace(/\s.*$/, "")}
      </text>,
    );
    // flag: down along the side, up when the last envelope is in
    const flagUp = shut;
    const fx = bx + bw;
    const fy = by + 62;
    art.push(
      <g key="flag" transform={`translate(${fx} ${fy}) rotate(${90 - 90 * flagUp})`}>
        <rect x={-3} y={-40} width={6} height={42} rx={3} fill={dark ? mix(pl.red, c.text, 0.1) : pl.red} />
        <rect x={-3} y={-40} width={22} height={15} rx={3} fill={pl.red} />
        <circle cx={0} cy={0} r={4} fill={c.text} />
      </g>,
    );

    // the curb: waiting envelopes and dashed spots for the ones already in
    state.mates.forEach((m, i) => {
      if (m.id === state.fronter) return;
      const sp = spot(i - (state.mates.findIndex((x) => x.id === state.fronter) < i ? 1 : 0));
      const ent = state.sent.find((x) => x.id === m.id);
      const e = ent && ent.at > 0 ? running(ent.at, 750) : null;
      const inBox = isIn(state, m.id);
      if (inBox && e === null && done) return;
      if (inBox && e === null) {
        art.push(<g key={`sp${m.id}`} transform={`translate(${sp.x} ${sp.y})`}><Envelope w={spotW} h={spotH} paper={paper} edge={edge} ink={envInk} amount="" font={font} dashed /></g>);
        over.push(
          <div key={`lb${m.id}`} style={{ position: "absolute", left: sp.x - spotW / 2, width: spotW, top: sp.y - 9, textAlign: "center", fontSize: 12, lineHeight: "18px", color: mix(c.positive, c.text, 0.3), pointerEvents: "none", whiteSpace: "nowrap" }}>
            {`${m.id === me ? "You" : m.name} · in`}
          </div>,
        );
        return;
      }
      let x = sp.x;
      let y = sp.y;
      let sc = 1;
      let rot = i % 2 ? 4 : -4;
      if (e !== null) {
        const k = FLY(e);
        const k2 = stackPos(inside.findIndex((q) => q.id === m.id));
        x = sp.x + (k2.x - sp.x) * k;
        y = sp.y + (k2.y - sp.y) * k - Math.sin(k * Math.PI) * 50;
        sc = 1 - 0.45 * k;
        rot = rot + 360 * k * 0.25;
      }
      const isMe = m.id === me;
      art.push(
        <g key={`w${m.id}`} transform={`translate(${x} ${y}) rotate(${rot}) scale(${sc})`}>
          {isMe && e === null ? <rect x={-spotW / 2 - 4} y={-spotH / 2 - 4} width={spotW + 8} height={spotH + 8} rx={8} fill="none" stroke={c.primary} stroke-width={2} /> : null}
          <Envelope w={spotW} h={spotH} paper={envPaper} edge={edge} ink={envInk} amount={money(m.cents)} font={font} />
        </g>,
      );
      if (e === null) {
        const tap = isMe ? () => { dispatch({ t: "send" }); haptic("success"); setLocal({ toast: local.toast + 1 }); } : !m.member ? () => dispatch({ t: "mark", who: m.id }) : null;
        over.push(
          <button
            key={`b${m.id}`}
            type="button"
            aria-label={isMe ? `Send ${money(m.cents)} to ${fr.name}` : !m.member ? `Mark ${m.name} sent` : `${m.name}, ${money(m.cents)}, not sent yet`}
            {...(tap ? { onClick: tap } : {})}
            style={{ position: "absolute", left: sp.x - spotW / 2 - 4, top: sp.y - spotH / 2 - 14, width: spotW + 8, height: spotH + 20, cursor: tap ? "pointer" : "default" }}
          >
            <span style={{ position: "absolute", left: 0, top: 0, display: "flex", alignItems: "center", gap: 3, maxWidth: spotW + 8 }}>
              <Avatar user={{ id: m.id, name: m.name }} size={20} />
              <span style={{ fontSize: 11, lineHeight: "14px", fontWeight: 600, color: c.text, background: c.card, padding: "0 3px", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isMe ? "You" : m.name}</span>
            </span>
          </button>,
        );
      }
    });

    const askedRecently = state.askedAt > 0 && running(state.askedAt, ASK_GAP) !== null;
    const others = wait.filter((m) => m.id !== me);

    return (
      <div>
        <CardHeader title={`${state.month} · ${state.home}`} subtitle={`${fr.name} fronts ${money(total(state))}${state.due ? ` · due ${state.due}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mailbox: ${state.mates.length - wait.length} of ${state.mates.length} envelopes in${done ? ", flag up" : ""}`} style={{ display: "block", overflow: "visible" }}>
            {art}
          </svg>
          {over}
        </div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: done ? mix(c.positive, c.text, 0.35) : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {done
            ? `Flag's up · ${fr.name} is covered for ${state.month.toLowerCase()}`
            : `${state.mates.length - wait.length} of ${state.mates.length} in · ${money(wait.reduce((a, m) => a + m.cents, 0))} still on the curb`}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {mine && !myIn ? (
            <div style={{ flex: 1 }}>
              <Button kind="primary" wide onClick={() => { dispatch({ t: "send" }); haptic("success"); setLocal({ toast: local.toast + 1 }); }}>
                {`Send ${money(mine.cents)}`}
              </Button>
            </div>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {done ? "Every envelope's in" : me === state.fronter ? `You fronted it · ${wait.length} to go` : mine ? `Yours is in · ${money(mine.cents)}` : "Roommates only"}
            </span>
          )}
          {mine && myIn && me !== state.fronter && !done ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "unsend" })}>
              Undo
            </Button>
          ) : null}
          {!done && others.length ? (
            <Button kind="secondary" disabled={askedRecently} onClick={() => dispatch({ t: "ask" })}>
              {askedRecently ? "Requested" : others.length === 1 ? `Request ${others[0]!.name}` : `Request ${others.length}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && myIn ? <Toast key={local.toast}>{`In the box · ${money(mine?.cents ?? 0)} to ${fr.name}`}</Toast> : null}
      </div>
    );
  },
});
