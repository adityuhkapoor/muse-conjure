import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Dumpling fold-off: a two-minute timing game before dumpling night. A chopstick sweeps along the
// wrapper's edge; pinch when it is in the green and you get a neat pleat, miss and it tears. Eight
// pinches make a dumpling; steam it and it joins everyone else's in the steamer basket, faces on top.
// The neatest dumpling picks the order.

type Params = {
  /** Where and what is at stake */
  place: string;
  prize: string;
  /** Dumplings already in the steamer: who and how many neat pleats out of 8, with a line */
  folds: { who: string; neat: number; said?: string }[];
};

// @params
const P: Params = {
  place: "Golden Lantern, Friday",
  prize: "Neatest fold picks the order",
  folds: [
    { who: "Arun", neat: 7, said: "rice cooker hands" },
    { who: "Tsai Lin", neat: 6 },
    { who: "Will", neat: 3, said: "they're rustic" },
    { who: "Calvin", neat: 2, said: "fell asleep mid fold" },
  ],
};
// @end params

type Fold = { id: string; pleats: number[]; score: number; tries: number; at: number; said: string };
type State = { place: string; prize: string; folds: Fold[]; cast: string[] };
type Action = { t: "fold"; pleats: number[] };
type Local = { start: number; pinches: number[]; spots: number[]; toast: number };

const N = 8;
const ZONES = [0.22, 0.7, 0.42, 0.86, 0.3, 0.62, 0.14, 0.5];
const H = 196;
const zoneW = (i: number) => 0.12 - 0.007 * i;
const period = (i: number) => 1500 - 110 * i;
/** Where the chopstick is on the edge (0 to 1) `ms` after the pinch round started. */
const needle = (ms: number, i: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * ms) / period(i));

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const okPleats = (v: unknown): v is number[] => Array.isArray(v) && v.length === N && v.every((x) => x === 0 || x === 1);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ranked = (s: State) => [...s.folds].sort((a, b) => b.score - a.score || a.at - b.at);

