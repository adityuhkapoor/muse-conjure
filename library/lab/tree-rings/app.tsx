import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  fitText,
  haptic,
  mix,
  pal,
  running,
  seedOf,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// The friend group as a tree stump seen from above: one ring per semester, as thick as the number
// of plans that semester, with knots where the big moments happened and each friend's face on the
// ring where they joined. Tap a ring to read it, leave a leaf on your favorite, and carve your
// initials into the bark.

type Params = {
  /** Card title */
  title: string;
  /** Semesters from the first (center) to now (outside): name, plans locked, and the moment that ring remembers */
  rings: { name: string; plans: number; moment: string }[];
  /** When each friend joined, as a ring index from 0 */
  joined: { name: string; ring: number }[];
  /** Who already carved their initials */
  carved: string[];
  /** Favorite rings already marked: who and which ring index */
  favs: { by: string; ring: number }[];
};

// @params
const P: Params = {
  title: "The six, in tree rings",
  rings: [
    { name: "Freshman fall", plans: 4, moment: "met in the Hollis line" },
    { name: "Freshman spring", plans: 7, moment: "first Golden Lantern run" },
    { name: "Sophomore fall", plans: 9, moment: "412 Pine lease signed" },
    { name: "Sophomore spring", plans: 12, moment: "Tsai Lin took the aux" },
    { name: "Junior fall", plans: 14, moment: "Lake Wren, the Sube in a puddle" },
    { name: "Junior spring", plans: 10, moment: "orgo survivors" },
    { name: "Senior fall", plans: 16, moment: "snow day on Miller Hill" },
  ],
  joined: [
    { name: "Aditya", ring: 0 },
    { name: "Calvin", ring: 0 },
    { name: "Arun", ring: 0 },
    { name: "Will", ring: 1 },
    { name: "Maya", ring: 2 },
    { name: "Tsai Lin", ring: 3 },
  ],
  carved: ["Maya", "Will", "Arun"],
  favs: [
    { by: "Maya", ring: 4 },
    { by: "Will", ring: 4 },
    { by: "Arun", ring: 6 },
  ],
};
// @end params

type Ring = { name: string; plans: number; moment: string };
type Fav = { user: string; ring: number; at: number };
type State = { title: string; rings: Ring[]; joined: { user: string; ring: number }[]; carved: { user: string; at: number }[]; favs: Fav[] };
type Action = { t: "carve" } | { t: "fav"; ring: number };
type Local = { ring: number };

