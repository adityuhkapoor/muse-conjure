import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Facepile,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// Halloween, six costume stories, one runway. Each friend's costume walks out as a drawn character;
// viewers heart the ones they love. The final walk lines everyone up, crowns the most-hearted look
// and hands out the categories the group wrote (Calvin's cardboard robot: most structural).

type Params = {
  /** Title on the story, e.g. "Halloween runway" */
  title: string;
  /** Small line under it, e.g. "412 Pine · Oct 31" */
  where: string;
  /** 2 to 8 looks in walking order; kind is robot, ghost, pumpkin, witch, vampire, cat, dino or astronaut */
  looks: { by: string; costume: string; kind: string; category: string; hearts: string[] }[];
};

// @params
const P: Params = {
  title: "Halloween runway",
  where: "412 Pine · Oct 31",
  looks: [
    { by: "Calvin", costume: "cardboard robot", kind: "robot", category: "most structural", hearts: ["Maya", "Will", "Arun"] },
    { by: "Maya", costume: "spreadsheet witch", kind: "witch", category: "best effort", hearts: ["Tsai Lin", "Calvin"] },
    { by: "Arun", costume: "rice cooker pumpkin", kind: "pumpkin", category: "best snacks", hearts: ["Will", "Tsai Lin"] },
    { by: "Tsai Lin", costume: "dj vampire", kind: "vampire", category: "best aux", hearts: ["Maya"] },
    { by: "Will", costume: "sube-a-saurus", kind: "dino", category: "funniest", hearts: ["Arun"] },
    { by: "Aditya", costume: "lowkey a ghost", kind: "ghost", category: "most lowkey", hearts: [] },
  ],
};
// @end params

const KINDS = ["robot", "ghost", "pumpkin", "witch", "vampire", "cat", "dino", "astronaut"] as const;
type Kind = (typeof KINDS)[number];
type Look = { id: string; by: string; user: string; costume: string; kind: Kind; category: string; hearts: string[] };
type State = { title: string; where: string; looks: Look[]; finalAt: number; winner: string };
type Action = { t: "heart"; look: string } | { t: "final" };
type Local = { i: number; at: number; dir: number };

const STAGE_H = 452;
const TOPS: Record<string, number> = { robot: -148, ghost: -138, pumpkin: -140, witch: -170, vampire: -138, cat: -136, dino: -146, astronaut: -142 };
const WALK_MS = 900;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const totalHearts = (s: State) => s.looks.reduce((n, l) => n + l.hearts.length, 0);
const leader = (s: State) => s.looks.reduce((b, l) => (l.hearts.length > b.hearts.length ? l : b), s.looks[0]!);

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const looks: Look[] = [];
  for (const l of Array.isArray(P.looks) ? P.looks : []) {
    const by = clean(l?.by, 16);
    if (!by || looks.length >= 8) continue;
    const user = idFor(by);
    if (looks.some((x) => x.user === user)) continue;
    const kind = (KINDS as readonly string[]).includes(l?.kind) ? (l.kind as Kind) : KINDS[looks.length % KINDS.length]!;
    const hearts: string[] = [];
    for (const h of Array.isArray(l?.hearts) ? l.hearts : []) {
      const u = idFor(clean(h, 16));
      if (u !== user && !hearts.includes(u)) hearts.push(u);
    }
    looks.push({ id: `l${looks.length}`, by, user, costume: clean(l?.costume, 26) || kind, kind, category: clean(l?.category, 20), hearts });
  }
  if (looks.length === 0) looks.push({ id: "l0", by: "Someone", user: "~Someone", costume: "mystery ghost", kind: "ghost", category: "", hearts: [] });
  return { title: clean(P.title, 30) || "Costume runway", where: clean(P.where, 30), looks, finalAt: 0, winner: "" };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

