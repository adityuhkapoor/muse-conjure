import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Chip,
  Locked,
  Placed,
  Scene,
  at,
  circle,
  ellipse,
  haptic,
  innerWidth,
  line,
  mix,
  pal,
  rect,
  running,
  tween,
  type Child,
} from "@muse/app";

// Potluck table: the holiday table from above. Every plate is a dish someone is bringing, empty
// plates show what is missing, extra pies are flagged, and Muse suggests one move at a time.

type Params = {
  title: string;
  coming: number;
  host: string;
  plates: { need: string; who: string; dish: string }[];
  defaults: Record<string, string>;
  tips: { who: string; to: string; why: string }[];
};

// @params
const P: Params = {
  title: "Thanksgiving potluck",
  coming: 14,
  host: "Dad's turkey",
  plates: [
    { need: "potatoes", who: "Grandma Jo", dish: "mashed potatoes" },
    { need: "stuffing", who: "Mom", dish: "stuffing" },
    { need: "dessert", who: "Aunt Linda", dish: "pumpkin pie" },
    { need: "veggies", who: "", dish: "" },
    { need: "dessert", who: "Cousin Rae", dish: "apple pie" },
    { need: "mac", who: "Nate", dish: "mac & cheese" },
    { need: "dessert", who: "Aunt Bev", dish: "pecan pie" },
    { need: "drinks", who: "", dish: "" },
    { need: "rolls", who: "", dish: "" },
    { need: "", who: "Uncle T", dish: 'a "surprise"' },
  ],
  defaults: { veggies: "green beans", drinks: "cider + wine", rolls: "rolls", potatoes: "mashed potatoes", stuffing: "stuffing", mac: "mac & cheese" },
  tips: [
    { who: "Uncle T", to: "rolls", why: 'his "surprise" last year was lime jello' },
    { who: "Aunt Bev", to: "veggies", why: "3 pies for 14 people is a lot of pie" },
    { who: "Cousin Rae", to: "drinks", why: "she has the Costco card" },
  ],
};
// @end params

