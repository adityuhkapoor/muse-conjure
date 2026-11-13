import { defineApp, Avatar, Burst, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, type Ctx } from "@muse/app";

// Mascot maker: the club builds its mascot one part each. The critter stands in the middle with
// callout tags for each part (what it is, who picked it); open parts are dashed. Tap an open tag,
// flip through the drawn options, lock it in and the part pops onto the mascot. When every part
// is picked, the mascot does a little hop and gets its name.

type Slot = "animal" | "color" | "eyes" | "head" | "hold";
type Params = {
  /** Card title */
  title: string;
  /** Club name */
  club: string;
  /** The mascot's name once it's done */
  name: string;
  /** Parts already picked: slot, option label (one of the options for that slot), who, and what they said */
  picks: { slot: Slot; option: string; by: string; said?: string }[];
};

// @params
const P: Params = {
  title: "Mascot maker",
  club: "Eastfield Climbing Club",
  name: "Crimpy",
  picks: [
    { slot: "color", option: "Green", by: "Maya", said: "green. it matches my spreadsheet tabs" },
    { slot: "head", option: "Helmet", by: "Will", said: "safety first, unlike my driving" },
    { slot: "hold", option: "Rice cooker", by: "Arun", said: "it's non-negotiable" },
  ],
};
// @end params

