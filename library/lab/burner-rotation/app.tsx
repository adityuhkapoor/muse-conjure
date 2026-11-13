import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Burner rotation: family dinner Sundays as a stovetop. Four burners, one per Sunday, each with
// its cook's face and dish. Drag your face onto another burner to swap weeks; this Sunday's burner
// is lit, with its grocery list underneath for anyone to tick off.

type Params = {
  /** Card title */
  title: string;
  /** Under the title: the line that keeps getting said */
  sub: string;
  /** Up to 4 Sundays in order. cook: a name or "" if open. done: already cooked. groceries: what to buy. got: items someone already bought. */
  weeks: { date: string; cook: string; dish: string; groceries: string[]; got?: string[]; done?: boolean }[];
  /** Which week is this Sunday, counting from 0 */
  current: number;
};

// @params
const P: Params = {
  title: "Family dinner Sundays",
  sub: "“we should do family dinner sundays” · every semester",
  weeks: [
    { date: "Nov 9", cook: "Arun", dish: "rice cooker biryani", groceries: ["basmati", "chicken thighs", "yogurt", "fried onions"], done: true },
    { date: "Nov 16", cook: "Will", dish: "breakfast for dinner", groceries: ["eggs", "bacon", "pancake mix", "maple syrup", "OJ"], got: ["eggs"] },
    { date: "Nov 23", cook: "Maya", dish: "taco bar, color coded", groceries: ["tortillas", "ground beef", "limes", "salsa"] },
    { date: "Nov 30", cook: "", dish: "", groceries: [] },
  ],
  current: 1,
};
// @end params

type Item = { id: string; label: string; by: string };
type Week = { id: string; date: string; cook: string; name: string; dish: string; items: Item[]; past: boolean };
type State = { title: string; sub: string; weeks: Week[]; current: number; swaps: number };
type Action = { t: "swap"; a: number; b: number } | { t: "claim"; week: number } | { t: "check"; item: string } | { t: "allGot" };
type Local = { drag: number; x: number; y: number; view: number; toast: number; msg: string };

const H = 208;
const CELL_H = 102;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const nameIn = (members: readonly Member[], id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
const isIdx = (s: State, i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < s.weeks.length;
const weekOf = (s: State, u: string) => s.weeks.findIndex((w) => w.cook === u);
const fields = (w: Week) => ({ cook: w.cook, name: w.name, dish: w.dish, items: w.items });

function initState(ctx: Ctx): State {
  const weeks: Week[] = [];
  for (const raw of Array.isArray(P.weeks) ? P.weeks : []) {
    if (weeks.length >= 4) break;
    const date = clean(raw?.date, 12) || `Week ${weeks.length + 1}`;
    const who = clean(raw?.cook, 24);
    const m = who ? ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase()) : undefined;
    let cook = m ? m.id : who ? `?${who.toLowerCase()}` : "";
    if (cook && weeks.some((w) => w.cook === cook)) cook = "";
    const got = (Array.isArray(raw?.got) ? raw.got : []).map((g) => clean(g, 24).toLowerCase());
    const items: Item[] = (Array.isArray(raw?.groceries) ? raw.groceries : [])
      .map((g) => clean(g, 24))
      .filter(Boolean)
      .slice(0, 6)
      .map((label, k) => ({ id: `w${weeks.length}i${k}`, label, by: got.includes(label.toLowerCase()) ? "?" : "" }));
    weeks.push({ id: `w${weeks.length}`, date, cook, name: m ? m.name : who, dish: cook ? clean(raw?.dish, 28) : "", items: cook ? items : [], past: raw?.done === true });
  }
  while (weeks.length < 4) weeks.push({ id: `w${weeks.length}`, date: `Week ${weeks.length + 1}`, cook: "", name: "", dish: "", items: [], past: false });
  let current = Number.isInteger(P.current) ? Math.max(0, Math.min(3, P.current)) : 0;
  while (current < 3 && weeks[current]!.past) current++;
  return { title: clean(P.title, 32) || "Family dinner Sundays", sub: clean(P.sub, 64), weeks, current, swaps: 0 };
}

function reduceB(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "swap") {
    if (!isIdx(s, a.a) || !isIdx(s, a.b) || a.a === a.b) return s;
    const A = s.weeks[a.a]!;
    const B = s.weeks[a.b]!;
    if (A.past || B.past || (A.cook !== u && B.cook !== u) || (!A.cook && !B.cook)) return s;
    const weeks = s.weeks.map((w, i) => (i === a.a ? { ...w, ...fields(B) } : i === a.b ? { ...w, ...fields(A) } : w));
    return { ...s, weeks, swaps: s.swaps + 1 };
  }
  if (a.t === "claim") {
    if (!isIdx(s, a.week)) return s;
    const w = s.weeks[a.week]!;
    if (w.past || w.cook !== "" || weekOf(s, u) >= 0) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return { ...s, weeks: s.weeks.map((x, i) => (i === a.week ? { ...x, cook: u, name, dish: "chef's choice", items: [] } : x)) };
  }
  if (a.t === "check") {
    if (typeof a.item !== "string") return s;
    const cur = s.weeks[s.current]!;
    if (!cur.items.some((x) => x.id === a.item)) return s;
    return { ...s, weeks: s.weeks.map((w, i) => (i !== s.current ? w : { ...w, items: w.items.map((x) => (x.id !== a.item ? x : { ...x, by: x.by ? "" : u })) })) };
  }
  if (a.t === "allGot") {
    const cur = s.weeks[s.current]!;
    if (cur.cook !== u || cur.items.every((x) => x.by)) return s;
    return { ...s, weeks: s.weeks.map((w, i) => (i !== s.current ? w : { ...w, items: w.items.map((x) => (x.by ? x : { ...x, by: u })) })) };
  }
  return s;
}

