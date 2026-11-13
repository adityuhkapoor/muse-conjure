import { defineApp, Avatar, Burst, Button, CardHeader, fitText, haptic, mix, pal, running, seedOf, spring, springs, tween, userColor } from "@muse/app";
import type { Ctx, Theme } from "@muse/app";

// Good things jar: a jar between two friends through a rough week. Each day each of you drops in
// one marble with a few words; the marbles stack up in day bands, yours and theirs side by side.
// Tap any marble to read it. On the last day the jar tips over and pours out your week as a list.

type Params = {
  /** Card title: "Good things jar" */
  title: string;
  /** The two of you, left first: ["Will", "Tsai Lin"] */
  people: string[];
  /** What started it, in their words */
  quote: string;
  /** Who said it */
  quoteBy: string;
  /** Day labels, 2 to 7: ["Mon", "Tue", ...] */
  days: string[];
  /** Marbles already in: who, which day (index into days), and the words */
  marbles: { who: string; day: number; text: string }[];
  /** Placeholder in the box: "One good thing today" */
  prompt: string;
};

// @params
const P: Params = {
  title: "Good things jar",
  people: ["Will", "Tsai Lin"],
  quote: "this week is cooked",
  quoteBy: "Will",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  marbles: [
    { who: "Will", day: 0, text: "got the last chai at Kettle" },
    { who: "Tsai Lin", day: 0, text: "orgo curve went up" },
    { who: "Will", day: 1, text: "slept 8 hours somehow" },
    { who: "Tsai Lin", day: 1, text: "found my good pen" },
    { who: "Will", day: 2, text: "Arun's rice cooker made mac and cheese" },
    { who: "Tsai Lin", day: 2, text: "vetoed Will's aux. he took it well" },
    { who: "Will", day: 3, text: "dog on the Quad in a hoodie" },
  ],
  prompt: "One good thing today",
};
// @end params

type Marble = { u: string; day: number; text: string; at: number };
type State = {
  title: string;
  a: string;
  b: string;
  names: [string, string];
  quote: string;
  quoteBy: string;
  days: string[];
  marbles: Marble[];
  prompt: string;
  pourAt: number;
};
type Action = { t: "drop"; text: string } | { t: "pour" } | { t: "refill" };
type Local = { draft: string; pick: number; bursts: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const DROP = spring(springs.iosBouncy);
const TIP = tween({ duration: 1000, easing: "easeInOut" });
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const pair = (s: State) => [s.a, s.b].filter(Boolean);
const has = (s: State, u: string, d: number) => s.marbles.some((m) => m.u === u && m.day === d);
/** The first day not everyone has filled; days.length when the week is full. */
const today = (s: State) => {
  const ps = pair(s);
  for (let d = 0; d < s.days.length; d++) if (!ps.length || ps.some((u) => !has(s, u, d))) return d;
  return s.days.length;
};

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const ppl = Array.isArray(P.people) ? P.people : [];
  const ma = find(ppl[0]);
  const a = ma?.id ?? ctx.members[0]?.id ?? "";
  const mb = find(ppl[1]);
  const b = mb && mb.id !== a ? mb.id : ctx.members.find((m) => m.id !== a)?.id ?? "";
  let days = (Array.isArray(P.days) ? P.days : []).map((d) => clean(d, 5)).filter(Boolean).slice(0, 7);
  if (days.length < 2) days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const nm = (id: string, fb: unknown) => ctx.members.find((m) => m.id === id)?.name ?? (clean(fb, 20) || "Friend");
  const s: State = { title: clean(P.title, 40) || "Good things jar", a, b, names: [nm(a, ppl[0]), nm(b, ppl[1])], quote: clean(P.quote, 80), quoteBy: clean(P.quoteBy, 20), days, marbles: [], prompt: clean(P.prompt, 40) || "One good thing today", pourAt: 0 };
  // seed marbles in day order, only where the day is open for that person
  const seeds = (Array.isArray(P.marbles) ? P.marbles : []).slice().sort((x, y) => (x?.day ?? 0) - (y?.day ?? 0));
  for (const m of seeds) {
    const u = find(m?.who)?.id ?? "";
    const text = clean(m?.text, 60);
    if (!u || !pair(s).includes(u) || !text || m.day !== today(s) || has(s, u, m.day)) continue;
    s.marbles.push({ u, day: m.day, text, at: 0 });
  }
  return s;
}

