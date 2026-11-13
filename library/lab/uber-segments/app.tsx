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
  tween,
  userColor,
  type Child,
  type Ctx,
  type Meta,
} from "@muse/app";

// Uber segments: one ride home, several drop-offs, one receipt. The route is drawn as a road with a
// strand per rider; each strand peels off at that rider's stop, so you can see who was in the car
// for which miles. The fare splits by the miles each person rode; flip to an even split to compare,
// then send the requests and everyone pays back whoever paid.

type Params = {
  /** What the ride was: "2am ride back from the city" */
  ride: string;
  /** Where it started */
  from: string;
  /** Who paid and shared the receipt */
  payer: string;
  /** The fare in cents */
  fareCents: number;
  /** Drop-offs in order; miles in tenths from the start (21 is 2.1 mi). The payer rides to the last stop unless listed. */
  stops: { who: string[]; tenths: number; place: string }[];
  /** What someone already said about the split */
  said: { who: string; line: string };
};

// @params
const P: Params = {
  ride: "2am ride back from the city",
  from: "Midtown",
  payer: "Will",
  fareCents: 5400,
  stops: [
    { who: ["Calvin"], tenths: 21, place: "Larkin Hall" },
    { who: ["Arun"], tenths: 34, place: "Golden Lantern" },
    { who: ["Maya", "Will"], tenths: 50, place: "412 Pine" },
  ],
  said: { who: "Calvin", line: "i got out at 2.1 miles, just saying" },
};
// @end params

type Rider = { id: string; name: string; off: number; place: string };
type State = {
  ride: string;
  from: string;
  said: { who: string; line: string };
  payer: string;
  fare: number;
  riders: Rider[];
  mode: "" | "miles" | "even";
  sentAt: number;
  sentBy: string;
  paid: { id: string; at: number }[];
};
type Action = { t: "send"; mode: "miles" | "even" } | { t: "resplit" } | { t: "pay" } | { t: "unpay" };
type Local = { even: boolean; toast: number };

