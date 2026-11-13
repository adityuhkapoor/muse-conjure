import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  More,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// "Last night at 412 Pine": the house drawn in section with every room lit. Tap a room to leave a
// memory there. When someone closes the post, the rooms switch off one by one and the porch light
// stays on last.

type Params = {
  /** Card title, e.g. "Last night at 412 Pine" */
  title: string;
  /** The house number on the porch, e.g. "412" */
  number: string;
  /** 2 to 6 rooms; kind is couch, kitchen, bath, bed, desk or porch. Memories are in the friends' words. */
  rooms: { name: string; kind: string; memories: { by: string; text: string }[] }[];
};

// @params
const P: Params = {
  title: "Last night at 412 Pine",
  number: "412",
  rooms: [
    { name: "Calvin's room", kind: "bed", memories: [{ by: "Tsai Lin", text: "7 alarms, 0 survivors" }] },
    { name: "Bathroom", kind: "bath", memories: [{ by: "Arun", text: "will's 25 min showers. RIP hot water" }] },
    { name: "Living room", kind: "couch", memories: [{ by: "Will", text: "the couch where calvin slept through 3 alarms" }, { by: "Maya", text: "movie nights with my snack spreadsheet" }] },
    { name: "Kitchen", kind: "kitchen", memories: [{ by: "Calvin", text: "arun's rice cooker made pancakes once" }] },
    { name: "Porch", kind: "porch", memories: [] },
  ],
};
// @end params

const KINDS = ["couch", "kitchen", "bath", "bed", "desk", "porch"] as const;
type Kind = (typeof KINDS)[number];
type Memory = { by: string; user: string | null; text: string; at: number };
type Room = { id: string; name: string; kind: Kind; memories: Memory[] };
type State = { title: string; number: string; rooms: Room[]; closedAt: number; closedBy: string };
type Action = { t: "leave"; room: string; text: string } | { t: "close" };
type Local = { room: string; draft: string };

const TEXT_LEN = 60;
const PER_ROOM = 12;
const STEP_MS = 520;
const PIC_H = 222;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const count = (s: State) => s.rooms.reduce((n, r) => n + r.memories.length, 0);