/** who.id: member id if matched (at init or when a member claims), else the name itself. */
type Who = { id: string; name: string; member: boolean };
type Plate = { id: string; need: string; who: Who | null; dish: string; movedAt: number };
type Tip = { who: string; to: string; why: string };
type State = { title: string; coming: number; host: string; plates: Plate[]; defaults: Record<string, string>; tips: Tip[]; doneAt: number };
type Action = { t: "claim"; plate: string; dish: string } | { t: "leave" } | { t: "tip" };
type Local = { sel: string | null; dish: string };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_PLATES = 10;
const DROP_MS = 600;
const drop = tween({ duration: DROP_MS, easing: "enter" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

// ---- Derived facts ----

const isPie = (p: Plate) => p.who !== null && p.dish.toLowerCase().includes("pie");
const needs = (s: State) => s.plates.map((p) => p.need).filter((n, i, a) => n !== "" && a.indexOf(n) === i);
const covered = (s: State, need: string) => s.plates.some((p) => p.who !== null && (p.need === need || (need === "dessert" && p.dish.toLowerCase().includes("pie"))));
const allCovered = (s: State) => needs(s).length > 0 && needs(s).every((n) => covered(s, n));
const coveredCount = (s: State) => needs(s).filter((n) => covered(s, n)).length;
const pieRank = (s: State, plate: Plate) => (isPie(plate) ? s.plates.filter(isPie).findIndex((p) => p.id === plate.id) + 1 : 0);
const holder = (s: State, id: string) => s.plates.find((p) => p.who?.id === id);
const tipNow = (s: State): Tip | null =>
  s.tips.find((t) => holder(s, t.who) !== undefined && s.plates.some((p) => p.need === t.to && p.who === null)) ?? null;
const held = (s: State) => s.plates.filter((p) => p.who !== null);
const holders = (s: State) =>
  JSON.stringify(
    held(s)
      .map((p) => p.who!.id)
      .sort(),
  );

function finish(s: State, time: number): State {
  const done = allCovered(s);
  if (done && s.doneAt === 0) return { ...s, doneAt: time };
  if (!done && s.doneAt !== 0) return { ...s, doneAt: 0 };
  return s;
}

const emptied = (p: Plate): Plate => ({ ...p, who: null, dish: "" });

function reducePotluck(s: State, a: Record<string, unknown>, meta: { time: number; user: string }, ctx: Ctx): State {
  const me = ctx.members.find((m) => m.id === meta.user);
  if (!me) return s;
  const mine = holder(s, meta.user);
  if (a.t === "claim") {
    const plate = typeof a.plate === "string" ? s.plates.find((p) => p.id === a.plate) : undefined;
    if (!plate || plate.who !== null || typeof a.dish !== "string") return s;
    const dish = a.dish.trim().slice(0, 32) || s.defaults[plate.need] || mine?.dish || "something";
    const who: Who = { id: meta.user, name: me.name ?? meta.user, member: true };
    return finish(
      {
        ...s,
        plates: s.plates.map((p) => {
          if (p.id === plate.id) return { ...p, who, dish, movedAt: meta.time };
          return mine && p.id === mine.id ? emptied(p) : p;
        }),
      },
      meta.time,
    );
  }
  if (a.t === "leave") {
    if (!mine) return s;
    return finish({ ...s, plates: s.plates.map((p) => (p.id === mine.id ? emptied(p) : p)) }, meta.time);
  }
  if (a.t === "tip") {
    const tip = tipNow(s);
    if (!tip) return s;
    const from = holder(s, tip.who)!;
    const to = s.plates.find((p) => p.need === tip.to && p.who === null)!;
    return finish(
      {
        ...s,
        plates: s.plates.map((p) => {
          if (p.id === to.id) return { ...p, who: from.who, dish: s.defaults[tip.to] ?? from.dish, movedAt: meta.time };
          return p.id === from.id ? emptied(p) : p;
        }),
      },
      meta.time,
    );
  }
  return s;
}

// ---- Drawing ----

type Pal = ReturnType<typeof pal>;

/** The dish drawn on a plate, centered on (0, 0), about 15 px radius. */
function dishArt(dish: string, c: Pal, dark: boolean): Child {
  const d = dish.toLowerCase();
  if (d.includes("pie")) {
    const filling = d.includes("pumpkin") ? c.orange : d.includes("pecan") ? c.brown : c.cream;
    const kids: Child[] = [circle(0, 0, 17, c.crust, { key: "c" }), circle(0, 0, 14, filling, { key: "f" })];
    if (d.includes("pumpkin")) kids.push(circle(3, -3, 4, c.cream, { key: "d" }));
    else if (d.includes("pecan")) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const r = k === 0 ? 0 : 7.5;
        kids.push(ellipse(Math.cos(a) * r, Math.sin(a) * r, 2.2, 3.6, c.brown, { key: `n${k}`, transform: `rotate(${Math.round((a * 180) / Math.PI)} ${Math.round(Math.cos(a) * r * 10) / 10} ${Math.round(Math.sin(a) * r * 10) / 10})` }));
      }
    } else {
      for (let k = -1; k <= 1; k++) {
        kids.push(line(k * 5, -13, k * 5, 13, c.crust, 2, { key: `v${k}` }));
        kids.push(line(-13, k * 5, 13, k * 5, c.crust, 2, { key: `h${k}` }));
      }
    }
    return kids;
  }
  if (d.includes("potato")) {
    const kids: Child[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      kids.push(circle(Math.cos(a) * 5, Math.sin(a) * 5, 9, c.cream, { key: `p${k}` }));
    }
    kids.push(circle(0, 0, 4, c.yellow, { key: "b" }));
    return kids;
  }
  if (d.includes("stuffing")) {
    const kids: Child[] = [circle(0, 0, 15, c.brown, { key: "b" })];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = 3 + (k % 3) * 3.6;
      kids.push(circle(Math.cos(a) * r, Math.sin(a) * r, 2.3, k % 3 === 0 ? c.leaf : c.crust, { key: `s${k}` }));
    }
    return kids;
  }
  if (d.includes("mac")) {
    const kids: Child[] = [circle(0, 0, 15, c.yellow, { key: "b" })];
    for (let k = 0; k < 8; k++) {
      const a = k * 0.8;
      const r = 4 + (k % 3) * 3.2;
      const x = Math.round(Math.cos(a) * r * 10) / 10;
      const y = Math.round(Math.sin(a) * r * 10) / 10;
      kids.push(<path key={`m${k}`} d={`M${x - 2.4} ${y} a2.4 2.4 0 0 0 4.8 0`} fill="none" stroke={c.orange} stroke-width="1.8" stroke-linecap="round" />);
    }
    return kids;
  }
  if (d.includes("green")) {
    const kids: Child[] = [];
    for (let k = 0; k < 9; k++) {
      const a = k * 0.7 - 3;
      const x = ((k % 3) - 1) * 6;
      const y = (Math.floor(k / 3) - 1) * 6;
      kids.push(line(x - Math.cos(a) * 4, y - Math.sin(a) * 4, x + Math.cos(a) * 4, y + Math.sin(a) * 4, c.green, 2.6, { key: `g${k}` }));
    }
    return kids;
  }
  if (d.includes("cider") || d.includes("drink") || d.includes("wine")) {
    const fills = [c.orange, c.red, c.orange];
    return [
      [-8, 3],
      [8, 3],
      [0, -6],
    ].map(([x, y], k) => (
      <g key={`w${k}`}>
        {circle(x!, y!, 5.5, c.paper, { stroke: c.rim, "stroke-width": 1 })}
        {circle(x!, y!, 4, fills[k]!)}
      </g>
    ));
  }
  if (d.includes("roll")) {
    return [
      [-6, -5],
      [6, -5],
      [-6, 5],
      [6, 5],
    ].map(([x, y], k) => ellipse(x!, y!, 6.5, 5, c.crust, { key: `r${k}` }));
  }
  if (d.includes("surprise") || d.includes("jello")) {
    return [
      ellipse(0, 0, 15, 15, c.green, { key: "j", opacity: 0.85 }),
      <text key="q" x="0" y="5" text-anchor="middle" font-size="14" font-weight="700" fill={dark ? c.card : c.dark}>
        ?
      </text>,
    ];
  }
  return [circle(0, 0, 15, c.cream, { key: "o" }), circle(-5, -3, 2, c.brown, { key: "a" }), circle(4, -5, 2, c.brown, { key: "b" }), circle(1, 5, 2, c.brown, { key: "c" })];
}

