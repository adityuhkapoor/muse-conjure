import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  Chip,
  Locked,
  More,
  Progress,
  Thumb,
  thumbKind,
  haptic,
  mix,
  pal,
  rng,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type Meta,
} from "@muse/app";

// Gift pool: a surprise jar in a chat the birthday person is not in. Everyone chips in the same
// share toward one gift; the jar fills with a coin for every share, and the people still owing
// can be nudged from their avatars.

type Params = {
  recipient: string;
  occasion: string;
  gift: string;
  giftNote: string;
  quote: string;
  quoteDate: string;
  goalCents: number;
  shareCents: number;
  crew: string[];
  paid: string[];
};

// @params
const P: Params = {
  recipient: "Jake",
  occasion: "he turns 25 Sat",
  gift: "Sony XM5",
  giftNote: "on sale",
  quote: "these sound like soup lol",
  quoteDate: "Sep 14",
  goalCents: 27000,
  shareCents: 3000,
  crew: ["Nico", "Dev", "Tyler", "Sam", "Marcus", "Leo", "Omar", "Kai", "Ravi"],
  paid: ["Nico", "Dev", "Tyler", "Sam", "Marcus", "Leo"],
};
// @end params

/** member: id is a chat member id; otherwise id is the name (someone who pays outside the chat). */
type Person = { id: string; name: string; member: boolean };
type Paid = { id: string; at: number; by: string };
type Poke = { to: string; from: string; at: number };
type State = {
  recipient: string;
  occasion: string;
  gift: string;
  giftNote: string;
  quote: string;
  quoteDate: string;
  goal: number;
  share: number;
  people: Person[];
  paid: Paid[];
  pokes: Poke[];
  fundedAt: number;
};
type Action = { t: "chip" } | { t: "unchip" } | { t: "mark"; who: string } | { t: "poke"; who: string };
type Local = { bursts: number };
type Rec = Record<string, unknown>;

