import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  fitText,
  rng,
  running,
  textWidth,
  tween,
  type Ctx,
  type DrawFrame,
} from "@muse/app";

// "idk u pick" slot machine: three reels (where, drinks, leave at) rigged by what the chat vetoed.
// The reels stop one by one, the plan lands, and the group locks it and taps in.

type Params = {
  /** Card title: "Tonight's plan" */
  title: string;
  /** One line under the title: "“idk u pick” ×4 · rigged by the chat" */
  why: string;
  /** 1 to 3 reels ("Where", "Drinks", "Leave at"), each 2 to 8 options. vetoed: ruled out in the chat. */
  reels: { name: string; options: { label: string; vetoed: boolean }[] }[];
  /** The chat's vetoes as short chips: { text: "frat row", who: "Jess" } */
  rules: { text: string; who: string }[];
  /** The payline index per reel before the first spin. */
  rest: number[];
};

// @params
const P: Params = {
  title: "Tonight's plan",
  why: "“idk u pick” ×4 · rigged by the chat",
  reels: [
    { name: "Where", options: [ { label: "Lucky's", vetoed: false }, { label: "Frat Row", vetoed: true }, { label: "The Tap", vetoed: false },
      { label: "Pita Pit", vetoed: false }, { label: "Murphy's", vetoed: false }, { label: "Rooftop", vetoed: false } ] },
    { name: "Drinks", options: [ { label: "$3 drafts", vetoed: false }, { label: "$12 cocktails", vetoed: true }, { label: "$5 wells", vetoed: false },
      { label: "BYOB", vetoed: false }, { label: "$2 PBR", vetoed: false } ] },
    { name: "Leave at", options: [ { label: "10:15", vetoed: false }, { label: "9:45", vetoed: false }, { label: "1:30am", vetoed: true },
      { label: "10:30", vetoed: false }, { label: "11:00", vetoed: false } ] },
  ],
  rules: [ { text: "frat row", who: "Jess" }, { text: "$12+", who: "Maya's broke" }, { text: "past 11", who: "Sam 8am lab" } ],
  rest: [2, 3, 1],
};
// @end params

type Opt = { label: string; vetoed: boolean };
type Reel = { name: string; options: Opt[] };
type State = {
  title: string;
  why: string;
  reels: Reel[];
  rules: { text: string; who: string }[];
  rest: number[];
  prev: number[];
  result: number[] | null;
  spins: number;
  spunAt: number;
  /** Who spun last ("" before the first spin). */
  by: string;
  lockedAt: number;
  going: string[];
};
type Action = { t: "spin" } | { t: "lock" } | { t: "going" };
type Local = { burst: number };

const MAX_REELS = 3;
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;
const MAX_RULES = 4;
const ROW = 42;
const SPIN_MS = 2600;
const STOPS = [1300, 1900, 2500];
const settles = STOPS.map((duration) => tween({ duration, easing: "decelerate" }));

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const allowed = (reel: Reel) => reel.options.map((o, i) => (o.vetoed ? -1 : i)).filter((i) => i >= 0);
const shown = (s: State) => s.result ?? s.rest;
const pickWith = (s: State, seed: number) => {
  const r = rng(seed);
  return s.reels.map((reel) => r.pick(allowed(reel)));
};
const labelAt = (s: State, i: number) => s.reels[i]?.options[shown(s)[i] ?? 0]?.label ?? "";
const resultLine = (s: State) =>
  s.reels
    .map((reel, i) => {
      const label = labelAt(s, i);
      return i === 2 && reel.name.trim().toLowerCase().startsWith("leave") ? `leave ${label}` : label;
    })
    .filter(Boolean)
    .join(" · ");

