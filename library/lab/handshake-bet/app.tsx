import { defineApp, Avatar, Burst, Button, Canvas, CardHeader, fitText, haptic, mix, pal, running, spring, springs, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Handshake bet: two drawn arms reach toward each other across the card, one per side of a bet.
// Each person taps to shake on it and their hand closes the gap; when both have shaken the hands
// clasp and the stake tag swings from the grip. Everyone else taps to witness and their faces line
// up under the handshake. Then the days fill in, one alarm clock at a time, until it's settled.

type Params = {
  /** Who made the claim: "Calvin" */
  claimant: string;
  /** The claim in their own words */
  claim: string;
  /** Who said bet: "Will" */
  doubter: string;
  /** What the doubter said */
  said: string;
  /** The stake, on the tag: "Loser buys Tío's" */
  stake: string;
  /** Short day labels the bet runs over, 1 to 7: ["Mon", "Tue", ...] */
  days: string[];
  /** When it gets settled: "Fri 5pm" */
  due: string;
  /** The daily check, after "did Calvin": "make the 9am" */
  question: string;
  /** Button for a day kept: "Made it" */
  kept: string;
  /** Button for a day missed: "Overslept" */
  missed: string;
  /** Who already shook (the claimant, the doubter, or both) */
  shook: string[];
  /** Who already witnessed */
  witnesses: string[];
  /** Days already marked, in order: true kept it, false missed */
  marks: boolean[];
};

// @params
const P: Params = {
  claimant: "Calvin",
  claim: "i will NOT oversleep a single 9am this week",
  doubter: "Will",
  said: "bet",
  stake: "Loser buys Tío's",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  due: "Fri 5pm",
  question: "make the 9am",
  kept: "Made it",
  missed: "Overslept",
  shook: ["Will"],
  witnesses: ["Arun", "Maya"],
  marks: [],
};
// @end params

type State = {
  claimant: string;
  doubter: string;
  cName: string;
  dName: string;
  claim: string;
  said: string;
  stake: string;
  days: string[];
  due: string;
  question: string;
  kept: string;
  missed: string;
  shook: string[];
  shookAt: number;
  witnesses: string[];
  marks: (boolean | null)[];
  conceded: boolean;
  at: number;
};
type Action = { t: "shake" } | { t: "witness" } | { t: "mark"; day: number; ok: boolean } | { t: "concede" };
type Local = { bursts: number };

const H = 136;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const parties = (s: State) => [s.claimant, s.doubter].filter(Boolean);
const shaken = (s: State) => s.claimant !== "" && s.doubter !== "" && s.shook.includes(s.claimant) && s.shook.includes(s.doubter);
const winner = (s: State): "" | "claimant" | "doubter" => (s.conceded || s.marks.some((m) => m === false) ? "doubter" : s.marks.length > 0 && s.marks.every((m) => m === true) ? "claimant" : "");
const reach = spring({ ...springs.iosBouncy });

function initState(ctx: Ctx): State {
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return n ? ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n) : undefined;
  };
  const c = find(P.claimant);
  const d = find(P.doubter);
  const claimant = c?.id ?? "";
  const doubter = d && d.id !== claimant ? d.id : "";
  const days = (Array.isArray(P.days) ? P.days : []).map((x) => clean(x, 4)).filter(Boolean).slice(0, 7);
  if (!days.length) days.push("Mon", "Tue", "Wed", "Thu", "Fri");
  const shook = (Array.isArray(P.shook) ? P.shook : []).map((x) => find(x)?.id ?? "").filter((u, i, a) => u && (u === claimant || u === doubter) && a.indexOf(u) === i);
  const witnesses = (Array.isArray(P.witnesses) ? P.witnesses : []).map((x) => find(x)?.id ?? "").filter((u, i, a) => u && u !== claimant && u !== doubter && a.indexOf(u) === i);
  const both = claimant !== "" && doubter !== "" && shook.length === 2;
  const marks: (boolean | null)[] = days.map(() => null);
  if (both) {
    (Array.isArray(P.marks) ? P.marks : []).slice(0, days.length).forEach((m, i) => {
      if (typeof m === "boolean" && !marks.some((x) => x === false)) marks[i] = m;
    });
  }
  return {
    claimant,
    doubter,
    cName: c?.name ?? clean(P.claimant, 20),
    dName: d?.name ?? clean(P.doubter, 20),
    claim: clean(P.claim, 90) || "I can do it",
    said: clean(P.said, 30),
    stake: clean(P.stake, 32) || "Bragging rights",
    days,
    due: clean(P.due, 20),
    question: clean(P.question, 30) || "keep it",
    kept: clean(P.kept, 16) || "Kept it",
    missed: clean(P.missed, 16) || "Missed",
    shook,
    shookAt: both ? 1 : 0,
    witnesses,
    marks,
    conceded: false,
    at: 0,
  };
}

