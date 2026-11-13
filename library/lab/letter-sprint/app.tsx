import { defineApp, Avatar, Button, CardHeader, Facepile, clock, haptic, mix, pal, rng, running, tween, type Ctx } from "@muse/app";

// Letter sprint: a letter drops and five categories sit under it, two of them from the group's own
// life. Each person gets their own 60 seconds of sand; answers go in face down. When the sheets are
// in, everyone flips together: cards turn over row by row, and answers that match someone else's
// clash and score nothing. Unique answers that start with the letter score a point.

type Params = {
  /** Card title */
  title: string;
  /** The letter for this round, A to Z */
  letter: string;
  /** Exactly five categories; mix the group's own ("a Hollis dish") with classics ("a movie") */
  categories: string[];
  /** Sheets already handed in, face down: who, and their five answers in category order */
  sheets: { who: string; words: string[] }[];
};

// @params
const P: Params = {
  title: "Letter sprint",
  letter: "M",
  categories: ["A Hollis dish", "A thing Will says", "A place in Eastfield", "A movie", "In Arun's rice cooker"],
  sheets: [
    { who: "Calvin", words: ["mac and cheese", "my bad", "Midtown Lanes", "Moana", "mac and cheese"] },
    { who: "Arun", words: ["meatloaf", "mid", "Miller Hill", "Mean Girls", "mochi, obviously"] },
    { who: "Tsai Lin", words: ["mac and cheese", "mid", "Midtown Lanes", "Mulan", "miso"] },
    { who: "Maya", words: ["minestrone", "my shower is short", "Miller Hill", "Matilda", "mango sticky rice"] },
  ],
};
// @end params

type Sheet = { u: string; words: string[]; at: number };
type State = { title: string; letter: string; cats: string[]; started: Record<string, number>; sheets: Sheet[]; revealAt: number; round: number };
type Action = { t: "start" } | { t: "submit"; words: string[] } | { t: "flip" } | { t: "again" };
type Local = { words: string[] };

const SPRINT = 60000;
const GRACE = 15000;
const LETTERS = "ABCDEFGHIJKLMNOPRSTW";
const N = 5;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const valid = (s: State, w: string) => norm(w).startsWith(s.letter.toLowerCase());
const drop = tween({ duration: 700, easing: [0.34, 1.56, 0.64, 1] });
const flipT = tween({ duration: 260, easing: "standard" });

function cell(s: State, i: number, w: string): "ok" | "clash" | "miss" {
  if (!valid(s, w)) return "miss";
  const k = norm(w);
  return s.sheets.filter((x) => valid(s, x.words[i] ?? "") && norm(x.words[i] ?? "") === k).length > 1 ? "clash" : "ok";
}
const score = (s: State, sh: Sheet) => sh.words.reduce((n, w, i) => n + (cell(s, i, w) === "ok" ? 1 : 0), 0);

function initState(ctx: Ctx): State {
  const letter = clean(P.letter, 1).toUpperCase();
  const cats = (Array.isArray(P.categories) ? P.categories : []).map((c) => clean(c, 30)).filter(Boolean).slice(0, N);
  const fill = ["An animal", "A food", "A movie", "A city", "A name"];
  while (cats.length < N) cats.push(fill[cats.length]!);
  const started: Record<string, number> = {};
  const sheets: Sheet[] = [];
  for (const sh of Array.isArray(P.sheets) ? P.sheets : []) {
    const n = clean(sh?.who, 40).toLowerCase();
    const m = ctx.members.find((x) => x.id === n || x.name.toLowerCase() === n);
    if (!m || started[m.id]) continue;
    const words = Array.from({ length: N }, (_, i) => clean(Array.isArray(sh.words) ? sh.words[i] : "", 24));
    started[m.id] = 1;
    sheets.push({ u: m.id, words, at: 1 });
  }
  return { title: clean(P.title, 40) || "Letter sprint", letter: /^[A-Z]$/.test(letter) ? letter : "M", cats, started, sheets, revealAt: 0, round: 1 };
}

