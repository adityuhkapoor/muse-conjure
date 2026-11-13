import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, tween, type Ctx } from "@muse/app";

// Jersey order: a team jersey that spins to show your name and number as you pick them, next to
// the rack of everyone's jerseys on hangers (numbers already taken can't be picked). Order yours
// and it flies onto the rack; at the target count the order closes and everyone pays their share.

type Params = {
  /** Card title */
  title: string;
  /** Team name, printed on the front */
  team: string;
  /** Price per jersey in cents */
  priceCents: number;
  /** Order closes at this many jerseys */
  need: number;
  /** Deadline, as said: 'Fri' */
  deadline: string;
  /** Sizes offered, short: 'S', 'M' */
  sizes: string[];
  /** Orders already in: name (chat members matched by name), number, size, and what they said */
  orders: { name: string; number: number; size: string; said?: string }[];
};

// @params
const P: Params = {
  title: "Jersey order",
  team: "Eastfield Ultimate",
  priceCents: 3500,
  need: 20,
  deadline: "Fri",
  sizes: ["S", "M", "L", "XL"],
  orders: [
    { name: "Calvin", number: 7, size: "M", said: "seven. for the alarms, obviously" },
    { name: "Will", number: 25, size: "L", said: "25, like my shower minutes" },
    { name: "Arun", number: 8, size: "M", said: "the rice cooker has 8 settings" },
    { name: "Maya", number: 3, size: "S" },
    { name: "Jonah", number: 11, size: "L" }, { name: "Priya", number: 4, size: "S" }, { name: "Diego", number: 10, size: "M" },
    { name: "Sam", number: 22, size: "XL" }, { name: "Lena", number: 9, size: "S" }, { name: "Kofi", number: 1, size: "L" },
    { name: "Rae", number: 13, size: "M" }, { name: "Theo", number: 17, size: "M" }, { name: "Nina", number: 21, size: "S" },
    { name: "Omar", number: 99, size: "XL" }, { name: "Bea", number: 0, size: "M" },
  ],
};
// @end params

