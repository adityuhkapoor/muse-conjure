import { defineApp, Avatar, Button, Canvas, CardHeader, clock, rng, running, tween, userColor } from "@muse/app";

// Pickup wheel. Anyone spins for the next open slot; the server's seed picks a driver from the
// pool who holds no slot yet. One slot per driver. The wheel and result read from `confirmed`.

const C = {
  title: "Who drives the pickups?",
  slots: [
    { label: "Fri 2:15 PM · Logan", detail: "Pickup for Paige" },
    { label: "Fri 8 PM · Logan", detail: "Pickup for Marcus" },
    { label: "Sat 11 AM · Logan", detail: "Rhea and Leo, 2 bags each" },
    { label: "Sun 6 AM · Dropoff", detail: "Ride back for Paige" },
  ],
  drivers: ["Mia", "Owen", "Jake", "Paige"],
};

type Slot = { id: string; label: string; detail: string; driver: string | null; at: number };
type State = { slots: Slot[]; pool: string[]; spinning: string | null; lastSpinAt: number };
type Action = { t: "join" } | { t: "drop" } | { t: "spin"; slot: string } | { t: "release"; slot: string };
type Local = Record<string, never>;

const SPIN_MS = 3000;
const TAU = Math.PI * 2;
const ease = tween({ duration: SPIN_MS, easing: "decelerate" });

// Local label fitting: largest size that fits down to `min`, then cut with an ellipsis.
const fitText = (
  label: string,
  maxWidth: number,
  o: { g: CanvasRenderingContext2D; size: number; min: number; weight?: number },
) => {
  const weight = o.weight ?? 400;
  const fontAt = (size: number) => `${weight} ${size}px sans-serif`;
  for (let size = o.size; size >= o.min; size--) {
    o.g.font = fontAt(size);
    if (o.g.measureText(label).width <= maxWidth) return { text: label, size, font: fontAt(size) };
  }
  const font = fontAt(o.min);
  o.g.font = font;
  let text = label;
  while (text.length > 1 && o.g.measureText(text + "…").width > maxWidth) text = text.slice(0, -1);
  return { text: text + "…", size: o.min, font };
};

type HasMembers = { members: { id: string }[] };
const inChat = (ctx: HasMembers, id: string) => ctx.members.some((m) => m.id === id);
const holds = (s: State, u: string) => s.slots.some((x) => x.driver === u);
const eligible = (s: State, ctx: HasMembers) => s.pool.filter((u) => inChat(ctx, u) && !holds(s, u));
const slotsSame = (p: State, n: State, except: string) =>
  p.slots.length === n.slots.length &&
  p.slots.every((x, i) => x.id === except || (n.slots[i]!.driver === x.driver && n.slots[i]!.at === x.at));

