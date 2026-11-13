import {
  defineApp,
  Burst,
  Button,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  userColor,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// A graduation post becomes the cap itself, drawn from above: friends write on the board in their
// own hand with a little doodle, the tassel swings every time someone signs, and the graduate pins
// the finished cap to her profile.

type Params = {
  /** The graduate's name */
  who: string;
  /** Card title, e.g. "Sign Maya's cap" */
  title: string;
  /** Line under the title, e.g. "Eastfield · class of 2027" */
  school: string;
  /** Two digits on the tassel charm, e.g. "27" */
  year: string;
  /** Signatures already on the cap, in order; doodle is star, heart, bolt or smile */
  notes: { by: string; text: string; doodle: string }[];
  /** Lines suggested in the empty box, one per signer in turn */
  lines: string[];
};

// @params
const P: Params = {
  who: "Maya",
  title: "Sign Maya's cap",
  school: "Eastfield · class of 2027",
  year: "27",
  notes: [
    { by: "Calvin", text: "set 7 alarms for ur walk", doodle: "bolt" },
    { by: "Tsai Lin", text: "the aux is yours today", doodle: "heart" },
    { by: "Arun", text: "rice cooker cake at 9", doodle: "star" },
    { by: "Will", text: "calvin will still be late", doodle: "smile" },
  ],
  lines: ["so proud of you", "lowkey crying rn", "4 years of spreadsheets"],
};
// @end params

const DOODLES = ["star", "heart", "bolt", "smile"] as const;
type Note = { by: string; user: string | null; text: string; doodle: number; at: number };
type State = {
  who: string;
  whoUser: string | null;
  title: string;
  school: string;
  year: string;
  lines: string[];
  notes: Note[];
  pinnedAt: number;
};
type Action = { t: "sign"; text: string; doodle: number } | { t: "pin" };
type Local = { draft: string; doodle: number };

const MAX_NOTES = 24;
const SLOTS = 5;
const NOTE_LEN = 28;
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const PIC_H = 236;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const named = (m: Member, by: string) => m.id === by || m.name.trim().toLowerCase() === by.trim().toLowerCase();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const noteOf = (s: State, user: string) => s.notes.find((n) => n.user === user);
const r1 = (n: number) => Math.round(n * 10) / 10;

function initState(ctx: Ctx): State {
  const who = clean(P.who, 20) || "Them";
  const whoUser = ctx.members.find((m) => named(m, who))?.id ?? null;
  const notes: Note[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(P.notes) ? P.notes : []) {
    if (notes.length >= MAX_NOTES) break;
    const by = clean(raw?.by, 16);
    const text = clean(raw?.text, NOTE_LEN);
    if (!by || !text || by.toLowerCase() === who.toLowerCase()) continue;
    const m = ctx.members.find((x) => named(x, by));
    if (m && m.id === whoUser) continue;
    const k = m ? m.id : by.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const d = DOODLES.indexOf(raw?.doodle as (typeof DOODLES)[number]);
    notes.push({ by: m?.name ?? by, user: m?.id ?? null, text, doodle: d < 0 ? notes.length % 4 : d, at: 0 });
  }
  const lines = (Array.isArray(P.lines) ? P.lines : []).map((l) => clean(l, NOTE_LEN)).filter(Boolean).slice(0, 6);
  return {
    who,
    whoUser,
    title: clean(P.title, 40) || `Sign ${who}'s cap`,
    school: clean(P.school, 40),
    year: (typeof P.year === "string" ? P.year : "").replace(/\D/g, "").slice(0, 2),
    lines: lines.length ? lines : ["congrats"],
    notes,
    pinnedAt: 0,
  };
}

/** A small hand-drawn doodle centered on (x, y), about 2s wide. */
function doodle(kind: number, x: number, y: number, s: number): string {
  if (kind === 0) {
    let d = "";
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? s * 0.45 : s;
      d += `${k ? "L" : "M"}${r1(x + r * Math.cos(a))} ${r1(y + r * Math.sin(a))}`;
    }
    return d + "Z";
  }
  if (kind === 1)
    return `M${r1(x)} ${r1(y + s * 0.85)}C${r1(x - s * 1.3)} ${r1(y)} ${r1(x - s * 0.7)} ${r1(y - s * 1.05)} ${r1(x)} ${r1(y - s * 0.35)}C${r1(x + s * 0.7)} ${r1(y - s * 1.05)} ${r1(x + s * 1.3)} ${r1(y)} ${r1(x)} ${r1(y + s * 0.85)}Z`;
  if (kind === 2) return `M${r1(x + s * 0.3)} ${r1(y - s)}L${r1(x - s * 0.55)} ${r1(y + s * 0.1)}L${r1(x + s * 0.05)} ${r1(y + s * 0.1)}L${r1(x - s * 0.3)} ${r1(y + s)}L${r1(x + s * 0.6)} ${r1(y - s * 0.2)}L${r1(x)} ${r1(y - s * 0.2)}Z`;
  return `M${r1(x + s)} ${r1(y)}A${r1(s)} ${r1(s)} 0 1 1 ${r1(x + s - 0.01)} ${r1(y - 0.01)}M${r1(x - s * 0.35)} ${r1(y - s * 0.25)}v0.1M${r1(x + s * 0.35)} ${r1(y - s * 0.25)}v0.1M${r1(x - s * 0.45)} ${r1(y + s * 0.2)}Q${r1(x)} ${r1(y + s * 0.7)} ${r1(x + s * 0.45)} ${r1(y + s * 0.2)}`;
}

