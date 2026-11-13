import { defineApp, Avatar, Button, CardHeader, Canvas, SystemLine, Toast, tween, userColor } from "@muse/app";

// Settle up: many IOUs between many people go in ("Priya paid the Airbnb for everyone", "Sam
// paid gas"), the fewest payments that clear every balance come out. Untangle turns the knot of
// IOUs into a few clean arrows; each arrow is marked paid by the person paying or being paid.
//
// Money is integer cents. An IOU splits evenly across who it was for, sorted by id, and the first
// people pay the leftover cents, so every balance nets to exactly zero across the group. The plan
// is the provable minimum: the balances are split into the most groups that each sum to zero, and
// a group of k people settles in k - 1 payments (no plan can do better).

type Params = {
  /** Card title, what the money was for: "Nashville trip" */
  title: string;
  /**
   * The IOUs from the chat. paidBy and forWho are names exactly as in the members list.
   * cents: the amount ($840 -> 84000). forWho: who it was for, payer included if they shared it;
   * empty means everyone in the chat.
   */
  ious: { paidBy: string; label: string; cents: number; forWho: string[] }[];
};

// @params
const P: Params = {
  title: "Nashville trip",
  ious: [
    { paidBy: "Priya", label: "Airbnb", cents: 84000, forWho: [] },
    { paidBy: "Sam", label: "Gas", cents: 9600, forWho: [] },
    { paidBy: "Leo", label: "Groceries", cents: 7240, forWho: [] },
    { paidBy: "Leo", label: "Ubers", cents: 3850, forWho: ["Leo", "Ana", "Kev"] },
    { paidBy: "Kev", label: "Bar tab", cents: 6100, forWho: ["Kev", "Sam", "Leo"] },
    { paidBy: "Ana", label: "Hattie B's", cents: 8820, forWho: ["Ana", "Priya", "Sam", "Leo"] },
  ],
};
// @end params

