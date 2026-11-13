import { defineApp, Avatar, Button, CardHeader, Canvas, SystemLine, clock, rng, tween, userColor } from "@muse/app";

// Fair random assignment: a chore wheel. The wheel holds the people in the chat; each spin gives
// the next task to someone with the fewest tasks so far, picked by the server's seed. With no
// tasks yet there is no wheel: the card asks the chat to add them.

type Params = {
  /** Card title: "Chores this week" */
  title: string;
  /** Tasks named in the chat, up to 12, in the order they get assigned: "Dishes", "Trash". Empty when the chat named none. */
  tasks: string[];
};

// @params
const P: Params = {
  title: "Chores this week",
  tasks: ["Dishes", "Trash", "Bathroom", "Vacuuming"],
};
// @end params

/** `by`: who added it, or null for tasks that came from the chat when the card was made. */
type Task = { label: string; owner: string | null; by: string | null };
/** The newest assignment, kept so the wheel can turn from the last person to the new one. */
type Spin = { task: number; who: string; by: string; time: number; from: string | null };
type State = { title: string; tasks: Task[]; spin: Spin | null };
type Action = { t: "spin" } | { t: "reset" } | { t: "add"; label: string };
type Local = { draft: string; adding: boolean };

const SPIN_MS = 3000;
const TURNS = 4;
const MAX_TASKS = 12;
const MAX_LABEL = 30;
/** Slice labels: 13 px, shrinking to 10 px, then cut with an ellipsis. */
const LABEL_PX = 13;
const LABEL_MIN_PX = 10;
const HUB = 12;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

const restAngle = (i: number, n: number) => -((i + 0.5) / n) * Math.PI * 2;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const loadOf = (s: State, id: string) => s.tasks.filter((t) => t.owner === id).length;
const firstOpen = (s: State) => s.tasks.findIndex((t) => t.owner === null);
const clean = (label: string) => label.trim().replace(/\s+/g, " ");

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

function add(s: State, raw: unknown, user: string): State {
  if (typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.tasks.length >= MAX_TASKS) return s;
  if (s.tasks.some((t) => t.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, tasks: [...s.tasks, { label, owner: null, by: user }] };
}

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
    if (!s.tasks.length) return `${s.title} No tasks yet.`;
    const last = s.spin ? `${name(s.spin.by)} spun the wheel: ${name(s.spin.who)} got ${s.tasks[s.spin.task]?.label}. ` : "";
    return `${s.title} ${last}${done} of ${s.tasks.length} assigned.`;
  },

  init: () => {
    const seen = new Set<string>();
    const tasks: Task[] = [];
    for (const raw of P.tasks) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || tasks.length >= MAX_TASKS) continue;
      seen.add(label.toLowerCase());
      tasks.push({ label, owner: null, by: null });
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
      return { ...state, tasks: state.tasks.map((t) => ({ ...t, owner: null })), spin: null };
    }
    if (action.t === "add") return add(state, action.label, meta.user);
    return state;
  },

  // Someone left: their tasks go back to open, and the wheel forgets the spin if it was theirs.
  onMembers: (state, ctx) => {
    if (state.tasks.every((t) => t.owner === null || inChat(ctx, t.owner))) return state;
    const tasks = state.tasks.map((t) => (t.owner !== null && !inChat(ctx, t.owner) ? { ...t, owner: null } : t));
    return { ...state, tasks, spin: state.spin && inChat(ctx, state.spin.who) ? state.spin : null };
  },

  invariants: {
    "owners are in the chat": (s, ctx) => s.tasks.every((t) => t.owner === null || inChat(ctx, t.owner)),
    "the newest spin holds its task": (s) => s.spin === null || s.tasks[s.spin.task]?.owner === s.spin.who,
    "nothing assigned means no spin": (s) => s.tasks.some((t) => t.owner) || s.spin === null,
    "task labels are unique and short": (s) => s.tasks.length <= MAX_TASKS && new Set(s.tasks.map((t) => t.label.toLowerCase())).size === s.tasks.length && s.tasks.every((t) => t.label.length > 0 && t.label.length <= MAX_LABEL),
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
    "a reset with nothing assigned changes nothing": (p, n, a) => a.t !== "reset" || p.tasks.some((t) => t.owner) || p === n,
    "a reset leaves every task open": (p, n, a) => a.t !== "reset" || p === n || (n.spin === null && n.tasks.every((t) => t.owner === null) && n.tasks.length === p.tasks.length),
    "only people in the chat change the wheel": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "an added task goes last, cleaned, open, and names who added it": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.tasks.at(-1);
      return n.tasks.length === p.tasks.length + 1 && n.spin === p.spin && last?.label === clean(a.label) && last.owner === null && last.by === m.user && n.tasks.slice(0, -1).every((t, i) => t === p.tasks[i]);
    },
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < (s.tasks.length ? 0.15 : 0.7)) return { t: "add", label: r.pick(["Dishes", " trash ", "Bathroom", "", "Laundry", "Mopping"]) };
    const open = s.tasks.some((t) => t.owner === null);
    if (open && r.next() < 0.85) return { t: "spin" };
    return r.next() < 0.4 ? { t: "reset" } : { t: "spin" };
  },

  local: { draft: "", adding: false },

  view: ({ state, confirmed, pending, members, dispatch, theme, local, setLocal }) => {
    const submit = () => {
      if (clean(local.draft)) dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", adding: false });
    };
    const field = (primary: boolean) => (
      <form
        style={{ display: "flex", gap: 8, marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add a task" aria-label="Add a task" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
        <Button kind={primary ? "primary" : "deemphasized"} disabled={!clean(local.draft) || state.tasks.length >= MAX_TASKS} onClick={submit}>
          Add
        </Button>
      </form>
    );
    // No tasks yet: no wheel. A compact card that collects tasks from the chat.
    if (!state.tasks.length) {
      return (
        <div>
          <CardHeader title={state.title} subtitle="Add tasks to spin for" />
          {field(true)}
          <SystemLine>Anyone in the chat can add</SystemLine>
        </div>
      );
    }

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
      const slice = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        const s = a0 + i * slice, e = s + slice;
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
        const text = fitLabel(g, name(ids[i] ?? ""), r, slice);
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 4px" }}>
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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {t.by && !t.owner ? <Avatar user={members.find((m) => m.id === t.by) ?? t.by} size={16} /> : null}
              {t.owner ? `${t.label} · ${name(t.owner)}` : t.label}
            </span>
          ))}
        </div>
        {local.adding ? field(false) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {open ? (
            <div style={{ flex: 1, display: "flex" }}>
              <Button kind="primary" wide disabled={spinning} onClick={() => dispatch({ t: "spin" })}>
                Spin
              </Button>
            </div>
          ) : null}
          {!local.adding && state.tasks.length < MAX_TASKS ? (
            <Button kind="deemphasized" wide={!open && done === 0} onClick={() => setLocal({ adding: true })}>
              Add
            </Button>
          ) : null}
          {done > 0 ? (
            <Button kind={open ? "secondary" : "primary"} wide={!open} disabled={spinning} onClick={() => dispatch({ t: "reset" })}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
