import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, clock, haptic, innerWidth, mix, pal, running, tween, type Ctx, type Member } from "@muse/app";

// Gear wall: the club's gear closet, two wooden shelves of drawn gear (the 4-person tent, the
// stove, the one good cooler). Whatever is out leaves a dashed outline with the borrower's face
// and a luggage tag saying when it's due back; overdue tags turn red and wobble. Tap a thing,
// pick a back-by day and borrow it: it lifts off the shelf and your face takes its place.

type Kind = "tent4" | "tent2" | "stove" | "headlamp" | "cooler" | "pad" | "bear" | "filter" | "pack" | "rope";
type Params = {
  /** Card title */
  title: string;
  /** Club name, e.g. 'Outing Club' */
  club: string;
  /** The item someone just asked about, by name; it starts selected */
  asked: string;
  /** Back-by choices: label and days from now */
  backBy: { label: string; days: number }[];
  /** 4 to 8 pieces of gear. holder: who has it (empty if on the shelf); due: back-by label; late: days overdue; said: their words */
  items: { name: string; kind: Kind; holder?: string; due?: string; late?: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Gear wall",
  club: "Eastfield Outing Club",
  asked: "4-person tent",
  backBy: [{ label: "Sun", days: 3 }, { label: "Tue", days: 5 }, { label: "Next Fri", days: 8 }],
  items: [
    { name: "4-person tent", kind: "tent4", holder: "Will", due: "Tue", late: 3, said: "it's drying in the sube. it's been drying since tuesday" },
    { name: "2-person tent", kind: "tent2" },
    { name: "Camp stove", kind: "stove", holder: "Arun", due: "Sun", said: "testing if it beats the rice cooker" },
    { name: "Headlamps", kind: "headlamp" },
    { name: "The good cooler", kind: "cooler", holder: "Maya", due: "Mon", said: "it has a label now. it's teal, so it's mine" },
    { name: "Sleeping pads", kind: "pad" },
    { name: "Bear canister", kind: "bear" },
    { name: "Water filter", kind: "filter", holder: "Priya", due: "Fri" },
  ],
};
// @end params

type Item = { name: string; kind: Kind; holder: string; hname: string; due: string; dueAt: number; late: number; said: string; at: number; nudges: string[] };
type State = { title: string; club: string; backBy: { label: string; days: number }[]; items: Item[] };
type Action = { t: "borrow"; i: number; b: number } | { t: "return"; i: number } | { t: "nudge"; i: number };
type Local = { sel: number; b: number };

const KINDS: Kind[] = ["tent4", "tent2", "stove", "headlamp", "cooler", "pad", "bear", "filter", "pack", "rope"];
const DAY = 86_400_000;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const okI = (s: State, i: unknown): i is number => isInt(i, 0, s.items.length - 1);
const lift = tween({ duration: 650, easing: [0.34, 1.4, 0.64, 1] });

function initState(ctx: Ctx): State {
  const backBy = (Array.isArray(P.backBy) ? P.backBy : [])
    .map((b) => ({ label: clean(b?.label, 12), days: isInt(b?.days, 1, 60) ? b.days : 0 }))
    .filter((b) => b.label && b.days)
    .slice(0, 3);
  if (!backBy.length) backBy.push({ label: "In 3 days", days: 3 });
  const items: Item[] = [];
  for (const x of Array.isArray(P.items) ? P.items : []) {
    const name = clean(x?.name, 20);
    if (!name || items.length >= 8) continue;
    const hn = clean(x.holder, 20);
    const m = hn ? ctx.members.find((y) => y.id === hn || y.name.toLowerCase() === hn.toLowerCase()) : undefined;
    const holder = m ? m.id : hn ? `o:${hn}` : "";
    items.push({
      name, kind: KINDS.includes(x.kind) ? x.kind : "pack", holder, hname: m ? m.name : hn,
      due: holder ? clean(x.due, 12) : "", dueAt: 0, late: holder && isInt(x.late, 1, 99) ? x.late : 0,
      said: holder ? clean(x.said, 70) : "", at: 0, nudges: [],
    });
  }
  while (items.length < 4) items.push({ name: ["Tent", "Stove", "Headlamps", "Cooler"][items.length]!, kind: (["tent2", "stove", "headlamp", "cooler"] as Kind[])[items.length]!, holder: "", hname: "", due: "", dueAt: 0, late: 0, said: "", at: 0, nudges: [] });
  return { title: clean(P.title, 40) || "Gear wall", club: clean(P.club, 40), backBy, items };
}

// ---- drawings: each piece fits a 64 x 50 box centred on (0, 0) ----
type Pal = ReturnType<typeof pal>;
function art(k: Kind, p: Pal, ghost: string | null) {
  const f = (c: string) => (ghost ? "none" : c);
  const st = ghost ?? p.dark;
  const sw = ghost ? 1.6 : 1.4;
  const dash = ghost ? "4 3" : undefined;
  const a = { stroke: st, "stroke-width": sw, "stroke-dasharray": dash, "stroke-linejoin": "round", "stroke-linecap": "round" } as const;
  switch (k) {
    case "tent4":
      return [
        <path key="a" d="M-30 20 L0 -22 L30 20 Z" fill={f(p.orange)} {...a} />,
        <path key="b" d="M-9 20 L0 2 L9 20 Z" fill={f(p.dark)} {...a} />,
        <path key="c" d="M0 -22 L0 -26 M-30 20 L-34 22 M30 20 L34 22" fill="none" {...a} />,
      ];
    case "tent2":
      return [
        <path key="a" d="M-26 18 Q-24 -16 0 -16 Q24 -16 26 18 Z" fill={f(p.green)} {...a} />,
        <path key="b" d="M-8 18 Q0 -2 8 18 Z" fill={f(p.leaf)} {...a} />,
        <path key="c" d="M-16 -8 Q0 -26 16 -8" fill="none" {...a} />,
      ];
    case "stove":
      return [
        <rect key="a" x={-12} y={-2} width={24} height={22} rx={5} fill={f(p.blue)} {...a} />,
        <rect key="b" x={-5} y={-8} width={10} height={6} rx={1} fill={f(p.soft)} {...a} />,
        <path key="c" d="M-16 -10 L16 -10 M-12 -10 L-14 -16 M12 -10 L14 -16" fill="none" {...a} />,
        ghost ? null : <path key="d" d="M0 -14 Q-5 -20 0 -26 Q5 -20 0 -14 Z" fill={p.yellow} stroke={p.orange} stroke-width={1.2} />,
      ];
    case "headlamp":
      return [
        <ellipse key="a" cx={0} cy={4} rx={24} ry={12} fill="none" {...a} stroke={ghost ?? p.red} stroke-width={5} />,
        <rect key="b" x={-9} y={-12} width={18} height={14} rx={4} fill={f(p.dark)} {...a} />,
        <circle key="c" cx={0} cy={-5} r={4} fill={f(p.yellow)} {...a} />,
        ghost ? null : <path key="d" d="M4 -9 L26 -20 L26 6 Z" fill={p.yellow} opacity={0.35} />,
      ];
    case "cooler":
      return [
        <rect key="a" x={-26} y={-8} width={52} height={28} rx={4} fill={f(p.red)} {...a} />,
        <rect key="b" x={-28} y={-16} width={56} height={10} rx={3} fill={f(p.cream)} {...a} />,
        <path key="c" d="M-10 -16 L-10 -22 L10 -22 L10 -16" fill="none" {...a} />,
        ghost ? null : <path key="d" d="M14 2 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8 Z" fill={p.yellow} stroke={p.dark} stroke-width={0.8} />,
      ];
    case "pad":
      return [
        <rect key="a" x={-22} y={-14} width={40} height={28} rx={3} fill={f(p.blue)} {...a} />,
        <ellipse key="b" cx={18} cy={0} rx={8} ry={14} fill={f(mix(p.blue, p.card, 0.4))} {...a} />,
        <path key="c" d="M18 -7 Q24 0 18 7 Q13 0 18 -3" fill="none" {...a} />,
        <path key="d" d="M-14 -14 L-14 14 M-4 -14 L-4 14" fill="none" {...a} stroke={ghost ?? p.yellow} stroke-width={3} />,
      ];
    case "bear":
      return [
        <rect key="a" x={-15} y={-18} width={30} height={38} rx={7} fill={f(p.dark)} {...a} />,
        <rect key="b" x={-17} y={-20} width={34} height={8} rx={3} fill={f(p.soft)} {...a} />,
        <path key="c" d="M-15 0 L15 0 M-15 10 L15 10" fill="none" {...a} stroke={ghost ?? p.soft} />,
      ];
    case "filter":
      return [
        <rect key="a" x={-10} y={-12} width={20} height={32} rx={6} fill={f(p.sky)} {...a} />,
        <rect key="b" x={-6} y={-22} width={12} height={10} rx={2} fill={f(p.blue)} {...a} />,
        <path key="c" d="M-10 4 L10 4" fill="none" {...a} />,
        ghost ? null : <path key="d" d="M-8 8 Q0 5 8 8 L8 16 Q0 19 -8 16 Z" fill={p.blue} opacity={0.5} />,
      ];
    case "rope":
      return [
        <circle key="a" cx={0} cy={0} r={20} fill="none" {...a} stroke={ghost ?? p.purple} stroke-width={5} />,
        <circle key="b" cx={0} cy={0} r={13} fill="none" {...a} stroke={ghost ?? p.purple} stroke-width={5} />,
      ];
    default:
      return [
        <rect key="a" x={-18} y={-18} width={36} height={40} rx={10} fill={f(p.purple)} {...a} />,
        <rect key="b" x={-12} y={2} width={24} height={14} rx={4} fill={f(mix(p.purple, p.card, 0.3))} {...a} />,
        <path key="c" d="M-8 -18 Q0 -28 8 -18" fill="none" {...a} />,
      ];
  }
}

export default defineApp<State, Action, Local>({
  name: "Gear wall",
  summary: (s) => {
    const out = s.items.filter((x) => x.holder).length;
    const late = s.items.filter((x) => x.late > 0).length;
    return `${s.club || s.title} gear · ${out} of ${s.items.length} out${late ? ` · ${late} overdue` : ""}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !okI(s, a.i)) return s;
    const it = s.items[a.i]!;
    const set = (patch: Partial<Item>) => ({ ...s, items: s.items.map((x, j) => (j === a.i ? { ...x, ...patch } : x)) });
    if (a.t === "borrow") {
      if (it.holder || !isInt(a.b, 0, s.backBy.length - 1)) return s;
      const b = s.backBy[a.b]!;
      const name = ctx.members.find((x) => x.id === m.user)?.name ?? "Someone";
      return set({ holder: m.user, hname: name, due: b.label, dueAt: m.time + b.days * DAY, late: 0, said: "", at: m.time, nudges: [] });
    }
    if (a.t === "return") {
      if (it.holder !== m.user) return s;
      return set({ holder: "", hname: "", due: "", dueAt: 0, late: 0, said: "", at: m.time, nudges: [] });
    }
    if (a.t === "nudge") {
      if (!it.holder || it.holder === m.user || it.nudges.includes(m.user) || it.nudges.length >= 20) return s;
      return set({ nudges: [...it.nudges, m.user] });
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (x: Item) => (x.holder && !x.holder.startsWith("o:") && !inChat(ctx, x.holder)) || x.nudges.some((u) => !inChat(ctx, u));
    if (!s.items.some(gone)) return s;
    return {
      ...s,
      items: s.items.map((x) => {
        const nudges = x.nudges.filter((u) => inChat(ctx, u));
        return x.holder && !x.holder.startsWith("o:") && !inChat(ctx, x.holder) ? { ...x, holder: "", hname: "", due: "", dueAt: 0, late: 0, said: "", nudges: [] } : { ...x, nudges };
      }),
    };
  },

  invariants: {
    "four to eight things": (s) => s.items.length >= 4 && s.items.length <= 8,
    "a thing on the shelf has no due date, lateness or nudges": (s) => s.items.every((x) => x.holder || (x.due === "" && x.dueAt === 0 && x.late === 0 && x.nudges.length === 0)),
    "holders are in the chat or outside": (s, ctx) => s.items.every((x) => !x.holder || x.holder.startsWith("o:") || inChat(ctx, x.holder)),
    "nudges are by others, once each": (s, ctx) => s.items.every((x) => new Set(x.nudges).size === x.nudges.length && !x.nudges.includes(x.holder) && x.nudges.every((u) => inChat(ctx, u))),
    "back-by choices are valid": (s) => s.backBy.length >= 1 && s.backBy.every((b) => isInt(b.days, 1, 60)),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "borrowing gives the actor that thing, due later": (p, n, a, m) => {
      if (a.t !== "borrow" || p === n) return true;
      const x = n.items[a.i]!;
      return !p.items[a.i]!.holder && x.holder === m.user && x.at === m.time && x.due === p.backBy[a.b]!.label && x.dueAt === m.time + p.backBy[a.b]!.days * DAY && x.nudges.length === 0;
    },
    "a free thing can always be borrowed": (p, n, a, m, ctx) => a.t !== "borrow" || p !== n || !(inChat(ctx, m.user) && okI(p, a.i) && !p.items[a.i]!.holder && isInt(a.b, 0, p.backBy.length - 1)),
    "only the holder returns it": (p, n, a, m) => a.t !== "return" || p === n || (p.items[a.i]!.holder === m.user && n.items[a.i]!.holder === "" && n.items[a.i]!.at === m.time),
    "returning is never refused to the holder": (p, n, a, m, ctx) => a.t !== "return" || p !== n || !(inChat(ctx, m.user) && okI(p, a.i) && p.items[a.i]!.holder === m.user),
    "a nudge adds the actor once": (p, n, a, m) => a.t !== "nudge" || p === n || (n.items[a.i]!.nudges.length === p.items[a.i]!.nudges.length + 1 && n.items[a.i]!.nudges.at(-1) === m.user && n.items[a.i]!.holder === p.items[a.i]!.holder),
    "one action touches one thing": (p, n, a) => p === n || n.items.every((x, j) => j === a.i || x === p.items[j]),
  },

  arbitrary: (s, u, r) => {
    const i = r.int(s.items.length);
    const it = s.items[i]!;
    if (it.holder === u) return r.next() < 0.7 ? { t: "return", i } : { t: "nudge", i };
    if (it.holder) return r.next() < 0.6 ? { t: "nudge", i } : { t: "borrow", i, b: 0 };
    return { t: "borrow", i, b: r.int(s.backBy.length) };
  },

  local: { sel: -1, b: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const items = state.items;
    const cols = Math.ceil(items.length / 2);
    const fr = 8;
    const cw = (W - fr * 2) / cols;
    const ch = W < 340 ? 88 : 98;
    const H = fr * 2 + ch * 2 + 6;
    const asked = items.findIndex((x) => x.name.toLowerCase() === clean(P.asked, 20).toLowerCase());
    const sel = local.sel >= 0 && local.sel < items.length ? local.sel : asked >= 0 ? asked : 0;
    const it = items[sel]!;
    const needNow = items.some((x) => x.dueAt > 0);
    const now = needNow ? clock.value : 0;
    const lateDays = (x: Item) => (x.late > 0 ? x.late : x.dueAt > 0 && now > x.dueAt ? Math.ceil((now - x.dueAt) / DAY) : 0);
    const face = (x: Item): string | Member => (x.holder.startsWith("o:") ? { id: x.holder, name: x.hname } : x.holder);
    const first = (x: Item) => (x.holder === me ? "You" : x.hname.split(" ")[0] || "Someone");
    const wood = mix(p.brown, p.crust, 0.35);
    const shelf = mix(p.brown, c.text, 0.12);
    const back = mix(p.wall, p.crust, 0.25);

    const cubbies = items.map((x, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x0 = fr + col * cw, y0 = fr + row * (ch + 6);
      const cx = x0 + cw / 2, cy = y0 + ch * 0.42;
      const conf = confirmed.items[i]!;
      const e = conf.at > 0 ? running(conf.at, 650) : null;
      const k = e === null ? 1 : lift(e);
      const late = lateDays(x) > 0;
      const sc = Math.min(1, (cw - 10) / 66) * (W < 340 ? 0.85 : 1);
      return { x, i, x0, y0, cx, cy, k, late, sc, out: !!x.holder, justIn: !x.holder && conf.at > 0 && e !== null };
    });

    const picture = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gear closet: ${items.filter((x) => x.holder).length} of ${items.length} out`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={12} fill={wood} />
        {[0, 1].map((r) => (
          <g key={`r${r}`}>
            <rect x={fr} y={fr + r * (ch + 6)} width={W - fr * 2} height={ch} rx={4} fill={back} />
            <rect x={fr} y={fr + r * (ch + 6) + ch - 5} width={W - fr * 2} height={6} fill={shelf} />
          </g>
        ))}
        {Array.from({ length: cols - 1 }, (_v, j) => (
          <rect key={`d${j}`} x={fr + (j + 1) * cw - 2} y={fr} width={4} height={H - fr * 2} fill={wood} />
        ))}
        {cubbies.map((q) => (
          <g key={`g${q.i}`} transform={`translate(${q.cx} ${q.cy + (q.out ? 0 : (1 - q.k) * -14)}) scale(${q.sc})`}>
            {art(q.x.kind, p, q.out ? mix(p.dark, back, 0.45) : null)}
          </g>
        ))}
      </svg>
    );

    const overlays = cubbies.map((q) => {
      const x = q.x;
      const on = q.i === sel;
      const tagTxt = x.holder ? (q.late ? `${lateDays(x)}d late` : x.due ? `back ${x.due}` : "out") : "";
      return (
        <div key={q.i}>
          {x.holder ? (
            <span style={{ position: "absolute", left: q.cx - 14, top: q.cy - 14 - (1 - q.k) * 18, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${c.card}`, opacity: q.k, pointerEvents: "none" }}>
              <Avatar user={face(x)} size={28} />
            </span>
          ) : null}
          {x.holder ? (
            <span class={q.late ? "gw-wob" : ""} style={{ position: "absolute", left: q.x0 + cw - 4 - 62, top: q.y0 + 4, width: 62, display: "flex", justifyContent: "flex-end", transformOrigin: "100% 0", pointerEvents: "none" }}>
              <span style={{ padding: "0 5px", height: 16, borderRadius: "2px 8px 8px 2px", background: q.late ? c.negative : p.cream, color: q.late && theme.mode !== "dark" ? c.onPrimary : p.dark, fontSize: 10, fontWeight: 700, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 62, boxSizing: "border-box" }}>{tagTxt}</span>
            </span>
          ) : null}
          <div style={{ position: "absolute", left: q.x0 + 2, width: cw - 4, top: q.y0 + ch - 22, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ display: "block", maxWidth: cw - 4, boxSizing: "border-box", padding: "0 3px", borderRadius: 4, background: p.cream, color: p.dark, fontSize: W < 340 ? 10 : 11, fontWeight: 600, lineHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
          </div>
          <button type="button" aria-label={`${x.name}${x.holder ? `, ${first(x)} has it` : ", on the shelf"}`} aria-pressed={on ? "true" : "false"}
            onClick={() => { setLocal({ sel: q.i }); haptic("light"); }}
            style={{ position: "absolute", left: q.x0 + 2, top: q.y0 + 1, width: cw - 4, height: ch - 4, padding: 0, border: 0, borderRadius: 6, background: "transparent", cursor: "pointer", boxShadow: on ? `inset 0 0 0 2.5px ${c.primary}` : "none" }} />
        </div>
      );
    });

    // Panel for the selected thing.
    const late = lateDays(it);
    let line1: string;
    let line2: string;
    let act;
    if (!it.holder) {
      line1 = `${it.name} is on the shelf`;
      line2 = "Back by";
      act = (
        <Button kind="primary" onClick={() => { dispatch({ t: "borrow", i: sel, b: Math.min(local.b, state.backBy.length - 1) }); haptic("success"); }}>Borrow it</Button>
      );
    } else if (it.holder === me) {
      line1 = `You have the ${it.name.toLowerCase()}`;
      line2 = late ? `${late} ${late === 1 ? "day" : "days"} late · due ${it.due}` : `Due back ${it.due}`;
      act = <Button kind="primary" onClick={() => { dispatch({ t: "return", i: sel }); haptic("success"); }}>Put it back</Button>;
    } else {
      line1 = `${first(it)} has the ${it.name.toLowerCase()}`;
      line2 = it.said ? `"${it.said}"` : late ? `${late} ${late === 1 ? "day" : "days"} late · was due ${it.due}` : `Due back ${it.due}`;
      act = it.nudges.includes(me) ? (
        <span style={{ fontSize: 14, fontWeight: 600, color: c.secondaryText, whiteSpace: "nowrap" }}>{`Nudged · ${it.nudges.length}`}</span>
      ) : (
        <Button kind="secondary" onClick={() => { dispatch({ t: "nudge", i: sel }); haptic("light"); }}>{`Nudge ${first(it)}`}</Button>
      );
    }
    const chips = !it.holder ? (
      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
        {state.backBy.map((b, j) => {
          const on = Math.min(local.b, state.backBy.length - 1) === j;
          return (
            <button key={b.label} type="button" aria-pressed={on ? "true" : "false"} onClick={() => setLocal({ b: j })}
              style={{ height: 44, margin: "-8px 0", padding: "8px 0", border: 0, background: "transparent", cursor: "pointer", minWidth: 0 }}>
              <span style={{ display: "block", height: 28, lineHeight: "28px", padding: "0 10px", borderRadius: 99, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? c.selected : c.secondaryButton, color: on ? c.text : c.secondaryButtonText, boxShadow: on ? `inset 0 0 0 1.5px ${c.primary}` : "none", whiteSpace: "nowrap" }}>{b.label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

    const nudgeAt = confirmed.items[sel]!.nudges.includes(me);
    const out = items.filter((x) => x.holder);
    const lateN = items.filter((x) => lateDays(x) > 0).length;
    const chatHolders = [...new Set(out.filter((x) => !x.holder.startsWith("o:")).map((x) => x.holder))];
    const myRecent = confirmed.items.map((x, i) => ({ x, i })).find(({ x }) => x.at > 0 && x.holder === me && running(x.at, 2400) !== null);

    return (
      <div>
        <style>{".gw-wob{animation:gwWob .5s ease-in-out infinite alternate}@keyframes gwWob{from{transform:rotate(-7deg)}to{transform:rotate(5deg)}}@media (prefers-reduced-motion:reduce){.gw-wob{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.club, `${out.length} of ${items.length} out`, lateN ? `${lateN} overdue` : ""].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          {picture}
          {overlays}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 52, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
            {chips ?? <div style={{ fontSize: 13, lineHeight: "17px", color: late && !it.said ? c.negative : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</div>}
          </div>
          <div style={{ flexShrink: 0 }}>{act}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {chatHolders.length ? <Facepile users={chatHolders} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {out.length ? `${out.map((x) => `${first(x)}: ${x.name.toLowerCase()}`).slice(0, 3).join(" · ")}` : "Everything's on the shelf · tap a thing to borrow it"}
          </span>
        </div>
        {myRecent ? <Toast key={myRecent.x.at}>{`${myRecent.x.name} is yours till ${myRecent.x.due}`}</Toast> : nudgeAt && it.holder ? null : null}
      </div>
    );
  },
});
