import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Receipt,
  Thumb,
  Toast,
  circle,
  ellipse,
  fitText,
  haptic,
  line,
  mix,
  pal,
  path,
  rect,
  running,
  spring,
  springs,
  thumbKind,
  tween,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Move-out sale: someone moving out sells their things to friends before it goes public. Tap an
// item to claim it, line up behind a taken one, then hold your haul and get a slip with the pickup.

type Kind = "couch" | "desk" | "lamp" | "bike" | "fridge" | "plant" | "other";
type Params = {
  /** Who is moving, exactly as in the members list */
  seller: string;
  /** Up to 6 things for sale. claimedBy: who already called it, by name, or empty. */
  items: { name: string; priceCents: number; kind: Kind; claimedBy: string }[];
  /** When it goes on Marketplace: "tomorrow 9am" */
  publicWhen: string;
  /** "Sat 10–12 · 2nd floor" */
  pickup: string;
  /** A line from the seller: "bring a dolly lol", or empty */
  note: string;
};

// @params
const P: Params = {
  seller: "Theo",
  items: [
    { name: "Velvet couch", priceCents: 18000, kind: "couch", claimedBy: "Noa" },
    { name: "Standing desk", priceCents: 9000, kind: "desk", claimedBy: "" },
    { name: "Arc lamp", priceCents: 2500, kind: "lamp", claimedBy: "Priya" },
    { name: "Road bike", priceCents: 12000, kind: "bike", claimedBy: "" },
    { name: "Mini fridge", priceCents: 4000, kind: "fridge", claimedBy: "" },
    { name: "Monstera", priceCents: 1500, kind: "plant", claimedBy: "" },
  ],
  publicWhen: "tomorrow 9am",
  pickup: "Sat 10–12 · 2nd floor",
  note: "bring a dolly lol",
};
// @end params

/** owner: member id or null. at: meta.time of the last change of owner. line: members waiting, in order. */
type Item = { id: string; name: string; price: number; kind: Kind; owner: string | null; at: number; line: string[] };
type State = {
  seller: string | null;
  items: Item[];
  holds: { user: string; at: number }[];
  publicWhen: string;
  pickup: string;
  note: string;
};
type Action =
  | { t: "claim"; item: string }
  | { t: "unclaim"; item: string }
  | { t: "line"; item: string }
  | { t: "hold" }
  | { t: "add"; name: string; priceCents: number };
type Local = { name: string; price: string; adding: boolean; closed: boolean; lined: string[] };
type Rec = Record<string, unknown>;

const MAX_ITEMS = 6;
const MAX_PRICE = 10_000_000;
const KINDS: Kind[] = ["couch", "desk", "lamp", "bike", "fridge", "plant", "other"];
const SLIP_MS = 500;
const slipMotion = tween({ duration: SLIP_MS, easing: "decelerate" });
const dropMotion = spring(springs.iosBouncy);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const kindOf = (name: string): Kind => {
  const n = name.toLowerCase();
  if (/couch|sofa/.test(n)) return "couch";
  if (/desk|table/.test(n)) return "desk";
  if (/lamp|light/.test(n)) return "lamp";
  if (/bike/.test(n)) return "bike";
  if (/fridge/.test(n)) return "fridge";
  if (/plant|monstera|pothos/.test(n)) return "plant";
  return "other";
};
const heldIn = (s: State, u: string) => s.holds.some((h) => h.user === u);
const owns = (s: State, u: string) => s.items.filter((i) => i.owner === u);
const ownerOf = (s: State, id: unknown) => s.items.find((i) => i.id === id)?.owner;
const lineOf = (s: State, id: unknown) => s.items.find((i) => i.id === id)?.line ?? [];
const involved = (s: State, u: string) => heldIn(s, u) || s.items.some((i) => i.owner === u || i.line.includes(u));

// ---- Reducer side ----

