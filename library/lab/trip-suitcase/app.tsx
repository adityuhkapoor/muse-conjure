import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Toast,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  tween,
  type Child,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Trip suitcase: "how much is this actually gonna cost". An open suitcase packed with the trip's
// costs as drawn things, each sized by what it costs; the luggage tag says what that comes to
// each. Tap something to take it out (it drops into the lid pocket) and the tag swings to the new
// number; tap it again to pack it back. Pin the number and the lid zips shut.

type Params = {
  /** The trip: "spring break" */
  trip: string;
  /** The question from the chat, and who asked */
  ask: { who: string; line: string };
  /** Who is going (2 to 12 names) */
  going: string[];
  /** The costs, in cents; out: already taken out by someone, with what it makes them say */
  items: { label: string; cents: number; out?: string; quip?: string }[];
};

// @params
const P: Params = {
  trip: "spring break",
  ask: { who: "Calvin", line: "ok but how much is this actually gonna cost" },
  going: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  items: [
    { label: "Airbnb", cents: 61200 },
    { label: "Gas", cents: 16000 },
    { label: "Groceries", cents: 9000 },
    { label: "Fancy dinner", cents: 24000, quip: "Maya's spreadsheet would be proud" },
    { label: "Jet skis", cents: 18000, out: "Maya", quip: "we are not jet ski people" },
  ],
};
// @end params

type Kind = "house" | "gas" | "bag" | "dinner" | "ticket";
type Item = { id: string; label: string; cents: number; kind: Kind; packed: boolean; by: string; at: number; quip: string };
type State = { trip: string; ask: { who: string; line: string }; going: { id: string; name: string }[]; items: Item[]; pinned: { by: string; at: number; each: number } | null; last: string };
type Action = { t: "toggle"; item: string } | { t: "pin" } | { t: "unpin" };
type Local = { toast: number };

const MAXI = 6;
const SWING = spring({ stiffness: 120, damping: 6 });
const MOVE = tween({ duration: 500, easing: "standard" });
const ZIP = tween({ duration: 900, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const dollars = (c: number) => `$${String(Math.round(c / 100)).replace(/\B(?=(\d{3})+$)/g, ",")}`;
const packedTotal = (s: State) => s.items.reduce((a, i) => a + (i.packed ? i.cents : 0), 0);
const heads = (s: State) => Math.max(1, s.going.length);
/** Whole dollars each, rounded up so nobody comes up short. */
const each = (s: State) => Math.ceil(packedTotal(s) / heads(s) / 100) * 100;
const kindOf = (label: string): Kind =>
  /airbnb|hotel|cabin|house|stay|room|motel|hostel/i.test(label) ? "house" : /gas|fuel|toll|uber|car/i.test(label) ? "gas" : /grocer|food|snack|drink|costco/i.test(label) ? "bag" : /dinner|lunch|brunch|restaurant|steak|sushi/i.test(label) ? "dinner" : "ticket";

function initState(ctx: Ctx): State {
  const going: { id: string; name: string }[] = [];
  for (const g of Array.isArray(P.going) ? P.going : []) {
    const name = clean(g, 20);
    if (!name || going.length >= 12) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (!going.some((x) => x.id === id)) going.push({ id, name: m ? clean(m.name, 20) || name : name });
  }
  if (going.length < 2) for (const m of ctx.members) if (!going.some((x) => x.id === m.id) && going.length < 12) going.push({ id: m.id, name: clean(m.name, 20) || "Friend" });
  const items: Item[] = [];
  for (const raw of Array.isArray(P.items) ? P.items : []) {
    if (items.length >= MAXI) break;
    const label = clean(raw?.label, 16);
    if (!label || !Number.isInteger(raw.cents) || raw.cents <= 0 || raw.cents > 10_000_000) continue;
    const outBy = clean(raw.out, 20);
    const who = outBy ? going.find((g) => same(g.name, outBy))?.id ?? outBy : "";
    items.push({ id: `i${items.length}`, label, cents: raw.cents, kind: kindOf(label), packed: !outBy, by: who, at: 0, quip: clean(raw.quip, 48) });
  }
  if (!items.length) items.push({ id: "i0", label: "The trip", cents: 60000, kind: "house", packed: true, by: "", at: 0, quip: "" });
  return { trip: clean(P.trip, 24) || "the trip", ask: { who: clean(P.ask?.who, 20), line: clean(P.ask?.line, 60) }, going, items, pinned: null, last: "" };
}

function reduceTrip(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  if (a.t === "toggle") {
    if (s.pinned || typeof a.item !== "string") return s;
    const it = s.items.find((i) => i.id === a.item);
    if (!it) return s;
    if (it.packed && s.items.filter((i) => i.packed).length === 1) return s; // the suitcase is never empty
    return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, packed: !i.packed, by: meta.user, at: meta.time } : i)), last: it.id };
  }
  if (a.t === "pin") {
    if (s.pinned) return s;
    return { ...s, pinned: { by: meta.user, at: meta.time, each: each(s) } };
  }
  if (a.t === "unpin") {
    if (!s.pinned) return s;
    return { ...s, pinned: null };
  }
  return s;
}

