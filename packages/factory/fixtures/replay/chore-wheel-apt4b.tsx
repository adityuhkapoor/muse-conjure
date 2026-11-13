import { defineApp, Button, CardHeader, Canvas, SystemLine, clock, rng, tween, userColor } from "@muse/app";

// Fair random assignment: a chore wheel. The wheel holds the people in the chat; each spin gives
// the next task to someone with the fewest tasks so far, picked by the server's seed.

type Params = {
  /** Card title: "Chores this week" */
  title: string;
  /** Tasks from the chat, 1 to 12, in the order they get assigned: "Dishes", "Trash". */
  tasks: string[];
};

// @params
const P: Params = {
  "title": "Chores this week",
  "tasks": [
    "Dishes",
    "Trash",
    "Bathroom",
    "Vacuuming",
    "Fridge"
  ]
};
// @end params

type Task = { label: string; owner: string | null };
/** The newest assignment, kept so the wheel can turn from the last person to the new one. */
type Spin = { task: number; who: string; by: string; time: number; from: string | null };
type State = { title: string; tasks: Task[]; spin: Spin | null };
type Action = { t: "spin" } | { t: "reset" };
type Local = Record<string, never>;

const SPIN_MS = 3000;
const TURNS = 4;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

const restAngle = (i: number, n: number) => -((i + 0.5) / n) * Math.PI * 2;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const loadOf = (s: State, id: string) => s.tasks.filter((t) => t.owner === id).length;
const firstOpen = (s: State) => s.tasks.findIndex((t) => t.owner === null);

function spin(s: State, user: string, time: number, seed: number, ids: string[]): State {
  const next = firstOpen(s);
  if (next < 0 || ids.length === 0) return s;
  if (s.spin && time - s.spin.time < SPIN_MS) return s; // still turning
  const min = Math.min(...ids.map((id) => loadOf(s, id)));
  const eligible = ids.filter((id) => loadOf(s, id) === min);
  const who = rng(seed).pick(eligible);
  return {
    ...s,
    tasks: s.tasks.map((t, i) => (i === next ? { ...t, owner: who } : t)),
    spin: { task: next, who, by: user, time, from: s.spin?.who ?? null },
  };
}

