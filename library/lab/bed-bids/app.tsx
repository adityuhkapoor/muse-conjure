import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  type Child,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Bed bids: the Airbnb has one queen, one double, a couch and an air mattress for six. The floor
// plan with the beds drawn in; every spot has a pillow, and a face goes on the pillow. Better beds
// cost a bit more and the floor costs less, and the total always stays the Airbnb's price. Tap a
// pillow to claim it; lock when everyone has a bed and the lights go out.

type Params = {
  /** "Airbnb in Asheville" */
  place: string;
  totalCents: number;
  /** Beds: kind, how many sleep on it, and what each spot costs above (or below) an even share, in cents */
  beds: { label: string; kind: "queen" | "double" | "couch" | "air" | "twin"; spots: number; premiumCents: number; room: string }[];
  /** Everyone sleeping there */
  crew: string[];
  /** Who already has a spot (bed index), with what they said */
  claimed: { who: string; bed: number; said?: string }[];
};

// @params
const P: Params = {
  place: "the Airbnb",
  totalCents: 61200,
  beds: [
    { label: "Queen", kind: "queen", spots: 2, premiumCents: 1400, room: "Big room" },
    { label: "Double", kind: "double", spots: 2, premiumCents: 0, room: "Small room" },
    { label: "Couch", kind: "couch", spots: 1, premiumCents: -800, room: "Living room" },
    { label: "Air mattress", kind: "air", spots: 1, premiumCents: -2000, room: "Living room" },
  ],
  crew: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  claimed: [
    { who: "Will", bed: 0, said: "i'll throw in $30 for the queen" },
    { who: "Maya", bed: 1 },
    { who: "Tsai Lin", bed: 1, said: "we're sharing, obviously" },
    { who: "Arun", bed: 3, said: "me and the rice cooker are low maintenance" },
  ],
};
// @end params

type BedKind = "queen" | "double" | "couch" | "air" | "twin";
type Bed = { label: string; kind: BedKind; room: string; premium: number; who: string[] };
type Person = { id: string; name: string };
type State = { place: string; total: number; beds: Bed[]; crew: Person[]; said: { who: string; line: string }[]; lockedAt: number; lockedBy: string; moved: { who: string; at: number } };
type Action = { t: "sit"; bed: number; spot: number } | { t: "stand" } | { t: "lock" } | { t: "unlock" };
type Local = { toast: number };

const HOP = spring(springs.iosBouncy);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
const spots = (s: State) => s.beds.reduce((a, b) => a + b.who.length, 0);
/** Price per spot on each bed: an even share plus the bed's premium; spare cents go to the first spots. */
function prices(s: State): number[][] {
  const n = Math.max(1, spots(s));
  const prem = s.beds.reduce((a, b) => a + b.premium * b.who.length, 0);
  const rest = s.total - prem;
  const base = Math.floor(rest / n);
  let extra = rest - base * n;
  return s.beds.map((b) => b.who.map(() => base + b.premium + (extra-- > 0 ? 1 : 0)));
}
const seatOf = (s: State, id: string) => {
  for (let i = 0; i < s.beds.length; i++) {
    const j = s.beds[i]!.who.indexOf(id);
    if (j >= 0) return { bed: i, spot: j };
  }
  return null;
};
const everyoneIn = (s: State) => s.crew.length > 0 && s.crew.every((p) => seatOf(s, p.id) !== null);

