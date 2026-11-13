import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Facepile,
  More,
  Placed,
  Scene,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Price check: friends pin what they think a listing is worth on a rail of nearby sold prices,
// settle an offer on a deal meter, send it, record the seller's answer and lock the deal.
// The seller is not in the chat: whoever hears back records the reply.

type Params = {
  /** The thing for sale: "Trek FX 2" */
  item: string;
  /** How long it has been up: "listed 12 days ago" */
  listed: string;
  /** Seller's first name: "Gary" */
  seller: string;
  /** Asking price in cents ($350 -> 35000) */
  askCents: number;
  /** Sold nearby, up to 5: "FX 1" $260 */
  comps: { label: string; cents: number }[];
  /** The fair range in cents */
  fairLowCents: number;
  fairHighCents: number;
  /** Friends' guesses from the chat: name as in the chat, cents */
  pins: { name: string; cents: number }[];
  /** A line from the chat worth showing: 'Dev: “offer 300”', or empty */
  quote: string;
  /** Pickup time once agreed: "today 6pm", or empty */
  pickup: string;
};

// @params
const P: Params = {
  item: "Trek FX 2",
  listed: "listed 12 days ago",
  seller: "Gary",
  askCents: 35000,
  comps: [
    { label: "FX 1", cents: 26000 },
    { label: "FX 2 ’21", cents: 30000 },
    { label: "FX 2", cents: 32500 },
    { label: "FX 3", cents: 42000 },
  ],
  fairLowCents: 28500,
  fairHighCents: 32500,
  pins: [
    { name: "Priya", cents: 28000 },
    { name: "Dev", cents: 29500 },
    { name: "Noa", cents: 31500 },
  ],
  quote: "Dev: “offer 300”",
  pickup: "today 6pm",
};
// @end params

type Comp = { label: string; cents: number };
type Pin = { user: string; cents: number };
type Sent = { cents: number; by: string; at: number };
type Reply = { kind: "yes" | "counter"; cents: number; by: string; at: number };
type Deal = { cents: number; by: string; at: number };
/** lo/hi: the rail range in cents. moved: meta.time of the last offer change. */
type State = {
  item: string;
  listed: string;
  seller: string;
  ask: number;
  comps: Comp[];
  fair: [number, number];
  lo: number;
  hi: number;
  pins: Pin[];
  offer: number;
  moved: number;
  sent: Sent | null;
  reply: Reply | null;
  deal: Deal | null;
  quote: string;
  pickup: string;
};
type Action =
  | { t: "pin"; cents: number }
  | { t: "offer"; cents: number }
  | { t: "send" }
  | { t: "reply"; kind: "yes" | "counter"; cents: number }
  | { t: "accept" }
  | { t: "revise" };
type Local = { countering: boolean; counter: string; pinning: boolean };
type Rec = Record<string, unknown>;

const STEP = 500;
const RAIL = 2000;
const NEEDLE_MS = 500;
const WOBBLE_MS = 600;
const BUMP_MS = 250;
const needleEase = tween({ duration: NEEDLE_MS, easing: "decelerate" });
const popSpring = spring(springs.iosBouncy);
const replySpring = spring(springs.ios);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const snap = (s: { lo: number; hi: number }, c: number) => Math.max(s.lo, Math.min(s.hi, Math.round(c / STEP) * STEP));

/** 0 Lowball, 1 Fair, 2 A bit high, 3 Overpaying. */
function verdict(s: State, c: number): number {
  if (c < s.fair[0] - 1500) return 0;
  if (c <= s.fair[1]) return 1;
  if (c < s.ask - 500) return 2;
  return 3;
}
const VERDICTS = ["Lowball", "Fair", "A bit high", "Overpaying"];

/** "$50 under ask", "Full price", "$10 over ask". */
function vsAsk(s: State, c: number): string {
  const d = s.ask - c;
  return d === 0 ? "Full price" : d > 0 ? `${money(d)} under ask` : `${money(-d)} over ask`;
}

// ---- Reducer side ----