function reduceSale(s: State, a: Rec, meta: Meta, ctx: Ctx): State {
  const me = meta.user;
  if (!inChat(ctx, me)) return s;
  const isSeller = s.seller === me;
  const setItem = (id: string, f: (i: Item) => Item): State => ({ ...s, items: s.items.map((i) => (i.id === id ? f(i) : i)) });

  if (a.t === "add") {
    if (s.items.length >= MAX_ITEMS || typeof a.name !== "string" || !isInt(a.priceCents)) return s;
    if (!isSeller && !(s.seller === null && !involved(s, me))) return s;
    const name = a.name.trim();
    if (name.length < 1 || name.length > 28 || a.priceCents < 0 || a.priceCents > MAX_PRICE) return s;
    const item: Item = { id: `n${meta.seq}`, name, price: a.priceCents, kind: kindOf(name), owner: null, at: 0, line: [] };
    return { ...s, seller: s.seller ?? me, items: [...s.items, item] };
  }

  if (isSeller || heldIn(s, me)) return s;

  if (a.t === "claim") {
    const item = s.items.find((i) => i.id === a.item);
    if (!item || item.owner !== null) return s;
    return setItem(item.id, (i) => ({ ...i, owner: me, at: meta.time, line: i.line.filter((u) => u !== me) }));
  }

  if (a.t === "unclaim") {
    const item = s.items.find((i) => i.id === a.item);
    if (!item || item.owner !== me) return s;
    return setItem(item.id, (i) => ({ ...i, owner: i.line[0] ?? null, at: meta.time, line: i.line.slice(1) }));
  }

  if (a.t === "line") {
    const item = s.items.find((i) => i.id === a.item);
    if (!item || item.owner === null || item.owner === me) return s;
    return setItem(item.id, (i) => ({ ...i, line: i.line.includes(me) ? i.line.filter((u) => u !== me) : [...i.line, me] }));
  }

  if (a.t === "hold") {
    if (owns(s, me).length === 0) return s;
    return { ...s, holds: [...s.holds, { user: me, at: meta.time }] };
  }

  return s;
}

// ---- Check side ----

const lineDiff = (p: string[], n: string[]) => [...p.filter((u) => !n.includes(u)), ...n.filter((u) => !p.includes(u))];