export default defineApp<State, Action, Local>({
  name: "Letter sprint",
  summary: (s, ctx) => {
    if (s.revealAt) {
      const best = [...s.sheets].sort((a, b) => score(s, b) - score(s, a))[0];
      const name = ctx.members.find((m) => m.id === best?.u)?.name ?? "Someone";
      return best ? `Letter sprint ${s.letter} · ${name} wins with ${score(s, best)}` : `Letter sprint ${s.letter}`;
    }
    return `Letter sprint · ${s.letter} · ${s.sheets.length} ${s.sheets.length === 1 ? "sheet" : "sheets"} in`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "start") {
      if (s.revealAt || s.started[u]) return s;
      return { ...s, started: { ...s.started, [u]: meta.time } };
    }
    if (a.t === "submit") {
      if (s.revealAt || !s.started[u] || s.sheets.some((x) => x.u === u) || !Array.isArray(a.words)) return s;
      if (s.started[u]! > 1 && meta.time > s.started[u]! + SPRINT + GRACE) return s;
      const words = Array.from({ length: N }, (_, i) => clean(a.words[i], 24));
      return { ...s, sheets: [...s.sheets, { u, words, at: meta.time }] };
    }
    if (a.t === "flip") {
      if (s.revealAt || s.sheets.length < 2 || !s.sheets.some((x) => x.u === u)) return s;
      return { ...s, revealAt: meta.time };
    }
    if (a.t === "again") {
      if (!s.revealAt) return s;
      const pool = LETTERS.split("").filter((l) => l !== s.letter);
      return { ...s, letter: rng(meta.seed).pick(pool), started: {}, sheets: [], revealAt: 0, round: s.round + 1 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.revealAt) return s;
    const sheets = s.sheets.filter((x) => inChat(ctx, x.u));
    const started = Object.fromEntries(Object.entries(s.started).filter(([u]) => inChat(ctx, u)));
    if (sheets.length === s.sheets.length && Object.keys(started).length === Object.keys(s.started).length) return s;
    return { ...s, sheets, started };
  },

  invariants: {
    "one sheet per person, five answers each": (s) => new Set(s.sheets.map((x) => x.u)).size === s.sheets.length && s.sheets.every((x) => x.words.length === N && x.words.every((w) => w.length <= 24)),
    "five categories and one letter": (s) => s.cats.length === N && /^[A-Z]$/.test(s.letter),
    "every sheet's author ran the sand": (s) => s.sheets.every((x) => (s.started[x.u] ?? 0) > 0),
    "flipping needs two sheets": (s) => s.revealAt === 0 || s.sheets.length >= 2,
    "scores are whole and at most five": (s) => s.sheets.every((x) => Number.isInteger(score(s, x)) && score(s, x) >= 0 && score(s, x) <= N),
    "people still writing are in the chat": (s, ctx) => s.revealAt !== 0 || (Object.keys(s.started).every((u) => inChat(ctx, u)) && s.sheets.every((x) => inChat(ctx, x.u))),
  },

  transitions: {
    "start runs only your sand": (p, n, a, m) => a.t !== "start" || p === n || (!p.started[m.user] && n.started[m.user] === m.time && n.sheets === p.sheets),
    "a sheet goes in once, inside the time": (p, n, a, m) =>
      a.t !== "submit" || p === n || (!p.sheets.some((x) => x.u === m.user) && n.sheets.length === p.sheets.length + 1 && n.sheets[n.sheets.length - 1]!.u === m.user && (p.started[m.user]! <= 1 || m.time <= p.started[m.user]! + SPRINT + GRACE)),
    "only a player with a sheet flips": (p, n, a, m) => a.t !== "flip" || p === n || (p.sheets.some((x) => x.u === m.user) && n.revealAt === m.time),
    "flipped answers never change": (p, n, a) => p.revealAt === 0 || a.t === "again" || JSON.stringify(p.sheets) === JSON.stringify(n.sheets),
    "a new round needs a new letter": (p, n, a) => a.t !== "again" || p === n || (n.letter !== p.letter && n.sheets.length === 0 && n.round === p.round + 1 && p.revealAt !== 0),
    "nothing goes in after the flip": (p, n, a) => p.revealAt === 0 || a.t === "again" || p === n,
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    if (s.revealAt) return r.next() < 0.5 ? { t: "again" } : { t: "flip" };
    if (!s.started[u]) return r.next() < 0.85 ? { t: "start" } : { t: "flip" };
    if (!s.sheets.some((x) => x.u === u)) return { t: "submit", words: Array.from({ length: N }, () => r.pick([`${s.letter}ango`, "mid", "taco", `${s.letter}x`, ""])) };
    return r.next() < 0.7 ? { t: "flip" } : { t: "start" };
  },

  local: { words: ["", "", "", "", ""] },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const now = clock.value;
    const myStart = state.started[me] ?? 0;
    const mine = state.sheets.find((x) => x.u === me);
    const sprinting = !!myStart && !mine && !state.revealAt;
    const left = sprinting ? Math.max(0, myStart + SPRINT - now) : SPRINT;
    const late = sprinting && left === 0;
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const lp = running(myStart, 700);
    const dropY = lp === null ? 0 : -60 * (1 - drop(lp));

    const tile = (size: number) => (
      <div
        aria-label={`Letter ${state.letter}`}
        style={{ flex: "none", width: size, height: size, borderRadius: size / 6, background: mix(pl.yellow, c.card, 0.25), boxShadow: `0 4px 0 ${mix(pl.yellow, c.text, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.62, lineHeight: 1, fontWeight: 800, color: theme.mode === "dark" ? c.card : mix(pl.brown, c.text, 0.4), transform: `translateY(${dropY}px) rotate(-4deg)` }}
      >
        {state.letter}
      </div>
    );

    const sand = (w: number, h: number) => {
      const k = myStart ? Math.min(1, (SPRINT - left) / SPRINT) : 0;
      const topH = (h / 2 - 4) * (1 - k);
      const botH = (h / 2 - 4) * k;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${Math.ceil(left / 1000)} seconds of sand left`}>
          <rect x="0" y="0" width={w} height="4" rx="2" fill={pl.brown} />
          <rect x="0" y={h - 4} width={w} height="4" rx="2" fill={pl.brown} />
          <path d={`M3 4 L${w - 3} 4 L${w / 2 + 2} ${h / 2} L${w - 3} ${h - 4} L3 ${h - 4} L${w / 2 - 2} ${h / 2} Z`} fill={mix(pl.sky, c.card, 0.4)} stroke={mix(pl.brown, c.card, 0.3)} stroke-width="1.5" />
          {topH > 0.5 ? <path d={`M${w / 2 - ((w / 2 - 4) * topH) / (h / 2 - 4)} ${h / 2 - topH} L${w / 2 + ((w / 2 - 4) * topH) / (h / 2 - 4)} ${h / 2 - topH} L${w / 2} ${h / 2} Z`} fill={pl.orange} /> : null}
          {botH > 0.5 ? <path d={`M5 ${h - 4} L${w - 5} ${h - 4} L${w / 2} ${h - 4 - botH * 1.4} Z`} fill={pl.orange} /> : null}
          {sprinting && !late ? <rect x={w / 2 - 0.75} y={h / 2} width="1.5" height={h / 2 - 4 - botH} fill={pl.orange} /> : null}
        </svg>
      );
    };

    // Face-down cards fanned on the table, one per sheet handed in.
    const table = () => (
      <div style={{ position: "relative", flex: 1, height: 150 }}>
        {state.sheets.length === 0 ? (
          <div style={{ position: "absolute", left: 20, right: 20, top: 30, height: 90, border: `1.5px dashed ${c.secondaryText}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText, textAlign: "center", padding: 8 }}>
            Sheets land here face down
          </div>
        ) : null}
        {state.sheets.map((sh, i) => {
          const n = state.sheets.length;
          const ang = (i - (n - 1) / 2) * 9;
          const e = running(sh.at, 400);
          const q = e === null ? 1 : drop(e / 400 > 1 ? 400 : e);
          return (
            <div key={sh.u} style={{ position: "absolute", left: `calc(50% - 34px + ${(i - (n - 1) / 2) * 26}px)`, top: 26 + Math.abs(i - (n - 1) / 2) * 5 - 40 * (1 - q), width: 68, height: 92, borderRadius: 8, background: sh.u === me ? c.primary : mix(pl.purple, c.card, 0.15), border: `3px solid ${c.card}`, transform: `rotate(${ang}deg)`, boxShadow: `0 1px 3px ${mix(c.text, c.card, 0.7)}`, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "0 0 6px 5px", boxSizing: "border-box" }}>
              <div style={{ position: "absolute", inset: 8, borderRadius: 4, border: `1.5px solid ${mix(c.card, pl.purple, 0.4)}` }} />
              <Avatar user={sh.u} size={22} />
            </div>
          );
        })}
      </div>
    );

    if (state.revealAt) {
      const people = state.sheets.slice(0, 6);
      const ranked = [...people].sort((a, b) => score(state, b) - score(state, a));
      const top = ranked[0];
      return (
        <div>
          <CardHeader title={`${state.title} · ${state.letter}`} subtitle={top ? `${nameOf(top.u)} ${top.u === me ? "win" : "wins"} with ${score(state, top)} · clashes score nothing` : "Flipped"} />
          <div aria-label="Answers by category" style={{ display: "grid", gridTemplateColumns: `68px repeat(${people.length}, minmax(0, 1fr))`, gap: 3, alignItems: "center" }}>
            <div />
            {people.map((sh) => (
              <div key={sh.u} style={{ display: "flex", justifyContent: "center" }}>
                <Avatar user={sh.u} size={24} />
              </div>
            ))}
            {state.cats.map((cat, i) => [
              <div key={`c${i}`} style={{ fontSize: 11, lineHeight: "13px", color: c.secondaryText, maxHeight: 26, overflow: "hidden" }}>{cat}</div>,
              ...people.map((sh, j) => {
                const w = sh.words[i] ?? "";
                const kind = cell(state, i, w);
                const e = running(state.revealAt, 2400);
                const t0 = (i * people.length + j) * 50;
                const k = e === null ? 1 : flipT(Math.max(0, Math.min(260, e - t0)));
                const shake = e !== null && kind === "clash" && e > t0 + 260 && e < t0 + 760 ? Math.sin(e / 18) * 2 : 0;
                return (
                  <div
                    key={`${i}-${sh.u}`}
                    title={w}
                    style={{ height: 32, borderRadius: 6, padding: "0 2px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, lineHeight: "13px", textAlign: "center", overflow: "hidden", transform: `scaleX(${k}) translateX(${shake}px)`, background: kind === "ok" ? mix(c.positive, c.card, 0.82) : kind === "clash" ? mix(c.negative, c.card, 0.85) : c.wash, color: kind === "miss" ? c.secondaryText : c.text, textDecoration: kind === "ok" ? "none" : "line-through", fontWeight: kind === "ok" ? 600 : 400 }}
                  >
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", maxHeight: 26, overflowWrap: "anywhere" }}>{w || "–"}</span>
                  </div>
                );
              }),
            ])}
            <div style={{ fontSize: 12, fontWeight: 600, color: c.text }}>Points</div>
            {people.map((sh) => (
              <div key={`s${sh.u}`} style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: sh === top ? c.positive : c.text }}>{score(state, sh)}</div>
            ))}
          </div>
          <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
              {(() => {
                const clashes = state.cats.reduce((n, _c, i) => n + new Set(state.sheets.filter((sh) => cell(state, i, sh.words[i] ?? "") === "clash").map((sh) => norm(sh.words[i] ?? ""))).size, 0);
                return clashes ? `${clashes} ${clashes === 1 ? "clash" : "clashes"} cancelled out` : "No clashes this time";
              })()}
            </span>
            <Button kind="primary" onClick={() => dispatch({ t: "again" })}>
              New letter
            </Button>
          </div>
        </div>
      );
    }

    if (sprinting) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`Everything starts with ${state.letter} · matches cancel out`} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, height: 64 }}>
            {tile(52)}
            {sand(30, 52)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, lineHeight: "24px", fontWeight: 700, color: late ? c.negative : c.text }}>{late ? "Time" : `${Math.ceil(left / 1000)} s`}</div>
              <div style={{ fontSize: 13, color: c.secondaryText, ...ell }}>{late ? "Hand in what you have" : `${state.sheets.length} already face down`}</div>
            </div>
            <Facepile users={state.sheets.map((x) => x.u)} max={4} size={22} />
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {state.cats.map((cat, i) => {
              const w = local.words[i] ?? "";
              const ok = !w || valid(state, w);
              return (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 44 }}>
                  <span style={{ width: 112, flex: "none", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", maxHeight: 32 }}>{cat}</span>
                  <input
                    aria-label={cat}
                    value={w}
                    disabled={late}
                    maxLength={24}
                    placeholder={`${state.letter}…`}
                    style={{ flex: 1, minWidth: 0, height: 40, boxSizing: "border-box", boxShadow: ok ? "none" : `inset 0 0 0 1.5px ${c.negative}` }}
                    onInput={(e: Event) => setLocal({ words: local.words.map((x, j) => (j === i ? (e.currentTarget as HTMLInputElement).value : x)) })}
                  />
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{`${local.words.filter((w) => w && valid(state, w)).length} of 5 start with ${state.letter}`}</span>
            <Button
              kind="primary"
              onClick={() => {
                haptic("success");
                dispatch({ t: "submit", words: local.words });
              }}
            >
              Hand it in
            </Button>
          </div>
        </div>
      );
    }

    const waiting = members.filter((m) => !state.sheets.some((x) => x.u === m.id)).map((m) => m.id);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`Round ${state.round} · 60 seconds each · matches cancel out`} />
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              {tile(76)}
              {sand(26, 56)}
            </div>
          </div>
          {table()}
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {state.cats.map((cat, i) => (
            <span key={i} style={{ padding: "3px 10px", borderRadius: 99, background: i % 2 ? c.wash : mix(pl.yellow, c.card, 0.8), color: c.text, fontSize: 13, lineHeight: "18px", maxWidth: "100%", ...ell }}>
              {cat}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
            {mine ? `Yours is in · ${waiting.length ? `waiting on ${waiting.length}` : "everyone's in"}` : state.sheets.length ? `${state.sheets.length} face down · your turn` : "Nobody has gone yet"}
          </span>
          {mine ? (
            <Button kind="primary" disabled={state.sheets.length < 2} onClick={() => dispatch({ t: "flip" })}>
              Flip them
            </Button>
          ) : (
            <Button
              kind="primary"
              onClick={() => {
                haptic("medium");
                setLocal({ words: ["", "", "", "", ""] });
                dispatch({ t: "start" });
              }}
            >
              Start my 60 s
            </Button>
          )}
        </div>
      </div>
    );
  },
});
