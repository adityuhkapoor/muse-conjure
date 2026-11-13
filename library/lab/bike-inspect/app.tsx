import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
} from "@muse/app";

// Bike inspect: a friend wants a used bike and knows nothing about bikes. The listing's photo is
// redrawn as the bike with hotspots on the parts that matter; the friend who knows bikes pins a
// note on each one, good or needs work. A light at the bottom moves from "ask more" to "go for it".

type Part = "tires" | "chain" | "brakes" | "frame" | "saddle" | "gears";
type Params = {
  /** The listing */
  listing: { name: string; priceCents: number };
  /** Who wants to buy it */
  buyer: string;
  /** What the buyer said */
  buyerSaid: string;
  /** 3 to 6 parts to check: which part, the fix cost if it needs work, and checks already made */
  parts: { part: Part; fixCents: number; check?: { who: string; ok: boolean; note: string } }[];
};

// @params
const P: Params = {
  listing: { name: "Road bike", priceCents: 22000 },
  buyer: "Calvin",
  buyerSaid: "i know nothing about bikes. is the pointy seat normal",
  parts: [
    { part: "tires", fixCents: 6000, check: { who: "Will", ok: true, note: "tires are new, like 100 miles on them" } },
    { part: "chain", fixCents: 1500, check: { who: "Will", ok: false, note: "chain's rusty, $15 fix" } },
    { part: "brakes", fixCents: 2500 },
    { part: "frame", fixCents: 0, check: { who: "Will", ok: true, note: "no cracks. aluminum, she's fine" } },
    { part: "saddle", fixCents: 3000 },
    { part: "gears", fixCents: 4000 },
  ],
};
// @end params

const PARTS: Part[] = ["tires", "chain", "brakes", "frame", "saddle", "gears"];
const LABEL: Record<Part, string> = { tires: "Tires", chain: "Chain", brakes: "Brakes", frame: "Frame", saddle: "Saddle", gears: "Gears" };
const ASK: Record<Part, string> = {
  tires: "Any cracks in the sidewalls?",
  chain: "Rust, or does it skip when you pedal hard?",
  brakes: "Do the pads have grooves left?",
  frame: "Cracks or dents near the welds?",
  saddle: "Torn, or is the seat post stuck?",
  gears: "Does it shift through every gear?",
};
type Spot = { part: Part; fix: number; mark: "" | "good" | "bad"; by: string; note: string; at: number };
type State = { name: string; price: number; buyer: string; buyerSaid: string; spots: Spot[]; decided: { by: string; at: number; go: boolean } | null };
type Action = { t: "mark"; part: Part; ok: boolean } | { t: "clear"; part: Part } | { t: "decide" };
type Local = { sel: number; toast: number; msg: string };

