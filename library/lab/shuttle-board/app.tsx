import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, type Ctx } from "@muse/app";

// Shuttle board: the question asked 31 times ("when does the airport shuttle run before break")
// answered once, as a split-flap departures board pinned to the group. Each run is a row of
// flapping letters: day, time, stop and seats left; the last run blinks. Tap a run and "On it":
// the seat count flaps over and your face joins the riders, so you can see who you're riding with.

type Params = {
  /** Card title */
  title: string;
  /** Group name */
  group: string;
  /** Where the shuttle goes, short: 'BDL airport' */
  to: string;
  /** How many times it was asked in the group */
  asked: number;
  /** Runs from the official schedule, in order. riders: chat members on it by name; outside: riders from outside the chat */
  runs: { day: string; time: string; stop: string; seats: number; outside?: number; riders?: string[]; last?: boolean }[];
  /** What riders said, by name */
  said: { name: string; text: string }[];
};

// @params
const P: Params = {
  title: "Airport shuttle",
  group: "Eastfield Class of '28",
  to: "BDL airport",
  asked: 31,
  runs: [
    { day: "Thu", time: "4:15p", stop: "Larkin Hall", seats: 14, outside: 9 },
    { day: "Fri", time: "10:00a", stop: "The Quad", seats: 14, outside: 14 },
    { day: "Fri", time: "12:10p", stop: "Larkin Hall", seats: 14, outside: 6 },
    { day: "Fri", time: "1:40p", stop: "The Quad", seats: 14, outside: 8, riders: ["Maya", "Tsai Lin"] },
    { day: "Fri", time: "3:40p", stop: "Lot C", seats: 14, outside: 7, riders: ["Calvin", "Arun"], last: true },
  ],
  said: [
    { name: "Maya", text: "flight's 5:50. 1:40 is already in the spreadsheet" },
    { name: "Calvin", text: "setting all seven alarms for this one" },
    { name: "Arun", text: "the rice cooker is coming home with me" },
  ],
};
// @end params

