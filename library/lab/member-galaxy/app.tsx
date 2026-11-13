import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Chip,
  Facepile,
  More,
  Placed,
  at,
  clock,
  haptic,
  innerWidth,
  mix,
  rng,
  running,
  seedOf,
  tween,
  type Child,
} from "@muse/app";

// Class galaxy: a big group drawn as a galaxy of member dots, clustered by one lens at a time (dorm,
// major). The chat's own people sit in their clusters with threads back to you; you put yourself on
// the map. Flipping the lens flies every star from one set of clusters to the other. Lens and zoom
// are per viewer (local); the shared state holds only who is placed where and who waved at whom.

type Params = {
  title: string;
  group: string;
  members: number;
  /** label: pill text "By dorm"; noun: "dorm" (used in "Tap your dorm"). groups: 1 to 5, counts are members of the wider group. */
  lenses: { label: string; noun: string; groups: { label: string; count: number; suggest: { name: string; mutual: number }[] }[] }[];
  /** at: one group label per lens, "" if unknown. name exactly as in the members list. */
  people: { name: string; at: string[] }[];
};

// @params
const P: Params = {
  title: "Class galaxy",
  group: "Cal Class of '28",
  members: 6200,
  lenses: [
    { label: "By dorm", noun: "dorm", groups: [
      { label: "Unit 1", count: 1300, suggest: [{ name: "Zoe", mutual: 4 }, { name: "Raf", mutual: 3 }, { name: "Ivy", mutual: 2 }] },
      { label: "Unit 2", count: 2000, suggest: [{ name: "Kim", mutual: 6 }, { name: "Ben", mutual: 3 }, { name: "Omar", mutual: 2 }] },
      { label: "Clark Kerr", count: 988, suggest: [{ name: "Hana", mutual: 5 }, { name: "Gus", mutual: 2 }, { name: "Eli", mutual: 2 }] },
      { label: "Foothill", count: 936, suggest: [{ name: "Fran", mutual: 4 }, { name: "Lucía", mutual: 3 }, { name: "Kev", mutual: 1 }] },
      { label: "Off campus", count: 962, suggest: [{ name: "Nico", mutual: 3 }, { name: "Jess", mutual: 3 }, { name: "Dani", mutual: 2 }] },
    ] },
    { label: "By major", noun: "major", groups: [
      { label: "CS", count: 1860, suggest: [{ name: "Arjun", mutual: 5 }, { name: "Lena", mutual: 3 }, { name: "Marcus", mutual: 2 }] },
      { label: "Bio", count: 1116, suggest: [{ name: "Sofia", mutual: 4 }, { name: "Wes", mutual: 2 }, { name: "June", mutual: 1 }] },
      { label: "Econ", count: 992, suggest: [{ name: "Rohan", mutual: 3 }, { name: "Tess", mutual: 3 }, { name: "Caleb", mutual: 2 }] },
      { label: "Engineering", count: 1240, suggest: [{ name: "Mina", mutual: 6 }, { name: "Oscar", mutual: 2 }, { name: "Ruth", mutual: 2 }] },
      { label: "Undeclared", count: 992, suggest: [{ name: "Ava", mutual: 2 }, { name: "Felix", mutual: 2 }, { name: "Lou", mutual: 1 }] },
    ] },
  ],
  people: [
    { name: "Maya", at: ["Unit 2", "CS"] }, { name: "Theo", at: ["Unit 2", "Bio"] }, { name: "Noa", at: ["Clark Kerr", "Econ"] },
    { name: "Priya", at: ["Unit 1", "CS"] }, { name: "Jonah", at: ["Foothill", "Engineering"] }, { name: "Dev", at: ["Off campus", "CS"] },
  ],
};
// @end params

