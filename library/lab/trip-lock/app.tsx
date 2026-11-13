import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Changed,
  Toast,
  haptic,
  innerWidth,
  running,
  textWidth,
  tween,
  type Member,
} from "@muse/app";

// Trip lock: a trip that only happens if enough people commit. The card shows the route, a row of
// seats with the people already in, and how many more are needed. The fourth tap locks the trip;
// after that the seats stay put, people can still back out, and a nudge names who is missing.

type Params = {
  /** Card title: "Senior yr or never" */
  title: string;
  /** Airline and size line: "Muse Air · trip for 6" */
  sub: string;
  /** Event date, sentence case: "Fri, Mar 13 at 8:00 AM" */
  date: string;
  /** Leaving from: "Campus" */
  from: string;
  /** Going to: "Nashville" */
  to: string;
  /** Dates, fare and meeting place: "Mar 13–16 · ~$140 each · gate: the chat" */
  details: string;
  /** When the headcount is final: "Final headcount Fri at 5:00 PM" */
  deadline: string;
  /** Seats in order. who: a member name or id already in, empty when open. */
  seats: { code: string; who: string }[];
  /** How many people in the chat lock the trip. */
  lockAt: number;
};

// @params
const P: Params = {
  title: "Senior yr or never", sub: "Muse Air · trip for 6", date: "Fri, Mar 13 at 8:00 AM",
  from: "Campus", to: "Nashville", details: "Mar 13–16 · ~$140 each · gate: the chat",
  deadline: "Final headcount Fri at 5:00 PM",
  seats: [ { code: "1A", who: "Priya" }, { code: "1B", who: "Sam" }, { code: "1C", who: "Ana" },
           { code: "1D", who: "" }, { code: "1E", who: "" }, { code: "1F", who: "" } ],
  lockAt: 4,
};
// @end params

type Seat = { code: string; who: string | null; at: number };
type State = {
  title: string; sub: string; date: string; from: string; to: string; details: string; deadline: string;
  seats: Seat[]; lockAt: number;
  lockedAt: number;
  nudged: string[]; nudgedAt: number;
};
type Action = { t: "in" } | { t: "out" } | { t: "nudge" };
type Local = { burst: number };
type Chat = { members: Member[] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const inChat = (ctx: Chat, id: string) => ctx.members.some((m) => m.id === id);
const seated = (s: State) => s.seats.filter((x) => x.who !== null);
const seatOf = (s: State, u: string) => s.seats.findIndex((x) => x.who === u);
const unseated = (s: State, ctx: Chat) => ctx.members.filter((m) => seatOf(s, m.id) === -1);
const nameOf = (members: Member[], id: string) => members.find((m) => m.id === id)?.name?.trim() || "Someone";
const lowerFirst = (x: string) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);

