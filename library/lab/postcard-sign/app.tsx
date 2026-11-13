import { defineApp, userColor, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Postcard: someone posts from away. A postcard from where they are; its back is where friends
// sign, one line each, and slam a stamp in the corner. Flip it to see the front: "Greetings from".

type Scene = "beach" | "mountains" | "city";
type Stamp = "sun" | "palm" | "wave" | "heart" | "peak" | "flower";
type Params = {
  /** Who is away: "Maya" */
  author: string;
  /** Where they are, printed on the front and the postmark: "Cartagena" */
  place: string;
  /** Postmark date: "Nov 12" */
  date: string;
  /** The front picture: beach, mountains or city */
  scene: Scene;
  /** The post line: "wish you were all here" */
  line: string;
  /** Friends who signed: their line and stamp (sun, palm, wave, heart, peak, flower) */
  signed: { who: string; line: string; stamp: Stamp }[];
};

// @params
const P: Params = {
  author: "Maya",
  place: "Cartagena",
  date: "Nov 12",
  scene: "beach",
  line: "wish you were all here, Cartagena is unreal",
  signed: [
    { who: "Calvin", line: "set 7 alarms to call u, slept thru all 7", stamp: "sun" },
    { who: "Arun", line: "bring back a recipe for the rice cooker", stamp: "palm" },
    { who: "Tsai Lin", line: "the aux misses u (it doesn't)", stamp: "flower" },
    { who: "Will", line: "the Sube is lonely without u", stamp: "wave" },
  ],
};
// @end params

type Sig = { who: string; name: string; line: string; stamp: Stamp; at: number };
type State = { author: string; authorName: string; place: string; date: string; scene: Scene; line: string; sigs: Sig[] };
type Action = { t: "sign"; line: string; stamp: Stamp };
type Local = { front: boolean; open: boolean; draft: string; stamp: Stamp; toast: number };

const STAMPS: Stamp[] = ["sun", "palm", "wave", "heart", "peak", "flower"];
const STAMP_NAME: Record<Stamp, string> = { sun: "Sun stamp", palm: "Palm stamp", wave: "Wave stamp", heart: "Heart stamp", peak: "Mountain stamp", flower: "Flower stamp" };
const SCENES: Scene[] = ["beach", "mountains", "city"];
const MAX = 8;
const CARD_H = 222;
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, Math.max(4, n - 1)).trimEnd() + "…" : t);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isStamp = (v: unknown): v is Stamp => typeof v === "string" && (STAMPS as string[]).includes(v);
const hand = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const sigs: Sig[] = [];
  for (const s of Array.isArray(P.signed) ? P.signed : []) {
    const name = clean(s?.who, 20);
    const line = clean(s?.line, 48);
    if (!name || !line || sigs.length >= MAX) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || sigs.some((x) => x.who === who)) continue;
    sigs.push({ who, name: m?.name ?? name, line, stamp: isStamp(s.stamp) ? s.stamp : STAMPS[sigs.length % STAMPS.length]!, at: 0 });
  }
  return {
    author,
    authorName,
    place: clean(P.place, 20) || "here",
    date: clean(P.date, 10),
    scene: (SCENES as string[]).includes(P.scene) ? P.scene : "beach",
    line: clean(P.line, 60),
    sigs,
  };
}

const HUE: Record<Stamp, "yellow" | "green" | "blue" | "red" | "purple" | "orange"> = { sun: "yellow", palm: "green", wave: "blue", heart: "red", peak: "purple", flower: "orange" };

