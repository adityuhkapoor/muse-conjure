import {
  defineApp,
  Avatar,
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

// One scrapbook page for the semester, made together. Pick a drawn sticker from the tray (a
// dumpling, the rice cooker, Calvin's alarm clock, the Sube) and tap the page to slap it down
// wherever you want, tilted and signed with your face. Three stickers each; peel your last one off
// if you change your mind.

type Params = {
  /** Card title */
  title: string;
  /** Handwritten heading on the page, e.g. "fall '26" */
  heading: string;
  /** Up to 6 stickers in the tray: dumpling, ricecooker, alarm, car, headphones, sheet, pizza, sled, coffee, star */
  tray: string[];
  /** Stickers already on the page: who, which, and where (x and y from 0 to 1) */
  stickers: { by: string; kind: string; x: number; y: number }[];
};

// @params
const P: Params = {
  title: "Our fall '26 page",
  heading: "fall '26",
  tray: ["dumpling", "ricecooker", "alarm", "car", "headphones", "sheet"],
  stickers: [
    { by: "Arun", kind: "ricecooker", x: 0.2, y: 0.62 },
    { by: "Calvin", kind: "alarm", x: 0.78, y: 0.3 },
    { by: "Maya", kind: "sheet", x: 0.55, y: 0.7 },
    { by: "Will", kind: "car", x: 0.36, y: 0.32 },
    { by: "Tsai Lin", kind: "headphones", x: 0.84, y: 0.74 },
    { by: "Arun", kind: "dumpling", x: 0.6, y: 0.36 },
  ],
};
// @end params

const KINDS = ["dumpling", "ricecooker", "alarm", "car", "headphones", "sheet", "pizza", "sled", "coffee", "star"] as const;
type Kind = (typeof KINDS)[number];
type Sticker = { id: string; user: string; kind: Kind; x: number; y: number; at: number };
type State = { title: string; heading: string; tray: Kind[]; stickers: Sticker[] };
type Action = { t: "stick"; kind: string; x: number; y: number } | { t: "peel" };
type Local = { pick: string };

const PAGE_H = 218;
const EACH = 3;
const MAX = 40;
const NAMES: Record<Kind, string> = { dumpling: "dumpling", ricecooker: "rice cooker", alarm: "alarm clock", car: "car", headphones: "headphones", sheet: "spreadsheet", pizza: "pizza slice", sled: "sled", coffee: "coffee", star: "gold star" };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);
const okPos = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
const mineCount = (s: State, u: string) => s.stickers.filter((x) => x.user === u).length;

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const tray: Kind[] = [];
  for (const k of Array.isArray(P.tray) ? P.tray : []) if (isKind(k) && !tray.includes(k) && tray.length < 6) tray.push(k);
  for (const k of KINDS) if (tray.length < 6 && !tray.includes(k)) tray.push(k);
  const stickers: Sticker[] = [];
  for (const s of Array.isArray(P.stickers) ? P.stickers : []) {
    const by = clean(s?.by, 16);
    if (!by || !isKind(s?.kind) || stickers.length >= MAX) continue;
    const user = idFor(by);
    if (mineCount({ title: "", heading: "", tray, stickers }, user) >= EACH) continue;
    const f = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(0.06, Math.min(0.94, v)) * 1000) : 500);
    stickers.push({ id: `p${stickers.length}`, user, kind: s.kind, x: f(s?.x), y: f(s?.y), at: 0 });
  }
  return { title: clean(P.title, 40) || "Scrapbook", heading: clean(P.heading, 20), tray, stickers };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