function reducePrice(s: State, a: Rec, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user) || s.deal !== null) return s;

  if (a.t === "pin") {
    if (!isInt(a.cents)) return s;
    const cents = snap(s, a.cents);
    const mine = s.pins.find((p) => p.user === meta.user);
    if (mine && mine.cents === cents) return s;
    return { ...s, pins: mine ? s.pins.map((p) => (p.user === meta.user ? { ...p, cents } : p)) : [...s.pins, { user: meta.user, cents }] };
  }

  if (a.t === "offer") {
    if (s.sent !== null || !isInt(a.cents)) return s;
    const cents = snap(s, a.cents);
    if (cents === s.offer) return s;
    return { ...s, offer: cents, moved: meta.time };
  }

  if (a.t === "send") {
    if (s.sent !== null) return s;
    return { ...s, sent: { cents: s.offer, by: meta.user, at: meta.time } };
  }

  if (a.t === "reply") {
    if (s.sent === null || s.reply !== null) return s;
    if (a.kind === "yes") {
      return {
        ...s,
        reply: { kind: "yes", cents: s.sent.cents, by: meta.user, at: meta.time },
        deal: { cents: s.sent.cents, by: meta.user, at: meta.time },
      };
    }
    if (a.kind === "counter") {
      if (!isInt(a.cents)) return s;
      const cents = snap(s, a.cents);
      if (!(s.sent.cents < cents && cents <= s.ask)) return s;
      return { ...s, reply: { kind: "counter", cents, by: meta.user, at: meta.time } };
    }
    return s;
  }

  if (a.t === "accept") {
    if (s.reply === null || s.reply.kind !== "counter") return s;
    return { ...s, deal: { cents: s.reply.cents, by: meta.user, at: meta.time } };
  }

  if (a.t === "revise") {
    if (s.reply === null || s.reply.kind !== "counter") return s;
    return { ...s, sent: null, reply: null, offer: s.reply.cents, moved: meta.time };
  }

  return s;
}

// ---- Check side ----

const onRail = (s: State, c: number) => isInt(c) && c >= s.lo && c <= s.hi && c % STEP === 0;
const without = (s: State, user: string) => JSON.stringify({ ...s, pins: s.pins.filter((p) => p.user !== user) });