/** A stamp's motif inside a 30 x 36 box at the origin. */
function motif(kind: Stamp, t: Theme) {
  const p = pal(t), c = t.color;
  const ink = mix(p[HUE[kind]], c.text, 0.45);
  if (kind === "sun")
    return (
      <g>
        <circle cx={15} cy={17} r={7} fill={p.yellow} stroke={ink} stroke-width={1} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={i} x1={15 + 9 * Math.cos((i * Math.PI) / 4)} y1={17 + 9 * Math.sin((i * Math.PI) / 4)} x2={15 + 12 * Math.cos((i * Math.PI) / 4)} y2={17 + 12 * Math.sin((i * Math.PI) / 4)} stroke={ink} stroke-width={1.5} stroke-linecap="round" />
        ))}
      </g>
    );
  if (kind === "palm")
    return (
      <g>
        <path d="M15 32 Q14 22 16 13" fill="none" stroke={mix(p.brown, c.text, 0.1)} stroke-width={2.2} />
        <path d="M16 13 Q9 9 4 14 M16 13 Q22 8 27 13 M16 13 Q11 5 8 6 M16 13 Q20 5 24 6" fill="none" stroke={p.green} stroke-width={2.4} stroke-linecap="round" />
        <circle cx={16} cy={14} r={1.6} fill={p.brown} />
      </g>
    );
  if (kind === "wave")
    return (
      <g>
        <path d="M2 22 Q8 14 14 20 T26 18 Q24 26 28 30 L2 30 Z" fill={p.blue} />
        <path d="M6 26 Q12 21 18 25 T28 24" fill="none" stroke={mix(p.blue, c.card, 0.6)} stroke-width={1.4} />
        <circle cx={22} cy={10} r={3} fill={p.yellow} />
      </g>
    );
  if (kind === "heart") return <path d="M15 30 C3 21 5 10 11 10 C13.5 10 15 12 15 14 C15 12 16.5 10 19 10 C25 10 27 21 15 30 Z" fill={p.red} stroke={ink} stroke-width={1} />;
  if (kind === "peak")
    return (
      <g>
        <path d="M2 30 L12 12 L18 22 L22 16 L29 30 Z" fill={p.purple} />
        <path d="M12 12 L9 18 L12 16 L15 18 Z" fill={c.card} />
        <circle cx={24} cy={9} r={2.6} fill={p.yellow} />
      </g>
    );
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse key={i} cx={15 + 6 * Math.cos((i * 2 * Math.PI) / 5 - Math.PI / 2)} cy={17 + 6 * Math.sin((i * 2 * Math.PI) / 5 - Math.PI / 2)} rx={4.5} ry={4.5} fill={p.orange} />
      ))}
      <circle cx={15} cy={17} r={3.5} fill={p.yellow} />
    </g>
  );
}

function stampArt(kind: Stamp, x: number, y: number, rot: number, t: Theme, key: string, fresh: boolean) {
  const p = pal(t), c = t.color;
  return (
    <g key={key} transform={`translate(${x} ${y}) rotate(${rot} 17 20)`}>
      <g style={fresh ? { animation: "pcSlam .45s cubic-bezier(.2,1.4,.4,1)", transformOrigin: "17px 20px" } : {}}>
        <rect x={0} y={0} width={34} height={40} fill={mix(p[HUE[kind]], c.card, 0.82)} stroke={c.card} stroke-width={3} stroke-dasharray="2.5 2" />
        <rect x={3} y={3} width={28} height={34} fill="none" stroke={mix(p[HUE[kind]], c.text, 0.3)} stroke-width={0.8} />
        <g transform="translate(2 2)">{motif(kind, t)}</g>
      </g>
    </g>
  );
}

