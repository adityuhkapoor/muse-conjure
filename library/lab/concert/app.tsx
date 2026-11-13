import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  More,
  Placed,
  Scene,
  Sparkline,
  Toast,
  mix,
  running,
  tween,
  type Child,
} from "@muse/app";

// Concert seats: the chat has one section at the arena, the group sits together, and a tap on any
// section shows its two-week price and offers to move everyone there. The viewer's own face in the
// who row is the RSVP: maybe -> going -> out -> going.

type Status = "in" | "maybe" | "out";
type SecParam = { label: string; priceCents: number; together: number };
type Params = {
  title: string;
  when: string;
  venue: string;
  floor: { priceCents: number; together: number };
  lower: SecParam[];
  upper: SecParam[];
  claimed: string;
  people: { name: string; status: Status }[];
  note: { who: string; text: string };
};

// @params
const P: Params = {
  title: "SZA · SOS Tour",
  when: "Fri, Apr 24",
  venue: "Capital One Arena",
  floor: { priceCents: 26500, together: 12 },
  lower: [
    { label: "101", priceCents: 12900, together: 6 },
    { label: "102", priceCents: 14800, together: 4 },
    { label: "103", priceCents: 17500, together: 8 },
    { label: "104", priceCents: 14800, together: 6 },
    { label: "105", priceCents: 12900, together: 5 },
  ],
  upper: [
    { label: "201", priceCents: 7200, together: 10 },
    { label: "202", priceCents: 8400, together: 8 },
    { label: "203", priceCents: 9500, together: 6 },
    { label: "204", priceCents: 8400, together: 8 },
    { label: "205", priceCents: 7200, together: 10 },
  ],
  claimed: "104",
  people: [
    { name: "Maya", status: "in" },
    { name: "Ana", status: "in" },
    { name: "Leo", status: "in" },
    { name: "Jess", status: "maybe" },
    { name: "Rae", status: "out" },
    { name: "Sam", status: "maybe" },
  ],
  note: { who: "Jess", text: "if it's <$150" },
};
// @end params

type Section = { id: string; label: string; price: number; together: number };
type State = {
  title: string;
  sub: string;
  note: string;
  sections: Section[];
  claimed: string;
  from: string;
  movedAt: number;
  status: Record<string, Status>;
};
type Action = { t: "move"; section: string } | { t: "rsvp"; value: Status };
type Local = { selected: string; burst: number };

const MOVE_MS = 900;
const moveEase = tween({ duration: 800, easing: "easeInOut" });
const D = Math.PI / 180;

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");
const usd = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const going = (s: State) => Object.keys(s.status).filter((id) => s.status[id] === "in");
const sec = (s: State, id: string) => s.sections.find((x) => x.id === id);
const gi = (id: string) =>
  id === "floor" ? 0 : id[0] === "l" ? 1 + Number(id.slice(1)) : id[0] === "u" ? 6 + Number(id.slice(1)) : -1;

function history(h: number, price: number): number[] {
  return Array.from({ length: 14 }, (_, k) =>
    k === 13 ? price : Math.round(price * (1 + 0.1 * Math.sin(k * 0.8 + h * 1.7) * (1 - k / 16) + 0.14 * (1 - k / 13))),
  );
}

