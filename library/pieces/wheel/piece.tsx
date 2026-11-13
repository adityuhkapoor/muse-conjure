import { defineApp, Avatar, Button, CardHeader, Canvas, SystemLine, clock, rng, tween, type ColorName } from "@muse/app";

// Pick-one wheel. Anyone spins; the server's seed picks. With noRepeat, a picked option leaves
// the wheel until reset (good for turn order or "who drives"). With fewer than two options there
// is no wheel yet: the card asks the chat to add some, and the wheel appears at two.

type Params = {
  /** Card title: "Where are we eating?" */
  title: string;
  /** Options from the chat, 2 to 10: places, people, movies. Empty when the chat named none. */
  options: string[];
  /** true: a picked option leaves the wheel until reset. */
  noRepeat: boolean;
};

// @params
const P: Params = {
  title: "Where are we eating?",
  options: ["Thai Basil", "Sushi Ko", "Taco truck", "Pizza"],
  noRepeat: false,
};
// @end params

/** `by`: who added it, or null for options that came from the chat when the card was made. */
type Option = { id: string; label: string; out: boolean; by: string | null };
type Spin = { pick: string; by: string; time: number };
type State = { title: string; noRepeat: boolean; options: Option[]; spins: Spin[] };
type Action = { t: "spin" } | { t: "add"; label: string } | { t: "remove"; option: string } | { t: "reset" };
type Local = { draft: string };

const SPIN_MS = 3000;
const MIN_TO_SPIN = 2;
const MAX_OPTIONS = 10;
const MAX_LABEL = 30;
const MAX_SPINS = 12;
const SLICES: ColorName[] = ["series1", "series3", "series6", "series5", "series4", "series2"];
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });
/** Slice labels: 13 px, shrinking to 10 px, then cut with an ellipsis. */
const LABEL_PX = 13;
const LABEL_MIN_PX = 10;
const HUB = 12;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const onWheel = (s: State) => s.options.filter((o) => !o.out);
const lastSpin = (s: State): Spin | null => s.spins[s.spins.length - 1] ?? null;
const turning = (s: State, now: number) => {
  const l = lastSpin(s);
  return l !== null && now - l.time < SPIN_MS;
};
const canSpin = (s: State) => s.options.length >= MIN_TO_SPIN && onWheel(s).length > 0;

/**
 * The label that fits a slice drawn from the rim inward: the room is the radius left between the
 * rim padding and the point where the slice gets narrower than the text is tall.
 */
function fitLabel(g: CanvasRenderingContext2D, label: string, r: number, slice: number): string {
  const outer = r - 12;
  const half = slice / 2;
  for (let px = LABEL_PX; px >= LABEL_MIN_PX; px--) {
    g.font = `600 ${px}px system-ui, sans-serif`;
    const inner = Math.max(HUB + 6, half < Math.PI / 2 ? (px / 2 + 2) / Math.sin(half) : 0);
    const room = outer - inner;
    if (room <= 0) continue;
    if (g.measureText(label).width <= room) return label;
    if (px === LABEL_MIN_PX) {
      let cut = label;
      while (cut.length > 0 && g.measureText(cut.trimEnd() + "…").width > room) cut = cut.slice(0, -1);
      return cut.trim() ? cut.trimEnd() + "…" : "";
    }
  }
  return "";
}

function spin(s: State, user: string, time: number, seed: number): State {
  const live = onWheel(s);
  if (!canSpin(s) || turning(s, time)) return s;
  const pick = rng(seed).pick(live);
  const spins = [...s.spins, { pick: pick.id, by: user, time }].slice(-MAX_SPINS);
  const options = s.noRepeat ? s.options.map((o) => (o.id === pick.id ? { ...o, out: true } : o)) : s.options;
  return { ...s, options, spins };
}

function add(s: State, raw: unknown, seq: number, user: string): State {
  if (typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.options.length >= MAX_OPTIONS) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, options: [...s.options, { id: `o${seq}`, label, out: false, by: user }] };
}

function remove(s: State, id: unknown, time: number): State {
  const o = s.options.find((x) => x.id === id);
  if (!o || turning(s, time) || s.spins.some((x) => x.pick === o.id)) return s;
  return { ...s, options: s.options.filter((x) => x.id !== o.id) };
}