// ---- drawing ----

type Box = { x: number; y: number; w: number; h: number };
/** Biggest cost gets a full-height column; the rest share the second column, then split again. */
function layout(items: Item[], b: Box): Map<string, Box> {
  const out = new Map<string, Box>();
  const list = [...items].sort((p, q) => q.cents - p.cents);
  const go = (xs: Item[], r: Box, vertical: boolean) => {
    if (!xs.length) return;
    if (xs.length === 1) return void out.set(xs[0]!.id, r);
    const tot = xs.reduce((a, i) => a + i.cents, 0);
    const k = xs[0]!.cents / tot;
    if (vertical) {
      out.set(xs[0]!.id, { x: r.x, y: r.y, w: r.w * k, h: r.h });
      go(xs.slice(1), { x: r.x + r.w * k, y: r.y, w: r.w * (1 - k), h: r.h }, false);
    } else {
      out.set(xs[0]!.id, { x: r.x, y: r.y, w: r.w, h: r.h * k });
      go(xs.slice(1), { x: r.x, y: r.y + r.h * k, w: r.w, h: r.h * (1 - k) }, true);
    }
  };
  go(list, b, true);
  return out;
}

function Thing(p: { kind: Kind; b: Box; t: Theme; out?: boolean }) {
  const pl = pal(p.t);
  const c = p.t.color;
  const s = Math.max(0.35, Math.min(p.b.w / 70, (p.b.h - 18) / 60, 1.6));
  const cx = p.b.x + p.b.w / 2;
  const cy = p.b.y + (p.b.h - 16) / 2 + 2;
  let art: Child;
  if (p.kind === "house")
    art = (
      <g>
        <path d="M-30 -2 L0 -26 L30 -2 Z" fill={pl.red} />
        <rect x={-24} y={-4} width={48} height={30} rx={2} fill={pl.wall} stroke={mix(pl.wall, c.text, 0.25)} stroke-width={1} />
        <rect x={-6} y={8} width={12} height={18} rx={1} fill={pl.brown} />
        <rect x={-19} y={3} width={9} height={8} rx={1} fill={pl.sky} />
        <rect x={10} y={3} width={9} height={8} rx={1} fill={pl.sky} />
        <rect x={14} y={-22} width={6} height={12} fill={mix(pl.red, c.text, 0.3)} />
      </g>
    );
  else if (p.kind === "gas")
    art = (
      <g>
        <path d="M-16 -18 H10 L18 -10 V24 Q18 26 16 26 H-16 Q-18 26 -18 24 V-16 Q-18 -18 -16 -18 Z" fill={pl.red} />
        <rect x={-14} y={-26} width={14} height={8} rx={2} fill={c.text} />
        <path d="M6 -18 L14 -28 L20 -24" fill="none" stroke={c.text} stroke-width={3} stroke-linecap="round" />
        <path d="M0 -6 C6 2 8 6 6 10 C4 15 -4 15 -6 10 C-8 6 -6 2 0 -6 Z" fill={mix(pl.red, c.card, 0.55)} />
      </g>
    );
  else if (p.kind === "bag")
    art = (
      <g>
        <rect x={10} y={-30} width={7} height={34} rx={3.5} fill={pl.crust} transform="rotate(18)" />
        <circle cx={-6} cy={-16} r={9} fill={pl.green} />
        <circle cx={6} cy={-14} r={7} fill={pl.red} />
        <path d="M-20 -8 H20 L17 26 H-17 Z" fill={mix(pl.orange, c.card, 0.35)} />
        <path d="M-20 -8 H20 L19 -2 H-19 Z" fill={mix(pl.orange, c.text, 0.15)} />
      </g>
    );
  else if (p.kind === "dinner")
    art = (
      <g>
        <ellipse cx={-4} cy={18} rx={28} ry={7} fill={pl.plate} stroke={c.divider} stroke-width={1} />
        <path d="M-26 16 Q-26 -14 -4 -14 Q18 -14 18 16 Z" fill={mix(c.secondaryText, c.card, 0.35)} />
        <circle cx={-4} cy={-17} r={4} fill={mix(c.secondaryText, c.card, 0.2)} />
        <path d="M-18 4 Q-16 -6 -8 -9" fill="none" stroke={c.card} stroke-width={2.5} stroke-linecap="round" opacity={0.7} />
        <path d="M26 -14 H38 Q38 0 32 2 V18 M27 18 H37" fill="none" stroke={pl.purple} stroke-width={2.5} stroke-linecap="round" />
        <path d="M27 -10 H37 Q37 -2 32 -1 Q27 -2 27 -10 Z" fill={pl.purple} />
      </g>
    );
  else
    art = (
      <g>
        <path d="M-26 -14 H26 V-4 A5 5 0 0 0 26 6 V16 H-26 V6 A5 5 0 0 0 -26 -4 Z" fill={pl.yellow} />
        <path d="M8 -14 V16" stroke={mix(pl.yellow, c.text, 0.3)} stroke-width={1.5} stroke-dasharray="3 3" />
        <circle cx={-9} cy={1} r={6} fill={mix(pl.yellow, c.text, 0.25)} />
      </g>
    );
  return <g transform={`translate(${cx} ${cy}) scale(${s})`} opacity={p.out ? 0.55 : 1}>{art}</g>;
}

