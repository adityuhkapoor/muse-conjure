import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Dance counts: the reel's dance broken into its eight counts, each drawn as a stick-figure pose. A
// big dancer loops the whole thing on the beat. Tap the counts you have nailed and your face stacks
// under them; the shortest stack is where the group is stuck. Practice picks the slot the stuck
// people can make, and booking it is one tap.

type Pose = "step" | "clap" | "point" | "up" | "spin" | "dip" | "kick" | "bow" | "sway" | "hip";
type Params = {
  /** Card title */
  title: string;
  /** Who shared the reel, and what they said */
  from: string;
  quote: string;
  /** Exactly 8 counts: a short name and the pose to draw */
  counts: { name: string; pose: Pose }[];
  /** Who already nailed which counts (1 to 8) */
  nailed: { who: string; counts: number[] }[];
  /** 1 to 4 practice slots, and who is free for each */
  slots: { label: string; free: string[] }[];
};

// @params
const P: Params = {
  title: "Formal dance, eight counts",
  from: "Maya",
  quote: "we're learning this for formal",
  counts: [
    { name: "step out", pose: "step" },
    { name: "clap", pose: "clap" },
    { name: "point", pose: "point" },
    { name: "hands up", pose: "up" },
    { name: "hip", pose: "hip" },
    { name: "the spin", pose: "spin" },
    { name: "kick", pose: "kick" },
    { name: "the dip", pose: "dip" },
  ],
  nailed: [
    { who: "Maya", counts: [1, 2, 3, 4, 5, 6, 7, 8] },
    { who: "Tsai Lin", counts: [1, 2, 3, 4, 5, 7, 8] },
    { who: "Arun", counts: [1, 2, 3, 4, 5, 7] },
    { who: "Will", counts: [1, 2, 3, 7] },
    { who: "Calvin", counts: [1, 2] },
  ],
  slots: [
    { label: "Thu 9pm · Larkin basement", free: ["Calvin", "Will", "Tsai Lin", "Aditya"] },
    { label: "Fri 4pm · the Quad", free: ["Maya", "Arun"] },
    { label: "Sun 2pm · 412 Pine", free: ["Will", "Calvin", "Arun", "Aditya", "Tsai Lin", "Maya"] },
  ],
};
// @end params

type State = {
  title: string;
  from: string;
  quote: string;
  counts: { name: string; pose: Pose }[];
  /** per count, who has it */
  nailed: string[][];
  cast: string[];
  slots: { label: string; free: string[] }[];
  booked: { slot: number; at: number; by: string; coming: string[] } | null;
};
type Action = { t: "nail"; i: number } | { t: "book" } | { t: "come" };
type Local = { toast: number; bursts: number };

const POSES: Record<Pose, number[]> = {
  // left arm (2), right arm (2), left leg (2), right leg (2), lean; degrees, 0 is straight down, + is to the viewer's right
  step: [-25, -15, 25, 15, -12, -4, 28, 8, 0],
  clap: [-60, 30, 60, -30, -8, 0, 8, 0, 0],
  point: [-30, -20, 140, 150, -14, 0, 10, 0, -6],
  up: [-160, -170, 160, 170, -10, 0, 10, 0, 0],
  hip: [-80, 20, 30, 20, -6, 0, 18, 0, 8],
  spin: [-95, -95, 95, 95, 0, 0, 40, 80, 0],
  kick: [-120, -150, 60, 30, -6, 0, 80, 90, -6],
  dip: [-100, -140, 40, 20, -35, 0, 20, 30, 22],
  bow: [-10, 0, 10, 0, -6, 0, 6, 0, 40],
  sway: [-140, -160, 40, 20, -6, 0, 12, 0, -10],
};
const KINDS = Object.keys(POSES) as Pose[];
const BEAT = 560;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const idx = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
/** The count fewest people have: where the group is stuck (the later one on a tie). */
const stuck = (s: State) => s.nailed.reduce((b, l, i) => (l.length <= (s.nailed[b]?.length ?? 99) ? i : b), 0);
/** Everyone in the dance: the chat, plus people named in the params. */
const dancers = (s: State, members: { id: string }[]) => [...new Set([...members.map((m) => m.id), ...s.cast])];
/** The practice slot most of the people still missing the stuck count can make. */
function bestSlot(s: State, ids: string[]): number {
  const k = stuck(s);
  const need = ids.filter((u) => !(s.nailed[k] ?? []).includes(u));
  let best = 0, score = -1;
  s.slots.forEach((sl, i) => {
    const n = sl.free.filter((u) => need.includes(u)).length * 10 + sl.free.length;
    if (n > score) (best = i), (score = n);
  });
  return best;
}