/** A costumed character standing with feet at (0, 0), about 120 tall, facing us. */
function character(kind: Kind, p: Pal, skin: string, walking: boolean): Child {
  const legs = (col: string) => (
    <g>
      <g {...(walking ? { class: "cr-l1" } : {})}><rect x={-14} y={-26} width={10} height={24} rx={4} fill={col} /><ellipse cx={-10} cy={-2} rx={8} ry={4} fill={p.dark} /></g>
      <g {...(walking ? { class: "cr-l2" } : {})}><rect x={4} y={-26} width={10} height={24} rx={4} fill={col} /><ellipse cx={10} cy={-2} rx={8} ry={4} fill={p.dark} /></g>
    </g>
  );
  const face = (y: number, r: number) => (
    <g>
      <circle cx={0} cy={y} r={r} fill={skin} />
      <circle cx={-r * 0.35} cy={y - r * 0.05} r={r * 0.11} fill={p.dark} />
      <circle cx={r * 0.35} cy={y - r * 0.05} r={r * 0.11} fill={p.dark} />
      <path d={`M${r1(-r * 0.3)} ${r1(y + r * 0.35)} Q0 ${r1(y + r * 0.6)} ${r1(r * 0.3)} ${r1(y + r * 0.35)}`} fill="none" stroke={p.dark} stroke-width={2} stroke-linecap="round" />
      <circle cx={-r * 0.55} cy={y + r * 0.3} r={r * 0.14} fill={p.red} opacity={0.35} />
      <circle cx={r * 0.55} cy={y + r * 0.3} r={r * 0.14} fill={p.red} opacity={0.35} />
    </g>
  );
  if (kind === "robot") {
    const box = p.crust;
    const edge = mix(p.crust, p.brown, 0.6);
    return (
      <g>
        {legs(mix(p.soft, p.dark, 0.3))}
        <rect x={-44} y={-80} width={14} height={40} rx={3} fill={box} stroke={edge} stroke-width={1.5} />
        <rect x={30} y={-80} width={14} height={40} rx={3} fill={box} stroke={edge} stroke-width={1.5} />
        <rect x={-30} y={-86} width={60} height={62} rx={3} fill={box} stroke={edge} stroke-width={2} />
        <path d="M-30 -86 L-22 -92 H38 L30 -86" fill={mix(box, p.paper, 0.25)} stroke={edge} stroke-width={1.5} />
        <circle cx={-14} cy={-66} r={5} fill={p.red} /><circle cx={0} cy={-66} r={5} fill={p.yellow} /><circle cx={14} cy={-66} r={5} fill={p.green} />
        <rect x={-18} y={-50} width={36} height={14} rx={2} fill={mix(box, p.dark, 0.25)} />
        <rect x={-22} y={-126} width={44} height={38} rx={3} fill={box} stroke={edge} stroke-width={2} />
        <rect x={-14} y={-116} width={10} height={8} fill={p.dark} /><rect x={4} y={-116} width={10} height={8} fill={p.dark} />
        <rect x={-10} y={-102} width={20} height={4} rx={2} fill={p.dark} />
        <line x1={0} y1={-126} x2={0} y2={-140} stroke={edge} stroke-width={2} /><circle cx={0} cy={-142} r={4} fill={p.red} />
      </g>
    );
  }
  if (kind === "ghost")
    return (
      <g>
        <ellipse cx={-10} cy={-2} rx={8} ry={4} fill={p.dark} /><ellipse cx={10} cy={-2} rx={8} ry={4} fill={p.dark} />
        <path d="M-38 -8 Q-42 -60 -30 -100 Q-18 -136 0 -136 Q18 -136 30 -100 Q42 -60 38 -8 Q28 -16 19 -6 Q10 -16 0 -6 Q-10 -16 -19 -6 Q-28 -16 -38 -8 Z" fill={p.paper} stroke={mix(p.paper, p.dark, 0.25)} stroke-width={1.5} />
        <ellipse cx={-11} cy={-100} rx={5} ry={8} fill={p.dark} /><ellipse cx={11} cy={-100} rx={5} ry={8} fill={p.dark} />
        <ellipse cx={0} cy={-80} rx={6} ry={4} fill={p.dark} />
        <path d="M-34 -64 Q-50 -60 -48 -48 M34 -64 Q50 -60 48 -48" fill="none" stroke={mix(p.paper, p.dark, 0.25)} stroke-width={1.5} />
      </g>
    );
  if (kind === "pumpkin")
    return (
      <g>
        {legs(p.leaf)}
        <ellipse cx={0} cy={-58} rx={46} ry={38} fill={p.orange} />
        <ellipse cx={-22} cy={-58} rx={14} ry={36} fill="none" stroke={mix(p.orange, p.brown, 0.4)} stroke-width={2} />
        <ellipse cx={22} cy={-58} rx={14} ry={36} fill="none" stroke={mix(p.orange, p.brown, 0.4)} stroke-width={2} />
        <path d="M-20 -66 l8 -10 l8 10 Z M4 -66 l8 -10 l8 10 Z" fill={p.dark} />
        <path d="M-22 -48 Q0 -30 22 -48 L16 -46 L12 -40 L6 -46 L0 -38 L-6 -46 L-12 -40 L-16 -46 Z" fill={p.dark} />
        {face(-112, 16)}
        <path d="M-16 -122 Q0 -138 16 -122 Z" fill={p.leaf} /><rect x={-3} y={-136} width={6} height={10} rx={2} fill={p.brown} />
      </g>
    );
  if (kind === "witch")
    return (
      <g>
        {legs(p.dark)}
        <path d="M-40 -22 L-16 -92 H16 L40 -22 Z" fill={p.purple} />
        {[0, 1, 2].map((k) => <line key={k} x1={-30 + k * 2} y1={-40 - k * 16} x2={30 - k * 2} y2={-40 - k * 16} stroke={mix(p.purple, p.paper, 0.5)} stroke-width={1.2} />)}
        {[0, 1, 2].map((k) => <line key={`v${k}`} x1={-10 + k * 10} y1={-90} x2={-18 + k * 18} y2={-24} stroke={mix(p.purple, p.paper, 0.5)} stroke-width={1.2} />)}
        <rect x={-26} y={-50} width={10} height={8} fill={p.green} /><rect x={6} y={-66} width={10} height={8} fill={p.yellow} />
        {face(-106, 17)}
        <ellipse cx={0} cy={-120} rx={34} ry={6} fill={p.dark} />
        <path d="M-18 -122 L6 -168 L18 -122 Z" fill={p.dark} />
        <rect x={-17} y={-128} width={34} height={5} fill={p.green} />
        <line x1={44} y1={-110} x2={34} y2={-10} stroke={p.brown} stroke-width={3} stroke-linecap="round" />
        <path d="M30 -14 L28 4 L42 4 L40 -14 Z" fill={p.crust} />
      </g>
    );
  if (kind === "vampire")
    return (
      <g>
        {legs(p.dark)}
        <path d="M-44 -18 L-24 -96 H24 L44 -18 Q22 -26 0 -18 Q-22 -26 -44 -18 Z" fill={p.dark} />
        <path d="M-18 -94 L-10 -30 H10 L18 -94 Z" fill={p.red} />
        <path d="M-8 -94 H8 L4 -84 H-4 Z" fill={p.paper} />
        <path d="M-34 -102 L-22 -90 L-16 -110 Z M34 -102 L22 -90 L16 -110 Z" fill={mix(p.red, p.dark, 0.3)} />
        {face(-112, 17)}
        <path d="M-5 -102 l2 5 l2 -5 M1 -102 l2 5 l2 -5" fill={p.paper} />
        <path d="M-17 -118 Q0 -136 17 -118 L0 -122 Z" fill={p.dark} />
        <rect x={-30} y={-108} width={10} height={14} rx={4} fill={p.dark} /><rect x={20} y={-108} width={10} height={14} rx={4} fill={p.dark} />
      </g>
    );
  if (kind === "cat")
    return (
      <g>
        {legs(p.dark)}
        <rect x={-28} y={-90} width={56} height={66} rx={20} fill={p.dark} />
        <path d="M28 -40 Q56 -40 50 -80" fill="none" stroke={p.dark} stroke-width={6} stroke-linecap="round" />
        {face(-108, 18)}
        <path d="M-18 -116 L-14 -134 L-4 -122 Z M18 -116 L14 -134 L4 -122 Z" fill={p.dark} />
        <path d="M-8 -104 h-12 M-8 -100 h-12 M8 -104 h12 M8 -100 h12" stroke={p.dark} stroke-width={1} />
      </g>
    );
  if (kind === "dino")
    return (
      <g>
        {legs(p.green)}
        <path d="M24 -36 Q60 -30 64 -8 Q44 -20 22 -20 Z" fill={p.green} />
        <rect x={-30} y={-92} width={60} height={70} rx={24} fill={p.green} />
        <ellipse cx={0} cy={-52} rx={18} ry={24} fill={mix(p.green, p.paper, 0.45)} />
        {[0, 1, 2, 3].map((k) => <path key={k} d={`M${-6 + k * 2} ${-138 + k * 24} l10 -8 l2 12 Z`} fill={mix(p.green, p.yellow, 0.5)} transform={`translate(${24 + k * 4} 0)`} />)}
        <path d="M-26 -100 Q-30 -144 4 -144 Q34 -144 34 -110 Q34 -92 12 -92 H-20 Z" fill={p.green} />
        {face(-112, 14)}
      </g>
    );
  return (
    <g>
      {legs(p.paper)}
      <rect x={-30} y={-90} width={60} height={68} rx={18} fill={p.paper} stroke={mix(p.paper, p.dark, 0.25)} stroke-width={1.5} />
      <rect x={-14} y={-70} width={28} height={18} rx={3} fill={p.blue} />
      <circle cx={-6} cy={-61} r={3} fill={p.red} /><circle cx={6} cy={-61} r={3} fill={p.yellow} />
      <circle cx={0} cy={-112} r={28} fill={mix(p.sky, p.paper, 0.4)} stroke={mix(p.paper, p.dark, 0.3)} stroke-width={2} />
      {face(-110, 15)}
      <path d="M-18 -128 Q-8 -136 4 -134" fill="none" stroke={p.paper} stroke-width={3} stroke-linecap="round" />
    </g>
  );
}

