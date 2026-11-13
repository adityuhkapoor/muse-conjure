import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Win jar: someone posts a small win. A glass jar on a shelf with the win on its label; friends
// drop a coloured marble into it with a few words. Marbles tumble in and settle; tap one to read
// it. The jar fills, and the count on the label goes up.

type Hue = "red" | "yellow" | "green" | "blue" | "purple" | "orange";
type Params = {
  /** Who posted: "Arun" */
  author: string;
  /** The win, short, for the jar's label: "thesis draft done" */
  win: string;
  /** The post line */
  line: string;
  /** People outside the friends here who reacted; drawn as plain marbles */
  others: number;
  /** Friends who dropped a marble: colour (red, yellow, green, blue, purple, orange) and their words */
  marbles: { who: string; hue: Hue; note: string }[];
};

// @params
const P: Params = {
  author: "Arun",
  win: "Thesis draft: done",
  line: "finally finished the thesis draft",
  others: 7,
  marbles: [
    { who: "Maya", hue: "blue", note: "proud of u. it's on the spreadsheet" },
    { who: "Calvin", hue: "yellow", note: "i'd have slept thru the deadline" },
    { who: "Tsai Lin", hue: "red", note: "you get the aux tonight. once" },
    { who: "Will", hue: "green", note: "the rice cooker is proud too" },
  ],
};
// @end params

type Marble = { who: string; name: string; hue: Hue; note: string; at: number };
type State = { author: string; authorName: string; win: string; line: string; others: number; marbles: Marble[] };
type Action = { t: "drop"; hue: Hue; note: string } | { t: "take" };
type Local = { sel: string; hue: Hue; note: string; open: boolean; toast: number };

const HUES: Hue[] = ["red", "orange", "yellow", "green", "blue", "purple"];
const JAR_H = 226;
const R = 14;
const MAX_OTHERS = 40;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isHue = (v: unknown): v is Hue => typeof v === "string" && (HUES as string[]).includes(v);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const marbles: Marble[] = [];
  for (const m of Array.isArray(P.marbles) ? P.marbles.slice(0, 20) : []) {
    const name = clean(m?.who, 20);
    if (!name) continue;
    const mm = memberFor(ctx, name);
    const who = mm?.id ?? `name:${name}`;
    if (who === author || marbles.some((x) => x.who === who)) continue;
    marbles.push({ who, name: mm?.name ?? name, hue: isHue(m.hue) ? m.hue : "blue", note: clean(m.note, 48), at: 0 });
  }
  const others = typeof P.others === "number" && Number.isFinite(P.others) ? Math.max(0, Math.min(MAX_OTHERS, Math.round(P.others))) : 0;
  return { author, authorName, win: clean(P.win, 32) || "A small win", line: clean(P.line, 60), others, marbles };
}

/** Where marble i settles, packed from the bottom of a jar `w` wide whose floor is at `floor`. */
function slot(i: number, w: number, floor: number) {
  const per = Math.max(3, Math.floor(w / (2 * R)));
  let row = 0, left = i;
  for (;;) {
    const n = row % 2 ? per - 1 : per;
    if (left < n) break;
    left -= n;
    row++;
  }
  const off = (w - per * 2 * R) / 2 + (row % 2 ? R : 0);
  const wob = ((i * 37) % 7) - 3;
  return { x: off + R + left * 2 * R + wob * 0.4, y: floor - R - row * R * 1.72 };
}

function marbleFill(hue: Hue, t: Theme) {
  return pal(t)[hue];
}