function front(s: State, t: Theme, W: number) {
  const p = pal(t), c = t.color;
  const H = CARD_H;
  const big = Math.min(46, Math.floor((W - 40) / Math.max(4, s.place.length) / 0.78));
  const hills = s.scene === "mountains";
  const city = s.scene === "city";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Postcard front: greetings from ${s.place}`}>
      <rect x={0} y={0} width={W} height={H} rx={10} fill={p.sky} />
      <circle cx={W * 0.78} cy={50} r={22} fill={p.yellow} />
      {hills ? (
        <g>
          <path d={`M0 ${H} L0 140 L${W * 0.25} 70 L${W * 0.45} 130 L${W * 0.65} 60 L${W} 150 L${W} ${H} Z`} fill={p.purple} />
          <path d={`M${W * 0.25} 70 L${W * 0.2} 88 L${W * 0.25} 82 L${W * 0.3} 90 Z M${W * 0.65} 60 L${W * 0.6} 78 L${W * 0.65} 72 L${W * 0.7} 80 Z`} fill={c.card} />
          <path d={`M0 ${H} L0 170 Q${W * 0.5} 140 ${W} 175 L${W} ${H} Z`} fill={p.green} />
        </g>
      ) : city ? (
        <g>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const bw = W / 8, bh = 50 + ((i * 37) % 70);
            return <rect key={i} x={i * bw + 2} y={H - 30 - bh} width={bw - 4} height={bh} fill={i % 2 ? p.orange : p.red} />;
          })}
          <rect x={0} y={H - 32} width={W} height={32} fill={p.shade} />
        </g>
      ) : (
        <g>
          <rect x={0} y={128} width={W} height={H - 128} fill={p.blue} />
          <path d={`M0 ${H} L0 172 Q${W * 0.4} 156 ${W} 180 L${W} ${H} Z`} fill={p.cream} />
          <path d={`M${W * 0.14} 178 Q${W * 0.12} 140 ${W * 0.17} 110`} fill="none" stroke={p.brown} stroke-width={4} />
          <path d={`M${W * 0.17} 110 q-22 -6 -32 8 M${W * 0.17} 110 q20 -12 34 0 M${W * 0.17} 110 q-10 -18 -22 -16 M${W * 0.17} 110 q8 -18 22 -16`} fill="none" stroke={p.green} stroke-width={5} stroke-linecap="round" />
          <path d={`M${W * 0.55} 145 q10 -6 20 0 t20 0 M${W * 0.3} 140 q10 -6 20 0 t20 0`} fill="none" stroke={mix(p.blue, c.card, 0.6)} stroke-width={2} />
        </g>
      )}
      <text x={18} y={30} font-size={14} font-style="italic" fill={c.text} style={{ fontFamily: hand }}>
        Greetings from
      </text>
      <text x={16} y={42 + big * 0.82} font-size={big} font-weight={900} fill={p.red} stroke={c.card} stroke-width={3} paint-order="stroke" letter-spacing={1}>
        {s.place.toUpperCase()}
      </text>
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Postcard",
  summary: (s) => `A postcard to ${s.authorName} in ${s.place} · ${s.sigs.length} signed`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "sign" || !inChat(ctx, meta.user) || meta.user === s.author) return s;
    const line = clean(a.line, 48);
    if (!line || !isStamp(a.stamp)) return s;
    const had = s.sigs.some((x) => x.who === meta.user);
    if (!had && s.sigs.length >= MAX) return s;
    const name = clean(ctx.members.find((m) => m.id === meta.user)?.name, 20) || "Friend";
    const sig: Sig = { who: meta.user, name, line, stamp: a.stamp, at: meta.time };
    return { ...s, sigs: had ? s.sigs.map((x) => (x.who === meta.user ? sig : x)) : [...s.sigs, sig] };
  },

  invariants: {
    "one line per friend, never the person away": (s) => new Set(s.sigs.map((x) => x.who)).size === s.sigs.length && s.sigs.every((x) => x.who !== s.author),
    "room for eight": (s) => s.sigs.length <= MAX,
    "every line has words and a stamp": (s) => s.sigs.every((x) => x.line.length > 0 && x.line.length <= 48 && isStamp(x.stamp)),
  },

  transitions: {
    "signing writes my line and stamp": (p, n, a, m) => {
      if (a.t !== "sign" || p === n) return true;
      const x = n.sigs.find((q) => q.who === m.user);
      return !!x && x.line === clean(a.line, 48) && x.stamp === a.stamp && x.at === m.time;
    },
    "signing leaves everyone else's lines": (p, n, _a, m) => p.sigs.filter((x) => x.who !== m.user).every((x) => n.sigs.includes(x)) && n.sigs.filter((x) => x.who !== m.user).length === p.sigs.filter((x) => x.who !== m.user).length,
    "a first signature goes at the bottom": (p, n, a, m) => a.t !== "sign" || p === n || p.sigs.some((x) => x.who === m.user) || (n.sigs.length === p.sigs.length + 1 && n.sigs[n.sigs.length - 1]!.who === m.user),
    "a friend with room signs": (p, n, a, m, ctx) =>
      a.t !== "sign" || !inChat(ctx, m.user) || m.user === p.author || !clean(a.line, 48) || !isStamp(a.stamp) || (p.sigs.length >= MAX && !p.sigs.some((x) => x.who === m.user)) || p !== n,
    "the card never changes": (p, n) => p.author === n.author && p.place === n.place && p.date === n.date && p.scene === n.scene && p.line === n.line,
    "only people in the chat sign": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => ({ t: "sign", line: r.pick(["miss u", "bring snacks", "jealous", "save me a spot on the beach", ""]), stamp: r.next() < 0.95 ? r.pick(STAMPS) : ("llama" as Stamp) }),

  local: { front: false, open: false, draft: "", stamp: "sun", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const mine = state.sigs.find((x) => x.who === me);
    const person = (x: Sig): Member => members.find((m) => m.id === x.who) ?? { id: x.who, name: x.name };
    const half = Math.floor(W * 0.6);
    const right = W - half;
    const shown = state.sigs.slice(-6);
    const extra = state.sigs.length - shown.length;
    const lastAt = Math.max(0, ...state.sigs.map((x) => x.at));
    const cols = 3;
    const sx = (i: number) => half + 8 + (i % cols) * Math.floor((right - 16) / cols) + 2;
    const sy = (i: number) => 10 + Math.floor(i / cols) * 46;
    const rot = (i: number) => ((i * 47) % 9) - 4;
    const pmX = half + 6, pmY = shown.length > 3 ? 104 : 58;
    const textW = half - 22;
    const rows = (x: Sig) => ((x.line.length + x.name.split(" ")[0]!.length + 3) * 5.6 > textW ? 2 : 1);
    const fit: Sig[] = [];
    for (let i = state.sigs.length - 1, used = 22; i >= 0; i--) {
      used += rows(state.sigs[i]!) * 15 + 7;
      if (used > CARD_H - 22) break;
      fit.unshift(state.sigs[i]!);
    }
    const submit = () => {
      if (!clean(local.draft, 48)) return;
      dispatch({ t: "sign", line: local.draft, stamp: local.stamp });
      setLocal({ open: false, draft: "", toast: local.toast + 1, front: false });
      haptic("success");
    };

    return (
      <div>
        <style>{"@keyframes pcSlam { 0% { transform: scale(1.9) rotate(-14deg); opacity: 0 } 60% { transform: scale(.92); opacity: 1 } 100% { transform: scale(1) } } @keyframes pcTurn { from { transform: rotateY(90deg) } to { transform: rotateY(0) } } @keyframes pcIn { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }"}</style>
        <CardHeader title={`A postcard to ${state.authorName}`} subtitle={state.line ? `“${state.line}”` : `${state.place} · ${state.date}`} />
        <div style={{ perspective: 900, height: CARD_H, position: "relative" }}>
          <div key={local.front ? "front" : "back"} style={{ position: "absolute", inset: 0, animation: "pcTurn .45s cubic-bezier(.3,.7,.3,1)" }}>
            {local.front ? <div style={{ position: "absolute", inset: 0, borderRadius: 10, overflow: "hidden" }}>{front(state, theme, W)}</div> : <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: theme.mode === "dark" ? c.wash : p.paper, border: `1px solid ${c.divider}`, boxSizing: "border-box", overflow: "hidden" }}>
              <svg width={W} height={CARD_H} viewBox={`0 0 ${W} ${CARD_H}`} style={{ position: "absolute", left: -1, top: -1 }} aria-hidden="true">
                <line x1={half} y1={14} x2={half} y2={CARD_H - 14} stroke={c.divider} stroke-width={1} />
                {shown.map((x, i) => stampArt(x.stamp, sx(i), sy(i), rot(i), theme, x.who, x.at > 0 && x.at === lastAt))}
                {shown.length === 0 ? <rect x={W - 50} y={10} width={38} height={44} rx={2} fill="none" stroke={c.divider} stroke-width={1.5} stroke-dasharray="4 3" /> : null}
                <g transform={`translate(${pmX} ${pmY}) rotate(-8 30 30)`} opacity={0.85}>
                  <circle cx={30} cy={30} r={27} fill="none" stroke={mix(c.text, p.blue, 0.4)} stroke-width={1.6} />
                  <circle cx={30} cy={30} r={22} fill="none" stroke={mix(c.text, p.blue, 0.4)} stroke-width={0.8} />
                  <path d="M58 22 q8 -4 16 0 t16 0 t16 0 M58 30 q8 -4 16 0 t16 0 t16 0 M58 38 q8 -4 16 0 t16 0 t16 0" fill="none" stroke={mix(c.text, p.blue, 0.4)} stroke-width={1.3} />
                  <path id="pcArc" d="M10 30 A20 20 0 0 1 50 30" fill="none" />
                  <text font-size={Math.min(8, 50 / Math.max(1, state.place.length * 0.66))} font-weight={800} fill={mix(c.text, p.blue, 0.4)} letter-spacing={0.5} text-anchor="middle">
                    <textPath href="#pcArc" startOffset="50%">{state.place.toUpperCase()}</textPath>
                  </text>
                  <text x={30} y={40} font-size={8} font-weight={700} fill={mix(c.text, p.blue, 0.4)} text-anchor="middle">{state.date.toUpperCase()}</text>
                </g>
              </svg>
              {shown.map((x, i) => (
                <div key={x.who} style={{ position: "absolute", left: sx(i) + 22, top: sy(i) + 28, pointerEvents: "none" }}>
                  <Avatar user={person(x)} size={16} />
                </div>
              ))}
              {extra > 0 ? <div style={{ position: "absolute", right: 10, top: 104, fontSize: 12, fontWeight: 700, color: c.text }}>{`+${extra}`}</div> : null}
              <div style={{ position: "absolute", left: half + 12, right: 10, bottom: 12, fontSize: 13, lineHeight: "22px", color: c.text, fontFamily: hand, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", borderBottom: `1px solid ${c.divider}` }}>{state.authorName}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", borderBottom: `1px solid ${c.divider}` }}>{`somewhere in ${state.place}`}</div>
              </div>
              <div style={{ position: "absolute", left: 12, top: 10, width: half - 22, bottom: 10, overflow: "hidden" }}>
                {state.sigs.length === 0 ? (
                  <div style={{ fontFamily: hand, fontSize: 15, lineHeight: "22px", color: c.secondaryText, paddingTop: 30 }}>{`Dear ${state.authorName}, …`}<br />nobody has signed yet. Be the first line.</div>
                ) : (
                  <div style={{ fontFamily: hand, fontSize: 14, lineHeight: "18px", color: c.text, marginBottom: 2 }}>{`Dear ${state.authorName},`}</div>
                )}
                {fit.map((x) => (
                  <div key={x.who} style={{ padding: "3px 0", fontFamily: hand, fontSize: 12, lineHeight: "15px", color: c.text, borderBottom: `1px solid ${c.divider}`, animation: x.at === lastAt && x.at > 0 ? "pcIn .7s ease-out" : undefined }}>
                    {cut(x.line, Math.floor((2 * textW) / 5.6) - x.name.split(" ")[0]!.length - 3)}
                    <span style={{ fontWeight: 700, color: mix(userColor(x.who, theme), c.text, 0.35), whiteSpace: "nowrap" }}>{` – ${x.who === me ? "you" : x.name.split(" ")[0]}`}</span>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        </div>

        {local.open ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {STAMPS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={STAMP_NAME[k]}
                  onClick={() => setLocal({ stamp: k })}
                  style={{ flex: 1, minWidth: 0, height: 48, padding: 0, borderRadius: 8, border: `2px solid ${local.stamp === k ? c.primary : "transparent"}`, background: local.stamp === k ? c.selected : c.wash }}
                >
                  <svg width={30} height={36} viewBox="0 0 34 40" aria-hidden="true">
                    {stampArt(k, 0, 0, 0, theme, k, false)}
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={local.draft}
                maxLength={48}
                placeholder="miss u, bring snacks"
                aria-label="Your line"
                onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
                onKeyDown={(e: { key: string }) => (e.key === "Enter" ? submit() : undefined)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button kind="primary" disabled={!clean(local.draft, 48)} onClick={submit}>
                Stamp it
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <Button kind="secondary" onClick={() => setLocal({ front: !local.front })}>
              {local.front ? "Flip back" : "Flip it"}
            </Button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {state.sigs.length ? `${state.sigs.length} signed${state.sigs.length < MAX ? ` · room for ${MAX - state.sigs.length}` : " · full"}` : "Nobody yet"}
            </span>
            {!isAuthor && (mine || state.sigs.length < MAX) ? (
              <Button kind="primary" onClick={() => setLocal({ open: true, front: false, draft: mine?.line ?? "", stamp: mine?.stamp ?? local.stamp })}>
                {mine ? "Change mine" : "Sign it"}
              </Button>
            ) : null}
          </div>
        )}
        {local.toast > 0 && !local.open ? <Toast key={local.toast}>{`Stamped · ${state.sigs.length} signed`}</Toast> : null}
      </div>
    );
  },
});

