import { defineApp, Avatar, Button, CardHeader, Facepile, Locked, haptic, mix, running, tween } from "@muse/app";

// Grocery run: a shared grocery list built from the chat's complaints, with an urgency
// thermometer. One person says they're going and ticks items into the cart as they shop.

type Params = {
  /** Where: "Apt 4B" */
  title: string;
  /** How many chat messages the list came from, 0 if unknown */
  messages: number;
  /** Name of whoever is asking hardest, or "" */
  begging: string;
  /** qty: "x12", "1lb" or "". who: who asked, as in the chat. urgency: 0 chill to 3 urgent. priceCents: 0 if unknown. */
  items: { name: string; qty: string; who: string; quote: string; urgency: number; priceCents: number }[];
};

// @params
const P: Params = {
  title: "Apt 4B",
  messages: 41,
  begging: "Theo",
  items: [
    { name: "Toilet paper", qty: "12pk", who: "Theo", quote: "using napkins rn", urgency: 3, priceCents: 1199 },
    { name: "Eggs", qty: "x12", who: "Dani", quote: "we have 1 egg", urgency: 2, priceCents: 429 },
    { name: "Dish soap", qty: "big", who: "Marcus", quote: "the pans need it", urgency: 2, priceCents: 349 },
    { name: "Coffee beans", qty: "1lb", who: "Dani", quote: "running on fumes", urgency: 2, priceCents: 999 },
    { name: "Oat milk", qty: "x2", who: "Jess", quote: "oatly or nothing", urgency: 1, priceCents: 958 },
    { name: "Tortillas", qty: "x1", who: "Jess", quote: "taco tues", urgency: 1, priceCents: 319 },
    { name: "Limes", qty: "x4", who: "Theo", quote: "also limes", urgency: 0, priceCents: 196 },
  ],
};
// @end params

/** inCart: member id of the runner who put it in, null if not yet. price: cents. */
type Item = { id: string; name: string; qty: string; who: string; quote: string; urgency: number; price: number; inCart: string | null };
/** runner: who is going. runnerAt: when they said so, 0 if nobody. doneAt: when the last item went in, 0 while items are left. */
type State = { title: string; messages: number; begging: string; items: Item[]; runner: string | null; runnerAt: number; doneAt: number };
type Action = { t: "go" } | { t: "drop" } | { t: "cart"; id: string } | { t: "add"; name: string };
type Local = { draft: string; all: boolean };
type Ctx = { members: { id: string; name: string }[] };

const MAX_ITEMS = 20;
const VISIBLE = 7;
const GO_MS = 1200;
const pop = tween({ duration: 320, easing: [0.34, 1.56, 0.64, 1] });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const allIn = (items: Item[]) => items.length > 0 && items.every((i) => i.inCart !== null);
const weight = (i: Item) => (i.urgency + 1) ** 2;
const urgentLeft = (s: State) => s.items.filter((i) => i.urgency >= 2 && i.inCart === null).length;

function drop(s: State): State {
  return { ...s, runner: null, runnerAt: 0, doneAt: 0, items: s.items.map((i) => (i.inCart === null ? i : { ...i, inCart: null })) };
}