function initState(ctx: Ctx): State {
  const resolve = (name: string): Person => {
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    return { id: m ? m.id : name, name: m ? clean(m.name, 20) || name : name };
  };
  const crew: Person[] = [];
  for (const c of Array.isArray(P.crew) ? P.crew : []) {
    const n = clean(c, 20);
    if (!n || crew.length >= 10) continue;
    const p = resolve(n);
    if (!crew.some((x) => x.id === p.id)) crew.push(p);
  }
  const beds: Bed[] = [];
  for (const b of Array.isArray(P.beds) ? P.beds : []) {
    if (beds.length >= 5) break;
    const k = b?.kind;
    const kind: BedKind = k === "queen" || k === "double" || k === "couch" || k === "air" || k === "twin" ? k : "twin";
    const n = Number.isInteger(b.spots) ? Math.max(1, Math.min(3, b.spots)) : 1;
    const premium = Number.isInteger(b.premiumCents) ? Math.max(-50000, Math.min(50000, b.premiumCents)) : 0;
    beds.push({ label: clean(b.label, 14) || "Bed", kind, room: clean(b.room, 16), premium, who: Array.from({ length: n }, () => "") });
  }
  if (!beds.length) beds.push({ label: "Bed", kind: "queen", room: "", premium: 0, who: ["", ""] });
  const said: { who: string; line: string }[] = [];
  for (const c of Array.isArray(P.claimed) ? P.claimed : []) {
    const p = crew.find((x) => same(x.name, clean(c?.who, 20)));
    const b = beds[c?.bed as number];
    if (!p || !b || seatOf({ beds } as State, p.id)) continue;
    const j = b.who.indexOf("");
    if (j < 0) continue;
    b.who[j] = p.id;
    if (c.said) said.push({ who: p.id, line: clean(c.said, 60) });
  }
  const total = Number.isInteger(P.totalCents) && P.totalCents > 0 && P.totalCents < 10_000_000 ? P.totalCents : 60000;
  return { place: clean(P.place, 28) || "the place", total, beds, crew, said, lockedAt: 0, lockedBy: "", moved: { who: "", at: 0 } };
}

function reduceBeds(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
  if (a.t === "sit") {
    if (s.lockedAt) return s;
    const bi = a.bed;
    const sj = a.spot;
    if (typeof bi !== "number" || typeof sj !== "number" || !Number.isInteger(bi) || !Number.isInteger(sj)) return s;
    const bed = s.beds[bi];
    if (!bed || sj < 0 || sj >= bed.who.length || bed.who[sj] !== "") return s;
    const crew = s.crew.some((p) => p.id === u) ? s.crew : s.crew.length >= 10 ? null : [...s.crew, { id: u, name }];
    if (!crew) return s;
    const beds = s.beds.map((b, i) => ({ ...b, who: b.who.map((w, j) => (i === bi && j === sj ? u : w === u ? "" : w)) }));
    return { ...s, crew, beds, moved: { who: u, at: meta.time } };
  }
  if (a.t === "stand") {
    if (s.lockedAt || !seatOf(s, u)) return s;
    return { ...s, beds: s.beds.map((b) => ({ ...b, who: b.who.map((w) => (w === u ? "" : w)) })), moved: { who: u, at: meta.time } };
  }
  if (a.t === "lock") {
    if (s.lockedAt || !everyoneIn(s)) return s;
    return { ...s, lockedAt: meta.time, lockedBy: u };
  }
  if (a.t === "unlock") {
    if (!s.lockedAt || u !== s.lockedBy) return s;
    return { ...s, lockedAt: 0, lockedBy: "" };
  }
  return s;
}

