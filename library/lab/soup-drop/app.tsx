import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Soup drop: someone posts that they're sick. A bedside tray drawn from above; friends drop one
// thing onto it (soup, tea, tissues, a show to watch, a playlist, oranges) with a few words. Each
// lands in a free spot with their face, and the thermometer on the tray creeps down as it fills.

type Kind = "soup" | "tea" | "tissues" | "show" | "playlist" | "oranges";
type Params = {
  /** Who's sick: "Will" */
  author: string;
  /** The post line: "day 3 of the flu, send help" */
  line: string;
  /** Temperature now in tenths of a degree, e.g. 1021 for 102.1 */
  temp: number;
  /** Unit to show: "F" or "C" */
  unit: string;
  /** Already on the tray: kind (soup, tea, tissues, show, playlist, oranges) and their words (for a show or playlist, its name) */
  tray: { who: string; kind: Kind; note?: string }[];
};

// @params
const P: Params = {
  author: "Will",
  line: "day 3 of the flu, send help",
  temp: 1021,
  unit: "F",
  tray: [
    { who: "Arun", kind: "soup", note: "rice cooker congee. it does soup now" },
    { who: "Maya", kind: "show", note: "Bake Off s3, ranked by episode" },
    { who: "Tsai Lin", kind: "playlist", note: "sick day mix (no skips, i checked)" },
    { who: "Calvin", kind: "tissues", note: "7 boxes, one per alarm" },
  ],
};
// @end params

type Item = { who: string; name: string; kind: Kind; note: string; at: number };
type State = { author: string; authorName: string; line: string; temp: number; unit: string; items: Item[] };
type Action = { t: "drop"; kind: Kind; note: string } | { t: "take" };
type Local = { kind: Kind; note: string; open: boolean; sel: string; toast: number };

const KINDS: Kind[] = ["soup", "tea", "tissues", "show", "playlist", "oranges"];
const KIND_NAME: Record<Kind, string> = { soup: "Soup", tea: "Tea", tissues: "Tissues", show: "A show", playlist: "A playlist", oranges: "Oranges" };
const SLOTS = 8;
const TRAY_H = 214;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as string[]).includes(v);
const normal = (unit: string) => (unit === "C" ? 370 : 986);
const reading = (s: State) => Math.max(normal(s.unit), s.temp - (s.unit === "C" ? 2 : 4) * s.items.length);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const items: Item[] = [];
  for (const it of Array.isArray(P.tray) ? P.tray : []) {
    const name = clean(it?.who, 20);
    if (!name || !isKind(it.kind) || items.length >= SLOTS) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || items.some((x) => x.who === who)) continue;
    items.push({ who, name: m?.name ?? name, kind: it.kind, note: clean(it.note, 44), at: 0 });
  }
  const unit = P.unit === "C" ? "C" : "F";
  const t = typeof P.temp === "number" && Number.isFinite(P.temp) ? Math.round(P.temp) : unit === "C" ? 388 : 1018;
  return { author, authorName, line: clean(P.line, 60), unit, temp: Math.max(normal(unit), Math.min(unit === "C" ? 420 : 1070, t)), items };
}

