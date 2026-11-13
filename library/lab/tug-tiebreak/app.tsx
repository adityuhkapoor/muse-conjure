import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  rng,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Bowling vs karaoke, 3–3, nobody budging. A 10-second tap war: two camps on a rope over a mud
// puddle. Friends who aren't here pull at their usual strength; you tap as fast as you can. The
// losing camp slides into the mud and the winner's plan posts. No rematches.

type Params = {
  /** Card title: "Tiebreak" */
  title: string;
  /** Under the title: "bowling vs karaoke · 3–3 · nobody budging" */
  sub: string;
  /** Seconds the war lasts (5 to 20). */
  seconds: number;
  /** Footnote on the result: "No rematches, Will" */
  rule: string;
  /** Exactly two camps. plan: what posts if they win. team: name and grip (pulls they put in over the whole war if they're not tapping themselves). */
  sides: { name: string; icon: "pin" | "mic" | "ball" | "star"; plan: string; team: { name: string; grip: number }[] }[];
};

// @params
const P: Params = {
  title: "Tiebreak",
  sub: "bowling vs karaoke · 3–3 · nobody budging",
  seconds: 10,
  rule: "No rematches, Will",
  sides: [
    { name: "Bowling", icon: "pin", plan: "Midtown Lanes · 9pm", team: [{ name: "Will", grip: 24 }, { name: "Arun", grip: 14 }, { name: "Calvin", grip: 11 }] },
    { name: "Karaoke", icon: "mic", plan: "Karaoke at Larkin · 9pm", team: [{ name: "Tsai Lin", grip: 19 }, { name: "Aditya", grip: 13 }, { name: "Maya", grip: 12 }] },
  ],
};
// @end params

type Icon = "pin" | "mic" | "ball" | "star";
type Side = { name: string; icon: Icon; plan: string };
type Puller = { who: string; name: string; side: number; grip: number; pulls: number; auto: boolean };
type State = {
  title: string;
  sub: string;
  ms: number;
  rule: string;
  sides: Side[];
  pullers: Puller[];
  start: number;
  result: { winner: number; at: number; l: number; r: number } | null;
  going: string[];
};
type Action = { t: "pull"; side: number } | { t: "call" } | { t: "in" };
type Local = { taps: number; burst: number };

const TAU = Math.PI * 2;
const CH = 196;
const ICONS: Icon[] = ["pin", "mic", "ball", "star"];
const MAX_PULLS = 400;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const memberOf = (p: Puller): Member => ({ id: p.who, name: p.name });
const firstName = (n: string) => n.split(" ")[0] ?? n;
/** Pull total for a side at elapsed ms: tapped pulls plus the absent friends' grip so far. */
function total(s: State, side: number, elapsed: number) {
  const k = Math.max(0, Math.min(1, elapsed / s.ms));
  return s.pullers.filter((p) => p.side === side).reduce((a, p) => a + p.pulls + (p.auto ? Math.floor(p.grip * k) : 0), 0);
}
const over = (s: State, now: number) => s.start > 0 && now >= s.start + s.ms;
const decide = (s: State, seed: number) => {
  const l = total(s, 0, s.ms);
  const r = total(s, 1, s.ms);
  return { l, r, winner: l === r ? rng(seed).int(2) : l > r ? 0 : 1 };
};

function initState(ctx: Ctx): State {
  const raw = (P.sides ?? []).slice(0, 2);
  const sides: Side[] = raw.map((x, i) => ({ name: clean(x.name, 16) || (i ? "Them" : "Us"), icon: ICONS.includes(x.icon) ? x.icon : "star", plan: clean(x.plan, 40) }));
  while (sides.length < 2) sides.push({ name: sides.length ? "Karaoke" : "Bowling", icon: "star", plan: "" });
  const pullers: Puller[] = [];
  raw.forEach((x, side) => {
    for (const t of x.team ?? []) {
      if (pullers.length >= 10) break;
      const name = clean(t.name, 20);
      if (!name) continue;
      const m = ctx.members.find((y) => y.name.toLowerCase() === name.toLowerCase());
      const who = m ? m.id : `~${name}`;
      if (pullers.some((p) => p.who === who)) continue;
      pullers.push({ who, name, side, grip: Number.isInteger(t.grip) ? Math.min(60, Math.max(0, t.grip)) : 10, pulls: 0, auto: !m });
    }
  });
  const ms = Number.isInteger(P.seconds) ? Math.min(20, Math.max(5, P.seconds)) * 1000 : 10000;
  return { title: clean(P.title, 40) || "Tiebreak", sub: clean(P.sub, 60), ms, rule: clean(P.rule, 40), sides, pullers, start: 0, result: null, going: [] };
}

