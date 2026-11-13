import { defineApp, Avatar, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, spring, springs, tween } from "@muse/app";

// Signup board: a volunteer day as jobs by shifts. Every cell has a few seats that fill with
// faces; tap a cell with room and you drop into it and get your shift ticket. One slot each.

type Icon = "cart" | "clipboard" | "water" | "elevator";
type Params = {
  title: string;
  group: string;
  date: string;
  meet: string;
  shifts: string[];
  roles: { label: string; icon: Icon; cap: number; others: string[][] }[];
  people: { name: string; role: string; shift: string }[];
};

// @params
const P: Params = {
  title: "Move-in day signups", group: "Unit 2 Volunteers", date: "Sat, Aug 23", meet: "Unit 2 lobby",
  shifts: ["8–10am", "10–12", "12–2pm"],
  roles: [
    { label: "Cart crew", icon: "cart", cap: 4, others: [["Sam"], ["Leo", "Kev"], ["Ana"]] },
    { label: "Check-in", icon: "clipboard", cap: 2, others: [["Jess"], ["Marco"], ["Eli"]] },
    { label: "Water", icon: "water", cap: 2, others: [["Dani"], ["Zoe"], ["Omar"]] },
    { label: "Elevators", icon: "elevator", cap: 3, others: [["Ben", "Ivy"], ["Kim"], ["Raf", "Hana", "Gus"]] },
  ],
  people: [
    { name: "Maya", role: "Cart crew", shift: "8–10am" }, { name: "Dev", role: "Cart crew", shift: "8–10am" },
    { name: "Theo", role: "Cart crew", shift: "8–10am" }, { name: "Priya", role: "Check-in", shift: "8–10am" },
    { name: "Noa", role: "Water", shift: "10–12" },
  ],
};
// @end params

