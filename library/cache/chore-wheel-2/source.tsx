import { defineApp, Avatar, Button, CardHeader, Canvas, rng, running, tween, userColor } from "@muse/app";

const CHAT = {
  title: "Who does which chore?",
  chores: [
    { label: "Bathroom", when: "Thurs" },
    { label: "Trash", when: "tomorrow night" },
    { label: "Recycling", when: "whenever" },
  ],
  tally: { june: 6, eli: 3, sofia: 5, jake: 2, ines: 4, gabe: 3, abby: 7, rhea: 4 } as Record<string, number>,
  maxWeight: 9,
};

type Chore = { id: string; label: string; when: string; owner: string | null; at: number };
type State = { title: string; chores: Chore[]; marks: Record<string, number> };
type Action = { t: "spin"; chore: string } | { t: "reset"; chore: string };
type Local = Record<string, never>;

const SPIN_MS = 3000;
const TURNS = 4;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const weight = (marks: Record<string, number>, id: string) => Math.max(1, CHAT.maxWeight - (marks[id] ?? 0));
const owned = (s: State, id: string) => s.chores.filter((c) => c.owner === id).length;
const sameChore = (a: Chore, b: Chore) => a.id === b.id && a.label === b.label && a.when === b.when && a.owner === b.owner && a.at === b.at;

/** Label at the largest size that fits maxWidth (down to min), then cut with an ellipsis. */
const fitLabel = (label: string, maxWidth: number, size: number, min: number) => {
  const width = (t: string, sz: number) => t.length * sz * 0.6;
  let sz = size;
  while (sz > min && width(label, sz) > maxWidth) sz -= 1;
  let text = label;
  while (text.length > 1 && width(text, sz) > maxWidth) text = text.slice(0, -1);
  if (text !== label) text = text.slice(0, Math.max(0, text.length - 1)) + "…";
  return { text, size: sz, font: `600 ${sz}px system-ui` };
};

/** People who hold no chore yet; if everyone holds one, everyone. */
const poolFor = (s: State, ids: string[]) => {
  const free = ids.filter((id) => owned(s, id) === 0);
  return free.length ? free : ids;
};

function pickWho(pool: string[], marks: Record<string, number>, seed: number): string {
  const total = pool.reduce((n, id) => n + weight(marks, id), 0);
  let x = rng(seed).next() * total;
  for (const id of pool) {
    x -= weight(marks, id);
    if (x < 0) return id;
  }
  return pool[pool.length - 1] ?? "";
}

function spin(s: State, chore: unknown, time: number, seed: number, ids: string[]): State {
  if (typeof chore !== "string" || ids.length === 0) return s;
  const c = s.chores.find((x) => x.id === chore);
  if (!c || c.owner !== null) return s;
  const who = pickWho(poolFor(s, ids), s.marks, seed);
  if (!who) return s;
  return {
    ...s,
    chores: s.chores.map((x) => (x.id === c.id ? { ...x, owner: who, at: Math.max(1, time) } : x)),
    marks: { ...s.marks, [who]: (s.marks[who] ?? 0) + 1 },
  };
}

function reset(s: State, chore: unknown): State {
  if (typeof chore !== "string") return s;
  const c = s.chores.find((x) => x.id === chore);
  if (!c || c.owner === null) return s;
  const old = c.owner;
  return {
    ...s,
    chores: s.chores.map((x) => (x.id === c.id ? { ...x, owner: null, at: 0 } : x)),
    marks: { ...s.marks, [old]: Math.max(0, (s.marks[old] ?? 0) - 1) },
  };
}