function BedArt(p: { kind: BedKind; x: number; y: number; w: number; h: number; t: Theme; n: number }) {
  const pl = pal(p.t);
  const c = p.t.color;
  const dark = p.t.mode === "dark";
  if (p.kind === "couch")
    return (
      <g>
        <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={10} fill={dark ? mix(pl.green, c.card, 0.35) : mix(pl.green, c.text, 0.1)} />
        <rect x={p.x + 8} y={p.y + 10} width={p.w - 16} height={p.h - 14} rx={6} fill={dark ? mix(pl.green, c.card, 0.15) : mix(pl.green, c.card, 0.3)} />
      </g>
    );
  if (p.kind === "air")
    return (
      <g>
        <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2.6} fill={dark ? mix(pl.blue, c.card, 0.35) : mix(pl.blue, c.card, 0.45)} />
        {Array.from({ length: 5 }, (_, k) => (
          <line key={k} x1={p.x + (p.w * (k + 1)) / 6} y1={p.y + 6} x2={p.x + (p.w * (k + 1)) / 6} y2={p.y + p.h - 6} stroke={mix(pl.blue, c.card, 0.2)} stroke-width={1.5} />
        ))}
      </g>
    );
  const blanket = p.kind === "queen" ? pl.purple : p.kind === "double" ? pl.orange : pl.green;
  return (
    <g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={6} fill={dark ? mix(pl.brown, c.card, 0.2) : pl.brown} />
      <rect x={p.x + 4} y={p.y + p.h * 0.36} width={p.w - 8} height={p.h * 0.6} rx={5} fill={dark ? mix(blanket, c.card, 0.35) : mix(blanket, c.card, 0.25)} />
      <path d={`M ${p.x + 4} ${p.y + p.h * 0.36 + 8} H ${p.x + p.w - 4}`} stroke={mix(blanket, c.card, 0.6)} stroke-width={2} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Bed bids",
  summary: (s) => {
    const free = s.beds.reduce((a, b) => a + b.who.filter((w) => !w).length, 0);
    if (s.lockedAt) return `Beds at ${s.place}: locked, ${money(s.total)} split by bed`;
    return `Beds at ${s.place}: ${spots(s) - free} of ${spots(s)} spots claimed`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceBeds(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "spot prices add up to the total": (s) => prices(s).flat().reduce((a, b) => a + b, 0) === s.total,
    "better beds never cost less": (s) => {
      const p = prices(s);
      return s.beds.every((b, i) => s.beds.every((q, j) => !(b.premium > q.premium) || Math.min(...p[i]!) >= Math.max(...p[j]!) - 1));
    },
    "one spot per person": (s) => {
      const all = s.beds.flatMap((b) => b.who).filter(Boolean);
      return new Set(all).size === all.length;
    },
    "only the crew sleeps here": (s) => s.beds.every((b) => b.who.every((w) => w === "" || s.crew.some((p) => p.id === w))),
    "locked only when everyone has a bed": (s) => s.lockedAt === 0 || everyoneIn(s),
    "a lock names its locker": (s) => (s.lockedAt === 0) === (s.lockedBy === ""),
    "people keep their chat names": (s, ctx) =>
      s.crew.every((p) => {
        const m = ctx.members.find((x) => x.id === p.id);
        return !m || p.name === (clean(m.name, 20) || "Friend") || p.name === m.id;
      }) && s.crew.length <= 10,
  },

  transitions: {
    "sitting puts you on exactly that spot": (p, n, a, m) =>
      a.t !== "sit" || p === n || (p.beds[a.bed]!.who[a.spot] === "" && n.beds[a.bed]!.who[a.spot] === m.user && n.moved.who === m.user && n.moved.at === m.time),
    "sitting moves nobody else": (p, n, a, m) =>
      a.t !== "sit" || p === n || p.beds.every((b, i) => b.who.every((w, j) => w === m.user || w === n.beds[i]!.who[j] || (i === a.bed && j === a.spot))),
    "standing frees only you": (p, n, a, m) =>
      a.t !== "stand" || p === n || (seatOf(n, m.user) === null && n.moved.who === m.user && n.moved.at === m.time && p.beds.every((b, i) => b.who.every((w, j) => w === m.user || n.beds[i]!.who[j] === w))),
    "no moves once locked": (p, n) => p.lockedAt === 0 || n.beds === p.beds,
    "locking stamps the locker": (p, n, a, m) => a.t !== "lock" || p === n || (p.lockedAt === 0 && n.lockedAt === m.time && n.lockedBy === m.user),
    "only the locker unlocks": (p, n, a, m) => a.t !== "unlock" || p === n || (m.user === p.lockedBy && n.lockedAt === 0),
    "the price never changes": (p, n) => p.total === n.total && p.beds.length === n.beds.length && p.beds.every((b, i) => b.premium === n.beds[i]!.premium),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.7) {
      const bi = r.int(s.beds.length);
      return { t: "sit", bed: bi, spot: r.int(s.beds[bi]!.who.length) };
    }
    if (k < 0.8) return { t: "stand" };
    return k < 0.93 ? { t: "lock" } : { t: "unlock" };
  },

  local: { toast: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const font = theme.type.family;
    const pr = prices(state);
    const mine = seatOf(state, me);
    const locked = state.lockedAt > 0;
    const nameOf = (id: string) => state.crew.find((p) => p.id === id)?.name ?? "Someone";

    // Rooms: group beds by room, rooms laid out as a 2-over-1 plan.
    const rooms: string[] = [];
    state.beds.forEach((b) => !rooms.includes(b.room) && rooms.push(b.room));
    const topRooms = rooms.length > 1 ? rooms.slice(0, Math.ceil((rooms.length - 1) / 1) > 2 ? 2 : rooms.length - 1) : rooms;
    const botRooms = rooms.filter((r) => !topRooms.includes(r));
    const rowH = botRooms.length ? [H * 0.52, H * 0.48] : [H, 0];
    const roomBox = new Map<string, { x: number; y: number; w: number; h: number }>();
    topRooms.forEach((r, i) => roomBox.set(r, { x: (W / topRooms.length) * i, y: 0, w: W / topRooms.length, h: rowH[0]! }));
    botRooms.forEach((r, i) => roomBox.set(r, { x: (W / botRooms.length) * i, y: rowH[0]!, w: W / botRooms.length, h: rowH[1]! }));
    const floor = dark ? mix(c.wash, pl.orange, 0.06) : mix(pl.orange, c.card, 0.9);
    const art: Child[] = [];
    const over: Child[] = [];
    rooms.forEach((r) => {
      const b = roomBox.get(r)!;
      art.push(<rect key={`rm${r}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={floor} stroke={c.text} stroke-width={2.5} />);
      over.push(
        <div key={`rl${r}`} style={{ position: "absolute", left: b.x + 6, top: b.y + 4, fontSize: 11, lineHeight: "13px", color: c.secondaryText, whiteSpace: "nowrap", pointerEvents: "none" }}>
          {r}
        </div>,
      );
    });

    state.beds.forEach((bed, bi) => {
      const rb = roomBox.get(bed.room)!;
      const inRoom = state.beds.filter((x) => x.room === bed.room);
      const k = inRoom.indexOf(bed);
      const slotW = rb.w / inRoom.length;
      const n = bed.who.length;
      const bw = Math.min(slotW - 18, bed.kind === "couch" || bed.kind === "air" ? 46 * n + 30 : 48 * n + 12);
      const bh = bed.kind === "couch" ? 40 : bed.kind === "air" ? 38 : Math.min(rb.h - 40, 64);
      const bx = rb.x + slotW * k + (slotW - bw) / 2;
      const by = rb.y + 20 + (rb.h - 26 - bh) / 2;
      art.push(<BedArt key={`b${bi}`} kind={bed.kind} x={bx} y={by} w={bw} h={bh} t={theme} n={n} />);
      const p0 = pr[bi]![0]!;
      const delta = bed.premium;
      over.push(
        <div key={`tag${bi}`} style={{ position: "absolute", left: bx + bw / 2 - 50, width: 100, top: by + bh + 2, textAlign: "center", fontSize: 11, lineHeight: "14px", whiteSpace: "nowrap", color: c.text, pointerEvents: "none" }}>
          <b style={{ fontWeight: 600 }}>{money(p0)}</b>
          <span style={{ color: delta > 0 ? mix(c.negative, c.text, 0.3) : delta < 0 ? mix(c.positive, c.text, 0.3) : c.secondaryText }}>{delta > 0 ? ` +${money(delta)}` : delta < 0 ? ` −${money(-delta)}` : " even"}</span>
        </div>,
      );
      bed.who.forEach((w, j) => {
        const cx = bx + (bw * (j + 0.5)) / n;
        const cy = bed.kind === "couch" || bed.kind === "air" ? by + bh / 2 : by + 14;
        art.push(
          w ? (
            <ellipse key={`pw${bi}-${j}`} cx={cx} cy={cy} rx={17} ry={11} fill={pl.paper} stroke={c.divider} stroke-width={1} />
          ) : (
            <ellipse key={`pw${bi}-${j}`} cx={cx} cy={cy} rx={17} ry={11} fill={dark ? mix(pl.paper, c.card, 0.5) : pl.paper} stroke={c.secondaryText} stroke-width={1.5} stroke-dasharray="3 3" />
          ),
        );
        const hop = w && state.moved.who === w && state.moved.at > 0 ? running(state.moved.at, 700) : null;
        const lift = hop === null ? 0 : -14 * (1 - Math.min(1, HOP(hop)));
        const isMe = w === me;
        const canTap = !locked && (!w || isMe);
        over.push(
          <button
            key={`s${bi}-${j}`}
            type="button"
            aria-label={w ? (isMe ? `You, on the ${bed.label}. Get up` : `${nameOf(w)}, on the ${bed.label}`) : `Claim a spot on the ${bed.label}, ${money(pr[bi]![j]!)}`}
            {...(canTap ? { onClick: () => { dispatch(w ? { t: "stand" } : { t: "sit", bed: bi, spot: j }); haptic("light"); } } : {})}
            style={{ position: "absolute", left: cx - 22, top: cy - 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: canTap ? "pointer" : "default" }}
          >
            {w ? (
              <span style={{ display: "flex", transform: `translateY(${lift}px)`, borderRadius: 99, boxShadow: isMe ? `0 0 0 2px ${c.primary}` : "none" }}>
                <Avatar user={{ id: w, name: nameOf(w) }} size={24} />
              </span>
            ) : (
              <span style={{ fontSize: 16, lineHeight: "16px", fontWeight: 700, color: c.secondaryText }}>+</span>
            )}
          </button>,
        );
      });
    });

    // Lights out once locked
    const dim = locked ? Math.min(1, (running(state.lockedAt, 900) ?? 900) / 900) : 0;
    if (dim > 0) {
      art.push(<rect key="night" x={0} y={0} width={W} height={H} fill={dark ? c.wash : mix(pl.blue, c.text, 0.82)} opacity={0.5 * dim} />);
      art.push(
        <text key="z" x={W - 64} y={36 - 8 * dim} font-size={18} font-weight={700} fill={pl.yellow} opacity={dim} font-family={font}>
          z z z
        </text>,
      );
    }

    const lastSaid = state.said.find((x) => /\$/.test(x.line)) ?? state.said[state.said.length - 1];
    const myPrice = mine ? pr[mine.bed]![mine.spot]! : 0;
    const free = state.crew.filter((p) => !seatOf(state, p.id));

    return (
      <div>
        <CardHeader title="Who sleeps where" subtitle={`${state.place} · ${money(state.total)} for ${spots(state)} · better beds cost more`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Floor plan with ${state.beds.length} beds, ${spots(state) - state.beds.reduce((a, b) => a + b.who.filter((w) => !w).length, 0)} of ${spots(state)} spots claimed`} style={{ display: "block" }}>
            {art}
          </svg>
          {over}
        </div>
        <div style={{ marginTop: 8, minHeight: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden" }}>
          {locked ? (
            <span>{`Lights out · ${state.crew.length} beds locked`}</span>
          ) : state.moved.at > 0 ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{free.length ? `Still on the floor: ${free.map((p) => (p.id === me ? "you" : p.name)).join(", ")}` : "Everyone has a bed"}</span>
          ) : lastSaid ? (
            <>
              <Avatar user={{ id: lastSaid.who, name: nameOf(lastSaid.who) }} size={20} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${lastSaid.line}"`}</span>
            </>
          ) : (
            <span>Tap a pillow to claim it</span>
          )}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {mine ? `You: ${state.beds[mine.bed]!.label.toLowerCase()} · ${money(myPrice)}` : locked ? "" : "Tap a pillow"}
          </span>
          {locked ? (
            state.lockedBy === me ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unlock" })}>
                Unlock
              </Button>
            ) : null
          ) : (
            <Button
              kind="primary"
              disabled={!everyoneIn(state)}
              onClick={() => {
                dispatch({ t: "lock" });
                haptic("success");
                setLocal({ toast: local.toast + 1 });
              }}
            >
              {everyoneIn(state) ? "Lock beds" : `${free.length} need a bed`}
            </Button>
          )}
        </div>
        {local.toast > 0 && locked ? <Toast key={local.toast}>Beds locked · lights out</Toast> : null}
      </div>
    );
  },
});
