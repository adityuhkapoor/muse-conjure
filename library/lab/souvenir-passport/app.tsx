import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Souvenir passport: someone posts from a trip with several stops. A passport spread with one ink
// stamp per stop, each its own shape and tilt; friends hang a souvenir request off a stamp (a
// magnet, the hot sauce, "a llama, a real one") and it dangles there with their face. The traveller
// ticks them off as they pack. The next page waits, dashed, for the next stop.

type Item = "magnet" | "keychain" | "snack" | "sauce" | "shirt" | "postcard";
type Params = {
  /** Who is travelling: "Aditya" */
  author: string;
  /** The trip: "Ecuador trip" */
  trip: string;
  /** The post line: "day 4 of the trip, lowkey never coming back" */
  line: string;
  /** Stops so far, in order: city and short date */
  stops: { city: string; date: string }[];
  /** Requests already hanging: who, which stop (city), item (magnet, keychain, snack, sauce, shirt, postcard), their words, packed yet */
  asks: { who: string; stop: string; item: Item; note?: string; packed?: boolean }[];
};

// @params
const P: Params = {
  author: "Aditya",
  trip: "Ecuador trip",
  line: "day 4 of the trip, lowkey never coming back",
  stops: [
    { city: "Quito", date: "Nov 8" },
    { city: "Baños", date: "Nov 10" },
    { city: "Cuenca", date: "Nov 12" },
  ],
  asks: [
    { who: "Calvin", stop: "Baños", item: "shirt", note: "a llama, a real one", packed: false },
    { who: "Will", stop: "Quito", item: "sauce", note: "the spiciest one", packed: true },
    { who: "Arun", stop: "Cuenca", item: "snack", note: "rice cooker compatible" },
    { who: "Tsai Lin", stop: "Quito", item: "postcard" },
  ],
};
// @end params

type Stop = { id: string; city: string; date: string };
type Ask = { id: string; who: string; name: string; stop: string; item: Item; note: string; packed: boolean; at: number };
type State = { author: string; authorName: string; trip: string; line: string; stops: Stop[]; asks: Ask[] };
type Action = { t: "ask"; stop: string; item: Item; note: string } | { t: "pack"; id: string } | { t: "drop"; id: string };
type Local = { sel: string; open: boolean; item: Item; note: string; toast: number };

const ITEMS: Item[] = ["magnet", "keychain", "snack", "sauce", "shirt", "postcard"];
const ITEM_NAME: Record<Item, string> = { magnet: "Magnet", keychain: "Keychain", snack: "Snacks", sauce: "Hot sauce", shirt: "Shirt", postcard: "Postcard" };
const MAX_STOPS = 3;
const PER_PERSON = 3;
const BOOK_H = 254;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isItem = (v: unknown): v is Item => typeof v === "string" && (ITEMS as string[]).includes(v);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}
const idFor = (ctx: Ctx, name: string) => memberFor(ctx, name)?.id ?? `name:${name}`;

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = idFor(ctx, authorName);
  const all = (Array.isArray(P.stops) ? P.stops : []).map((s, i) => ({ id: `s${i}`, city: clean(s?.city, 16), date: clean(s?.date, 8) })).filter((s) => s.city);
  const stops = all.slice(-MAX_STOPS);
  const asks: Ask[] = [];
  for (const [i, a] of (Array.isArray(P.asks) ? P.asks : []).entries()) {
    const name = clean(a?.who, 20);
    const stop = stops.find((s) => s.city.toLowerCase() === clean(a?.stop, 16).toLowerCase());
    if (!name || !stop || !isItem(a.item)) continue;
    const who = idFor(ctx, name);
    if (who === author || asks.some((q) => q.who === who && q.stop === stop.id) || asks.filter((q) => q.who === who).length >= PER_PERSON) continue;
    asks.push({ id: `p${i}`, who, name: memberFor(ctx, name)?.name ?? name, stop: stop.id, item: a.item, note: clean(a.note, 28), packed: a.packed === true, at: 0 });
  }
  return { author, authorName, trip: clean(P.trip, 28) || "The trip", line: clean(P.line, 60), stops, asks };
}

const INK = ["red", "blue", "green", "purple"] as const;