export default defineApp<State, Action, Local>({
  name: "Move-out sale",
  summary: (s, ctx) => {
    const who = s.seller ? ctx.members.find((m) => m.id === s.seller)?.name : undefined;
    const head = who ? `${who}'s move-out sale` : "Move-out sale";
    if (s.items.length === 0) return `${head}: nothing listed yet`;
    const claimed = s.items.filter((i) => i.owner !== null);
    if (claimed.length === s.items.length && claimed.every((i) => heldIn(s, i.owner!))) return `${head}: sold out to friends`;
    return `${head}: ${claimed.length} of ${s.items.length} claimed · ${s.items.length - claimed.length} left`;
  },

  init: (ctx) => {
    const cap = (v: unknown, n = 40) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const find = (name: unknown) => {
      const want = typeof name === "string" ? name.trim().toLowerCase() : "";
      return want ? ctx.members.find((m) => m.id === name || (m.name ?? "").toLowerCase() === want) : undefined;
    };
    const seller = find(P.seller)?.id ?? null;
    const items: Item[] = [];
    (Array.isArray(P.items) ? P.items : []).forEach((it) => {
      if (items.length >= MAX_ITEMS || !it || typeof it.name !== "string") return;
      const name = it.name.trim().slice(0, 40);
      if (!name || !isInt(it.priceCents) || it.priceCents < 0 || it.priceCents > MAX_PRICE) return;
      const who = find(it.claimedBy)?.id;
      items.push({
        id: `i${items.length}`,
        name,
        price: it.priceCents,
        kind: KINDS.includes(it.kind) ? it.kind : "other",
        owner: who && who !== seller ? who : null,
        at: 0,
        line: [],
      });
    });
    return { seller, items, holds: [], publicWhen: cap(P.publicWhen), pickup: cap(P.pickup), note: cap(P.note) };
  },

  reduce: (state, action, meta, ctx) => reduceSale(state, action as unknown as Rec, meta, ctx),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const sellerGone = state.seller !== null && !here(state.seller);
    const fine =
      !sellerGone &&
      state.holds.every((h) => here(h.user)) &&
      state.items.every((i) => (i.owner === null || here(i.owner)) && i.line.every(here));
    if (fine) return state;
    return {
      ...state,
      seller: sellerGone ? null : state.seller,
      holds: state.holds.filter((h) => here(h.user)),
      items: state.items.map((i) => {
        const wait = i.line.filter(here);
        if (i.owner === null || here(i.owner)) return { ...i, line: wait };
        return { ...i, owner: wait[0] ?? null, line: wait.slice(1) };
      }),
    };
  },

  invariants: {
    "owners and people in line are in the chat, never the seller": (s, ctx) =>
      (s.seller === null || inChat(ctx, s.seller)) &&
      s.items.every((i) => (i.owner === null || (inChat(ctx, i.owner) && i.owner !== s.seller)) && i.line.every((u) => inChat(ctx, u) && u !== s.seller)),
    "nobody is in line for their own item; lines have no repeats": (s) => s.items.every((i) => !i.line.includes(i.owner ?? "") && new Set(i.line).size === i.line.length),
    "a line only forms behind an owner": (s) => s.items.every((i) => i.owner !== null || i.line.length === 0),
    "a held haul is not empty": (s) => s.holds.every((h) => owns(s, h.user).length >= 1),
    "holds are unique, from the chat, never the seller": (s, ctx) => new Set(s.holds.map((h) => h.user)).size === s.holds.length && s.holds.every((h) => inChat(ctx, h.user) && h.user !== s.seller),
    "at most 6 items, unique ids, whole cents of at least 0": (s) =>
      s.items.length <= MAX_ITEMS && new Set(s.items.map((i) => i.id)).size === s.items.length && s.items.every((i) => isInt(i.price) && i.price >= 0 && i.price <= MAX_PRICE),
  },

  transitions: {
    "a held haul never shrinks": (p, n) => p.holds.every((h) => owns(p, h.user).every((i) => ownerOf(n, i.id) === h.user)),
    "claim gives a free item to the actor": (p, n, a, m) => a.t !== "claim" || p === n || (ownerOf(p, a.item) === null && ownerOf(n, a.item) === m.user),
    "unclaim hands the item to the first in line": (p, n, a, m) =>
      a.t !== "unclaim" || p === n || (ownerOf(p, a.item) === m.user && ownerOf(n, a.item) === (lineOf(p, a.item)[0] ?? null)),
    "line toggles only the actor": (p, n, a, m) => {
      if (a.t !== "line" || p === n) return true;
      const d = lineDiff(lineOf(p, a.item), lineOf(n, a.item));
      return d.length === 1 && d[0] === m.user && ownerOf(p, a.item) === ownerOf(n, a.item);
    },
    "hold stamps the actor once": (p, n, a, m) => a.t !== "hold" || p === n || (!heldIn(p, m.user) && n.holds.filter((h) => h.user === m.user).length === 1 && n.holds.find((h) => h.user === m.user)!.at === m.time),
    "the seller never buys": (_p, n) => n.items.every((i) => i.owner === null || i.owner !== n.seller),
    "an add appends one item and changes nothing else": (p, n, a) =>
      a.t !== "add" || p === n || (n.items.length === p.items.length + 1 && JSON.stringify(n.items.slice(0, -1)) === JSON.stringify(p.items) && n.items.at(-1)!.owner === null && n.holds === p.holds),
    "only people in the chat change the sale": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user) || JSON.stringify(p.items.map((i) => i.id)) === JSON.stringify(n.items.map((i) => i.id)),
  },

  arbitrary: (s, user, r) => {
    const add = (): Action => ({ t: "add", name: r.pick(["Bookshelf", "Floor lamp", "Rug", "Desk chair"]), priceCents: 500 * (1 + r.int(40)) });
    if (s.seller === user || s.items.length === 0) return add();
    const k = r.next();
    if (k < 0.08) return { t: "hold" };
    if (k < 0.13) return add();
    const item = r.pick(s.items);
    if (item.owner === null) return r.next() < 0.7 ? { t: "claim", item: item.id } : { t: "line", item: item.id };
    if (item.owner === user) {
      const j = r.next();
      return j < 0.25 ? { t: "unclaim", item: item.id } : j < 0.6 ? { t: "hold" } : { t: "claim", item: item.id };
    }
    return { t: "line", item: item.id };
  },

  local: { name: "", price: "", adding: false, closed: false, lined: [] },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const narrow = theme.width < 360;
    const s = state;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const sellerName = s.seller ? nameOf(s.seller) : "";
    const isSeller = s.seller === me;
    const myHold = s.holds.find((h) => h.user === me);
    const mine = s.items.filter((i) => i.owner === me);
    const total = mine.reduce((n, i) => n + i.price, 0);
    const claimed = s.items.filter((i) => i.owner !== null);
    const soldOut = s.items.length > 0 && claimed.length === s.items.length && claimed.every((i) => heldIn(s, i.owner!));
    const canAdd = (isSeller || s.seller === null) && s.items.length < MAX_ITEMS && (isSeller || !involved(s, me));
    const P2 = pal(theme);
    const okText = mix(c.positive, c.text, 0.35);
    const mine2 = mix(c.primary, c.text, 0.3);

    // ---- Drawings, in a 100 x 80 box ----
    const draw = (kind: Kind): unknown => {
      const card = c.card;
      if (kind === "couch")
        return (
          <g>
            {ellipse(50, 73, 40, 3, P2.shade)}
            {rect(16, 67, 5, 6, 1, P2.brown)}
            {rect(79, 67, 5, 6, 1, P2.brown)}
            {rect(17, 22, 66, 32, 9, P2.leaf)}
            {[28, 39, 50, 61, 72].map((x) => circle(x, 31, 1.1, P2.dark, { key: x }))}
            {rect(10, 40, 10, 28, 4, P2.green)}
            {rect(80, 40, 10, 28, 4, P2.green)}
            {rect(19, 48, 62, 20, 5, P2.green)}
            {[21, 40, 59].map((x) => rect(x, 48, 20, 8, 3, mix(P2.green, card, 0.18), { key: x }))}
            {rect(24, 39, 14, 12, 2, mix(P2.red, card, 0.4), { transform: "rotate(-14 31 45)" })}
          </g>
        );
      if (kind === "desk")
        return (
          <g>
            {ellipse(50, 74, 38, 3, P2.shade)}
            {line(26, 36, 32, 18, P2.soft, 2)}
            {path("M28 18 L40 21 L33 26 Z", P2.yellow)}
            {rect(44, 14, 26, 18, 2, P2.soft)}
            {rect(46, 16, 22, 14, 1, P2.purple)}
            {rect(55, 32, 3, 4, 0, P2.soft)}
            {rect(72, 27, 7, 9, 1, P2.red)}
            {rect(15, 35, 70, 5, 1, P2.crust)}
            {rect(21, 40, 4, 33, 1, P2.dark)}
            {rect(59, 40, 24, 33, 2, P2.brown)}
            {[47, 57, 67].map((y) => rect(65, y, 12, 2, 1, P2.soft, { key: y }))}
            {[51.5, 61.5].map((y) => line(59, y, 83, y, P2.dark, 0.8, { key: y }))}
          </g>
        );
      if (kind === "lamp")
        return (
          <g>
            <g className="mos-glow">{path("M79 32 L93 32 L100 74 L72 74 Z", P2.cream, { opacity: 0.22 })}</g>
            {ellipse(30, 73, 11, 3, P2.soft)}
            {path("M30 72 Q26 12 80 22", "none", { stroke: P2.soft, "stroke-width": 2.2, "stroke-linecap": "round" })}
            {path("M80 20 L92 20 L96 33 L76 33 Z", P2.yellow)}
          </g>
        );
      if (kind === "bike") {
        const wheel = (cx: number) => (
          <g>
            {circle(cx, 53, 19, "none", { stroke: P2.dark, "stroke-width": 2.8 })}
            {circle(cx, 53, 16.5, "none", { stroke: P2.soft, "stroke-width": 1 })}
            <g className="mos-spin">{[0, 1, 2, 3, 4, 5].map((i) => line(cx, 53, cx + 16 * Math.cos((i * Math.PI) / 3), 53 + 16 * Math.sin((i * Math.PI) / 3), P2.soft, 0.7, { key: i }))}</g>
          </g>
        );
        return (
          <g>
            {ellipse(50, 74, 40, 2.5, P2.shade)}
            {wheel(27)}
            {wheel(73)}
            {line(27, 53, 47, 55, P2.red, 2.4)}
            {line(47, 55, 41, 35, P2.red, 2.4)}
            {line(41, 35, 27, 53, P2.red, 2.4)}
            {line(41, 35, 66, 34, P2.red, 2.4)}
            {line(47, 55, 66, 34, P2.red, 2.4)}
            {line(66, 34, 73, 53, P2.red, 2.4)}
            {line(36, 31, 45, 31, P2.dark, 3)}
            {line(66, 34, 64, 27, P2.dark, 2)}
            {line(60, 27, 68, 27, P2.dark, 2.6)}
          </g>
        );
      }
      if (kind === "fridge")
        return (
          <g>
            {ellipse(50, 72, 20, 3, P2.shade)}
            {rect(35, 12, 30, 58, 5, mix(P2.blue, card, 0.45))}
            {rect(38, 15, 5, 50, 2.5, card, { opacity: 0.18 })}
            {line(35, 28, 65, 28, P2.soft, 1)}
            {rect(59, 17, 2.5, 7, 1, P2.soft)}
            {rect(59, 33, 2.5, 11, 1, P2.soft)}
            {path("M48 41 L49.6 45 L54 45.2 L50.6 48 L51.8 52.2 L48 49.8 L44.2 52.2 L45.4 48 L42 45.2 L46.4 45 Z", P2.yellow)}
          </g>
        );
      if (kind === "plant")
        return (
          <g>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const ang = -Math.PI / 2 + (i - 2.5) * 0.42;
              const len = 27 + (i % 2) * 3;
              const x = 50 + len * Math.cos(ang);
              const y = 55 + len * Math.sin(ang);
              return (
                <g key={i}>
                  {line(50, 55, x, y, P2.leaf, 1.5)}
                  {ellipse(x, y, 7, 4.5, i % 2 ? mix(P2.green, card, 0.25) : P2.green, { transform: `rotate(${((ang * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` })}
                </g>
              );
            })}
            {path("M29 58 L71 58 L65 78 L35 78 Z", P2.orange)}
            {rect(27, 54, 46, 6, 2, mix(P2.orange, P2.dark, 0.15))}
          </g>
        );
      return null;
    };
    const drawing = (it: Item, size: "full" | "mini") =>
      it.kind === "other" ? (
        size === "full" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Thumb kind={thumbKind(it.name, "gift")} size={64} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Thumb kind={thumbKind(it.name, "gift")} size={22} />
          </div>
        )
      ) : (
        <svg viewBox="0 0 100 80" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
          {draw(it.kind) as never}
        </svg>
      );

    // ---- Grid ----
    const cells = s.items.length + (canAdd && s.items.length > 0 ? 1 : 0);
    const cols = cells === 4 ? 2 : Math.max(1, Math.min(3, cells));
    const cardW = (W - 8 * (cols - 1)) / cols;
    const statusSize = narrow ? 11 : 12;
    const lined = (id: string) => local.lined.includes(id);

    const card = (it: Item) => {
      const taken = it.owner !== null;
      const mineHere = it.owner === me;
      const place = it.line.indexOf(me) + 1;
      const e = it.at ? running(it.at, dropMotion.duration) : null;
      const drop = e === null ? 1 : dropMotion(e);
      const status = it.owner === null ? "Available" : mineHere ? "Yours" : place ? `In line · #${place}` : `${nameOf(it.owner)}'s`;
      const act = it.owner === null ? "claim it" : mineHere ? "give it back" : place ? "leave the line" : "line up";
      const can = !isSeller && !myHold;
      const onTap = !can
        ? undefined
        : () => {
            if (it.owner === null) dispatch({ t: "claim", item: it.id });
            else if (mineHere) dispatch({ t: "unclaim", item: it.id });
            else {
              dispatch({ t: "line", item: it.id });
              setLocal({ lined: lined(it.id) ? local.lined.filter((x) => x !== it.id) : [...local.lined, it.id] });
            }
          };
      const cap = fitText(`${money(it.price)} · ${it.name}`, cardW - 10, { size: 14, min: 11.5, weight: 600 });
      const cut = cap.text.indexOf(" · ");
      return (
        <button
          key={it.id}
          type="button"
          aria-label={`${it.name}, ${money(it.price)}, ${status}. Tap to ${act}`}
          {...(onTap ? { onClick: onTap } : {})}
          style={{ all: "unset", boxSizing: "border-box", display: "block", minWidth: 0, height: 128, padding: 4, borderRadius: 12, background: c.wash, cursor: onTap ? "pointer" : "default", textAlign: "left", position: "relative" }}
        >
          <div style={{ position: "relative", height: 80, borderRadius: 9, background: mix(c.wash, P2.cream, 0.5), overflow: "hidden", padding: 4, boxSizing: "border-box" }}>
            {drawing(it, "full")}
            {taken && !mineHere ? <div style={{ position: "absolute", inset: 0, background: c.card, opacity: 0.45 }} /> : null}
          </div>
          {mineHere ? (
            <span style={{ position: "absolute", left: 4 + 14 - 10, top: 4 + 14 - 10, width: 20, height: 20, borderRadius: 10, background: c.primary, boxShadow: `0 0 0 1.5px ${c.card}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${e === null ? 1 : Math.max(0, drop).toFixed(3)})` }}>
              <svg width={12} height={12} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke={c.card} style={{ strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M3.5 8.5l3 3L12.5 5" />
              </svg>
            </span>
          ) : null}
          <div style={{ height: 18, marginTop: 3, padding: "0 2px", lineHeight: "18px", fontSize: cap.size, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: c.text }}>
            {cut >= 0 ? (
              <>
                <b style={{ fontWeight: 600 }}>{cap.text.slice(0, cut)}</b>
                {cap.text.slice(cut)}
              </>
            ) : (
              cap.text
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, height: 18, marginTop: 1, padding: "0 2px", fontSize: statusSize, color: c.secondaryText }}>
            {it.owner === null ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c.positive, flex: "none" }} />
                <span style={{ color: okText }}>Available</span>
              </>
            ) : (
              <>
                <span
                  style={{
                    display: "flex",
                    flex: "none",
                    borderRadius: "50%",
                    boxShadow: mineHere ? `0 0 0 2px ${c.primary}` : `0 0 0 1px ${c.card}`,
                    transform: `translateY(${((1 - drop) * -26).toFixed(1)}px)`,
                  }}
                >
                  <Avatar user={it.owner} size={18} />
                </span>
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: mineHere ? mine2 : c.secondaryText }}>{status}</span>
                {!place && it.line.length > 0 ? (
                  <span style={{ flex: "none", fontSize: 11, lineHeight: "18px", padding: "0 6px", borderRadius: 9, background: c.secondaryButton, color: c.secondaryButtonText }}>{`+${it.line.length}`}</span>
                ) : null}
              </>
            )}
          </div>
        </button>
      );
    };

    const addRow = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 78px auto", gap: 8, alignItems: "center" }}>
        <input value={local.name} placeholder="What are you selling?" aria-label="What are you selling?" onInput={(e) => setLocal({ name: e.currentTarget.value })} />
        <input value={local.price} placeholder="Price" inputMode="decimal" aria-label="Price in dollars" onInput={(e) => setLocal({ price: e.currentTarget.value })} />
        <Button
          kind="primary"
          disabled={local.name.trim().length === 0 || !Number.isFinite(Number(local.price.replace(/[$,\s]/g, "") || "x"))}
          onClick={() => {
            const dollars = Number(local.price.replace(/[$,\s]/g, "") || "0");
            dispatch({ t: "add", name: local.name, priceCents: Math.round(dollars * 100) });
            setLocal({ name: "", price: "", adding: false });
          }}
        >
          Add
        </Button>
      </div>
    );

    const grid =
      s.items.length === 0 ? (
        <div style={{ height: 128, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px", borderRadius: 12, border: `1.5px dashed ${c.divider}`, boxSizing: "border-box" }}>
          {canAdd ? <div style={{ flex: 1, minWidth: 0 }}>{addRow}</div> : <span style={{ fontSize: 13, color: c.secondaryText }}>Nothing listed yet</span>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
          {s.items.map(card)}
          {canAdd ? (
            <button
              type="button"
              aria-label="Add an item"
              onClick={() => setLocal({ adding: !local.adding })}
              style={{ all: "unset", boxSizing: "border-box", height: 128, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: `1.5px dashed ${c.divider}`, color: c.secondaryText, fontSize: 13, cursor: "pointer" }}
            >
              + Add
            </button>
          ) : null}
        </div>
      );

    // ---- Haul bar ----
    const bumpAt = mine.reduce((t, i) => Math.max(t, i.at), 0);
    const bumpE = bumpAt ? running(bumpAt, 300) : null;
    const bump = bumpE === null ? 1 : 1 + 0.2 * Math.sin((Math.PI * bumpE) / 300);
    const check = (
      <svg width={18} height={18} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke={c.positive} style={{ strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>
        <path d="M2.5 8.5l3.5 3.5 7.5-8" />
      </svg>
    );
    let right: unknown = null;
    if (isSeller) right = null;
    else if (myHold)
      right = (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: okText, whiteSpace: "nowrap" }}>
          {check}
          Held for you
        </div>
      );
    else if (mine.length === 0) right = <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, textAlign: "right" }}>Tap an item to claim it</span>;
    else
      right = (
        <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "hold" }); }}>
          Hold my haul
        </Button>
      );
    const minis = isSeller || mine.length === 0 ? [] : mine.slice(0, narrow ? 2 : 3);
    const bar = (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 48, boxSizing: "border-box", padding: "6px 12px", borderRadius: 12, background: c.wash }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isSeller ? (
            <>
              <div style={{ fontSize: 13, lineHeight: "15px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${claimed.length} of ${s.items.length} claimed`}</div>
              <div style={{ fontSize: 20, lineHeight: "22px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>
                {money(claimed.reduce((n, i) => n + i.price, 0))}
                <span style={{ fontSize: 13, fontWeight: 400, color: c.secondaryText }}> to collect</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, lineHeight: "15px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {mine.length === 0 ? "Your haul is empty" : `Your haul · ${mine.length} ${mine.length === 1 ? "item" : "items"}`}
              </div>
              <div style={{ fontSize: 20, lineHeight: "22px", fontWeight: 700, color: c.text, transform: `scale(${bump.toFixed(3)})`, transformOrigin: "left center", whiteSpace: "nowrap" }}>{money(total)}</div>
            </>
          )}
        </div>
        {minis.length ? (
          <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
            {minis.map((it) => (
              <span key={it.id} style={{ width: 26, height: 26, borderRadius: 6, background: c.card, padding: 2, boxSizing: "border-box", display: "block" }}>
                {drawing(it, "mini")}
              </span>
            ))}
          </div>
        ) : null}
        {right as never}
      </div>
    );

    // ---- Hold slip ----
    const slipOpen = !!myHold && !local.closed && !isSeller;
    const slipE = myHold ? running(myHold.at, SLIP_MS) : null;
    const slideY = slipE === null ? 0 : (1 - slipMotion(slipE)) * 200;
    const slip = slipOpen ? (
      <div
        role="button"
        tabIndex={0}
        aria-label="Close hold slip"
        onClick={() => setLocal({ closed: true })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") setLocal({ closed: true });
        }}
        style={{ position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden" }}
      >
        <div style={{ position: "absolute", inset: 0, background: c.card, opacity: 0.6 }} />
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 4, transform: `translateY(${slideY.toFixed(1)}px)` }}>
          <Receipt
            title={`${sellerName ? `${sellerName}'s` : "The"} move-out · hold slip`}
            lines={mine.map((i): [string, string] => [i.name, money(i.price)])}
            total={[`Total (pay ${sellerName || "seller"} at pickup)`, money(total)]}
          />
          <div style={{ margin: "4px 0 0", padding: "4px 8px", borderRadius: 8, background: c.card, fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>
            {s.pickup ? <div>{`Pickup ${s.pickup}`}</div> : null}
            {s.note ? <div>{`${sellerName || "Seller"}: “${s.note}”`}</div> : null}
          </div>
        </div>
      </div>
    ) : null;

    const toastItem = s.items.find((i) => i.owner === me && lined(i.id) && i.at && running(i.at, 2500) !== null);
    const gridMin = slipOpen ? 250 : undefined;

    return (
      <div>
        <style>{"@keyframes mosSpin{to{transform:rotate(360deg)}}@keyframes mosGlow{0%,100%{opacity:.7}50%{opacity:1}}.mos-spin{transform-box:fill-box;transform-origin:center;animation:mosSpin 9s linear infinite}.mos-glow{animation:mosGlow 3.2s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.mos-spin,.mos-glow{animation:none}}"}</style>
        <CardHeader title={sellerName ? `${sellerName}'s move-out sale` : "Move-out sale"} subtitle={`${claimed.length} of ${s.items.length} claimed`} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 24 }}>
          {s.seller ? <Avatar user={s.seller} size={20} /> : null}
          <span style={{ fontSize: 13, color: c.text, whiteSpace: "nowrap", flex: "none" }}>Friends first</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 600, color: soldOut ? okText : mix(c.negative, c.text, 0.2), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {soldOut ? "Sold out to friends" : s.publicWhen ? `Public ${s.publicWhen}` : ""}
          </span>
        </div>
        <div style={{ height: 2 }} />
        <div style={{ position: "relative", minHeight: gridMin }}>
          {grid}
          {slip}
        </div>
        {local.adding && canAdd && s.items.length > 0 ? <div style={{ marginTop: 6 }}>{addRow}</div> : null}
        <div style={{ height: 4 }} />
        {bar}
        {myHold && running(myHold.at, 1400) !== null ? <Burst key={myHold.at} emoji="❤️" /> : null}
        {toastItem ? <Toast key={toastItem.at}>{`The ${toastItem.name.toLowerCase()} is yours now`}</Toast> : null}
      </div>
    );
  },
});