const CSS =
  "@keyframes csSwing{0%{transform:rotate(0)}12%{transform:rotate(24deg)}30%{transform:rotate(-17deg)}50%{transform:rotate(10deg)}70%{transform:rotate(-5deg)}100%{transform:rotate(0)}}" +
  "@keyframes csIdle{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}" +
  "@keyframes csPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}" +
  "@keyframes csDash{to{stroke-dashoffset:-20}}" +
  "@keyframes csFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
  ".cs-swing{animation:csSwing 1.6s cubic-bezier(.3,.7,.4,1)}" +
  ".cs-idle{animation:csIdle 3.4s ease-in-out infinite}" +
  ".cs-pop{transform-box:fill-box;transform-origin:center;animation:csPop .5s cubic-bezier(.34,1.56,.64,1) both}" +
  ".cs-dash{animation:csDash 1.2s linear infinite}" +
  ".cs-f1{animation:csFloat 2.6s ease-in-out infinite}.cs-f2{animation:csFloat 3.1s ease-in-out infinite .7s}" +
  "@media (prefers-reduced-motion:reduce){.cs-swing,.cs-idle,.cs-pop,.cs-dash,.cs-f1,.cs-f2{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Cap signing",
  summary: (s) =>
    s.pinnedAt > 0
      ? `${s.who} pinned the cap · ${s.notes.length} signed`
      : s.notes.length === 0
        ? `${s.who}'s cap is waiting for its first signature`
        : `${s.notes.length} signed ${s.who}'s cap`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    const me = ctx.members.find((m) => m.id === meta.user);
    if (!me) return state;
    if (action.t === "sign") {
      if (state.pinnedAt > 0 || meta.user === state.whoUser || state.notes.length >= MAX_NOTES) return state;
      if (typeof action.text !== "string" || noteOf(state, meta.user)) return state;
      if (typeof action.doodle !== "number" || !Number.isInteger(action.doodle) || action.doodle < 0 || action.doodle >= DOODLES.length) return state;
      const text = action.text.trim().replace(/\s+/g, " ").slice(0, NOTE_LEN);
      if (!text) return state;
      const by = clean(me.name, 16) || "Friend";
      return { ...state, notes: [...state.notes, { by, user: meta.user, text, doodle: action.doodle, at: meta.time }] };
    }
    if (action.t === "pin") {
      if (state.pinnedAt > 0 || meta.user !== state.whoUser || state.notes.length === 0) return state;
      return { ...state, pinnedAt: meta.time };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.whoUser !== null) return state;
    const found = ctx.members.find((m) => named(m, state.who));
    if (!found || state.notes.some((n) => n.user === found.id)) return state;
    return { ...state, whoUser: found.id };
  },

  invariants: {
    "one signature per person": (s) => {
      const users = s.notes.map((n) => n.user).filter((u): u is string => u !== null);
      return new Set(users).size === users.length;
    },
    "signatures are 1 to 28 characters": (s) => s.notes.every((n) => n.text.length >= 1 && n.text.length <= NOTE_LEN && n.text === n.text.trim()),
    "doodles are one of four": (s) => s.notes.every((n) => Number.isInteger(n.doodle) && n.doodle >= 0 && n.doodle < DOODLES.length),
    "the graduate does not sign their own cap": (s) => s.whoUser === null || !s.notes.some((n) => n.user === s.whoUser),
    "the cap holds at most 24": (s) => s.notes.length <= MAX_NOTES,
    "a pinned cap has signatures": (s) => s.pinnedAt === 0 || s.notes.length > 0,
    "times are never negative": (s) => s.pinnedAt >= 0 && s.notes.every((n) => n.at >= 0),
  },

  transitions: {
    "a signature adds only the signer's note": (p, n, a, m) => {
      if (a.t !== "sign" || p === n) return true;
      const last = n.notes[n.notes.length - 1];
      return n.notes.length === p.notes.length + 1 && !!last && last.user === m.user && last.at === m.time && !p.notes.some((x) => x.user === m.user);
    },
    "a signature is what was written": (p, n, a) => {
      if (a.t !== "sign" || p === n) return true;
      const last = n.notes[n.notes.length - 1];
      return !!last && typeof a.text === "string" && last.text === a.text.trim().replace(/\s+/g, " ").slice(0, NOTE_LEN) && last.doodle === a.doodle;
    },
    "a fresh signer always lands": (p, n, a, m, ctx) => {
      if (a.t !== "sign" || !inChat(ctx, m.user) || m.user === p.whoUser || p.pinnedAt > 0 || p.notes.length >= MAX_NOTES) return true;
      if (noteOf(p, m.user) || typeof a.text !== "string" || !a.text.trim() || !Number.isInteger(a.doodle) || a.doodle < 0 || a.doodle > 3) return true;
      return n.notes.length === p.notes.length + 1;
    },
    "only the graduate pins": (p, n, _a, m) => n.pinnedAt === p.pinnedAt || (p.pinnedAt === 0 && n.pinnedAt === m.time && m.user === p.whoUser),
    "the graduate can pin a signed cap": (p, n, a, m, ctx) => a.t !== "pin" || !inChat(ctx, m.user) || m.user !== p.whoUser || p.pinnedAt > 0 || p.notes.length === 0 || n.pinnedAt === m.time,
    "a pinned cap takes no more ink": (p, n) => p.pinnedAt === 0 || n.notes.length === p.notes.length,
    "nothing written is erased": (p, n) => p.notes.length <= n.notes.length && p.notes.every((x, i) => same(x, n.notes[i])),
    "the cap itself never changes": (p, n) => p.who === n.who && p.title === n.title && p.year === n.year && same(p.lines, n.lines),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (user === s.whoUser) return r.next() < 0.8 ? { t: "pin" } : { t: "sign", text: "me", doodle: 0 };
    if (r.next() < 0.08) return { t: "sign", text: r.pick(s.lines), doodle: 7 };
    if (r.next() < 0.05) return { t: "pin" };
    return { t: "sign", text: r.pick(s.lines), doodle: r.int(DOODLES.length) };
  },

  local: { draft: "", doodle: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const light = dark ? c.text : c.card;
    const board = dark ? mix(c.series6, c.wash, 0.8) : p.dark;
    const boardEdge = mix(board, dark ? c.card : c.text, 0.45);
    const person = (n: Note): Member => (n.user ? members.find((m) => m.id === n.user) : undefined) ?? { id: n.user ?? `n:${n.by}`, name: n.by };
    const isWho = state.whoUser !== null && me === state.whoUser;
    const mine = noteOf(state, me);
    const pinned = state.pinnedAt > 0;
    const canSign = !isWho && !mine && !pinned && state.notes.length < MAX_NOTES && members.some((m) => m.id === me);

    // Which notes show on the board: the newest, always including mine; my empty spot if I can sign.
    let shown = state.notes.slice(-SLOTS);
    if (mine && !shown.includes(mine)) shown = [...shown.slice(1), mine];
    if (canSign && shown.length >= SLOTS) shown = shown.slice(-(SLOTS - 1));
    const hidden = state.notes.length - shown.length;

    // Geometry: a flat board seen from above, tipped a few degrees.
    const bw = Math.min(156, (W - 56) / 2);
    const bh = 98;
    const cx = W / 2 - 8;
    const cy = PIC_H / 2;
    const tilt = -4;
    const colW = bw - 22;
    // Five spots: four corners and the middle left; the cord runs out the middle right.
    const order: [number, number][] = [[-1, -1], [1, 1], [1, -1], [-1, 1], [-1, 0]];
    const slot = (i: number) => {
      const [side, row] = order[i % SLOTS]!;
      return { x: side < 0 ? -bw + 12 : 10, y: row * 64 };
    };
    const lastAt = state.notes.reduce((t, n) => Math.max(t, n.at), 0);
    const swinging = lastAt > 0 && running(lastAt, 1600) !== null;
    const rad = (tilt * Math.PI) / 180;
    const hx = cx + bw * Math.cos(rad);
    const hy = cy + bw * Math.sin(rad);

    const ink = (n: Note) => mix(userColor(person(n), theme), light, dark ? 0.55 : 0.62);
    const hues = [p.blue, p.red, p.yellow, p.green, p.purple, p.orange];

    // Confetti only in the margins around the board.
    const art: Child[] = [];
    const spots: [number, number][] = [[0.03, 0.12], [0.05, 0.5], [0.02, 0.86], [0.97, 0.1], [0.98, 0.9], [0.3, 0.035], [0.62, 0.03], [0.85, 0.05], [0.2, 0.97], [0.5, 0.975], [0.75, 0.965]];
    spots.forEach(([fx, fy], k) => {
      const x = fx * W;
      const y = fy * PIC_H;
      art.push(k % 2 === 0 ? <rect key={`c${k}`} x={r1(x - 4)} y={r1(y - 1.5)} width={8} height={3.5} rx={1.5} fill={hues[k % 6]!} transform={`rotate(${(k * 47) % 180} ${r1(x)} ${r1(y)})`} /> : <circle key={`c${k}`} cx={r1(x)} cy={r1(y)} r={2.8} fill={hues[k % 6]!} />);
    });

    /** Up to two lines in the hand font, as large as fits. */
    const wrap = (text: string, max: number): { lines: string[]; size: number } => {
      for (let size = 17; size >= 12; size--) {
        const words = text.split(" ");
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          const next = cur ? `${cur} ${w}` : w;
          if (textWidth(next, size, 600) * 1.05 <= max || !cur) cur = next;
          else {
            lines.push(cur);
            cur = w;
          }
        }
        lines.push(cur);
        if (lines.length <= 2 && lines.every((l) => textWidth(l, size, 600) * 1.05 <= max)) return { lines, size };
      }
      const a = fitText(text, max, { size: 12, min: 10, weight: 600, family: HAND });
      return { lines: [a.text], size: a.size };
    };

    const notesArt = shown.map((n, i) => {
      const s = slot(i);
      const wr = wrap(n.text, colW - 22);
      const col = ink(n);
      const fresh = n.at > 0 && running(n.at, 700) !== null;
      const lh = wr.size + 2;
      const top = s.y - ((wr.lines.length - 1) * lh) / 2 - 6;
      return (
        <g key={`n${n.user ?? n.by}`} {...(fresh ? { class: "cs-pop" } : {})}>
          <path d={doodle(n.doodle, s.x + 7, top - 4, 7)} fill="none" stroke={col} stroke-width={1.8} stroke-linejoin="round" stroke-linecap="round" />
          {wr.lines.map((l, k) => (
            <text key={k} x={r1(s.x + 20)} y={r1(top + k * lh)} font-size={wr.size} font-weight={600} font-family={HAND} fill={col}>{l}</text>
          ))}
          <text x={r1(s.x + 20)} y={r1(top + (wr.lines.length - 1) * lh + 16)} font-size={11} fill={mix(light, board, 0.25)}>{n.user === me ? "— you" : `— ${n.by}`}</text>
        </g>
      );
    });
    const spot = canSign ? slot(shown.length) : null;

    const tassel = (
      <g key={`t${lastAt}`} class={swinging ? "cs-swing" : "cs-idle"} style={{ transformOrigin: `${r1(hx)}px ${r1(hy)}px` }}>
        <path d={`M${r1(hx)} ${r1(hy)} q4 22 0 44`} fill="none" stroke={p.yellow} stroke-width={3} stroke-linecap="round" />
        <rect x={r1(hx - 5)} y={r1(hy + 40)} width={10} height={7} rx={2} fill={mix(p.yellow, p.orange, 0.4)} />
        {[-4, -2, 0, 2, 4].map((dx) => <line key={dx} x1={r1(hx + dx * 0.9)} y1={r1(hy + 46)} x2={r1(hx + dx * 1.5)} y2={r1(hy + 70)} stroke={p.yellow} stroke-width={2.2} stroke-linecap="round" />)}
        {state.year ? (
          <g>
            <rect x={r1(hx - 13)} y={r1(hy + 16)} width={26} height={16} rx={4} fill={mix(p.yellow, p.cream, 0.3)} stroke={mix(p.yellow, p.orange, 0.5)} stroke-width={1} />
            <text x={r1(hx)} y={r1(hy + 28)} font-size={11} font-weight={700} text-anchor="middle" fill={p.dark}>{state.year}</text>
          </g>
        ) : null}
      </g>
    );

    const signers = state.notes.map(person);
    const placeholder = state.lines[state.notes.length % state.lines.length] ?? "congrats";
    const draft = local.draft.trim();
    const sign = () => {
      const text = (draft || placeholder).slice(0, NOTE_LEN);
      dispatch({ t: "sign", text, doodle: local.doodle });
      haptic("light");
      setLocal({ draft: "" });
    };

    const header = (
      <CardHeader
        title={state.title}
        subtitle={`${state.school ? `${state.school} · ` : ""}${state.notes.length === 0 ? "no signatures yet" : `${state.notes.length} signed`}`}
      />
    );

    const picture = (
      <div style={{ position: "relative", height: PIC_H, borderRadius: 12, background: mix(c.wash, p.sky, 0.5), overflow: "hidden" }}>
        <svg width={W} height={PIC_H} viewBox={`0 0 ${W} ${PIC_H}`} role="img" aria-label={`${state.who}'s graduation cap with ${state.notes.length} signatures${shown.length ? `: ${shown.map((n) => `${n.by} wrote ${n.text}`).join(", ")}` : ""}`} style={{ display: "block" }}>
          {art}
          <g transform={`rotate(${tilt} ${r1(cx)} ${r1(cy)}) translate(${r1(cx)} ${r1(cy)})`}>
            <ellipse cx={0} cy={bh + 10} rx={bw * 0.9} ry={9} fill={mix(c.wash, c.text, 0.12)} />
            <rect x={-bw} y={-bh + 6} width={2 * bw} height={2 * bh} rx={6} fill={boardEdge} />
            <rect x={-bw} y={-bh} width={2 * bw} height={2 * bh} rx={6} fill={board} />
            <path d={`M${-bw + 10} ${-bh + 6}L${bw - 10} ${-bh + 6}`} stroke={mix(board, light, 0.18)} stroke-width={2} stroke-linecap="round" />
            {notesArt}
            {spot ? (
              <g>
                <rect class="cs-dash" x={r1(spot.x)} y={r1(spot.y - 24)} width={r1(colW)} height={46} rx={8} fill={mix(board, c.primary, 0.18)} stroke={mix(c.primary, light, 0.35)} stroke-width={1.5} stroke-dasharray="5 5" />
                <text x={r1(spot.x + colW / 2)} y={r1(spot.y + 4)} font-size={14} text-anchor="middle" fill={light}>your spot</text>
              </g>
            ) : null}
            {state.notes.length === 0 ? (
              <text x={0} y={70} font-size={15} text-anchor="middle" font-family={HAND} font-weight={600} fill={mix(light, board, 0.15)}>{canSign ? "be the first to write on it" : "nobody has signed yet"}</text>
            ) : null}
            <line x1={0} y1={0} x2={bw} y2={0} stroke={p.yellow} stroke-width={3} stroke-linecap="round" />
            <circle cx={0} cy={0} r={10} fill={mix(board, light, 0.12)} />
            <circle cx={0} cy={0} r={6} fill={p.yellow} />
            <circle cx={-2} cy={-2} r={2} fill={mix(p.yellow, light, 0.6)} />
            {pinned ? (
              <g class="cs-pop">
                <path d={`M0 l-7 16`} stroke={mix(light, board, 0.4)} stroke-width={2} stroke-linecap="round" />
                <circle cx={0} cy={-bh + 2} r={9} fill={p.red} />
                <circle cx={-3} cy={-bh - 1} r={3} fill={mix(p.red, light, 0.6)} />
              </g>
            ) : null}
          </g>
          {tassel}
        </svg>
        {hidden > 0 ? (
          <div style={{ position: "absolute", left: 10, bottom: 8, height: 20, padding: "0 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, fontWeight: 600, lineHeight: "20px" }}>{`+${hidden} more on the brim`}</div>
        ) : null}
        {pinned && running(state.pinnedAt, 2400) !== null ? (
          <div style={{ position: "absolute", left: "50%", top: 90, pointerEvents: "none" }}>
            <Burst key={state.pinnedAt} emoji="🎓" />
          </div>
        ) : null}
      </div>
    );

    let bottom: Child;
    if (canSign) {
      bottom = (
        <div>
          <form
            style={{ display: "flex", gap: 8, alignItems: "center" }}
            onSubmit={(e: Event) => {
              e.preventDefault();
              sign();
            }}
          >
            <input
              aria-label={`Write on ${state.who}'s cap`}
              placeholder={placeholder}
              maxLength={NOTE_LEN}
              value={local.draft}
              onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })}
              style={{ flex: 1, fontFamily: HAND, fontWeight: 600 }}
            />
            <Button kind="primary" onClick={sign}>Sign it</Button>
          </form>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, height: 36 }}>
            <span style={{ fontSize: 13, color: c.secondaryText, marginRight: 4, whiteSpace: "nowrap" }}>Add a doodle</span>
            {DOODLES.map((d, i) => {
              const on = local.doodle === i;
              return (
                <button
                  key={d}
                  type="button"
                  class="m-hit"
                  aria-label={`${d} doodle`}
                  aria-pressed={on}
                  onClick={() => setLocal({ doodle: i })}
                  style={{ position: "relative", width: 40, height: 36, borderRadius: 8, background: on ? mix(c.card, c.primary, 0.14) : c.secondaryButton, boxShadow: on ? `inset 0 0 0 2px ${c.primary}` : "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
                    <path d={doodle(i, 11, 11, 7.5)} fill="none" stroke={on ? c.primary : c.text} stroke-width={1.8} stroke-linejoin="round" stroke-linecap="round" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      );
    } else if (isWho && !pinned) {
      bottom = (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
            <Facepile users={signers} max={5} size={20} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {state.notes.length ? `${state.notes.length} friends signed your cap` : "Nobody has signed yet"}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            <Button
              kind="primary"
              wide
              disabled={state.notes.length === 0}
              onClick={() => {
                dispatch({ t: "pin" });
                haptic("success");
              }}
            >
              Pin to my profile
            </Button>
          </div>
        </div>
      );
    } else {
      const line = pinned
        ? `On ${state.who}'s profile · ${state.notes.length} signed`
        : mine
          ? `${state.notes.length} signed · ${state.who} pins it when it's full`
          : `${state.notes.length} signed`;
      bottom = (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 12px", borderRadius: 12, background: pinned ? c.selected : c.wash }}>
          <Facepile users={signers} max={5} size={22} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", fontWeight: pinned ? 600 : 400, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</span>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.positive} stroke-width={2.5} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flex: "none" }}>
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
      );
    }

    return (
      <div>
        <style>{CSS}</style>
        {header}
        {picture}
        <div style={{ marginTop: 10 }}>{bottom}</div>
        {pinned && running(state.pinnedAt, 2400) !== null ? <Toast key={state.pinnedAt}>{`Pinned to ${state.who}'s profile`}</Toast> : null}
      </div>
    );
  },
});