const MAXR = 7;
const DRIVE = tween({ duration: 1800, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const miles = (t: number) => `${Math.floor(t / 10)}.${t % 10} mi`;
const end = (s: State) => Math.max(1, ...s.riders.map((r) => r.off));

/** Largest-remainder split of `total` cents by integer weights; ties go to the earlier entry. */
function apportion(total: number, w: number[]): number[] {
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return w.map(() => 0);
  const base = w.map((x) => Math.floor((total * x) / sum));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = w.map((x, i) => ({ i, r: (total * x) % sum })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    base[o.i]! += 1;
    left -= 1;
  }
  return base;
}

/** Each rider's share by the miles they rode: every stretch of road costs its share of the fare,
 * split by whoever was in the car for it. */
function byMiles(s: State): number[] {
  const stops = [...new Set(s.riders.map((r) => r.off))].sort((a, b) => a - b);
  const lens = stops.map((t, i) => t - (i ? stops[i - 1]! : 0));
  const segCents = apportion(s.fare, lens);
  const out = s.riders.map(() => 0);
  stops.forEach((t, i) => {
    const on = s.riders.map((r, j) => (r.off >= t ? j : -1)).filter((j) => j >= 0);
    const split = apportion(segCents[i]!, on.map(() => 1));
    on.forEach((j, k) => (out[j]! += split[k]!));
  });
  return out;
}
const evenly = (s: State) => apportion(s.fare, s.riders.map(() => 1));
const sharesFor = (s: State, mode: "miles" | "even") => (mode === "even" ? evenly(s) : byMiles(s));
const shareOf = (s: State, id: string) => {
  const i = s.riders.findIndex((r) => r.id === id);
  return i < 0 || !s.mode ? 0 : sharesFor(s, s.mode)[i]!;
};
const owing = (s: State) => (s.mode ? s.riders.filter((r) => r.id !== s.payer && !s.paid.some((p) => p.id === r.id)) : []);

function initState(ctx: Ctx): State {
  const riders: Rider[] = [];
  let prev = 0;
  const resolve = (name: string) => {
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    return { id: m ? m.id : name, name: m ? clean(m.name, 20) || name : name };
  };
  for (const st of Array.isArray(P.stops) ? P.stops : []) {
    const t = st?.tenths;
    if (!Number.isInteger(t) || t <= prev || t > 9999) continue;
    for (const w of Array.isArray(st.who) ? st.who : []) {
      const name = clean(w, 20);
      if (!name || riders.length >= MAXR) continue;
      const p = resolve(name);
      if (riders.some((r) => r.id === p.id)) continue;
      riders.push({ ...p, off: t, place: clean(st.place, 18) });
    }
    prev = t;
  }
  const pn = clean(P.payer, 20) || "Driver";
  let payer = riders.find((r) => same(r.name, pn) || r.id === pn)?.id;
  if (!payer) {
    const p = resolve(pn);
    const last = riders[riders.length - 1];
    riders.push({ ...p, off: last ? last.off : 10, place: last?.place ?? "" });
    payer = p.id;
  }
  if (riders.length < 2) riders.unshift({ id: "Rider", name: "Rider", off: Math.max(1, Math.floor((riders[0]?.off ?? 10) / 2)), place: "" });
  return {
    ride: clean(P.ride, 40) || "the ride",
    from: clean(P.from, 16) || "the start",
    said: { who: clean(P.said?.who, 20), line: clean(P.said?.line, 60) },
    payer,
    fare: Number.isInteger(P.fareCents) && P.fareCents > 0 && P.fareCents < 1_000_000 ? P.fareCents : 2000,
    riders,
    mode: "",
    sentAt: 0,
    sentBy: "",
    paid: [],
  };
}

function reduceRide(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "send") {
    if (s.mode || (a.mode !== "miles" && a.mode !== "even")) return s;
    return { ...s, mode: a.mode, sentAt: meta.time, sentBy: u, paid: [] };
  }
  if (a.t === "resplit") {
    if (!s.mode || s.paid.length > 0 || (u !== s.payer && u !== s.sentBy)) return s;
    return { ...s, mode: "", sentAt: 0, sentBy: "" };
  }
  if (a.t === "pay") {
    if (!s.mode || u === s.payer || !s.riders.some((r) => r.id === u) || s.paid.some((p) => p.id === u)) return s;
    return { ...s, paid: [...s.paid, { id: u, at: meta.time }] };
  }
  if (a.t === "unpay") {
    if (!s.paid.some((p) => p.id === u)) return s;
    return { ...s, paid: s.paid.filter((p) => p.id !== u) };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Ride split by miles",
  summary: (s) => {
    const payer = s.riders.find((r) => r.id === s.payer)?.name ?? "someone";
    if (!s.mode) return `${s.ride}: ${money(s.fare)} for ${s.riders.length}, split by miles or even`;
    const left = owing(s);
    return left.length ? `${s.ride}: requests out to ${left.length} · ${money(s.fare)} to ${payer}` : `${s.ride}: ${payer} is paid back`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceRide(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "both splits add up to the fare": (s) =>
      byMiles(s).reduce((a, b) => a + b, 0) === s.fare && evenly(s).reduce((a, b) => a + b, 0) === s.fare && byMiles(s).every((x) => Number.isInteger(x) && x >= 0),
    "riding further never costs less": (s) => {
      const b = byMiles(s);
      return s.riders.every((r, i) => s.riders.every((q, j) => !(r.off > q.off) || b[i]! >= b[j]!));
    },
    "the payer rode": (s) => s.riders.some((r) => r.id === s.payer) && new Set(s.riders.map((r) => r.id)).size === s.riders.length,
    "payments only after requests, once each": (s) =>
      (s.mode !== "" || s.paid.length === 0) && new Set(s.paid.map((p) => p.id)).size === s.paid.length && s.paid.every((p) => p.id !== s.payer && s.riders.some((r) => r.id === p.id)),
    "a sent split names who sent it": (s) => (s.mode === "") === (s.sentAt === 0) && (s.mode === "") === (s.sentBy === ""),
  },

  transitions: {
    "sending sets the split once": (p, n, a, m) => a.t !== "send" || p === n || (p.mode === "" && n.mode === a.mode && n.sentBy === m.user && n.sentAt === m.time),
    "only the payer or sender re-splits, before anyone pays": (p, n, a, m) =>
      a.t !== "resplit" || p === n || (p.paid.length === 0 && (m.user === p.payer || m.user === p.sentBy) && n.mode === ""),
    "paying adds exactly you": (p, n, a, m) =>
      a.t !== "pay" || p === n || (m.user !== p.payer && n.paid.length === p.paid.length + 1 && n.paid.at(-1)!.id === m.user && n.paid.at(-1)!.at === m.time),
    "only you take back your payment": (p, n, a, m) => a.t !== "unpay" || p === n || (p.paid.some((x) => x.id === m.user) && n.paid.length === p.paid.length - 1),
    "the split holds while payments are in": (p, n) => p.paid.length === 0 || n.mode === p.mode,
    "the receipt never changes": (p, n) => p.fare === n.fare && p.riders === n.riders && p.payer === n.payer,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (!s.mode) return k < 0.8 ? { t: "send", mode: k < 0.5 ? "miles" : "even" } : { t: "pay" };
    if (k < 0.55) return { t: "pay" };
    if (k < 0.75) return { t: "unpay" };
    return k < 0.9 ? { t: "resplit" } : { t: "send", mode: "even" };
  },

  local: { even: false, toast: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 184;
    const font = theme.type.family;
    const mode: "miles" | "even" = state.mode || (local.even ? "even" : "miles");
    const shares = sharesFor(state, mode);
    const other = sharesFor(state, mode === "even" ? "miles" : "even");
    const payer = state.riders.find((r) => r.id === state.payer)!;
    const total = end(state);

    // The road: left to right by miles, gently winding.
    const x0 = 22;
    const x1 = W - 30;
    const X = (t: number) => x0 + ((x1 - x0) * t) / total;
    const roadY = 84;
    const Y = (x: number) => roadY + Math.sin((x / W) * Math.PI * 2.2 + 0.4) * 16;
    const order = state.riders.map((r, i) => ({ r, i })).sort((a, b) => a.r.off - b.r.off || a.i - b.i);
    const n = order.length;
    const gap = 4.5;
    const art: Child[] = [];
    const over: Child[] = [];

    // night sky, a moon, city blocks at the start
    const sky = dark ? mix(c.wash, pl.blue, 0.12) : mix(pl.blue, c.text, 0.62);
    const skyInk = dark ? c.text : c.onPrimary;
    art.push(<rect key="sky" x={0} y={0} width={W} height={H} rx={14} fill={sky} />);
    art.push(<circle key="moon" cx={W - 34} cy={26} r={11} fill={mix(pl.yellow, c.card, 0.5)} />);
    art.push(<circle key="moon2" cx={W - 29} cy={22} r={10} fill={sky} />);
    [3, 9, 15, 21, 27, 33, 41, 47].forEach((sx, k) => art.push(<circle key={`st${k}`} cx={(sx * 29) % (W - 60) + 20} cy={12 + ((sx * 13) % 40)} r={1.2} fill={c.card} opacity={0.7} />));
    [0, 1, 2, 3].forEach((k) => art.push(<rect key={`bl${k}`} x={4 + k * 9} y={roadY - 34 + ((k * 7) % 12)} width={8} height={40 - ((k * 7) % 12)} rx={1} fill={dark ? mix(c.wash, c.text, 0.12) : mix(pl.blue, c.text, 0.8)} />));
    // asphalt
    const pts = (a: number, b: number, off: number) => {
      const out: string[] = [];
      for (let x = a; x <= b + 0.01; x += 4) {
        const dy = (Y(x + 1) - Y(x - 1)) / 2;
        const nx = -dy / Math.hypot(1, dy);
        const ny = 1 / Math.hypot(1, dy);
        out.push(`${(x + nx * off).toFixed(1)},${(Y(x) + ny * off).toFixed(1)}`);
      }
      return out.join(" ");
    };
    art.push(<polyline key="road" points={pts(x0 - 10, x1 + 10, 0)} fill="none" stroke={dark ? mix(c.wash, c.text, 0.18) : mix(pl.blue, c.text, 0.85)} stroke-width={n * gap + 14} stroke-linecap="round" stroke-linejoin="round" />);

    // strands, longest ride on the inside
    const drive = state.sentAt ? running(state.sentAt, 1800) : null;
    const carT = drive === null ? (state.mode ? total : 0) : DRIVE(drive) * total;
    order.forEach(({ r }, k) => {
      const off = (k - (n - 1) / 2) * gap;
      const upto = state.mode && drive !== null ? Math.min(r.off, carT) : r.off;
      if (upto <= 0) return;
      art.push(<polyline key={`sd${r.id}`} points={pts(x0, X(upto), off)} fill="none" stroke={userColor(r.id, theme)} stroke-width={3.5} stroke-linecap="round" stroke-linejoin="round" />);
    });
    // the car
    const cx = X(carT);
    art.push(
      <g key="car" transform={`translate(${cx} ${Y(cx) - 2})`}>
        <rect x={-13} y={-7} width={26} height={12} rx={4} fill={pl.yellow} />
        <rect x={-7} y={-12} width={14} height={7} rx={3} fill={pl.yellow} />
        <rect x={-5} y={-11} width={10} height={4} rx={1.5} fill={sky} />
        <circle cx={-7} cy={6} r={3} fill={c.text} />
        <circle cx={7} cy={6} r={3} fill={c.text} />
        <circle cx={12} cy={-2} r={1.8} fill={c.card} />
      </g>,
    );
    // start pin
    art.push(<circle key="start" cx={x0} cy={Y(x0)} r={6} fill={c.card} />);
    over.push(
      <div key="from" style={{ position: "absolute", left: 6, top: Y(x0) + 20, fontSize: 11, lineHeight: "14px", color: skyInk, background: sky, padding: "0 3px", borderRadius: 4, whiteSpace: "nowrap" }}>
        {state.from}
      </div>,
    );

    // stops: faces above the road, the fare below
    const stops = [...new Set(state.riders.map((r) => r.off))].sort((a, b) => a - b);
    stops.forEach((t, si) => {
      const sx = X(t);
      const at = state.riders.map((r, i) => ({ r, i })).filter((q) => q.r.off === t);
      art.push(<circle key={`pin${t}`} cx={sx} cy={Y(sx)} r={7} fill={c.card} stroke={c.text} stroke-width={2} />);
      const above = si % 2 === 0;
      const faceTop = above ? Y(sx) - 40 : Y(sx) + 16;
      const chipW = 104;
      const left = Math.max(0, Math.min(W - chipW - 4, sx - chipW / 2));
      over.push(
        <div key={`f${t}`} style={{ position: "absolute", left: Math.max(0, Math.min(W - 22 * at.length - 4, sx - (at.length * 22) / 2)), top: faceTop, display: "flex", gap: 2 }}>
          {at.map(({ r }) => (
            <span key={r.id} style={{ display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${userColor(r.id, theme)}` }}>
              <Avatar user={{ id: r.id, name: r.name }} size={20} />
            </span>
          ))}
        </div>,
      );
      over.push(
        <div key={`c${t}`} style={{ position: "absolute", left, width: chipW, top: above ? Y(sx) + 14 : Y(sx) - 14 - 18 * at.length - 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {at.map(({ r, i }) => {
            const paid = state.paid.some((p) => p.id === r.id);
            const isPayer = r.id === state.payer;
            return (
              <span key={r.id} style={{ padding: "1px 6px", borderRadius: 99, background: r.id === me ? c.primary : c.card, color: r.id === me ? c.onPrimary : c.text, fontSize: 12, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap" }}>
                {`${r.id === me ? "You" : r.name.split(" ")[0]} ${isPayer ? "paid" : paid ? "paid back" : money(shares[i]!)}`}
              </span>
            );
          })}
          <span style={{ fontSize: 11, lineHeight: "13px", color: skyInk, background: sky, padding: "0 3px", borderRadius: 4, whiteSpace: "nowrap" }}>{miles(t)}</span>
        </div>,
      );
    });

    const myI = state.riders.findIndex((r) => r.id === me);
    const myShare = myI >= 0 ? shares[myI]! : 0;
    const myOther = myI >= 0 ? other[myI]! : 0;
    const paidMe = state.paid.some((p) => p.id === me);
    const left = owing(state);

    return (
      <div>
        <CardHeader title={state.ride[0]!.toUpperCase() + state.ride.slice(1)} subtitle={`${payer.name} paid ${money(state.fare)} · ${stops.length} drop-offs · ${miles(total)}`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route with ${stops.length} drop-offs; fare ${mode === "even" ? "split evenly" : "split by miles"}`} style={{ display: "block" }}>
            {art}
          </svg>
          {over}
        </div>
        {!state.mode && state.said.line ? (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, height: 20, fontSize: 13, color: c.secondaryText }}>
            <Avatar user={{ id: state.riders.find((r) => same(r.name, state.said.who))?.id ?? state.said.who, name: state.said.who }} size={20} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${state.said.line}"`}</span>
          </div>
        ) : null}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, height: 36 }}>
          {state.mode ? (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {`Split ${state.mode === "even" ? "evenly" : "by miles"} · ${left.length ? `${left.length} still owe ${payer.name}` : `${payer.name} is square`}`}
            </span>
          ) : (
            <>
              <div role="group" aria-label="Split" style={{ display: "flex", background: c.secondaryButton, borderRadius: 8, padding: 2 }}>
                {(["miles", "even"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setLocal({ even: m === "even" })}
                    class="m-hit"
                    style={{ position: "relative", height: 36, minWidth: 44, padding: "0 10px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: mode === m ? c.card : "transparent", color: c.text }}
                  >
                    {m === "miles" ? "By miles" : "Even"}
                  </button>
                ))}
              </div>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {myI >= 0 && me !== state.payer ? `You: ${money(myShare)} · ${mode === "even" ? "by miles" : "even"} ${money(myOther)}` : `${mode === "even" ? "Even" : "By miles"} · ${state.riders.length} riders`}
              </span>
            </>
          )}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {!state.mode ? (
            <Button kind="primary" wide onClick={() => { dispatch({ t: "send", mode }); haptic("success"); setLocal({ toast: local.toast + 1 }); }}>
              Send requests
            </Button>
          ) : myI >= 0 && me !== state.payer && !paidMe ? (
            <Button kind="primary" wide onClick={() => { dispatch({ t: "pay" }); haptic("success"); setLocal({ toast: local.toast + 1 }); }}>
              {`Pay ${payer.name} ${money(shareOf(state, me))}`}
            </Button>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {paidMe ? `You paid ${money(shareOf(state, me))}` : me === state.payer ? `${state.paid.length} of ${state.riders.length - 1} paid you` : "Requests are out"}
              </span>
              {paidMe ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unpay" })}>
                  Undo
                </Button>
              ) : (me === state.payer || me === state.sentBy) && state.paid.length === 0 ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "resplit" })}>
                  Re-split
                </Button>
              ) : null}
            </>
          )}
        </div>
        {local.toast > 0 && state.mode ? <Toast key={local.toast}>{paidMe ? `Sent ${money(shareOf(state, me))} to ${payer.name}` : `Requests sent · split ${state.mode === "even" ? "evenly" : "by miles"}`}</Toast> : null}
      </div>
    );
  },
});
