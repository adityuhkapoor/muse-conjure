import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Last slice: one slice of Rook's left, three claims in the chat. A reaction duel: the lid lifts,
// the slice sits under a heat lamp, and at a moment the server's seed picks it glows. First tap
// after the glow wins it; tapping early burns your fingers and you're out. The winner gets a
// cheese pull.

type Params = {
  /** Card title: "Last slice" */
  title: string;
  /** Where the pizza is from, printed on the box: "Rook's" */
  shop: string;
  /** What's left: "pepperoni" */
  slice: string;
  /** The claims in the chat, up to 3 */
  claims: { who: string; said: string }[];
};

// @params
const P: Params = {
  title: "Last slice",
  shop: "Rook's",
  slice: "pepperoni",
  claims: [
    { who: "Will", said: "i paid" },
    { who: "Calvin", said: "i haven't eaten since 2" },
    { who: "Arun", said: "it's literally mine" },
  ],
};
// @end params

type Claim = { id: string; name: string; said: string };
type Round = { n: number; at: number; glow: number; by: string };
type State = { title: string; shop: string; slice: string; claims: Claim[]; round: Round | null; burned: string[]; winner: string; wonAt: number; rounds: number };
type Action = { t: "lift" } | { t: "grab" };
type Local = { toast: number; msg: string };