const pos = (x: number, y: number, extra?: Record<string, string | number>) => at(x, y, extra) as Record<string, string | number | null | undefined>;
const sentence = (t: string) => {
  const x = t.replace(/!/g, "").trim();
  return x.charAt(0).toUpperCase() + x.slice(1);
};
const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default defineApp<State, Action, Local>({
  name: "Potluck table",
  summary: (s) => {
    const n = needs(s).length;
    if (!n) return held(s).length ? `${s.title}: ${held(s).length} dishes claimed` : `${s.title}: nothing claimed yet`;
    return allCovered(s) ? `${s.title}: menu's complete` : `${s.title}: ${coveredCount(s)} of ${n} dishes covered`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const resolve = (name: string): Who | null => {
      const n = name.trim().slice(0, 20);
      if (!n) return null;
      const m = ctx.members.find((x) => !used.has(x.id) && (x.id === n || (x.name ?? "").toLowerCase() === n.toLowerCase()));
      if (m) {
        used.add(m.id);
        return { id: m.id, name: m.name ?? n, member: true };
      }
      return { id: n, name: n, member: false };
    };
    const given = P.plates.slice(0, MAX_PLATES);
    const plates: Plate[] = given.length
      ? given.map((p, i) => {
          const who = resolve(p.who);
          const dish = who ? p.dish.trim().slice(0, 32) || "something" : "";
          return { id: `p${i}`, need: p.need.trim().toLowerCase().slice(0, 24), who, dish, movedAt: 0 };
        })
      : Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, need: "", who: null, dish: "", movedAt: 0 }));
    const defaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(P.defaults ?? {})) if (typeof v === "string" && v.trim()) defaults[k.trim().toLowerCase().slice(0, 16)] = v.trim().slice(0, 24);
    const base: State = {
      title: P.title.trim().slice(0, 40) || "Potluck",
      coming: Number.isInteger(P.coming) && P.coming > 0 && P.coming < 1000 ? P.coming : 0,
      host: P.host.trim().slice(0, 32),
      plates,
      defaults,
      tips: [],
      doneAt: 0,
    };
    const tips: Tip[] = [];
    for (const t of P.tips ?? []) {
      const key = t.who.trim().toLowerCase();
      const pl = plates.find((p) => p.who && (p.who.id.toLowerCase() === key || p.who.name.toLowerCase() === key));
      if (pl) tips.push({ who: pl.who!.id, to: t.to.trim().toLowerCase().slice(0, 16), why: t.why.trim().slice(0, 80) });
    }
    return finish({ ...base, tips }, 1);
  },

  reduce: (state, action, meta, ctx) => reducePotluck(state, action as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (state, ctx) => {
    if (state.plates.every((p) => !p.who || !p.who.member || inChat(ctx, p.who.id))) return state;
    return finish({ ...state, plates: state.plates.map((p) => (p.who && p.who.member && !inChat(ctx, p.who.id) ? emptied(p) : p)) }, state.doneAt || 1);
  },

  invariants: {
    "one plate per person": (s) => new Set(held(s).map((p) => p.who!.id)).size === held(s).length,
    "an empty plate has no dish": (s) => s.plates.every((p) => (p.who === null ? p.dish === "" : p.dish !== "")),
    "done exactly when every need is covered": (s) => (s.doneAt > 0) === allCovered(s),
    "members on plates are in the chat": (s, ctx) => held(s).every((p) => !p.who!.member || inChat(ctx, p.who!.id)),
    "plates keep their place": (s) => s.plates.length <= MAX_PLATES && new Set(s.plates.map((p) => p.id)).size === s.plates.length && s.plates.every((p) => p.need.length <= 16),
    "moved plates have a time": (s) => held(s).every((p) => p.movedAt >= 0),
  },

  transitions: {
    "claiming fills an empty plate with the actor": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = p.plates.find((x) => x.id === a.plate);
      const after = n.plates.find((x) => x.id === a.plate);
      return (
        !!before && before.who === null && after?.who?.id === m.user && after.movedAt === m.time &&
        p.plates.every((x) => x.id === a.plate || x.who !== null || n.plates.find((y) => y.id === x.id)?.who === null)
      );
    },
    "claiming leaves the actor's old plate empty": (p, n, a, m) => a.t !== "claim" || p === n || n.plates.filter((x) => x.who?.id === m.user).length === 1,
    "leaving empties only the actor's plate": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const changed = p.plates.filter((x, i) => JSON.stringify(x) !== JSON.stringify(n.plates[i]));
      return changed.length === 1 && changed[0]!.who?.id === m.user && n.plates.find((x) => x.id === changed[0]!.id)!.who === null;
    },
    "a tip moves exactly the suggested person": (p, n, a) => {
      if (a.t !== "tip" || p === n) return true;
      const tip = tipNow(p);
      return !!tip && holder(n, tip.who)?.need === tip.to && holders(p) === holders(n);
    },
    "needs and order never change": (p, n) => JSON.stringify(p.plates.map((x) => [x.id, x.need])) === JSON.stringify(n.plates.map((x) => [x.id, x.need])),
    "done is stamped when the last need fills": (p, n, _a, m) => p.doneAt !== 0 || n.doneAt === 0 || n.doneAt === m.time,
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    const empty = s.plates.filter((p) => p.who === null);
    if (k < 0.45 && empty.length) return { t: "claim", plate: r.pick(empty).id, dish: r.pick(["", "chips"]) };
    if (k < 0.75) return { t: "tip" };
    if (k < 0.9) return { t: "leave" };
    return s.plates.length ? { t: "claim", plate: r.pick(s.plates).id, dish: "" } : { t: "tip" };
  },

  local: { sel: null, dish: "" },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const q = pal(theme);
    const W = innerWidth();
    const s = Math.min(1, W / 380);
    const lineChars = Math.floor((72 * s + 12) / 6.4);
    const tall = state.plates.some((p, i) => i >= 5 && p.who && p.dish.length > lineChars) && s < 0.95;
    const H = Math.round(262 * s) + (tall ? 16 : 0);
    const nameOf = (w: Who) => (w.id === me ? "You" : w.name);
    const mine = holder(state, me);
    const tip = tipNow(state);
    const done = state.doneAt > 0;
    const total = needs(state).length;
    const pies = state.plates.filter(isPie).length;

    const act = (a: Action) => {
      const next = reducePotluck(state, a as unknown as Record<string, unknown>, { time: 1, user: me }, { members });
      if (state.doneAt === 0 && next.doneAt > 0) haptic("success");
      dispatch(a);
    };

    const rowOf = (i: number) => (i < 5 ? 0 : 1);
    const spot = (i: number) => {
      const row = rowOf(i);
      const n = row === 0 ? Math.min(5, state.plates.length) : state.plates.length - 5;
      return { x: W / 2 + ((i % 5) - (n - 1) / 2) * 72 * s, y: (row === 0 ? 76 : 196) * s, row };
    };

    const art: Child[] = [rect((W - 364 * s) / 2, 46 * s, 364 * s, 180 * s, 18 * s, c.wash)];
    // The turkey on its platter.
    const tx = W / 2, ty = 136 * s;
    art.push(
      <g key="turkey" transform={`translate(${tx} ${ty}) scale(${s})`}>
        {ellipse(0, 0, 62, 20, q.plate, { stroke: q.rim, "stroke-width": 1.5 })}
        {ellipse(-26, 8, 11, 6, q.brown, { transform: "rotate(28.6 -26 8)" })}
        {ellipse(26, 8, 11, 6, q.brown, { transform: "rotate(-28.6 26 8)" })}
        {circle(-35, 11, 3, q.cream)}
        {circle(35, 11, 3, q.cream)}
        {ellipse(0, 0, 27, 15, q.crust, { stroke: q.brown, "stroke-width": 1.5 })}
        {ellipse(-5, -5, 10, 4, q.paper, { opacity: 0.3 })}
      </g>,
    );

    const overlays: Child[] = [];
    state.plates.forEach((p, i) => {
      const { x, y, row } = spot(i);
      const rel = running(p.movedAt, DROP_MS);
      const k = rel === null || !p.who ? 1 : drop(rel / DROP_MS);
      const sc = 0.6 + 0.4 * k;
      const dy = (rel === null || !p.who ? 0 : -30 * (1 - k)) * s;
      const need = p.need;
      const rank = pieRank(state, p);
      const dupe = rank >= 2;
      const open = need !== "" && !covered(state, need);
      const sgn = row === 0 ? 1 : -1;
      const label = p.who ? `${p.who.id === me ? "You" : p.who.name} brings ${p.dish}` : need ? `Bring ${need}` : "Bring something";
      art.push(
        <g key={p.id} transform={`translate(${x} ${y}) scale(${s})`}>
          {p.who ? (
            <g>
              {circle(0, 0, 24, c.card)}
              {circle(0, 0, 19.5, "none", { stroke: c.divider, "stroke-width": 1 })}
              <g transform={`translate(0 ${dy / s}) scale(${sc})`}>{dishArt(p.dish, q, theme.mode === "dark")}</g>
              {dupe ? circle(0, 0, 28, "none", { stroke: c.negative, "stroke-width": 2.2, "stroke-dasharray": "4 4" }) : null}
            </g>
          ) : (
            <g>
              {circle(0, 0, 24, c.card, { opacity: 0.9 })}
              {circle(0, 0, 22, "none", { stroke: open ? c.negative : c.divider, "stroke-width": 1.6, "stroke-dasharray": "4 3.5" })}
              {line(-7, -9, -7, 9, c.secondaryText, 1.6)}
              {line(7, -9, 7, 9, c.secondaryText, 2.4)}
            </g>
          )}
        </g>,
      );
      if (p.who) {
        overlays.push(<Placed key={`a${p.id}`} user={{ id: p.who.id, name: p.who.name }} x={(x - 19 * s) / W} y={(y + sgn * 18 * s + dy) / H} size={18} me={me} move={false} />);
        if (dupe) {
          overlays.push(
            <div key={`c${p.id}`} style={pos((x + 18 * s) / W, (y + sgn * 22 * s) / H, { zIndex: 2, pointerEvents: "none" })}>
              <Chip tone="negative">{`Pie ${rank}`}</Chip>
            </div>,
          );
        }
      }
      const lab = (
        <div
          key={`l${p.id}`}
          style={{
            position: "absolute",
            left: x - (72 * s + 12) / 2,
            width: 72 * s + 12,
            ...(row === 0 ? { bottom: H - 46 * s } : { top: 228 * s }),
            textAlign: "center",
            fontSize: 12,
            lineHeight: "14px",
            pointerEvents: "none",
          }}
        >
          {p.who ? (
            <div>
              <div style={{ color: c.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{p.dish}</div>
              <div style={{ color: c.secondaryText, ...clip }}>{nameOf(p.who)}</div>
            </div>
          ) : need && open ? (
            <div>
              <div style={{ color: c.negative, fontWeight: 600, ...clip }}>{`Need ${need}`}</div>
              <div style={{ color: c.secondaryText, ...clip }}>Nobody yet</div>
            </div>
          ) : (
            <div style={{ color: c.secondaryText, ...clip }}>Open spot</div>
          )}
        </div>
      );
      overlays.push(lab);
      overlays.push(
        p.who ? (
          <span key={`b${p.id}`} role="img" aria-label={label} style={pos(x / W, y / H, { width: 44, height: 44, pointerEvents: "none" })} />
        ) : (
          <button
            key={`b${p.id}`}
            aria-label={label}
            style={pos(x / W, y / H, { width: 44, height: 44, borderRadius: 22, background: "transparent", border: 0, padding: 0, cursor: "pointer", zIndex: 1 })}
            onClick={() => act({ t: "claim", plate: p.id, dish: "" })}
          />
        ),
      );
    });

    const host = state.host ? (
      <div key="host" style={pos((W / 2 + 46 * s) / W, 128 * s / H, { transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.text, whiteSpace: "nowrap", pointerEvents: "none" })}>
        <Avatar user={{ id: "host", name: state.host }} size={16} />
        <span>{state.host}</span>
      </div>
    ) : null;

    const holderOfTip = tip ? holder(state, tip.who)?.who : null;
    const subtitle = [state.coming ? `${state.coming} coming` : null, total ? `${coveredCount(state)} of ${total} dishes covered` : null].filter(Boolean).join(" · ");

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle || "Tap a plate to bring something"} />
        <Scene height={H} label={`Table with ${state.plates.length} plates: ${coveredCount(state)} of ${total} dishes covered, ${pies} pies`} art={art}>
          {overlays}
          {host}
        </Scene>
        <div style={{ marginTop: 6 }}>
          {done ? (
            <Locked detail={`${held(state).length} dishes · ${state.coming} coming`}>Menu's complete</Locked>
          ) : tip && holderOfTip ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 54, padding: "0 8px 0 8px", borderRadius: 12, background: c.wash }}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", margin: "0 4px" }}>
                <circle cx="8" cy="8" r="6.5" fill="none" stroke={c.primary} stroke-width="3" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, ...clip }}>{`${nameOf(holderOfTip)} on ${tip.to}?`}</div>
                <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...clip }}>{sentence(tip.why)}</div>
              </div>
              <Button kind="primary" onClick={() => act({ t: "tip" })}>
                Do it
              </Button>
            </div>
          ) : (
            <div style={{ minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: c.wash, fontSize: 13, color: c.secondaryText, textAlign: "center", padding: "0 12px" }}>
              Tap an empty plate to bring it
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 22, marginTop: 2, fontSize: 13, color: c.secondaryText }}>
          <span style={{ minWidth: 0, ...clip }}>{mine ? `You're bringing ${mine.dish} · tap another plate to switch` : "Tap an empty plate to bring it"}</span>
          {mine ? (
            <Button kind="deemphasized" onClick={() => act({ t: "leave" })}>
              Leave
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