export default defineApp<State, Action, Local>({
  name: "Win jar",
  summary: (s) => `${s.authorName}: ${s.win} · ${s.marbles.length + s.others} marbles in the jar`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const u = meta.user;
    if (a.t === "drop") {
      if (!isHue(a.hue)) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      return { ...s, marbles: [...s.marbles.filter((m) => m.who !== u), { who: u, name, hue: a.hue, note: clean(a.note, 48), at: meta.time }] };
    }
    if (a.t === "take") {
      if (!s.marbles.some((m) => m.who === u)) return s;
      return { ...s, marbles: s.marbles.filter((m) => m.who !== u) };
    }
    return s;
  },

  invariants: {
    "one marble per friend": (s) => new Set(s.marbles.map((m) => m.who)).size === s.marbles.length,
    "the winner doesn't fill their own jar": (s) => s.marbles.every((m) => m.who !== s.author),
    "every marble has a colour": (s) => s.marbles.every((m) => isHue(m.hue) && m.note.length <= 48),
    "the crowd count holds": (s) => Number.isInteger(s.others) && s.others >= 0 && s.others <= MAX_OTHERS,
  },

  transitions: {
    "a drop lands my marble on top": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const x = n.marbles[n.marbles.length - 1];
      return !!x && x.who === m.user && x.hue === a.hue && x.note === clean(a.note, 48) && x.at === m.time && n.marbles.filter((q) => q.who === m.user).length === 1;
    },
    "nobody else's marble moves": (p, n, _a, m) => p.marbles.filter((q) => q.who !== m.user).every((q) => n.marbles.includes(q)) && n.marbles.filter((q) => q.who !== m.user).length === p.marbles.filter((q) => q.who !== m.user).length,
    "a good drop lands": (p, n, a, m, ctx) => a.t !== "drop" || !inChat(ctx, m.user) || m.user === p.author || !isHue(a.hue) || p !== n,
    "taking out removes only mine": (p, n, a, m) => a.t !== "take" || p === n || (n.marbles.length === p.marbles.length - 1 && !n.marbles.some((q) => q.who === m.user)),
    "the label never changes": (p, n) => p.win === n.win && p.others === n.others && p.author === n.author && p.line === n.line,
    "only people in the chat drop marbles": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.15 ? { t: "take" } : { t: "drop", hue: r.next() < 0.95 ? r.pick(HUES) : ("gold" as Hue), note: r.pick(["proud of u", "", "LETS GO", "knew you would"]) }),

  local: { sel: "", hue: "orange", note: "", open: false, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const mine = state.marbles.find((m) => m.who === me);
    const person = (m: Marble): Member => members.find((x) => x.id === m.who) ?? { id: m.who, name: m.name };
    const jarW = Math.min(170, W * 0.48);
    const jx = 6, jy = 26, jh = JAR_H - 44;
    const innerW = jarW - 16;
    const floor = jh - 8;
    const lastAt = Math.max(0, ...state.marbles.map((m) => m.at));
    const sel = state.marbles.find((m) => m.who === local.sel) ?? [...state.marbles].sort((a, b) => b.at - a.at)[0];
    const total = state.others + state.marbles.length;
    // the crowd's plain marbles go in first, then friends', in order
    const order: ({ kind: "crowd"; i: number } | { kind: "friend"; m: Marble })[] = [
      ...Array.from({ length: state.others }, (_, i) => ({ kind: "crowd" as const, i })),
      ...state.marbles.map((m) => ({ kind: "friend" as const, m })),
    ];
    const tagX = jx + jarW + 14;
    const tags = [...state.marbles].sort((a, b) => b.at - a.at || state.marbles.indexOf(b) - state.marbles.indexOf(a)).slice(0, 3);
    const drop = () => {
      dispatch({ t: "drop", hue: local.hue, note: local.note });
      setLocal({ open: false, note: "", sel: me, toast: local.toast + 1 });
      haptic("success");
    };

    return (
      <div>
        <style>{"@keyframes wjFall { 0% { transform: translateY(-180px) } 55% { transform: translateY(6px) } 75% { transform: translateY(-8px) } 100% { transform: translateY(0) } } @keyframes wjSwing { 0%, 100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }"}</style>
        <CardHeader title={`${state.authorName}'s win jar`} subtitle={state.line ? `“${state.line}”` : state.win} />
        <div style={{ position: "relative", height: JAR_H }}>
          <svg width={W} height={JAR_H} viewBox={`0 0 ${W} ${JAR_H}`} role="img" aria-label={`Jar labelled ${state.win} with ${total} marbles`} style={{ position: "absolute", left: 0, top: 0 }}>
            <defs>
              <clipPath id="wjInside">
                <rect x={jx + 8} y={jy + 6} width={innerW} height={jh - 8} rx={16} />
              </clipPath>
            </defs>
            {/* shelf */}
            <rect x={0} y={jy + jh + 2} width={W} height={8} rx={3} fill={dark ? mix(p.brown, c.wash, 0.3) : p.crust} />
            <rect x={0} y={jy + jh + 10} width={W} height={4} fill={mix(c.text, c.card, 0.85)} />
            {/* jar back */}
            <rect x={jx} y={jy} width={jarW} height={jh} rx={22} fill={dark ? mix(c.wash, p.blue, 0.12) : mix(c.card, p.blue, 0.08)} stroke={mix(c.divider, p.blue, 0.3)} stroke-width={2} />
            <g clip-path="url(#wjInside)">
              {order.map((o, i) => {
                const q = slot(i, innerW, floor);
                if (q.y < 6) return null;
                const x = jx + 8 + q.x, y = jy + 6 + q.y;
                if (o.kind === "crowd")
                  return <circle key={`c${o.i}`} cx={x} cy={y} r={R - 1} fill={mix(c.track, c.card, dark ? 0 : 0.2)} stroke={c.divider} stroke-width={1} />;
                const fresh = o.m.at > 0 && o.m.at === lastAt;
                const on = sel?.who === o.m.who;
                return (
                  <g key={o.m.who} style={fresh ? { animation: "wjFall .9s cubic-bezier(.3,.6,.4,1)" } : {}}>
                    <circle cx={x} cy={y} r={R - 0.5} fill={marbleFill(o.m.hue, theme)} stroke={on ? c.text : mix(marbleFill(o.m.hue, theme), c.text, 0.3)} stroke-width={on ? 2 : 1} />
                    <circle cx={x - 3.5} cy={y - 3.5} r={4} fill={dark ? c.text : c.card} opacity={0.6} />
                  </g>
                );
              })}
            </g>
            {/* glass shine and lid */}
            <path d={`M${jx + 14} ${jy + 24} Q${jx + 10} ${jy + jh / 2} ${jx + 14} ${jy + jh - 24}`} fill="none" stroke={dark ? c.text : c.card} stroke-width={4} stroke-linecap="round" opacity={0.35} />
            <rect x={jx + 10} y={jy - 14} width={jarW - 20} height={16} rx={4} fill={p.red} stroke={mix(p.red, c.text, 0.35)} stroke-width={1} />
            <rect x={jx + 14} y={jy - 10} width={jarW - 28} height={3} rx={1.5} fill={mix(p.red, c.card, 0.4)} />
            {/* strings to the tags */}
            {tags.map((m, i) => (
              <path key={m.who} d={`M${jx + jarW - 16} ${jy - 6} Q${tagX - 10} ${jy + 8 + i * 58} ${tagX} ${jy + 18 + i * 60}`} fill="none" stroke={c.secondaryText} stroke-width={1} />
            ))}
          </svg>
          {/* the label */}
          <div style={{ position: "absolute", left: jx + 16, top: jy + 22, width: jarW - 32, padding: "5px 6px", boxSizing: "border-box", borderRadius: 6, background: c.card, border: `1px solid ${c.divider}`, textAlign: "center", transform: "rotate(-2deg)", pointerEvents: "none" }}>
            <div style={{ fontSize: 12, lineHeight: "15px", fontWeight: 700, color: c.text, overflowWrap: "anywhere" }}>{state.win}</div>
            <div style={{ fontSize: 11, lineHeight: "14px", color: c.text }}>{`${total} ${total === 1 ? "marble" : "marbles"}`}</div>
          </div>
          {/* hanging tags with the newest words */}
          {tags.map((m, i) => (
            <button key={m.who} type="button" onClick={() => setLocal({ sel: m.who })} style={{ position: "absolute", left: tagX, top: jy + 8 + i * 60, width: W - tagX - 2, minHeight: 48, border: "none", textAlign: "left", boxSizing: "border-box", padding: "6px 8px 6px 30px", borderRadius: 8, background: sel?.who === m.who ? mix(c.card, marbleFill(m.hue, theme), 0.22) : c.wash, transformOrigin: "0 50%", animation: `wjSwing ${3 + i * 0.4}s ease-in-out infinite` }}>
              <div style={{ position: "absolute", left: 6, top: 8 }}>
                <Avatar user={m.who === me ? me : person(m)} size={18} />
              </div>
              <div style={{ fontSize: 12, lineHeight: "15px", color: c.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{m.note || "dropped a marble"}</div>
            </button>
          ))}
          {state.marbles.length === 0 ? (
            <div style={{ position: "absolute", left: tagX, top: jy + 20, width: W - tagX - 2, fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>The jar's empty. Drop the first marble with a few words.</div>
          ) : null}
        </div>
        {local.open && !isAuthor ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {HUES.map((h) => (
                <button key={h} type="button" aria-label={`${h} marble`} onClick={() => setLocal({ hue: h })} style={{ flex: 1, minWidth: 0, height: 44, padding: 0, borderRadius: 8, border: `2px solid ${local.hue === h ? c.primary : c.divider}`, background: local.hue === h ? c.selected : c.card }}>
                  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx={12} cy={12} r={10} fill={marbleFill(h, theme)} />
                    <circle cx={8.5} cy={8.5} r={4} fill={dark ? c.text : c.card} opacity={0.6} />
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={local.note} maxLength={48} placeholder="Proud of you" aria-label="Your words" onInput={(e: { currentTarget: { value: string } }) => setLocal({ note: e.currentTarget.value })} onKeyDown={(e: { key: string }) => (e.key === "Enter" ? drop() : undefined)} style={{ flex: 1, minWidth: 0 }} />
              <Button kind="primary" onClick={drop}>
                Drop it in
              </Button>
            </div>
          </div>
        ) : !isAuthor ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {mine ? "Your marble's in the jar" : total ? `${state.marbles.length} friends · ${state.others} others` : "Be the first marble"}
            </span>
            <Button kind={mine ? "secondary" : "primary"} onClick={() => setLocal({ open: true, hue: mine?.hue ?? local.hue, note: mine?.note ?? "" })}>
              {mine ? "Change mine" : "Add a marble"}
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, color: c.secondaryText }}>{`${total} marbles so far · ${state.marbles.length} with words`}</div>
        )}
        {local.toast > 0 && mine && !local.open ? <Toast key={local.toast}>{`Marble ${total} is yours`}</Toast> : null}
      </div>
    );
  },
});
