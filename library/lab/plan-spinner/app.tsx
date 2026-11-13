import { defineApp, Burst, Button, Canvas, CardHeader, Facepile, Locked, Rsvp, Toast, fitText, rng, running, tween, type RsvpValue, type Theme } from "@muse/app";

// Plan spinner: "what are we doing Saturday". Three tapes (activity, food, after) whip sideways and
// stop one by one on options nobody vetoed; the result becomes an event card people RSVP to, and it
// locks when enough say going.

type Params = {
  /** Card title: "Saturday plan" */
  title: string;
  /** One line under the title, why we're spinning: "\"idk anything\" ×4 · so Muse spins it" */
  why: string;
  /** The day, short: "Sat, Nov 15" */
  date: string;
  /**
   * 1 to 3 tapes ("Activity", "Food", "After"), each 2 to 8 options. when: start time ("4:00 PM").
   * costCents: rough cost per person ($14 -> 1400). vetoedBy: name of who ruled it out in the chat,
   * empty when it's allowed.
   */
  tapes: { name: string; options: { label: string; when: string; costCents: number; vetoedBy: string }[] }[];
  /** The chat's constraints as short chips: { text: "No hikes", who: "Jess's ankle" } */
  rules: { text: string; who: string }[];
  /** How many Going lock the plan (fewer if the chat is smaller), 2 to 12 */
  lockAt: number;
};

// @params
const P: Params = {
  title: "Saturday plan",
  why: "\"idk anything\" ×4 · so Muse spins it",
  date: "Sat, Nov 15",
  tapes: [
    {
      name: "Activity",
      options: [
        { label: "Mini golf", when: "4:00 PM", costCents: 1400, vetoedBy: "" },
        { label: "Eagle Peak hike", when: "3:00 PM", costCents: 0, vetoedBy: "Jess" },
        { label: "Bowling", when: "4:00 PM", costCents: 1200, vetoedBy: "" },
        { label: "Escape room", when: "3:30 PM", costCents: 3800, vetoedBy: "Dev" },
        { label: "Thrift crawl", when: "2:30 PM", costCents: 1000, vetoedBy: "" },
        { label: "Arcade bar", when: "4:30 PM", costCents: 1500, vetoedBy: "" },
      ],
    },
    {
      name: "Food",
      options: [
        { label: "Tacos El Gordo", when: "6:30 PM", costCents: 900, vetoedBy: "" },
        { label: "Omakase", when: "6:00 PM", costCents: 8500, vetoedBy: "Dev" },
        { label: "Hot pot", when: "6:30 PM", costCents: 2200, vetoedBy: "" },
        { label: "Gino's pizza", when: "6:00 PM", costCents: 800, vetoedBy: "" },
        { label: "Ramen Ya", when: "7:00 PM", costCents: 1600, vetoedBy: "" },
        { label: "Food trucks", when: "6:30 PM", costCents: 1200, vetoedBy: "" },
      ],
    },
    {
      name: "After",
      options: [
        { label: "Karaoke at Rose's", when: "8:30 PM", costCents: 500, vetoedBy: "" },
        { label: "Club Volt", when: "11:30 PM", costCents: 2000, vetoedBy: "Sam" },
        { label: "Movie at Sam's", when: "8:30 PM", costCents: 0, vetoedBy: "" },
        { label: "Dessert run", when: "8:00 PM", costCents: 600, vetoedBy: "" },
        { label: "Beach bonfire", when: "8:00 PM", costCents: 300, vetoedBy: "" },
        { label: "Rooftop bar", when: "10:30 PM", costCents: 1800, vetoedBy: "Sam" },
      ],
    },
  ],
  rules: [
    { text: "No hikes", who: "Jess's ankle" },
    { text: "Under $25", who: "Dev" },
    { text: "Home by 11", who: "Sam" },
  ],
  lockAt: 4,
};
// @end params

type Opt = { label: string; when: string; cost: number; veto: string };
type Tape = { name: string; options: Opt[] };
type Spin = { at: number; picks: number[]; from: number[] };
type Rsvps = { [user: string]: RsvpValue };
type State = {
  title: string; why: string; date: string; tapes: Tape[]; rules: { text: string; who: string }[];
  lockAt: number; spin: Spin | null; spins: number; rsvp: Rsvps; lockedAt: number;
};
type Action = { t: "spin" } | { t: "rsvp"; v: RsvpValue };
type Local = { toasts: number };
type Ctx = { members: { id: string }[] };

