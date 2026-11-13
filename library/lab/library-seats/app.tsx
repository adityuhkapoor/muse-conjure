import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, clock, haptic, innerWidth, mix, pal, running, tween, type Ctx } from "@muse/app";

// Library seats: "is there any space up there" answered with the floor plan. Window carrels, the
// long table and the round tables from above; empty seats glow, strangers' seats hold a laptop,
// friends sit as faces, and a table that's full goes dark. Tap a glowing seat to sit (or let it
// find you one near friends); once you're in, save the next seat for a friend for 15 minutes.

type Kind = "carrels" | "long" | "round";
type Params = {
  /** Card title */
  title: string;
  /** Group or place, e.g. 'Fenwick 3rd floor regulars' */
  place: string;
  /** Up to 4 tables: name, kind, seats, and how many seats strangers have */
  tables: { name: string; kind: Kind; seats: number; strangers?: number }[];
  /** Friends already here: name, table name, what they said */
  here: { name: string; table: string; said?: string }[];
  /** A seat being saved: who saved it, for whom, at which table, minutes left */
  saving?: { by: string; for: string; table: string; minutesLeft: number };
};

// @params
const P: Params = {
  title: "Library seats",
  place: "Fenwick 3rd floor regulars",
  tables: [
    { name: "Window carrels", kind: "carrels", seats: 4, strangers: 2 },
    { name: "Long table", kind: "long", seats: 8, strangers: 3 },
    { name: "Round table", kind: "round", seats: 4, strangers: 2 },
    { name: "Round by the stairs", kind: "round", seats: 4, strangers: 4 },
  ],
  here: [
    { name: "Tsai Lin", table: "Long table", said: "long table, no aux allowed, it's perfect" },
    { name: "Arun", table: "Window carrels", said: "they said no rice cooker. I asked" },
    { name: "Will", table: "Round table" },
  ],
  saving: { by: "Will", for: "Calvin", table: "Round table", minutesLeft: 11 },
};
// @end params

type Table = { name: string; kind: Kind; seats: number };
type Occ = { who: string; at: number };
type Hold = { seat: number; by: string; for: string; at: number; left: number };
type State = { title: string; place: string; tables: Table[]; seats: (Occ | null)[]; holds: Hold[]; said: { [u: string]: string } };
type Action = { t: "sit"; seat: number } | { t: "leave" } | { t: "hold"; seat: number; for: string } | { t: "unhold" };
type Local = { sel: number; for: string };

const HOLD = 15 * 60_000;
const STRANGER = "x";
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const LIMITS: Record<Kind, [number, number]> = { carrels: [2, 5], long: [4, 10], round: [2, 6] };
const seatOf = (s: State, u: string) => s.seats.findIndex((x) => x !== null && x.who === u);
const live = (h: Hold, now: number) => h.at === 0 || now <= h.at + HOLD;
const holdOn = (s: State, seat: number, now: number) => s.holds.find((h) => h.seat === seat && live(h, now));
const tableOf = (s: State, seat: number) => {
  let k = 0;
  for (let t = 0; t < s.tables.length; t++) {
    k += s.tables[t]!.seats;
    if (seat < k) return t;
  }
  return -1;
};
const startOf = (s: State, t: number) => s.tables.slice(0, t).reduce((a, x) => a + x.seats, 0);
const pulse = tween({ duration: 500, easing: [0.34, 1.56, 0.64, 1] });

