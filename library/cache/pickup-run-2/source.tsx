import { defineApp, Avatar, Button, CardHeader, Canvas, rng, running, tween, type ColorName } from "@muse/app";

// Food wheel: anyone spins, the server's seed picks one of the places from the chat.

const CHAT = {
  title: "Where should we eat?",
  options: ["Dumpling House in Chinatown", "Regina's in the North End", "Taco Bell by the airport"],
};

type Option = { id: string; label: string };
type State = { options: Option[]; winner: string | null; spunBy: string | null; lastSpinner: string | null; at: number; spins: number };
type Action = { t: "spin" };
type Local = Record<string, never>;

const SPIN_MS = 4000;
const TAU = Math.PI * 2;
const SLICES: ColorName[] = ["series1", "series3", "series6"];
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const shortName = (label: string) => {
  const m = label.match(/^(.*?)(?: in | by )/);
  return m && m[1] ? m[1] : label;
};
const wrap = (name: string) => {
  const w = name.split(" ");
  if (w.length < 2) return [name];
  const k = Math.ceil(w.length / 2);
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
};

// Largest size from 13 down to 10 that fits, then cut with an ellipsis.
const fitLine = (g: CanvasRenderingContext2D, text: string, maxW: number, family: string) => {
  for (let size = 13; size >= 10; size--) {
    g.font = `600 ${size}px ${family}`;
    if (g.measureText(text).width <= maxW) return { text, font: g.font };
  }
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return { text: t + "…", font: g.font };
};

