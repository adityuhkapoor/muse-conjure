import { defineApp, Avatar, Button, Canvas, CardHeader, fitText, haptic, mix, pal, running, tween, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Hot water: one bathroom, one water heater, a whole apartment trying to shower before class. The
// tank is drawn on the left with its level; to the right the morning runs as a curve of hot water
// left, minute by minute, with everyone's shower as a block on the timeline under it. Where the
// curve hits the bottom, showers turn blue. Tap the timeline to put your shower there and watch the
// curve redraw. Nobody overlaps: there is one bathroom.

type Params = {
  /** Where: "412 Pine" */
  place: string;
  /** Clock hour the morning starts at, 0 to 23 */
  startHour: number;
  /** Minutes the timeline covers, 60 to 180 */
  window: number;
  /** Minutes of hot shower a full tank gives */
  tank: number;
  /** Tank refill per idle minute, in tenths of a minute (4 means 0.4) */
  refill: number;
  /** Your usual length in minutes, used when you tap */
  usual: number;
  /** Showers already booked: who, minutes after the start, how long, and what they said */
  showers: { who: string; at: number; len: number; said?: string }[];
};

// @params
const P: Params = {
  place: "412 Pine",
  startHour: 7,
  window: 120,
  tank: 35,
  refill: 4,
  usual: 10,
  showers: [
    { who: "Maya", at: 5, len: 10 },
    { who: "Will", at: 30, len: 25, said: "i do my best thinking in there" },
    { who: "Arun", at: 62, len: 12 },
    { who: "Calvin", at: 100, len: 10, said: "after alarm seven" },
  ],
};
// @end params

type Shower = { u: string; at: number; len: number; said: string; t: number };
type State = { place: string; startHour: number; window: number; tank: number; refill: number; usual: number; showers: Shower[]; at: number };
type Action = { t: "book"; at: number; len: number } | { t: "cancel" };
type Local = { len: number };

const H = 196;
const TANK_W = 64;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const overlaps = (a: { at: number; len: number }, b: { at: number; len: number }) => a.at < b.at + b.len && b.at < a.at + a.len;
const grow = tween({ duration: 900, easing: "decelerate" });

/** Hot water level (tenths of a minute) at the start of each minute, and cold minutes per person. */
function simulate(s: State) {
  const cap = s.tank * 10;
  let level = cap;
  const levels: number[] = [];
  const cold: Record<string, number> = {};
  const coldAt: Record<string, number> = {};
  for (let m = 0; m < s.window; m++) {
    levels.push(level);
    const who = s.showers.find((x) => m >= x.at && m < x.at + x.len);
    if (who) {
      if (level >= 10) level -= 10;
      else {
        cold[who.u] = (cold[who.u] ?? 0) + 1;
        if (coldAt[who.u] === undefined) coldAt[who.u] = m;
        level = 0;
      }
    } else level = Math.min(cap, level + s.refill);
  }
  levels.push(level);
  return { levels, cold, coldAt, cap };
}

/** The free slot where my shower is least cold, then the least cold for everyone, earliest first. */
function bestSlot(s: State, me: string, len: number): number | null {
  let best: number | null = null;
  let bestCold = Infinity;
  const others = s.showers.filter((x) => x.u !== me);
  for (let at = 0; at + len <= s.window; at++) {
    if (others.some((x) => overlaps(x, { at, len }))) continue;
    const cold = simulate({ ...s, showers: [...others, { u: me, at, len, said: "", t: 0 }].sort((a, b) => a.at - b.at) }).cold;
    const total = (cold[me] ?? 0) * 1000 + Object.values(cold).reduce((a, b) => a + b, 0);
    if (total < bestCold) {
      bestCold = total;
      best = at;
    }
  }
  return best;
}

function initState(ctx: Ctx): State {
  const s: State = {
    place: clean(P.place, 30),
    startHour: int(P.startHour, 0, 23, 7),
    window: int(P.window, 60, 180, 120),
    tank: int(P.tank, 5, 90, 35),
    refill: int(P.refill, 1, 20, 4),
    usual: int(P.usual, 3, 30, 10),
    showers: [],
    at: 0,
  };
  for (const x of Array.isArray(P.showers) ? P.showers : []) {
    const n = clean(x?.who, 40).toLowerCase();
    const m = ctx.members.find((y) => y.id === n || y.name.toLowerCase() === n);
    if (!m || s.showers.some((y) => y.u === m.id)) continue;
    const len = int(x.len, 3, 30, 10);
    const at = int(x.at, 0, s.window - len, 0);
    const sh = { u: m.id, at, len, said: clean(x.said, 50), t: 0 };
    if (s.showers.some((y) => overlaps(y, sh))) continue;
    s.showers.push(sh);
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Hot water",
  summary: (s, ctx) => {
    const sim = simulate(s);
    const cold = Object.keys(sim.cold).filter((u) => sim.cold[u]! > 0);
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    return cold.length ? `Showers at ${s.place || "home"}: ${cold.map(name).join(", ")} ${cold.length === 1 ? "gets" : "get"} cold water` : `Showers at ${s.place || "home"}: hot for all ${s.showers.length}`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "book") {
      if (!Number.isInteger(a.at) || !Number.isInteger(a.len) || a.len < 3 || a.len > 30 || a.at < 0 || a.at + a.len > s.window) return s;
      const mine = { u, at: a.at, len: a.len, said: "", t: meta.time };
      const others = s.showers.filter((x) => x.u !== u);
      if (others.some((x) => overlaps(x, mine))) return s;
      const said = s.showers.find((x) => x.u === u)?.said ?? "";
      return { ...s, showers: [...others, { ...mine, said }].sort((x, y) => x.at - y.at), at: meta.time };
    }
    if (a.t === "cancel") {
      if (!s.showers.some((x) => x.u === u)) return s;
      return { ...s, showers: s.showers.filter((x) => x.u !== u), at: meta.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const showers = s.showers.filter((x) => inChat(ctx, x.u));
    return showers.length === s.showers.length ? s : { ...s, showers };
  },

  invariants: {
    "one bathroom: no two showers overlap": (s) => s.showers.every((a, i) => s.showers.every((b, j) => i === j || !overlaps(a, b))),
    "one shower each": (s) => new Set(s.showers.map((x) => x.u)).size === s.showers.length,
    "showers fit the morning": (s) => s.showers.every((x) => Number.isInteger(x.at) && x.at >= 0 && x.len >= 3 && x.len <= 30 && x.at + x.len <= s.window),
    "showers are in time order": (s) => s.showers.every((x, i) => i === 0 || s.showers[i - 1]!.at < x.at),
    "the tank never goes below empty or above full": (s) => simulate(s).levels.every((l) => l >= 0 && l <= s.tank * 10),
    "showerers are in the chat": (s, ctx) => s.showers.every((x) => inChat(ctx, x.u)),
  },

  transitions: {
    "showers change only by booking or cancelling": (p, n, a) => a.t === "book" || a.t === "cancel" || JSON.stringify(p.showers) === JSON.stringify(n.showers),
    "every change redraws the curve": (p, n, _a, m) => p === n || n.at === m.time,
    "booking moves only your shower": (p, n, a, m) => {
      if (a.t !== "book" || p === n) return true;
      const keep = (s: State) => JSON.stringify(s.showers.filter((x) => x.u !== m.user).map((x) => [x.u, x.at, x.len]));
      const mine = n.showers.find((x) => x.u === m.user);
      return keep(p) === keep(n) && !!mine && mine.at === a.at && mine.len === a.len && mine.t === m.time;
    },
    "cancel removes only yours": (p, n, a, m) => a.t !== "cancel" || p === n || (!n.showers.some((x) => x.u === m.user) && n.showers.length === p.showers.length - 1),
    "only people in the chat book": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.9 ? { t: "book", at: r.int(s.window - 5), len: 3 + r.int(28) } : { t: "cancel" }),

  local: { len: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const sim = simulate(state);
    const mine = state.showers.find((x) => x.u === me);
    const len = local.len || mine?.len || state.usual;
    const plotX = TANK_W + 14;
    const plotW = W - plotX - 4;
    const curveTop = 18;
    const curveH = 96;
    const laneY = curveTop + curveH + 26;
    const laneH = 34;
    const X = (m: number) => plotX + (m / state.window) * plotW;
    const Y = (l: number) => curveTop + curveH - (l / sim.cap) * curveH;
    const clockOf = (m: number) => {
      const h = state.startHour + Math.floor(m / 60);
      const mm = m % 60;
      return `${((h + 11) % 12) + 1}:${mm < 10 ? "0" : ""}${mm}`;
    };
    const e = state.at ? running(state.at, 900) : null;
    const reveal = e === null ? 1 : grow(e);
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const hotC = pl.orange;
    const coldC = pl.blue;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // the tank
      const tx = 6;
      const ty = 20;
      const th = laneY + laneH - ty - 4;
      const now = Math.min(state.window, Math.round(state.window * reveal));
      const lvl = mine ? sim.levels[mine.at] ?? sim.cap : Math.min(sim.cap, sim.levels[now] ?? sim.cap);
      g.fillStyle = mix(c.text, c.card, 0.82);
      g.beginPath();
      g.roundRect(tx, ty, TANK_W - 12, th, 18);
      g.fill();
      const inner = th - 16;
      const fillH = (lvl / sim.cap) * inner;
      g.fillStyle = mix(coldC, c.card, 0.45);
      g.beginPath();
      g.roundRect(tx + 6, ty + 8, TANK_W - 24, inner, 12);
      g.fill();
      g.fillStyle = hotC;
      g.beginPath();
      g.roundRect(tx + 6, ty + 8 + inner - fillH, TANK_W - 24, fillH, 12);
      g.fill();
      // pipes and a dial
      g.fillStyle = mix(c.text, c.card, 0.6);
      g.fillRect(tx + 12, ty - 5, 6, 7);
      g.fillRect(tx + TANK_W - 30, ty - 5, 6, 7);
      g.beginPath();
      g.arc(tx + (TANK_W - 12) / 2, ty + th - 22, 9, 0, Math.PI * 2);
      g.fillStyle = c.card;
      g.fill();
      const pct = lvl / sim.cap;
      g.strokeStyle = c.text;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx + (TANK_W - 12) / 2, ty + th - 22);
      g.lineTo(tx + (TANK_W - 12) / 2 + 7 * Math.cos(Math.PI + pct * Math.PI), ty + th - 22 + 7 * Math.sin(Math.PI + pct * Math.PI));
      g.stroke();
      // the hot water curve across the morning
      g.strokeStyle = c.divider;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(plotX, curveTop + curveH + 0.5);
      g.lineTo(plotX + plotW, curveTop + curveH + 0.5);
      g.moveTo(plotX, curveTop + 0.5);
      g.lineTo(plotX + plotW, curveTop + 0.5);
      g.stroke();
      const area = new Path2D();
      area.moveTo(X(0), curveTop + curveH);
      for (let m = 0; m <= now; m++) area.lineTo(X(m), Y(sim.levels[m]!));
      area.lineTo(X(now), curveTop + curveH);
      area.closePath();
      g.fillStyle = mix(hotC, c.card, 0.65);
      g.fill(area);
      const line = new Path2D();
      for (let m = 0; m <= now; m++) (m ? line.lineTo.bind(line) : line.moveTo.bind(line))(X(m), Y(sim.levels[m]!));
      g.strokeStyle = hotC;
      g.lineWidth = 2.5;
      g.stroke(line);
      // cold stretches as blue bars on the floor of the chart
      g.fillStyle = coldC;
      for (const sh of state.showers) {
        const ca = sim.coldAt[sh.u];
        if (ca === undefined || ca > now) continue;
        g.fillRect(X(ca), curveTop + curveH - 6, X(Math.min(now, sh.at + sh.len)) - X(ca), 6);
      }
      // hour ticks
      g.font = `400 11px ${theme.type.family}`;
      g.fillStyle = c.secondaryText;
      g.textBaseline = "top";
      for (let m = 0; m <= state.window; m += 30) {
        const lab = clockOf(m);
        g.textAlign = m === 0 ? "left" : m === state.window ? "right" : "center";
        g.fillText(lab, X(m), curveTop + curveH + 6);
      }
      // the lane: one bathroom
      g.fillStyle = c.wash;
      g.beginPath();
      g.roundRect(plotX, laneY, plotW, laneH, 8);
      g.fill();
      for (const sh of state.showers) {
        const cold = sim.cold[sh.u] ?? 0;
        const x0 = X(sh.at);
        const x1 = X(sh.at + sh.len);
        g.fillStyle = mix(userColor(sh.u, theme), c.card, 0.55);
        g.beginPath();
        g.roundRect(x0, laneY + 3, Math.max(4, x1 - x0), laneH - 6, 6);
        g.fill();
        if (cold) {
          g.fillStyle = coldC;
          g.beginPath();
          g.roundRect(X(sim.coldAt[sh.u]!), laneY + laneH - 9, Math.max(3, x1 - X(sim.coldAt[sh.u]!)), 6, 3);
          g.fill();
        }
      }
      // drops falling from the tank while it redraws
      if (e !== null) {
        g.fillStyle = coldC;
        for (let k = 0; k < 4; k++) {
          const yy = ((f.now / 4 + k * 30) % 60);
          g.beginPath();
          g.arc(tx + 20 + k * 6, ty + th + 2 + yy / 6, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      }
      const tf = fitText(`${Math.round((lvl / sim.cap) * state.tank)} min hot`, TANK_W, { g, size: 11, weight: 600 });
      g.font = tf.font;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillStyle = c.text;
      g.fillText(tf.text, tx + (TANK_W - 12) / 2, 0);
      return e !== null;
    };

    const onPointer = (ev: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (ev.type !== "up" || ev.y < curveTop || ev.x < plotX) return;
      const m = Math.round(((ev.x - plotX) / plotW) * state.window - len / 2);
      const at = Math.max(0, Math.min(state.window - len, m));
      const mineNew = { at, len };
      const clash = state.showers.find((x) => x.u !== me && overlaps(x, mineNew));
      let slot = at;
      if (clash) {
        // slide to the nearest free gap
        const opts = [clash.at - len, clash.at + clash.len].filter((v) => v >= 0 && v + len <= state.window && !state.showers.some((x) => x.u !== me && overlaps(x, { at: v, len })));
        if (!opts.length) return;
        slot = opts.sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0]!;
      }
      haptic("light");
      dispatch({ t: "book", at: slot, len });
    };

    const myCold = mine ? sim.cold[me] ?? 0 : 0;
    const coldOnes = state.showers.filter((x) => (sim.cold[x.u] ?? 0) > 0);
    const quote = state.showers.find((x) => x.said);
    const msg = mine
      ? myCold
        ? `Cold from ${clockOf(sim.coldAt[me]!)} · ${myCold} min of it`
        : `${clockOf(mine.at)} for ${mine.len} min · hot the whole way`
      : coldOnes.length
        ? `${coldOnes.map((x) => nameOf(x.u)).join(" and ")} ${coldOnes.length === 1 ? "hits" : "hit"} cold water`
        : "Tap the timeline to claim a slot";

    return (
      <div>
        <CardHeader title={`Hot water${state.place ? ` · ${state.place}` : ""}`} subtitle={`One bathroom, one tank · ${state.tank} min of hot`} />
        <div style={{ position: "relative", height: laneY + laneH + 2 }}>
          <Canvas height={laneY + laneH + 2} label={`Hot water over the morning; ${state.showers.length} showers, ${coldOnes.length} get cold water`} draw={draw} onPointer={onPointer} />
          {state.showers.map((sh) => {
            const x = X(sh.at + sh.len / 2);
            return (
              <div key={sh.u} style={{ position: "absolute", left: x - 12, top: laneY + laneH / 2 - 12, display: "flex", pointerEvents: "none", borderRadius: 99, boxShadow: sh.u === me ? `0 0 0 2px ${c.primary}` : `0 0 0 2px ${c.card}` }}>
                <Avatar user={sh.u} size={24} />
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{msg}</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ell }}>{quote ? `${nameOf(quote.u)}: "${quote.said}"` : `The tank refills while nobody's in there`}</div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: c.secondaryText, marginRight: 2 }}>Mine</span>
          {(theme.width < 360 ? [5, 10, 25] : [5, 10, 15, 25]).map((n) => (
            <Button
              key={n}
              kind={len === n ? "secondary" : "deemphasized"}
              onClick={() => {
                setLocal({ len: n });
                if (mine) {
                  const at = Math.min(mine.at, state.window - n);
                  if (!state.showers.some((x) => x.u !== me && overlaps(x, { at, len: n }))) dispatch({ t: "book", at, len: n });
                }
              }}
            >
              {`${n}m`}
            </Button>
          ))}
        </div>
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mine ? "Tap the timeline to move" : "Or tap the timeline"}</span>
          {mine ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "cancel" })}>
              Skip
            </Button>
          ) : null}
          <Button
            kind="primary"
            onClick={() => {
              const best = bestSlot(state, me, len);
              if (best === null) return;
              haptic("success");
              dispatch({ t: "book", at: best, len });
            }}
          >
            Find hot water
          </Button>
        </div>
      </div>
    );
  },
});