const cellOf = (i: number, W: number) => ({ x: (i % 2) * (W / 2), y: Math.floor(i / 2) * CELL_H + 2, w: W / 2 });
const burnerAt = (i: number, W: number) => {
  const c = cellOf(i, W);
  return { x: c.x + c.w / 2, y: c.y + 50, r: 32 };
};
const hitBurner = (x: number, y: number, W: number) => {
  for (let i = 0; i < 4; i++) {
    const b = burnerAt(i, W);
    if (Math.hypot(x - b.x, y - b.y) <= b.r + 14) return i;
  }
  return -1;
};

function drawStove(g: CanvasRenderingContext2D, f: DrawFrame, s: State, members: readonly Member[], ctx: Ctx, me: string, drag: { i: number; x: number; y: number }, viewing: number) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const glass = dark ? mix(c.wash, c.text, 0.1) : mix(c.text, c.card, 0.14);
  const ink = dark ? c.text : c.card;
  const soft = dark ? c.secondaryText : mix(c.card, glass, 0.3);
  g.fillStyle = glass;
  g.beginPath();
  g.roundRect(0, 0, W, H, 16);
  g.fill();
  let busy = false;
  s.weeks.forEach((w, i) => {
    const b = burnerAt(i, W);
    const cell = cellOf(i, W);
    const cur = i === s.current;
    const lit = cur && w.cook !== "";
    // coils
    g.strokeStyle = lit ? mix(p.red, glass, 0.25) : mix(glass, dark ? c.text : c.card, w.past ? 0.1 : 0.22);
    g.lineWidth = 3;
    g.beginPath();
    for (const rr of [b.r, b.r - 9, b.r - 18]) {
      g.moveTo(b.x + rr, b.y);
      g.arc(b.x, b.y, rr, 0, Math.PI * 2);
    }
    g.stroke();
    if (lit) {
      busy = true;
      // gas flames ringing the burner, flickering
      g.fillStyle = mix(p.blue, glass, 0.1);
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const fl = 7 + 3 * Math.sin(now / 90 + k * 1.7);
        const bx = b.x + Math.cos(a) * (b.r + 2);
        const by = b.y + Math.sin(a) * (b.r + 2);
        g.moveTo(bx + Math.cos(a + 1.57) * 3, by + Math.sin(a + 1.57) * 3);
        g.quadraticCurveTo(bx + Math.cos(a) * fl * 0.6, by + Math.sin(a) * fl * 0.6, bx + Math.cos(a) * fl, by + Math.sin(a) * fl);
        g.quadraticCurveTo(bx + Math.cos(a) * fl * 0.6, by + Math.sin(a) * fl * 0.6, bx - Math.cos(a + 1.57) * 3, by - Math.sin(a + 1.57) * 3);
      }
      g.fill();
    }
    if (i === viewing && !cur) {
      g.strokeStyle = c.primary;
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // date, top-left of the cell
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.font = `600 12px ${t.type.family}`;
    g.fillStyle = cur ? ink : soft;
    g.fillText(cur ? `${w.date} · tonight` : w.past ? `${w.date} · done` : w.date, cell.x + 12, cell.y + 12);
    // dish label under the burner
    const dish = w.cook ? w.dish || "chef's choice" : "open · tap to take it";
    const d = fitText(dish, cell.w - 20, { g, size: 12, min: 10, weight: 500 });
    g.font = d.font;
    g.textAlign = "center";
    g.fillStyle = w.cook ? ink : soft;
    g.fillText(d.text, b.x, b.y + b.r + 14);
    // the cook's face, unless it's being dragged
    if (!w.cook) {
      g.strokeStyle = soft;
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc(b.x, b.y, 16, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    if (drag.i === i) return;
    const known = inChat(ctx, w.cook);
    g.beginPath();
    g.arc(b.x, b.y, 17, 0, Math.PI * 2);
    g.fillStyle = known ? userColor(w.cook, t) : c.secondaryButton;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = w.cook === me ? c.primary : glass;
    g.stroke();
    g.fillStyle = known ? c.onPrimary : c.secondaryButtonText;
    g.font = `700 14px ${t.type.family}`;
    g.fillText((nameIn(members, w.cook, w.name)[0] ?? "?").toUpperCase(), b.x, b.y + 0.5);
    if (w.past) {
      g.fillStyle = c.positive;
      g.beginPath();
      g.arc(b.x + 13, b.y - 13, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = c.onPrimary;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x + 9.5, b.y - 13);
      g.lineTo(b.x + 12, b.y - 10.5);
      g.lineTo(b.x + 16.5, b.y - 15.5);
      g.stroke();
    }
  });
  // the dragged face follows the finger
  if (drag.i >= 0) {
    const w = s.weeks[drag.i]!;
    const over = hitBurner(drag.x, drag.y, W);
    if (over >= 0 && over !== drag.i && !s.weeks[over]!.past) {
      const b = burnerAt(over, W);
      g.strokeStyle = c.primary;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(drag.x, drag.y, 20, 0, Math.PI * 2);
    g.fillStyle = userColor(w.cook, t);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = c.primary;
    g.stroke();
    g.fillStyle = c.onPrimary;
    g.font = `700 15px ${t.type.family}`;
    g.textAlign = "center";
    g.fillText((nameIn(members, w.cook, w.name)[0] ?? "?").toUpperCase(), drag.x, drag.y + 0.5);
  }
  return busy;
}

export default defineApp<State, Action, Local>({
  name: "Burner rotation",
  summary: (s) => {
    const cur = s.weeks[s.current]!;
    const open = s.weeks.filter((w) => !w.past && !w.cook).length;
    return `${s.title}: ${cur.date} is ${cur.cook ? `${first(cur.name || "someone")}'s ${cur.dish}` : "open"}${open ? ` · ${open} open` : ""}`;
  },
  init: initState,
  reduce: reduceB,

  invariants: {
    "four Sundays": (s) => s.weeks.length === 4 && s.current >= 0 && s.current < 4,
    "nobody cooks twice": (s) => {
      const cooks = s.weeks.map((w) => w.cook).filter(Boolean);
      return new Set(cooks).size === cooks.length;
    },
    "an open week has no dish or list": (s) => s.weeks.every((w) => w.cook !== "" || (w.dish === "" && w.items.length === 0)),
    "item ids are unique": (s) => {
      const ids = s.weeks.flatMap((w) => w.items.map((x) => x.id));
      return new Set(ids).size === ids.length;
    },
    "swaps are counted": (s) => Number.isInteger(s.swaps) && s.swaps >= 0,
  },

  transitions: {
    "a swap trades two weeks and touches yours": (p, n, a, m) => {
      if (a.t !== "swap" || p === n) return true;
      const A = p.weeks[a.a]!;
      const B = p.weeks[a.b]!;
      return (
        (A.cook === m.user || B.cook === m.user) &&
        !A.past &&
        !B.past &&
        n.weeks[a.a]!.cook === B.cook &&
        n.weeks[a.b]!.cook === A.cook &&
        n.weeks[a.a]!.dish === B.dish &&
        n.weeks[a.b]!.dish === A.dish &&
        JSON.stringify(n.weeks[a.a]!.items) === JSON.stringify(B.items) &&
        n.weeks[a.a]!.date === A.date &&
        n.swaps === p.swaps + 1 &&
        n.weeks.every((w, i) => i === a.a || i === a.b || JSON.stringify(w) === JSON.stringify(p.weeks[i]))
      );
    },
    "past weeks never change": (p, n) => p.weeks.every((w, i) => !w.past || JSON.stringify(w) === JSON.stringify(n.weeks[i])),
    "claiming takes an open week for someone with none": (p, n, a, m) =>
      a.t !== "claim" || p === n || (p.weeks[a.week]!.cook === "" && !p.weeks.some((w) => w.cook === m.user) && n.weeks[a.week]!.cook === m.user && n.weeks.filter((w, i) => JSON.stringify(w) !== JSON.stringify(p.weeks[i])).length === 1),
    "a check flips one item this Sunday": (p, n, a, m) => {
      if (a.t !== "check" || p === n) return true;
      const before = p.weeks[p.current]!.items;
      const after = n.weeks[n.current]!.items;
      const diff = after.filter((x, i) => x.by !== before[i]!.by);
      return diff.length === 1 && diff[0]!.id === a.item && (diff[0]!.by === "" || diff[0]!.by === m.user);
    },
    "only this Sunday's cook buys it all": (p, n, a, m) => a.t !== "allGot" || p === n || (p.weeks[p.current]!.cook === m.user && n.weeks[n.current]!.items.every((x) => x.by !== "")),
    "groceries change only by check or all got": (p, n, a) => a.t === "check" || a.t === "allGot" || a.t === "swap" || a.t === "claim" || JSON.stringify(p.weeks) === JSON.stringify(n.weeks),
    "this Sunday stays this Sunday": (p, n) => p.current === n.current,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = weekOf(s, user);
    const x = r.next();
    const items = s.weeks[s.current]!.items;
    if (mine >= 0 && x < 0.4) return { t: "swap", a: mine, b: r.int(4) };
    if (mine < 0 && x < 0.4) return { t: "claim", week: r.int(4) };
    if (items.length && x < 0.85) return { t: "check", item: r.pick(items).id };
    if (x < 0.92) return { t: "allGot" };
    return { t: "swap", a: r.int(4), b: r.int(4) };
  },

  local: { drag: -1, x: 0, y: 0, view: -1, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const viewing = local.view >= 0 && local.view < 4 ? local.view : state.current;
    const wk = state.weeks[viewing]!;
    const cur = state.weeks[state.current]!;
    const mine = weekOf(state, me);
    const open = state.weeks.findIndex((w) => !w.past && !w.cook);
    const got = wk.items.filter((x) => x.by).length;
    const cookName = (w: Week) => (w.cook === me ? "Your" : `${first(nameIn(members, w.cook, w.name))}'s`);

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      const i = hitBurner(e.x, e.y, W);
      if (e.type === "down") {
        const w = i >= 0 ? state.weeks[i]! : null;
        if (w && w.cook === me && !w.past) setLocal({ drag: i, x: e.x, y: e.y });
        else setLocal({ drag: -1 });
        return;
      }
      if (e.type === "move") {
        if (local.drag >= 0) setLocal({ x: e.x, y: e.y });
        return;
      }
      if (local.drag >= 0) {
        const from = local.drag;
        const moved = Math.hypot(e.x - burnerAt(from, W).x, e.y - burnerAt(from, W).y) > 18;
        if (moved && i >= 0 && i !== from && !state.weeks[i]!.past) {
          const other = state.weeks[i]!;
          haptic("medium");
          dispatch({ t: "swap", a: from, b: i });
          setLocal({ drag: -1, view: -1, toast: local.toast + 1, msg: other.cook ? `Swapped with ${first(nameIn(members, other.cook, other.name))} · you're on ${other.date}` : `Moved to ${other.date}` });
          return;
        }
        setLocal({ drag: -1, view: from });
        return;
      }
      if (i < 0) return;
      const w = state.weeks[i]!;
      if (!w.cook && !w.past && mine < 0) {
        haptic("light");
        dispatch({ t: "claim", week: i });
        setLocal({ toast: local.toast + 1, msg: `You're cooking ${w.date}` });
      } else setLocal({ view: i === state.current ? -1 : i });
    };

    let action;
    if (mine < 0 && open >= 0)
      action = (
        <Button kind="primary" onClick={() => { haptic("light"); dispatch({ t: "claim", week: open }); setLocal({ toast: local.toast + 1, msg: `You're cooking ${state.weeks[open]!.date}` }); }}>
          {`Take ${state.weeks[open]!.date}`}
        </Button>
      );
    else if (cur.cook === me && cur.items.some((x) => !x.by) && viewing === state.current)
      action = (
        <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "allGot" }); setLocal({ toast: local.toast + 1, msg: "Groceries done" }); }}>
          Got it all
        </Button>
      );

    const hint =
      viewing !== state.current
        ? `${wk.date} · ${wk.cook ? `${cookName(wk)} ${wk.dish}` : "open"}`
        : mine >= 0 && !state.weeks[mine]!.past
          ? "Drag your face to swap Sundays"
          : cur.cook
            ? `${got} of ${wk.items.length} bought for tonight`
            : "Tonight's burner is open";

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub || "One cook per Sunday"} />
        <Canvas
          height={H}
          drag
          label={`Stove with 4 Sundays: ${state.weeks.map((w) => `${w.date} ${w.cook ? `${first(nameIn(members, w.cook, w.name))}, ${w.dish}` : "open"}`).join("; ")}`}
          draw={(g, f) => drawStove(g, f, state, members, ctx, me, { i: local.drag, x: local.x, y: local.y }, viewing)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, height: 20, fontSize: 13, color: c.secondaryText, overflow: "hidden", whiteSpace: "nowrap" }}>
          {wk.cook && inChat(ctx, wk.cook) ? <Avatar user={wk.cook} size={18} /> : null}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {wk.cook ? `${cookName(wk)} list for ${wk.date}${wk.items.length ? ` · ${wk.items.filter((x) => x.by).length} of ${wk.items.length} got` : " · nothing yet"}` : `${wk.date} is open`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, height: 44, marginTop: 2, overflowX: "auto", overflowY: "hidden" }}>
          {wk.items.length ? null : <span style={{ alignSelf: "center", fontSize: 13, color: c.secondaryText, padding: "0 12px", height: 32, lineHeight: "32px", borderRadius: 16, border: `1.5px dashed ${c.divider}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>No list yet · say it in the chat</span>}
          {wk.items.map((x) => {
            const editable = viewing === state.current;
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={!!x.by}
                disabled={!editable}
                {...(editable ? { onClick: () => dispatch({ t: "check", item: x.id }) } : {})}
                style={{ height: 44, minWidth: 44, padding: 0, border: "none", background: "transparent", font: "inherit", cursor: editable ? "pointer" : "default", flex: "none", display: "flex", alignItems: "center" }}
              >
                <span style={{ height: 32, lineHeight: "32px", padding: "0 12px", borderRadius: 16, background: x.by ? c.selected : c.wash, color: x.by ? c.secondaryText : c.text, fontSize: 13, textDecoration: x.by ? "line-through" : "none", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{x.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 2, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