/** Stable seat texture, no randomness at render time. */
function h01(i: number): number {
  let x = Math.imul(i, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return ((x >>> 0) % 1000) / 1000;
}

// ---- Arena geometry. Angles run from +x toward +y, so the whole fan is below the stage. ----

type Geo = { ri: number; ro: number; a0: number; a1: number };

function geoOf(id: string): Geo {
  if (id === "floor") return { ri: 34, ro: 78, a0: 28 * D, a1: 152 * D };
  const j = Math.max(0, (id[0] === "l" || id[0] === "u" ? Number(id.slice(1)) : 0) || 0);
  const a0 = (15 + 30 * j + 1.15) * D;
  const a1 = (15 + 30 * j + 30 - 1.15) * D;
  return id[0] === "u" ? { ri: 136, ro: 174, a0, a1 } : { ri: 88, ro: 128, a0, a1 };
}

const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
const r1 = (v: number) => Math.round(v * 10) / 10;

function sectionPath(g: Geo, cx: number, cy: number, k: number, lift: number): string {
  const ro = (g.ro + lift) * k;
  const ri = g.ri * k;
  const [ox, oy] = pt(cx, cy, ro, g.a0);
  const [ex, ey] = pt(cx, cy, ro, g.a1);
  const [ix, iy] = pt(cx, cy, ri, g.a1);
  const [jx, jy] = pt(cx, cy, ri, g.a0);
  return `M${r1(ox)} ${r1(oy)} A${r1(ro)} ${r1(ro)} 0 0 1 ${r1(ex)} ${r1(ey)} L${r1(ix)} ${r1(iy)} A${r1(ri)} ${r1(ri)} 0 0 0 ${r1(jx)} ${r1(jy)} Z`;
}

function seatAt(id: string, slot: number, cx: number, cy: number, k: number): [number, number] {
  const g = geoOf(id);
  const base = id === "floor" ? 56 + (slot % 2 === 0 ? -8 : 8) : (g.ri + g.ro) / 2;
  const r = base * k;
  const mid = (g.a0 + g.a1) / 2;
  return pt(cx, cy, r, mid + (slot - 1.5) * (15 / r));
}

function makeSection(x: unknown, j: number, prefix: "10" | "20"): Section {
  const o = (x && typeof x === "object" ? x : {}) as Partial<SecParam>;
  const label = clean(o.label, 6);
  const price = Number.isInteger(o.priceCents)
    ? Math.max(100, Math.min(500000, o.priceCents as number))
    : 10000;
  const together = Number.isInteger(o.together) ? Math.max(1, Math.min(20, o.together as number)) : 6;
  return { id: `${prefix === "10" ? "l" : "u"}${j}`, label: label || `${prefix}${j + 1}`, price, together };
}

const floorSection = (): Section => {
  const f = (P.floor && typeof P.floor === "object" ? P.floor : {}) as Partial<{ priceCents: number; together: number }>;
  const price = Number.isInteger(f.priceCents) ? Math.max(100, Math.min(500000, f.priceCents as number)) : 10000;
  const together = Number.isInteger(f.together) ? Math.max(1, Math.min(20, f.together as number)) : 6;
  return { id: "floor", label: "Floor", price, together };
};

export default defineApp<State, Action, Local>({
  name: "Concert seats",

  summary: (s) => {
    const n = going(s).length;
    const here = sec(s, s.claimed);
    if (!n) return `${s.title}: no one going yet`;
    if (here?.id === "floor") return `${s.title}: ${n} going, on the floor`;
    return `${s.title}: ${n} going, sitting in Section ${here?.label ?? "104"}`;
  },

  init: (ctx) => {
    const lower = Array.isArray(P.lower) ? P.lower : [];
    const upper = Array.isArray(P.upper) ? P.upper : [];
    const sections: Section[] = [
      floorSection(),
      ...Array.from({ length: 5 }, (_, j) => makeSection(lower[j], j, "10")),
      ...Array.from({ length: 5 }, (_, j) => makeSection(upper[j], j, "20")),
    ];
    const want = typeof P.claimed === "string" ? P.claimed.trim() : "";
    const claimed = sections.find((x) => x.label === want)?.id ?? "l3";
    const then = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const note =
      P.note && typeof P.note.who === "string" && typeof P.note.text === "string"
        ? `${P.note.who}: “${P.note.text}”`
        : "";
    const status: Record<string, Status> = {};
    const people = Array.isArray(P.people) ? P.people : [];
    for (const m of ctx.members) {
      const hit = people.find((p) => typeof p?.name === "string" && p.name.toLowerCase() === m.name.toLowerCase());
      status[m.id] = hit && (hit.status === "in" || hit.status === "maybe" || hit.status === "out") ? hit.status : "maybe";
    }
    let ins = going({ sections, status } as State).length;
    const cap = sec({ sections } as State, claimed)?.together ?? 1;
    while (ins > cap) {
      let last = "";
      for (const m of ctx.members) if (status[m.id] === "in") last = m.id;
      if (!last) break;
      status[last] = "maybe";
      ins--;
    }
    return {
      title: then(P.title) || "Concert",
      sub: `${then(P.when)} · ${then(P.venue)}`,
      note,
      sections,
      claimed,
      from: claimed,
      movedAt: 0,
      status,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "move") {
      if (typeof a.section !== "string") return s;
      const target = sec(s, a.section);
      if (!target || a.section === s.claimed) return s;
      if (s.status[m.user] !== "in") return s;
      if (going(s).length > target.together) return s;
      return { ...s, from: s.claimed, claimed: a.section, movedAt: m.time };
    }
    if (a.t === "rsvp") {
      if (a.value !== "in" && a.value !== "maybe" && a.value !== "out") return s;
      if (a.value === s.status[m.user]) return s;
      if (a.value === "in" && going(s).length + 1 > (sec(s, s.claimed)?.together ?? 0)) return s;
      return { ...s, status: { ...s.status, [m.user]: a.value } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const now = Object.keys(s.status).sort().join();
    const next = ctx.members.map((m) => m.id).sort().join();
    if (now === next) return s;
    const status: Record<string, Status> = {};
    for (const m of ctx.members) status[m.id] = s.status[m.id] ?? "maybe";
    return { ...s, status };
  },

  invariants: {
    "status covers exactly the chat": (s, ctx) =>
      Object.keys(s.status).sort().join() === ctx.members.map((m) => m.id).sort().join(),
    "every status is in, maybe or out": (s) =>
      Object.values(s.status).every((v) => v === "in" || v === "maybe" || v === "out"),
    "the group fits its section": (s) => {
      const here = sec(s, s.claimed);
      return !!here && going(s).length <= here.together;
    },
    "claimed and from are real sections": (s) => !!sec(s, s.claimed) && !!sec(s, s.from),
    "eleven fixed sections": (s) =>
      s.sections.map((x) => x.id).join() === "floor,l0,l1,l2,l3,l4,u0,u1,u2,u3,u4" &&
      s.sections.every(
        (x) =>
          Number.isInteger(x.price) &&
          x.price > 0 &&
          Number.isInteger(x.together) &&
          x.together >= 1 &&
          x.together <= 20,
      ),
    "a move leaves where it was": (s) => (s.movedAt === 0 ? s.from === s.claimed : s.from !== s.claimed),
  },

  transitions: {
    "a move puts the group in the target and stamps the time": (p, n, a, m) =>
      a.t !== "move" || n.claimed === p.claimed || (n.claimed === a.section && n.from === p.claimed && n.movedAt === m.time),
    "only someone going moves the group": (p, n, a, m) => a.t !== "move" || n.claimed === p.claimed || p.status[m.user] === "in",
    "a move only goes where everyone fits": (p, n, a) => {
      if (a.t !== "move" || n.claimed === p.claimed) return true;
      const target = sec(p, n.claimed);
      return !!target && going(p).length <= target.together;
    },
    "an rsvp changes only the sender": (p, n, a, m) => {
      if (a.t !== "rsvp") return true;
      const keys = new Set([...Object.keys(p.status), ...Object.keys(n.status)]);
      for (const k of keys) if (k !== m.user && n.status[k] !== p.status[k]) return false;
      if (n.status[m.user] !== p.status[m.user]) return n.status[m.user] === a.value;
      return true;
    },
    "an rsvp answers for the sender when it can": (p, n, a, m, ctx) => {
      if (a.t !== "rsvp" || !inChat(ctx, m.user)) return true;
      if (a.value !== "in" && a.value !== "maybe" && a.value !== "out") return n === p;
      if (a.value === p.status[m.user]) return n === p;
      if (a.value === "in" && going(p).length + 1 > (sec(p, p.claimed)?.together ?? 0)) return n === p;
      return n.status[m.user] === a.value;
    },
    "rsvp does not move anyone": (p, n, a) => a.t !== "rsvp" || (n.claimed === p.claimed && n.movedAt === p.movedAt),
    "move does not change anyone's answer": (p, n, a) => a.t !== "move" || JSON.stringify(n.status) === JSON.stringify(p.status),
    "only people in the chat change anything": (p, n, _a, m, ctx) => JSON.stringify(p) === JSON.stringify(n) || inChat(ctx, m.user),
    "sections never change": (p, n) => JSON.stringify(n.sections) === JSON.stringify(p.sections),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.status[user] !== "in" && k < 0.5) return { t: "rsvp", value: "in" };
    if (k < 0.75) return { t: "rsvp", value: r.pick(["in", "maybe", "out"] as const) };
    const other = s.sections.filter((x) => x.id !== s.claimed);
    return { t: "move", section: r.pick(other).id };
  },

  local: { selected: "", burst: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const W = theme.width - 24;
    const c = theme.color;
    const k = Math.min(1, (W / 2 - 4) / 170);
    const H = Math.round(26 + 174 * k);
    const cx = W / 2;
    const cy = 20;

    const selectedId = local.selected && sec(state, local.selected) ? local.selected : state.claimed;
    const active = sec(state, selectedId) ?? state.sections[0]!;
    const claimedSection = sec(state, state.claimed) ?? state.sections[0]!;
    const goingIds = going(state);
    const goingCount = goingIds.length;
    const maybeCount = Object.keys(state.status).filter((id) => state.status[id] === "maybe").length;
    const mine = state.status[me] ?? "maybe";
    const activeHistory = history(gi(active.id), active.price);
    const delta = active.price - (activeHistory[0] ?? active.price);
    const deltaColor = mix(delta <= 0 ? c.positive : c.negative, c.text, 0.12);
    const selectedClaimed = selectedId === state.claimed;

    const fillOf = (id: string) => (id === selectedId ? c.primary : id === state.claimed ? mix(c.primary, c.card, 0.7) : c.secondaryButton);
    const inkOf = (id: string) => (id === selectedId ? c.onPrimary : c.text);

    const art: Child[] = state.sections.map((sect) => {
      const g = geoOf(sect.id);
      const fill = fillOf(sect.id);
      const ink = inkOf(sect.id);
      const parts: Child[] = [
        <path
          key="shape"
          d={sectionPath(g, cx, cy, k, sect.id === selectedId ? 2 : 0)}
          fill={fill}
          style={{ cursor: "pointer" }}
          onClick={() => setLocal({ selected: sect.id })}
        >
          <title>{`${sect.id === "floor" ? "Floor" : `Section ${sect.label}`}, ${usd(sect.price)} each`}</title>
        </path>,
      ];
      const midA = (g.a0 + g.a1) / 2;
      const [lx, ly] = pt(cx, cy, (sect.id === "floor" ? 56 : (g.ri + g.ro) / 2) * k, midA);
      if (sect.id !== "floor") {
        for (let row = 0; row < 3; row++) {
          const radius = (g.ri + 7 + ((g.ro - 7 - (g.ri + 7)) * row) / 2) * k;
          const count = Math.max(1, Math.floor(((g.a1 - g.a0) * radius) / 9));
          for (let s = 0; s < count; s++) {
            const a = g.a0 + ((g.a1 - g.a0) * (s + 0.5)) / count;
            const [x, y] = pt(cx, cy, radius, a);
            if (sect.id !== state.claimed && Math.abs(x - lx) < 15 && Math.abs(y - ly) < 9) continue;
            parts.push(
              <circle
                key={`d${row}-${s}`}
                cx={r1(x)}
                cy={r1(y)}
                r={1.6}
                fill={ink}
                fill-opacity={h01(gi(sect.id) * 97 + row * 13 + s) < 0.45 ? 0.12 : 0.35}
              />,
            );
          }
        }
      }
      if (sect.id !== state.claimed || sect.id === "floor") {
        const mid = (g.a0 + g.a1) / 2;
        const [x, y] = pt(cx, cy, (sect.id === "floor" ? 56 : (g.ri + g.ro) / 2) * k, mid);
        parts.push(
          <text
            key="label"
            x={r1(x)}
            y={r1(y)}
            fill={ink}
            text-anchor="middle"
            dominant-baseline="central"
            font-family={theme.type.family}
            font-size={sect.id === "floor" ? 13 : 12}
            font-weight={600}
            pointer-events="none"
          >
            {sect.label}
          </text>,
        );
      }
      return <g key={sect.id}>{parts}</g>;
    });

    art.push(
      <rect key="stage" x={r1(cx - 62)} y={3} width={124} height={26} rx={8} fill={c.text} />,
      <text
        key="stage-label"
        x={r1(cx)}
        y={16}
        fill={c.card}
        text-anchor="middle"
        dominant-baseline="central"
        font-family={theme.type.family}
        font-size={13}
        font-weight={600}
      >
        Stage
      </text>,
    );

    const fly = (slot: number): [number, number] => {
      const to = seatAt(confirmed.claimed, slot, cx, cy, k);
      const e = confirmed.movedAt ? running(confirmed.movedAt, MOVE_MS) : null;
      if (e === null) return to;
      const from = seatAt(confirmed.from, slot, cx, cy, k);
      const q = Math.max(0, Math.min(1, moveEase(e / 800) * 1.4 - slot * 0.1));
      return [
        from[0] + (to[0] - from[0]) * q,
        from[1] + (to[1] - from[1]) * q - Math.sin(q * Math.PI) * 30 * k,
      ];
    };

    const goingMembers = members.filter((m) => state.status[m.id] === "in");
    const extra = goingMembers.length > 4 ? goingMembers.length - 3 : 0;
    const seated = extra > 0 ? goingMembers.slice(0, 3) : goingMembers.slice(0, 4);
    const mapLabel =
      claimedSection.id === "floor"
        ? `Seat map: you're on the floor, ${goingCount} going`
        : `Seat map: you're in Section ${claimedSection.label}, ${goingCount} going`;

    const leftW = theme.width < 360 ? 96 : 112;
    const maxSlots = theme.width < 360 ? 5 : 6;
    const meMember = members.find((m) => m.id === me) ?? { id: me, name: "You" };
    const ordered = [...members.filter((m) => m.id !== me), meMember];
    let shown = ordered;
    if (ordered.length > maxSlots) {
      shown = ordered.slice(0, maxSlots - 1);
      if (!shown.some((m) => m.id === me)) shown = [...shown.slice(0, maxSlots - 2), meMember];
    }
    const hidden = ordered.length - shown.length;
    const slotLabel = (st: Status) =>
      st === "in" ? "Going" : st === "maybe" ? "Maybe" : theme.width < 360 ? "Out" : "Can't go";
    const nextStatus = mine === "maybe" ? "in" : mine === "in" ? "out" : "in";
    const showMove = !selectedClaimed && goingCount <= active.together && mine === "in";

    return (
      <div>
        <style>{"@keyframes concertPulse { 0%, 100% { opacity: .3 } 50% { opacity: .9 } }"}</style>
        <div style={{ height: 44, overflow: "hidden" }}>
          <CardHeader title={state.title} subtitle={state.sub} />
        </div>

        <Scene height={H} label={mapLabel} art={art}>
          {seated.map((m, slot) => {
            const [x, y] = fly(slot);
            return <Placed key={m.id} user={m.id} x={x / W} y={y / H} size={16} me={me} move={false} />;
          })}
          {extra > 0
            ? (() => {
                const [x, y] = fly(3);
                return (
                  <div
                    key="more"
                    style={{
                      position: "absolute",
                      left: `${r1((x / W) * 100)}%`,
                      top: `${r1((y / H) * 100)}%`,
                      transform: "translate(-50%,-50%)",
                      zIndex: 2,
                    }}
                  >
                    <More n={extra} size={16} />
                  </div>
                );
              })()
            : null}
        </Scene>

        <div
          style={{
            height: 88,
            marginTop: 6,
            background: c.input,
            borderRadius: theme.radius.card,
            position: "relative",
            paddingLeft: 14,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 10,
              width: W < 360 ? 156 : 150,
              fontSize: 17,
              lineHeight: "20px",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active.id === "floor" ? "Floor · GA" : `Section ${active.label}`}
          </div>
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 34,
              width: W < 360 ? 156 : 150,
              fontSize: 13,
              lineHeight: "17px",
              color: c.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active.id === "floor"
              ? `${usd(active.price)} each · standing`
              : `${usd(active.price)} each · ${active.together} together`}
          </div>
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 54,
              width: W < 360 ? 156 : 150,
              fontSize: 12,
              lineHeight: "16px",
              color: deltaColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`${delta <= 0 ? "Down" : "Up"} $${Math.round(Math.abs(delta) / 100)} since Mon`}
          </div>

          <div style={{ position: "absolute", left: 170, right: 14, top: 12 }}>
            <Sparkline
              values={activeHistory}
              label={`Price over 2 weeks, now ${usd(active.price)}`}
              width={Math.max(1, W - 184)}
              height={30}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 170,
              right: 14,
              top: 44,
              display: "flex",
              justifyContent: "space-between",
              color: c.secondaryText,
              fontSize: 10,
              lineHeight: "12px",
            }}
          >
            <small style={{ fontSize: 10, lineHeight: "12px", color: c.secondaryText }}>2 wks ago</small>
            <small style={{ fontSize: 10, lineHeight: "12px", color: c.secondaryText }}>now</small>
          </div>
          <div
            style={{
              position: "absolute",
              left: 170,
              right: 14,
              bottom: 8,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selectedClaimed ? (
              <span style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
                You're all sitting here
              </span>
            ) : goingCount > active.together ? (
              <span style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
                {`Only ${active.together} together here`}
              </span>
            ) : mine !== "in" ? (
              <span style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
                Say you're going to move
              </span>
            ) : (
              <Button kind="primary" wide onClick={() => dispatch({ t: "move", section: selectedId })}>
                Move us here
              </Button>
            )}
          </div>
        </div>

        <div style={{ height: 52, marginTop: 6, display: "flex", alignItems: "center" }}>
          <div style={{ flex: `0 0 ${leftW}px`, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                lineHeight: "17px",
                color: c.secondaryText,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {goingCount ? `${goingCount} going · ${maybeCount} maybe` : "No one going yet"}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: "17px",
                color: c.secondaryText,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {state.note}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-around" }}>
            {shown.map((m) => {
              const st = state.status[m.id] ?? "maybe";
              const isMe = m.id === me;
              const ring = st === "in" ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : st === "maybe" ? `0 0 0 2px ${c.card}, 0 0 0 3px ${c.divider}` : "none";
              return (
                <div
                  key={m.id}
                  style={{
                    position: "relative",
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <span style={{ position: "relative", display: "flex", borderRadius: "50%" }}>
                    <span style={{ display: "flex", borderRadius: "50%", boxShadow: ring, filter: st === "out" ? "opacity(0.45)" : undefined }}>
                      <Avatar user={m.id} size={24} />
                    </span>
                    {isMe && st === "maybe" && local.burst === 0 ? (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          boxShadow: `0 0 0 1.5px ${c.primary}`,
                          animation: "concertPulse 1.6s ease-in-out infinite",
                        }}
                      />
                    ) : null}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: "14px",
                      color: isMe && st === "maybe" ? c.link : c.secondaryText,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isMe && st === "maybe" ? "You?" : slotLabel(st)}
                  </span>
                  {isMe ? (
                    <>
                      <button
                        type="button"
                        aria-label={`You're ${st === "in" ? "going" : st === "maybe" ? "maybe" : "out"}. Tap to change`}
                        onClick={() => {
                          dispatch({ t: "rsvp", value: nextStatus });
                          if (nextStatus === "in") setLocal({ burst: local.burst + 1 });
                        }}
                        style={{
                          position: "absolute",
                          top: -2,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 44,
                          height: 44,
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          cursor: "pointer",
                        }}
                      />
                      {local.burst > 0 && st === "in" ? (
                        <>
                          {/* under 360 px the toast would sit on the panel line above; the ring and the burst already say it */}
                          {theme.width >= 360 ? (
                            <div
                              style={{
                                position: "absolute",
                                bottom: 48,
                                right: 0,
                                zIndex: 4,
                                width: "max-content",
                              }}
                            >
                              <Toast key={local.burst}>You're going</Toast>
                            </div>
                          ) : null}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 22,
                              left: "50%",
                              transform: "translateX(-50%)",
                              zIndex: 3,
                            }}
                          >
                            <Burst key={local.burst} emoji="💙" />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
            {hidden > 0 ? (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 1,
                }}
              >
                <More n={hidden} size={24} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
});
