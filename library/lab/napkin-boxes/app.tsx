import { defineApp, Avatar, Burst, Button, CardHeader, haptic, mix, pal, running, spring, springs, tween, userColor, type Ctx } from "@muse/app";

// Napkin boxes: dots and boxes on a café napkin, two players, one pen each. On your turn draw one
// line between two dots; close a box and your initial goes in it and you go again. When the napkin
// is full, whoever has more boxes wins and the stake is settled.

type Params = {
  /** Card title: "Napkin boxes" */
  title: string;
  /** Where the napkin is: "Kettle & Crumb" */
  place: string;
  /** The two players, first to move first: ["Tsai Lin", "Aditya"] */
  players: string[];
  /** What's on the line: "Loser buys the chai" */
  stake: string;
  /** One line of trash talk each, same order as players */
  talk: string[];
  /** Boxes across, 2 to 5 */
  cols: number;
  /** Boxes down, 2 to 4 */
  rows: number;
  /** Lines already drawn, in order: "h" or "v", row, col, e.g. "h00" */
  moves: string[];
};

// @params
const P: Params = {
  title: "Napkin boxes",
  place: "Kettle & Crumb",
  players: ["Tsai Lin", "Aditya"],
  stake: "Loser buys the chai",
  talk: ["i've never lost this game", "lowkey i'm undefeated too"],
  cols: 4,
  rows: 3,
  moves: ["h00", "v11", "h01", "v00", "v01", "h10", "v03", "h22", "v24", "h33", "h30", "v12"],
};
// @end params