const MAX_PEOPLE = 16;
const POKE_GAP = 60_000;
const COINS_PER = 6;
const PER_ROW = 5;
const DROP = spring(springs.iosBouncy);
const LID = tween({ duration: 1100, easing: "decelerate" });
const HEADPHONES = /headphone|xm\d|airpods|beats|bose/i;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const total = (s: State) => s.paid.length * s.share;
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const personName = (v: unknown) => clean(v, 20) || "Someone";

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function arcPath(cx: number, cy: number, r: number, a0: number, span: number): string {
  const a1 = a0 + span;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

// ---- Reducer side ----

function reduceGift(s: State, a: Rec, meta: Meta, ctx: Ctx): State {
  const actor = ctx.members.find((m) => m.id === meta.user);
  if (!actor) return s;
  if (sameName(actor.name, s.recipient)) return s;
  if (a.t !== "unchip" && s.fundedAt > 0) return s;

  if (a.t === "chip") {
    if (s.fundedAt > 0 || s.paid.some((p) => p.id === meta.user)) return s;
    if (total(s) + s.share > s.goal) return s;
    let people = s.people;
    if (!people.some((p) => p.id === meta.user)) {
      if (people.length >= MAX_PEOPLE) return s;
      people = [...people, { id: meta.user, name: personName(actor.name), member: true }];
    }
    const paid = [...s.paid, { id: meta.user, at: meta.time, by: meta.user }];
    return {
      ...s,
      people,
      paid,
      pokes: s.pokes.filter((p) => p.to !== meta.user),
      fundedAt: paid.length * s.share === s.goal ? meta.time : s.fundedAt,
    };
  }

  if (a.t === "unchip") {
    if (s.fundedAt > 0 || !s.paid.some((p) => p.id === meta.user)) return s;
    return { ...s, paid: s.paid.filter((p) => p.id !== meta.user) };
  }

  if (a.t === "mark") {
    const who = a.who;
    if (typeof who !== "string" || s.fundedAt > 0) return s;
    const person = s.people.find((p) => p.id === who);
    if (!person || person.member || s.paid.some((p) => p.id === who)) return s;
    if (total(s) + s.share > s.goal) return s;
    const paid = [...s.paid, { id: who, at: meta.time, by: meta.user }];
    return {
      ...s,
      paid,
      pokes: s.pokes.filter((p) => p.to !== who),
      fundedAt: paid.length * s.share === s.goal ? meta.time : s.fundedAt,
    };
  }

  if (a.t === "poke") {
    const who = a.who;
    if (typeof who !== "string" || s.fundedAt > 0) return s;
    if (!s.people.some((p) => p.id === who) || s.paid.some((p) => p.id === who)) return s;
    if (who === meta.user) return s;
    if (s.pokes.some((p) => p.to === who && meta.time - p.at < POKE_GAP)) return s;
    return { ...s, pokes: [...s.pokes.filter((p) => p.to !== who), { to: who, from: meta.user, at: meta.time }] };
  }

  return s;
}

function initGift(ctx: Ctx): State {
  const recipient = clean(P.recipient, 24) || "Jake";
  const share = Number.isInteger(P.shareCents) && P.shareCents >= 100 && P.shareCents <= 100_000 ? P.shareCents : 3000;
  const people: Person[] = [];

  const crew = Array.isArray(P.crew) ? P.crew.slice(0, MAX_PEOPLE) : [];
  for (const raw of crew) {
    if (typeof raw !== "string") continue;
    const name = personName(raw);
    if (sameName(name, recipient)) continue;
    const member = ctx.members.find((m) => m.id === raw || m.id === name || sameName(m.name, name));
    const id = member ? member.id : name;
    if (people.some((p) => p.id === id)) continue;
    people.push({ id, name: member ? personName(member.name) : name, member: !!member });
  }

  for (const m of ctx.members) {
    if (people.length >= MAX_PEOPLE) break;
    if (people.some((p) => p.id === m.id)) continue;
    const name = personName(m.name);
    if (sameName(name, recipient)) continue;
    people.push({ id: m.id, name, member: true });
  }

  const goal =
    Number.isInteger(P.goalCents) && P.goalCents > 0 && P.goalCents % share === 0 && P.goalCents <= share * MAX_PEOPLE
      ? P.goalCents
      : share * people.length;

  const wanted = new Set(
    (Array.isArray(P.paid) ? P.paid : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()),
  );
  const cap = goal === 0 ? 0 : Math.floor(goal / share);
  const paid: Paid[] = people
    .filter((p) => wanted.has(p.name.toLowerCase()))
    .slice(0, cap)
    .map((p) => ({ id: p.id, at: 0, by: p.id }));

  return {
    recipient,
    occasion: clean(P.occasion, 60),
    gift: clean(P.gift, 48) || "A gift",
    giftNote: clean(P.giftNote, 40),
    quote: clean(P.quote, 120),
    quoteDate: clean(P.quoteDate, 16),
    goal,
    share,
    people,
    paid,
    pokes: [],
    fundedAt: paid.length * share === goal ? 1 : 0,
  };
}

// ---- Check side ----

export default defineApp<State, Action, Local>({
  name: "Gift pool",
  summary: (s) => {
    const t = total(s);
    if (s.fundedAt > 0 || t === s.goal) return `Gift for ${s.recipient}: funded, ${money(s.goal)} from ${s.paid.length} people`;
    return `Gift for ${s.recipient}: ${money(t)} of ${money(s.goal)}, ${s.paid.length} chipped in`;
  },

  init: initGift,

  reduce: (state, action, meta, ctx) => reduceGift(state, action as unknown as Rec, meta, ctx),

  onMembers: (state, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    const paid = new Set(state.paid.map((p) => p.id));
    const gone = new Set(state.people.filter((p) => p.member && !here.has(p.id) && !paid.has(p.id)).map((p) => p.id));
    let people = gone.size ? state.people.filter((p) => !gone.has(p.id)) : state.people;
    let pokes = gone.size ? state.pokes.filter((p) => !gone.has(p.to)) : state.pokes;
    if (state.fundedAt === 0) {
      for (const m of ctx.members) {
        if (people.length >= MAX_PEOPLE) break;
        if (people.some((p) => p.id === m.id)) continue;
        const name = personName(m.name);
        if (sameName(name, state.recipient)) continue;
        people = [...people, { id: m.id, name, member: true }];
      }
    }
    return people === state.people && pokes === state.pokes ? state : { ...state, people, pokes };
  },

  invariants: {
    "never past the goal": (s) => total(s) <= s.goal && s.share > 0 && s.goal % s.share === 0,
    "funded exactly at the goal": (s) => (s.fundedAt > 0) === (total(s) === s.goal),
    "everyone pays once": (s) => new Set(s.paid.map((p) => p.id)).size === s.paid.length && s.paid.every((p) => s.people.some((x) => x.id === p.id)),
    "the recipient is not in the pool": (s) => s.people.every((p) => !sameName(p.name, s.recipient)),
    "pokes only for people who owe": (s) =>
      s.pokes.every((p) => s.people.some((x) => x.id === p.to) && !s.paid.some((x) => x.id === p.to)) &&
      new Set(s.pokes.map((p) => p.to)).size === s.pokes.length,
    "unpaid members are in the chat": (s, ctx) => s.people.every((p) => !p.member || s.paid.some((x) => x.id === p.id) || inChat(ctx, p.id)),
    "while open, everyone in the chat is in the pool": (s, ctx) =>
      s.fundedAt > 0 || s.people.length >= MAX_PEOPLE || ctx.members.every((m) => sameName(m.name, s.recipient) || s.people.some((p) => p.id === m.id)),
  },

  transitions: {
    "chipping in adds exactly the actor's share": (p, n, a, m) =>
      a.t !== "chip" || p === n || (n.paid.length === p.paid.length + 1 && n.paid.at(-1)!.id === m.user && n.paid.at(-1)!.at === m.time),
    "a funded pool is closed to new money": (p, n) => p.fundedAt === 0 || n.paid.length <= p.paid.length,
    "marking is only for people outside the chat": (p, n, a) => a.t !== "mark" || p === n || !(p.people.find((x) => x.id === a.who)?.member ?? false),
    "only you can take your share back": (p, n, a, m) =>
      a.t !== "unchip" || p === n || (p.paid.some((x) => x.id === m.user) && !n.paid.some((x) => x.id === m.user) && n.paid.length === p.paid.length - 1),
    "a poke waits a minute": (p, n, a, m) => a.t !== "poke" || p === n || !p.pokes.some((x) => x.to === a.who && m.time - x.at < POKE_GAP),
    "funding is stamped once": (p, n) => p.fundedAt === 0 || n.fundedAt === p.fundedAt,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the recipient never acts": (p, n, _a, m, ctx) =>
      p === n || !(ctx.members.find((x) => x.id === m.user)?.name && sameName(ctx.members.find((x) => x.id === m.user)!.name, p.recipient)),
    "a funded pool takes no pokes": (p, n) => p.fundedAt === 0 || n.pokes.length === p.pokes.length,
  },

  arbitrary: (s, user, r) => {
    if (s.fundedAt > 0) return { t: "unchip" };
    const k = r.next();
    if (k < 0.5) return { t: "chip" };
    if (k < 0.65) return { t: "unchip" };
    if (k < 0.8) {
      const standIns = s.people.filter((p) => !p.member && !s.paid.some((x) => x.id === p.id));
      if (!standIns.length) return { t: "chip" };
      return { t: "mark", who: r.pick(standIns).id };
    }
    const owing = s.people.filter((p) => p.id !== user && !s.paid.some((x) => x.id === p.id));
    if (!owing.length) return { t: "chip" };
    return { t: "poke", who: r.pick(owing).id };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme }) => {
    const c = theme.color;
    const pl = pal();
    const inner = theme.width - 2 * theme.space.card;
    const t = total(state);
    const funded = state.fundedAt > 0;
    const paidIds = new Set(state.paid.map((p) => p.id));
    const mine = paidIds.has(me);
    const J = Math.round(inner * 0.41);
    const cardW = inner - J - 16;
    const amountSize = cardW < 180 ? 22 : 28;
    const left = state.share > 0 ? Math.max(0, (state.goal - t) / state.share) : 0;
    const seconds = state.fundedAt > 0 ? running(state.fundedAt, 2000) : null;
    const lid = state.fundedAt > 0 ? LID(running(state.fundedAt, 1100) ?? 1100) : 0;

    const innerL = 6;
    const innerT = 30;
    const innerR = J - 6;
    const innerB = 226;
    const innerW = innerR - innerL;
    const slotW = innerW - 24;
    const clipId = `gift-pool-${J}`;

    const coins = Array.from({ length: state.paid.length * COINS_PER }, (_, k) => {
      const row = Math.floor(k / PER_ROW);
      const col = k % PER_ROW;
      const x = innerL + 12 + ((col + 0.25) * slotW) / PER_ROW + (row % 2 ? (slotW / 10) * 0.6 : 0) + (rng(k).next() * 4 - 2);
      const y = innerB - 8 - row * 8.6;
      const entry = state.paid[Math.floor(k / COINS_PER)];
      let drop = 1;
      if (entry && entry.at > 0) {
        const e = running(entry.at, 900);
        if (e !== null) {
          const elapsed = e - (k % COINS_PER) * 110;
          drop = elapsed <= 0 ? 0 : DROP(elapsed);
        }
      }
      const drawY = innerT - 6 + (y - (innerT - 6)) * drop;
      const tilt = (Math.sin(k * 1.7) * 0.25 * 180) / Math.PI;
      return (
        <g key={k} transform={`translate(${x} ${drawY}) rotate(${tilt})`}>
          <ellipse cx={0} cy={2.2} rx={11.5} ry={4.6} fill={mix(pl.orange, pl.brown, 0.5)} />
          <ellipse cx={0} cy={0} rx={11.5} ry={4.6} fill={pl.yellow} stroke={mix(pl.orange, pl.brown, 0.5)} stroke-width={1.2} />
          <ellipse cx={0} cy={0} rx={6} ry={2} fill={pl.paper} opacity={0.35} />
        </g>
      );
    });

    const lidTicks = [-48, -24, 0, 24, 48].map((x) => (
      <line key={x} x1={x} x2={x} y1={-6} y2={6} stroke={c.secondaryText} stroke-width={1} opacity={0.35} />
    ));

    const headphones = (
      <svg width={74} height={64} viewBox="-37 0 74 64" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        <g transform="translate(0 32)">
          <path d={arcPath(0, 0, 30, Math.PI * 1.08, Math.PI * 0.84)} fill="none" stroke={c.text} stroke-width={6} stroke-linecap="round" />
          {[-1, 1].map((s) => (
            <rect key={s} x={s * 29 - 8} y={-2} width={16} height={28} rx={7} fill={pl.red} />
          ))}
          {seconds !== null
            ? [0, 1, 2].map((w) => {
                const phase = (seconds / 2000 + w / 3) % 1;
                const r = 18 + phase * 20;
                return [-1, 1].map((s) => (
                  <path
                    key={`${w}${s}`}
                    d={arcPath(s * 29, 12, r, s < 0 ? Math.PI * 0.8 : -Math.PI * 0.2, Math.PI * 0.4)}
                    fill="none"
                    stroke={c.primary}
                    stroke-width={2}
                    opacity={1 - phase}
                  />
                ));
              })
            : null}
        </g>
      </svg>
    );

    const people = state.people;
    const maxCols = Math.max(1, Math.floor(inner / 40));
    const overflow = people.length > maxCols;
    const shown = overflow ? people.slice(0, Math.max(0, maxCols - 1)) : people;
    const rest = overflow ? people.length - shown.length : 0;
    const cols = shown.length + (overflow ? 1 : 0);
    const colW = cols > 0 ? Math.min(42, inner / cols) : 42;

    const unpaidOthers = people.filter((p) => !paidIds.has(p.id) && p.id !== me);
    const nudgeNames = unpaidOthers.map((p) => p.name);
    const nudge =
      nudgeNames.length === 0
        ? `Everyone's in · ${state.recipient} has no idea`
        : `You're in · tap ${nudgeNames.slice(0, 2).join(" or ")}${nudgeNames.length > 2 ? ` +${nudgeNames.length - 2}` : ""} to nudge`;

    const person = (p: Person) => {
      const paid = paidIds.has(p.id);
      const isMe = p.id === me;
      const label = isMe ? "You" : p.name;
      const entry = state.paid.find((x) => x.id === p.id);
      const hopAt = entry && entry.at > 0 ? running(entry.at, 500) : null;
      const hop = hopAt === null ? 0 : -10 * Math.sin((hopAt / 500) * Math.PI);
      const poke = state.pokes.find((x) => x.to === p.id);
      const pokeAt = poke ? running(poke.at, 1200) : null;
      const aria = paid ? (isMe ? "You, paid" : `${p.name}, paid`) : isMe ? "You, unpaid" : p.member ? `Nudge ${p.name}` : `Mark ${p.name} paid`;
      return (
        <div key={p.id} style={{ width: colW, flex: "none", display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            class="m-hit"
            aria-label={aria}
            onClick={() => {
              if (paid || isMe) return;
              dispatch(p.member ? { t: "poke", who: p.id } : { t: "mark", who: p.id });
            }}
            style={{
              position: "relative",
              width: 40,
              height: 56,
              padding: "8px 0 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxSizing: "border-box",
              background: "none",
              border: 0,
              cursor: paid || isMe ? "default" : "pointer",
              font: "inherit",
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <span style={{ position: "relative", width: 30, height: 30, display: "block", filter: paid ? undefined : "grayscale(1)", transform: `translateY(${hop}px)` }}>
              <Avatar user={{ id: p.id, name: p.name }} size={30} />
              {paid ? (
                <span
                  style={{
                    position: "absolute",
                    right: -3,
                    bottom: -3,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: c.positive,
                    boxShadow: `0 0 0 2px ${c.card}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke={c.card} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2.5 6.2 5 8.6l4.5-5" />
                  </svg>
                </span>
              ) : null}
            </span>
            <span style={{ marginTop: 4, width: 40, fontSize: 12, lineHeight: "14px", textAlign: "center", color: paid ? c.text : c.secondaryText, ...ellipsis }}>
              {label}
            </span>
            {!paid && pokeAt !== null ? (
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -14 - (pokeAt / 1200) * 6,
                  transform: "translateX(-50%)",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <Chip tone="primary">Nudged</Chip>
              </span>
            ) : null}
          </button>
        </div>
      );
    };

    return (
      <div>
        <CardHeader
          title={`Gift for ${state.recipient}`}
          subtitle={<span style={{ display: "block" }}>{`Hidden from ${state.recipient} · ${state.occasion}`}</span>}
        />

        <div style={{ display: "flex", gap: 16, height: 236 }}>
          <div style={{ position: "relative", width: J, height: 236, flex: "none" }}>
            <svg
              width={J}
              height={236}
              viewBox={`0 0 ${J} 236`}
              role="img"
              aria-label={`Jar with ${money(t)} of ${money(state.goal)}`}
              style={{ display: "block" }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect x={innerL} y={innerT} width={innerW} height={innerB - innerT} rx={16} />
                </clipPath>
              </defs>
              <rect x={0} y={24} width={J} height={208} rx={22} fill={c.wash} stroke={c.divider} stroke-width={1} />
              <g clip-path={`url(#${clipId})`}>{coins}</g>
              <rect x={12} y={50} width={7} height={236 - 84} rx={4} fill={c.card} opacity={0.45} />
              <rect x={23} y={54} width={3} height={40} rx={2} fill={c.card} opacity={0.35} />
              <g transform={`translate(${J / 2} ${20 - 140 * lid}) rotate(${(2.6 * lid * 180) / Math.PI})`}>
                <rect x={-62} y={-9} width={124} height={18} rx={3} fill={c.track} />
                {lidTicks}
              </g>
            </svg>
            <div
              style={{
                position: "absolute",
                left: J / 2,
                top: 106,
                transform: "translate(-50%, -50%)",
                width: 96,
                height: 40,
                borderRadius: 10,
                background: c.card,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            >
              <div style={{ maxWidth: 88, fontSize: 15, lineHeight: "17px", fontWeight: 600, color: c.text, textAlign: "center", ...ellipsis }}>{`${state.recipient} fund`}</div>
              <div style={{ maxWidth: 88, fontSize: 12, lineHeight: "14px", color: c.secondaryText, textAlign: "center", ...ellipsis }}>{`Don't tell ${state.recipient}`}</div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, height: 236, borderRadius: 12, background: c.wash, position: "relative", overflow: "hidden", boxSizing: "border-box" }}>
            <div style={{ position: "absolute", left: 10, right: 10, top: 4, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText, ...ellipsis }}>
              {[state.gift, state.giftNote].filter(Boolean).join(" · ")}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {HEADPHONES.test(state.gift) ? headphones : <Thumb kind={thumbKind(state.gift, "gift")} seed={state.gift} size={64} label="" />}
            </div>
            {state.quote ? (
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  top: 92,
                  height: 44,
                  borderRadius: 10,
                  background: c.card,
                  padding: "5px 8px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, height: 16, minWidth: 0 }}>
                  <Avatar user={{ id: state.recipient, name: state.recipient }} size={16} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: "14px", color: c.secondaryText, ...ellipsis }}>
                    {`${state.recipient} · ${state.quoteDate}`}
                  </span>
                </div>
                <div style={{ marginTop: 2, fontSize: 13, lineHeight: "16px", color: c.text, ...ellipsis }}>{`"${state.quote}"`}</div>
              </div>
            ) : null}
            <div style={{ position: "absolute", left: 10, right: 10, top: 142, height: 36, display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ fontSize: amountSize, lineHeight: "36px", fontWeight: 700, color: c.text }}>{money(t)}</span>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`of ${money(state.goal)}`}</span>
            </div>
            <div style={{ position: "absolute", left: 10, right: 10, top: 184 }}>
              <Progress value={t} max={state.goal} />
            </div>
            <div
              style={{
                position: "absolute",
                left: 10,
                right: 10,
                top: 204,
                fontSize: 12,
                lineHeight: "16px",
                color: funded ? mix(c.positive, c.text, 0.4) : c.secondaryText,
                ...ellipsis,
              }}
            >
              {funded ? "Funded · ordering tonight" : `${state.paid.length} chipped in · ${left} to go`}
            </div>
          </div>
        </div>

        <div style={{ height: 64, display: "flex", alignItems: "flex-start", overflow: "visible" }}>
          {shown.map(person)}
          {overflow ? (
            <div style={{ width: colW, flex: "none", display: "flex", justifyContent: "center", paddingTop: 8 }}>
              <More n={rest} size={30} />
            </div>
          ) : null}
        </div>

        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 8 }}>
          {funded ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Locked detail={`${money(state.goal)} from ${state.paid.length} people · ordering tonight`}>Funded</Locked>
            </div>
          ) : mine ? (
            <>
              <span style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ellipsis }}>{nudge}</span>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unchip" })}>
                Undo
              </Button>
            </>
          ) : (
            <Button
              kind="primary"
              wide
              onClick={() => {
                dispatch({ t: "chip" });
                haptic("light");
              }}
            >
              {`Chip in ${money(state.share)}`}
            </Button>
          )}
        </div>

        {funded ? <Burst key={state.fundedAt} emoji="🎁" /> : null}
      </div>
    );
  },
});
