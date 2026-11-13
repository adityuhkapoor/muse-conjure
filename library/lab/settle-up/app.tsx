import {
  defineApp,
  Button,
  CardHeader,
  Facepile,
  Graph,
  Locked,
  Progress,
  Burst,
  haptic,
  running,
  tween,
  type Ctx,
  type Meta,
} from "@muse/app";

// Settle up: a pile of IOUs comes in, the fewest payments that clear every balance come out.
// Tap an amount to mark it paid; your own marked payments go green and the last one locks the card.

type Params = {
  /** Name of the tab: "Nashville trip tab" */
  title: string;
  /** The IOUs from the chat. from/to are names as in the chat; cents are integer cents. */
  ious: { from: string; to: string; cents: number; why: string }[];
};

// @params
const P: Params = {
  title: "Nashville trip tab",
  ious: [
    { from: "Sam", to: "Priya", cents: 15000, why: "airbnb" },
    { from: "Ana", to: "Priya", cents: 14500, why: "airbnb" },
    { from: "Leo", to: "Priya", cents: 15000, why: "airbnb" },
    { from: "Mo", to: "Priya", cents: 15000, why: "airbnb" },
    { from: "Priya", to: "Sam", cents: 4800, why: "gas" },
    { from: "Ana", to: "Leo", cents: 8400, why: "groceries+uber" },
    { from: "Priya", to: "Kev", cents: 8100, why: "bar" },
    { from: "Sam", to: "Mo", cents: 11000, why: "opry tix" },
    { from: "Kev", to: "Mo", cents: 4000, why: "opry tix" },
  ],
};
// @end params

/** id: member id when the name matched someone in the chat at init, else the name itself. */
type Person = { id: string; name: string };
type Iou = { id: string; from: string; to: string; cents: number; why: string };
/** paidBy: who marked it paid (null while unpaid); paidAt: meta.time of that mark, 0 while unpaid. */
type Pay = { id: string; from: string; to: string; cents: number; paidBy: string | null; paidAt: number };
/** plan: null until someone untangles; at: meta.time of the untangle, 0 before. */
type State = { title: string; people: Person[]; ious: Iou[]; plan: Pay[] | null; at: number };
type Action =
  | { t: "add"; from: string; to: string; cents: number; why: string }
  | { t: "untangle" }
  | { t: "pay"; id: string }
  | { t: "unpay"; id: string };
type Local = { adding: boolean; from: string; to: string; amount: string; why: string; bursts: number };
type Rec = Record<string, unknown>;