const SLOTS: Slot[] = ["animal", "color", "eyes", "head", "hold"];
const LABEL: Record<Slot, string> = { animal: "Critter", color: "Color", eyes: "Eyes", head: "Headgear", hold: "Holding" };
const OPTIONS: Record<Slot, string[]> = {
  animal: ["Goat", "Frog", "Bear", "Blob"],
  color: ["Green", "Orange", "Purple", "Blue"],
  eyes: ["Dots", "Googly", "Sleepy", "Starry"],
  head: ["Helmet", "Beanie", "Headlamp", "Nothing"],
  hold: ["Chalk bag", "Rope", "Rice cooker", "Flag"],
};
type Pick = { by: string; opt: number; at: number };
type State = { title: string; club: string; name: string; picks: (Pick | null)[]; said: { [u: string]: string }; doneAt: number };
type Action = { t: "pick"; slot: number; opt: number } | { t: "undo"; slot: number };
type Local = { slot: number; opt: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const full = (s: State) => s.picks.every((x) => x !== null);

function initState(ctx: Ctx): State {
  const picks: (Pick | null)[] = SLOTS.map(() => null);
  const said: { [u: string]: string } = {};
  for (const x of Array.isArray(P.picks) ? P.picks : []) {
    const k = SLOTS.indexOf(x?.slot);
    if (k < 0 || picks[k]) continue;
    const opt = OPTIONS[SLOTS[k]!].findIndex((o) => o.toLowerCase() === clean(x.option, 20).toLowerCase());
    const m = ctx.members.find((y) => y.id === x.by || y.name.toLowerCase() === clean(x.by, 40).toLowerCase());
    if (opt < 0 || !m) continue;
    picks[k] = { by: m.id, opt, at: 0 };
    const q = clean(x.said, 60);
    if (q) said[m.id] = q;
  }
  return { title: clean(P.title, 40) || "Mascot maker", club: clean(P.club, 40), name: clean(P.name, 16) || "Mascot", picks, said, doneAt: 0 };
}

export default defineApp<State, Action, Local>({
  name: "Mascot maker",
  summary: (s) => (full(s) ? `Meet ${s.name}, the ${s.club || "club"} mascot` : `${s.club || "Club"} mascot · ${s.picks.filter(Boolean).length} of ${SLOTS.length} parts picked`),

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !isInt(a.slot, 0, SLOTS.length - 1) || full(s)) return s;
    const cur = s.picks[a.slot];
    if (a.t === "pick") {
      if (!isInt(a.opt, 0, OPTIONS[SLOTS[a.slot]!].length - 1)) return s;
      if (cur && (cur.by !== m.user || cur.opt === a.opt)) return s;
      const picks = s.picks.map((x, j) => (j === a.slot ? { by: m.user, opt: a.opt, at: m.time } : x));
      const next = { ...s, picks };
      return full(next) ? { ...next, doneAt: m.time } : next;
    }
    if (a.t === "undo") {
      if (!cur || cur.by !== m.user) return s;
      return { ...s, picks: s.picks.map((x, j) => (j === a.slot ? null : x)) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (full(s) || s.picks.every((x) => !x || inChat(ctx, x.by))) return s;
    return { ...s, picks: s.picks.map((x) => (x && !inChat(ctx, x.by) ? null : x)) };
  },

  invariants: {
    "five parts": (s) => s.picks.length === SLOTS.length,
    "picks are real options": (s) => s.picks.every((x, j) => x === null || isInt(x.opt, 0, OPTIONS[SLOTS[j]!].length - 1)),
    "a done mascot has every part": (s) => (s.doneAt !== 0) === full(s) || (full(s) && s.doneAt === 0 && s.picks.every((x) => x!.at === 0)),
    "unfinished pickers are in the chat": (s, ctx) => full(s) || s.picks.every((x) => !x || inChat(ctx, x.by)),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a done mascot is final": (p, n) => !full(p) || p === n,
    "one action touches one part": (p, n, a) => p === n || n.picks.every((x, j) => j === a.slot || x === p.picks[j]),
    "picking sets the actor's option": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const x = n.picks[a.slot];
      return !!x && x.by === m.user && x.opt === a.opt && x.at === m.time && (!p.picks[a.slot] || p.picks[a.slot]!.by === m.user);
    },
    "an open part is never refused": (p, n, a, m, ctx) =>
      a.t !== "pick" || p !== n || !(inChat(ctx, m.user) && !full(p) && isInt(a.slot, 0, SLOTS.length - 1) && !p.picks[a.slot] && isInt(a.opt, 0, OPTIONS[SLOTS[a.slot]!].length - 1)),
    "only the picker undoes": (p, n, a, m) => a.t !== "undo" || p === n || (p.picks[a.slot]?.by === m.user && n.picks[a.slot] === null),
    "finishing stamps the moment": (p, n, a, m) => full(p) || !full(n) || (a.t === "pick" && n.doneAt === m.time),
  },

  arbitrary: (s, u, r) => {
    const slot = r.int(SLOTS.length);
    const cur = s.picks[slot];
    if (cur && cur.by === u && r.next() < 0.3) return { t: "undo", slot };
    return { t: "pick", slot, opt: r.int(OPTIONS[SLOTS[slot]!].length) };
  },

  local: { slot: -1, opt: -1 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = 214;
    const done = full(state);
    const firstOpen = state.picks.findIndex((x) => !x);
    const slot = local.slot >= 0 && local.slot < SLOTS.length ? local.slot : firstOpen >= 0 ? firstOpen : 0;
    const cur = state.picks[slot];
    const canEdit = !done && (!cur || cur.by === me);
    const opt = local.opt >= 0 && local.slot === slot ? local.opt : cur ? cur.opt : 0;
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? "Someone"));
    // What the mascot shows: picked parts, plus a live preview of the part you're choosing.
    const show = (k: number): number => (k === slot && canEdit ? opt : (state.picks[k]?.opt ?? -1));
    const animal = show(0), color = show(1), eyes = show(2), head = show(3), hold = show(4);
    const hues = [p.green, p.orange, p.purple, p.blue];
    const body = color >= 0 ? hues[color]! : mix(c.secondaryText, c.card, 0.55);
    const belly = mix(body, p.cream, 0.55);
    const ink = p.dark;
    const ghost = (k: number) => k === slot && canEdit && (!state.picks[k] || state.picks[k]!.opt !== opt);
    const dash = (k: number) => (state.picks[k] ? undefined : "5 4");
    const popAt = (k: number) => confirmed.picks[k]?.at ?? 0;
    const pop = (k: number) => (popAt(k) > 0 && running(popAt(k), 500) !== null ? "mm-pop" : "");
    const dE = confirmed.doneAt > 0 ? running(confirmed.doneAt, 2400) : null;

    const MS = Math.min(200, W * 0.56);
    const mx = W / 2 - MS / 2;
    const mascot = (
      <svg x={mx} y={8} width={MS} height={MS} viewBox="0 0 200 200" aria-hidden="true" overflow="visible">
        <g class={done ? "mm-hop" : "mm-breathe"} style={{ transformOrigin: "100px 190px" }}>
          {/* critter extras behind the head */}
          <g key={`an${animal}`} class={pop(0)} style={{ transformOrigin: "100px 70px" }} opacity={ghost(0) ? 0.75 : 1}>
            {animal === 0 ? (
              <>
                <path d="M68 66 Q48 30 70 20 Q62 40 80 58 Z" fill={p.cream} stroke={ink} stroke-width={2.5} />
                <path d="M132 66 Q152 30 130 20 Q138 40 120 58 Z" fill={p.cream} stroke={ink} stroke-width={2.5} />
              </>
            ) : animal === 1 ? (
              <>
                <circle cx={78} cy={62} r={18} fill={body} stroke={ink} stroke-width={2.5} />
                <circle cx={122} cy={62} r={18} fill={body} stroke={ink} stroke-width={2.5} />
              </>
            ) : animal === 2 ? (
              <>
                <circle cx={64} cy={64} r={14} fill={body} stroke={ink} stroke-width={2.5} />
                <circle cx={136} cy={64} r={14} fill={body} stroke={ink} stroke-width={2.5} />
                <circle cx={64} cy={64} r={7} fill={belly} />
                <circle cx={136} cy={64} r={7} fill={belly} />
              </>
            ) : animal === 3 ? (
              <>
                <path d="M100 52 Q96 32 104 22" fill="none" stroke={ink} stroke-width={2.5} />
                <circle cx={105} cy={20} r={6} fill={p.yellow} stroke={ink} stroke-width={2} />
              </>
            ) : (
              <path d="M70 62 Q66 40 80 38 M130 62 Q134 40 120 38" fill="none" stroke={c.secondaryText} stroke-width={2.5} stroke-dasharray="5 4" />
            )}
          </g>
          {/* body */}
          <g key={`bd${color}`} class={pop(1)} style={{ transformOrigin: "100px 120px" }}>
            <ellipse cx={74} cy={186} rx={18} ry={9} fill={body} stroke={ink} stroke-width={2.5} />
            <ellipse cx={126} cy={186} rx={18} ry={9} fill={body} stroke={ink} stroke-width={2.5} />
            <ellipse cx={100} cy={124} rx={56} ry={62} fill={body} stroke={color >= 0 ? ink : c.secondaryText} stroke-width={2.5} stroke-dasharray={dash(1)} />
            <ellipse cx={100} cy={146} rx={34} ry={34} fill={belly} />
            {animal === 0 ? <path d="M94 150 Q100 170 106 150 Z" fill={p.cream} stroke={ink} stroke-width={2} /> : null}
            <path d="M88 132 Q100 142 112 132" fill="none" stroke={ink} stroke-width={3} stroke-linecap="round" />
            <ellipse cx={46} cy={128} rx={10} ry={16} fill={body} stroke={ink} stroke-width={2.5} transform="rotate(20 46 128)" />
          </g>
          {/* eyes */}
          <g key={`ey${eyes}`} class={pop(2)} style={{ transformOrigin: "100px 104px" }} opacity={ghost(2) ? 0.8 : 1}>
            {[animal === 1 ? 78 : 82, animal === 1 ? 122 : 118].map((ex, j) => {
              const ey = animal === 1 ? 62 : 104;
              return eyes === 0 ? (
                <circle key={j} cx={ex} cy={ey} r={6} fill={ink} />
              ) : eyes === 1 ? (
                <g key={j}><circle cx={ex} cy={ey} r={12} fill={p.cream} stroke={ink} stroke-width={2} /><circle cx={ex + (j ? 4 : -3)} cy={ey + 3} r={5} fill={ink} /></g>
              ) : eyes === 2 ? (
                <path key={j} d={`M${ex - 8} ${ey} Q${ex} ${ey + 7} ${ex + 8} ${ey}`} fill="none" stroke={ink} stroke-width={3} stroke-linecap="round" />
              ) : eyes === 3 ? (
                <path key={j} d={`M${ex} ${ey - 9} L${ex + 3} ${ey - 3} L${ex + 9} ${ey - 2} L${ex + 4} ${ey + 2} L${ex + 6} ${ey + 9} L${ex} ${ey + 5} L${ex - 6} ${ey + 9} L${ex - 4} ${ey + 2} L${ex - 9} ${ey - 2} L${ex - 3} ${ey - 3} Z`} fill={p.yellow} stroke={ink} stroke-width={1.5} />
              ) : (
                <circle key={j} cx={ex} cy={ey} r={8} fill="none" stroke={c.secondaryText} stroke-width={2} stroke-dasharray="4 3" />
              );
            })}
          </g>
          {/* headgear */}
          <g key={`hd${head}`} class={pop(3)} style={{ transformOrigin: "100px 66px" }} opacity={ghost(3) ? 0.8 : 1}>
            {head === 0 ? (
              <>
                <path d="M54 82 Q56 38 100 36 Q144 38 146 82 Z" fill={p.red} stroke={ink} stroke-width={2.5} />
                <path d="M70 52 Q100 42 130 52" fill="none" stroke={mix(p.red, c.card, 0.5)} stroke-width={4} stroke-linecap="round" />
              </>
            ) : head === 1 ? (
              <>
                <path d="M58 80 Q58 40 100 38 Q142 40 142 80 Z" fill={p.yellow} stroke={ink} stroke-width={2.5} />
                <rect x={54} y={72} width={92} height={14} rx={6} fill={mix(p.yellow, p.orange, 0.5)} stroke={ink} stroke-width={2.5} />
                <circle cx={100} cy={34} r={9} fill={p.cream} stroke={ink} stroke-width={2} />
              </>
            ) : head === 2 ? (
              <>
                <path d="M48 84 Q100 70 152 84" fill="none" stroke={ink} stroke-width={6} />
                <rect x={88} y={66} width={24} height={16} rx={4} fill={p.dark} />
                <circle cx={100} cy={74} r={5} fill={p.yellow} />
                <path d="M106 70 L170 40 L174 70 Z" fill={p.yellow} opacity={0.3} />
              </>
            ) : head === 3 ? null : (
              <path d="M60 78 Q62 42 100 40 Q138 42 140 78" fill="none" stroke={c.secondaryText} stroke-width={2.5} stroke-dasharray="5 4" />
            )}
          </g>
          {/* holding, in the right hand */}
          <g key={`ho${hold}`} class={pop(4)} style={{ transformOrigin: "160px 130px" }} opacity={ghost(4) ? 0.8 : 1}>
            {hold === 0 ? (
              <>
                <path d="M146 124 L176 124 L172 156 L150 156 Z" fill={p.purple} stroke={ink} stroke-width={2.5} />
                <ellipse cx={161} cy={122} rx={16} ry={6} fill={p.cream} stroke={ink} stroke-width={2} />
              </>
            ) : hold === 1 ? (
              <>
                <circle cx={162} cy={138} r={16} fill="none" stroke={p.orange} stroke-width={6} />
                <circle cx={162} cy={138} r={8} fill="none" stroke={p.orange} stroke-width={5} />
              </>
            ) : hold === 2 ? (
              <>
                <rect x={142} y={124} width={40} height={32} rx={10} fill={p.cream} stroke={ink} stroke-width={2.5} />
                <path d="M144 126 Q162 110 180 126 Z" fill={mix(p.cream, p.soft, 0.35)} stroke={ink} stroke-width={2.5} />
                <circle cx={162} cy={142} r={4} fill={p.red} />
                <path d="M152 108 Q156 100 152 94 M162 106 Q166 98 162 92" fill="none" stroke={c.secondaryText} stroke-width={2} stroke-linecap="round" />
              </>
            ) : hold === 3 ? (
              <>
                <path d="M152 170 L152 96" stroke={ink} stroke-width={3} />
                <path d="M152 98 L184 108 L152 120 Z" fill={p.red} stroke={ink} stroke-width={2} />
              </>
            ) : (
              <rect x={144} y={118} width={34} height={36} rx={8} fill="none" stroke={c.secondaryText} stroke-width={2.5} stroke-dasharray="5 4" />
            )}
            <ellipse cx={154} cy={132} rx={10} ry={14} fill={body} stroke={ink} stroke-width={2.5} transform="rotate(-25 154 132)" />
          </g>
        </g>
      </svg>
    );

    // Callout tags around the mascot: what each part is and who picked it; open ones are dashed.
    const anchors: [number, number][] = [[0.27, 0.3], [0.2, 0.62], [0.36, 0.5], [0.66, 0.2], [0.86, 0.6]];
    const tagSpots: [number, number][] = [[0, 10], [0, 128], [0, 70], [W - 1, 14], [W - 1, 166]];
    const tags = SLOTS.map((sl, k) => {
      const x = state.picks[k];
      const on = k === slot && !done;
      const right = tagSpots[k]![0] > W / 2;
      const tw = Math.min(132, W * 0.33);
      const left = right ? W - tw : 0;
      const top = tagSpots[k]![1];
      const lbl = x ? OPTIONS[sl][x.opt]! : `${LABEL[sl]}?`;
      return (
        <button key={sl} type="button" aria-label={x ? `${LABEL[sl]}: ${lbl}, picked by ${nameOf(x.by)}` : `Pick the ${LABEL[sl].toLowerCase()}`} aria-pressed={on ? "true" : "false"}
          onClick={() => { setLocal({ slot: k, opt: -1 }); haptic("light"); }}
          style={{ position: "absolute", left, top, width: tw, height: 44, padding: 0, border: 0, background: "transparent", cursor: done ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: right ? "flex-end" : "flex-start" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, maxWidth: tw, boxSizing: "border-box", height: 32, padding: x ? "0 10px 0 4px" : "0 10px", borderRadius: 16, background: x ? c.card : on ? c.selected : c.wash, border: x ? `1.5px solid ${on ? c.primary : c.divider}` : `1.5px dashed ${on ? c.primary : c.secondaryText}` }}>
            {x ? <Avatar user={x.by} size={22} /> : null}
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
              <span style={{ fontSize: 10, lineHeight: "12px", color: c.secondaryText, whiteSpace: "nowrap" }}>{LABEL[sl]}</span>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: "15px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: tw - 40 }}>{x ? lbl : "Open"}</span>
            </span>
          </span>
        </button>
      );
    });
    void anchors;

    // Option strip for the selected part.
    const strip = !done && canEdit ? (
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <div role="group" aria-label={`${LABEL[SLOTS[slot]!]} options`} style={{ display: "flex", flexWrap: "wrap", columnGap: 4, flex: 1, minWidth: 0 }}>
          {OPTIONS[SLOTS[slot]!].map((o, j) => {
            const on = j === opt;
            return (
              <button key={o} type="button" aria-pressed={on ? "true" : "false"} onClick={() => { setLocal({ slot, opt: j }); haptic("light"); }}
                style={{ height: 44, minWidth: 44, padding: "6px 0", border: 0, background: "transparent", cursor: "pointer", flexShrink: 0 }}>
                <span style={{ display: "block", height: 32, lineHeight: "32px", padding: W < 340 ? "0 8px" : "0 10px", borderRadius: 99, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? c.selected : c.secondaryButton, color: on ? c.text : c.secondaryButtonText, boxShadow: on ? `inset 0 0 0 1.5px ${c.primary}` : "none", whiteSpace: "nowrap" }}>{o}</span>
              </button>
            );
          })}
        </div>
        {cur && cur.opt === opt ? (
          <Button kind="deemphasized" onClick={() => dispatch({ t: "undo", slot })}>Undo</Button>
        ) : (
          <Button kind="primary" onClick={() => { dispatch({ t: "pick", slot, opt }); haptic("success"); }}>Lock it</Button>
        )}
      </div>
    ) : (
      <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 15, fontWeight: 600, color: c.text, minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {done ? `Meet ${state.name} · picked by ${new Set(state.picks.map((x) => x!.by)).size} of you` : cur ? `${nameOf(cur.by)} picked the ${LABEL[SLOTS[slot]!].toLowerCase()} · tap an open tag` : ""}
        </span>
      </div>
    );

    const pickers = [...new Set(state.picks.filter((x): x is Pick => !!x).map((x) => x.by))];
    const quoted = [...state.picks].reverse().find((x) => x && state.said[x.by] && x.by !== me);
    const myAt = confirmed.picks.reduce((t, x) => (x && x.by === me ? Math.max(t, x.at) : t), 0);

    return (
      <div>
        <style>{".mm-breathe{animation:mmB 2.6s ease-in-out infinite}@keyframes mmB{0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,.985)}}.mm-hop{animation:mmH .9s cubic-bezier(.3,1.5,.6,1) infinite}@keyframes mmH{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px) rotate(-3deg)}}.mm-pop{animation:mmP .5s cubic-bezier(.3,1.6,.5,1)}@keyframes mmP{from{transform:scale(.4)}to{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.mm-breathe,.mm-hop,.mm-pop{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.club, done ? `meet ${state.name}` : `${state.picks.filter(Boolean).length} of ${SLOTS.length} parts`].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={done ? `${state.name}, the finished mascot` : `Mascot with ${state.picks.filter(Boolean).length} of ${SLOTS.length} parts picked`} style={{ display: "block" }}>
            <rect x={0} y={0} width={W} height={H} rx={12} fill={c.wash} />
            <ellipse cx={W / 2} cy={H - 10} rx={MS * 0.42} ry={8} fill={mix(c.secondaryText, c.wash, 0.7)} />
            {mascot}
          </svg>
          {tags}
          {done ? (
            <div style={{ position: "absolute", left: W / 2 - 60, top: H - 34, width: 120, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ padding: "2px 12px", borderRadius: 99, background: c.card, color: c.text, fontSize: 15, fontWeight: 800, boxShadow: `0 0 0 2px ${p.yellow}` }}>{state.name}</span>
            </div>
          ) : null}
          {dE !== null ? <div style={{ position: "absolute", left: W / 2, top: H / 2, pointerEvents: "none" }}><Burst key={confirmed.doneAt} emoji="🎉" count={10} /></div> : null}
        </div>
        <div style={{ marginTop: 6 }}>{strip}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 2, minWidth: 0 }}>
          {pickers.length ? <Facepile users={pickers} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${nameOf(quoted.by)}: "${state.said[quoted.by]}"` : pickers.length ? `${pickers.length} of you picked parts` : "Every part is open · pick one"}
          </span>
        </div>
        {dE !== null ? <Toast key={confirmed.doneAt}>{`${state.name} is done · the club has a mascot`}</Toast> : myAt > 0 && running(myAt, 2000) !== null ? <Toast key={myAt}>Locked in</Toast> : null}
      </div>
    );
  },
});