function initState(ctx: Ctx): State {
  const tables: Table[] = [];
  const strangers: number[] = [];
  for (const t of Array.isArray(P.tables) ? P.tables : []) {
    const name = clean(t?.name, 24);
    if (!name || tables.length >= 4) continue;
    const kind: Kind = t.kind === "carrels" || t.kind === "long" || t.kind === "round" ? t.kind : "round";
    const [lo, hi] = LIMITS[kind];
    const seats = isInt(t.seats, lo, hi) ? t.seats : lo;
    tables.push({ name, kind, seats });
    strangers.push(isInt(t.strangers, 0, seats) ? t.strangers : 0);
  }
  if (!tables.length) {
    tables.push({ name: "Long table", kind: "long", seats: 6 });
    strangers.push(0);
  }
  const seats: (Occ | null)[] = tables.flatMap((t) => Array.from({ length: t.seats }, () => null as Occ | null));
  const base: State = { title: clean(P.title, 40) || "Library seats", place: clean(P.place, 40), tables, seats, holds: [], said: {} };
  const find = (nm: unknown) => {
    const n = clean(nm, 40).toLowerCase();
    return n ? ctx.members.find((m) => m.id === nm || m.name.toLowerCase() === n) : undefined;
  };
  const tIdx = (nm: unknown) => tables.findIndex((t) => t.name.toLowerCase() === clean(nm, 24).toLowerCase());
  const free = (t: number) => {
    const a = startOf(base, t);
    for (let k = 0; k < tables[t]!.seats; k++) if (seats[a + k] === null) return a + k;
    return -1;
  };
  for (const h of Array.isArray(P.here) ? P.here : []) {
    const m = find(h?.name);
    const t = tIdx(h?.table);
    if (!m || t < 0 || seats.some((x) => x?.who === m.id)) continue;
    const k = free(t);
    if (k < 0) continue;
    seats[k] = { who: m.id, at: 0 };
    const q = clean(h.said, 70);
    if (q) base.said[m.id] = q;
  }
  const holds: Hold[] = [];
  const sv = P.saving;
  if (sv) {
    const by = find(sv.by), fr = find(sv.for), t = tIdx(sv.table);
    if (by && fr && by.id !== fr.id && seats.some((x) => x?.who === by.id) && !seats.some((x) => x?.who === fr.id) && t >= 0) {
      const k = free(t);
      if (k >= 0) holds.push({ seat: k, by: by.id, for: fr.id, at: 0, left: isInt(sv.minutesLeft, 1, 15) ? sv.minutesLeft : 15 });
    }
  }
  // Strangers fill from the far end of each table, leaving room next to friends.
  tables.forEach((t, ti) => {
    const a = startOf(base, ti);
    let n = strangers[ti]!;
    for (let k = t.seats - 1; k >= 0 && n > 0; k--) {
      if (seats[a + k] === null && !holds.some((h) => h.seat === a + k)) {
        seats[a + k] = { who: STRANGER, at: 0 };
        n--;
      }
    }
  });
  return { ...base, seats, holds };
}

