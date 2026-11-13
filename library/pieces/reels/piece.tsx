import { defineApp, Avatar, Button, CardHeader, Canvas, SystemLine, rng, running, tween, type Theme } from "@muse/app";

// Three-reel picker: up to three independent reels ("Where", "Budget", "Leave at"). Options the
// chat ruled out are crossed out and never land. One pull gives one shared result from the
// server's seed; the reels settle one by one. Anyone can cross out or bring back their own picks.

type Params = {
  /** Card title: "Saturday night" */
  title: string;
  /**
   * 1 to 3 reels, each 2 to 8 options. `out` is why the chat ruled an option out, in a few plain
   * words ("Frat row is a no", "Maya's broke"); empty when the option is allowed.
   */
  reels: { name: string; options: { label: string; out: string }[] }[];
};

// @params
const P: Params = {
  title: "Saturday night",
  reels: [
    {
      name: "Where",
      options: [
        { label: "Lucky's", out: "" },
        { label: "The Rat", out: "" },
        { label: "Frat row", out: "Frat row is a no" },
        { label: "Kip's", out: "" },
        { label: "Blake's rooftop", out: "" },
      ],
    },
    {
      name: "Budget",
      options: [
        { label: "$3 drafts", out: "" },
        { label: "$10 cover", out: "" },
        { label: "Bottle service", out: "Maya's broke" },
        { label: "Free", out: "" },
      ],
    },
    {
      name: "Leave at",
      options: [
        { label: "9:30", out: "" },
        { label: "10:15", out: "" },
        { label: "11:00", out: "" },
        { label: "Midnight", out: "Sam opens at 8" },
      ],
    },
  ],
};
// @end params

/** why: the chat's reason (fixed). by: who crossed it out here (they can bring it back). */
type Opt = { label: string; why: string; by: string | null };
type Reel = { name: string; options: Opt[] };
/** The newest pull: one option index per reel. from: where each reel rested before. */
type Pull = { by: string; at: number; picks: number[]; from: number[] };
type State = { title: string; reels: Reel[]; pull: Pull | null; pulls: number };
type Action = { t: "pull" } | { t: "cross"; reel: number; option: number };
type Local = { edit: boolean };
type Ctx = { members: { id: string }[] };

const SPIN_MS = 2600;
const ROW = 44;
const TURNS = 3;
const settle = [0, 1, 2].map((i) => tween({ duration: 1500 + i * 500, easing: "decelerate" }));

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
// Check helpers (invariants, transitions, view).
const isOut = (o: Opt) => o.why !== "" || o.by !== null;
const allowed = (r: Reel) => r.options.map((o, i) => (isOut(o) ? -1 : i)).filter((i) => i >= 0);
const seedPicks = (s: State, seed: number) => {
  const g = rng(seed);
  return s.reels.map((r) => g.pick(allowed(r)));
};

// Reducer helpers.
function pull(s: State, user: string, time: number, seed: number): State {
  if (s.pull && time - s.pull.at < SPIN_MS) return s; // still turning
  const g = rng(seed);
  const picks = s.reels.map((r) => g.pick(r.options.map((o, i) => (o.why !== "" || o.by !== null ? -1 : i)).filter((i) => i >= 0)));
  return { ...s, pull: { by: user, at: time, picks, from: s.pull ? s.pull.picks : s.reels.map(() => 0) }, pulls: s.pulls + 1 };
}

function cross(s: State, user: string, ri: unknown, oi: unknown, time: number): State {
  if (typeof ri !== "number" || typeof oi !== "number") return s;
  const reel = s.reels[ri];
  const o = reel?.options[oi];
  if (!reel || !o || o.why !== "") return s; // the chat's own constraints stay
  if (s.pull && time - s.pull.at < SPIN_MS) return s;
  if (o.by !== null) {
    if (o.by !== user) return s;
    return { ...s, reels: s.reels.map((r, i) => (i !== ri ? r : { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, by: null } : x)) })) };
  }
  if (s.pull && s.pull.picks[ri] === oi) return s; // the result stands
  if (reel.options.filter((x) => x.why === "" && x.by === null).length <= 1) return s; // a reel keeps one option
  return { ...s, reels: s.reels.map((r, i) => (i !== ri ? r : { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, by: user } : x)) })) };
}

const sameReels = (p: State, n: State, ri: number, oi: number) =>
  p.reels.length === n.reels.length && p.reels.every((r, i) => r.name === n.reels[i]!.name && r.options.every((o, j) => (i === ri && j === oi) || (o.label === n.reels[i]!.options[j]?.label && o.why === n.reels[i]!.options[j]!.why && o.by === n.reels[i]!.options[j]!.by)));