/** Marble centre inside the jar for a day band and side. */
const spot = (day: number, side: number, jx: number, jw: number, bottom: number, band: number, seed: string) => {
  const j = (seedOf(seed) % 9) - 4;
  return { x: jx + jw / 2 + (side === 0 ? -1 : 1) * (jw * 0.18 + j * 0.8) + (day % 2 ? 7 : -7), y: bottom - 18 - day * band + (j % 3) };
};

function Jar({ x, w, top, bottom, theme, front }: { x: number; w: number; top: number; bottom: number; theme: Theme; front: boolean }) {
  const c = theme.color;
  const p = pal(theme);
  const glass = mix(p.sky, c.wash, 0.55);
  const d = `M ${x + 14} ${top - 4} h ${w - 28} v 8 q 14 4 14 20 V ${bottom - 16} q 0 16 -16 16 H ${x + 16} q -16 0 -16 -16 V ${top + 24} q 0 -16 14 -20 Z`;
  return front ? (
    <g>
      <path d={d} fill="none" stroke={mix(c.secondaryText, glass, 0.3)} stroke-width={2} />
      <rect x={x + 12} y={top + 30} width={6} height={bottom - top - 60} rx={3} fill={p.paper} opacity={0.5} />
      <rect x={x + 10} y={top - 18} width={w - 20} height={14} rx={4} fill={mix(p.crust, p.brown, 0.3)} />
    </g>
  ) : (
    <path d={d} fill={glass} />
  );
}