const REST = [2.3, 3.6, 1.2];
const STOP = [1200, 1750, 2300];
const SPIN_MS = 3100;
const OPEN_MS = 450;
const ease = STOP.map((d) => tween({ duration: d, easing: "decelerate" }));
const openEase = tween({ duration: OPEN_MS, easing: "decelerate" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const VALID = ["going", "maybe", "no"];
const allowedCount = (t: Tape) => t.options.filter((o) => o.veto === "").length;
const allowed = (t: Tape, prev: number | undefined) => {
  const ok = t.options.map((o, i) => (o.veto === "" ? i : -1)).filter((i) => i >= 0);
  const fresh = ok.filter((i) => i !== prev);
  return fresh.length ? fresh : ok;
};
const going = (s: State) => Object.keys(s.rsvp).filter((u) => s.rsvp[u] === "going");
const rest = (s: State, i: number) => (s.spin ? s.spin.picks[i]! : REST[i]! % s.tapes[i]!.options.length);
const pickWith = (s: State, seed: number) => {
  const g = rng(seed);
  return s.tapes.map((t, i) => g.pick(allowed(t, s.spin?.picks[i])));
};
const planOf = (s: State, spin: Spin) => s.tapes.map((t, i) => t.options[spin.picks[i]!]!);
const dollars = (c: number) => `$${Math.round(c / 100)}`;

export default defineApp<State, Action, Local>({
  name: "Plan spinner",
  summary: (s) => {
    if (!s.spin) return `${s.title}: not spun yet`;
    const plan = planOf(s, s.spin).map((o) => o.label).join(" · ");
    return s.lockedAt ? `Locked: ${plan} · ${going(s).length} going` : `${s.title}: ${plan} · ${going(s).length} going`;
  },

  init: (ctx) => {
    const tapes: Tape[] = [];
    for (const tp of P.tapes) {
      if (tapes.length >= 3) break;
      const options: Opt[] = [];
      for (const o of tp.options) {
        const label = clean(o.label, 40);
        if (!label || options.length >= 8) continue;
        const cost = Number.isInteger(o.costCents) && o.costCents >= 0 && o.costCents <= 100000 ? o.costCents : 0;
        options.push({ label, when: clean(o.when, 16), cost, veto: clean(o.vetoedBy, 16) });
      }
      if (options.length < 2) continue;
      if (options.every((o) => o.veto)) options.forEach((o) => (o.veto = ""));
      tapes.push({ name: clean(tp.name, 12) || `Pick ${tapes.length + 1}`, options });
    }
    if (!tapes.length) tapes.push({ name: "Plan", options: ["Pizza", "Movie", "Bowling"].map((label) => ({ label, when: "6:00 PM", cost: 1000, veto: "" })) });
    const lockAt = Math.max(2, Math.min(Math.max(2, Math.min(12, ctx.members.length)), Math.round(P.lockAt) || 4));
    return {
      title: clean(P.title, 40) || "Plan spinner",
      why: clean(P.why, 60),
      date: clean(P.date, 20),
      tapes,
      rules: P.rules.map((r) => ({ text: clean(r.text, 40), who: clean(r.who, 20) })).filter((r) => r.text).slice(0, 4),
      lockAt, spin: null, spins: 0, rsvp: {}, lockedAt: 0,
    };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "spin") {
      if (s.lockedAt > 0) return s;
      return { ...s, spin: { at: meta.time, picks: pickWith(s, meta.seed), from: s.tapes.map((_, i) => rest(s, i)) }, spins: s.spins + 1, rsvp: {} };
    }
    if (a.t === "rsvp") {
      if (s.spin === null || !VALID.includes(a.v) || s.rsvp[meta.user] === a.v) return s;
      const rsvp = { ...s.rsvp, [meta.user]: a.v };
      const next = { ...s, rsvp };
      return s.lockedAt === 0 && going(next).length >= s.lockAt ? { ...next, lockedAt: meta.time } : next;
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = Object.keys(s.rsvp).filter((u) => !inChat(ctx, u));
    if (!gone.length) return s;
    const rsvp: Rsvps = {};
    for (const u of Object.keys(s.rsvp)) if (!gone.includes(u)) rsvp[u] = s.rsvp[u]!;
    return { ...s, rsvp };
  },

  invariants: {
    "a plan exists exactly after a spin": (s) => (s.spin === null) === (s.spins === 0),
    "picks are allowed options": (s) =>
      s.spin === null || (s.spin.picks.length === s.tapes.length && s.spin.picks.every((k, i) => Number.isInteger(k) && k >= 0 && k < s.tapes[i]!.options.length && s.tapes[i]!.options[k]!.veto === "")),
    "answers only after a spin, from people in the chat": (s, ctx) =>
      (s.spin !== null || Object.keys(s.rsvp).length === 0) && Object.keys(s.rsvp).every((u) => inChat(ctx, u)) && Object.values(s.rsvp).every((v) => VALID.includes(v)),
    "unlocked means not enough going": (s) => s.lockedAt > 0 || going(s).length < s.lockAt,
    "a locked plan was spun": (s) => s.lockedAt === 0 || s.spin !== null,
    "every tape keeps an allowed option; lockAt 2..12": (s) =>
      s.tapes.length >= 1 && s.tapes.length <= 3 && s.tapes.every((t) => t.options.length >= 2 && t.options.length <= 8 && allowedCount(t) >= 1) && s.lockAt >= 2 && s.lockAt <= 12,
  },

  transitions: {
    "the seed decides the spin": (p, n, a, m) => a.t !== "spin" || p === n || (same(n.spin!.picks, pickWith(p, m.seed)) && n.spin!.at === m.time && n.spins === p.spins + 1),
    "a spin starts from where the tapes rested and clears answers": (p, n, a) =>
      a.t !== "spin" || p === n || (same(n.spin!.from, p.tapes.map((_, i) => rest(p, i))) && Object.keys(n.rsvp).length === 0),
    "a spin lands somewhere new when it can": (p, n, a) => a.t !== "spin" || p === n || p.spin === null || n.spin!.picks.every((k, i) => k !== p.spin!.picks[i] || allowedCount(p.tapes[i]!) === 1),
    "nothing spins once locked": (p, n) => p.lockedAt === 0 || n.spins === p.spins,
    "an answer changes only the sender's": (p, n, a, m) =>
      a.t !== "rsvp" || p === n || (n.rsvp[m.user] === a.v && Object.keys({ ...p.rsvp, ...n.rsvp }).every((u) => u === m.user || p.rsvp[u] === n.rsvp[u])),
    "the answer that reaches the count locks it then": (p, n, a, m) => a.t !== "rsvp" || p.lockedAt > 0 || (going(n).length >= n.lockAt ? n.lockedAt === m.time : n.lockedAt === 0),
    "a lock is never undone": (p, n) => p.lockedAt === 0 || n.lockedAt === p.lockedAt,
    "tapes, rules and lockAt never change": (p, n) => same(p.tapes, n.tapes) && same(p.rules, n.rules) && p.lockAt === n.lockAt,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.spin === null) return { t: "spin" };
    const k = r.next();
    if (k < 0.2) return { t: "spin" };
    return { t: "rsvp", v: r.pick(["going", "going", "maybe", "no"] as RsvpValue[]) };
  },

  local: { toasts: 0 },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const sp = confirmed.spin;
    const waiting = pending && state.spins !== confirmed.spins;
    const e = sp && !waiting ? running(sp.at, SPIN_MS) : null;
    const turning = e !== null;
    const settled = sp !== null && !waiting && !turning;
    const picks = sp ? planOf(confirmed, sp) : [];
    const yes = going(state);
    const mine = state.rsvp[me] ?? null;
    const locked = state.lockedAt > 0;
    const stopped = turning ? STOP.filter((d) => e! >= d).length : 0;
    const open = settled && sp ? openEase(running(sp.at + SPIN_MS, OPEN_MS) ?? OPEN_MS) : 0;
    const cost = picks.reduce((a, o) => a + o.cost, 0);
    const toast = confirmed.lockedAt > 0 && running(confirmed.lockedAt, 2400) !== null;
    const n = state.tapes.length;

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: Theme }) => {
      const col = f.theme.color;
      let moving = waiting;
      const cw = 104;
      confirmed.tapes.forEach((tape, i) => {
        const len = tape.options.length;
        const y = 44 * i;
        const lab = fitText(tape.name, 64, { g, size: 13, weight: 600, min: 10 });
        g.font = lab.font;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillStyle = col.secondaryText;
        g.fillText(lab.text, 0, y + 20);
        g.save();
        g.beginPath();
        g.roundRect(70, y, f.width - 70, 40, 10);
        g.fillStyle = col.input;
        g.fill();
        g.beginPath();
        g.rect(72, y + 2, f.width - 74, 36);
        g.clip();
        let pos = sp ? sp.picks[i]! : REST[i]! % len;
        let won = false;
        if (waiting) {
          pos = (sp ? sp.picks[i]! : REST[i]! % len) + f.now / 250;
        } else if (sp) {
          const from = sp.from[i]!;
          const to = Math.ceil(from / len) * len + len * (2 + i) + sp.picks[i]!;
          const el = f.now - sp.at;
          const k = ease[i]!(Math.max(0, Math.min(el, STOP[i]!)));
          pos = from + (to - from) * k;
          if (el < SPIN_MS) moving = true;
          const t = (el - STOP[i]!) / 1000;
          if (el >= SPIN_MS) pos = to;
          else if (t > 0 && t < 0.8) pos += 0.04 * Math.exp(-8 * t) * Math.sin(34 * t);
          won = el >= SPIN_MS;
        }
        const cx = (70 + f.width) / 2;
        const cy = y + 20;
        for (let k = -3; k <= 3; k++) {
          const j = Math.floor(pos) + k;
          const o = tape.options[((j % len) + len) % len]!;
          const x = cx + (j - pos) * cw;
          const hit = won && Math.abs(x - cx) < 0.3 * cw;
          g.beginPath();
          g.roundRect(x - 49, cy - 16, 98, 32, 8);
          g.fillStyle = hit ? col.primary : col.card;
          g.fill();
          const left = Math.max(x - 49, 72), right = Math.min(x + 49, f.width - 2);
          if (right - left < 36) continue;
          const mx = (left + right) / 2, room = Math.min(88, right - left - 8);
          const t = fitText(o.label, room, { g, size: 13, min: 10 });
          g.font = t.font;
          g.textAlign = "center";
          g.fillStyle = hit ? col.onPrimary : o.veto ? col.secondaryText : col.text;
          const ty = cy - (o.veto ? 6 : 0);
          g.fillText(t.text, mx, ty);
          if (o.veto) {
            g.fillStyle = col.negative;
            g.fillRect(mx - t.width / 2, ty - 0.75, t.width, 1.5);
            const v = fitText(`vetoed by ${o.veto}`, room, { g, size: 11, min: 10 });
            g.font = v.font;
            g.fillStyle = col.secondaryText;
            g.fillText(v.text, mx, cy + 9);
          }
        }
        g.restore();
        g.fillStyle = col.primary;
        g.beginPath();
        g.moveTo(cx - 5, y);
        g.lineTo(cx + 5, y);
        g.lineTo(cx, y + 6);
        g.fill();
        g.beginPath();
        g.moveTo(cx - 5, y + 40);
        g.lineTo(cx + 5, y + 40);
        g.lineTo(cx, y + 34);
        g.fill();
      });
      return moving;
    };

    const detail = [...picks.slice(1).map((o) => `${o.label} at ${o.when}`), cost > 0 ? `~${dollars(cost)} each` : ""].filter(Boolean).join(" · ");
    const status = locked ? `${yes.length} going` : yes.length ? `${yes.length} going · locks at ${state.lockAt}` : `No one going yet · locks at ${state.lockAt}`;
    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.why} />
        <Canvas height={44 * n} label={sp && settled ? `Tapes: ${picks.map((o) => o.label).join(", ")}` : "Tapes ready to spin"} draw={draw} />
        {state.rules.length ? (
          <div style={{ display: "flex", gap: 6, margin: "4px 0", overflow: "hidden" }}>
            {state.rules.map((r, i) => (
              <span key={i} style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", height: 26, lineHeight: "26px", padding: "0 10px", borderRadius: 13, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 13, ...ellipsis }}>
                {r.who ? `${r.text} · ${r.who}` : r.text}
              </span>
            ))}
          </div>
        ) : null}
        {!settled ? (
          <div style={{ height: 42, display: "flex", alignItems: "center" }}>
            <Button kind="primary" wide disabled={waiting || turning} onClick={() => dispatch({ t: "spin" })}>
              {waiting ? "Spinning…" : turning ? ["Spinning…", "One down…", "And…", "And…"][stopped]! : "Spin Saturday"}
            </Button>
          </div>
        ) : (
          <div style={{ overflow: "hidden", height: 182 * open, opacity: open }}>
            <div style={{ borderTop: `1px solid ${c.divider}`, paddingTop: 8 }}>
              <div style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.negative, ...ellipsis }}>{`${state.date} at ${picks[0]!.when}`}</div>
              <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600, color: c.text, marginTop: 2, ...ellipsis }}>{picks.map((o) => o.label).join(" · ")}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, marginTop: 2, ...ellipsis }}>{detail}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                {yes.length ? <Facepile users={yes} max={4} size={20} /> : null}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ellipsis }}>{status}</span>
                {locked ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "rsvp", v: mine === "no" ? "going" : "no" })}>
                    {mine === "no" ? "Going" : "Can't go"}
                  </Button>
                ) : (
                  <Button kind="secondary" onClick={() => dispatch({ t: "spin" })}>Spin again</Button>
                )}
              </div>
              {locked ? (
                <Locked detail={state.title}>{`Locked · ${yes.length} going`}</Locked>
              ) : (
                <Rsvp
                  value={mine}
                  counts={{ going: yes.length, maybe: Object.values(state.rsvp).filter((v) => v === "maybe").length }}
                  onChange={(v) => {
                    if (v === "going" && yes.length + (mine === "going" ? 0 : 1) >= state.lockAt) setLocal({ toasts: local.toasts + 1 });
                    dispatch({ t: "rsvp", v });
                  }}
                />
              )}
            </div>
          </div>
        )}
        {local.toasts ? <Burst key={local.toasts} emoji="🎉" /> : null}
        {toast ? <Toast key={confirmed.lockedAt}>It's a plan</Toast> : null}
      </div>
    );
  },
});