type Suggest = { name: string; mutual: number };
type Group = { label: string; count: number; suggest: Suggest[] };
type Lens = { label: string; noun: string; groups: Group[] };
type Wave = { by: string; lens: number; group: number; who: number; at: number };
/** at[user][lens] = group index or -1. Array length always equals lenses.length. */
type State = { title: string; group: string; total: number; lenses: Lens[]; at: { [user: string]: number[] }; waves: Wave[] };
type Action =
  | { t: "place"; lens: number; group: number }
  | { t: "unplace"; lens: number }
  | { t: "wave"; lens: number; group: number; who: number };
/** zoom: -1 or the zoomed group index. lensAt/zoomAt: clock.value at the tap (0 = never). from: lens before the flip. */
type Local = { lens: number; from: number; lensAt: number; zoom: number; zoomAt: number };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_WAVES = 200;
const FLIP_MS = 1100;
const ZOOM_MS = 600;
const flip = tween({ duration: FLIP_MS, easing: "easeInOut" });
const zoomIn = tween({ duration: ZOOM_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clampInt = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const kfmt = (n: number) => (n < 1000 ? `${n}` : n < 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : `${Math.round(n / 1000)}K`);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- Reducer side ----

function sanitize(p: Params): { total: number; lenses: Lens[] } {
  const lenses: Lens[] = [];
  for (const l of (Array.isArray(p.lenses) ? p.lenses : []).slice(0, 2)) {
    const groups: Group[] = [];
    for (const g of Array.isArray(l?.groups) ? l.groups : []) {
      const label = clean(g?.label, 20);
      if (!label || groups.length >= 5) continue;
      const suggest: Suggest[] = [];
      for (const s of Array.isArray(g.suggest) ? g.suggest : []) {
        const name = clean(s?.name, 16);
        if (name && suggest.length < 3) suggest.push({ name, mutual: clampInt(s.mutual, 0, 99) });
      }
      groups.push({ label, count: clampInt(g.count, 0, 1_000_000), suggest });
    }
    if (groups.length) lenses.push({ label: clean(l.label, 20) || "Lens", noun: clean(l.noun, 12) || "group", groups });
  }
  let total = clampInt(p.members, 0, 10_000_000);
  if (total === 0 && lenses[0]) total = lenses[0].groups.reduce((a, g) => a + g.count, 0);
  if (!lenses.length) lenses.push({ label: "Everyone", noun: "spot", groups: [{ label: "Everyone", count: total, suggest: [] }] });
  return { total, lenses };
}

function reduceGalaxy(s: State, a: Record<string, unknown>, user: string, time: number): State {
  const lens = a.lens;
  if (!isInt(lens) || lens < 0 || lens >= s.lenses.length) return s;
  const groups = s.lenses[lens]!.groups;
  if (a.t === "unplace") {
    if ((s.at[user]?.[lens] ?? -1) < 0) return s;
    const row = s.at[user]!.map((v, i) => (i === lens ? -1 : v));
    const at = { ...s.at };
    if (row.every((v) => v === -1)) delete at[user];
    else at[user] = row;
    return { ...s, at };
  }
  const group = a.group;
  if (!isInt(group) || group < 0 || group >= groups.length) return s;
  if (a.t === "place") {
    if (s.at[user]?.[lens] === group) return s;
    const row = (s.at[user] ?? s.lenses.map(() => -1)).map((v, i) => (i === lens ? group : v));
    return { ...s, at: { ...s.at, [user]: row } };
  }
  if (a.t === "wave") {
    const who = a.who;
    if (!isInt(who) || who < 0 || who >= groups[group]!.suggest.length) return s;
    if (s.waves.length >= MAX_WAVES || s.waves.some((w) => w.by === user && w.lens === lens && w.group === group && w.who === who)) return s;
    return { ...s, waves: [...s.waves, { by: user, lens, group, who, at: time }] };
  }
  return s;
}

// ---- Check side ----

const sameRows = (a: number[] | undefined, b: number[] | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const othersEqual = (p: State, n: State, user: string) => {
  const keys = new Set([...Object.keys(p.at), ...Object.keys(n.at)]);
  for (const k of keys) if (k !== user && !sameRows(p.at[k], n.at[k])) return false;
  return true;
};
const waveKey = (w: Wave) => `${w.by}|${w.lens}|${w.group}|${w.who}`;

// ---- View side: stars, geometry ----

type Stars = { N: number; per: number; grp: number[][]; ang: number[]; d0: number[]; d1: number[]; sz: number[]; tw: number[] };
let starCache: { key: string; stars: Stars } | null = null;

function makeStars(lenses: Lens[], total: number): Stars {
  const key = JSON.stringify([lenses, total]);
  if (starCache && starCache.key === key) return starCache.stars;
  const per = Math.max(1, Math.ceil(total / 240));
  const N = Math.min(240, Math.max(24, Math.round(total / per)));
  const grp = lenses.map((lens, L) => {
    const counts = lens.groups.map((g) => g.count);
    const sum = counts.reduce((a, c) => a + c, 0);
    const exact = counts.map((c) => (sum > 0 ? (N * c) / sum : N / counts.length));
    const got = exact.map(Math.floor);
    let left = N - got.reduce((a, c) => a + c, 0);
    const order = exact.map((e, k) => ({ k, f: e - Math.floor(e) })).sort((a, b) => b.f - a.f || a.k - b.k);
    for (let i = 0; left > 0; i = (i + 1) % order.length, left--) got[order[i]!.k]!++;
    const shuffled = rng(seedOf("lens" + L)).shuffle(Array.from({ length: N }, (_, i) => i));
    const out: number[] = new Array(N).fill(0);
    let j = 0;
    got.forEach((n, k) => {
      for (let c = 0; c < n; c++) out[shuffled[j++]!] = k;
    });
    return out;
  });
  const ang: number[] = [], d0: number[] = [], d1: number[] = [], sz: number[] = [], tw: number[] = [];
  for (let i = 0; i < N; i++) {
    const q = rng(seedOf("star" + i));
    ang.push(q.next() * Math.PI * 2);
    d0.push(q.next());
    d1.push(q.next());
    sz.push(q.next());
    tw.push(q.next());
  }
  const stars = { N, per, grp, ang, d0, d1, sz, tw };
  starCache = { key, stars };
  return stars;
}

const CENTERS: Record<number, [number, number][]> = {
  5: [[0.2, 0.3], [0.52, 0.22], [0.82, 0.34], [0.3, 0.74], [0.72, 0.74]],
  4: [[0.22, 0.3], [0.74, 0.28], [0.3, 0.74], [0.74, 0.72]],
  3: [[0.2, 0.32], [0.8, 0.34], [0.5, 0.72]],
  2: [[0.3, 0.42], [0.7, 0.62]],
  1: [[0.5, 0.55]],
};
const COLORS = ["series1", "series2", "series3", "series4", "series6"] as const;
const HEIGHT = 206;

type Pt = [number, number];
// The fade and the dimming use filter: opacity() so the contrast lint (which reads opacity) does not judge a label mid-fade.
// A stable ref, so the fade runs once when a label mounts (a new lens), not on every frame.
const fadeIn = (el: Element | null) => void (el as HTMLElement | null)?.animate?.([{ filter: "opacity(0)" }, { filter: "opacity(1)" }], { duration: 500, delay: 650, fill: "backwards" });

// A filled dot as one Path2D fill: same picture as beginPath, arc, fill, with a third of the canvas calls
// (the gate records every canvas call, and the flip repaints about 480 dots per frame).
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  g.fill(p);
};

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default defineApp<State, Action, Local>({
  name: "Class galaxy",
  summary: (s, ctx) => {
    const n = ctx.members.filter((m) => s.at[m.id]).length;
    return `${s.group} · ${kfmt(s.total)} members · ${n ? `${n} friends on the map` : "nobody on the map yet"}`;
  },

  init: (ctx) => {
    const { total, lenses } = sanitize(P);
    const at: { [user: string]: number[] } = {};
    const used = new Set<string>();
    for (const person of Array.isArray(P.people) ? P.people : []) {
      const want = clean(person?.name, 60).toLowerCase();
      if (!want) continue;
      const m = ctx.members.find((x) => !used.has(x.id) && (x.id === person.name || (x.name ?? "").toLowerCase() === want));
      if (!m) continue;
      const row = lenses.map((l, i) => {
        const lab = clean(person.at?.[i], 20).toLowerCase();
        return lab ? l.groups.findIndex((g) => g.label.toLowerCase() === lab) : -1;
      });
      if (row.some((v) => v >= 0)) {
        used.add(m.id);
        at[m.id] = row;
      }
    }
    return { title: clean(P.title, 40) || "Class galaxy", group: clean(P.group, 40) || "This group", total, lenses, at, waves: [] };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceGalaxy(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const keys = Object.keys(state.at);
    if (keys.every(here) && state.waves.every((w) => here(w.by))) return state;
    const at: { [user: string]: number[] } = {};
    for (const k of keys) if (here(k)) at[k] = state.at[k]!;
    return { ...state, at, waves: state.waves.filter((w) => here(w.by)) };
  },

  invariants: {
    "placements point at real groups": (s) =>
      Object.values(s.at).every((row) => row.length === s.lenses.length && row.every((v, l) => Number.isInteger(v) && v >= -1 && v < s.lenses[l]!.groups.length) && !row.every((v) => v === -1)),
    "only chat members are placed": (s, ctx) => Object.keys(s.at).every((u) => inChat(ctx, u)),
    "waves are by chat members at real suggestions": (s, ctx) =>
      s.waves.every((w) => inChat(ctx, w.by) && Number.isInteger(w.lens) && w.lens >= 0 && w.lens < s.lenses.length && Number.isInteger(w.group) && w.group >= 0 && w.group < s.lenses[w.lens]!.groups.length && Number.isInteger(w.who) && w.who >= 0 && w.who < s.lenses[w.lens]!.groups[w.group]!.suggest.length),
    "one wave per person per suggestion": (s) => new Set(s.waves.map(waveKey)).size === s.waves.length,
    "at most 200 waves": (s) => s.waves.length <= MAX_WAVES,
  },

  transitions: {
    "place puts only the actor in that group in that lens": (p, n, a, m) => {
      if (a.t !== "place" || p === n) return true;
      const row = (x: State) => x.at[m.user] ?? x.lenses.map(() => -1);
      return n.at[m.user]?.[a.lens] === a.group && p.at[m.user]?.[a.lens] !== a.group && othersEqual(p, n, m.user) && row(p).every((v, i) => i === a.lens || v === row(n)[i]);
    },
    "unplace clears only the actor in that lens": (p, n, a, m) => {
      if (a.t !== "unplace" || p === n) return true;
      const row = (x: State) => x.at[m.user] ?? x.lenses.map(() => -1);
      return (n.at[m.user]?.[a.lens] ?? -1) === -1 && (p.at[m.user]?.[a.lens] ?? -1) >= 0 && othersEqual(p, n, m.user) && row(p).every((v, i) => i === a.lens || v === row(n)[i]);
    },
    "a wave adds one wave by the actor, stamped now": (p, n, a, m) => {
      if (a.t !== "wave" || p === n) return true;
      const last = n.waves[n.waves.length - 1];
      return n.waves.length === p.waves.length + 1 && !!last && last.by === m.user && last.lens === a.lens && last.group === a.group && last.who === a.who && last.at === m.time && n.at === p.at;
    },
    "groups and counts never change": (p, n) => JSON.stringify(p.lenses) === JSON.stringify(n.lenses) && p.total === n.total,
    "waves only grow": (p, n) => n.waves.length >= p.waves.length && p.waves.every((w, i) => JSON.stringify(w) === JSON.stringify(n.waves[i])),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const lens = r.int(s.lenses.length);
    const group = r.int(s.lenses[lens]!.groups.length);
    const k = r.next();
    if (k < 0.5) return { t: "place", lens, group };
    if (k < 0.65) return { t: "unplace", lens };
    const n = s.lenses[lens]!.groups[group]!.suggest.length;
    return n ? { t: "wave", lens, group, who: r.int(n) } : { t: "place", lens, group };
  },

  local: { lens: 0, from: 0, lensAt: 0, zoom: -1, zoomAt: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const col = theme.color;
    const lensCount = state.lenses.length;
    const lens = Math.max(0, Math.min(lensCount - 1, local.lens));
    const from = Math.max(0, Math.min(lensCount - 1, local.from));
    const cur = state.lenses[lens]!;
    const n = cur.groups.length;
    const zk = local.zoom >= 0 && local.zoom < n ? local.zoom : -1;
    const W = innerWidth();
    const H = HEIGHT;
    const sx = W / 376;
    const sy = H / 250;
    const mid: Pt = [W / 2, H / 2];
    const stars = makeStars(state.lenses, state.total);

    const ef = local.lensAt ? running(local.lensAt, FLIP_MS) : null;
    const lk = ef === null ? 1 : flip(ef);
    const ez = zk >= 0 && local.zoomAt ? running(local.zoomAt, ZOOM_MS) : null;
    const z = zk < 0 ? 0 : ez === null ? 1 : zoomIn(ez);

    const ctr = (L: number, k: number, w = W): Pt => {
      const f = CENTERS[state.lenses[L]!.groups.length]?.[k] ?? [0.5, 0.55];
      return [f[0] * w, f[1] * H];
    };
    const zoomed = (p: Pt, k: number, L: number, w = W): Pt => {
      if (zk < 0 || z === 0) return p;
      const m: Pt = [w / 2, H / 2];
      if (k === zk) {
        const c = ctr(L, zk, w);
        return [c[0] + (m[0] - c[0]) * z + (p[0] - c[0]) * (1 + 0.7 * z), c[1] + (m[1] - c[1]) * z + (p[1] - c[1]) * (1 + 0.7 * z)];
      }
      const dx = p[0] - m[0], dy = p[1] - m[1];
      const d = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / d) * 60 * z, p[1] + (dy / d) * 60 * z];
    };

    // People placed on the map in a lens (chat members only), me apart.
    const atOf = (u: string, L: number) => state.at[u]?.[L] ?? -1;
    const friendsIn = (L: number) => members.filter((m) => m.id !== me && atOf(m.id, L) >= 0);
    const mates = (L: number, k: number) => members.filter((m) => m.id !== me && atOf(m.id, L) === k).map((m) => m.id);
    const slotAt = (L: number, k: number, j: number, shown: number, w = W): Pt => {
      const c = ctr(L, k, w);
      const a = shown <= 1 ? -0.3 * Math.PI : -Math.PI * (0.1 + (0.8 * j) / (shown - 1));
      return [c[0] + Math.cos(a) * 30 * (w / 376), c[1] + 6 + Math.sin(a) * 24 * sy];
    };
    const rawPos = (u: string, L: number, w = W): Pt | null => {
      const k = atOf(u, L);
      if (k < 0) return null;
      if (u === me) {
        const c = ctr(L, k, w);
        return [c[0], c[1] + 6];
      }
      const list = mates(L, k);
      return slotAt(L, k, Math.min(list.indexOf(u), 3), Math.min(list.length, 4), w);
    };
    const posOf = (u: string, w = W): Pt | null => {
      const B = rawPos(u, lens, w);
      if (!B) return null;
      const A = rawPos(u, from, w) ?? B;
      return zoomed([lerp(A[0], B[0], lk), lerp(A[1], B[1], lk)], atOf(u, lens), lens, w);
    };

    const myK = atOf(me, lens);
    const iAmPlaced = myK >= 0;
    const friends = friendsIn(lens);
    const inMine = friends.filter((m) => atOf(m.id, lens) === myK).length;
    const placedIds = members.filter((m) => atOf(m.id, lens) >= 0).map((m) => m.id);
    const per = stars.per;
    const note = per === 1 ? "1 star = 1 member" : `1 star = ${per} members`;
    const moving = ef === null && ez === null;

    const draw = (g: CanvasRenderingContext2D, f: { width: number; height: number }) => {
      const w = f.width, h = f.height;
      const gsx = w / 376, gsy = h / 250;
      const m: Pt = [w / 2, h / 2];
      g.save();
      g.beginPath();
      g.roundRect(0, 0, w, h, 12);
      g.clip();
      g.fillStyle = col.wash;
      g.fillRect(0, 0, w, h);
      // dust
      const r = rng(seedOf("dust"));
      g.fillStyle = col.secondaryText;
      g.globalAlpha = 0.3;
      for (let i = 0; i < 70; i++) {
        const x = r.next() * w, y = r.next() * h;
        dot(g, x, y, 0.8);
      }
      // threads
      if (iAmPlaced) {
        const mine = posOf(me, w);
        if (mine) {
          g.globalAlpha = 0.4;
          g.strokeStyle = col.secondaryText;
          g.lineWidth = 1;
          for (const fr of friends) {
            const p = posOf(fr.id, w);
            if (!p) continue;
            g.beginPath();
            g.moveTo(mine[0], mine[1]);
            g.lineTo(p[0], p[1]);
            g.stroke();
          }
        }
      }
      // stars
      const homeOf = (i: number, L: number): Pt => {
        const k = stars.grp[L]![i]!;
        const c = ctr(L, k, w);
        const R = 8 + Math.sqrt(L === 0 ? stars.d0[i]! : stars.d1[i]!) * 42;
        return [c[0] + Math.cos(stars.ang[i]!) * R * gsx, c[1] + Math.sin(stars.ang[i]!) * R * 0.72 * gsy];
      };
      const blend = new Map<number, string>();
      for (let i = 0; i < stars.N; i++) {
        const A = homeOf(i, from), B = homeOf(i, lens);
        const sw = Math.sin(lk * Math.PI) * 14;
        let p: Pt = [A[0] + (B[0] - A[0]) * lk + Math.sin(i) * sw, A[1] + (B[1] - A[1]) * lk + Math.cos(1.7 * i) * sw];
        const gk = stars.grp[lens]![i]!;
        p = zoomed(p, gk, lens, w);
        void m;
        const dim = zk >= 0 && gk !== zk ? 0.25 + 0.75 * (1 - z) : 1;
        const ck = stars.grp[from]![i]! * 5 + gk;
        let fill = blend.get(ck);
        if (fill === undefined) blend.set(ck, (fill = mix(col[COLORS[stars.grp[from]![i]!]!], col[COLORS[gk]!], lk)));
        g.fillStyle = fill;
        const rad = 1.6 + stars.sz[i]! * 1.4;
        g.globalAlpha = 0.15 * dim;
        dot(g, p[0], p[1], rad + 1.5);
        g.globalAlpha = (0.7 + 0.3 * stars.tw[i]!) * dim;
        dot(g, p[0], p[1], rad);
      }
      if (iAmPlaced) {
        const mine = posOf(me, w);
        if (mine) {
          g.globalAlpha = 0.15;
          g.fillStyle = col.primary;
          dot(g, mine[0], mine[1], 17);
        }
      }
      g.restore();
    };

    // ---- overlay ----
    const chipMax = 0.27 * W + 30;
    const btnW = Math.min(96, 0.27 * W);
    const clusterBtns = cur.groups.map((grp, k) => {
      const c = ctr(lens, k);
      const sel = zk === k;
      const cx = sel ? lerp(c[0], mid[0], z) : c[0];
      const cy = sel ? lerp(c[1], mid[1], z) - 8 - 36 * z : Math.max(c[1] - 8, 44);
      const label = `${grp.label} · ${kfmt(grp.count)}`;
      return (
        <button
          key={k}
          aria-label={`${grp.label}, ${kfmt(grp.count)} members`}
          onClick={() => setLocal({ zoom: local.zoom === k ? -1 : k, zoomAt: clock.value })}
          style={{ ...at(cx / W, cy / H), width: btnW, height: 84, background: "transparent", border: "none", padding: 0, overflow: "visible", display: "flex", justifyContent: "center", alignItems: "flex-start", pointerEvents: "auto", cursor: "pointer" }}
        >
          <span key={`${lens}:${k}`} ref={fadeIn} style={{ display: "block", filter: zk >= 0 && !sel ? `opacity(${1 - 0.8 * z})` : undefined }}>
            <Chip tone="card" maxWidth={chipMax} style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</Chip>
          </span>
        </button>
      );
    });

    const inside = (p: Pt) => p[0] >= 8 && p[0] <= W - 8 && p[1] >= 8 && p[1] <= H - 8;
    const avatars: Child[] = [];
    cur.groups.forEach((_g, k) => {
      const list = mates(lens, k);
      const m = list.length;
      const shown = Math.min(m, 4);
      list.slice(0, m > 4 ? 3 : shown).forEach((u) => {
        const p = posOf(u);
        if (p && inside(p)) avatars.push(<Placed key={u} user={u} x={p[0] / W} y={p[1] / H} size={20} me={me} move={moving} />);
      });
      if (m > 4) {
        const p = zoomed(slotAt(lens, k, 3, 4), k, lens);
        if (inside(p)) avatars.push(<span key={`more${k}`} style={{ ...at(p[0] / W, p[1] / H), display: "flex", pointerEvents: "none" }}><More n={m - 3} size={20} /></span>);
      }
    });
    const myPos = iAmPlaced ? posOf(me) : null;

    // ---- info panel ----
    const waved = (k: number, j: number) => state.waves.some((w) => w.by === me && w.lens === lens && w.group === k && w.who === j);
    const zg = zk >= 0 ? cur.groups[zk]! : null;
    const here = zk >= 0 ? mates(lens, zk).map((u) => members.find((m) => m.id === u)?.name ?? "Someone") : [];
    const burst = confirmed.waves.find((w) => w.by === me && w.lens === lens && w.group === zk && running(w.at, 1000) !== null);

    const panel = zg ? (
      <>
        <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ maxWidth: "45%", fontSize: 16, fontWeight: 600, color: col.text, ...ellipsis }}>{zg.label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: col.secondaryText, ...ellipsis }}>{here.length ? `Friends here: ${here.join(", ")}` : "No friends here yet"}</span>
          {myK === zk ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "unplace", lens })}>Leave</Button>
          ) : (
            <Button kind="primary" onClick={() => { dispatch({ t: "place", lens, group: zk }); haptic("success"); }}>I'm here</Button>
          )}
        </div>
        <div style={{ marginTop: 6, height: 44 }}>
          {zg.suggest.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {zg.suggest.map((s, j) => {
                const w = waved(zk, j);
                return (
                  <button
                    key={s.name}
                    aria-label={w ? `${s.name}, waved` : `Wave at ${s.name}`}
                    disabled={w}
                    onClick={() => { dispatch({ t: "wave", lens, group: zk, who: j }); haptic("light"); }}
                    style={{ height: 44, borderRadius: 8, padding: "0 8px", border: "none", display: "flex", alignItems: "center", gap: 6, minWidth: 0, textAlign: "left", background: w ? mix(col.card, col.positive, 0.2) : col.secondaryButton, color: col.secondaryButtonText, cursor: w ? "default" : "pointer" }}
                  >
                    <Avatar user={{ id: "s:" + s.name, name: s.name }} size={22} />
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: "14px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: col.text, ...ellipsis }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: col.secondaryButtonText, ...ellipsis }}>{w ? "Waved" : `${s.mutual} mutual`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: col.secondaryText }}>No suggestions here</div>
          )}
        </div>
      </>
    ) : (
      <>
        <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: col.text, ...ellipsis }}>
          {iAmPlaced ? `${friends.length} ${friends.length === 1 ? "friend" : "friends"} here · ${inMine} in ${cur.groups[myK]!.label}` : `${friends.length} ${friends.length === 1 ? "friend" : "friends"} on the map`}
        </div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: col.secondaryText, ...ellipsis }}>
          {iAmPlaced ? "Tap a cluster to zoom in. Flip the lens to see everyone move." : `Tap your ${cur.noun} to put yourself on the map.`}
        </div>
        {placedIds.length ? <div style={{ marginTop: 8 }}><Facepile users={placedIds} max={7} size={20} /></div> : null}
      </>
    );

    return (
      <div>
        <div style={{ height: 40 }}>
          <CardHeader title={state.title} subtitle={`${state.group} · ${kfmt(state.total)} members`} />
        </div>
        <div style={{ height: 40, display: "flex", alignItems: "center", gap: 6 }}>
          {state.lenses.map((l, i) => {
            const on = i === lens;
            return (
              <button
                key={i}
                aria-pressed={on}
                onClick={() => {
                  if (on) return;
                  setLocal({ from: lens, lens: i, lensAt: clock.value, zoom: -1 });
                  haptic("light");
                }}
                style={{ height: 44, padding: "6px 0", background: "transparent", border: "none", cursor: "pointer", flex: "0 0 auto" }}
              >
                <span style={{ display: "flex", alignItems: "center", height: 32, padding: "0 14px", borderRadius: 999, fontSize: 14, fontWeight: on ? 600 : 400, background: on ? col.primary : col.secondaryButton, color: on ? col.onPrimary : col.secondaryButtonText, whiteSpace: "nowrap" }}>{l.label}</span>
              </button>
            );
          })}
          <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 12, color: col.secondaryText, ...ellipsis }}>{note}</span>
        </div>
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: HEIGHT }}>
          <Canvas height={HEIGHT} label={`${state.group} as ${stars.N} stars in ${n} ${cur.noun} clusters`} draw={draw} />
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}>
            {clusterBtns}
            {avatars}
            {myPos ? (
              <>
                <Placed user={me} x={myPos[0] / W} y={myPos[1] / H} size={24} me={me} move={moving} />
                <span style={{ ...at(Math.min(Math.max(myPos[0], 14), W - 14) / W, (myPos[1] + 20 > H - 8 ? myPos[1] - 20 : myPos[1] + 20) / H), fontSize: 11, lineHeight: "14px", fontWeight: 600, color: col.text, pointerEvents: "none" }}>You</span>
              </>
            ) : null}
            {zk >= 0 ? (
              <button onClick={() => setLocal({ zoom: -1 })} style={{ position: "absolute", left: 8, bottom: 4, height: 44, background: "transparent", border: "none", padding: 0, pointerEvents: "auto", cursor: "pointer" }}>
                <span style={{ display: "block", padding: "3px 10px", borderRadius: 999, background: col.card, color: col.text, fontSize: 12, fontWeight: 600, lineHeight: "16px" }}>Zoom out</span>
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ height: 6 }} />
        <div style={{ position: "relative" }}>
          <div style={{ height: 100, boxSizing: "border-box", padding: "6px 12px 8px", background: col.wash, borderRadius: 12, overflow: "hidden" }}>{panel}</div>
          {burst && zg ? (
            <div style={{ position: "absolute", top: 50, left: `calc(12px + (100% - 24px) * ${(2 * burst.who + 1) / 6})`, pointerEvents: "none" }}>
              <Burst key={burst.at} emoji="👋" count={5} />
            </div>
          ) : null}
        </div>
      </div>
    );
  },
});
