import { defineApp, Avatar, Button, CardHeader, Expand, Facepile, Toast, haptic, mix, running } from "@muse/app";

type Params = {
  title: string; due: string;
  bills: { name: string; cents: number; usage: string; level: number }[];
  people: string[]; payer: string;
  heavy: { name: string; note: string; overageCents: number } | null;
  agree: string[]; paid: { name: string; cents: number }[];
};

// @params
const P: Params = {
  title: "October utilities", due: "due Nov 15",
  bills: [
    { name: "Electric", cents: 14230, usage: "612 kWh · up from 443", level: 0.88 },
    { name: "Wi-Fi", cents: 6000, usage: "Flat · 500 Mbps", level: 0.5 },
    { name: "Water", cents: 4780, usage: "3,100 gal", level: 0.42 },
    { name: "Gas", cents: 3590, usage: "Heat's back on", level: 0.3 },
  ],
  people: ["Maya", "Noa", "Theo", "Dev"], payer: "Maya",
  heavy: { name: "Theo", note: "ran the AC 24/7", overageCents: 5200 },
  agree: ["Noa", "Dev"], paid: [{ name: "Noa", cents: 7150 }],
};
// @end params

type Bill = { name: string; cents: number; usage: string; level: number };
type Status = { s: "open" } | { s: "requested"; cents: number; at: number } | { s: "paid"; cents: number; at: number };
type State = {
  title: string; due: string; bills: Bill[];
  people: string[];
  payer: string | null;
  heavy: string | null; note: string; overage: number;
  level: 0 | 1 | 2;
  agree: string[];
  status: Record<string, Status>;
};
type Action = { t: "adjust"; level: number } | { t: "agree" } | { t: "request"; user: string } | { t: "paid" };
type Local = { more: boolean };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_PEOPLE = 6;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameExcept = (a: Record<string, Status>, b: Record<string, Status>, k: string) => {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  ks.delete(k);
  return [...ks].every((x) => same(a[x], b[x]));
};
const money = (c: number) => {
  const d = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${d}.${String(c % 100).padStart(2, "0")}`;
};

const total = (s: State) => s.bills.reduce((a, b) => a + b.cents, 0);
const extra = (s: State) => (s.heavy === null ? 0 : [0, Math.floor(s.overage / 2), s.overage][s.level]!);
const share = (s: State, u: string) => {
  const n = s.people.length;
  if (!n) return 0;
  const base = total(s) - extra(s);
  const each = Math.floor(base / n);
  const r = base - each * n;
  return each + (s.people.indexOf(u) < r ? 1 : 0) + (u === s.heavy ? extra(s) : 0);
};
const others = (s: State) => s.people.filter((u) => u !== s.payer);
const covers = (s: State, u: string) => {
  const st = s.status[u];
  return !!st && (st.s === "paid" || (st.s === "requested" && st.cents === share(s, u)));
};
const owed = (s: State) => others(s).reduce((a, u) => a + share(s, u), 0);
const covered = (s: State) => others(s).reduce((a, u) => a + (covers(s, u) ? share(s, u) : 0), 0);
const paidCount = (s: State) => others(s).filter((u) => s.status[u]?.s === "paid").length;
const allCovered = (s: State) => owed(s) > 0 && others(s).every((u) => covers(s, u));

/** Would this tap leave every request out (or everyone paid) when it was not so before? */
function completes(s: State, a: Action, me: string): boolean {
  if (!s.people.includes(me)) return false;
  if (a.t === "request") return !allCovered(s) && me === s.payer && others(s).every((u) => u === a.user || covers(s, u)) && s.people.includes(a.user);
  if (a.t === "paid") return s.status[me]?.s === "requested" && others(s).every((u) => u === me || s.status[u]?.s === "paid");
  return false;
}

const match = (ctx: Ctx, w: string) => {
  const want = String(w).trim().toLowerCase();
  return ctx.members.find((m) => m.id === w || (m.name ?? "").toLowerCase() === want)?.id;
};
const cleanBill = (b: Params["bills"][number]): Bill => ({
  name: String(b.name ?? "").trim().slice(0, 24),
  cents: Number.isInteger(b.cents) && b.cents >= 0 && b.cents <= 100000 ? b.cents : 0,
  usage: String(b.usage ?? "").trim().slice(0, 32),
  level: Number.isFinite(b.level) ? Math.max(0, Math.min(1, b.level)) : 0,
});

export default defineApp<State, Action, Local>({
  name: "Utilities split",
  summary: (s, ctx) => {
    const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const e = extra(s);
    return `${s.title}: ${money(total(s))} · ${paidCount(s)} of ${others(s).length} paid${s.heavy && s.level ? ` · ${nameOf(s.heavy)} covers ${money(e)} extra` : ""}`;
  },

  init: (ctx) => {
    let bills = P.bills.slice(0, 4).map(cleanBill).filter((b) => b.name);
    if (!bills.length) bills = [{ name: "Bills", cents: 0, usage: "Add amounts", level: 0 }];
    let people: string[] = [];
    for (const w of P.people) {
      const id = match(ctx, w);
      if (id && !people.includes(id)) people.push(id);
    }
    if (people.length < 2) people = ctx.members.slice(0, MAX_PEOPLE).map((m) => m.id);
    const pid = match(ctx, P.payer);
    if (pid && people.includes(pid)) people = [pid, ...people.filter((u) => u !== pid)];
    const payer = people[0] ?? null;
    const hid = P.heavy ? match(ctx, P.heavy.name) : undefined;
    const heavy = hid && people.includes(hid) && hid !== payer ? hid : null;
    const ov = P.heavy?.overageCents;
    const overage = heavy && typeof ov === "number" && Number.isInteger(ov) ? Math.max(0, Math.min(bills[0]!.cents, ov)) : 0;
    const agree: string[] = [];
    for (const w of P.agree) {
      const id = match(ctx, w);
      if (id && people.includes(id) && !agree.includes(id)) agree.push(id);
    }
    const status: Record<string, Status> = {};
    for (const u of people) if (u !== payer) status[u] = { s: "open" };
    for (const p of P.paid) {
      const id = match(ctx, p.name);
      if (id && id !== payer && people.includes(id) && Number.isInteger(p.cents) && p.cents > 0) status[id] = { s: "paid", cents: p.cents, at: 0 };
    }
    return { title: P.title.trim().slice(0, 60) || "Utilities", due: P.due.trim().slice(0, 24), bills, people, payer, heavy, note: heavy ? String(P.heavy?.note ?? "").trim().slice(0, 32) : "", overage, level: 0, agree, status };
  },

  reduce: (s, a, meta, ctx) => {
    const user = meta.user;
    if (!inChat(ctx, user) || !s.people.includes(user)) return s;
    if (a.t === "adjust") {
      if (!Number.isInteger(a.level) || a.level < 0 || a.level > 2 || a.level === s.level || s.heavy === null) return s;
      return { ...s, level: a.level as 0 | 1 | 2, agree: [user] };
    }
    if (a.t === "agree") return s.agree.includes(user) ? s : { ...s, agree: [...s.agree, user] };
    if (a.t === "request") {
      if (user !== s.payer || typeof a.user !== "string" || !s.people.includes(a.user) || a.user === s.payer) return s;
      const st = s.status[a.user];
      if (!st || st.s === "paid" || (st.s === "requested" && st.cents === share(s, a.user))) return s;
      return { ...s, status: { ...s.status, [a.user]: { s: "requested", cents: share(s, a.user), at: meta.time } } };
    }
    if (a.t === "paid") {
      const st = s.status[user];
      if (!st || st.s !== "requested") return s;
      return { ...s, status: { ...s.status, [user]: { s: "paid", cents: st.cents, at: meta.time } } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    let people = s.people.filter(here);
    const status: Record<string, Status> = {};
    for (const u of people) if (s.status[u]) status[u] = s.status[u]!;
    if (Object.values(status).every((x) => x.s === "open") && Object.keys(s.status).every((u) => s.status[u]!.s === "open")) {
      for (const m of ctx.members) if (people.length < MAX_PEOPLE && !people.includes(m.id)) people.push(m.id);
    }
    const payer = people[0] ?? null;
    const st: Record<string, Status> = {};
    for (const u of people) if (u !== payer) st[u] = status[u] ?? { s: "open" };
    const heavyOk = s.heavy !== null && people.includes(s.heavy) && s.heavy !== payer;
    const next: State = { ...s, people, payer, status: st, agree: s.agree.filter((u) => people.includes(u)), heavy: heavyOk ? s.heavy : null, level: heavyOk ? s.level : 0 };
    return same(next, s) ? s : next;
  },

  invariants: {
    "roommates are distinct people in the chat, payer first": (s, ctx) => new Set(s.people).size === s.people.length && s.people.every((u) => inChat(ctx, u)) && s.payer === (s.people[0] ?? null),
    "shares add up to the bills": (s) => s.people.length === 0 || s.people.reduce((a, u) => a + share(s, u), 0) === total(s),
    "everyone but the heavy user pays the same, give or take a cent": (s) => {
      const v = s.people.filter((u) => u !== s.heavy).map((u) => share(s, u));
      return v.length === 0 || Math.max(...v) - Math.min(...v) <= 1;
    },
    "the heavy user carries exactly the chosen part of the overage": (s) => {
      if (s.heavy === null) return s.level === 0;
      const o = s.people.filter((u) => u !== s.heavy);
      return s.people.includes(s.heavy) && s.heavy !== s.payer && (o.length === 0 || Math.abs(share(s, s.heavy) - extra(s) - Math.min(...o.map((u) => share(s, u)))) <= 1);
    },
    "everyone but the payer has a status, the payer none": (s) => same(Object.keys(s.status).sort(), others(s).sort()),
    "amounts are whole cents": (s) =>
      Object.values(s.status).every((x) => x.s === "open" || (Number.isInteger(x.cents) && x.cents > 0)) &&
      [0, 1, 2].includes(s.level) && s.agree.every((u) => s.people.includes(u)) && new Set(s.agree).size === s.agree.length,
  },

  transitions: {
    "only the payer requests, for that person's current share": (p, n, a, m) =>
      a.t !== "request" || p === n || (m.user === p.payer && same(n.status[a.user], { s: "requested", cents: share(p, a.user), at: m.time }) && sameExcept(p.status, n.status, a.user)),
    "marking paid settles what was requested": (p, n, a, m) =>
      a.t !== "paid" || p === n || (p.status[m.user]?.s === "requested" && n.status[m.user]?.s === "paid" && (n.status[m.user] as { cents: number }).cents === (p.status[m.user] as { cents: number }).cents && (n.status[m.user] as { at: number }).at === m.time && sameExcept(p.status, n.status, m.user)),
    "moving the slider resets agreement to the mover": (p, n, a, m) => a.t !== "adjust" || p === n || (n.level === a.level && same(n.agree, [m.user]) && same(p.status, n.status)),
    "agreeing adds only the actor": (p, n, a, m) => a.t !== "agree" || p === n || (same(n.agree, [...p.agree, m.user]) && n.level === p.level),
    "bills never change": (p, n) => same(p.bills, n.bills) && p.overage === n.overage,
    "a payment is never undone": (p, n) => Object.keys(p.status).every((u) => p.status[u]!.s !== "paid" || same(p.status[u], n.status[u])),
    "only roommates act": (p, n, _a, m, ctx) => same(p, n) || (inChat(ctx, m.user) && p.people.includes(m.user)),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const o = others(s);
    if (user === s.payer) {
      const need = o.filter((u) => !covers(s, u) && s.status[u]?.s !== "paid");
      if (k < 0.25 && s.heavy) return { t: "adjust", level: r.int(3) };
      return need.length ? { t: "request", user: r.pick(need) } : o.length ? { t: "request", user: r.pick(o) } : { t: "agree" };
    }
    if (s.status[user]?.s === "requested" && k < 0.6) return { t: "paid" };
    return k < 0.75 && !s.agree.includes(user) ? { t: "agree" } : { t: "adjust", level: r.int(3) };
  },

  local: { more: false },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const narrow = theme.width < 360;
    const colW = narrow ? 64 : 96;
    const shareW = narrow ? 56 : 72;
    const av = narrow ? 28 : 32;
    const n = s.people.length;
    const tot = total(s);
    const heavy = s.heavy;
    const ow = owed(s);
    const cv = covered(s);
    const done = allCovered(s);
    const inPeople = s.people.includes(me);
    const amPayer = s.payer === me;
    const maxShare = Math.max(1, ...s.people.map((u) => share(s, u)));
    const series = [c.series2, c.series1, c.series3, c.series5];

    // Toast: everyone is covered in confirmed state and the last change is recent.
    const ats = confirmed.people.map((u) => confirmed.status[u]).flatMap((x) => (x && x.s !== "open" ? [x] : []));
    const last = ats.reduce<{ at: number; s: string } | null>((t, x) => (!t || x.at >= t.at ? { at: x.at, s: x.s } : t), null);
    const toast = last && allCovered(confirmed) && last.at > 0 && running(last.at, 2400) !== null && (last.s === "requested" || paidCount(confirmed) === others(confirmed).length);
    const toastText = last && paidCount(confirmed) === others(confirmed).length ? "Everyone's paid" : "All requests sent";

    const act = (a: Action) => {
      if (completes(s, a, me)) haptic("success");
      dispatch(a);
    };

    const rowFor = (u: string) => {
      const sh = share(s, u);
      const st = s.status[u];
      const fade = st && st.s !== "open" ? running(st.at, 400) !== null : false;
      const fadeRef = (el: HTMLElement | null) => {
        if (el && fade) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      };
      let right: unknown;
      if (u === s.payer) {
        right = <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{u === me ? "You fronted it" : `${nameOf(u)} fronted it`}</span>;
      } else if (st && st.s === "paid") {
        const note = st.cents > sh ? `Paid · ${money(st.cents - sh)} back` : st.cents < sh ? `Paid · owes ${money(sh - st.cents)}` : `Paid ${money(st.cents)}`;
        right = (
          <span key={`${u}:${st.at}`} ref={fadeRef} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: mix(c.positive, c.text, 0.3) }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
            {note}
          </span>
        );
      } else if (amPayer) {
        if (st && st.s === "requested" && st.cents === sh) {
          right = <span key={`${u}:${st.at}`} ref={fadeRef} style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`Requested ${money(st.cents)}`}</span>;
        } else {
          right = (
            <Button kind="deemphasized" onClick={() => act({ t: "request", user: u })}>
              {st && st.s === "requested" ? `Update to ${money(sh)}` : `Request ${money(sh)}`}
            </Button>
          );
        }
      } else if (u === me && st && st.s === "requested") {
        right = <Button kind="primary" onClick={() => act({ t: "paid" })}>Mark paid</Button>;
      } else if (st && st.s === "requested") {
        right = <span key={`${u}:${st.at}`} ref={fadeRef} style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`Requested ${money(st.cents)}`}</span>;
      } else {
        right = <small>Not requested yet</small>;
      }
      return (
        <div key={u} style={{ display: "flex", alignItems: "center", gap: narrow ? 6 : 10, height: 42 }}>
          <Avatar user={u} size={av} />
          <div style={{ width: colW, flex: "none" }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(u)}</div>
            <div style={{ display: "flex", height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
              {s.bills.map((b, i) => {
                const part = b.cents / Math.max(1, n) + (i === 0 && u === heavy ? extra(s) : 0);
                return <div key={i} style={{ flex: "none", height: 6, width: `${Math.min(100, (part / maxShare) * 100)}%`, background: series[i], transition: "width .25s" }} />;
              })}
            </div>
          </div>
          <div style={{ width: shareW, flex: "none", textAlign: "right", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{money(sh)}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end", textAlign: "right", whiteSpace: "nowrap" }}>{right as never}</div>
        </div>
      );
    };

    const ordered = [...(s.payer ? [s.payer] : []), ...(inPeople && !amPayer ? [me] : []), ...s.people.filter((u) => u !== s.payer && u !== me)];
    const many = ordered.length > 4;
    const rest = many ? ordered.slice(3) : [];
    const restReq = rest.filter((u) => s.status[u]?.s === "requested").length;
    const restPaid = rest.filter((u) => s.status[u]?.s === "paid").length;

    const frac = s.level / 2;
    const labels = ["Split even", "Half the overage", `All ${money(s.overage)} on ${heavy ? nameOf(heavy) : ""}`];
    const pos = (f: number) => `calc(14px + (100% - 28px) * ${f})`;

    return (
      <div>
        <div style={{ marginBottom: -4 }}>
          <CardHeader title={s.title} subtitle={`${money(tot)} total · ${s.due}`} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6 }}>
          {s.bills.map((b, i) => {
            const hot = heavy !== null && i === 0;
            return (
              <div key={i} style={{ minHeight: 64, boxSizing: "border-box", background: c.input, borderRadius: 12, padding: "3px 10px 0", minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{b.name}</div>
                <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{money(b.cents)}</div>
                <div style={{ fontSize: 12, lineHeight: "16px", color: hot ? mix(c.negative, c.text, 0.2) : c.secondaryText }}>{b.usage}</div>
                <div style={{ height: 4, marginTop: 4, borderRadius: 2, background: c.track, overflow: "hidden" }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${b.level * 100}%`, background: hot ? c.negative : c.primary }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 8 }} />
        {heavy ? (
          <>
            <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b>{nameOf(heavy)}</b>{` ${s.note}`}
              </div>
              {s.agree.length ? (
                <>
                  <Facepile users={s.agree} max={3} size={20} />
                  <small>agree</small>
                </>
              ) : null}
              {inPeople && !s.agree.includes(me) ? <Button kind="deemphasized" onClick={() => act({ t: "agree" })}>Agree</Button> : null}
            </div>
            <div style={{ position: "relative", height: 36 }}>
              <div style={{ position: "absolute", top: 15, left: 14, right: 14, height: 6, borderRadius: 3, background: c.track }} />
              <div style={{ position: "absolute", top: 15, left: 14, height: 6, borderRadius: 3, background: c.primary, width: `calc((100% - 28px) * ${frac})`, transition: "width .25s" }} />
              <div style={{ position: "absolute", top: 4, width: 28, height: 28, borderRadius: 14, background: c.card, boxShadow: `0 1px 3px ${mix(c.text, c.card, 0.7)}`, left: `calc(14px + (100% - 28px) * ${frac} - 14px)`, transition: "left .25s", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <svg width="16" height="16" viewBox="-8 -8 16 16" fill="none" stroke={c.primary} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  {[0, 60, 120].map((a) => (
                    <g key={a} transform={`rotate(${a})`}>
                      <path d="M-7 0H7" />
                      <path d="M4.3 0L5.8 -2.6M4.3 0L5.8 2.6M-4.3 0L-5.8 -2.6M-4.3 0L-5.8 2.6" strokeWidth="1.2" />
                    </g>
                  ))}
                </svg>
              </div>
              {labels.map((l, i) => (
                <button key={i} aria-label={l} aria-pressed={s.level === i} onClick={() => act({ t: "adjust", level: i })} style={{ position: "absolute", top: -4, left: `${(i * 100) / 3}%`, width: "33.3333%", height: 44, background: "none", border: "none", padding: 0, opacity: 0, cursor: "pointer" }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, minHeight: 16, fontSize: 12, lineHeight: "16px", color: c.secondaryText, pointerEvents: "none" }}>
              {labels.map((l, i) => (
                <span key={i} style={{ flex: "1 1 0", minWidth: 0, textAlign: i === 0 ? "left" : i === 1 ? "center" : "right", fontWeight: s.level === i ? 600 : 400, color: s.level === i ? c.text : c.secondaryText }}>{l}</span>
              ))}
            </div>
            <div style={{ height: 4 }} />
          </>
        ) : null}
        {(many ? ordered.slice(0, 3) : ordered).map(rowFor)}
        {many ? (
          <Expand title={`${rest.length} more roommates`} summary={`${restReq} requested · ${restPaid} paid`} open={local.more} onToggle={() => setLocal({ more: !local.more })}>
            {rest.map(rowFor)}
          </Expand>
        ) : null}
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 16 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text }}>
              {ow === 0 ? "Nothing to split" : done ? "All requests out" : `${money(cv)} of ${money(ow)} paid or requested`}
            </div>
            <small style={{ whiteSpace: "nowrap" }}>No money moves here</small>
          </div>
          <div style={{ height: 6, marginTop: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
            <div style={{ height: 6, borderRadius: 3, width: `${ow ? (cv / ow) * 100 : 0}%`, background: c.primary, transition: "width .25s" }} />
          </div>
        </div>
        {toast ? <Toast key={last!.at}>{toastText}</Toast> : null}
      </div>
    );
  },
});