export default defineApp<State, Action, Local>({
  name: "Grocery run",
  summary: (s, ctx) => {
    if (s.doneAt > 0) return `${s.title}: restocked`;
    if (s.runner !== null) {
      const name = ctx.members.find((m) => m.id === s.runner)?.name ?? "Someone";
      return `${s.title}: ${name} is going, ${s.items.filter((i) => i.inCart !== null).length} of ${s.items.length} in the cart`;
    }
    return `${s.title}: ${s.items.length} items, ${urgentLeft(s)} urgent`;
  },

  init: () => {
    const items: Item[] = [];
    for (const it of P.items) {
      if (items.length >= MAX_ITEMS) break;
      const name = clip(it.name, 32);
      if (!name || items.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
      const u = Number.isFinite(it.urgency) ? Math.max(0, Math.min(3, Math.floor(it.urgency))) : 0;
      items.push({
        id: `p${items.length}`,
        name,
        qty: clip(it.qty, 8),
        who: clip(it.who, 20),
        quote: clip(String(it.quote ?? "").replace(/!/g, ""), 48),
        urgency: u,
        price: Number.isInteger(it.priceCents) && it.priceCents >= 0 && it.priceCents <= 100000 ? it.priceCents : 0,
        inCart: null,
      });
    }
    return { title: clip(P.title, 24), messages: Number.isInteger(P.messages) && P.messages > 0 ? P.messages : 0, begging: clip(P.begging, 20), items, runner: null, runnerAt: 0, doneAt: 0 };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "go") {
      if (s.runner !== null || s.items.length === 0) return s;
      return { ...s, runner: m.user, runnerAt: m.time };
    }
    if (a.t === "drop") {
      if (s.runner !== m.user) return s;
      return drop(s);
    }
    if (a.t === "cart") {
      if (s.runner !== m.user || typeof a.id !== "string" || !s.items.some((i) => i.id === a.id)) return s;
      const items = s.items.map((i) => (i.id !== a.id ? i : { ...i, inCart: i.inCart === null ? m.user : null }));
      return { ...s, items, doneAt: allIn(items) ? (s.doneAt === 0 ? m.time : s.doneAt) : 0 };
    }
    if (a.t === "add") {
      const name = clip(a.name, 33);
      if (typeof a.name !== "string" || name.length < 1 || name.length > 32 || s.items.length >= MAX_ITEMS) return s;
      if (s.items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return s;
      const who = ctx.members.find((x) => x.id === m.user)?.name ?? "";
      return { ...s, doneAt: 0, items: [...s.items, { id: `g${m.seq}`, name, qty: "", who, quote: "", urgency: 1, price: 0, inCart: null }] };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.runner !== null && !inChat(ctx, s.runner) ? drop(s) : s),

  invariants: {
    "only the runner fills the cart": (s) => s.items.every((i) => i.inCart === null || i.inCart === s.runner),
    "no cart without a runner": (s) => s.runner !== null || s.items.every((i) => i.inCart === null),
    "runner time set exactly when someone is going": (s) => (s.runner === null) === (s.runnerAt === 0),
    "done exactly when everything is in the cart": (s) => s.doneAt > 0 === allIn(s.items),
    "items are well formed": (s) =>
      s.items.length <= MAX_ITEMS &&
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      new Set(s.items.map((i) => i.name.toLowerCase())).size === s.items.length &&
      s.items.every((i) => i.name.length > 0 && Number.isInteger(i.urgency) && i.urgency >= 0 && i.urgency <= 3 && Number.isInteger(i.price) && i.price >= 0 && i.price <= 100000),
    "the runner is in the chat": (s, ctx) => s.runner === null || inChat(ctx, s.runner),
  },

  transitions: {
    "going claims an empty run for the actor": (p, n, a, m) => a.t !== "go" || p === n || (p.runner === null && n.runner === m.user && n.runnerAt === m.time),
    "only the runner drops the run, and the cart empties": (p, n, a, m) => a.t !== "drop" || p === n || (p.runner === m.user && n.runner === null && n.items.every((i) => i.inCart === null)),
    "a cart tap flips exactly one item": (p, n, a, m) => {
      if (a.t !== "cart" || p === n) return true;
      const diff = n.items.filter((i, k) => JSON.stringify(i) !== JSON.stringify(p.items[k]));
      const was = p.items.find((i) => i.id === a.id);
      const now = diff[0];
      return n.items.length === p.items.length && diff.length === 1 && !!was && !!now && now.id === a.id && now.inCart === (was.inCart === null ? m.user : null);
    },
    "adding appends one item from the actor": (p, n, a, m) =>
      a.t !== "add" || p === n || (n.items.length === p.items.length + 1 && n.items.at(-1)!.id === `g${m.seq}` && JSON.stringify(n.items.slice(0, -1)) === JSON.stringify(p.items)),
    "the list is never reordered or edited": (p, n) => {
      const shared = p.items.filter((i) => n.items.some((x) => x.id === i.id));
      const kept = n.items.filter((i) => p.items.some((x) => x.id === i.id));
      return shared.every((i, k) => kept[k]?.id === i.id) && shared.every((i) => {
        const x = n.items.find((y) => y.id === i.id)!;
        return x.name === i.name && x.qty === i.qty && x.who === i.who && x.quote === i.quote && x.urgency === i.urgency && x.price === i.price;
      });
    },
    "done lands on the last item in": (p, n, a, m) => p.doneAt !== 0 || n.doneAt === 0 || (a.t === "cart" && n.doneAt === m.time),
    "a free run is always claimed by someone in the chat": (p, n, a, m, ctx) => a.t !== "go" || !inChat(ctx, m.user) || p.runner !== null || p.items.length === 0 || n.runner === m.user,
    "the runner's cart tap always lands": (p, n, a, m, ctx) => a.t !== "cart" || !inChat(ctx, m.user) || p.runner !== m.user || !p.items.some((i) => i.id === a.id) || p !== n,
    "a new name always lands": (p, n, a, m, ctx) => {
      if (a.t !== "add" || !inChat(ctx, m.user) || typeof a.name !== "string") return true;
      const name = a.name.trim();
      return name.length < 1 || name.length > 32 || p.items.length >= MAX_ITEMS || p.items.some((i) => i.name.toLowerCase() === name.toLowerCase()) || n.items.length === p.items.length + 1;
    },
    "a drop by the runner always lands": (p, n, a, m) => a.t !== "drop" || p.runner !== m.user || n.runner === null,
    "adding never claims done": (p, n, a) => a.t !== "add" || p === n || n.doneAt === 0,
    "only people in the chat change the list": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const names = ["Bananas", "Rice", "Paper towels", "Hot sauce", "Bread"];
    const k = r.next();
    if (s.runner === null) return k < 0.7 ? { t: "go" } : { t: "add", name: r.pick(names) };
    if (s.runner === user) {
      if (k < 0.8 && s.items.length) return { t: "cart", id: r.pick(s.items).id };
      return k < 0.9 ? { t: "add", name: r.pick(names) } : { t: "drop" };
    }
    return k < 0.5 || !s.items.length ? { t: "add", name: r.pick(names) } : { t: "cart", id: r.pick(s.items).id };
  },

  local: { draft: "", all: false },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const nameOf = (id: string | null) => (id === null ? "" : id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const items = state.items;
    const n = items.length;
    const inCart = items.filter((i) => i.inCart !== null);
    const done = state.doneAt > 0;
    const iAmRunner = state.runner === me;
    const runnerName = state.runner === null ? "" : (members.find((m) => m.id === state.runner)?.name ?? "Someone");
    const rows = local.all ? items : items.slice(0, VISIBLE);
    const total = items.reduce((t, i) => t + i.price, 0);
    const carted = inCart.reduce((t, i) => t + i.price, 0);
    const urgent = urgentLeft(state);
    const denom = items.reduce((t, i) => t + weight(i), 0);
    const level = denom ? items.filter((i) => i.inCart === null).reduce((t, i) => t + weight(i), 0) / denom : 0;
    const fill = mix(c.positive, c.negative, Math.min(1, level * 1.3));
    const fillY = 226 - 178 * level;
    const e = state.runner !== null ? running(state.runnerAt, GO_MS) : null;
    const askers = items
      .map((i) => members.find((m) => m.name.toLowerCase() === i.who.toLowerCase())?.id)
      .filter((id, k, all): id is string => !!id && all.indexOf(id) === k);

    const submit = () => {
      if (!local.draft.trim()) return;
      dispatch({ t: "add", name: local.draft });
      setLocal({ draft: "" });
    };

    const row = (i: Item, k: number) => {
      const inC = i.inCart !== null;
      const urgentRow = i.urgency === 3 && !inC;
      const amount = [i.qty, i.price ? money(i.price) : ""].filter(Boolean).join(" · ");
      const quote = i.quote ? `${i.who || "Someone"}: "${i.quote}"` : i.who ? (i.who === nameOf(me) || false ? `${i.who} asked` : `${i.who} asked`) : "";
      const sub = i.quote || !i.who ? quote : `${i.who} asked`;
      const added = !i.quote && i.who && i.urgency === 1 && i.price === 0 && i.id.startsWith("g") ? `Added by ${i.who}` : sub;
      const t = e === null ? 1 : Math.max(0, Math.min(1, (e - k * 90) / 320));
      const scale = state.runner !== null ? (e === null ? 1 : pop(t)) : 0;
      return (
        <button
          key={i.id}
          type="button"
          class="m-hit"
          aria-pressed={inC}
          aria-label={inC ? `${i.name}, in cart` : i.name}
          onClick={() => {
            if (!iAmRunner) return;
            if (!inC && inCart.length + 1 === n && state.doneAt === 0) haptic("success");
            dispatch({ t: "cart", id: i.id });
          }}
          style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", columnGap: 8, alignItems: "center", width: "100%", height: 36, padding: 0, background: "transparent", border: 0, textAlign: "left", cursor: iAmRunner ? "pointer" : "default", position: "relative" }}
        >
          {k > 0 ? <span aria-hidden="true" style={{ position: "absolute", left: 30, right: 0, top: 0, height: 1, background: c.divider }} /> : null}
          <span style={{ position: "relative", width: 18, height: 18, borderRadius: 9, boxShadow: `inset 0 0 0 1.5px ${c.divider}`, display: "block" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 9, background: c.primary, transform: inC ? "scale(1)" : "scale(0)", transition: "transform 200ms cubic-bezier(.34,1.56,.64,1)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5 9.5 L8 12.5 L13.5 6.5" stroke={c.onPrimary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, lineHeight: "18px", color: inC ? c.secondaryText : c.text, fontWeight: urgentRow ? 600 : 400 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
              {urgentRow ? <span role="img" aria-label="Urgent" style={{ flex: "none", width: 8, height: 8, borderRadius: 4, background: c.negative }} /> : null}
            </span>
            <span style={{ display: "block", fontSize: 12, lineHeight: "14px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{amount ? `${amount} · ${added}` : added}</span>
          </span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.secondaryText, paddingLeft: 6 }}>
            {state.runner !== null ? (
              <span style={{ display: "flex", transform: `scale(${scale})`, opacity: scale === 0 ? 0 : 1 }}>
                <Avatar user={state.runner} size={16} />
              </span>
            ) : null}
          </span>
        </button>
      );
    };

    const meter = (
      <svg width="92" height="282" viewBox="0 0 92 282" role="img" aria-label={`Urgency: ${urgent} urgent items left`} style={{ flex: "none", display: "block" }}>
        <text x="36" y="14" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="600" fill={c.text}>Urgency</text>
        <rect x="25" y="40" width="22" height="186" rx="11" fill={c.track} />
        <circle cx="36" cy="240" r="21" fill={c.track} />
        <rect x="28" y={fillY} width="16" height={232 - fillY} rx="8" fill={fill} style={{ transition: "y .4s, height .4s, fill .4s", y: fillY, height: 232 - fillY }} />
        <circle cx="36" cy="240" r="17" fill={fill} />
        <circle cx="36" cy="240" r="11" fill={c.card} />
        <text x="36" y="240.5" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="600" fill={c.text}>{String(urgent)}</text>
        {([["Panic", 1], ["Soon", 0.55], ["Chill", 0.12]] as const).map(([label, f]) => (
          <g key={label}>
            <line x1="50" x2="55" y1={226 - 178 * f} y2={226 - 178 * f} stroke={c.secondaryText} stroke-width="1.5" />
            <text x="58" y={226 - 178 * f} dominant-baseline="middle" font-size="12" fill={c.secondaryText}>{label}</text>
          </g>
        ))}
      </svg>
    );

    const subtitle = `${state.title}${done ? " · restocked" : state.messages > 0 ? ` · from ${state.messages} messages` : " · shared list"}`;

    const addInput = (
      <form onSubmit={(ev) => { ev.preventDefault(); submit(); }} style={{ marginTop: 4 }}>
        <input value={local.draft} placeholder="Add an item" aria-label="Add an item" maxLength={32} onInput={(ev) => setLocal({ draft: ev.currentTarget.value })} style={{ width: "100%", boxSizing: "border-box" }} />
      </form>
    );

    return (
      <div>
        <CardHeader title="Grocery run" subtitle={subtitle} />
        <div style={{ display: "flex", gap: 8, minHeight: 282 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {n === 0 ? (
              <div style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText, padding: "8px 0" }}>Nothing on the list yet</div>
            ) : (
              <div>{rows.map(row)}</div>
            )}
            {n > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 30 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>In cart</span>
                <span style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  {n > VISIBLE ? (
                    <Button kind="deemphasized" onClick={() => setLocal({ all: !local.all })}>
                      {local.all ? "Show less" : "Show all"}
                    </Button>
                  ) : null}
                </span>
                <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${money(carted)} of ${money(total)}`}</span>
              </div>
            ) : null}
            {n === 0 || (local.all && n < MAX_ITEMS) ? addInput : null}
          </div>
          {meter}
        </div>
        {n === 0 ? (
          <Button kind="primary" wide onClick={submit}>
            Add
          </Button>
        ) : state.runner === null ? (
          <div>
            <Button kind="primary" wide onClick={() => dispatch({ t: "go" })}>
              I'm going
            </Button>
            <div style={{ textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText, marginTop: 4 }}>{state.begging ? `${state.begging} is begging` : `${n} things on the list`}</div>
          </div>
        ) : done ? (
          <Locked detail={`${nameOf(state.runner)} got all ${n}`}>Fridge restocked</Locked>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56 }}>
            <Avatar user={state.runner} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iAmRunner ? "You're going" : `${runnerName} is going`}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {`${inCart.length} of ${n} in the cart${iAmRunner ? " · tap items as they land" : ""}`}
              </div>
            </div>
            {iAmRunner ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "drop" })}>
                Drop
              </Button>
            ) : askers.length ? (
              <Facepile users={askers} max={3} size={28} />
            ) : null}
          </div>
        )}
        {done && confirmed.doneAt === 0 ? null : null}
      </div>
    );
  },
});