export default defineApp<State, Action, Local>({
  name: "Price check",
  summary: (s) => {
    if (s.deal) return `${s.item}: deal at ${money(s.deal.cents)}, ${vsAsk(s, s.deal.cents)}`;
    if (s.reply && s.reply.kind === "counter") return `${s.item}: ${s.seller} says ${money(s.reply.cents)}`;
    if (s.sent) return `${s.item}: offered ${money(s.sent.cents)}, waiting on ${s.seller}`;
    const k = s.pins.length;
    return `${s.item}: ask ${money(s.ask)}, ${k} ${k === 1 ? "guess" : "guesses"}, offer ${money(s.offer)} (${VERDICTS[verdict(s, s.offer)]})`;
  },

  init: (ctx) => {
    const text = (v: unknown, max: number, dflt: string) => (typeof v === "string" ? v.trim().slice(0, max) || dflt : dflt);
    const ask = isInt(P.askCents) && P.askCents >= 100 && P.askCents <= 10_000_000 ? P.askCents : 10000;
    const comps: Comp[] = (Array.isArray(P.comps) ? P.comps : [])
      .filter((c) => c && typeof c.label === "string" && isInt(c.cents) && c.cents > 0)
      .slice(0, 5)
      .map((c) => ({ label: c.label.trim().slice(0, 14), cents: c.cents }))
      .sort((x, y) => x.cents - y.cents);
    const f0 = isInt(P.fairLowCents) && P.fairLowCents > 0 ? P.fairLowCents : ask;
    const f1 = isInt(P.fairHighCents) && P.fairHighCents > 0 ? P.fairHighCents : ask;
    const all = [ask, f0, f1, ...comps.map((c) => c.cents)];
    const lo = Math.floor((0.8 * Math.min(...all)) / RAIL) * RAIL;
    const hi = Math.ceil((1.15 * Math.max(...all)) / RAIL) * RAIL;
    const clamp = (c: number) => Math.max(lo, Math.min(hi, c));
    const fair: [number, number] = [clamp(Math.min(f0, f1)), clamp(Math.max(f0, f1))];
    const rail = { lo, hi };
    const used = new Set<string>();
    const pins: Pin[] = [];
    for (const p of Array.isArray(P.pins) ? P.pins : []) {
      if (!p || typeof p.name !== "string" || !isInt(p.cents)) continue;
      const want = p.name.trim().toLowerCase();
      const m = ctx.members.find((x) => !used.has(x.id) && (x.id === p.name || (x.name ?? "").toLowerCase() === want));
      if (!m) continue;
      used.add(m.id);
      pins.push({ user: m.id, cents: snap(rail, p.cents) });
    }
    return {
      item: text(P.item, 32, "This item"),
      listed: text(P.listed, 32, ""),
      seller: text(P.seller, 16, "the seller"),
      ask,
      comps,
      fair,
      lo,
      hi,
      pins,
      offer: snap(rail, ask),
      moved: 0,
      sent: null,
      reply: null,
      deal: null,
      quote: text(P.quote, 60, ""),
      pickup: text(P.pickup, 24, ""),
    };
  },

  reduce: (state, action, meta, ctx) => reducePrice(state, action as unknown as Rec, meta, ctx),

  onMembers: (state, ctx) => (state.pins.every((p) => inChat(ctx, p.user)) ? state : { ...state, pins: state.pins.filter((p) => inChat(ctx, p.user)) }),

  invariants: {
    "money is whole cents on the rail": (s) =>
      onRail(s, s.offer) &&
      s.pins.every((p) => onRail(s, p.cents)) &&
      (!s.sent || onRail(s, s.sent.cents)) &&
      (!s.reply || onRail(s, s.reply.cents)) &&
      (!s.deal || onRail(s, s.deal.cents)),
    "one pin per person, from the chat": (s, ctx) => new Set(s.pins.map((p) => p.user)).size === s.pins.length && s.pins.every((p) => inChat(ctx, p.user)),
    "a reply needs a sent offer; a deal needs a reply": (s) => (!s.reply || !!s.sent) && (!s.deal || !!s.reply),
    "a counter sits between the offer and the ask": (s) => s.reply === null || s.reply.kind !== "counter" || (!!s.sent && s.sent.cents < s.reply.cents && s.reply.cents <= s.ask),
    "a yes is the offer": (s) => s.reply === null || s.reply.kind !== "yes" || (!!s.sent && s.reply.cents === s.sent.cents),
    "the deal is the last word": (s) => s.deal === null || (!!s.reply && s.deal.cents === s.reply.cents),
    "the fair band is inside the rail": (s) => s.lo <= s.fair[0] && s.fair[0] <= s.fair[1] && s.fair[1] <= s.hi,
    "the sent offer is the draft": (s) => s.sent === null || s.sent.cents === s.offer,
  },

  transitions: {
    "a sent offer is frozen": (p, n) => !p.sent || !n.sent || n.offer === p.offer,
    "a deal never changes": (p, n) => !p.deal || JSON.stringify(p) === JSON.stringify(n),
    "send sends the draft": (p, n, a, m) => a.t !== "send" || p === n || (n.sent?.cents === p.offer && n.sent.by === m.user && n.sent.at === m.time && p.sent === null),
    "a pin moves only the actor's pin": (p, n, a, m) =>
      a.t !== "pin" || p === n || (without(p, m.user) === without(n, m.user) && n.pins.some((x) => x.user === m.user && x.cents === Math.max(p.lo, Math.min(p.hi, Math.round(a.cents / STEP) * STEP)))),
    "an offer moves only the draft": (p, n, a, m) =>
      a.t !== "offer" || p === n || (p.sent === null && n.offer === Math.max(p.lo, Math.min(p.hi, Math.round(a.cents / STEP) * STEP)) && n.moved === m.time && JSON.stringify(p.pins) === JSON.stringify(n.pins)),
    "a reply records who said it and when": (p, n, a, m) =>
      a.t !== "reply" || p === n || (p.reply === null && n.reply !== null && n.reply.by === m.user && n.reply.at === m.time && n.reply.kind === a.kind && (a.kind !== "yes" || (n.deal?.by === m.user && n.deal.at === m.time))),
    "only a yes or an accept makes the deal": (p, n, a, m) => p.deal === n.deal || (n.deal !== null && n.deal.by === m.user && (a.t === "accept" ? p.reply?.kind === "counter" : a.t === "reply" && a.kind === "yes")),
    "revise returns to drafting at the counter": (p, n, a) => a.t !== "revise" || p === n || (n.sent === null && n.reply === null && n.offer === p.reply!.cents),
    "only people in the chat change it": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user) || JSON.stringify(p.pins.map((x) => x.user)) !== JSON.stringify(n.pins.map((x) => x.user)),
  },

  arbitrary: (s, _u, r) => {
    if (s.deal) return { t: "pin", cents: s.lo + STEP * r.int((s.hi - s.lo) / STEP + 1) };
    if (s.sent === null) {
      const k = r.next();
      if (k < 0.4) return { t: "offer", cents: s.lo + STEP * r.int((s.hi - s.lo) / STEP + 1) };
      if (k < 0.7) return { t: "pin", cents: s.lo + STEP * r.int((s.hi - s.lo) / STEP + 1) };
      return { t: "send" };
    }
    if (s.reply === null) {
      return r.next() < 0.5 ? { t: "reply", kind: "yes", cents: s.sent.cents } : { t: "reply", kind: "counter", cents: s.sent.cents + STEP * (1 + r.int(10)) };
    }
    const k = r.next();
    if (k < 0.5) return { t: "accept" };
    if (k < 0.8) return { t: "revise" };
    return { t: "pin", cents: s.lo + STEP * r.int((s.hi - s.lo) / STEP + 1) };
  },

  local: { countering: false, counter: "", pinning: false },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const narrow = theme.width < 360;
    const s = state;
    const X0 = 18;
    const X1 = W - 18;
    const xof = (v: number) => X0 + ((X1 - X0) * (v - s.lo)) / (s.hi - s.lo);
    const { deal, sent, reply } = s;
    const shown = deal ? deal.cents : s.offer;
    const verdictNow = verdict(s, shown);
    const zoneColor = [mix(c.negative, c.card, 0.35), c.positive, c.warning, c.negative];
    const wordColor = [c.negative, c.positive, c.text, c.negative];
    const pinners = s.pins.map((p) => p.user);
    const countered = reply !== null && reply.kind === "counter" && !deal;
    const empty = s.comps.length === 0 && s.pins.length === 0;

    // ---- The rail ----
    const RAIL_Y = 62;
    const tapRail = (e: { clientX: number; currentTarget: Element }) => {
      if (deal) return;
      const r = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - r.left) * W) / (r.width || W);
      const cents = Math.round(s.lo + ((px - X0) / (X1 - X0)) * (s.hi - s.lo));
      if (sent || local.pinning) {
        dispatch({ t: "pin", cents });
        if (local.pinning) setLocal({ pinning: false });
      } else dispatch({ t: "offer", cents });
    };

    const label = (text: string, max: number, size: number, weight = 400) => fitText(text, max, { size, min: 10, weight });
    const clampX = (x: number, w: number) => Math.max(4 + w / 2, Math.min(W - 4 - w / 2, x));

    const compLabels = s.comps.map((comp, i) => {
      const f = label(`${money(comp.cents)} ${comp.label}`, 70, 10.5);
      return (
        <text key={`cl${i}`} x={clampX(xof(comp.cents), f.width)} y={RAIL_Y + (i % 2 === 0 ? 20 : 35)} style={{ textAnchor: "middle", fontSize: f.size }} fill={c.secondaryText}>
          {f.text}
        </text>
      );
    });
    const askText = label(`Ask ${money(s.ask)}`, 90, 11, 400);
    const askX = xof(s.ask);

    // Friends' pins: closer than 14 px stack upward; the rest collapse into a "+N" chip.
    const sorted = [...s.pins].sort((a, b) => a.cents - b.cents);
    const lastX = [-100, -100];
    let extra = 0;
    let extraX = 0;
    const placed: { user: string; x: number; level: number }[] = [];
    for (const p of sorted) {
      const x = xof(p.cents);
      if (x - lastX[0]! >= 14) {
        lastX[0] = x;
        placed.push({ user: p.user, x, level: 0 });
      } else if (x - lastX[1]! >= 14) {
        lastX[1] = x;
        placed.push({ user: p.user, x, level: 1 });
      } else {
        extra++;
        extraX = x;
      }
    }

    const railScene = (
      <Scene
        height={104}
        label={`Sold prices from ${money(Math.min(...s.comps.map((x) => x.cents), s.ask))} to ${money(Math.max(...s.comps.map((x) => x.cents), s.ask))}, fair ${money(s.fair[0])} to ${money(s.fair[1])}, ask ${money(s.ask)}, ${s.pins.length} ${s.pins.length === 1 ? "guess" : "guesses"}`}
        bg={c.wash}
        art={
          <g>
            <rect x={X0} y={RAIL_Y - 3} width={X1 - X0} height={6} rx={3} fill={c.card} />
            <rect x={xof(s.fair[0])} y={RAIL_Y - 6} width={Math.max(2, xof(s.fair[1]) - xof(s.fair[0]))} height={12} rx={6} fill={c.positive} opacity={0.45} />
            {s.comps.map((comp, i) => (
              <rect key={`ct${i}`} x={xof(comp.cents) - 1.5} y={RAIL_Y - 6} width={3} height={12} rx={1} fill={c.secondaryText} />
            ))}
            {compLabels}
            {placed.map((p) => (
              <line key={`st${p.user}`} x1={p.x} x2={p.x} y1={RAIL_Y - 4} y2={RAIL_Y - 16} stroke={c.secondaryText} style={{ strokeWidth: 1.5 }} />
            ))}
            <path d={`M${askX - 6} ${RAIL_Y - 16}L${askX + 6} ${RAIL_Y - 16}L${askX} ${RAIL_Y - 6}Z`} fill={c.negative} />
            <text x={clampX(askX, askText.width)} y={RAIL_Y - 27} style={{ textAnchor: "middle", fontSize: askText.size }} fill={mix(c.negative, c.text, 0.3)}>
              {askText.text}
            </text>
            <circle cx={xof(s.offer)} cy={RAIL_Y} r={10} fill={c.card} />
            <circle cx={xof(s.offer)} cy={RAIL_Y} r={8} fill={c.primary} />
          </g>
        }
      >
        <style>{"@keyframes pcBob{0%,100%{transform:translateY(-1.5px)}50%{transform:translateY(1.5px)}}@media (prefers-reduced-motion:reduce){.pc-bob{animation:none!important}}"}</style>
        <div
          role="button"
          tabIndex={-1}
          aria-label={deal ? "Sold prices rail" : sent || local.pinning ? "Pin your guess on the rail" : "Set your offer on the rail"}
          onClick={tapRail}
          style={{ position: "absolute", inset: 0, cursor: deal ? "default" : "pointer" }}
        />
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 6,
            right: sent || deal ? 14 : 96,
            fontSize: 12,
            lineHeight: "16px",
            color: c.secondaryText,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          {empty ? "No sold prices yet · pin your guess" : "Sold nearby · friends' guesses · green = fair"}
        </div>
        {sent || deal ? null : (
          <div style={{ position: "absolute", right: 2, top: -4 }}>
            <Button kind={local.pinning ? "secondary" : "deemphasized"} onClick={() => setLocal({ pinning: !local.pinning })}>
              My guess
            </Button>
          </div>
        )}
        <div className="pc-bob" style={{ position: "absolute", inset: 0, pointerEvents: "none", animation: "pcBob 2.4s ease-in-out infinite" }}>
          {placed.map((p) => (
            <Placed key={p.user} user={p.user} me={me} size={18} x={p.x / W} y={(RAIL_Y - (p.level === 0 ? 26 : 44)) / 104} />
          ))}
          {extra > 0 ? (
            <div style={{ position: "absolute", left: `${(extraX / W) * 100}%`, top: `${((RAIL_Y - 44) / 104) * 100}%`, transform: "translate(-50%,-50%)" }}>
              <More n={extra} size={18} />
            </div>
          ) : null}
        </div>
      </Scene>
    );

    // ---- The deal meter ----
    const t0 = deal ? deal.at : s.moved;
    const e = t0 ? running(t0, NEEDLE_MS + WOBBLE_MS) : null;
    const span = s.hi - s.lo;
    const ang = (v: number) => Math.PI + (Math.PI * (Math.max(s.lo, Math.min(s.hi, v)) - s.lo)) / span;
    let needle = ang(shown);
    if (e !== null) {
      const p = needleEase(Math.min(e, NEEDLE_MS));
      needle += (ang(s.ask) - needle) * 0.3 * (1 - p) + (e < WOBBLE_MS ? 0.06 * Math.sin(e / 55) * (1 - e / WOBBLE_MS) : 0);
    }
    const GX = narrow ? 56 : 70;
    const GR = narrow ? 44 : 54;
    const GY = 66;
    const TH = 14;
    const pt = (a: number, r: number) => `${(GX + r * Math.cos(a)).toFixed(2)} ${(GY + r * Math.sin(a)).toFixed(2)}`;
    const bounds = [s.lo, s.fair[0] - 1500, s.fair[1], s.ask - 500, s.hi].reduce<number[]>((out, v) => {
      out.push(Math.max(out.length ? out[out.length - 1]! : s.lo, Math.max(s.lo, Math.min(s.hi, v))));
      return out;
    }, []);
    const zones = [0, 1, 2, 3].map((i) => {
      const a1 = ang(bounds[i]!) + 0.01;
      const a2 = ang(bounds[i + 1]!) - 0.01;
      if (a2 - a1 < 0.02) return null;
      const ri = GR - TH;
      return <path key={`z${i}`} d={`M${pt(a1, GR)}A${GR} ${GR} 0 0 1 ${pt(a2, GR)}L${pt(a2, ri)}A${ri} ${ri} 0 0 0 ${pt(a1, ri)}Z`} fill={zoneColor[i]} />;
    });
    const word = label(VERDICTS[verdictNow]!, GR * 2, 15, 600);
    const bump = (() => {
      const b = t0 ? running(t0, BUMP_MS) : null;
      return b === null ? 1 : 1 + 0.12 * Math.sin((Math.PI * b) / BUMP_MS);
    })();
    const OX = narrow ? 120 : 150;
    const stepOffer = (d: number) => dispatch({ t: "offer", cents: s.offer + d });

    const meter = (
      <Scene
        height={96}
        label={`Deal meter: ${money(shown)} reads ${VERDICTS[verdictNow]}`}
        art={
          <g>
            {zones}
            <line x1={GX} y1={GY} x2={GX + (GR - 4) * Math.cos(needle)} y2={GY + (GR - 4) * Math.sin(needle)} stroke={c.text} style={{ strokeWidth: 3, strokeLinecap: "round" }} />
            <circle cx={GX} cy={GY} r={6} fill={c.text} />
            <text x={GX} y={GY + 22} style={{ textAnchor: "middle", fontSize: word.size, fontWeight: 600 }} fill={wordColor[verdictNow]}>
              {word.text}
            </text>
          </g>
        }
      >
        <div style={{ position: "absolute", left: OX, top: 4, right: 0, minWidth: 0, pointerEvents: "none" }}>
          <div style={{ fontSize: 13, lineHeight: "18px", fontWeight: deal ? 600 : 400, color: deal ? c.positive : c.secondaryText }}>{deal ? "Deal" : "Your offer"}</div>
          <div style={{ fontSize: narrow ? 28 : 36, lineHeight: narrow ? "36px" : "44px", fontWeight: 700, color: c.text, transform: `scale(${bump.toFixed(3)})`, transformOrigin: "left center", whiteSpace: "nowrap" }}>{money(shown)}</div>
          <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {deal ? `${s.seller} took it · ${vsAsk(s, deal.cents)}` : vsAsk(s, shown)}
          </div>
          {deal && deal.by === me && running(deal.at, 1400) !== null ? <Burst key={deal.at} emoji="❤️" /> : null}
        </div>
        {sent || deal ? null : (
          <>
            <div style={{ position: "absolute", left: W - 92, top: 26, width: 42 }}>
              <Button kind="secondary" wide onClick={() => stepOffer(-1000)}>
                −10
              </Button>
            </div>
            <div style={{ position: "absolute", left: W - 44, top: 26, width: 42 }}>
              <Button kind="secondary" wide onClick={() => stepOffer(1000)}>
                +10
              </Button>
            </div>
          </>
        )}
      </Scene>
    );

    // ---- Bubbles ----
    const maxBubble = narrow ? 200 : 230;
    const sellerUser = { id: "seller", name: s.seller };
    const replyScale = (() => {
      if (!reply) return 1;
      const b = running(reply.at, replySpring.duration);
      return b === null ? 1 : 0.5 + 0.5 * replySpring(b);
    })();
    const bubbles = (
      <div style={{ minHeight: 88, display: "flex", flexDirection: "column", gap: 6, justifyContent: "flex-start" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: c.secondaryText }}>{sent ? "Sent" : "Draft"}</span>
          <div style={{ maxWidth: maxBubble, padding: "7px 12px", borderRadius: 18, background: c.primary, color: c.onPrimary, fontSize: 14, lineHeight: "18px" }}>
            {`Hi, would you take ${money(sent ? sent.cents : s.offer)}? Can pick up today.`}
          </div>
        </div>
        {reply ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, transform: `scale(${replyScale.toFixed(3)})`, transformOrigin: "left center" }}>
            <Avatar user={sellerUser} size={22} />
            <div style={{ maxWidth: maxBubble, padding: "6px 12px", borderRadius: 15, background: c.wash, color: c.text, fontSize: 14, lineHeight: "18px" }}>
              {reply.kind === "yes" ? "Deal. When can you come by?" : `Meet me at ${money(reply.cents)} and it's yours`}
            </div>
          </div>
        ) : null}
      </div>
    );

    // ---- Footer ----
    const counterCents = (() => {
      const t = local.counter.replace(/[$,\s]/g, "");
      const n = t === "" ? NaN : Number(t);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    })();
    const counterOk = sent !== null && Number.isFinite(counterCents) && snap(s, counterCents) > sent.cents && snap(s, counterCents) <= s.ask;
    const saveCounter = () => {
      if (!counterOk) return;
      dispatch({ t: "reply", kind: "counter", cents: counterCents });
      setLocal({ countering: false, counter: "" });
    };
    const small = { fontSize: 13, lineHeight: "18px", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    let footer;
    if (deal) {
      const saved = s.ask - deal.cents;
      const faces = pinners.slice(0, 3);
      footer = (
        <>
          <div style={{ display: "flex", alignItems: "center" }} aria-hidden="true">
            {faces.map((u, i) => {
              const b = running(deal.at, popSpring.duration + i * 120);
              const sc = b === null ? 1 : b < i * 120 ? 0 : popSpring(b - i * 120);
              return (
                <span key={u} style={{ display: "flex", marginLeft: i ? -6 : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, transform: `scale(${sc.toFixed(3)})` }}>
                  <Avatar user={u} size={24} />
                </span>
              );
            })}
          </div>
          <span style={{ ...small, color: c.text }}>
            {(saved >= 0 ? `Saved ${money(saved)}` : `${money(-saved)} over ask`) + (s.pickup ? ` · pickup ${s.pickup}` : "")}
          </span>
        </>
      );
    } else if (countered && reply) {
      footer = (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${s.seller} says ${money(reply.cents)}`}</div>
            <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.ask - reply.cents > 0 ? `${money(s.ask - reply.cents)} under his ask` : "At his ask"}
            </div>
          </div>
          <Button kind="primary" onClick={() => { haptic("light"); dispatch({ t: "accept" }); }}>
            {`Accept ${money(reply.cents)}`}
          </Button>
          <Button kind="deemphasized" onClick={() => dispatch({ t: "revise" })}>
            Revise
          </Button>
        </>
      );
    } else if (sent) {
      footer = local.countering ? (
        <>
          <input
            value={local.counter}
            placeholder="$"
            inputMode="decimal"
            aria-label={`${s.seller}'s counter in dollars`}
            style={{ flex: 1, minWidth: 0 }}
            onInput={(ev) => setLocal({ counter: ev.currentTarget.value })}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") saveCounter();
              if (ev.key === "Escape") setLocal({ countering: false, counter: "" });
            }}
          />
          <Button kind="primary" disabled={!counterOk} onClick={saveCounter}>
            Save
          </Button>
        </>
      ) : (
        <>
          <span style={{ ...small, color: c.secondaryText }}>{`Did ${s.seller} reply?`}</span>
          <Button kind="secondary" onClick={() => { haptic("success"); dispatch({ t: "reply", kind: "yes", cents: sent.cents }); }}>
            Yes
          </Button>
          <Button kind="secondary" onClick={() => setLocal({ countering: true })}>
            Counter
          </Button>
        </>
      );
    } else {
      footer = (
        <>
          {pinners.length ? <Facepile users={pinners} size={20} /> : null}
          <span style={{ ...small, color: c.text }}>{s.quote || "Pin what you'd pay"}</span>
          <Button kind="primary" onClick={() => dispatch({ t: "send" })}>
            {`Send ${money(s.offer)}`}
          </Button>
        </>
      );
    }

    return (
      <div>
        <CardHeader title={`Is ${money(s.ask)} fair?`} subtitle={s.listed ? `${s.item} · ${s.listed}` : s.item} />
        {railScene}
        <div style={{ height: 6 }} />
        {meter}
        <div style={{ height: 4 }} />
        {bubbles}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>{footer}</div>
        {deal && running(deal.at, 2600) !== null ? <Toast key={deal.at}>{`Deal at ${money(deal.cents)}`}</Toast> : null}
      </div>
    );
  },
});
