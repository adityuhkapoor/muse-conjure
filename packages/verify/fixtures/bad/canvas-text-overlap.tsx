// Bad fixture: two hub labels are drawn on top of each other.
// Expect: stage render, rule canvas-text-overlap.
// Profile: strict.
import { defineApp, Button, CardHeader, Canvas, SystemLine, rng, tween } from "@muse/app";

type Option = { id: string; label: string };
type State = { options: Option[]; picked: string | null; at: number };
type Action = { t: "add"; label: string } | { t: "remove"; option: string } | { t: "spin" } | { t: "reset" };
type Local = { draft: string };

const MAX = 8;
const MAX_LABEL = 40;
const SPIN_MS = 2400;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });
const IDEAS = ["Tacos", "Pho", "Sushi", "Ramen", "Dumplings", "Pizza", "Taco truck on Cortez and 5th", ""];

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const isMember = (ctx: { members: { id: string }[] }, u: string) => ctx.members.some((m) => m.id === u);

/** The longest prefix of `label` (with "…") that fits `room` px, at 13 px down to 10 px. */
function fit(g: CanvasRenderingContext2D, label: string, room: number): string {
  for (let px = 13; px >= 10; px--) {
    g.font = `600 ${px}px system-ui, sans-serif`;
    if (g.measureText(label).width <= room) return label;
  }
  let cut = label;
  while (cut.length > 1 && g.measureText(cut + "…").width > room) cut = cut.slice(0, -1);
  return cut.length > 1 ? cut.trimEnd() + "…" : "";
}