export default defineApp<State, Action, Local>({
  name: "Trip suitcase",
  summary: (s) =>
    s.pinned
      ? `${s.trip}: pinned at ~${dollars(s.pinned.each)} each`
      : `${s.trip}: ~${dollars(each(s))} each for ${s.items.filter((i) => i.packed).map((i) => i.label.toLowerCase()).join(", ")}`,

  init: initState,
  reduce: (s, a, meta, ctx) => reduceTrip(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "the suitcase is never empty": (s) => s.items.some((i) => i.packed),
    "a pinned number is the suitcase's number": (s) => s.pinned === null || s.pinned.each === each(s),
    "costs are whole cents": (s) => s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0) && new Set(s.items.map((i) => i.id)).size === s.items.length,
    "the tag never comes up short": (s) => each(s) * heads(s) >= packedTotal(s) && each(s) % 100 === 0 && (each(s) - 100) * heads(s) < packedTotal(s),
    "the last moved item exists": (s) => s.last === "" || s.items.some((i) => i.id === s.last),
  },

  transitions: {
    "a tap moves exactly one item": (p, n, a, m) => {
      if (a.t !== "toggle" || p === n) return true;
      const diff = n.items.filter((it, i) => it.packed !== p.items[i]!.packed);
      return diff.length === 1 && diff[0]!.id === a.item && diff[0]!.by === m.user && diff[0]!.at === m.time && n.last === a.item;
    },
    "nothing moves once pinned": (p, n) => p.pinned === null || n.items === p.items,
    "pinning stamps the pinner": (p, n, a, m) => a.t !== "pin" || p === n || (p.pinned === null && n.pinned?.by === m.user && n.pinned.at === m.time),
    "unpinning reopens it": (p, n, a) => a.t !== "unpin" || p === n || (p.pinned !== null && n.pinned === null && n.items === p.items),
    "only pin and unpin touch the pin": (p, n, a) => a.t === "pin" || a.t === "unpin" || n.pinned === p.pinned,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.7) return { t: "toggle", item: r.pick(s.items).id };
    return k < 0.85 ? { t: "pin" } : { t: "unpin" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const font = theme.type.family;
    const per = each(state);

    // Suitcase: lid on the left (with the pocket), body on the right.
    const top = 22;
    const lidW = Math.round(W * 0.3);
    const bodyX = lidW + 6;
    const bodyW = W - bodyX;
    const caseH = H - top - 4;
    const shell = dark ? mix(pl.blue, c.card, 0.35) : mix(pl.blue, c.text, 0.25);
    const lining = dark ? mix(c.wash, pl.blue, 0.12) : mix(pl.blue, c.card, 0.86);
    const inner: Box = { x: bodyX + 10, y: top + 10, w: bodyW - 20, h: caseH - 20 };

    // Animate from the layout before the last move to the one now.
    const lastIt = confirmed.items.find((i) => i.id === confirmed.last);
    const e = lastIt && lastIt.at > 0 ? running(lastIt.at, 500) : null;
    const now = layout(state.items.filter((i) => i.packed), inner);
    const before = e !== null && lastIt ? layout(confirmed.items.filter((i) => (i.id === lastIt.id ? !i.packed : i.packed)), inner) : now;
    const k = e === null ? 1 : MOVE(e);
    const lerp = (a: Box | undefined, b: Box | undefined): Box | undefined => (!a ? b : !b ? a : { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

    const outs = state.items.filter((i) => !i.packed);
    const pocket: Box = { x: 10, y: top + caseH * 0.42, w: lidW - 20, h: caseH * 0.58 - 10 };
    const outBox = (j: number): Box => ({ x: pocket.x + 4, y: pocket.y + 8 + j * ((pocket.h - 12) / Math.max(1, outs.length)), w: pocket.w - 8, h: (pocket.h - 12) / Math.max(1, outs.length) });

    const art: Child[] = [];
    const over: Child[] = [];
    art.push(<rect key="lid" x={0} y={top} width={lidW} height={caseH} rx={14} fill={shell} />);
    art.push(<rect key="lidin" x={6} y={top + 6} width={lidW - 12} height={caseH - 12} rx={10} fill={lining} />);
    art.push(<rect key="pocket" x={pocket.x} y={pocket.y} width={pocket.w} height={pocket.h} rx={8} fill="none" stroke={mix(pl.blue, c.card, dark ? 0.2 : 0.5)} stroke-width={1.5} stroke-dasharray="4 3" />);
    art.push(
      <text key="pl" x={lidW / 2} y={pocket.y - 6} text-anchor="middle" font-size={11} fill={c.secondaryText} font-family={font}>
        {outs.length ? "Taken out" : "Pocket"}
      </text>,
    );
    art.push(<rect key="body" x={bodyX} y={top} width={bodyW} height={caseH} rx={14} fill={shell} />);
    art.push(<rect key="bodyin" x={bodyX + 6} y={top + 6} width={bodyW - 12} height={caseH - 12} rx={10} fill={lining} />);
    art.push(<rect key="hinge" x={lidW - 4} y={top + 30} width={14} height={caseH - 60} rx={4} fill={mix(shell, c.text, 0.2)} />);
    // handle on top of the body
    art.push(<path key="handle" d={`M ${bodyX + bodyW / 2 - 26} ${top + 2} V ${top - 10} Q ${bodyX + bodyW / 2 - 26} ${top - 16} ${bodyX + bodyW / 2 - 20} ${top - 16} H ${bodyX + bodyW / 2 + 20} Q ${bodyX + bodyW / 2 + 26} ${top - 16} ${bodyX + bodyW / 2 + 26} ${top - 10} V ${top + 2}`} fill="none" stroke={c.text} stroke-width={5} stroke-linecap="round" />);

    state.items.forEach((it) => {
      const tapToggle = !state.pinned ? () => { dispatch({ t: "toggle", item: it.id }); haptic("light"); } : null;
      if (it.packed) {
        const b = lerp(before.get(it.id) ?? (e !== null && lastIt?.id === it.id ? outBox(0) : undefined), now.get(it.id))!;
        const pad = 3;
        art.push(<rect key={`bx${it.id}`} x={b.x + pad} y={b.y + pad} width={Math.max(0, b.w - 2 * pad)} height={Math.max(0, b.h - 2 * pad)} rx={8} fill={dark ? c.card : c.card} opacity={0.85} />);
        art.push(<Thing key={`th${it.id}`} kind={it.kind} b={{ x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad }} t={theme} />);
        const small = b.w < 66 || b.h < 46;
        if (!state.pinned) over.push(
          <button
            key={`o${it.id}`}
            type="button"
            aria-label={`${it.label}, ${dollars(it.cents)}. Take out`}
            {...(tapToggle ? { onClick: tapToggle } : {})}
            style={{ position: "absolute", left: b.x + pad, top: b.y + pad, width: Math.max(44, b.w - 2 * pad), height: Math.max(44, b.h - 2 * pad), display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 3, cursor: tapToggle ? "pointer" : "default" }}
          >
            <span style={{ maxWidth: b.w - 10, fontSize: 11, lineHeight: "13px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {small ? dollars(it.cents) : `${it.label} ${dollars(it.cents)}`}
            </span>
          </button>,
        );
      } else {
        const j = outs.findIndex((o) => o.id === it.id);
        const target = outBox(j);
        const from = e !== null && lastIt?.id === it.id ? before.get(it.id) : undefined;
        const b = from ? lerp(from, target)! : target;
        art.push(<Thing key={`th${it.id}`} kind={it.kind} b={{ x: b.x, y: b.y, w: b.w * 0.6, h: b.h }} t={theme} out />);
        over.push(
          <button
            key={`o${it.id}`}
            type="button"
            aria-label={`${it.label}, ${dollars(it.cents)}, taken out. Pack it`}
            {...(tapToggle ? { onClick: tapToggle } : {})}
            style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: Math.max(44, b.h), display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 2, paddingRight: 2, cursor: tapToggle ? "pointer" : "default" }}
          >
            {it.by ? <Avatar user={{ id: it.by, name: state.going.find((g) => g.id === it.by)?.name ?? it.by }} size={18} /> : null}
            <span style={{ fontSize: 11, lineHeight: "13px", color: c.secondaryText, textDecoration: "line-through", whiteSpace: "nowrap" }}>{dollars(it.cents)}</span>
          </button>,
        );
      }
    });

    // Lid zips shut over the body when pinned.
    const z = state.pinned ? ZIP(running(state.pinned.at, 900) ?? 900) : 0;
    if (z > 0) {
      art.push(<rect key="shut" x={bodyX} y={top} width={bodyW * z} height={caseH} rx={14} fill={shell} />);
      art.push(<path key="zip" d={`M ${bodyX + 12} ${top + caseH / 2} H ${bodyX + 12 + (bodyW - 24) * z}`} stroke={mix(shell, c.card, 0.5)} stroke-width={3} stroke-dasharray="2 3" />);
      art.push(<rect key="stitch" x={bodyX + 8} y={top + 8} width={Math.max(0, bodyW * z - 16)} height={caseH - 16} rx={10} fill="none" stroke={mix(shell, c.card, 0.35)} stroke-width={1.5} stroke-dasharray="5 4" />);
      art.push(<rect key="pull" x={bodyX + 4 + (bodyW - 24) * z} y={top + caseH / 2 - 7} width={10} height={14} rx={3} fill={c.card} />);
    }

    // Luggage tag, swinging from the handle.
    const swingAt = Math.max(lastIt?.at ?? 0, confirmed.pinned?.at ?? 0);
    const se = swingAt > 0 ? running(swingAt, 1600) : null;
    const ang = se === null ? -6 : -6 + 18 * (1 - SWING(se)) * (lastIt && !lastIt.packed ? -1 : 1);
    const tagW = Math.min(108, lidW - 4);
    const tagX = 2;
    const tagShown = state.pinned ? state.pinned.each : per;

    return (
      <div>
        <CardHeader title={`${state.trip[0]!.toUpperCase()}${state.trip.slice(1)}, all in`} subtitle={`${dollars(packedTotal(state))} packed · ${state.going.length} going`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Suitcase with ${state.items.filter((i) => i.packed).length} costs packed, about ${dollars(per)} each`} style={{ display: "block", overflow: "visible" }}>
            {art}
          </svg>
          {over}
          <div
            aria-hidden="true"
            style={{ position: "absolute", left: tagX, top: top + 10, width: tagW, transformOrigin: `${tagW - 12}px 34px`, transform: `rotate(${ang}deg)`, pointerEvents: "none" }}
          >
            <svg width={tagW} height={70} viewBox={`0 0 ${tagW} 70`} style={{ display: "block", overflow: "visible" }}>
              <path d={`M ${tagW - 12} 34 Q ${(tagW + bodyX + bodyW / 2) / 2} ${-14} ${bodyX + bodyW / 2 - 28} ${-10}`} fill="none" stroke={c.text} stroke-width={1.5} />
              <path d={`M ${tagW - 14} 2 H 4 Q 0 2 0 6 V 62 Q 0 66 4 66 H ${tagW - 14} L ${tagW - 2} 52 V 16 Z`} fill={state.pinned ? pl.green : pl.yellow} stroke={mix(pl.yellow, c.text, 0.3)} stroke-width={1} />
              <circle cx={tagW - 12} cy={34} r={3.5} fill={c.card} />
              <text x={(tagW - 16) / 2} y={22} text-anchor="middle" font-size={11} fill={dark ? c.card : c.text} font-family={font}>
                {state.pinned ? "Pinned" : "About"}
              </text>
              <text x={(tagW - 16) / 2} y={44} text-anchor="middle" font-size={20} font-weight={700} fill={dark ? c.card : c.text} font-family={font}>
                {dollars(tagShown)}
              </text>
              <text x={(tagW - 16) / 2} y={59} text-anchor="middle" font-size={11} fill={dark ? c.card : c.text} font-family={font}>
                each
              </text>
            </svg>
          </div>
        </div>
        <div style={{ marginTop: 8, minHeight: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden" }}>
          {(() => {
            const moved = lastIt ?? null;
            if (state.pinned) return <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${state.pinned.by === me ? "You" : state.going.find((g) => g.id === state.pinned!.by)?.name ?? "Someone"} pinned it · ${dollars(state.pinned.each)} each, ${state.going.length} people`}</span>;
            if (moved && !moved.packed && moved.quip) return <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${moved.label} out · ${moved.quip}`}</span>;
            if (moved) return <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${moved.label} ${moved.packed ? "packed back" : "taken out"} · was ~${dollars(Math.ceil((packedTotal(state) + (moved.packed ? -moved.cents : moved.cents)) / heads(state) / 100) * 100)}`}</span>;
            return (
              <>
                {state.ask.who ? <Avatar user={{ id: state.going.find((g) => same(g.name, state.ask.who))?.id ?? state.ask.who, name: state.ask.who }} size={20} /> : null}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.ask.line ? `"${state.ask.line}"` : "Tap a cost to take it out"}</span>
              </>
            );
          })()}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <Facepile users={state.going.map((g) => ({ id: g.id, name: g.name }))} max={4} size={24} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.pinned ? "Zipped" : "Tap to take out"}</span>
          {state.pinned ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "unpin" })}>
              Unzip
            </Button>
          ) : (
            <Button kind="primary" onClick={() => { dispatch({ t: "pin" }); haptic("success"); setLocal({ toast: local.toast + 1 }); }}>
              {`Pin ${dollars(per)}`}
            </Button>
          )}
        </div>
        {local.toast > 0 && state.pinned ? <Toast key={local.toast}>{`Pinned · ${dollars(state.pinned.each)} each`}</Toast> : null}
      </div>
    );
  },
});
