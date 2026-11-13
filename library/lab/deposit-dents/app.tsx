import {
  defineApp,
  Avatar,
  Facepile,
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

// Deposit dents: the landlord kept part of the deposit. The apartment's floor plan with each charge
// marked where it happened; tap a mark, then tap whose it is (or "shared"). Faces under the plan
// carry each roommate's running total; when every mark has an owner, lock it and the requests go out.

type Params = {
  home: string;
  /** What the landlord kept, in cents (should equal the charges) */
  keptCents: number;
  /** Rooms of the plan: bedrooms (with whose), a bath, the living room, the kitchen */
  rooms: { name: string; kind: "bed" | "bath" | "living" | "kitchen"; who?: string }[];
  roommates: string[];
  /** Each charge: which room (by name), and who already claimed it, if anyone, with what they said */
  charges: { label: string; cents: number; room: string; owner?: string; by?: string; said?: string }[];
};

// @params
const P: Params = {
  home: "412 Pine",
  keptCents: 34000,
  rooms: [
    { name: "Aditya", kind: "bed", who: "Aditya" },
    { name: "Calvin", kind: "bed", who: "Calvin" },
    { name: "Bath", kind: "bath" },
    { name: "Arun", kind: "bed", who: "Arun" },
    { name: "Will", kind: "bed", who: "Will" },
    { name: "Living room", kind: "living" },
    { name: "Kitchen", kind: "kitchen" },
  ],
  roommates: ["Aditya", "Calvin", "Arun", "Will"],
  charges: [
    { label: "Wall dent", cents: 12000, room: "Living room" },
    { label: "Burned counter", cents: 16000, room: "Kitchen", owner: "Arun", by: "Calvin", said: "it was the rice cooker. everyone knows" },
    { label: "Missing blind", cents: 6000, room: "Calvin" },
  ],
};
// @end params

type Kind = "dent" | "burn" | "blind" | "stain";
type Room = { name: string; kind: "bed" | "bath" | "living" | "kitchen"; who: string };
type Mate = { id: string; name: string };
type Charge = { id: string; label: string; cents: number; room: number; kind: Kind; owner: string; by: string; at: number; said: string };
type State = { home: string; rooms: Room[]; mates: Mate[]; charges: Charge[]; lockedAt: number; lockedBy: string };
type Action = { t: "assign"; charge: string; owner: string } | { t: "lock" } | { t: "unlock" };
type Local = { sel: string; toast: number };

const SHARED = "shared";
const POP = spring(springs.iosBouncy);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
const kindOf = (l: string): Kind => (/dent|hole|wall|scuff/i.test(l) ? "dent" : /burn|scorch|counter|stove/i.test(l) ? "burn" : /blind|window|curtain|screen/i.test(l) ? "blind" : "stain");
const allOwned = (s: State) => s.charges.every((c) => c.owner !== "");
const keptTotal = (s: State) => s.charges.reduce((a, c) => a + c.cents, 0);

/** Each roommate's total: what they own plus an even cut of the shared ones (spare cents to the first listed). */
function totals(s: State): number[] {
  const n = Math.max(1, s.mates.length);
  const shared = s.charges.filter((c) => c.owner === SHARED).reduce((a, c) => a + c.cents, 0);
  return s.mates.map((m, i) => s.charges.filter((c) => c.owner === m.id).reduce((a, c) => a + c.cents, 0) + Math.floor(shared / n) + (i < shared % n ? 1 : 0));
}

function initState(ctx: Ctx): State {
  const resolve = (name: string) => {
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    return { id: m ? m.id : name, name: m ? clean(m.name, 20) || name : name };
  };
  const mates: Mate[] = [];
  for (const r of Array.isArray(P.roommates) ? P.roommates : []) {
    const n = clean(r, 20);
    if (!n || mates.length >= 6) continue;
    const p = resolve(n);
    if (!mates.some((m) => m.id === p.id)) mates.push(p);
  }
  if (mates.length < 2) for (const m of ctx.members) if (mates.length < 6 && !mates.some((x) => x.id === m.id)) mates.push({ id: m.id, name: clean(m.name, 20) || "Roommate" });
  while (mates.length < 2) mates.push({ id: `Roommate ${mates.length + 1}`, name: `Roommate ${mates.length + 1}` });
  const rooms: Room[] = [];
  for (const r of Array.isArray(P.rooms) ? P.rooms : []) {
    const name = clean(r?.name, 14);
    if (!name || rooms.length >= 8) continue;
    const kind = r.kind === "bath" || r.kind === "living" || r.kind === "kitchen" ? r.kind : "bed";
    const who = r.who ? mates.find((m) => same(m.name, clean(r.who, 20)))?.id ?? "" : "";
    rooms.push({ name, kind, who });
  }
  if (!rooms.some((r) => r.kind !== "living" && r.kind !== "kitchen")) rooms.unshift({ name: "Bedroom", kind: "bed", who: "" });
  if (!rooms.some((r) => r.kind === "living" || r.kind === "kitchen")) rooms.push({ name: "Living room", kind: "living", who: "" });
  const charges: Charge[] = [];
  for (const raw of Array.isArray(P.charges) ? P.charges : []) {
    const label = clean(raw?.label, 18);
    if (!label || !Number.isInteger(raw.cents) || raw.cents <= 0 || raw.cents > 1_000_000 || charges.length >= 5) continue;
    let room = rooms.findIndex((r) => same(r.name, clean(raw.room, 14)));
    if (room < 0) room = rooms.findIndex((r) => r.kind === "living" || r.kind === "kitchen");
    const on = clean(raw.owner, 20);
    const owner = !on ? "" : same(on, SHARED) ? SHARED : mates.find((m) => same(m.name, on))?.id ?? "";
    const by = clean(raw.by, 20);
    charges.push({ id: `c${charges.length}`, label, cents: raw.cents, room, kind: kindOf(label), owner, by: owner ? mates.find((m) => same(m.name, by))?.id ?? by : "", at: 0, said: clean(raw.said, 60) });
  }
  if (!charges.length) charges.push({ id: "c0", label: "Cleaning fee", cents: 10000, room: 0, kind: "stain", owner: "", by: "", at: 0, said: "" });
  return { home: clean(P.home, 24) || "the apartment", rooms, mates, charges, lockedAt: 0, lockedBy: "" };
}

function reduceDeposit(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  if (a.t === "assign") {
    if (s.lockedAt || typeof a.charge !== "string" || typeof a.owner !== "string") return s;
    const ch = s.charges.find((c) => c.id === a.charge);
    if (!ch) return s;
    if (a.owner !== SHARED && !s.mates.some((m) => m.id === a.owner)) return s;
    const owner = ch.owner === a.owner ? "" : a.owner;
    return { ...s, charges: s.charges.map((c) => (c.id === ch.id ? { ...c, owner, by: owner ? meta.user : "", at: meta.time, said: "" } : c)) };
  }
  if (a.t === "lock") {
    if (s.lockedAt || !allOwned(s)) return s;
    return { ...s, lockedAt: meta.time, lockedBy: meta.user };
  }
  if (a.t === "unlock") {
    if (!s.lockedAt || meta.user !== s.lockedBy) return s;
    return { ...s, lockedAt: 0, lockedBy: "" };
  }
  return s;
}

function Mark(p: { kind: Kind; x: number; y: number; t: Theme; k: number }) {
  const pl = pal(p.t);
  const c = p.t.color;
  let art: Child;
  if (p.kind === "dent")
    art = (
      <g>
        <circle r={9} fill={mix(c.secondaryText, c.card, 0.6)} />
        <path d="M0 0 L-9 -6 M0 0 L8 -8 M0 0 L10 4 M0 0 L-4 10 M0 0 L-10 3" stroke={c.text} stroke-width={1.6} stroke-linecap="round" />
      </g>
    );
  else if (p.kind === "burn")
    art = (
      <g>
        <ellipse rx={13} ry={9} fill={mix(pl.brown, c.text, 0.35)} opacity={0.35} />
        <ellipse rx={8} ry={5.5} fill={mix(pl.brown, c.text, 0.4)} />
        <path d="M-2 -8 C-6 -14 2 -16 0 -22 C6 -16 6 -12 2 -8" fill={pl.orange} />
      </g>
    );
  else if (p.kind === "blind")
    art = (
      <g>
        <rect x={-12} y={-9} width={24} height={18} rx={2} fill={pl.sky} stroke={c.text} stroke-width={1.5} />
        <path d="M-12 0 H12 M0 -9 V9" stroke={c.text} stroke-width={1} />
        <path d="M8 9 V16" stroke={c.text} stroke-width={1} stroke-dasharray="2 2" />
      </g>
    );
  else art = <path d="M-10 -2 C-12 -10 2 -12 6 -6 C14 -6 12 6 4 7 C-2 12 -12 8 -10 -2 Z" fill={mix(pl.purple, c.card, 0.4)} />;
  return <g transform={`translate(${p.x} ${p.y}) scale(${p.k})`}>{art}</g>;
}

export default defineApp<State, Action, Local>({
  name: "Deposit dents",
  summary: (s) => {
    const open = s.charges.filter((c) => !c.owner).length;
    if (s.lockedAt) return `${s.home} deposit: ${money(keptTotal(s))} split, requests out`;
    return open ? `${s.home} deposit: ${money(keptTotal(s))} kept · ${open} charge${open === 1 ? "" : "s"} with no owner yet` : `${s.home} deposit: every charge has an owner, ready to lock`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceDeposit(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "totals add up to what was charged": (s) => totals(s).reduce((a, b) => a + b, 0) === s.charges.filter((c) => c.owner).reduce((a, c) => a + c.cents, 0),
    "owners are roommates or shared": (s) => s.charges.every((c) => c.owner === "" || c.owner === SHARED || s.mates.some((m) => m.id === c.owner)),
    "a claimed charge names who claimed it": (s) => s.charges.every((c) => (c.owner === "") === (c.by === "")),
    "locked only when every charge has an owner": (s) => s.lockedAt === 0 || allOwned(s),
    "a lock names who locked it": (s) => (s.lockedAt === 0) === (s.lockedBy === ""),
    "charges sit in real rooms": (s) => s.charges.every((c) => c.room >= 0 && c.room < s.rooms.length && Number.isInteger(c.cents) && c.cents > 0),
  },

  transitions: {
    "assigning changes exactly one charge": (p, n, a, m) => {
      if (a.t !== "assign" || p === n) return true;
      const diff = n.charges.filter((c, i) => c.owner !== p.charges[i]!.owner);
      const was = p.charges.find((c) => c.id === a.charge)!;
      return diff.length === 1 && diff[0]!.id === a.charge && diff[0]!.owner === (was.owner === a.owner ? "" : a.owner) && diff[0]!.at === m.time && (diff[0]!.owner === "" || diff[0]!.by === m.user);
    },
    "nothing moves while locked": (p, n) => p.lockedAt === 0 || n.charges === p.charges,
    "locking stamps the locker": (p, n, a, m) => a.t !== "lock" || p === n || (p.lockedAt === 0 && n.lockedAt === m.time && n.lockedBy === m.user),
    "only the locker unlocks": (p, n, a, m) => a.t !== "unlock" || p === n || (m.user === p.lockedBy && n.lockedAt === 0),
    "only lock and unlock change the lock": (p, n, a) => a.t === "lock" || a.t === "unlock" || (n.lockedAt === p.lockedAt && n.lockedBy === p.lockedBy),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.75) {
      const ch = r.pick(s.charges);
      const owners = [...s.mates.map((m) => m.id), SHARED];
      return { t: "assign", charge: ch.id, owner: r.pick(owners) };
    }
    return k < 0.9 ? { t: "lock" } : { t: "unlock" };
  },

  local: { sel: "", toast: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 178;
    const font = theme.type.family;
    const tot = totals(state);
    const locked = state.lockedAt > 0;
    const selId = !locked && state.charges.some((ch) => ch.id === local.sel) ? local.sel : "";
    const sel = state.charges.find((ch) => ch.id === selId) ?? null;

    // Plan: private rooms along the top, shared rooms along the bottom.
    const tops = state.rooms.map((r, i) => ({ r, i })).filter((q) => q.r.kind === "bed" || q.r.kind === "bath");
    const bots = state.rooms.map((r, i) => ({ r, i })).filter((q) => q.r.kind === "living" || q.r.kind === "kitchen");
    const rowH = [H * 0.44, H * 0.56];
    const boxes = new Map<number, { x: number; y: number; w: number; h: number }>();
    const weight = (k: string) => (k === "bath" ? 0.6 : k === "living" ? 1.3 : 1);
    [tops, bots].forEach((row, ri) => {
      const sum = row.reduce((a, q) => a + weight(q.r.kind), 0) || 1;
      let x = 0;
      for (const q of row) {
        const w = (W * weight(q.r.kind)) / sum;
        boxes.set(q.i, { x, y: ri ? rowH[0]! : 0, w, h: rowH[ri]! });
        x += w;
      }
    });
    const floor = dark ? mix(c.wash, pl.orange, 0.08) : mix(pl.orange, c.card, 0.9);
    const tile = dark ? mix(c.wash, pl.blue, 0.1) : mix(pl.blue, c.card, 0.9);
    const wall = c.text;
    const art: Child[] = [];
    const over: Child[] = [];
    state.rooms.forEach((r, i) => {
      const b = boxes.get(i);
      if (!b) return;
      art.push(<rect key={`r${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={r.kind === "bath" || r.kind === "kitchen" ? tile : floor} stroke={wall} stroke-width={2.5} />);
      // a door gap and a little furniture
      art.push(<rect key={`d${i}`} x={b.x + b.w / 2 - 9} y={i < tops.length ? b.y + b.h - 2 : b.y - 2} width={18} height={4} fill={floor} />);
      if (r.kind === "bed") art.push(<rect key={`bed${i}`} x={b.x + 6} y={b.y + 18} width={Math.min(26, b.w * 0.4)} height={26} rx={4} fill={dark ? mix(pl.purple, c.card, 0.5) : mix(pl.purple, c.card, 0.75)} />);
      if (r.kind === "kitchen") {
        // Arun's rice cooker, on the counter, looking innocent
        const rx = b.x + 22;
        const ry = b.y + b.h - 18;
        art.push(
          <g key={`rc${i}`} transform={`translate(${rx} ${ry})`}>
            <rect x={-11} y={-16} width={22} height={17} rx={6} fill={dark ? mix(c.text, c.card, 0.2) : c.card} stroke={c.text} stroke-width={1.2} />
            <path d="M-11 -10 H11" stroke={c.text} stroke-width={1} />
            <rect x={-3} y={-20} width={6} height={4} rx={2} fill={c.text} />
            <circle cx={5} cy={-4} r={1.6} fill={pl.red} />
          </g>,
        );
      }
      if (r.kind === "kitchen") art.push(<rect key={`ctr${i}`} x={b.x + 4} y={b.y + b.h - 18} width={b.w - 8} height={14} rx={2} fill={dark ? mix(c.text, c.card, 0.6) : mix(c.secondaryText, c.card, 0.6)} />);
      if (r.kind === "living") art.push(<rect key={`sofa${i}`} x={b.x + 10} y={b.y + b.h - 26} width={Math.min(70, b.w * 0.4)} height={18} rx={6} fill={dark ? mix(pl.green, c.card, 0.5) : mix(pl.green, c.card, 0.6)} />);
      over.push(
        <div key={`rl${i}`} style={{ position: "absolute", left: b.x + 4, top: b.y + 3, maxWidth: b.w - 8, fontSize: 11, lineHeight: "13px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {r.name}
        </div>,
      );
    });
    // charges: marks with a price tag; the owner's face (or "shared") sits on the tag
    state.charges.forEach((ch) => {
      const b = boxes.get(ch.room);
      if (!b) return;
      const same2 = state.charges.filter((x) => x.room === ch.room);
      const k = same2.findIndex((x) => x.id === ch.id);
      const mx = b.x + b.w * (same2.length > 1 ? (k + 1) / (same2.length + 1) : ch.kind === "burn" ? 0.62 : 0.55);
      const my = ch.kind === "burn" ? b.y + b.h - 24 : b.y + b.h * 0.5;
      const pop = ch.at > 0 ? running(ch.at, 700) : null;
      const sc = pop === null ? 1 : 0.6 + 0.4 * POP(pop);
      const isSel = selId === ch.id;
      if (isSel) art.push(<circle key={`sel${ch.id}`} cx={mx} cy={my} r={20} fill="none" stroke={c.primary} stroke-width={2.5} stroke-dasharray="4 3" />);
      art.push(<Mark key={`m${ch.id}`} kind={ch.kind} x={mx} y={my} t={theme} k={sc} />);
      const owner = state.mates.find((m) => m.id === ch.owner);
      over.push(
        <button
          key={`t${ch.id}`}
          type="button"
          aria-pressed={isSel}
          aria-label={`${ch.label}, ${money(ch.cents)}, ${owner ? owner.name + "'s" : ch.owner === SHARED ? "shared" : "no owner yet"}`}
          onClick={() => !locked && setLocal({ sel: isSel ? "" : ch.id })}
          style={{ position: "absolute", left: mx - 30, top: ch.kind === "burn" ? my - 52 : my - 22, width: 60, height: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: ch.kind === "burn" ? "flex-start" : "flex-end", cursor: locked ? "default" : "pointer" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 5px 1px 2px", borderRadius: 99, background: isSel ? c.primary : c.card, color: isSel ? c.onPrimary : c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, whiteSpace: "nowrap", boxShadow: `0 0 0 1px ${c.divider}`, transform: `scale(${sc})` }}>
            {owner ? (
              <Avatar user={owner} size={16} />
            ) : ch.owner === SHARED ? (
              <Facepile users={state.mates} max={2} size={16} />
            ) : (
              <span style={{ width: 16, height: 16, borderRadius: 8, border: `1.5px dashed ${isSel ? c.onPrimary : c.secondaryText}`, boxSizing: "border-box", display: "inline-block" }} />
            )}
            {ch.owner === SHARED ? `${money(ch.cents)} · all` : money(ch.cents)}
          </span>
        </button>,
      );
    });

    const latest = [...state.charges].filter((ch) => ch.owner).sort((a, b) => b.at - a.at)[0];
    const lineFor = () => {
      if (locked) return `Locked · requests out for ${money(keptTotal(state))}`;
      if (sel) return `Whose is the ${sel.label.toLowerCase()}? Tap a face`;
      const said = state.charges.find((ch) => ch.said && ch.owner);
      if (latest && latest.at > 0) {
        const who = state.mates.find((m) => m.id === latest.by)?.name ?? "Someone";
        return `${latest.by === me ? "You" : who} put the ${latest.label.toLowerCase()} on ${latest.owner === SHARED ? "everyone" : state.mates.find((m) => m.id === latest.owner)?.name}`;
      }
      if (said) return `${state.mates.find((m) => m.id === said.by)?.name ?? said.by}: "${said.said}"`;
      return "Tap a mark, then whose it is";
    };

    return (
      <div>
        <CardHeader title={`${state.home} deposit · ${money(keptTotal(state))} kept`} subtitle={`${state.charges.length} charges · ${state.charges.filter((ch) => !ch.owner).length} with no owner`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Floor plan with ${state.charges.length} charges`} style={{ display: "block", overflow: "visible" }}>
            <rect x={-2} y={-2} width={W + 4} height={H + 4} rx={6} fill="none" stroke={wall} stroke-width={3} />
            {art}
          </svg>
          {over}
        </div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: sel ? c.link : c.secondaryText, fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lineFor()}</div>
        <div style={{ marginTop: 6, display: "flex", gap: 4, height: 58 }}>
          {state.mates.map((m, i) => {
            const owns = sel?.owner === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-label={sel ? `Give the ${sel.label} to ${m.name}` : `${m.name}: ${money(tot[i]!)}`}
                onClick={() => {
                  if (!sel) return;
                  dispatch({ t: "assign", charge: sel.id, owner: m.id });
                  haptic("light");
                  setLocal({ sel: "" });
                }}
                style={{ flex: 1, minWidth: 0, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: owns ? c.selected : sel ? c.wash : "transparent", boxShadow: sel ? `inset 0 0 0 1.5px ${owns ? c.primary : c.divider}` : "none", cursor: sel ? "pointer" : "default" }}
              >
                <Avatar user={m} size={24} />
                <span style={{ maxWidth: "100%", fontSize: 12, lineHeight: "14px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${m.id === me ? "You" : m.name.split(" ")[0]} ${money(tot[i]!)}`}</span>
              </button>
            );
          })}
          {sel ? (
            <button
              type="button"
              aria-label={`Split the ${sel.label} evenly`}
              onClick={() => {
                dispatch({ t: "assign", charge: sel.id, owner: SHARED });
                setLocal({ sel: "" });
              }}
              style={{ flex: 1, minWidth: 0, borderRadius: 10, background: sel.owner === SHARED ? c.selected : c.wash, boxShadow: `inset 0 0 0 1.5px ${sel.owner === SHARED ? c.primary : c.divider}`, fontSize: 13, fontWeight: 600, color: c.text }}
            >
              Shared
            </button>
          ) : null}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {locked ? (
            <>
              <span style={{ flex: 1, fontSize: 13, color: c.secondaryText }}>{`Locked by ${state.lockedBy === me ? "you" : state.mates.find((m) => m.id === state.lockedBy)?.name ?? "someone"}`}</span>
              {state.lockedBy === me ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unlock" })}>
                  Unlock
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              kind="primary"
              wide
              disabled={!allOwned(state)}
              onClick={() => {
                dispatch({ t: "lock" });
                haptic("success");
                setLocal({ toast: local.toast + 1 });
              }}
            >
              {allOwned(state) ? "Send requests" : `${state.charges.filter((ch) => !ch.owner).length} left to claim`}
            </Button>
          )}
        </div>
        {local.toast > 0 && locked ? <Toast key={local.toast}>Requests out · totals locked</Toast> : null}
      </div>
    );
  },
});
