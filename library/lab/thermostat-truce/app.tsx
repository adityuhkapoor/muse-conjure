import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Thermostat truce: one big round thermostat with every roommate's temperature as a face on the
// dial. Turn it to a truce for the day and one for the night (the ring around it shows when night
// starts), then everyone taps Agree and the dial clicks locked.

type Params = {
  /** Card title: "Thermostat truce" */
  title: string;
  /** The line that started it, shown under the title */
  sub: string;
  /** Lowest and highest on the dial, in degrees */
  min: number;
  max: number;
  /** When night starts and ends, hours 0 to 23 */
  nightFrom: number;
  nightTo: number;
  /** Everyone's preferred temperature in their own words. visiting: does not need to agree. */
  prefs: { who: string; temp: number; note?: string; visiting?: boolean }[];
  /** The truce on the table now */
  day: number;
  night: number;
  /** Who already agreed to it */
  agreed: string[];
};

// @params
const P: Params = {
  title: "Thermostat truce",
  sub: "Maya: “why is it 64 in here”",
  min: 60,
  max: 80,
  nightFrom: 0,
  nightTo: 7,
  prefs: [
    { who: "Calvin", temp: 66, note: "cooler after midnight or i can't sleep" },
    { who: "Arun", temp: 71 },
    { who: "Aditya", temp: 70, note: "lowkey 70" },
    { who: "Will", temp: 74, note: "i'm always cold" },
    { who: "Maya", temp: 72, note: "why is it 64 in here", visiting: true },
  ],
  day: 68,
  night: 65,
  agreed: ["Calvin", "Arun"],
};
// @end params

type Pref = { id: string; name: string; temp: number; note: string; visiting: boolean };
type Mode = "day" | "night";
type State = { title: string; sub: string; min: number; max: number; from: number; to: number; prefs: Pref[]; day: number; night: number; agreed: string[]; locked: boolean; at: number; by: string };
type Action = { t: "set"; mode: string; temp: number } | { t: "agree" } | { t: "reopen" };
type Local = { mode: Mode; draft: number; toast: number; msg: string };

const H = 242;
const A0 = (135 * Math.PI) / 180;
const SWEEP = (270 * Math.PI) / 180;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const first = (n: string) => n.split(" ")[0] ?? n;
const hr = (h: number) => (h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);
/** Who has to agree: everyone with a temperature who lives here and is in the chat; if nobody, everyone in the chat. */
const needed = (s: State, ctx: Ctx) => {
  const xs = s.prefs.filter((p) => !p.visiting && inChat(ctx, p.id)).map((p) => p.id);
  return xs.length ? xs : ctx.members.map((m) => m.id);
};
const allIn = (s: State, agreed: string[], ctx: Ctx) => {
  const n = needed(s, ctx);
  return n.length > 0 && n.every((u) => agreed.includes(u));
};

function initState(ctx: Ctx): State {
  const min = int(P.min, 40, 90, 60);
  const max = Math.max(min + 6, int(P.max, 46, 100, 80));
  const find = (who: string) => ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
  const prefs: Pref[] = [];
  for (const raw of Array.isArray(P.prefs) ? P.prefs : []) {
    const who = clean(raw?.who, 24);
    if (!who || prefs.length >= 8) continue;
    const m = find(who);
    const id = m ? m.id : `?${who.toLowerCase()}`;
    if (prefs.some((p) => p.id === id)) continue;
    prefs.push({ id, name: m ? m.name : who, temp: int(raw?.temp, min, max, Math.round((min + max) / 2)), note: clean(raw?.note, 48), visiting: raw?.visiting === true });
  }
  const mid = Math.round((min + max) / 2);
  const s: State = {
    title: clean(P.title, 30) || "Thermostat truce",
    sub: clean(P.sub, 60),
    min,
    max,
    from: int(P.nightFrom, 0, 23, 0),
    to: int(P.nightTo, 0, 23, 7),
    prefs,
    day: int(P.day, min, max, mid),
    night: int(P.night, min, max, mid - 2),
    agreed: [],
    locked: false,
    at: 0,
    by: "",
  };
  const agreed = (Array.isArray(P.agreed) ? P.agreed : []).map((w) => find(clean(w, 24))?.id).filter((x): x is string => !!x);
  s.agreed = [...new Set(agreed)];
  s.locked = allIn(s, s.agreed, ctx);
  return s;
}

