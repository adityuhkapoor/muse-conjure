import { defineApp, Avatar, Burst, Button, CardHeader, Facepile, Locked, Toast, clock, haptic, innerWidth, mix, rng, running, spring, springs, type Ctx } from "@muse/app";

// Bill roulette: a wheel picks who covers the bill tonight. Whoever paid least lately gets the
// biggest slice. Spin, it lands, the ledger shows the bill on them, lock it; next dinner the queue
// has moved on. No money moves here.

type Params = { title: string; place: string; billCents: number; people: { name: string; paidCents: number }[] };

// @params
const P: Params = {
  title: "Who's got dinner?",
  place: "Hattie B's",
  billCents: 18600,
  people: [
    { name: "Priya", paidCents: 21200 },
    { name: "Sam", paidCents: 16400 },
    { name: "Ana", paidCents: 9600 },
    { name: "Leo", paidCents: 5800 },
    { name: "Kev", paidCents: 14000 },
    { name: "Maya", paidCents: 7400 },
  ],
};
// @end params

type Spin = { at: number; winner: string; offset: number; from: number; to: number };
type State = {
  title: string;
  place: string;
  bill: number;
  crew: { id: string; paid: number }[];
  spin: Spin | null;
  spins: number;
  lockedAt: number;
  nights: number;
};
type Action = { t: "spin" } | { t: "lock" } | { t: "next" };
type Local = { toast: number };

const TAU = Math.PI * 2;
const SPIN_MS = 3800;
const POP = spring(springs.iosBouncy);
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const REST = norm(-0.6);
const weight = (c: { paid: number }) => 1 / (c.paid + 3000);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const restAngle = (s: State) => (s.spin ? s.spin.to : REST);

