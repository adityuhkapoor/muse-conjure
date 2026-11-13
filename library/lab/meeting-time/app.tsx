import { defineApp, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, running, tween, userColor } from "@muse/app";

// Weekly meeting: a club picks one recurring slot. Replies from outside the chat arrive as counts,
// the chat taps the times it is free, and anyone can lock the best cell into a calendar tile.

type Params = {
  group: string;
  members: number;
  place: string;
  starts: string;
  days: string[];
  times: string[];
  counts: number[][];
  people: { name: string; free: string[] }[];
};

// @params
const P: Params = {
  group: "Cal Hackers", members: 31, place: "Soda 306", starts: "Jan 21",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"], times: ["5pm", "6pm", "7pm", "8pm", "9pm"],
  counts: [
    [8, 12, 9, 11, 6],
    [14, 17, 15, 17, 9],
    [18, 19, 19, 20, 12],
    [16, 20, 17, 19, 10],
    [9, 13, 11, 12, 5],
  ],
  people: [
    { name: "Maya", free: ["Tue 7pm", "Thu 7pm", "Tue 8pm"] },
    { name: "Theo", free: ["Tue 7pm", "Wed 7pm"] },
    { name: "Priya", free: ["Thu 7pm", "Tue 6pm"] },
    { name: "Dev", free: ["Mon 7pm", "Tue 7pm"] },
  ],
};
// @end params

type Lock = { r: number; c: number; by: string; at: number };
/** free[user] = cell keys r * days.length + c, sorted ascending, unique. */
type State = {
  group: string;
  members: number;
  place: string;
  starts: string;
  days: string[];
  times: string[];
  counts: number[][];
  free: { [user: string]: number[] };
  lock: Lock | null;
};
type Action = { t: "toggle"; r: number; c: number } | { t: "lock" } | { t: "unlock" };
type Local = { sel: number };
type Ctx = { members: { id: string; name?: string }[] };