export default defineApp<State, Action, Local>({
  name: "Good things jar",
  summary: (s) => (s.pourAt > 0 ? `${s.names[0]} and ${s.names[1]}'s week: ${s.marbles.length} good things` : `${s.title}: ${s.marbles.length} good things so far · ${s.days[Math.min(today(s), s.days.length - 1)]}`),
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !pair(s).includes(u)) return s;
    if (a.t === "drop") {
      const text = clean(a.text, 60);
      const d = today(s);
      if (!text || s.pourAt > 0 || d >= s.days.length || has(s, u, d)) return s;
      return { ...s, marbles: [...s.marbles, { u, day: d, text, at: meta.time }] };
    }
    if (a.t === "pour") {
      if (s.pourAt > 0 || today(s) < s.days.length) return s;
      return { ...s, pourAt: Math.max(1, meta.time) };
    }
    if (a.t === "refill") {
      if (s.pourAt === 0) return s;
      return { ...s, pourAt: 0 };
    }
    return s;
  },

  invariants: {
    "one marble per person per day": (s) => new Set(s.marbles.map((m) => `${m.u}|${m.day}`)).size === s.marbles.length,
    "marbles belong to the two of you": (s) => s.marbles.every((m) => (m.u === s.a || m.u === s.b) && m.u !== "" && m.text.length > 0 && m.text.length <= 60),
    "no running ahead of the other": (s) => s.marbles.every((m) => Number.isInteger(m.day) && m.day >= 0 && m.day <= today(s) && m.day < s.days.length),
    "it pours only when the week is full": (s) => s.pourAt === 0 || today(s) === s.days.length,
  },

  transitions: {
    "only the two act": (p, n, _a, m, ctx) => p === n || (pair(p).includes(m.user) && inChat(ctx, m.user)),
    "a drop adds your marble to today": (p, n, a, m) => a.t !== "drop" || p === n || (n.marbles.length === p.marbles.length + 1 && n.marbles.at(-1)!.u === m.user && n.marbles.at(-1)!.day === today(p) && n.marbles.at(-1)!.at === m.time),
    "marbles never come out": (p, n) => n.marbles.length >= p.marbles.length && p.marbles.every((x, i) => n.marbles[i]?.text === x.text && n.marbles[i]?.u === x.u),
    "pouring is stamped now": (p, n, a, m) => a.t !== "pour" || p === n || n.pourAt === Math.max(1, m.time),
    "a poured jar takes no marbles": (p, n) => p.pourAt === 0 || n.marbles.length === p.marbles.length,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.75) return { t: "drop", text: r.pick(["sun came out", "free bagels", "aced the quiz", "", "   ", "a".repeat(80)]) };
    if (k < 0.9) return { t: "pour" };
    return { t: "refill" };
  },

  local: { draft: "", pick: -1, bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const ids = [state.a, state.b];
    const mine = pair(state).includes(me);
    const d = today(state);
    const full = d >= state.days.length;
    const poured = state.pourAt > 0;
    const jw = Math.min(180, Math.round(W * 0.46));
    const jx = 30;
    const top = 30;
    const bottom = H - 10;
    const band = Math.min(30, (bottom - top - 26) / state.days.length);
    const pickIdx = local.pick >= 0 && local.pick < state.marbles.length ? local.pick : state.marbles.length - 1;
    const picked = pickIdx >= 0 ? state.marbles[pickIdx]! : null;
    const nameOf = (u: string) => (u === me ? "You" : state.names[ids.indexOf(u)] ?? "");
    const tipE = poured ? running(state.pourAt, 1000) : null;
    const tip = poured ? (tipE === null ? 1 : TIP(tipE)) : 0;
    const waitingOn = !full ? ids.filter((u) => u && !has(state, u, d)) : [];
    const canDrop = mine && !poured && !full && !has(state, me, d);

    const marbles = state.marbles.map((m, i) => {
      const side = ids.indexOf(m.u);
      const s = spot(m.day, side, jx, jw, bottom, band, `${m.text}${i}`);
      const e = m.at > 0 ? running(m.at, 900) : null;
      const y = e === null ? s.y : top - 20 + (s.y - top + 20) * DROP(e);
      const col = userColor(m.u, theme);
      const on = i === pickIdx;
      return (
        <g key={i} transform={`translate(${s.x.toFixed(1)} ${y.toFixed(1)})`}>
          <circle r={14} fill={col} stroke={on ? c.text : mix(col, c.text, 0.3)} stroke-width={on ? 2.5 : 1} />
          <ellipse cx={-4.5} cy={-5} rx={4.5} ry={3} fill={p.paper} opacity={0.55} />
        </g>
      );
    });

    const pouredList = (
      <div style={{ position: "absolute", left: 104, right: 0, top: 4, bottom: 4, overflow: "hidden" }}>
        <div style={{ fontSize: 13, lineHeight: "18px", fontWeight: 700, color: c.text }}>Your week</div>
        {state.days.map((day, di) => (
          <div key={di} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 3, transform: `translateX(${((1 - Math.min(1, Math.max(0, tip * 1.6 - di * 0.12))) * 40).toFixed(1)}px)` }}>
            <span style={{ flex: "none", width: 28, fontSize: 11, lineHeight: "15px", fontWeight: 700, color: c.text }}>{day}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {ids.map((u) => {
                const m = state.marbles.find((x) => x.u === u && x.day === di);
                return m ? (
                  <div key={u} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, lineHeight: "15px", color: c.text }}>
                    <span style={{ flex: "none", width: 8, height: 8, borderRadius: 4, background: userColor(u, theme) }} />
                    <span style={{ minWidth: 0, ...ell }}>{m.text}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>
    );

    const noteCard = picked ? (
      <div style={{ position: "absolute", left: jx + jw + 14, right: 0, top: 26, padding: "8px 10px", borderRadius: 12, background: c.card, boxShadow: `0 0 0 1.5px ${userColor(picked.u, theme)}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Avatar user={picked.u} size={20} />
          <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, color: c.secondaryText, ...ell }}>{`${nameOf(picked.u)} · ${state.days[picked.day]}`}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 14, lineHeight: "18px", color: c.text, maxHeight: 54, overflow: "hidden", overflowWrap: "anywhere" }}>{fitText(picked.text, (W - jx - jw - 34) * 2.4, { size: 14, min: 12 }).text}</div>
      </div>
    ) : (
      <div style={{ position: "absolute", left: jx + jw + 14, right: 0, top: 30, fontSize: 14, lineHeight: "19px", color: c.secondaryText }}>Empty for now. One good thing each, every day.</div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.quoteBy ? `${state.quoteBy}: ` : ""}"${state.quote}"` : `${state.names[0]} and ${state.names[1]}`} />
        <div style={{ position: "relative", height: H, borderRadius: 14, background: c.wash, overflow: "hidden" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A jar with ${state.marbles.length} marbles, ${Math.min(d, state.days.length)} of ${state.days.length} days full`} style={{ display: "block" }}>
            <rect x={0} y={H - 12} width={W} height={12} fill={mix(p.brown, c.wash, 0.55)} />
            <g transform={`rotate(${(-tip * 100).toFixed(1)} ${jx + 6} ${bottom}) translate(${(-tip * 6).toFixed(1)} 0)`}>
              <Jar x={jx} w={jw} top={top} bottom={bottom} theme={theme} front={false} />
              {poured ? null : <g>{marbles}</g>}
              <Jar x={jx} w={jw} top={top} bottom={bottom} theme={theme} front />
            </g>
            {poured
              ? state.marbles.map((m, i) => {
                  const k = Math.min(1, Math.max(0, tip * 1.4 - (i / Math.max(1, state.marbles.length)) * 0.4));
                  return <circle key={i} cx={(jx + 30 + (i % 4) * 18 * k + 10).toFixed(1)} cy={(bottom - 10 - Math.floor(i / 4) * 17 * k).toFixed(1)} r={8} fill={userColor(m.u, theme)} />;
                })
              : null}
          </svg>
          {(poured ? [] : state.days)
            .map((day, di) => (
                <div key={`${di}-${di === d}`} style={{ position: "absolute", left: 0, top: bottom - 18 - di * band - 8, width: 26, textAlign: "right", fontSize: 11, lineHeight: "16px", fontWeight: di === d ? 700 : 400, color: di === d ? mix(c.primary, c.text, 0.3) : c.text, pointerEvents: "none" }}>
                  {day}
                </div>
              ))
}
          {(poured ? [] : state.marbles).map((m, i) => {
                const s = spot(m.day, ids.indexOf(m.u), jx, jw, bottom, band, `${m.text}${i}`);
                return (
                  <button key={i} type="button" aria-label={`${nameOf(m.u)}, ${state.days[m.day]}: ${m.text}`} onClick={() => setLocal({ pick: i })} style={{ position: "absolute", left: s.x - 18, top: s.y - 18, width: 36, height: 36, padding: 0, border: 0, background: "transparent", borderRadius: 18, cursor: "pointer" }} class="m-hit" />
                );
              })}
          {poured ? pouredList : noteCard}
          {!poured ? (
            <div style={{ position: "absolute", left: jx + jw + 14, right: 0, bottom: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {ids.map((u) =>
                u ? (
                  <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, lineHeight: "16px", color: c.text }}>
                    <span style={{ flex: "none", width: 12, height: 12, borderRadius: 6, background: userColor(u, theme) }} />
                    <span style={{ minWidth: 0, ...ell }}>{`${nameOf(u)} · ${state.marbles.filter((m) => m.u === u).length}`}</span>
                  </div>
                ) : null,
              )}
              {state.marbles.length > 1 ? <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>Tap a marble to read it</div> : null}
            </div>
          ) : null}
          {local.bursts > 0 && poured ? <Burst key={local.bursts} emoji="✨" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {poured ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{`${state.marbles.length} good things, one week`}</span>
              {mine ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "refill" })}>
                  Back in the jar
                </Button>
              ) : null}
            </>
          ) : full ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>The jar's full</span>
              {mine ? (
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    setLocal({ bursts: local.bursts + 1 });
                    dispatch({ t: "pour" });
                  }}
                >
                  Pour it out
                </Button>
              ) : null}
            </>
          ) : canDrop ? (
            <form
              style={{ flex: 1, display: "flex", gap: 8, minWidth: 0 }}
              onSubmit={(e: Event) => {
                e.preventDefault();
                const text = local.draft.trim();
                if (!text) return;
                haptic("light");
                dispatch({ t: "drop", text });
                setLocal({ draft: "", pick: -1 });
              }}
            >
              <input aria-label={`Your good thing for ${state.days[d]}`} placeholder={state.prompt} value={local.draft} maxLength={60} onInput={(e: Event) => setLocal({ draft: (e.currentTarget as HTMLInputElement).value })} style={{ flex: 1, minWidth: 0 }} />
              <Button kind="primary" disabled={!local.draft.trim()} onClick={() => {
                const text = local.draft.trim();
                if (!text) return;
                haptic("light");
                dispatch({ t: "drop", text });
                setLocal({ draft: "", pick: -1 });
              }}>
                Drop it
              </Button>
            </form>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>
              {mine ? `Yours is in for ${state.days[d]} · waiting on ${waitingOn.map(nameOf).join(" and ")}` : `${state.names[0]} and ${state.names[1]}'s jar · ${state.days[d]}`}
            </span>
          )}
        </div>
      </div>
    );
  },
});