function reduceT(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "set") {
    if (s.locked || (a.mode !== "day" && a.mode !== "night") || typeof a.temp !== "number" || !Number.isInteger(a.temp) || a.temp < s.min || a.temp > s.max) return s;
    if (s[a.mode] === a.temp) return s;
    // A new truce starts a new round of agreeing, with the setter on board.
    const next = { ...s, [a.mode]: a.temp, agreed: [u], at: meta.time, by: u };
    return { ...next, locked: allIn(next, next.agreed, ctx) };
  }
  if (a.t === "agree") {
    if (s.locked || s.agreed.includes(u)) return s;
    const agreed = [...s.agreed, u];
    const locked = allIn(s, agreed, ctx);
    return { ...s, agreed, locked, at: locked ? meta.time : s.at };
  }
  if (a.t === "reopen") {
    if (!s.locked) return s;
    return { ...s, locked: false, agreed: [], at: meta.time, by: u };
  }
  return s;
}

const angleOf = (s: State, t: number) => A0 + ((t - s.min) / (s.max - s.min)) * SWEEP;

function drawDial(g: CanvasRenderingContext2D, f: DrawFrame, s: State, mode: Mode, shown: number, members: readonly Member[], ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const dark = t.mode === "dark";
  const cx = W / 2;
  const cy = 122;
  const R = 88;
  const warm = (x: number) => ((x - s.min) / (s.max - s.min) >= 0.5 ? p.orange : p.blue);
  const hot = warm(shown);
  // schedule ring: 24 hours, night in deep blue
  const RR = R + 22;
  const hAng = (h: number) => -Math.PI / 2 + (h / 24) * Math.PI * 2;
  g.lineWidth = 8;
  g.lineCap = "butt";
  g.strokeStyle = dark ? mix(p.yellow, c.card, 0.55) : mix(p.yellow, c.card, 0.55);
  g.beginPath();
  g.arc(cx, cy, RR, 0, Math.PI * 2);
  g.stroke();
  const nf = s.from;
  const nt = s.to <= s.from ? s.to + 24 : s.to;
  g.strokeStyle = mode === "night" ? mix(p.blue, c.text, dark ? 0 : 0.35) : mix(p.blue, c.card, 0.35);
  g.beginPath();
  g.arc(cx, cy, RR, hAng(nf), hAng(nt));
  g.stroke();
  // sun and moon on the ring
  const mid = (a: number, b: number) => (a + b) / 2;
  const mA = hAng(mid(nf, nt));
  const sA = hAng(mid(nt, nf + 24));
  const mx = cx + Math.cos(mA) * RR;
  const my = cy + Math.sin(mA) * RR;
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(mx, my, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.blue;
  g.beginPath();
  g.arc(mx, my, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(mx + 3.5, my - 2.5, 6, 0, Math.PI * 2);
  g.fill();
  const sx = cx + Math.cos(sA) * RR;
  const sy = cy + Math.sin(sA) * RR;
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(sx, sy, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.yellow;
  g.beginPath();
  g.arc(sx, sy, 5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p.yellow;
  g.lineWidth = 1.6;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    g.moveTo(sx + Math.cos(a) * 6.5, sy + Math.sin(a) * 6.5);
    g.lineTo(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9);
  }
  g.stroke();

  // dial body
  g.fillStyle = dark ? mix(c.wash, hot, 0.12) : mix(c.card, hot, 0.08);
  g.beginPath();
  g.arc(cx, cy, R + 8, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = c.divider;
  g.stroke();
  // ticks
  const n = (s.max - s.min) * 2;
  const on = new Path2D();
  const off = new Path2D();
  for (let k = 0; k <= n; k++) {
    const tv = s.min + k / 2;
    const a = angleOf(s, tv);
    const r1 = R - (k % 2 === 0 ? 12 : 8);
    const path = tv <= shown ? on : off;
    path.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    path.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
  }
  g.lineWidth = 2;
  g.strokeStyle = mix(c.secondaryText, c.card, 0.5);
  g.stroke(off);
  g.strokeStyle = s.locked ? c.secondaryText : hot;
  g.lineWidth = 2.5;
  g.stroke(on);
  // min and max
  g.font = `500 11px ${t.type.family}`;
  g.fillStyle = c.secondaryText;
  for (const v of [s.min, s.max]) {
    const a = angleOf(s, v);
    g.fillText(`${v}`, cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
  }
  // everyone's temperature: a long tick and a face
  // faces sit just inside their tick, nudged apart so none covers another
  const FR = R - 30;
  const gap = 23 / FR;
  const order = [...s.prefs].sort((x, y) => x.temp - y.temp);
  const fa = order.map((pr) => angleOf(s, pr.temp));
  for (let it = 0; it < 6; it++) for (let k = 1; k < fa.length; k++) if (fa[k]! - fa[k - 1]! < gap) { const d = (gap - (fa[k]! - fa[k - 1]!)) / 2; fa[k - 1]! -= d; fa[k]! += d; }
  order.forEach((pr, idx) => {
    const a = angleOf(s, pr.temp);
    const col = inChat(ctx, pr.id) ? userColor(pr.id, t) : c.secondaryText;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
    g.lineTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
    g.stroke();
    const fx = cx + Math.cos(fa[idx]!) * FR;
    const fy = cy + Math.sin(fa[idx]!) * FR;
    g.beginPath();
    g.arc(fx, fy, 10, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = pr.visiting ? c.card : c.card;
    g.stroke();
    if (pr.visiting) {
      g.setLineDash([2, 2]);
      g.strokeStyle = c.secondaryText;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(fx, fy, 12.5, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = c.onPrimary;
    g.font = `700 10px ${t.type.family}`;
    g.fillText((members.find((m) => m.id === pr.id)?.name ?? pr.name)[0]?.toUpperCase() ?? "?", fx, fy + 0.5);
  });
  // the knob
  const ka = angleOf(s, shown);
  const kx = cx + Math.cos(ka) * (R - 6);
  const ky = cy + Math.sin(ka) * (R - 6);
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(kx, ky, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = s.locked ? c.secondaryText : hot;
  g.stroke();
  // center
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = c.secondaryText;
  g.font = `600 13px ${t.type.family}`;
  g.fillText(s.locked ? "Locked" : mode === "day" ? "Day" : "Night", cx, cy - 30);
  g.fillStyle = c.text;
  g.font = `700 50px ${t.type.family}`;
  g.fillText(`${shown}°`, cx + 6, cy + 18);
  const other = mode === "day" ? `night ${s.night}°` : `day ${s.day}°`;
  const o = fitText(other, 90, { g, size: 13, min: 10, weight: 500 });
  g.font = o.font;
  g.fillStyle = c.secondaryText;
  g.fillText(o.text, cx, cy + 40);
  if (s.locked) {
    // a small padlock under the number
    g.fillStyle = c.secondaryText;
    g.beginPath();
    g.roundRect(cx - 7, cy + 50, 14, 11, 2);
    g.fill();
    g.strokeStyle = c.secondaryText;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy + 50, 4.5, Math.PI, 0);
    g.stroke();
  }
  const e = s.at ? f.now - s.at : 9999;
  if (s.locked && e < 900) {
    // the click: a ring that snaps in
    const q = e / 900;
    g.globalAlpha = 1 - q;
    g.strokeStyle = c.positive;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, R + 8 + q * 16, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    return true;
  }
  return false;
}

export default defineApp<State, Action, Local>({
  name: "Thermostat truce",
  summary: (s, ctx) => {
    const need = needed(s, ctx);
    const yes = need.filter((u) => s.agreed.includes(u)).length;
    return s.locked ? `${s.title}: locked at ${s.day}° day, ${s.night}° night` : `${s.title}: ${s.day}° day, ${s.night}° night · ${yes} of ${need.length} agree`;
  },
  init: initState,
  reduce: reduceT,
  onMembers: (s, ctx) => {
    const agreed = s.agreed.filter((u) => inChat(ctx, u));
    return { ...s, agreed, locked: s.locked && allIn(s, agreed, ctx) };
  },

  invariants: {
    "the truce is on the dial": (s) => Number.isInteger(s.day) && Number.isInteger(s.night) && s.day >= s.min && s.day <= s.max && s.night >= s.min && s.night <= s.max,
    "agreements are unique": (s) => new Set(s.agreed).size === s.agreed.length,
    "everyone who agreed is in the chat": (s, ctx) => s.agreed.every((u) => inChat(ctx, u)),
    "locked means everyone needed agreed": (s, ctx) => !s.locked || ctx.members.length === 0 || allIn(s, s.agreed, ctx),
    "night hours are hours": (s) => Number.isInteger(s.from) && Number.isInteger(s.to) && s.from >= 0 && s.from < 24 && s.to >= 0 && s.to < 24,
  },

  transitions: {
    "a new truce restarts agreeing with the setter": (p, n, a, m) =>
      a.t !== "set" || p === n || (!p.locked && n[a.mode as Mode] === a.temp && n.agreed.length === 1 && n.agreed[0] === m.user && n.by === m.user && n.at === m.time),
    "setting moves one side only": (p, n, a) => a.t !== "set" || p === n || (a.mode === "day" ? n.night === p.night : n.day === p.day),
    "agree adds only the sender": (p, n, a, m) => a.t !== "agree" || p === n || (!p.agreed.includes(m.user) && n.agreed.length === p.agreed.length + 1 && n.agreed[n.agreed.length - 1] === m.user && n.day === p.day && n.night === p.night),
    "locks when the last one agrees": (p, n, a, _m, ctx) => (a.t !== "agree" && a.t !== "set") || p === n || n.locked === allIn(n, n.agreed, ctx),
    "a fair set on an open dial moves it": (p, n, a, m, ctx) =>
      a.t !== "set" || !inChat(ctx, m.user) || p.locked || (a.mode !== "day" && a.mode !== "night") || !Number.isInteger(a.temp) || a.temp < p.min || a.temp > p.max || p[a.mode as Mode] === a.temp || n[a.mode as Mode] === a.temp,
    "the lock time is when it locked": (p, n, a, m) => a.t !== "agree" || p === n || (n.locked ? n.at === m.time : n.at === p.at),
    "reopening needs a lock": (p, n, a) => a.t !== "reopen" || p.locked || JSON.stringify(p) === JSON.stringify(n),
    "a locked truce cannot move": (p, n, a) => !p.locked || a.t === "reopen" || (n.day === p.day && n.night === p.night && n.locked),
    "reopening clears the agreements": (p, n, a, m) => a.t !== "reopen" || p === n || (p.locked && !n.locked && n.agreed.length === 0 && n.by === m.user),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.locked) return r.next() < 0.6 ? { t: "reopen" } : { t: "agree" };
    const x = r.next();
    if (x < 0.45 && !s.agreed.includes(user)) return { t: "agree" };
    return { t: "set", mode: r.next() < 0.5 ? "day" : "night", temp: s.min + r.int(s.max - s.min + 1) };
  },

  local: { mode: "day", draft: -1, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const mode = local.mode;
    const cur = state[mode];
    const shown = local.draft >= state.min && local.draft <= state.max && !state.locked ? local.draft : cur;
    const changed = shown !== cur;
    const need = needed(state, ctx);
    const yes = need.filter((u) => state.agreed.includes(u));
    const iAgree = state.agreed.includes(me);
    const near = [...state.prefs].sort((a, b) => Math.abs(a.temp - shown) - Math.abs(b.temp - shown));
    const far = near[near.length - 1];

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (state.locked) return;
      const dx = e.x - W / 2;
      const dy = e.y - 122;
      if (e.type === "down" && Math.hypot(dx, dy) < 40) return;
      let a = Math.atan2(dy, dx);
      if (a < A0 - Math.PI) a += 2 * Math.PI;
      let q = (a - A0) / SWEEP;
      if (q < 0) q += (2 * Math.PI) / SWEEP;
      if (q > 1.17) q = 0;
      q = Math.max(0, Math.min(1, q));
      const temp = Math.round(state.min + q * (state.max - state.min));
      if (temp !== local.draft) {
        if (local.draft >= 0) haptic("light");
        setLocal({ draft: temp });
      }
    };

    const modeChip = (m: Mode) => {
      const sel = m === mode;
      return (
        <button
          key={m}
          type="button"
          aria-pressed={sel}
          onClick={() => setLocal({ mode: m, draft: -1 })}
          style={{ flex: 1, minWidth: 0, height: 44, border: "none", borderRadius: 10, padding: "0 10px", background: sel ? c.selected : c.wash, color: c.text, font: "inherit", fontSize: 13, lineHeight: "16px", textAlign: "left", cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
        >
          <b style={{ fontSize: 15 }}>{`${m === "day" ? "Day" : "Night"} ${state[m]}°`}</b>
          {theme.width < 360 ? null : <span style={{ color: c.secondaryText }}>{m === "day" ? ` · ${hr(state.to)}–${hr(state.from)}` : ` · ${hr(state.from)}–${hr(state.to)}`}</span>}
        </button>
      );
    };

    let action;
    if (state.locked) action = <Button kind="secondary" onClick={() => dispatch({ t: "reopen" })}>Reopen</Button>;
    else if (changed)
      action = (
        <Button kind="primary" onClick={() => { haptic("medium"); dispatch({ t: "set", mode, temp: shown }); setLocal({ draft: -1, toast: local.toast + 1, msg: `${mode === "day" ? "Day" : "Night"} set to ${shown}°` }); }}>
          {`Set ${shown}°`}
        </Button>
      );
    else if (!iAgree)
      action = (
        <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "agree" }); setLocal({ toast: local.toast + 1, msg: "You agreed" }); }}>
          Agree
        </Button>
      );
    else action = <Button kind="secondary" disabled>Agreed</Button>;

    const line = state.locked
      ? `Locked · ${state.day}° day, ${state.night}° night`
      : changed
        ? far
          ? `${first(far.name)} is ${Math.abs(far.temp - shown)}° off · drag to fine-tune`
          : "Drag the dial to a truce"
        : `${yes.length} of ${need.length} agree`;
    const note = state.prefs.find((p) => p.note && p.id !== me && !p.visiting) ?? state.prefs.find((p) => p.note);

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub || (note ? `${first(note.name)}: “${note.note}”` : "Drag the dial to a truce")} />
        <Canvas
          height={H}
          drag
          label={`Thermostat at ${shown} degrees for ${mode}; ${state.prefs.map((p) => `${first(p.name)} ${p.temp}`).join(", ")}`}
          draw={(g, f) => drawDial(g, f, state, mode, shown, members, ctx)}
          onPointer={onPointer}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>{[modeChip("day"), modeChip("night")]}</div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {yes.length ? <Facepile users={yes} max={4} size={22} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
