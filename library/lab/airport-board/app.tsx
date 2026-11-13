import { defineApp, Avatar, Burst, Button, CardHeader, Locked, haptic, mix, pal, running, seedOf, spring, springs, userColor, type Ctx } from "@muse/app";

// Airport board: a split-flap departures board for one friend's early flight. Flight, leave-by and
// pickup are already up; the ride row reads "????". Tap "I'll drive" and the flaps clatter into
// your name, the status flips to confirmed, and a breakfast IOU gets stamped on the corner.

type Params = {
  /** Card title: "Ride to the airport" */
  title: string;
  /** Who's flying: "Will" */
  flier: string;
  /** What he asked, in his words */
  quote: string;
  /** Day of the flight: "Thu" */
  day: string;
  /** Flight time: "6:40" */
  flight: string;
  /** Leave-by time: "4:55" */
  leave: string;
  /** Pickup spot: "412 Pine" */
  from: string;
  /** Airport: "EFD" */
  to: string;
  /** When both get the reminder: "4:40" */
  remind: string;
  /** What the flier owes the driver, stamped when someone drives: "breakfast" */
  owes: string;
  /** Who's already driving, or "" */
  driver: string;
};

// @params
const P: Params = {
  title: "Ride to the airport",
  flier: "Will",
  quote: "can anyone drive me to the airport thursday, 6:40am flight",
  day: "Thu",
  flight: "6:40",
  leave: "4:55",
  from: "412 Pine",
  to: "EFD",
  remind: "4:40",
  owes: "breakfast",
  driver: "",
};
// @end params

type State = {
  title: string;
  flier: string;
  fName: string;
  quote: string;
  day: string;
  flight: string;
  leave: string;
  from: string;
  to: string;
  remind: string;
  owes: string;
  driver: string;
  claimAt: number;
};
type Action = { t: "drive" } | { t: "undrive" };
type Local = { bursts: number };

/** A stamped sticker: user-made words, may shout. */
const userContent = (s: string) => s;
const N = 12;
const FLAPS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const STAMP = spring(springs.iosBouncy);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const fm = find(P.flier);
  const flier = fm?.id ?? "";
  const dm = find(P.driver);
  const driver = dm && dm.id !== flier ? dm.id : "";
  return {
    title: clean(P.title, 40) || "Ride to the airport",
    flier,
    fName: fm?.name ?? (clean(P.flier, 20) || "Them"),
    quote: clean(P.quote, 100),
    day: clean(P.day, 8),
    flight: clean(P.flight, 8) || "?",
    leave: clean(P.leave, 8),
    from: clean(P.from, N),
    to: clean(P.to, N),
    remind: clean(P.remind, 8),
    owes: clean(P.owes, 24),
    driver,
    claimAt: driver ? 1 : 0,
  };
}