/** A die-cut sticker centered at (0, 0), about 46 across. */
function art(kind: Kind, p: Pal): Child {
  const ink = p.dark;
  const base = <circle cx={0} cy={0} r={23} fill={p.paper} stroke={mix(p.paper, ink, 0.15)} stroke-width={1} />;
  let body: Child;
  if (kind === "dumpling")
    body = (
      <g>
        <path d="M-15 6 Q-14 -12 0 -13 Q14 -12 15 6 Z" fill={mix(p.cream, p.paper, 0.2)} stroke={ink} stroke-width={1.4} />
        <path d="M-8 -9 q2 5 0 9 M-2 -12 q2 6 0 11 M4 -11 q2 6 0 10 M9 -8 q2 5 0 8" fill="none" stroke={ink} stroke-width={1.1} />
        <circle cx={-6} cy={1} r={1.4} fill={ink} /><circle cx={6} cy={1} r={1.4} fill={ink} />
        <path d="M-2 4 q2 2 4 0" fill="none" stroke={ink} stroke-width={1.1} />
      </g>
    );
  else if (kind === "ricecooker")
    body = (
      <g>
        <rect x={-14} y={-6} width={28} height={18} rx={6} fill={p.paper} stroke={ink} stroke-width={1.4} />
        <path d="M-15 -6 Q0 -18 15 -6 Z" fill={mix(p.soft, p.paper, 0.5)} stroke={ink} stroke-width={1.4} />
        <circle cx={0} cy={3} r={3} fill={p.red} />
        <path d="M-4 -16 q-2 -4 0 -7 M4 -16 q-2 -4 0 -7" fill="none" stroke={p.soft} stroke-width={1.2} />
      </g>
    );
  else if (kind === "alarm")
    body = (
      <g>
        <circle cx={-10} cy={-12} r={5} fill={p.yellow} stroke={ink} stroke-width={1.2} />
        <circle cx={10} cy={-12} r={5} fill={p.yellow} stroke={ink} stroke-width={1.2} />
        <circle cx={0} cy={1} r={13} fill={p.red} stroke={ink} stroke-width={1.4} />
        <circle cx={0} cy={1} r={9} fill={p.paper} />
        <path d="M0 1 V-5 M0 1 L4 4" stroke={ink} stroke-width={1.5} stroke-linecap="round" />
        <path d="M-19 -2 h-3 M19 -2 h3 M-18 6 l-3 2 M18 6 l3 2" stroke={ink} stroke-width={1.2} stroke-linecap="round" />
      </g>
    );
  else if (kind === "car")
    body = (
      <g>
        <path d="M-17 6 V0 Q-16 -4 -11 -5 L-7 -12 H7 L12 -5 Q17 -4 17 0 V6 Z" fill={p.blue} stroke={ink} stroke-width={1.4} />
        <path d="M-5 -10 H5 L8 -5 H-8 Z" fill={p.sky} />
        <circle cx={-9} cy={7} r={4} fill={ink} /><circle cx={9} cy={7} r={4} fill={ink} />
        <rect x={-6} y={-1} width={12} height={4} rx={1} fill={p.paper} />
      </g>
    );
  else if (kind === "headphones")
    body = (
      <g>
        <path d="M-13 4 V-2 A13 13 0 0 1 13 -2 V4" fill="none" stroke={ink} stroke-width={2.4} />
        <rect x={-17} y={0} width={8} height={13} rx={3} fill={p.purple} stroke={ink} stroke-width={1.2} />
        <rect x={9} y={0} width={8} height={13} rx={3} fill={p.purple} stroke={ink} stroke-width={1.2} />
        <path d="M-2 -18 l3 -3 l1 6" fill="none" stroke={p.red} stroke-width={1.5} />
      </g>
    );
  else if (kind === "sheet")
    body = (
      <g>
        <rect x={-14} y={-15} width={28} height={30} rx={2} fill={p.paper} stroke={ink} stroke-width={1.4} />
        <rect x={-14} y={-15} width={28} height={7} fill={p.green} />
        {[0, 1, 2].map((k) => <rect key={k} x={-11 + k * 8} y={-5} width={6} height={4} fill={[p.yellow, p.blue, p.red][k]!} />)}
        {[0, 1, 2].map((k) => <rect key={`b${k}`} x={-11 + k * 8} y={2} width={6} height={4} fill={[p.blue, p.red, p.yellow][k]!} />)}
        {[0, 1, 2].map((k) => <rect key={`c${k}`} x={-11 + k * 8} y={9} width={6} height={3} fill={[p.red, p.yellow, p.blue][k]!} />)}
      </g>
    );
  else if (kind === "pizza")
    body = (
      <g>
        <path d="M-14 -12 Q0 -18 14 -12 L0 16 Z" fill={p.yellow} stroke={ink} stroke-width={1.4} />
        <path d="M-14 -12 Q0 -18 14 -12" fill="none" stroke={p.crust} stroke-width={4} />
        <circle cx={-4} cy={-5} r={3} fill={p.red} /><circle cx={4} cy={1} r={3} fill={p.red} /><circle cx={-1} cy={7} r={2} fill={p.red} />
      </g>
    );
  else if (kind === "sled")
    body = (
      <g>
        <rect x={-16} y={-5} width={30} height={8} rx={3} fill={p.red} stroke={ink} stroke-width={1.2} />
        <path d="M-15 7 H14 Q19 7 19 1" fill="none" stroke={ink} stroke-width={2} stroke-linecap="round" />
      </g>
    );
  else if (kind === "coffee")
    body = (
      <g>
        <path d="M-10 -8 H10 L8 14 H-8 Z" fill={p.paper} stroke={ink} stroke-width={1.4} />
        <rect x={-11} y={-12} width={22} height={5} rx={2} fill={p.brown} />
        <rect x={-9} y={0} width={18} height={6} fill={p.crust} />
      </g>
    );
  else body = <path d="M0 -16 L4.5 -5 L16 -4.5 L7 3 L10 14.5 L0 8 L-10 14.5 L-7 3 L-16 -4.5 L-4.5 -5 Z" fill={p.yellow} stroke={ink} stroke-width={1.4} stroke-linejoin="round" />;
  return (
    <g>
      {base}
      {body}
    </g>
  );
}