export default defineApp<State, Action, Local>({
  name: "Pickup wheel",
  summary: (s) => `${C.title} ${s.slots.filter((x) => x.driver !== null).length} of ${s.slots.length} slots filled.`,

  init: (ctx) => ({
    slots: C.slots.map((x, i) => ({ id: `s${i}`, label: x.label, detail: x.detail, driver: null, at: 0 })),
    pool: ctx.members.filter((m) => C.drivers.some((d) => d.toLowerCase() === m.name.trim().toLowerCase())).map((m) => m.id),
    spinning: null,
    lastSpinAt: 0,
  }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    switch (a.t) {
      case "join":
        return s.pool.includes(m.user) ? s : { ...s, pool: [...s.pool, m.user] };
      case "drop":
        if (!s.pool.includes(m.user) || holds(s, m.user)) return s;
        return { ...s, pool: s.pool.filter((u) => u !== m.user) };
      case "spin": {
        if (typeof a.slot !== "string") return s;
        const slot = s.slots.find((x) => x.id === a.slot);
        if (!slot || slot.driver !== null) return s;
        const el = eligible(s, ctx);
        if (el.length === 0) return s;
        const pick = rng(m.seed).pick(el);
        const at = Math.max(1, m.time);
        return {
          ...s,
          slots: s.slots.map((x) => (x.id === slot.id ? { ...x, driver: pick, at } : x)),
          spinning: slot.id,
          lastSpinAt: at,
        };
      }
      case "release": {
        if (typeof a.slot !== "string") return s;
        const slot = s.slots.find((x) => x.id === a.slot);
        if (!slot || slot.driver !== m.user) return s;
        return { ...s, slots: s.slots.map((x) => (x.id === slot.id ? { ...x, driver: null, at: 0 } : x)) };
      }
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ok = (u: string) => inChat(ctx, u);
    if (s.pool.every(ok) && s.slots.every((x) => x.driver === null || ok(x.driver))) return s;
    return {
      ...s,
      pool: s.pool.filter(ok),
      slots: s.slots.map((x) => (x.driver !== null && !ok(x.driver) ? { ...x, driver: null, at: 0 } : x)),
    };
  },

  invariants: {
    "each person holds at most one slot": (s) => {
      const ds = s.slots.map((x) => x.driver).filter((d): d is string => d !== null);
      return new Set(ds).size === ds.length;
    },
    "every driver is in the chat and in the pool": (s, ctx) => s.slots.every((x) => x.driver === null || (inChat(ctx, x.driver) && s.pool.includes(x.driver))),
    "the pool has no repeats and everyone in it is in the chat": (s, ctx) => new Set(s.pool).size === s.pool.length && s.pool.every((u) => inChat(ctx, u)),
    "there are always the same slots with the same labels": (s) =>
      s.slots.length === C.slots.length && s.slots.every((x, i) => x.id === `s${i}` && x.label === C.slots[i]!.label && x.detail === C.slots[i]!.detail),
    "an open slot has no spin time and a filled slot has one": (s) => s.slots.every((x) => (x.driver === null ? x.at === 0 : x.at > 0)),
    "the spin record points at a real slot": (s) =>
      (s.spinning === null || s.slots.some((x) => x.id === s.spinning)) && s.lastSpinAt >= 0 && (s.lastSpinAt > 0 || s.spinning === null),
  },

  transitions: {
    "a spin fills only the named open slot with the driver the seed picks": (p, n, a, m, ctx) => {
      if (a.t !== "spin" || p === n) return true;
      const el = eligible(p, ctx);
      const slot = p.slots.find((x) => x.id === a.slot);
      if (!slot || slot.driver !== null || el.length === 0) return false;
      const at = Math.max(1, m.time);
      const winner = rng(m.seed).pick(el);
      const filled = n.slots.find((x) => x.id === a.slot);
      return (
        !!filled && filled.driver === winner && filled.at === at && n.spinning === a.slot && n.lastSpinAt === at &&
        slotsSame(p, n, a.slot) && n.pool.join() === p.pool.join()
      );
    },
    "a release opens only the named slot and only for its driver": (p, n, a, m) => {
      if (a.t !== "release" || p === n) return true;
      const before = p.slots.find((x) => x.id === a.slot);
      const after = n.slots.find((x) => x.id === a.slot);
      return !!before && !!after && before.driver === m.user && after.driver === null && after.at === 0 && slotsSame(p, n, a.slot) && n.pool.join() === p.pool.join();
    },
    "a join adds only the actor to the pool": (p, n, a, m) =>
      a.t !== "join" || p === n || (!p.pool.includes(m.user) && n.pool.join() === [...p.pool, m.user].join() && n.slots === p.slots),
    "a drop removes only the actor, and only when they hold no slot": (p, n, a, m) =>
      a.t !== "drop" || p === n || (p.pool.includes(m.user) && !holds(p, m.user) && n.pool.join() === p.pool.filter((u) => u !== m.user).join() && n.slots === p.slots),
    "slot labels and details never change": (p, n) =>
      p.slots.length === n.slots.length && p.slots.every((x, i) => n.slots[i]!.id === x.id && n.slots[i]!.label === x.label && n.slots[i]!.detail === x.detail),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const open = s.slots.filter((x) => x.driver === null);
    const mine = s.slots.filter((x) => x.driver === user);
    if (k < 0.15) return { t: "join" };
    if (k < 0.22) return { t: "drop" };
    if (k < 0.35 && mine.length) return { t: "release", slot: mine[0]!.id };
    if (k < 0.4) return { t: "release", slot: "none" };
    if (k < 0.8 && open.length) return { t: "spin", slot: r.pick(open).id };
    return { t: "join" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const last = confirmed.lastSpinAt;
    if (last > 0) void clock.value;
    const e = last > 0 ? running(last, SPIN_MS) : null;
    const animating = e !== null;
    const waiting = pending && state.lastSpinAt !== confirmed.lastSpinAt;
    const busy = waiting || animating;
    const ctx = { members };

    const hidden = (x: Slot, i: number) =>
      (waiting && x.driver !== (confirmed.slots[i]?.driver ?? null)) || (animating && confirmed.spinning === x.id);
    const filled = state.slots.filter((x, i) => x.driver !== null && !hidden(x, i)).length;
    const total = state.slots.length;
    const nextOpen = state.slots.find((x) => x.driver === null);
    const canSpin = !!nextOpen && eligible(state, ctx).length > 0 && !busy;

    const winner = animating ? (confirmed.slots.find((x) => x.id === confirmed.spinning)?.driver ?? null) : null;
    const wheelUsers = confirmed.pool.filter((u) => inChat(ctx, u) && (!holds(confirmed, u) || (winner !== null && u === winner)));
    const firstName = (id: string) => (members.find((m) => m.id === id)?.name ?? "").trim().split(" ")[0] ?? "";
    const nameOf = (id: string) => (id === me ? "You" : firstName(id) || "Someone");
    const inPool = state.pool.includes(me);

    const wheelIdx = winner !== null ? wheelUsers.indexOf(winner) : -1;
    const angleAt = (t: number) => {
      if (wheelIdx < 0 || wheelUsers.length === 0) return 0;
      const target = -((wheelIdx + 0.5) / wheelUsers.length) * TAU;
      return target - 4 * TAU * (1 - ease(Math.max(0, t - last)));
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const cx = f.width / 2;
      const cy = f.height / 2 + 4;
      const r = Math.min(cx, cy) - 8;
      const n = wheelUsers.length;
      if (n === 0) {
        g.setLineDash([6, 4]);
        g.strokeStyle = theme.color.divider;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, r, 0, TAU);
        g.stroke();
        g.setLineDash([]);
        const t = fitText("Join the pool", r * 1.6, { g, size: 14, min: 10 });
        g.font = t.font;
        g.fillStyle = theme.color.secondaryText;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(t.text, cx, cy);
        return false;
      }
      const a0 = angleAt(f.now) - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const s0 = a0 + (i / n) * TAU;
        const s1 = a0 + ((i + 1) / n) * TAU;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, s0, s1);
        g.closePath();
        g.fillStyle = userColor(wheelUsers[i]!, theme);
        g.fill();
        g.save();
        g.translate(cx, cy);
        const mid = (s0 + s1) / 2;
        const flip = Math.cos(mid) < 0;
        g.rotate(flip ? mid + Math.PI : mid);
        const t = fitText(firstName(wheelUsers[i]!), Math.max(20, r - 20), { g, size: 12, min: 10, weight: 600 });
        g.font = t.font;
        g.fillStyle = theme.color.onPrimary;
        g.textAlign = flip ? "left" : "right";
        g.textBaseline = "middle";
        g.fillText(t.text, flip ? -(r - 10) : r - 10, 0);
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, 8, 0, TAU);
      g.fillStyle = theme.color.card;
      g.fill();
      g.beginPath();
      g.moveTo(cx - 8, cy - r - 6);
      g.lineTo(cx + 8, cy - r - 6);
      g.lineTo(cx, cy - r + 6);
      g.closePath();
      g.fillStyle = theme.color.text;
      g.fill();
      return last > 0 && f.now - last < SPIN_MS && wheelIdx >= 0;
    };

    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const subtitle = busy ? "Spinning…" : filled === total ? `All ${total} slots filled` : `${filled} of ${total} slots filled`;
    const poolText = state.pool.length ? state.pool.map(nameOf).join(", ") : "none yet";

    return (
      <div>
        <CardHeader title={C.title} subtitle={subtitle} />
        <Canvas
          height={120}
          draw={draw}
          label={wheelUsers.length ? `Wheel with ${wheelUsers.length} drivers: ${wheelUsers.map(firstName).join(", ")}` : "Empty wheel, no drivers in the pool"}
        />
        <small style={{ display: "block", marginTop: 4, ...ellipsis }}>Pool · {poolText}</small>
        <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
          {state.slots.map((x, i) => {
            const hid = hidden(x, i);
            const mineSlot = x.driver === me && !hid;
            return (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, ...ellipsis }}>{x.label}</div>
                  <small style={{ display: "block", ...ellipsis }}>{x.detail}</small>
                </div>
                {hid ? (
                  <small>Spinning…</small>
                ) : x.driver === null ? (
                  <small style={{ border: `1px dashed ${theme.color.divider}`, borderRadius: 999, padding: "2px 10px" }}>Open</small>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <Avatar user={x.driver} size={20} />
                    <small style={{ maxWidth: 70, ...ellipsis }}>{nameOf(x.driver)}</small>
                    {mineSlot ? (
                      <Button kind="deemphasized" onClick={() => dispatch({ t: "release", slot: x.id })}>
                        Release
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, display: "flex" }}>
            <Button
              kind="primary"
              wide
              disabled={!canSpin}
              onClick={() => {
                if (nextOpen) dispatch({ t: "spin", slot: nextOpen.id });
              }}
            >
              Spin
            </Button>
          </div>
          <Button
            disabled={inPool && holds(state, me)}
            onClick={() => {
              if (inPool) dispatch({ t: "drop" });
              else dispatch({ t: "join" });
            }}
          >
            {inPool ? "Leave pool" : "Join pool"}
          </Button>
        </div>
      </div>
    );
  },
});