export default defineApp<State, Action, Local>({
  name: "Chore wheel",
  summary: (s, ctx) => {
    const done = s.tasks.filter((t) => t.owner).length;
    const name = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const last = s.spin ? `${s.tasks[s.spin.task]?.label}: ${name(s.spin.who)}. ` : "";
    return `${s.title} ${last}${done} of ${s.tasks.length} assigned.`;
  },

  init: () => {
    const seen = new Set<string>();
    const tasks: Task[] = [];
    for (const raw of P.tasks) {
      const label = raw.trim().replace(/\s+/g, " ").slice(0, 30);
      if (!label || seen.has(label.toLowerCase()) || tasks.length >= 12) continue;
      seen.add(label.toLowerCase());
      tasks.push({ label, owner: null });
    }
    return { title: P.title.trim().slice(0, 60) || "Chore wheel", tasks, spin: null };
  },

  // The wheel is the people in the chat right now, so a late joiner is on it from their first moment.
  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "spin")
      return spin(state, meta.user, meta.time, meta.seed, ctx.members.map((m) => m.id));
    if (action.t === "reset") {
      if (!state.tasks.some((t) => t.owner)) return state;
      return { ...state, tasks: state.tasks.map((t) => ({ label: t.label, owner: null })), spin: null };
    }
    return state;
  },

  // Someone left: their tasks go back to open, and the wheel forgets the spin if it was theirs.
  onMembers: (state, ctx) => {
    if (state.tasks.every((t) => t.owner === null || inChat(ctx, t.owner))) return state;
    const tasks = state.tasks.map((t) => (t.owner !== null && !inChat(ctx, t.owner) ? { label: t.label, owner: null } : t));
    return { ...state, tasks, spin: state.spin && inChat(ctx, state.spin.who) ? state.spin : null };
  },

  invariants: {
    "owners are in the chat": (s, ctx) => s.tasks.every((t) => t.owner === null || inChat(ctx, t.owner)),
    "the newest spin holds its task": (s) => s.spin === null || s.tasks[s.spin.task]?.owner === s.spin.who,
    "nothing assigned means no spin": (s) => s.tasks.some((t) => t.owner) || s.spin === null,
    "task labels are unique and short": (s) => new Set(s.tasks.map((t) => t.label.toLowerCase())).size === s.tasks.length && s.tasks.every((t) => t.label.length > 0 && t.label.length <= 30),
  },

  transitions: {
    "a spin gives the first open task to someone with the fewest tasks": (p, n, a, m, ctx) => {
      if (a.t !== "spin" || p === n) return true;
      const i = firstOpen(p);
      const who = n.tasks[i]?.owner;
      if (i < 0 || !who || !inChat(ctx, who)) return false;
      const min = Math.min(...ctx.members.map((x) => loadOf(p, x.id)));
      return loadOf(p, who) === min && n.tasks.every((t, j) => j === i || t.owner === p.tasks[j]!.owner);
    },
    "the seed picks who": (p, n, a, m, ctx) => {
      if (a.t !== "spin" || p === n) return true;
      const min = Math.min(...ctx.members.map((x) => loadOf(p, x.id)));
      const eligible = ctx.members.map((x) => x.id).filter((id) => loadOf(p, id) === min);
      return n.spin?.who === rng(m.seed).pick(eligible) && n.spin.by === m.user && n.spin.time === m.time;
    },
    "a spin never starts while the wheel is turning": (p, n, a, m) => a.t !== "spin" || p === n || p.spin === null || m.time - p.spin.time >= SPIN_MS,
    "a reset leaves every task open": (p, n, a) => a.t !== "reset" || p === n || (n.spin === null && n.tasks.every((t) => t.owner === null) && n.tasks.length === p.tasks.length),
    "only people in the chat change the wheel": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const open = s.tasks.some((t) => t.owner === null);
    if (open && r.next() < 0.85) return { t: "spin" };
    return r.next() < 0.4 ? { t: "reset" } : { t: "spin" };
  },

  local: {},

  view: ({ state, confirmed, pending, members, dispatch, theme }) => {
    // Who gets a task comes from the server's seed: show it from `confirmed`, and while my own
    // spin is unconfirmed keep the wheel and the list neutral.
    const ids = members.map((m) => m.id);
    const n = Math.max(1, ids.length);
    const spun = confirmed.spin;
    const waiting = pending && state.spin !== null && (spun === null || state.spin.time !== spun.time);
    const now = spun ? clock.value : 0;
    const turning = spun !== null && now - spun.time < SPIN_MS;
    const spinning = waiting || turning;
    // While the wheel turns, keep the newest result hidden.
    const shown = (waiting ? confirmed : state).tasks.map((t, i) => (spinning && spun?.task === i && !waiting ? { ...t, owner: null } : t));
    const done = shown.filter((t) => t.owner).length;
    const open = state.tasks.find((t) => t.owner === null);
    const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

    const angleAt = (t: number) => {
      if (!spun || waiting) return restAngle(0, n);
      const to = restAngle(Math.max(0, ids.indexOf(spun.who)), n);
      const from = restAngle(Math.max(0, spun.from ? ids.indexOf(spun.from) : 0), n);
      let delta = (to - from) % (Math.PI * 2);
      if (delta > 0) delta -= Math.PI * 2;
      return from + (delta - TURNS * Math.PI * 2) * ease(t - spun.time);
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const cx = f.width / 2, cy = f.height / 2 + 6, r = Math.min(cx, cy) - 12;
      const a0 = angleAt(f.now) - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const s = a0 + (i / n) * Math.PI * 2, e = a0 + ((i + 1) / n) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s, e);
        g.closePath();
        g.fillStyle = userColor(ids[i] ?? "", theme);
        g.fill();
        g.save();
        g.translate(cx, cy);
        const mid = (s + e) / 2;
        const flip = Math.cos(mid) < 0;
        g.rotate(flip ? mid + Math.PI : mid);
        g.fillStyle = theme.color.onPrimary;
        g.font = "600 13px system-ui, sans-serif";
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        g.fillText(name(ids[i] ?? "").slice(0, 14), flip ? -(r - 12) : r - 12, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, 12, 0, Math.PI * 2);
      g.fillStyle = theme.color.card;
      g.fill();
      g.beginPath();
      g.moveTo(cx - 9, cy - r - 10);
      g.lineTo(cx + 9, cy - r - 10);
      g.lineTo(cx, cy - r + 6);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();
      return spun !== null && !waiting && f.now - spun.time < SPIN_MS;
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${done} of ${state.tasks.length} assigned`} />
        <Canvas height={200} draw={draw} label={spun && !spinning ? `${name(spun.who)} got ${confirmed.tasks[spun.task]?.label}` : "Chore wheel"} />
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {spun && !spinning ? (
            <SystemLine actor={name(spun.who)}>got {confirmed.tasks[spun.task]?.label}</SystemLine>
          ) : (
            <SystemLine>{spinning ? "Spinning…" : open ? `Next up: ${open.label}` : "Every task has an owner"}</SystemLine>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 12px" }}>
          {shown.map((t, i) => (
            <span
              key={i}
              style={{
                fontSize: 13,
                lineHeight: "16px",
                padding: "4px 10px",
                borderRadius: 99,
                background: theme.color[t.owner ? "selected" : "input"],
                color: theme.color[t.owner ? "link" : "secondaryText"],
                fontWeight: 600,
              }}
            >
              {t.owner ? `${t.label} · ${name(t.owner)}` : t.label}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, display: "flex" }}>
            <Button kind="primary" wide disabled={!open || spinning} onClick={() => dispatch({ t: "spin" })}>
              Spin
            </Button>
          </div>
          <Button disabled={done === 0 || spinning} onClick={() => dispatch({ t: "reset" })}>
            Reset
          </Button>
        </div>
      </div>
    );
  },
});