function icon(g: CanvasRenderingContext2D, t: Theme, k: Icon, x: number, y: number, fill: string) {
  const c = t.color;
  g.beginPath();
  if (k === "pin") {
    g.ellipse(x, y - 6, 3.2, 3.6, 0, 0, TAU);
    g.ellipse(x, y + 4, 4.6, 6, 0, 0, TAU);
    g.fillStyle = fill;
    g.fill();
    g.beginPath();
    g.rect(x - 3.4, y - 2.2, 6.8, 1.6);
    g.fillStyle = c.negative;
    g.fill();
  } else if (k === "mic") {
    g.roundRect(x - 4, y - 9, 8, 11, 4);
    g.fillStyle = fill;
    g.fill();
    g.beginPath();
    g.rect(x - 1, y + 2, 2, 7);
    g.rect(x - 4, y + 8, 8, 2);
    g.fill();
  } else {
    g.arc(x, y, 7, 0, TAU);
    g.fillStyle = fill;
    g.fill();
  }
}

function drawTug(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const ground = CH - 40;
  const res = s.result;
  const elapsed = s.start ? Math.min(s.ms, f.now - s.start) : 0;
  const live = s.start > 0 && !res && f.now < s.start + s.ms + 500;
  const L = res ? res.l : total(s, 0, elapsed);
  const R = res ? res.r : total(s, 1, elapsed);
  const diff = L - R;
  const slide = res ? running(res.at, 1600) : null;
  const k = res ? (slide === null ? 1 : slide / 1600) : 0;
  const shift = Math.max(-W * 0.07, Math.min(W * 0.07, -diff * 1.2)) + (res ? (res.winner === 0 ? -1 : 1) * k * W * 0.05 : 0);

  // Sky and grass.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.78 : 0.88);
  g.fill();
  g.beginPath();
  g.roundRect(0, ground, W, CH - ground, [0, 0, 14, 14]);
  g.fillStyle = mix(c.series3, c.card, dk ? 0.45 : 0.5);
  g.fill();
  // Mud puddle in the middle, with bubbles.
  const mx = W / 2;
  g.beginPath();
  g.ellipse(mx, ground + 6, W * 0.17, 13, 0, 0, TAU);
  g.fillStyle = mix(c.series5, ink, 0.55);
  g.fill();
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = mx - W * 0.1 + i * W * 0.065;
    const by = ground + 4 + (i % 2) * 4;
    const br = 2 + ((f.now / 300 + i) % 2);
    g.moveTo(bx + br, by);
    g.arc(bx, by, br, 0, TAU);
  }
  g.strokeStyle = mix(c.series5, c.card, 0.2);
  g.lineWidth = 1;
  g.stroke();
  // Center line.
  g.setLineDash([3, 4]);
  g.beginPath();
  g.moveTo(mx, 26);
  g.lineTo(mx, ground - 4);
  g.lineWidth = 1.5;
  g.strokeStyle = mix(c.secondaryText, c.card, 0.4);
  g.stroke();
  g.setLineDash([]);

  // Rope with the flag.
  const ry = ground - 34;
  g.beginPath();
  g.moveTo(8, ry + 4);
  g.quadraticCurveTo(W / 2 + shift, ry + 6 + (live ? Math.sin(f.now / 60) * 1.5 : 0), W - 8, ry + 4);
  g.lineWidth = 4;
  g.lineCap = "round";
  g.strokeStyle = mix(c.series5, c.series2, 0.5);
  g.stroke();
  g.beginPath();
  g.moveTo(mx + shift, ry + 5);
  g.lineTo(mx + shift - 7, ry + 22);
  g.lineTo(mx + shift + 7, ry + 22);
  g.closePath();
  g.fillStyle = c.negative;
  g.fill();

  // Pullers: each side spaced out from its end, leaning back.
  for (const side of [0, 1]) {
    const team = s.pullers.filter((p) => p.side === side);
    const dir = side === 0 ? -1 : 1;
    const lost = res && res.winner !== side;
    team.forEach((p, i) => {
      const gap = Math.min(40, (W / 2 - W * 0.17 - W * 0.07 - 26) / Math.max(1, team.length - 1));
      const baseX = mx + dir * (W * 0.17 + i * gap) + shift;
      let x = baseX;
      let y = ground - 2;
      let lean = dir * (0.25 + (live ? 0.08 * Math.sin(f.now / 90 + i) : 0));
      if (lost) {
        // Slide toward the mud, nearest first, and sink a little.
        const into = Math.min(1, k * 1.4 - i * 0.12);
        if (into > 0) {
          x = baseX + (mx + dir * (8 + i * 16) - baseX) * into;
          y = ground + 6 * into;
          lean = -dir * 0.5 * into;
        }
      } else if (res) lean = dir * 0.1;
      const col = userColor(memberOf(p), t);
      g.save();
      g.translate(x, y);
      g.rotate(lean);
      g.beginPath();
      g.roundRect(-7, -28, 14, 24, 6);
      g.fillStyle = mix(col, ink, 0.2);
      g.fill();
      g.beginPath();
      g.moveTo(-4, -5);
      g.lineTo(-6 - dir * 2, 0);
      g.moveTo(4, -5);
      g.lineTo(6 - dir * 2, 0);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.strokeStyle = mix(col, ink, 0.4);
      g.stroke();
      g.beginPath();
      g.arc(0, -38, 10, 0, TAU);
      g.fillStyle = lost && k > 0.5 ? mix(col, c.series5, 0.45) : col;
      g.fill();
      if (p.who === me) {
        g.lineWidth = 2;
        g.strokeStyle = c.primary;
        g.stroke();
      }
      g.beginPath();
      g.arc(-3.5 * -dir, -39, 1.4, 0, TAU);
      g.moveTo(3.5 * -dir + 1.4, -39);
      g.arc(3.5 * -dir, -39, 1.4, 0, TAU);
      g.fillStyle = ink;
      g.fill();
      g.beginPath();
      if (lost && k > 0.3) g.arc(0, -32, 3, 1.15 * Math.PI, 1.85 * Math.PI);
      else if (res) g.arc(0, -36, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
      else (g.moveTo(-3, -34), g.lineTo(3, -34));
      g.lineWidth = 1.5;
      g.strokeStyle = ink;
      g.stroke();
      g.restore();
      // Name under each.
      const nm = fitText(p.who === me ? "You" : firstName(p.name), gap < 40 ? Math.max(24, gap * 2 - 6) : 44, { g, size: 11, min: 10, weight: 600 });
      g.font = nm.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      g.fillText(nm.text, baseX, ground + (gap < 40 && i % 2 ? 31 : 19));
    });
    // Camp sign and count.
    const sx = side === 0 ? 10 : W - 10;
    const sd = s.sides[side]!;
    const name = fitText(sd.name, W * 0.3, { g, size: 13, min: 10, weight: 700 });
    g.font = name.font;
    const nw = g.measureText(name.text).width;
    const bx = side === 0 ? sx : sx - nw - 50;
    g.beginPath();
    g.roundRect(bx, 8, nw + 50, 24, 12);
    g.fillStyle = c.card;
    g.fill();
    icon(g, t, sd.icon, bx + 13, 20, side === 0 ? c.series1 : c.series6);
    g.textAlign = "left";
    g.fillStyle = c.text;
    g.fillText(name.text, bx + 24, 20.5);
    g.font = `700 12px ${t.type.family}`;
    g.fillText(`${side === 0 ? L : R}`, bx + 30 + nw, 20.5);
  }

  // Timer arc in the middle top.
  if (s.start && !res) {
    const left = Math.max(0, s.start + s.ms - f.now);
    g.beginPath();
    g.arc(mx, 20, 13, 0, TAU);
    g.fillStyle = c.card;
    g.fill();
    g.beginPath();
    g.arc(mx, 20, 13, -Math.PI / 2, -Math.PI / 2 + (left / s.ms) * TAU);
    g.lineWidth = 3;
    g.strokeStyle = left < 3000 ? c.negative : c.primary;
    g.stroke();
    g.font = `700 11px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(`${Math.ceil(left / 1000)}`, mx, 20.5);
  }
  return live || waiting || slide !== null;
}

export default defineApp<State, Action, Local>({
  name: "Tug tiebreak",
  summary: (s) => {
    if (s.result) return `${s.sides[s.result.winner]!.name} won ${Math.max(s.result.l, s.result.r)}–${Math.min(s.result.l, s.result.r)} · ${s.sides[s.result.winner]!.plan}`;
    if (s.start) return `${s.title}: tug of war under way`;
    return `${s.title}: ${s.sides[0]!.name} vs ${s.sides[1]!.name}, nobody's pulled yet`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "pull") {
      if (s.result) return s;
      if (over(s, m.time)) {
        const d = decide(s, m.seed);
        return { ...s, result: { ...d, at: m.time }, going: [] };
      }
      const i = s.pullers.findIndex((p) => p.who === m.user);
      if (i < 0) {
        if (a.side !== 0 && a.side !== 1) return s;
        if (s.pullers.length >= 12) return s;
        const name = ctx.members.find((x) => x.id === m.user)?.name ?? "Friend";
        return { ...s, start: s.start || m.time, pullers: [...s.pullers, { who: m.user, name, side: a.side, grip: 0, pulls: 1, auto: false }] };
      }
      const p = s.pullers[i]!;
      if (p.pulls >= MAX_PULLS) return s;
      return { ...s, start: s.start || m.time, pullers: s.pullers.map((x, k) => (k === i ? { ...x, pulls: x.pulls + 1 } : x)) };
    }
    if (a.t === "call") {
      if (s.result || !over(s, m.time)) return s;
      const d = decide(s, m.seed);
      return { ...s, result: { ...d, at: m.time }, going: [] };
    }
    if (a.t === "in") {
      if (!s.result) return s;
      return { ...s, going: s.going.includes(m.user) ? s.going.filter((u) => u !== m.user) : [...s.going, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let pullers = s.pullers.map((p) => (seeded(p.who) || inChat(ctx, p.who) ? p : { ...p, who: `~${p.name}` }));
    pullers = pullers.filter((p, i) => pullers.findIndex((x) => x.who === p.who) === i);
    for (const m of ctx.members) {
      const k = pullers.findIndex((p) => seeded(p.who) && p.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0 && !pullers.some((p) => p.who === m.id)) pullers = pullers.map((p, j) => (j === k ? { ...p, who: m.id } : p));
    }
    return { ...s, pullers, going: s.going.filter((u) => inChat(ctx, u)) };
  },

  invariants: {
    "two camps": (s) => s.sides.length === 2,
    "one rope spot per person": (s) => new Set(s.pullers.map((p) => p.who)).size === s.pullers.length && s.pullers.every((p) => p.side === 0 || p.side === 1),
    "pulls are whole and capped": (s) => s.pullers.every((p) => Number.isInteger(p.pulls) && p.pulls >= 0 && p.pulls <= MAX_PULLS && Number.isInteger(p.grip) && p.grip >= 0),
    "pulls only after the start": (s) => s.start > 0 || s.pullers.every((p) => p.pulls === 0),
    "the winner pulled more, or won the coin on a tie": (s) => s.result === null || (s.result.l === s.result.r ? s.result.winner === 0 || s.result.winner === 1 : (s.result.winner === 0) === s.result.l > s.result.r),
    "the result counts every pull": (s) => s.result === null || (s.result.l === total(s, 0, s.ms) && s.result.r === total(s, 1, s.ms)),
    "going only after the result, once each": (s, ctx) => (s.result !== null || s.going.length === 0) && new Set(s.going).size === s.going.length && s.going.every((u) => inChat(ctx, u)),
    "live pullers are in the chat": (s, ctx) => s.pullers.every((p) => seeded(p.who) || inChat(ctx, p.who)),
  },

  transitions: {
    "a pull in time adds one for the sender": (p, n, a, m) => {
      if (a.t !== "pull" || p === n || n.result) return true;
      const before = p.pullers.find((x) => x.who === m.user)?.pulls ?? 0;
      const after = n.pullers.find((x) => x.who === m.user)?.pulls ?? 0;
      const others = n.pullers.filter((x) => x.who !== m.user).every((x) => p.pullers.find((y) => y.who === x.who)?.pulls === x.pulls);
      return after === before + 1 && others && m.time < (p.start || m.time) + p.ms && n.start === (p.start || m.time);
    },
    "nobody switches camps": (p, n) => n.pullers.every((x) => (p.pullers.find((y) => y.who === x.who)?.side ?? x.side) === x.side),
    "it ends only after the time is up": (p, n, _a, m) => p.result !== null || n.result === null || (p.start > 0 && m.time >= p.start + p.ms && n.result.at === m.time),
    "the result is final": (p, n) => p.result === null || (JSON.stringify(n.result) === JSON.stringify(p.result) && n.pullers.every((x, i) => x.pulls === p.pullers[i]?.pulls)),
    "going toggles only the sender": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const diff = [...p.going.filter((u) => !n.going.includes(u)), ...n.going.filter((u) => !p.going.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "unknown actions change nothing": (p, n, a) => a.t === "pull" || a.t === "call" || a.t === "in" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.result) return { t: "in" };
    if (s.start && r.next() < 0.2) return { t: "call" };
    const mine = s.pullers.find((p) => p.who === user);
    return { t: "pull", side: mine ? mine.side : r.int(2) };
  },

  local: { taps: 0, burst: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const res = confirmed.result;
    const mine = s.pullers.find((p) => p.who === me);
    const now = s.start && !res ? clock.value : 0;
    const done = !res && over(s, now);
    const waiting = pending && !!s.result !== !!confirmed.result;
    const label = `Tug of war: ${s.sides[0]!.name} ${s.pullers.filter((p) => p.side === 0).map((p) => p.name).join(", ")} against ${s.sides[1]!.name} ${s.pullers.filter((p) => p.side === 1).map((p) => p.name).join(", ")}${res ? `. ${s.sides[res.winner]!.name} won ${res.l} to ${res.r}` : ""}`;
    const pull = (side: number) => {
      haptic("light");
      setLocal({ taps: local.taps + 1 });
      dispatch({ t: "pull", side });
    };
    const left = s.start ? Math.max(0, Math.ceil((s.start + s.ms - now) / 1000)) : Math.round(s.ms / 1000);

    let bottom;
    if (res) {
      const w = s.sides[res.winner]!;
      const winners = s.pullers.filter((p) => p.side === res.winner);
      bottom = (
        <div style={{ position: "relative" }}>
          {local.burst > 0 ? (
            <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
              <Burst key={local.burst} emoji="🏆" />
            </div>
          ) : null}
          <Locked detail={`${w.name} won ${Math.max(res.l, res.r)}–${Math.min(res.l, res.r)}${s.rule ? ` · ${s.rule}` : ""}`}>{w.plan || w.name}</Locked>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
            {confirmed.going.length ? <Facepile users={confirmed.going.map((u) => ({ id: u, name: s.pullers.find((p) => p.who === u)?.name ?? "Friend" }))} max={5} size={24} /> : null}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{confirmed.going.length ? `${confirmed.going.length} going` : `${winners.map((p) => firstName(p.name)).join(", ")} won it`}</span>
            <Button
              kind={confirmed.going.includes(me) ? "secondary" : "primary"}
              onClick={() => {
                if (!confirmed.going.includes(me)) setLocal({ burst: local.burst + 1 });
                dispatch({ t: "in" });
              }}
            >
              {confirmed.going.includes(me) ? "Not going" : "I'm in"}
            </Button>
          </div>
          {local.burst > 0 ? <Toast key={local.burst}>See you there</Toast> : null}
        </div>
      );
    } else if (done || waiting) {
      bottom = (
        <div>
          <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 15, color: c.text }}>Time. Hands off the rope.</div>
          <Button kind="primary" wide disabled={waiting} onClick={() => dispatch({ t: "call" })}>
            Call it
          </Button>
        </div>
      );
    } else if (mine) {
      bottom = (
        <div>
          <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>
            {s.start ? `${left}s left · ${mine.pulls} pulls from you` : `${left} seconds once anyone pulls · tap as fast as you can`}
          </div>
          <Button kind="primary" wide onClick={() => pull(mine.side)}>
            {`Pull for ${s.sides[mine.side]!.name.toLowerCase()}`}
          </Button>
        </div>
      );
    } else {
      bottom = (
        <div>
          <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText }}>Pick a side and pull</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[0, 1].map((k) => (
              <Button key={k} kind="secondary" wide onClick={() => pull(k)}>
                {s.sides[k]!.name}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} draw={(g, f) => drawTug(g, f, { ...s, result: confirmed.result }, me, waiting)} onPointer={(e) => e.type === "down" && mine && !res && !done && pull(mine.side)} />
        <div style={{ marginTop: 6 }}>{bottom}</div>
      </div>
    );
  },
});