const CSS =
  "@keyframes sbSlap{0%{transform:scale(1.8);opacity:0}55%{transform:scale(.9);opacity:1}100%{transform:scale(1)}}" +
  ".sb-slap{transform-box:fill-box;transform-origin:center;animation:sbSlap .45s cubic-bezier(.34,1.56,.64,1) both}" +
  "@media (prefers-reduced-motion:reduce){.sb-slap{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Scrapbook page",
  summary: (s) => (s.stickers.length ? `${s.stickers.length} stickers on the ${s.heading || "page"} · ${new Set(s.stickers.map((x) => x.user)).size} people` : `A blank ${s.heading || "scrapbook"} page waiting for stickers`),

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "stick") {
      if (!isKind(action.kind) || !state.tray.includes(action.kind) || !okPos(action.x) || !okPos(action.y)) return state;
      if (mineCount(state, meta.user) >= EACH || state.stickers.length >= MAX) return state;
      return { ...state, stickers: [...state.stickers, { id: `s${meta.seq}`, user: meta.user, kind: action.kind, x: action.x, y: action.y, at: meta.time }] };
    }
    if (action.t === "peel") {
      const mine = state.stickers.filter((x) => x.user === meta.user);
      const last = mine[mine.length - 1];
      if (!last) return state;
      return { ...state, stickers: state.stickers.filter((x) => x.id !== last.id) };
    }
    return state;
  },

  invariants: {
    "three stickers each at most": (s) => {
      const c = new Map<string, number>();
      for (const x of s.stickers) c.set(x.user, (c.get(x.user) ?? 0) + 1);
      return [...c.values()].every((v) => v <= EACH) && s.stickers.length <= MAX;
    },
    "stickers sit on the page": (s) => s.stickers.every((x) => okPos(x.x) && okPos(x.y)),
    "stickers come from the tray": (s) => s.stickers.every((x) => s.tray.includes(x.kind)),
    "sticker ids are unique": (s) => new Set(s.stickers.map((x) => x.id)).size === s.stickers.length,
  },

  transitions: {
    "sticking adds one of mine where I tapped": (p, n, a, m) => {
      if (a.t !== "stick" || p === n) return true;
      const last = n.stickers[n.stickers.length - 1];
      return n.stickers.length === p.stickers.length + 1 && !!last && last.user === m.user && last.kind === a.kind && last.x === a.x && last.y === a.y && last.at === m.time && same(p.stickers, n.stickers.slice(0, -1));
    },
    "a fourth sticker does not stick": (p, n, a, m) => a.t !== "stick" || mineCount(p, m.user) < EACH || p === n,
    "a fair sticker always sticks": (p, n, a, m, ctx) => a.t !== "stick" || !inChat(ctx, m.user) || mineCount(p, m.user) >= EACH || p.stickers.length >= MAX || !isKind(a.kind) || !p.tray.includes(a.kind) || !okPos(a.x) || !okPos(a.y) || p !== n,
    "peeling takes off only my newest": (p, n, a, m) => {
      if (a.t !== "peel" || p === n) return true;
      const mine = p.stickers.filter((x) => x.user === m.user);
      const last = mine[mine.length - 1];
      return !!last && n.stickers.length === p.stickers.length - 1 && !n.stickers.some((x) => x.id === last.id);
    },
    "nobody else's sticker moves": (p, n, _a, m) => same(p.stickers.filter((x) => x.user !== m.user), n.stickers.filter((x) => x.user !== m.user)),
    "the page never changes": (p, n) => p.heading === n.heading && same(p.tray, n.tray),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (mineCount(s, user) > 0 && r.next() < 0.2) return { t: "peel" };
    if (r.next() < 0.05) return { t: "stick", kind: "dragon", x: 10, y: 10 };
    return { t: "stick", kind: r.pick(s.tray), x: 60 + r.int(880), y: 60 + r.int(880) };
  },

  local: { pick: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const here = members.some((m) => m.id === me);
    const left = EACH - mineCount(state, me);
    const pick = isKind(local.pick) && state.tray.includes(local.pick) ? local.pick : null;
    const paper = theme.mode === "dark" ? mix(p.cream, c.wash, 0.75) : mix(p.cream, c.card, 0.55);
    const line = mix(paper, p.blue, 0.18);

    const rules: Child[] = [];
    for (let y = 44; y < PAGE_H; y += 22) rules.push(<line key={`r${y}`} x1={0} y1={y} x2={W} y2={y} stroke={line} stroke-width={1} />);
    const tape = (x: number, y: number, rot: number, col: string, key: string) => (
      <rect key={key} x={x - 26} y={y - 8} width={52} height={16} fill={col} opacity={0.75} transform={`rotate(${rot} ${x} ${y})`} />
    );
    const heading = fitText(state.heading, W - 140, { size: 24, weight: 700, min: 14, family: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' });

    const stickers = state.stickers.map((s) => {
      const x = (s.x / 1000) * W;
      const y = (s.y / 1000) * PAGE_H;
      const rot = (seedOf(s.id) % 40) - 20;
      const fresh = s.at > 0 && running(s.at, 500) !== null;
      return (
        <g key={s.id} transform={`translate(${r1(x)} ${r1(y)}) rotate(${rot})`}>
          <g {...(fresh ? { class: "sb-slap" } : {})}>
            <circle cx={1.5} cy={2.5} r={23} fill={mix(paper, c.text, 0.18)} />
            {art(s.kind, p)}
          </g>
        </g>
      );
    });

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "up" || !pick || left <= 0 || !here) return;
      const x = Math.round(Math.max(0.06, Math.min(0.94, e.x / W)) * 1000);
      const y = Math.round(Math.max(0.1, Math.min(0.9, e.y / PAGE_H)) * 1000);
      dispatch({ t: "stick", kind: pick, x, y });
      haptic("light");
      if (left - 1 <= 0) setLocal({ pick: "" });
    };

    const cell = Math.max(44, Math.floor((W - 5 * 6) / 6));
    const people = [...new Set(state.stickers.map((s) => s.user))];
    const hint = !here ? "" : left <= 0 ? "You've used all 3 · peel one to move it" : pick ? "Tap the page to stick it" : `Pick a sticker · ${left} left`;

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={state.stickers.length ? `${state.stickers.length} stickers from ${people.length} people` : "Blank page · be the first sticker"} />
        <div style={{ position: "relative", height: PAGE_H, borderRadius: 6, overflow: "hidden", background: paper, boxShadow: `inset 0 0 0 1px ${mix(paper, c.text, 0.12)}` }}>
          <svg width={W} height={PAGE_H} viewBox={`0 0 ${W} ${PAGE_H}`} role="img" aria-label={`Scrapbook page with ${state.stickers.length} stickers: ${state.stickers.map((s) => `${person(s.user).name}'s ${NAMES[s.kind]}`).join(", ")}`} style={{ position: "absolute", left: 0, top: 0 }}>
            {rules}
            <line x1={34} y1={0} x2={34} y2={PAGE_H} stroke={mix(paper, p.red, 0.35)} stroke-width={1.2} />
            {tape(30, 12, -14, mix(p.yellow, paper, 0.3), "t1")}
            {tape(W - 30, PAGE_H - 12, -12, mix(p.blue, paper, 0.45), "t2")}
            {tape(W - 40, 14, 10, mix(p.red, paper, 0.5), "t3")}
            <text x={52} y={34} font-size={heading.size} font-weight={700} font-family='"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' fill={theme.mode === "dark" ? mix(c.text, p.purple, 0.25) : mix(p.dark, p.purple, 0.25)}>{heading.text}</text>
            {state.stickers.length === 0 ? (
              <g>
                <circle cx={W / 2} cy={PAGE_H / 2 + 10} r={24} fill="none" stroke={mix(paper, p.dark, 0.35)} stroke-width={1.5} stroke-dasharray="5 4" />
                <text x={W / 2} y={PAGE_H / 2 + 52} font-size={13} text-anchor="middle" fill={mix(p.dark, paper, 0.1)}>first sticker goes anywhere</text>
              </g>
            ) : null}
            {stickers}
          </svg>
          {state.stickers.map((s) => {
            const x = (s.x / 1000) * W;
            const y = (s.y / 1000) * PAGE_H;
            return (
              <span key={`a${s.id}`} style={{ position: "absolute", left: r1(x + 10), top: r1(y + 10), pointerEvents: "none", borderRadius: 8, boxShadow: `0 0 0 1.5px ${paper}`, display: "inline-flex" }}>
                <Avatar user={person(s.user)} size={16} />
              </span>
            );
          })}
          <div style={{ position: "absolute", inset: 0, cursor: pick ? "copy" : "default" }}>
            <Canvas height={PAGE_H} label={pick ? `Tap to stick the ${NAMES[pick]}` : "Scrapbook page"} onPointer={onPointer} draw={() => false} />
          </div>
        </div>

        <div role="group" aria-label="Sticker tray" style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "space-between" }}>
          {state.tray.map((k) => {
            const on = pick === k;
            return (
              <button
                key={k}
                type="button"
                aria-label={`${NAMES[k]} sticker`}
                aria-pressed={on}
                disabled={!here || left <= 0}
                onClick={() => setLocal({ pick: on ? "" : k })}
                style={{ position: "relative", width: cell, height: 48, borderRadius: 10, background: on ? c.selected : c.wash, boxShadow: on ? `inset 0 0 0 2px ${c.primary}` : "none", display: "flex", alignItems: "center", justifyContent: "center", transform: on ? "translateY(-3px)" : "none", transition: "transform .2s" }}
              >
                <svg width={40} height={40} viewBox="-24 -24 48 48" aria-hidden="true">{art(k, p)}</svg>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, height: 36 }}>
          {people.length ? <Facepile users={people.map(person)} max={4} size={20} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: pick ? c.text : c.secondaryText, fontWeight: pick ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</span>
          {here && left < EACH ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "peel" })}>
              Peel mine
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
