import { defineApp, Button, CardHeader, Canvas, SystemLine, rng, running, tween, userColor, type Ctx } from "@muse/app";

type Chore = { name: string; owner: string | null };
type Spin = { chore: number; who: string; by: string; time: number; from: string | null };
type State = { people: string[]; chores: Chore[]; last: Spin | null };
type Action = { t: "spin" } | { t: "reset" };

const CHORES = ["Dishes", "Trash", "Laundry", "Bathroom"];
const SPIN_MS = 3200;
const TURNS = 5;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

const isMember = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const loads = (s: State) => s.people.map((id) => s.chores.filter((c) => c.owner === id).length);
/** People with the fewest chores: only they can win the next spin. */
function eligible(s: State): string[] {
  const l = loads(s);
  const min = Math.min(...l);
  return s.people.filter((_, i) => l[i] === min);
}
const fresh = (people: string[]): State => ({ people, chores: CHORES.map((name) => ({ name, owner: null })), last: null });

// Angle (radians) that puts person i's slice under the pointer at the top.
const restAngle = (i: number, n: number) => -((i + 0.5) / n) * Math.PI * 2;

export default defineApp<State, Action>({
  name: "Chore wheel",
  summary: (s, ctx) => {
    const done = s.chores.filter((c) => c.owner).length;
    const who = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const last = s.last ? `${s.chores[s.last.chore]?.name}: ${who(s.last.who)}. ` : "";
    return `${last}${done} of ${s.chores.length} spun.`;
  },

  init: (ctx) => fresh(ctx.members.map((m) => m.id)),

  reduce: (state, action, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return state;
    if (action.t === "reset") {
      if (!state.chores.some((c) => c.owner !== null)) return state;
      return fresh(state.people);
    }
    if (action.t === "spin") {
      const next = state.chores.findIndex((c) => c.owner === null);
      const pool = eligible(state);
      if (next < 0 || pool.length === 0) return state;
      const who = rng(meta.seed).pick(pool);
      return {
        ...state,
        chores: state.chores.map((c, i) => (i === next ? { ...c, owner: who } : c)),
        last: { chore: next, who, by: meta.user, time: meta.time, from: state.last?.who ?? null },
      };
    }
    return state;
  },

  // A new set of people starts the wheel over, so loads stay fair.
  onMembers: (s, ctx) => {
    const people = ctx.members.map((m) => m.id);
    return people.join() === s.people.join() ? s : fresh(people);
  },

  invariants: {
    "owners are on the wheel": (s) => s.chores.every((c) => c.owner === null || s.people.includes(c.owner)),
    "everyone on the wheel is in the chat": (s, ctx) => s.people.every((id) => isMember(ctx, id)),
    "chores are assigned in order": (s) => s.chores.every((c, i) => c.owner === null || s.chores.slice(0, i).every((p) => p.owner !== null)),
    "load differs by at most one": (s) => {
      const l = loads(s);
      return l.length === 0 || Math.max(...l) - Math.min(...l) <= 1;
    },
    "last spin matches its chore": (s) => s.last === null || s.chores[s.last.chore]?.owner === s.last.who,
    "the chore list is fixed": (s) => s.chores.map((c) => c.name).join() === CHORES.join(),
  },

  transitions: {
    "the wheel's people do not change": (p, n) => p.people.join() === n.people.join(),
    "a spin fills the next chore with the seeded pick": (p, n, a, m, ctx) => {
      const next = p.chores.findIndex((c) => c.owner === null);
      if (a.t !== "spin") return true;
      if (!isMember(ctx, m.user) || next < 0 || p.people.length === 0) return n === p;
      const who = rng(m.seed).pick(eligible(p));
      const others = n.chores.every((c, i) => i === next || c.owner === p.chores[i]?.owner);
      return others && n.chores[next]?.owner === who && n.last?.who === who && n.last.by === m.user && n.last.time === m.time && n.last.chore === next;
    },
    "a reset clears every owner": (p, n, a, m, ctx) =>
      a.t !== "reset" || !isMember(ctx, m.user) ? a.t !== "reset" || n === p : n.chores.every((c) => c.owner === null) && n.last === null,
    "people outside the chat change nothing": (p, n, _a, m, ctx) => isMember(ctx, m.user) || n === p,
  },

  arbitrary: (s, _user, r) => {
    const open = s.chores.some((c) => c.owner === null);
    if (open && r.next() < 0.85) return { t: "spin" };
    return r.next() < 0.5 ? { t: "reset" } : null;
  },

  view: ({ confirmed, pending, members, dispatch, theme }) => {
    // Results come from the server's seed, so everything shown here is confirmed state.
    const s = confirmed;
    const n = Math.max(1, s.people.length);
    const last = s.last;
    const elapsed = last ? running(last.time, SPIN_MS) : null;
    const spinning = pending || elapsed !== null;
    const shown = s.chores.map((c, i) => (spinning && last?.chore === i ? { ...c, owner: null } : c));
    const done = shown.filter((c) => c.owner).length;
    const open = s.chores.find((c) => c.owner === null);
    const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

    const angleAt = (now: number) => {
      if (pending && elapsed === null) return restAngle(last ? s.people.indexOf(last.who) : 0, n) - (now / 400) % (Math.PI * 2);
      if (!last) return restAngle(0, n);
      const to = restAngle(s.people.indexOf(last.who), n);
      const from = restAngle(Math.max(0, last.from ? s.people.indexOf(last.from) : 0), n);
      // Always spin forward: whole turns plus the shortest forward hop to the target.
      let delta = (to - from) % (Math.PI * 2);
      if (delta > 0) delta -= Math.PI * 2;
      return from + (delta - TURNS * Math.PI * 2) * ease(now - last.time);
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: typeof theme }) => {
      const cx = f.width / 2, cy = f.height / 2 + 6, r = Math.min(cx, cy) - 12;
      const a0 = angleAt(f.now) - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const st = a0 + (i / n) * Math.PI * 2, en = a0 + ((i + 1) / n) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, st, en);
        g.closePath();
        g.fillStyle = userColor(s.people[i] ?? "", f.theme);
        g.fill();
        g.save();
        g.translate(cx, cy);
        const mid = (st + en) / 2;
        const flip = Math.cos(mid) < 0; // keep labels upright
        g.rotate(flip ? mid + Math.PI : mid);
        g.fillStyle = f.theme.color.onPrimary;
        g.font = `600 13px ${f.theme.type.family}`;
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        g.fillText(name(s.people[i] ?? ""), flip ? -(r - 14) : r - 14, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, 14, 0, Math.PI * 2);
      g.fillStyle = f.theme.color.card;
      g.fill();
      g.beginPath();
      g.moveTo(cx - 9, cy - r - 10);
      g.lineTo(cx + 9, cy - r - 10);
      g.lineTo(cx, cy - r + 6);
      g.closePath();
      g.fillStyle = f.theme.color.text;
      g.fill();
      return pending || (last !== null && f.now - last.time < SPIN_MS);
    };

    const result = last && !spinning ? `${name(last.who)} got ${s.chores[last.chore]?.name.toLowerCase()}` : null;
    return (
      <div>
        <CardHeader title="Chore wheel" subtitle={`${done} of ${s.chores.length} assigned`} />
        <Canvas height={200} draw={draw} label={result ?? (spinning ? "Wheel spinning" : `Wheel with ${n} people`)} />
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {result && last ? (
            <SystemLine actor={name(last.who)}>got {s.chores[last.chore]?.name.toLowerCase()}</SystemLine>
          ) : (
            <SystemLine>{spinning ? "Spinning…" : open ? `Next up: ${open.name.toLowerCase()}` : "Every chore has an owner"}</SystemLine>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 12px" }}>
          {shown.map((c) => (
            <span
              key={c.name}
              style={{
                fontSize: 13,
                lineHeight: "16px",
                padding: "4px 10px",
                borderRadius: theme.radius.pill,
                background: c.owner ? theme.color.selected : theme.color.input,
                color: c.owner ? theme.color.link : theme.color.secondaryText,
                fontWeight: 600,
              }}
            >
              {c.name}
              {c.owner ? ` · ${name(c.owner)}` : ""}
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