function stampShape(i: number, w: number, h: number, ink: string) {
  const k = i % 4;
  if (k === 0)
    return (
      <g>
        <circle cx={w / 2} cy={h / 2} r={h / 2 - 1} fill="none" stroke={ink} stroke-width={2.4} />
        <circle cx={w / 2} cy={h / 2} r={h / 2 - 6} fill="none" stroke={ink} stroke-width={1} />
      </g>
    );
  if (k === 1)
    return (
      <g>
        <rect x={1} y={4} width={w - 2} height={h - 8} rx={6} fill="none" stroke={ink} stroke-width={2.4} />
        <rect x={5} y={8} width={w - 10} height={h - 16} rx={3} fill="none" stroke={ink} stroke-width={1} stroke-dasharray="3 2" />
      </g>
    );
  if (k === 2) {
    const cx = w / 2, cy = h / 2, r = h / 2 - 1;
    const pts = [0, 1, 2, 3, 4, 5].map((j) => `${cx + r * 1.15 * Math.cos((j * Math.PI) / 3)},${cy + r * Math.sin((j * Math.PI) / 3)}`).join(" ");
    return <polygon points={pts} fill="none" stroke={ink} stroke-width={2.4} stroke-linejoin="round" />;
  }
  return (
    <g>
      <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 3} fill="none" stroke={ink} stroke-width={2.4} />
      <line x1={8} y1={h / 2 + 8} x2={w - 8} y2={h / 2 + 8} stroke={ink} stroke-width={1} />
    </g>
  );
}

