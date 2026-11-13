import {
  defineApp,
  Avatar,
  Button,
  clock,
  fitText,
  haptic,
  mix,
  running,
  textWidth,
  tween,
  type Ctx,
  type Theme,
} from "@muse/app";

// Beat my time: a friend dares the chat to stop a stopwatch at 10.00. The readout goes blind at
// 3 seconds, so it is all feel. Beat their miss and you hop past them on the ladder, then send
// it back or take on the next rung up. The run itself is local; only the result is shared.

type Params = {
  /** Ladder name: "Unit 7 ladder" */
  title: string;
  /** Who sent the dare (a ladder name): "Jalen" */
  from: string;
  /** When it was sent: "2h ago" */
  when: string;
  /** Names who already tried today */
  tried: string[];
  /** Top to bottom, up to 8. cs is the time in hundredths of a second, 0 for none. */
  ladder: { name: string; cs: number; w: number; l: number; note: string }[];
  /** Rank index (0-based) where chat members who are not on the ladder are slotted */
  joinAt: number;
};

// @params
const P: Params = {
  title: "Unit 7 ladder",
  from: "Jalen",
  when: "2h ago",
  tried: ["Sam", "Theo"],
  joinAt: 3,
  ladder: [
    { name: "Maya", cs: 999, w: 4, l: 0, note: "the final boss" },
    { name: "Priya", cs: 1004, w: 2, l: 2, note: "you're up next" },
    { name: "Jalen", cs: 987, w: 3, l: 5, note: "2h ago" },
    { name: "Sam", cs: 1031, w: 1, l: 3, note: "" },
    { name: "Theo", cs: 958, w: 0, l: 2, note: "" },
  ],
};
// @end params

/** id: a member id, or "o:<name>" for someone outside the chat (a score only; they never act). cs: posted time, 0 = none. */
type Entry = { id: string; name: string; cs: number; w: number; l: number; note: string };
/** vs "" = a first time with no one to beat. from and to: the player's ladder index before and after. sent: meta.time or 0. */
type Try = { id: string; by: string; vs: string; cs: number; vsCs: number; won: 1 | 0 | -1; from: number; to: number; at: number; sent: number };
type State = { title: string; from: string; when: string; tried: string[]; ladder: Entry[]; tries: Try[] };
type Action = { t: "play"; vs: string; cs: number } | { t: "send"; id: string };
/** vs: the opponent picked in this view ("" = automatic); run: clock ms at Start (0 idle); showing: the result is open. */
type Local = { vs: string; run: number; showing: boolean };

const TARGET = 1000;
const BLIND = 3000;
const MAX_CS = 6000;
const MAX_TRIES = 30;
const MAX_ROWS = 8;
const CLIMB = 1400;
const slide = tween({ duration: 700, easing: "decelerate" });

const err = (cs: number) => Math.abs(cs - TARGET);
const fmt = (cs: number) => (cs / 100).toFixed(2).padStart(5, "0");
const off = (cs: number) => (err(cs) / 100).toFixed(2);
const verdict = (cs: number, vsCs: number) => Math.sign(err(vsCs) - err(cs));
/** Server-aligned now. The clock signal only advances while something reads it, so a tap after a quiet spell would stamp a stale time: ask `running` (which checks the live time) to narrow it down. */
function freshNow(): number {
  let lo = clock.value - 1;
  let hi = lo + 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (running(mid, 1) === null) lo = mid;
    else hi = mid;
  }
  return hi;
}
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const whole = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : 0);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idxOf = (s: State, id: string) => s.ladder.findIndex((e) => e.id === id);
const easeOut = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
const triedLine = (names: string[]) =>
  names.length === 0
    ? "Nobody has tried yet"
    : names.length === 1
      ? `${names[0]} tried today`
      : names.length === 2
        ? `${names[0]} and ${names[1]} tried today`
        : names.length === 3
          ? `${names[0]}, ${names[1]} and ${names[2]} tried today`
          : `${names[0]}, ${names[1]} and ${names.length - 2} others tried today`;