export default defineApp<State, Action, Local>({
  name: "Wheel",
  summary: (s, ctx) => {
    const l = lastSpin(s);
    const label = l ? s.options.find((o) => o.id === l.pick)?.label : null;
    if (l && label) return `${s.title} ${ctx.members.find((m) => m.id === l.by)?.name ?? "Someone"} spun the wheel: ${label}.`;
    if (s.options.length === 0) return `${s.title} No options yet.`;
    if (s.options.length < MIN_TO_SPIN) return `${s.title} 1 option, needs one more.`;
    return `${s.title} ${onWheel(s).length} options on the wheel.`;
  },

  init: () => {
    const seen = new Set<string>();
    const options: Option[] = [];
    for (const raw of P.options) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      seen.add(label.toLowerCase());
      options.push({ id: `p${options.length}`, label, out: false, by: null });
    }
    return { title: clean(P.title).slice(0, 60) || "Wheel", noRepeat: P.noRepeat, options, spins: [] };
  },

  // Anyone in the chat can spin, add or reset, so someone who joins later can take part at once.
  reduce: (state, action, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return state;
    switch (action.t) {
      case "spin":
        return spin(state, meta.user, meta.time, meta.seed);
      case "add":
        return add(state, action.label, meta.seq, meta.user);
      case "remove":
        return remove(state, action.option, meta.time);
      case "reset":
        if (!state.spins.length) return state;
        return { ...state, spins: [], options: state.options.map((o) => (o.out ? { ...o, out: false } : o)) };
    }
    return state;
  },

  invariants: {
    "every pick is an option": (s) => s.spins.every((x) => s.options.some((o) => o.id === x.pick)),
    "spins are at least 3 s apart": (s) => s.spins.every((x, i) => i === 0 || x.time - s.spins[i - 1]!.time >= SPIN_MS),
    "no repeat: picked options are off the wheel, and only those": (s) =>
      s.noRepeat
        ? s.options.every((o) => o.out === s.spins.some((x) => x.pick === o.id)) && new Set(s.spins.map((x) => x.pick)).size === s.spins.length
        : s.options.every((o) => !o.out),
    "options are unique and short": (s) =>
      s.options.length <= MAX_OPTIONS &&
      new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length &&
      new Set(s.options.map((o) => o.id)).size === s.options.length &&
      s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL),
    "history keeps the last 12 spins": (s) => s.spins.length <= MAX_SPINS,
  },

  transitions: {
    "a spin picks what the seed picks from the wheel": (p, n, a, m) => {
      if (a.t !== "spin" || p === n) return true;
      const l = lastSpin(n);
      return !!l && l.by === m.user && l.time === m.time && l.pick === rng(m.seed).pick(onWheel(p)).id;
    },
    "a spin never starts while the wheel is turning, or before there are two options": (p, n, a, m) => a.t !== "spin" || p === n || (!turning(p, m.time) && canSpin(p)),
    "a spin changes only the history, and with no repeat only the picked option": (p, n, a) =>
      a.t !== "spin" || p === n || (n.options.length === p.options.length && n.options.filter((o, i) => o.out !== p.options[i]!.out).length === (n.noRepeat ? 1 : 0)),
    "an added option goes last, cleaned, not out, and names who added it": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.options.at(-1);
      return n.options.length === p.options.length + 1 && n.spins === p.spins && last?.label === clean(a.label) && last.id === `o${m.seq}` && !last.out && last.by === m.user;
    },
    "a removed option is the one asked for and was never picked": (p, n, a) => {
      if (a.t !== "remove" || p === n) return true;
      const gone = p.options.filter((o) => !n.options.some((x) => x.id === o.id));
      return gone.length === 1 && gone[0]!.id === a.option && !p.spins.some((x) => x.pick === a.option) && n.options.length === p.options.length - 1;
    },
    "a reset empties the history and puts every option back": (p, n, a) => a.t !== "reset" || p === n || (n.spins.length === 0 && n.options.every((o) => !o.out) && n.options.length === p.options.length),
    "a reset with nothing spun changes nothing": (p, n, a) => a.t !== "reset" || p.spins.length > 0 || p === n,
    "only people in the chat change the wheel": (p, n, a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (s.options.length < MIN_TO_SPIN && k < 0.6) return { t: "add", label: r.pick(["Ramen", "Burgers", " pho ", "Dumplings"]) };
    if (k < 0.55 && onWheel(s).length) return { t: "spin" };
    if (k < 0.75) return { t: "add", label: r.pick(["Ramen", "Burgers", " pho ", "", "Dumplings", "Thai Basil"]) };
    if (k < 0.85 && s.options.length) return { t: "remove", option: r.pick(s.options).id };
    return { t: "reset" };
  },

  local: { draft: "" },

  view: ({ state, confirmed, pending, members, dispatch, theme, local, setLocal }) => {
    const submit = () => {
      if (clean(local.draft)) dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    const full = state.options.length >= MAX_OPTIONS;
    const field = (primary: boolean) => (
      <form
        style={{ display: "flex", gap: 8, marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add an option" aria-label="Add an option" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
        <Button kind={primary ? "primary" : "deemphasized"} disabled={!clean(local.draft) || full} onClick={submit}>
          Add
        </Button>
      </form>
    );

    // Fewer than two options: no wheel yet. A compact card that collects options from the chat.
    if (state.options.length < MIN_TO_SPIN) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={state.options.length ? "Add one more to spin" : "Add a few options to spin"} />
          {state.options.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {state.options.map((o) => (
                <span
                  key={o.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 99, background: theme.color.input, fontSize: 15, lineHeight: "20px" }}
                >
                  {o.by ? <Avatar user={members.find((m) => m.id === o.by) ?? o.by} size={20} /> : null}
                  {o.label}
                </span>
              ))}
            </div>
          ) : null}
          {field(true)}
          <SystemLine>Anyone in the chat can add</SystemLine>
        </div>
      );
    }

    // The pick comes from the server's seed, so the wheel and the result come from `confirmed`.
    // While my own spin is unconfirmed the wheel waits: the local guess used seed 0.
    const l = lastSpin(confirmed);
    const mine = lastSpin(state);
    const waiting = pending && (mine?.time !== l?.time || mine?.pick !== l?.pick);
    const now = l ? clock.value : 0;
    const spinning = waiting || (l !== null && now - l.time < SPIN_MS);
    const live = onWheel(state);
    // While the wheel turns, the picked option is still drawn on it.
    const drawn = confirmed.options.filter((o) => !o.out || (l?.pick === o.id && now - l.time < SPIN_MS));
    const picked = l && !spinning ? confirmed.options.find((o) => o.id === l.pick) : null;
    const by = l ? (members.find((m) => m.id === l.by)?.name ?? "Someone") : "";
    const n = Math.max(1, drawn.length);
    const turn = l && !waiting ? l : null;

    const angleAt = (t: number) => {
      if (!turn) return 0;
      const i = Math.max(0, drawn.findIndex((o) => o.id === turn.pick));
      const target = -((i + 0.5) / n) * Math.PI * 2;
      return target - 4 * Math.PI * 2 * (1 - ease(t - turn.time));
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const cx = f.width / 2, cy = f.height / 2 + 6, r = Math.min(cx, cy) - 12;
      const a0 = angleAt(f.now) - Math.PI / 2;
      const slice = (Math.PI * 2) / n;
      for (let i = 0; i < drawn.length; i++) {
        const s = a0 + i * slice, e = s + slice;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s, e);
        g.closePath();
        g.fillStyle = theme.color[SLICES[i % SLICES.length] ?? "series1"];
        g.fill();
        g.save();
        g.translate(cx, cy);
        const mid = (s + e) / 2;
        const flip = Math.cos(mid) < 0;
        g.rotate(flip ? mid + Math.PI : mid);
        g.fillStyle = theme.color.onPrimary;
        const text = fitLabel(g, drawn[i]?.label ?? "", r, slice);
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        g.fillText(text, flip ? -(r - 12) : r - 12, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, HUB, 0, Math.PI * 2);
      g.fillStyle = theme.color.card;
      g.fill();
      g.beginPath();
      g.moveTo(cx - 9, cy - r - 10);
      g.lineTo(cx + 9, cy - r - 10);
      g.lineTo(cx, cy - r + 6);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();
      return turn !== null && f.now - turn.time < SPIN_MS;
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${live.length} on the wheel`} />
        <Canvas height={220} draw={draw} label={picked ? `The wheel picked ${picked.label}` : "Wheel"} />
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {picked ? <SystemLine actor={by}>spun: {picked.label}</SystemLine> : <SystemLine>{spinning ? "Spinning…" : live.length ? "Tap spin to pick" : "Everything has been picked"}</SystemLine>}
        </div>
        {full ? null : field(false)}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {live.length ? (
            <div style={{ flex: 1, display: "flex" }}>
              <Button kind="primary" wide disabled={spinning} onClick={() => dispatch({ t: "spin" })}>
                Spin
              </Button>
            </div>
          ) : null}
          {state.spins.length ? (
            <Button kind={live.length ? "secondary" : "primary"} wide={!live.length} disabled={spinning} onClick={() => dispatch({ t: "reset" })}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