function initState(): State {
  const reels: Reel[] = [];
  for (const raw of P.reels.slice(0, MAX_REELS)) {
    const name = clean(raw.name, 24);
    const options: Opt[] = [];
    for (const o of raw.options) {
      if (options.length >= MAX_OPTIONS) break;
      const label = clean(o.label, 40);
      if (!label) continue;
      options.push({ label, vetoed: !!o.vetoed });
    }
    if (options.length < MIN_OPTIONS) continue;
    if (options.every((o) => o.vetoed)) for (const o of options) o.vetoed = false;
    reels.push({ name, options });
  }
  const picked: Reel[] = reels.length ? reels : [{ name: "Where", options: [{ label: "Pizza", vetoed: false }, { label: "Tacos", vetoed: false }, { label: "Ramen", vetoed: false }] }];
  const rest: number[] = picked.map((reel, i) => {
    const v = P.rest[i] ?? -1;
    return Number.isInteger(v) && v >= 0 && v < reel.options.length ? v : Math.max(0, allowed(reel)[0] ?? 0);
  });
  return {
    title: clean(P.title, 60) || "Tonight's plan",
    why: clean(P.why, 80),
    reels: picked,
    rules: P.rules
      .slice(0, MAX_RULES)
      .map((r) => ({ text: clean(r.text, 32), who: clean(r.who, 20) }))
      .filter((r) => r.text),
    rest,
    prev: rest,
    result: null,
    spins: 0,
    spunAt: 0,
    by: "",
    lockedAt: 0,
    going: [],
  };
}

