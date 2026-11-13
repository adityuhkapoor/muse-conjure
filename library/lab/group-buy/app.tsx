import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Facepile,
  More,
  Progress,
  Strip,
  Toast,
  clock,
  crowd,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  spring,
  springs,
  textWidth,
  tween,
  type Child,
  type Theme,
} from "@muse/app";

// Group buy: roommates vote between a shortlist of Marketplace listings. The first listing to reach
// the quorum is bought, and its price splits evenly in integer cents (the first people pay the
// leftover cents). Locking happens inside reduce on the deciding vote.

type Style = "sectional" | "velvet" | "midcentury" | "other";
type Tint = "grey" | "green" | "mustard" | "blue" | "red" | "brown";
type Params = {
  title: string;
  listings: { name: string; priceCents: number; where: string; style: Style; color: Tint; quote: string }[];
  votes: { name: string; listing: number }[];
  wins: number;
  pickup: string;
};
type Listing = { id: string; name: string; price: number; where: string; style: Style; color: Tint; quote: string };
type Split = { user: string; cents: number }[];
type State = {
  title: string;
  listings: Listing[];
  votes: { user: string; listing: string; at: number }[];
  wins: number;
  pickup: string;
  locked: null | { listing: string; at: number; split: Split };
  pinged: null | { by: string; at: number };
};
type Action = { t: "vote"; listing: string } | { t: "ping" } | { t: "add"; name: string; priceCents: number };
type Local = { name: string; price: string; bursts: number };
type Ctx = { members: { id: string; name?: string }[] };
type Pal = ReturnType<typeof pal>;

// @params
const P: Params = {
  title: "Couch hunt · apt 4",
  listings: [
    { name: "Grey sectional", priceCents: 36000, where: "1.2 mi · Berkeley", style: "sectional", ["color" as const]: "grey", quote: "Maya: “fits all 5 for movie night”" },
    { name: "Green velvet", priceCents: 28000, where: "2.4 mi · Oakland", style: "velvet", ["color" as const]: "green", quote: "Dev: “velvet is rich roommate energy”" },
    { name: "Mustard MCM", priceCents: 22000, where: "0.6 mi · Northside", style: "midcentury", ["color" as const]: "mustard", quote: "" },
  ],
  votes: [
    { name: "Maya", listing: 0 },
    { name: "Priya", listing: 0 },
    { name: "Dev", listing: 1 },
    { name: "Noa", listing: 1 },
  ],
  wins: 3,
  pickup: "Sat 11am · Dev's truck",
};
// @end params

const MAX_LISTINGS = 4;
const MAX_PRICE = 10_000_000;
const STYLES: Style[] = ["sectional", "velvet", "midcentury", "other"];
const TINTS: Tint[] = ["grey", "green", "mustard", "blue", "red", "brown"];
const ADD_TINTS: Tint[] = ["blue", "red", "brown", "green"];
const LIFT_MS = 600;
const lift = tween({ duration: LIFT_MS, easing: "decelerate" });
const pop = spring(springs.iosBouncy);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const countOf = (s: State, l: string) => s.votes.filter((v) => v.listing === l).length;
const priceOf = (s: State, l: string) => s.listings.find((x) => x.id === l)?.price ?? 0;
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Even split in integer cents: the first `rem` people pay one cent more. */
function shares(price: number, users: string[]): Split {
  const n = users.length;
  if (!n) return [];
  const each = Math.floor(price / n);
  const rem = price - each * n;
  return users.map((user, i) => ({ user, cents: each + (i < rem ? 1 : 0) }));
}