type Order = { who: string; name: string; number: number; size: number; at: number; paid: boolean };
type State = { title: string; team: string; price: number; need: number; deadline: string; sizes: string[]; orders: Order[]; said: { [u: string]: string }; closed: boolean; closedAt: number };
type Action = { t: "order"; number: number; size: number } | { t: "cancel" } | { t: "pay" };
type Local = { number: number; size: number; flip: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const mineOf = (s: State, u: string) => s.orders.findIndex((o) => o.who === u);
const takenBy = (s: State, n: number) => s.orders.find((o) => o.number === n);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? `.${String(c % 100).padStart(2, "0")}` : ""}`;
const fly = tween({ duration: 700, easing: [0.3, 1.25, 0.6, 1] });
// The jersey is the team's own artwork: its colours are user content.
const userContent = (c: string) => c;
const KIT = userContent("#1f4fd1");
const KIT_DARK = userContent("#163a9c");
const TRIM = userContent("#ffd23f");
const INK = userContent("#ffffff");

function initState(ctx: Ctx): State {
  const sizes = (Array.isArray(P.sizes) ? P.sizes : []).map((x) => clean(x, 4)).filter(Boolean).slice(0, 5);
  if (!sizes.length) sizes.push("S", "M", "L");
  const need = isInt(P.need, 2, 40) ? P.need : 20;
  const orders: Order[] = [];
  const said: { [u: string]: string } = {};
  for (const o of Array.isArray(P.orders) ? P.orders : []) {
    const name = clean(o?.name, 16);
    if (!name || !isInt(o.number, 0, 99) || orders.length >= need - 1 || orders.some((x) => x.number === o.number)) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `o:${name}`;
    if (orders.some((x) => x.who === who)) continue;
    const size = Math.max(0, sizes.findIndex((z) => z.toLowerCase() === clean(o.size, 4).toLowerCase()));
    orders.push({ who, name: m ? m.name : name, number: o.number, size, at: 0, paid: false });
    const q = clean(o.said, 60);
    if (q && m) said[m.id] = q;
  }
  return {
    title: clean(P.title, 40) || "Jersey order", team: clean(P.team, 30) || "Team", price: isInt(P.priceCents, 0, 100_000) ? P.priceCents : 3500,
    need, deadline: clean(P.deadline, 16), sizes, orders, said, closed: false, closedAt: 0,
  };
}

export default defineApp<State, Action, Local>({
  name: "Jersey order",
  summary: (s) => (s.closed ? `${s.team} jerseys ordered · ${s.orders.filter((o) => o.paid).length} of ${s.orders.length} paid` : `${s.team} jerseys · ${s.orders.length} of ${s.need} in${s.deadline ? ` · closes ${s.deadline}` : ""}`),

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    const k = mineOf(s, u);
    if (a.t === "order") {
      if (s.closed || !isInt(a.number, 0, 99) || !isInt(a.size, 0, s.sizes.length - 1)) return s;
      const t = takenBy(s, a.number);
      if (t && t.who !== u) return s;
      if (k >= 0 && s.orders[k]!.number === a.number && s.orders[k]!.size === a.size) return s;
      const name = ctx.members.find((x) => x.id === u)?.name ?? "Player";
      const mine: Order = { who: u, name, number: a.number, size: a.size, at: m.time, paid: false };
      const orders = k >= 0 ? s.orders.map((o, j) => (j === k ? mine : o)) : [...s.orders, mine];
      const closed = orders.length >= s.need;
      return { ...s, orders, closed, closedAt: closed ? m.time : 0 };
    }
    if (a.t === "cancel") {
      if (s.closed || k < 0) return s;
      return { ...s, orders: s.orders.filter((o) => o.who !== u) };
    }
    if (a.t === "pay") {
      if (!s.closed || k < 0 || s.orders[k]!.paid) return s;
      return { ...s, orders: s.orders.map((o, j) => (j === k ? { ...o, paid: true, at: m.time } : o)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.closed) return s;
    const gone = (o: Order) => !o.who.startsWith("o:") && !inChat(ctx, o.who);
    return s.orders.some(gone) ? { ...s, orders: s.orders.filter((o) => !gone(o)) } : s;
  },

  invariants: {
    "numbers are unique and 0 to 99": (s) => new Set(s.orders.map((o) => o.number)).size === s.orders.length && s.orders.every((o) => isInt(o.number, 0, 99)),
    "one jersey per person": (s) => new Set(s.orders.map((o) => o.who)).size === s.orders.length,
    "sizes are offered sizes": (s) => s.orders.every((o) => isInt(o.size, 0, s.sizes.length - 1)),
    "closed exactly at the target": (s) => (s.closed ? s.orders.length >= s.need : s.orders.length < s.need && s.closedAt === 0),
    "nobody pays before it closes": (s) => s.closed || s.orders.every((o) => !o.paid),
    "open orders are from the chat": (s, ctx) => s.closed || s.orders.every((o) => o.who.startsWith("o:") || inChat(ctx, o.who)),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "ordering sets only the actor's jersey": (p, n, a, m) => {
      if (a.t !== "order" || p === n) return true;
      const o = n.orders.find((x) => x.who === m.user);
      const others = (s: State) => JSON.stringify(s.orders.filter((x) => x.who !== m.user));
      return !!o && o.number === a.number && o.size === a.size && o.at === m.time && others(p) === others(n) && !p.closed;
    },
    "a free number is never refused": (p, n, a, m, ctx) => {
      if (a.t !== "order" || p !== n) return true;
      const k = mineOf(p, m.user);
      const same = k >= 0 && p.orders[k]!.number === a.number && p.orders[k]!.size === a.size;
      return !(inChat(ctx, m.user) && !p.closed && isInt(a.number, 0, 99) && isInt(a.size, 0, p.sizes.length - 1) && !takenBy(p, a.number) && !same);
    },
    "closing happens on the order that fills it": (p, n, a, m) => p.closed || !n.closed || (a.t === "order" && n.closedAt === m.time),
    "a closed order keeps its jerseys": (p, n) => !p.closed || (n.closed && n.orders.length === p.orders.length && n.orders.every((o, j) => o.number === p.orders[j]!.number && o.who === p.orders[j]!.who)),
    "cancel removes only the actor": (p, n, a, m) => a.t !== "cancel" || p === n || (mineOf(n, m.user) < 0 && n.orders.length === p.orders.length - 1),
    "paying marks only the actor": (p, n, a, m) => a.t !== "pay" || p === n || n.orders.every((o, j) => (o.who === m.user ? o.paid && !p.orders[j]!.paid : o.paid === p.orders[j]!.paid)),
  },

  arbitrary: (s, u, r) => {
    if (s.closed) return { t: "pay" };
    if (mineOf(s, u) >= 0 && r.next() < 0.2) return { t: "cancel" };
    const free = Array.from({ length: 100 }, (_v, n) => n).filter((n) => !takenBy(s, n) || takenBy(s, n)!.who === u);
    return { t: "order", number: r.next() < 0.85 && free.length ? r.pick(free) : r.int(100), size: r.int(s.sizes.length) };
  },

  local: { number: -1, size: 1, flip: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const k = mineOf(state, me);
    const mine = k >= 0 ? state.orders[k]! : null;
    const myName = (members.find((m) => m.id === me)?.name ?? "You").split(" ")[0]!;
    const isFree = (n: number) => !takenBy(state, n) || takenBy(state, n)!.who === me;
    const firstFree = (() => {
      for (const n of [7, 12, 14, 23, 5, 2, 6, 15, 16, 18, 19, 20, 24, 30]) if (isFree(n)) return n;
      for (let n = 0; n < 100; n++) if (isFree(n)) return n;
      return 0;
    })();
    const num = local.number >= 0 && isFree(local.number) ? local.number : mine ? mine.number : firstFree;
    const size = Math.min(local.size, state.sizes.length - 1);
    const step = (d: number) => {
      let n = num;
      for (let i = 0; i < 100; i++) {
        n = (n + d + 100) % 100;
        if (isFree(n)) break;
      }
      setLocal({ number: n, flip: local.flip % 2 ? local.flip + 1 : local.flip });
      haptic("light");
    };
    const showBack = local.flip % 2 === 0;
    const left = state.need - state.orders.length;
    const dirty = !mine || mine.number !== num || mine.size !== size;

    // The big jersey: two faces on a card that spins on Y.
    const JW = Math.min(170, Math.round(W * 0.44));
    const JH = Math.round(JW * 1.08);
    const shirt = (back: boolean) => (
      <svg width={JW} height={JH} viewBox="0 0 170 184" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, backfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined }}>
        <path d="M58 6 Q85 22 112 6 L150 22 L168 66 L140 78 L136 62 L136 178 Q85 186 34 178 L34 62 L30 78 L2 66 L20 22 Z" fill={KIT} stroke={KIT_DARK} stroke-width={3} stroke-linejoin="round" />
        <path d="M58 6 Q85 22 112 6" fill="none" stroke={TRIM} stroke-width={6} />
        <path d="M2 66 L30 78 M168 66 L140 78" stroke={TRIM} stroke-width={5} />
        <path d="M34 120 L136 120" stroke={KIT_DARK} stroke-width={2} opacity={0.4} />
        {back ? (
          <>
            <text x={85} y={52} fill={INK} font-size={myName.length > 7 ? 15 : 19} font-weight={800} text-anchor="middle" letter-spacing={2} font-family="system-ui, sans-serif">{myName.toUpperCase().slice(0, 10)}</text>
            <text x={85} y={142} fill={TRIM} stroke={KIT_DARK} stroke-width={2} paint-order="stroke" font-size={86} font-weight={900} text-anchor="middle" font-family="system-ui, sans-serif">{String(num)}</text>
          </>
        ) : (
          <>
            <ellipse cx={85} cy={84} rx={26} ry={9} fill={TRIM} transform="rotate(-12 85 84)" />
            <ellipse cx={85} cy={82} rx={16} ry={4} fill={KIT} transform="rotate(-12 85 82)" opacity={0.5} />
            <path d="M48 70 q10 -6 18 -2 M44 80 q8 -4 14 -1" stroke={INK} stroke-width={2.5} fill="none" stroke-linecap="round" />
            <text x={85} y={126} fill={INK} font-size={14} font-weight={800} text-anchor="middle" letter-spacing={1.5} font-family="system-ui, sans-serif">{state.team.toUpperCase().split(" ")[0]!.slice(0, 11)}</text>
            <text x={85} y={146} fill={TRIM} font-size={11} font-weight={700} text-anchor="middle" letter-spacing={3} font-family="system-ui, sans-serif">{(state.team.split(" ").slice(1).join(" ") || "Team").toUpperCase().slice(0, 14)}</text>
          </>
        )}
      </svg>
    );
    const jersey = (
      <button type="button" aria-label={`Your jersey: ${myName}, number ${num}, size ${state.sizes[size]}. Tap to spin`} onClick={() => { setLocal({ flip: local.flip + 1 }); haptic("light"); }}
        style={{ position: "relative", width: JW, height: JH, padding: 0, border: 0, background: "transparent", cursor: "pointer", perspective: "600px", flexShrink: 0 }}>
        <span style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transition: "transform 700ms cubic-bezier(.3,1.3,.5,1)", transform: `rotateY(${180 + local.flip * 180}deg)` }}>
          {shirt(false)}
          {shirt(true)}
        </span>
        <span style={{ position: "absolute", right: 2, bottom: 2, padding: "1px 7px", borderRadius: 99, background: c.card, color: c.text, fontSize: 12, fontWeight: 700, lineHeight: "18px", boxShadow: `0 0 0 1px ${c.divider}` }}>{state.sizes[size]}</span>
      </button>
    );
    void showBack;

    // The rack: one hanger per jersey in the order, filled ones show their number.
    const cols = 5;
    const RW = W - JW - 10;
    const cw = RW / cols;
    const rows = Math.ceil(state.need / cols);
    const rh = Math.min(42, (JH - 14) / rows);
    const mini = Math.min(cw - 6, rh * 0.95);
    const myAt = confirmed.orders.find((o) => o.who === me)?.at ?? 0;
    const flyE = myAt > 0 && !confirmed.closed ? running(myAt, 700) : null;
    const rack = (
      <div style={{ position: "relative", width: RW, height: JH, flexShrink: 0 }}>
        <svg width={RW} height={JH} viewBox={`0 0 ${RW} ${JH}`} role="img" aria-label={`Rack: ${state.orders.length} of ${state.need} jerseys ordered`} style={{ display: "block" }}>
          {Array.from({ length: rows }, (_v, r) => (
            <rect key={`rail${r}`} x={2} y={10 + r * rh} width={RW - 4} height={2.5} rx={1} fill={mix(c.secondaryText, c.card, 0.3)} />
          ))}
          {Array.from({ length: state.need }, (_v, i) => {
            const o = state.orders[i];
            const x = (i % cols) * cw + cw / 2;
            const y = 12 + Math.floor(i / cols) * rh;
            const s = mini / 34;
            const isMine = o?.who === me;
            const drop = isMine && flyE !== null ? (1 - fly(flyE)) * -60 : 0;
            return (
              <g key={`j${i}`} transform={`translate(${x} ${y + drop})`}>
                <path d={`M0 0 L0 3`} stroke={c.secondaryText} stroke-width={1.2} />
                <path transform={`scale(${s}) translate(-17 3)`} d="M11 0 Q17 4 23 0 L31 4 L34 12 L28 14 L28 34 L6 34 L6 14 L0 12 L3 4 Z"
                  fill={o ? (isMine ? c.primary : o.paid ? mix(KIT, c.card, 0.25) : KIT) : "none"} stroke={o ? KIT_DARK : c.secondaryText} stroke-width={o ? 1 : 1.3} stroke-dasharray={o ? undefined : "3 2"} />
                {o ? (
                  <text x={0} y={3 + 22 * s} fill={isMine ? c.onPrimary : TRIM} font-size={Math.max(8, 13 * s)} font-weight={800} text-anchor="middle" font-family="system-ui, sans-serif">{String(o.number)}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    );

    const sizeChips = (
      <div role="group" aria-label="Size" style={{ display: "flex", gap: 4 }}>
        {state.sizes.map((z, j) => {
          const on = j === size;
          return (
            <button key={z} type="button" class="jo-hit" aria-pressed={on ? "true" : "false"} disabled={state.closed} onClick={() => { setLocal({ size: j }); haptic("light"); }}
              style={{ position: "relative", height: 44, padding: "6px 0", border: 0, background: "transparent", cursor: "pointer", minWidth: 34 }}>
              <span style={{ display: "block", height: 32, lineHeight: "32px", minWidth: 34, padding: "0 6px", boxSizing: "border-box", borderRadius: 8, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? c.selected : c.secondaryButton, color: on ? c.text : c.secondaryButtonText, boxShadow: on ? `inset 0 0 0 1.5px ${c.primary}` : "none" }}>{z}</span>
            </button>
          );
        })}
      </div>
    );
    const stepper = (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button type="button" class="jo-hit" aria-label="Lower number" disabled={state.closed} onClick={() => step(-1)} style={{ position: "relative", width: 36, height: 44, border: 0, background: "transparent", cursor: "pointer", padding: "6px 0" }}>
          <span style={{ display: "block", height: 32, lineHeight: "30px", borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, fontWeight: 700 }}>−</span>
        </button>
        <span style={{ minWidth: 40, textAlign: "center", fontSize: 22, fontWeight: 800, color: c.text, fontVariantNumeric: "tabular-nums" }}>{`#${num}`}</span>
        <button type="button" class="jo-hit" aria-label="Higher number" disabled={state.closed} onClick={() => step(1)} style={{ position: "relative", width: 36, height: 44, border: 0, background: "transparent", cursor: "pointer", padding: "6px 0" }}>
          <span style={{ display: "block", height: 32, lineHeight: "30px", borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, fontWeight: 700 }}>+</span>
        </button>
      </div>
    );

    let line1: string;
    let act;
    if (state.closed) {
      line1 = mine ? (mine.paid ? `Paid · #${mine.number} ${state.sizes[mine.size]} is coming` : `Order's in · ${money(state.price)} request sent`) : "Order closed";
      act = mine && !mine.paid ? <Button kind="primary" onClick={() => { dispatch({ t: "pay" }); haptic("success"); }}>{`Pay ${money(state.price)}`}</Button> : null;
    } else if (!mine) {
      line1 = `${left} more and the order closes`;
      act = <Button kind="primary" onClick={() => { dispatch({ t: "order", number: num, size }); haptic("success"); }}>{`Order mine · ${money(state.price)}`}</Button>;
    } else if (dirty) {
      line1 = `Yours: #${mine.number} ${state.sizes[mine.size]}`;
      act = <Button kind="primary" onClick={() => { dispatch({ t: "order", number: num, size }); haptic("light"); }}>Update</Button>;
    } else {
      line1 = `You're in · #${mine.number} ${state.sizes[mine.size]}`;
      act = <Button kind="deemphasized" onClick={() => dispatch({ t: "cancel" })}>Cancel</Button>;
    }

    const chat = state.orders.filter((o) => !o.who.startsWith("o:")).map((o) => o.who);
    const quoted = [...state.orders].reverse().find((o) => state.said[o.who] && o.who !== me);
    const paidN = state.orders.filter((o) => o.paid).length;
    const toastAt = confirmed.closed && confirmed.closedAt > 0 && running(confirmed.closedAt, 2400) !== null ? confirmed.closedAt : myAt > 0 && running(myAt, 2400) !== null ? myAt : 0;

    return (
      <div>
        <style>{".jo-hit::after{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}"}</style>
        <CardHeader title={state.title} subtitle={[state.team, `${money(state.price)} each`, state.closed ? "order closed" : state.deadline ? `closes ${state.deadline}` : ""].filter(Boolean).join(" · ")} />
        <div style={{ height: 6 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {jersey}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {rack}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4, minWidth: 0 }}>
          {stepper}
          {sizeChips}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, minHeight: 44, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
          {act ? <div style={{ flexShrink: 0 }}>{act}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 2, minWidth: 0 }}>
          {quoted ? <Avatar user={quoted.who} size={18} /> : chat.length ? <Facepile users={chat} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {state.closed ? `${paidN} of ${state.orders.length} paid` : quoted ? `${quoted.name} #${quoted.number}: "${state.said[quoted.who]}"` : `${state.orders.length} of ${state.need} ordered · pick a number nobody has`}
          </span>
        </div>
        {toastAt ? <Toast key={toastAt}>{confirmed.closed ? `Order closed at ${state.need} · payment requests sent` : `#${num} is yours`}</Toast> : null}
      </div>
    );
  },
});
