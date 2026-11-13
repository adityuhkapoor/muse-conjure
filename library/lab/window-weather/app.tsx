import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Window weather: someone posts from somewhere warm (or cold). A building at dusk where every friend
// gets a window showing the sky where they are right now (sun, cloud, rain, snow or night) and the
// temperature; the poster's window is the big one up top. Add yours and the building lights up.

type Sky = "sun" | "cloud" | "rain" | "snow" | "night";
type Params = {
  /** Who posted: "Tsai Lin" */
  author: string;
  /** Where they are: "Cusco" */
  place: string;
  /** Their sky: sun, cloud, rain, snow or night */
  sky: Sky;
  /** Their temperature, whole degrees */
  temp: number;
  /** "C" or "F" */
  unit: string;
  /** The post line */
  line: string;
  /** Friends' windows: where, their sky, temperature and a line */
  windows: { who: string; place: string; sky: Sky; temp: number; said?: string }[];
};

// @params
const P: Params = {
  author: "Tsai Lin",
  place: "Cusco",
  sky: "sun",
  temp: 22,
  unit: "C",
  line: "yo whats up just having fun in South America eating tostadas",
  windows: [
    { who: "Calvin", place: "Eastfield", sky: "snow", temp: -2, said: "7 alarms and it's still dark" },
    { who: "Will", place: "Eastfield", sky: "rain", temp: 4, said: "the Sube's wipers gave up" },
    { who: "Maya", place: "Denver", sky: "sun", temp: 9, said: "spreadsheet says: jealous" },
    { who: "Arun", place: "Edison", sky: "night", temp: 1, said: "using the rice cooker as a heater" },
  ],
};
// @end params

type Win = { who: string; name: string; place: string; sky: Sky; temp: number; said: string; at: number };
type State = { author: string; authorName: string; place: string; sky: Sky; temp: number; unit: string; line: string; windows: Win[] };
type Action = { t: "add"; place: string; sky: Sky; temp: number } | { t: "close" };
type Local = { open: boolean; sky: Sky; temp: number; place: string; sel: string; toast: number };

const SKIES: Sky[] = ["sun", "cloud", "rain", "snow", "night"];
const SKY_NAME: Record<Sky, string> = { sun: "Sunny", cloud: "Cloudy", rain: "Rain", snow: "Snow", night: "Night" };
const GUESS: Record<Sky, number> = { sun: 24, cloud: 14, rain: 10, snow: -2, night: 8 };
const MAX = 8;
const FACADE_H = 224;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isSky = (v: unknown): v is Sky => typeof v === "string" && (SKIES as string[]).includes(v);
const okTemp = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= -60 && v <= 130;

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const windows: Win[] = [];
  for (const w of Array.isArray(P.windows) ? P.windows : []) {
    const name = clean(w?.who, 20);
    if (!name || !isSky(w.sky) || !okTemp(w.temp) || windows.length >= MAX) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || windows.some((x) => x.who === who)) continue;
    windows.push({ who, name: m?.name ?? name, place: clean(w.place, 18), sky: w.sky, temp: w.temp, said: clean(w.said, 40), at: 0 });
  }
  return { author, authorName, place: clean(P.place, 18) || "here", sky: isSky(P.sky) ? P.sky : "sun", temp: okTemp(P.temp) ? P.temp : 20, unit: P.unit === "F" ? "F" : "C", line: clean(P.line, 70), windows };
}