type Line = { id: string; u: string; at: number };
type State = {
  title: string;
  place: string;
  a: string;
  b: string;
  names: [string, string];
  stake: string;
  talk: [string, string];
  cols: number;
  rows: number;
  lines: Line[];
  boxes: Record<string, string>;
  turn: string;
  games: number;
};
type Action = { t: "line"; id: string } | { t: "again" };
type Local = { bursts: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const INK = tween({ duration: 380, easing: "decelerate" });
const POP = spring(springs.iosBouncy);
const pair = (s: State) => [s.a, s.b].filter(Boolean);
const validId = (s: State, id: string) => {
  const m = /^([hv])(\d)(\d)$/.exec(id);
  if (!m) return false;
  const r = Number(m[2]);
  const c = Number(m[3]);
  return m[1] === "h" ? r <= s.rows && c < s.cols : r < s.rows && c <= s.cols;
};
const sides = (r: number, c: number) => [`h${r}${c}`, `h${r + 1}${c}`, `v${r}${c}`, `v${r}${c + 1}`];
const total = (s: State) => s.rows * s.cols;
const score = (s: State, u: string) => Object.values(s.boxes).filter((x) => x === u).length;
const over = (s: State) => Object.keys(s.boxes).length === total(s);
const winner = (s: State) => (!over(s) ? "" : score(s, s.a) > score(s, s.b) ? s.a : score(s, s.b) > score(s, s.a) ? s.b : "tie");

/** Draw a line for u; returns the new state (no validation of turn). */
function play(s: State, u: string, id: string, at: number): State {
  const lines = [...s.lines, { id, u, at }];
  const taken = new Set(lines.map((l) => l.id));
  const boxes = { ...s.boxes };
  let closed = 0;
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      const k = `${r}${c}`;
      if (!boxes[k] && sides(r, c).every((x) => taken.has(x)) && sides(r, c).includes(id)) {
        boxes[k] = u;
        closed++;
      }
    }
  const other = u === s.a ? s.b : s.a;
  return { ...s, lines, boxes, turn: closed > 0 || !other ? u : other };
}

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const ps = Array.isArray(P.players) ? P.players : [];
  const ma = find(ps[0]);
  const a = ma?.id ?? ctx.members[0]?.id ?? "";
  const mb = find(ps[1]);
  const b = mb && mb.id !== a ? mb.id : ctx.members.find((m) => m.id !== a)?.id ?? "";
  const nm = (id: string, fb: unknown) => ctx.members.find((m) => m.id === id)?.name ?? (clean(fb, 20) || "Player");
  const talk = Array.isArray(P.talk) ? P.talk : [];
  let s: State = {
    title: clean(P.title, 40) || "Napkin boxes",
    place: clean(P.place, 30),
    a,
    b,
    names: [nm(a, ps[0]), nm(b, ps[1])],
    stake: clean(P.stake, 40),
    talk: [clean(talk[0], 50), clean(talk[1], 50)],
    cols: Number.isInteger(P.cols) && P.cols >= 2 && P.cols <= 5 ? P.cols : 4,
    rows: Number.isInteger(P.rows) && P.rows >= 2 && P.rows <= 4 ? P.rows : 3,
    lines: [],
    boxes: {},
    turn: a,
    games: 0,
  };
  for (const mv of Array.isArray(P.moves) ? P.moves : []) {
    const id = clean(mv, 3);
    if (!s.turn || !validId(s, id) || s.lines.some((l) => l.id === id)) continue;
    const next = play(s, s.turn, id, 0);
    if (over(next)) break;
    s = next;
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Napkin boxes",
  summary: (s) => {
    const w = winner(s);
    const line = `${s.names[0]} ${score(s, s.a)} · ${s.names[1]} ${score(s, s.b)}`;
    if (w === "tie") return `Napkin boxes: tie, ${line}`;
    if (w) return `${w === s.a ? s.names[0] : s.names[1]} won napkin boxes · ${line}${s.stake ? ` · ${s.stake}` : ""}`;
    return `Napkin boxes · ${line} · ${s.turn === s.a ? s.names[0] : s.names[1]}'s turn`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !pair(s).includes(u)) return s;
    if (a.t === "line") {
      if (over(s) || u !== s.turn || typeof a.id !== "string" || !validId(s, a.id) || s.lines.some((l) => l.id === a.id)) return s;
      return play(s, u, a.id, meta.time);
    }
    if (a.t === "again") {
      if (!over(s)) return s;
      const w = winner(s);
      const loser = w === s.a ? s.b : w === s.b ? s.a : s.turn === s.a ? s.b : s.a;
      return { ...s, lines: [], boxes: {}, turn: loser || s.a, games: s.games + 1 };
    }
    return s;
  },

  invariants: {
    "every line is on the napkin, once": (s) => s.lines.every((l) => validId(s, l.id)) && new Set(s.lines.map((l) => l.id)).size === s.lines.length,
    "a box is claimed only when closed": (s) => {
      const taken = new Set(s.lines.map((l) => l.id));
      return Object.keys(s.boxes).every((k) => sides(Number(k[0]), Number(k[1])).every((x) => taken.has(x)));
    },
    "every closed box has an owner": (s) => {
      const taken = new Set(s.lines.map((l) => l.id));
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if (sides(r, c).every((x) => taken.has(x)) && !s.boxes[`${r}${c}`]) return false;
      return true;
    },
    "boxes belong to the players": (s) => Object.values(s.boxes).every((u) => u === s.a || u === s.b),
    "it's always a player's turn": (s) => s.turn === s.a || s.turn === s.b,
  },

  transitions: {
    "only the player whose turn it is draws": (p, n, a, m) => a.t !== "line" || p === n || (m.user === p.turn && n.lines.length === p.lines.length + 1 && n.lines.at(-1)!.id === a.id && n.lines.at(-1)!.u === m.user),
    "closing a box keeps the pen": (p, n, a, m) => a.t !== "line" || p === n || !p.a || !p.b || p.a === p.b || (Object.keys(n.boxes).length > Object.keys(p.boxes).length) === (n.turn === m.user),
    "new boxes go to who drew": (p, n, a, m) => a.t !== "line" || Object.keys(n.boxes).every((k) => p.boxes[k] === n.boxes[k] || (!p.boxes[k] && n.boxes[k] === m.user)),
    "a new napkin only after a full one": (p, n, a) => a.t !== "again" || p === n || (over(p) && n.lines.length === 0 && n.games === p.games + 1),
    "only players act": (p, n, _a, m, ctx) => p === n || (pair(p).includes(m.user) && inChat(ctx, m.user)),
  },

  arbitrary: (s, _u, r) => {
    if (over(s)) return r.next() < 0.7 ? { t: "again" } : { t: "line", id: "h00" };
    const free: string[] = [];
    for (let i = 0; i <= s.rows; i++) for (let c = 0; c < s.cols; c++) free.push(`h${i}${c}`);
    for (let i = 0; i < s.rows; i++) for (let c = 0; c <= s.cols; c++) free.push(`v${i}${c}`);
    const open = free.filter((id) => !s.lines.some((l) => l.id === id));
    return { t: "line", id: r.next() < 0.9 && open.length ? r.pick(open) : "x99" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 226;
    const dark = theme.mode === "dark";
    const step = Math.min(58, (W - 170) / state.cols, (H - 64) / state.rows);
    const gw = step * state.cols;
    const gh = step * state.rows;
    const ox = (W - gw) / 2;
    const oy = (H - gh) / 2;
    const myTurn = state.turn === me && !over(state);
    const w = winner(state);
    const napkin = dark ? mix(p.paper, c.wash, 0.15) : p.paper;
    const penOf = (u: string) => (u ? userColor(u, theme) : c.text);
    const taken = new Map(state.lines.map((l) => [l.id, l]));
    const last = state.lines.at(-1);
    const nameOf = (u: string) => (u === me ? "You" : u === state.a ? state.names[0] : state.names[1]);

    const seg = (id: string) => {
      const kind = id[0];
      const r = Number(id[1]);
      const col = Number(id[2]);
      const x1 = ox + col * step;
      const y1 = oy + r * step;
      return kind === "h" ? [x1, y1, x1 + step, y1] : [x1, y1, x1, y1 + step];
    };

    const pick = (x: number, y: number) => {
      if (!myTurn) return;
      const gx = (x - ox) / step;
      const gy = (y - oy) / step;
      let best = "";
      let bd = 0.42;
      const cands: string[] = [];
      for (let r = 0; r <= state.rows; r++) for (let col = 0; col < state.cols; col++) cands.push(`h${r}${col}`);
      for (let r = 0; r < state.rows; r++) for (let col = 0; col <= state.cols; col++) cands.push(`v${r}${col}`);
      for (const id of cands) {
        if (taken.has(id)) continue;
        const r = Number(id[1]);
        const col = Number(id[2]);
        const d = id[0] === "h" ? Math.hypot(Math.max(0, Math.abs(gx - (col + 0.5)) - 0.5), gy - r) : Math.hypot(gx - col, Math.max(0, Math.abs(gy - (r + 0.5)) - 0.5));
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      if (!best) return;
      haptic("light");
      dispatch({ t: "line", id: best });
    };

    const dots: unknown[] = [];
    for (let r = 0; r <= state.rows; r++) for (let col = 0; col <= state.cols; col++) dots.push(<circle key={`d${r}${col}`} cx={ox + col * step} cy={oy + r * step} r={3.2} fill={mix(dark ? c.wash : c.text, napkin, 0.15)} />);
    const guides: unknown[] = [];
    if (myTurn) {
      for (let r = 0; r <= state.rows; r++) for (let col = 0; col < state.cols; col++) guides.push(`h${r}${col}`);
      for (let r = 0; r < state.rows; r++) for (let col = 0; col <= state.cols; col++) guides.push(`v${r}${col}`);
    }

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dots and boxes, ${state.names[0]} ${score(state, state.a)}, ${state.names[1]} ${score(state, state.b)}, ${total(state) - Object.keys(state.boxes).length} boxes left`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={mix(p.brown, c.wash, dark ? 0.55 : 0.7)} />
        <g transform={`rotate(-2 ${W / 2} ${H / 2})`}>
          <path
            d={`M ${ox - 24} ${oy - 22} ${Array.from({ length: 12 }, () => `q ${(gw + 48) / 24} -4 ${(gw + 48) / 12} 0`).join(" ")} v ${gh + 44} ${Array.from({ length: 12 }, () => `q ${-(gw + 48) / 24} 4 ${-(gw + 48) / 12} 0`).join(" ")} Z`}
            fill={napkin}
            stroke={mix(napkin, c.text, 0.12)}
            stroke-width={1}
          />
          <circle cx={ox + gw + 10} cy={oy + gh + 6} r={18} fill="none" stroke={mix(p.brown, napkin, 0.55)} stroke-width={4} />
          {Object.entries(state.boxes).map(([k, u]) => {
            const r = Number(k[0]);
            const col = Number(k[1]);
            const e = last && last.u === u && last.at > 0 ? running(last.at, 600) : null;
            const sc = e === null ? 1 : POP(e);
            return (
              <g key={k} transform={`translate(${ox + col * step + step / 2} ${oy + r * step + step / 2}) scale(${sc.toFixed(3)})`}>
                <rect x={-step / 2 + 4} y={-step / 2 + 4} width={step - 8} height={step - 8} rx={4} fill={mix(penOf(u), napkin, 0.72)} />
              </g>
            );
          })}
          {(guides as string[]).filter((id) => !taken.has(id)).map((id) => {
            const [x1, y1, x2, y2] = seg(id);
            return <line key={`g${id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={mix(dark ? c.wash : c.text, napkin, 0.78)} stroke-width={1.5} stroke-dasharray="3 4" />;
          })}
          {state.lines.map((l, i) => {
            const [x1, y1, x2, y2] = seg(l.id);
            const e = l.at > 0 ? running(l.at, 380) : null;
            const t = e === null ? 1 : INK(e);
            return <line key={i} x1={x1} y1={y1} x2={x1! + (x2! - x1!) * t} y2={y1! + (y2! - y1!) * t} stroke={penOf(l.u)} stroke-width={l === last ? 4 : 3} stroke-linecap="round" />;
          })}
          {dots as never}
        </g>
      </svg>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={[state.place, state.stake].filter(Boolean).join(" · ")} />
        {state.talk[0] || state.talk[1] ? (
          <div style={{ marginBottom: 6, fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[0, 1].map((i) => (state.talk[i] ? `${state.names[i]}: "${state.talk[i]}"` : "")).filter(Boolean).join(" · ")}
          </div>
        ) : null}
        <div style={{ position: "relative", height: H }}>
          {art}
          <div
            role="button"
            aria-label={myTurn ? "Draw a line: tap between two dots" : "Napkin"}
            tabIndex={0}
            onPointerDown={(e: PointerEvent) => {
              const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
              pick(e.clientX - rc.left, e.clientY - rc.top);
            }}
            style={{ position: "absolute", left: ox - 24, top: oy - 24, width: gw + 48, height: gh + 48, cursor: myTurn ? "crosshair" : "default" }}
          />
          {Object.entries(state.boxes).map(([k, u]) => (
            <div key={`i${k}`} style={{ position: "absolute", left: ox + Number(k[1]) * step + step / 2 - 9, top: oy + Number(k[0]) * step + step / 2 - 9, display: "flex", pointerEvents: "none", transform: "rotate(-2deg)" }}>
              <Avatar user={u} size={18} />
            </div>
          ))}
          {[state.a, state.b].map((u, i) => (
            <div key={i} style={{ position: "absolute", [i ? "right" : "left"]: 6, top: 8, width: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none" }}>
              <span style={{ display: "flex", borderRadius: 99, boxShadow: state.turn === u && !over(state) ? `0 0 0 3px ${penOf(u)}` : `0 0 0 2px ${c.card}` }}>{u ? <Avatar user={u} size={32} /> : null}</span>
              <span style={{ fontSize: 20, lineHeight: "24px", fontWeight: 800, color: dark ? c.wash : c.text, background: napkin, borderRadius: 6, padding: "0 6px" }}>{score(state, u)}</span>
            </div>
          ))}
          {w && w !== "tie" && last && last.at > 0 && running(last.at, 1500) !== null ? <Burst key={last.at} emoji="☕" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {over(state) ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "18px", color: c.text, fontWeight: 600 }}>
                {w === "tie" ? "Tie · split the chai" : `${nameOf(w)} ${w === me ? "win" : "wins"} ${score(state, w)} to ${score(state, w === state.a ? state.b : state.a)}${state.stake ? ` · ${state.stake.toLowerCase()}` : ""}`}
              </span>
              {pair(state).includes(me) ? (
                <Button
                  kind="primary"
                  onClick={() => {
                    setLocal({ bursts: local.bursts + 1 });
                    dispatch({ t: "again" });
                  }}
                >
                  New napkin
                </Button>
              ) : null}
            </>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: myTurn ? c.text : c.secondaryText, fontWeight: myTurn ? 600 : 400 }}>
              {myTurn ? "Your turn · tap between two dots" : `${nameOf(state.turn)}'s turn · ${total(state) - Object.keys(state.boxes).length} boxes left`}
            </span>
          )}
        </div>
      </div>
    );
  },
});
