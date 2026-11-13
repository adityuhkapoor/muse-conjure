import { defineApp, clock, Avatar, Burst, Button, CardHeader, Locked, fitText, haptic, mix, pal, running, spring, springs, type Ctx, type Theme } from "@muse/app";

// Cootie catcher: the paper fortune teller from fourth grade, folded out of the chat's plans. Tap
// a color and it pumps open and shut once per letter; tap a number and that flap lifts to show
// your fortune. Everyone's fortune lands under it; when you like one, lock it in as the plan.

type Params = {
  /** Card title: "Friday, decided by paper" */
  title: string;
  /** What started it */
  quote: string;
  /** Who said it */
  quoteBy: string;
  /** Four flap colors, as words: ["pink", "blue", "green", "yellow"] */
  colors: string[];
  /** Up to eight fortunes under the numbered flaps */
  fortunes: string[];
  /** Fortunes already told: who, and the number they opened (1 to 8) */
  told: { who: string; number: number }[];
};

// @params
const P: Params = {
  title: "Friday, decided by paper",
  quote: "we literally can't decide friday. let the paper thing pick",
  quoteBy: "Maya",
  colors: ["pink", "blue", "green", "yellow"],
  fortunes: [
    "Tío's tacos, then the Quad",
    "Midtown Lanes, loser buys fries",
    "Movie night, Maya's spreadsheet picks",
    "Golden Lantern dumplings",
    "Thrift run at Second Chapter",
    "Sunset at Lake Wren",
    "Rook's Pizza and a board game",
    "Stay in. Rice cooker night",
  ],
  told: [{ who: "Maya", number: 2 }],
};
// @end params

type Play = { u: string; color: number; num: number; at: number };
type State = { title: string; quote: string; quoteBy: string; colors: string[]; fortunes: string[]; plays: Play[]; locked: number };
type Action = { t: "tell"; color: number; num: number } | { t: "lock"; i: number } | { t: "unlock" };
type Local = { color: number; t0: number; num: number; bursts: number };

const PUMP = 300;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const LIFT = spring(springs.iosBouncy);
/** Numbers showing after pumping n times: odd counts open sideways, even counts open up and down. */
const shownFor = (n: number) => (n % 2 ? [1, 2, 5, 6] : [3, 4, 7, 8]);
const pumpsOf = (s: State, color: number) => Math.max(1, Math.min(9, (s.colors[color] ?? "").replace(/[^a-z]/gi, "").length || 3));
const fortuneOf = (s: State, num: number) => s.fortunes[(num - 1) % s.fortunes.length]!;
const cap = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

function initState(ctx: Ctx): State {
  let colors = (Array.isArray(P.colors) ? P.colors : []).map((x) => clean(x, 10).toLowerCase()).filter(Boolean).slice(0, 4);
  if (colors.length < 4) colors = ["pink", "blue", "green", "yellow"];
  let fortunes = (Array.isArray(P.fortunes) ? P.fortunes : []).map((x) => clean(x, 44)).filter(Boolean).slice(0, 8);
  if (!fortunes.length) fortunes = ["Pizza", "Tacos", "Stay in", "Bowling"];
  const s: State = { title: clean(P.title, 40) || "Fortune teller", quote: clean(P.quote, 90), quoteBy: clean(P.quoteBy, 20), colors, fortunes, plays: [], locked: -1 };
  for (const t of Array.isArray(P.told) ? P.told : []) {
    const m = ctx.members.find((x) => x.name.toLowerCase() === clean(t?.who, 30).toLowerCase() || x.id === t?.who);
    const num = t?.number;
    if (!m || !Number.isInteger(num) || num < 1 || num > 8 || s.plays.some((p) => p.u === m.id)) continue;
    const color = s.colors.findIndex((_, i) => shownFor(pumpsOf(s, i)).includes(num));
    if (color >= 0) s.plays.push({ u: m.id, color, num, at: 0 });
  }
  return s;
}

