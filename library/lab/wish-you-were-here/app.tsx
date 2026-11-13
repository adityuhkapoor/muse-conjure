import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, userColor, type Ctx, type Member, type Theme } from "@muse/app";

// Wish you were here: someone posts a view. The place drawn wide with empty spots (towels on a
// beach, blankets in a park, sleds on a snowy hill); friends tap one to jump in as a little figure
// with their face, something they brought and a line. The spots fill; the poster is in the middle.

type Scene = "beach" | "park" | "snow";
type Prop = "umbrella" | "ball" | "cooler" | "guitar" | "car" | "kite";
type Params = {
  /** Who posted: "Maya" */
  author: string;
  /** Where: "Playa Blanca" */
  place: string;
  /** Which picture: beach, park or snow */
  scene: Scene;
  /** The post line */
  line: string;
  /** Friends already in the picture: spot 0 to 5, what they brought (umbrella, ball, cooler, guitar, car, kite) and their line */
  joined: { who: string; spot: number; prop: Prop; said?: string }[];
};

// @params
const P: Params = {
  author: "Maya",
  place: "Playa Blanca",
  scene: "beach",
  line: "wish you were here",
  joined: [
    { who: "Tsai Lin", spot: 0, prop: "umbrella", said: "saving you the shade" },
    { who: "Will", spot: 4, prop: "car", said: "parked the Sube on the sand. it's fine" },
    { who: "Arun", spot: 2, prop: "cooler", said: "rice cooker full of rice. for the beach" },
  ],
};
// @end params

type Guest = { who: string; name: string; spot: number; prop: Prop; said: string; at: number };
type State = { author: string; authorName: string; place: string; scene: Scene; line: string; guests: Guest[] };
type Action = { t: "join"; spot: number; prop: Prop; said: string } | { t: "leave" };
type Local = { spot: number; prop: Prop; said: string; open: boolean; toast: number };

const PROPS: Prop[] = ["umbrella", "ball", "cooler", "guitar", "kite", "car"];
const PROP_NAME: Record<Prop, string> = { umbrella: "Umbrella", ball: "Ball", cooler: "Cooler", guitar: "Guitar", car: "Car", kite: "Kite" };
const SCENES: Scene[] = ["beach", "park", "snow"];
const SPOTS = [
  { x: 0.13, y: 0.6 },
  { x: 0.33, y: 0.8 },
  { x: 0.3, y: 0.56 },
  { x: 0.7, y: 0.8 },
  { x: 0.87, y: 0.6 },
  { x: 0.68, y: 0.56 },
];
const ME_SPOT = { x: 0.5, y: 0.7 };
const H = 226;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okSpot = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < SPOTS.length;
const isProp = (v: unknown): v is Prop => typeof v === "string" && (PROPS as string[]).includes(v);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const guests: Guest[] = [];
  for (const j of Array.isArray(P.joined) ? P.joined : []) {
    const name = clean(j?.who, 20);
    if (!name || !okSpot(j.spot) || guests.some((g) => g.spot === j.spot)) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || guests.some((g) => g.who === who)) continue;
    guests.push({ who, name: m?.name ?? name, spot: j.spot, prop: isProp(j.prop) ? j.prop : "ball", said: clean(j.said, 44), at: 0 });
  }
  return { author, authorName, place: clean(P.place, 24), scene: (SCENES as string[]).includes(P.scene) ? P.scene : "beach", line: clean(P.line, 60), guests };
}