function initState(ctx: Ctx): State {
  const ladder: Entry[] = [];
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const raw of Array.isArray(P.ladder) ? P.ladder : []) {
    if (ladder.length >= MAX_ROWS || !raw || typeof raw !== "object") continue;
    const name = clean(raw.name, 16);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const want = name.toLowerCase();
    const m = ctx.members.find((x) => !used.has(x.id) && (x.id === name || (x.name ?? "").trim().toLowerCase() === want));
    if (m) used.add(m.id);
    ladder.push({
      id: m ? m.id : `o:${name}`,
      name: m ? m.name : name,
      cs: whole(raw.cs, MAX_CS),
      w: whole(raw.w, 999),
      l: whole(raw.l, 999),
      note: clean(raw.note, 24),
    });
  }
  const at = Math.min(Math.max(Number.isInteger(P.joinAt) ? P.joinAt : ladder.length, 0), ladder.length);
  const joined: Entry[] = ctx.members.filter((m) => !used.has(m.id)).map((m) => ({ id: m.id, name: m.name, cs: 0, w: 0, l: 0, note: "" }));
  ladder.splice(at, 0, ...joined);
  const byName = (n: unknown) => {
    const want = clean(n, 16).toLowerCase();
    return want ? ladder.find((e) => e.name.toLowerCase() === want || e.id === n) : undefined;
  };
  const tried: string[] = [];
  for (const n of Array.isArray(P.tried) ? P.tried : []) {
    const e = byName(n);
    if (e && !tried.includes(e.id)) tried.push(e.id);
  }
  return { title: clean(P.title, 32) || "Ladder", from: byName(P.from)?.id ?? "", when: clean(P.when, 16), tried, ladder, tries: [] };
}

// ---- small drawings ----

const BOLT = "M2.4 -6 L-2.8 0.8 L-0.4 0.8 L-2 6 L3 -1 L0.4 -1 Z";
function Bolt(p: { size: number; fill: string; style?: Record<string, string | number> }) {
  const s = p.size;
  return (
    <svg width={s * 2} height={s * 2} viewBox="-6 -6.5 12 13" aria-hidden="true" style={{ flex: "none", display: "block", ...p.style }}>
      <path d={BOLT} fill={p.fill} />
    </svg>
  );
}
function Trophy(p: { size: number; fill: string }) {
  const s = p.size;
  return (
    <svg width={s * 2} height={s * 2} viewBox="-5 -5 10 10" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <path d="M-3.6 -3.2 H3.6 A3.6 4.6 0 0 1 -3.6 -3.2 Z" fill={p.fill} />
      <rect x="-0.5" y="1" width="1" height="2.2" fill={p.fill} />
      <rect x="-2" y="3" width="4" height="1.3" fill={p.fill} />
    </svg>
  );
}