function itemArt(item: Item, t: Theme) {
  const p = pal(t), c = t.color;
  const edge = mix(c.text, c.card, 0.15);
  if (item === "magnet")
    return (
      <g>
        <path d="M3 3 L3 12 A8 8 0 0 0 19 12 L19 3 L14 3 L14 12 A3 3 0 0 1 8 12 L8 3 Z" fill={p.red} stroke={edge} stroke-width={0.8} />
        <rect x={3} y={1} width={5} height={4} fill={p.tile} stroke={edge} stroke-width={0.8} />
        <rect x={14} y={1} width={5} height={4} fill={p.tile} stroke={edge} stroke-width={0.8} />
      </g>
    );
  if (item === "keychain")
    return (
      <g>
        <circle cx={7} cy={6} r={5} fill="none" stroke={p.soft} stroke-width={2} />
        <path d="M10 9 L19 18 M15 14 L18 11 M17 16 L19 14" stroke={p.yellow} stroke-width={3} stroke-linecap="round" />
      </g>
    );
  if (item === "snack")
    return (
      <g>
        <path d="M4 3 L18 3 L17 20 L5 20 Z" fill={p.orange} stroke={edge} stroke-width={0.8} />
        <path d="M4 3 l2 -2 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2" fill="none" stroke={edge} stroke-width={0.8} />
        <circle cx={11} cy={11} r={3.5} fill={p.yellow} />
      </g>
    );
  if (item === "sauce")
    return (
      <g>
        <rect x={8} y={0} width={6} height={5} rx={1} fill={p.green} />
        <path d="M8 5 L14 5 L17 10 L17 21 L5 21 L5 10 Z" fill={p.red} stroke={edge} stroke-width={0.8} />
        <rect x={7} y={12} width={8} height={5} fill={p.cream} />
      </g>
    );
  if (item === "shirt")
    return <path d="M7 2 L1 6 L4 10 L6 9 L6 21 L16 21 L16 9 L18 10 L21 6 L15 2 Q11 6 7 2 Z" fill={p.blue} stroke={edge} stroke-width={0.8} />;
  return (
    <g>
      <rect x={1} y={4} width={20} height={14} rx={1} fill={p.cream} stroke={edge} stroke-width={0.8} />
      <rect x={14} y={6} width={5} height={6} fill={p.red} />
      <path d="M3 9 L11 9 M3 12 L11 12 M3 15 L9 15" stroke={edge} stroke-width={0.8} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Souvenir passport",
  summary: (s) => `${s.trip} · ${s.stops.length} ${s.stops.length === 1 ? "stop" : "stops"} · ${s.asks.length} souvenir ${s.asks.length === 1 ? "ask" : "asks"}, ${s.asks.filter((a) => a.packed).length} packed`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "ask") {
      if (u === s.author || !isItem(a.item) || !s.stops.some((x) => x.id === a.stop)) return s;
      const old = s.asks.find((q) => q.who === u && q.stop === a.stop);
      if (!old && s.asks.filter((q) => q.who === u).length >= PER_PERSON) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      const ask: Ask = { id: old ? old.id : `r${meta.seq}`, who: u, name, stop: a.stop, item: a.item, note: clean(a.note, 28), packed: false, at: meta.time };
      return { ...s, asks: old ? s.asks.map((q) => (q === old ? ask : q)) : [...s.asks, ask] };
    }
    if (a.t === "pack") {
      const q = s.asks.find((x) => x.id === a.id);
      if (u !== s.author || !q) return s;
      return { ...s, asks: s.asks.map((x) => (x === q ? { ...x, packed: !x.packed } : x)) };
    }
    if (a.t === "drop") {
      const q = s.asks.find((x) => x.id === a.id);
      if (!q || q.who !== u || q.packed) return s;
      return { ...s, asks: s.asks.filter((x) => x !== q) };
    }
    return s;
  },

  invariants: {
    "every ask hangs off a real stop": (s) => s.asks.every((a) => s.stops.some((x) => x.id === a.stop) && isItem(a.item)),
    "one ask per friend per stop, a few in all": (s) =>
      s.asks.every((a) => s.asks.filter((q) => q.who === a.who && q.stop === a.stop).length === 1 && (a.at === 0 || s.asks.filter((q) => q.who === a.who).length <= PER_PERSON)),
    "the traveller never asks": (s) => s.asks.every((a) => a.who !== s.author),
    "ask ids are unique": (s) => new Set(s.asks.map((a) => a.id)).size === s.asks.length,
  },

  transitions: {
    "an ask hangs my item where I asked": (p, n, a, m) => {
      if (a.t !== "ask" || p === n) return true;
      const q = n.asks.find((x) => x.who === m.user && x.stop === a.stop);
      return !!q && q.item === a.item && q.note === clean(a.note, 28) && !q.packed && q.at === m.time && p.asks.filter((x) => x.who !== m.user || x.stop !== a.stop).every((x) => n.asks.includes(x));
    },
    "a new ask adds one, a changed ask keeps its place": (p, n, a, m) => {
      if (a.t !== "ask" || p === n) return true;
      const had = p.asks.findIndex((x) => x.who === m.user && x.stop === a.stop);
      return had < 0 ? n.asks.length === p.asks.length + 1 : n.asks.length === p.asks.length && n.asks[had]!.id === p.asks[had]!.id;
    },
    "a friend's ask with room lands": (p, n, a, m, ctx) =>
      a.t !== "ask" || !inChat(ctx, m.user) || m.user === p.author || !isItem(a.item) || !p.stops.some((x) => x.id === a.stop) || (p.asks.filter((x) => x.who === m.user).length >= PER_PERSON && !p.asks.some((x) => x.who === m.user && x.stop === a.stop)) || p !== n,
    "only the traveller packs, one at a time": (p, n, a, m) =>
      a.t !== "pack" || p === n || (m.user === p.author && n.asks.length === p.asks.length && n.asks.filter((x, i) => x.packed !== p.asks[i]!.packed).length === 1 && n.asks.every((x, i) => x.id === p.asks[i]!.id && x.item === p.asks[i]!.item)),
    "the traveller's pack lands": (p, n, a, m, ctx) => a.t !== "pack" || m.user !== p.author || !inChat(ctx, m.user) || !p.asks.some((x) => x.id === a.id) || p !== n,
    "you can take back only your own unpacked ask": (p, n, a, m) => a.t !== "drop" || p === n || (n.asks.length === p.asks.length - 1 && p.asks.some((x) => x.id === a.id && x.who === m.user && !x.packed) && !n.asks.some((x) => x.id === a.id)),
    "the trip never changes": (p, n) => p.stops === n.stops && p.author === n.author && p.trip === n.trip && p.line === n.line,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const own = s.asks.filter((a) => a.who === user && !a.packed);
    if (user === s.author && s.asks.length) return { t: "pack", id: r.pick(s.asks).id };
    if (own.length && r.next() < 0.2) return { t: "drop", id: r.pick(own).id };
    const stop = s.stops.length ? r.pick(s.stops).id : "s0";
    return { t: "ask", stop, item: r.next() < 0.95 ? r.pick(ITEMS) : ("llama" as Item), note: r.pick(["", "the big one", "surprise me"]) };
  },

  local: { sel: "", open: false, item: "magnet", note: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const page = dark ? mix(c.wash, p.blue, 0.08) : mix(c.card, p.cream, 0.55);
    const cover = dark ? mix(p.blue, c.wash, 0.55) : mix(p.blue, c.text, 0.35);
    const sel = state.stops.find((x) => x.id === local.sel) ?? state.stops[state.stops.length - 1];
    const person = (a: Ask): Member => members.find((m) => m.id === a.who) ?? { id: a.who, name: a.name };
    const slotW = (W - 28) / 2;
    const slots = [
      { x: 8, y: 14 },
      { x: 10, y: 128 },
      { x: W / 2 + 6, y: 16 },
      { x: W / 2 + 8, y: 128 },
    ];
    const stampW = Math.min(104, slotW - 8), stampH = 60;
    const lastAt = Math.max(0, ...state.asks.map((a) => a.at));
    const mineHere = sel ? state.asks.find((a) => a.who === me && a.stop === sel.id) : undefined;
    const mineCount = state.asks.filter((a) => a.who === me).length;
    const canAsk = !isAuthor && !!sel && (mineHere ? !mineHere.packed : mineCount < PER_PERSON);
    const packed = state.asks.filter((a) => a.packed).length;
    const send = () => {
      if (!sel) return;
      dispatch({ t: "ask", stop: sel.id, item: local.item, note: local.note });
      setLocal({ open: false, note: "", toast: local.toast + 1 });
      haptic("success");
    };

    return (
      <div>
        <style>{"@keyframes spSway { 0%, 100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } } @keyframes spDrop { 0% { transform: translateY(-26px) } 70% { transform: translateY(3px) } 100% { transform: translateY(0) } }"}</style>
        <CardHeader title={state.trip} subtitle={state.line ? `${state.authorName}: “${state.line}”` : `${state.stops.length} stops so far`} />
        <div style={{ position: "relative", height: BOOK_H, borderRadius: 12, background: cover, padding: 5, boxSizing: "border-box" }}>
          <div style={{ position: "relative", height: "100%", borderRadius: 8, background: page, overflow: "hidden" }}>
            <svg width={W - 10} height={BOOK_H - 10} viewBox={`0 0 ${W - 10} ${BOOK_H - 10}`} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
              <rect x={(W - 10) / 2 - 10} y={0} width={20} height={BOOK_H - 10} fill={mix(page, c.text, dark ? 0.12 : 0.06)} />
              <line x1={(W - 10) / 2} y1={0} x2={(W - 10) / 2} y2={BOOK_H - 10} stroke={c.divider} stroke-width={1.5} />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <line key={i} x1={14} y1={30 + i * 34} x2={(W - 10) / 2 - 16} y2={30 + i * 34} stroke={mix(page, p.blue, 0.12)} stroke-width={1} />
              ))}
            </svg>
            {slots.map((sl, i) => {
              const stop = state.stops[i];
              if (!stop) {
                if (i !== state.stops.length) return null;
                return (
                  <div key="next" style={{ position: "absolute", left: sl.x, top: sl.y + 4, width: stampW, height: stampH, borderRadius: 10, border: `1.5px dashed ${c.divider}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c.secondaryText, textAlign: "center", lineHeight: "15px" }}>
                    Next stop
                    <br />
                    stamps here
                  </div>
                );
              }
              const ink = mix(p[INK[i % 4]!], c.text, dark ? 0.1 : 0.35);
              const inkText = mix(p[INK[i % 4]!], c.text, 0.4);
              const asks = state.asks.filter((a) => a.stop === stop.id);
              const isSel = sel?.id === stop.id && !isAuthor && local.open;
              return (
                <div key={stop.id} style={{ position: "absolute", left: sl.x, top: sl.y, width: slotW, height: 104 }}>
                  <button
                    type="button"
                    aria-label={`${stop.city} stamp, ${stop.date}, ${asks.length} asks`}
                    onClick={() => setLocal({ sel: stop.id })}
                    style={{ position: "absolute", left: 0, top: 0, width: stampW, height: stampH + 6, padding: 0, border: "none", background: "none", transform: `rotate(${[-7, 5, -3, 8][i % 4]}deg)`, borderRadius: 10, outline: isSel ? `2px dashed ${c.primary}` : "none", outlineOffset: 2 }}
                  >
                    <svg width={stampW} height={stampH} viewBox={`0 0 ${stampW} ${stampH}`} aria-hidden="true" style={{ display: "block", margin: "3px 0" }}>
                      {stampShape(i, stampW, stampH, ink)}
                    </svg>
                    <div style={{ position: "absolute", left: i % 2 ? 10 : 18, right: i % 2 ? 10 : 18, top: 17, textAlign: "center", color: inkText, pointerEvents: "none", textTransform: "uppercase" }}>
                      <div style={{ fontSize: 13, lineHeight: "16px", fontWeight: 800, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stop.city}</div>
                      <div style={{ fontSize: 10, lineHeight: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>{i % 2 ? `${stop.date} · entry` : stop.date}</div>
                    </div>
                  </button>
                  {asks.slice(0, 4).map((a, j) => (
                    <div
                      key={a.id}
                      style={{ position: "absolute", left: 6 + j * 28, top: stampH + 2, width: 26, height: 40, transformOrigin: "13px 0", animation: `${a.at === lastAt && a.at > 0 ? "spDrop .5s ease-out, " : ""}spSway ${2.2 + j * 0.3}s ease-in-out infinite`, pointerEvents: "none" }}
                    >
                      <svg width={26} height={40} viewBox="0 0 26 40" aria-hidden="true">
                        <line x1={13} y1={0} x2={13} y2={12} stroke={c.secondaryText} stroke-width={1} />
                        <g transform="translate(2 12)">{itemArt(a.item, theme)}</g>
                      </svg>
                      <div style={{ position: "absolute", left: 14, top: 26 }}>
                        <Avatar user={person(a)} size={14} />
                      </div>
                      {a.packed ? (
                        <svg width={14} height={14} viewBox="0 0 14 14" style={{ position: "absolute", left: -2, top: 26 }} aria-hidden="true">
                          <circle cx={7} cy={7} r={7} fill={c.positive} />
                          <polyline points="3.5,7.5 6,10 10.5,4.5" fill="none" stroke={c.onPrimary} stroke-width={1.8} />
                        </svg>
                      ) : null}
                    </div>
                  ))}
                  {asks.length > 4 ? <div style={{ position: "absolute", left: 6 + 4 * 28, top: stampH + 18, fontSize: 12, fontWeight: 700, color: c.text }}>{`+${asks.length - 4}`}</div> : null}
                </div>
              );
            })}
          </div>
        </div>

        {local.open && sel ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {ITEMS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={ITEM_NAME[k]}
                  onClick={() => setLocal({ item: k })}
                  style={{ flex: 1, minWidth: 0, height: 44, padding: 0, borderRadius: 8, border: `2px solid ${local.item === k ? c.primary : c.divider}`, background: local.item === k ? c.selected : c.card }}
                >
                  <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
                    {itemArt(k, theme)}
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={local.note}
                maxLength={28}
                placeholder={`From ${sel.city}, a few words`}
                aria-label="Your note"
                onInput={(e: { currentTarget: { value: string } }) => setLocal({ note: e.currentTarget.value })}
                onKeyDown={(e: { key: string }) => (e.key === "Enter" ? send() : undefined)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button kind="primary" onClick={send}>
                Hang it
              </Button>
            </div>
          </div>
        ) : isAuthor ? (
          <div style={{ marginTop: 10, display: "flex", gap: 6, overflow: "hidden", alignItems: "center" }}>
            {state.asks.length === 0 ? <span style={{ fontSize: 13, color: c.secondaryText }}>No asks yet · friends hang them on your stamps</span> : null}
            {state.asks.length > 3 ? <span style={{ flex: "none", fontSize: 12, fontWeight: 700, color: c.text }}>{`${state.asks.filter((a) => a.packed).length} of ${state.asks.length}`}</span> : null}
            {[...state.asks.filter((a) => !a.packed), ...state.asks.filter((a) => a.packed)].slice(0, 3).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { dispatch({ t: "pack", id: a.id }); haptic("light"); }}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 44, padding: "0 8px", borderRadius: 22, border: `1px solid ${a.packed ? c.positive : c.divider}`, background: a.packed ? mix(c.card, c.positive, 0.12) : c.card, color: c.text, fontSize: 12, flex: "1 1 0", minWidth: 0 }}
              >
                <Avatar user={person(a)} size={18} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${a.packed ? "Packed" : "Pack"} ${ITEM_NAME[a.item].toLowerCase()}`}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {mineHere
                ? `You asked for a ${ITEM_NAME[mineHere.item].toLowerCase()} from ${sel?.city}${mineHere.note ? `: “${mineHere.note}”` : ""}${mineHere.packed ? " · packed" : ""}`
                : state.asks.length
                  ? `${packed} of ${state.asks.length} packed · ${(() => {
                      const q = state.asks.find((a) => a.note) ?? state.asks[0]!;
                      return `${q.name.split(" ")[0]}: “${q.note || ITEM_NAME[q.item].toLowerCase()}”`;
                    })()}`
                  : `Tap a stamp, ask ${state.authorName} for something`}
            </span>
            {canAsk ? (
              <Button kind="primary" onClick={() => setLocal({ open: true, item: mineHere?.item ?? local.item, note: mineHere?.note ?? "" })}>
                {mineHere ? "Change it" : `Ask from ${sel!.city.length > 9 ? "here" : sel!.city}`}
              </Button>
            ) : null}
          </div>
        )}
        {local.toast > 0 && !local.open ? <Toast key={local.toast}>{`Hung on ${sel?.city ?? "the stamp"}`}</Toast> : null}
      </div>
    );
  },
});

