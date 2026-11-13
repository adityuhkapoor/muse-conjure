import {
  defineApp,
  Avatar,
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

// Gas pump: the road trip's gas receipts rung up on a pump. The dial shows what the trip cost,
// split by everyone who rode; six nozzles hang off the pump, one per rider. Pay the driver and
// your nozzle clicks home. When every nozzle is holstered the pump reads "full".

type Params = {
  /** Chat or trip name: "lake placid trip" */
  trip: string;
  /** Who drove and paid at the pump: "Will" */
  driver: string;
  /** The car: "the Sube" */
  car: string;
  /** Miles driven, for the dial: 412 */
  miles: number;
  /** Receipts from the chat, in cents */
  receipts: { label: string; cents: number }[];
  /** Everyone in the car, driver included (2 to 8) */
  riders: string[];
  /** Riders who already paid the driver, each with what they said */
  paid: { who: string; said: string }[];
};

// @params
const P: Params = {
  trip: "lake placid trip",
  driver: "Will",
  car: "the Sube",
  miles: 412,
  receipts: [
    { label: "Sunoco", cents: 3840 },
    { label: "Wawa", cents: 4112 },
    { label: "Tolls", cents: 1200 },
    { label: "Stewart's", cents: 6802 },
  ],
  riders: ["Will", "Aditya", "Calvin", "Arun", "Tsai Lin", "Maya"],
  paid: [
    { who: "Maya", said: "sent w a gas emoji" },
    { who: "Arun", said: "paid in full + rice cooker rental" },
  ],
};
// @end params

type Rider = { id: string; name: string; member: boolean };
type Paid = { id: string; at: number; by: string; said: string };
type State = {
  trip: string;
  car: string;
  miles: number;
  driver: string;
  receipts: { label: string; cents: number }[];
  riders: Rider[];
  paid: Paid[];
  nudges: { to: string; from: string; at: number }[];
  fullAt: number;
};
type Action = { t: "pay" } | { t: "unpay" } | { t: "mark"; who: string } | { t: "nudge"; who: string };
type Local = { toast: number };

const MAX = 7;
const NUDGE_GAP = 60_000;
const HOME = spring(springs.iosBouncy);
const ROLL = tween({ duration: 1200, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const total = (s: State) => s.receipts.reduce((a, r) => a + r.cents, 0);
/** Shares in cents, rider order: the first (total mod n) riders carry one extra cent. */
const shares = (s: State) => {
  const n = s.riders.length;
  const t = total(s);
  return s.riders.map((_, i) => Math.floor(t / n) + (i < t % n ? 1 : 0));
};
const shareOf = (s: State, id: string) => shares(s)[s.riders.findIndex((r) => r.id === id)] ?? 0;
const owing = (s: State) => s.riders.filter((r) => r.id !== s.driver && !s.paid.some((p) => p.id === r.id));
const isPaid = (s: State, id: string) => s.paid.some((p) => p.id === id);
/** What the driver is owed back: everyone's share but his own. */
const owed = (s: State) => total(s) - shareOf(s, s.driver);
const collected = (s: State) => s.paid.reduce((a, p) => a + shareOf(s, p.id), 0);

function initState(ctx: Ctx): State {
  const riders: Rider[] = [];
  for (const raw of (Array.isArray(P.riders) ? P.riders : []).slice(0, MAX)) {
    const name = clean(raw, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (riders.some((r) => r.id === id)) continue;
    riders.push({ id, name: m ? clean(m.name, 20) || name : name, member: !!m });
  }
  const dn = clean(P.driver, 20) || riders[0]?.name || "Driver";
  let driver = riders.find((r) => same(r.name, dn) || r.id === dn)?.id;
  if (!driver) {
    const m = ctx.members.find((x) => same(x.name, dn));
    riders.unshift({ id: m ? m.id : dn, name: dn, member: !!m });
    driver = riders[0]!.id;
  }
  if (riders.length < 2) riders.push({ id: "Rider", name: "Rider", member: false });
  const receipts = (Array.isArray(P.receipts) ? P.receipts : [])
    .filter((r) => r && Number.isInteger(r.cents) && r.cents > 0 && r.cents < 1_000_000)
    .slice(0, 5)
    .map((r) => ({ label: clean(r.label, 14) || "Receipt", cents: r.cents }));
  if (!receipts.length) receipts.push({ label: "Gas", cents: 6000 });
  const paid: Paid[] = [];
  for (const p of Array.isArray(P.paid) ? P.paid : []) {
    const r = riders.find((x) => same(x.name, clean(p?.who, 20)));
    if (!r || r.id === driver || paid.some((x) => x.id === r.id)) continue;
    paid.push({ id: r.id, at: 0, by: r.id, said: clean(p.said, 40) });
  }
  const s: State = {
    trip: clean(P.trip, 32) || "road trip",
    car: clean(P.car, 16) || "the car",
    miles: Number.isInteger(P.miles) && P.miles > 0 && P.miles < 100_000 ? P.miles : 0,
    driver,
    receipts,
    riders,
    paid,
    nudges: [],
    fullAt: 0,
  };
  return { ...s, fullAt: owing(s).length === 0 ? 1 : 0 };
}

function settle(s: State, paid: Paid[], meta: Meta): State {
  const n = { ...s, paid, nudges: s.nudges.filter((x) => !paid.some((p) => p.id === x.to)) };
  return { ...n, fullAt: owing(n).length === 0 ? (s.fullAt || meta.time) : 0 };
}

function reduceGas(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "pay") {
    if (u === s.driver || isPaid(s, u) || !s.riders.some((r) => r.id === u)) return s;
    return settle(s, [...s.paid, { id: u, at: meta.time, by: u, said: "" }], meta);
  }
  if (a.t === "unpay") {
    if (!isPaid(s, u)) return s;
    return settle(s, s.paid.filter((p) => p.id !== u), meta);
  }
  if (a.t === "mark") {
    const who = a.who;
    if (typeof who !== "string") return s;
    const r = s.riders.find((x) => x.id === who);
    if (!r || r.member || r.id === s.driver || isPaid(s, who)) return s;
    return settle(s, [...s.paid, { id: who, at: meta.time, by: u, said: "" }], meta);
  }
  if (a.t === "nudge") {
    const who = a.who;
    if (typeof who !== "string" || who === u || who === s.driver) return s;
    if (!s.riders.some((r) => r.id === who) || isPaid(s, who)) return s;
    if (s.nudges.some((x) => x.to === who && meta.time - x.at < NUDGE_GAP)) return s;
    return { ...s, nudges: [...s.nudges.filter((x) => x.to !== who), { to: who, from: u, at: meta.time }] };
  }
  return s;
}

// ---- the picture ----

function Nozzle(p: { x: number; y: number; tilt: number; ink: string; grip: string }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.tilt})`}>
      <path d="M8 7 Q17 11 14 23 L8 22" fill="none" stroke={p.ink} stroke-width={2} stroke-linejoin="round" />
      <path d="M-6 0 H6 Q9 0 9 4 V21 Q9 26 4 26 H-4 Q-9 26 -9 21 V4 Q-9 0 -6 0 Z" fill={p.grip} />
      <rect x={-5} y={3} width={3} height={18} rx={1.5} fill={p.ink} opacity={0.18} />
      <path d="M-2 26 L-12 40" fill="none" stroke={p.ink} stroke-width={4.5} stroke-linecap="round" />
      <rect x={-6} y={-3} width={12} height={5} rx={2} fill={p.ink} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Gas pump",
  summary: (s) => {
    const left = owing(s);
    const drv = s.riders.find((r) => r.id === s.driver)?.name ?? "the driver";
    if (!left.length) return `Gas for the ${s.trip}: ${money(total(s))}, ${drv} is square`;
    return `Gas for the ${s.trip}: ${money(shareOf(s, left[0]!.id))} each to ${drv} · ${left.length} still owe`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceGas(s, a as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (s, ctx) => {
    const riders = s.riders.map((r) => {
      if (r.member && !inChat(ctx, r.id) && !isPaid(s, r.id) && r.id !== s.driver) return { ...r, member: false };
      if (!r.member) {
        const m = ctx.members.find((x) => same(x.name, r.name));
        if (m && !s.riders.some((y) => y.id === m.id)) return r; // stand-ins keep their id; they can still be marked
      }
      return r;
    });
    const changed = riders.some((r, i) => r !== s.riders[i]);
    return changed ? { ...s, riders } : s;
  },

  invariants: {
    "shares add up to the receipts": (s) => shares(s).reduce((a, b) => a + b, 0) === total(s) && shares(s).every((x) => Number.isInteger(x) && x >= 0),
    "shares differ by at most a cent": (s) => Math.max(...shares(s)) - Math.min(...shares(s)) <= 1,
    "each rider pays once and the driver never pays": (s) =>
      new Set(s.paid.map((p) => p.id)).size === s.paid.length && s.paid.every((p) => p.id !== s.driver && s.riders.some((r) => r.id === p.id)),
    "the driver is a rider": (s) => s.riders.some((r) => r.id === s.driver) && new Set(s.riders.map((r) => r.id)).size === s.riders.length,
    "full exactly when every nozzle is home": (s) => (s.fullAt > 0) === (owing(s).length === 0),
    "collected never passes what is owed": (s) => collected(s) <= owed(s) && (s.fullAt === 0 || collected(s) === owed(s)),
    "nudges only go to people who owe": (s) =>
      s.nudges.every((x) => x.to !== x.from && owing(s).some((r) => r.id === x.to)) && new Set(s.nudges.map((x) => x.to)).size === s.nudges.length,
    "members who owe are in the chat": (s, ctx) => s.riders.every((r) => !r.member || r.id === s.driver || isPaid(s, r.id) || inChat(ctx, r.id)),
  },

  transitions: {
    "paying holsters exactly your nozzle": (p, n, a, m) =>
      a.t !== "pay" || p === n || (n.paid.length === p.paid.length + 1 && n.paid.at(-1)!.id === m.user && n.paid.at(-1)!.at === m.time && !isPaid(p, m.user)),
    "only you take your payment back": (p, n, a, m) =>
      a.t !== "unpay" || p === n || (isPaid(p, m.user) && !isPaid(n, m.user) && n.paid.length === p.paid.length - 1),
    "marking is for riders outside the chat": (p, n, a) =>
      a.t !== "mark" || p === n || (!(p.riders.find((r) => r.id === a.who)?.member ?? true) && isPaid(n, a.who) && n.paid.length === p.paid.length + 1),
    "a nudge waits a minute and changes no money": (p, n, a, m) =>
      a.t !== "nudge" || p === n || (!p.nudges.some((x) => x.to === a.who && m.time - x.at < NUDGE_GAP) && n.paid === p.paid && n.nudges.some((x) => x.to === a.who && x.at === m.time)),
    "receipts and riders never change": (p, n) => p.receipts === n.receipts && p.driver === n.driver && p.riders.length === n.riders.length,
    "the pump fills once per fill": (p, n) => p.fullAt === 0 || n.fullAt === 0 || n.fullAt === p.fullAt,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.45) return { t: "pay" };
    if (k < 0.6) return { t: "unpay" };
    const stand = s.riders.filter((x) => !x.member && x.id !== s.driver && !isPaid(s, x.id));
    if (k < 0.8 && stand.length) return { t: "mark", who: r.pick(stand).id };
    const o = owing(s).filter((x) => x.id !== user);
    return o.length ? { t: "nudge", who: r.pick(o).id } : { t: "pay" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const W = theme.width - 2 * theme.space.card;
    const H = 252;
    const t = total(state);
    const drv = state.riders.find((r) => r.id === state.driver)!;
    const mine = state.riders.some((r) => r.id === me) && me !== state.driver;
    const myShare = shareOf(state, me);
    const paidMe = isPaid(state, me);
    const full = state.fullAt > 0;
    const left = owing(state);

    // Pump on the left, the nozzle rack to its right.
    const n = state.riders.length;
    const pw = Math.max(72, Math.min(118, W - 6 - n * 37));
    const rackL = pw + 6;
    const lcd = pw >= 110 ? 20 : pw >= 90 ? 16 : 14;
    const small = pw < 100;
    const col = (W - rackL) / n;
    const pipeY = 34;
    const cradleY = 60;
    const hangY = 140;

    // The dial rolls up to what has come in.
    const lastAt = Math.max(0, ...confirmed.paid.map((p) => p.at));
    const roll = running(lastAt, 1200);
    const got = collected(confirmed);
    const prevGot = got - (confirmed.paid.find((p) => p.at === lastAt) ? shareOf(confirmed, confirmed.paid.find((p) => p.at === lastAt)!.id) : 0);
    const shown = roll === null ? got : Math.round(prevGot + (got - prevGot) * ROLL(roll));
    const digits = "ui-monospace, Menlo, Consolas, monospace";
    const lcdInk = theme.mode === "dark" ? pl.green : mix(pl.green, c.card, 0.3);
    const slipInk = theme.mode === "dark" ? c.card : c.text;

    const hoses: Child[] = [];
    const nozzles: Child[] = [];
    const overlays: Child[] = [];
    state.riders.forEach((r, i) => {
      const cx = rackL + col * i + col / 2;
      const home = r.id === state.driver || isPaid(state, r.id);
      const entry = state.paid.find((p) => p.id === r.id);
      const e = entry && entry.at > 0 ? running(entry.at, 900) : null;
      const k = home ? (e === null ? 1 : Math.min(1.08, HOME(e))) : 0;
      // Dangling nozzles rest at a slight angle; a nudge sets one swinging for a moment.
      const nz = state.nudges.find((x) => x.to === r.id);
      const sw = nz ? running(nz.at, 1600) : null;
      const sway = home ? 0 : (i % 2 ? 2 : -2) + (sw === null ? 0 : Math.sin(sw / 90) * 9 * (1 - sw / 1600));
      const y = hangY + (cradleY - hangY) * k;
      const x = cx + (1 - k) * sway;
      const tilt = home ? 10 * (1 - Math.min(1, k)) : -sway * 1.5;
      // A holstered hose loops beside the pump; a dangling one hangs straight down to its rider.
      hoses.push(
        <path
          key={`h${r.id}`}
          d={home ? `M ${cx} ${pipeY + 4} C ${cx + col * 0.42} ${pipeY + 40}, ${cx + col * 0.42} ${y + 30}, ${x} ${y - 2}` : `M ${cx} ${pipeY + 4} Q ${cx + sway * 0.4} ${(pipeY + y) / 2}, ${x} ${y - 2}`}
          fill="none"
          stroke={mix(c.text, c.card, 0.35)}
          stroke-width={3.5}
          stroke-linecap="round"
        />,
      );
      nozzles.push(<Nozzle key={`n${r.id}`} x={x} y={y} tilt={tilt} ink={c.text} grip={r.id === me && !home ? c.primary : home ? pl.green : pl.orange} />);
      if (e !== null && home) {
        const q = e / 900;
        nozzles.push(<circle key={`c${r.id}`} cx={cx} cy={cradleY + 14} r={10 + 18 * q} fill="none" stroke={pl.green} stroke-width={2} opacity={Math.max(0, 1 - q)} />);
      }
      const label = r.id === state.driver ? "drove" : home ? "paid" : "owes";
      const tap = !home && r.id !== me ? () => dispatch(r.member ? { t: "nudge", who: r.id } : { t: "mark", who: r.id }) : !home && r.id === me ? () => { dispatch({ t: "pay" }); haptic("success"); setLocal({ toast: local.toast + 1 }); } : null;
      const nudged = state.nudges.find((x) => x.to === r.id);
      const nudging = nudged ? running(nudged.at, 1400) : null;
      overlays.push(
        <button
          key={`o${r.id}`}
          type="button"
          class="m-hit"
          aria-label={home ? `${r.name}, ${label}` : r.id === me ? `Pay ${drv.name} ${money(shareOf(state, r.id))}` : r.member ? `Nudge ${r.name}` : `Mark ${r.name} paid`}
          {...(tap ? { onClick: tap } : {})}
          style={{ position: "absolute", left: cx - col / 2, width: col, top: 190, height: 58, display: "flex", flexDirection: "column", alignItems: "center", cursor: tap ? "pointer" : "default" }}
        >
          <span style={{ position: "relative", display: "flex", filter: home ? undefined : "grayscale(0.7)" }}>
            <Avatar user={{ id: r.id, name: r.name }} size={26} />
          </span>
          <span style={{ marginTop: 2, maxWidth: col, fontSize: 11, lineHeight: "14px", color: home ? c.text : c.secondaryText, fontWeight: r.id === me ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.id === me ? "You" : r.name}
          </span>
          <span style={{ fontSize: 11, lineHeight: "13px", color: home ? mix(c.positive, c.text, 0.35) : c.secondaryText, whiteSpace: "nowrap" }}>{label}</span>
          {nudging !== null ? (
            <span style={{ position: "absolute", top: -22 - nudging / 200, left: "50%", transform: "translateX(-50%)", padding: "2px 6px", borderRadius: 99, background: c.primary, color: c.onPrimary, fontSize: 11, lineHeight: "14px", whiteSpace: "nowrap", pointerEvents: "none" }}>
              Nudged
            </span>
          ) : null}
        </button>,
      );
    });

    // Receipts taped down the pump's side.
    const slips = state.receipts.slice(0, 4).map((r, i) => (
      <g key={`s${i}`} transform={`translate(12 ${128 + i * 26}) rotate(${i % 2 ? 1.5 : -1.5})`}>
        <path d={`M0 0 H${pw - 24} V18 l-4 3 -4 -3 -4 3 -4 -3 -4 3 -4 -3 H0 Z`} fill={pl.paper} stroke={c.divider} stroke-width={1} />
        <text x={5} y={13} font-size={10} fill={slipInk} font-family={theme.type.family}>
          {small ? "" : r.label.length > 8 ? r.label.slice(0, 7) + "…" : r.label}
        </text>
        <text x={pw - 29} y={13} font-size={10} text-anchor="end" fill={slipInk} font-family={digits}>
          {money(r.cents)}
        </text>
      </g>
    ));
    const gl = full ? running(state.fullAt, 2400) : null;
    const glow = gl === null ? (full ? 1 : 0) : 0.5 + 0.5 * Math.sin(gl / 150);

    return (
      <div>
        <CardHeader title={`Gas for the ${state.trip}`} subtitle={`${drv.name} drove ${state.car}${state.miles ? ` · ${state.miles} mi` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gas pump: ${money(got)} of ${money(owed(state))} paid back to ${drv.name}, ${left.length} still owe`} style={{ display: "block", overflow: "visible" }}>
            
            {/* pump body */}
            <rect x={4} y={4} width={pw - 8} height={234} rx={14} fill={pl.red} />
            <rect x={4} y={4} width={pw - 8} height={22} rx={11} fill={mix(pl.red, c.text, 0.25)} />
            <text x={pw / 2} y={19} text-anchor="middle" font-size={12} font-weight={700} fill={theme.mode === "dark" ? c.card : pl.on} font-family={theme.type.family}>
              {small ? "Fuel" : `${state.car.replace(/^the /i, "")} fuel`}
            </text>
            <rect x={10} y={32} width={pw - 20} height={88} rx={8} fill={theme.mode === "dark" ? mix(c.wash, pl.green, full ? 0.1 + 0.1 * glow : 0.04) : mix(c.text, pl.green, full ? 0.15 + 0.1 * glow : 0.1)} />
            <text x={pw - 15} y={56} text-anchor="end" font-size={11} fill={lcdInk} font-family={digits}>
              {full ? "Full" : small ? "Back" : "Paid back"}
            </text>
            <text x={pw - 15} y={80} text-anchor="end" font-size={lcd} font-weight={700} fill={lcdInk} font-family={digits}>
              {money(shown)}
            </text>
            <text x={pw - 15} y={98} text-anchor="end" font-size={11} fill={lcdInk} font-family={digits}>
              {`of ${money(owed(state))}`}
            </text>
            <text x={pw - 15} y={113} text-anchor="end" font-size={11} fill={lcdInk} font-family={digits}>
              {small ? `${money(shares(state)[n - 1]!)} ea` : `÷${n} = ${money(shares(state)[n - 1]!)}`}
            </text>
            {slips}
            {/* the rack */}
            <rect x={pw - 8} y={pipeY - 4} width={W - pw + 8} height={8} rx={4} fill={mix(pl.red, c.text, 0.25)} />
            {state.riders.map((_, i) => (
              <path key={`k${i}`} d={`M ${rackL + col * i + col / 2 - 10} ${cradleY - 6} v 8 q 0 7 7 7 h 6 q 7 0 7 -7 v -8`} fill="none" stroke={c.track} stroke-width={3} stroke-linecap="round" />
            ))}
            {hoses}
            {nozzles}
            {gl !== null
              ? Array.from({ length: 9 }, (_, k) => {
                  const q = Math.min(1, gl / 1400);
                  const ang = -Math.PI / 2 + (k - 4) * 0.32;
                  const d = 14 + 70 * q;
                  return (
                    <path
                      key={`b${k}`}
                      d="M0 -7 C4 -1 5 3 0 6 C-5 3 -4 -1 0 -7 Z"
                      transform={`translate(${pw / 2 + Math.cos(ang) * d} ${76 + Math.sin(ang) * d + 60 * q * q}) scale(${1.2 - 0.5 * q})`}
                      fill={k % 2 ? pl.yellow : pl.green}
                      opacity={Math.max(0, 1 - q)}
                    />
                  );
                })
              : null}
          </svg>
          {overlays}
        </div>
        <div style={{ minHeight: 20, marginTop: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {(() => {
            const said = [...state.paid].reverse().find((p) => p.said);
            if (full) return `Every nozzle's home · ${drv.name} got ${money(owed(state))} back`;
            if (said) return `${state.riders.find((r) => r.id === said.id)?.name}: "${said.said}"`;
            return `${left.length} nozzles still out`;
          })()}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {full ? (
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.text }}>{`${drv.name} is square`}</span>
          ) : !mine ? (
            <span style={{ flex: 1, fontSize: 13, color: c.secondaryText }}>{me === state.driver ? `Tap a face to nudge · ${left.length} owe you` : "Tap a face to nudge"}</span>
          ) : paidMe ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {left.length ? `Sent ${money(myShare)} · tap a face to nudge` : `Sent ${money(myShare)}`}
              </span>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unpay" })}>
                Undo
              </Button>
            </>
          ) : (
            <Button
              kind="primary"
              wide
              onClick={() => {
                dispatch({ t: "pay" });
                haptic("success");
                setLocal({ toast: local.toast + 1 });
              }}
            >
              {`Pay ${drv.name} ${money(myShare)}`}
            </Button>
          )}
        </div>
        {local.toast > 0 && paidMe ? <Toast key={local.toast}>{`${money(myShare)} to ${drv.name} · nozzle's home`}</Toast> : null}
      </div>
    );
  },
});