type Run = { day: string; time: string; stop: string; seats: number; outside: number; last: boolean };
type State = { title: string; group: string; to: string; asked: number; runs: Run[]; riders: { [u: string]: number }; at: { [u: string]: number }; said: { [u: string]: string } };
type Action = { t: "ride"; r: number } | { t: "off" };
type Local = { sel: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const taken = (s: State, r: number) => s.runs[r]!.outside + Object.values(s.riders).filter((x) => x === r).length;
const MONO = `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

function initState(ctx: Ctx): State {
  const runs: Run[] = [];
  const riders: { [u: string]: number } = {};
  for (const r of Array.isArray(P.runs) ? P.runs : []) {
    const time = clean(r?.time, 6);
    if (!time || runs.length >= 6) continue;
    const seats = isInt(r.seats, 1, 99) ? r.seats : 14;
    const run: Run = { day: clean(r.day, 3), time, stop: clean(r.stop, 14) || "Stop", seats, outside: isInt(r.outside, 0, seats) ? r.outside : 0, last: r.last === true };
    runs.push(run);
    for (const nm of Array.isArray(r.riders) ? r.riders : []) {
      const m = ctx.members.find((x) => x.id === nm || x.name.toLowerCase() === clean(nm, 40).toLowerCase());
      if (m && riders[m.id] === undefined && run.outside + Object.values(riders).filter((x) => x === runs.length - 1).length < seats) riders[m.id] = runs.length - 1;
    }
  }
  if (!runs.length) runs.push({ day: "", time: "TBD", stop: "Campus", seats: 14, outside: 0, last: true });
  const said: { [u: string]: string } = {};
  for (const q of Array.isArray(P.said) ? P.said : []) {
    const m = ctx.members.find((x) => x.id === q?.name || x.name.toLowerCase() === clean(q?.name, 40).toLowerCase());
    const t = clean(q?.text, 70);
    if (m && t) said[m.id] = t;
  }
  return { title: clean(P.title, 40) || "Shuttle", group: clean(P.group, 40), to: clean(P.to, 20), asked: isInt(P.asked, 0, 9999) ? P.asked : 0, runs, riders, at: {}, said };
}

export default defineApp<State, Action, Local>({
  name: "Shuttle board",
  summary: (s) => {
    const last = s.runs.find((r) => r.last);
    const n = Object.keys(s.riders).length;
    return `${s.title}${s.to ? ` to ${s.to}` : ""} · ${s.runs.length} runs${last ? ` · last ${last.day} ${last.time}` : ""} · ${n} of us riding`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "ride") {
      if (!isInt(a.r, 0, s.runs.length - 1) || s.riders[u] === a.r || taken(s, a.r) >= s.runs[a.r]!.seats) return s;
      return { ...s, riders: { ...s.riders, [u]: a.r }, at: { ...s.at, [u]: m.time } };
    }
    if (a.t === "off") {
      if (s.riders[u] === undefined) return s;
      const riders = { ...s.riders };
      delete riders[u];
      const at = { ...s.at };
      delete at[u];
      return { ...s, riders, at };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (o: { [u: string]: unknown }) => Object.keys(o).every((u) => inChat(ctx, u));
    if (keep(s.riders) && keep(s.at) && keep(s.said)) return s;
    const f = <T,>(o: { [u: string]: T }) => Object.fromEntries(Object.entries(o).filter(([u]) => inChat(ctx, u))) as { [u: string]: T };
    return { ...s, riders: f(s.riders), at: f(s.at), said: f(s.said) };
  },

  invariants: {
    "riders are on real runs": (s) => Object.values(s.riders).every((r) => isInt(r, 0, s.runs.length - 1)),
    "no run is over its seats": (s) => s.runs.every((r, i) => taken(s, i) <= r.seats),
    "riders are in the chat": (s, ctx) => Object.keys(s.riders).every((u) => inChat(ctx, u)),
    "only riders have a time": (s) => Object.keys(s.at).every((u) => s.riders[u] !== undefined),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the schedule never changes": (p, n) => JSON.stringify(p.runs) === JSON.stringify(n.runs),
    "on it moves only the actor to that run": (p, n, a, m) => {
      if (a.t !== "ride" || p === n) return true;
      const others = (s: State) => JSON.stringify(Object.entries(s.riders).filter(([u]) => u !== m.user).sort());
      return n.riders[m.user] === a.r && n.at[m.user] === m.time && others(p) === others(n) && taken(n, a.r) === taken(p, a.r) + 1;
    },
    "an open seat is never refused": (p, n, a, m, ctx) =>
      a.t !== "ride" || p !== n || !(inChat(ctx, m.user) && isInt(a.r, 0, p.runs.length - 1) && p.riders[m.user] !== a.r && taken(p, a.r) < p.runs[a.r]!.seats),
    "getting off removes only the actor": (p, n, a, m, ctx) => {
      if (a.t !== "off") return true;
      if (p === n) return p.riders[m.user] === undefined || !inChat(ctx, m.user);
      return p.riders[m.user] !== undefined && n.riders[m.user] === undefined && Object.keys(n.riders).length === Object.keys(p.riders).length - 1;
    },
  },

  arbitrary: (s, u, r) => (s.riders[u] !== undefined && r.next() < 0.3 ? { t: "off" } : { t: "ride", r: r.int(s.runs.length) }),

  local: { sel: -1 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const runs = state.runs;
    const mine = state.riders[me];
    const lastI = runs.findIndex((r) => r.last);
    const sel = local.sel >= 0 && local.sel < runs.length ? local.sel : mine !== undefined ? mine : lastI >= 0 ? lastI : 0;
    const run = runs[sel]!;
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? "Someone"));

    // Split-flap geometry: columns of letters, one tile each.
    const COLS = [3, 6, 10, 5];
    const total = COLS.reduce((a, b) => a + b, 0);
    const pad = 10;
    const lamp = 12;
    const gapCol = 6;
    const tw = Math.floor(((W - (pad - 4) * 2 - 8 - lamp - gapCol * (COLS.length - 1) - (total - COLS.length) - 2) / total) * 10) / 10;
    const th = Math.round(tw * 1.55);
    const fs = Math.max(10, Math.round(tw * 0.95));
    const board = mix(p.dark, theme.mode === "dark" ? c.wash : p.dark, 0.3);
    const tile = mix(board, c.card, theme.mode === "dark" ? 0.12 : 0.14);
    const amber = mix(p.yellow, p.cream, 0.15);
    const flaps = (txt: string, n: number, key: string, delay: number, color: string, right = false) => {
      const t = txt.toUpperCase().slice(0, n);
      const s = right ? t.padStart(n, " ") : t.padEnd(n, " ");
      return [...s].map((ch, j) => (
        <span key={`${key}${j}${ch}`} class="sb-flap" style={{ position: "relative", width: tw, height: th, borderRadius: 2, background: tile, color, fontFamily: MONO, fontSize: fs, fontWeight: 700, lineHeight: `${th}px`, textAlign: "center", animationDelay: `${delay + j * 35}ms`, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: th / 2 - 0.5, height: 1, background: mix(board, tile, 0.5) }} />
          <span style={{ position: "relative" }}>{ch === " " ? " " : ch}</span>
        </span>
      ));
    };

    const rows = runs.map((r, i) => {
      const n = taken(state, i);
      const left = r.seats - n;
      const full = left <= 0;
      const isSel = i === sel;
      const mineRow = mine === i;
      const lampCol = full ? c.negative : r.last ? p.yellow : c.positive;
      return (
        <button key={i} type="button" aria-label={`${r.day} ${r.time} from ${r.stop}, ${full ? "full" : `${left} seats left`}${r.last ? ", last run" : ""}`} aria-pressed={isSel ? "true" : "false"}
          onClick={() => { setLocal({ sel: i }); haptic("light"); }}
          style={{ display: "flex", alignItems: "center", gap: 0, width: "100%", minHeight: 44, height: Math.max(44, th + 10), padding: "0 4px", border: 0, borderRadius: 6, background: isSel ? mix(board, c.primary, 0.32) : "transparent", cursor: "pointer", boxSizing: "border-box" }}>
          <span class={r.last && !full ? "sb-blink" : ""} style={{ width: 8, height: 8, borderRadius: 4, background: lampCol, marginRight: lamp - 4, flexShrink: 0 }} />
          <span style={{ display: "flex", gap: 1 }}>{flaps(r.day, COLS[0]!, `d${i}`, i * 90, amber)}</span>
          <span style={{ width: gapCol, flexShrink: 0 }} />
          <span style={{ display: "flex", gap: 1 }}>{flaps(r.time, COLS[1]!, `t${i}`, i * 90 + 100, amber, true)}</span>
          <span style={{ width: gapCol, flexShrink: 0 }} />
          <span style={{ display: "flex", gap: 1 }}>{flaps(r.stop, COLS[2]!, `s${i}`, i * 90 + 200, mineRow ? p.cream : amber)}</span>
          <span style={{ width: gapCol, flexShrink: 0 }} />
          <span style={{ display: "flex", gap: 1 }}>{flaps(full ? "Full" : `${left}`, COLS[3]!, `n${i}`, i * 90 + 300, full ? mix(c.negative, p.cream, 0.62) : p.cream, true)}</span>
        </button>
      );
    });

    const head = (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 2px", minWidth: 0 }}>
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M1.5 9.5 L14.5 4 L13 6.5 L6 9.5 L4.5 13 L3.5 13 L4 10 Z" fill={amber} />
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: amber, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Departures${state.to ? ` · ${state.to}` : ""}`}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: p.cream, textTransform: "uppercase", whiteSpace: "nowrap" }}>Seats</span>
      </div>
    );

    const riders = members.filter((m) => state.riders[m.id] === sel).map((m) => m.id);
    const ridersLine = riders.length
      ? `${riders.slice(0, 2).map(nameOf).join(", ")}${riders.length - Math.min(2, riders.length) + run.outside ? ` + ${riders.length - Math.min(2, riders.length) + run.outside} more` : ""}`
      : run.outside ? `${run.outside} others riding · nobody from here yet` : "Nobody's on this one yet";
    const left = run.seats - taken(state, sel);
    let act;
    if (mine === sel) act = <Button kind="deemphasized" onClick={() => dispatch({ t: "off" })}>Not riding</Button>;
    else if (left <= 0) act = <span style={{ fontSize: 14, fontWeight: 600, color: c.secondaryText, whiteSpace: "nowrap" }}>Full</span>;
    else act = <Button kind="primary" onClick={() => { dispatch({ t: "ride", r: sel }); haptic("success"); }}>{mine !== undefined ? "Switch to this" : "On it"}</Button>;

    const quoted = [...riders].reverse().find((u) => state.said[u] && u !== me);
    const allRiders = members.filter((m) => state.riders[m.id] !== undefined).map((m) => m.id);
    const myAt = confirmed.at[me] ?? 0;
    const toast = myAt > 0 && running(myAt, 2400) !== null && confirmed.riders[me] !== undefined ? myAt : null;
    const myRun = confirmed.riders[me] !== undefined ? state.runs[confirmed.riders[me]!] : undefined;

    return (
      <div>
        <style>{".sb-flap{display:inline-block;animation:sbFlap .42s cubic-bezier(.3,1.4,.6,1) both;transform-origin:50% 50%}@keyframes sbFlap{0%{transform:rotateX(90deg);filter:brightness(1.6)}60%{transform:rotateX(-20deg)}100%{transform:rotateX(0)}}.sb-blink{animation:sbBlink 1s steps(2,end) infinite}@keyframes sbBlink{50%{filter:brightness(.45)}}@media (prefers-reduced-motion:reduce){.sb-flap,.sb-blink{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.group, state.asked ? `asked ${state.asked} times` : ""].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div role="group" aria-label={`Departures board, ${runs.length} runs`} style={{ background: board, borderRadius: 12, padding: `${pad - 2}px ${pad - 4}px`, boxShadow: `inset 0 0 0 3px ${mix(board, c.text, 0.12)}` }}>
          {head}
          {rows}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, minHeight: 46, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {`${run.day} ${run.time} · ${run.stop}${run.last ? " · last one" : ""}`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: 2 }}>
              {riders.length ? <Facepile users={riders} max={3} size={18} /> : null}
              <span style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{ridersLine}</span>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>{act}</div>
        </div>
        <div style={{ display: W < 340 ? "none" : "flex", alignItems: "center", gap: 8, height: 26, marginTop: 2, minWidth: 0 }}>
          {quoted ? <Avatar user={quoted} size={18} /> : allRiders.length ? <Facepile users={allRiders} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${nameOf(quoted)}: "${state.said[quoted]}"` : allRiders.length ? `${allRiders.length} of us riding · tap a run to see who` : "Tap a run, then say you're on it"}
          </span>
        </div>
        {toast && myRun ? <Toast key={toast}>{`You're on the ${myRun.day} ${myRun.time} from ${myRun.stop}`}</Toast> : null}
      </div>
    );
  },
});