const LONG: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const TILE = tween({ duration: 600, easing: [0.34, 1.56, 0.64, 1] });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const isInt = (v: unknown, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < hi;
const keyOf = (s: State, r: number, c: number) => r * s.days.length + c;
const count = (s: State, k: number) => {
  const D = s.days.length;
  return (s.counts[Math.floor(k / D)]?.[k % D] ?? 0) + Object.values(s.free).filter((f) => f.includes(k)).length;
};
const best = (s: State): number | null => {
  let top: number | null = null;
  let hi = 0;
  for (let k = 0; k < s.days.length * s.times.length; k++) {
    const n = count(s, k);
    if (n > hi) {
      hi = n;
      top = k;
    }
  }
  return top;
};
const longDay = (d: string) => LONG[d] ?? d;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Text color for a fill: whichever of two theme colors has the higher contrast with it.
const parse = (col: string): number[] => {
  if (col[0] === "#") {
    const h = col.length === 4 ? col.slice(1).replace(/./g, "$&$&") : col.slice(1, 7);
    const n = parseInt(h, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = col.match(/[\d.]+/g) ?? [];
  return [0, 1, 2].map((i) => Number(m[i] ?? 0));
};
const lum = (col: string) => {
  const [r, g, b] = parse(col).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

export default defineApp<State, Action, Local>({
  name: "Weekly meeting",
  summary: (s) => {
    if (s.lock) return `${s.group} meets every ${longDay(s.days[s.lock.c]!)} at ${s.times[s.lock.r]}`;
    const k = best(s);
    if (k === null) return `${s.group}: nobody has picked times yet`;
    return `${s.group}: best so far ${s.days[k % s.days.length]} ${s.times[Math.floor(k / s.days.length)]}, ${count(s, k)} of ${s.members} free`;
  },

  init: (ctx) => {
    const days = P.days.map((d) => clean(d, 5)).filter(Boolean).slice(0, 7);
    if (!days.length) days.push("Mon", "Tue", "Wed", "Thu", "Fri");
    const times = P.times.map((t) => clean(t, 6)).filter(Boolean).slice(0, 6);
    if (!times.length) times.push("6pm", "7pm", "8pm");
    const members = typeof P.members === "number" && Number.isInteger(P.members) ? Math.max(1, Math.min(100_000, P.members)) : 31;
    const counts = times.map((_t, r) =>
      days.map((_d, c) => {
        const v = P.counts?.[r]?.[c];
        return typeof v === "number" && Number.isInteger(v) ? Math.max(0, Math.min(members, v)) : 0;
      }),
    );
    const free: { [user: string]: number[] } = {};
    for (const p of P.people) {
      const want = clean(p.name, 40).toLowerCase();
      const m = ctx.members.find((x) => x.id === p.name || (x.name ?? "").toLowerCase() === want);
      if (!m) continue;
      const keys = new Set<number>();
      for (const f of p.free ?? []) {
        const w = clean(f, 12).toLowerCase();
        for (let r = 0; r < times.length; r++) for (let c = 0; c < days.length; c++) if (`${days[c]} ${times[r]}`.toLowerCase() === w) keys.add(r * days.length + c);
      }
      if (keys.size) free[m.id] = [...keys].sort((a, b) => a - b);
    }
    return { group: clean(P.group, 40) || "This group", members, place: clean(P.place, 30), starts: clean(P.starts, 20), days, times, counts, free, lock: null };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "toggle") {
      if (s.lock !== null || !isInt(a.r, s.times.length) || !isInt(a.c, s.days.length)) return s;
      const k = keyOf(s, a.r, a.c);
      const mine = s.free[m.user] ?? [];
      const next = mine.includes(k) ? mine.filter((x) => x !== k) : [...mine, k].sort((x, y) => x - y);
      const free = { ...s.free };
      if (next.length) free[m.user] = next;
      else delete free[m.user];
      return { ...s, free };
    }
    if (a.t === "lock") {
      const k = best(s);
      if (s.lock !== null || k === null) return s;
      return { ...s, lock: { r: Math.floor(k / s.days.length), c: k % s.days.length, by: m.user, at: m.time } };
    }
    if (a.t === "unlock") {
      if (s.lock === null || s.lock.by !== m.user) return s;
      return { ...s, lock: null };
    }
    return s;
  },

  onMembers: (s, ctx) => (Object.keys(s.free).every((u) => inChat(ctx, u)) ? s : { ...s, free: Object.fromEntries(Object.entries(s.free).filter(([u]) => inChat(ctx, u))) }),

  invariants: {
    "free times are real cells, once each, sorted": (s) =>
      Object.values(s.free).every((f) => f.length > 0 && f.every((k, i) => Number.isInteger(k) && k >= 0 && k < s.days.length * s.times.length && (i === 0 || f[i - 1]! < k))),
    "only chat members have free times": (s, ctx) => Object.keys(s.free).every((u) => inChat(ctx, u)),
    "the lock is on a real cell": (s) => s.lock === null || (isInt(s.lock.r, s.times.length) && isInt(s.lock.c, s.days.length) && count(s, keyOf(s, s.lock.r, s.lock.c)) > 0),
    "no cell counts more people than the group": (s, ctx) => {
      for (let k = 0; k < s.days.length * s.times.length; k++) if (count(s, k) > s.members + ctx.members.length) return false;
      return true;
    },
  },

  transitions: {
    "a toggle flips only the actor's cell": (p, n, a, m, ctx) => {
      if (a.t !== "toggle") return true;
      if (p === n) return p.lock !== null || !inChat(ctx, m.user) || !isInt(a.r, p.times.length) || !isInt(a.c, p.days.length);
      const k = keyOf(p, a.r, a.c);
      const users = new Set([...Object.keys(p.free), ...Object.keys(n.free)]);
      return p.lock === null && [...users].every((u) => (u === m.user ? (p.free[u] ?? []).includes(k) !== (n.free[u] ?? []).includes(k) && JSON.stringify((p.free[u] ?? []).filter((x) => x !== k)) === JSON.stringify((n.free[u] ?? []).filter((x) => x !== k)) : JSON.stringify(p.free[u]) === JSON.stringify(n.free[u])));
    },
    "lock takes the best cell": (p, n, a, m, ctx) => {
      if (a.t !== "lock") return true;
      if (p === n) return p.lock !== null || best(p) === null || !inChat(ctx, m.user);
      return p.lock === null && n.lock !== null && n.lock.by === m.user && n.lock.at === m.time && keyOf(n, n.lock.r, n.lock.c) === best(p);
    },
    "only the person who locked can unlock": (p, n, a, m, ctx) => {
      if (a.t !== "unlock") return true;
      if (p === n) return p.lock === null || p.lock.by !== m.user || !inChat(ctx, m.user);
      return p.lock?.by === m.user && n.lock === null;
    },
    "a locked board does not change": (p, n, a) => p.lock === null || a.t === "unlock" || JSON.stringify(p.free) === JSON.stringify(n.free),
    "the heatmap base never changes": (p, n) => JSON.stringify([p.counts, p.days, p.times]) === JSON.stringify([n.counts, n.days, n.times]),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.lock === null) {
      if (k < 0.75) return { t: "toggle", r: r.int(s.times.length), c: r.int(s.days.length) };
      return k < 0.9 ? { t: "lock" } : { t: "unlock" };
    }
    if (k < 0.6) return { t: "unlock" };
    return { t: "toggle", r: r.int(s.times.length), c: r.int(s.days.length) };
  },

  local: { sel: -1 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal, pending }) => {
    const c = theme.color;
    const W = Math.min(innerWidth(), theme.width - 24);
    const D = state.days.length;
    const T = state.times.length;
    const cw = (W - 44) / D;
    const gridH = Math.max(22 + 34 * T + 4, 140);
    const top = best(state);
    const lock = confirmed.lock;
    const lockE = lock ? running(lock.at, 600) : null;
    const lp = lock ? (lockE === null ? 1 : TILE(lockE)) : 0;
    const dim = clamp01(lp);
    const maxCount = Math.max(0, ...state.counts.flat(), ...Array.from({ length: D * T }, (_, k) => count(state, k)));
    const myFree = state.free[me] ?? [];
    const chatFree = (k: number) => {
      const ids = members.filter((m) => (state.free[m.id] ?? []).includes(k)).map((m) => m.id);
      return [...ids.filter((u) => u === me), ...ids.filter((u) => u !== me)];
    };
    const shownKey = state.lock ? keyOf(state, state.lock.r, state.lock.c) : local.sel >= 0 && local.sel < D * T ? local.sel : top;
    const kDay = (k: number) => state.days[k % D]!;
    const kTime = (k: number) => state.times[Math.floor(k / D)]!;

    const cells = [];
    for (let r = 0; r < T; r++) {
      for (let ci = 0; ci < D; ci++) {
        const k = r * D + ci;
        const n = count(state, k);
        const heat = clamp01((n - 4) / Math.max(8, maxCount - 2));
        let base = mix(mix(c.card, c.wash, 0.3), c.primary, 0.08 + heat * 0.92);
        const ink = contrast(c.text, base) >= contrast(c.card, base) ? c.text : c.card;
        // A mid blue can fail both inks: nudge the fill away from the ink until it reads.
        for (let i = 0; i < 12 && contrast(ink, base) < 4.6; i++) base = mix(base, ink === c.text ? c.card : c.text, 0.06);
        const fill = lock ? mix(base, c.card, 0.7 * dim) : base;
        const mineHere = myFree.includes(k);
        const isLocked = !!lock && lock.r === r && lock.c === ci;
        const selected = !lock && shownKey === k;
        const left = 40 + ci * cw + 2;
        const topPx = 22 + r * 34 + 2;
        cells.push(
          <button
            key={k}
            class="mt-cell"
            aria-label={`${state.days[ci]} ${state.times[r]}, ${n} free${mineHere ? ", you" : ""}`}
            aria-disabled={state.lock ? "true" : undefined}
            onClick={(e: { currentTarget: HTMLElement }) => {
              if (state.lock) return;
              dispatch({ t: "toggle", r, c: ci });
              setLocal({ sel: k });
              haptic("light");
              e.currentTarget.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 350 });
            }}
            style={{
              position: "absolute", left, top: topPx, width: cw - 4, height: 30, margin: 0, padding: 0, minHeight: 0, minWidth: 0, border: 0, borderRadius: 8,
              background: fill, color: ink, font: "inherit", fontSize: 15, fontWeight: 700, cursor: state.lock ? "default" : "pointer",
              boxShadow: selected ? `inset 0 0 0 1.5px ${c.text}` : "none", visibility: isLocked ? "hidden" : "visible",
            }}
          >
            <span style={{ opacity: 1 - dim, fontSize: cw < 40 ? 13 : 15, lineHeight: "20px" }}>{n}</span>
            {mineHere ? (
              <span
                key={`me${k}`}
                ref={(el: HTMLElement | null) => el?.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.34,1.56,.64,1)" })}
                style={{ position: "absolute", right: 2.5, top: 2.5, width: 11, height: 11, borderRadius: 6, boxShadow: `0 0 0 1.5px ${fill}`, opacity: 1 - dim, display: "block" }}
              >
                <span style={{ display: "block", width: 11, height: 11, borderRadius: 6, background: userColor(me, theme) }} />
              </span>
            ) : null}
          </button>,
        );
        if (!lock && top === k) {
          cells.push(
            <span
              key={`ring${k}`}
              aria-hidden="true"
              ref={(el: HTMLElement | null) => el?.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.15)", opacity: 0 }], { duration: 1400, iterations: Infinity })}
              style={{ position: "absolute", left, top: topPx, width: cw - 4, height: 30, boxSizing: "border-box", borderRadius: 9, border: `1.5px solid ${c.primary}`, pointerEvents: "none" }}
            />,
          );
        }
      }
    }

    const tile = () => {
      if (!lock) return null;
      const w0 = cw - 4;
      const x0 = 40 + lock.c * cw + 2;
      const y0 = 22 + lock.r * 34 + 2;
      const w1 = 150;
      const h1 = 110;
      const x1 = W / 2 + 20 - w1 / 2;
      const y1 = gridH / 2 + 10 - h1 / 2;
      const q = lp;
      const k = keyOf(state, lock.r, lock.c);
      const fade = clamp01((q - 0.5) * 2);
      const w = w0 + (w1 - w0) * q;
      const h = Math.max(0, 30 + (h1 - 30) * q);
      return (
        <div
          style={{ position: "absolute", left: x0 + (x1 - x0) * q, top: y0 + (y1 - y0) * q, width: Math.max(0, w), height: h, borderRadius: 12, background: c.wash, overflow: "hidden", boxShadow: `inset 0 0 0 1px ${c.divider}` }}
        >
          <div style={{ height: "28%", background: c.negative, display: "flex", alignItems: "center", justifyContent: "center", color: [c.onPrimary, c.text, c.card].reduce((a, b) => (contrast(b, c.negative) > contrast(a, c.negative) ? b : a)), fontSize: 14, fontWeight: 600 }}>Every</div>
          <div style={{ opacity: fade, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 4, minWidth: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: "30px", color: c.text, whiteSpace: "nowrap" }}>{longDay(state.days[lock.c]!)}</span>
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{`${state.times[lock.r]} · ${state.place}`}</span>
            <Facepile users={chatFree(k)} max={8} size={16} />
          </div>
        </div>
      );
    };

    const shown = shownKey === null ? null : shownKey;
    const faces = shown === null ? [] : chatFree(shown);
    const line = state.lock
      ? `${count(state, keyOf(state, state.lock.r, state.lock.c))} going${state.starts ? ` · starts ${state.starts}` : ""} · on the group calendar`
      : shown === null
        ? `${state.members} members · nobody has picked times yet`
        : `${shown === top ? "Best · " : ""}${kDay(shown)} ${kTime(shown)} · ${count(state, shown)} of ${state.members} free`;
    const lockingNow = pending && state.lock !== null && confirmed.lock === null;
    const toast = lock && running(lock.at, 2400) !== null ? lock : null;

    return (
      <div>
        <CardHeader title="Weekly meeting" subtitle={`${state.group} · ${state.members} members`} />
        <style>{".mt-cell::after{content:\"\";position:absolute;left:0;right:0;top:-7px;bottom:-7px}"}</style>
        <div style={{ position: "relative", height: gridH }}>
          {state.days.map((d, ci) => (
            <span key={d + ci} style={{ position: "absolute", left: 40 + ci * cw, width: cw, top: 0, height: 22, lineHeight: "22px", textAlign: "center", fontSize: 13, color: !lock && top !== null && top % D === ci ? c.text : c.secondaryText }}>{d}</span>
          ))}
          {state.times.map((t, r) => (
            <span key={t + r} style={{ position: "absolute", left: 0, width: 32, textAlign: "right", top: 22 + r * 34, height: 34, lineHeight: "34px", fontSize: 13, color: c.secondaryText }}>{t}</span>
          ))}
          {cells}
          {tile()}
        </div>
        <div style={{ height: 8 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, minWidth: 0 }}>
          {faces.length ? <Facepile users={faces} max={5} size={22} /> : null}
          <span style={{ fontSize: 14, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{line}</span>
        </div>
        <div style={{ height: 8 }} />
        <div style={{ height: 40, display: "flex", alignItems: "center" }}>
          {lock ? (
            <div style={{ flex: 1, height: 36, borderRadius: 8, background: c.secondaryButton, display: "flex", alignItems: "center", gap: 8, paddingLeft: 15, minWidth: 0 }}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={c.positive} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M2.5 6.2 5 8.6l4.5-5" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 600, color: c.text, flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Added to ${state.group} events`}</span>
              {lock.by === me ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unlock" })}>Unlock</Button>
              ) : null}
            </div>
          ) : lockingNow ? (
            <Button kind="secondary" wide disabled>Locking</Button>
          ) : top !== null ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                dispatch({ t: "lock" });
                haptic("success");
              }}
            >
              Lock time
            </Button>
          ) : (
            <span style={{ fontSize: 14, color: c.secondaryText }}>Tap the times you're free</span>
          )}
        </div>
        {toast ? <Toast key={toast.at}>{`It's a plan · every ${state.days[toast.c]} ${state.times[toast.r]}`}</Toast> : null}
      </div>
    );
  },
});