function Dial(p: { gw: number; theme: Theme; hand: number | null; blind: boolean }) {
  const c = p.theme.color;
  const cx = p.gw / 2, cy = 78, r = 50;
  const wedge: string[] = [`${cx},${cy}`];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 - 0.12 + (i / 8) * 0.24;
    wedge.push(`${(cx + Math.cos(a) * 48).toFixed(2)},${(cy + Math.sin(a) * 48).toFixed(2)}`);
  }
  let long = "", short = "";
  for (let i = 0; i < 50; i++) {
    const a = -Math.PI / 2 + (i / 50) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 40 : 45;
    const seg = `M${(cx + Math.cos(a) * r0).toFixed(2)} ${(cy + Math.sin(a) * r0).toFixed(2)}L${(cx + Math.cos(a) * 48).toFixed(2)} ${(cy + Math.sin(a) * 48).toFixed(2)}`;
    if (i % 5 === 0) long += seg;
    else short += seg;
  }
  const ha = p.hand === null ? 0 : -Math.PI / 2 + (p.hand / 10) * Math.PI * 2;
  const dx = Math.cos(ha), dy = Math.sin(ha);
  return (
    <svg width={p.gw} height={240} viewBox={`0 0 ${p.gw} 240`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
      <rect x={cx - 8} y={cy - 61} width="16" height="8" rx="3" fill={c.text} />
      <rect x={cx - 12} y={cy - 65} width="24" height="6" rx="3" fill={c.primary} />
      <circle cx={cx + Math.cos(0.8) * 54} cy={cy - Math.sin(0.8) * 54} r="5" fill={c.text} />
      <circle cx={cx} cy={cy + 3} r="54" fill={c.text} opacity="0.12" />
      <circle cx={cx} cy={cy} r="54" fill={c.text} />
      <circle cx={cx} cy={cy} r={r} fill={c.wash} />
      <polygon points={wedge.join(" ")} fill={c.primary} opacity="0.35" />
      <path d={long} stroke={c.text} stroke-width="2" opacity="0.7" fill="none" />
      <path d={short} stroke={c.text} stroke-width="1" opacity="0.35" fill="none" />
      {p.blind ? (
        <g>
          <circle cx={cx} cy={cy} r="38" fill={c.secondaryText} opacity="0.12" />
          <text x={cx} y={cy - 2} text-anchor="middle" dominant-baseline="central" font-size="30" font-weight="800" fill={c.secondaryText} font-family={p.theme.type.family}>
            ?
          </text>
        </g>
      ) : (
        <line
          x1={cx - dx * 10}
          y1={cy - dy * 10}
          x2={cx + dx * 42}
          y2={cy + dy * 42}
          stroke={c.primary}
          stroke-width="2.5"
          stroke-linecap="round"
        />
      )}
      <circle cx={cx} cy={cy} r="4.5" fill={c.text} />
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Beat my time",
  summary: (s, ctx) => {
    const name = (id: string) => s.ladder.find((e) => e.id === id)?.name ?? ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const last = s.tries[s.tries.length - 1];
    if (!last) {
      const f = s.ladder.find((e) => e.id === s.from);
      return f && f.cs > 0 ? `${s.title}: ${f.name}'s ${fmt(f.cs)} to beat` : `${s.title}: set a time to beat`;
    }
    const lead = s.ladder[0]?.name ?? "Nobody";
    if (!last.vs) return `${s.title}: ${name(last.by)} set ${fmt(last.cs)} · ${lead} leads`;
    return `${s.title}: ${name(last.by)} ${fmt(last.cs)} vs ${name(last.vs)} · ${last.won === 1 ? "won" : last.won === 0 ? "tie" : "lost"} · ${lead} leads`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const from = idxOf(s, m.user);
    if (from < 0) return s;
    if (a.t === "play") {
      if (typeof a.vs !== "string" || !Number.isInteger(a.cs) || a.cs < 1 || a.cs > MAX_CS) return s;
      const vsE = a.vs === "" ? undefined : s.ladder.find((e) => e.id === a.vs);
      if (a.vs === "" ? s.ladder.some((e) => e.id !== m.user && e.cs > 0) : !vsE || vsE.id === m.user || vsE.cs <= 0) return s;
      const won = vsE ? verdict(a.cs, vsE.cs) : 0;
      let ladder = s.ladder.map((e) =>
        e.id === m.user
          ? { ...e, cs: a.cs, w: e.w + (won === 1 ? 1 : 0), l: e.l + (won === -1 ? 1 : 0) }
          : vsE && e.id === vsE.id
            ? { ...e, w: e.w + (won === -1 ? 1 : 0), l: e.l + (won === 1 ? 1 : 0) }
            : e,
      );
      let to = from;
      if (won === 1 && vsE) {
        const at = idxOf(s, vsE.id);
        if (at < from) {
          const me = ladder[from]!;
          ladder = [...ladder.slice(0, from), ...ladder.slice(from + 1)];
          ladder.splice(at, 0, me);
          to = at;
        }
      }
      const t: Try = { id: `t${m.seq}`, by: m.user, vs: a.vs, cs: a.cs, vsCs: vsE ? vsE.cs : 0, won: won as 1 | 0 | -1, from, to, at: m.time, sent: 0 };
      return {
        ...s,
        ladder,
        tries: [...s.tries, t].slice(-MAX_TRIES),
        tried: s.tried.includes(m.user) ? s.tried : [...s.tried, m.user],
      };
    }
    if (a.t === "send") {
      if (!s.tries.some((t) => t.id === a.id && t.by === m.user && t.sent === 0)) return s;
      return { ...s, tries: s.tries.map((t) => (t.id === a.id ? { ...t, sent: Math.max(m.time, t.at) } : t)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = new Set(s.ladder.filter((e) => !e.id.startsWith("o:") && !inChat(ctx, e.id)).map((e) => e.id));
    const fresh = ctx.members.filter((m) => !s.ladder.some((e) => e.id === m.id));
    if (gone.size === 0 && fresh.length === 0) return s;
    const ladder = [
      ...s.ladder.filter((e) => !gone.has(e.id)),
      ...fresh.map((m) => ({ id: m.id, name: m.name, cs: 0, w: 0, l: 0, note: "" })),
    ];
    // A try against someone who left keeps the player's time but loses the opponent.
    const tries = s.tries
      .filter((t) => !gone.has(t.by))
      .map((t) => (gone.has(t.vs) ? { ...t, vs: "", vsCs: 0, won: 0 as const } : t));
    return {
      ...s,
      ladder,
      tries,
      tried: s.tried.filter((id) => !gone.has(id)),
      from: gone.has(s.from) ? "" : s.from,
    };
  },

  invariants: {
    "ladder ids are unique": (s) => new Set(s.ladder.map((e) => e.id)).size === s.ladder.length,
    "everyone in the chat is on the ladder": (s, ctx) => ctx.members.every((m) => s.ladder.some((e) => e.id === m.id)),
    "only outsiders are not in the chat": (s, ctx) => s.ladder.every((e) => e.id.startsWith("o:") || inChat(ctx, e.id)),
    "times and records are whole": (s) =>
      s.ladder.every((e) => Number.isInteger(e.cs) && e.cs >= 0 && e.cs <= MAX_CS && Number.isInteger(e.w) && e.w >= 0 && Number.isInteger(e.l) && e.l >= 0),
    "tries point at the ladder": (s) => {
      const ids = new Set(s.ladder.map((e) => e.id));
      return (
        s.tries.length <= MAX_TRIES &&
        new Set(s.tries.map((t) => t.id)).size === s.tries.length &&
        s.tries.every((t) => ids.has(t.by) && !t.by.startsWith("o:") && (t.vs === "" || ids.has(t.vs)) && t.by !== t.vs)
      );
    },
    "a try's verdict matches the times": (s) => s.tries.every((t) => t.won === (t.vs ? Math.sign(err(t.vsCs) - err(t.cs)) : 0)),
    "a posted time is the player's latest try": (s) => {
      const last: Record<string, number> = {};
      for (const t of s.tries) last[t.by] = t.cs;
      return s.ladder.every((e) => last[e.id] === undefined || last[e.id] === e.cs);
    },
    "sent after played": (s) => s.tries.every((t) => t.sent === 0 || t.sent >= t.at),
    "tried is ladder people once": (s) => new Set(s.tried).size === s.tried.length && s.tried.every((id) => s.ladder.some((e) => e.id === id)),
  },

  transitions: {
    "a play adds one try by the actor, now": (p, n, a, m) => {
      if (a.t !== "play" || p === n) return true;
      const t = n.tries[n.tries.length - 1];
      return !!t && t.id === `t${m.seq}` && t.by === m.user && t.cs === a.cs && t.at === m.time && t.sent === 0;
    },
    "you can't play yourself or someone without a time": (p, n, a, m) => {
      if (a.t !== "play" || p === n) return true;
      if (a.vs === "") return p.ladder.every((e) => e.id === m.user || e.cs === 0);
      const v = p.ladder.find((e) => e.id === a.vs);
      return a.vs !== m.user && !!v && v.cs > 0;
    },
    "a win lifts you to the rung you beat; anything else moves no one": (p, n, a, m) => {
      if (a.t !== "play" || p === n) return true;
      const ids = p.ladder.map((e) => e.id);
      const from = ids.indexOf(m.user);
      const vi = ids.indexOf(a.vs);
      const won = vi >= 0 ? Math.sign(err(p.ladder[vi]!.cs) - err(a.cs)) : 0;
      const want = [...ids];
      if (won === 1 && vi < from) {
        want.splice(from, 1);
        want.splice(vi, 0, m.user);
      }
      return JSON.stringify(want) === JSON.stringify(n.ladder.map((e) => e.id));
    },
    "one win and one loss per decided play": (p, n, a, m) => {
      if (a.t !== "play" || p === n) return true;
      const v = p.ladder.find((e) => e.id === a.vs);
      const won = v ? Math.sign(err(v.cs) - err(a.cs)) : 0;
      const sum = (s: State, k: "w" | "l") => s.ladder.reduce((x, e) => x + e[k], 0);
      const dw = sum(n, "w") - sum(p, "w"), dl = sum(n, "l") - sum(p, "l");
      const only = n.ladder.every((e) => {
        const o = p.ladder.find((x) => x.id === e.id);
        return !!o && (e.id === m.user || (v && e.id === v.id) ? true : o.w === e.w && o.l === e.l);
      });
      return only && (won !== 0 && v ? dw === 1 && dl === 1 : dw === 0 && dl === 0);
    },
    "only the actor's time changes": (p, n, a, m) =>
      p === n || n.ladder.every((e) => (a.t === "play" && e.id === m.user) || p.ladder.find((x) => x.id === e.id)?.cs === e.cs),
    "sending marks only your own try, once": (p, n, a, m) =>
      n.tries.every((t) => {
        const o = p.tries.find((x) => x.id === t.id);
        return !o || t.sent === o.sent || (o.sent === 0 && a.t === "send" && a.id === t.id && t.by === m.user && t.sent === Math.max(m.time, o.at));
      }),
    "tries only grow at the end": (p, n, a) => {
      if (p === n) return true;
      if (a.t === "send") return JSON.stringify(n.tries.map((t) => t.id)) === JSON.stringify(p.tries.map((t) => t.id));
      const kept = p.tries.slice(Math.max(0, p.tries.length + 1 - MAX_TRIES)).map((t) => t.id);
      return JSON.stringify(n.tries.slice(0, -1).map((t) => t.id)) === JSON.stringify(kept);
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (idxOf(s, user) < 0) return { t: "play", vs: "", cs: TARGET };
    const unsent = s.tries.filter((t) => t.by === user && t.sent === 0);
    if (r.next() < 0.2 && unsent.length) return { t: "send", id: unsent[unsent.length - 1]!.id };
    const others = s.ladder.filter((e) => e.id !== user && e.cs > 0);
    return { t: "play", vs: others.length ? r.pick(others).id : "", cs: r.next() < 0.05 ? TARGET : 900 + r.int(200) };
  },

  local: { vs: "", run: 0, showing: false },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const gw = W - 132;
    const n = s.ladder.length;
    const myI = idxOf(s, me);
    const mine = myI >= 0 ? s.ladder[myI]! : null;
    const entry = (id: string) => s.ladder.find((e) => e.id === id);
    const face = (e: Entry) => (members.some((m) => m.id === e.id) ? e.id : { id: e.id, name: e.name });
    const myTries = s.tries.filter((t) => t.by === me);
    const myTry = myTries[myTries.length - 1];
    const result = local.showing && !!myTry && local.run === 0 ? myTry : null;

    // who the viewer is up against
    const lastSent = [...s.tries].reverse().find((t) => t.sent > 0 && t.vs === me);
    const valid = (id: string) => {
      const e = entry(id);
      return !!e && e.id !== me && e.cs > 0 ? e : undefined;
    };
    let opp: Entry | undefined;
    let why: "chosen" | "sent" | "from" | "near" | "none" = "none";
    if (result) {
      opp = result.vs ? entry(result.vs) : undefined;
      why = !opp ? "none" : s.from === opp.id ? "from" : lastSent && lastSent.by === opp.id ? "sent" : local.vs === opp.id ? "chosen" : "near";
    } else if (local.vs && valid(local.vs)) {
      opp = valid(local.vs);
      why = "chosen";
    } else if (lastSent && valid(lastSent.by)) {
      opp = valid(lastSent.by);
      why = "sent";
    } else if (s.from && valid(s.from)) {
      opp = valid(s.from);
      why = "from";
    } else {
      let up: Entry | undefined;
      for (let i = myI - 1; i >= 0 && !up; i--) if (s.ladder[i]!.cs > 0) up = s.ladder[i];
      let down: Entry | undefined;
      for (let i = myI + 1; i < n && !down; i++) if (s.ladder[i]!.cs > 0) down = s.ladder[i];
      opp = up ?? down;
      why = opp ? "near" : "none";
    }
    const oppName = opp ? opp.name : "";

    // the run
    const live = local.run > 0;
    const ms = live ? Math.max(0, clock.value - local.run) : 0;
    const blind = live && ms >= BLIND;
    const secs = result ? result.cs / 100 : live ? ms / 1000 : 0;
    const readout = result ? fmt(result.cs) : live ? (blind ? "??.??" : fmt(Math.min(MAX_CS, Math.floor(ms / 10)))) : "00.00";
    const fade = live && !blind && ms > 2600 ? 1 - ((ms - 2600) / 400) * 0.75 : 1;
    const hint = result
      ? result.cs === TARGET
        ? "0.00 off. Perfect."
        : `${off(result.cs)} off`
      : live
        ? blind
          ? "Count it in your head…"
          : "Watch it… then trust your gut"
        : "Readout goes blind at 3s";

    const stop = () => {
      const cs = Math.min(MAX_CS, Math.max(1, Math.round((freshNow() - local.run) / 10)));
      const vs = opp ? opp.id : "";
      if (opp && verdict(cs, opp.cs) === 1) haptic("success");
      dispatch({ t: "play", vs, cs });
      setLocal({ run: 0, showing: true });
    };

    // verdict line
    const pill = result
      ? !result.vs
        ? "Time set"
        : result.won === 1
          ? "You win. Nice timing."
          : result.won === 0
            ? "It's a tie."
            : `${entry(result.vs)?.name ?? "They"} wins this one.`
      : "";
    const pillFit = fitText(pill || " ", gw - 16 - 24, { size: 15, min: 11, weight: 600 });
    const pillK = result ? running(result.at, 350) : null;
    const pillIn = pillK === null ? 1 : easeOut(pillK / 350);

    // ladder: rows slide when someone climbed
    const lastTry = s.tries[s.tries.length - 1];
    const climb = lastTry && lastTry.won === 1 && lastTry.to < lastTry.from ? lastTry : undefined;
    const e = climb ? running(climb.at, 2200) : null;
    const before: Record<string, number> = {};
    s.ladder.forEach((x, i) => (before[x.id] = i));
    if (climb && e !== null) {
      const ids = s.ladder.map((x) => x.id).filter((id) => id !== climb.by);
      ids.splice(climb.from, 0, climb.by);
      ids.forEach((id, i) => (before[id] = i));
    }
    const moveK = e === null ? 1 : slide(Math.min(e, 700));
    const start = Math.max(0, Math.min(myI - 3, n - 6));
    const rowsShown = s.ladder.map((x, i) => ({ x, i, pos: before[x.id]! + (i - before[x.id]!) * moveK })).filter((r) => r.pos > start - 0.6 && r.pos < start + 5.6);
    const pillA = e === null ? 0 : e < 600 ? 0 : e < 900 ? (e - 600) / 300 : e < 1400 ? 1 : Math.max(0, 1 - ((e - 1400) / 800) ** 3);

    // comparison bars
    const bar = (cs: number) => Math.min(1, Math.max(-1, (cs - TARGET) / 50));
    const bw = W - 125 - 84;
    const mid = 84 + bw / 2;
    const growK = result ? running(result.at, 500) : null;
    const myCs = mine && mine.cs > 0 ? mine.cs : 0;
    const growth = growK === null ? 1 : easeOut(growK / 500);

    const nameOf = (id: string) => entry(id)?.name ?? members.find((m) => m.id === id)?.name ?? "Someone";
    const triedNames = s.tried.map(nameOf);
    const line =
      why === "from" && opp
        ? `Sent ${s.when} · ${triedLine(triedNames)}`
        : opp
          ? opp.note
            ? `${opp.name} · ${opp.note}`
            : opp.name
          : triedLine(triedNames);
    const lineFit = fitText(line, W, { size: 13, min: 11 });

    // bottom slot
    const settled = result ? running(result.at, 500) === null : false;
    const nextUp = (() => {
      if (!result || result.won !== 1) return undefined;
      for (let i = idxOf(s, me) - 1; i >= 0; i--) if (s.ladder[i]!.cs > 0) return s.ladder[i];
      return undefined;
    })();
    const confirmedTry = result;
    const sentK = confirmedTry && confirmedTry.sent > 0 ? running(confirmedTry.sent, 800) : null;
    const sentDone = !!confirmedTry && confirmedTry.sent > 0 && sentK === null;
    const target = result ? (result.vs ? nameOf(result.vs) : "") : "";
    const sentTo = result?.vs ? entry(result.vs) : undefined;

    // header
    const reasonTitle = !opp ? "Set a time to beat" : why === "sent" || why === "from" ? `${oppName} challenged you` : `Next up: ${oppName}`;
    const sub = opp ? `Stop at 10.00 · beat ${fmt(opp.cs)}` : "Stop at 10.00 · then send it";
    const hw = W - 48 - 76;
    const ft = fitText(reasonTitle, hw, { size: 15, min: 12, weight: 600 });
    const fs = fitText(sub, hw, { size: 13, min: 11 });
    const recOf = opp ?? mine;
    const rec = `${recOf ? recOf.w : 0}–${recOf ? recOf.l : 0}`;
    const headFace = opp ? face(opp) : me;

    const rank = myI >= 0 ? myI + 1 : 1;
    const crossLabel = `Stopwatch${blind ? ", readout hidden" : ` at ${readout}`}`;

    return (
      <div style={{ position: "relative", height: 392 }}>
        {/* header */}
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 44 }}>
          <span style={{ position: "absolute", left: 2, top: 4, display: "flex" }}>
            <Avatar user={headFace} size={36} />
          </span>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ position: "absolute", left: 25, top: 25 }}>
            <circle cx="9" cy="9" r="9" fill={c.card} />
            <g transform="translate(9 9) scale(0.9)">
              <path d={BOLT} fill={mix(c.series2, c.text, 0.4)} />
            </g>
          </svg>
          <div style={{ position: "absolute", left: 48, top: 4, width: hw, height: 20, fontSize: ft.size, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{ft.text}</div>
          <div style={{ position: "absolute", left: 48, top: 24, width: hw, height: 16, fontSize: fs.size, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{fs.text}</div>
          <div style={{ position: "absolute", left: W - 64, top: 4, width: 64, height: 36, borderRadius: 8, background: c.secondaryButton, textAlign: "center" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 3, fontSize: 15, lineHeight: "18px", fontWeight: 700, color: c.text }}>{rec}</div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 20, fontSize: 11, lineHeight: "13px", color: c.secondaryButtonText }}>record</div>
          </div>
        </div>

        {/* stopwatch */}
        <div style={{ position: "absolute", left: 0, top: 50, width: gw, height: 240, borderRadius: 12, background: c.wash, overflow: "hidden" }}>
          <div role="img" aria-label={crossLabel} style={{ position: "absolute", inset: 0 }}>
            <Dial gw={gw} theme={theme} hand={blind ? null : secs} blind={blind} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 134,
              height: 44,
              textAlign: "center",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 30,
              lineHeight: "44px",
              color: blind ? c.secondaryText : c.text,
              opacity: fade,
              whiteSpace: "nowrap",
            }}
          >
            {readout}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 172, height: 16, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{hint}</div>
          <div style={{ position: "absolute", left: 12, top: 194, width: gw - 24, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {result ? (
              <div
                style={{
                  height: 34,
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  padding: "0 12px",
                  borderRadius: 18,
                  background: c.toast,
                  boxShadow: `0 0 0 1px ${c.divider}, 0 2px 6px ${mix(c.text, c.wash, 0.85)}`,
                  color: c.onToast,
                  fontSize: pillFit.size,
                  lineHeight: "34px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  opacity: pillIn,
                  transform: `translateY(${(1 - pillIn) * 8}px)`,
                }}
              >
                {pillFit.text}
              </div>
            ) : live ? (
              <Button kind="primary" wide onClick={stop}>
                Stop
              </Button>
            ) : (
              <Button kind="primary" wide onClick={() => setLocal({ run: freshNow(), showing: false })}>
                Start
              </Button>
            )}
          </div>
        </div>

        {/* ladder */}
        <div
          role="img"
          aria-label={`${s.title}: you are ${rank} of ${n}`}
          style={{ position: "absolute", left: gw + 8, top: 50, width: 124, height: 240, borderRadius: 12, background: c.wash, overflow: "hidden" }}
        >
          <div style={{ position: "absolute", left: 12, top: 8, width: 100, height: 18, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.title}
          </div>
          {rowsShown.map(({ x, i, pos }) => {
            const isMe = x.id === me;
            const top = 40 + (pos - start) * 36 - 17;
            const hopping = isMe && e !== null && e < 700 ? Math.abs(Math.sin((e / 1000) * 16)) * 4 : 0;
            const icon = i === 0 ? "cup" : opp && x.id === opp.id ? "bolt" : "";
            const label = isMe ? "You" : x.name;
            const nf = fitText(label, icon ? 42 : 50, { size: 13, min: 11, weight: 600 });
            const above = i > 0 && s.ladder[i - 1]!.id === me;
            return (
              <div key={x.id} style={{ position: "absolute", left: 4, top: top - hopping, width: 116, height: 34 }}>
                {isMe ? <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: c.selected }} /> : null}
                {!isMe && i > 0 && !above ? <div style={{ position: "absolute", left: 26, top: -1, width: 82, height: 1, background: c.divider }} /> : null}
                <span style={{ position: "absolute", left: 3, top: 6, display: "flex" }}>
                  <Avatar user={face(x)} size={22} />
                </span>
                <div style={{ position: "absolute", left: 30, top: 7, height: 20, fontSize: nf.size, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{nf.text}</div>
                {icon && !(isMe && pillA > 0) ? (
                  <span style={{ position: "absolute", left: 30 + Math.min(textWidth(nf.text, nf.size, 600), 42) + 6, top: 12, display: "flex" }}>
                    {icon === "cup" ? <Trophy size={4.5} fill={c.series2} /> : <Bolt size={4.5} fill={c.series5} />}
                  </span>
                ) : null}
                {climb && x.id === climb.by && pillA > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 62,
                      top: 8,
                      width: 30,
                      height: 18,
                      borderRadius: 9,
                      background: c.positive,
                      color: c.onPrimary,
                      fontSize: 13,
                      lineHeight: "18px",
                      fontWeight: 700,
                      textAlign: "center",
                      opacity: pillA,
                    }}
                  >
                    {`+${climb.from - climb.to}`}
                  </div>
                ) : null}
                <div style={{ position: "absolute", right: 8, top: 7, height: 20, fontSize: 15, lineHeight: "20px", color: isMe ? mix(c.primary, c.text, 0.3) : mix(c.secondaryText, c.text, 0.45), whiteSpace: "nowrap" }}>{i + 1}</div>
              </div>
            );
          })}
        </div>

        {/* comparison */}
        {[0, 1].map((k) => {
          const isOpp = k === 0;
          const cs = isOpp ? (opp ? opp.cs : 0) : result ? result.cs : myCs;
          const hasBar = isOpp ? !!opp : cs > 0;
          const barX = mid + bar(cs) * (isOpp ? 1 : growth) * (bw / 2);
          const label = isOpp ? (opp ? opp.name : "Target") : "You";
          const lf = fitText(label, 52, { size: 13, min: 11, weight: 600 });
          const who = isOpp ? (opp ? face(opp) : null) : me;
          return (
            <div key={k} style={{ position: "absolute", left: 0, top: 298 + k * 24, width: W, height: 24 }}>
              <span style={{ position: "absolute", left: 10, top: 3, display: "flex" }}>
                {who ? (
                  <Avatar user={who} size={18} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="8" fill="none" stroke={c.text} stroke-width="1.6" />
                    <circle cx="9" cy="9" r="3.4" fill={c.primary} />
                  </svg>
                )}
              </span>
              <div style={{ position: "absolute", left: 32, top: 2, width: 52, height: 20, fontSize: lf.size, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{lf.text}</div>
              <svg width={W} height={24} viewBox={`0 0 ${W} 24`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
                <rect x="84" y="8" width={bw} height="8" rx="4" fill={c.track} />
                {hasBar ? (
                  <g>
                    <rect x={Math.min(mid, barX)} y="8" width={Math.max(0.5, Math.abs(barX - mid))} height="8" rx="4" fill={isOpp ? c.series3 : c.primary} />
                    <circle cx={barX} cy="12" r="5" fill={isOpp ? c.series3 : c.primary} />
                  </g>
                ) : null}
                <rect x={mid - 1} y="5" width="2" height="14" fill={c.text} />
              </svg>
              <div style={{ position: "absolute", right: 0, top: 3, width: 120, height: 18, textAlign: "right", fontSize: 12, lineHeight: "18px", color: hasBar ? c.text : c.secondaryText, whiteSpace: "nowrap" }}>
                {isOpp ? (opp ? `${fmt(cs)} · ${off(cs)} off` : "10.00") : hasBar ? `${fmt(cs)} · ${off(cs)} off` : "your turn"}
              </div>
            </div>
          );
        })}

        {/* bottom slot */}
        <div style={{ position: "absolute", left: 0, top: 348, width: W, height: 44 }}>
          {result && sentDone ? (
            <div style={{ position: "absolute", left: 0, top: 4, width: W, height: 36, borderRadius: 8, boxSizing: "border-box", background: mix(c.card, c.positive, 0.16) }}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ position: "absolute", left: 10, top: 10 }}>
                <path d="M2 8.5 6 12.5 14 3.5" fill="none" stroke={c.positive} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <div style={{ position: "absolute", left: 34, top: 8, width: W - 34 - 44, height: 20, fontSize: 14, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {target ? `Sent. ${target} has 24h to answer` : "Sent. Everyone has 24h to answer"}
              </div>
              {sentTo ? (
                <span style={{ position: "absolute", right: 8, top: 8, display: "flex" }}>
                  <Avatar user={face(sentTo)} size={20} />
                </span>
              ) : null}
            </div>
          ) : result && sentK !== null ? (
            <svg width="24" height="20" viewBox="-12 -10 24 20" aria-hidden="true" style={{ position: "absolute", left: 30 + (W - 70) * slide(sentK) - 12, top: 22 - 10 - Math.sin(Math.PI * (sentK / 800)) * 16 }}>
              <polygon points="12,0 -10,-8 -5,0 -10,8" fill={c.primary} />
            </svg>
          ) : result && settled ? (
            <div style={{ position: "absolute", left: 0, top: 4, width: W, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Button
                kind="primary"
                wide
                onClick={() => {
                  const t = result.id;
                  dispatch({ t: "send", id: t });
                }}
              >
                {result.vs ? `Send to ${target}` : "Send"}
              </Button>
              {nextUp ? (
                <Button kind="secondary" wide onClick={() => setLocal({ vs: nextUp.id, showing: false })}>
                  {`Challenge ${nextUp.name}`}
                </Button>
              ) : (
                <Button kind="secondary" wide onClick={() => setLocal({ showing: false })}>
                  Rematch
                </Button>
              )}
            </div>
          ) : result ? null : (
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 44, display: "flex", alignItems: "center", fontSize: lineFit.size, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap" }}>
              <span style={{ paddingLeft: 4 }}>{lineFit.text}</span>
            </div>
          )}
        </div>
      </div>
    );
  },
});