function art(kind: Kind, t: Theme) {
  const p = pal(t), c = t.color, edge = mix(c.text, c.card, 0.25);
  if (kind === "soup")
    return (
      <g>
        <circle cx={24} cy={24} r={20} fill={p.plate} stroke={edge} stroke-width={1} />
        <circle cx={24} cy={24} r={15} fill={p.orange} />
        <circle cx={19} cy={21} r={3} fill={p.green} />
        <circle cx={28} cy={27} r={2.5} fill={p.cream} />
        <circle cx={27} cy={18} r={2} fill={p.green} />
        <rect x={38} y={21} width={10} height={5} rx={2.5} fill={p.soft} />
      </g>
    );
  if (kind === "tea")
    return (
      <g>
        <circle cx={22} cy={24} r={15} fill={p.plate} stroke={edge} stroke-width={1} />
        <circle cx={22} cy={24} r={11} fill={p.brown} />
        <path d="M36 20 q8 4 0 9" fill="none" stroke={edge} stroke-width={3} />
        <rect x={8} y={4} width={7} height={8} fill={p.yellow} />
        <line x1={12} y1={12} x2={18} y2={18} stroke={edge} stroke-width={0.8} />
      </g>
    );
  if (kind === "tissues")
    return (
      <g>
        <rect x={4} y={10} width={40} height={28} rx={3} fill={p.blue} stroke={edge} stroke-width={1} />
        <ellipse cx={24} cy={24} rx={11} ry={5} fill={mix(p.blue, c.text, 0.3)} />
        <path d="M16 24 Q20 10 24 18 Q28 8 32 24 Z" fill={c.card} stroke={edge} stroke-width={0.8} />
      </g>
    );
  if (kind === "show")
    return (
      <g>
        <rect x={16} y={4} width={16} height={40} rx={6} fill={p.dark} />
        <circle cx={24} cy={12} r={3.5} fill={p.red} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={19} y={20 + i * 7} width={10} height={4} rx={2} fill={p.soft} />
        ))}
      </g>
    );
  if (kind === "playlist")
    return (
      <g>
        <path d="M8 28 Q8 8 24 8 Q40 8 40 28" fill="none" stroke={p.purple} stroke-width={4} />
        <rect x={4} y={24} width={10} height={16} rx={4} fill={p.purple} />
        <rect x={34} y={24} width={10} height={16} rx={4} fill={p.purple} />
      </g>
    );
  return (
    <g>
      {[[14, 18], [32, 16], [22, 32]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={10} fill={p.orange} stroke={mix(p.orange, c.text, 0.3)} stroke-width={1} />
          <path d={`M${x} ${y! - 10} l3 -4`} stroke={p.green} stroke-width={2} />
        </g>
      ))}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Soup drop",
  summary: (s) => `${s.authorName}: ${s.items.length} ${s.items.length === 1 ? "thing" : "things"} on the tray · ${(reading(s) / 10).toFixed(1)}°${s.unit}`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const u = meta.user;
    const old = s.items.find((x) => x.who === u);
    if (a.t === "drop") {
      if (!isKind(a.kind) || (!old && s.items.length >= SLOTS)) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      const it: Item = { who: u, name, kind: a.kind, note: clean(a.note, 44), at: meta.time };
      return { ...s, items: old ? s.items.map((x) => (x === old ? it : x)) : [...s.items, it] };
    }
    if (a.t === "take") {
      if (!old) return s;
      return { ...s, items: s.items.filter((x) => x !== old) };
    }
    return s;
  },

  invariants: {
    "one thing per friend": (s) => new Set(s.items.map((x) => x.who)).size === s.items.length,
    "the tray holds eight": (s) => s.items.length <= SLOTS,
    "nobody brings their own soup": (s) => s.items.every((x) => x.who !== s.author),
    "everything on the tray is a real thing": (s) => s.items.every((x) => isKind(x.kind) && x.note.length <= 44),
    "the fever is a fever": (s) => Number.isInteger(s.temp) && s.temp >= normal(s.unit),
  },

  transitions: {
    "a drop puts my thing on the tray": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const x = n.items.find((q) => q.who === m.user);
      return !!x && x.kind === a.kind && x.note === clean(a.note, 44) && x.at === m.time;
    },
    "a change keeps my spot, a first drop takes the next": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const i = p.items.findIndex((q) => q.who === m.user);
      return i >= 0 ? n.items.length === p.items.length && n.items[i]!.who === m.user : n.items.length === p.items.length + 1 && n.items[n.items.length - 1]!.who === m.user;
    },
    "nobody else's thing moves": (p, n, _a, m) => p.items.filter((q) => q.who !== m.user).every((q) => n.items.includes(q)),
    "a drop with room lands": (p, n, a, m, ctx) => a.t !== "drop" || !inChat(ctx, m.user) || m.user === p.author || !isKind(a.kind) || (p.items.length >= SLOTS && !p.items.some((q) => q.who === m.user)) || p !== n,
    "taking back removes only mine": (p, n, a, m) => a.t !== "take" || p === n || (n.items.length === p.items.length - 1 && !n.items.some((q) => q.who === m.user)),
    "the post never changes": (p, n) => p.temp === n.temp && p.unit === n.unit && p.author === n.author && p.line === n.line,
    "only people in the chat drop things": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.15 ? { t: "take" } : { t: "drop", kind: r.next() < 0.95 ? r.pick(KINDS) : ("pizza" as Kind), note: r.pick(["", "feel better", "Severance s1", "chicken noodle"]) }),

  local: { kind: "soup", note: "", open: false, sel: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const mine = state.items.find((x) => x.who === me);
    const person = (x: Item): Member => members.find((m) => m.id === x.who) ?? { id: x.who, name: x.name };
    const lastAt = Math.max(0, ...state.items.map((x) => x.at));
    const sel = state.items.find((x) => x.who === local.sel) ?? [...state.items].sort((a, b) => b.at - a.at)[0];
    const r = reading(state);
    const norm = normal(state.unit);
    const hot = Math.max(0, Math.min(1, (r - norm) / (state.unit === "C" ? 22 : 40)));
    const fever = hot < 0.1 ? p.blue : mix(p.orange, p.red, hot);
    const cols = 4;
    const ix = 22, iy = 46, iw = W - 44, ih = TRAY_H - 64;
    const cw = iw / cols, chh = ih / 2;
    const send = () => {
      dispatch({ t: "drop", kind: local.kind, note: local.note });
      setLocal({ open: false, note: "", sel: me, toast: local.toast + 1 });
      haptic("success");
    };

    return (
      <div>
        <style>{"@keyframes sdDrop { 0% { transform: translateY(-60px) scale(1.3) rotate(-10deg); opacity: 0 } 60% { transform: translateY(4px) scale(.95); opacity: 1 } 100% { transform: translateY(0) scale(1) } } @keyframes sdSteam { 0%, 100% { transform: translateY(0); opacity: .4 } 50% { transform: translateY(-4px); opacity: .9 } }"}</style>
        <CardHeader title={`Get well, ${state.authorName}`} subtitle={state.line ? `“${state.line}”` : `${state.items.length} things on the tray`} />
        <div style={{ position: "relative", height: TRAY_H }}>
          <svg width={W} height={TRAY_H} viewBox={`0 0 ${W} ${TRAY_H}`} role="img" aria-label={`Bedside tray with ${state.items.length} of ${SLOTS} things; thermometer at ${(r / 10).toFixed(1)} degrees`} style={{ position: "absolute", left: 0, top: 0 }}>
            {/* the blanket underneath */}
            <rect x={0} y={0} width={W} height={TRAY_H} rx={12} fill={dark ? mix(c.wash, p.blue, 0.15) : mix(c.card, p.blue, 0.12)} />
            <path d={`M0 30 L${W} 30 M0 ${TRAY_H - 26} L${W} ${TRAY_H - 26}`} stroke={dark ? mix(c.wash, p.blue, 0.3) : mix(c.card, p.blue, 0.25)} stroke-width={6} />
            {/* tray */}
            <rect x={8} y={14} width={W - 16} height={TRAY_H - 26} rx={14} fill={dark ? mix(p.brown, c.wash, 0.35) : p.crust} />
            <rect x={14} y={20} width={W - 28} height={TRAY_H - 38} rx={10} fill={dark ? mix(p.brown, c.wash, 0.15) : mix(p.crust, c.card, 0.35)} />
            <rect x={W / 2 - 24} y={16} width={48} height={7} rx={3.5} fill={dark ? mix(p.brown, c.wash, 0.6) : mix(p.crust, c.text, 0.3)} />
            {/* thermometer */}
            <g transform={`translate(${ix} 26)`}>
              <rect x={0} y={0} width={iw * 0.62} height={12} rx={6} fill={c.card} stroke={c.divider} stroke-width={1} />
              <circle cx={6} cy={6} r={8} fill={fever} stroke={c.divider} stroke-width={1} />
              <rect x={8} y={3} width={Math.max(4, (iw * 0.62 - 14) * (0.15 + 0.85 * hot))} height={6} rx={3} fill={fever} style={{ transition: "width .8s ease-out" }} />
            </g>
            {/* empty spots */}
            {Array.from({ length: SLOTS }, (_, i) =>
              i >= state.items.length ? (
                <rect key={i} x={ix + (i % cols) * cw + 6} y={iy + Math.floor(i / cols) * chh + 6} width={cw - 12} height={chh - 12} rx={10} fill="none" stroke={dark ? mix(p.brown, c.text, 0.5) : mix(p.crust, c.text, 0.35)} stroke-width={1.4} stroke-dasharray="4 4" />
              ) : null,
            )}
          </svg>
          <div style={{ position: "absolute", left: ix + iw * 0.62 + 8, top: 22, fontSize: 13, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{`${(r / 10).toFixed(1)}°${state.unit}`}</div>
          {state.items.map((x, i) => {
            const left = ix + (i % cols) * cw, top = iy + Math.floor(i / cols) * chh;
            const on = sel?.who === x.who;
            return (
              <button
                key={x.who}
                type="button"
                aria-label={`${KIND_NAME[x.kind]} from ${x.name}`}
                onClick={() => setLocal({ sel: x.who })}
                style={{ position: "absolute", left: left + 2, top: top + 2, width: cw - 4, height: chh - 4, padding: 0, border: on ? `2px solid ${c.primary}` : "2px solid transparent", borderRadius: 12, background: "none", animation: x.at > 0 && x.at === lastAt ? "sdDrop .55s cubic-bezier(.2,1.3,.5,1)" : undefined }}
              >
                <svg width={48} height={48} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", margin: "auto" }}>
                  {art(x.kind, theme)}
                </svg>
                {x.kind === "soup" || x.kind === "tea" ? (
                  <svg width={20} height={14} viewBox="0 0 20 14" aria-hidden="true" style={{ position: "absolute", left: (cw - 4) / 2 - 10, top: 0, animation: "sdSteam 2s ease-in-out infinite" }}>
                    <path d="M5 13 q-3 -4 0 -7 q3 -3 0 -6 M12 13 q-3 -4 0 -7 q3 -3 0 -6" fill="none" stroke={dark ? c.text : mix(c.text, c.card, 0.5)} stroke-width={1.4} />
                  </svg>
                ) : null}
                <div style={{ position: "absolute", right: 2, bottom: 2 }}>
                  <Avatar user={x.who === me ? me : person(x)} size={18} />
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sel ? `${sel.who === me ? "You" : sel.name.split(" ")[0]} · ${KIND_NAME[sel.kind].toLowerCase()}${sel.note ? `: “${sel.note}”` : ""}` : `The tray's empty · ${state.authorName} could use soup`}
          </span>
        </div>
        {local.open && !isAuthor ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {KINDS.map((k) => (
                <button key={k} type="button" aria-label={KIND_NAME[k]} onClick={() => setLocal({ kind: k })} style={{ flex: 1, minWidth: 0, height: 44, padding: 0, borderRadius: 8, border: `2px solid ${local.kind === k ? c.primary : c.divider}`, background: local.kind === k ? c.selected : c.card }}>
                  <svg width={30} height={30} viewBox="0 0 48 48" aria-hidden="true">
                    {art(k, theme)}
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={local.note} maxLength={44} placeholder={local.kind === "show" ? "Which show" : local.kind === "playlist" ? "Name the playlist" : "A few words"} aria-label="Your words" onInput={(e: { currentTarget: { value: string } }) => setLocal({ note: e.currentTarget.value })} onKeyDown={(e: { key: string }) => (e.key === "Enter" ? send() : undefined)} style={{ flex: 1, minWidth: 0 }} />
              <Button kind="primary" onClick={send}>
                Drop it off
              </Button>
            </div>
          </div>
        ) : !isAuthor ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {mine ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "take" })}>
                Take it back
              </Button>
            ) : null}
            <div style={{ flex: 1 }}>
              {mine || state.items.length < SLOTS ? (
                <Button kind={mine ? "secondary" : "primary"} wide onClick={() => setLocal({ open: true, kind: mine?.kind ?? local.kind, note: mine?.note ?? "" })}>
                  {mine ? "Swap mine" : "Bring something"}
                </Button>
              ) : (
                <Button kind="secondary" wide disabled>
                  The tray is full
                </Button>
              )}
            </div>
          </div>
        ) : null}
        {local.toast > 0 && mine && !local.open ? <Toast key={local.toast}>{`On the tray · ${(r / 10).toFixed(1)}°${state.unit} and falling`}</Toast> : null}
      </div>
    );
  },
});