export default defineApp<State, Action, Local>({
  name: "Wheel",
  summary: (s) => (s.picked ? `The wheel picked ${s.options.find((o) => o.id === s.picked)?.label ?? "something"}.` : `${s.options.length} options on the wheel.`),
  init: () => ({ options: [{ id: "a", label: "Thai Basil" }, { id: "b", label: "Taco truck on Cortez and 5th" }, { id: "c", label: "Sushi Ko" }, { id: "d", label: "Pizza" }], picked: null, at: 0 }),
  reduce: (s, a, m, ctx) => {
    if (!isMember(ctx, m.user)) return s;
    if (a.t === "add") {
      if (typeof a.label !== "string" || s.picked) return s;
      const label = clean(a.label);
      if (!label || label.length > MAX_LABEL || s.options.length >= MAX || s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
      return { ...s, options: [...s.options, { id: `o${m.seq}`, label }] };
    }
    if (a.t === "remove") {
      if (s.picked || typeof a.option !== "string" || !s.options.some((o) => o.id === a.option)) return s;
      return { ...s, options: s.options.filter((o) => o.id !== a.option) };
    }
    if (a.t === "spin") {
      if (s.picked || s.options.length < 2) return s;
      return { ...s, picked: rng(m.seed).pick(s.options).id, at: m.time };
    }
    if (a.t === "reset") return s.picked ? { ...s, picked: null } : s;
    return s;
  },
  invariants: {
    "options are unique, short and capped": (s) =>
      s.options.length <= MAX && new Set(s.options.map((o) => o.id)).size === s.options.length && s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL),
    "a pick is an option": (s) => s.picked === null || s.options.some((o) => o.id === s.picked),
  },
  transitions: {
    "an add appends one cleaned option": (p, n, a, m) => a.t !== "add" || p === n || (n.options.length === p.options.length + 1 && n.options.at(-1)!.label === clean(String(a.label)) && n.options.at(-1)!.id === `o${m.seq}`),
    "a remove drops exactly that option": (p, n, a) => a.t !== "remove" || p === n || (n.options.length === p.options.length - 1 && !n.options.some((o) => o.id === a.option)),
    "a spin picks what the seed picks": (p, n, a, m) => a.t !== "spin" || p === n || (!p.picked && n.picked === rng(m.seed).pick(p.options).id && n.at === m.time),
    "a reset clears the pick only": (p, n, a) => a.t !== "reset" || p === n || (n.picked === null && n.options === p.options),
    "only people in the chat change it": (p, n, _a, m, ctx) => p === n || isMember(ctx, m.user),
  },
  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.picked) return k < 0.5 ? { t: "reset" } : null;
    if (k < 0.45) return { t: "add", label: r.pick(IDEAS) };
    if (k < 0.85 && s.options.length) return { t: "remove", option: r.pick(s.options).id };
    return { t: "spin" };
  },
  local: { draft: "" },
  view: ({ state, confirmed, pending, dispatch, theme, local, setLocal }) => {
    const submit = () => {
      if (clean(local.draft)) dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    const field = (
      <form
        style={{ display: "flex", gap: 8, marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add an option" aria-label="Add an option" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
        <Button kind="secondary" disabled={!clean(local.draft)} onClick={submit}>
          Add
        </Button>
      </form>
    );
    if (state.options.length < 2)
      return (
        <div>
          <CardHeader title="Wheel" subtitle={state.options.length ? "Add one more to spin" : "Add a few options to spin"} />
          {state.options.map((o) => (
            <p key={o.id}>{o.label}</p>
          ))}
          {field}
        </div>
      );
    const opts = confirmed.options.length >= 2 ? confirmed.options : state.options;
    const pick = confirmed.picked;
    const n = opts.length;
    const slice = (Math.PI * 2) / n;
    const target = pick ? -((Math.max(0, opts.findIndex((o) => o.id === pick)) + 0.5) / n) * Math.PI * 2 : 0;
    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const cx = f.width / 2, cy = f.height / 2 + 6, r = Math.min(cx, cy) - 14;
      const t = pick ? Math.min(1, ease(f.now - confirmed.at)) : 1;
      const a0 = (pick ? target - 3 * Math.PI * 2 * (1 - t) : 0) - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const s = a0 + i * slice, e = s + slice;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s, e);
        g.closePath();
        g.fillStyle = i % 2 ? theme.color.wash : theme.color.input;
        g.fill();
        const mid = (s + e) / 2;
        const flip = Math.cos(mid) < 0;
        // Room along the radius: from where the slice is as wide as the text is tall to the rim.
        const inner = Math.max(24, slice < Math.PI ? 9 / Math.sin(slice / 2) : 24);
        const room = r - 10 - inner;
        g.save();
        g.translate(cx, cy);
        g.rotate(flip ? mid + Math.PI : mid);
        const text = fit(g, opts[i]!.label, room);
        g.fillStyle = theme.color.text;
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        if (text) g.fillText(text, flip ? -(r - 10) : r - 10, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, 30, 0, Math.PI * 2);
      g.fillStyle = theme.color.card;
      g.fill();
      g.font = "600 12px system-ui, sans-serif";
      g.fillStyle = theme.color.text;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Pick", cx, cy);
      g.fillText("Spin", cx + 4, cy + 2);
      g.beginPath();
      g.moveTo(cx - 8, cy - r - 12);
      g.lineTo(cx + 8, cy - r - 12);
      g.lineTo(cx, cy - r + 2);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();
      return pick !== null && t < 1;
    };
    const picked = pick && !pending ? opts.find((o) => o.id === pick) : null;
    return (
      <div>
        <CardHeader title="Wheel" subtitle={`${n} on the wheel`} />
        <Canvas height={200} draw={draw} label={picked ? `The wheel picked ${picked.label}` : "Wheel"} />
        <SystemLine>{picked ? `Picked: ${picked.label}` : pending ? "Spinning…" : "Tap spin to pick"}</SystemLine>
        {state.picked ? null : field}
        <div style={{ display: "flex", marginTop: 8 }}>
          {state.picked ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "reset" })}>
              Again
            </Button>
          ) : (
            <Button kind="primary" wide onClick={() => dispatch({ t: "spin" })}>
              Spin
            </Button>
          )}
        </div>
      </div>
    );
  },
});
