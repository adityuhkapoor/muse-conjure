import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Thumb,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
  type ThumbKind,
} from "@muse/app";

// Reel bucket: every "we have to do this" reel the group shared, as a bucket-list board. Done ones
// carry an ink stamp with the date and the faces of who went. Tap an undone one to make it the next
// plan; when you've done it, it gets stamped. One tile has been taunting everyone since August.

type Params = {
  /** Card title */
  title: string;
  /** Since when the reels were shared */
  since: string;
  /** 6 to 15 things from reels. done: the date it got done and who went, or omitted. */
  items: { name: string; kind: ThumbKind; done?: { date: string; who: string[] } }[];
  /** Index of the one everyone keeps not doing, and what its sticker says */
  nemesis: number;
  taunt: string;
};

// @params
const P: Params = {
  title: "The bucket list",
  since: "August",
  items: [
    { name: "Apple picking", kind: "park", done: { date: "Sep 14", who: ["Maya", "Will", "Arun"] } },
    { name: "Hot springs", kind: "park" },
    { name: "Midnight bowling", kind: "venue", done: { date: "Sep 27", who: ["Calvin", "Will", "Aditya"] } },
    { name: "Kayaks on Lake Wren", kind: "park" },
    { name: "Rice cooker cheesecake", kind: "cake" },
    { name: "Golden Lantern dumplings", kind: "ramen", done: { date: "Oct 4", who: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"] } },
    { name: "Rooftop movie", kind: "venue" },
    { name: "Corn maze", kind: "park" },
    { name: "Thrift challenge", kind: "storefront", done: { date: "Oct 18", who: ["Tsai Lin", "Maya"] } },
    { name: "Boba crawl", kind: "boba" },
    { name: "Karaoke at Midtown", kind: "venue" },
    { name: "Sunrise on Miller Hill", kind: "park", done: { date: "Nov 2", who: ["Maya", "Aditya"] } },
    { name: "Pottery night", kind: "gift" },
    { name: "Ice skating", kind: "campus" },
  ],
  nemesis: 1,
  taunt: "still waiting",
};
// @end params

type Item = { name: string; kind: ThumbKind; done: { date: string; who: string[]; at: number } | null };
type State = { title: string; since: string; items: Item[]; nemesis: number; taunt: string; cast: string[]; plan: { item: number; at: number; by: string; going: string[] } | null };
type Action = { t: "plan"; i: number } | { t: "in" } | { t: "did" } | { t: "drop" };
type Local = { sel: number; toast: number };

const KINDS: ThumbKind[] = ["pizza", "burger", "ramen", "sushi", "taco", "salad", "pasta", "cake", "icecream", "coffee", "boba", "cocktail", "bread", "curry", "donut", "storefront", "house", "venue", "park", "campus", "couch", "ticket", "car", "gift", "suitcase", "book"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STAMP_MS = 900;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const idx = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
/** "Nov 12" for a server time in ms (UTC calendar). */
function dateOf(ms: number): string {
  const z = Math.floor(ms / 86400000) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return `${MONTHS[m - 1]} ${d}`;
}
const doneCount = (s: State) => s.items.filter((x) => x.done).length;

function initState(ctx: Ctx): State {
  const cast: string[] = [];
  const items: Item[] = [];
  for (const it of Array.isArray(P.items) ? P.items : []) {
    const name = clean(it?.name, 30);
    if (!name || items.length >= 15) continue;
    let done: Item["done"] = null;
    if (it.done && typeof it.done === "object") {
      const who: string[] = [];
      for (const n of Array.isArray(it.done.who) ? it.done.who : []) {
        const nm = clean(n, 20);
        if (!nm) continue;
        const id = idFor(ctx, nm);
        if (!who.includes(id)) who.push(id);
        if (!cast.includes(id)) cast.push(id);
      }
      done = { date: clean(it.done.date, 10) || "done", who, at: 0 };
    }
    items.push({ name, kind: KINDS.includes(it.kind) ? it.kind : "park", done });
  }
  return { title: clean(P.title, 40) || "The bucket list", since: clean(P.since, 20), items, nemesis: idx(P.nemesis, items.length) && !items[P.nemesis]!.done ? P.nemesis : -1, taunt: clean(P.taunt, 20), cast, plan: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "plan") {
    if (s.plan || !idx(a.i, s.items.length) || s.items[a.i]!.done) return s;
    return { ...s, plan: { item: a.i, at: Math.max(1, m.time), by: u, going: [u] } };
  }
  if (a.t === "in") {
    if (!s.plan) return s;
    const g = s.plan.going;
    return { ...s, plan: { ...s.plan, going: g.includes(u) ? g.filter((x) => x !== u) : [...g, u] } };
  }
  if (a.t === "did") {
    if (!s.plan || !s.plan.going.length) return s;
    const at = Math.max(1, m.time);
    const i = s.plan.item;
    return { ...s, items: s.items.map((x, k) => (k === i ? { ...x, done: { date: dateOf(at), who: s.plan!.going, at } } : x)), plan: null };
  }
  if (a.t === "drop") {
    if (!s.plan || s.plan.by !== u) return s;
    return { ...s, plan: null };
  }
  return s;
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

/** A little bucket filled to `f`. */
function Bucket({ f, theme }: { f: number; theme: Theme }) {
  const p = pal(theme);
  const c = theme.color;
  const top = 10, bot = 38;
  const y = bot - (bot - top) * f;
  const xl = (yy: number) => 6 + ((yy - top) / (bot - top)) * 4;
  return (
    <svg width={40} height={42} viewBox="0 0 40 42" aria-hidden="true">
      <path d="M 8 10 Q 20 -4 32 10" fill="none" stroke={p.soft} stroke-width={2} />
      <path d={`M 6 10 L 34 10 L 30 38 L 10 38 Z`} fill={c.wash} stroke={p.soft} stroke-width={1.5} />
      <path d={`M ${xl(y)} ${y} L ${40 - xl(y)} ${y} L 30 38 L 10 38 Z`} fill={p.blue} />
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Reel bucket",
  summary: (s) => {
    const base = `${s.title}: ${doneCount(s)} of ${s.items.length} done`;
    return s.plan ? `${base} · next: ${s.items[s.plan.item]?.name ?? ""}, ${s.plan.going.length} in` : base;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => (s.plan && !s.plan.going.every((u) => inChat(ctx, u)) ? { ...s, plan: { ...s.plan, going: s.plan.going.filter((u) => inChat(ctx, u)) } } : s),

  invariants: {
    "the plan is something not done yet": (s) => s.plan === null || (idx(s.plan.item, s.items.length) && !s.items[s.plan.item]!.done && s.plan.at > 0),
    "going is unique and here": (s, ctx) => s.plan === null || (new Set(s.plan.going).size === s.plan.going.length && s.plan.going.every((u) => inChat(ctx, u))),
    "every stamp has a date and someone who went": (s) => s.items.every((x) => !x.done || (x.done.date.length > 0 && (x.done.at === 0 || x.done.who.length > 0))),
    "stamps never list someone twice": (s) => s.items.every((x) => !x.done || new Set(x.done.who).size === x.done.who.length),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "planning picks that tile, with me going": (p, n, a, m) => a.t !== "plan" || p === n || (p.plan === null && !!n.plan && n.plan.item === a.i && n.plan.by === m.user && n.plan.going.join() === m.user),
    "in toggles only me": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      if (!p.plan || !n.plan) return false;
      const was = p.plan.going.includes(m.user);
      return n.plan.going.includes(m.user) !== was && n.plan.going.length === p.plan.going.length + (was ? -1 : 1) && n.plan.item === p.plan.item;
    },
    "doing it stamps the plan with today and who went": (p, n, a, m) => {
      if (a.t !== "did" || p === n) return true;
      const i = p.plan!.item;
      const d = n.items[i]!.done;
      return n.plan === null && !!d && d.date === dateOf(Math.max(1, m.time)) && d.who.join() === p.plan!.going.join() && doneCount(n) === doneCount(p) + 1;
    },
    "only the planner drops it": (p, n, a, m) => a.t !== "drop" || p === n || (p.plan?.by === m.user && n.plan === null),
    "stamps never come off": (p, n) => p.items.every((x, i) => !x.done || n.items[i]!.done === x.done),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (!s.plan) return s.items.length ? { t: "plan", i: r.int(s.items.length) } : { t: "in" };
    if (k < 0.5) return { t: "in" };
    if (k < 0.75) return { t: "did" };
    return { t: "drop" };
  },

  local: { sel: -1, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const n = state.items.length;
    const cols = W >= 360 ? 5 : 4;
    const gap = 6;
    const tw = (W - gap * (cols - 1)) / cols;
    const th = 86;
    const now = clock.value;
    const done = doneCount(state);
    const sel = state.plan ? state.plan.item : local.sel >= 0 && local.sel < n && !state.items[local.sel]!.done ? local.sel : -1;
    const selItem = sel >= 0 ? state.items[sel] : undefined;
    const going = state.plan?.going ?? [];
    const lastStamp = state.items.reduce((b, x, i) => (x.done && x.done.at > (state.items[b]?.done?.at ?? 0) ? i : b), -1);
    const nem = state.nemesis >= 0 && !state.items[state.nemesis]?.done ? state.nemesis : -1;
    const sub = `${n} reels shared${state.since ? ` since ${state.since}` : ""} · ${done} done`;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CardHeader title={state.title} subtitle={sub} />
          </div>
          <div role="img" aria-label={`${done} of ${n} done`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
            <Bucket f={n ? done / n : 0} theme={theme} />
            <span style={{ fontSize: 12, lineHeight: "14px", color: c.text, fontWeight: 600 }}>{`${done}/${n}`}</span>
          </div>
        </div>
        {/* the board */}
        <div style={{ display: "flex", flexWrap: "wrap", gap, marginTop: 6 }}>
          {n === 0 ? (
            <div style={{ width: "100%", height: th, border: `1.5px dashed ${c.divider}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText }}>Reels you say "we have to do this" about land here</div>
          ) : null}
          {state.items.map((it, i) => {
            const isSel = i === sel;
            const f = fitText(it.name, (tw - 10) * 2.4, { size: 11, min: 10 });
            const stampE = it.done && it.done.at > 0 && i === lastStamp ? running(it.done.at, STAMP_MS) : null;
            const sc = stampE === null ? 1 : 1 + 1.4 * Math.max(0, 1 - stampE / 250);
            const inner = (
              <>
                <span style={{ position: "absolute", left: (tw - 36) / 2, top: 6 }}>
                  <Thumb kind={it.kind} seed={it.name} size={36} label="" />
                </span>
                <span style={{ position: "absolute", left: 4, right: 4, top: 45, textAlign: "center", fontSize: f.size, lineHeight: "12px", color: c.text, overflowWrap: "break-word" }}>{f.text}</span>
                {it.done ? (
                  <>
                    <span style={{ position: "absolute", right: 2, top: 4, padding: "0 4px", border: `2px solid ${p.red}`, borderRadius: 6, background: mix(c.card, p.red, 0.1), color: theme.mode === "dark" ? c.text : mix(p.red, p.dark, 0.45), fontSize: 10, fontWeight: 800, lineHeight: "14px", transform: `rotate(-12deg) scale(${sc.toFixed(3)})`, pointerEvents: "none" }}>{it.done.date}</span>
                    <span style={{ position: "absolute", left: 3, top: 30, display: "flex", pointerEvents: "none" }}>
                      <Facepile users={it.done.who.map((u) => members.find((m) => m.id === u) ?? { id: u, name: u })} max={2} size={16} />
                    </span>
                  </>
                ) : null}
                {i === nem ? (
                  <>
                    <svg width={tw} height={30} viewBox={`0 0 ${tw} 30`} aria-hidden="true" style={{ position: "absolute", left: 0, top: -6, pointerEvents: "none" }}>
                      {[0, 1, 2].map((k) => {
                        const ph = ((now / 1400 + k / 3) % 1);
                        const x = tw / 2 - 12 + k * 12;
                        return <path key={k} d={`M ${x} ${26 - ph * 20} q 4 -4 0 -8 q -4 -4 0 -8`} fill="none" stroke={p.soft} stroke-width={1.6} stroke-linecap="round" opacity={1 - ph} />;
                      })}
                    </svg>
                    {state.taunt ? <span style={{ position: "absolute", right: -4, top: -8, padding: "1px 6px", borderRadius: 999, background: p.yellow, color: p.dark, fontSize: 10, fontWeight: 700, lineHeight: "14px", transform: `rotate(${(4 * Math.sin(now / 500)).toFixed(1)}deg)`, whiteSpace: "nowrap", pointerEvents: "none" }}>{state.taunt}</span> : null}
                  </>
                ) : null}
              </>
            );
            const box = { position: "relative", width: tw, height: th, borderRadius: 10, padding: 0, boxSizing: "border-box", background: isSel ? c.selected : it.done ? mix(c.wash, p.red, 0.04) : c.wash, border: isSel ? `2px solid ${c.primary}` : it.done ? `1px solid ${c.divider}` : `1.5px dashed ${c.divider}`, transform: isSel ? "translateY(-3px)" : undefined, fontFamily: "inherit" } as Record<string, string | number | undefined>;
            return it.done || state.plan ? (
              <span key={i} style={box} role="img" aria-label={it.done ? `${it.name}, done ${it.done.date}` : it.name}>{inner}</span>
            ) : (
              <button key={i} type="button" aria-pressed={isSel} aria-label={`${it.name}, not done yet`} onClick={() => { haptic("light"); setLocal({ sel: isSel ? -1 : i }); }} style={{ ...box, cursor: "pointer" }}>
                {inner}
              </button>
            );
          })}
        </div>

        {/* the next plan */}
        <div style={{ marginTop: 10 }}>
          {state.plan && selItem ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Next: ${selItem.name}`}</span>
                <Facepile users={going} max={4} size={20} />
                <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${going.length} in`}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Button kind="primary" wide disabled={!going.length} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1, sel: -1 }); dispatch({ t: "did" }); }}>We did it</Button>
                </div>
                <Button kind="secondary" onClick={() => { haptic("light"); dispatch({ t: "in" }); }}>{going.includes(me) ? "I'm out" : "I'm in"}</Button>
                {state.plan.by === me ? <Button kind="deemphasized" onClick={() => dispatch({ t: "drop" })}>Drop</Button> : null}
              </div>
            </>
          ) : (
            <>
              <Button kind="primary" wide disabled={!selItem} onClick={() => { if (sel >= 0) { haptic("success"); dispatch({ t: "plan", i: sel }); } }}>
                {selItem ? `Make it the plan` : "Pick one first"}
              </Button>
              <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selItem ? selItem.name : nem >= 0 ? `Tap a tile · ${state.items[nem]!.name} is ${state.taunt || "waiting"}` : "Tap a tile to make it next"}
              </div>
            </>
          )}
        </div>
        {local.toast > 0 && lastStamp >= 0 && !state.plan ? <Toast key={local.toast}>{`Stamped · ${state.items[lastStamp]!.name}, ${done} of ${n}`}</Toast> : null}
      </div>
    );
  },
});