const H = 240;
const LID_MS = 700;
const MIN_WAIT = 1800;
const SPREAD = 3600;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const nameIn = (members: readonly Member[], id: string, fb = "Someone") => members.find((m) => m.id === id)?.name ?? fb;
const live = (s: State) => s.round !== null && s.winner === "";
const glowFor = (at: number, seed: number) => at + MIN_WAIT + rng(seed).int(SPREAD);
const secs = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(2)} s`;

function initState(ctx: Ctx): State {
  const claims: Claim[] = [];
  for (const c of Array.isArray(P.claims) ? P.claims : []) {
    const who = clean(c?.who, 24);
    if (!who || claims.length >= 3) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    const id = m ? m.id : `?${who.toLowerCase()}`;
    if (claims.some((x) => x.id === id)) continue;
    claims.push({ id, name: m ? m.name : who, said: clean(c?.said, 40) });
  }
  return { title: clean(P.title, 30) || "Last slice", shop: clean(P.shop, 16) || "Pizza", slice: clean(P.slice, 20) || "slice", claims, round: null, burned: [], winner: "", wonAt: 0, rounds: 0 };
}

function reduceSlice(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "lift") {
    if (live(s)) {
      // Everyone still in the chat burned: the lid can come up again.
      const alive = ctx.members.some((m) => !s.burned.includes(m.id));
      if (alive) return s;
    }
    const n = s.rounds + 1;
    return { ...s, round: { n, at: meta.time, glow: glowFor(meta.time, meta.seed), by: u }, burned: [], winner: "", wonAt: 0, rounds: n };
  }
  if (a.t === "grab") {
    if (!live(s) || s.burned.includes(u)) return s;
    const r = s.round!;
    if (meta.time < r.glow) return { ...s, burned: [...s.burned, u] };
    return { ...s, winner: u, wonAt: meta.time };
  }
  return s;
}

type Seat = { x: number; y: number };
const seats = (W: number): Seat[] => [
  { x: W * 0.12, y: 96 },
  { x: W * 0.88, y: 96 },
  { x: W * 0.12, y: 212 },
  { x: W * 0.88, y: 212 },
];

/** Up to three lines that fit maxW at 12px; the last one ends with an ellipsis if it must. */
function wrap2(g: CanvasRenderingContext2D, text: string, maxW: number, family: string): string[] {
  g.font = `500 12px ${family}`;
  const words = text.split(" ");
  const out: string[] = [];
  let i = 0;
  while (i < words.length && out.length < 3) {
    let a = "";
    while (i < words.length && g.measureText(a ? `${a} ${words[i]}` : words[i]!).width <= maxW) a = a ? `${a} ${words[i++]}` : words[i++]!;
    if (!a) a = words[i++]!;
    out.push(out.length === 2 && i < words.length ? [a, ...words.slice(i)].join(" ") : a);
    if (out.length === 3) i = words.length;
  }
  return out.map((l) => fitText(l, maxW, { g, size: 12, min: 12, weight: 500 }).text);
}

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, members: readonly Member[], ctx: Ctx, waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const r = s.round;
  const lidE = r ? Math.min(1, Math.max(0, (now - r.at) / LID_MS)) : 0;
  const lid = waiting ? 0.12 : 1 - Math.pow(1 - lidE, 3);
  const glowing = !!r && now >= r.glow && (s.winner === "" || s.wonAt >= r.glow);
  const won = s.winner !== "" && !!r;
  const lampOn = !!r;
  const cx = W / 2;
  const bw = Math.min(200, W * 0.48);
  const bx = cx - bw / 2;
  const by = 146;
  const bh = 74;
  const sx = cx;
  const sy = by + bh / 2 + 2;

  // heat lamp and its light
  g.strokeStyle = c.secondaryText;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, 0);
  g.lineTo(cx, 16);
  g.stroke();
  if (lampOn) {
    g.fillStyle = mix(p.orange, c.card, dark ? 0.72 : 0.84);
    g.beginPath();
    g.moveTo(cx - 24, 42);
    g.lineTo(cx + 24, 42);
    g.lineTo(cx + bw / 2 - 4, by + 10);
    g.lineTo(cx - bw / 2 + 4, by + 10);
    g.closePath();
    g.fill();
  }
  g.fillStyle = dark ? mix(c.text, c.card, 0.55) : mix(c.text, c.card, 0.25);
  g.beginPath();
  g.moveTo(cx - 10, 16);
  g.lineTo(cx + 10, 16);
  g.lineTo(cx + 30, 42);
  g.lineTo(cx - 30, 42);
  g.closePath();
  g.fill();
  g.fillStyle = lampOn ? p.orange : c.divider;
  g.beginPath();
  g.ellipse(cx, 43, 14, 5, 0, 0, Math.PI * 2);
  g.fill();

  const card = dark ? mix(p.crust, c.card, 0.45) : mix(p.crust, c.card, 0.3);
  const cardIn = dark ? mix(p.crust, c.card, 0.62) : mix(p.crust, c.card, 0.6);
  const stampInk = dark ? mix(p.red, c.text, 0.25) : mix(p.red, c.text, 0.4);
  // the lid, hinged at the back edge, rising as it opens
  const lidH = (bh + 6) * lid;
  if (lid > 0.04) {
    g.fillStyle = card;
    g.beginPath();
    g.moveTo(bx - 6, by);
    g.lineTo(bx + bw + 6, by);
    g.lineTo(bx + bw + 6 - 10 * lid, by - lidH);
    g.lineTo(bx - 6 + 10 * lid, by - lidH);
    g.closePath();
    g.fill();
    g.fillStyle = mix(cardIn, card, 0.3);
    g.beginPath();
    g.moveTo(bx + 2, by - 2);
    g.lineTo(bx + bw - 2, by - 2);
    g.lineTo(bx + bw - 2 - 9 * lid, by - lidH + 6 * lid);
    g.lineTo(bx + 2 + 9 * lid, by - lidH + 6 * lid);
    g.closePath();
    g.fill();
    g.fillStyle = mix(cardIn, p.brown, 0.2);
    g.beginPath();
    g.ellipse(bx + bw * 0.28, by - lidH * 0.55, 11 * lid, 6 * lid, 0.3, 0, Math.PI * 2);
    g.ellipse(bx + bw * 0.74, by - lidH * 0.38, 7 * lid, 4 * lid, 0, 0, Math.PI * 2);
    g.fill();
  }
  // the base
  g.fillStyle = card;
  g.beginPath();
  g.roundRect(bx - 6, by, bw + 12, bh, 5);
  g.fill();
  g.fillStyle = cardIn;
  g.beginPath();
  g.roundRect(bx + 2, by + 5, bw - 4, bh - 12, 3);
  g.fill();

  if (lid > 0.04) {
    const pull = won ? Math.min(1, (now - s.wonAt) / 1200) : 0;
    if (glowing && !won) {
      // the glow: rays and a warm halo that pulse
      const hot = 0.5 + 0.5 * Math.sin(now / 80);
      g.save();
      g.translate(sx, sy);
      g.rotate(now / 1400);
      g.strokeStyle = p.yellow;
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        g.moveTo(Math.cos(a) * 52, Math.sin(a) * 30);
        g.lineTo(Math.cos(a) * (64 + hot * 8), Math.sin(a) * (40 + hot * 6));
      }
      g.stroke();
      g.restore();
      g.lineCap = "butt";
      g.fillStyle = mix(p.yellow, cardIn, 0.45 - hot * 0.2);
      g.beginPath();
      g.ellipse(sx, sy, 62, 30, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (pull < 1) {
      // one slice, tip to the left, crust to the right
      g.globalAlpha = 1 - pull;
      const L = Math.min(64, bw * 0.34);
      g.fillStyle = glowing && !won ? mix(p.yellow, c.card, 0.2) : p.yellow;
      g.beginPath();
      g.moveTo(sx + L - 6, sy - 26);
      g.lineTo(sx + L - 6, sy + 26);
      g.lineTo(sx - L, sy + 2);
      g.closePath();
      g.fill();
      g.fillStyle = p.crust;
      g.beginPath();
      g.roundRect(sx + L - 12, sy - 28, 14, 56, 7);
      g.fill();
      g.fillStyle = p.red;
      g.beginPath();
      for (const [px, py, pr] of [[sx + 30, sy - 10, 7], [sx + 32, sy + 13, 6], [sx + 6, sy + 1, 6], [sx - 20, sy + 3, 4.5]] as const) {
        g.moveTo(px + pr, py);
        g.arc(px, py, pr, 0, Math.PI * 2);
      }
      g.fill();
      g.globalAlpha = 1;
    }
    if (lampOn && !won) {
      g.strokeStyle = mix(c.secondaryText, c.card, 0.35);
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const x0 = sx - 14 + k * 16;
        const ph = now / 260 + k;
        g.moveTo(x0, sy - 30);
        g.bezierCurveTo(x0 + 6 * Math.sin(ph), sy - 40, x0 - 6 * Math.sin(ph), sy - 48, x0 + 3 * Math.sin(ph), sy - 58);
      }
      g.stroke();
      g.lineCap = "butt";
    }
  } else {
    // closed: the lid seen from above with the shop's stamp
    g.fillStyle = card;
    g.beginPath();
    g.roundRect(bx - 6, by - 2, bw + 12, bh + 2, 5);
    g.fill();
    g.strokeStyle = mix(card, c.text, 0.12);
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(bx + 6, by + 8, bw - 12, bh - 18, 4);
    g.stroke();
    g.strokeStyle = stampInk;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, sy - 2, Math.min(70, bw * 0.36), 22, 0, 0, Math.PI * 2);
    g.stroke();
    const stamp = fitText(s.shop, Math.min(120, bw * 0.6), { g, size: 18, min: 11, weight: 800 });
    g.font = stamp.font;
    g.fillStyle = stampInk;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(stamp.text, cx, sy - 1);
  }

  // the claimants, with their lines
  const st = seats(W);
  const players: Claim[] = s.claims.slice(0, 3);
  const extraP = [s.winner, ...s.burned].find((u) => u && !players.some((x) => x.id === u));
  if (extraP) players.push({ id: extraP, name: nameIn(members, extraP), said: "" });
  g.textBaseline = "middle";
  players.forEach((cl, i) => {
    const seat = st[i]!;
    const out = s.burned.includes(cl.id);
    const win = s.winner === cl.id;
    const known = inChat(ctx, cl.id);
    const rr = win ? 18 : 15;
    if (win) {
      const q = Math.min(1, (now - s.wonAt) / 1200);
      g.strokeStyle = p.yellow;
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const ex = sx + (seat.x - sx) * q;
        const ey = sy + (seat.y - sy) * q;
        g.moveTo(sx - 10 + k * 8, sy);
        g.quadraticCurveTo((sx + ex) / 2, Math.max(sy, ey) + 16 + k * 6, ex + (k - 1) * 4, ey);
      }
      g.stroke();
      g.lineCap = "butt";
    }
    g.beginPath();
    g.arc(seat.x, seat.y, rr, 0, Math.PI * 2);
    g.fillStyle = known ? userColor(cl.id, t) : c.secondaryButton;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = win ? p.yellow : c.card;
    g.stroke();
    g.fillStyle = known ? c.onPrimary : c.secondaryButtonText;
    g.font = `700 ${win ? 15 : 13}px ${t.type.family}`;
    g.textAlign = "center";
    g.fillText((nameIn(members, cl.id, cl.name)[0] ?? "?").toUpperCase(), seat.x, seat.y + 0.5);
    if (out) {
      g.fillStyle = p.orange;
      g.beginPath();
      g.moveTo(seat.x + 12, seat.y - 22);
      g.quadraticCurveTo(seat.x + 22, seat.y - 12, seat.x + 16, seat.y - 4);
      g.quadraticCurveTo(seat.x + 10, seat.y - 6, seat.x + 8, seat.y - 12);
      g.quadraticCurveTo(seat.x + 8, seat.y - 18, seat.x + 12, seat.y - 22);
      g.fill();
    }
    const said = out ? "ow ow ow" : win ? "mine." : cl.said;
    if (!said) return;
    const maxW = Math.max(60, Math.min(112, (W - bw) / 2 - 18));
    const lines = wrap2(g, said, maxW - 14, t.type.family);
    g.font = `500 12px ${t.type.family}`;
    const tw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)) + 16);
    const bh2 = lines.length * 15 + 9;
    const bx2 = Math.max(2, Math.min(W - tw - 2, seat.x - tw / 2));
    const by2 = seat.y - rr - 6 - bh2;
    g.fillStyle = dark ? c.input : c.wash;
    g.beginPath();
    g.roundRect(bx2, by2, tw, bh2, 11);
    g.fill();
    g.beginPath();
    g.moveTo(seat.x - 5, by2 + bh2 - 1);
    g.lineTo(seat.x + 5, by2 + bh2 - 1);
    g.lineTo(seat.x, by2 + bh2 + 5);
    g.fill();
    g.fillStyle = out ? c.negative : c.text;
    g.textAlign = "center";
    lines.forEach((l, k) => g.fillText(l, bx2 + tw / 2, by2 + 12 + k * 15));
  });
  return lampOn && (s.winner === "" || now - s.wonAt < 1400);
}

export default defineApp<State, Action, Local>({
  name: "Last slice",
  summary: (s) => {
    if (s.winner) return `${s.title}: someone grabbed it · ${s.burned.length} burned`;
    if (s.round) return `${s.title}: the lid is up · ${s.burned.length} burned`;
    return `${s.title}: ${s.claims.length} claims, nobody's grabbed it`;
  },
  init: initState,
  reduce: reduceSlice,

  invariants: {
    "the winner waited for the glow": (s) => s.winner === "" || (s.round !== null && s.wonAt >= s.round.glow),
    "the winner did not get burned": (s) => s.winner === "" || !s.burned.includes(s.winner),
    "no winner, no win time": (s) => s.winner !== "" || s.wonAt === 0,
    "burns are once each": (s) => new Set(s.burned).size === s.burned.length,
    "a round glows inside its window": (s) => s.round === null || (s.round.glow - s.round.at >= MIN_WAIT && s.round.glow - s.round.at < MIN_WAIT + SPREAD),
    "rounds are counted": (s) => Number.isInteger(s.rounds) && (s.round === null ? s.rounds === 0 : s.round.n === s.rounds),
    "no burns or winner before the lid": (s) => s.round !== null || (s.burned.length === 0 && s.winner === ""),
  },

  transitions: {
    "an early grab burns only the grabber": (p, n, a, m) =>
      a.t !== "grab" || p === n || p.round === null || m.time >= p.round.glow || (n.burned.length === p.burned.length + 1 && n.burned[n.burned.length - 1] === m.user && n.winner === ""),
    "a late grab wins it": (p, n, a, m) => a.t !== "grab" || p === n || p.round === null || m.time < p.round.glow || (n.winner === m.user && n.wonAt === m.time && p.winner === ""),
    "nobody grabs twice in a round": (p, n, a, m) => a.t !== "grab" || !p.burned.includes(m.user) || JSON.stringify(p) === JSON.stringify(n),
    "the slice goes once": (p, n, a) => p.winner === "" || a.t === "lift" || (n.winner === p.winner && n.wonAt === p.wonAt),
    "lifting starts a fresh round from the seed": (p, n, a, m) =>
      a.t !== "lift" || p === n || (n.round !== null && n.round.at === m.time && n.round.glow === glowFor(m.time, m.seed) && n.round.by === m.user && n.burned.length === 0 && n.winner === "" && n.rounds === p.rounds + 1),
    "the lid stays up while someone can still grab": (p, n, a, _m, ctx) => a.t !== "lift" || !live(p) || !ctx.members.some((x) => !p.burned.includes(x.id)) || JSON.stringify(p.round) === JSON.stringify(n.round),
    "a grab never lifts the lid": (p, n, a) => a.t !== "grab" || n.rounds === p.rounds,
    "a lift opens a closed box": (p, n, a, m, ctx) => a.t !== "lift" || !inChat(ctx, m.user) || p.round !== null || n.round !== null,
    "a finished round lifts again": (p, n, a, m, ctx) => a.t !== "lift" || !inChat(ctx, m.user) || p.winner === "" || n.rounds === p.rounds + 1,
    "claims never change": (p, n) => JSON.stringify(p.claims) === JSON.stringify(n.claims),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (!live(s) || r.next() < 0.15 ? { t: "lift" } : { t: "grab" }),

  local: { toast: 0, msg: "" },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const s = confirmed;
    const waiting = pending && state.rounds !== confirmed.rounds;
    const nm = (id: string) => first(nameIn(members, id, s.claims.find((x) => x.id === id)?.name ?? "Someone"));
    const out = s.burned.includes(me);
    const everyoneOut = live(s) && members.length > 0 && members.every((m) => s.burned.includes(m.id));

    let line: string;
    let btn;
    if (waiting) {
      line = "Lifting the lid";
      btn = <Button kind="secondary" disabled wide>Lifting</Button>;
    } else if (!s.round) {
      line = s.claims.length ? `${s.claims.length} claims · first tap after it glows wins` : "First tap after it glows wins";
      btn = <Button kind="primary" wide onClick={() => { haptic("light"); dispatch({ t: "lift" }); }}>Lift the lid</Button>;
    } else if (s.winner) {
      line = `${s.winner === me ? "You" : nm(s.winner)} got it in ${secs(s.wonAt - s.round.glow)}${s.burned.length ? ` · ${s.burned.length} burned` : ""}`;
      btn = <Button kind="secondary" wide onClick={() => dispatch({ t: "lift" })}>Rematch</Button>;
    } else if (everyoneOut) {
      line = "Everyone got burned · the slice survives";
      btn = <Button kind="primary" wide onClick={() => dispatch({ t: "lift" })}>Try again</Button>;
    } else if (out) {
      line = "You burned your fingers · you're out";
      btn = <Button kind="secondary" wide disabled>Out</Button>;
    } else {
      line = s.burned.length ? `${s.burned.map(nm).join(", ")} burned · wait for the glow` : "Wait for the glow · early burns your fingers";
      btn = (
        <Button
          kind="primary"
          wide
          onClick={() => {
            haptic("medium");
            dispatch({ t: "grab" });
            setLocal({ toast: local.toast + 1, msg: "Grabbed" });
          }}
        >
          Grab
        </Button>
      );
    }
    const extra = s.claims.length > 3 ? s.claims.slice(3) : [];

    return (
      <div>
        <CardHeader title={state.title} subtitle={`One ${state.slice} slice left · ${state.shop}`} />
        <Canvas
          height={H}
          label={s.winner ? `${nm(s.winner)} won the last slice` : s.round ? "Lid open, slice under the heat lamp" : `Closed ${state.shop} box with one slice left`}
          draw={(g, f) => drawScene(g, f, s, members, ctx, waiting)}
        />
        <div style={{ marginTop: 6, height: 22, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.secondaryText, overflow: "hidden", whiteSpace: "nowrap" }}>
          {s.winner && inChat(ctx, s.winner) ? <Avatar user={s.winner} size={20} /> : null}
          {extra.map((x) => (inChat(ctx, x.id) ? <Avatar key={x.id} user={x.id} size={20} /> : null))}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{line}</span>
        </div>
        <div style={{ marginTop: 8 }}>{btn}</div>
        {local.toast > 0 && s.winner === me ? <Toast key={local.toast}>{`The last slice is yours`}</Toast> : null}
      </div>
    );
  },
});