/** The sky inside a window, w x h at the origin. */
function skyArt(sky: Sky, w: number, h: number, t: Theme, key: string) {
  const p = pal(t), c = t.color;
  const white = t.mode === "dark" ? mix(c.text, c.card, 0.15) : c.card;
  const bg = sky === "sun" ? p.sky : sky === "night" ? mix(p.dark, p.blue, 0.25) : sky === "snow" ? mix(c.secondaryText, c.card, 0.55) : mix(c.secondaryText, p.sky, 0.45);
  const cloud = (x: number, y: number, s: number, col: string) => (
    <g>
      <ellipse cx={x} cy={y} rx={12 * s} ry={7 * s} fill={col} />
      <ellipse cx={x - 8 * s} cy={y + 2 * s} rx={8 * s} ry={5 * s} fill={col} />
      <ellipse cx={x + 9 * s} cy={y + 2 * s} rx={8 * s} ry={5 * s} fill={col} />
    </g>
  );
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg} />
      {sky === "sun" ? (
        <g style={{ transformOrigin: `${w * 0.68}px ${h * 0.38}px`, animation: "wwSpin 12s linear infinite" }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <line key={i} x1={w * 0.68 + Math.cos((i * Math.PI) / 4) * 11} y1={h * 0.38 + Math.sin((i * Math.PI) / 4) * 11} x2={w * 0.68 + Math.cos((i * Math.PI) / 4) * 15} y2={h * 0.38 + Math.sin((i * Math.PI) / 4) * 15} stroke={p.yellow} stroke-width={2} stroke-linecap="round" />
          ))}
          <circle cx={w * 0.68} cy={h * 0.38} r={8} fill={p.yellow} />
        </g>
      ) : null}
      {sky === "night" ? (
        <g>
          <circle cx={w * 0.7} cy={h * 0.35} r={8} fill={p.cream} />
          <circle cx={w * 0.7 + 4} cy={h * 0.35 - 3} r={7} fill={bg} />
          {[[0.2, 0.25], [0.4, 0.5], [0.15, 0.6], [0.5, 0.2]].map(([x, y], i) => (
            <circle key={i} cx={w * x!} cy={h * y!} r={1.3} fill={p.cream} style={{ animation: `wwTwinkle ${1.5 + i * 0.4}s ease-in-out infinite` }} />
          ))}
        </g>
      ) : null}
      {sky === "cloud" || sky === "rain" || sky === "snow" ? (
        <g style={{ animation: "wwDrift 6s ease-in-out infinite" }}>
          {cloud(w * 0.42, h * 0.32, Math.max(0.8, w / 70), sky === "cloud" ? white : mix(c.secondaryText, white, 0.25))}
          {sky === "cloud" ? cloud(w * 0.75, h * 0.55, 0.7, mix(white, p.sky, 0.3)) : null}
        </g>
      ) : null}
      {sky === "rain"
        ? [0.25, 0.4, 0.55, 0.7, 0.32, 0.62].map((x, i) => (
            <line key={`${key}r${i}`} x1={w * x} y1={h * 0.5} x2={w * x - 2} y2={h * 0.5 + 6} stroke={p.blue} stroke-width={1.6} stroke-linecap="round" style={{ animation: `wwFall .${7 + (i % 3)}s linear ${i * 0.13}s infinite` }} />
          ))
        : null}
      {sky === "snow"
        ? [0.22, 0.38, 0.52, 0.68, 0.3, 0.6, 0.45].map((x, i) => (
            <circle key={`${key}s${i}`} cx={w * x} cy={h * 0.5} r={1.8} fill={white} style={{ animation: `wwSnow ${1.6 + (i % 3) * 0.4}s linear ${i * 0.2}s infinite` }} />
          ))
        : null}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Window weather",
  summary: (s) => {
    const all = [s.temp, ...s.windows.map((w) => w.temp)];
    return `${s.authorName}: ${s.temp}°${s.unit} in ${s.place} · ${s.windows.length} windows lit · ${Math.max(...all) - Math.min(...all)}° between warmest and coldest`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const u = meta.user;
    const old = s.windows.find((w) => w.who === u);
    if (a.t === "add") {
      if (!isSky(a.sky) || !okTemp(a.temp) || (!old && s.windows.length >= MAX)) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      const w: Win = { who: u, name, place: clean(a.place, 18), sky: a.sky, temp: a.temp, said: old?.said ?? "", at: meta.time };
      return { ...s, windows: old ? s.windows.map((x) => (x === old ? w : x)) : [...s.windows, w] };
    }
    if (a.t === "close") {
      if (!old) return s;
      return { ...s, windows: s.windows.filter((x) => x !== old) };
    }
    return s;
  },

  invariants: {
    "one window per friend": (s) => new Set(s.windows.map((w) => w.who)).size === s.windows.length,
    "eight windows at most": (s) => s.windows.length <= MAX,
    "the poster has the big window": (s) => s.windows.every((w) => w.who !== s.author),
    "every window has a sky and a temperature": (s) => s.windows.every((w) => isSky(w.sky) && okTemp(w.temp)),
  },

  transitions: {
    "adding lights my window with my sky": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const w = n.windows.find((x) => x.who === m.user);
      return !!w && w.sky === a.sky && w.temp === a.temp && w.place === clean(a.place, 18) && w.at === m.time;
    },
    "a changed window keeps its spot": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const i = p.windows.findIndex((x) => x.who === m.user);
      return i >= 0 ? n.windows.length === p.windows.length && n.windows[i]!.who === m.user : n.windows.length === p.windows.length + 1 && n.windows[n.windows.length - 1]!.who === m.user;
    },
    "nobody else's window changes": (p, n, _a, m) => p.windows.filter((x) => x.who !== m.user).every((x) => n.windows.includes(x)),
    "a window with room lights": (p, n, a, m, ctx) => a.t !== "add" || !inChat(ctx, m.user) || m.user === p.author || !isSky(a.sky) || !okTemp(a.temp) || (p.windows.length >= MAX && !p.windows.some((x) => x.who === m.user)) || p !== n,
    "closing darkens only mine": (p, n, a, m) => a.t !== "close" || p === n || (n.windows.length === p.windows.length - 1 && !n.windows.some((x) => x.who === m.user)),
    "the post never changes": (p, n) => p.temp === n.temp && p.sky === n.sky && p.place === n.place && p.author === n.author && p.unit === n.unit,
    "only people in the chat light windows": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.15 ? { t: "close" } : { t: "add", place: r.pick(["Eastfield", "Boston", ""]), sky: r.next() < 0.95 ? r.pick(SKIES) : ("hail" as Sky), temp: r.next() < 0.95 ? r.int(60) - 20 : 999 }),

  local: { open: false, sky: "cloud", temp: 14, place: "", sel: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const mine = state.windows.find((w) => w.who === me);
    const person = (w: Win): Member => members.find((m) => m.id === w.who) ?? { id: w.who, name: w.name };
    const author: Member = members.find((m) => m.id === state.author) ?? { id: state.author, name: state.authorName };
    const lastAt = Math.max(0, ...state.windows.map((w) => w.at));
    const sel = state.windows.find((w) => w.who === local.sel);
    const bx = 10, bw = W - 20;
    const bigW = Math.min(150, bw * 0.46), bigH = 70, bigX = bx + (bw - bigW) / 2, bigY = 22;
    const cols = 4, gap = 8;
    const cw = (bw - 16 - gap * (cols - 1)) / cols, ch = 46;
    const gx = (i: number) => bx + 8 + (i % cols) * (cw + gap);
    const gy = (i: number) => bigY + bigH + 14 + Math.floor(i / cols) * (ch + 10);
    const frame = dark ? mix(c.text, c.wash, 0.35) : c.card;
    const brick = dark ? mix(p.red, c.wash, 0.55) : mix(p.red, p.wall, 0.55);
    const all = [{ who: state.author, temp: state.temp }, ...state.windows];
    const warm = all.reduce((a, b) => (b.temp > a.temp ? b : a));
    const cold = all.reduce((a, b) => (b.temp < a.temp ? b : a));
    const nm = (who: string) => (who === me ? "you" : who === state.author ? state.authorName.split(" ")[0]! : (state.windows.find((w) => w.who === who)?.name ?? "").split(" ")[0]!);
    const add = () => {
      dispatch({ t: "add", place: local.place, sky: local.sky, temp: local.temp });
      setLocal({ open: false, sel: me, toast: local.toast + 1 });
      haptic("success");
    };
    const caption = sel
      ? `${sel.who === me ? "You" : sel.name.split(" ")[0]}: ${sel.temp}°${state.unit}${sel.place ? ` in ${sel.place}` : ""}${sel.said ? ` · “${sel.said}”` : ""}`
      : state.windows.length
        ? `Warmest ${nm(warm.who)} ${warm.temp}° · coldest ${nm(cold.who)} ${cold.temp}°`
        : `Light the first window · what's it like where you are?`;

    return (
      <div>
        <style>{"@keyframes wwSpin { to { transform: rotate(360deg) } } @keyframes wwFall { from { transform: translateY(-14px); opacity: 0 } 30% { opacity: 1 } to { transform: translateY(14px); opacity: 0 } } @keyframes wwSnow { from { transform: translate(0, -16px) } 50% { transform: translate(2px, 0) } to { transform: translate(-1px, 16px) } } @keyframes wwDrift { 0%, 100% { transform: translateX(-2px) } 50% { transform: translateX(3px) } } @keyframes wwTwinkle { 0%, 100% { opacity: .3 } 50% { opacity: 1 } } @keyframes wwOn { from { opacity: 0 } to { opacity: 1 } }"}</style>
        <CardHeader title={`${state.temp}°${state.unit} in ${state.place}. And you?`} subtitle={state.line ? `${state.authorName}: “${state.line}”` : `${state.windows.length} windows lit`} />
        <div style={{ position: "relative", height: FACADE_H }}>
          <svg width={W} height={FACADE_H} viewBox={`0 0 ${W} ${FACADE_H}`} role="img" aria-label={`Building with ${state.windows.length + 1} lit windows showing everyone's weather`} style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={0} width={W} height={FACADE_H} rx={12} fill={dark ? mix(c.wash, p.purple, 0.25) : mix(p.sky, p.purple, 0.25)} />
            <rect x={bx} y={10} width={bw} height={FACADE_H - 10} rx={4} fill={brick} />
            <rect x={bx - 4} y={6} width={bw + 8} height={8} rx={2} fill={mix(brick, c.text, 0.2)} />
            {/* the big window */}
            <rect x={bigX - 4} y={bigY - 4} width={bigW + 8} height={bigH + 8} rx={4} fill={frame} />
            <g transform={`translate(${bigX} ${bigY})`}>{skyArt(state.sky, bigW, bigH, theme, "big")}</g>
            <line x1={bigX + bigW / 2} y1={bigY} x2={bigX + bigW / 2} y2={bigY + bigH} stroke={frame} stroke-width={3} />
            {/* the small windows, dark until someone lights one */}
            {Array.from({ length: MAX }, (_, i) => {
              const w = state.windows[i];
              return (
                <g key={w ? w.who : `e${i}`} transform={`translate(${gx(i)} ${gy(i)})`}>
                  <rect x={-3} y={-3} width={cw + 6} height={ch + 6} rx={3} fill={mix(brick, c.text, 0.25)} />
                  {w ? <g style={w.at === lastAt && w.at > 0 ? { animation: "wwOn .8s ease-out" } : {}}>{skyArt(w.sky, cw, ch, theme, w.who)}</g> : <rect x={0} y={0} width={cw} height={ch} fill={dark ? mix(c.wash, p.dark, 0.5) : mix(p.dark, brick, 0.25)} />}
                  <rect x={-4} y={ch} width={cw + 8} height={4} rx={1} fill={frame} />
                </g>
              );
            })}
          </svg>
          <div style={{ position: "absolute", left: bigX + 6, top: bigY + bigH - 26, pointerEvents: "none" }}>
            <Avatar user={author} size={22} />
          </div>
          <div style={{ position: "absolute", left: bigX + bigW - 52, top: bigY + 4, width: 48, textAlign: "right", fontSize: 15, lineHeight: "18px", fontWeight: 800, color: c.text, textShadow: `0 0 3px ${c.card}`, pointerEvents: "none" }}>{`${state.temp}°`}</div>
          {state.windows.map((w, i) => (
            <button key={w.who} type="button" aria-label={`${w.name}: ${w.temp} degrees, ${SKY_NAME[w.sky].toLowerCase()}${w.place ? ` in ${w.place}` : ""}`} onClick={() => setLocal({ sel: local.sel === w.who ? "" : w.who })} style={{ position: "absolute", left: gx(i) - 3, top: gy(i) - 3, width: cw + 6, height: ch + 6, padding: 0, border: local.sel === w.who ? `2px solid ${c.primary}` : "none", borderRadius: 4, background: "none" }}>
              <div style={{ position: "absolute", left: 4, bottom: 4 }}>
                <Avatar user={w.who === me ? me : person(w)} size={18} />
              </div>
              <div style={{ position: "absolute", right: 4, top: 3, fontSize: 12, lineHeight: "14px", fontWeight: 800, color: c.text, textShadow: `0 0 3px ${c.card}` }}>{`${w.temp}°`}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{caption}</div>
        {local.open && !isAuthor ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {SKIES.map((k) => (
                <button key={k} type="button" aria-label={SKY_NAME[k]} onClick={() => setLocal({ sky: k, temp: local.sky === k ? local.temp : GUESS[k] })} style={{ flex: 1, minWidth: 0, height: 44, padding: 2, borderRadius: 8, border: `2px solid ${local.sky === k ? c.primary : c.divider}`, background: c.card, overflow: "hidden" }}>
                  <svg width="100%" height={36} viewBox="0 0 48 36" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block", borderRadius: 5 }}>
                    {skyArt(k, 48, 36, theme, `pick${k}`)}
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={local.place} maxLength={18} placeholder="Where you are" aria-label="Where you are" onInput={(e: { currentTarget: { value: string } }) => setLocal({ place: e.currentTarget.value })} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" aria-label="Colder" onClick={() => setLocal({ temp: Math.max(-60, local.temp - 1) })} style={{ width: 44, height: 44, borderRadius: 8, border: "none", background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, fontWeight: 700 }}>
                −
              </button>
              <span style={{ width: 40, textAlign: "center", fontSize: 15, fontWeight: 700, color: c.text }}>{`${local.temp}°`}</span>
              <button type="button" aria-label="Warmer" onClick={() => setLocal({ temp: Math.min(130, local.temp + 1) })} style={{ width: 44, height: 44, borderRadius: 8, border: "none", background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, fontWeight: 700 }}>
                +
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button kind="primary" wide onClick={add}>
                Light my window
              </Button>
            </div>
          </div>
        ) : !isAuthor ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {mine ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "close" })}>
                Turn it off
              </Button>
            ) : null}
            <div style={{ flex: 1 }}>
              {mine || state.windows.length < MAX ? (
                <Button kind={mine ? "secondary" : "primary"} wide onClick={() => setLocal({ open: true, sky: mine?.sky ?? local.sky, temp: mine?.temp ?? local.temp, place: mine?.place ?? local.place })}>
                  {mine ? "Change my sky" : "Add my window"}
                </Button>
              ) : (
                <Button kind="secondary" wide disabled>
                  Every window is lit
                </Button>
              )}
            </div>
          </div>
        ) : null}
        {local.toast > 0 && mine && !local.open ? <Toast key={local.toast}>{`Window lit · ${mine.temp}°${state.unit}`}</Toast> : null}
      </div>
    );
  },
});