const H = 168;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.round(c / 100)}`;
const fixes = (s: State) => s.spots.reduce((n, x) => n + (x.mark === "bad" ? x.fix : 0), 0);
const checked = (s: State) => s.spots.filter((x) => x.mark).length;
/** 0 ask more, 1 haggle first, 2 go for it */
function verdict(s: State): 0 | 1 | 2 {
  if (checked(s) < s.spots.length) return 0;
  return fixes(s) * 100 <= s.price * 15 ? 2 : 1;
}
const isPart = (v: unknown): v is Part => typeof v === "string" && (PARTS as string[]).includes(v);

function initState(ctx: Ctx): State {
  const spots: Spot[] = [];
  for (const p of Array.isArray(P.parts) ? P.parts : []) {
    if (!p || !isPart(p.part) || spots.some((x) => x.part === p.part)) continue;
    const fix = Number.isInteger(p.fixCents) && p.fixCents >= 0 && p.fixCents <= 200_000 ? p.fixCents : 0;
    const sp: Spot = { part: p.part, fix, mark: "", by: "", note: "", at: 0 };
    const who = clean(p.check?.who, 20);
    if (who && typeof p.check?.ok === "boolean") {
      const m = ctx.members.find((x) => x.id === who || x.name.trim().toLowerCase() === who.toLowerCase());
      sp.mark = p.check.ok ? "good" : "bad";
      sp.by = m ? m.id : `o:${who}`;
      sp.note = clean(p.check.note, 48);
    }
    spots.push(sp);
  }
  if (spots.length < 1) for (const part of PARTS) spots.push({ part, fix: 2000, mark: "", by: "", note: "", at: 0 });
  const price = Number.isInteger(P.listing?.priceCents) && P.listing.priceCents >= 0 ? P.listing.priceCents : 0;
  return { name: clean(P.listing?.name, 28) || "Bike", price, buyer: clean(P.buyer, 20), buyerSaid: clean(P.buyerSaid, 60), spots, decided: null };
}

export default defineApp<State, Action, Local>({
  name: "Bike inspect",
  summary: (s) => {
    const v = verdict(s);
    if (s.decided) return `${s.name} ${money(s.price)} · messaged the seller · ${money(fixes(s))} in fixes`;
    return `${s.name} ${money(s.price)} · ${checked(s)} of ${s.spots.length} parts checked · ${v === 2 ? "go for it" : v === 1 ? "haggle first" : "ask more"}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || s.decided) return s;
    if (a.t === "mark" || a.t === "clear") {
      const i = s.spots.findIndex((x) => x.part === a.part);
      if (!isPart(a.part) || i < 0) return s;
      if (a.t === "mark" && typeof a.ok !== "boolean") return s;
      const sp: Spot = a.t === "mark" ? { ...s.spots[i]!, mark: a.ok ? "good" : "bad", by: m.user, note: "", at: m.time } : { ...s.spots[i]!, mark: "", by: "", note: "", at: 0 };
      if (a.t === "clear" && !s.spots[i]!.mark) return s;
      return { ...s, spots: s.spots.map((x, k) => (k === i ? sp : x)) };
    }
    if (a.t === "decide") {
      if (verdict(s) === 0) return s;
      return { ...s, decided: { by: m.user, at: m.time, go: verdict(s) === 2 } };
    }
    return s;
  },

  invariants: {
    "a checked part has a checker": (s) => s.spots.every((x) => (x.mark === "") === (x.by === "")),
    "each part once": (s) => new Set(s.spots.map((x) => x.part)).size === s.spots.length,
    "fixes are whole cents": (s) => s.spots.every((x) => Number.isInteger(x.fix) && x.fix >= 0),
    "you only message the seller after every part is checked": (s) => s.decided === null || s.spots.every((x) => x.mark !== ""),
    "go means the fixes are small": (s) => s.decided === null || s.decided.go === (s.spots.filter((x) => x.mark === "bad").reduce((n, x) => n + x.fix, 0) * 100 <= s.price * 15),
  },

  transitions: {
    "marking sets that part": (p, n, a, m) => a.t !== "mark" || p === n || n.spots.some((x) => x.part === a.part && x.mark === (a.ok ? "good" : "bad") && x.by === m.user && x.at === m.time),
    "a valid mark always lands": (p, n, a, m, ctx) =>
      a.t !== "mark" || typeof a.ok !== "boolean" || p.decided !== null || !inChat(ctx, m.user) || !p.spots.some((x) => x.part === a.part) || n.spots.some((x) => x.part === a.part && x.by === m.user && x.at === m.time),
    "clearing an unchecked part changes nothing": (p, n, a) => a.t !== "clear" || p.spots.some((x) => x.part === a.part && x.mark !== "") || n === p,
    "one part at a time": (p, n) => n.spots.filter((x, i) => x !== p.spots[i]).length <= 1,
    "clearing unchecks it": (p, n, a) => a.t !== "clear" || p === n || n.spots.some((x) => x.part === a.part && x.mark === "" && x.at === 0),
    "deciding is final": (p, n) => p.decided === null || n === p,
    "deciding needs a verdict": (p, n, a, m) => a.t !== "decide" || p === n || (verdict(p) > 0 && n.decided?.by === m.user && n.spots === p.spots),
    "fix costs never change": (p, n) => n.spots.every((x, i) => x.fix === p.spots[i]!.fix && x.part === p.spots[i]!.part),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const x = r.next();
    const part = r.pick(s.spots).part;
    if (x < 0.7) return { t: "mark", part, ok: r.next() < 0.7 };
    if (x < 0.9) return { t: "clear", part };
    return { t: "decide" };
  },

  local: { sel: -1, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const R = Math.min(54, W * 0.14);
    const RX = W * 0.24, FX = W * 0.76, AY = 104;
    const BB = { x: W * 0.47, y: AY + 8 };
    const SEAT = { x: W * 0.4, y: AY - 56 };
    const HT = { x: W * 0.665, y: AY - 58 };
    const HB = { x: W * 0.685, y: AY - 40 };
    const where: Record<Part, { x: number; y: number }> = {
      tires: { x: FX + R * 0.72, y: AY - R * 0.72 },
      chain: { x: (BB.x + RX) / 2, y: AY + 20 },
      brakes: { x: FX - 4, y: AY - R - 6 },
      frame: { x: (SEAT.x + HT.x) / 2, y: AY - 50 },
      saddle: { x: SEAT.x - 6, y: SEAT.y - 20 },
      gears: { x: RX + 6, y: AY + 22 },
    };
    const firstOpen = s.spots.findIndex((x) => !x.mark);
    const sel = local.sel >= 0 && local.sel < s.spots.length ? local.sel : firstOpen >= 0 ? firstOpen : 0;
    const spot = s.spots[sel]!;
    const v = verdict(s);
    const nameOf = (id: string) => (id.startsWith("o:") ? id.slice(2) : members.find((x) => x.id === id)?.name ?? "Someone");
    const lastAt = Math.max(0, ...s.spots.map((x) => x.at));
    const pop = lastAt ? running(lastAt, 500) : null;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.roundRect(0, 0, w, H, 12);
      g.fill();
      // ground shadow
      g.fillStyle = dark ? mix(c.wash, c.text, 0.06) : mix(c.wash, c.secondaryText, 0.12);
      g.beginPath();
      g.ellipse(w / 2, AY + R + 4, W * 0.42, 6, 0, 0, Math.PI * 2);
      g.fill();
      const tire = dark ? mix(c.text, c.wash, 0.55) : p.dark;
      const frame = mix(p.red, p.dark, dark ? 0.05 : 0.1);
      // wheels
      g.lineWidth = 6;
      g.strokeStyle = tire;
      g.beginPath();
      g.arc(RX, AY, R, 0, Math.PI * 2);
      g.moveTo(FX + R, AY);
      g.arc(FX, AY, R, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = mix(c.secondaryText, c.card, 0.3);
      g.beginPath();
      for (const cx of [RX, FX]) {
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          g.moveTo(cx, AY);
          g.lineTo(cx + Math.cos(a) * (R - 4), AY + Math.sin(a) * (R - 4));
        }
      }
      g.stroke();
      // chain and rings
      const chainBad = s.spots.find((x) => x.part === "chain")?.mark === "bad";
      g.strokeStyle = chainBad ? mix(p.orange, p.brown, 0.35) : mix(c.secondaryText, c.text, 0.3);
      g.lineWidth = 2;
      g.setLineDash([3, 2]);
      g.beginPath();
      g.moveTo(BB.x, BB.y - 15);
      g.lineTo(RX, AY - 7);
      g.moveTo(BB.x, BB.y + 15);
      g.lineTo(RX, AY + 7);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = mix(c.secondaryText, c.text, 0.2);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(BB.x, BB.y, 15, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(RX, AY, 7, 0, Math.PI * 2);
      g.stroke();
      // frame
      g.strokeStyle = frame;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(RX, AY);
      g.lineTo(BB.x, BB.y);
      g.lineTo(SEAT.x, SEAT.y);
      g.lineTo(RX, AY);
      g.moveTo(SEAT.x, SEAT.y);
      g.lineTo(HT.x, HT.y);
      g.lineTo(HB.x, HB.y);
      g.lineTo(BB.x, BB.y);
      g.stroke();
      // fork
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(HB.x, HB.y);
      g.quadraticCurveTo(FX - 6, AY - 20, FX, AY);
      g.stroke();
      // seat post and saddle
      g.strokeStyle = mix(c.secondaryText, c.text, 0.2);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(SEAT.x, SEAT.y);
      g.lineTo(SEAT.x - 4, SEAT.y - 14);
      g.stroke();
      g.fillStyle = p.dark;
      g.beginPath();
      g.moveTo(SEAT.x - 22, SEAT.y - 17);
      g.quadraticCurveTo(SEAT.x - 4, SEAT.y - 24, SEAT.x + 12, SEAT.y - 16);
      g.lineTo(SEAT.x - 20, SEAT.y - 12);
      g.closePath();
      g.fill();
      // stem and drop bars
      g.strokeStyle = mix(c.secondaryText, c.text, 0.2);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(HT.x, HT.y);
      g.lineTo(HT.x + 4, HT.y - 8);
      g.lineTo(HT.x + 18, HT.y - 10);
      g.quadraticCurveTo(HT.x + 30, HT.y - 8, HT.x + 26, HT.y + 6);
      g.quadraticCurveTo(HT.x + 22, HT.y + 14, HT.x + 14, HT.y + 10);
      g.stroke();
      // pedals and crank
      g.strokeStyle = p.dark;
      g.beginPath();
      g.moveTo(BB.x - 10, BB.y - 16);
      g.lineTo(BB.x + 10, BB.y + 16);
      g.stroke();
      // hubs
      g.fillStyle = mix(c.secondaryText, c.card, 0.1);
      g.beginPath();
      g.arc(RX, AY, 3, 0, Math.PI * 2);
      g.arc(FX, AY, 3, 0, Math.PI * 2);
      g.fill();
      return pop !== null;
    };

    const lit = (k: number) => (k === 0 ? c.warning : k === 1 ? p.orange : c.positive);
    const lightLabel = ["Ask more", "Haggle first", "Go for it"][v]!;
    const buyerM = s.buyer ? members.find((x) => x.name.trim().toLowerCase() === s.buyer.toLowerCase()) : undefined;
    const mark = (ok: boolean) => {
      dispatch({ t: "mark", part: spot.part, ok });
      haptic(ok ? "light" : "medium");
      const next = s.spots.findIndex((x, i) => i !== sel && !x.mark);
      setLocal({ sel: next >= 0 ? next : sel });
    };

    return (
      <div>
        <CardHeader title={`${s.name} · ${money(s.price)}`} subtitle={`${checked(s)} of ${s.spots.length} parts checked${s.buyer ? ` · for ${s.buyer}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`${s.name} drawn with ${s.spots.length} parts to check; ${checked(s)} checked, ${money(fixes(s))} in fixes`} draw={draw} />
          {s.spots.map((x, i) => {
            const q = where[x.part];
            const on = i === sel;
            const bg = x.mark === "good" ? mix(c.positive, c.card, 0.55) : x.mark === "bad" ? mix(p.orange, c.card, 0.5) : c.card;
            const k = pop !== null && x.at === lastAt ? 1 + Math.sin((pop / 500) * Math.PI) * 0.35 : 1;
            return (
              <button
                key={x.part}
                aria-label={`${LABEL[x.part]}: ${x.mark === "good" ? "looks good" : x.mark === "bad" ? `needs work, ${money(x.fix)}` : "not checked"}`}
                onClick={() => setLocal({ sel: i })}
                style={{ position: "absolute", left: q.x - 22, top: q.y - 22, width: 44, height: 44, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: bg,
                    color: c.text,
                    border: x.mark ? 0 : `2px dashed ${c.secondaryText}`,
                    boxSizing: "border-box",
                    boxShadow: on ? `0 0 0 3px ${c.primary}` : `0 0 0 2px ${c.card}`,
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: x.mark ? "24px" : "20px",
                    textAlign: "center",
                    transform: `scale(${k})`,
                  }}
                >
                  {x.mark === "good" ? "✓" : x.mark === "bad" ? "$" : "?"}
                </span>
                {x.by ? (
                  <span style={{ position: "absolute", right: 2, bottom: 2, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}` }}>
                    <Avatar user={x.by.startsWith("o:") ? { id: x.by, name: nameOf(x.by) } : x.by} size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
          <div style={{ position: "absolute", left: Math.max(0, Math.min(W - 96, where[spot.part].x - 48)), width: 96, top: where[spot.part].y + (where[spot.part].y > H - 50 ? -40 : 16), display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ padding: "0 8px", borderRadius: 8, background: c.card, color: c.text, fontSize: 12, fontWeight: 700, lineHeight: "18px", whiteSpace: "nowrap" }}>{LABEL[spot.part]}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, height: 62, borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", gap: 8, padding: "0 6px 0 10px" }}>
          {spot.by ? (
            <span style={{ flex: "none", display: "flex" }}>
              <Avatar user={spot.by.startsWith("o:") ? { id: spot.by, name: nameOf(spot.by) } : spot.by} size={28} />
            </span>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: "17px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {spot.mark ? `${LABEL[spot.part]} · ${spot.mark === "good" ? "looks good" : `needs work · ${money(spot.fix)}`}` : `${LABEL[spot.part]} · not checked yet`}
            </div>
            <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {spot.mark ? (spot.note ? `${nameOf(spot.by)}: “${spot.note}”` : `${nameOf(spot.by)} checked it`) : ASK[spot.part]}
            </div>
          </div>
          {!s.decided ? (
            spot.mark ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "clear", part: spot.part })}>
                Recheck
              </Button>
            ) : (
              <>
                <Button kind="secondary" onClick={() => mark(false)}>
                  Fix
                </Button>
                <Button kind={v > 0 ? "secondary" : "primary"} onClick={() => mark(true)}>
                  Good
                </Button>
              </>
            )
          ) : null}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <div role="img" aria-label={`Verdict: ${lightLabel}`} style={{ flex: "none", display: "flex", gap: 4, padding: 4, borderRadius: 14, background: dark ? c.wash : p.dark }}>
            {[0, 1, 2].map((k) => (
              <span key={k} style={{ width: 16, height: 16, borderRadius: 8, background: k === v ? lit(k) : mix(lit(k), dark ? c.wash : p.dark, 0.7), boxShadow: k === v ? `0 0 8px ${lit(k)}` : "none" }} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, lineHeight: "18px", fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.decided ? "Messaged the seller" : lightLabel}</div>
            <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fixes(s) ? `${money(s.price)} + ${money(fixes(s))} in fixes` : buyerM && s.buyerSaid ? `${s.buyer}: “${s.buyerSaid}”` : `${s.spots.length - checked(s)} ${s.spots.length - checked(s) === 1 ? "part" : "parts"} left to check`}
            </div>
          </div>
          {!s.decided && v > 0 ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "decide" }); haptic("success"); setLocal({ toast: local.toast + 1, msg: v === 2 ? "Told the seller you'll take it" : `Offered ${money(Math.max(0, s.price - fixes(s)))}` }); }}>
              {v === 2 ? "Message seller" : `Offer ${money(Math.max(0, s.price - fixes(s)))}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