export default defineApp<State, Action, Local>({
  name: "Chore wheel",
  summary: (s, ctx) => {
    const name = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const parts = s.chores.filter((c) => c.owner !== null).map((c) => `${c.label}: ${name(c.owner ?? "")}`);
    return `${s.title} ${parts.length ? parts.join(" · ") : "Nothing spun yet."}`;
  },

  init: (ctx) => {
    const marks: Record<string, number> = {};
    for (const m of ctx.members) marks[m.id] = CHAT.tally[m.name.trim().toLowerCase()] ?? 0;
    return {
      title: CHAT.title,
      chores: CHAT.chores.map((c, i) => ({ id: `c${i}`, label: c.label, when: c.when, owner: null, at: 0 })),
      marks,
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "spin") return spin(state, action.chore, meta.time, meta.seed, ctx.members.map((m) => m.id));
    if (action.t === "reset") return reset(state, action.chore);
    return state;
  },

  onMembers: (state, ctx) => {
    const gone = (id: string) => !inChat(ctx, id);
    const keys = Object.keys(state.marks);
    if (state.chores.every((c) => c.owner === null || !gone(c.owner)) && keys.every((k) => !gone(k))) return state;
    const marks: Record<string, number> = {};
    for (const k of keys) if (!gone(k)) marks[k] = state.marks[k] ?? 0;
    return {
      ...state,
      chores: state.chores.map((c) => (c.owner !== null && gone(c.owner) ? { ...c, owner: null, at: 0 } : c)),
      marks,
    };
  },

  invariants: {
    "there are the same chores in order, with unique ids": (s) =>
      s.chores.length === CHAT.chores.length && new Set(s.chores.map((c) => c.id)).size === s.chores.length && s.chores.every((c, i) => c.label === CHAT.chores[i]!.label),
    "chore owners are in the chat": (s, ctx) => s.chores.every((c) => c.owner === null || inChat(ctx, c.owner)),
    "an open chore has no time and an owned one has a time": (s) =>
      s.chores.every((c) => (c.owner === null ? c.at === 0 : Number.isInteger(c.at) && c.at > 0)),
    "marks belong to people in the chat and are whole numbers": (s, ctx) =>
      Object.keys(s.marks).every((k) => inChat(ctx, k) && Number.isInteger(s.marks[k]) && (s.marks[k] ?? 0) >= 0),
    "everyone has at least one mark for each chore they hold": (s, ctx) => ctx.members.every((m) => (s.marks[m.id] ?? 0) >= owned(s, m.id)),
  },

  transitions: {
    "a spin fills only that chore with the seed's weighted pick": (p, n, a, m, ctx) => {
      if (a.t !== "spin" || p === n) return true;
      const c = p.chores.find((x) => x.id === a.chore);
      if (!c) return false;
      const who = pickWho(poolFor(p, ctx.members.map((x) => x.id)), p.marks, m.seed);
      return n.chores.length === p.chores.length && n.chores.every((x, i) => (x.id === c.id ? x.owner === who && x.at === Math.max(1, m.time) : sameChore(x, p.chores[i]!)));
    },
    "a spin adds one mark to the winner and changes no one else's": (p, n, a) => {
      if (a.t !== "spin" || p === n) return true;
      const w = n.chores.find((x) => x.id === a.chore)?.owner;
      if (!w) return false;
      const keys = [...Object.keys(p.marks), ...Object.keys(n.marks)];
      return keys.every((k) => (n.marks[k] ?? 0) === (p.marks[k] ?? 0) + (k === w ? 1 : 0));
    },
    "a reset clears only that chore and takes one mark off its old owner": (p, n, a) => {
      if (a.t !== "reset" || p === n) return true;
      const c = p.chores.find((x) => x.id === a.chore);
      if (!c || c.owner === null) return false;
      const old = c.owner;
      const chores = n.chores.length === p.chores.length && n.chores.every((x, i) => (x.id === c.id ? x.owner === null && x.at === 0 : sameChore(x, p.chores[i]!)));
      const keys = [...Object.keys(p.marks), ...Object.keys(n.marks)];
      return chores && keys.every((k) => (n.marks[k] ?? 0) === Math.max(0, (p.marks[k] ?? 0) - (k === old ? 1 : 0)));
    },
    "chore names and times never change": (p, n) => p.title === n.title && p.chores.map((c) => c.id + c.label + c.when).join("|") === n.chores.map((c) => c.id + c.label + c.when).join("|"),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const open = s.chores.filter((c) => c.owner === null);
    const taken = s.chores.filter((c) => c.owner !== null);
    if (r.next() < 0.05) return { t: "spin", chore: "nope" };
    if (open.length && (taken.length === 0 || r.next() < 0.7)) return { t: "spin", chore: r.pick(open).id };
    if (taken.length) return { t: "reset", chore: r.pick(taken).id };
    return null;
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const ids = members.map((m) => m.id);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));

    // The result comes from the server's seed: read it from `confirmed`.
    const latest = confirmed.chores.reduce<Chore | null>((best, c) => (c.owner !== null && (!best || c.at > best.at) ? c : best), null);
    const turning = latest !== null && running(latest.at, SPIN_MS) !== null;

    const rows = confirmed.chores.map((c, i) => {
      const mine = state.chores[i] ?? c;
      const waiting = pending && mine.owner !== null && c.owner === null;
      const spinning = waiting || (turning && latest?.id === c.id);
      const owner = mine.owner === null ? null : c.owner;
      return { c, spinning, owner };
    });
    const anySpinning = rows.some((r) => r.spinning);
    const waitingAny = pending && rows.some((r) => r.spinning && !(turning && latest?.id === r.c.id));
    const assigned = rows.filter((r) => r.owner !== null && !r.spinning).length;
    const firstOpen = rows.find((r) => r.owner === null && !r.spinning)?.c.id ?? "";
    const myMarks = confirmed.marks[me] ?? 0;

    const winner = latest?.owner ?? "";
    const wheelLabel = anySpinning
      ? "Wheel spinning"
      : latest
        ? `${nameOf(winner)} got ${latest.label}`
        : "Chore wheel, wider slices for people with fewer marks";

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      if (ids.length === 0) return false;
      const ws = ids.map((id) => weight(confirmed.marks, id));
      const total = ws.reduce((a, b) => a + b, 0);
      const cum: number[] = [];
      let acc = 0;
      for (const w of ws) {
        cum.push(acc);
        acc += w;
      }
      const wi = Math.max(0, ids.indexOf(winner));
      const mid = latest ? ((cum[wi] ?? 0) + (ws[wi] ?? 0) / 2) / total * Math.PI * 2 : 0;
      const e = latest && !waitingAny ? Math.max(0, f.now - latest.at) : SPIN_MS;
      const rot = latest ? -mid - (1 - ease(e)) * TURNS * Math.PI * 2 : 0;

      const cx = f.width / 2;
      const cy = f.height / 2 + 6;
      const r = Math.min(cx - 8, f.height / 2 - 16);
      for (let i = 0; i < ids.length; i++) {
        const s0 = rot - Math.PI / 2 + ((cum[i] ?? 0) / total) * Math.PI * 2;
        const s1 = s0 + ((ws[i] ?? 0) / total) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s0, s1);
        g.closePath();
        g.fillStyle = userColor(members[i]!, theme);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = theme.color.card;
        g.stroke();

        const m = (s0 + s1) / 2;
        const flip = Math.cos(m) < 0;
        g.save();
        g.translate(cx, cy);
        g.rotate(flip ? m + Math.PI : m);
        const fit = fitLabel(nameOf(ids[i] ?? ""), r * 0.6, 12, 10);
        g.font = fit.font;
        g.fillStyle = theme.color.onPrimary;
        g.textBaseline = "middle";
        g.textAlign = flip ? "left" : "right";
        g.fillText(fit.text, flip ? -(r - 8) : r - 8, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, 10, 0, Math.PI * 2);
      g.fillStyle = theme.color.card;
      g.fill();
      g.beginPath();
      g.moveTo(cx - 9, cy - r - 10);
      g.lineTo(cx + 9, cy - r - 10);
      g.lineTo(cx, cy - r + 4);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();
      return latest !== null && !waitingAny && f.now - latest.at < SPIN_MS;
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${assigned} of ${rows.length} assigned`} />
        <Canvas height={160} label={wheelLabel} draw={draw} />
        <div style={{ minHeight: 20, margin: "4px 0" }}>
          <small>{anySpinning ? "Spinning…" : `Fewer marks, better odds · you have ${myMarks} ${myMarks === 1 ? "mark" : "marks"}`}</small>
        </div>
        <div>
          {rows.map(({ c, spinning, owner }) => (
            <div
              key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, borderTop: `1px solid ${theme.color.divider}` }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.label}</div>
                <small>{c.when}</small>
              </div>
              {spinning ? (
                <small>Spinning…</small>
              ) : owner !== null ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Avatar user={owner} size={24} />
                  <span style={{ maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(owner)}</span>
                  <Button kind="deemphasized" disabled={anySpinning} onClick={() => dispatch({ t: "reset", chore: c.id })}>
                    Reset
                  </Button>
                </div>
              ) : (
                <Button kind={c.id === firstOpen ? "primary" : "secondary"} disabled={anySpinning} onClick={() => dispatch({ t: "spin", chore: c.id })}>
                  Spin
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
