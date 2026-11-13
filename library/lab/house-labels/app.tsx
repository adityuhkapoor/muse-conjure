import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  running,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// House labels: the apartment's things, drawn on the wall, and an embossing label maker. Pick a thing,
// punch out a label in your own words, and the tape strip flies over and sticks to it. Anyone can
// relabel anything; only you can peel your own.

type Thing = "fridge" | "cooker" | "shower" | "speaker" | "clock" | "binder" | "plant" | "door";
type Params = {
  /** Whose place it is */
  place: string;
  /** 3 to 6 things, with the label already on each (or none) */
  things: { name: string; kind: Thing; label?: string; by?: string }[];
};

// @params
const P: Params = {
  place: "412 Pine",
  things: [
    { name: "The shower", kind: "shower", label: "10 min max, will", by: "Calvin" },
    { name: "Rice cooker", kind: "cooker", label: "makes everything", by: "Arun" },
    { name: "The aux", kind: "speaker", label: "tsai lin approved only", by: "Tsai Lin" },
    { name: "Calvin's alarm", kind: "clock", label: "alarm 7 of 7", by: "Maya" },
    { name: "The fridge", kind: "fridge" },
    { name: "Chore binder", kind: "binder", label: "color coded. hands off", by: "Maya" },
  ],
};
// @end params

type Label = { text: string; by: string; at: number };
type Item = { name: string; kind: Thing; label: Label | null; was: string };
type State = { place: string; things: Item[]; cast: string[] };
type Action = { t: "stick"; i: number; text: string } | { t: "peel"; i: number };
type Local = { sel: number; draft: string; toast: number };

const KINDS: Thing[] = ["fridge", "cooker", "shower", "speaker", "clock", "binder", "plant", "door"];
const FLY = tween({ duration: 700, easing: "decelerate" });
const CELL_H = 96;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const idx = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;

