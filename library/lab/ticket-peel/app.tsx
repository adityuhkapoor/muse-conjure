import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  tween,
  type Child,
  type Ctx,
  type Meta,
} from "@muse/app";

// Ticket peel: a friend got a parking ticket while everyone else was in the lake. His windshield with
// the orange ticket under the wiper, cut into strips, one per friend. Tap to peel off your strip
// (your share) with a little note; strips curl away until the glass is clear and he gets a burst.

type Params = {
  /** Whose ticket */
  who: string;
  /** The car: "the Sube" */
  car: string;
  /** Where and when: "Lot C · lake day" */
  where: string;
  fineCents: number;
  /** Friends chipping in (not the ticket's owner) */
  friends: string[];
  /** Notes to pick from when peeling */
  notes: string[];
  /** Strips already peeled: who and which note */
  peeled: { who: string; note: string }[];
};

// @params
const P: Params = {
  who: "Will",
  car: "the Sube",
  where: "Lake Wren lot · lake day",
  fineCents: 4500,
  friends: ["Maya", "Arun", "Aditya", "Calvin", "Tsai Lin"],
  notes: ["not ur fault king", "the Sube deserved better", "lowkey worth it", "lake tax"],
  peeled: [
    { who: "Maya", note: "not ur fault king" },
    { who: "Arun", note: "rice cooker fund covers it" },
  ],
};
// @end params

type Friend = { id: string; name: string };
type Peel = { id: string; at: number; note: string };
type State = { owner: Friend; car: string; where: string; fine: number; friends: Friend[]; notes: string[]; peeled: Peel[]; clearAt: number };
type Action = { t: "peel"; note: number } | { t: "unpeel" } | { t: "mark"; who: string; note: number };
type Local = { note: number; toast: number };

const CURL = tween({ duration: 900, easing: "accelerate" });
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
/** Strip values: the fine split evenly, spare cents to the first strips. */
const strips = (s: State) => s.friends.map((_, i) => Math.floor(s.fine / Math.max(1, s.friends.length)) + (i < s.fine % Math.max(1, s.friends.length) ? 1 : 0));
const peeledBy = (s: State, id: string) => s.peeled.some((p) => p.id === id);
const raised = (s: State) => s.friends.reduce((a, f, i) => a + (peeledBy(s, f.id) ? strips(s)[i]! : 0), 0);

function initState(ctx: Ctx): State {
  const resolve = (name: string): Friend => {
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    return { id: m ? m.id : name, name: m ? clean(m.name, 20) || name : name };
  };
  const owner = resolve(clean(P.who, 20) || "Friend");
  const friends: Friend[] = [];
  for (const f of Array.isArray(P.friends) ? P.friends : []) {
    const n = clean(f, 20);
    if (!n || friends.length >= 6) continue;
    const p = resolve(n);
    if (p.id !== owner.id && !friends.some((x) => x.id === p.id)) friends.push(p);
  }
  if (!friends.length) for (const m of ctx.members) if (friends.length < 6 && m.id !== owner.id) friends.push({ id: m.id, name: clean(m.name, 20) || "Friend" });
  if (!friends.length) friends.push({ id: "Friend", name: "Friend" });
  const notes = (Array.isArray(P.notes) ? P.notes : []).map((n) => clean(n, 32)).filter(Boolean).slice(0, 4);
  if (!notes.length) notes.push("got you");
  const peeled: Peel[] = [];
  for (const p of Array.isArray(P.peeled) ? P.peeled : []) {
    const f = friends.find((x) => same(x.name, clean(p?.who, 20)));
    if (f && !peeled.some((x) => x.id === f.id)) peeled.push({ id: f.id, at: 0, note: clean(p.note, 40) });
  }
  const fine = Number.isInteger(P.fineCents) && P.fineCents > 0 && P.fineCents < 100_000 ? P.fineCents : 4500;
  const s: State = { owner, car: clean(P.car, 16) || "the car", where: clean(P.where, 32), fine, friends, notes, peeled, clearAt: 0 };
  return { ...s, clearAt: peeled.length === friends.length ? 1 : 0 };
}

