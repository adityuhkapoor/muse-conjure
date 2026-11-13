import { defineApp, Avatar, Changed, More, Toast, haptic, mix, running, tween, CardHeader, type Child } from "@muse/app";

// Move-in day: a timeline with the truck on it, the big items with how many hands each needs, a
// tray of free hands to tap onto items, and a truck-space bar that fills as items load. When
// everything is loaded the truck rolls to the next stop.

type Kind = "couch" | "mattress" | "tv" | "table" | "boxes" | "other";
type Params = {
  title: string;
  /** "Sat · 412 Alder St" */
  sub: string;
  /** 2 to 5 stops */
  stops: { time: string; label: string }[];
  /** Index of the current stop */
  stage: number;
  /** 1 to 3 items; hands: names as in the chat */
  items: { name: string; need: number; note: string; cuft: number; kind: Kind; hands: string[] }[];
  boxes: { label: string; cuft: number };
  truckCuft: number;
  /** Line shown when the truck rolls */
  after: string;
};

// @params
const P: Params = {
  title: "Move-in day",
  sub: "Sat · 412 Alder St",
  stops: [
    { time: "9:00", label: "Truck" },
    { time: "9:30", label: "Load" },
    { time: "10:40", label: "Drive" },
    { time: "11:15", label: "Unload" },
    { time: "1:00", label: "Pizza" },
  ],
  stage: 1,
  items: [
    { name: "Couch", need: 3, note: "Tilt it through the door", cuft: 110, kind: "couch", hands: ["Maya", "Theo"] },
    { name: "Mattress", need: 2, note: "Queen · very floppy", cuft: 60, kind: "mattress", hands: ["Priya"] },
    { name: "TV", need: 1, note: "The careful one", cuft: 30, kind: "tv", hands: [] },
  ],
  boxes: { label: "23 boxes", cuft: 160 },
  truckCuft: 400,
  after: "Pizza at 1, on Noa",
};
// @end params

type Item = { id: string; name: string; need: number; note: string; cuft: number; kind: Kind; hands: string[]; loadedAt: number };
/** rolledAt > 0 exactly while every item is loaded */
type State = {
  title: string;
  sub: string;
  stops: { time: string; label: string }[];
  stage: number;
  items: Item[];
  boxes: { label: string; cuft: number };
  truckCuft: number;
  after: string;
  rolledAt: number;
};
type Action = { t: "put"; user: string; item: string } | { t: "off" };
/** pick: the free person I tapped in the tray */
type Local = { pick: string | null };
type Ctx = { members: { id: string; name?: string }[] };

