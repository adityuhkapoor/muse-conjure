import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, running, tween, userColor } from "@muse/app";

// Seat map: Jess bought 8 seats for Mirror Lake (section 214, rows K and L, seats 5-8). Everyone
// taps the seat they want; the map is the picture. One seat each, tap your own seat to stand up,
// tap another free seat to move. Jess, who bought them, locks the seats once everyone is seated
// (or every seat is taken). Omar asked for the aisle seat in the chat, so he starts in L8.

// Everything here comes from the chat.
const CHAT = {
  show: "Mirror Lake",
  section: "214",
  rows: ["K", "L"], // K is in front of L
  seats: [5, 6, 7, 8],
  aisle: 8, // "L8 is the aisle seat"
  when: "Sat 3/7 · doors 7 · show 8",
  priceCents: 6200, // "$62 each w fees"
  buyer: "Jess",
  asked: [{ name: "Omar", seat: "L8" }], // "i need the aisle pls"
};

type Seat = { id: string; holder: string | null };
type State = { seats: Seat[]; buyer: string; locked: boolean; lockedAt: number };
type Action = { t: "sit"; seat: string } | { t: "stand" } | { t: "lock" } | { t: "unlock" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const SEAT_IDS = CHAT.rows.flatMap((r) => CHAT.seats.map((n) => `${r}${n}`));
const POP_MS = 700;
const pop = tween({ duration: 420, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? `.${String(c % 100).padStart(2, "0")}` : ""}`;

// ---- Check helpers (kept apart from the reducer so a broken reducer cannot also break the checks) ----
const seatOf = (s: State, u: string) => s.seats.find((x) => x.holder === u)?.id ?? null;
const holders = (s: State) => s.seats.map((x) => x.holder).filter((h): h is string => h !== null);
const lockable = (s: State, ctx: Ctx) => s.seats.every((x) => x.holder !== null) || ctx.members.every((m) => s.seats.some((x) => x.holder === m.id));
const othersOf = (s: State, u: string) => JSON.stringify(s.seats.map((x) => (x.holder === u ? [x.id, null] : [x.id, x.holder])));

function reduceSeats(s: State, a: Record<string, unknown>, user: string, time: number, ctx: Ctx): State {
  if (a.t === "sit") {
    if (s.locked || typeof a.seat !== "string") return s;
    const target = s.seats.find((x) => x.id === a.seat);
    if (!target || target.holder !== null) return s;
    return { ...s, seats: s.seats.map((x) => (x.id === target.id ? { ...x, holder: user } : x.holder === user ? { ...x, holder: null } : x)) };
  }
  if (a.t === "stand") {
    if (s.locked || !s.seats.some((x) => x.holder === user)) return s;
    return { ...s, seats: s.seats.map((x) => (x.holder === user ? { ...x, holder: null } : x)) };
  }
  if (a.t === "lock") {
    if (s.locked || user !== s.buyer) return s;
    const full = s.seats.every((x) => x.holder !== null);
    const everyone = ctx.members.every((m) => s.seats.some((x) => x.holder === m.id));
    if (!full && !everyone) return s;
    return { ...s, locked: true, lockedAt: time };
  }
  if (a.t === "unlock") {
    if (!s.locked || user !== s.buyer) return s;
    return { ...s, locked: false, lockedAt: 0 };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Seat map",
  summary: (s) => {
    const taken = s.seats.filter((x) => x.holder !== null).length;
    return s.locked ? `${CHAT.show} seats locked · ${taken} seated` : `${CHAT.show} seats · ${taken} of ${s.seats.length} taken`;
  },

  // init reruns with the member list until the first action, so Jess and Omar are found by name.
  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null;
    const asked = new Map(CHAT.asked.map((x) => [x.seat, idOf(x.name)]));
    return {
      seats: SEAT_IDS.map((id) => ({ id, holder: asked.get(id) ?? null })),
      buyer: idOf(CHAT.buyer) ?? ctx.members[0]?.id ?? "",
      locked: false,
      lockedAt: 0,
    };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceSeats(state, action as unknown as Record<string, unknown>, meta.user, meta.time, ctx) : state),

  // Someone left: their seat opens. If Jess left, whoever is first in the chat holds the tickets.
  onMembers: (state, ctx) => {
    const gone = state.seats.some((x) => x.holder !== null && !inChat(ctx, x.holder));
    const buyer = inChat(ctx, state.buyer) ? state.buyer : (ctx.members[0]?.id ?? "");
    if (!gone && buyer === state.buyer) return state;
    return { ...state, buyer, seats: gone ? state.seats.map((x) => (x.holder !== null && !inChat(ctx, x.holder) ? { ...x, holder: null } : x)) : state.seats };
  },

  invariants: {
    "the eight seats from the chat are always there, in order": (s) => s.seats.length === SEAT_IDS.length && s.seats.every((x, i) => x.id === SEAT_IDS[i]),
    "nobody holds two seats": (s) => new Set(holders(s)).size === holders(s).length,
    "everyone in a seat is in the chat": (s, ctx) => holders(s).every((h) => inChat(ctx, h)),
    "the tickets are held by someone in the chat": (s, ctx) => (ctx.members.length === 0 ? s.buyer === "" || !inChat(ctx, s.buyer) : inChat(ctx, s.buyer)),
    "locked exactly when there is a lock time": (s) => s.locked === s.lockedAt > 0,
  },

  transitions: {
    "a sit puts the actor in that free seat and moves no one else": (p, n, a, m) => {
      if (a.t !== "sit" || p === n) return true;
      const before = p.seats.find((x) => x.id === a.seat);
      return !p.locked && before?.holder === null && seatOf(n, m.user) === a.seat && othersOf(p, m.user) === othersOf(n, m.user) && n.locked === p.locked;
    },
    "a free seat is never refused while the seats are open": (p, n, a, m, ctx) =>
      a.t !== "sit" || !inChat(ctx, m.user) || p.locked || p.seats.find((x) => x.id === a.seat)?.holder !== null || p !== n,
    "standing up empties only the actor's seat": (p, n, a, m) =>
      a.t !== "stand" || p === n || (!p.locked && seatOf(p, m.user) !== null && seatOf(n, m.user) === null && othersOf(p, m.user) === othersOf(n, m.user)),
    "only the buyer locks, and only when everyone is seated or the seats are full": (p, n, a, m, ctx) =>
      a.t !== "lock" || p === n || (m.user === p.buyer && !p.locked && n.locked && n.lockedAt === m.time && lockable(p, ctx) && JSON.stringify(p.seats) === JSON.stringify(n.seats)),
    "the buyer can always lock a full or complete map": (p, n, a, m, ctx) => a.t !== "lock" || m.user !== p.buyer || !inChat(ctx, m.user) || p.locked || !lockable(p, ctx) || n.locked,
    "only the buyer unlocks": (p, n, a, m) => a.t !== "unlock" || p === n || (m.user === p.buyer && p.locked && !n.locked && JSON.stringify(p.seats) === JSON.stringify(n.seats)),
    "nobody moves while the seats are locked": (p, n) => !p.locked || !n.locked || JSON.stringify(p.seats) === JSON.stringify(n.seats),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.locked) return user === s.buyer && k < 0.5 ? { t: "unlock" } : { t: "sit", seat: r.pick(SEAT_IDS) };
    if (user === s.buyer && k < 0.15) return { t: "lock" };
    if (k < 0.25) return { t: "stand" };
    const free = s.seats.filter((x) => x.holder === null);
    return { t: "sit", seat: free.length && r.next() < 0.85 ? r.pick(free).id : r.pick(SEAT_IDS) };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mine = state.seats.find((x) => x.holder === me) ?? null;
    const taken = state.seats.filter((x) => x.holder !== null).length;
    const standing = members.filter((m) => !state.seats.some((x) => x.holder === m.id));
    const isBuyer = me === state.buyer;
    const canLock = state.seats.every((x) => x.holder !== null) || standing.length === 0;
    const lockT = state.locked ? running(state.lockedAt, POP_MS) : null;
    const buyerName = nameOf(state.buyer);

    // A tiny bowl with the stage on top and section 214 lit, so the block reads as a place.
    const bowl = (
      <svg width="56" height="44" viewBox="0 0 56 44" aria-hidden="true" style={{ flex: "none" }}>
        <rect x="18" y="2" width="20" height="6" rx="2" fill={c.secondaryText} />
        {Array.from({ length: 9 }, (_, i) => {
          const ang = (Math.PI * (i + 0.5)) / 9;
          const x = 28 - Math.cos(ang) * 22, y = 10 + Math.sin(ang) * 26;
          const rot = (ang * 180) / Math.PI - 90;
          return <rect key={i} x={x - 4} y={y - 3.5} width="8" height="7" rx="1.5" fill={i === 6 ? c.primary : c.track} transform={`rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`} />;
        })}
      </svg>
    );

    const seat = (row: string, n: number, i: number) => {
      const id = `${row}${n}`;
      const x = state.seats.find((s) => s.id === id)!;
      const own = x.holder === me;
      const open = !state.locked && (x.holder === null || own);
      const t = lockT === null ? 1 : pop(Math.max(0, lockT - i * 55));
      const back = x.holder === null ? c.divider : own ? c.primary : userColor(x.holder, theme);
      return (
        <div key={id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            aria-label={x.holder ? `${id}, ${nameOf(x.holder)}` : `${id}, open`}
            aria-pressed={own}
            disabled={!open}
            onClick={() => dispatch(own ? { t: "stand" } : { t: "sit", seat: id })}
            style={{
              position: "relative",
              width: "100%",
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px 12px 6px 6px",
              background: own ? c.selected : c.input,
              cursor: open ? "pointer" : "default",
              transform: `scale(${(0.86 + 0.14 * t).toFixed(3)})`,
              opacity: state.locked && x.holder === null ? 0.5 : 1,
            }}
          >
            <span aria-hidden="true" style={{ position: "absolute", left: 6, right: 6, top: 4, height: 4, borderRadius: 2, background: back }} />
            {x.holder ? <Avatar user={x.holder} size={28} /> : <span style={{ color: c.secondaryText, fontSize: 13, fontWeight: 600 }}>{id}</span>}
          </button>
          <small style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: own ? c.link : c.secondaryText, fontWeight: own ? 600 : 400 }}>
            {x.holder ? nameOf(x.holder) : " "}
          </small>
        </div>
      );
    };

    return (
      <div>
        <CardHeader title={`${CHAT.show} seats`} subtitle={state.locked ? `Locked by ${buyerName} · ${taken} seated` : `${taken} of ${state.seats.length} taken · ${money(CHAT.priceCents)} each`} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${c.divider}` }}>
          {bowl}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Section ${CHAT.section} · rows ${CHAT.rows.join(" and ")}`}</div>
            <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CHAT.when}</small>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0 6px" }}>
          <span style={{ width: 36, flex: "none" }} />
          <div style={{ flex: 1, textAlign: "center", borderRadius: 999, background: c.wash, color: c.secondaryText, fontSize: 13, lineHeight: "20px" }}>Stage</div>
          <small style={{ width: 36, flex: "none", textAlign: "right" }}>Aisle</small>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {CHAT.rows.map((row, r) => (
            <div key={row} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <small style={{ width: 14, flex: "none", lineHeight: "48px", fontWeight: 600, textAlign: "center" }}>{row}</small>
              {/* the row keeps going past our block: one sold seat peeks in from the left */}
              <span aria-hidden="true" style={{ width: 10, height: 48, flex: "none", borderRadius: "0 8px 4px 0", background: c.track, opacity: 0.6 }} />
              {CHAT.seats.map((n, i) => seat(row, n, r * CHAT.seats.length + i))}
              {/* stairs down the aisle, next to seat 8 */}
              <span aria-hidden="true" style={{ width: 12, height: 48, flex: "none", display: "grid", alignContent: "space-evenly" }}>
                {[0, 1, 2, 3].map((k) => (
                  <i key={k} style={{ display: "block", height: 1, background: c.divider }} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, marginTop: 4, paddingTop: 8, borderTop: `1px solid ${c.divider}` }}>
          {standing.length ? <Facepile users={standing.map((m) => m.id)} max={3} size={24} /> : null}
          <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {mine ? `You're in ${mine.id}` : state.locked ? "Seats are locked" : taken === state.seats.length ? "Every seat is taken" : "Tap a seat to sit"}
            </span>
            <small style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[standing.length ? `${standing.length} without a seat` : "Everyone has a seat", mine && me !== state.buyer ? `${money(CHAT.priceCents)} to ${buyerName}` : null].filter(Boolean).join(" · ")}
            </small>
          </div>
          {isBuyer ? (
            state.locked ? (
              <Button onClick={() => dispatch({ t: "unlock" })}>Unlock</Button>
            ) : (
              <Button kind="primary" disabled={!canLock} onClick={() => dispatch({ t: "lock" })}>
                Lock
              </Button>
            )
          ) : null}
        </div>
        {state.locked && lockT === null ? <SystemLine actor={buyerName}>locked the seats</SystemLine> : null}
      </div>
    );
  },
});