function withPeels(s: State, peeled: Peel[], meta: Meta): State {
  const all = s.friends.every((f) => peeled.some((p) => p.id === f.id));
  return { ...s, peeled, clearAt: all ? s.clearAt || meta.time : 0 };
}

function reducePeel(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  const noteOk = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < s.notes.length;
  if (a.t === "peel") {
    if (!s.friends.some((f) => f.id === u) || peeledBy(s, u) || !noteOk(a.note)) return s;
    return withPeels(s, [...s.peeled, { id: u, at: meta.time, note: s.notes[a.note as number]! }], meta);
  }
  if (a.t === "unpeel") {
    if (!peeledBy(s, u) || s.clearAt) return s;
    return withPeels(s, s.peeled.filter((p) => p.id !== u), meta);
  }
  if (a.t === "mark") {
    const who = a.who;
    if (typeof who !== "string" || !noteOk(a.note) || inChat(ctx, who) || !s.friends.some((f) => f.id === who) || peeledBy(s, who)) return s;
    return withPeels(s, [...s.peeled, { id: who, at: meta.time, note: s.notes[a.note as number]! }], meta);
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Ticket peel",
  summary: (s) =>
    s.clearAt
      ? `${s.owner.name}'s ticket: glass is clear, ${money(s.fine)} covered by ${s.friends.length}`
      : `${s.owner.name}'s ${money(s.fine)} ticket: ${s.peeled.length} of ${s.friends.length} strips peeled`,

  init: initState,
  reduce: (s, a, meta, ctx) => reducePeel(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "strips add up to the fine": (s) => strips(s).reduce((a, b) => a + b, 0) === s.fine && strips(s).every((x) => x > 0 || s.fine < s.friends.length),
    "each strip peels once": (s) => new Set(s.peeled.map((p) => p.id)).size === s.peeled.length && s.peeled.every((p) => s.friends.some((f) => f.id === p.id)),
    "the ticket's owner never chips in": (s) => s.friends.every((f) => f.id !== s.owner.id),
    "clear exactly when every strip is off": (s) => (s.clearAt > 0) === (s.peeled.length === s.friends.length),
    "raised never passes the fine": (s) => raised(s) <= s.fine && (s.clearAt === 0 || raised(s) === s.fine),
  },

  transitions: {
    "peeling takes off exactly your strip, with a note from the list": (p, n, a, m) =>
      a.t !== "peel" || p === n || (!peeledBy(p, m.user) && n.peeled.length === p.peeled.length + 1 && n.peeled.at(-1)!.id === m.user && n.peeled.at(-1)!.at === m.time && n.peeled.at(-1)!.note === p.notes[a.note]),
    "only you put your strip back, before the glass is clear": (p, n, a, m) =>
      a.t !== "unpeel" || p === n || (p.clearAt === 0 && peeledBy(p, m.user) && !peeledBy(n, m.user) && n.peeled.length === p.peeled.length - 1),
    "marking is for friends outside the chat": (p, n, a, _m, ctx) => a.t !== "mark" || p === n || (!inChat(ctx, a.who) && peeledBy(n, a.who) && n.peeled.length === p.peeled.length + 1),
    "a clear windshield stays clear": (p, n) => p.clearAt === 0 || (n.clearAt === p.clearAt && n.peeled.length === p.peeled.length),
    "the ticket never changes": (p, n) => p.fine === n.fine && p.friends === n.friends && p.notes === n.notes,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r, ctx) => {
    const k = r.next();
    if (k < 0.55) return { t: "peel", note: r.int(s.notes.length) };
    if (k < 0.72) return { t: "unpeel" };
    const out = s.friends.filter((f) => !inChat(ctx, f.id) && !peeledBy(s, f.id));
    return out.length ? { t: "mark", who: r.pick(out).id, note: r.int(s.notes.length) } : { t: "peel", note: 0 };
  },

  local: { note: 0, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const font = theme.type.family;
    const sv = strips(state);
    const clear = state.clearAt > 0;
    const myI = state.friends.findIndex((f) => f.id === me);
    const mine = myI >= 0 && peeledBy(state, me);
    const noteI = Math.min(local.note, state.notes.length - 1);

    // The car from the front: roof, windshield, hood.
    const cx = W / 2;
    const tX = Math.round(W * 0.26);
    const gTop = 14;
    const gBot = 118;
    const gTopW = W * 0.8;
    const gBotW = W * 0.94;
    const body = dark ? mix(pl.green, c.card, 0.3) : mix(pl.green, c.text, 0.35);
    const glass = dark ? mix(pl.sky, c.wash, 0.55) : pl.sky;
    const art: Child[] = [];
    const over: Child[] = [];
    art.push(<path key="roof" d={`M ${cx - gTopW / 2 - 8} ${gTop + 8} Q ${cx} ${gTop - 22} ${cx + gTopW / 2 + 8} ${gTop + 8} L ${cx + gBotW / 2 + 6} ${gBot + 8} L ${cx - gBotW / 2 - 6} ${gBot + 8} Z`} fill={body} />);
    art.push(<path key="glass" d={`M ${cx - gTopW / 2} ${gTop + 10} Q ${cx} ${gTop - 8} ${cx + gTopW / 2} ${gTop + 10} L ${cx + gBotW / 2 - 4} ${gBot} L ${cx - gBotW / 2 + 4} ${gBot} Z`} fill={glass} />);
    art.push(<path key="shine" d={`M ${cx + 30} ${gTop + 8} L ${cx + 50} ${gTop + 8} L ${cx + 10} ${gBot - 2} L ${cx - 10} ${gBot - 2} Z`} fill={c.card} opacity={0.3} />);
    art.push(<path key="dash" d={`M ${cx - gBotW / 2 + 6} ${gBot - 12} H ${cx + gBotW / 2 - 6} L ${cx + gBotW / 2 - 4} ${gBot} H ${cx - gBotW / 2 + 4} Z`} fill={dark ? mix(c.text, c.card, 0.7) : mix(c.text, c.card, 0.55)} />);
    art.push(<circle key="wheel" cx={tX * 0.55} cy={gBot - 16} r={16} fill="none" stroke={c.text} stroke-width={4} />);
    const hoodTop = gBot + 8;
    art.push(<path key="hood" d={`M ${cx - gBotW / 2 - 6} ${hoodTop} H ${cx + gBotW / 2 + 6} L ${W} ${H - 22} Q ${W} ${H - 4} ${W - 16} ${H - 4} H 16 Q 0 ${H - 4} 0 ${H - 22} Z`} fill={dark ? mix(pl.green, c.card, 0.4) : mix(pl.green, c.text, 0.2)} />);
    art.push(<path key="crease" d={`M ${cx - 40} ${hoodTop + 4} Q ${cx} ${hoodTop + 14} ${cx + 40} ${hoodTop + 4}`} fill="none" stroke={body} stroke-width={2} />);
    art.push(<ellipse key="hl1" cx={26} cy={H - 30} rx={18} ry={9} fill={pl.yellow} />);
    art.push(<ellipse key="hl2" cx={W - 26} cy={H - 30} rx={18} ry={9} fill={pl.yellow} />);
    art.push(<rect key="grille" x={cx - 46} y={H - 46} width={92} height={12} rx={6} fill={body} />);
    art.push(<rect key="plate" x={cx - 28} y={H - 28} width={56} height={18} rx={3} fill={c.card} stroke={c.text} stroke-width={1} />);
    art.push(
      <text key="pt" x={cx} y={H - 15} text-anchor="middle" font-size={11} font-weight={700} fill={c.text} font-family={font}>
        {state.car.replace(/^the /i, "").slice(0, 7)}
      </text>,
    );

    // The owner behind the glass.
    over.push(
      <div key="drv" style={{ position: "absolute", left: tX * 0.55 - 17, top: gBot - 66, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
        <Avatar user={state.owner} size={34} />
      </div>,
    );

    // The ticket under the wiper, strip by strip.
    const n = state.friends.length;
    const tY = gTop + 18;
    const tH = 78;
    const tW = Math.round(cx + gTopW / 2 - tX - 6);
    const sw = tW / n;
    const tInk = dark ? c.card : c.text;
    art.push(<rect key="tback" x={tX} y={tY} width={tW} height={tH} rx={3} fill="none" stroke={mix(pl.orange, c.card, 0.3)} stroke-width={1} opacity={clear ? 0 : 0.6} />);
    state.friends.forEach((f, i) => {
      const pe = state.peeled.find((p) => p.id === f.id);
      const e = pe && pe.at > 0 ? running(pe.at, 900) : null;
      if (pe && e === null) return;
      const k = e === null ? 0 : CURL(e);
      const x = tX + sw * i;
      art.push(
        <g key={`st${f.id}`} transform={`translate(${x + sw / 2 + k * 60} ${tY - k * 70}) rotate(${k * 55}) scale(${1 - 0.5 * k})`} opacity={1 - k}>
          <rect x={-sw / 2} y={0} width={sw} height={tH} fill={pl.orange} />
          <path d={`M ${sw / 2} 0 V ${tH}`} stroke={mix(pl.orange, c.card, 0.6)} stroke-width={1} stroke-dasharray="3 3" />
          <rect x={-sw / 2 + 3} y={6} width={sw - 6} height={3} rx={1.5} fill={mix(pl.orange, c.text, 0.35)} />
          <rect x={-sw / 2 + 3} y={13} width={(sw - 6) * 0.7} height={3} rx={1.5} fill={mix(pl.orange, c.text, 0.35)} />
          <text x={0} y={34} text-anchor="middle" font-size={sw < 40 ? 11 : 13} font-weight={700} fill={tInk} font-family={font}>
            {money(sv[i]!)}
          </text>
        </g>,
      );
      if (e === null) {
        const isMe = f.id === me;
        const canMark = !inChat({ room: "", members }, f.id);
        const act = isMe ? () => { dispatch({ t: "peel", note: noteI }); haptic("light"); setLocal({ toast: local.toast + 1 }); } : canMark ? () => dispatch({ t: "mark", who: f.id, note: noteI }) : null;
        over.push(
          <button
            key={`b${f.id}`}
            type="button"
            class="m-hit"
            aria-label={isMe ? `Peel your strip, ${money(sv[i]!)}` : canMark ? `Mark ${f.name}'s strip peeled` : `${f.name}'s strip, ${money(sv[i]!)}`}
            {...(act ? { onClick: act } : {})}
            style={{ position: "absolute", left: x, top: tY, width: sw, height: tH, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6, cursor: act ? "pointer" : "default", boxShadow: isMe ? `inset 0 0 0 2px ${c.primary}` : "none" }}
          >
            <Avatar user={f} size={Math.min(22, sw - 6)} />
          </button>,
        );
      }
    });
    // the wiper on top of the ticket
    art.push(<path key="wiper" d={`M ${tX - 14} ${gBot - 6} L ${tX + tW - 4} ${tY + tH - 6}`} stroke={c.text} stroke-width={4} stroke-linecap="round" />);
    art.push(<rect key="ttitle" x={tX} y={tY - 14} width={tW} height={14} rx={2} fill={clear ? "none" : dark ? mix(pl.orange, c.card, 0.55) : mix(pl.orange, c.text, 0.25)} />);
    if (!clear)
      art.push(
        <text key="tt" x={tX + tW / 2} y={tY - 3} text-anchor="middle" font-size={10} font-weight={700} fill={dark ? c.text : c.card} font-family={font}>
          {`Parking · ${money(state.fine - raised(state))} left`}
        </text>,
      );

    // Notes from the peelers, stuck to the glass
    state.peeled.slice(-3).forEach((p, j) => {
      const f = state.friends.find((x) => x.id === p.id)!;
      const nx = 40 + j * 4;
      const ny = hoodTop + 4 + j * 19;
      over.push(
        <div
          key={`n${p.id}`}
          style={{ position: "absolute", left: j % 2 ? W - 150 - nx : nx, top: ny, maxWidth: 150, display: "flex", alignItems: "center", gap: 4, padding: "2px 6px 2px 2px", borderRadius: 6, background: mix(pl.yellow, c.card, dark ? 0.15 : 0.45), color: dark ? c.card : c.text, fontSize: 11, lineHeight: "14px", transform: `rotate(${j % 2 ? 2 : -2}deg)`, pointerEvents: "none" }}
        >
          <Avatar user={f} size={16} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note}</span>
        </div>,
      );
    });

    // Burst of hearts from the driver once the glass is clear
    const be = clear && state.clearAt > 1 ? running(state.clearAt, 1600) : null;
    if (be !== null) {
      const q = be / 1600;
      for (let k = 0; k < 8; k++) {
        const ang = -Math.PI / 2 + (k - 3.5) * 0.35;
        const d = 20 + 90 * q;
        art.push(
          <path
            key={`h${k}`}
            d="M0 3 C-6 -3 -3 -8 0 -4 C3 -8 6 -3 0 3 Z"
            transform={`translate(${tX * 0.5 + Math.cos(ang) * d} ${gBot - 60 + Math.sin(ang) * d}) scale(${1.6 - q * 0.6})`}
            fill={k % 2 ? pl.red : pl.yellow}
            opacity={1 - q}
          />,
        );
      }
    }
    if (clear)
      art.push(
        <g key="clear" transform={`translate(${tX + tW / 2} ${tY + 36}) rotate(-5)`}>
          <rect x={-58} y={-16} width={116} height={32} rx={16} fill={c.card} />
          <text x={0} y={5} text-anchor="middle" font-size={14} font-weight={700} fill={c.text} font-family={font}>
            All clear!
          </text>
        </g>,
      );

    return (
      <div>
        <CardHeader title={`${state.owner.name}'s ${money(state.fine)} ticket`} subtitle={`${state.where} · ${state.peeled.length} of ${n} strips off`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${state.owner.name}'s windshield with a ${money(state.fine)} ticket, ${state.peeled.length} of ${n} strips peeled`} style={{ display: "block" }}>
            {art}
          </svg>
          {over}
        </div>
        {myI >= 0 && !mine && !clear ? (
          <div role="group" aria-label="Note" style={{ marginTop: 8, display: "flex", gap: 6, overflow: "hidden" }}>
            {state.notes.slice(0, 3).map((nt, i) => (
              <button
                key={`c${i}`}
                type="button"
                class="m-hit"
                aria-pressed={i === noteI}
                onClick={() => setLocal({ note: i })}
                style={{ position: "relative", flex: "0 1 auto", minWidth: 0, height: 36, padding: "0 10px", borderRadius: 18, fontSize: 13, background: i === noteI ? c.selected : c.secondaryButton, color: i === noteI ? c.link : c.text, fontWeight: i === noteI ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {nt}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {clear ? (
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.text }}>{`Glass is clear · ${state.owner.name}'s covered`}</span>
          ) : myI >= 0 && !mine ? (
            <Button kind="primary" wide onClick={() => { dispatch({ t: "peel", note: noteI }); haptic("light"); setLocal({ toast: local.toast + 1 }); }}>
              {`Peel off ${money(sv[myI]!)}`}
            </Button>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {mine ? `You peeled ${money(sv[myI]!)} · ${n - state.peeled.length} ${n - state.peeled.length === 1 ? "strip" : "strips"} left` : me === state.owner.id ? `${money(raised(state))} of ${money(state.fine)} peeled off` : `${n - state.peeled.length} ${n - state.peeled.length === 1 ? "strip" : "strips"} left`}
              </span>
              {mine ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unpeel" })}>
                  Undo
                </Button>
              ) : null}
            </>
          )}
        </div>
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`${money(sv[myI]!)} to ${state.owner.name} · strip's off`}</Toast> : null}
      </div>
    );
  },
});
