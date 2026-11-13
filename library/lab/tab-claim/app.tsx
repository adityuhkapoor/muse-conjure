import { defineApp, Avatar, Burst, Button, CardHeader, Facepile, More, Toast, haptic, innerWidth, type Ctx } from "@muse/app";

// Tab claim: one person put dinner on their card. Everyone taps what they ate, anything unclaimed
// is split evenly, and every total ticks live until the payer sends requests. No money moves.

type Params = { place: string; payer: string; tipBps: number; items: { label: string; priceCents: number; claimedBy: string }[] };

// @params
const P: Params = {
  place: "Smokey's",
  payer: "Maya",
  tipBps: 2200,
  items: [
    { label: "Brisket plate", priceCents: 2400, claimedBy: "Bryan" },
    { label: "Pulled pork sando", priceCents: 1600, claimedBy: "" },
    { label: "Half rack ribs", priceCents: 2800, claimedBy: "Kev" },
    { label: "Wings (12)", priceCents: 1800, claimedBy: "Omar" },
    { label: "Mac & cheese", priceCents: 700, claimedBy: "" },
    { label: "Burnt ends", priceCents: 1900, claimedBy: "Dev" },
    { label: "Chips & queso", priceCents: 900, claimedBy: "" },
    { label: "Lemonade pitcher", priceCents: 1400, claimedBy: "" },
    { label: "Cornbread", priceCents: 500, claimedBy: "" },
    { label: "Banana pudding", priceCents: 800, claimedBy: "Kev" },
    { label: "Sweet tea", priceCents: 300, claimedBy: "Omar" },
    { label: "Coleslaw", priceCents: 400, claimedBy: "" },
  ],
};
// @end params

type Item = { id: string; label: string; price: number; owner: string | null };
type State = {
  place: string;
  tipBps: number;
  items: Item[];
  payer: string | null;
  crew: string[];
  requestedAt: number;
  paid: string[];
};
type Action = { t: "claim"; item: string } | { t: "request" } | { t: "paid" };
type Local = { nope: { item: string; at: number } | null; toasts: number };

const MAX_ITEMS = 12;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const total = (s: State) => sum(s.items.map((i) => i.price));
const grand = (s: State) => {
  const t = total(s);
  return t + Math.round((t * s.tipBps) / 10000);
};
const pot = (s: State) => sum(s.items.filter((i) => i.owner === null).map((i) => i.price));
const own = (s: State, u: string) => sum(s.items.filter((i) => i.owner === u).map((i) => i.price));

/** Each person's share of the unclaimed pot: even, the first few take the leftover cents. */
function potParts(s: State): number[] {
  const n = s.crew.length;
  if (n === 0) return [];
  const p = pot(s);
  const each = Math.floor(p / n);
  const rem = p - each * n;
  return s.crew.map((_, k) => each + (k < rem ? 1 : 0));
}
function owe(s: State): Record<string, number> {
  const n = s.crew.length;
  const out: Record<string, number> = {};
  if (n === 0) return out;
  const t = total(s);
  const parts = potParts(s);
  const base = s.crew.map((u, k) => own(s, u) + parts[k]!);
  const extra = Math.round((t * s.tipBps) / 10000);
  const ex = base.map((b) => (t ? Math.floor((extra * b) / t) : 0));
  let left = extra - sum(ex);
  // leftover cents go one each to the largest bases, first in crew order on ties
  const order = s.crew.map((_, k) => k).sort((a, b) => base[b]! - base[a]! || a - b);
  for (let j = 0; left > 0 && order.length; j = (j + 1) % order.length, left--) ex[order[j]!] = ex[order[j]!]! + 1;
  s.crew.forEach((u, k) => (out[u] = base[k]! + ex[k]!));
  return out;
}
const back = (s: State) => sum(Object.entries(owe(s)).filter(([u]) => u !== s.payer).map(([, v]) => v));
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const price = (c: number) => (c % 100 === 0 ? `$${c / 100}` : money(c));
const itemsOnly = (s: State, id: string) => JSON.stringify(s.items.filter((i) => i.id !== id));
const statics = (s: State) => JSON.stringify(s.items.map((i) => [i.id, i.label, i.price]));