type Role = { label: string; icon: Icon; cap: number; others: string[][] };
type Claim = { user: string; r: number; c: number; at: number };
type State = { title: string; group: string; date: string; meet: string; shifts: string[]; roles: Role[]; claims: Claim[] };
type Action = { t: "claim"; r: number; c: number } | { t: "leave" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const ICONS: Icon[] = ["cart", "clipboard", "water", "elevator"];
const POP = spring(springs.ios);
const RISE = tween({ duration: 450, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const room = (s: State, r: number, c: number) => s.roles[r]!.cap - s.roles[r]!.others[c]!.length - s.claims.filter((x) => x.r === r && x.c === c).length;
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v < hi;
const totals = (s: State) => {
  const cap = s.roles.reduce((n, r) => n + r.cap * s.shifts.length, 0);
  const open = s.roles.reduce((n, _r, i) => n + s.shifts.reduce((m, _c, j) => m + Math.max(0, room(s, i, j)), 0), 0);
  return { cap, filled: cap - open };
};
const needy = (s: State) => s.roles.reduce((n, _r, i) => n + s.shifts.filter((_c, j) => room(s, i, j) > 0).length, 0);
const stable = (s: State) => JSON.stringify([s.roles, s.shifts, s.title, s.date, s.meet]);

export default defineApp<State, Action, Local>({
  name: "Signup board",
  summary: (s) => {
    const { cap, filled } = totals(s);
    const n = needy(s);
    return `${s.title}: ${filled} of ${cap} slots filled` + (n ? `, ${n} shifts still need people` : ", every shift is covered");
  },

  init: (ctx) => {
    const shifts = P.shifts.map((x) => clean(x, 12)).filter(Boolean).slice(0, 3);
    if (!shifts.length) shifts.push("Any time");
    let roles: Role[] = P.roles
      .filter((r) => clean(r.label, 16))
      .slice(0, 4)
      .map((r, i) => {
        const cap = Number.isInteger(r.cap) ? Math.max(1, Math.min(4, r.cap)) : 2;
        return {
          label: clean(r.label, 16),
          icon: ICONS.includes(r.icon) ? r.icon : ICONS[i]!,
          cap,
          others: shifts.map((_s, c) => (r.others?.[c] ?? []).map((n) => clean(n, 12)).filter(Boolean).slice(0, cap)),
        };
      });
    if (!roles.length) roles = [{ label: "Helpers", icon: "clipboard", cap: 4, others: shifts.map(() => []) }];
    const s: State = { title: clean(P.title, 40) || "Signups", group: clean(P.group, 40), date: clean(P.date, 20), meet: clean(P.meet, 30), shifts, roles, claims: [] };
    const claims: Claim[] = [];
    for (const p of P.people) {
      const want = clean(p.name, 40).toLowerCase();
      const m = ctx.members.find((x) => x.id === p.name || (x.name ?? "").toLowerCase() === want);
      const r = s.roles.findIndex((x) => x.label.toLowerCase() === clean(p.role, 16).toLowerCase());
      const c = s.shifts.findIndex((x) => x.toLowerCase() === clean(p.shift, 12).toLowerCase());
      if (!m || r < 0 || c < 0 || claims.some((x) => x.user === m.id)) continue;
      if (room({ ...s, claims }, r, c) <= 0) continue;
      claims.push({ user: m.id, r, c, at: 0 });
    }
    return { ...s, claims };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "claim") {
      if (!isInt(a.r, 0, s.roles.length) || !isInt(a.c, 0, s.shifts.length)) return s;
      const old = s.claims.find((x) => x.user === m.user);
      if ((old && old.r === a.r && old.c === a.c) || room(s, a.r, a.c) <= 0) return s;
      return { ...s, claims: [...s.claims.filter((x) => x.user !== m.user), { user: m.user, r: a.r, c: a.c, at: m.time }] };
    }
    if (a.t === "leave") {
      if (!s.claims.some((x) => x.user === m.user)) return s;
      return { ...s, claims: s.claims.filter((x) => x.user !== m.user) };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.claims.every((x) => inChat(ctx, x.user)) ? s : { ...s, claims: s.claims.filter((x) => inChat(ctx, x.user)) }),

  invariants: {
    "no cell over its cap": (s) => s.roles.every((_r, i) => s.shifts.every((_c, j) => room(s, i, j) >= 0)),
    "one slot per person": (s) => new Set(s.claims.map((x) => x.user)).size === s.claims.length,
    "claims are by chat members at real cells": (s, ctx) => s.claims.every((x) => inChat(ctx, x.user) && isInt(x.r, 0, s.roles.length) && isInt(x.c, 0, s.shifts.length)),
    "board shape holds": (s) => s.roles.every((r) => r.others.length === s.shifts.length && r.cap >= 1 && r.cap <= 4 && r.others.every((o) => o.length <= r.cap)),
  },

  transitions: {
    "a claim seats the actor in a cell that had room and moves no one else": (p, n, a, m, ctx) => {
      if (a.t !== "claim") return true;
      if (p === n) return !inChat(ctx, m.user) || !isInt(a.r, 0, p.roles.length) || !isInt(a.c, 0, p.shifts.length) || room(p, a.r, a.c) <= 0 || p.claims.some((x) => x.user === m.user && x.r === a.r && x.c === a.c);
      const last = n.claims.at(-1);
      const rest = (x: State) => JSON.stringify(x.claims.filter((c) => c.user !== m.user));
      return room(p, a.r, a.c) > 0 && !!last && last.user === m.user && last.r === a.r && last.c === a.c && last.at === m.time && rest(p) === rest(n) && n.claims.filter((c) => c.user === m.user).length === 1;
    },
    "leaving frees only the actor's slot": (p, n, a, m, ctx) =>
      a.t !== "leave" || (p === n ? !inChat(ctx, m.user) || !p.claims.some((x) => x.user === m.user) : p.claims.some((x) => x.user === m.user) && !n.claims.some((x) => x.user === m.user) && n.claims.length === p.claims.length - 1),
    "the board never changes": (p, n) => stable(p) === stable(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.8) return { t: "claim", r: r.int(s.roles.length), c: r.int(s.shifts.length) };
    if (k < 0.9) {
      const cells = s.roles.flatMap((_r, i) => s.shifts.map((_c, j) => [i, j] as const));
      const from = r.int(cells.length);
      for (let i = 0; i < cells.length; i++) {
        const [ri, ci] = cells[(from + i) % cells.length]!;
        if (room(s, ri, ci) > 0) return { t: "claim", r: ri, c: ci };
      }
    }
    return { t: "leave" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const { cap, filled } = totals(state);
    const W = Math.min(innerWidth(), theme.width - 24);
    const lw = theme.width < 360 ? 84 : 94;
    const n = state.shifts.length;
    const cw = (W - lw) / n;
    const mine = state.claims.find((x) => x.user === me);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const iconCols = [c.series1, c.series4, c.series3, c.series2];
    const anyRoom = state.roles.some((_r, i) => state.shifts.some((_s, j) => room(state, i, j) > 0));
    const chatClaims = state.claims.filter((x) => inChat({ members }, x.user));

    const icon = (kind: Icon, i: number) => {
      const col = iconCols[i % 4]!;
      const dk = mix(col, pal().ink, 0.4);
      const g = (kids: unknown) => (
        <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true" style={{ position: "absolute", left: 5, top: 19 }}>{kids as never}</svg>
      );
      if (kind === "cart")
        return g(
          <>
            <rect x={-5.85} y={-6.3} width={11.7} height={9} rx={2} fill={col} />
            <polyline points="-9,-8.1 -9,4.5 9,4.5" fill="none" stroke={dk} stroke-width={2} />
            <circle cx={-5.4} cy={7.65} r={2.25} fill={dk} />
            <circle cx={5.4} cy={7.65} r={2.25} fill={dk} />
          </>,
        );
      if (kind === "clipboard")
        return g(
          <>
            <rect x={-6.3} y={-8.1} width={12.6} height={16.2} rx={2} fill={col} />
            <rect x={-3.15} y={-9.225} width={6.3} height={3.15} fill={dk} />
            {[-2.7, 0.9, 4.5].map((y) => (
              <line key={y} x1={-3.6} x2={3.6} y1={y} y2={y} stroke={c.card} stroke-width={1.2} />
            ))}
          </>,
        );
      if (kind === "water")
        return g(
          <>
            <circle cx={0} cy={2.25} r={5.85} fill={col} />
            <polygon points="-5.4,0.45 0,-9 5.4,0.45" fill={col} />
          </>,
        );
      return g(
        <>
          <rect x={-6.75} y={-8.55} width={13.5} height={17.1} rx={3} fill={col} />
          <polygon points="-3.15,-1.35 0,-5.4 3.15,-1.35" fill={c.card} />
          <polygon points="-3.15,1.35 3.15,1.35 0,5.4" fill={c.card} />
        </>,
      );
    };

    const cell = (ri: number, ci: number) => {
      const role = state.roles[ri]!;
      const open = room(state, ri, ci);
      const inMine = !!mine && mine.r === ri && mine.c === ci;
      const full = open <= 0;
      const here = state.claims.filter((x) => x.r === ri && x.c === ci);
      const fill = inMine ? c.selected : full ? mix(c.card, c.positive, 0.12) : c.wash;
      const step = role.cap > 1 ? Math.min(20, (cw - 6 - 8 - 18) / (role.cap - 1)) : 0;
      const row = 18 + step * (role.cap - 1);
      const seats = [
        ...role.others[ci]!.map((nm) => ({ key: `g${nm}`, user: { id: `g:${nm}`, name: nm } as string | { id: string; name: string }, at: 0 })),
        ...here.map((x) => ({ key: x.user, user: x.user as string | { id: string; name: string }, at: x.at })),
      ];
      const label = `${role.label} ${state.shifts[ci]}, ${inMine ? "you're in" : full ? "full" : `${open} open`}`;
      return (
        <button
          key={ci}
          aria-label={label}
          aria-disabled={full && !inMine ? "true" : undefined}
          onClick={() => {
            if (inMine) dispatch({ t: "leave" });
            else if (!full) {
              dispatch({ t: "claim", r: ri, c: ci });
              haptic("success");
            }
          }}
          style={{
            position: "relative", boxSizing: "border-box", height: 50, margin: 3, padding: 0, border: 0, borderRadius: 12, background: fill,
            boxShadow: inMine ? `inset 0 0 0 1px ${c.primary}` : "none", cursor: full && !inMine ? "default" : "pointer", font: "inherit", minHeight: 0, minWidth: 0,
          }}
        >
          <span style={{ position: "absolute", top: 5, left: (cw - 6 - row) / 2, width: row, height: 18 }}>
            {Array.from({ length: role.cap }, (_, i) => {
              const sx = i * step;
              const sd = seats[i];
              if (!sd) return <span key={`e${i}`} style={{ position: "absolute", left: sx + 0.5, top: 0.5, width: 17, height: 17, boxSizing: "border-box", borderRadius: 9, border: `1px solid ${c.divider}` }} />;
              const e = sd.at > 0 ? running(sd.at, 400) : null;
              const sc = e === null ? 1 : Math.max(0, POP(e));
              const isClaim = typeof sd.user === "string";
              return (
                <span key={sd.key} style={{ position: "absolute", left: sx, top: 0, width: 18, height: 18, borderRadius: 9, transform: `scale(${sc})`, boxShadow: isClaim ? `0 0 0 2px ${fill}` : "none", display: "block" }}>
                  <Avatar user={sd.user} size={18} />
                </span>
              );
            })}
          </span>
          <span style={{ position: "absolute", left: 0, right: 0, top: 31, textAlign: "center", fontSize: 12, lineHeight: "14px", color: inMine ? c.link : full ? c.positive : c.secondaryText, fontWeight: inMine ? 600 : 400 }}>
            {inMine ? "You're in" : full ? "Full" : `${open} open`}
          </span>
        </button>
      );
    };

    const ticket = () => {
      if (!mine) {
        return (
          <div style={{ height: 64, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {chatClaims.length ? <Facepile users={chatClaims.map((x) => x.user)} max={3} size={22} /> : null}
            <span style={{ fontSize: 14, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {!anyRoom ? "Every shift is covered" : chatClaims.length ? "Tap an open slot to sign up" : "Be the first to sign up"}
            </span>
          </div>
        );
      }
      const role = state.roles[mine.r]!;
      const mates = [...state.claims.filter((x) => x.r === mine.r && x.c === mine.c && x.user !== me).map((x) => nameOf(x.user)), ...role.others[mine.c]!];
      const sub = mates.length ? `with ${mates.slice(0, 3).join(", ")}${mates.length > 3 ? "…" : ""} · meet at ${state.meet}` : `first one here · meet at ${state.meet}`;
      const e = mine.at > 0 ? running(mine.at, 450) : null;
      const p = e === null ? 1 : RISE(e);
      return (
        <div style={{ height: 64, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 4, height: 56, borderRadius: 12, background: c.wash, overflow: "hidden", transform: `translateY(${(1 - p) * 20}px)`, opacity: p }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: c.primary }} />
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ position: "absolute", right: 96 - 1.4, top: 6 + i * 5.6 - 1.4, width: 2.8, height: 2.8, borderRadius: 2, background: c.secondaryText, opacity: 0.6 }} />
            ))}
            <div style={{ position: "absolute", left: 20, right: 108, top: 9, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: "22px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${role.label} · ${state.shifts[mine.c]}`}</div>
              <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
            </div>
            <div style={{ position: "absolute", right: 0, width: 96, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 4px", boxSizing: "border-box" }}>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "17px", color: c.text, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.date}</span>
              <span style={{ fontSize: 13, lineHeight: "17px", color: mix(c.positive, c.text, 0.3) }}>You're on</span>
            </div>
          </div>
        </div>
      );
    };

    const cm = confirmed.claims.find((x) => x.user === me);
    const toast = cm && cm.at > 0 && running(cm.at, 2400) !== null ? cm : null;

    return (
      <div>
        <CardHeader title={state.title} subtitle={[state.group, state.date].filter(Boolean).join(" · ")} />
        <div style={{ display: "flex", alignItems: "center", height: 28 }}>
          <span style={{ fontSize: 15, whiteSpace: "nowrap" }}>
            <b style={{ fontWeight: 600, color: c.text }}>{`${filled} of ${cap}`}</b>
            <span style={{ color: c.secondaryText }}> slots filled</span>
          </span>
          <span style={{ flex: 1, marginLeft: 12, height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
            <span style={{ display: "block", height: 6, borderRadius: 3, background: c.primary, width: `${cap ? (filled / cap) * 100 : 0}%`, transition: "width 400ms" }} />
          </span>
        </div>
        <div style={{ height: 4 }} />
        <div role="group" aria-label="Shifts">
          <div style={{ display: "grid", gridTemplateColumns: `${lw}px repeat(${n}, minmax(0, 1fr))`, height: 22, alignItems: "center" }}>
            <span />
            {state.shifts.map((sh) => (
              <span key={sh} style={{ fontSize: 13, color: c.secondaryText, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sh}</span>
            ))}
          </div>
          {state.roles.map((role, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: `${lw}px repeat(${n}, minmax(0, 1fr))`, height: 56, position: "relative" }}>
              {icon(role.icon, ri)}
              <span style={{ position: "absolute", left: 28, width: lw - 28, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 14, fontWeight: 600, color: c.text }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role.label}</span>
              </span>
              <span />
              {state.shifts.map((_sh, ci) => cell(ri, ci))}
            </div>
          ))}
        </div>
        <div style={{ height: 4 }} />
        {ticket()}
        {toast ? <Toast key={toast.at}>{`You're on · ${state.roles[toast.r]!.label} ${state.shifts[toast.c]}`}</Toast> : null}
      </div>
    );
  },
});