function initState(ctx: Ctx): State {
  const counts = (Array.isArray(P.counts) ? P.counts : []).slice(0, 8).map((c, i) => ({ name: clean(c?.name, 14) || `count ${i + 1}`, pose: KINDS.includes(c?.pose) ? c.pose : KINDS[i % KINDS.length]! }));
  while (counts.length < 8) counts.push({ name: `count ${counts.length + 1}`, pose: KINDS[counts.length % KINDS.length]! });
  const nailed: string[][] = counts.map(() => []);
  const cast: string[] = [];
  for (const n of Array.isArray(P.nailed) ? P.nailed : []) {
    const name = clean(n?.who, 20);
    if (!name) continue;
    const id = idFor(ctx, name);
    if (cast.includes(id)) continue;
    cast.push(id);
    for (const k of Array.isArray(n.counts) ? n.counts : []) if (Number.isInteger(k) && k >= 1 && k <= 8 && !nailed[k - 1]!.includes(id)) nailed[k - 1]!.push(id);
  }
  const slots = (Array.isArray(P.slots) ? P.slots : []).slice(0, 4).map((s) => {
    const free: string[] = [];
    for (const f of Array.isArray(s?.free) ? s.free : []) {
      const nm = clean(f, 20);
      if (!nm) continue;
      const id = idFor(ctx, nm);
      if (!free.includes(id)) free.push(id);
      if (!cast.includes(id)) cast.push(id);
    }
    return { label: clean(s?.label, 34) || "Practice", free };
  });
  return { title: clean(P.title, 40) || "Eight counts", from: clean(P.from, 20), quote: clean(P.quote, 50), counts, nailed, cast, slots, booked: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "nail") {
    if (!idx(a.i, s.counts.length)) return s;
    const l = s.nailed[a.i]!;
    return { ...s, nailed: s.nailed.map((x, i) => (i !== a.i ? x : l.includes(u) ? l.filter((v) => v !== u) : [...l, u])) };
  }
  if (a.t === "book") {
    if (s.booked || !s.slots.length) return s;
    return { ...s, booked: { slot: bestSlot(s, dancers(s, ctx.members)), at: Math.max(1, m.time), by: u, coming: [u] } };
  }
  if (a.t === "come") {
    if (!s.booked) return s;
    const c = s.booked.coming;
    return { ...s, booked: { ...s.booked, coming: c.includes(u) ? c.filter((v) => v !== u) : [...c, u] } };
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

/** A stick figure for joint angles `j`, standing in a box `s` tall, centered at x. */
function Figure({ j, x, s, ink, head, spin }: { j: number[]; x: number; s: number; ink: string; head: string; spin?: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const u = s / 10;
  const lean = rad(j[8] ?? 0);
  const hip = { x, y: s * 0.6 };
  const sh = { x: hip.x + Math.sin(lean) * u * 3, y: hip.y - Math.cos(lean) * u * 3 };
  const hd = { x: sh.x + Math.sin(lean) * u * 1.3, y: sh.y - Math.cos(lean) * u * 1.3 };
  const limb = (o: { x: number; y: number }, a1: number, a2: number, l: number) => {
    const m = { x: o.x + Math.sin(rad(a1)) * l, y: o.y + Math.cos(rad(a1)) * l };
    const e = { x: m.x + Math.sin(rad(a2)) * l, y: m.y + Math.cos(rad(a2)) * l };
    return `M ${o.x.toFixed(1)} ${o.y.toFixed(1)} L ${m.x.toFixed(1)} ${m.y.toFixed(1)} L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  };
  const w = Math.max(1.6, s / 26);
  const d = [limb(sh, j[0]!, j[1]!, u * 1.5), limb(sh, j[2]!, j[3]!, u * 1.5), limb(hip, j[4]!, j[5]!, u * 1.9), limb(hip, j[6]!, j[7]!, u * 1.9), `M ${hip.x} ${hip.y} L ${sh.x.toFixed(1)} ${sh.y.toFixed(1)}`].join(" ");
  return (
    <g>
      {spin ? <ellipse cx={x} cy={s * 0.94} rx={u * 2.6} ry={u * 0.5} fill="none" stroke={head} stroke-width={w * 0.7} stroke-dasharray={`${u} ${u * 0.7}`} transform={`rotate(${spin} ${x} ${s * 0.94})`} /> : null}
      <path d={d} fill="none" stroke={ink} stroke-width={w} stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={hd.x} cy={hd.y} r={u * 0.95} fill={head} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Dance counts",
  summary: (s) => {
    const k = stuck(s);
    const base = `Dance counts: stuck on count ${k + 1}, ${s.counts[k]?.name ?? ""} · ${s.nailed[k]?.length ?? 0} have it`;
    return s.booked ? `${base} · practice ${s.slots[s.booked.slot]?.label ?? ""}, ${s.booked.coming.length} coming` : base;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const keep = (u: string) => inChat(ctx, u) || s.cast.includes(u);
    return { ...s, nailed: s.nailed.map((l) => l.filter(keep)), booked: s.booked ? { ...s.booked, coming: s.booked.coming.filter((u) => inChat(ctx, u)) } : null };
  },

  invariants: {
    "eight counts": (s) => s.counts.length === 8 && s.nailed.length === 8,
    "one mark per person per count": (s) => s.nailed.every((l) => new Set(l).size === l.length),
    "marks come from the chat or the people named": (s, ctx) => s.nailed.every((l) => l.every((u) => inChat(ctx, u) || s.cast.includes(u))),
    "the booking is a real slot": (s) => s.booked === null || (Number.isInteger(s.booked.slot) && s.booked.slot >= 0 && s.booked.slot < s.slots.length && s.booked.at > 0),
    "coming is unique and here": (s, ctx) => s.booked === null || (new Set(s.booked.coming).size === s.booked.coming.length && s.booked.coming.every((u) => inChat(ctx, u))),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a tap flips only my mark on that count": (p, n, a, m) => {
      if (a.t !== "nail" || p === n) return true;
      const was = p.nailed[a.i]!.includes(m.user);
      return n.nailed[a.i]!.includes(m.user) !== was && n.nailed[a.i]!.length === p.nailed[a.i]!.length + (was ? -1 : 1) && n.nailed.every((l, i) => i === a.i || l === p.nailed[i]);
    },
    "practice books the slot the stuck people can make": (p, n, a, m, ctx) =>
      a.t !== "book" || p === n || (p.booked === null && !!n.booked && n.booked.slot === bestSlot(p, dancers(p, ctx.members)) && n.booked.by === m.user && n.booked.coming.join() === m.user && n.booked.at === Math.max(1, m.time)),
    "coming toggles only me": (p, n, a, m) => {
      if (a.t !== "come" || p === n) return true;
      if (!p.booked || !n.booked) return false;
      const was = p.booked.coming.includes(m.user);
      return n.booked.coming.includes(m.user) !== was && n.booked.coming.length === p.booked.coming.length + (was ? -1 : 1) && n.booked.slot === p.booked.slot;
    },
    "marks only change by tapping counts": (p, n, a) => a.t === "nail" || n.nailed === p.nailed,
    "the booking only changes by booking and coming": (p, n, a) => a.t === "book" || a.t === "come" || n.booked === p.booked,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.1) return { t: "book" };
    if (s.booked && k < 0.3) return { t: "come" };
    return { t: "nail", i: r.int(8) };
  },

  local: { toast: 0, bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const beat = now / BEAT;
    const cur = Math.floor(beat) % 8;
    const nxt = (cur + 1) % 8;
    const f = Math.min(1, (beat % 1) * 1.8);
    const ease = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    const ja = POSES[state.counts[cur]!.pose];
    const jb = POSES[state.counts[nxt]!.pose];
    const j = ja.map((v, i) => v + (jb[i]! - v) * ease);
    const k = stuck(state);
    const all = dancers(state, members);
    const have = state.nailed[k]!.length;
    const slot = state.booked ? state.booked.slot : bestSlot(state, all);
    const sl = state.slots[slot];
    const stuckPeople = all.filter((u) => !state.nailed[k]!.includes(u));
    const canMake = sl ? sl.free.filter((u) => stuckPeople.includes(u)).length : 0;
    const mineN = state.nailed.filter((l) => l.includes(me)).length;
    const wide = W / 8 >= 44;
    const cellW = wide ? W / 8 : W / 4;
    const barH = wide ? 30 : 16;
    const ink = c.text;
    const stage = theme.mode === "dark" ? mix(p.dark, c.card, 0.25) : mix(p.dark, c.card, 0.06);
    const total = state.nailed.reduce((n, l) => n + l.length, 0);
    const nameK = fitText(state.counts[k]!.name, W - 150, { size: 20, min: 14, weight: 700 });
    const coming = state.booked?.coming ?? [];

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.from ? `From ${state.from}'s reel · ` : ""}${total} counts nailed so far`} />
        {/* the stage: the dancer loops the whole thing on the beat */}
        <div style={{ position: "relative", height: 150, marginTop: 4, borderRadius: 14, background: stage, overflow: "hidden" }}>
          <svg width={W} height={150} viewBox={`0 0 ${W} 150`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <polygon points={`70,0 100,0 150,150 20,150`} fill={p.yellow} opacity={0.18} />
            <ellipse cx={85} cy={138} rx={50} ry={9} fill={p.yellow} opacity={0.3} />
            <g transform="translate(0 6)">
              <Figure j={j} x={85} s={136} ink={c.onPrimary} head={p.yellow} spin={state.counts[cur]!.pose === "spin" ? now / 3 : 0} />
            </g>
            {Array.from({ length: 8 }, (_, i) => (
              <circle key={i} cx={176 + i * 12} cy={130} r={i === cur ? 4.5 : 3} fill={i === cur ? p.yellow : mix(c.onPrimary, stage, 0.6)} />
            ))}
          </svg>
          <span style={{ position: "absolute", left: 168, top: 14, fontSize: 13, lineHeight: "16px", color: c.onPrimary }}>{`Count ${cur + 1}`}</span>
          <span style={{ position: "absolute", left: 168, top: 32, right: 10, fontSize: 30, lineHeight: "36px", fontWeight: 800, color: p.yellow }}>{`${cur + 1}`}</span>
          <span style={{ position: "absolute", left: 168, top: 70, right: 10, fontSize: 13, lineHeight: "16px", color: c.onPrimary }}>{`Stuck on ${k + 1}:`}</span>
          <span style={{ position: "absolute", left: 168, top: 86, right: 10, fontSize: nameK.size, lineHeight: "24px", fontWeight: 700, color: c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.counts[k]!.name}</span>
          <span style={{ position: "absolute", left: 168, top: 110, right: 10, fontSize: 12, lineHeight: "14px", color: c.onPrimary }}>{`${have} of ${all.length} have it`}</span>
        </div>

        {/* the eight counts: tap the ones you have nailed */}
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", marginTop: 8 }}>
          {state.counts.map((ct, i) => {
            const l = state.nailed[i]!;
            const mine = l.includes(me);
            const isStuck = i === k;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={mine}
                aria-label={`Count ${i + 1}, ${ct.name}: ${l.length} nailed it${mine ? ", you too" : ""}`}
                onClick={() => {
                  haptic(mine ? "light" : "success");
                  dispatch({ t: "nail", i });
                }}
                style={{ position: "relative", width: cellW, height: wide ? 128 : 112, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <span style={{ position: "absolute", left: 2, right: 2, top: 0, height: 74, borderRadius: 10, background: mine ? c.selected : isStuck ? mix(c.card, p.red, 0.12) : c.wash, boxShadow: isStuck ? `inset 0 0 0 1.5px ${p.red}` : i === cur ? `inset 0 0 0 1.5px ${c.divider}` : undefined }} />
                <svg width={cellW} height={56} viewBox={`0 0 ${cellW} 56`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 4 }}>
                  <Figure j={POSES[ct.pose]} x={cellW / 2} s={54} ink={ink} head={mine ? c.primary : isStuck ? p.red : c.secondaryText} />
                </svg>
                <span style={{ position: "absolute", left: 0, right: 0, top: 56, textAlign: "center", fontSize: 13, lineHeight: "16px", fontWeight: 700, color: isStuck ? c.text : c.secondaryText }}>{i + 1}</span>
                {/* the bar of how many have it: the short one is where everyone is stuck */}
                <span style={{ position: "absolute", left: "50%", top: 80, marginLeft: -9, width: 18, height: barH, borderRadius: 5, background: c.wash, overflow: "hidden" }}>
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round((barH * l.length) / Math.max(1, all.length)), background: isStuck ? p.red : mine ? c.primary : c.secondaryText }} />
                </span>
                <span style={{ position: "absolute", left: 0, right: 0, top: 82 + barH, textAlign: "center", fontSize: 12, lineHeight: "14px", color: c.text }}>{l.length}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mineN ? `You have ${mineN} of 8 · tap a count to change it` : state.quote && state.from ? `${state.from}: “${state.quote}” · tap the counts you have` : "Tap the counts you have nailed"}
        </div>

        {/* practice picks itself */}
        <div style={{ marginTop: 10 }}>
          {state.booked && sl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail={`${coming.length} coming · drilling count ${k + 1}`}>{sl.label}</Locked>
              </div>
              <Button kind="secondary" onClick={() => { haptic("light"); dispatch({ t: "come" }); }}>{coming.includes(me) ? "Can't make it" : "I'm coming"}</Button>
            </div>
          ) : sl ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, minHeight: 24 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "18px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`Practice ${sl.label}`}</span>
                <Facepile users={sl.free.filter((u) => stuckPeople.includes(u))} max={4} size={20} />
              </div>
              <Button kind="primary" wide onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "book" }); }}>
                Book practice
              </Button>
              <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{`${canMake} of the ${stuckPeople.length} stuck on ${k + 1} can make it`}</div>
            </>
          ) : null}
        </div>
        {local.toast > 0 && state.booked ? <Toast key={local.toast}>{`Practice booked · ${sl?.label ?? ""}`}</Toast> : null}
      </div>
    );
  },
});