const KINDS: Kind[] = ["couch", "mattress", "tv", "table", "boxes", "other"];
const ROLL_MS = 1600;
const roll = tween({ duration: ROLL_MS, easing: "easeInOut" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const allLoaded = (s: State) => s.items.length > 0 && s.items.every((i) => i.loadedAt > 0);
const onItem = (s: State, u: string) => s.items.find((i) => i.hands.includes(u)) ?? null;
const othersSame = (p: State, n: State, id: string) => same(p.items.filter((i) => i.id !== id), n.items.filter((i) => i.id !== id));
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const stamp = (prev: State, next: State, time: number): State => ({ ...next, rolledAt: allLoaded(next) ? (allLoaded(prev) ? prev.rolledAt : time) : 0 });

function step(s: State, a: Record<string, unknown>, user: string, time: number): State {
  if (a.t === "put") {
    const who = a.user;
    const item = typeof a.item === "string" ? s.items.find((i) => i.id === a.item) : undefined;
    if (typeof who !== "string" || !item || onItem(s, who) || item.hands.length >= item.need) return s;
    const hands = [...item.hands, who];
    const items = s.items.map((i) => (i.id === item.id ? { ...i, hands, loadedAt: hands.length === i.need ? time : 0 } : i));
    return stamp(s, { ...s, items }, time);
  }
  if (a.t === "off") {
    const was = s.items.find((i) => i.hands.includes(user));
    if (!was || was.loadedAt > 0) return s;
    const items = s.items.map((i) => (i.id === was.id ? { ...i, hands: i.hands.filter((u) => u !== user) } : i));
    return stamp(s, { ...s, items }, time);
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Move-in day",
  summary: (s) => {
    if (allLoaded(s) && s.rolledAt > 0) return `${s.title}: everything's loaded · truck's rolling`;
    const loaded = s.items.filter((i) => i.loadedAt > 0).length;
    const needs = s.items.reduce((n, i) => n + i.need - i.hands.length, 0);
    return `${s.title}: ${loaded} of ${s.items.length} items loaded · ${needs} hands still needed`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const items: Item[] = P.items.slice(0, 3).map((it, idx) => {
      const need = int(it.need, 1, 4, 1);
      const hands: string[] = [];
      for (const name of it.hands ?? []) {
        const want = String(name).trim().toLowerCase();
        const m = ctx.members.find((x) => x.id === name || (x.name ?? "").toLowerCase() === want);
        if (m && !used.has(m.id) && hands.length < need) {
          used.add(m.id);
          hands.push(m.id);
        }
      }
      return {
        id: `p${idx}`,
        name: String(it.name).trim().slice(0, 28),
        need,
        note: String(it.note ?? "").trim().slice(0, 32),
        cuft: int(it.cuft, 0, 400, 0),
        kind: KINDS.includes(it.kind) ? it.kind : "other",
        hands,
        loadedAt: hands.length === need ? 1 : 0,
      };
    });
    let stops = P.stops.slice(0, 5).map((x) => ({ time: String(x.time).trim().slice(0, 8), label: String(x.label).trim().slice(0, 14) }));
    if (stops.length < 2) stops = [{ time: "9:00", label: "Start" }, { time: "12:00", label: "Done" }];
    const s: State = {
      title: P.title.trim().slice(0, 60) || "Move-in day",
      sub: P.sub.trim().slice(0, 60),
      stops,
      stage: Math.max(0, Math.min(stops.length - 2, Math.floor(P.stage) || 0)),
      items,
      boxes: { label: P.boxes.label.trim().slice(0, 24), cuft: int(P.boxes.cuft, 0, 400, 0) },
      truckCuft: int(P.truckCuft, 50, 2000, 400),
      after: P.after.trim().slice(0, 40),
      rolledAt: 0,
    };
    return { ...s, rolledAt: allLoaded(s) ? 1 : 0 };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "put" && typeof a.user === "string" && !inChat(ctx, a.user)) return s;
    return step(s, a as unknown as Record<string, unknown>, meta.user, meta.time);
  },

  onMembers: (s, ctx) => {
    if (s.items.every((i) => i.loadedAt > 0 || i.hands.every((u) => inChat(ctx, u)))) return s;
    return { ...s, items: s.items.map((i) => (i.loadedAt > 0 ? i : { ...i, hands: i.hands.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "each person carries one item at most": (s) => {
      const all = s.items.flatMap((i) => i.hands);
      return new Set(all).size === all.length;
    },
    "hands never exceed what an item needs": (s) => s.items.every((i) => i.hands.length <= i.need && i.need >= 1 && i.need <= 4),
    "an item is loaded exactly when it has all its hands": (s) => s.items.every((i) => i.loadedAt > 0 === (i.hands.length === i.need)),
    "people on unloaded items are in the chat": (s, ctx) => s.items.every((i) => i.loadedAt > 0 || i.hands.every((u) => inChat(ctx, u))),
    "the truck rolls exactly when everything is loaded": (s) => s.rolledAt > 0 === allLoaded(s),
    "the truck holds what is loaded": (s) => {
      const loaded = s.items.filter((i) => i.loadedAt > 0).reduce((n, i) => n + i.cuft, 0);
      const total = s.items.reduce((n, i) => n + i.cuft, 0);
      return s.boxes.cuft + loaded <= Math.max(s.truckCuft, s.boxes.cuft + total) && [s.boxes.cuft, ...s.items.map((i) => i.cuft)].every((v) => Number.isInteger(v) && v >= 0);
    },
  },

  transitions: {
    "putting adds that person to that item only": (p, n, a, _m, ctx) => {
      if (a.t !== "put" || p === n) return true;
      const before = p.items.find((i) => i.id === a.item);
      const after = n.items.find((i) => i.id === a.item);
      return !!before && !!after && onItem(p, a.user) === null && inChat(ctx, a.user) && same(after.hands, [...before.hands, a.user]) && othersSame(p, n, a.item);
    },
    "an item loads the moment its last hand arrives": (p, n, a, m) => {
      if (a.t !== "put" || p === n) return true;
      const it = n.items.find((i) => i.id === a.item)!;
      return it.loadedAt === (it.hands.length === it.need ? m.time : 0);
    },
    "stepping off removes only the actor, from an unloaded item": (p, n, a, m) => {
      if (a.t !== "off" || p === n) return true;
      const was = p.items.find((i) => i.hands.includes(m.user));
      return !!was && was.loadedAt === 0 && same(n.items.find((i) => i.id === was.id)!.hands, was.hands.filter((u) => u !== m.user)) && othersSame(p, n, was.id);
    },
    "loaded items never change": (p, n) => p.items.every((i) => i.loadedAt === 0 || same(i, n.items.find((x) => x.id === i.id))),
    "the truck rolls the moment the last item loads": (p, n, _a, m) => n.rolledAt === (allLoaded(n) ? (allLoaded(p) ? p.rolledAt : m.time) : 0),
    "only people in the chat move anyone": (p, n, _a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    const free = ctx.members.filter((m) => !s.items.some((i) => i.hands.includes(m.id)));
    const open = s.items.filter((i) => i.hands.length < i.need);
    if (k < 0.15) return { t: "off" };
    if (open.length && free.length) return { t: "put", user: k < 0.55 && free.some((m) => m.id === user) ? user : r.pick(free).id, item: r.pick(open).id };
    return { t: "off" };
  },

  local: { pick: null },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 24;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const free = members.filter((m) => !onItem(state, m.id)).sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
    const pick = local.pick && free.some((m) => m.id === local.pick) ? local.pick : null;
    const n = state.stops.length;
    const rolled = confirmed.rolledAt > 0;
    const e = rolled ? running(confirmed.rolledAt, ROLL_MS) : null;
    const pos = !rolled ? state.stage : e === null ? state.stage + 1 : state.stage + roll(e);
    const span = W - 36;
    const sx = (k: number) => 18 + (n > 1 ? (k * span) / (n - 1) : 0);
    const truckX = sx(pos);
    const used = state.boxes.cuft + state.items.filter((i) => i.loadedAt > 0).reduce((t, i) => t + i.cuft, 0);
    const barely = used > 0.9 * state.truckCuft;
    const showFaces = Math.max(0, Math.floor((W - 24 - 150) / 44));
    const next = state.stops[state.stage + 1];
    const celebrating = rolled && confirmed.rolledAt > 1 && running(confirmed.rolledAt, 2400) !== null;
    const barColors = [c.series1, c.series4, c.series3];

    const trayTitle = rolled ? "Truck's rolling" : !free.length ? "Everyone's got something" : pick ? "Now tap an item" : "Free hands";
    const traySub = rolled ? state.after : !free.length ? "Loading up" : pick ? "Tap a row with an open spot" : "Tap one, then an item";

    const put = (item: Item, user: string) => {
      const after = step(state, { t: "put", user, item: item.id }, me, 1);
      if (allLoaded(after) && !allLoaded(state) && user === me) haptic("success");
      dispatch({ t: "put", user, item: item.id });
      setLocal({ pick: null });
    };

    const row = (it: Item, idx: number) => {
      const open = it.hands.length < it.need;
      const mineHere = it.hands.includes(me);
      const meFree = !onItem(state, me);
      let label: string | null = null;
      let go: (() => void) | null = null;
      if (pick && open) {
        label = `Put ${nameOf(pick)} on ${it.name}`;
        go = () => put(it, pick);
      } else if (!pick && meFree && open) {
        label = `Carry ${it.name}`;
        go = () => put(it, me);
      } else if (!pick && mineHere && it.loadedAt === 0) {
        label = `Step off ${it.name}`;
        go = () => dispatch({ t: "off" });
      }
      const loaded = it.loadedAt > 0;
      const slots = Array.from({ length: it.need - it.hands.length }, (_, i) => i);
      const body = (
        <>
          <span style={{ position: "relative", width: 44, height: 44, borderRadius: 22, background: c.input, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", color: c.text }}>
            <Glyph kind={it.kind} theme={theme} />
            {loaded ? (
              <span style={{ position: "absolute", right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, background: c.positive, boxShadow: `0 0 0 2px ${c.card}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={c.onPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 6.2 5 8.6 9.5 3.6" />
                </svg>
              </span>
            ) : null}
          </span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{ display: "block", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
            <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 600, color: loaded ? mix(c.positive, c.text, 0.3) : mix(c.negative, c.text, 0.2) }}>{loaded ? "Loaded" : `Needs ${it.need - it.hands.length}`}</span>
              {it.note ? ` · ${it.note}` : ""}
            </span>
          </span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 4 }}>
            {it.hands.map((u) => (
              <span key={u} ref={popRef} style={{ display: "inline-flex" }}>
                <Avatar user={u} size={26} />
              </span>
            ))}
            {slots.map((i) => (
              <span key={`s${i}`} style={{ width: 26, height: 26, borderRadius: 13, border: `1.5px dashed ${pick ? c.primary : c.divider}`, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1, fontWeight: 600, color: c.secondaryText }}>
                +
              </span>
            ))}
          </span>
        </>
      );
      const box = { display: "flex", alignItems: "center", gap: 12, height: 48, width: "100%", boxSizing: "border-box" as const, padding: 0, border: 0, background: "transparent", font: "inherit", color: "inherit" };
      const cl = confirmed.items.find((x) => x.id === it.id)?.loadedAt ?? 0;
      return (
        <Changed key={it.id} at={cl} radius={8}>
          <div style={{ position: "relative" }}>
            {go && label ? (
              <button type="button" aria-label={label} onClick={go} style={{ ...box, cursor: "pointer", textAlign: "left" }}>
                {body}
              </button>
            ) : (
              <div style={box}>{body}</div>
            )}
            {idx < state.items.length - 1 ? <div style={{ position: "absolute", left: 56, right: 0, bottom: 0, height: 1, background: c.divider }} /> : null}
          </div>
        </Changed>
      );
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <div style={{ position: "relative", height: 64 }}>
          <div style={{ position: "absolute", left: 18, right: 18, top: 24, height: 4, borderRadius: 2, background: c.track }} />
          <div style={{ position: "absolute", left: 18, top: 24, height: 4, borderRadius: 2, background: c.primary, width: Math.max(0, truckX - 18) }} />
          <svg width="24" height="14" viewBox="0 0 24 14" aria-hidden="true" style={{ position: "absolute", left: truckX - 12, top: 6 }}>
            <rect x="0" y="0" width="15" height="10" rx="2" fill={c.primary} />
            <rect x="16" y="3" width="7" height="7" rx="1" fill={mix(c.primary, c.text, 0.3)} />
            <circle cx="5" cy="11" r="2.5" fill={c.text} />
            <circle cx="18" cy="11" r="2.5" fill={c.text} />
          </svg>
          {state.stops.map((st, k) => {
            const done = k <= pos + 0.001;
            const x = sx(k);
            const align = k === 0 ? { left: x - 5 } : k === n - 1 ? { right: W - x - 5, textAlign: "right" as const } : { left: x, transform: "translateX(-50%)" };
            return (
              <span key={k}>
                <span style={{ position: "absolute", left: x - 5, top: 21, width: 10, height: 10, borderRadius: 5, background: done ? c.primary : c.card, boxShadow: done ? undefined : `inset 0 0 0 1.5px ${c.divider}` }} />
                <span style={{ position: "absolute", top: 32, ...align, fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap" }}>
                  <span style={{ display: "block", fontWeight: 600, color: done ? c.text : c.secondaryText }}>{st.time}</span>
                  <span style={{ display: "block", color: c.secondaryText }}>{st.label}</span>
                </span>
              </span>
            );
          })}
        </div>
        <div>{state.items.map(row)}</div>
        <div style={{ height: 8 }} />
        <div style={{ background: c.input, borderRadius: 12, padding: "0 12px", height: 62, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trayTitle}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{traySub}</div>
          </div>
          {rolled
            ? null
            : free.slice(0, showFaces).map((m) => {
                const picked = pick === m.id;
                return (
                  <button key={m.id} type="button" aria-pressed={picked} aria-label={`Pick ${m.name}`} onClick={() => setLocal({ pick: picked ? null : m.id })} style={{ width: 44, height: 56, flex: "none", padding: 0, border: 0, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", font: "inherit" }}>
                    <span style={{ display: "inline-flex", borderRadius: 15, boxShadow: picked ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : undefined }}>
                      <Avatar user={m.id} size={30} />
                    </span>
                    <span style={{ fontSize: 12, lineHeight: "16px", maxWidth: 44, color: picked ? c.link : c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.id === me ? "You" : m.name}</span>
                  </button>
                );
              })}
          {!rolled && free.length > showFaces ? <More n={free.length - showFaces} size={30} /> : null}
        </div>
        <div style={{ height: 12 }} />
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, height: 20 }}>
            <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600 }}>Truck space</span>
            <span style={{ fontSize: 13, lineHeight: "16px", color: barely ? mix(c.positive, c.text, 0.3) : c.secondaryText }}>{`${used} of ${state.truckCuft} cu ft${barely ? " · fits, barely" : ""}`}</span>
          </div>
          <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, background: c.track, overflow: "hidden", marginTop: 6 }}>
            <div style={{ width: `${(state.boxes.cuft / state.truckCuft) * 100}%`, background: c.divider, transition: "width .5s cubic-bezier(.2,0,0,1)" }} />
            {state.items.map((it, i) =>
              it.loadedAt > 0 ? <div key={it.id} style={{ width: `${(it.cuft / state.truckCuft) * 100}%`, background: barColors[i % 3], transition: "width .5s cubic-bezier(.2,0,0,1)" }} /> : null,
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[state.boxes.label, ...state.items.filter((i) => i.loadedAt > 0).map((i) => i.name)].filter(Boolean).join(" · ")}
          </div>
        </div>
        {celebrating ? <Toast key={confirmed.rolledAt}>{next ? `Truck's rolling at ${next.time}` : "Truck's rolling"}</Toast> : null}
      </div>
    );
  },
});

function popRef(el: Element | null) {
  if (el) (el as HTMLElement).animate?.([{ scale: "0.2" }, { scale: "1" }], { duration: 350, easing: "cubic-bezier(.34,1.56,.64,1)" });
}

function Glyph({ kind, theme }: { kind: Kind; theme: { color: { text: string; input: string } } }) {
  const f = theme.color.text;
  const bg = theme.color.input;
  let art: Child;
  if (kind === "couch")
    art = (
      <>
        <rect x="4" y="7" width="20" height="8" rx="2.5" fill={f} />
        <rect x="4" y="13" width="20" height="5" rx="1.5" fill={f} />
        <rect x="0.5" y="8.5" width="5" height="11" rx="2" fill={f} />
        <rect x="22.5" y="8.5" width="5" height="11" rx="2" fill={f} />
        <line x1="5" y1="19" x2="5" y2="22" stroke={f} strokeWidth="2" />
        <line x1="23" y1="19" x2="23" y2="22" stroke={f} strokeWidth="2" />
      </>
    );
  else if (kind === "mattress")
    art = (
      <>
        <rect x="1" y="9.5" width="26" height="9" rx="3.5" fill={f} />
        {[7, 14, 21].map((x) => (
          <circle key={x} cx={x} cy="14" r="1.2" fill={bg} />
        ))}
      </>
    );
  else if (kind === "tv")
    art = (
      <>
        <rect x="3" y="5" width="22" height="14" rx="2" fill={f} />
        <line x1="14" y1="19" x2="14" y2="23" stroke={f} strokeWidth="2" />
        <line x1="8" y1="23.5" x2="20" y2="23.5" stroke={f} strokeWidth="2" />
      </>
    );
  else if (kind === "table")
    art = (
      <>
        <rect x="3" y="8" width="22" height="4" rx="1.5" fill={f} />
        <rect x="5" y="12" width="2.5" height="10" fill={f} />
        <rect x="20.5" y="12" width="2.5" height="10" fill={f} />
      </>
    );
  else if (kind === "boxes")
    art = (
      <>
        <rect x="4" y="8" width="20" height="16" rx="1.5" fill={f} />
        <line x1="4" y1="13" x2="24" y2="13" stroke={bg} strokeWidth="1.5" />
      </>
    );
  else art = <circle cx="14" cy="14" r="9" fill={f} />;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      {art}
    </svg>
  );
}
