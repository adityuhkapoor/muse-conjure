import { defineApp, clock, Avatar, Burst, Button, CardHeader, Locked, fitText, haptic, mix, pal, running, spring, springs, tween, userColor, type Ctx, type Theme } from "@muse/app";

// Coffee seat: a café table for two. The one who reached out already has a steaming cup; the
// other cup sits empty across the table. Three times are chalked on the café's board: tap one and
// your cup fills and it lands on both calendars. "Not this week" puts a saucer on the cup, no guilt.

type Params = {
  /** Card title: "Coffee at Kettle & Crumb" */
  title: string;
  /** Who reached out: "Aditya" */
  host: string;
  /** Who they asked: "Tsai Lin" */
  guest: string;
  /** What the host said, in their words */
  quote: string;
  /** How long it's been: "since August" */
  since: string;
  /** The café: "Kettle & Crumb" */
  place: string;
  /** The host's order, on his cup: "oat latte" */
  hostOrder: string;
  /** The guest's usual, on her cup: "chai, extra hot" */
  guestOrder: string;
  /** One to four times offered */
  times: { day: string; time: string }[];
  /** A small chalk note at the bottom of the board */
  note: string;
  /** Index of the time already picked, or -1 */
  picked: number;
};

// @params
const P: Params = {
  title: "Coffee at Kettle & Crumb",
  host: "Aditya",
  guest: "Tsai Lin",
  quote: "we should catch up sometime. lowkey miss our 3pm coffees",
  since: "since August",
  place: "Kettle & Crumb",
  hostOrder: "oat latte",
  guestOrder: "chai, extra hot",
  times: [
    { day: "Tue", time: "3pm" },
    { day: "Wed", time: "10am" },
    { day: "Thu", time: "4pm" },
  ],
  note: "lowkey my treat",
  picked: -1,
};
// @end params

type Slot = { day: string; time: string };
type State = {
  title: string;
  host: string;
  guest: string;
  hostName: string;
  guestName: string;
  quote: string;
  since: string;
  place: string;
  hostOrder: string;
  guestOrder: string;
  note: string;
  times: Slot[];
  pick: number;
  passed: boolean;
  at: number;
};
type Action = { t: "pick"; i: number } | { t: "pass" } | { t: "undo" };
type Local = { bursts: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const FILL = tween({ duration: 1100, easing: "decelerate" });
const DROP = spring(springs.iosBouncy);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/** The guest acts; when the guest isn't known, anyone but the host may. */
const canAct = (s: State, u: string) => (s.guest ? u === s.guest : u !== s.host);

function initState(ctx: Ctx): State {
  const find = (n: string) => ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n.toLowerCase());
  const h = find(clean(P.host, 40));
  const host = h?.id ?? ctx.members[0]?.id ?? "";
  const gm = find(clean(P.guest, 40));
  const guest = gm && gm.id !== host ? gm.id : ctx.members.find((m) => m.id !== host)?.id ?? "";
  let times = (Array.isArray(P.times) ? P.times : [])
    .map((t) => ({ day: clean(t?.day, 10), time: clean(t?.time, 10) }))
    .filter((t) => t.day || t.time)
    .slice(0, 4);
  if (!times.length) times = [{ day: "This week", time: "any time" }];
  const pick = Number.isInteger(P.picked) && P.picked >= 0 && P.picked < times.length ? P.picked : -1;
  return {
    title: clean(P.title, 40) || `Coffee at ${clean(P.place, 28) || "the café"}`,
    host,
    guest,
    hostName: h?.name ?? (clean(P.host, 20) || ctx.members.find((m) => m.id === host)?.name || "Me"),
    guestName: gm?.name ?? (clean(P.guest, 20) || ctx.members.find((m) => m.id === guest)?.name || "You"),
    quote: clean(P.quote, 100),
    since: clean(P.since, 30),
    place: clean(P.place, 28) || "Coffee",
    hostOrder: clean(P.hostOrder, 24),
    guestOrder: clean(P.guestOrder, 24),
    note: clean(P.note, 28),
    times,
    pick,
    passed: false,
    at: 0,
  };
}