function initState(ctx: Ctx): State {
  const rooms: Room[] = [];
  let porch = false;
  for (const r of Array.isArray(P.rooms) ? P.rooms : []) {
    const name = clean(r?.name, 18);
    if (!name || rooms.length >= 6) continue;
    const kind = (KINDS as readonly string[]).includes(r?.kind) ? (r.kind as Kind) : "desk";
    if (kind === "porch") {
      if (porch) continue;
      porch = true;
    }
    const memories: Memory[] = [];
    for (const m of Array.isArray(r?.memories) ? r.memories : []) {
      const by = clean(m?.by, 16);
      const text = clean(m?.text, TEXT_LEN);
      if (!by || !text || memories.length >= PER_ROOM) continue;
      const mem = ctx.members.find((x) => x.name.toLowerCase() === by.toLowerCase());
      if (mem && memories.some((x) => x.user === mem.id)) continue;
      memories.push({ by: mem?.name ?? by, user: mem?.id ?? null, text, at: 0 });
    }
    rooms.push({ id: `r${rooms.length}`, name, kind, memories });
  }
  if (!rooms.some((r) => r.kind !== "porch")) rooms.unshift({ id: "rx", name: "Living room", kind: "couch", memories: [] });
  if (!porch) rooms.push({ id: `r${rooms.length + 1}`, name: "Porch", kind: "porch", memories: [] });
  // porch always last: it is the light that stays on
  const ordered = [...rooms.filter((r) => r.kind !== "porch"), ...rooms.filter((r) => r.kind === "porch")];
  return { title: clean(P.title, 40) || "Last night here", number: clean(P.number, 6), rooms: ordered, closedAt: 0, closedBy: "" };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

/** Furniture for a room, standing on the floor line at (x, y), scaled by s. */
function furniture(kind: Kind, x: number, y: number, s: number, p: Pal, on: boolean): Child {
  const ink = on ? p.dark : mix(p.dark, p.soft, 0.4);
  const a = (c: string) => (on ? c : mix(c, p.dark, 0.7));
  const t = (dx: number, dy: number) => `translate(${r1(x + dx * s)} ${r1(y + dy * s)}) scale(${r1(s)})`;
  if (kind === "couch")
    return (
      <g transform={t(0, 0)}>
        <rect x={-30} y={-22} width={60} height={14} rx={5} fill={a(p.blue)} />
        <rect x={-34} y={-12} width={68} height={12} rx={4} fill={a(mix(p.blue, p.dark, 0.2))} />
        <rect x={-38} y={-18} width={9} height={18} rx={4} fill={a(mix(p.blue, p.dark, 0.35))} />
        <rect x={29} y={-18} width={9} height={18} rx={4} fill={a(mix(p.blue, p.dark, 0.35))} />
        <path d="M-10 -26 q4 -6 8 0 M2 -30 q4 -6 8 0" fill="none" stroke={ink} stroke-width={1.4} stroke-linecap="round" />
        <path d="M12 -38 h5 l-5 6 h5" fill="none" stroke={ink} stroke-width={1.2} stroke-linejoin="round" />
      </g>
    );
  if (kind === "kitchen")
    return (
      <g transform={t(0, 0)}>
        <rect x={-36} y={-16} width={72} height={16} fill={a(p.brown)} />
        <rect x={-38} y={-19} width={76} height={4} rx={1} fill={a(p.crust)} />
        <ellipse cx={8} cy={-27} rx={11} ry={8} fill={a(p.paper)} stroke={ink} stroke-width={1.2} />
        <rect x={4} y={-37} width={8} height={4} rx={2} fill={a(p.red)} />
        <path d="M2 -42 q-3 -4 0 -8 M9 -42 q-3 -4 0 -8" fill="none" stroke={ink} stroke-width={1.2} stroke-linecap="round" />
        <rect x={-30} y={-28} width={14} height={9} rx={2} fill={a(p.green)} />
      </g>
    );
  if (kind === "bath")
    return (
      <g transform={t(0, 0)}>
        <path d="M-32 -18 H32 V-10 Q32 0 22 0 H-22 Q-32 0 -32 -10 Z" fill={a(p.paper)} stroke={ink} stroke-width={1.2} />
        <path d="M24 -18 V-46 H14" fill="none" stroke={ink} stroke-width={2} stroke-linecap="round" />
        <circle cx={12} cy={-44} r={4} fill={a(p.soft)} />
        {[0, 1, 2, 3].map((k) => <line key={k} x1={8 + k * 2} y1={-38} x2={6 + k * 3} y2={-24} stroke={a(p.blue)} stroke-width={1.3} stroke-linecap="round" />)}
        <circle cx={-14} cy={-24} r={3} fill={a(p.paper)} stroke={ink} stroke-width={0.8} />
        <circle cx={-8} cy={-27} r={4} fill={a(p.paper)} stroke={ink} stroke-width={0.8} />
      </g>
    );
  if (kind === "bed")
    return (
      <g transform={t(0, 0)}>
        <rect x={-34} y={-14} width={58} height={10} rx={3} fill={a(p.purple)} />
        <rect x={-38} y={-26} width={6} height={26} rx={2} fill={a(p.brown)} />
        <rect x={-32} y={-20} width={14} height={7} rx={3} fill={a(p.paper)} />
        <rect x={-34} y={-4} width={58} height={4} fill={a(p.brown)} />
        <rect x={28} y={-14} width={10} height={14} fill={a(p.brown)} />
        <circle cx={33} cy={-19} r={5} fill={a(p.red)} stroke={ink} stroke-width={1} />
        <path d="M33 -21 v2 h2" fill="none" stroke={a(p.paper)} stroke-width={1} />
        <path d="M27 -25 l-3 -3 M39 -25 l3 -3" stroke={ink} stroke-width={1.2} stroke-linecap="round" />
      </g>
    );
  if (kind === "desk")
    return (
      <g transform={t(0, 0)}>
        <rect x={-30} y={-20} width={60} height={4} fill={a(p.brown)} />
        <rect x={-28} y={-16} width={4} height={16} fill={a(p.brown)} />
        <rect x={24} y={-16} width={4} height={16} fill={a(p.brown)} />
        <rect x={-12} y={-32} width={20} height={12} rx={1} fill={a(p.soft)} />
        <path d="M18 -20 V-36 L26 -40" fill="none" stroke={ink} stroke-width={1.5} />
        <path d="M22 -42 L32 -38 L28 -34 Z" fill={a(p.yellow)} />
      </g>
    );
  return (
    <g transform={t(0, 0)}>
      <rect x={-20} y={-24} width={14} height={24} rx={3} fill={a(p.green)} />
      <rect x={-22} y={-10} width={18} height={4} rx={2} fill={a(mix(p.green, p.dark, 0.3))} />
      <path d="M6 0 v-6 h10 v-6 h10" fill="none" stroke={ink} stroke-width={1.5} />
    </g>
  );
}

const CSS =
  "@keyframes hfIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}" +
  "@keyframes hfGlow{0%,100%{opacity:.55}50%{opacity:.85}}" +
  ".hf-in{animation:hfIn .35s cubic-bezier(.34,1.56,.64,1) both}" +
  ".hf-glow{animation:hfGlow 2.8s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.hf-in,.hf-glow{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "House farewell",
  summary: (s) =>
    s.closedAt > 0
      ? `Lights out at ${s.number || "the house"} · ${count(s)} memories · porch light on`
      : `${s.title} · ${count(s)} memories in ${s.rooms.filter((r) => r.memories.length > 0).length} rooms`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    const me = ctx.members.find((m) => m.id === meta.user);
    if (!me || state.closedAt > 0) return state;
    if (action.t === "leave") {
      if (typeof action.room !== "string" || typeof action.text !== "string") return state;
      const room = state.rooms.find((r) => r.id === action.room);
      const text = action.text.trim().replace(/\s+/g, " ").slice(0, TEXT_LEN);
      if (!room || !text || room.memories.length >= PER_ROOM || room.memories.some((m) => m.user === meta.user)) return state;
      const mem: Memory = { by: clean(me.name, 16) || "Friend", user: meta.user, text, at: meta.time };
      return { ...state, rooms: state.rooms.map((r) => (r.id === room.id ? { ...r, memories: [...r.memories, mem] } : r)) };
    }
    if (action.t === "close") {
      if (count(state) === 0) return state;
      return { ...state, closedAt: meta.time, closedBy: meta.user };
    }
    return state;
  },

  invariants: {
    "one memory per person per room": (s) =>
      s.rooms.every((r) => {
        const u = r.memories.map((m) => m.user).filter((x): x is string => x !== null);
        return new Set(u).size === u.length;
      }),
    "memories are 1 to 60 characters": (s) => s.rooms.every((r) => r.memories.every((m) => m.text.length >= 1 && m.text.length <= TEXT_LEN && m.text === m.text.trim())),
    "rooms hold at most 12": (s) => s.rooms.every((r) => r.memories.length <= PER_ROOM),
    "the porch is last": (s) => s.rooms.filter((r) => r.kind === "porch").length <= 1 && (s.rooms.findIndex((r) => r.kind === "porch") === -1 || s.rooms[s.rooms.length - 1]!.kind === "porch"),
    "closing names who closed it": (s) => (s.closedAt === 0) === (s.closedBy === ""),
    "a closed house has memories": (s) => s.closedAt === 0 || count(s) > 0,
  },

  transitions: {
    "a memory lands in one room, from the sender": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      return p.rooms.every((r, i) => {
        const q = n.rooms[i]!;
        if (r.id !== a.room) return same(r, q);
        const last = q.memories[q.memories.length - 1];
        return q.memories.length === r.memories.length + 1 && !!last && last.user === m.user && last.at === m.time && last.text === String(a.text).trim().replace(/\s+/g, " ").slice(0, TEXT_LEN);
      });
    },
    "an open room takes a first memory": (p, n, a, m, ctx) => {
      if (a.t !== "leave" || !inChat(ctx, m.user) || p.closedAt > 0 || typeof a.text !== "string" || !a.text.trim()) return true;
      const r = p.rooms.find((x) => x.id === a.room);
      return !r || r.memories.length >= PER_ROOM || r.memories.some((x) => x.user === m.user) || p !== n;
    },
    "closing happens once, by the sender": (p, n, a, m) => n.closedAt === p.closedAt || (a.t === "close" && p.closedAt === 0 && n.closedAt === m.time && n.closedBy === m.user),
    "a house with memories can close": (p, n, a, m, ctx) => a.t !== "close" || !inChat(ctx, m.user) || p.closedAt > 0 || count(p) === 0 || n.closedAt === m.time,
    "nothing is said after lights out": (p, n) => p.closedAt === 0 || same(p.rooms, n.rooms),
    "memories are never erased": (p, n) => p.rooms.every((r, i) => r.memories.every((x, k) => same(x, n.rooms[i]?.memories[k]))),
    "the house never changes": (p, n) => p.title === n.title && same(p.rooms.map((r) => [r.id, r.name, r.kind]), n.rooms.map((r) => [r.id, r.name, r.kind])),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.08) return { t: "close" };
    if (k < 0.12) return { t: "leave", room: "nope", text: "hi" };
    return { t: "leave", room: r.pick(s.rooms).id, text: r.pick(["best year", "the couch", "rice cooker forever", "  3am talks  "]) };
  },

  local: { room: "", draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (m: Memory): Member => (m.user ? members.find((x) => x.id === m.user) : undefined) ?? { id: m.user ?? `n:${m.by}`, name: m.by };
    const closed = state.closedAt > 0;
    const here = members.some((m) => m.id === me);
    const total = count(state);
    const inside = state.rooms.filter((r) => r.kind !== "porch");
    const porch = state.rooms.find((r) => r.kind === "porch");
    const sel = state.rooms.find((r) => r.id === local.room) ?? inside.reduce((b, r) => (r.memories.length > b.memories.length ? r : b), inside[0]!);
    const mineHere = sel.memories.some((m) => m.user === me);

    // Lights: each inside room goes dark in turn after the close; the porch never does.
    const sinceClose = closed ? (running(state.closedAt, (inside.length + 2) * STEP_MS) ?? (inside.length + 2) * STEP_MS) : -1;
    const lit = (i: number) => !closed || sinceClose < 400 + i * STEP_MS;

    // Geometry: house body, roof, porch on the right.
    const porchW = 66;
    const hx = 10;
    const hw = W - porchW - hx - 4;
    const roofTop = 22;
    const eave = 64;
    const ground = PIC_H - 14;
    const perFloor = inside.length <= 2 ? inside.length : Math.ceil(inside.length / 2);
    const floors = Math.ceil(inside.length / perFloor);
    const fh = (ground - eave) / floors;
    const cells = inside.map((r, i) => {
      const fl = Math.floor(i / perFloor);
      const k = i % perFloor;
      const inRow = Math.min(perFloor, inside.length - fl * perFloor);
      const cw = hw / inRow;
      return { r, i, x: hx + k * cw, y: eave + fl * fh, w: cw, h: fh };
    });
    const px = hx + hw;
    const pTop = ground - fh;

    const night = mix(c.series1, p.dark, 0.78);
    const litFill = mix(p.yellow, p.cream, 0.55);
    const darkFill = mix(p.dark, night, 0.4);
    const wallLine = mix(p.brown, p.dark, 0.4);

    const stars: Child[] = [];
    for (let k = 0; k < 14; k++) stars.push(<circle key={`s${k}`} cx={r1(((k * 71) % 100) / 100 * W)} cy={r1(4 + ((k * 37) % 50) / 50 * 50)} r={k % 3 === 0 ? 1.4 : 0.9} fill={p.cream} />);

    const art: Child[] = [
      <rect key="sky" x={0} y={0} width={W} height={PIC_H} fill={night} />,
      ...stars,
      <circle key="moon" cx={W - 26} cy={24} r={11} fill={p.cream} />,
      <circle key="moon2" cx={W - 21} cy={20} r={10} fill={night} />,
      <rect key="ground" x={0} y={ground} width={W} height={PIC_H - ground} fill={mix(p.grass, p.dark, 0.55)} />,
      <path key="roof" d={`M${hx - 8} ${eave + 1} L${hx + hw / 2} ${roofTop} L${hx + hw + 8} ${eave + 1} Z`} fill={mix(p.red, p.dark, 0.35)} />,
      <rect key="chim" x={hx + hw * 0.72} y={roofTop + 6} width={14} height={22} fill={mix(p.red, p.dark, 0.5)} />,
      <rect key="body" x={hx} y={eave} width={hw} height={ground - eave} fill={wallLine} />,
    ];
    for (const cell of cells) {
      const on = lit(cell.i);
      art.push(<rect key={`rf${cell.r.id}`} x={r1(cell.x + 3)} y={r1(cell.y + 3)} width={r1(cell.w - 6)} height={r1(cell.h - 6)} fill={on ? litFill : darkFill} />);
      if (on) art.push(<path key={`gl${cell.r.id}`} d={`M${r1(cell.x + cell.w / 2 - 4)} ${r1(cell.y + 12)} L${r1(cell.x + cell.w * 0.2)} ${r1(cell.y + cell.h - 3)} L${r1(cell.x + cell.w * 0.8)} ${r1(cell.y + cell.h - 3)} L${r1(cell.x + cell.w / 2 + 4)} ${r1(cell.y + 12)} Z`} fill={p.paper} fill-opacity={0.35} />);
      art.push(<line key={`bulb${cell.r.id}`} x1={r1(cell.x + cell.w / 2)} y1={r1(cell.y + 3)} x2={r1(cell.x + cell.w / 2)} y2={r1(cell.y + 9)} stroke={p.dark} stroke-width={1} />);
      art.push(<circle key={`bl${cell.r.id}`} cx={r1(cell.x + cell.w / 2)} cy={r1(cell.y + 11)} r={3} fill={on ? p.yellow : p.soft} />);
      art.push(<g key={`fu${cell.r.id}`}>{furniture(cell.r.kind, cell.x + cell.w / 2, cell.y + cell.h - 4, Math.min(1, (cell.w - 12) / 84, (cell.h - 10) / 52), p, on)}</g>);
      const label = fitText(cell.r.name, cell.w - 16, { size: 11, weight: 600, min: 9 });
      art.push(<text key={`tx${cell.r.id}`} x={r1(cell.x + 8)} y={r1(cell.y + 16)} font-size={label.size} font-weight={600} fill={on ? p.dark : p.cream}>{label.text}</text>);
    }
    // Porch: roof, post, door, light that stays on.
    art.push(
      <g key="porch">
        <path d={`M${px} ${pTop - 6} L${px + porchW - 4} ${pTop + 4} L${px + porchW - 4} ${pTop + 9} L${px} ${pTop + 3} Z`} fill={mix(p.red, p.dark, 0.35)} />
        <rect x={px + porchW - 10} y={pTop + 8} width={4} height={ground - pTop - 8} fill={p.crust} />
        <rect x={px} y={ground - 6} width={porchW - 4} height={6} fill={p.crust} />
        <rect x={hx + hw - 26} y={ground - 40} width={20} height={34} rx={2} fill={mix(p.brown, p.dark, 0.2)} />
        <circle cx={hx + hw - 10} cy={ground - 22} r={1.6} fill={p.yellow} />
        <circle cx={px + 12} cy={pTop + 14} r={closed ? 24 : 14} fill={p.yellow} opacity={0.22} class="hf-glow" />
        <circle cx={px + 12} cy={pTop + 14} r={5} fill={p.yellow} />
        <rect x={px + 9} y={pTop + 6} width={6} height={4} fill={p.dark} />
        {state.number ? <text x={px + 24} y={pTop + 19} font-size={11} font-weight={700} fill={p.cream}>{state.number}</text> : null}
      </g>,
    );

    const faces = (r: Room, x: number, y: number, max: number) => {
      const list = r.memories.slice(-max);
      const extra = r.memories.length - list.length;
      return (
        <div key={`fc${r.id}`} style={{ position: "absolute", left: r1(x), top: r1(y), display: "flex", alignItems: "center", pointerEvents: "none" }}>
          {list.map((m, k) => (
            <span key={k} {...(m.at > 0 && running(m.at, 500) !== null ? { class: "hf-in" } : {})} style={{ marginLeft: k ? -5 : 0, borderRadius: 10, boxShadow: `0 0 0 1.5px ${c.card}`, display: "inline-flex" }}>
              <Avatar user={person(m)} size={18} />
            </span>
          ))}
          {extra > 0 ? <More n={extra} size={18} /> : null}
        </div>
      );
    };

    const quotes = sel.memories.slice(-2).reverse();
    const placeholder = sel.kind === "porch" ? "Leave one on the porch" : `Leave one in the ${sel.name.toLowerCase()}`;
    const leave = () => {
      const text = local.draft.trim();
      if (!text) return;
      dispatch({ t: "leave", room: sel.id, text });
      haptic("light");
      setLocal({ draft: "" });
    };
    const closeNow = closed && running(state.closedAt, 2400) !== null;
    const closer = members.find((m) => m.id === state.closedBy)?.name ?? "Someone";

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={closed ? `Lights out · ${total} memories · porch light on` : total === 0 ? "Every room is lit · leave the first memory" : `${total} memories · tap a room`} />
        <div style={{ position: "relative", height: PIC_H, borderRadius: 12, overflow: "hidden" }}>
          <svg width={W} height={PIC_H} viewBox={`0 0 ${W} ${PIC_H}`} role="img" aria-label={`The house in section: ${state.rooms.map((r) => `${r.name}, ${r.memories.length} memories`).join("; ")}`} style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
          </svg>
          {cells.map((cell) => (
            <button
              key={`b${cell.r.id}`}
              type="button"
              aria-label={`${cell.r.name}, ${cell.r.memories.length} memories`}
              aria-pressed={sel.id === cell.r.id}
              onClick={() => setLocal({ room: cell.r.id })}
              style={{ position: "absolute", left: r1(cell.x + 3), top: r1(cell.y + 3), width: r1(cell.w - 6), height: r1(cell.h - 6), borderRadius: 2, boxShadow: sel.id === cell.r.id ? `inset 0 0 0 2.5px ${c.primary}` : "none" }}
            />
          ))}
          {porch ? (
            <button
              type="button"
              aria-label={`${porch.name}, ${porch.memories.length} memories`}
              aria-pressed={sel.id === porch.id}
              onClick={() => setLocal({ room: porch.id })}
              style={{ position: "absolute", left: px, top: pTop, width: porchW - 4, height: ground - pTop, borderRadius: 4, boxShadow: sel.id === porch.id ? `inset 0 0 0 2.5px ${c.primary}` : "none" }}
            />
          ) : null}
          {cells.map((cell) => (cell.r.memories.length ? faces(cell.r, cell.x + cell.w - 10 - Math.min(cell.r.memories.length, 2) * 13 - (cell.r.memories.length > 2 ? 22 : 0), cell.y + 7, 2) : null))}
          {porch && porch.memories.length ? faces(porch, px + 4, pTop + 34, 2) : null}
          {!closed && here ? (
            <button type="button" class="m-hit" aria-label="Lights out" disabled={total === 0} onClick={() => { dispatch({ t: "close" }); haptic("medium"); }} style={{ position: "absolute", left: 10, top: 8, width: 36, height: 44, borderRadius: 6, background: c.card, boxShadow: `0 0 0 1.5px ${wallLine}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 10, height: 24, borderRadius: 3, background: c.secondaryButton, boxShadow: `inset 0 -8px 0 ${c.primary}` }} />
            </button>
          ) : null}
          {!closed && here && total > 0 ? <div style={{ position: "absolute", left: 52, top: 22, height: 16, padding: "0 4px", fontSize: 12, lineHeight: "16px", fontWeight: 600, color: p.cream, background: night }}>lights out</div> : null}
        </div>

        <div style={{ marginTop: 8, minHeight: 52 }}>
          {quotes.length === 0 ? (
            <div style={{ height: 52, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText }}>{`Nothing in the ${sel.name.toLowerCase()} yet`}</div>
          ) : (
            quotes.map((m, k) => {
              const fit = fitText(`"${m.text}"`, W - 30 - 8, { size: 14, min: 11 });
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
                  <Avatar user={person(m)} size={20} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: fit.size, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fit.text}</span>
                </div>
              );
            })
          )}
        </div>

        {closed ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, height: 44, marginTop: 6, padding: "0 12px", borderRadius: 12, background: c.wash }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${closer} turned off the lights · the porch light stays on`}</span>
          </div>
        ) : here ? (
          <form style={{ display: "flex", gap: 8, marginTop: 6 }} onSubmit={(e: Event) => { e.preventDefault(); leave(); }}>
            <input aria-label={placeholder} placeholder={mineHere ? "Pick another room" : placeholder} maxLength={TEXT_LEN} disabled={mineHere} value={local.draft} onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })} style={{ flex: 1 }} />
            <Button kind="primary" disabled={mineHere || !local.draft.trim()} onClick={leave}>Leave it</Button>
          </form>
        ) : null}
        {closeNow ? <Toast key={state.closedAt}>Goodnight, {state.number || "house"}</Toast> : null}
      </div>
    );
  },
});