export default defineApp<State, Action, Local>({
  name: "Group buy",
  summary: (s) => {
    if (!s.listings.length) return `${s.title}: add a listing`;
    if (s.locked) {
      const l = s.listings.find((x) => x.id === s.locked!.listing);
      const each = s.locked.split.length ? Math.min(...s.locked.split.map((x) => x.cents)) : 0;
      return `${s.title}: ${l?.name ?? "A listing"} for ${money(l?.price ?? 0)} · ${money(each)} each`;
    }
    const ranked = [...s.listings].sort((a, b) => countOf(s, b.id) - countOf(s, a.id));
    const top = ranked[0]!;
    return `${s.title}: ${top.name} leads ${countOf(s, top.id)}–${ranked[1] ? countOf(s, ranked[1].id) : 0} · ${s.wins} wins`;
  },

  init: (ctx) => {
    const listings: Listing[] = [];
    const index = new Map<number, string>();
    P.listings.slice(0, MAX_LISTINGS).forEach((l, i) => {
      const name = String(l.name).trim().slice(0, 32);
      if (!name) return;
      const id = `l${listings.length}`;
      index.set(i, id);
      listings.push({
        id,
        name,
        price: Number.isInteger(l.priceCents) && l.priceCents >= 0 && l.priceCents <= MAX_PRICE ? l.priceCents : 0,
        where: String(l.where).trim().slice(0, 32),
        style: STYLES.includes(l.style) ? l.style : "other",
        color: TINTS.includes(l.color) ? l.color : TINTS[0]!,
        quote: String(l.quote).trim().slice(0, 60),
      });
    });
    const wins = Math.min(clampN(Math.floor(P.wins) || 3, 2, 12), Math.max(2, ctx.members.length));
    const votes: State["votes"] = [];
    for (const v of P.votes) {
      const want = String(v.name).trim().toLowerCase();
      const user = want ? ctx.members.find((m) => m.id === v.name || (m.name ?? "").toLowerCase() === want)?.id : undefined;
      const listing = index.get(v.listing);
      if (!user || !listing || votes.some((x) => x.user === user)) continue;
      votes.push({ user, listing, at: 0 });
    }
    while (votes.length && listings.some((l) => votes.filter((v) => v.listing === l.id).length >= wins)) votes.pop();
    return { title: P.title.trim().slice(0, 40) || "Group buy", listings, votes, wins, pickup: P.pickup.trim().slice(0, 40), locked: null, pinged: null };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "ping") return s.locked && s.pinged === null ? { ...s, pinged: { by: m.user, at: m.time } } : s;
    if (s.locked) return s;
    if (a.t === "add") {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (s.listings.length >= MAX_LISTINGS || name.length < 1 || name.length > 32) return s;
      if (!Number.isInteger(a.priceCents) || a.priceCents < 0 || a.priceCents > MAX_PRICE) return s;
      const l: Listing = { id: `l${m.seq}`, name, price: a.priceCents, where: "", style: "other", color: ADD_TINTS[s.listings.length]!, quote: "" };
      return s.listings.some((x) => x.id === l.id) ? s : { ...s, listings: [...s.listings, l] };
    }
    if (a.t !== "vote" || typeof a.listing !== "string") return s;
    const target = s.listings.find((l) => l.id === a.listing);
    if (!target) return s;
    const had = s.votes.some((v) => v.user === m.user && v.listing === target.id);
    const rest = s.votes.filter((v) => v.user !== m.user);
    const votes = had ? rest : [...rest, { user: m.user, listing: target.id, at: m.time }];
    const next = { ...s, votes };
    if (!had && countOf(next, target.id) >= s.wins) {
      return { ...next, locked: { listing: target.id, at: m.time, split: shares(target.price, ctx.members.map((x) => x.id)) } };
    }
    return next;
  },

  // Leavers lose their votes and their share; if nobody who paid is left, the buy is off.
  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (s.votes.every((v) => here(v.user)) && (!s.locked || s.locked.split.every((x) => here(x.user)))) return s;
    const votes = s.votes.filter((v) => here(v.user));
    if (!s.locked) return { ...s, votes };
    const users = s.locked.split.filter((x) => here(x.user)).map((x) => x.user);
    if (!users.length) return { ...s, votes, locked: null, pinged: null };
    return { ...s, votes, locked: { ...s.locked, split: shares(priceOf(s, s.locked.listing), users) } };
  },

  invariants: {
    "one vote per person, for a real listing, from the chat": (s, ctx) =>
      new Set(s.votes.map((v) => v.user)).size === s.votes.length && s.votes.every((v) => inChat(ctx, v.user) && s.listings.some((l) => l.id === v.listing)),
    "nothing reaches the quorum unlocked": (s) => !!s.locked || s.listings.every((l) => countOf(s, l.id) < s.wins),
    "the split adds up to the price": (s) => !s.locked || s.locked.split.reduce((t, x) => t + x.cents, 0) === priceOf(s, s.locked.listing),
    "shares differ by at most one cent": (s) => {
      if (!s.locked || !s.locked.split.length) return true;
      const c = s.locked.split.map((x) => x.cents);
      return Math.max(...c) - Math.min(...c) <= 1;
    },
    "split people are in the chat, once each": (s, ctx) => !s.locked || (new Set(s.locked.split.map((x) => x.user)).size === s.locked.split.length && s.locked.split.every((x) => inChat(ctx, x.user))),
    "a locked buy names a real listing": (s) => !s.locked || s.listings.some((l) => l.id === s.locked!.listing),
    "a ping needs a locked buy": (s) => !s.pinged || !!s.locked,
    "at most 4 listings, unique ids, prices are whole cents": (s) =>
      s.listings.length <= MAX_LISTINGS && new Set(s.listings.map((l) => l.id)).size === s.listings.length && s.listings.every((l) => Number.isInteger(l.price) && l.price >= 0),
    "wins is a whole number from 2 to 12": (s) => Number.isInteger(s.wins) && s.wins >= 2 && s.wins <= 12,
  },

  transitions: {
    "votes freeze once locked": (p, n) => !p.locked || JSON.stringify(p.votes) === JSON.stringify(n.votes) || !n.locked,
    "a vote changes only the actor's vote": (p, n, a, m) => a.t !== "vote" || JSON.stringify(p.votes.filter((v) => v.user !== m.user)) === JSON.stringify(n.votes.filter((v) => v.user !== m.user)),
    "a vote for a listing the actor backed removes it, any other moves the vote there": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = p.votes.find((v) => v.user === m.user)?.listing;
      const after = n.votes.find((v) => v.user === m.user);
      return before === a.listing ? !after : after?.listing === a.listing && after.at === m.time;
    },
    "the vote that reaches the quorum locks that listing at that moment": (p, n, a, m) => a.t !== "vote" || p === n || !n.locked || !!p.locked || (n.locked.listing === a.listing && n.locked.at === m.time),
    "a vote below the quorum does not lock": (p, n, a) => a.t !== "vote" || !!p.locked || !!n.locked === countOf(n, a.listing) >= n.wins,
    "locking splits the price over everyone in the chat": (p, n, a, _m, ctx) =>
      a.t !== "vote" || !!p.locked || !n.locked || JSON.stringify(n.locked.split.map((x) => x.user)) === JSON.stringify(ctx.members.map((x) => x.id)),
    "ping stamps the actor once": (p, n, a, m) => a.t !== "ping" || p === n || (!p.pinged && n.pinged?.by === m.user && n.pinged.at === m.time),
    "listings are append only": (p, n) => JSON.stringify(n.listings.slice(0, p.listings.length)) === JSON.stringify(p.listings),
    "add appends one listing": (p, n, a) => a.t !== "add" || p === n || (n.listings.length === p.listings.length + 1 && n.listings.at(-1)?.name === a.name.trim() && n.listings.at(-1)?.price === a.priceCents),
    "only people in the chat change it": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    if (!s.listings.length) return { t: "add", name: r.pick(["Blue loveseat", "IKEA Kivik", "Futon"]), priceCents: 1000 * (5 + r.int(40)) };
    if (s.locked) return { t: "ping" };
    const k = r.next();
    if (k < 0.85) return { t: "vote", listing: r.pick(s.listings).id };
    if (k < 0.93) return { t: "add", name: r.pick(["Blue loveseat", "IKEA Kivik", "Futon"]), priceCents: 1000 * (5 + r.int(40)) };
    return { t: "ping" };
  },

  local: { name: "", price: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = innerWidth();
    const now = clock.value;
    const n = members.length;
    const tint = (t: Tint) => ({ grey: mix(p.soft, c.card, 0.4), green: p.green, mustard: p.crust, blue: p.blue, red: p.red, brown: p.brown })[t];
    const walls = [p.sky, p.cream, p.wall];
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const first = (id: string) => (id === me ? "You" : nameOf(id).split(" ")[0]!);
    const myVote = state.votes.find((v) => v.user === me);
    const locked = state.locked;
    const ranked = [...state.listings].sort((a, b) => countOf(state, b.id) - countOf(state, a.id));
    const top = ranked[0];
    const topN = top ? countOf(state, top.id) : 0;
    const secondN = ranked[1] ? countOf(state, ranked[1].id) : 0;
    const tie = topN > 0 && topN === secondN;
    const winL = locked ? state.listings.find((l) => l.id === locked.listing) : undefined;
    const winVotes = winL ? state.votes.filter((v) => v.listing === winL.id) : [];
    const otherBest = winL ? state.votes.length - winVotes.length : 0;

    const vote = (l: Listing) => {
      if (locked) return;
      const mine = myVote?.listing === l.id;
      if (!mine && countOf(state, l.id) + 1 >= state.wins) {
        setLocal({ bursts: local.bursts + 1 });
        haptic("success");
      }
      dispatch({ t: "vote", listing: l.id });
    };

    const photo = (l: Listing, i: number, w: number, hgt: number, couchW: number, round = 9) => {
      const wallH = hgt * 0.74;
      const bw = couchW;
      const bh = Math.min(hgt - 32, bw * 0.55);
      const bx = (w - bw) / 2;
      const by = hgt - 10 - bh;
      const clip = `gb-${i}-${Math.round(w)}-${hgt}`;
      return (
        <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} role="img" aria-label={`Photo of the ${l.name.toLowerCase()}`} style={{ display: "block", overflow: "visible" }}>
          <clipPath id={clip}>
            <rect x={0} y={0} width={w} height={hgt} rx={round} />
          </clipPath>
          <g clip-path={`url(#${clip})`}>
            <rect x={0} y={0} width={w} height={wallH} fill={walls[i % 3]} />
            <rect x={0} y={wallH} width={w} height={hgt - wallH} fill={p.crust} />
            <line x1={0} y1={wallH} x2={w} y2={wallH} stroke={p.brown} stroke-width={1.5} />
            {couch(l.style, tint(l.color), bx, by, bw, bh, i, p, theme)}
          </g>
        </svg>
      );
    };

    const CARD_H = 236;
    const card = (l: Listing, i: number, w: number, o: { dim?: boolean; strip?: boolean } = {}) => {
      const vs = state.votes.filter((v) => v.listing === l.id);
      const mine = myVote?.listing === l.id;
      const narrow = w < 110;
      const lh = narrow ? 17 : 20;
      const fs = narrow ? 13 : 15;
      const at = myVote?.at ?? 0;
      const e = mine && at ? running(at, 450) : null;
      const lifted = mine ? -4 * (e === null ? 1 : pop(e)) : 0;
      const label = `${l.name}, ${money(l.price)}, ${vs.length} ${vs.length === 1 ? "vote" : "votes"}`;
      const box = { width: w, flex: "none", minWidth: 0, height: CARD_H, borderRadius: 12, background: c.wash, scrollSnapAlign: "start" } as const;
      if (o.dim) {
        return (
          <div key={l.id} aria-hidden="true" style={{ ...box, opacity: 0.22 }}>
            <div style={{ margin: 4 }}>{photo(l, i, w - 8, 82, w - 28)}</div>
          </div>
        );
      }
      // Caption: price in bold, then the name; at most two lines, the second cut with an ellipsis.
      const tokens = [money(l.price), "·", ...l.name.split(" ")];
      let cut = 1;
      while (cut < tokens.length && 0.88 * textWidth(tokens.slice(0, cut + 1).join(" "), fs, 600) <= w - 20) cut++;
      const line = (from: number, to: number) => tokens.slice(from, to).join(" ");
      const lineStyle = { fontSize: fs, lineHeight: `${lh}px`, height: lh, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;
      const priceEnd = Math.min(cut, 2);
      return (
        <div key={l.id} role="group" aria-label={label} style={{ ...box, transform: lifted ? `translateY(${lifted}px)` : undefined, display: "flex", flexDirection: "column" }}>
          <div style={{ margin: 4, height: o.strip ? 70 : 82, flex: "none" }}>{photo(l, i, w - 8, o.strip ? 70 : 82, w - 28)}</div>
          <div style={{ padding: "4px 8px 6px", display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0 }}>
            <div>
              <div style={lineStyle}>
                {o.strip ? line(0, priceEnd) : <b style={{ fontWeight: 600 }}>{line(0, priceEnd)}</b>}
                {cut > priceEnd ? ` ${line(priceEnd, cut)}` : ""}
              </div>
              <div style={lineStyle}>{cut < tokens.length ? line(cut, tokens.length) : " "}</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.where || " "}</div>
            <Progress value={vs.length} max={state.wins} />
            <div style={{ display: "flex", alignItems: "center", gap: 4, height: 20, minWidth: 0 }}>
              {vs.length ? <Facepile users={vs.map((v) => v.user)} size={18} /> : null}
              <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13, lineHeight: "20px", fontWeight: vs.length ? 600 : 400, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {vs.length ? (narrow ? `${vs.length}` : `${vs.length} ${vs.length === 1 ? "vote" : "votes"}`) : "No votes yet"}
              </span>
            </div>
            <div style={{ marginTop: "auto" }}>
              {o.strip ? (
                <button
                  type="button"
                  disabled={!!locked}
                  onClick={() => vote(l)}
                  style={{ width: "100%", height: 44, borderRadius: 8, background: mine && !locked ? c.primary : c.secondaryButton, color: mine && !locked ? c.onPrimary : c.secondaryButtonText, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {mine ? "Voted" : "Vote"}
                </button>
              ) : (
                <Button wide kind={mine && !locked ? "primary" : "secondary"} disabled={!!locked} onClick={() => vote(l)}>
                  {mine ? "Voted" : "Vote"}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    };

    // ---- Cards region ----
    const n3 = state.listings.length;
    let cards: Child;
    if (!n3) {
      cards = (
        <div style={{ height: 120, border: `1.5px dashed ${c.divider}`, borderRadius: 12, padding: 10, display: "grid", gridTemplateColumns: "1fr 76px auto", gap: 6, alignContent: "center" }}>
          <input value={local.name} placeholder="Listing name" aria-label="Listing name" onInput={(e) => setLocal({ name: e.currentTarget.value })} />
          <input value={local.price} placeholder="Price" aria-label="Price in dollars" inputMode="decimal" onInput={(e) => setLocal({ price: e.currentTarget.value })} />
          <Button
            kind="primary"
            onClick={() => {
              const d = Number(local.price.replace(/[^0-9.]/g, ""));
              dispatch({ t: "add", name: local.name.trim().slice(0, 32), priceCents: Number.isFinite(d) ? Math.round(d * 100) : 0 });
              setLocal({ name: "", price: "" });
            }}
          >
            Add
          </Button>
        </div>
      );
    } else if (locked && winL) {
      const cw = (W - 8 * (n3 - 1)) / n3;
      const wi = state.listings.indexOf(winL);
      const e = running(locked.at, LIFT_MS);
      const t = e === null ? 1 : lift(e);
      const sw = Math.min(300, W);
      const x0 = wi * (cw + 8);
      const x = x0 + ((W - sw) / 2 - x0) * t;
      const wd = cw + (sw - cw) * t;
      const ht = 240 + (220 - 240) * t;
      const y = (240 - ht) / 2;
      cards = (
        <div style={{ position: "relative", height: 240 }}>
          {state.listings.map((l, i) =>
            l.id === winL.id ? null : (
              <div key={l.id} style={{ position: "absolute", left: i * (cw + 8), top: 4, pointerEvents: "none" }}>
                {card(l, i, cw, { dim: true })}
              </div>
            ),
          )}
          <div
            role="group"
            aria-label={`${winL.name}, ${money(winL.price)}, bought`}
            style={{ position: "absolute", left: x, top: y, width: wd, height: ht, borderRadius: 12, background: c.wash, boxShadow: `0 0 0 1.5px ${c.primary}`, overflow: "hidden", display: "flex", flexDirection: "column" }}
          >
            <div style={{ margin: 4, height: Math.round(ht * 0.55), borderRadius: 9, overflow: "hidden", flex: "none" }}>{photo(winL, wi, wd - 8, Math.round(ht * 0.55), (wd - 8) * 0.62)}</div>
            <div style={{ padding: "4px 12px 8px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${money(winL.price)} · ${winL.name}`}</div>
              <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${winL.where ? winL.where + " · " : ""}won ${winVotes.length}–${otherBest}`}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Facepile users={winVotes.map((v) => v.user)} size={20} />
                <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>voted it in</span>
              </div>
            </div>
          </div>
        </div>
      );
    } else if (n3 === 4) {
      cards = (
        <Strip label="Listings to vote on" gap={8}>
          {state.listings.map((l, i) => card(l, i, 150, { strip: true }))}
        </Strip>
      );
    } else {
      const cols = n3 >= 3 ? 3 : 2;
      const cw = (W - 8 * (cols - 1)) / cols;
      cards = (
        <div style={{ display: "flex", gap: 8, paddingTop: 4, height: 240 }}>{state.listings.map((l, i) => card(l, i, cw))}</div>
      );
    }
    if (n3 === 4 && !locked) cards = <div style={{ height: 240, paddingTop: 4 }}>{cards}</div>;

    // ---- Roommate strip ----
    const sp = W < 340 ? 34 : 42;
    const x0 = W < 340 ? 20 : 24;
    const maxShown = W < 340 ? 4 : 5;
    const order = [...members];
    const mi = order.findIndex((m) => m.id === me);
    if (mi >= maxShown) order.splice(maxShown - 1, 0, order.splice(mi, 1)[0]!);
    const { shown, extra } = crowd(order, maxShown);
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((now / 1000) * 3));
    const chipFor = (u: string) => locked?.split.find((x) => x.user === u)?.cents;
    const avatarCell = (m: { id: string }, k: number) => {
      const v = state.votes.find((x) => x.user === m.id);
      const l = v ? state.listings.find((y) => y.id === v.listing) : undefined;
      const ring = l ? tint(l.color) : c.divider;
      const wait = !myVote && m.id === me && !locked;
      const cents = chipFor(m.id);
      const ce = locked && cents !== undefined ? running(locked.at + LIFT_MS + k * 90, 420) : null;
      const cs = locked ? (ce === null ? 1 : pop(ce)) : 1;
      return (
        <div key={m.id} style={{ position: "absolute", left: x0 + k * sp - 20, top: 4, width: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ position: "relative", display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${ring}` }}>
            <Avatar user={m.id} size={26} />
            {wait ? <span style={{ position: "absolute", inset: -5, borderRadius: "50%", border: `1.5px solid ${c.primary}`, opacity: pulse, pointerEvents: "none" }} /> : null}
          </span>
          <span style={{ marginTop: 2, maxWidth: 40, fontSize: 11, lineHeight: "13px", color: m.id === me ? mix(c.primary, c.text, 0.3) : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{first(m.id)}</span>
          {locked && cents !== undefined ? (
            <span style={{ marginTop: 1, width: 36, height: 16, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 11, lineHeight: "16px", fontWeight: 600, textAlign: "center", transform: `scale(${cs})` }}>{money(cents)}</span>
          ) : null}
        </div>
      );
    };
    let line1: string;
    let line2: string;
    if (locked) {
      line1 = `Split ${locked.split.length} ways`;
      const each = locked.split.length ? Math.floor((winL?.price ?? 0) / locked.split.length) : 0;
      line2 = `${money(each)} each · not paid yet`;
    } else if (myVote) {
      const mineL = state.listings.find((l) => l.id === myVote.listing);
      const k = countOf(state, myVote.listing);
      line1 = `${k} of ${state.wins} for ${mineL?.name ?? "it"}`;
      line2 = n < 2 ? `Needs ${state.wins} votes` : `${state.wins - k} more locks it`;
    } else if (tie) {
      line1 = `${topN}–${secondN} tie`;
      line2 = "Your vote decides";
    } else if (top && topN > 0) {
      line1 = `${top.name} leads ${topN}–${secondN}`;
      line2 = n < 2 ? `Needs ${state.wins} votes` : "Tap vote on one";
    } else {
      line1 = "No votes yet";
      line2 = n < 2 ? `Needs ${state.wins} votes` : "Tap vote on one";
    }
    const voted = state.votes.filter((v) => members.some((m) => m.id === v.user)).length;
    const textX = x0 + maxShown * sp - (W < 340 ? 4 : 0);
    const strip = (
      <div style={{ position: "relative", height: 60, borderRadius: 12, background: c.wash }}>
        {shown.map(avatarCell)}
        {extra > 0 ? (
          <div style={{ position: "absolute", left: x0 + shown.length * sp - 13, top: 4 }}>
            <More n={extra} size={26} />
          </div>
        ) : null}
        <div style={{ position: "absolute", left: textX, right: 8, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: "20px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line1}</div>
          <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line2}</div>
        </div>
      </div>
    );

    // ---- Quote row / footer ----
    const quoteSrc = myVote ? state.listings.find((l) => l.id === myVote.listing) : top && topN > 0 ? top : undefined;
    const quote = quoteSrc?.quote || "Nobody yet. Underdog.";
    const quoteRow = (
      <div style={{ height: 28, borderRadius: 14, background: c.wash, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 13, color: c.text, minWidth: 0 }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{quote}</span>
      </div>
    );
    const footer = (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {state.pickup ? <div style={{ fontSize: 13, lineHeight: "17px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Pickup ${state.pickup}`}</div> : null}
          <div style={{ fontSize: 12, lineHeight: "16px", color: state.pinged ? c.positive : c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {state.pinged ? `${state.pinged.by === me ? "You" : nameOf(state.pinged.by)} messaged the seller` : "Seller hasn't heard from you"}
          </div>
        </div>
        <Button kind={state.pinged ? "secondary" : "primary"} disabled={!!state.pinged} onClick={() => dispatch({ t: "ping" })}>
          {state.pinged ? "Messaged" : "Message seller"}
        </Button>
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={locked ? `Decided · ${winVotes.length} of ${n}` : `${voted} of ${n} voted · ${state.wins} wins`} />
        {cards}
        <div style={{ height: 8 }} />
        {strip}
        <div style={{ height: 8 }} />
        {locked ? footer : quoteRow}
        {local.bursts > 0 && locked && locked.split.length ? <Burst key={local.bursts} emoji="❤️" /> : null}
        {locked && winL ? <Toast key={locked.at}>{`It's ours. ${winL.name} locked`}</Toast> : null}
      </div>
    );
  },
});

// ---- Drawing ----

/** A couch in the box (bx, by, bw, bh), drawn per style in the listing's tint. */
function couch(style: Style, color: string, bx: number, by: number, bw: number, bh: number, i: number, p: Pal, t: Theme): Child {
  const c = t.color;
  const mid = style === "midcentury";
  const legH = mid ? bh * 0.18 : 5;
  const bodyH = bh - legH;
  const arm = bw * (mid ? 0.06 : 0.11);
  const backH = bodyH * 0.62;
  const backR = style === "velvet" ? 0.28 * bodyH : style === "sectional" ? 0.08 * bodyH : 0.1 * bodyH;
  const parts: Child[] = [];
  parts.push(<ellipse key="sh" cx={bx + bw / 2} cy={by + bh} rx={bw / 2} ry={Math.max(2, bh * 0.07)} fill={p.shade} />);
  const legC = style === "sectional" ? p.dark : p.brown;
  const lx = [bx + bw * 0.08, bx + bw * 0.92 - 5];
  lx.forEach((x, k) => parts.push(mid ? <line key={`l${k}`} x1={x + 2.5 + (k ? 3 : -3)} y1={by + bodyH} x2={x + 2.5 + (k ? -1 : 1)} y2={by + bh} stroke={legC} stroke-width={4} stroke-linecap="round" /> : <rect key={`l${k}`} x={x} y={by + bodyH - 1} width={5} height={legH + 1} fill={legC} />));
  parts.push(<rect key="back" x={bx + 0.6 * arm} y={by} width={bw - 1.2 * arm} height={backH} rx={backR} fill={mix(color, c.text, 0.25)} />);
  if (style === "velvet") {
    for (let k = 0; k < 5; k++) parts.push(<circle key={`t${k}`} cx={bx + arm + ((bw - 2 * arm) * (k + 0.5)) / 5} cy={by + backH * 0.45} r={1.6} fill={p.dark} />);
  } else {
    const nb = mid ? 2 : 3;
    const aw = bw - 2 * arm - 6;
    const cw = (aw - (nb - 1) * 3) / nb;
    for (let k = 0; k < nb; k++) parts.push(<rect key={`bc${k}`} x={bx + arm + 3 + k * (cw + 3)} y={by + 3} width={Math.max(1, cw)} height={Math.max(1, backH - 6)} rx={3} fill={color} />);
  }
  parts.push(<rect key="seat" x={bx + 0.6 * arm} y={by + bodyH * 0.5} width={bw - 1.2 * arm} height={bodyH * 0.5} rx={4} fill={color} />);
  const ns = mid ? 2 : 3;
  const chaise = style === "sectional";
  const seatW = (chaise ? (bw - 2 * arm) * 0.67 : bw - 2 * arm) - 4;
  const sw = (seatW - (ns - 1) * 2) / ns;
  for (let k = 0; k < ns; k++) parts.push(<rect key={`sc${k}`} x={bx + arm + 2 + k * (sw + 2)} y={by + bodyH * 0.5 + 2} width={Math.max(1, sw)} height={bodyH * 0.22} rx={3} fill={mix(color, c.card, 0.18)} />);
  if (chaise) parts.push(<rect key="chaise" x={bx + arm + (bw - 2 * arm) * 0.67} y={by + bodyH * 0.55} width={(bw - 2 * arm) * 0.33} height={bodyH * 0.48} rx={4} fill={mix(color, c.card, 0.08)} />);
  parts.push(<rect key="armL" x={bx} y={by + bodyH * 0.3} width={arm} height={bodyH * 0.7} rx={Math.min(arm / 2, 5)} fill={color} />);
  parts.push(<rect key="armR" x={bx + bw - arm} y={by + bodyH * 0.3} width={arm} height={bodyH * 0.7} rx={Math.min(arm / 2, 5)} fill={color} />);
  const pillow = [p.yellow, mix(p.red, c.card, 0.4), p.cream][i % 3]!;
  const pw = bw * 0.16;
  const px = bx + arm + bw * 0.04;
  const py = by + bodyH * 0.38;
  parts.push(<rect key="pil" x={px} y={py} width={pw} height={pw * 0.9} rx={3} fill={pillow} transform={`rotate(-14 ${px + pw / 2} ${py + pw * 0.45})`} />);
  return <g>{parts}</g>;
}