function propArt(prop: Prop, t: Theme) {
  const p = pal(t), c = t.color, edge = mix(c.text, c.card, 0.25);
  if (prop === "umbrella")
    return (
      <g>
        <line x1={14} y1={8} x2={14} y2={34} stroke={edge} stroke-width={1.6} />
        <path d="M0 10 Q14 -6 28 10 Q24 7 21 10 Q17.5 7 14 10 Q10.5 7 7 10 Q4 7 0 10 Z" fill={p.red} stroke={edge} stroke-width={0.8} />
        <path d="M7 10 Q14 -6 21 10" fill="none" stroke={p.cream} stroke-width={2} />
      </g>
    );
  if (prop === "ball")
    return (
      <g>
        <circle cx={14} cy={24} r={9} fill={p.cream} stroke={edge} stroke-width={0.8} />
        <path d="M5 24 Q14 16 23 24 M14 15 Q10 24 14 33" fill="none" stroke={p.red} stroke-width={2} />
        <path d="M8 18 Q14 26 20 18" fill="none" stroke={p.blue} stroke-width={2} />
      </g>
    );
  if (prop === "cooler")
    return (
      <g>
        <rect x={3} y={16} width={22} height={16} rx={2} fill={p.blue} stroke={edge} stroke-width={0.8} />
        <rect x={3} y={14} width={22} height={5} rx={1.5} fill={c.card} stroke={edge} stroke-width={0.8} />
        <path d="M10 14 L10 10 L18 10 L18 14" fill="none" stroke={edge} stroke-width={1.5} />
      </g>
    );
  if (prop === "guitar")
    return (
      <g>
        <line x1={20} y1={4} x2={13} y2={22} stroke={p.brown} stroke-width={2.5} />
        <circle cx={11} cy={25} r={6} fill={p.orange} stroke={edge} stroke-width={0.8} />
        <circle cx={14} cy={20} r={4.5} fill={p.orange} stroke={edge} stroke-width={0.8} />
        <circle cx={12} cy={23} r={1.6} fill={edge} />
      </g>
    );
  if (prop === "kite")
    return (
      <g>
        <path d="M18 0 L26 8 L18 18 L10 8 Z" fill={p.purple} stroke={edge} stroke-width={0.8} />
        <path d="M18 18 Q14 24 18 28 Q22 32 14 34" fill="none" stroke={edge} stroke-width={1} />
      </g>
    );
  return (
    <g>
      <path d="M1 30 L3 22 Q5 18 10 18 L22 18 Q26 18 28 22 L30 30 Z" fill={p.green} stroke={edge} stroke-width={0.8} />
      <rect x={8} y={20} width={6} height={5} rx={1} fill={p.sky} />
      <rect x={17} y={20} width={7} height={5} rx={1} fill={p.sky} />
      <rect x={9} y={15} width={13} height={2.5} rx={1} fill={edge} />
      <circle cx={8} cy={31} r={3} fill={edge} />
      <circle cx={24} cy={31} r={3} fill={edge} />
    </g>
  );
}

function backdrop(scene: Scene, t: Theme, W: number) {
  const p = pal(t), c = t.color, dark = t.mode === "dark";
  const sky = dark ? mix(c.wash, p.blue, 0.2) : p.sky;
  if (scene === "beach")
    return (
      <g>
        <rect x={0} y={0} width={W} height={H} fill={sky} />
        <circle cx={W * 0.82} cy={30} r={18} fill={p.yellow} />
        <rect x={0} y={58} width={W} height={50} fill={p.blue} />
        <g style={{ animation: "wyWave 3.2s ease-in-out infinite" }}>
          <path d={`M-20 100 Q${W * 0.1} 90 ${W * 0.25} 100 T${W * 0.55} 100 T${W * 0.85} 100 T${W + 40} 100 L${W + 40} 112 L-20 112 Z`} fill={mix(p.blue, c.card, 0.55)} />
        </g>
        <path d={`M0 104 Q${W * 0.5} 96 ${W} 106 L${W} ${H} L0 ${H} Z`} fill={dark ? mix(p.cream, c.wash, 0.45) : p.cream} />
        <path d={`M${W * 0.12} 74 q10 -6 20 0 M${W * 0.5} 80 q10 -6 20 0`} fill="none" stroke={mix(p.blue, c.card, 0.5)} stroke-width={2} />
      </g>
    );
  if (scene === "park")
    return (
      <g>
        <rect x={0} y={0} width={W} height={H} fill={sky} />
        <circle cx={W * 0.15} cy={28} r={16} fill={p.yellow} />
        <path d={`M0 100 Q${W * 0.3} 70 ${W * 0.6} 92 T${W} 84 L${W} ${H} L0 ${H} Z`} fill={dark ? mix(p.green, c.wash, 0.4) : p.grass} />
        {[0.08, 0.92, 0.5].map((x, i) => (
          <g key={i}>
            <rect x={W * x - 3} y={60 + i * 6} width={6} height={30} fill={p.brown} />
            <circle cx={W * x} cy={56 + i * 6} r={20} fill={p.green} />
          </g>
        ))}
      </g>
    );
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill={sky} />
      <path d={`M0 90 L${W * 0.25} 30 L${W * 0.45} 80 L${W * 0.7} 20 L${W} 86 L${W} ${H} L0 ${H} Z`} fill={p.purple} />
      <path d={`M${W * 0.25} 30 L${W * 0.2} 44 L${W * 0.27} 40 L${W * 0.31} 46 Z M${W * 0.7} 20 L${W * 0.64} 36 L${W * 0.71} 31 L${W * 0.76} 38 Z`} fill={dark ? mix(c.text, c.wash, 0.2) : c.card} />
      <path d={`M0 104 Q${W * 0.5} 86 ${W} 100 L${W} ${H} L0 ${H} Z`} fill={dark ? mix(c.text, c.wash, 0.35) : c.card} />
    </g>
  );
}