// Seat and table geometry for a W x H plan.
type Geo = { seats: { x: number; y: number; t: number }[]; shapes: { t: number; kind: Kind; x: number; y: number; w: number; h: number }[]; shelf: number };
function geometry(s: State, W: number, H: number): Geo {
  const shelf = W < 340 ? 44 : 64;
  const seats: Geo["seats"] = [];
  const shapes: Geo["shapes"] = [];
  const left = shelf + 18;
  const rx = W - 46;
  const slots = [
    { x: left, y: 14, w: W - left - 10, h: 40 },
    { x: left, y: 76, w: W * 0.6 - left, h: 100 },
    { x: W * 0.6 + 8, y: 66, w: W * 0.4 - 16, h: 64 },
    { x: W * 0.6 + 8, y: 136, w: W * 0.4 - 16, h: 64 },
  ];
  s.tables.forEach((t, ti) => {
    const sl = slots[ti]!;
    if (t.kind === "carrels") {
      const step = sl.w / t.seats;
      for (let k = 0; k < t.seats; k++) {
        const cx = sl.x + step * (k + 0.5);
        shapes.push({ t: ti, kind: "carrels", x: cx - step / 2 + 4, y: sl.y, w: step - 8, h: 14 });
        seats.push({ x: cx, y: sl.y + 30, t: ti });
      }
    } else if (t.kind === "long") {
      const top = Math.ceil(t.seats / 2), bot = t.seats - top;
      const tw = sl.w - 8, th = 30;
      const ty = sl.y + sl.h / 2 - th / 2;
      shapes.push({ t: ti, kind: "long", x: sl.x + 4, y: ty, w: tw, h: th });
      for (let k = 0; k < top; k++) seats.push({ x: sl.x + 4 + (tw * (k + 0.5)) / top, y: ty - 16, t: ti });
      for (let k = 0; k < bot; k++) seats.push({ x: sl.x + 4 + (tw * (k + 0.5)) / bot, y: ty + th + 16, t: ti });
    } else {
      const cx = Math.min(sl.x + sl.w / 2, rx), cy = sl.y + sl.h / 2;
      const r = 16;
      shapes.push({ t: ti, kind: "round", x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
      for (let k = 0; k < t.seats; k++) {
        const a = -Math.PI / 2 + Math.PI / t.seats + (k / t.seats) * Math.PI * 2;
        seats.push({ x: cx + Math.cos(a) * (r + 14), y: cy + Math.sin(a) * (r + 13), t: ti });
      }
    }
  });
  return { seats, shapes, shelf };
}

export default defineApp<State, Action, Local>({
  name: "Library seats",
  summary: (s) => {
    const free = s.seats.filter((x, j) => x === null && !s.holds.some((h) => h.seat === j)).length;
    const friends = s.seats.filter((x) => x && x.who !== STRANGER).length;
    return `${s.place || s.title}: ${free} of ${s.seats.length} seats free · ${friends} of us here`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    const now = m.time;
    const mine = seatOf(s, u);
    if (a.t === "sit") {
      if (!isInt(a.seat, 0, s.seats.length - 1) || s.seats[a.seat] !== null) return s;
      const h = holdOn(s, a.seat, now);
      if (h && h.for !== u) return s;
      const seats = s.seats.map((x, j) => (j === a.seat ? { who: u, at: m.time } : j === mine ? null : x));
      return { ...s, seats, holds: s.holds.filter((x) => x.seat !== a.seat && x.by !== u && x.for !== u) };
    }
    if (a.t === "leave") {
      if (mine < 0) return s;
      return { ...s, seats: s.seats.map((x, j) => (j === mine ? null : x)), holds: s.holds.filter((x) => x.by !== u) };
    }
    if (a.t === "hold") {
      if (mine < 0 || !isInt(a.seat, 0, s.seats.length - 1) || s.seats[a.seat] !== null || holdOn(s, a.seat, now)) return s;
      if (typeof a.for !== "string" || a.for === u || !inChat(ctx, a.for) || seatOf(s, a.for) >= 0) return s;
      const holds = s.holds.filter((x) => x.by !== u && x.for !== a.for && x.seat !== a.seat && live(x, now));
      return { ...s, holds: [...holds, { seat: a.seat, by: u, for: a.for, at: m.time, left: 15 }] };
    }
    if (a.t === "unhold") {
      if (!s.holds.some((x) => x.by === u)) return s;
      return { ...s, holds: s.holds.filter((x) => x.by !== u) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => u !== STRANGER && !inChat(ctx, u);
    if (!s.seats.some((x) => x && gone(x.who)) && !s.holds.some((h) => gone(h.by) || gone(h.for))) return s;
    return { ...s, seats: s.seats.map((x) => (x && gone(x.who) ? null : x)), holds: s.holds.filter((h) => !gone(h.by) && !gone(h.for)) };
  },

  invariants: {
    "one seat per person": (s) => {
      const w = s.seats.flatMap((x) => (x && x.who !== STRANGER ? [x.who] : []));
      return new Set(w).size === w.length;
    },
    "seats match the tables": (s) => s.seats.length === s.tables.reduce((a, t) => a + t.seats, 0),
    "people seated are in the chat": (s, ctx) => s.seats.every((x) => x === null || x.who === STRANGER || inChat(ctx, x.who)),
    "holds are on empty seats, by someone seated, for someone standing": (s) =>
      s.holds.every((h) => isInt(h.seat, 0, s.seats.length - 1) && s.seats[h.seat] === null && seatOf(s, h.by) >= 0 && seatOf(s, h.for) < 0 && h.by !== h.for),
    "one hold per saver and per seat": (s) => new Set(s.holds.map((h) => h.by)).size === s.holds.length && new Set(s.holds.map((h) => h.seat)).size === s.holds.length,
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "strangers never move": (p, n) => p.seats.every((x, j) => (x?.who === STRANGER) === (n.seats[j]?.who === STRANGER)),
    "sitting puts the actor in that seat only": (p, n, a, m) => {
      if (a.t !== "sit" || p === n) return true;
      const t = n.seats[a.seat];
      const old = seatOf(p, m.user);
      return !!t && t.who === m.user && t.at === m.time && p.seats[a.seat] === null && n.seats.every((x, j) => j === a.seat || j === old || x === p.seats[j]);
    },
    "a free unsaved seat is never refused": (p, n, a, m, ctx) =>
      a.t !== "sit" || p !== n || !(inChat(ctx, m.user) && isInt(a.seat, 0, p.seats.length - 1) && p.seats[a.seat] === null && !holdOn(p, a.seat, m.time)),
    "a saved seat goes only to the friend": (p, n, a, m) => a.t !== "sit" || p === n || !holdOn(p, a.seat, m.time) || holdOn(p, a.seat, m.time)!.for === m.user,
    "leaving frees only the actor": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const old = seatOf(p, m.user);
      return old >= 0 && n.seats[old] === null && seatOf(n, m.user) < 0 && n.seats.every((x, j) => j === old || x === p.seats[j]);
    },
    "saving records the actor and the friend": (p, n, a, m) => {
      if (a.t !== "hold" || p === n) return true;
      const h = n.holds.find((x) => x.by === m.user);
      return !!h && h.seat === a.seat && h.for === a.for && h.at === m.time && JSON.stringify(n.seats) === JSON.stringify(p.seats);
    },
    "unsaving removes only the actor's hold": (p, n, a, m) => a.t !== "unhold" || p === n || (!n.holds.some((x) => x.by === m.user) && n.holds.length === p.holds.length - 1),
  },

  arbitrary: (s, u, r, ctx) => {
    const k = r.next();
    const free = s.seats.map((x, j) => (x ? -1 : j)).filter((j) => j >= 0);
    const seat = free.length ? r.pick(free) : r.int(s.seats.length);
    if (seatOf(s, u) >= 0) {
      if (k < 0.15) return { t: "leave" };
      if (k < 0.2) return { t: "unhold" };
      if (k < 0.6) {
        const others = ctx.members.filter((m) => m.id !== u && seatOf(s, m.id) < 0);
        if (others.length) return { t: "hold", seat, for: r.pick(others).id };
      }
    }
    const held = s.holds.find((h) => h.for === u);
    return { t: "sit", seat: held && k < 0.5 ? held.seat : seat };
  },

  local: { sel: -1, for: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = 210;
    const g = geometry(state, W, H);
    const hasLive = state.holds.some((h) => h.at > 0);
    const now = hasLive ? clock.value : 0;
    const liveHolds = state.holds.filter((h) => h.at === 0 || now <= h.at + HOLD);
    const holdAt = (j: number) => liveHolds.find((h) => h.seat === j);
    const mine = seatOf(state, me);
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? "Someone"));
    const first = nameOf;
    const tableFull = (t: number) => {
      const a = startOf(state, t);
      return state.seats.slice(a, a + state.tables[t]!.seats).every((x, k) => x !== null || !!holdAt(a + k));
    };
    const freeSeats = state.seats.map((x, j) => (x === null && !holdAt(j) ? j : -1)).filter((j) => j >= 0);
    const sel = local.sel >= 0 && local.sel < state.seats.length ? local.sel : -1;
    // "Find me one": the free seat at the table with the most friends, else any.
    const best = (() => {
      let bestJ = -1, bestN = -1;
      for (const j of freeSeats) {
        const t = tableOf(state, j);
        const a = startOf(state, t);
        const n = state.seats.slice(a, a + state.tables[t]!.seats).filter((x) => x && x.who !== STRANGER && x.who !== me).length;
        if (n > bestN) [bestJ, bestN] = [j, n];
      }
      return bestJ;
    })();
    const forMe = liveHolds.find((h) => h.for === me);
    const wood = mix(p.crust, c.card, 0.35);
    const carpet = mix(p.sky, c.card, theme.mode === "dark" ? 0.55 : 0.45);

    const books = (() => {
      const out: { x: number; y: number; w: number; h: number; c: string }[] = [];
      const hues = [p.red, p.blue, p.green, p.yellow, p.purple, p.orange];
      for (let row = 0; row < 5; row++) {
        let x = 10;
        let k = row * 7;
        while (x < g.shelf - 4) {
          const w = 4 + ((k * 7) % 4);
          out.push({ x, y: 18 + row * 38, w: Math.min(w, g.shelf - 4 - x), h: 22 + ((k * 5) % 7), c: hues[k % hues.length]! });
          x += w + 1;
          k++;
        }
      }
      return out;
    })();

    const plan = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Floor plan: ${freeSeats.length} of ${state.seats.length} seats free`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={12} fill={carpet} />
        <rect x={g.shelf + 18} y={2} width={W - g.shelf - 28} height={6} rx={3} fill={mix(p.sky, p.blue, 0.4)} />
        <rect x={6} y={8} width={g.shelf} height={H - 16} rx={4} fill={mix(p.brown, c.card, 0.15)} />
        {Array.from({ length: 5 }, (_v, row) => <rect key={`sh${row}`} x={6} y={42 + row * 38} width={g.shelf} height={3} fill={p.brown} />)}
        {books.map((b, j) => <rect key={`bk${j}`} x={b.x} y={b.y + (24 - b.h)} width={b.w} height={b.h} rx={1} fill={b.c} />)}
        {g.shapes.map((sh, j) => {
          const dark = tableFull(sh.t);
          const fill = dark ? mix(wood, p.dark, 0.45) : wood;
          return sh.kind === "round" ? (
            <circle key={`t${j}`} cx={sh.x + sh.w / 2} cy={sh.y + sh.h / 2} r={sh.w / 2} fill={fill} />
          ) : (
            <rect key={`t${j}`} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.kind === "long" ? 6 : 3} fill={fill} />
          );
        })}
        {g.seats.map((st, j) => {
          const o = state.seats[j];
          const h = holdAt(j);
          if (o && o.who === STRANGER)
            return (
              <g key={`x${j}`}>
                <circle cx={st.x} cy={st.y} r={9} fill={mix(c.secondaryText, carpet, 0.35)} />
                <rect x={st.x - 6} y={st.y - 4} width={12} height={8} rx={1.5} fill={mix(p.soft, c.card, 0.5)} />
              </g>
            );
          if (o || h) return null;
          return <circle key={`e${j}`} cx={st.x} cy={st.y} r={9} fill={mix(p.yellow, c.card, 0.35)} stroke={p.yellow} stroke-width={2} class="ls-glow" />;
        })}
      </svg>
    );

    const faces = g.seats.map((st, j) => {
      const o = state.seats[j];
      const h = holdAt(j);
      const on = sel === j;
      if (o && o.who !== STRANGER) {
        const e = o.at > 0 ? running(o.at, 500) : null;
        return (
          <span key={`f${o.who}`} style={{ position: "absolute", left: st.x - 11, top: st.y - 11, display: "flex", borderRadius: 99, transform: `scale(${e === null ? 1 : 0.5 + 0.5 * pulse(e)})`, boxShadow: o.who === me ? `0 0 0 2px ${c.primary}` : `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
            <Avatar user={o.who} size={22} />
          </span>
        );
      }
      if (h) {
        const frac = h.at === 0 ? h.left / 15 : Math.max(0, (h.at + HOLD - now) / HOLD);
        const circ = 2 * Math.PI * 12;
        return (
          <span key={`h${j}`} style={{ position: "absolute", left: st.x - 14, top: st.y - 14, width: 28, height: 28, pointerEvents: "none" }}>
            <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
              <circle cx={14} cy={14} r={12} fill="none" stroke={mix(c.primary, c.card, 0.6)} stroke-width={2.5} stroke-dasharray="3 2.5" />
              <circle cx={14} cy={14} r={12} fill="none" stroke={c.primary} stroke-width={2.5} stroke-dasharray={`${frac * circ} ${circ}`} transform="rotate(-90 14 14)" />
            </svg>
            <span style={{ position: "absolute", left: 5, top: 5, display: "flex", filter: "grayscale(0.6) opacity(0.75)" }}><Avatar user={h.for} size={18} /></span>
          </span>
        );
      }
      if (o) return null;
      return (
        <button key={`b${j}`} type="button" aria-label={`Free seat at ${state.tables[st.t]!.name}`} aria-pressed={on ? "true" : "false"}
          onClick={() => { setLocal({ sel: j }); haptic("light"); }}
          class="ls-hit" style={{ position: "absolute", left: st.x - 12, top: st.y - 12, width: 24, height: 24, padding: 0, border: 0, borderRadius: 12, background: "transparent", cursor: "pointer", boxShadow: on ? `0 0 0 2.5px ${c.primary}` : "none" }} />
      );
    });

    // Panel
    const friendsStanding = members.filter((m) => m.id !== me && seatOf(state, m.id) < 0 && !liveHolds.some((h) => h.for === m.id));
    const pick = friendsStanding.find((m) => m.id === local.for)?.id ?? friendsStanding[0]?.id ?? "";
    const selFree = sel >= 0 && state.seats[sel] === null && !holdAt(sel);
    let line1: string;
    let line2: unknown;
    let act: unknown;
    if (forMe && mine < 0) {
      line1 = `${first(forMe.by)} saved you a seat`;
      line2 = `${state.tables[tableOf(state, forMe.seat)]!.name} · ${forMe.at === 0 ? forMe.left : Math.max(1, Math.ceil((forMe.at + HOLD - now) / 60000))} min left`;
      act = <Button kind="primary" onClick={() => { dispatch({ t: "sit", seat: forMe.seat }); haptic("success"); }}>Take it</Button>;
    } else if (selFree) {
      const t = state.tables[tableOf(state, sel)]!;
      line1 = `${mine >= 0 ? "Free seat" : "Sit"} at the ${t.name.toLowerCase()}`;
      line2 = mine >= 0 && friendsStanding.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>Save for</span>
          {friendsStanding.slice(0, 4).map((m) => (
            <button key={m.id} type="button" aria-label={`Save for ${m.name}`} aria-pressed={pick === m.id ? "true" : "false"} onClick={() => setLocal({ for: m.id })}
              class="ls-hit" style={{ position: "relative", width: 26, height: 26, padding: 2, border: 0, borderRadius: 13, background: "transparent", cursor: "pointer", boxShadow: pick === m.id ? `0 0 0 2px ${c.primary}` : "none", display: "flex" }}>
              <Avatar user={m.id} size={22} />
            </button>
          ))}
        </div>
      ) : `${freeSeats.length} free on the floor`;
      act = mine >= 0 ? (
        <div style={{ display: "flex", gap: 6 }}>
          {pick ? <Button kind="secondary" onClick={() => { dispatch({ t: "hold", seat: sel, for: pick }); haptic("light"); setLocal({ sel: -1 }); }}>Save it</Button> : null}
          <Button kind="primary" onClick={() => { dispatch({ t: "sit", seat: sel }); setLocal({ sel: -1 }); haptic("light"); }}>Move</Button>
        </div>
      ) : (
        <Button kind="primary" onClick={() => { dispatch({ t: "sit", seat: sel }); setLocal({ sel: -1 }); haptic("success"); }}>Sit here</Button>
      );
    } else if (mine >= 0) {
      const t = tableOf(state, mine);
      const a = startOf(state, t);
      const near = state.seats.slice(a, a + state.tables[t]!.seats).filter((x) => x && x.who !== STRANGER && x.who !== me).map((x) => x!.who);
      const myHold = liveHolds.find((h) => h.by === me);
      line1 = `You're at the ${state.tables[t]!.name.toLowerCase()}`;
      line2 = myHold ? `Saving one for ${first(myHold.for)}` : near.length ? `Next to ${near.map(first).join(", ")}` : "Tap a glowing seat to save it for a friend";
      act = myHold ? <Button kind="deemphasized" onClick={() => dispatch({ t: "unhold" })}>Unsave</Button> : <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>Leave</Button>;
    } else {
      line1 = freeSeats.length ? `${freeSeats.length} of ${state.seats.length} seats free` : "Every seat is taken";
      line2 = freeSeats.length ? "Glowing seats are open · tap one" : "Try again in a bit";
      act = best >= 0 ? <Button kind="primary" onClick={() => { dispatch({ t: "sit", seat: best }); haptic("success"); }}>Find me one</Button> : null;
    }

    const here = members.filter((m) => seatOf(state, m.id) >= 0).map((m) => m.id);
    const quoted = [...here].reverse().find((u) => state.said[u] && u !== me);
    const myAt = confirmed.seats.find((x) => x?.who === me)?.at ?? 0;
    const toast = myAt > 0 && running(myAt, 2400) !== null ? myAt : null;
    const myTable = mine >= 0 ? state.tables[tableOf(state, mine)]!.name.toLowerCase() : "";

    return (
      <div>
        <style>{".ls-glow{animation:lsGlow 1.4s ease-in-out infinite alternate}@keyframes lsGlow{from{stroke-opacity:1}to{stroke-opacity:.3}}.ls-hit::after{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}@media (prefers-reduced-motion:reduce){.ls-glow{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.place, `${freeSeats.length} free`].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          {plan}
          {faces}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 50, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
            {typeof line2 === "string" ? <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</div> : (line2 as never)}
          </div>
          {act ? <div style={{ flexShrink: 0 }}>{act as never}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {here.length ? <Facepile users={here} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${first(quoted)}: "${state.said[quoted]}"` : here.length ? `${here.length} of us up here` : "Nobody from here is up there yet"}
          </span>
        </div>
        {toast ? <Toast key={toast}>{`You're at the ${myTable}`}</Toast> : null}
      </div>
    );
  },
});