function slices(s: State): { start: number; end: number }[] {
  const total = s.crew.reduce((a, c) => a + weight(c), 0);
  let at = 0;
  return s.crew.map((c) => {
    const start = at;
    at += (weight(c) / total) * TAU;
    return { start, end: at };
  });
}
function target(s: State, i: number, offset: number): number {
  const sl = slices(s)[i]!;
  return norm(-Math.PI / 2 - (sl.start + (sl.end - sl.start) * offset));
}
function pickWith(s: State, seed: number): { i: number; offset: number } {
  const g = rng(seed);
  const total = s.crew.reduce((a, c) => a + weight(c), 0);
  let x = g.next() * total;
  let i = s.crew.length - 1;
  for (let k = 0; k < s.crew.length; k++) {
    x -= weight(s.crew[k]!);
    if (x < 0) {
      i = k;
      break;
    }
  }
  return { i, offset: 0.3 + 0.4 * g.next() };
}
const shown = (s: State, id: string) => (s.crew.find((c) => c.id === id)?.paid ?? 0) + (s.spin?.winner === id ? s.bill : 0);
const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(Math.round(c) % 100).padStart(2, "0")}`);
const winnerIndex = (s: State) => (s.spin ? s.crew.findIndex((c) => c.id === s.spin!.winner) : -1);

export default defineApp<State, Action, Local>({
  name: "Bill roulette",
  summary: (s, ctx) => {
    const name = s.spin ? (ctx.members.find((m) => m.id === s.spin!.winner)?.name ?? "Someone") : "";
    if (!s.spin) return `${s.title}: not spun yet`;
    return s.lockedAt > 0 ? `${s.title}: ${name} is on the card at ${s.place}` : `${s.title}: ${name} has it · not locked`;
  },

  init: (ctx) => {
    const paidBy = (name: string) => {
      const p = P.people.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      return p && Number.isInteger(p.paidCents) && p.paidCents >= 0 && p.paidCents <= 1_000_000 ? p.paidCents : 0;
    };
    const bill = Number.isInteger(P.billCents) && P.billCents >= 100 && P.billCents <= 1_000_000 ? P.billCents : 5000;
    return {
      title: P.title.trim().slice(0, 40),
      place: P.place.trim().slice(0, 30),
      bill,
      crew: ctx.members.map((m) => ({ id: m.id, paid: paidBy(m.name ?? "") })),
      spin: null,
      spins: 0,
      lockedAt: 0,
      nights: 0,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "spin") {
      if (s.lockedAt > 0 || s.crew.length < 2) return s;
      const { i, offset } = pickWith(s, m.seed);
      return { ...s, spin: { at: m.time, winner: s.crew[i]!.id, offset, from: restAngle(s), to: target(s, i, offset) }, spins: s.spins + 1 };
    }
    if (a.t === "lock") {
      if (s.spin === null || s.lockedAt > 0) return s;
      return { ...s, lockedAt: m.time };
    }
    if (a.t === "next") {
      if (s.lockedAt === 0 || s.spin === null) return s;
      const w = s.spin.winner;
      return { ...s, crew: s.crew.map((c) => (c.id === w ? { ...c, paid: c.paid + s.bill } : c)), spin: null, lockedAt: 0, nights: s.nights + 1 };
    }
    return s;
  },

  // The crew is the chat. New people start at 0 paid; if the winner left the night resets. A
  // changed crew changes the slices, so a standing result is re-aimed at the same person.
  onMembers: (s, ctx) => {
    if (s.crew.length === ctx.members.length && s.crew.every((c, k) => c.id === ctx.members[k]!.id)) return s;
    const crew = ctx.members.map((m) => ({ id: m.id, paid: s.crew.find((c) => c.id === m.id)?.paid ?? 0 }));
    const next: State = { ...s, crew };
    if (s.spin === null) return next;
    const i = crew.findIndex((c) => c.id === s.spin!.winner);
    if (i < 0) return { ...next, spin: null, lockedAt: 0 };
    return { ...next, spin: { ...s.spin, to: target(next, i, s.spin.offset) } };
  },

  invariants: {
    "the crew is the chat": (s, ctx) =>
      s.crew.length === ctx.members.length && s.crew.every((c, k) => c.id === ctx.members[k]!.id && Number.isInteger(c.paid) && c.paid >= 0) && new Set(s.crew.map((c) => c.id)).size === s.crew.length,
    "the winner is in the crew": (s) => s.spin === null || s.crew.some((c) => c.id === s.spin!.winner),
    "the wheel stops on the winner's slice": (s) => s.spin === null || (winnerIndex(s) >= 0 && Math.abs(s.spin.to - target(s, winnerIndex(s), s.spin.offset)) < 1e-9),
    "the pointer lands inside the slice, not on an edge": (s) => s.spin === null || (s.spin.offset >= 0.3 && s.spin.offset <= 0.7),
    "only a spun night locks": (s) => s.lockedAt === 0 || s.spin !== null,
    "angles are normalized": (s) => s.spin === null || (s.spin.from >= 0 && s.spin.from < TAU && s.spin.to >= 0 && s.spin.to < TAU),
    "bill is positive cents": (s) => Number.isInteger(s.bill) && s.bill >= 100,
  },

  transitions: {
    "the seed picks the winner": (p, n, a, m) => {
      if (a.t !== "spin" || p === n) return true;
      const pick = pickWith(p, m.seed);
      return n.spin!.winner === p.crew[pick.i]!.id && n.spin!.offset === pick.offset && n.spin!.at === m.time && n.spins === p.spins + 1;
    },
    "a spin starts where the wheel rested": (p, n, a) => a.t !== "spin" || p === n || n.spin!.from === restAngle(p),
    "no spins once locked": (p, n) => p.lockedAt === 0 || n.spins === p.spins,
    "a lock keeps the result": (p, n, a, m) => a.t !== "lock" || p === n || (p.spin !== null && JSON.stringify(n.spin) === JSON.stringify(p.spin) && n.lockedAt === m.time),
    "next dinner books the bill on the winner only": (p, n, a) =>
      a.t !== "next" || p === n || (p.lockedAt > 0 && n.spin === null && n.crew.every((c) => c.paid === p.crew.find((x) => x.id === c.id)!.paid + (c.id === p.spin!.winner ? p.bill : 0))),
    "paid only changes on next dinner": (p, n, a) => a.t === "next" || JSON.stringify(n.crew) === JSON.stringify(p.crew),
    "the bill never changes": (p, n) => p.bill === n.bill,
    "only people in the chat change anything": (p, n, _a, m, ctx) => JSON.stringify(p) === JSON.stringify(n) || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.lockedAt > 0) return r.next() < 0.8 ? { t: "next" } : { t: "spin" };
    if (s.spin) return r.next() < 0.35 ? { t: "lock" } : { t: "spin" };
    return { t: "spin" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const wide = theme.width >= 360;
    const cx = wide ? 96 : 78;
    const cy = wide ? 102 : 96;
    const R = wide ? 88 : 74;
    const pendingSpin = pending && state.spins !== confirmed.spins;
    const V = pendingSpin ? confirmed : state;
    const sp = V.spin;
    const e = sp ? running(sp.at, SPIN_MS) : null;
    const spinning = pendingSpin || e !== null;
    const settled = sp !== null && !spinning;
    const locked = V.lockedAt > 0;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const sl = slices(V);
    const n = V.crew.length;

    // Wheel angle: from the confirmed spin only; a pending local spin turns slowly and neutrally.
    let rot = REST;
    let omega = 0;
    if (pendingSpin) rot = restAngle(confirmed) + (clock.value / 1000) * 0.6 * TAU;
    else if (sp) {
      if (e !== null) {
        const m = Math.ceil((sp.from + 8 * Math.PI - sp.to) / TAU);
        const end = sp.to + TAU * m;
        const f = 1 - e / SPIN_MS;
        rot = sp.from + (end - sp.from) * (1 - f ** 4);
        omega = ((end - sp.from) * 4 * f ** 3) / SPIN_MS;
      } else rot = sp.to;
    }

    // Pointer flap: time since the pointer crossed the last slice edge, from the angular speed.
    let flap = 0;
    if (e !== null && omega > 1e-9) {
      const phi = norm(-Math.PI / 2 - rot);
      const edges = [...sl.map((x) => x.start), TAU].filter((b) => b >= phi);
      const since = (Math.min(...edges) - phi) / omega / 1000;
      if (since < 0.18) flap = 0.4 * (1 - since / 0.18);
    }

    const fills = [c.series1, c.series4, c.series3, c.series2, c.series5, c.series6];
    const pt = (a: number, r: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    const wi = winnerIndex(V);
    const popT = sp && settled ? running(sp.at + SPIN_MS, 500) : null;
    const pop = popT === null ? 1 : 0.5 + 0.5 * POP(popT);
    const countT = sp && settled ? running(sp.at + SPIN_MS, 600) : null;

    // Ledger
    const left = 2 * cx + 14;
    const cap = wide ? 6 : 5;
    const rows = n > cap ? V.crew.slice(0, cap - 1) : V.crew;
    const amount = (id: string) => {
      const paid = V.crew.find((x) => x.id === id)!.paid;
      if (V.spin?.winner !== id) return paid;
      if (!settled) return paid;
      return countT === null ? paid + V.bill : Math.round(paid + V.bill * Math.min(1, countT / 600));
    };
    const queue = [...V.crew].sort((a, b) => shown(V, a.id) - shown(V, b.id));
    const nextUp = queue[0];
    const winnerName = sp ? nameOf(sp.winner) : "";
    const faceSize = (k: number) => (n > 8 ? 18 : Math.round(2 * (9 + ((sl[k]!.end - sl[k]!.start) / TAU) * 14)));

    const arc = (k: number) => {
      const a0 = sl[k]!.start + rot;
      const a1 = sl[k]!.end + rot;
      const p0 = pt(a0, R);
      const p1 = pt(a1, R);
      return `M${cx} ${cy}L${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}Z`;
    };

    const canSpin = !locked && n >= 2 && !spinning;
    return (
      <div>
        <CardHeader title={V.title} subtitle={`${V.place} · ${dollars(V.bill)} · paid less lately = bigger slice`} />
        <div style={{ position: "relative", height: wide ? 206 : 190 }}>
          <svg width={2 * cx} height={wide ? 198 : 184} viewBox={`0 0 ${2 * cx} ${wide ? 198 : 184}`} role="img" aria-label={n >= 2 ? `Wheel with ${n} slices` : "Wheel waiting for people"} style={{ position: "absolute", left: 0, top: 0 }}>
            {n >= 2 ? (
              <g>
                {sl.map((_, k) => (
                  <path key={V.crew[k]!.id} d={arc(k)} fill={settled && k !== wi ? mix(fills[k % 6]!, c.card, 0.6) : fills[k % 6]} />
                ))}
                {sl.map((x, k) => {
                  const q = pt(x.start + rot, R);
                  return <line key={`l${k}`} x1={cx} y1={cy} x2={q.x} y2={q.y} stroke={c.card} stroke-width={2} />;
                })}
              </g>
            ) : (
              <circle cx={cx} cy={cy} r={R} fill={c.input} />
            )}
            <circle cx={cx} cy={cy} r={26} fill={c.card} />
            <g transform={`translate(${cx} ${cy}) rotate(${(flap * 180) / Math.PI} 0 ${-R - 10})`}>
              <path d={`M-9 ${-R - 10}L9 ${-R - 10}L0 ${-R + 12}Z`} fill={c.text} />
            </g>
          </svg>
          {n >= 2
            ? sl.map((x, k) => {
                const size = faceSize(k);
                const q = pt((x.start + x.end) / 2 + rot, R * 0.66);
                return (
                  <div key={`f${V.crew[k]!.id}`} style={{ position: "absolute", left: q.x - size / 2, top: q.y - size / 2, width: size, height: size, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
                    <Avatar user={V.crew[k]!.id} size={size} />
                  </div>
                );
              })
            : null}
          <div style={{ position: "absolute", left: cx - 26, top: cy - 26, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sp === null && !pendingSpin ? (
              <button aria-label="Spin the wheel" onClick={() => dispatch({ t: "spin" })} style={{ width: 52, height: 52, borderRadius: 26, border: 0, background: "transparent", color: c.link, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                Spin
              </button>
            ) : spinning ? (
              <span style={{ color: c.secondaryText, fontSize: 15 }}>···</span>
            ) : (
              <div style={{ transform: `scale(${pop})`, display: "flex" }}>
                <Avatar user={sp!.winner} size={40} />
              </div>
            )}
          </div>

          <div style={{ position: "absolute", left, top: 0, right: 0 }}>
            <div style={{ fontSize: 13, lineHeight: "20px", color: c.secondaryText }}>Paid, last 30 days</div>
          </div>
          {rows.map((x, k) => {
            const hi = settled && sp?.winner === x.id;
            return (
              <div key={x.id} style={{ position: "absolute", left: left - 6, right: 0, top: 22 + k * 30, height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 6px", borderRadius: 8, background: hi ? c.selected : "transparent" }}>
                <span style={{ display: "flex" }}>
                  <Avatar user={x.id} size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(x.id)}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{dollars(amount(x.id))}</span>
              </div>
            );
          })}
          {n > cap ? (
            <div style={{ position: "absolute", left, right: 0, top: 22 + rows.length * 30 + 6, fontSize: 13, color: c.secondaryText }}>{`+${n - rows.length} more`}</div>
          ) : null}
        </div>

        <div style={{ height: wide ? 98 : 92, position: "relative" }}>
          {settled || locked ? (
            <div>
              {locked && !wide ? null : (
<div style={{ display: "flex", alignItems: "center", gap: 12, height: 40 }}>
                <Avatar user={sp!.winner} size={36} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sp!.winner === me ? "You've got dinner" : `${winnerName} has dinner`}</div>
                  <div style={{ fontSize: 13, color: c.secondaryText, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${winnerName}: ${dollars(V.crew[wi]!.paid)} in the last 30 days · ${dollars(V.bill)} tonight`}</div>
                </div>
              </div>
              )}
              {locked ? (
                <div style={{ display: "flex", flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: 8, marginTop: locked && !wide ? 0 : 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Locked>{`Locked · ${sp!.winner === me ? "you're" : `${winnerName} is`} on the card tonight`}</Locked>
                  </div>
                  <Button kind="secondary" wide={!wide} onClick={() => dispatch({ t: "next" })}>
                    Next dinner
                  </Button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, position: "relative" }}>
                  <Button kind="secondary" wide onClick={() => dispatch({ t: "spin" })}>
                    Spin again
                  </Button>
                  <Button
                    kind="primary"
                    wide
                    onClick={() => {
                      haptic("success");
                      dispatch({ t: "lock" });
                      setLocal({ toast: local.toast + 1 });
                    }}
                  >
                    Lock it
                  </Button>
                </div>
              )}
              {local.toast > 0 ? <Burst key={local.toast} emoji="🤝" /> : null}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: c.secondaryText, textAlign: "center", lineHeight: "18px", marginBottom: 12 }}>
                {n < 2 ? "Spin once 2 people are here" : V.spins > 0 ? "No take-backs" : "Tap the wheel or Spin · no take-backs"}
              </div>
              <Button kind="primary" wide disabled={spinning} onClick={() => dispatch({ t: "spin" })}>
                {spinning ? "Spinning" : "Spin"}
              </Button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 38 }}>
          <Facepile users={queue.map((x) => x.id)} max={6} size={20} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {`Up next time: ${nextUp ? (nextUp.id === me ? "you" : nameOf(nextUp.id)) : "nobody"} · no money moves here`}
          </span>
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>It's settled</Toast> : null}
      </div>
    );
  },
});