type Iou = { id: string; by: string; label: string; cents: number; for: string[] };
type Pay = { from: string; to: string; cents: number };
type Transfer = { from: string; to: string; cents: number; paid: boolean };
/** plan: the payments from the latest untangle, or null before it (and after a new IOU). */
type State = { title: string; ious: Iou[]; payments: Pay[]; plan: Transfer[] | null; at: number; by: string };
type Action = { t: "add"; label: string; cents: number; for?: string[] } | { t: "untangle" } | { t: "paid"; i: number };
type Local = { adding: boolean; amount: string; label: string; toast: number };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_CENTS = 10_000_000;
const MAX_IOUS = 20;
const SPIN_MS = 1400;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+$)/g, ",")}.${String(c % 100).padStart(2, "0")}`;
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- Reducer side ----

/** Each person's balance in cents: positive is owed money, negative owes. */
function ledger(s: State): Map<string, number> {
  const bal = new Map<string, number>();
  const add = (u: string, c: number) => bal.set(u, (bal.get(u) ?? 0) + c);
  for (const iou of s.ious) {
    const n = iou.for.length;
    const base = Math.floor(iou.cents / n), extra = iou.cents % n;
    add(iou.by, iou.cents);
    iou.for.forEach((u, i) => add(u, -(base + (i < extra ? 1 : 0))));
  }
  for (const p of s.payments) (add(p.from, p.cents), add(p.to, -p.cents));
  return bal;
}

/** The fewest payments that clear the balances: most zero-sum groups, then largest-first inside each. */
function untangle(bal: Map<string, number>): Transfer[] {
  const people = [...bal.entries()].filter(([, c]) => c !== 0).sort((a, b) => byId(a[0], b[0]));
  const n = people.length;
  if (n === 0) return [];
  const groups: [string, number][][] = [];
  if (n <= 12) {
    const full = (1 << n) - 1;
    const sum = new Array<number>(1 << n).fill(0);
    for (let m = 1; m <= full; m++) {
      const low = m & -m;
      sum[m] = sum[m ^ low]! + people[31 - Math.clz32(low)]![1];
    }
    // most[m]: the most zero-sum groups that partition m (m itself sums to zero).
    const most = new Array<number>(1 << n).fill(-1);
    most[0] = 0;
    for (let m = 1; m <= full; m++) {
      if (sum[m] !== 0) continue;
      const low = m & -m;
      for (let sub = m; sub > 0; sub = (sub - 1) & m) {
        if (!(sub & low) || sum[sub] !== 0 || most[m ^ sub]! < 0) continue;
        most[m] = Math.max(most[m]!, most[m ^ sub]! + 1);
      }
    }
    let m = full;
    while (m) {
      const low = m & -m;
      let pick = m;
      for (let sub = low; sub <= m; sub++) {
        if ((sub & m) !== sub || !(sub & low) || sum[sub] !== 0 || most[m ^ sub]! !== most[m]! - 1) continue;
        pick = sub;
        break;
      }
      groups.push(people.filter((_, i) => pick & (1 << i)));
      m ^= pick;
    }
  } else groups.push(people);
  const out: Transfer[] = [];
  for (const g of groups) {
    const left = new Map(g);
    for (;;) {
      const owe = [...left.entries()].filter(([, c]) => c < 0).sort((a, b) => a[1] - b[1] || byId(a[0], b[0]))[0];
      const get = [...left.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))[0];
      if (!owe || !get) break;
      const cents = Math.min(-owe[1], get[1]);
      out.push({ from: owe[0], to: get[0], cents, paid: false });
      left.set(owe[0], owe[1] + cents);
      left.set(get[0], get[1] - cents);
    }
  }
  return out;
}

function reduceSettle(s: State, a: Record<string, unknown>, user: string, meta: { seq: number; time: number }, ctx: Ctx): State {
  if (a.t === "add") {
    const cents = a.cents;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || cents > MAX_CENTS || typeof a.label !== "string") return s;
    const label = a.label.trim().replace(/\s+/g, " ").slice(0, 30);
    const raw = Array.isArray(a.for) ? a.for : ctx.members.map((m) => m.id);
    const forWho = [...new Set(raw.filter((u): u is string => typeof u === "string" && inChat(ctx, u)))].sort(byId);
    if (!label || s.ious.length >= MAX_IOUS || forWho.every((u) => u === user)) return s;
    return { ...s, ious: [...s.ious, { id: `i${meta.seq}`, by: user, label, cents, for: forWho }], plan: null, at: 0, by: "" };
  }
  if (a.t === "untangle") {
    if (s.plan !== null) return s;
    const plan = untangle(ledger(s));
    if (plan.length === 0) return s;
    return { ...s, plan, at: meta.time, by: user };
  }
  if (a.t === "paid") {
    const i = a.i;
    if (!s.plan || typeof i !== "number" || !Number.isInteger(i)) return s;
    const tr = s.plan[i];
    if (!tr || tr.paid || (user !== tr.from && user !== tr.to)) return s;
    return {
      ...s,
      plan: s.plan.map((x, j) => (j === i ? { ...x, paid: true } : x)),
      payments: [...s.payments, { from: tr.from, to: tr.to, cents: tr.cents }],
    };
  }
  return s;
}

// ---- Check side (separate from the reducer's helpers so mutants cannot change both) ----

function balances(s: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const iou of s.ious) {
    out[iou.by] = (out[iou.by] ?? 0) + iou.cents;
    const each = Math.floor(iou.cents / iou.for.length);
    iou.for.forEach((u, i) => (out[u] = (out[u] ?? 0) - each - (i < iou.cents - each * iou.for.length ? 1 : 0)));
  }
  for (const p of s.payments) {
    out[p.from] = (out[p.from] ?? 0) + p.cents;
    out[p.to] = (out[p.to] ?? 0) - p.cents;
  }
  return out;
}

/** The fewest payments any plan needs: nonzero people minus the most zero-sum groups (dp over subsets). */
function fewest(bal: Record<string, number>): number {
  const v = Object.values(bal).filter((c) => c !== 0);
  const n = v.length;
  if (n > 12) return n - 1;
  const size = 1 << n;
  const sum = new Array<number>(size).fill(0);
  const best = new Array<number>(size).fill(0);
  for (let m = 1; m < size; m++) {
    let top = 0;
    for (let i = 0; i < n; i++)
      if (m & (1 << i)) {
        sum[m] = sum[m ^ (1 << i)]! + v[i]!;
        top = Math.max(top, best[m ^ (1 << i)]!);
      }
    best[m] = top + (sum[m] === 0 ? 1 : 0);
  }
  return n - best[size - 1]!;
}

/** What is still open in the plan, per person: the balance after every unpaid arrow is paid. */
function afterPlan(s: State): Record<string, number> {
  const out = balances(s);
  for (const t of s.plan ?? [])
    if (!t.paid) {
      out[t.from] = (out[t.from] ?? 0) + t.cents;
      out[t.to] = (out[t.to] ?? 0) - t.cents;
    }
  return out;
}

const sameIous = (p: State, n: State) => JSON.stringify(p.ious) === JSON.stringify(n.ious);
const samePays = (p: State, n: State) => JSON.stringify(p.payments) === JSON.stringify(n.payments);

export default defineApp<State, Action, Local>({
  name: "Settle up",
  summary: (s) => {
    if (!s.plan) return `${s.title}: ${s.ious.length} IOUs to settle.`;
    const left = s.plan.filter((t) => !t.paid).length;
    return left ? `${s.title}: ${left} of ${s.plan.length} payments left.` : `${s.title}: everyone is square.`;
  },

  // Names in the IOUs are matched to the chat; init reruns with the member list until someone acts.
  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.trim().toLowerCase())?.id;
    const ious: Iou[] = [];
    P.ious.forEach((x, i) => {
      const by = idOf(x.paidBy);
      const cents = Number.isInteger(x.cents) && x.cents > 0 && x.cents <= MAX_CENTS ? x.cents : 0;
      const forWho = [...new Set(x.forWho.length ? x.forWho.map(idOf).filter((u): u is string => !!u) : ctx.members.map((m) => m.id))].sort(byId);
      if (!by || !cents || !x.label.trim() || forWho.every((u) => u === by) || ious.length >= MAX_IOUS) return;
      ious.push({ id: `p${i}`, by, label: x.label.trim().slice(0, 30), cents, for: forWho });
    });
    return { title: P.title.trim().slice(0, 60) || "Settle up", ious, payments: [], plan: null, at: 0, by: "" };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceSettle(state, action as unknown as Record<string, unknown>, meta.user, meta, ctx) : state),

  // Someone left: they come off the ledger (their IOUs, their shares and payments with them), and
  // the plan is cleared because the balances moved. Someone joined: they can add an IOU at once.
  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const ious = state.ious
      .filter((i) => here(i.by))
      .map((i) => (i.for.every(here) ? i : { ...i, for: i.for.filter(here) }))
      .filter((i) => i.for.some((u) => u !== i.by));
    const payments = state.payments.filter((p) => here(p.from) && here(p.to));
    const moved = ious.length !== state.ious.length || payments.length !== state.payments.length || ious.some((x, k) => x !== state.ious[k]);
    return moved ? { ...state, ious, payments, plan: null, at: 0, by: "" } : state;
  },

  invariants: {
    "money is whole cents and every IOU is split across someone": (s) =>
      s.ious.every((i) => Number.isInteger(i.cents) && i.cents > 0 && i.for.length > 0 && new Set(i.for).size === i.for.length) &&
      s.payments.every((p) => Number.isInteger(p.cents) && p.cents > 0),
    "every IOU is for someone besides its payer": (s) => s.ious.every((i) => i.for.some((u) => u !== i.by)),
    "balances add up to zero": (s) => Object.values(balances(s)).reduce((a, c) => a + c, 0) === 0,
    "the open plan clears every balance exactly": (s) => s.plan === null || Object.values(afterPlan(s)).every((c) => c === 0),
    "every arrow moves money between two different people": (s) => (s.plan ?? []).every((t) => t.from !== t.to && Number.isInteger(t.cents) && t.cents > 0),
    "no plan means no untangle time": (s) => (s.plan === null) === (s.at === 0 && s.by === ""),
    "everyone on the ledger is in the chat": (s, ctx) =>
      [...s.ious.flatMap((i) => [i.by, ...i.for]), ...s.payments.flatMap((p) => [p.from, p.to]), ...(s.plan ?? []).flatMap((t) => [t.from, t.to])].every((u) => inChat(ctx, u)),
    "at most 20 IOUs, each id once": (s) => s.ious.length <= MAX_IOUS && new Set(s.ious.map((i) => i.id)).size === s.ious.length,
  },

  transitions: {
    "an IOU goes on the end, paid by the actor, and clears the plan": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.ious.at(-1);
      return n.ious.length === p.ious.length + 1 && last?.by === m.user && last.cents === a.cents && last.id === `i${m.seq}` && n.plan === null && samePays(p, n) && p.ious.every((x, i) => n.ious[i] === x);
    },
    "untangle makes the fewest payments that clear everything": (p, n, a, m) => {
      if (a.t !== "untangle" || p === n) return true;
      return p.plan === null && n.plan !== null && n.plan.length === fewest(balances(p)) && n.plan.every((t) => !t.paid) && n.at === m.time && n.by === m.user && sameIous(p, n) && samePays(p, n);
    },
    "a payment is marked by the payer or the person paid, once": (p, n, a, m) => {
      if (a.t !== "paid" || p === n) return true;
      const before = p.plan?.[a.i];
      const pay = n.payments.at(-1);
      return (
        !!before && !before.paid && (m.user === before.from || m.user === before.to) && n.plan?.[a.i]?.paid === true &&
        n.plan.every((t, j) => j === a.i || JSON.stringify(t) === JSON.stringify(p.plan![j])) &&
        n.payments.length === p.payments.length + 1 && pay?.from === before.from && pay.to === before.to && pay.cents === before.cents && sameIous(p, n)
      );
    },
    "a payment the payer or payee marks is never refused": (p, n, a, m, ctx) => {
      if (a.t !== "paid" || !inChat(ctx, m.user) || !p.plan) return true;
      const t = p.plan[a.i];
      return !t || t.paid || (m.user !== t.from && m.user !== t.to) || p !== n;
    },
    "untangle is never refused while someone owes money and there is no plan": (p, n, a, m, ctx) =>
      a.t !== "untangle" || !inChat(ctx, m.user) || p.plan !== null || Object.values(balances(p)).every((c) => c === 0) || p !== n,
    "only people in the chat change the ledger": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    if (s.plan && k < 0.6) {
      const mine = s.plan.map((t, i) => ({ t, i })).filter((x) => !x.t.paid && (x.t.from === user || x.t.to === user));
      return { t: "paid", i: mine.length && r.next() < 0.8 ? r.pick(mine).i : r.int(s.plan.length + 1) };
    }
    if (!s.plan && k < 0.45) return { t: "untangle" };
    const some = ctx.members.filter(() => r.next() < 0.7).map((m) => m.id);
    return { t: "add", label: r.pick(["Gas", "Parking", "Snacks", "Tickets"]), cents: r.int(20000) + 1, ...(r.next() < 0.5 ? { for: some } : {}) };
  },

  local: { adding: false, amount: "", label: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const ids = members.map((m) => m.id);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const bal = balances(state);
    const mine = bal[me] ?? 0;
    const plan = state.plan;
    const left = plan ? plan.filter((t) => !t.paid) : [];
    const cents = (() => {
      const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(local.amount.trim().replace(/,/g, ""));
      return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : 0;
    })();
    const ease = tween({ duration: SPIN_MS, easing: "easeInOut" });

    // People sit on an oval; IOUs are curved threads from who owes to who paid.
    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const n = Math.max(1, ids.length);
      const cx = f.width / 2, cy = f.height / 2, rx = Math.min(f.width / 2 - 26, 150), ry = f.height / 2 - 20;
      const at = (u: string) => {
        const i = Math.max(0, ids.indexOf(u));
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
      };
      const t = plan ? ease(f.now - state.at) : 0;
      // Threads fade and pull toward the middle as the arrows come in.
      g.lineWidth = 1.5;
      state.ious.forEach((iou, k) => {
        const to = at(iou.by);
        iou.for.forEach((u) => {
          if (u === iou.by) return;
          const from = at(u);
          const bend = ((k % 3) - 1) * 40 + 20;
          const mx = (from.x + to.x) / 2 + (cy - (from.y + to.y) / 2) * 0.3 + bend * (1 - t);
          const my = (from.y + to.y) / 2 + bend * 0.6 * (1 - t);
          g.globalAlpha = 0.45 * (1 - t);
          g.strokeStyle = userColor(iou.by, theme);
          g.beginPath();
          g.moveTo(from.x, from.y);
          g.quadraticCurveTo(mx * (1 - t) + cx * t, my * (1 - t) + cy * t, to.x, to.y);
          g.stroke();
        });
      });
      g.globalAlpha = 1;
      // Clean arrows grow from payer to payee.
      if (plan)
        plan.forEach((tr, k) => {
          const grow = Math.max(0, Math.min(1, t * plan.length - k * 0.5));
          if (grow <= 0) return;
          const a = at(tr.from), b = at(tr.to);
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
          const sx = a.x + ux * 18, sy = a.y + uy * 18;
          const ex = sx + (len - 36) * grow * ux, ey = sy + (len - 36) * grow * uy;
          g.strokeStyle = tr.paid ? theme.color.positive : theme.color.primary;
          g.fillStyle = g.strokeStyle;
          g.lineWidth = tr.from === me || tr.to === me ? 3 : 2;
          g.setLineDash(tr.paid ? [4, 4] : []);
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(ex, ey);
          g.stroke();
          g.setLineDash([]);
          g.beginPath();
          g.moveTo(ex, ey);
          g.lineTo(ex - ux * 9 - uy * 5, ey - uy * 9 + ux * 5);
          g.lineTo(ex - ux * 9 + uy * 5, ey - uy * 9 - ux * 5);
          g.closePath();
          g.fill();
        });
      ids.forEach((u) => {
        const p = at(u);
        g.beginPath();
        g.arc(p.x, p.y, 15, 0, Math.PI * 2);
        g.fillStyle = userColor(u, theme);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = theme.color.card;
        g.stroke();
        g.fillStyle = theme.color.onPrimary;
        g.font = "600 13px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText((members.find((m) => m.id === u)?.name.trim()[0] ?? "?").toUpperCase(), p.x, p.y + 1);
      });
      return !!plan && f.now - state.at < SPIN_MS;
    };

    const shown = plan ? [...plan.map((t, i) => ({ t, i }))].sort((a, b) => Number(a.t.paid) - Number(b.t.paid) || Number(b.t.from === me || b.t.to === me) - Number(a.t.from === me || a.t.to === me)) : [];
    const rows = shown.slice(0, shown.length > 4 ? 3 : 4);
    const firstMine = rows.find((x) => !x.t.paid && x.t.from === me);
    const threads = state.ious.reduce((n, i) => n + i.for.filter((u) => u !== i.by).length, 0);
    const save = () => {
      if (cents > 0 && local.label.trim()) {
        dispatch({ t: "add", label: local.label, cents });
        setLocal({ adding: false, amount: "", label: "", toast: local.toast + 1 });
      }
    };

    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={
            plan
              ? left.length
                ? `${plan.length} payments settle ${state.ious.length} IOUs`
                : "Everyone is square"
              : `${state.ious.length} IOUs · ${mine > 0 ? `you're owed ${money(mine)}` : mine < 0 ? `you owe ${money(-mine)}` : "you're even"}`
          }
        />
        <Canvas height={124} draw={draw} label={plan ? `${plan.length} payments between ${ids.length} people` : `${threads} IOUs between ${ids.length} people`} />
        {plan ? (
          <div style={{ display: "grid", gap: 0, marginTop: 4 }}>
            {rows.map(({ t, i }) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44}}>
                <Avatar user={t.from} size={28} />
                <span aria-hidden="true" style={{ color: theme.color.secondaryText }}>
                  →
                </span>
                <Avatar user={t.to} size={28} />
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b style={{ fontWeight: 600 }}>{money(t.cents)}</b>{" "}
                  <small>
                    {nameOf(t.from)} to {nameOf(t.to).replace("You", "you")}
                  </small>
                </div>
                {t.paid ? (
                  <small style={{ fontWeight: 600, color: theme.color.positive }}>Paid</small>
                ) : t.from === me || t.to === me ? (
                  <Button kind={firstMine && firstMine.i === i ? "primary" : "secondary"} onClick={() => dispatch({ t: "paid", i })}>
                    {t.from === me ? "Paid" : "Got it"}
                  </Button>
                ) : null}
              </div>
            ))}
            {shown.length > rows.length ? <small style={{ textAlign: "center" }}>{`${shown.length - rows.length} more`}</small> : null}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0 0" }}>
            {state.ious.slice(0, state.ious.length > 5 ? 4 : 5).map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", minWidth: 0, padding: "2px 10px 2px 2px", borderRadius: 99, background: theme.color.input }}>
                <Avatar user={i.by} size={24} />
                <small style={{ color: theme.color.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${i.label} ${money(i.cents)}`}</small>
              </div>
            ))}
            {state.ious.length > 5 ? <small style={{ alignSelf: "center", padding: "0 4px" }}>{`${state.ious.length - 4} more`}</small> : null}
          </div>
        )}
        {local.adding ? (
          <form
            style={{ display: "grid", gridTemplateColumns: "1fr 96px auto", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input value={local.label} placeholder="What for" aria-label="What you paid for" onInput={(e) => setLocal({ label: e.currentTarget.value })} />
            <input value={local.amount} inputMode="decimal" placeholder="$0.00" aria-label="Amount" onInput={(e) => setLocal({ amount: e.currentTarget.value })} />
            <Button kind="primary" disabled={!cents || !local.label.trim()} onClick={save}>
              Add
            </Button>
          </form>
        ) : plan && !left.length ? (
          <SystemLine>All {plan.length} payments are done</SystemLine>
        ) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {!plan ? (
            <div style={{ flex: 1, display: "flex" }}>
              <Button kind={local.adding ? "secondary" : "primary"} wide disabled={!state.ious.length} onClick={() => dispatch({ t: "untangle" })}>
                Untangle
              </Button>
            </div>
          ) : null}
          <div style={{ flex: plan ? 1 : "none", display: "flex" }}>
            <Button wide={!!plan} onClick={() => setLocal({ adding: !local.adding })}>
              {local.adding ? "Cancel" : plan ? "Add IOU" : "Add"}
            </Button>
          </div>
        </div>
        {local.toast ? <Toast key={local.toast}>IOU added</Toast> : null}
      </div>
    );
  },
});