function initState(ctx: Ctx): State {
  const folds: Fold[] = [];
  const cast: string[] = [];
  for (const f of Array.isArray(P.folds) ? P.folds : []) {
    const name = clean(f?.who, 20);
    if (!name || folds.length >= 8) continue;
    const id = idFor(ctx, name);
    if (folds.some((x) => x.id === id)) continue;
    cast.push(id);
    const neat = Number.isInteger(f.neat) ? Math.max(0, Math.min(N, f.neat)) : 0;
    const pleats = Array.from({ length: N }, (_, i) => ((i * 5 + name.length) % N < neat ? 1 : 0));
    folds.push({ id, pleats, score: sum(pleats), tries: 1, at: 0, said: clean(f.said, 40) });
  }
  return { place: clean(P.place, 30), prize: clean(P.prize, 44) || "Neatest fold wins", folds, cast };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u) || a.t !== "fold" || !okPleats(a.pleats)) return s;
  const score = sum(a.pleats);
  const old = s.folds.find((f) => f.id === u);
  if (old && old.score > score) return { ...s, folds: s.folds.map((f) => (f.id === u ? { ...f, tries: f.tries + 1 } : f)) };
  const f: Fold = { id: u, pleats: [...a.pleats], score, tries: (old?.tries ?? 0) + 1, at: Math.max(1, m.time), said: "" };
  return { ...s, folds: old ? s.folds.map((x) => (x.id === u ? f : x)) : [...s.folds, f].slice(-8) };
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
  name: "Dumpling fold-off",
  summary: (s) => {
    const top = ranked(s)[0];
    return top ? `Dumpling fold-off: best is ${top.score} of ${N} neat · ${s.folds.length} folded` : "Dumpling fold-off: nobody has folded yet";
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const folds = s.folds.filter((f) => inChat(ctx, f.id) || s.cast.includes(f.id));
    return folds.length === s.folds.length ? s : { ...s, folds };
  },

  invariants: {
    "scores count the neat pleats": (s) => s.folds.every((f) => okPleats(f.pleats) && f.score === sum(f.pleats)),
    "one dumpling per person, eight in the basket": (s) => new Set(s.folds.map((f) => f.id)).size === s.folds.length && s.folds.length <= 8,
    "everyone in the basket has folded": (s) => s.folds.every((f) => Number.isInteger(f.tries) && f.tries >= 1),
    "dumplings belong to the chat or the people named": (s, ctx) => s.folds.every((f) => inChat(ctx, f.id) || s.cast.includes(f.id)),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a fold counts as a try": (p, n, a, m) => p === n || (n.folds.find((f) => f.id === m.user)?.tries ?? 0) === (p.folds.find((f) => f.id === m.user)?.tries ?? 0) + 1 || !okPleats(a.pleats),
    "your best never gets worse": (p, n, _a, m) => (n.folds.find((f) => f.id === m.user)?.score ?? -1) >= (p.folds.find((f) => f.id === m.user)?.score ?? -1),
    "a better fold lands in the basket as folded": (p, n, a, m) => {
      if (p === n) return true;
      const was = p.folds.find((f) => f.id === m.user)?.score ?? -1;
      const now = n.folds.find((f) => f.id === m.user)!;
      return sum(a.pleats) < was || (now.pleats.join() === a.pleats.join() && now.at === Math.max(1, m.time));
    },
    "other dumplings stay put": (p, n, _a, m) => n.folds.filter((f) => f.id !== m.user).every((f) => p.folds.some((x) => x.id === f.id && x.score === f.score && x.tries === f.tries)),
  },

  arbitrary: (_s, _u, r) => ({ t: "fold", pleats: Array.from({ length: N }, () => (r.next() < 0.6 ? 1 : 0)) }),

  local: { start: 0, pinches: [], spots: [], toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const i = local.pinches.length;
    const folding = local.start > 0 && i < N;
    const done = local.start > 0 && i >= N;
    const neat = sum(local.pinches);
    const mine = state.folds.find((f) => f.id === me);
    const order = ranked(state);
    const best = order[0];
    const wx = Math.min(96, W * 0.26);
    const wy = 112;
    const wr = Math.min(74, W * 0.2);
    const bx = W - Math.min(96, W * 0.27);
    const br = Math.min(84, W * 0.24);
    const arc0 = Math.PI * 1.12, arc1 = Math.PI * 1.88;
    const at = (f: number) => arc0 + (arc1 - arc0) * f;
    const recent = mine && mine.at > 0 ? running(mine.at, 900) : null;
    const slots = state.folds.slice(0, 8);
    const slotPos = (k: number) => {
      const a = (k / Math.max(1, slots.length)) * Math.PI * 2 - Math.PI / 2;
      const r = slots.length > 1 ? br * 0.56 : 0;
      return { x: bx + r * Math.cos(a), y: wy + r * Math.sin(a) };
    };

    const pinch = () => {
      if (!folding) return;
      const ms = clock.value - local.start;
      const pos = needle(ms, i);
      const ok = Math.abs(pos - ZONES[i]!) <= zoneW(i) ? 1 : 0;
      haptic(ok ? "light" : "medium");
      setLocal({ pinches: [...local.pinches, ok], spots: [...local.spots, pos], start: i + 1 < N ? clock.value : local.start });
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const ms = f.now - local.start;
      // the wrapper
      g.fillStyle = mix(p.cream, c.card, 0.25);
      g.beginPath();
      g.arc(wx, wy, wr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.crust, p.red, 0.25);
      g.beginPath();
      g.ellipse(wx, wy + 6, wr * 0.48, wr * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.green;
      g.beginPath();
      for (const [dx, dy] of [[-10, 0], [8, 10], [14, -4], [-4, 14]]) {
        g.moveTo(wx + dx! + 3, wy + 6 + dy!);
        g.arc(wx + dx!, wy + 6 + dy!, 3, 0, Math.PI * 2);
      }
      g.fill();
      // the edge to pleat
      g.strokeStyle = c.divider;
      g.lineWidth = 6;
      g.lineCap = "round";
      g.beginPath();
      g.arc(wx, wy, wr - 4, arc0, arc1);
      g.stroke();
      if (folding) {
        g.strokeStyle = p.green;
        g.lineWidth = 8;
        g.beginPath();
        g.arc(wx, wy, wr - 4, at(ZONES[i]! - zoneW(i)), at(ZONES[i]! + zoneW(i)));
        g.stroke();
      }
      // pleats so far: neat crimps, or tears
      local.spots.forEach((sp, k) => {
        const a = at(sp);
        const x = wx + (wr - 4) * Math.cos(a), y = wy + (wr - 4) * Math.sin(a);
        if (local.pinches[k]) {
          g.strokeStyle = mix(p.cream, p.dark, 0.35);
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(x - 6 * Math.cos(a), y - 6 * Math.sin(a));
          g.quadraticCurveTo(x + 4 * Math.sin(a), y - 4 * Math.cos(a), x + 7 * Math.cos(a), y + 7 * Math.sin(a));
          g.stroke();
        } else {
          g.strokeStyle = p.red;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x - 5, y - 4);
          g.lineTo(x - 1, y + 3);
          g.lineTo(x + 2, y - 3);
          g.lineTo(x + 5, y + 4);
          g.stroke();
        }
      });
      // the chopstick
      if (folding) {
        const a = at(needle(ms, i));
        g.strokeStyle = p.brown;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(wx + (wr + 22) * Math.cos(a), wy + (wr + 22) * Math.sin(a));
        g.lineTo(wx + (wr - 14) * Math.cos(a), wy + (wr - 14) * Math.sin(a));
        g.stroke();
      }
      // the steamer basket
      g.fillStyle = mix(p.crust, c.card, 0.2);
      g.beginPath();
      g.arc(bx, wy, br, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = mix(p.crust, p.brown, 0.5);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(bx, wy, br - 3, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1;
      g.beginPath();
      for (let k = -3; k <= 3; k++) {
        g.moveTo(bx - br * 0.8, wy + k * br * 0.24);
        g.lineTo(bx + br * 0.8, wy + k * br * 0.24);
      }
      g.stroke();
      // dumplings in the basket, a crescent each, bigger with more neat pleats
      g.fillStyle = mix(p.cream, c.card, 0.1);
      g.beginPath();
      slots.forEach((fd, k) => {
        const { x, y } = slotPos(k);
        const r = 17 + fd.score * 0.6;
        g.moveTo(x - r, y + 8);
        g.quadraticCurveTo(x, y - r * 1.2, x + r, y + 8);
        g.quadraticCurveTo(x, y + r * 0.7, x - r, y + 8);
      });
      g.fill();
      // steam
      g.strokeStyle = mix(p.soft, c.card, 0.3);
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const ph = ((f.now / 1600 + k / 3) % 1);
        const x = bx - 20 + k * 20;
        const y0 = wy - br - 4 - ph * 16;
        g.moveTo(x, y0 + 12);
        g.quadraticCurveTo(x + 5, y0 + 6, x, y0);
      }
      g.stroke();
      return true;
    };

    return (
      <div>
        <CardHeader title="Dumpling fold-off" subtitle={`${state.place ? `${state.place} · ` : ""}${state.prize}`} />
        <div style={{ position: "relative", height: H, marginTop: 2 }}>
          <Canvas height={H} label={`Dumpling wrapper with ${i} of ${N} pinches; ${state.folds.length} dumplings in the steamer`} draw={draw} onPointer={(e) => { if (e.type === "down" && e.x < W / 2) pinch(); }} />
          {/* faces on the dumplings in the basket */}
          {slots.map((fd, k) => {
            const { x, y } = slotPos(k);
            const isBest = best && fd.id === best.id && fd.score > 0;
            const bump = fd.id === me && recent !== null ? Math.sin((recent / 900) * Math.PI) * -10 : 0;
            return (
              <span key={fd.id} style={{ position: "absolute", left: x - 9, top: y - 12 + bump, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
                <span style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${isBest ? p.yellow : fd.id === me ? c.primary : c.card}` }}>
                  <Face id={fd.id} members={members} size={18} theme={theme} />
                </span>
                <span style={{ marginTop: -2, padding: "0 4px", borderRadius: 6, background: c.card, color: c.text, fontSize: 10, fontWeight: 700, lineHeight: "12px" }}>{fd.score}</span>
              </span>
            );
          })}
          {slots.length === 0 ? <span style={{ position: "absolute", left: bx - 50, width: 100, top: wy - 10, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.text }}>Empty steamer</span> : null}
          {/* pinch counter */}
          <span style={{ position: "absolute", left: 0, top: 4, display: "flex", gap: 3 }}>
            {Array.from({ length: N }, (_, k) => (
              <span key={k} style={{ width: 8, height: 8, borderRadius: 4, background: k < i ? (local.pinches[k] ? p.green : p.red) : c.wash }} />
            ))}
          </span>
          {!local.start ? (
            <span style={{ position: "absolute", left: wx - 60, width: 120, top: wy + wr * 0.5, textAlign: "center", fontSize: 12, lineHeight: "16px", fontWeight: 600, color: c.text, background: c.card, borderRadius: 999, padding: "2px 0" }}>Pinch in the green</span>
          ) : null}
        </div>

        <div style={{ marginTop: 6, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {folding
            ? `Pinch ${i + 1} of ${N} · ${neat} neat so far`
            : done
              ? `${neat} of ${N} neat${mine && mine.score > neat ? ` · your best is still ${mine.score}` : ""}`
              : mine
                ? `Your best: ${mine.score} of ${N} · ${mine.tries} ${mine.tries === 1 ? "try" : "tries"}`
                : (() => {
                    const q = state.folds.find((f) => f.said);
                    const nm = q ? members.find((m) => m.id === q.id)?.name ?? q.id : "";
                    return q ? `${nm}: “${q.said}”` : "Eight pinches make a dumpling";
                  })()}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            {folding ? (
              <Button kind="primary" wide onClick={pinch}>Pinch</Button>
            ) : done ? (
              <Button kind="primary" wide onClick={() => { haptic("success"); dispatch({ t: "fold", pleats: local.pinches }); setLocal({ start: 0, pinches: [], spots: [], toast: local.toast + 1 }); }}>Steam it</Button>
            ) : (
              <Button kind="primary" wide onClick={() => { haptic("light"); setLocal({ start: clock.value, pinches: [], spots: [] }); }}>{mine ? "Fold another" : "Start folding"}</Button>
            )}
          </div>
          {done ? <Button kind="secondary" onClick={() => setLocal({ start: clock.value, pinches: [], spots: [] })}>Redo</Button> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, minHeight: 20, fontSize: 13, color: c.text, whiteSpace: "nowrap", overflow: "hidden" }}>
          {best ? (
            <>
              <Face id={best.id} members={members} size={20} theme={theme} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{`${best.id === me ? "You pick" : `${members.find((m) => m.id === best.id)?.name ?? best.id} picks`} the order · ${best.score} of ${N} neat`}</span>
            </>
          ) : (
            <span style={{ color: c.secondaryText }}>First neat dumpling picks the order</span>
          )}
        </div>
        {local.toast > 0 && mine && mine.at > 0 ? <Toast key={local.toast}>{`In the steamer · ${mine.score} of ${N} neat`}</Toast> : null}
      </div>
    );
  },
});