export default defineApp<State, Action, Local>({
  name: "Airport board",
  summary: (s, ctx) => {
    const d = ctx.members.find((m) => m.id === s.driver)?.name;
    return s.driver ? `${d ?? "Someone"} is driving ${s.fName} · leave ${s.leave} for the ${s.flight}` : `${s.fName} needs a ride · ${s.day} ${s.flight} flight, leave by ${s.leave}`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "drive") {
      if (s.driver !== "" || u === s.flier) return s;
      return { ...s, driver: u, claimAt: Math.max(1, meta.time) };
    }
    if (a.t === "undrive") {
      if (s.driver !== u) return s;
      return { ...s, driver: "", claimAt: 0 };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.driver && !inChat(ctx, s.driver) ? { ...s, driver: "", claimAt: 0 } : s),

  invariants: {
    "the flier doesn't drive himself": (s) => s.driver === "" || s.driver !== s.flier,
    "a driver has a time": (s) => (s.driver === "") === (s.claimAt === 0),
    "the driver is in the chat": (s, ctx) => s.driver === "" || inChat(ctx, s.driver),
  },

  transitions: {
    "one driver, first come": (p, n, a, m) => a.t !== "drive" || p === n || (p.driver === "" && n.driver === m.user && n.claimAt === Math.max(1, m.time)),
    "only the driver backs out": (p, n, a, m) => a.t !== "undrive" || p === n || (p.driver === m.user && n.driver === "" && n.claimAt === 0),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "only drive and undrive change it": (p, n, a) => p === n || a.t === "drive" || a.t === "undrive",
    "the board's facts don't change": (p, n) => p.flight === n.flight && p.leave === n.leave && p.from === n.from && p.flier === n.flier,
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.65 ? { t: "drive" } : { t: "undrive" }),

  local: { bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const driverName = members.find((m) => m.id === state.driver)?.name ?? "";
    const claimed = state.driver !== "";
    const e = claimed && state.claimAt > 1 ? running(state.claimAt, 2200) : null;
    const labelW = 64;
    const gap = 2;
    const tw = Math.min(19, Math.floor((W - labelW - 20 - gap * (N - 1)) / N));
    const th = Math.round(tw * 1.35);
    const panel = dark ? mix(c.wash, c.card, 0.2) : mix(p.dark, c.text, 0.35);
    const tile = dark ? mix(c.card, c.text, 0.1) : mix(p.dark, c.text, 0.1);
    const ink = dark ? c.text : c.card;
    const amber = p.yellow;
    const up = (s: string) => s.toUpperCase();
    const rows: { label: string; value: string; anim: boolean; tone?: string }[] = [
      { label: "Flight", value: up(`${state.day} ${state.flight}`.trim()), anim: false },
      { label: "Leave", value: up(state.leave), anim: false },
      { label: "From", value: up(state.from), anim: false },
      { label: "To", value: up(state.to), anim: false },
      { label: "Ride", value: claimed ? up(driverName) : "????", anim: true, tone: claimed ? ink : amber },
      { label: "Status", value: claimed ? "CONFIRMED" : "NEEDS RIDE", anim: true, tone: claimed ? (dark ? mix(p.green, c.text, 0.45) : p.green) : amber },
    ];
    const flap = (ch: string, k: number, row: number, anim: boolean) => {
      if (!anim || e === null) return ch;
      const settle = 200 + k * 90 + row * 120;
      if (e >= settle) return ch;
      return FLAPS[(Math.floor(e / 55) + k * 7 + (seedOf(`${row}`) % 5)) % FLAPS.length]!;
    };
    const stampT = claimed ? (e === null ? 1 : e < 1500 ? 0 : STAMP(e - 1500)) : 0;
    const iDrive = state.driver === me;
    const canDrive = !claimed && me !== state.flier;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.fName}: "${state.quote}"` : undefined} />
        <div style={{ position: "relative", borderRadius: 12, background: panel, padding: "10px 10px 8px" }} role="img" aria-label={`Departures board: ${state.flight} flight, leave ${state.leave}, ride ${claimed ? driverName : "needed"}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, height: 18 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 14 L22 7 L23 9 L15 13 L13 21 L11 21 L11 14 L5 16 L3 19 L1 19 Z" fill={amber} />
            </svg>
            <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 700, color: amber, letterSpacing: 1 }}>Departures</span>
            <span style={{ flex: 1 }} />
            {claimed ? (
              <span style={{ flex: "none", maxWidth: W - 190, padding: "2px 8px", borderRadius: 6, border: `2px solid ${p.red}`, background: c.card, color: mix(p.red, c.text, 0.35), fontSize: 12, lineHeight: "16px", fontWeight: 800, transform: `rotate(-5deg) scale(${(0.4 + stampT * 0.6).toFixed(3)})`, visibility: stampT > 0 ? "visible" : "hidden", ...ell }}>
                {userContent(state.owes ? `${state.fName} owes ${iDrive ? "you" : driverName} ${state.owes}!` : "Thank you!")}
              </span>
            ) : null}
            {state.flier ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, lineHeight: "16px", color: ink }}>
                <Avatar user={state.flier} size={18} />
                {state.fName}
              </span>
            ) : null}
          </div>
          {rows.map((r, ri) => {
            const chars = r.value.padEnd(N, " ").slice(0, N).split("");
            return (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: ri ? 4 : 0 }}>
                <span style={{ width: labelW - 6, fontSize: 11, lineHeight: "14px", fontWeight: 600, color: mix(ink, panel, 0.15), ...ell }}>{r.label}</span>
                <span style={{ display: "flex", gap }}>
                  {chars.map((ch, k) => {
                    const shown = flap(ch, k, ri, r.anim);
                    return (
                      <span key={k} style={{ position: "relative", width: tw, height: th, borderRadius: 3, background: tile, color: r.tone ?? ink, fontFamily: "ui-monospace, Menlo, monospace", fontSize: Math.round(tw * 0.78), lineHeight: `${th}px`, fontWeight: 700, textAlign: "center" }}>
                        {shown === " " ? "" : shown}
                        <span style={{ position: "absolute", left: 0, right: 0, top: Math.floor(th / 2), height: 1, background: panel }} />
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "relative", height: 34, marginTop: 8 }}>
          <svg width={W} height={34} viewBox={`0 0 ${W} 34`} aria-hidden="true" style={{ display: "block" }}>
            <line x1={24} y1={20} x2={W - 24} y2={20} stroke={c.divider} stroke-width={4} stroke-linecap="round" />
            <path d={`M 8 26 v -10 l 8 -7 l 8 7 v 10 Z`} fill={p.wall} stroke={c.secondaryText} stroke-width={1} />
            <path d={`M ${W - 28} 22 L ${W - 6} 14 L ${W - 5} 16 L ${W - 13} 19 L ${W - 15} 27 L ${W - 17} 27 L ${W - 17} 21 L ${W - 23} 23 L ${W - 25} 26 L ${W - 27} 26 Z`} fill={c.secondaryText} />
            {claimed ? (
              <g transform={`translate(${(30 + (W - 90) * (e === null ? 1 : Math.min(1, e / 2200))).toFixed(1)} 20)`}>
                <rect x={-14} y={-9} width={28} height={10} rx={4} fill={userColor(state.driver, theme)} />
                <path d="M -9 -9 l 3 -5 h 10 l 3 5 Z" fill={userColor(state.driver, theme)} />
                <circle cx={-8} cy={2} r={3} fill={c.text} />
                <circle cx={8} cy={2} r={3} fill={c.text} />
              </g>
            ) : null}
          </svg>
          {claimed ? (
            <div style={{ position: "absolute", left: 30 + (W - 90) * (e === null ? 1 : Math.min(1, e / 2200)) - 9, top: -6, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
              <Avatar user={state.driver} size={18} />
            </div>
          ) : null}
        </div>
        {local.bursts > 0 && claimed ? <Burst key={local.bursts} emoji="🚗" /> : null}
        <div style={{ marginTop: 6, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {claimed ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail={state.remind ? `Reminder for both at ${state.remind}` : "On both calendars"}>{iDrive ? `You're driving · ${state.leave}` : `${driverName} is driving · ${state.leave}`}</Locked>
              </div>
              {iDrive ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "undrive" })}>
                  Undo
                </Button>
              ) : null}
            </>
          ) : canDrive ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{`Leave by ${state.leave} · ${state.flight} flight`}</span>
              <Button
                kind="primary"
                onClick={() => {
                  haptic("success");
                  setLocal({ bursts: local.bursts + 1 });
                  dispatch({ t: "drive" });
                }}
              >
                {"I'll drive"}
              </Button>
            </>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>Asked · the board updates when someone says yes</span>
          )}
        </div>
      </div>
    );
  },
});