function initState(ctx: Ctx): State {
  const things: Item[] = [];
  const cast: string[] = [];
  for (const t of Array.isArray(P.things) ? P.things : []) {
    const name = clean(t?.name, 20);
    if (!name || things.length >= 6) continue;
    const text = clean(t.label, 24);
    const by = clean(t.by, 20);
    let label: Label | null = null;
    if (text && by) {
      const id = idFor(ctx, by);
      if (!cast.includes(id)) cast.push(id);
      label = { text, by: id, at: 0 };
    }
    things.push({ name, kind: KINDS.includes(t.kind) ? t.kind : "door", label, was: "" });
  }
  return { place: clean(P.place, 24) || "the apartment", things, cast };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u) || !idx(a.i, s.things.length)) return s;
  const t = s.things[a.i]!;
  if (a.t === "stick") {
    const text = clean(a.text, 24);
    if (!text) return s;
    const item: Item = { ...t, label: { text, by: u, at: Math.max(1, m.time) }, was: t.label && t.label.by !== u ? t.label.by : "" };
    return { ...s, things: s.things.map((x, k) => (k === a.i ? item : x)) };
  }
  if (a.t === "peel") {
    if (!t.label || t.label.by !== u) return s;
    return { ...s, things: s.things.map((x, k) => (k === a.i ? { ...x, label: null, was: "" } : x)) };
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

/** The thing itself, drawn in a w x 70 box. */
function thingArt(kind: Thing, w: number, theme: Theme, t: number) {
  const p = pal(theme);
  const c = theme.color;
  const x = w / 2;
  const metal = theme.mode === "dark" ? mix(c.text, c.card, 0.35) : mix(p.tile, p.soft, 0.25);
  if (kind === "fridge")
    return (
      <g>
        <rect x={x - 24} y={4} width={48} height={66} rx={6} fill={p.paper} stroke={c.divider} stroke-width={1.5} />
        <line x1={x - 24} y1={28} x2={x + 24} y2={28} stroke={c.divider} stroke-width={1.5} />
        <rect x={x + 14} y={10} width={3} height={12} rx={1.5} fill={metal} />
        <rect x={x + 14} y={34} width={3} height={16} rx={1.5} fill={metal} />
        <circle cx={x - 12} cy={14} r={3} fill={p.red} />
        <rect x={x - 16} y={40} width={10} height={12} fill={p.yellow} transform={`rotate(-8 ${x - 11} 46)`} />
      </g>
    );
  if (kind === "cooker")
    return (
      <g>
        <path d={`M ${x - 26} 34 Q ${x - 28} 66 ${x - 18} 66 L ${x + 18} 66 Q ${x + 28} 66 ${x + 26} 34 Z`} fill={p.paper} stroke={c.divider} stroke-width={1.5} />
        <path d={`M ${x - 27} 35 Q ${x} 10 ${x + 27} 35 Z`} fill={p.paper} stroke={c.divider} stroke-width={1.5} />
        <rect x={x - 8} y={18} width={16} height={5} rx={2.5} fill={metal} />
        <rect x={x - 10} y={44} width={20} height={12} rx={3} fill={p.dark} />
        <circle cx={x - 4} cy={50} r={2} fill={p.red} />
        <circle cx={x + 4} cy={50} r={2} fill={p.yellow} />
        {[0, 1].map((k) => {
          const ph = (t / 1500 + k / 2) % 1;
          return <path key={k} d={`M ${x + 14 + k * 6} ${16 - ph * 14} q 3 -3 0 -6`} fill="none" stroke={p.soft} stroke-width={1.5} opacity={1 - ph} />;
        })}
      </g>
    );
  if (kind === "shower")
    return (
      <g>
        <rect x={x - 26} y={4} width={52} height={66} rx={3} fill={mix(p.sky, c.card, 0.3)} stroke={metal} stroke-width={2.5} />
        <path d={`M ${x - 8} 8 L ${x - 8} 14 Q ${x - 8} 18 ${x - 2} 18`} fill="none" stroke={metal} stroke-width={2.5} />
        <rect x={x - 6} y={16} width={12} height={4} rx={2} fill={metal} />
        {[0, 1, 2, 3, 4].map((k) => {
          const ph = (t / 900 + k / 5) % 1;
          return <line key={k} x1={x - 4 + k * 2} y1={22 + ph * 40} x2={x - 4 + k * 2} y2={26 + ph * 40} stroke={p.blue} stroke-width={1.5} />;
        })}
        {[[x - 18, 30], [x + 16, 44], [x - 14, 56], [x + 18, 18]].map(([a, b], k) => <circle key={`d${k}`} cx={a} cy={b} r={2} fill={mix(p.blue, c.card, 0.4)} />)}
      </g>
    );
  if (kind === "speaker")
    return (
      <g>
        <rect x={x - 18} y={10} width={36} height={58} rx={8} fill={p.dark} />
        <circle cx={x} cy={46} r={12} fill={mix(p.dark, c.card, 0.25)} />
        <circle cx={x} cy={46} r={5 + Math.abs(Math.sin(t / 220)) * 2} fill={mix(p.dark, c.card, 0.5)} />
        <circle cx={x} cy={22} r={5} fill={mix(p.dark, c.card, 0.25)} />
        <path d={`M ${x + 18} 60 Q ${x + 30} 66 ${x + 28} 50 Q ${x + 26} 38 ${x + 34} 34`} fill="none" stroke={metal} stroke-width={2} />
      </g>
    );
  if (kind === "clock") {
    const shake = Math.sin(t / 50) * 2;
    return (
      <g transform={`rotate(${shake.toFixed(1)} ${x} 44)`}>
        <circle cx={x - 15} cy={20} r={7} fill={p.red} />
        <circle cx={x + 15} cy={20} r={7} fill={p.red} />
        <circle cx={x} cy={44} r={23} fill={p.red} />
        <circle cx={x} cy={44} r={18} fill={p.paper} />
        <line x1={x} y1={44} x2={x} y2={32} stroke={p.ink} stroke-width={2} />
        <line x1={x} y1={44} x2={x + 9} y2={44} stroke={p.ink} stroke-width={2} />
        <line x1={x - 14} y1={64} x2={x - 18} y2={70} stroke={p.red} stroke-width={3} />
        <line x1={x + 14} y1={64} x2={x + 18} y2={70} stroke={p.red} stroke-width={3} />
      </g>
    );
  }
  if (kind === "binder")
    return (
      <g>
        <rect x={x - 22} y={8} width={44} height={60} rx={3} fill={p.blue} />
        <rect x={x - 22} y={8} width={8} height={60} fill={mix(p.blue, p.dark, 0.3)} />
        {[p.red, p.yellow, p.green, p.purple].map((col, k) => <rect key={k} x={x + 22} y={14 + k * 12} width={6} height={9} rx={1} fill={col} />)}
      </g>
    );
  if (kind === "plant")
    return (
      <g>
        <path d={`M ${x - 14} 48 L ${x + 14} 48 L ${x + 10} 70 L ${x - 10} 70 Z`} fill={p.orange} />
        {[-30, -10, 10, 30].map((a, k) => <ellipse key={k} cx={x + a * 0.4} cy={30} rx={6} ry={16} fill={p.green} transform={`rotate(${a} ${x} 48)`} />)}
      </g>
    );
  return (
    <g>
      <rect x={x - 20} y={4} width={40} height={66} rx={2} fill={p.crust} />
      <circle cx={x + 12} cy={40} r={3} fill={metal} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "House labels",
  summary: (s) => {
    const n = s.things.filter((t) => t.label).length;
    const last = [...s.things].filter((t) => t.label).sort((a, b) => b.label!.at - a.label!.at)[0];
    return `${s.place}: ${n} of ${s.things.length} things labeled${last && last.label!.at > 0 ? ` · newest on ${last.name.toLowerCase()}: “${last.label!.text}”` : ""}`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const keep = (u: string) => inChat(ctx, u) || s.cast.includes(u);
    if (s.things.every((t) => !t.label || keep(t.label.by))) return s;
    return { ...s, things: s.things.map((t) => (t.label && !keep(t.label.by) ? { ...t, label: null, was: "" } : t)) };
  },

  invariants: {
    "labels say something short": (s) => s.things.every((t) => !t.label || (t.label.text.length > 0 && t.label.text.length <= 24)),
    "labels belong to the chat or the people named": (s, ctx) => s.things.every((t) => !t.label || inChat(ctx, t.label.by) || s.cast.includes(t.label.by)),
    "a relabel names whose it covered": (s) => s.things.every((t) => t.was === "" || (!!t.label && t.label.by !== t.was)),
    "six things at most": (s) => s.things.length <= 6,
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "sticking puts my words on that thing only": (p, n, a, m) => {
      if (a.t !== "stick" || p === n) return true;
      const l = n.things[a.i]!.label;
      return !!l && l.by === m.user && l.text === clean(a.text, 24) && l.at === Math.max(1, m.time) && n.things.every((t, k) => k === a.i || t === p.things[k]);
    },
    "a relabel remembers whose it was": (p, n, a, m) => a.t !== "stick" || p === n || n.things[a.i]!.was === (p.things[a.i]!.label && p.things[a.i]!.label!.by !== m.user ? p.things[a.i]!.label!.by : ""),
    "only the author peels": (p, n, a, m) => a.t !== "peel" || p === n || (p.things[a.i]!.label?.by === m.user && n.things[a.i]!.label === null),
    "the things themselves never change": (p, n) => n.things.length === p.things.length && n.things.every((t, k) => t.name === p.things[k]!.name && t.kind === p.things[k]!.kind),
  },

  arbitrary: (s, _u, r) => {
    if (!s.things.length) return null;
    const i = r.int(s.things.length);
    return r.next() < 0.8 ? { t: "stick", i, text: r.pick(["do not touch", "mine", "10 min max", "clean me", "", "lowkey broken"]) } : { t: "peel", i };
  },

  local: { sel: -1, draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const n = state.things.length;
    const cols = 3;
    const gap = 6;
    const cw = (W - gap * (cols - 1)) / cols;
    const rows = Math.ceil(n / cols);
    const sel = idx(local.sel, n) ? local.sel : -1;
    const tape = theme.mode === "dark" ? mix(p.dark, c.text, 0.15) : p.dark;
    const embossed = theme.mode === "dark" ? c.text : c.card;
    const labeled = state.things.filter((t) => t.label).length;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const recent = [...state.things].filter((t) => t.label && t.label.at > 0).sort((a, b) => b.label!.at - a.label!.at)[0];
    const stick = () => {
      const text = clean(local.draft, 24);
      if (sel < 0 || !text) return;
      haptic("success");
      dispatch({ t: "stick", i: sel, text });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    const mineSel = sel >= 0 && state.things[sel]!.label?.by === me;
    return (
      <div>
        <CardHeader title={`Labels for ${state.place}`} subtitle={`${labeled} of ${n} things labeled · pick one, punch a label`} />
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap, marginTop: 4, padding: 0 }}>
          {state.things.map((t, i) => {
            const isSel = i === sel;
            const l = t.label;
            const fly = l && l.at > 0 ? running(l.at, 700) : null;
            const e = fly === null ? 1 : FLY(fly);
            const row = Math.floor(i / cols);
            const dy = (1 - e) * ((rows - row) * (CELL_H + gap) + 40);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={isSel}
                aria-label={`${t.name}${l ? `, labeled ${l.text} by ${nameOf(l.by)}` : ", no label"}`}
                onClick={() => { haptic("light"); setLocal({ sel: isSel ? -1 : i }); }}
                style={{ position: "relative", width: cw, height: CELL_H, padding: 0, borderRadius: 12, border: isSel ? `2px solid ${c.primary}` : `1px solid ${c.divider}`, background: isSel ? c.selected : theme.mode === "dark" ? c.wash : mix(p.wall, c.card, 0.55), cursor: "pointer", fontFamily: "inherit", overflow: "visible" }}
              >
                <svg width={cw - 4} height={72} viewBox={`0 0 ${cw - 4} 72`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 2 }}>
                  {thingArt(t.kind, cw - 4, theme, now)}
                </svg>
                <span style={{ position: "absolute", left: 4, right: 4, bottom: 4, fontSize: 11, lineHeight: "14px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                {l ? (
                  <span style={{ position: "absolute", left: 4, right: 4, top: 42, transform: `translateY(${dy.toFixed(1)}px) rotate(${i % 2 ? 4 : -3}deg)`, display: "flex", alignItems: "center", gap: 3, padding: "2px 4px", borderRadius: 2, background: tape, boxShadow: `0 1px 0 ${mix(tape, c.card, 0.3)}`, pointerEvents: "none" }}>
                    <span style={{ flex: 1, minWidth: 0, color: embossed, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, lineHeight: "11px", fontWeight: 700, textTransform: "uppercase", overflowWrap: "anywhere" }}>{l.text}</span>
                    <Face id={l.by} members={members} size={12} theme={theme} />
                  </span>
                ) : (
                  <span style={{ position: "absolute", left: 10, right: 10, top: 48, height: 14, border: `1.5px dashed ${c.secondaryText}`, borderRadius: 2, pointerEvents: "none" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* the label maker */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <svg width={44} height={36} viewBox="0 0 44 36" aria-hidden="true" style={{ flex: "none" }}>
            <rect x={2} y={4} width={34} height={28} rx={8} fill={p.yellow} />
            <circle cx={16} cy={18} r={8} fill={mix(p.yellow, p.dark, 0.25)} />
            <circle cx={16} cy={18} r={3} fill={p.dark} />
            <rect x={34} y={14} width={10} height={6} rx={1} fill={tape} />
          </svg>
          <input
            value={local.draft}
            aria-label="Label text"
            maxLength={24}
            disabled={sel < 0}
            placeholder={sel < 0 ? "Pick a thing first" : `Label for ${state.things[sel]!.name.toLowerCase()}`}
            onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
            onKeyDown={(e: { key: string }) => { if (e.key === "Enter") stick(); }}
            style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, Menlo, monospace", textTransform: "uppercase" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <Button kind="primary" wide disabled={sel < 0 || !clean(local.draft, 24)} onClick={stick}>{sel >= 0 && state.things[sel]!.label && !mineSel ? "Relabel it" : "Stick it"}</Button>
          </div>
          {mineSel ? <Button kind="secondary" onClick={() => { dispatch({ t: "peel", i: sel }); }}>Peel mine</Button> : null}
        </div>
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {recent && recent.was ? `${nameOf(recent.label!.by)} covered ${nameOf(recent.was)}'s label on ${recent.name.toLowerCase()}` : "Anyone can relabel · only you can peel yours"}
        </div>
        {local.toast > 0 && recent ? <Toast key={local.toast}>{`Stuck on ${recent.name.toLowerCase()}`}</Toast> : null}
      </div>
    );
  },
});