export default defineApp<State, Action, Local>({
  name: "Food wheel",
  summary: (s) => {
    const w = s.options.find((o) => o.id === s.winner);
    return w ? `${CHAT.title} The wheel picked ${w.label}.` : `${CHAT.title} Not spun yet.`;
  },

  init: () => ({
    options: CHAT.options.map((label, i) => ({ id: `p${i}`, label })),
    winner: null,
    spunBy: null,
    lastSpinner: null,
    at: 0,
    spins: 0,
  }),

  reduce: (state, action, meta, ctx) => {
    if (action.t !== "spin") return state;
    if (!inChat(ctx, meta.user)) return state;
    if (state.options.length === 0) return state;
    if (state.spins > 0 && meta.time - state.at < SPIN_MS) return state;
    const pick = rng(meta.seed).pick(state.options);
    return { ...state, winner: pick.id, spunBy: meta.user, lastSpinner: meta.user, at: meta.time, spins: state.spins + 1 };
  },

  onMembers: (state, ctx) => {
    const want = state.lastSpinner !== null && inChat(ctx, state.lastSpinner) ? state.lastSpinner : null;
    return want === state.spunBy ? state : { ...state, spunBy: want };
  },

  invariants: {
    "the winner is none or one of the places": (s) => s.winner === null || s.options.some((o) => o.id === s.winner),
    "there is a winner exactly when someone has spun": (s) => (s.winner === null) === (s.spins === 0),
    "whoever spun last is still in the chat": (s, ctx) => s.spunBy === null || inChat(ctx, s.spunBy),
    "the spinner shown is the last spinner while they are in the chat, else none": (s, ctx) =>
      s.spunBy === (s.lastSpinner !== null && inChat(ctx, s.lastSpinner) ? s.lastSpinner : null),
    "spins is a whole count, and before any spin there is no spinner and no time": (s) =>
      Number.isInteger(s.spins) && s.spins >= 0 && (s.spins > 0 || (s.at === 0 && s.spunBy === null && s.lastSpinner === null)),
    "three places with unique ids and labels": (s) =>
      s.options.length === 3 && new Set(s.options.map((o) => o.id)).size === 3 && s.options.every((o) => o.label.length > 0),
  },

  transitions: {
    "a spin sets the seed's pick, the spinner, the time and one more spin": (p, n, a, m) =>
      a.t !== "spin" ||
      p === n ||
      (n.winner === rng(m.seed).pick(p.options).id && n.spunBy === m.user && n.lastSpinner === m.user && n.at === m.time && n.spins === p.spins + 1),
    "only a spin changes the wheel": (p, n, a) => p === n || a.t === "spin",
    "a spin leaves the places as they were": (p, n, a) => a.t !== "spin" || p === n || JSON.stringify(p.options) === JSON.stringify(n.options),
    "no spin starts while the wheel is still turning": (p, n, a, m) => a.t !== "spin" || p === n || !(p.spins > 0 && m.time - p.at < SPIN_MS),
    "only people in the chat change the wheel": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the spin count never goes down": (p, n) => n.spins >= p.spins,
  },

  arbitrary: () => ({ t: "spin" }),

  local: {},

  view: ({ confirmed, pending, members, dispatch, theme }) => {
    const c = confirmed;
    const has = c.spins > 0;
    const live = has ? running(c.at, SPIN_MS) : null;
    const spinning = pending || live !== null;
    const winner = has && !spinning ? (c.options.find((o) => o.id === c.winner) ?? null) : null;
    const byName = c.spunBy === null ? "" : (members.find((m) => m.id === c.spunBy)?.name ?? "Someone");
    const n = Math.max(1, c.options.length);
    const idx = Math.max(0, c.options.findIndex((o) => o.id === c.winner));

    const subtitle = spinning
      ? "Spinning"
      : !has
        ? "Not spun yet"
        : `${byName ? `${byName} spun · ` : ""}${c.spins} ${c.spins === 1 ? "spin" : "spins"}`;

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const cx = f.width / 2;
      const cy = f.height / 2 + 8;
      const r = Math.min(cx, cy) - 16;
      const e = has ? f.now - c.at : SPIN_MS;
      const angle = has ? -((idx + 0.5) / n) * TAU - 4 * TAU * (1 - ease(Math.max(0, e))) : 0;
      const a0 = angle - Math.PI / 2;
      const settled = has && !pending && e >= SPIN_MS;

      c.options.forEach((o, i) => {
        const s = a0 + (i / n) * TAU;
        const en = a0 + ((i + 1) / n) * TAU;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s, en);
        g.closePath();
        g.fillStyle = theme.color[SLICES[i % SLICES.length] ?? "series1"];
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = theme.color.card;
        g.stroke();

        g.save();
        g.translate(cx, cy);
        const mid = (s + en) / 2;
        const flip = Math.cos(mid) < 0;
        g.rotate(flip ? mid + Math.PI : mid);
        g.fillStyle = theme.color.onPrimary;
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        const lines = wrap(shortName(o.label));
        lines.forEach((line, k) => {
          const fit = fitLine(g, line, r - 30, theme.type.family);
          g.font = fit.font;
          const dy = lines.length === 1 ? 0 : k === 0 ? -8 : 8;
          g.fillText(fit.text, flip ? -(r - 10) : r - 10, dy);
        });
        g.restore();
      });

      if (settled) {
        const i = c.options.findIndex((o) => o.id === c.winner);
        if (i >= 0) {
          const s = a0 + (i / n) * TAU;
          const en = a0 + ((i + 1) / n) * TAU;
          g.beginPath();
          g.moveTo(cx, cy);
          g.arc(cx, cy, r - 2, s, en);
          g.closePath();
          g.lineWidth = 4;
          g.strokeStyle = theme.color.text;
          g.stroke();
        }
      }

      g.beginPath();
      g.arc(cx, cy, 12, 0, TAU);
      g.fillStyle = theme.color.card;
      g.fill();

      g.beginPath();
      g.moveTo(cx - 9, cy - r - 10);
      g.lineTo(cx + 9, cy - r - 10);
      g.lineTo(cx, cy - r + 6);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();

      return has && e < SPIN_MS;
    };

    const names = c.options.map((o) => shortName(o.label)).join(", ");

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        <Canvas height={220} draw={draw} label={winner ? `Wheel landed on ${winner.label}` : `Wheel with ${c.options.length} places: ${names}`} />
        <div style={{ minHeight: 44, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          {winner ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{winner.label}</div>
                <small>{byName ? `spun by ${byName}` : "spun"}</small>
              </div>
              {c.spunBy !== null ? <Avatar user={c.spunBy} size={24} /> : null}
            </>
          ) : (
            <small>{spinning ? "Spinning" : "No spin yet"}</small>
          )}
        </div>
        <div style={{ display: "flex", marginTop: 8 }}>
          <Button kind="primary" wide disabled={spinning || c.options.length === 0} onClick={() => dispatch({ t: "spin" })}>
            {has ? "Spin again" : "Spin"}
          </Button>
        </div>
      </div>
    );
  },
});