function drawReels(g: CanvasRenderingContext2D, f: DrawFrame, s: State, waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const n = s.reels.length;
  const gap = 6;
  const rw = (f.width - 2 * gap) / n;
  const spinning = s.spunAt > 0 && f.now - s.spunAt < SPIN_MS;
  const shownNow = shown(s);

  for (let i = 0; i < n; i++) {
    const reel = s.reels[i]!;
    const x = i * (rw + gap);
    const cx = x + rw / 2;

    g.globalAlpha = 1;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const name = fitText(reel.name, rw - 8, { g, size: 13, weight: 600, min: 10, family: t.type.family });
    g.font = name.font;
    g.fillStyle = c.secondaryText;
    g.fillText(name.text, x + 4, 13);

    g.beginPath();
    g.roundRect(x, 20, rw, 136, 12);
    g.fillStyle = c.input;
    g.fill();

    g.beginPath();
    g.roundRect(x + 4, 68, rw - 8, 40, 8);
    g.fillStyle = c.card;
    g.fill();

    g.save();
    g.beginPath();
    g.rect(x + 2, 22, rw - 4, 132);
    g.clip();

    const from = s.prev[i] ?? 0;
    const len = reel.options.length;
    let pos: number;
    if (waiting) {
      pos = from + f.now / 70;
    } else if (spinning) {
      const base = Math.ceil(from / len) * len;
      const to = base + len * (3 + i) + (s.result?.[i] ?? from);
      const duration = STOPS[i] ?? STOPS[STOPS.length - 1]!;
      const e = f.now - s.spunAt;
      pos = from + (to - from) * settles[i]!(Math.min(e, duration));
      const after = e - duration;
      if (after > 0 && after < 1000) {
        const sec = after / 1000;
        pos += 0.12 * Math.exp(-7 * sec) * Math.sin(30 * sec);
      }
    } else {
      pos = shownNow[i] ?? 0;
    }

    const base = Math.floor(pos);
    for (let k = -2; k <= 3; k++) {
      const j = base + k;
      const y = 88 - (j - pos) * ROW;
      const d = Math.abs(y - 88) / ROW;
      const option = reel.options[((j % len) + len) % len]!;
      const fit = fitText(option.label, rw - 14, {
        g,
        size: d < 0.5 ? 17 : 15,
        weight: d < 0.5 ? 600 : 400,
        min: 11,
        family: t.type.family,
      });
      g.globalAlpha = Math.max(0.12, 1 - d * 0.5);
      g.font = fit.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = d < 0.5 && !option.vetoed ? c.text : c.secondaryText;
      g.fillText(fit.text, cx, y);
      if (option.vetoed) {
        const w = g.measureText(fit.text).width;
        g.strokeStyle = c.negative;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx - w / 2 - 2, y);
        g.lineTo(cx + w / 2 + 2, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.restore();
    g.globalAlpha = 1;
  }

  return waiting || spinning;
}

export default defineApp<State, Action, Local>({
  name: "Plan slot machine",
  summary: (s, ctx) => {
    const line = resultLine(s);
    if (s.result === null) return `${s.title}: not spun yet`;
    // "Where to eat Noa spun: Sushi Ko." The shell drops the title and reads it as an activity line.
    if (s.lockedAt === 0) return `${s.title} ${ctx.members.find((m) => m.id === s.by)?.name ?? "Someone"} spun: ${line}. Not locked yet.`;
    return `Locked: ${line} · ${s.going.length} going`;
  },

  init: () => initState(),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "spin") {
      if (state.lockedAt > 0) return state;
      return { ...state, prev: shown(state), result: pickWith(state, meta.seed), spins: state.spins + 1, spunAt: meta.time, by: meta.user };
    }
    if (action.t === "lock") {
      if (state.result === null || state.lockedAt > 0) return state;
      return { ...state, lockedAt: meta.time, going: [meta.user] };
    }
    if (action.t === "going") {
      if (state.lockedAt === 0) return state;
      const going = state.going.includes(meta.user) ? state.going.filter((u) => u !== meta.user) : [...state.going, meta.user];
      return { ...state, going };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.going.every((u) => inChat(ctx, u))) return state;
    return { ...state, going: state.going.filter((u) => inChat(ctx, u)) };
  },

  invariants: {
    "the payline never shows a vetoed option": (s) =>
      s.result === null ||
      (s.result.length === s.reels.length &&
        s.result.every((k, i) => {
          const o = s.reels[i]?.options[k];
          return !!o && !o.vetoed;
        })),
    "indices fit their reels": (s) => {
      const fits = (xs: number[] | null) =>
        xs === null ||
        (xs.length === s.reels.length &&
          xs.every((k, i) => Number.isInteger(k) && k >= 0 && k < (s.reels[i]?.options.length ?? 0)));
      return fits(s.rest) && fits(s.prev) && fits(s.result);
    },
    "a result exists exactly after a spin": (s) => (s.spins === 0) === (s.result === null) && (s.spins === 0) === (s.spunAt === 0),
    "only a spun plan can lock": (s) => s.lockedAt === 0 || s.result !== null,
    "going only after lock, each once, all in the chat": (s, ctx) =>
      (s.lockedAt > 0 || s.going.length === 0) &&
      new Set(s.going).size === s.going.length &&
      s.going.every((u) => ctx.members.some((m) => m.id === u)),
    "every reel keeps an allowed option": (s) => s.reels.every((r) => allowed(r).length > 0),
  },

  transitions: {
    "a spin counts once, stamps the time and starts from what was shown": (p, n, a, m) =>
      a.t !== "spin" ||
      p === n ||
      (n.spins === p.spins + 1 && n.spunAt === m.time && JSON.stringify(n.prev) === JSON.stringify(shown(p))),
    "the seed decides the spin": (p, n, a, m) => a.t !== "spin" || p === n || JSON.stringify(n.result) === JSON.stringify(pickWith(p, m.seed)),
    "nothing spins once locked": (p, n) => p.lockedAt === 0 || n.spins === p.spins,
    "a lock keeps the result and puts the locker in": (p, n, a, m) =>
      a.t !== "lock" ||
      p === n ||
      (p.lockedAt === 0 &&
        n.lockedAt === m.time &&
        JSON.stringify(n.result) === JSON.stringify(p.result) &&
        n.going.join() === m.user),
    "going toggles only the sender": (p, n, a, m) => {
      if (a.t !== "going" || p === n) return true;
      const before = new Set(p.going);
      const after = new Set(n.going);
      const diff = [...p.going.filter((u) => !after.has(u)), ...n.going.filter((u) => !before.has(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "reels and rules never change": (p, n) => JSON.stringify(p.reels) === JSON.stringify(n.reels) && JSON.stringify(p.rules) === JSON.stringify(n.rules),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.lockedAt > 0) return r.next() < 0.9 ? { t: "going" } : { t: "spin" };
    if (s.result && r.next() < 0.3) return { t: "lock" };
    return { t: "spin" };
  },

  local: { burst: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const waiting = pending && state.spins !== confirmed.spins;
    const e = confirmed.spunAt > 0 ? running(confirmed.spunAt, SPIN_MS) : null;
    const spinning = waiting || e !== null;
    const locked = confirmed.lockedAt > 0;
    const line = resultLine(confirmed);
    const first = labelAt(confirmed, 0);
    const shownNow = shown(confirmed);
    const canvasLabel = `Reels: ${confirmed.reels
      .map((reel, i) => {
        const label = reel.options[shownNow[i] ?? 0]?.label ?? "";
        return i === 2 && reel.name.trim().toLowerCase().startsWith("leave") ? `leave ${label}` : label;
      })
      .filter(Boolean)
      .join(", ")}`;

    const stopped = e === null ? 0 : STOPS.filter((d) => e >= d).length;
    const spinLine = stopped >= 2 || (stopped === 1 && confirmed.reels.length === 1) ? "Almost…" : stopped === 1 ? "1 down. No take-backs." : "Spinning…";
    const vetoes = confirmed.reels.some((r) => r.options.some((o) => o.vetoed));
    const mine = confirmed.going.includes(me);
    const available = theme.width - 2 * theme.space.card;
    const chipText = confirmed.rules.map((r) => textWidth(`${r.text} · ${r.who}`, theme.type.meta, 400));
    const chipExtras = confirmed.rules.length * 31 + Math.max(0, confirmed.rules.length - 1) * 6;
    const chipFont = Math.max(9.7, Math.min(theme.type.meta, Math.floor((theme.type.meta * (available - chipExtras)) / Math.max(1, chipText.reduce((a, x) => a + x, 0)) * 10) / 10));

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.why} />
        <Canvas height={156} label={canvasLabel} draw={(g, f) => drawReels(g, f, confirmed, waiting)} />

        {confirmed.rules.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 2 }}>
            {confirmed.rules.map((r, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 26,
                  maxWidth: "100%",
                  minWidth: 0,
                  padding: "0 10px 0 8px",
                  borderRadius: 13,
                  background: c.input,
                  color: c.text,
                  fontSize: chipFont,
                  lineHeight: "16px",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width={7} height={7} viewBox="0 0 7 7" fill="none" stroke={c.negative} strokeWidth={1.6} strokeLinecap="round" aria-hidden="true" style={{ flex: "none" }}>
                  <path d="M0.8 0.8 6.2 6.2M6.2 0.8 0.8 6.2" />
                </svg>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${r.text} · ${r.who}`}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ height: 30, display: "flex", alignItems: "center" }}>
          {spinning ? (
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText }}>{waiting ? "Spinning…" : spinLine}</span>
          ) : confirmed.result === null ? (
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText }}>{vetoes ? "It can't land on anything you vetoed." : "Tap spin and Muse picks one."}</span>
          ) : (
            <span
              style={{
                width: "100%",
                fontSize: 17,
                lineHeight: "22px",
                fontWeight: 600,
                color: c.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {line}
            </span>
          )}
        </div>

        <div style={{ position: "relative", marginTop: 6 }}>
          {locked && local.burst > 0 ? (
            <div style={{ position: "absolute", left: "50%", right: 0, top: 0, zIndex: 1, pointerEvents: "none" }}>
              <Burst key={local.burst} emoji="👍" />
            </div>
          ) : null}

          {locked ? (
            <>
              <Locked detail={line}>{`Locked · ${confirmed.going.length} going`}</Locked>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, marginTop: 6, minWidth: 0 }}>
                <Facepile users={confirmed.going} max={5} size={24} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    lineHeight: "16px",
                    color: c.secondaryText,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {`${first} it is`}
                </span>
                <Button kind="secondary" onClick={() => dispatch({ t: "going" })}>
                  {mine ? "Leave" : "Join"}
                </Button>
              </div>
              {local.burst > 0 ? <Toast key={local.burst}>It's a plan</Toast> : null}
            </>
          ) : confirmed.result === null || spinning ? (
            <Button kind="primary" wide disabled={spinning} onClick={() => dispatch({ t: "spin" })}>
              {spinning ? "Spinning" : "Spin"}
            </Button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Button kind="secondary" wide onClick={() => dispatch({ t: "spin" })}>
                Spin again
              </Button>
              <Button
                kind="primary"
                wide
                onClick={() => {
                  dispatch({ t: "lock" });
                  setLocal({ burst: local.burst + 1 });
                }}
              >
                Lock it
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  },
});