const MAX_IOUS = 24;
const MAX_PEOPLE = 12;
const MAX_CENTS = 1_000_000;
const UNTANGLE_MS = 1400;
const untangleMotion = tween({ duration: UNTANGLE_MS, easing: "standard" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);

/** A person's balance in cents: positive is owed money, negative owes it. */
function net(ious: Iou[], id: string): number {
  let n = 0;
  for (const iou of ious) {
    if (iou.to === id) n += iou.cents;
    if (iou.from === id) n -= iou.cents;
  }
  return n;
}

/** Smallest creditor first, largest debtor first; ties go to people order. */
function settle(s: State): Pay[] {
  const left = s.people.map((p) => ({ id: p.id, net: net(s.ious, p.id) }));
  const out: Pay[] = [];
  for (let guard = 0; guard < MAX_PEOPLE * MAX_PEOPLE; guard++) {
    let c = -1;
    let d = -1;
    for (let i = 0; i < left.length; i++) {
      const v = left[i]!.net;
      if (v > 0 && (c < 0 || v < left[c]!.net)) c = i;
      if (v < 0 && (d < 0 || v < left[d]!.net)) d = i;
    }
    if (c < 0 || d < 0) break;
    const x = Math.min(left[c]!.net, -left[d]!.net);
    out.push({ id: `s${out.length}`, from: left[d]!.id, to: left[c]!.id, cents: x, paidBy: null, paidAt: 0 });
    left[c]!.net -= x;
    left[d]!.net += x;
  }
  return out;
}

function parseCents(text: string): number {
  const s = text.trim().replace(/[$,\s]/g, "");
  const m = /^(\d{0,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return 0;
  const total = Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(total) ? total : 0;
}

// ---- Reducer side ----

function reduceSettle(s: State, a: Rec, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;

  if (a.t === "add") {
    const from = a.from;
    const to = a.to;
    const cents = a.cents;
    if (s.plan !== null || s.ious.length >= MAX_IOUS) return s;
    if (typeof from !== "string" || typeof to !== "string" || typeof a.why !== "string") return s;
    if (from === to || typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || cents > MAX_CENTS) return s;
    const resolve = (id: string): Person | null => {
      const person = s.people.find((p) => p.id === id);
      if (person) return person;
      const member = ctx.members.find((m) => m.id === id);
      return member ? { id: member.id, name: member.name } : null;
    };
    const owes = resolve(from);
    const owed = resolve(to);
    if (!owes || !owed) return s;
    const fresh: Person[] = [];
    if (!s.people.some((p) => p.id === owes.id)) fresh.push(owes);
    if (!s.people.some((p) => p.id === owed.id) && !fresh.some((p) => p.id === owed.id)) fresh.push(owed);
    if (s.people.length + fresh.length > MAX_PEOPLE) return s;
    return {
      ...s,
      people: fresh.length ? [...s.people, ...fresh] : s.people,
      ious: [...s.ious, { id: `i${meta.seq}`, from: owes.id, to: owed.id, cents, why: a.why.trim().slice(0, 32) || "IOU" }],
    };
  }

  if (a.t === "untangle") {
    if (s.plan !== null || s.ious.length === 0) return s;
    return { ...s, plan: settle(s), at: meta.time };
  }

  if (a.t === "pay") {
    const id = a.id;
    if (s.plan === null || typeof id !== "string") return s;
    const pay = s.plan.find((x) => x.id === id);
    if (!pay || pay.paidBy !== null) return s;
    return { ...s, plan: s.plan.map((x) => (x.id === id ? { ...x, paidBy: meta.user, paidAt: meta.time } : x)) };
  }

  if (a.t === "unpay") {
    const id = a.id;
    if (s.plan === null || typeof id !== "string") return s;
    const pay = s.plan.find((x) => x.id === id);
    if (!pay || pay.paidBy === null || pay.paidBy !== meta.user) return s;
    return { ...s, plan: s.plan.map((x) => (x.id === id ? { ...x, paidBy: null, paidAt: 0 } : x)) };
  }

  return s;
}

// ---- Check side ----

const planNet = (plan: Pay[], id: string) => plan.reduce((n, p) => n + (p.to === id ? p.cents : 0) - (p.from === id ? p.cents : 0), 0);
const sameIous = (p: State, n: State) => JSON.stringify(p.ious) === JSON.stringify(n.ious);
const samePlanRows = (p: State, n: State) =>
  JSON.stringify((p.plan ?? []).map((x) => [x.id, x.from, x.to, x.cents])) === JSON.stringify((n.plan ?? []).map((x) => [x.id, x.from, x.to, x.cents]));

export default defineApp<State, Action, Local>({
  name: "Settle up",
  summary: (s) => {
    const count = s.plan?.length ?? 0;
    const paid = s.plan?.filter((x) => x.paidBy !== null).length ?? 0;
    if (s.plan === null) return `${s.title}: ${s.ious.length} IOUs, ${money(s.ious.reduce((n, x) => n + x.cents, 0))} between ${s.people.length} people`;
    if (s.plan.every((x) => x.paidBy !== null)) return `${s.title}: all settled up`;
    return `${s.title}: ${paid} of ${count} paid`;
  },

  init: (ctx) => {
    const title = typeof P.title === "string" ? P.title.trim().slice(0, 40) || "Settle up" : "Settle up";
    const raw = Array.isArray(P.ious) ? P.ious : [];
    const people: Person[] = [];
    const byName = new Map<string, string>();
    const used = new Set<string>();
    for (const iou of raw) {
      if (!iou || typeof iou.from !== "string" || typeof iou.to !== "string") continue;
      for (const name of [iou.from, iou.to]) {
        const key = name.toLowerCase();
        if (byName.has(key)) continue;
        if (people.length >= MAX_PEOPLE) break;
        const member = ctx.members.find((m) => !used.has(m.id) && (m.id === name || (m.name ?? "").toLowerCase() === key));
        if (member) used.add(member.id);
        const id = member ? member.id : name;
        if (!people.some((p) => p.id === id)) people.push({ id, name: member ? member.name : name });
        byName.set(key, id);
      }
    }
    const ious: Iou[] = [];
    raw.forEach((iou, i) => {
      if (ious.length >= MAX_IOUS) return;
      if (!iou || typeof iou.from !== "string" || typeof iou.to !== "string") return;
      if (!Number.isInteger(iou.cents) || iou.cents < 1 || iou.cents > MAX_CENTS) return;
      const from = byName.get(iou.from.toLowerCase());
      const to = byName.get(iou.to.toLowerCase());
      if (!from || !to || from === to) return;
      ious.push({ id: `p${i}`, from, to, cents: iou.cents, why: typeof iou.why === "string" ? iou.why.trim().slice(0, 32) : "" });
    });
    return { title, people, ious, plan: null, at: 0 };
  },

  reduce: (state, action, meta, ctx) => reduceSettle(state, action as unknown as Rec, meta, ctx),

  onMembers: (state) => state,

  invariants: {
    "IOUs are well formed": (s) =>
      s.ious.length <= MAX_IOUS &&
      new Set(s.ious.map((x) => x.id)).size === s.ious.length &&
      s.ious.every(
        (x) => x.from !== x.to && s.people.some((p) => p.id === x.from) && s.people.some((p) => p.id === x.to) && Number.isInteger(x.cents) && x.cents >= 1 && x.cents <= MAX_CENTS,
      ),
    "people are listed once": (s) => s.people.length <= MAX_PEOPLE && new Set(s.people.map((p) => p.id)).size === s.people.length,
    "the plan settles every balance": (s) => s.plan === null || s.people.every((p) => net(s.ious, p.id) === planNet(s.plan!, p.id)),
    "the plan is short": (s) => s.plan === null || s.plan.length <= Math.max(0, s.people.filter((p) => net(s.ious, p.id) !== 0).length - 1),
    "payments run from someone who owes to someone who is owed": (s) => s.plan === null || s.plan.every((x) => x.cents > 0 && net(s.ious, x.from) < 0 && net(s.ious, x.to) > 0),
    "untangled exactly when there is a plan": (s) => (s.plan === null) === (s.at === 0),
    "a payment is paid exactly when it has a time": (s) => s.plan === null || s.plan.every((x) => (x.paidBy === null) === (x.paidAt === 0)),
  },

  transitions: {
    "adding only before untangling, one IOU at the end": (p, n, a, m) =>
      a.t !== "add" ||
      p === n ||
      (p.plan === null &&
        n.ious.length === p.ious.length + 1 &&
        n.ious.at(-1)!.id === `i${m.seq}` &&
        n.ious.at(-1)!.cents === a.cents &&
        JSON.stringify(n.ious.slice(0, -1)) === JSON.stringify(p.ious)),
    "untangling makes the plan from the IOUs": (p, n, a, m) => a.t !== "untangle" || p === n || (p.plan === null && JSON.stringify(n.plan) === JSON.stringify(settle(p)) && n.at === m.time),
    "IOUs never change after untangling": (p, n) => p.plan === null || sameIous(p, n),
    "the plan's payments never change once made": (p, n) => p.plan === null || samePlanRows(p, n),
    "paying marks one unpaid payment as the actor's": (p, n, a, m) => {
      if (a.t !== "pay" || p === n) return true;
      if (!p.plan || !n.plan || p.plan.length !== n.plan.length) return false;
      const i = p.plan.findIndex((x) => x.id === a.id);
      if (i < 0) return false;
      const before = p.plan[i]!;
      const after = n.plan[i]!;
      if (before.paidBy !== null || after.paidBy !== m.user || after.paidAt !== m.time) return false;
      return p.plan.every((x, k) => k === i || JSON.stringify(x) === JSON.stringify(n.plan![k]));
    },
    "only the one who marked it can unmark it": (p, n, a, m) => {
      if (a.t !== "unpay" || p === n) return true;
      if (!p.plan || !n.plan || p.plan.length !== n.plan.length) return false;
      const i = p.plan.findIndex((x) => x.id === a.id);
      if (i < 0) return false;
      const before = p.plan[i]!;
      const after = n.plan[i]!;
      if (before.paidBy !== m.user || after.paidBy !== null || after.paidAt !== 0) return false;
      return p.plan.every((x, k) => k === i || JSON.stringify(x) === JSON.stringify(n.plan![k]));
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r, ctx) => {
    const k = r.next();
    if (s.plan === null) {
      if (k < 0.6) {
        const ids = [...s.people.map((p) => p.id), ...ctx.members.map((m) => m.id)];
        const from = ids.length ? r.pick(ids) : "";
        let to = ids.length ? r.pick(ids) : "";
        if (from === to) to = ids.length ? r.pick(ids) : "";
        return { t: "add", from, to, cents: 100 * (1 + r.int(200)), why: r.pick(["gas", "airbnb", "bar", "groceries"]) };
      }
      if (s.ious.length) return { t: "untangle" };
      return { t: "add", from: "", to: "", cents: 100, why: "IOU" };
    }
    const unpaid = s.plan.filter((x) => x.paidBy === null);
    const paid = s.plan.filter((x) => x.paidBy !== null);
    if (unpaid.length && k < 0.8) return { t: "pay", id: r.pick(unpaid).id };
    if (paid.length) return { t: "unpay", id: r.pick(paid).id };
    return { t: "pay", id: s.plan[0]?.id ?? "" };
  },

  local: { adding: false, from: "", to: "", amount: "", why: "", bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const plan = state.plan;
    const n = state.ious.length;
    const total = state.ious.reduce((sum, x) => sum + x.cents, 0);
    const people = state.people.length;
    const count = plan?.length ?? 0;
    const paid = plan?.filter((x) => x.paidBy !== null).length ?? 0;
    const done = plan !== null && plan.every((x) => x.paidBy !== null);
    const t = plan ? untangleMotion(running(state.at, UNTANGLE_MS) ?? UNTANGLE_MS) : 0;
    const after = t >= 0.6;
    const showForm = plan === null && (local.adding || n === 0);
    const baseGraph = theme.width < 360 ? 230 : theme.width >= 500 ? 260 : 250;
    const graphHeight = showForm ? Math.min(baseGraph, 236) : baseGraph;
    const nodes = state.people.length ? state.people.map((p) => p.id) : members.slice(0, 6).map((m) => m.id);
    const payers = plan ? [...new Set(plan.filter((x) => x.paidBy !== null).map((x) => x.from))] : [];
    const mine = plan ? plan.filter((x) => x.paidBy === me) : [];
    const latestMine = mine.reduce<Pay | null>((best, x) => (best === null || x.paidAt >= best.paidAt ? x : best), null);
    const options = [
      ...state.people.map((p) => ({ id: p.id, name: p.name })),
      ...members.filter((m) => !state.people.some((p) => p.id === m.id)).map((m) => ({ id: m.id, name: m.name })),
    ];
    const from = options.some((o) => o.id === local.from) ? local.from : options[0]?.id ?? "";
    const to = options.some((o) => o.id === local.to) ? local.to : options.find((o) => o.id !== from)?.id ?? from;
    const peopleInChat = new Set([...state.people.map((p) => p.id), ...members.map((m) => m.id)]).size;
    const graphLabel = plan === null ? (n ? `${n} IOUs between ${people} people` : "No IOUs yet") : `${count} payments, ${paid} paid`;
    const heading = after ? "Untangled" : "Who owes who";
    const subtitle = after ? `${state.title} · ${count} payments` : `${state.title} · ${n} IOUs`;
    const add = () => {
      const cents = parseCents(local.amount);
      if (!from || !to || from === to || cents < 1 || cents > MAX_CENTS) return;
      dispatch({ t: "add", from, to, cents, why: local.why });
      setLocal({ adding: false, amount: "", why: "" });
    };

    const pay = (i: number) => {
      if (!plan) return;
      const x = plan[i];
      if (!x || x.paidBy !== null) return;
      dispatch({ t: "pay", id: x.id });
      haptic("success");
      setLocal({ bursts: local.bursts + 1 });
    };

    return (
      <div>
        <CardHeader
          title={heading}
          subtitle={
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>
          }
        />
        <Graph
          nodes={nodes}
          me={me}
          height={graphHeight}
          label={graphLabel}
          threads={state.ious.map((x) => ({ from: x.from, to: x.to, label: `${money(x.cents)} ${x.why}` }))}
          edges={(plan ?? []).map((x) => ({ from: x.from, to: x.to, label: money(x.cents), done: x.paidBy !== null }))}
          side={(id) => Math.sign(net(state.ious, id))}
          t={t}
          onEdge={pay}
          edgeName={(e) => "Mark " + e.label + " paid"}
        />

        {plan === null ? (
          <div style={{ height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {n === 0 ? (peopleInChat < 2 ? "Add someone to the chat to split" : "No IOUs yet · add the first one") : `${n} IOUs · ${money(total)} between ${people} people`}
          </div>
        ) : (
          <div style={{ height: 20, marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: "none", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{`${paid} of ${count} paid`}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {`${count} payments instead of ${n}`}
            </span>
          </div>
        )}

        {plan ? (
          <div style={{ marginTop: 8 }}>
            <Progress value={paid} max={count} />
          </div>
        ) : null}

        {plan === null ? (
          showForm ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
              style={{ display: "grid", gap: 8 }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select aria-label="Who owes" value={from} onInput={(e) => setLocal({ from: e.currentTarget.value })}>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Who is owed" value={to} onInput={(e) => setLocal({ to: e.currentTarget.value })}>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                <input inputMode="decimal" placeholder="Amount" aria-label="Amount" value={local.amount} onInput={(e) => setLocal({ amount: e.currentTarget.value })} />
                <input placeholder="What for" aria-label="What for" value={local.why} onInput={(e) => setLocal({ why: e.currentTarget.value })} />
                <Button kind="primary" onClick={add}>
                  Add
                </Button>
              </div>
            </form>
          ) : (
            <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
                <Button kind="primary" wide onClick={() => dispatch({ t: "untangle" })}>
                  Untangle
                </Button>
              </div>
              <Button kind="deemphasized" onClick={() => setLocal({ adding: true })}>
                Add
              </Button>
            </div>
          )
        ) : done ? (
          <Locked detail={`${count} payments instead of ${n}`}>All settled up</Locked>
        ) : (
          <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8 }}>
            {payers.length ? <Facepile users={payers} max={3} size={20} /> : null}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                lineHeight: "16px",
                color: c.secondaryText,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {paid ? "paid so far" : "Tap an amount once it's paid"}
            </span>
            {latestMine ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unpay", id: latestMine.id })}>
                Undo
              </Button>
            ) : null}
          </div>
        )}

        {local.bursts ? <Burst key={local.bursts} emoji="💸" /> : null}
      </div>
    );
  },
});