const PIC_H = 238;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const total = (s: State) => s.rings.reduce((n, r) => n + r.plans, 0);

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const rings: Ring[] = [];
  for (const r of Array.isArray(P.rings) ? P.rings : []) {
    const name = clean(r?.name, 22);
    if (!name || rings.length >= 10) continue;
    rings.push({ name, plans: typeof r?.plans === "number" && Number.isFinite(r.plans) ? Math.max(0, Math.min(99, Math.round(r.plans))) : 0, moment: clean(r?.moment, 40) });
  }
  if (rings.length === 0) rings.push({ name: "This semester", plans: 0, moment: "" });
  const ringOk = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? Math.max(0, Math.min(rings.length - 1, v)) : 0);
  const joined: { user: string; ring: number }[] = [];
  for (const j of Array.isArray(P.joined) ? P.joined : []) {
    const name = clean(j?.name, 16);
    if (!name || joined.length >= 10) continue;
    const user = idFor(name);
    if (!joined.some((x) => x.user === user)) joined.push({ user, ring: ringOk(j?.ring) });
  }
  const carved: { user: string; at: number }[] = [];
  for (const n of Array.isArray(P.carved) ? P.carved : []) {
    const u = idFor(clean(n, 16));
    if (u !== "~" && !carved.some((x) => x.user === u)) carved.push({ user: u, at: 0 });
  }
  const favs: Fav[] = [];
  for (const f of Array.isArray(P.favs) ? P.favs : []) {
    const u = idFor(clean(f?.by, 16));
    if (u === "~" || favs.some((x) => x.user === u) || typeof f?.ring !== "number") continue;
    favs.push({ user: u, ring: ringOk(f.ring), at: 0 });
  }
  return { title: clean(P.title, 40) || "Tree rings", rings, joined, carved, favs };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const CSS =
  "@keyframes trCarve{from{stroke-dashoffset:40;opacity:.2}to{stroke-dashoffset:0;opacity:1}}" +
  "@keyframes trIn{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}" +
  ".tr-in{transform-box:fill-box;transform-origin:center;animation:trIn .5s cubic-bezier(.34,1.56,.64,1) both}" +
  "@media (prefers-reduced-motion:reduce){.tr-in{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Tree rings",
  summary: (s) => `${s.rings.length} semesters · ${total(s)} plans · ${s.carved.length} carved their initials`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "carve") {
      if (state.carved.some((x) => x.user === meta.user) || state.carved.length >= 16) return state;
      return { ...state, carved: [...state.carved, { user: meta.user, at: meta.time }] };
    }
    if (action.t === "fav") {
      const k = action.ring;
      if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k >= state.rings.length) return state;
      const mine = state.favs.find((f) => f.user === meta.user);
      const rest = state.favs.filter((f) => f.user !== meta.user);
      if (mine && mine.ring === k) return { ...state, favs: rest };
      return { ...state, favs: [...rest, { user: meta.user, ring: k, at: meta.time }] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const favs = state.favs.filter((f) => standIn(f.user) || inChat(ctx, f.user));
    return favs.length === state.favs.length ? state : { ...state, favs };
  },

  invariants: {
    "each person carves once": (s) => new Set(s.carved.map((x) => x.user)).size === s.carved.length && s.carved.length <= 16,
    "one leaf each, on a real ring": (s) => new Set(s.favs.map((f) => f.user)).size === s.favs.length && s.favs.every((f) => Number.isInteger(f.ring) && f.ring >= 0 && f.ring < s.rings.length),
    "leaves from the chat or the post": (s, ctx) => s.favs.every((f) => standIn(f.user) || inChat(ctx, f.user)),
  },

  transitions: {
    "carving adds only me, once": (p, n, a, m) => {
      if (a.t !== "carve" || p === n) return true;
      const last = n.carved[n.carved.length - 1];
      return n.carved.length === p.carved.length + 1 && !!last && last.user === m.user && last.at === m.time && !p.carved.some((x) => x.user === m.user);
    },
    "a first carve always cuts": (p, n, a, m, ctx) => a.t !== "carve" || !inChat(ctx, m.user) || p.carved.some((x) => x.user === m.user) || p.carved.length >= 16 || p !== n,
    "carvings never heal": (p, n) => p.carved.every((x, i) => same(x, n.carved[i])),
    "a leaf moves only mine": (p, n, a, m) => a.t !== "fav" || p === n || same(p.favs.filter((f) => f.user !== m.user), n.favs.filter((f) => f.user !== m.user)),
    "the same ring twice takes the leaf back, a new ring takes it": (p, n, a, m, ctx) => {
      if (a.t !== "fav" || !inChat(ctx, m.user) || !Number.isInteger(a.ring) || a.ring < 0 || a.ring >= p.rings.length) return true;
      const was = p.favs.find((f) => f.user === m.user);
      const now = n.favs.find((f) => f.user === m.user);
      return was?.ring === a.ring ? !now : !!now && now.ring === a.ring && now.at === m.time;
    },
    "the rings never change": (p, n) => same(p.rings, n.rings) && same(p.joined, n.joined),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.25 ? { t: "carve" } : r.next() < 0.05 ? { t: "fav", ring: 99 } : { t: "fav", ring: r.int(s.rings.length) }),

  local: { ring: -1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const here = members.some((m) => m.id === me);
    const n = state.rings.length;
    const sel = local.ring >= 0 && local.ring < n ? local.ring : n - 1;
    const carvedMe = state.carved.find((x) => x.user === me);
    const myFav = state.favs.find((f) => f.user === me);

    const cx = W / 2;
    const cy = PIC_H / 2 + 2;
    const Rmax = Math.min(96, W / 2 - 40);
    const pith = 9;
    const sum = Math.max(1, total(state));
    const widths = state.rings.map((r) => 6 + (r.plans / sum) * Math.max(0, Rmax - pith - 6 * n));
    const outer: number[] = [];
    widths.reduce((acc, w, i) => (outer[i] = acc + w), pith);
    const wob = (i: number, th: number) => 1 + 0.035 * Math.sin(3 * th + i * 1.7) + 0.02 * Math.sin(5 * th + i);
    const ringPath = (rr: number, i: number) => {
      let d = "";
      for (let k = 0; k <= 48; k++) {
        const th = (k / 48) * Math.PI * 2;
        const q = rr * wob(i, th);
        d += `${k ? "L" : "M"}${r1(cx + q * Math.cos(th))} ${r1(cy + q * Math.sin(th))}`;
      }
      return d + "Z";
    };
    const woodA = mix(p.crust, p.cream, 0.35);
    const woodB = mix(p.crust, p.brown, 0.2);
    const bark = mix(p.brown, p.dark, 0.35);
    const barkR = Rmax + 14;

    const art: Child[] = [
      <rect key="grass" x={0} y={0} width={W} height={PIC_H} fill={theme.mode === "dark" ? mix(p.grass, c.wash, 0.7) : mix(p.grass, c.card, 0.35)} />,
    ];
    for (let k = 0; k < 26; k++) {
      const x = Math.abs(Math.sin(k * 12.9898) * 43758.5453 % 1) * W;
      const y = Math.abs(Math.sin(k * 78.233) * 12543.21 % 1) * PIC_H;
      if (Math.hypot(x - cx, y - cy) < barkR + 10) continue;
      art.push(<path key={`g${k}`} d={`M${r1(x)} ${r1(y)} l-3 -7 M${r1(x)} ${r1(y)} l1 -9 M${r1(x)} ${r1(y)} l4 -6`} stroke={mix(p.leaf, p.grass, 0.3)} stroke-width={1.5} stroke-linecap="round" />);
    }
    art.push(<path key="bark" d={ringPath(barkR, 99)} fill={bark} />);
    for (let i = n - 1; i >= 0; i--) {
      const fill = i % 2 ? woodB : woodA;
      art.push(<path key={`r${i}`} d={ringPath(outer[i]!, i)} fill={i === sel ? mix(fill, p.yellow, 0.35) : fill} stroke={mix(woodB, p.brown, 0.5)} stroke-width={1} />);
    }
    art.push(<circle key="pith" cx={cx} cy={cy} r={pith} fill={mix(woodB, p.brown, 0.4)} />);
    // a crack, for character
    art.push(<path key="crack" d={`M${r1(cx + 4)} ${r1(cy - 2)} L${r1(cx + Rmax * 0.45)} ${r1(cy - Rmax * 0.2)} L${r1(cx + Rmax * 0.6)} ${r1(cy - Rmax * 0.16)}`} fill="none" stroke={mix(woodB, p.dark, 0.4)} stroke-width={1.2} />);
    // selected ring outline
    art.push(<path key="sel" d={ringPath(outer[sel]!, sel)} fill="none" stroke={c.primary} stroke-width={2.5} />);
    // knots for each ring's moment
    state.rings.forEach((r, i) => {
      if (!r.moment) return;
      const th = ((seedOf(r.name) % 360) * Math.PI) / 180;
      const rr = (outer[i]! - widths[i]! / 2) * wob(i, th);
      art.push(<ellipse key={`k${i}`} cx={r1(cx + rr * Math.cos(th))} cy={r1(cy + rr * Math.sin(th))} rx={Math.max(2, Math.min(5, widths[i]! / 2))} ry={Math.max(1.5, Math.min(3.5, widths[i]! / 3))} fill={mix(p.brown, p.dark, 0.3)} transform={`rotate(${r1((th * 180) / Math.PI + 90)} ${r1(cx + rr * Math.cos(th))} ${r1(cy + rr * Math.sin(th))})`} />);
    });
    // leaves on favorite rings
    state.rings.forEach((_, i) => {
      const f = state.favs.filter((x) => x.ring === i);
      f.forEach((fv, k) => {
        const th = -Math.PI / 2 + 0.5 + k * 0.32 + i * 0.9;
        const rr = (outer[i]! - widths[i]! / 2) * wob(i, th);
        const x = cx + rr * Math.cos(th);
        const y = cy + rr * Math.sin(th);
        art.push(
          <g key={`l${fv.user}`} {...(fv.at > 0 && running(fv.at, 600) !== null ? { class: "tr-in" } : {})}>
            <path d={`M${r1(x)} ${r1(y + 5)} Q${r1(x - 7)} ${r1(y - 2)} ${r1(x)} ${r1(y - 8)} Q${r1(x + 7)} ${r1(y - 2)} ${r1(x)} ${r1(y + 5)} Z`} fill={fv.user === me ? p.green : mix(p.green, p.leaf, 0.4)} stroke={p.leaf} stroke-width={0.8} />
          </g>,
        );
      });
    });
    // carved initials around the bark
    const carvedArt = state.carved.map((cv, k) => {
      const th = -Math.PI * 0.9 + (k * Math.PI * 2) / Math.max(8, state.carved.length);
      const x = cx + (barkR - 7) * Math.cos(th);
      const y = cy + (barkR - 7) * Math.sin(th);
      const fresh = cv.at > 0 && running(cv.at, 700) !== null;
      return (
        <text key={`c${cv.user}`} {...(fresh ? { class: "tr-in" } : {})} x={r1(x)} y={r1(y + 4)} font-size={11} font-weight={800} text-anchor="middle" fill={mix(p.cream, p.crust, 0.2)} transform={`rotate(${r1((th * 180) / Math.PI + 90)} ${r1(x)} ${r1(y)})`}>
          {initials(person(cv.user).name)}
        </text>
      );
    });

    // Faces on the ring where each friend joined.
    const faces = state.joined.map((j) => {
      const same = state.joined.filter((x) => x.ring === j.ring);
      const k = same.indexOf(j);
      const th = Math.PI * 0.2 + j.ring * 1.1 + (k * Math.PI * 2) / same.length;
      const rr = (outer[j.ring]! - widths[j.ring]! / 2) * wob(j.ring, th);
      return { j, x: cx + rr * Math.cos(th), y: cy + rr * Math.sin(th) };
    });

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "up") return;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d > barkR) return;
      const i = outer.findIndex((o) => d <= o + 1);
      setLocal({ ring: i < 0 ? n - 1 : i });
    };

    const ring = state.rings[sel]!;
    const leaves = state.favs.filter((f) => f.ring === sel);
    const joinedHere = state.joined.filter((j) => j.ring === sel);
    const titleFit = fitText(`${ring.name} · ${ring.plans} plans`, W - 120, { size: 15, weight: 700, min: 12 });
    const momentFit = ring.moment ? fitText(ring.moment, W - 120, { size: 13, min: 11 }) : null;
    const carveNow = carvedMe && carvedMe.at > 0 && running(carvedMe.at, 1600) !== null;

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={`${n} semesters · ${total(state)} plans · ${state.carved.length} carved`} />
        <div style={{ position: "relative", height: PIC_H, borderRadius: 12, overflow: "hidden" }}>
          <svg width={W} height={PIC_H} viewBox={`0 0 ${W} ${PIC_H}`} role="img" aria-label={`Tree stump with ${n} rings: ${state.rings.map((r) => `${r.name} ${r.plans} plans`).join(", ")}`} style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
            {carvedArt}
          </svg>
          {faces.map((f) => (
            <span key={`f${f.j.user}`} style={{ position: "absolute", left: r1(f.x - 9), top: r1(f.y - 9), borderRadius: 9, boxShadow: `0 0 0 1.5px ${woodA}`, display: "inline-flex", pointerEvents: "none" }}>
              <Avatar user={person(f.j.user)} size={18} />
            </span>
          ))}
          <div style={{ position: "absolute", inset: 0 }}>
            <Canvas height={PIC_H} label="Tap a ring to read that semester" onPointer={onPointer} draw={() => false} />
          </div>
          <div style={{ position: "absolute", left: 8, bottom: 8, height: 22, padding: "0 8px", borderRadius: 11, background: c.card, color: c.text, fontSize: 12, lineHeight: "22px", pointerEvents: "none" }}>center: first semester</div>
          {carveNow ? (
            <div style={{ position: "absolute", left: cx, top: cy - barkR, pointerEvents: "none" }}>
              <Burst key={carvedMe!.at} emoji="🪵" count={5} />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 48 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: titleFit.size, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{titleFit.text}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, height: 20 }}>
              {momentFit ? <span style={{ fontSize: momentFit.size, color: c.secondaryText, whiteSpace: "nowrap" }}>{momentFit.text}</span> : null}
              {joinedHere.length ? <Facepile users={joinedHere.map((j) => person(j.user))} max={3} size={16} /> : null}
            </div>
          </div>
          {here ? (
            <Button kind="secondary" onClick={() => { dispatch({ t: "fav", ring: sel }); haptic("light"); }}>
              {myFav?.ring === sel ? "Your leaf" : leaves.length ? `Leaf · ${leaves.length}` : "Leave a leaf"}
            </Button>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, height: 44 }}>
          {state.carved.length ? <Facepile users={state.carved.map((x) => person(x.user))} max={4} size={22} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {state.carved.length ? `${state.carved.length} initials in the bark` : "Nobody has carved in yet"}
          </span>
          {here && !carvedMe ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "carve" }); haptic("medium"); }}>
              Carve my initials
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