function drawReels(g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: Theme }, reels: Reel[], pull: Pull | null, still: boolean) {
  const t = f.theme;
  const n = reels.length;
  const gap = 6;
  const w = (f.width - gap * (n - 1)) / n;
  const mid = f.height / 2;
  let moving = false;
  reels.forEach((r, i) => {
    const x0 = i * (w + gap);
    const len = r.options.length;
    let pos = 0;
    if (pull && !still) {
      const from = pull.from[i] ?? 0, to = pull.picks[i] ?? 0;
      const dist = TURNS * len + (((to - from) % len) + len) % len;
      const e = f.now - pull.at;
      const k = settle[i]!(e);
      if (k < 1) moving = true;
      pos = from + dist * k;
    } else if (pull) pos = pull.picks[i] ?? 0;
    g.save();
    g.beginPath();
    g.roundRect(x0, 0, w, f.height, 10);
    g.fillStyle = t.color.input;
    g.fill();
    g.clip();
    g.fillStyle = t.color.card;
    g.fillRect(x0, mid - ROW / 2, w, ROW);
    g.font = `600 15px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let k = Math.floor(pos) - 2; k <= Math.floor(pos) + 2; k++) {
      const o = r.options[((k % len) + len) % len]!;
      const y = mid + (k - pos) * ROW;
      const near = Math.abs(k - pos) < 0.5;
      g.fillStyle = isOut(o) ? t.color.disabledText : near ? t.color.text : t.color.secondaryText;
      let label = o.label;
      while (label.length > 3 && g.measureText(label).width > w - 16) label = label.slice(0, -2) + "…";
      g.fillText(label, x0 + w / 2, y);
      if (isOut(o)) {
        const lw = Math.min(w - 16, g.measureText(label).width + 8);
        g.fillStyle = t.color.negative;
        g.fillRect(x0 + w / 2 - lw / 2, y - 1, lw, 2);
      }
    }
    g.restore();
  });
  g.strokeStyle = t.color.primary;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(1, mid - ROW / 2, f.width - 2, ROW, 8);
  g.stroke();
  return moving;
}

export default defineApp<State, Action, Local>({
  name: "Reels",
  summary: (s) => {
    if (!s.pull) return `${s.title} Ready to pull.`;
    return `${s.title} ${s.reels.map((r, i) => r.options[s.pull!.picks[i]!]?.label).join(" · ")}`;
  },

  init: () => {
    const reels: Reel[] = [];
    for (const r of P.reels) {
      if (reels.length >= 3) break;
      const seen = new Set<string>();
      const options: Opt[] = [];
      for (const o of r.options) {
        const label = o.label.trim().replace(/\s+/g, " ").slice(0, 24);
        if (!label || seen.has(label.toLowerCase()) || options.length >= 8) continue;
        seen.add(label.toLowerCase());
        options.push({ label, why: o.out.trim().slice(0, 40), by: null });
      }
      if (options.length < 2) continue;
      if (options.every((o) => o.why !== "")) options[0] = { ...options[0]!, why: "" };
      reels.push({ name: r.name.trim().slice(0, 16) || `Reel ${reels.length + 1}`, options });
    }
    const safe = reels.length ? reels : [{ name: "Pick", options: [{ label: "Yes", why: "", by: null }, { label: "No", why: "", by: null }] }];
    return { title: P.title.trim().slice(0, 60) || "Reels", reels: safe, pull: null, pulls: 0 };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "pull") return pull(state, meta.user, meta.time, meta.seed);
    if (action.t === "cross") return cross(state, meta.user, action.reel, action.option, meta.time);
    return state;
  },

  // Someone left: the options they crossed out come back. The result on the reels stays.
  onMembers: (state, ctx) => {
    const gone = state.reels.flatMap((r) => r.options.map((o) => o.by)).filter((b): b is string => b !== null).filter((b) => !inChat(ctx, b));
    if (!gone.length) return state;
    return { ...state, reels: state.reels.map((r) => ({ ...r, options: r.options.map((o) => (gone.includes(o.by ?? "") ? { ...o, by: null } : o)) })) };
  },

  invariants: {
    "every reel keeps an option that can land": (s) => s.reels.every((r) => allowed(r).length >= 1),
    "the result only lands on allowed options": (s) => s.pull === null || (s.pull.picks.length === s.reels.length && s.pull.picks.every((k, i) => allowed(s.reels[i]!).includes(k))),
    "people who crossed something out are in the chat": (s, ctx) => s.reels.every((r) => r.options.every((o) => o.by === null || inChat(ctx, o.by))),
    "the chat's own constraints are never crossed by a person": (s) => s.reels.every((r) => r.options.every((o) => o.why === "" || o.by === null)),
    "1 to 3 reels of 2 to 8 options": (s) => s.reels.length >= 1 && s.reels.length <= 3 && s.reels.every((r) => r.options.length >= 2 && r.options.length <= 8),
    "a result means at least one pull": (s) => (s.pull === null) === (s.pulls === 0),
  },

  transitions: {
    "a pull lands where the seed says, once the reels have stopped": (p, n, a, m) => {
      if (a.t !== "pull" || p === n) return true;
      const free = p.pull === null || m.time - p.pull.at >= SPIN_MS;
      const want = seedPicks(p, m.seed);
      return free && n.pull !== null && n.pull.by === m.user && n.pull.at === m.time && n.pulls === p.pulls + 1 && n.pull.picks.join() === want.join() && n.pull.from.join() === (p.pull ? p.pull.picks : p.reels.map(() => 0)).join() && sameReels(p, n, -1, -1);
    },
    "a cross flips one option, by its crosser, never the result or the last one": (p, n, a, m) => {
      if (a.t !== "cross" || p === n) return true;
      const o = p.reels[a.reel]?.options[a.option];
      const after = n.reels[a.reel]?.options[a.option];
      if (!o || !after || o.why !== "" || !sameReels(p, n, a.reel, a.option) || JSON.stringify(n.pull) !== JSON.stringify(p.pull)) return false;
      if (p.pull && m.time - p.pull.at < SPIN_MS) return false;
      if (o.by === null) return after.by === m.user && p.pull?.picks[a.reel] !== a.option && allowed(p.reels[a.reel]!).length >= 2;
      return o.by === m.user && after.by === null;
    },
    "only people in the chat change the reels": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title and reels' names never change": (p, n) => p.title === n.title && p.reels.map((r) => r.name).join() === n.reels.map((r) => r.name).join(),
  },

  arbitrary: (s, user, r) => {
    if (r.next() < 0.5) return { t: "pull" };
    const ri = r.int(s.reels.length);
    return { t: "cross", reel: ri, option: r.int(s.reels[ri]!.options.length) };
  },

  local: { edit: false },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    // The result comes from the server's seed: the reels turn from `confirmed`, and while my own
    // pull is unconfirmed they hold still with a neutral line.
    const pull = confirmed.pull;
    const waiting = pending && state.pulls !== confirmed.pulls;
    const turning = pull !== null && !waiting && running(pull.at, SPIN_MS) !== null;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const reels = confirmed.reels;
    const ruled = state.reels.flatMap((r) => r.options.filter((o) => o.why !== "").map((o) => o.why));
    const mineOut = state.reels.flatMap((r) => r.options.filter((o) => o.by !== null)).length;
    const result = pull && !turning && !waiting ? reels.map((r, i) => r.options[pull.picks[i]!]?.label ?? "").join(" · ") : "";
    const busy = waiting || !!turning;

    return (
      <div>
        <CardHeader title={state.title} subtitle={ruled.length ? `Ruled out: ${ruled.join(" · ")}` : `${state.reels.length} reels · one pull for everyone`} />
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          {reels.map((r, i) => (
            <small key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}
            </small>
          ))}
        </div>
        <Canvas
          height={ROW * 3}
          label={result ? `Reels landed on ${result}` : `Reels: ${reels.map((r) => r.name).join(", ")}`}
          draw={(g, f) => drawReels(g, f, reels, pull, waiting)}
        />
        <div style={{ minHeight: 44, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {waiting ? (
            <SystemLine>Pulling…</SystemLine>
          ) : turning ? (
            <SystemLine actor={nameOf(pull!.by)}>pulled</SystemLine>
          ) : pull ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Avatar user={pull.by} size={28} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: theme.type.title, lineHeight: "22px" }}>{result}</div>
                <small>{`${nameOf(pull.by)} pulled · ${confirmed.pulls === 1 ? "first pull" : `pull ${confirmed.pulls}`}`}</small>
              </div>
            </div>
          ) : (
            <SystemLine>Nothing pulled yet</SystemLine>
          )}
        </div>
        {local.edit ? (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {state.reels.map((r, ri) => (
              <div key={ri}>
                <small style={{ fontWeight: 600 }}>{r.name}</small>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {r.options.map((o, oi) => (
                    <Button
                      key={oi}
                      kind={isOut(o) ? "secondary" : "deemphasized"}
                      disabled={o.why !== "" || (o.by !== null && o.by !== me) || busy}
                      onClick={() => dispatch({ t: "cross", reel: ri, option: oi })}
                    >
                      <span style={{ textDecoration: isOut(o) ? "line-through" : "none" }}>{o.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, display: "flex" }}>
            <Button kind="primary" wide disabled={busy} onClick={() => dispatch({ t: "pull" })}>
              {confirmed.pull ? "Pull again" : "Pull"}
            </Button>
          </div>
          <Button onClick={() => setLocal({ edit: !local.edit })}>{local.edit ? "Done" : mineOut ? `Edit · ${mineOut}` : "Edit"}</Button>
        </div>
      </div>
    );
  },
});
