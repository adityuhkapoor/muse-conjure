import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Locked,
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
  type Theme,
} from "@muse/app";

// Sun window: the day at the lake as the sun's path across the sky. Everyone's hours are a band of
// their color under the arc, like a rainbow of who's there when; the golden wedge is when the most
// people overlap. Drag along the sky to set your hours, then lock the golden window.

type Params = {
  /** Where and which day */
  place: string;
  day: string;
  /** A weather line: "high 74°, sunset 6:52" */
  weather: string;
  /** The day's span, in whole hours, 24h clock */
  first: number;
  last: number;
  /** Hours people already said: from and to on the 24h clock */
  people: { who: string; from: number; to: number; note?: string }[];
};

// @params
const P: Params = {
  place: "Lake Wren",
  day: "Saturday",
  weather: "high 74°, sunset 6:52",
  first: 8,
  last: 19,
  people: [
    { who: "Maya", from: 10, to: 17, note: "i made a sunscreen schedule" },
    { who: "Arun", from: 11, to: 16 },
    { who: "Will", from: 12, to: 18, note: "the Sube leaves when I'm hungry" },
    { who: "Tsai Lin", from: 13, to: 19 },
    { who: "Calvin", from: 14, to: 19, note: "alarms permitting" },
  ],
};
// @end params

type Span = { id: string; from: number; to: number; note: string };
type State = { place: string; day: string; weather: string; first: number; last: number; people: Span[]; cast: string[]; locked: { from: number; to: number; count: number; at: number; by: string } | null };
type Action = { t: "set"; from: number; to: number } | { t: "clear" } | { t: "lock" };
type Local = { from: number; to: number; dragging: boolean; toast: number };

const H = 214;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const hr = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 24;
const label = (h: number) => (h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);
const short = (h: number) => (h === 12 ? "12" : `${h > 12 ? h - 12 : h}`);
/** People there during the hour starting at h. */
const countAt = (s: State, h: number) => s.people.filter((p) => p.from <= h && h < p.to).length;
/** The golden window: the longest run of hours with the most people there. */
function golden(s: State): { from: number; to: number; count: number } | null {
  let best: { from: number; to: number; count: number } | null = null;
  const max = Math.max(0, ...Array.from({ length: s.last - s.first }, (_, k) => countAt(s, s.first + k)));
  if (max < 1) return null;
  let h = s.first;
  while (h < s.last) {
    if (countAt(s, h) === max) {
      let e = h;
      while (e < s.last && countAt(s, e) === max) e++;
      if (!best || e - h > best.to - best.from) best = { from: h, to: e, count: max };
      h = e;
    } else h++;
  }
  return best;
}

function initState(ctx: Ctx): State {
  const first = hr(P.first) && P.first < 23 ? P.first : 8;
  const last = hr(P.last) && P.last > first + 1 ? P.last : Math.min(24, first + 11);
  const people: Span[] = [];
  const cast: string[] = [];
  for (const p of Array.isArray(P.people) ? P.people : []) {
    const name = clean(p?.who, 20);
    if (!name || people.length >= 6 || !hr(p.from) || !hr(p.to)) continue;
    const from = Math.max(first, Math.min(last - 1, p.from));
    const to = Math.max(from + 1, Math.min(last, p.to));
    const id = idFor(ctx, name);
    if (people.some((x) => x.id === id)) continue;
    cast.push(id);
    people.push({ id, from, to, note: clean(p.note, 44) });
  }
  return { place: clean(P.place, 24) || "the lake", day: clean(P.day, 16), weather: clean(P.weather, 36), first, last, people, cast, locked: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "set") {
    if (s.locked || !hr(a.from) || !hr(a.to) || a.from < s.first || a.to > s.last || a.from >= a.to) return s;
    const mine = s.people.find((p) => p.id === u);
    if (!mine && s.people.length >= 6) return s;
    const span = { id: u, from: a.from, to: a.to, note: "" };
    return { ...s, people: mine ? s.people.map((p) => (p.id === u ? span : p)) : [...s.people, span] };
  }
  if (a.t === "clear") {
    if (s.locked || !s.people.some((p) => p.id === u)) return s;
    return { ...s, people: s.people.filter((p) => p.id !== u) };
  }
  if (a.t === "lock") {
    const g = golden(s);
    if (s.locked || !g || g.count < 2) return s;
    return { ...s, locked: { ...g, at: Math.max(1, m.time), by: u } };
  }
  return s;
}

