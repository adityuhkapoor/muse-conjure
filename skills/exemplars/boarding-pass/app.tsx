import { defineApp, Avatar, Button, CardHeader, SystemLine, running, tween } from "@muse/app";

// Boarding pass: Nia's NOLA spring break, as a pass that fills up. Tapping "I'm in" puts you in
// the next seat on the pass. The Airbnb is split by however many are going, so the price on the
// pass drops as seats fill. Nia said she books once 4 commit: the 4th "in" locks the pass, its
// band turns blue and the barcode prints. The lock holds; people can still join up to 6 (the
// Airbnb sleeps 6) or drop out, and the price follows. Marcus and Hana already said "in".

// Everything here comes from the chat.
const CHAT = {
  title: "NOLA spring break",
  from: "PIT",
  to: "MSY",
  out: "Fri 3/13",
  back: "Tue 3/17",
  flightCents: 12800, // "$128 roundtrip on spirit"
  stayCents: 34200, // "$342 total for the 4 nights", "sleeps 6"
  nights: 4,
  sleeps: 6,
  lockAt: 4, // "if 4 people commit by friday i'm booking the airbnb"
  deadline: "Friday",
  booker: "Nia",
  alreadyIn: ["Marcus", "Hana"],
};

type Rider = { id: string; at: number };
type State = { going: Rider[]; lockedAt: number };
type Action = { t: "in" } | { t: "out" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const SEAT_MS = 420;
const STAMP_MS = 700;
const seatIn = tween({ duration: SEAT_MS, easing: "decelerate" });
const sweep = tween({ duration: 500, easing: "standard" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? `.${String(c % 100).padStart(2, "0")}` : ""}`;
/** What one person pays with n going: the flight plus an even share of the Airbnb (floored cents). */
const each = (n: number) => CHAT.flightCents + Math.floor(CHAT.stayCents / Math.max(1, n));

// ---- Check helpers ----
const ids = (s: State) => s.going.map((r) => r.id);
const has = (s: State, u: string) => s.going.some((r) => r.id === u);
const without = (s: State, u: string) => JSON.stringify(s.going.filter((r) => r.id !== u));

function reducePass(s: State, a: Record<string, unknown>, user: string, time: number): State {
  if (a.t === "in") {
    if (s.going.some((r) => r.id === user) || s.going.length >= CHAT.sleeps) return s;
    const going = [...s.going, { id: user, at: time }];
    return { going, lockedAt: s.lockedAt === 0 && going.length >= CHAT.lockAt ? time : s.lockedAt };
  }
  if (a.t === "out") {
    if (!s.going.some((r) => r.id === user)) return s;
    return { ...s, going: s.going.filter((r) => r.id !== user) };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Boarding pass",
  summary: (s) =>
    s.lockedAt
      ? `${CHAT.title} is locked · ${s.going.length} going · ${money(each(s.going.length))} each`
      : `${CHAT.title} · ${s.going.length} of ${CHAT.lockAt} in to lock`,

  // Marcus and Hana said "in" in the chat; init reruns with the member list until the first tap.
  init: (ctx) => {
    const going: Rider[] = [];
    for (const name of CHAT.alreadyIn) {
      const id = ctx.members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id;
      if (id && !going.some((r) => r.id === id) && going.length < CHAT.lockAt - 1) going.push({ id, at: 0 });
    }
    return { going, lockedAt: 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reducePass(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  // Someone left the chat: their seat on the pass opens. A lock stays: the booking was made.
  onMembers: (state, ctx) => (state.going.every((r) => inChat(ctx, r.id)) ? state : { ...state, going: state.going.filter((r) => inChat(ctx, r.id)) }),

  invariants: {
    "nobody is on the pass twice": (s) => new Set(ids(s)).size === s.going.length,
    "everyone on the pass is in the chat": (s, ctx) => s.going.every((r) => inChat(ctx, r.id)),
    "the pass never holds more than the Airbnb sleeps": (s) => s.going.length <= CHAT.sleeps,
    "an open pass has fewer than 4 going": (s) => s.lockedAt > 0 || s.going.length < CHAT.lockAt,
  },

  transitions: {
    "I'm in puts the actor in the next seat and moves no one": (p, n, a, m) =>
      a.t !== "in" || p === n || (!has(p, m.user) && n.going.length === p.going.length + 1 && n.going.at(-1)?.id === m.user && n.going.at(-1)?.at === m.time && without(p, m.user) === without(n, m.user)),
    "I'm in is never refused while there is room": (p, n, a, m, ctx) => a.t !== "in" || !inChat(ctx, m.user) || has(p, m.user) || p.going.length >= CHAT.sleeps || p !== n,
    "I'm out takes only the actor off": (p, n, a, m) =>
      a.t !== "out" || p === n || (has(p, m.user) && !has(n, m.user) && n.going.length === p.going.length - 1 && without(p, m.user) === without(n, m.user) && n.lockedAt === p.lockedAt),
    "the pass locks on the commit that reaches 4, at that moment": (p, n, a, m) =>
      (p.lockedAt === 0 && n.lockedAt > 0) === (p.lockedAt === 0 && a.t === "in" && p !== n && n.going.length === CHAT.lockAt) && (p.lockedAt > 0 || n.lockedAt === 0 || n.lockedAt === m.time),
    "a lock never lifts": (p, n) => p.lockedAt === 0 || n.lockedAt === p.lockedAt,
    "only people in the chat change the pass": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => (has(s, user) ? (r.next() < 0.35 ? { t: "out" } : { t: "in" }) : r.next() < 0.9 ? { t: "in" } : { t: "out" }),

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const n = state.going.length;
    const mineIn = has(state, me);
    const locked = state.lockedAt > 0;
    const full = n >= CHAT.sleeps;
    const need = Math.max(0, CHAT.lockAt - n);
    const booker = members.find((m) => m.name.trim().toLowerCase() === CHAT.booker.toLowerCase());
    const bookerName = booker ? (booker.id === me ? "You" : booker.name) : null;
    const t = locked ? running(state.lockedAt, STAMP_MS) : null;
    const lit = locked ? (t === null ? 1 : sweep(t)) : 0;
    const onBand = locked && lit >= 1 ? c.onPrimary : c.text;

    // Barcode: bar widths come from who is on the pass, so it is the same on every phone.
    const code = state.going.map((r) => r.id).join("|") + "|" + CHAT.from + CHAT.to;
    const bars: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; x < 84; i++) {
      const k = code.charCodeAt(i % code.length) + i * 7;
      const w = 1 + (k % 3);
      bars.push({ x, w });
      x += w + 1 + ((k >> 2) % 2) * 2;
    }
    const barT = locked ? (t === null ? 1 : Math.min(1, Math.max(0, (t - 200) / 500))) : 0;

    const plane = (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", transform: "rotate(90deg)" }}>
        <path d="M8 1.5c.6 0 1 .6 1 1.3V6l5 3v1.4l-5-1.5v3l1.6 1.2V14L8 13.3 5.4 14v-.9L7 11.9v-3l-5 1.5V9l5-3V2.8c0-.7.4-1.3 1-1.3z" fill={c.secondaryText} />
      </svg>
    );
    const end = (code3: string, date: string, right: boolean) => (
      <div style={{ display: "grid", justifyItems: right ? "end" : "start", flex: "none" }}>
        <span style={{ fontSize: 20, lineHeight: "24px", fontWeight: 700, letterSpacing: 1 }}>{code3}</span>
        <small>{date}</small>
      </div>
    );
    const notch = (side: "left" | "right") => (
      <span aria-hidden="true" style={{ position: "absolute", top: -8, [side]: -8, width: 16, height: 16, borderRadius: 8, background: c.card }} />
    );

    return (
      <div>
        <CardHeader
          title={CHAT.title}
          subtitle={locked ? `Locked · ${n} going${bookerName ? ` · ${bookerName === "You" ? "you book" : `${bookerName} books`} the Airbnb` : ""}` : `${n} of ${CHAT.lockAt} in · locks at ${CHAT.lockAt} by ${CHAT.deadline}`}
        />
        <div style={{ position: "relative", borderRadius: theme.radius.card, background: c.wash, overflow: "hidden" }}>
          {/* band: grey while open, sweeps to blue when the pass locks */}
          <div style={{ position: "relative", height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", overflow: "hidden" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(lit * 100).toFixed(1)}%`, background: c.primary }} />
            <small style={{ position: "relative", color: onBand, fontWeight: 600 }}>Boarding pass</small>
            <small style={{ position: "relative", color: onBand, fontWeight: 600 }}>{locked ? "Locked" : need === 1 ? "1 more to lock" : `${need} more to lock`}</small>
          </div>
          <div style={{ padding: "10px 12px 12px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {end(CHAT.from, CHAT.out, false)}
              <div style={{ flex: 1, minWidth: 16, display: "flex", alignItems: "center", gap: 4, paddingBottom: 14 }}>
                <span style={{ flex: 1, borderTop: `1px dashed ${c.divider}` }} />
                {plane}
                <span style={{ flex: 1, borderTop: `1px dashed ${c.divider}` }} />
              </div>
              {end(CHAT.to, CHAT.back, true)}
            </div>
            <small style={{ display: "block" }}>{`Flight ${money(CHAT.flightCents)} · Airbnb ${money(CHAT.stayCents)} for ${CHAT.nights} nights, split by who goes`}</small>
            {/* the price ladder: what each person pays at 4, 5 and 6 going */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {[CHAT.lockAt, CHAT.lockAt + 1, CHAT.sleeps].map((k) => {
                const here = n === k;
                return (
                  <div key={k} style={{ minWidth: 0, padding: "6px 8px", borderRadius: theme.radius.button, background: here ? c.selected : c.card }}>
                    <div style={{ fontWeight: 600, color: here ? c.link : c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{money(each(k))}</div>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`each at ${k}`}</small>
                  </div>
                );
              })}
            </div>
          </div>
          {/* perforation */}
          <div style={{ position: "relative", borderTop: `1px dashed ${c.divider}`, margin: "0 12px" }}>
            {notch("left")}
            {notch("right")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 }}>
              {Array.from({ length: CHAT.sleeps }, (_, i) => {
                const r = state.going[i];
                const e = r && r.at ? running(r.at, SEAT_MS) : null;
                const s = e === null ? 1 : 0.4 + 0.6 * seatIn(e);
                const own = r?.id === me;
                return (
                  <span
                    key={i}
                    style={{
                      width: 32,
                      height: 32,
                      flex: "none",
                      marginRight: i === 2 ? 8 : 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 16,
                      background: own ? c.selected : c.card,
                      boxShadow: r ? "none" : `inset 0 0 0 1px ${c.divider}`,
                    }}
                  >
                    {r ? (
                      <span style={{ display: "inline-flex", transform: `scale(${s.toFixed(3)})` }}>
                        <Avatar user={r.id} size={own ? 26 : 28} />
                      </span>
                    ) : (
                      <small style={{ fontSize: 13, color: c.secondaryText }}>{i + 1}</small>
                    )}
                  </span>
                );
              })}
            </div>
            <div style={{ width: 84, flex: "none", height: 36, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {locked ? (
                <svg width="84" height="36" viewBox="0 0 84 36" role="img" aria-label="Barcode">
                  {bars.map((b, i) => (
                    <rect key={i} x={b.x} y={36 - 36 * Math.min(1, Math.max(0, barT * 1.4 - (i / bars.length) * 0.4))} width={b.w} height={36 * Math.min(1, Math.max(0, barT * 1.4 - (i / bars.length) * 0.4))} fill={c.text} />
                  ))}
                </svg>
              ) : (
                <small style={{ textAlign: "right" }}>{`${n} of ${CHAT.sleeps} seats`}</small>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, minHeight: 44 }}>
          <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mineIn ? `You're in · ${money(each(n))}` : full ? "The pass is full" : `${money(each(n + 1))} each if you join`}
            </span>
            <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mineIn ? `Seat ${ids(state).indexOf(me) + 1} · ${locked ? "locked" : need === 1 ? "1 more to lock" : `${need} more to lock`}` : full ? `The Airbnb sleeps ${CHAT.sleeps}` : `${CHAT.sleeps - n} seats open`}
            </small>
          </div>
          {mineIn ? (
            <Button onClick={() => dispatch({ t: "out" })}>I'm out</Button>
          ) : (
            <Button kind="primary" disabled={full} onClick={() => dispatch({ t: "in" })}>
              I'm in
            </Button>
          )}
        </div>
        {locked && t === null && n < CHAT.lockAt ? <SystemLine>{`Locked at ${CHAT.lockAt} · ${CHAT.lockAt - n} dropped since`}</SystemLine> : null}
      </div>
    );
  },
});