function spotArt(scene: Scene, x: number, y: number, t: Theme, empty: boolean, sel: boolean, i: number) {
  const p = pal(t), c = t.color;
  const col = [p.red, p.blue, p.yellow, p.purple, p.orange, p.green][i % 6]!;
  const stroke = sel ? c.primary : empty ? mix(c.text, c.card, 0.45) : "none";
  if (scene === "snow")
    return (
      <g key={i}>
        <rect x={x - 22} y={y - 6} width={44} height={14} rx={6} fill={empty ? "none" : col} stroke={stroke} stroke-width={sel ? 2.5 : 1.4} stroke-dasharray={empty ? "4 3" : "0"} />
        <path d={`M${x + 22} ${y - 6} q8 0 8 -8`} fill="none" stroke={empty ? stroke : col} stroke-width={3} />
      </g>
    );
  return (
    <g key={i} transform={`rotate(${[-6, 4, -3, 5, -4, 3][i]} ${x} ${y})`}>
      <rect x={x - 26} y={y - 10} width={52} height={22} rx={3} fill={empty ? "none" : col} stroke={stroke} stroke-width={sel ? 2.5 : 1.4} stroke-dasharray={empty ? "4 3" : "0"} />
      {!empty ? <path d={`M${x - 26} ${y - 2} L${x + 26} ${y - 2} M${x - 26} ${y + 5} L${x + 26} ${y + 5}`} stroke={c.card} stroke-width={2.5} /> : null}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Wish you were here",
  summary: (s) => `${s.authorName}${s.place ? ` at ${s.place}` : ""} · ${s.guests.length} of ${SPOTS.length} spots taken`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const u = meta.user;
    if (a.t === "join") {
      if (!okSpot(a.spot) || !isProp(a.prop) || s.guests.some((g) => g.spot === a.spot && g.who !== u)) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      return { ...s, guests: [...s.guests.filter((g) => g.who !== u), { who: u, name, spot: a.spot, prop: a.prop, said: clean(a.said, 44), at: meta.time }] };
    }
    if (a.t === "leave") {
      if (!s.guests.some((g) => g.who === u)) return s;
      return { ...s, guests: s.guests.filter((g) => g.who !== u) };
    }
    return s;
  },

  invariants: {
    "one spot per friend, one friend per spot": (s) => new Set(s.guests.map((g) => g.who)).size === s.guests.length && new Set(s.guests.map((g) => g.spot)).size === s.guests.length,
    "everyone is on a real spot with a real prop": (s) => s.guests.every((g) => okSpot(g.spot) && isProp(g.prop)),
    "the poster is already in the middle": (s) => s.guests.every((g) => g.who !== s.author),
  },

  transitions: {
    "jumping in lands me where I tapped, on top": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const g = n.guests[n.guests.length - 1];
      return !!g && g.who === m.user && g.spot === a.spot && g.prop === a.prop && g.said === clean(a.said, 44) && g.at === m.time;
    },
    "nobody else moves": (p, n, _a, m) => p.guests.filter((g) => g.who !== m.user).every((g) => n.guests.includes(g)) && n.guests.filter((g) => g.who !== m.user).length === p.guests.filter((g) => g.who !== m.user).length,
    "an open spot takes me": (p, n, a, m, ctx) => a.t !== "join" || !inChat(ctx, m.user) || m.user === p.author || !okSpot(a.spot) || !isProp(a.prop) || p.guests.some((g) => g.spot === a.spot) || p !== n,
    "leaving clears only my spot": (p, n, a, m) => a.t !== "leave" || p === n || (n.guests.length === p.guests.length - 1 && !n.guests.some((g) => g.who === m.user)),
    "the view never changes": (p, n) => p.author === n.author && p.scene === n.scene && p.place === n.place && p.line === n.line,
    "only people in the chat jump in": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.15 ? { t: "leave" } : { t: "join", spot: r.next() < 0.95 ? r.int(SPOTS.length) : 9, prop: r.pick(PROPS), said: r.pick(["", "omw", "save me a spot"]) }),

  local: { spot: -1, prop: "ball", said: "", open: false, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const mine = state.guests.find((g) => g.who === me);
    const taken = (i: number) => state.guests.some((g) => g.spot === i && g.who !== me);
    const firstFree = SPOTS.findIndex((_, i) => !taken(i));
    const pick = local.spot >= 0 && !taken(local.spot) ? local.spot : mine?.spot ?? firstFree;
    const person = (g: Guest): Member => members.find((m) => m.id === g.who) ?? { id: g.who, name: g.name };
    const author: Member = members.find((m) => m.id === state.author) ?? { id: state.author, name: state.authorName };
    const latest = [...state.guests].sort((a, b) => b.at - a.at).find((g) => g.said);
    const shownGuests = local.open ? state.guests.filter((g) => g.who !== me) : state.guests;
    const figure = (key: string, x: number, y: number, user: Member | string, col: string, prop: Prop, fresh: boolean, ghost: boolean) => (
      <div key={key} style={{ position: "absolute", left: x - 16, top: y - 46, width: 32, height: 50, pointerEvents: "none", animation: fresh ? "wyJump .6s cubic-bezier(.2,1.4,.5,1)" : undefined, outline: ghost ? "2px dashed currentColor" : undefined, color: c.primary, borderRadius: 8 }}>
        <svg width={32} height={50} viewBox="0 0 32 50" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M9 22 Q16 18 23 22 L24 36 L8 36 Z" fill={col} />
          <path d="M11 36 L10 46 M21 36 L22 46" stroke={col} stroke-width={4} stroke-linecap="round" />
          <path d="M9 24 L3 32 M23 24 L29 30" stroke={col} stroke-width={3.5} stroke-linecap="round" />
        </svg>
        <div style={{ position: "absolute", left: 4, top: -2 }}>
          <Avatar user={user} size={24} />
        </div>
        <svg width={28} height={36} viewBox="0 0 28 36" aria-hidden="true" style={{ position: "absolute", left: 22, top: 10 }}>
          {propArt(prop, theme)}
        </svg>
      </div>
    );
    const join = () => {
      if (pick < 0) return;
      dispatch({ t: "join", spot: pick, prop: local.prop, said: local.said });
      setLocal({ open: false, said: "", spot: -1, toast: local.toast + 1 });
      haptic("success");
    };

    return (
      <div>
        <style>{"@keyframes wyWave { 0%, 100% { transform: translateX(0) } 50% { transform: translateX(-14px) } } @keyframes wyJump { 0% { transform: translateY(-70px) scale(.8) } 60% { transform: translateY(6px) scale(1.05) } 100% { transform: translateY(0) scale(1) } }"}</style>
        <CardHeader title={state.place ? `${state.authorName} at ${state.place}` : `${state.authorName} wishes you were here`} subtitle={state.line ? `“${state.line}” · ${state.guests.length} jumped in` : `${state.guests.length} jumped in`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${state.scene} with ${state.guests.length} friends in ${SPOTS.length} spots`} style={{ position: "absolute", left: 0, top: 0 }}>
            {backdrop(state.scene, theme, W)}
            {SPOTS.map((s, i) => spotArt(state.scene, s.x * W, s.y * H, theme, !state.guests.some((g) => g.spot === i) && !(local.open && i === pick), !isAuthor && local.open && i === pick, i))}
            {spotArt(state.scene, ME_SPOT.x * W, ME_SPOT.y * H, theme, false, false, 5)}
          </svg>
          {SPOTS.map((s, i) =>
            !isAuthor && !taken(i) ? (
              <button key={i} type="button" aria-label={`Spot ${i + 1}, open`} onClick={() => setLocal({ spot: i, open: true })} style={{ position: "absolute", left: s.x * W - 28, top: s.y * H - 28, width: 56, height: 48, border: "none", background: "none", padding: 0 }} />
            ) : null,
          )}
          {figure("author", ME_SPOT.x * W, ME_SPOT.y * H, author, userColor(state.author, theme), state.scene === "snow" ? "kite" : "umbrella", false, false)}
          {shownGuests.map((g) => figure(g.who, SPOTS[g.spot]!.x * W, SPOTS[g.spot]!.y * H, g.who === me ? me : person(g), userColor(g.who, theme), g.prop, g.at > 0 && g === state.guests[state.guests.length - 1], false))}
          {local.open && pick >= 0 ? figure("ghost", SPOTS[pick]!.x * W, SPOTS[pick]!.y * H, me, c.primary, local.prop, false, true) : null}
          {latest && !local.open ? (
            <div style={{ position: "absolute", left: 8, top: 8, maxWidth: W - 16, padding: "4px 10px", borderRadius: 14, background: c.card, color: c.text, fontSize: 12, lineHeight: "16px", boxShadow: `0 1px 0 ${c.divider}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}>
              <b>{latest.who === me ? "You" : latest.name.split(" ")[0]}</b>
              {`: ${latest.said}`}
            </div>
          ) : null}
        </div>
        {local.open && !isAuthor ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {PROPS.map((k) => (
                <button key={k} type="button" aria-label={PROP_NAME[k]} onClick={() => setLocal({ prop: k })} style={{ flex: 1, minWidth: 0, height: 44, padding: 0, borderRadius: 8, border: `2px solid ${local.prop === k ? c.primary : c.divider}`, background: local.prop === k ? c.selected : c.card }}>
                  <svg width={28} height={36} viewBox="0 0 28 36" aria-hidden="true">
                    {propArt(k, theme)}
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={local.said} maxLength={44} placeholder="Saving you the shade" aria-label="Your line" onInput={(e: { currentTarget: { value: string } }) => setLocal({ said: e.currentTarget.value })} onKeyDown={(e: { key: string }) => (e.key === "Enter" ? join() : undefined)} style={{ flex: 1, minWidth: 0 }} />
              <Button kind="primary" disabled={pick < 0} onClick={join}>
                Jump in
              </Button>
            </div>
          </div>
        ) : !isAuthor ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {mine ? "You're in the picture" : firstFree < 0 ? "Every spot is taken" : `${SPOTS.length - state.guests.length} spots open · tap one`}
            </span>
            {mine ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
                Leave
              </Button>
            ) : null}
            {mine || firstFree >= 0 ? (
              <Button kind="primary" onClick={() => setLocal({ open: true, spot: mine?.spot ?? firstFree, prop: mine?.prop ?? local.prop, said: mine?.said ?? "" })}>
                {mine ? "Move" : "Jump in"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, color: c.secondaryText }}>{state.guests.length ? `${state.guests.length} friends jumped in` : "Friends can jump in from here"}</div>
        )}
        {local.toast > 0 && mine && !local.open ? <Toast key={local.toast}>You're in the picture</Toast> : null}
      </div>
    );
  },
});