function Cup({ x, y, fill, level, steam, now, color, saucer, theme }: { x: number; y: number; fill: string; level: number; steam: boolean; now: number; color: string; saucer: boolean; theme: Theme }) {
  const c = theme.color;
  const p = pal(theme);
  const w = 34;
  const hh = 30;
  const top = y - hh;
  const liquid = Math.max(0, Math.min(1, level)) * (hh - 6);
  const clip = `cup-${Math.round(x)}`;
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={30} ry={6} fill={p.plate} stroke={c.divider} stroke-width={1.2} />
      <path d={`M ${x + w / 2 - 2} ${top + 8} q 14 2 10 12 q -3 7 -12 6`} fill="none" stroke={color} stroke-width={4} stroke-linecap="round" />
      <defs>
        <clipPath id={clip}>
          <path d={`M ${x - w / 2} ${top} L ${x + w / 2} ${top} L ${x + w / 2 - 4} ${y - 2} Q ${x} ${y + 3} ${x - w / 2 + 4} ${y - 2} Z`} />
        </clipPath>
      </defs>
      <path d={`M ${x - w / 2} ${top} L ${x + w / 2} ${top} L ${x + w / 2 - 4} ${y - 2} Q ${x} ${y + 3} ${x - w / 2 + 4} ${y - 2} Z`} fill={p.paper} stroke={color} stroke-width={2} />
      <g clip-path={`url(#${clip})`}>
        <rect x={x - w / 2} y={y - liquid - 1} width={w} height={liquid + 4} fill={fill} />
        {liquid > 4 ? <ellipse cx={x} cy={y - liquid - 1} rx={w / 2} ry={2.5} fill={mix(fill, p.cream, 0.55)} /> : null}
      </g>
      <rect x={x - w / 2 - 1} y={top - 2} width={w + 2} height={4} rx={2} fill={color} />
      {steam
        ? [-8, 0, 8].map((dx, k) => {
            const ph = (now / 1400 + k * 0.33) % 1;
            const sy = top - 8 - ph * 22;
            return (
              <path
                key={k}
                d={`M ${x + dx} ${sy + 12} q -5 -5 0 -10 q 5 -5 0 -10`}
                fill="none"
                stroke={mix(c.secondaryText, c.card, 0.25 + ph * 0.6)}
                stroke-width={2}
                stroke-linecap="round"
              />
            );
          })
        : null}
      {saucer ? <ellipse cx={x} cy={top - 3} rx={22} ry={5} fill={p.plate} stroke={c.divider} stroke-width={1.2} /> : null}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Coffee seat",
  summary: (s) =>
    s.pick >= 0
      ? `${s.hostName} and ${s.guestName}: ${s.times[s.pick]!.day} ${s.times[s.pick]!.time} at ${s.place}`
      : s.passed
        ? `${s.guestName} can't this week · the seat's saved`
        : `${s.hostName} saved ${s.guestName} a seat at ${s.place} · ${s.times.length} times`,
  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || !canAct(s, meta.user)) return s;
    if (a.t === "pick") {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.times.length || a.i === s.pick) return s;
      return { ...s, pick: a.i, passed: false, at: meta.time };
    }
    if (a.t === "pass") {
      if (s.passed) return s;
      return { ...s, pick: -1, passed: true, at: meta.time };
    }
    if (a.t === "undo") {
      if (s.pick < 0 && !s.passed) return s;
      return { ...s, pick: -1, passed: false, at: meta.time };
    }
    return s;
  },

  invariants: {
    "the pick is one of the times": (s) => s.pick === -1 || (Number.isInteger(s.pick) && s.pick >= 0 && s.pick < s.times.length),
    "passing and picking don't mix": (s) => !(s.passed && s.pick >= 0),
    "one to four times": (s) => s.times.length >= 1 && s.times.length <= 4,
    "host and guest differ": (s) => s.host === "" || s.host !== s.guest,
  },

  transitions: {
    "only the guest answers": (p, n, _a, m) => p === n || canAct(p, m.user),
    "only people in the chat answer": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a pick fills that cup now": (p, n, a, m) => a.t !== "pick" || p === n || (n.pick === a.i && !n.passed && n.at === m.time && p.pick !== a.i),
    "not this week clears the pick": (p, n, a, m) => a.t !== "pass" || p === n || (n.passed && n.pick === -1 && n.at === m.time && !p.passed),
    "undo leaves an empty cup": (p, n, a) => a.t !== "undo" || p === n || (n.pick === -1 && !n.passed && (p.pick >= 0 || p.passed)),
    "the times never change": (p, n) => JSON.stringify(p.times) === JSON.stringify(n.times) && p.host === n.host && p.guest === n.guest,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.6) return { t: "pick", i: r.int(s.times.length) };
    if (k < 0.8) return { t: "pass" };
    return { t: "undo" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 226;
    const dark = theme.mode === "dark";
    const mine = canAct(state, me);
    const picked = state.pick >= 0;
    const fillT = picked ? FILL(running(state.at, 1100) ?? 1100) : 0;
    const tagT = picked ? DROP(running(state.at, 900) ?? 900) : 1;
    const now = clock.value;
    const hostC = state.host ? userColor(state.host, theme) : c.secondaryText;
    const guestC = state.guest ? userColor(state.guest, theme) : c.secondaryText;
    const board = dark ? mix(p.leaf, c.wash, 0.55) : mix(p.leaf, c.text, 0.62);
    const chalk = dark ? c.text : c.card;
    const floor = dark ? mix(p.brown, c.wash, 0.62) : mix(p.wall, c.wash, 0.3);
    const tableY = 190;
    const hx = 44;
    const gx = W - 44;
    const bx = 84;
    const boardW = W - 2 * bx;
    const boardB = 122;
    const slot = picked ? state.times[state.pick]! : null;
    const nameOf = (u: string, n: string) => (u === me ? "you" : n);
    const label = (t: Slot) => `${t.day} ${t.time}`.trim();
    const n = state.times.length;
    const rowH = Math.min(30, Math.floor((boardB - 38 - (state.note && n < 4 ? 14 : 0)) / n));

    const body = (x: number, col: string, solid: boolean) => (
      <path
        d={`M ${x - 27} ${tableY} Q ${x - 27} ${tableY - 54} ${x} ${tableY - 56} Q ${x + 27} ${tableY - 54} ${x + 27} ${tableY} Z`}
        fill={solid ? col : "none"}
        stroke={solid ? "none" : c.secondaryText}
        stroke-width={1.5}
        stroke-dasharray={solid ? undefined : "4 4"}
      />
    );
    const windowAt = (x: number, sun: boolean) => (
      <g>
        <rect x={x} y={14} width={60} height={50} rx={6} fill={p.sky} stroke={c.divider} stroke-width={1.5} />
        {sun ? <circle cx={x + 42} cy={30} r={7} fill={mix(p.yellow, p.sky, 0.2)} /> : <path d={`M ${x + 10} 34 q 6 -8 14 -2 q 6 -6 12 2 Z`} fill={p.paper} />}
        <path d={`M ${x} 64 q 12 -14 26 -4 q 12 -10 34 2 v 2 h -60 Z`} fill={p.grass} />
        <line x1={x + 30} y1={14} x2={x + 30} y2={64} stroke={c.divider} stroke-width={1.5} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M ${x - 4 + i * 17} 8 h 17 v 8 q -8.5 7 -17 0 Z`} fill={i % 2 ? p.paper : p.red} />
        ))}
      </g>
    );
    const calX = W / 2;
    const calDrop = (1 - tagT) * -80;

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={slot ? `Two full cups at ${state.place}, ${label(slot)}` : `A table for two at ${state.place}, one cup still empty`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={c.wash} />
        <path d={`M 0 ${tableY + 12} H ${W} V ${H - 14} q 0 14 -14 14 H 14 q -14 0 -14 -14 Z`} fill={floor} />
        {windowAt(14, false)}
        {windowAt(W - 74, true)}
        <rect x={bx} y={6} width={boardW} height={boardB} rx={6} fill={mix(p.brown, c.wash, 0.15)} />
        <rect x={bx + 5} y={11} width={boardW - 10} height={boardB - 10} rx={4} fill={board} />
        {body(hx, hostC, true)}
        {body(gx, guestC, picked || state.passed)}
        <rect x={W / 2 - 6} y={tableY + 6} width={12} height={H - tableY - 16} fill={mix(p.brown, c.text, 0.2)} />
        <ellipse cx={W / 2} cy={H - 9} rx={32} ry={5} fill={mix(p.brown, c.text, 0.2)} />
        <rect x={10} y={tableY - 4} width={W - 20} height={12} rx={6} fill={p.brown} />
        <Cup x={hx + 56} y={tableY - 5} fill={mix(p.brown, p.cream, 0.35)} level={0.85} steam now={now} color={hostC} saucer={false} theme={theme} />
        <Cup x={gx - 56} y={tableY - 5} fill={mix(p.crust, p.brown, 0.3)} level={fillT * 0.85} steam={picked && fillT > 0.6} now={now} color={guestC} saucer={state.passed} theme={theme} />
        {slot ? (
          <g transform={`translate(${calX} ${tableY - 4 + calDrop})`}>
            <rect x={-22} y={-40} width={44} height={40} rx={5} fill={p.paper} stroke={c.divider} stroke-width={1.2} />
            <rect x={-22} y={-40} width={44} height={12} rx={4} fill={c.primary} />
            <circle cx={-12} cy={-40} r={2} fill={c.secondaryText} />
            <circle cx={12} cy={-40} r={2} fill={c.secondaryText} />
          </g>
        ) : null}
      </svg>
    );

    const tiny = { position: "absolute", fontSize: 12, lineHeight: "16px", textAlign: "center", pointerEvents: "none", ...ell } as const;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.since ? `${state.hostName} and ${state.guestName} · ${state.since}` : `${state.hostName} and ${state.guestName}`} />
        {state.quote ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
            {state.host ? <Avatar user={state.host} size={20} /> : null}
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "19px", color: c.text, overflow: "hidden", maxHeight: 38 }}>{`"${state.quote}"`}</div>
          </div>
        ) : null}
        <div style={{ position: "relative", height: H }}>
          {art}
          <div style={{ ...tiny, left: bx + 12, top: 15, width: boardW - 24, textAlign: "left", fontWeight: 700, color: chalk, background: board }}>{!slot ? (mine ? "Pick a time" : `${state.hostName} is free`) : mine ? "Your pick" : `${state.guestName} picked`}</div>
          {state.times.map((t, i) => {
            const on = state.pick === i;
            const f = fitText(label(t), boardW - 44, { size: 17, min: 12, weight: 700 });
            return (
              <button
                key={`${i}-${on}`}
                type="button"
                aria-label={`${label(t)}${on ? ", picked" : ""}`}
                aria-pressed={on}
                onClick={() => {
                  if (!mine || on) return;
                  haptic("success");
                  setLocal({ bursts: local.bursts + 1 });
                  dispatch({ t: "pick", i });
                }}
                style={{ position: "absolute", left: bx + 7, top: 33 + i * rowH - (44 - rowH) / 2, width: boardW - 14, height: 44, padding: "0 6px", border: 0, borderRadius: 6, background: "transparent", color: chalk, font: "inherit", display: "flex", alignItems: "center", gap: 8, cursor: mine ? "pointer" : "default", textAlign: "left" }}
              >
                <span aria-hidden="true" style={{ flex: "none", width: 16, height: 16, borderRadius: 8, border: `2px solid ${chalk}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on ? <span style={{ width: 8, height: 8, borderRadius: 4, background: chalk }} /> : null}
                </span>
                <span style={{ fontSize: f.size, lineHeight: "20px", fontWeight: 700, background: board, color: chalk, whiteSpace: "nowrap", textDecoration: on ? "underline" : "none", textUnderlineOffset: 3 }}>{f.text}</span>
              </button>
            );
          })}
          {state.note && n < 4 ? <div style={{ ...tiny, left: bx + 12, top: boardB - 20, width: boardW - 24, textAlign: "right", fontStyle: "italic", color: chalk, background: board }}>{state.note}</div> : null}
          {slot ? (
            <div style={{ ...tiny, left: calX - 21, top: tableY - 30 + calDrop, width: 42, fontSize: 11, lineHeight: "13px", fontWeight: 700, color: dark ? c.card : c.text, background: p.paper }}>
              <div style={ell}>{slot.day}</div>
              <div style={ell}>{fitText(slot.time, 40, { size: 11, min: 8, weight: 700 }).text}</div>
            </div>
          ) : null}
          {[
            { u: state.host, x: hx },
            { u: state.guest, x: gx },
          ].map((s, i) =>
            s.u ? (
              <div key={i} style={{ position: "absolute", left: s.x - 22, top: tableY - 100, width: 44, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ display: "flex", borderRadius: 99, boxShadow: `0 0 0 3px ${c.wash}` }}>
                  <Avatar user={s.u} size={40} />
                </span>
              </div>
            ) : null,
          )}
          <div style={{ ...tiny, left: 8, top: tableY + 14, width: W / 2 - 46, color: c.text, background: floor }}>{state.hostOrder}</div>
          <div style={{ ...tiny, left: W / 2 + 38, top: tableY + 14, width: W / 2 - 46, color: c.text, background: floor }}>{state.passed ? "saved for later" : slot ? state.guestOrder : "empty for now"}</div>
          {local.bursts > 0 && slot ? <Burst key={local.bursts} emoji="☕" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {slot ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail={`${state.place} · on both calendars`}>{label(slot)}</Locked>
              </div>
              {mine ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "undo" })}>
                  Change
                </Button>
              ) : null}
            </>
          ) : state.passed ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{mine ? "No rush · your seat stays saved" : `${state.guestName} can't this week · the seat's saved`}</span>
              {mine ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "undo" })}>
                  Pick after all
                </Button>
              ) : null}
            </>
          ) : mine ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>Tap a time on the board</span>
              <Button kind="secondary" onClick={() => dispatch({ t: "pass" })}>
                Not this week
              </Button>
            </>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{`Your cup's ready · waiting on ${nameOf(state.guest, state.guestName)}, no rush`}</span>
          )}
        </div>
      </div>
    );
  },
});