/** The catcher from above; `ox`/`oy` pull the four flaps apart sideways or up and down. */
function Catcher({ cx, cy, r, ox, oy, colors, theme, labels }: { cx: number; cy: number; r: number; ox: number; oy: number; colors: string[]; theme: Theme; labels: string[] }) {
  const c = theme.color;
  const p = pal(theme);
  const inner = mix(p.paper, c.wash, 0.1);
  const line = mix(c.secondaryText, p.paper, 0.3);
  // flaps: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left (diamond quadrants)
  const dirs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <rect x={-r * 0.5} y={-r * 0.5} width={r} height={r} fill={inner} transform="rotate(45)" stroke={line} stroke-width={1} />
      {[0, 1, 2, 3].map((i) => (
        <line key={`l${i}`} x1={0} y1={0} x2={dirs[i]![0] * r * 0.5} y2={dirs[i]![1] * r * 0.5} stroke={line} stroke-width={1} />
      ))}
      {dirs.map(([dx, dy], i) => {
        const tx = dx * ox;
        const ty = dy * oy;
        return (
          <g key={i} transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)})`}>
            <path d={`M 0 0 L ${dx * r} 0 L ${dx * r * 0.5} ${dy * r * 0.5} Z`} fill={colors[i]} stroke={mix(colors[i]!, c.text, 0.3)} stroke-width={1.2} />
            <path d={`M 0 0 L 0 ${dy * r} L ${dx * r * 0.5} ${dy * r * 0.5} Z`} fill={mix(colors[i]!, c.text, 0.1)} stroke={mix(colors[i]!, c.text, 0.3)} stroke-width={1.2} />
          </g>
        );
      })}
      {labels.length ? null : null}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Cootie catcher",
  summary: (s, ctx) => {
    if (s.locked >= 0) return `${s.title}: ${s.fortunes[s.locked]} · locked`;
    const last = s.plays.at(-1);
    const who = last ? ctx.members.find((m) => m.id === last.u)?.name ?? "Someone" : "";
    return last ? `${s.title}: ${who} got "${fortuneOf(s, last.num)}" · ${s.plays.length} told` : `${s.title}: nobody's played yet`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "tell") {
      if (s.locked >= 0 || !Number.isInteger(a.color) || a.color < 0 || a.color > 3 || !Number.isInteger(a.num)) return s;
      if (!shownFor(pumpsOf(s, a.color)).includes(a.num) || s.plays.length >= 30) return s;
      return { ...s, plays: [...s.plays.filter((p) => p.u !== u), { u, color: a.color, num: a.num, at: meta.time }] };
    }
    if (a.t === "lock") {
      if (s.locked >= 0 || !Number.isInteger(a.i) || a.i < 0 || a.i >= s.plays.length) return s;
      return { ...s, locked: (s.plays[a.i]!.num - 1) % s.fortunes.length };
    }
    if (a.t === "unlock") {
      if (s.locked < 0) return s;
      return { ...s, locked: -1 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const plays = s.plays.filter((p) => inChat(ctx, p.u));
    return plays.length === s.plays.length ? s : { ...s, plays };
  },

  invariants: {
    "one fortune per person": (s) => new Set(s.plays.map((p) => p.u)).size === s.plays.length,
    "every fortune came from a number you could see": (s) => s.plays.every((p) => p.color >= 0 && p.color < 4 && shownFor(pumpsOf(s, p.color)).includes(p.num)),
    "a locked plan is one of the fortunes": (s) => s.locked === -1 || (Number.isInteger(s.locked) && s.locked >= 0 && s.locked < s.fortunes.length),
    "players are in the chat": (s, ctx) => s.plays.every((p) => inChat(ctx, p.u)),
  },

  transitions: {
    "telling replaces only your fortune": (p, n, a, m) =>
      a.t !== "tell" || p === n || (n.plays.at(-1)!.u === m.user && n.plays.at(-1)!.num === a.num && n.plays.at(-1)!.at === m.time && n.plays.filter((x) => x.u !== m.user).length === p.plays.filter((x) => x.u !== m.user).length),
    "a lock takes that fortune": (p, n, a) => a.t !== "lock" || p === n || (p.locked === -1 && n.locked === (p.plays[a.i]!.num - 1) % p.fortunes.length),
    "locked means no more telling": (p, n, a) => a.t !== "tell" || p.locked === -1 || p === n,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.7) {
      const color = r.int(4);
      return { t: "tell", color, num: r.next() < 0.85 ? r.pick(shownFor(pumpsOf(s, color))) : 1 + r.int(8) };
    }
    if (k < 0.88) return { t: "lock", i: r.int(Math.max(1, s.plays.length)) };
    return { t: "unlock" };
  },

  local: { color: -1, t0: 0, num: 0, bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const hues = [p.red, p.blue, p.green, p.yellow];
    const flapColors = hues.map((h) => mix(h, p.paper, 0.15));
    const now = local.color >= 0 ? clock.value : 0;
    const pumps = local.color >= 0 ? pumpsOf(state, local.color) : 0;
    const el = local.color >= 0 && local.t0 > 0 ? now - local.t0 : 0;
    const pumping = local.color >= 0 && el < pumps * PUMP;
    const k = pumping ? Math.floor(el / PUMP) : pumps;
    const phase = pumping ? (el % PUMP) / PUMP : 1;
    const wave = Math.sin(phase * Math.PI);
    const r = Math.min(72, Math.round(W * 0.21));
    const cx = r + 32;
    const cy = H / 2 + 2;
    const sideways = (pumping ? k + 1 : pumps) % 2 === 1;
    const open = local.color >= 0 ? (pumping ? wave : 1) * 16 : 0;
    const ox = sideways ? open : open * 0.25;
    const oy = sideways ? open * 0.25 : open;
    const ready = local.color >= 0 && !pumping && !local.num;
    const mine = state.plays.find((x) => x.u === me);
    const reveal = local.num > 0 ? local.num : 0;
    const lift = mine && mine.at > 0 && reveal ? LIFT(running(mine.at, 700) ?? 700) : reveal ? 1 : 0;
    const nums = ready || reveal ? shownFor(pumps) : [];
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const locked = state.locked >= 0;
    const colW = W - cx - r - 18 - 46;

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={locked ? `Locked: ${state.fortunes[state.locked]}` : `A paper fortune teller with ${state.fortunes.length} fortunes`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={c.wash} />
        <ellipse cx={cx} cy={cy + r + 6} rx={r * 0.8} ry={6} fill={mix(c.wash, c.text, 0.08)} />
        <Catcher cx={cx} cy={cy} r={r} ox={ox} oy={oy} colors={flapColors} theme={theme} labels={[]} />
      </svg>
    );

    const flapPos: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.quoteBy ? `${state.quoteBy}: ` : ""}"${state.quote}"` : undefined} />
        <div style={{ position: "relative", height: H }}>
          {art}
          {state.colors.map((name, i) => {
            const [fx, fy] = flapPos[i]!;
            const x = cx + fx * r * 0.95 + (fx < 0 ? -ox : ox);
            const y = cy + fy * r * 0.95 + (fy < 0 ? -oy : oy);
            const f = fitText(cap(name), 56, { size: 13, min: 10, weight: 700 });
            return (
              <button
                key={`c${i}-${local.color === i}`}
                type="button"
                aria-label={`Pick ${name}`}
                disabled={locked || pumping}
                onClick={() => {
                  if (locked || pumping) return;
                  haptic("light");
                  setLocal({ color: i, t0: clock.value, num: 0 });
                }}
                style={{ position: "absolute", left: x - 28, top: y - 22, width: 56, height: 44, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ fontSize: f.size, lineHeight: "16px", fontWeight: 700, color: c.text, background: c.card, boxShadow: `0 0 0 2px ${flapColors[i]}`, padding: "0 4px", borderRadius: 4, textDecoration: local.color === i ? "underline" : "none" }}>{f.text}</span>
              </button>
            );
          })}
          {nums.map((n, j) => {
            const a = (j / nums.length) * Math.PI * 2 - Math.PI / 4;
            const x = cx + Math.cos(a) * 26;
            const y = cy + Math.sin(a) * 26;
            const on = reveal === n;
            return (
              <button
                key={`n${n}-${on}`}
                type="button"
                aria-label={`Open ${n}`}
                onClick={() => {
                  if (!ready) return;
                  haptic("success");
                  setLocal({ num: n, bursts: local.bursts + 1 });
                  dispatch({ t: "tell", color: local.color, num: n });
                }}
                style={{ position: "absolute", left: x - 22, top: y - 22 - (on ? lift * 6 : 0), width: 44, height: 44, padding: 0, border: 0, borderRadius: 22, background: "transparent", cursor: ready ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 13, background: on ? c.primary : c.card, color: on ? c.onPrimary : c.text, fontSize: 14, lineHeight: "26px", fontWeight: 800, textAlign: "center", boxShadow: `0 0 0 1px ${c.divider}` }}>{n}</span>
              </button>
            );
          })}
          <div style={{ position: "absolute", left: cx + r + 18, right: 0, top: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            <div style={{ fontSize: 12, lineHeight: "16px", fontWeight: 700, color: c.secondaryText }}>{locked ? "The plan" : state.plays.length ? "Fortunes told" : "Nobody's played yet"}</div>
            {locked ? (
              <div style={{ padding: "8px 10px", borderRadius: 12, background: c.card, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: c.text }}>{state.fortunes[state.locked]}</div>
            ) : (
              state.plays.slice(-3).reverse().map((pl) => (
                <div key={pl.u} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "6px 8px", borderRadius: 12, background: c.card, boxShadow: pl.u === me && pl.at > 0 ? `0 0 0 2px ${c.primary}` : "none" }}>
                  <Avatar user={pl.u} size={20} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>{`${nameOf(pl.u)} · ${cap(state.colors[pl.color]!)} ${pl.num}`}</div>
                    <div style={{ fontSize: colW < 90 ? 12 : 13, lineHeight: "17px", fontWeight: 600, color: c.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{fortuneOf(state, pl.num)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          {local.bursts > 0 && reveal && !pumping ? <Burst key={local.bursts} emoji="🔮" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {locked ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail="Decided by paper">{state.fortunes[state.locked]}</Locked>
              </div>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unlock" })}>
                Undo
              </Button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>
                {pumping ? `${cap(state.colors[local.color]!)} · ${Math.min(k + 1, pumps)} of ${pumps}` : ready ? "Pick a number" : mine ? "Like it? Lock it in" : "Pick a color"}
              </span>
              {state.plays.length ? (
                <Button
                  kind={mine ? "primary" : "secondary"}
                  onClick={() => {
                    const i = mine ? state.plays.indexOf(mine) : state.plays.length - 1;
                    dispatch({ t: "lock", i });
                  }}
                >
                  {mine ? "Lock mine" : "Lock theirs"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  },
});
