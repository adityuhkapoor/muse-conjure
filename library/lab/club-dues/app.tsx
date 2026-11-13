import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, tween } from "@muse/app";

// Club dues: the club is a ring of faces, lit when paid; the money arc fills toward what the dues
// pay for. Pay yours and a coin flies in and may tip a goal over the line, or nudge the unpaid.

type Params = {
  club: string;
  term: string;
  duesCents: number;
  due: string;
  members: number;
  paidOutside: number;
  names: string[];
  goals: { label: string; amountCents: number }[];
  paid: string[];
};

// @params
const P: Params = {
  club: "Cal Salsa Club", term: "spring '27", duesCents: 3500, due: "Feb 14", members: 24, paidOutside: 13,
  names: ["Sam", "Leo", "Ana", "Kev", "Jess", "Marco", "Dani", "Nico", "Lucía", "Omar", "Zoe", "Ivy", "Raf", "Kim", "Ben", "Hana", "Gus", "Eli"],
  goals: [{ label: "Studio rental", amountCents: 40000 }, { label: "Spring social DJ", amountCents: 22500 }, { label: "Shoes + costume fund", amountCents: 21500 }],
  paid: ["Maya", "Dev", "Theo", "Noa"],
};
// @end params

type Goal = { label: string; amount: number };
type State = {
  club: string;
  term: string;
  dues: number;
  due: string;
  members: number;
  paidOutside: number;
  names: string[];
  goals: Goal[];
  paid: { [user: string]: number };
  nudges: { by: string; at: number }[];
};
type Action = { t: "pay" } | { t: "unpay" } | { t: "nudge" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const MAX_NUDGES = 50;
const POP = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });
const COUNT = tween({ duration: 500, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (x: number) => clamp(x, 0, 1);
const money = (cents: number) => {
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const d = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}$${d}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
};
const paidCount = (s: State) => s.paidOutside + Object.keys(s.paid).length;
const total = (s: State) => paidCount(s) * s.dues;
const unpaid = (s: State) => s.members - paidCount(s);
const goalSum = (s: State) => (s.goals.length ? s.goals.reduce((n, g) => n + g.amount, 0) : s.members * s.dues);
/** Goal panels: the real goals, or one "Club costs" panel. */
const panels = (s: State): Goal[] => (s.goals.length ? s.goals : [{ label: "Club costs", amount: s.members * s.dues }]);
const startOf = (gs: Goal[], i: number) => gs.slice(0, i).reduce((n, g) => n + g.amount, 0);
const latestPay = (s: State) => Object.values(s.paid).reduce((t, at) => Math.max(t, at), 0);
const fixed = (s: State) => JSON.stringify([s.dues, s.members, s.paidOutside, s.names, s.goals]);

export default defineApp<State, Action, Local>({
  name: "Club dues",
  summary: (s) => `${s.club} dues: ${paidCount(s)} of ${s.members} paid, ${money(total(s))} of ${money(goalSum(s))}`,

  init: (ctx) => {
    const members = typeof P.members === "number" && Number.isInteger(P.members) ? clamp(P.members, Math.max(1, ctx.members.length), 10_000) : Math.max(1, ctx.members.length);
    const out = typeof P.paidOutside === "number" && Number.isInteger(P.paidOutside) ? clamp(P.paidOutside, 0, Math.max(0, members - ctx.members.length)) : 0;
    const goals: Goal[] = [];
    for (const g of P.goals) {
      const label = clean(g.label, 24);
      if (label && Number.isInteger(g.amountCents) && g.amountCents >= 100 && g.amountCents <= 10_000_000 && goals.length < 3) goals.push({ label, amount: g.amountCents });
    }
    const paid: { [user: string]: number } = {};
    for (const nm of P.paid) {
      const want = clean(nm, 40).toLowerCase();
      const m = ctx.members.find((x) => x.id === nm || (x.name ?? "").toLowerCase() === want);
      if (m) paid[m.id] = 0;
    }
    return {
      club: clean(P.club, 40) || "Club",
      term: clean(P.term, 20),
      dues: Number.isInteger(P.duesCents) ? clamp(P.duesCents, 100, 100_000) : 2500,
      due: clean(P.due, 16),
      members,
      paidOutside: out,
      names: P.names.map((n) => clean(n, 12)).filter(Boolean).slice(0, 24),
      goals,
      paid,
      nudges: [],
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "pay") return has(s.paid, u) ? s : { ...s, paid: { ...s.paid, [u]: m.time } };
    if (a.t === "unpay") {
      if (!has(s.paid, u)) return s;
      const paid = { ...s.paid };
      delete paid[u];
      return { ...s, paid };
    }
    if (a.t === "nudge") {
      if (!has(s.paid, u) || unpaid(s) <= 0 || s.nudges.some((x) => x.by === u) || s.nudges.length >= MAX_NUDGES) return s;
      return { ...s, nudges: [...s.nudges, { by: u, at: m.time }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (Object.keys(s.paid).every((u) => inChat(ctx, u)) && s.nudges.every((x) => inChat(ctx, x.by))) return s;
    return { ...s, paid: Object.fromEntries(Object.entries(s.paid).filter(([u]) => inChat(ctx, u))), nudges: s.nudges.filter((x) => inChat(ctx, x.by)) };
  },

  invariants: {
    "payers are chat members": (s, ctx) => Object.entries(s.paid).every(([u, at]) => inChat(ctx, u) && typeof at === "number" && at >= 0),
    "the club is never more than paid": (s, ctx) => paidCount(s) <= s.members + ctx.members.length && s.paidOutside >= 0,
    "totals are whole cents": (s) => Number.isInteger(total(s)),
    "one nudge per person, by payers in the chat": (s, ctx) => new Set(s.nudges.map((x) => x.by)).size === s.nudges.length && s.nudges.every((x) => inChat(ctx, x.by)) && s.nudges.length <= MAX_NUDGES,
  },

  transitions: {
    "paying adds exactly the actor at this moment": (p, n, a, m, ctx) => {
      if (a.t !== "pay") return true;
      if (p === n) return !inChat(ctx, m.user) || has(p.paid, m.user);
      return !has(p.paid, m.user) && n.paid[m.user] === m.time && Object.keys(n.paid).length === Object.keys(p.paid).length + 1;
    },
    "undo removes only the actor's payment": (p, n, a, m, ctx) => {
      if (a.t !== "unpay") return true;
      if (p === n) return !inChat(ctx, m.user) || !has(p.paid, m.user);
      return has(p.paid, m.user) && !has(n.paid, m.user) && Object.keys(n.paid).length === Object.keys(p.paid).length - 1;
    },
    "only someone who paid can nudge, once": (p, n, a, m, ctx) => {
      if (a.t !== "nudge") return true;
      if (p === n) return !inChat(ctx, m.user) || !has(p.paid, m.user) || unpaid(p) <= 0 || p.nudges.some((x) => x.by === m.user) || p.nudges.length >= MAX_NUDGES;
      return has(p.paid, m.user) && !p.nudges.some((x) => x.by === m.user) && n.nudges.length === p.nudges.length + 1 && n.nudges.at(-1)!.at === m.time;
    },
    "dues and goals never change": (p, n) => fixed(p) === fixed(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (!has(s.paid, user)) return k < 0.75 ? { t: "pay" } : k < 0.85 ? { t: "nudge" } : { t: "unpay" };
    return k < 0.45 ? { t: "nudge" } : k < 0.7 ? { t: "unpay" } : { t: "pay" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = Math.min(innerWidth(), theme.width - 24);
    const B = Math.min(184, Math.round(0.5 * W));
    const heroH = Math.max(B, 170);
    const k = B / 184;
    const ss = Math.max(14, Math.round(19 * B / 184));
    const pos = mix(c.positive, c.text, 0.3);
    const gw = W - B - 8;
    const sum = goalSum(state);
    const tot = total(state);
    const left = unpaid(state);
    const myPaid = has(state.paid, me);
    const myNudge = state.nudges.find((x) => x.by === me);
    const gs = panels(state);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));

    // Confirmed-only moments.
    const cLast = latestPay(confirmed);
    const cTot = total(confirmed);
    const cGs = panels(confirmed);
    const newly = (i: number) => cLast > 0 && startOf(cGs, i) + cGs[i]!.amount <= cTot && startOf(cGs, i) + cGs[i]!.amount > cTot - confirmed.dues;
    const recent = cLast > 0 ? running(cLast, 450) !== null : false;
    const countE = cLast > 0 ? running(cLast, 500) : null;
    const shownTotal = countE === null ? tot : Math.round(tot - confirmed.dues + (tot - (tot - confirmed.dues)) * COUNT(countE) );

    // Seats.
    const chat = [...members.filter((m) => m.id === me), ...members.filter((m) => m.id !== me)];
    const S = Math.min(24, state.members);
    const chatSeats = Math.min(12, chat.length, S);
    const O = S - chatSeats;
    const uOut = Math.min(O, Math.max(0, state.members - chat.length - state.paidOutside));
    type Seat = { id: string; name: string; paid: boolean; at: number; mine: boolean };
    const seats: Seat[] = [
      ...chat.slice(0, chatSeats).map((m) => ({ id: m.id, name: m.name ?? "Member", paid: has(state.paid, m.id), at: state.paid[m.id] ?? 0, mine: m.id === me })),
      ...Array.from({ length: O }, (_, j) => ({ id: `o:${j}`, name: state.names[j] ?? "Member", paid: !(Math.floor((j * uOut) / O) !== Math.floor(((j + 1) * uOut) / O)), at: 0, mine: false })),
    ];
    const at = (i: number) => {
      const a = -Math.PI / 2 + (i / S) * 2 * Math.PI;
      return { x: (92 + 72 * Math.cos(a)) * k, y: (92 + 72 * Math.sin(a)) * k };
    };

    const frac = clamp01(sum ? tot / sum : 0);
    const circ = 2 * Math.PI * 51;

    // Coin and planes.
    const payY = heroH + 8 + 20;
    const payX = (W - 8) / 4;
    const nudgeX = (W + 8) / 2 + (W - 8) / 4;
    const coinE = confirmed.paid[me] && confirmed.paid[me]! > 0 ? running(confirmed.paid[me]!, 550) : null;
    const myNudgeC = confirmed.nudges.find((x) => x.by === me);
    const planeE = myNudgeC ? running(myNudgeC.at, 900) : null;
    const coin = () => {
      if (coinE === null) return null;
      const p = clamp01(coinE / 550);
      const x = payX + (B / 2 - payX) * p;
      const y = payY + (B / 2 - payY) * p - 4 * 50 * p * (1 - p);
      const rx = 11 * Math.max(0.25, Math.abs(Math.sin((coinE / 1000) * 14)));
      return (
        <svg width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true" style={{ position: "absolute", left: x - 12, top: y - 12, pointerEvents: "none", opacity: p > 0.9 ? (1 - p) * 10 : 1 }}>
          <ellipse cx={0} cy={0} rx={rx} ry={11} fill={pal().yellow} />
          <ellipse cx={0} cy={0} rx={rx * 0.72} ry={11 * 0.72} fill={pal().crust} />
        </svg>
      );
    };
    const planes = () => {
      if (planeE === null) return null;
      const targets = seats.map((s, i) => ({ s, i })).filter((x) => !x.s.paid);
      return targets.map(({ i }, n) => {
        const t = clamp01((planeE / 900 - Math.min(0.5, n * 0.05)) / 0.5);
        if (t <= 0) return null;
        const to = at(i);
        const x = nudgeX + (to.x - nudgeX) * t;
        const y = payY + (to.y - payY) * t - 20 * Math.sin(t * Math.PI);
        const ang = (Math.atan2(to.y - payY, to.x - nudgeX) * 180) / Math.PI;
        return (
          <svg key={i} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ position: "absolute", left: x - 7, top: y - 7, pointerEvents: "none", opacity: t > 0.8 ? (1 - t) * 5 : 1, transform: `rotate(${ang}deg)` }}>
            <path d="M1 1 L13 7 L1 13 L3.5 7Z" fill={c.primary} />
          </svg>
        );
      });
    };

    const check = (col: string, sz = 14) => (
      <svg width={sz} height={sz} viewBox="0 0 12 12" fill="none" stroke={col} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M2.5 6.2 5 8.6l4.5-5" />
      </svg>
    );

    const ring = (
      <div role="img" aria-label={`${paidCount(state)} of ${state.members} paid, ${money(tot)} of ${money(sum)}`} style={{ position: "relative", width: B, height: B, flexShrink: 0, overflow: "visible" }}>
        <svg width={B} height={B} viewBox="0 0 184 184" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
          <circle cx={92} cy={92} r={84} fill={c.wash} />
          <circle cx={92} cy={92} r={51} fill="none" stroke={c.track} stroke-width={7} />
          <circle cx={92} cy={92} r={51} fill="none" stroke={c.positive} stroke-width={7} stroke-linecap="round" transform="rotate(-90 92 92)" stroke-dasharray={`${frac * circ} ${circ}`} opacity={frac > 0 ? 1 : 0} style={{ transition: "stroke-dasharray 600ms" }} />
        </svg>
        <div style={{ position: "absolute", left: 40 * k, right: 40 * k, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minWidth: 0 }}>
          <span style={{ fontSize: B < 184 ? 24 : 30, fontWeight: 700, lineHeight: B < 184 ? "28px" : "34px", color: c.text, whiteSpace: "nowrap" }}>{money(shownTotal)}</span>
          <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`of ${money(sum)}`}</span>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "15px", color: pos, whiteSpace: "nowrap" }}>{`${paidCount(state)} of ${state.members} paid`}</span>
        </div>
        {seats.map((s, i) => {
          const p = at(i);
          const e = s.paid && s.at > 0 ? running(s.at, 400) : null;
          const sc = e === null ? 1 : 0.6 + 0.4 * POP(e);
          return (
            <span key={s.id} style={{ position: "absolute", left: p.x - ss / 2, top: p.y - ss / 2, width: ss, height: ss }}>
              {s.mine && !s.paid ? (
                <span
                  aria-hidden="true"
                  ref={(el: HTMLElement | null) => el?.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 900, iterations: Infinity })}
                  style={{ position: "absolute", left: -3, top: -3, width: ss + 6, height: ss + 6, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${c.primary}`, pointerEvents: "none" }}
                />
              ) : null}
              {e !== null ? <span aria-hidden="true" style={{ position: "absolute", left: -3, top: -3, width: ss + 6, height: ss + 6, boxSizing: "border-box", borderRadius: "50%", border: `2px solid ${c.positive}`, opacity: 1 - e / 400 }} /> : null}
              <span style={{ display: "flex", width: ss, height: ss, borderRadius: "50%", transform: `scale(${sc})`, boxShadow: `0 0 0 2px ${c.card}`, alignItems: "center", justifyContent: "center", background: s.paid ? "none" : c.secondaryButton, color: c.secondaryButtonText, fontSize: 10, fontWeight: 600, lineHeight: "10px" }}>
                {s.paid ? <Avatar user={s.id.startsWith("o:") ? { id: s.id, name: s.name } : s.id} size={ss} /> : (s.name[0] ?? "M").toUpperCase()}
              </span>
            </span>
          );
        })}
      </div>
    );

    const goalCol = (
      <div style={{ width: gw, minWidth: 0 }}>
        <div style={{ height: 20, lineHeight: "20px", fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>What dues pay for</div>
        {gs.map((g, i) => {
          const start = startOf(gs, i);
          const have = clamp01((tot - start) / g.amount);
          const covered = have >= 1;
          const bw = Math.max(0, gw - (covered ? 44 : 80));
          const pop = covered && recent && newly(i);
          return (
            <div
              key={`${i}${covered ? "c" : ""}`}
              ref={(el: HTMLElement | null) => {
                if (pop) el?.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 450 });
              }}
              style={{ position: "relative", height: 46, marginBottom: i < gs.length - 1 ? 6 : 0, borderRadius: 12, background: covered ? mix(c.card, c.positive, 0.14) : c.wash, boxSizing: "border-box", padding: "6px 10px 0" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: "18px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                <span style={{ flexShrink: 0, fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{money(g.amount)}</span>
              </div>
              <span style={{ position: "absolute", left: 10, top: 27, width: bw, height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
                <span style={{ display: "block", height: 6, borderRadius: 3, background: covered ? c.positive : c.primary, width: `${have * 100}%`, transition: "width 600ms" }} />
              </span>
              <span style={{ position: "absolute", right: 10, top: 20, height: 20, display: "flex", alignItems: "center", fontSize: 11, color: c.secondaryText, whiteSpace: "nowrap" }}>
                {covered ? (
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: c.positive, display: "flex", alignItems: "center", justifyContent: "center" }}>{check(c.card, 11)}</span>
                ) : (
                  `${Math.round(have * 100)}%`
                )}
              </span>
            </div>
          );
        })}
      </div>
    );

    const bar = (bg: string, children: unknown, grow = 1) => (
      <div style={{ height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", gap: 6, paddingLeft: 12, minWidth: 0, flex: `${grow} 1 0` }}>{children as never}</div>
    );
    const leftSide = myPaid
      ? bar(
          mix(c.card, c.positive, 0.15),
          <>
            {check(pos, 14)}
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: pos, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>You're paid up</span>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "unpay" })}>Undo</Button>
          </>,
          1.4,
        )
      : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            kind="primary"
            wide
            onClick={() => {
              dispatch({ t: "pay" });
              haptic("success");
            }}
          >
            {`Pay my ${money(state.dues)}`}
          </Button>
        </div>
      );
    const rightSide = !myPaid
      ? null
      : left <= 0
        ? bar(mix(c.card, c.positive, 0.15), <span style={{ flex: 1, textAlign: "center", paddingRight: 12, fontSize: 15, fontWeight: 600, color: pos }}>Everyone's paid</span>)
        : myNudge
          ? bar(
              c.secondaryButton,
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M1 1 L13 7 L1 13 L3.5 7Z" fill={c.text} />
                </svg>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Nudged · ${left} left`}</span>
              </>,
            )
          : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button kind="secondary" wide onClick={() => dispatch({ t: "nudge" })}>{`Nudge ${left} unpaid`}</Button>
            </div>
          );

    // Activity line.
    const payers = Object.entries(state.paid).filter(([u, a]) => a > 0 && inChat({ members }, u)).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([u]) => u);
    const lastNudge = [...state.nudges].reverse().find((x) => x.by !== me && inChat({ members }, x.by));
    let faces: string[];
    let line: string;
    if (!myPaid && lastNudge) {
      faces = [lastNudge.by];
      line = `${nameOf(lastNudge.by)} nudged you · due ${state.due}`;
    } else if (payers.length) {
      faces = payers;
      line = `${payers.map(nameOf).join(", ")} paid just now · ${left} left`;
    } else {
      faces = members.filter((m) => has(state.paid, m.id)).map((m) => m.id);
      line = `${state.due ? `due ${state.due} · ` : ""}${left} still to pay`;
    }

    const covered = cGs.findIndex((_g, i) => newly(i));
    const toast = cLast > 0 && covered >= 0 && running(cLast, 2400) !== null ? cLast : null;

    return (
      <div>
        <CardHeader title="Club dues" subtitle={[state.club, state.term, money(state.dues)].filter(Boolean).join(" · ")} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 8, height: heroH }}>
            {ring}
            {goalCol}
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", gap: 8, height: 40, alignItems: "center" }}>
            {leftSide}
            {rightSide}
          </div>
          {coin()}
          {planes()}
        </div>
        <div style={{ height: 8 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, minWidth: 0 }}>
          {faces.length ? <Facepile users={faces} max={3} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{line}</span>
        </div>
        {toast ? <Toast key={toast}>{`${cGs[covered]!.label} is covered · thanks for chipping in`}</Toast> : null}
      </div>
    );
  },
});