function names(ids: string[], members: Member[]): string {
  const list = ids.map((id) => nameOf(members, id));
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]} +${list.length - 1}`;
}

function sameOrder(a: string[], b: Member[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]!.id);
}

function reduceTrip(s: State, a: Record<string, unknown>, user: string, time: number, ctx: Chat): State {
  if (!inChat(ctx, user)) return s;

  if (a.t === "in") {
    if (seatOf(s, user) >= 0) return s;
    const open = s.seats.findIndex((x) => x.who === null);
    if (open < 0) return s;
    const seats = s.seats.map((x, i) => (i === open ? { ...x, who: user, at: time } : x));
    const lockedAt = s.lockedAt === 0 && seated({ ...s, seats }).length >= s.lockAt ? time : s.lockedAt;
    return { ...s, seats, lockedAt };
  }

  if (a.t === "out") {
    const at = seatOf(s, user);
    if (at < 0) return s;
    const seats = s.seats.map((x, i) => (i === at ? { code: x.code, who: null, at: 0 } : x));
    return { ...s, seats };
  }

  if (a.t === "nudge") {
    const at = seatOf(s, user);
    if (at < 0) return s;
    const missing = unseated(s, ctx);
    if (!missing.length || sameOrder(s.nudged, missing)) return s;
    return { ...s, nudged: missing.map((m) => m.id), nudgedAt: time };
  }

  return s;
}

export default defineApp<State, Action, Local>({
  name: "Trip lock",
  summary: (s) => {
    const going = seated(s).length;
    if (s.lockedAt > 0) return `${s.title}: locked · ${going} going`;
    return `${s.title}: ${going} of ${s.lockAt} in · locks at ${s.lockAt}`;
  },

  init: (ctx) => {
    const source = Array.isArray(P.seats) ? P.seats.slice(0, 8) : [];
    const usedCodes = new Set<string>();
    const usedPeople = new Set<string>();
    const seats: Seat[] = [];
    const wanted = Math.max(2, source.length);
    for (let i = 0; i < wanted; i++) {
      const raw = source[i] as { code?: unknown; who?: unknown } | undefined;
      let code = text(raw?.code, 4) || `1${"ABCDEFGH"[i] ?? "A"}`;
      if (usedCodes.has(code)) {
        let next = 0;
        while (next < 8 && usedCodes.has(`1${"ABCDEFGH"[next]}`)) next++;
        code = `1${"ABCDEFGH"[next] ?? "H"}`;
      }
      usedCodes.add(code);
      const wantedWho = text(raw?.who, 48);
      let who: string | null = null;
      if (wantedWho) {
        const key = wantedWho.toLowerCase();
        const member = ctx.members.find(
          (m) => m.id === wantedWho || (m.name ?? "").trim().toLowerCase() === key,
        );
        if (member && !usedPeople.has(member.id)) {
          who = member.id;
          usedPeople.add(member.id);
        }
      }
      seats.push({ code, who, at: 0 });
    }
    if (seats.length && seats.every((x) => x.who !== null)) {
      seats[seats.length - 1] = { ...seats[seats.length - 1]!, who: null, at: 0 };
    }
    const count = seats.filter((x) => x.who !== null).length;
    const wantedLock = Math.round(Number(P.lockAt)) || 4;
    const lockAt = Math.max(count + 1, Math.min(seats.length, wantedLock));
    return {
      title: text(P.title, 40) || "Trip lock",
      sub: text(P.sub, 48),
      date: text(P.date, 48),
      from: text(P.from, 48),
      to: text(P.to, 48),
      details: text(P.details, 48),
      deadline: text(P.deadline, 48),
      seats,
      lockAt,
      lockedAt: 0,
      nudged: [],
      nudgedAt: 0,
    };
  },

  reduce: (state, action, meta, ctx) =>
    reduceTrip(state, action as unknown as Record<string, unknown>, meta.user, meta.time, ctx),

  onMembers: (state, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    const seats = state.seats.map((x) => (x.who !== null && !here.has(x.who) ? { ...x, who: null, at: 0 } : x));
    const nudged = state.nudged.filter((id) => here.has(id));
    if (seats.every((x, i) => x.who === state.seats[i]!.who && x.at === state.seats[i]!.at) && nudged.length === state.nudged.length) return state;
    return { ...state, seats, nudged };
  },

  invariants: {
    "one seat per person, all in the chat": (s, ctx) => {
      const ids = s.seats.map((x) => x.who).filter((x): x is string => x !== null);
      return new Set(ids).size === ids.length && ids.every((id) => inChat(ctx, id));
    },
    "a taken seat has a time only if taken in here": (s) => s.seats.every((x) => x.who !== null || x.at === 0),
    "unlocked means not enough yet": (s) => s.lockedAt > 0 || seated(s).length < s.lockAt,
    "lock count fits the seats": (s) => Number.isInteger(s.lockAt) && s.lockAt >= 1 && s.lockAt <= s.seats.length,
    "seat codes are unique and 2 to 8 seats": (s) =>
      s.seats.length >= 2 && s.seats.length <= 8 && new Set(s.seats.map((x) => x.code)).size === s.seats.length,
    "nudged people are in the chat, each once": (s, ctx) =>
      new Set(s.nudged).size === s.nudged.length && s.nudged.every((id) => inChat(ctx, id)),
  },

  transitions: {
    "in takes the first open seat and moves nobody else": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const at = seatOf(n, m.user);
      const open = p.seats.findIndex((x) => x.who === null);
      if (seatOf(p, m.user) !== -1 || at !== open || at < 0) return false;
      return p.seats.every((x, i) => i === at || (n.seats[i]!.code === x.code && n.seats[i]!.who === x.who && n.seats[i]!.at === x.at));
    },
    "the join that reaches the count locks it then": (p, n, a, m) => {
      if (a.t !== "in") return true;
      if (p.lockedAt > 0) return true;
      return seated(n).length >= n.lockAt ? n.lockedAt === m.time : n.lockedAt === 0;
    },
    "a lock is never undone": (p, n) => p.lockedAt === 0 || n.lockedAt === p.lockedAt,
    "out frees only the sender's seat": (p, n, a, m) => {
      if (a.t !== "out" || p === n) return true;
      const at = seatOf(p, m.user);
      if (at < 0 || seatOf(n, m.user) !== -1) return false;
      return p.seats.every(
        (x, i) =>
          n.seats[i]!.code === x.code &&
          (i === at ? n.seats[i]!.who === null && n.seats[i]!.at === 0 : n.seats[i]!.who === x.who && n.seats[i]!.at === x.at),
      );
    },
    "only seated people nudge, and it names who's missing": (p, n, a, m) => {
      if (a.t !== "nudge" || p === n) return true;
      return seatOf(p, m.user) >= 0 && n.nudgedAt === m.time && n.nudged.every((id) => seatOf(n, id) === -1);
    },
    "lock count and text never change": (p, n) =>
      n.lockAt === p.lockAt &&
      n.title === p.title &&
      n.details === p.details &&
      p.seats.every((x, i) => n.seats[i]!.code === x.code),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = seatOf(s, user);
    const k = r.next();
    if (mine < 0) return k < 0.85 ? { t: "in" } : { t: "nudge" };
    if (k < 0.35) return { t: "out" };
    if (k < 0.7) return { t: "nudge" };
    return { t: "in" };
  },

  local: { burst: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = innerWidth();
    const step = W / state.seats.length;
    const mine = seatOf(state, me);
    const mySeat = mine >= 0 ? state.seats[mine]! : undefined;
    const open = state.seats.findIndex((x) => x.who === null);
    const missing = unseated(state, { members });
    const going = seated(state).length;
    const locked = state.lockedAt > 0;
    const canNudge = mine >= 0 && missing.length > 0 && !sameOrder(state.nudged, missing);
    const nudgeNames = names(state.nudged, members);
    const arrivedMine = confirmed.seats.find((x) => x.who === me && x.at > 0);
    const flight = arrivedMine ? running(arrivedMine.at, 500) : null;
    const flightAt = tween({ duration: 500, easing: "easeInOut" });
    const burstSeat = confirmed.seats.findIndex((x) => confirmed.lockedAt > 0 && x.at === confirmed.lockedAt);
    const burstLive = confirmed.lockedAt > 0 && running(confirmed.lockedAt, 1400) !== null;
    const toastLive = arrivedMine && arrivedMine.at > 0 ? running(arrivedMine.at, 2400) : null;

    const line = locked
      ? `Locked · ${going} going${mySeat && mySeat.at === state.lockedAt ? ` · seat ${mySeat.code} is yours` : ""}${state.nudged.length ? ` · nudged ${nudgeNames}` : ""}`
      : `${going} of ${state.lockAt} · locks at ${state.lockAt}`;
    const fill = state.lockAt > 0 ? Math.min(going, state.lockAt) / state.lockAt : 0;

    const fromWidth = textWidth(state.from, 20, 700);
    const toWidth = textWidth(state.to, 20, 700);
    const routeWidth = W - fromWidth - toWidth - 28;
    const showRoute = routeWidth >= 40;
    const arc = `M0 22 Q ${routeWidth / 2} -6 ${routeWidth} 22`;

    const seatRow = (
      <div style={{ position: "relative", height: 76 }}>
        {state.seats.map((seat, i) => {
          const center = step * (i + 0.5);
          const size = Math.max(0, Math.min(36, step - 6));
          const taken = seat.who !== null;
          const isMine = seat.who === me;
          const flying = isMine && flight !== null;
          const label = taken ? (isMine ? "You" : nameOf(members, seat.who!)) : seat.code;
          const spoken = `Seat ${seat.code}, ${taken ? nameOf(members, seat.who!) : "open"}`;
          return (
            <div key={`${seat.code}-${i}`} role="img" aria-label={spoken} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: 76 }}>
              <div
                style={{
                  position: "absolute",
                  left: center,
                  top: 30,
                  width: size,
                  height: size,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background: c.input,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {taken ? (
                  flying ? null : <Avatar user={seat.who!} size={size} />
                ) : (
                  <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke={c.secondaryText} stroke-width={1.6} stroke-linecap="round">
                    <line x1="13" y1="18" x2="23" y2="18" />
                    <line x1="18" y1="13" x2="18" y2="23" />
                  </svg>
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: center,
                  top: 52,
                  width: Math.max(0, step - 4),
                  transform: "translateX(-50%)",
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: "16px",
                  fontWeight: 400,
                  color: taken ? c.text : c.secondaryText,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
        {burstLive && burstSeat >= 0 ? (
          <div style={{ position: "absolute", left: step * (burstSeat + 0.5), top: 30, width: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
            <Burst key={confirmed.lockedAt} emoji="❤️" />
          </div>
        ) : null}
      </div>
    );

    const action = (() => {
      if (mine < 0 && open >= 0) {
        return (
          <Button
            kind="primary"
            wide
            onClick={() => {
              if (going + 1 >= state.lockAt) haptic("success");
              dispatch({ t: "in" });
            }}
          >
            I'm in
          </Button>
        );
      }
      if (mine >= 0) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canNudge ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                <Button kind="secondary" wide onClick={() => dispatch({ t: "nudge" })}>
                  Nudge
                </Button>
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {state.nudged.length ? `Nudged ${nudgeNames}` : "Everyone's in"}
              </div>
            )}
            <Button kind="deemphasized" onClick={() => dispatch({ t: "out" })}>
              Back out
            </Button>
          </div>
        );
      }
      return (
        <div style={{ textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
          All seats taken
        </div>
      );
    })();

    let flyingAvatar = null;
    if (arrivedMine && flight !== null) {
      const q = flightAt(flight);
      const fromX = W / 2;
      const fromY = 76 + 34 + 6 + 18;
      const toX = step * (seatOf(confirmed, me) + 0.5);
      const toY = 30;
      flyingAvatar = (
        <div
          style={{
            position: "absolute",
            left: fromX + (toX - fromX) * q,
            top: fromY + (toY - fromY) * q - Math.sin(q * Math.PI) * 40,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <Avatar user={me} size={36} />
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <div style={{ height: 20, fontSize: 13, lineHeight: "20px", fontWeight: 600, color: c.negative, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {state.date}
        </div>

        <div style={{ height: 32, display: "flex", alignItems: "center" }}>
          <span style={{ flex: "none", maxWidth: "45%", fontSize: 20, lineHeight: "24px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.from}
          </span>
          {showRoute ? (
            <svg width={routeWidth} height={28} viewBox={`0 0 ${routeWidth} 28`} aria-hidden="true" style={{ flex: "none", margin: "0 14px", display: "block", overflow: "hidden" }}>
              <path d={arc} fill="none" stroke={c.divider} stroke-width={1} stroke-dasharray="4 4" />
              <g fill={c.primary}>
                <polygon points="-9,-1.6 7,-1.8 10,0 7,1.8 -9,1.6" />
                <polygon points="-1,0 3,0 -3,-8 -5,-8" />
                <polygon points="-1,0 3,0 -3,8 -5,8" />
                <polygon points="-9,0 -6.5,0 -8.5,-4 -10,-4" />
                <polygon points="-9,0 -6.5,0 -8.5,4 -10,4" />
                <animateMotion dur="4s" repeatCount="indefinite" rotate="auto" path={arc} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.42 0 0.58 1" />
              </g>
            </svg>
          ) : null}
          <span style={{ flex: "none", maxWidth: "45%", marginLeft: "auto", fontSize: 20, lineHeight: "24px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.to}
          </span>
        </div>

        <div style={{ height: 22, fontSize: 15, lineHeight: "22px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {state.details}
        </div>
        <div style={{ height: 20, fontSize: 13, lineHeight: "20px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {`Locks at ${state.lockAt} · ${lowerFirst(state.deadline)}`}
        </div>

        <div style={{ height: 9, paddingTop: 8 }}>
          <div style={{ height: 1, background: c.divider }} />
        </div>

        <div style={{ position: "relative" }}>
          {seatRow}
          <Changed at={state.lockedAt}>
            <div style={{ position: "relative", height: 34 }}>
              <div style={{ height: 20, fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {line}
              </div>
              <div style={{ position: "absolute", top: 24, left: 0, right: 0, height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, height: "100%", borderRadius: 3, background: c.primary }} />
              </div>
            </div>
          </Changed>
          <div style={{ height: 42, paddingTop: 6 }}>{action}</div>
          {flyingAvatar}
        </div>

        {toastLive !== null && arrivedMine ? (
          <Toast key={arrivedMine.at}>{confirmed.lockedAt === arrivedMine.at ? "You're in. It's a plan." : "You're in"}</Toast>
        ) : null}
      </div>
    );
  },
});