export default defineApp<State, Action, Local>({
  name: "Tab claim",
  summary: (s) =>
    s.requestedAt > 0
      ? `${s.place} tab: requested ${money(back(s))} · ${s.paid.length} of ${Math.max(0, s.crew.length - 1)} paid`
      : `${s.place} tab: ${s.items.filter((i) => i.owner !== null).length} of ${s.items.length} claimed · ${money(grand(s))}`,

  init: (ctx) => {
    const find = (name: string) => {
      const w = name.trim().toLowerCase();
      return w ? (ctx.members.find((m) => m.name.toLowerCase() === w)?.id ?? null) : null;
    };
    const items: Item[] = [];
    for (const it of P.items.slice(0, MAX_ITEMS)) {
      const label = it.label.trim().slice(0, 40);
      if (!label || !Number.isInteger(it.priceCents) || it.priceCents < 1 || it.priceCents > 100_000) continue;
      items.push({ id: `i${items.length}`, label, price: it.priceCents, owner: find(it.claimedBy) });
    }
    return {
      place: P.place.trim().slice(0, 30),
      tipBps: Number.isInteger(P.tipBps) && P.tipBps >= 0 && P.tipBps <= 5000 ? P.tipBps : 0,
      items,
      payer: find(P.payer) ?? ctx.members[0]?.id ?? null,
      crew: ctx.members.map((m) => m.id),
      requestedAt: 0,
      paid: [],
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "claim") {
      if (s.requestedAt > 0 || typeof a.item !== "string") return s;
      const it = s.items.find((i) => i.id === a.item);
      if (!it || (it.owner !== null && it.owner !== m.user)) return s;
      return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, owner: it.owner === null ? m.user : null } : i)) };
    }
    if (a.t === "request") {
      if (m.user !== s.payer || s.requestedAt > 0 || s.crew.length < 2 || s.items.length === 0) return s;
      return { ...s, requestedAt: m.time };
    }
    if (a.t === "paid") {
      if (s.requestedAt === 0 || m.user === s.payer) return s;
      return { ...s, paid: s.paid.includes(m.user) ? s.paid.filter((u) => u !== m.user) : [...s.paid, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ids = ctx.members.map((m) => m.id);
    const same = ids.length === s.crew.length && ids.every((u, k) => u === s.crew[k]);
    if (same && (s.payer === null || ids.includes(s.payer))) return s;
    return {
      ...s,
      crew: ids,
      items: s.items.map((i) => (i.owner !== null && !ids.includes(i.owner) ? { ...i, owner: null } : i)),
      paid: s.paid.filter((u) => ids.includes(u)),
      payer: s.payer !== null && ids.includes(s.payer) ? s.payer : (ids[0] ?? null),
    };
  },

  invariants: {
    "shares add up to the bill with tax and tip": (s) => s.crew.length === 0 || sum(Object.values(owe(s))) === grand(s),
    "nobody owes a negative amount": (s) => Object.values(owe(s)).every((v) => v >= 0),
    "the unclaimed pot splits within a cent": (s) => {
      const v = potParts(s);
      return v.length === 0 || Math.max(...v) - Math.min(...v) <= 1;
    },
    "claims belong to people in the chat": (s, ctx) => s.items.every((i) => i.owner === null || s.crew.includes(i.owner)) && JSON.stringify(s.crew) === JSON.stringify(ctx.members.map((m) => m.id)),
    "the payer is in the chat": (s) => s.payer === null || s.crew.includes(s.payer),
    "paid only after a request, never the payer, each once": (s) => (s.requestedAt > 0 || s.paid.length === 0) && !s.paid.includes(s.payer ?? "") && new Set(s.paid).size === s.paid.length,
    "prices are positive cents": (s) => s.items.every((i) => Number.isInteger(i.price) && i.price >= 1),
  },

  transitions: {
    "a claim toggles one item, to or from the claimer": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = p.items.find((i) => i.id === a.item);
      const after = n.items.find((i) => i.id === a.item);
      if (!before || !after || itemsOnly(p, a.item) !== itemsOnly(n, a.item)) return false;
      return before.owner === null ? after.owner === m.user : before.owner === m.user && after.owner === null;
    },
    "nobody takes someone else's item": (p, n, a, m) => a.t !== "claim" || p.items.every((i, k) => i.owner === null || i.owner === m.user || n.items[k]!.owner === i.owner),
    "claims freeze once requested": (p, n, a) => p.requestedAt === 0 || a.t !== "claim" || p === n,
    "only the payer requests": (p, n, a, m) => a.t !== "request" || p === n || (m.user === p.payer && n.requestedAt === m.time && p.requestedAt === 0),
    "paid toggles only the sender": (p, n, a, m) => {
      if (a.t !== "paid" || p === n) return true;
      const d = [...p.paid.filter((u) => !n.paid.includes(u)), ...n.paid.filter((u) => !p.paid.includes(u))];
      return d.length === 1 && d[0] === m.user;
    },
    "items and prices never change": (p, n) => statics(p) === statics(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => JSON.stringify(p) === JSON.stringify(n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.requestedAt > 0) return { t: "paid" };
    if (user === s.payer && r.next() < 0.15) return { t: "request" };
    const open = s.items.filter((i) => i.owner === null || i.owner === user);
    const pool = open.length ? open : s.items;
    return pool.length ? { t: "claim", item: r.pick(pool).id } : null;
  },

  local: { nope: null, toasts: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const first = (id: string) => (id === me ? "You" : nameOf(id));
    const n = state.crew.length;
    const frozen = state.requestedAt > 0;
    const iAmPayer = state.payer === me;
    const shares = owe(state);
    const theirs = owe(confirmed);
    const g = grand(state);
    const extra = g - total(state);
    const unclaimed = state.items.filter((i) => i.owner === null);
    const potCents = pot(state);
    const payerName = state.payer ? nameOf(state.payer) : "";
    const requestTotal = back(state);
    const others = state.crew.filter((u) => u !== me);
    const hidden = others.length > 4 ? others.slice(3) : [];
    const shownOthers = others.length > 4 ? others.slice(0, 3) : others;
    const cells: (string | "more")[] = [...shownOthers, ...(hidden.length ? (["more"] as const) : []), ...(state.crew.includes(me) ? [me] : [])];
    const cellW = W / Math.max(1, Math.min(n, 5));
    const ticking = (id: string) => pending && shares[id] !== theirs[id];

    const row = (it: Item, k: number) => {
      const mine = it.owner === me;
      const theirsRow = it.owner !== null && !mine;
      const lastInColumn = k + 2 >= state.items.length;
      const nope = local.nope?.item === it.id;
      const label = `${it.label}, ${price(it.price)}, ${it.owner === null ? "unclaimed" : mine ? "yours" : `${nameOf(it.owner)}'s`}`;
      const body = (
        <>
          <span style={{ width: 28, display: "flex", alignItems: "center", flex: "none" }}>
            {it.owner === null ? (
              <span style={{ width: 20, height: 20, borderRadius: 10, boxSizing: "border-box", border: `2px solid ${c.divider}` }} />
            ) : mine ? (
              <span style={{ width: 20, height: 20, borderRadius: 10, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", animation: "tcPop 300ms cubic-bezier(.34,1.56,.64,1)" }}>
                <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M6 10.5l3 3 5-6" stroke={c.onPrimary} stroke-width={2} stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            ) : (
              <Avatar user={it.owner} size={20} />
            )}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "18px", color: theirsRow ? c.secondaryText : c.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{it.label}</span>
          <span style={{ fontSize: 13, color: c.secondaryText, paddingLeft: 6, flex: "none" }}>{price(it.price)}</span>
          {lastInColumn ? null : <span style={{ position: "absolute", left: 32, right: 0, bottom: 0, height: 1, background: c.divider }} />}
        </>
      );
      const style = { position: "relative", height: 36, display: "flex", alignItems: "center", textAlign: "left", background: "transparent", border: 0, padding: 0, margin: 0, font: "inherit", color: c.text, minWidth: 0, width: "100%", animation: nope ? "tcShake 300ms" : undefined } as const;
      return frozen ? (
        <div key={it.id} role="group" aria-disabled="true" aria-label={label} style={style}>
          {body}
        </div>
      ) : (
        <button
          key={nope && local.nope ? `${it.id}:${local.nope.at}` : it.id}
          class="m-hit"
          aria-label={label}
          aria-pressed={mine}
          style={style}
          onClick={() => (theirsRow ? setLocal({ nope: { item: it.id, at: (local.nope?.at ?? 0) + 1 } }) : dispatch({ t: "claim", item: it.id }))}
        >
          {body}
        </button>
      );
    };

    const nopeItem = local.nope ? state.items.find((i) => i.id === local.nope!.item) : undefined;

    return (
      <div>
        <style>{"@keyframes tcShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}@keyframes tcPop{from{transform:scale(.3)}to{transform:scale(1)}}"}</style>
        <CardHeader title={`${state.place} tab`} subtitle={`${state.payer ? (iAmPayer ? "You covered" : `${payerName} covered`) : "Total"} ${money(g)} · ${frozen ? "requests sent" : "tap what you ate"}`} />

        {state.items.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 8 }}>{state.items.map(row)}</div>
        ) : (
          <div style={{ height: 36, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText }}>{`No items yet · ask ${payerName || "the payer"} to add the receipt`}</div>
        )}

        <div style={{ height: 24, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.secondaryText }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {unclaimed.length && n
              ? `${unclaimed.length} unclaimed · ${price(potCents)} split ${n} ways · ${price(Math.floor(potCents / n))} each`
              : "Nothing unclaimed · everyone pays for what they ate"}
          </span>
          <span style={{ flex: "none" }}>{`+${money(extra)} tax and tip`}</span>
        </div>

        <div style={{ display: "flex", height: 58 }}>
          {cells.map((u) => {
            if (u === "more") {
              return (
                <div key="more" style={{ width: cellW, position: "relative", textAlign: "center" }}>
                  <div style={{ position: "absolute", top: 3, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                    <More n={hidden.length} />
                  </div>
                  <div style={{ position: "absolute", top: 28, left: 0, right: 0, fontSize: 14, fontWeight: 600 }}>{money(sum(hidden.map((x) => shares[x] ?? 0)))}</div>
                  <div style={{ position: "absolute", top: 44, left: 0, right: 0, fontSize: 12, color: c.secondaryText }}>others</div>
                </div>
              );
            }
            const mineCell = u === me;
            const sent = frozen && state.paid.includes(u);
            return (
              <div key={u} style={{ width: cellW, position: "relative", textAlign: "center", margin: 0 }}>
                {mineCell ? <div style={{ position: "absolute", left: 2, right: 2, top: 0, bottom: 0, borderRadius: 8, background: c.selected }} /> : null}
                <div style={{ position: "absolute", top: 3, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                  <span style={{ position: "relative", display: "flex" }}>
                    <Avatar user={u} size={22} />
                    {sent ? (
                      <span role="img" aria-label="Sent" style={{ position: "absolute", right: -6, bottom: -4, width: 16, height: 16, borderRadius: 8, background: c.positive, boxShadow: `0 0 0 2px ${mineCell ? c.selected : c.card}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M4.5 8.5l2.2 2.2 4.3-4.6" stroke={c.onPrimary} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </span>
                    ) : null}
                  </span>
                </div>
                <div style={{ position: "absolute", top: 28, left: 0, right: 0, fontSize: 14, fontWeight: 600, lineHeight: "16px", color: ticking(u) ? c.link : c.text, transition: "color 400ms" }}>{money(shares[u] ?? 0)}</div>
                <div style={{ position: "absolute", top: 44, left: 4, right: 4, fontSize: 12, lineHeight: "14px", color: mineCell ? c.link : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first(u)}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 4, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {frozen ? (
            <div style={{ width: "100%", height: 44, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 10px", borderRadius: 8, background: c.input }}>
              <Facepile users={state.crew.filter((u) => u !== state.payer)} max={4} size={20} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Requested ${money(requestTotal)} · ${state.paid.length} of ${Math.max(0, n - 1)} paid`}</span>
              {iAmPayer ? null : (
                <Button kind="secondary" onClick={() => dispatch({ t: "paid" })}>
                  {state.paid.includes(me) ? "Undo" : "Paid"}
                </Button>
              )}
            </div>
          ) : iAmPayer ? (
            state.items.length === 0 ? (
              <div style={{ fontSize: 13, color: c.secondaryText }}>Add the receipt first</div>
            ) : n < 2 ? (
              <div style={{ fontSize: 13, color: c.secondaryText }}>Add people to split</div>
            ) : (
              <div style={{ width: "100%", position: "relative" }}>
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    haptic("success");
                    dispatch({ t: "request" });
                    setLocal({ toasts: local.toasts + 1, nope: null });
                  }}
                >
                  {`Request ${money(requestTotal)}`}
                </Button>
                {local.toasts > 0 ? <Burst key={local.toasts} emoji="💸" /> : null}
              </div>
            )
          ) : state.payer ? (
            <div style={{ fontSize: 13, color: c.secondaryText, textAlign: "center" }}>{`You owe ${payerName} ${money(shares[me] ?? 0)} so far`}</div>
          ) : null}
        </div>

        {local.nope && nopeItem && nopeItem.owner ? (
          <Toast key={local.nope.at}>{`${nameOf(nopeItem.owner)} claimed ${nopeItem.label.toLowerCase()}`}</Toast>
        ) : local.toasts > 0 && frozen && iAmPayer ? (
          <Toast key={local.toasts}>Requests sent</Toast>
        ) : null}
      </div>
    );
  },
});