function Face({ id, members, size, theme }: { id: string; members: Member[]; size: number; theme: Theme }) {
  const m = members.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
  if (m) return <Avatar user={m} size={size} />;
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: userColor(id || "?", theme), color: theme.color.onPrimary, fontSize: Math.round(size * 0.5), fontWeight: 600 }}>
      {(id.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export default defineApp<State, Action, Local>({
  name: "Sun window",
  summary: (s) => {
    const g = s.locked ?? golden(s);
    return g ? `${s.place}${s.day ? ` ${s.day}` : ""}: ${label(g.from)} to ${label(g.to)}, ${g.count} there${s.locked ? " · locked" : ""}` : `${s.place}: nobody has said their hours yet`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const people = s.people.filter((p) => inChat(ctx, p.id) || s.cast.includes(p.id));
    return people.length === s.people.length ? s : { ...s, people };
  },

  invariants: {
    "hours sit inside the day and run forward": (s) => s.people.every((p) => hr(p.from) && hr(p.to) && p.from >= s.first && p.to <= s.last && p.from < p.to),
    "one band per person, six at most": (s) => new Set(s.people.map((p) => p.id)).size === s.people.length && s.people.length <= 6,
    "bands belong to the chat or the people named": (s, ctx) => s.people.every((p) => inChat(ctx, p.id) || s.cast.includes(p.id)),
    "a locked window is a real stretch of the day": (s) => s.locked === null || (s.locked.from >= s.first && s.locked.to <= s.last && s.locked.from < s.locked.to && s.locked.count >= 2 && s.locked.at > 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "setting hours changes only my band": (p, n, a, m) => {
      if (a.t !== "set" || p === n) return true;
      const mine = n.people.find((x) => x.id === m.user);
      return !!mine && mine.from === a.from && mine.to === a.to && n.people.filter((x) => x.id !== m.user).every((x) => p.people.some((y) => y.id === x.id && y.from === x.from && y.to === x.to));
    },
    "clearing removes only my band": (p, n, a, m) => a.t !== "clear" || p === n || (!n.people.some((x) => x.id === m.user) && n.people.length === p.people.length - 1),
    "locking takes the golden window": (p, n, a, m) => {
      if (a.t !== "lock" || p === n) return true;
      const g = golden(p);
      return p.locked === null && !!g && !!n.locked && n.locked.from === g.from && n.locked.to === g.to && n.locked.count === g.count && n.locked.by === m.user;
    },
    "hours freeze once locked": (p, n) => p.locked === null || p === n,
    "only lock locks": (p, n, a) => a.t === "lock" || n.locked === p.locked,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.1) return { t: "lock" };
    if (k < 0.2) return { t: "clear" };
    const from = s.first + r.int(Math.max(1, s.last - s.first));
    return { t: "set", from, to: Math.min(s.last, from + 1 + r.int(5)) };
  },

  local: { from: -1, to: -1, dragging: false, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const cx = W / 2;
    const base = H - 34;
    const span = state.last - state.first;
    const mine = state.people.find((x) => x.id === me);
    const hasDraft = local.from >= 0 && local.to > local.from;
    const shown = state.people.map((x) => (x.id === me && hasDraft ? { ...x, from: local.from, to: local.to } : x));
    if (!mine && hasDraft) shown.push({ id: me, from: local.from, to: local.to, note: "" });
    const view = { ...state, people: shown };
    const g = state.locked ?? golden(view);
    const n = shown.length;
    const R = Math.min(base - 32, W / 2 - 28);
    const r0 = Math.max(36, R - 10 - Math.max(0, n - 1) * 11);
    const radius = (k: number) => r0 + k * 11;
    const ang = (h: number) => Math.PI + (Math.PI * (h - state.first)) / span;
    const hourAt = (x: number, y: number) => {
      const a = Math.atan2(y - base, x - cx);
      const t = a < 0 ? (a + Math.PI) / Math.PI : x < cx ? 0 : 1;
      return Math.max(state.first, Math.min(state.last, Math.round(state.first + t * span)));
    };

    const draw = (gx: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // sky and lake
      const sky = gx.createLinearGradient(0, 0, 0, base);
      sky.addColorStop(0, dk ? mix(p.dark, p.blue, 0.25) : mix(p.sky, c.card, 0.2));
      sky.addColorStop(1, dk ? mix(p.dark, p.orange, 0.18) : mix(p.wall, c.card, 0.2));
      gx.fillStyle = sky;
      gx.fillRect(0, 0, w, base);
      gx.fillStyle = dk ? mix(p.blue, c.wash, 0.55) : mix(p.blue, c.card, 0.5);
      gx.fillRect(0, base, w, H - base);
      gx.fillStyle = dk ? mix(p.green, c.wash, 0.5) : mix(p.green, c.card, 0.35);
      gx.beginPath();
      gx.moveTo(0, base);
      gx.quadraticCurveTo(w * 0.12, base - 26, w * 0.26, base);
      gx.moveTo(w * 0.7, base);
      gx.quadraticCurveTo(w * 0.86, base - 34, w, base - 8);
      gx.lineTo(w, base);
      gx.fill();
      gx.strokeStyle = dk ? mix(c.text, c.wash, 0.6) : c.card;
      gx.lineWidth = 1.5;
      gx.beginPath();
      for (let k = 0; k < 4; k++) {
        const x = w * (0.15 + k * 0.22) + Math.sin(f.now / 900 + k) * 6;
        gx.moveTo(x, base + 12 + (k % 2) * 8);
        gx.quadraticCurveTo(x + 8, base + 8 + (k % 2) * 8, x + 16, base + 12 + (k % 2) * 8);
      }
      gx.stroke();
      // the golden wedge
      if (g) {
        gx.fillStyle = mix(p.yellow, c.card, dk ? 0.55 : 0.45);
        gx.beginPath();
        gx.moveTo(cx, base);
        gx.arc(cx, base, R + 6, ang(g.from), ang(g.to));
        gx.closePath();
        gx.fill();
      }
      // everyone's band
      gx.lineCap = "butt";
      shown.forEach((pp, k) => {
        const rr = radius(k);
        gx.strokeStyle = dk ? mix(c.text, c.wash, 0.75) : mix(c.card, c.divider, 0.4);
        gx.lineWidth = 8;
        gx.beginPath();
        gx.arc(cx, base, rr, Math.PI, Math.PI * 2);
        gx.stroke();
        gx.strokeStyle = pp.id === me && hasDraft ? c.primary : userColor(pp.id, theme);
        gx.beginPath();
        gx.arc(cx, base, rr, ang(pp.from), ang(pp.to));
        gx.stroke();
      });
      // hour ticks
      gx.fillStyle = c.text;
      gx.strokeStyle = c.text;
      gx.lineWidth = 1;
      gx.beginPath();
      for (let h = state.first; h <= state.last; h++) {
        const a = ang(h);
        const big = (h - state.first) % 3 === 0 || h === state.last;
        gx.moveTo(cx + (R + 2) * Math.cos(a), base + (R + 2) * Math.sin(a));
        gx.lineTo(cx + (R + (big ? 9 : 5)) * Math.cos(a), base + (R + (big ? 9 : 5)) * Math.sin(a));
      }
      gx.stroke();
      gx.textAlign = "center";
      for (let h = state.first; h <= state.last; h += 3) {
        const a = ang(h);
        const ft = fitText(short(h), 22, { g: gx, size: 11, min: 10, weight: 600 });
        gx.fillText(ft.text, cx + (R + 17) * Math.cos(a), base + (R + 17) * Math.sin(a) + 4);
      }
      // the sun, drifting along the arc over the golden window
      const lo = g ? g.from : state.first, hi = g ? g.to : state.last;
      const t = 0.5 - 0.5 * Math.cos(f.now / 2600);
      const sa = ang(lo + (hi - lo) * t);
      const sx = cx + (R + 1) * Math.cos(sa), sy = base + (R + 1) * Math.sin(sa);
      gx.fillStyle = p.yellow;
      gx.beginPath();
      gx.arc(sx, sy, 11, 0, Math.PI * 2);
      gx.fill();
      gx.strokeStyle = p.yellow;
      gx.lineWidth = 2;
      gx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + f.now / 3000;
        gx.moveTo(sx + 14 * Math.cos(a), sy + 14 * Math.sin(a));
        gx.lineTo(sx + 18 * Math.cos(a), sy + 18 * Math.sin(a));
      }
      gx.stroke();
      return true;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (state.locked || e.y > base + 6) return;
      const h = hourAt(e.x, e.y);
      if (e.type === "down") setLocal({ dragging: true, from: Math.min(h, state.last - 1), to: Math.min(h, state.last - 1) + 1 });
      else if (e.type === "move" && local.dragging) {
        const anchor = local.from;
        setLocal(h > anchor ? { to: h } : { from: Math.min(h, anchor), to: Math.max(local.to, anchor + 1) });
      } else if (e.type === "up") setLocal({ dragging: false });
    };

    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const note = [...state.people].reverse().find((x) => x.note);
    const save = () => {
      if (!hasDraft) return;
      haptic("success");
      dispatch({ t: "set", from: local.from, to: local.to });
      setLocal({ from: -1, to: -1, toast: local.toast + 1 });
    };

    return (
      <div>
        <CardHeader title={`${state.place}${state.day ? `, ${state.day}` : ""}`} subtitle={`${state.weather ? `${state.weather} · ` : ""}${state.people.length} said their hours`} />
        <div style={{ position: "relative", height: H, marginTop: 4, borderRadius: 14, overflow: "hidden" }}>
          <Canvas height={H} drag label={g ? `Sun path from ${label(state.first)} to ${label(state.last)}; best ${label(g.from)} to ${label(g.to)} with ${g.count} there` : "Sun path over the lake; nobody has said their hours"} draw={draw} onPointer={onPointer} />
          {/* faces at the start of each band */}
          {shown.map((pp, k) => {
            const a = ang(pp.from);
            const rr = radius(k);
            return (
              <span key={pp.id} style={{ position: "absolute", left: cx + rr * Math.cos(a) - 9, top: base + rr * Math.sin(a) - 9, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${pp.id === me ? c.primary : c.card}`, pointerEvents: "none" }}>
                <Face id={pp.id} members={members} size={18} theme={theme} />
              </span>
            );
          })}
          {g ? (
            <div style={{ position: "absolute", left: cx - 60, width: 120, top: base - 40, textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 800, color: c.text }}>{`${label(g.from)}–${label(g.to)}`}</div>
              <div style={{ fontSize: 12, lineHeight: "14px", color: c.text }}>{`${g.count} there`}</div>
            </div>
          ) : (
            <div style={{ position: "absolute", left: cx - 80, width: 160, top: base - 36, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.text, pointerEvents: "none" }}>Drag across the sky to say when you're there</div>
          )}
        </div>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {hasDraft
            ? `You: ${label(local.from)} to ${label(local.to)} · save to add your band`
            : mine
              ? `You: ${label(mine.from)} to ${label(mine.to)} · drag the sky to change it`
              : note
                ? `${nameOf(note.id)}: “${note.note}”`
                : "Drag across the sky to set your hours"}
        </div>
        <div style={{ marginTop: 8 }}>
          {state.locked ? (
            <Locked detail={`${state.locked.count} there · ${state.weather || state.day}`}>{`${state.place}, ${label(state.locked.from)} to ${label(state.locked.to)}`}</Locked>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                {hasDraft ? (
                  <Button kind="primary" wide onClick={save}>Save my hours</Button>
                ) : (
                  <Button kind="primary" wide disabled={!g || g.count < 2} onClick={() => { haptic("success"); dispatch({ t: "lock" }); }}>
                    {g && g.count >= 2 ? `Lock ${label(g.from)}–${label(g.to)}` : "Needs two people"}
                  </Button>
                )}
              </div>
              {hasDraft ? <Button kind="secondary" onClick={() => setLocal({ from: -1, to: -1 })}>Cancel</Button> : mine ? <Button kind="secondary" onClick={() => dispatch({ t: "clear" })}>Not going</Button> : null}
            </div>
          )}
        </div>
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`Your band: ${label(mine.from)} to ${label(mine.to)}`}</Toast> : null}
      </div>
    );
  },
});