function hand(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, sleeve: string, skin: string, line: string, closed: boolean) {
  // arm from the edge to (x, y), mitten hand pointing toward the middle
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.fillStyle = sleeve;
  g.beginPath();
  g.roundRect(-400, -14, 386, 28, 10);
  g.fill();
  g.fillStyle = mix(sleeve, line, 0.25);
  g.beginPath();
  g.roundRect(-22, -16, 10, 32, 4);
  g.fill();
  g.fillStyle = skin;
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(-14, -12, closed ? 26 : 30, 24, 10);
  g.fill();
  g.stroke();
  // thumb
  g.beginPath();
  g.ellipse(closed ? 4 : 6, -13, 9, 5, closed ? -0.2 : -0.6, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // finger lines
  g.beginPath();
  for (const yy of [-3, 3, 9]) {
    g.moveTo(closed ? 6 : 8, yy);
    g.lineTo(closed ? 12 : 16, yy);
  }
  g.stroke();
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Handshake bet",
  summary: (s) => {
    const w = winner(s);
    if (w) return `${w === "claimant" ? s.cName : s.dName} won the bet · ${s.stake}`;
    if (shaken(s)) return `${s.cName} vs ${s.dName}: shook on it · ${s.witnesses.length} witnesses`;
    return `${s.cName} vs ${s.dName}: "${s.claim}" · ${s.shook.length} of 2 shook`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || winner(s)) return s;
    if (a.t === "shake") {
      if (!parties(s).includes(u) || s.shook.includes(u)) return s;
      const shook = [...s.shook, u];
      const next = { ...s, shook, at: meta.time };
      return shaken(next) ? { ...next, shookAt: meta.time } : next;
    }
    if (a.t === "witness") {
      if (parties(s).includes(u)) return s;
      const witnesses = s.witnesses.includes(u) ? s.witnesses.filter((w) => w !== u) : [...s.witnesses, u];
      return { ...s, witnesses, at: meta.time };
    }
    if (a.t === "mark") {
      if (u !== s.claimant || !shaken(s) || typeof a.ok !== "boolean" || !Number.isInteger(a.day) || a.day < 0 || a.day >= s.days.length) return s;
      if (s.marks[a.day] !== null || s.marks.slice(0, a.day).some((m) => m === null)) return s;
      return { ...s, marks: s.marks.map((m, i) => (i === a.day ? a.ok : m)), at: meta.time };
    }
    if (a.t === "concede") {
      if (u !== s.claimant || !shaken(s)) return s;
      return { ...s, conceded: true, at: meta.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const witnesses = s.witnesses.filter((w) => inChat(ctx, w));
    return witnesses.length === s.witnesses.length ? s : { ...s, witnesses };
  },

  invariants: {
    "only the two sides shake, once": (s) => s.shook.every((u) => u !== "" && (u === s.claimant || u === s.doubter)) && new Set(s.shook).size === s.shook.length,
    "witnesses aren't on either side": (s) => s.witnesses.every((u) => u !== s.claimant && u !== s.doubter) && new Set(s.witnesses).size === s.witnesses.length,
    "days get marked only after the shake": (s) => shaken(s) || s.marks.every((m) => m === null),
    "days fill in order": (s) => s.marks.every((m, i) => m === null || s.marks.slice(0, i).every((x) => x !== null)),
    "nothing gets marked after a miss": (s) => s.marks.every((m, i) => m === null || !s.marks.slice(0, i).some((x) => x === false)),
    "one mark per day": (s) => s.marks.length === s.days.length,
    "the shake time is set once both shook": (s) => (s.shookAt > 0) === shaken(s),
    "witnesses are in the chat": (s, ctx) => s.witnesses.every((u) => inChat(ctx, u)),
  },

  transitions: {
    "a shake adds only your hand": (p, n, a, m) => a.t !== "shake" || p === n || (n.shook.length === p.shook.length + 1 && n.shook[n.shook.length - 1] === m.user && (m.user === p.claimant || m.user === p.doubter)),
    "witnessing moves only your face": (p, n, a, m) =>
      a.t !== "witness" || p === n || (m.user !== p.claimant && m.user !== p.doubter && n.witnesses.includes(m.user) !== p.witnesses.includes(m.user) && n.witnesses.filter((u) => u !== m.user).join() === p.witnesses.filter((u) => u !== m.user).join()),
    "only the claimant reports the day": (p, n, a, m) => a.t !== "mark" || p === n || (m.user === p.claimant && n.marks[a.day] === a.ok && p.marks[a.day] === null),
    "a settled bet stays settled": (p, n) => winner(p) === "" || (winner(n) === winner(p) && JSON.stringify(n.marks) === JSON.stringify(p.marks) && n.shook.join() === p.shook.join()),
    "conceding hands it to the doubter": (p, n, a, m) => a.t !== "concede" || p === n || (m.user === p.claimant && winner(n) === "doubter"),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (u !== s.claimant && u !== s.doubter && r.next() < 0.6) return { t: "witness" };
    if (u === s.claimant && shaken(s) && r.next() < 0.8) return { t: "mark", day: Math.max(0, s.marks.indexOf(null)), ok: r.next() < 0.75 };
    const k = r.next();
    if (k < 0.3) return { t: "shake" };
    if (k < 0.5) return { t: "witness" };
    if (k < 0.95) return { t: "mark", day: Math.max(0, s.marks.indexOf(null)), ok: r.next() < 0.75 };
    return { t: "concede" };
  },

  local: { bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const both = shaken(state);
    const won = winner(state);
    const iAmClaimant = me === state.claimant;
    const iAmParty = parties(state).includes(me);
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const nameOf = (u: string, fallback: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? fallback);
    const e = both && state.shookAt > 1 ? running(state.shookAt, 1600) : null;
    const today = state.marks.indexOf(null);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      const mid = w / 2;
      const y = 70;
      const skin = mix(pl.orange, pl.paper, 0.55);
      const line = mix(pl.brown, c.text, 0.3);
      const cSh = state.claimant ? userColor(state.claimant, theme) : c.secondaryText;
      const dSh = state.doubter ? userColor(state.doubter, theme) : c.secondaryText;
      const far = mid - 74;
      const near = mid - 26;
      const cIn = state.shook.includes(state.claimant) && state.claimant !== "";
      const dIn = state.shook.includes(state.doubter) && state.doubter !== "";
      const t = state.at ? Math.min(1, reach(running(state.at, 900) ?? 900)) : 1;
      const lx = both ? mid - 16 : cIn ? far + (near - far) * t : far;
      const rx = both ? mid + 16 : dIn ? w - (far + (near - far) * t) : w - far;
      const shakeY = e !== null ? Math.sin(e / 70) * 6 * (1 - e / 1600) : 0;
      // the clasp's motion lines
      if (both) {
        g.strokeStyle = mix(c.text, c.card, 0.5);
        g.lineWidth = 2;
        g.lineCap = "round";
        g.beginPath();
        for (const s of [-1, 1]) {
          g.moveTo(mid + s * 34, y - 30);
          g.lineTo(mid + s * 42, y - 38);
          g.moveTo(mid + s * 40, y - 22);
          g.lineTo(mid + s * 52, y - 26);
        }
        g.stroke();
      } else {
        g.strokeStyle = c.secondaryText;
        g.setLineDash([4, 5]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(lx + 22, y);
        g.lineTo(rx - 22, y);
        g.stroke();
        g.setLineDash([]);
      }
      hand(g, lx, y + shakeY, 1, cSh, skin, line, both);
      hand(g, rx, y + shakeY, -1, dSh, skin, line, both);
      // stake tag on a string from the middle
      const swing = Math.sin(f.now / 500) * 0.08 + (e !== null ? Math.sin(e / 90) * 0.3 * (1 - e / 1600) : 0);
      g.save();
      g.translate(mid, y + 12 + shakeY);
      g.rotate(swing);
      g.strokeStyle = mix(c.text, c.card, 0.4);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, 22);
      g.stroke();
      const tf = fitText(state.stake, Math.min(180, w - 120), { g, size: 14, weight: 700 });
      g.font = tf.font;
      const tw = Math.min(200, g.measureText(tf.text).width + 30);
      g.fillStyle = theme.mode === "dark" ? pl.yellow : mix(pl.yellow, c.card, 0.2);
      g.beginPath();
      g.moveTo(-tw / 2 + 10, 22);
      g.lineTo(tw / 2, 22);
      g.lineTo(tw / 2, 52);
      g.lineTo(-tw / 2 + 10, 52);
      g.lineTo(-tw / 2, 37);
      g.closePath();
      g.fill();
      g.fillStyle = c.card;
      g.beginPath();
      g.arc(-tw / 2 + 10, 37, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = theme.mode === "dark" ? pl.dark : mix(pl.brown, c.text, 0.55);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(tf.text, 6, 38);
      g.restore();
      return true;
    };

    const witnessesShown = state.witnesses.slice(0, 7);
    const others = members.filter((m) => m.id !== state.claimant && m.id !== state.doubter && !state.witnesses.includes(m.id)).length;
    const status = won
      ? `${won === "claimant" ? nameOf(state.claimant, state.cName) : nameOf(state.doubter, state.dName)} ${won === "claimant" ? (iAmClaimant ? "win" : "wins") : me === state.doubter ? "win" : "wins"} · ${state.stake}`
      : both
        ? today >= 0
          ? `${state.days[today]} · did ${nameOf(state.claimant, state.cName)} ${state.question}?`
          : "All days in"
        : `${state.shook.length} of 2 shook on it`;

    return (
      <div>
        <CardHeader title={`${state.cName} vs ${state.dName}`} subtitle={state.due ? `Settles ${state.due}` : "A friendly bet"} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          {state.claimant ? <Avatar user={state.claimant} size={24} /> : null}
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", color: c.text }}>
            {`"${state.claim}"`}
            {state.said ? <span style={{ color: c.secondaryText }}>{` · ${nameOf(state.doubter, state.dName)}: "${state.said}"`}</span> : null}
          </div>
        </div>
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={both ? `${state.cName} and ${state.dName} shook on it: ${state.stake}` : `Two hands reaching, ${state.shook.length} of 2 shook`} draw={draw} />
          {[state.claimant, state.doubter].map((u, i) =>
            u ? (
              <div key={u} style={{ position: "absolute", top: 0, [i ? "right" : "left"]: 0, display: "flex", alignItems: "center", gap: 6, flexDirection: i ? "row-reverse" : "row", pointerEvents: "none" }}>
                <span style={{ display: "flex", borderRadius: 99, boxShadow: state.shook.includes(u) ? `0 0 0 2px ${c.positive}` : "none" }}>
                  <Avatar user={u} size={34} />
                </span>
                <span style={{ fontSize: 11, lineHeight: "14px", color: state.shook.includes(u) ? c.text : c.secondaryText, fontWeight: 600 }}>{state.shook.includes(u) ? "Shook" : "Not yet"}</span>
              </div>
            ) : null,
          )}
          {local.bursts > 0 && (both || state.witnesses.includes(me)) ? <Burst key={local.bursts} emoji="🤝" /> : null}
        </div>
        <div style={{ marginTop: 4, height: 26, display: "flex", justifyContent: "center", alignItems: "center", gap: 4, pointerEvents: "none" }}>
          {witnessesShown.map((u) => (
            <Avatar key={u} user={u} size={24} />
          ))}
          {Array.from({ length: Math.min(3, others) }, (_, i) => (
            <span key={`o${i}`} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px dashed ${c.secondaryText}` }} />
          ))}
          <span style={{ marginLeft: 4, fontSize: 12, color: c.secondaryText }}>{state.witnesses.length ? `${state.witnesses.length} ${state.witnesses.length === 1 ? "witness" : "witnesses"}` : "No witnesses yet"}</span>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
          {state.days.map((d, i) => {
            const m = state.marks[i];
            const tone = m === true ? c.positive : m === false ? c.negative : c.secondaryText;
            const canMark = iAmClaimant && both && !won && i === today;
            return (
              <div key={i} role="img" aria-label={`${d}: ${m === true ? "made it" : m === false ? "missed" : "not yet"}`} style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 8, background: m === null ? "transparent" : mix(tone, c.card, 0.85), border: m === null ? `1.5px ${canMark ? "solid" : "dashed"} ${canMark ? c.primary : c.divider}` : "none", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
                  <circle cx="10" cy="10" r="7" fill="none" stroke={tone} stroke-width="1.8" />
                  <path d="M3 4 5.5 1.5M17 4 14.5 1.5" stroke={tone} stroke-width="1.8" stroke-linecap="round" />
                  {m === false ? <path d="M7 7 13 13M13 7 7 13" stroke={tone} stroke-width="1.8" stroke-linecap="round" /> : m === true ? <path d="M6.5 10 9 12.5 13.5 7.5" fill="none" stroke={tone} stroke-width="1.8" stroke-linecap="round" /> : <path d="M10 6V10L12.5 11.5" fill="none" stroke={tone} stroke-width="1.6" stroke-linecap="round" />}
                </svg>
                <span style={{ fontSize: 11, lineHeight: "13px", color: c.text }}>{d}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{status}</span>
          {won ? null : iAmParty && !state.shook.includes(me) ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic("success");
                setLocal({ bursts: local.bursts + 1 });
                dispatch({ t: "shake" });
              }}
            >
              Shake on it
            </Button>
          ) : iAmClaimant && both && today >= 0 ? (
            <>
              <Button kind="secondary" onClick={() => dispatch({ t: "mark", day: today, ok: false })}>
                {state.missed}
              </Button>
              <Button kind="primary" onClick={() => dispatch({ t: "mark", day: today, ok: true })}>
                {state.kept}
              </Button>
            </>
          ) : !iAmParty ? (
            <Button
              kind={state.witnesses.includes(me) ? "secondary" : "primary"}
              onClick={() => {
                if (!state.witnesses.includes(me)) {
                  haptic("light");
                  setLocal({ bursts: local.bursts + 1 });
                }
                dispatch({ t: "witness" });
              }}
            >
              {state.witnesses.includes(me) ? "Witnessed" : "Witness"}
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