const CSS =
  "@keyframes crL1{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}" +
  "@keyframes crL2{0%,100%{transform:translateY(-4px)}50%{transform:translateY(0)}}" +
  "@keyframes crSway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}" +
  "@keyframes crFloat{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-70px);opacity:0}}" +
  "@keyframes crSweep{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}" +
  ".cr-l1{animation:crL1 .5s ease-in-out infinite}.cr-l2{animation:crL2 .5s ease-in-out infinite}" +
  ".cr-sway{transform-box:fill-box;transform-origin:50% 100%;animation:crSway 1s ease-in-out infinite}" +
  ".cr-float{animation:crFloat 1.2s ease-out both}" +
  ".cr-sw1{transform-box:fill-box;transform-origin:50% 0;animation:crSweep 4s ease-in-out infinite}.cr-sw2{transform-box:fill-box;transform-origin:50% 0;animation:crSweep 4s ease-in-out infinite reverse}" +
  "@media (prefers-reduced-motion:reduce){.cr-l1,.cr-l2,.cr-sway,.cr-float,.cr-sw1,.cr-sw2{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Costume runway",
  summary: (s) => {
    if (s.finalAt > 0) {
      const w = s.looks.find((l) => l.id === s.winner);
      return w ? `${w.by}'s ${w.costume} wins best costume · ${w.hearts.length} hearts` : "The final walk is done";
    }
    return `${s.looks.length} costumes on the runway · ${totalHearts(s)} hearts so far`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user) || state.finalAt > 0) return state;
    if (action.t === "heart") {
      if (typeof action.look !== "string") return state;
      const look = state.looks.find((l) => l.id === action.look);
      if (!look || look.user === meta.user) return state;
      const hearts = look.hearts.includes(meta.user) ? look.hearts.filter((u) => u !== meta.user) : [...look.hearts, meta.user];
      return { ...state, looks: state.looks.map((l) => (l.id === look.id ? { ...l, hearts } : l)) };
    }
    if (action.t === "final") {
      if (totalHearts(state) === 0) return state;
      return { ...state, finalAt: meta.time, winner: leader(state).id };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    let changed = false;
    const looks = state.looks.map((l) => {
      const hearts = l.hearts.filter((u) => standIn(u) || inChat(ctx, u));
      if (hearts.length === l.hearts.length) return l;
      changed = true;
      return { ...l, hearts };
    });
    return changed ? { ...state, looks } : state;
  },

  invariants: {
    "a heart per viewer per look": (s) => s.looks.every((l) => new Set(l.hearts).size === l.hearts.length),
    "nobody hearts their own look": (s) => s.looks.every((l) => !l.hearts.includes(l.user)),
    "hearts come from the chat or the post": (s, ctx) => s.looks.every((l) => l.hearts.every((u) => standIn(u) || inChat(ctx, u))),
    "a final walk names a look": (s) => (s.finalAt === 0) === (s.winner === "") && (s.winner === "" || s.looks.some((l) => l.id === s.winner)),
    "each friend walks once": (s) => new Set(s.looks.map((l) => l.user)).size === s.looks.length,
  },

  transitions: {
    "a heart toggles only mine on one look": (p, n, a, m) => {
      if (a.t !== "heart" || p === n) return true;
      return p.looks.every((l, i) => {
        const q = n.looks[i]!;
        if (l.id !== a.look) return same(l, q);
        return l.hearts.includes(m.user) !== q.hearts.includes(m.user) && same(l.hearts.filter((u) => u !== m.user), q.hearts.filter((u) => u !== m.user));
      });
    },
    "hearting someone else's look lands before the final": (p, n, a, m, ctx) => {
      if (a.t !== "heart" || !inChat(ctx, m.user) || p.finalAt > 0) return true;
      const l = p.looks.find((x) => x.id === a.look);
      return !l || l.user === m.user || p !== n;
    },
    "the final crowns the most hearts": (p, n, a, m) => {
      if (n.finalAt === p.finalAt) return true;
      if (a.t !== "final" || p.finalAt !== 0 || n.finalAt !== m.time) return false;
      const top = Math.max(...p.looks.map((l) => l.hearts.length));
      const w = p.looks.find((l) => l.id === n.winner);
      return top > 0 && !!w && w.hearts.length === top && p.looks.findIndex((l) => l.hearts.length === top) === p.looks.indexOf(w);
    },
    "a runway with hearts can end": (p, n, a, m, ctx) => a.t !== "final" || !inChat(ctx, m.user) || p.finalAt > 0 || totalHearts(p) === 0 || n.finalAt === m.time,
    "after the final nothing moves": (p, n) => p.finalAt === 0 || same(p, n),
    "the looks never change": (p, n) => same(p.looks.map((l) => [l.id, l.user, l.costume, l.kind, l.category]), n.looks.map((l) => [l.id, l.user, l.costume, l.kind, l.category])),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.1 ? { t: "final" } : r.next() < 0.04 ? { t: "heart", look: "x" } : { t: "heart", look: r.pick(s.looks).id }),

  local: { i: 0, at: 0, dir: 1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const n = state.looks.length;
    const final = state.finalAt > 0;
    const i = Math.max(0, Math.min(n - 1, local.i));
    const look = state.looks[i]!;
    const here = members.some((m) => m.id === me);
    const mineLook = look.user === me;
    const hearted = look.hearts.includes(me);
    const walkE = local.at > 0 ? running(local.at, WALK_MS) : null;
    const walkK = walkE === null ? 1 : walkE / WALK_MS;
    const ease = 1 - (1 - walkK) ** 3;
    const skins = [mix(p.cream, p.brown, 0.25), mix(p.cream, p.brown, 0.5), mix(p.brown, p.cream, 0.3), mix(p.cream, p.brown, 0.1)];
    const skinOf = (l: Look) => skins[(state.looks.indexOf(l) * 3) % 4]!;
    const go = (k: number) => {
      const next = Math.max(0, Math.min(n - 1, k));
      if (next !== i) setLocal({ i: next, at: clock.peek(), dir: next > i ? 1 : -1 });
    };

    // Stage geometry.
    const H = STAGE_H;
    const bg1 = mix(p.purple, p.dark, 0.72);
    const bg2 = mix(p.purple, p.dark, 0.88);
    const rwTop = H * 0.4;
    const rwTopW = W * 0.26;
    const rwBotW = W * 0.86;
    const runway = `M${r1(W / 2 - rwTopW / 2)} ${r1(rwTop)} L${r1(W / 2 + rwTopW / 2)} ${r1(rwTop)} L${r1(W / 2 + rwBotW / 2)} ${H} L${r1(W / 2 - rwBotW / 2)} ${H} Z`;
    const bulbs: Child[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const y = rwTop + (H - rwTop) * t;
      const half = rwTopW / 2 + (rwBotW / 2 - rwTopW / 2) * t;
      bulbs.push(<circle key={`l${k}`} cx={r1(W / 2 - half)} cy={r1(y)} r={1.5 + 2 * t} fill={p.yellow} />, <circle key={`r${k}`} cx={r1(W / 2 + half)} cy={r1(y)} r={1.5 + 2 * t} fill={p.yellow} />);
    }
    const curtain: Child[] = [];
    for (let k = 0; k < 10; k++) curtain.push(<rect key={`c${k}`} x={r1((k * W) / 10)} y={0} width={r1(W / 10 + 1)} height={r1(rwTop - 4)} fill={k % 2 ? mix(p.red, p.dark, 0.55) : mix(p.red, p.dark, 0.45)} />);

    const stage: Child[] = [
      <rect key="bg" x={0} y={0} width={W} height={H} fill={bg2} />,
      ...curtain,
      <path key="val" d={`M0 0 H${W} V26 Q${W * 0.75} 40 ${W / 2} 28 Q${W * 0.25} 40 0 26 Z`} fill={mix(p.red, p.dark, 0.3)} />,
      <rect key="floor" x={0} y={rwTop - 4} width={W} height={H - rwTop + 4} fill={bg1} />,
      <g key="sp1" class="cr-sw1"><path d={`M${W * 0.12} 0 L${W * 0.36} ${H} L${W * 0.64} ${H} Z`} fill={p.yellow} opacity={0.1} /></g>,
      <g key="sp2" class="cr-sw2"><path d={`M${W * 0.88} 0 L${W * 0.36} ${H} L${W * 0.64} ${H} Z`} fill={p.yellow} opacity={0.08} /></g>,
      <path key="rw" d={runway} fill={mix(p.dark, p.paper, 0.12)} />,
      <path key="rwc" d={`M${W / 2} ${rwTop} L${W / 2} ${H}`} stroke={mix(p.red, p.dark, 0.2)} stroke-width={3} stroke-dasharray="10 8" />,
      ...bulbs,
    ];

    let figures: Child;
    let overlays: Child[] = [];
    if (!final) {
      // One look walking toward us.
      const s = 0.62 + 0.5 * ease;
      const y = rwTop + 40 + (H - 96 - rwTop - 40) * ease;
      figures = (
        <g transform={`translate(${r1(W / 2)} ${r1(y)}) scale(${r1(s * 100) / 100})`}>
          <ellipse cx={0} cy={0} rx={40} ry={8} fill={p.dark} opacity={0.4} />
          <g class="cr-sway">{character(look.kind, p, skinOf(look), walkE !== null)}</g>
        </g>
      );
      overlays = look.hearts.slice(-6).map((u, k) => (
        <div key={`a${u}`} style={{ position: "absolute", left: k % 2 ? W - 34 : 8, top: H - 150 + Math.floor(k / 2) * 40, borderRadius: 14, boxShadow: `0 0 0 2px ${p.red}` }}>
          <Avatar user={person(u)} size={26} />
        </div>
      ));
    } else {
      const winner = state.looks.find((l) => l.id === state.winner) ?? state.looks[0]!;
      const rest = state.looks.filter((l) => l.id !== winner.id);
      const slots = rest.length;
      const leftN = Math.ceil(slots / 2);
      const sideW = (W - 20 - 120) / 2;
      const per = sideW / Math.max(1, leftN);
      const sc = Math.min(0.48, per / 100);
      const posX = (k: number) => (k < leftN ? 10 + per * (k + 0.5) : W / 2 + 60 + (sideW / Math.max(1, slots - leftN)) * (k - leftN + 0.5));
      const slotW = (k: number) => (k < leftN ? per : sideW / Math.max(1, slots - leftN)) - 4;
      figures = (
        <g>
          {rest.map((l, k) => {
            const x = posX(k);
            const y = rwTop + 86;
            return (
              <g key={l.id} transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(sc * 100) / 100})`}>
                <g class="cr-sway" style={{ animationDelay: `${k * 0.15}s` }}>{character(l.kind, p, skinOf(l), false)}</g>
              </g>
            );
          })}
          <g transform={`translate(${r1(W / 2)} ${H - 92}) scale(0.9)`}>
            <ellipse cx={0} cy={0} rx={44} ry={9} fill={p.dark} opacity={0.4} />
            <g class="cr-sway">{character(winner.kind, p, skinOf(winner), false)}</g>
            <path d={`M-20 ${(TOPS[winner.kind] ?? -150) - 6} l0 -18 l10 10 l10 -16 l10 16 l10 -10 l0 18 Z`} fill={p.yellow} stroke={mix(p.yellow, p.orange, 0.6)} stroke-width={2} stroke-linejoin="round" />
          </g>
        </g>
      );
      overlays = rest.map((l, k) => {
        const x = posX(k);
        const w = 2 * slotW(k) - 2;
        const f = fitText(l.category || l.by, w - 8, { size: 11, weight: 600, min: 10 });
        return (
          <div key={`cat${l.id}`} style={{ position: "absolute", left: r1(x - w / 2), top: rwTop + 92 + (k % 2) * 18, width: w, textAlign: "center" }}>
            <div style={{ display: "inline-block", maxWidth: w, padding: "1px 4px", borderRadius: 4, background: p.yellow, color: p.dark, fontSize: f.size, fontWeight: 600, lineHeight: "14px", whiteSpace: "nowrap" }}>{f.text}</div>
          </div>
        );
      });
    }

    const segs = state.looks.map((l, k) => (
      <div key={l.id} style={{ flex: 1, height: 3, borderRadius: 2, background: final || k <= i ? c.onPrimary : mix(bg2, c.onPrimary, 0.35) }} />
    ));

    const winnerLook = state.looks.find((l) => l.id === state.winner);
    const tag = final && winnerLook ? `${winnerLook.by} as ${winnerLook.costume}` : `${look.by} as ${look.costume}`;
    const tagFit = fitText(tag, W - 32, { size: 20, weight: 700, min: 13 });
    const chip = final ? "best costume" : look.category;
    const atEnd = i === n - 1;
    const canFinal = !final && totalHearts(state) > 0 && atEnd && here;
    const finalNow = final && running(state.finalAt, 2400) !== null;

    return (
      <div>
        <style>{CSS}</style>
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden", background: bg2 }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={final ? `Final walk: ${tag} wins best costume` : `${tag} walking the runway, ${look.hearts.length} hearts`} style={{ position: "absolute", left: 0, top: 0 }}>
            {stage}
            {figures}
          </svg>
          {overlays}
          <div style={{ position: "absolute", left: 10, right: 10, top: 8, display: "flex", gap: 3 }}>{segs}</div>
          <div style={{ position: "absolute", left: 10, right: 10, top: 18, height: 40, display: "flex", alignItems: "center", gap: 8 }}>
            <span class="m-mark" aria-hidden="true" style={{ width: 24, height: 24 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.title}</div>
              <div style={{ fontSize: 12, lineHeight: "16px", color: c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{final ? `${state.where ? `${state.where} · ` : ""}final walk` : `${state.where ? `${state.where} · ` : ""}${i + 1} of ${n}`}</div>
            </div>
          </div>
          {!final ? (
            <>
              <button type="button" aria-label="Previous look" disabled={i === 0} onClick={() => go(i - 1)} style={{ position: "absolute", left: 0, top: 70, width: W * 0.3, height: H - 170 }} />
              <button type="button" aria-label="Next look" disabled={atEnd} onClick={() => go(i + 1)} style={{ position: "absolute", right: 0, top: 70, width: W * 0.3, height: H - 170 }} />
            </>
          ) : null}
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
            {chip ? (
              <div style={{ display: "inline-block", height: 22, padding: "0 8px", borderRadius: 11, background: p.yellow, color: p.dark, fontSize: 12, fontWeight: 700, lineHeight: "22px", marginBottom: 4 }}>{chip}</div>
            ) : null}
            <div style={{ fontSize: tagFit.size, lineHeight: "26px", fontWeight: 700, color: c.onPrimary, whiteSpace: "nowrap" }}>{tagFit.text}</div>
          </div>
          {finalNow ? (
            <div style={{ position: "absolute", left: "50%", top: H - 230, pointerEvents: "none" }}>
              <Burst key={state.finalAt} emoji="👑" />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, height: 44 }}>
          {(final ? winnerLook?.hearts ?? [] : look.hearts).length ? (
            <Facepile users={(final ? winnerLook?.hearts ?? [] : look.hearts).map(person)} max={4} size={22} />
          ) : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {final ? `${winnerLook?.hearts.length ?? 0} hearts · ${totalHearts(state)} in all` : look.hearts.length ? `${look.hearts.length} ${look.hearts.length === 1 ? "heart" : "hearts"}` : mineLook ? "Your look" : "No hearts yet"}
          </span>
          {!final && here && !mineLook ? (
            <div style={{ position: "relative" }}>
              <Button
                kind={canFinal ? "secondary" : "primary"}
                onClick={() => {
                  dispatch({ t: "heart", look: look.id });
                  haptic("light");
                }}
              >
                {hearted ? "Hearted" : "Heart it"}
              </Button>
              {hearted ? (
                <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                  <Burst key={`${look.id}h`} emoji="❤️" count={4} />
                </div>
              ) : null}
            </div>
          ) : null}
          {!final && !atEnd ? (
            <Button kind="secondary" onClick={() => go(i + 1)}>Next</Button>
          ) : null}
          {canFinal ? (
            <Button
              kind="primary"
              onClick={() => {
                dispatch({ t: "final" });
                haptic("success");
              }}
            >
              Final walk
            </Button>
          ) : null}
        </div>
        {finalNow && winnerLook ? <Toast key={state.finalAt}>{`${winnerLook.by} takes the crown`}</Toast> : null}
      </div>
    );
  },
});
